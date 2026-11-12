const {test}=require('node:test');
const assert=require('node:assert/strict');
const {duplicateGroups,sameRecording}=require('../src/utils/duplicates.ts');
const {lyricsSearchUrl}=require('../src/utils/lyricsSearch.ts');
const track=(id,extra={})=>({id,uri:`content://media/${id}`,title:'Mi canción',artist:'Artista',duration:180.12,fileSize:8000,createdAt:1,...extra});

test('duplicate matching is conservative and prioritizes the playing or favorite copy',()=>{
 const a=track('a'),b=track('b',{favorite:true,title:' MI CANCIÓN '});
 assert.equal(sameRecording(a,b),true);assert.equal(duplicateGroups([a,b])[0][0].id,'b');
 assert.equal(duplicateGroups([a,b],'a')[0][0].id,'a');
 for(const extra of [{duration:181},{fileSize:8001},{fileSize:undefined},{artist:'Artista desconocido'},{artist:'Otro artista'},{title:'Otra canción'}])assert.equal(sameRecording(a,track('c',extra)),false);
 assert.equal(duplicateGroups([a,{...b,missing:true}]).length,0);
 assert.equal(sameRecording(a,{...b,uri:a.uri,fileSize:undefined}),true);
 assert.equal(sameRecording(a,a),false);
});
test('LRC search encodes metadata and the optional Megalobiz filter',()=>{
 const url=new URL(lyricsSearchUrl({title:'Amor & alegría?',artist:'Cantante #1'}));
 assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('q'),'Amor & alegría? Cantante #1 lrc');
 assert.equal(new URL(lyricsSearchUrl({title:'Hola',artist:'Artista desconocido'},true)).searchParams.get('q'),'Hola lrc megalobiz');
});

function harness(fail=false){
 const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');const sql=new DatabaseSync(':memory:');
 sql.exec("CREATE TABLE tracks(id TEXT PRIMARY KEY,uri TEXT,title TEXT,artist TEXT,duration REAL,file_size INTEGER,missing INTEGER DEFAULT 0,source TEXT DEFAULT 'device');CREATE TABLE playlists(id INTEGER PRIMARY KEY);CREATE TABLE playlist_tracks(playlist_id INTEGER,track_id TEXT,position INTEGER,PRIMARY KEY(playlist_id,track_id));CREATE TABLE duplicate_exclusions(track_id TEXT PRIMARY KEY,kept_id TEXT);CREATE TABLE duplicate_playlist_links(track_id TEXT,playlist_id INTEGER,position INTEGER,added_keeper INTEGER,PRIMARY KEY(track_id,playlist_id));INSERT INTO playlists VALUES(1),(2);");
 for(const t of [track('a'),track('b'),track('c',{title:'Other'})])sql.prepare('INSERT INTO tracks(id,uri,title,artist,duration,file_size) VALUES(?,?,?,?,?,?)').run(t.id,t.uri,t.title,t.artist,t.duration,t.fileSize);
 const conn={getAllAsync:async(q,...p)=>sql.prepare(q).all(...p),getFirstAsync:async(q,...p)=>sql.prepare(q).get(...p),runAsync:async(q,...p)=>{if(fail&&q.startsWith('UPDATE tracks SET missing=1'))throw Error('simulated');const r=sql.prepare(q).run(...p);return {changes:Number(r.changes)}}};
 conn.withExclusiveTransactionAsync=async fn=>{sql.exec('BEGIN');try{await fn(conn);sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}};
 const source=ts.transpileModule(fs.readFileSync(require.resolve('../src/services/database.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(source,{exports,require:name=>name==='../utils/listeningStats'?require('../src/utils/listeningStats.ts'):name === './performance' ? require('../src/services/performance.ts') : name==='expo-sqlite'?{openDatabaseAsync:async()=>conn}:name==='../utils/serialQueue'?require('../src/utils/serialQueue.ts'):name==='../utils/duplicates'?require('../src/utils/duplicates.ts'):require('../src/utils/muzio.ts')});return {sql,...exports};
}
test('hiding copies is reversible, transfers playlist membership, and revalidates matches',async()=>{
 const h=harness();try{h.sql.exec("INSERT INTO playlist_tracks VALUES(1,'b',5),(2,'a',1),(2,'b',2)");
 assert.deepEqual(Array.from(await h.hideDuplicates('a',['b','b','c','a'])),['b']);
 assert.equal(h.sql.prepare("SELECT missing FROM tracks WHERE id='b'").get().missing,1);
 assert.equal(h.sql.prepare("SELECT position FROM playlist_tracks WHERE playlist_id=1 AND track_id='a'").get().position,5);
 assert.deepEqual(Array.from(await h.excludedDuplicateIds()),['b']);
 await h.restoreDuplicates();assert.equal(h.sql.prepare("SELECT missing FROM tracks WHERE id='b'").get().missing,0);
 assert.deepEqual(h.sql.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id=2 ORDER BY position').all().map(x=>x.track_id),['a','b']);
 assert.equal(h.sql.prepare("SELECT track_id FROM playlist_tracks WHERE playlist_id=1").get().track_id,'b');
 assert.equal((await h.excludedDuplicateIds()).length,0);
 }finally{h.sql.close()}
});
test('duplicate cleanup rolls back playlist edits and exclusions on failure',async()=>{
 const h=harness(true);try{h.sql.exec("INSERT INTO playlist_tracks VALUES(1,'b',0)");await assert.rejects(h.hideDuplicates('a',['b']));
 assert.equal(h.sql.prepare('SELECT track_id FROM playlist_tracks').get().track_id,'b');assert.equal((await h.excludedDuplicateIds()).length,0);assert.equal(h.sql.prepare("SELECT missing FROM tracks WHERE id='b'").get().missing,0);
 }finally{h.sql.close()}
});
test('completed scans only mark device entries missing, never app downloads',async()=>{
 const h=harness();try{h.sql.exec("UPDATE tracks SET source='waveplay' WHERE id='c'");await h.markTracksMissingExcept(['a']);assert.equal(h.sql.prepare("SELECT missing FROM tracks WHERE id='b'").get().missing,1);assert.equal(h.sql.prepare("SELECT missing FROM tracks WHERE id='c'").get().missing,0);
 }finally{h.sql.close()}
});

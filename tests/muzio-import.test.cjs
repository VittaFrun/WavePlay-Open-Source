const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseMuzio,planMuzio,importedPlaylistName}=require('../src/utils/muzio.ts');
const entry=(overrides={})=>({filePath:'/storage/emulated/0/Music/song.mp3',identicalKey:'180000_5000_song.mp3',playlistId:2,playlistName:'Mi Música',...overrides});
const track=(overrides={})=>({id:'a',uri:'content://media/external/audio/media/1',filename:'song.mp3',folder:'/storage/emulated/0/Music',duration:180,fileSize:5000,...overrides});

test('validates Muzio arrays and does not coerce malformed rows',()=>{
 assert.deepEqual(parseMuzio('\uFEFF'+JSON.stringify([entry()])),[entry()]);
 for(const value of [{},[null],[entry({playlistId:'2'})],[entry({filePath:''})],[entry({playlistName:' '})]])assert.throws(()=>parseMuzio(JSON.stringify(value)));
});
test('matches exact paths and moved unique files without trusting old MediaStore ids',()=>{
 assert.deepEqual(planMuzio([entry()],[track()])[0].trackIds,['a']);
 assert.deepEqual(planMuzio([entry()],[track({folder:'/new/location'})])[0].trackIds,['a']);
 assert.deepEqual(planMuzio([entry({filePath:'/sdcard/Music/song.mp3'})],[track()])[0].trackIds,['a']);
});
test('Muzio empty-playlist sentinel is metadata, not a missing song',()=>{
 const rows=parseMuzio(JSON.stringify([{filePath:'',identicalKey:'',mediaId:-1,playlistId:1,playlistName:'Favorites'}]));
 const plan=planMuzio(rows,[track()])[0];
 assert.equal(plan.favorites,true);assert.equal(plan.total,0);assert.deepEqual(plan.issues,[]);assert.deepEqual(plan.trackIds,[]);
});
test('ambiguous or changed files are skipped instead of guessing',()=>{
 const duplicated=[track({folder:'/new/a'}),track({id:'b',folder:'/new/b'})];
 assert.equal(planMuzio([entry()],duplicated)[0].issues[0].reason,'ambiguous');
 for(const changed of [track({fileSize:5001}),track({duration:190}),track({missing:true})])assert.equal(planMuzio([entry()],[changed])[0].issues[0].reason,'missing');
 assert.deepEqual(planMuzio([entry()],duplicated.map((t,i)=>({...t,fileSize:i?9000:5000})))[0].trackIds,['a']);
});
test('preserves recorded order, deduplicates memberships and identifies favorites safely',()=>{
 const rows=[entry({filePath:'/Music/b.mp3',identicalKey:''}),entry(),entry(),entry({playlistId:1,playlistName:'Favorites'})];
 const plans=planMuzio(rows,[track(),track({id:'b',filename:'b.mp3'})]);
 assert.deepEqual(plans[0].trackIds,['b','a']);assert.equal(plans[0].total,2);assert.equal(plans[1].favorites,true);
 assert.equal(planMuzio([entry({playlistName:'Favorites'})],[track()])[0].favorites,false);
 assert.equal(importedPlaylistName('Love',['love','Love (Muzio)']),'Love (Muzio 2)');
});

function databaseHarness(fail=false){
 const {DatabaseSync}=require('node:sqlite'), fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
 const sql=new DatabaseSync(':memory:');
 sql.exec('PRAGMA foreign_keys=ON;CREATE TABLE tracks(id TEXT PRIMARY KEY,favorite INTEGER DEFAULT 0,missing INTEGER DEFAULT 0);CREATE TABLE playlists(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,created_at INTEGER);CREATE TABLE playlist_tracks(playlist_id INTEGER,track_id TEXT,position INTEGER,PRIMARY KEY(playlist_id,track_id),FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE);CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);INSERT INTO tracks(id) VALUES(\'a\'),(\'b\');');
 const conn={getAllAsync:async(q,...p)=>sql.prepare(q).all(...p),getFirstAsync:async(q,...p)=>sql.prepare(q).get(...p),runAsync:async(q,...p)=>{if(fail&&q.includes('INSERT OR IGNORE INTO playlist_tracks'))throw Error('Simulated failure');const r=sql.prepare(q).run(...p);return {changes:Number(r.changes),lastInsertRowId:Number(r.lastInsertRowid)}}};
 conn.withExclusiveTransactionAsync=async fn=>{sql.exec('BEGIN');try{await fn(conn);sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}};
 const source=ts.transpileModule(fs.readFileSync(require.resolve('../src/services/database.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};vm.runInNewContext(source,{exports,require:name=>name==='../utils/listeningStats'?require('../src/utils/listeningStats.ts'):name === './performance' ? require('../src/services/performance.ts') : name==='../utils/onlineTrack'?require('../src/utils/onlineTrack.ts'):name==='expo-sqlite'?{openDatabaseAsync:async()=>conn}:name==='../utils/serialQueue'?require('../src/utils/serialQueue.ts'):name==='../utils/duplicates'?require('../src/utils/duplicates.ts'):name==='../utils/muzio'?require('../src/utils/muzio.ts'):(()=>{throw Error(name)})()});
 return {sql,import:exports.importMuzioPlaylists};
}
test('database import is additive, repeatable, and preserves favorites',async()=>{
 const h=databaseHarness();try{
 h.sql.exec("INSERT INTO playlists(name,created_at) VALUES('Mi Música',1)");
 const plans=planMuzio([entry(),entry({playlistId:1,playlistName:'Favorites'})],[track()]);
 const first=await h.import(plans);assert.deepEqual({...first},{playlists:1,added:1,favorites:1,unavailable:0});
 assert.equal(h.sql.prepare('SELECT name FROM playlists ORDER BY id DESC LIMIT 1').get().name,'Mi Música (Muzio)');
 const second=await h.import(plans);assert.deepEqual({...second},{playlists:0,added:0,favorites:0,unavailable:0});
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM playlist_tracks').get().n,1);
 h.sql.exec('DELETE FROM playlists WHERE id=2');
 assert.equal((await h.import(plans)).playlists,1);
 }finally{h.sql.close()}
});
test('database errors roll back playlists and import receipts together',async()=>{
 const h=databaseHarness(true);try{
 await assert.rejects(h.import(planMuzio([entry({playlistId:1,playlistName:'Favorites'}),entry()],[track()])));
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM playlists').get().n,0);
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM settings').get().n,0);
 assert.equal(h.sql.prepare("SELECT favorite FROM tracks WHERE id='a'").get().favorite,0);
 }finally{h.sql.close()}
});
test('re-import can recover newly found songs without changing existing order',async()=>{
 const h=databaseHarness();try{
 const rows=[entry(),entry({filePath:'/Music/b.mp3',identicalKey:''})];
 await h.import(planMuzio(rows,[track()]));
 const recovered=await h.import(planMuzio(rows,[track(),track({id:'b',filename:'b.mp3'})]));
 assert.equal(recovered.playlists,0);assert.equal(recovered.added,1);
 assert.deepEqual(h.sql.prepare('SELECT track_id FROM playlist_tracks ORDER BY position').all().map(row=>row.track_id),['a','b']);
 h.sql.exec("UPDATE tracks SET missing=1 WHERE id='b'");
 const retry=await h.import(planMuzio(rows,[track(),track({id:'b',filename:'b.mp3'})]));
 assert.equal(retry.unavailable,1);
 }finally{h.sql.close()}
});

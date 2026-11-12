const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseWaveBackup,matchBackupTrack}=require('../src/utils/backup.ts');
const track=(id,overrides={})=>({id,filename:'song.mp3',title:'Song',artist:'Artist',album:'Album',duration:180,fileSize:5000,favorite:false,playCount:0,...overrides});
const backup={format:'waveplay-backup',version:1,createdAt:123,tracks:[track('old')],playlists:[{name:'Lista',createdAt:1,trackIds:['old']}],history:[{trackId:'old',playedAt:2}],listening:[],settings:{},lyrics:[]};

test('accepts a versioned portable backup and rejects malformed references',()=>{
  assert.deepEqual(parseWaveBackup(JSON.stringify(backup)),backup);
  assert.throws(()=>parseWaveBackup(JSON.stringify({...backup,version:2})),/compatible/);
  assert.throws(()=>parseWaveBackup(JSON.stringify({...backup,playlists:[{name:'Lista',createdAt:1,trackIds:['unknown']}]})),/playlist/);
  assert.throws(()=>parseWaveBackup(JSON.stringify({...backup,settings:{token:5}})),/ajustes/);
});
test('matches by metadata rather than trusting MediaStore ids',()=>{
  assert.equal(matchBackupTrack(track('12'),[track('12',{title:'Other'}),track('99')]),'99');
  assert.equal(matchBackupTrack(track('12'),[track('12',{title:'Other'})]),null);
  assert.equal(matchBackupTrack(track('12'),[track('a'),track('b')]),null);
  assert.equal(matchBackupTrack(track('12'),[track('a',{filename:'other.mp3'}),track('b')]),'b');
  assert.equal(matchBackupTrack(track('12'),[track('a',{fileSize:5001})]),null);
});

function databaseHarness(){
  const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
  const sql=new DatabaseSync(':memory:');
  sql.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE tracks(id TEXT PRIMARY KEY,uri TEXT,filename TEXT,title TEXT,artist TEXT,album TEXT,duration REAL,created_at INTEGER,modified_at INTEGER,favorite INTEGER DEFAULT 0,play_count INTEGER DEFAULT 0,last_played_at INTEGER,missing INTEGER DEFAULT 0,file_size INTEGER,source TEXT);
    CREATE TABLE playlists(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,created_at INTEGER);
    CREATE TABLE playlist_tracks(playlist_id INTEGER,track_id TEXT,position INTEGER,PRIMARY KEY(playlist_id,track_id),FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE);
    CREATE TABLE play_history(id INTEGER PRIMARY KEY AUTOINCREMENT,track_id TEXT,played_at INTEGER);
    CREATE TABLE listening_events(id TEXT PRIMARY KEY,track_id TEXT,source_key TEXT,started_at INTEGER,updated_at INTEGER,listened_seconds REAL,counted INTEGER);
    CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
    INSERT INTO tracks(id,uri,filename,title,artist,album,duration,created_at,modified_at,file_size,source) VALUES('new','content://new','song.mp3','Song','Artist','Album',180,1,1,5000,'device');`);
  sql.exec('ALTER TABLE tracks ADD COLUMN artwork TEXT; CREATE TABLE online_tracks(track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,youtube_id TEXT UNIQUE,local_track_id TEXT,local_filename TEXT,in_library INTEGER DEFAULT 1);');
  const conn={getAllAsync:async(q,...p)=>sql.prepare(q).all(...p),getFirstAsync:async(q,...p)=>sql.prepare(q).get(...p),runAsync:async(q,...p)=>{const r=sql.prepare(q).run(...p);return {changes:Number(r.changes),lastInsertRowId:Number(r.lastInsertRowid)}}};
  conn.withExclusiveTransactionAsync=async fn=>{sql.exec('BEGIN');try{await fn(conn);sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}};
  const source=ts.transpileModule(fs.readFileSync(require.resolve('../src/services/database.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};vm.runInNewContext(source,{exports,require:name=>name==='../utils/listeningStats'?require('../src/utils/listeningStats.ts'):name === './performance' ? require('../src/services/performance.ts') : name==='../utils/onlineTrack'?require('../src/utils/onlineTrack.ts'):name==='expo-sqlite'?{openDatabaseAsync:async()=>conn}:name==='../utils/serialQueue'?require('../src/utils/serialQueue.ts'):name==='../utils/duplicates'?require('../src/utils/duplicates.ts'):name==='../utils/muzio'?require('../src/utils/muzio.ts'):name==='../utils/backup'?require('../src/utils/backup.ts'):(()=>{throw Error(name)})()});
  return {sql,api:exports};
}
test('restores on a new device without trusting old IDs and keeps missing entries',async()=>{
  const {sql,api}=databaseHarness();try{
    const payload={...backup,tracks:[track('old'),track('gone',{filename:'gone.mp3',title:'Gone'})],playlists:[{name:'Lista',createdAt:1,trackIds:['old','gone']}],history:[{trackId:'old',playedAt:2}],listening:[]};
    const result=await api.restoreBackupData(payload,'merge');
    assert.equal(result.matched,1);assert.equal(result.missing,1);
    assert.deepEqual(sql.prepare('SELECT track_id FROM playlist_tracks ORDER BY position').all().map(r=>r.track_id),['new','backup:123:1']);
    await assert.rejects(api.restoreBackupData(payload,'merge'),/ya fue importado/);
    sql.exec("INSERT INTO tracks(id,uri,filename,title,artist,album,duration,created_at,modified_at,file_size,source) VALUES('found','content://found','gone.mp3','Gone','Artist','Album',180,1,1,5000,'device')");
    assert.deepEqual(JSON.parse(JSON.stringify(await api.repairBackupTracks())),[{from:'backup:123:1',to:'found'}]);
    assert.deepEqual(sql.prepare('SELECT track_id FROM playlist_tracks ORDER BY position').all().map(r=>r.track_id),['new','found']);
  }finally{sql.close()}
});

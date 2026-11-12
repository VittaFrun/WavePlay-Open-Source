const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const {includeScannedAudio}=require('../src/utils/scan.ts');
function load(file,modules){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>name==='../utils/listeningStats'?require('../src/utils/listeningStats.ts'):modules[name]||{},Date,Map,Set,Promise,Proxy,Reflect});return exports;
}
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 const conn={execAsync:async sql=>sqlite.exec(sql),getAllAsync:async(sql,...params)=>sqlite.prepare(sql).all(...params),getFirstAsync:async(sql,...params)=>sqlite.prepare(sql).get(...params),runAsync:async(sql,...params)=>{const result=sqlite.prepare(sql).run(...params);return{changes:Number(result.changes),lastInsertRowId:Number(result.lastInsertRowid)};},withExclusiveTransactionAsync:async task=>{sqlite.exec('BEGIN');try{await task(conn);sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const api=load('src/services/database.ts',{'../utils/onlineTrack':require('../src/utils/onlineTrack.ts'),'expo-sqlite':{openDatabaseAsync:async()=>conn},'./performance':{performanceStart:()=>()=>{}},'../utils/serialQueue':require('../src/utils/serialQueue.ts')});
 await api.initializeDatabase();return{api,sqlite};
}
const track=(id,uri='file:///Music/song.mp3')=>({id,uri,filename:'song.mp3',title:'Song',artist:'Artist',album:'Album',duration:180,createdAt:1,modifiedAt:1,source:'device'});

test('physical deletion does not blacklist a later file at the same path',async()=>{
 const {api,sqlite}=await fixture();try{
  const original=track('old');await api.upsertTracks([original]);await api.markTrackDeleted(original);
  assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM hidden_tracks').get().count,0);
  await api.upsertTracks([track('new')]);assert.deepEqual(Array.from(await api.listTracks(),item=>item.id),['new']);
 }finally{sqlite.close();}
});
test('explicit redownload reveals only its file; ordinary rescans preserve intentional hiding',async()=>{
 const {api,sqlite}=await fixture();try{
  const original=track('old'),other=track('other','file:///Music/other.mp3');await api.upsertTracks([original,other]);await api.hideTrack(original);await api.hideTrack(other);
  await api.upsertTracks([track('new')]);assert.equal((await api.listTracks()).length,0);
  await api.upsertTracks([track('new')],{reveal:true});assert.deepEqual(Array.from(await api.listTracks(),item=>item.id),['new']);
  assert.equal(sqlite.prepare('SELECT uri FROM hidden_tracks').get().uri,other.uri);
 }finally{sqlite.close();}
});
test('an explicitly saved short song remains visible after the next full device scan',async()=>{
 const {api,sqlite}=await fixture();try{
  await api.upsertTracks([track('old')]);await api.hideTrack(track('old'));
  const asset={id:'42',uri:'file:///Music/song.mp3',filename:'song.mp3',mediaType:'audio',duration:0,creationTime:2,modificationTime:2};
  const media={MediaType:{audio:'audio'},SortBy:{creationTime:'creationTime'},getAssetInfoAsync:async()=>asset,requestPermissionsAsync:async()=>({granted:true}),getAssetsAsync:async()=>({assets:[asset],hasNextPage:false})};
  const native={'react-native':{NativeModules:{WavePlayDownloader:{readMetadata:async()=>({title:'Song',duration:45})}}}};
  const register=load('src/services/downloadLibrary.ts',{'expo-media-library/legacy':media,'./database':api,...native});
  const item={id:'download',url:'url',title:'Song',state:'done',progress:100,createdAt:2,outputTrackId:'42',fileName:'song.mp3'};
  assert.equal(await register.registerDownloadedAsset(item,'42'),'song.mp3');await api.saveDownload(item);
  const library=load('src/services/library.ts',{'expo-media-library/legacy':media,'./database':api,'./fileOrganization':{getOrganization:()=>({running:false,preparing:false})},'../utils/scan':require('../src/utils/scan.ts'),'./backup':{reattachSavedLyrics:async()=>{}},...native});
  await library.scanDeviceMusic(undefined,{full:true});const rows=await api.listTracks();assert.equal(rows.length,1);assert.equal(rows[0].id,'42');assert.equal(rows[0].duration,45);
 }finally{sqlite.close();}
});
test('automatic discovery keeps its filters but intentional downloads bypass duration limits',()=>{
 for(const duration of [0,45,90,780,1000]){
  const asset={filename:'song.mp3',duration,uri:'file:///Music/song.mp3'};
  assert.equal(includeScannedAudio(asset),false);assert.equal(includeScannedAudio(asset,undefined,true),true);
 }
 assert.equal(includeScannedAudio({filename:'cover.jpg',duration:180,uri:'file:///cover.jpg'},undefined,true),false);
 assert.equal(includeScannedAudio({filename:'song.mp3',duration:180,uri:'file:///Music/song.mp3'}),true);
});
test('a scan finishing after a download cannot mark that newly registered file missing',async()=>{
 const {api,sqlite}=await fixture();try{
  await api.upsertTracks([track('old')]);const initial=Array.from(await api.listTracks(),item=>item.id);
  await api.upsertTracks([track('new','file:///Music/new.mp3')]);
  await api.markTracksMissingExcept([],initial);
  assert.deepEqual(Array.from(await api.listTracks(),item=>item.id),['new']);
 }finally{sqlite.close();}
});

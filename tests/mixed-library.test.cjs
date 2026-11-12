const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const online=require('../src/utils/onlineTrack.ts');
const backupUtils=require('../src/utils/backup.ts');
function load(file,modules,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{if(name==='../utils/listeningStats')return require('../src/utils/listeningStats.ts');if(name in modules)return modules[name];throw Error(name);},Date,Map,Set,Promise,Proxy,Reflect,URL,URLSearchParams,AbortController,process,setTimeout,clearTimeout,console,...globals});return exports;}
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 const conn={execAsync:async sql=>sqlite.exec(sql),getAllAsync:async(sql,...params)=>sqlite.prepare(sql).all(...params),getFirstAsync:async(sql,...params)=>sqlite.prepare(sql).get(...params),runAsync:async(sql,...params)=>{const result=sqlite.prepare(sql).run(...params);return {changes:Number(result.changes),lastInsertRowId:Number(result.lastInsertRowid)};},withExclusiveTransactionAsync:async task=>{sqlite.exec('BEGIN');try{await task(conn);sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const modules={'expo-sqlite':{openDatabaseAsync:async()=>conn},'../utils/onlineTrack':online,'../utils/duplicates':require('../src/utils/duplicates.ts'),'../utils/muzio':require('../src/utils/muzio.ts'),'./performance':{performanceStart:()=>()=>{}},'../utils/serialQueue':require('../src/utils/serialQueue.ts'),'../utils/backup':backupUtils};
 const api=load('src/services/database.ts',modules);
 await api.initializeDatabase();return {api,sqlite,reopen:()=>load('src/services/database.ts',modules)};
}
const video=(id='abcdefghijk')=>({id,title:'Song',channel:'Artist',thumbnail:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',duration:180,publishedAt:''});
const local=(id='42')=>({id,uri:'content://media/external/audio/media/'+id,filename:'song.mp3',title:'Song',artist:'Artist',album:'Album',duration:180,createdAt:1,modifiedAt:1,source:'device'});
const ids=rows=>Array.from(rows,t=>t.id);

test('a download has one playlist identity and keeps favorite, order and history after deletion',async()=>{
 const {api,sqlite}=await fixture();try{
  const saved=await api.saveOnlineVideo(video());await api.toggleFavorite(saved.id);
  await api.upsertTracks([local()]);const playlist=await api.createPlaylistWithTracks('Mixed',[saved.id,'42']);
  await api.recordPlay('42');await api.linkDownloadedVideo('https://youtu.be/abcdefghijk','42','song.mp3');
  let tracks=await api.listTracks();assert.deepEqual(ids(tracks),[saved.id]);assert.equal(tracks[0].downloaded,true);assert.equal(tracks[0].favorite,true);assert.equal(tracks[0].localTrackId,'42');
  assert.deepEqual(ids(await api.listPlaylistTracks(playlist)),[saved.id]);
  await api.markTrackDeleted(local());tracks=await api.listTracks();assert.equal(tracks[0].downloaded,false);assert.equal(tracks[0].uri,'https://www.youtube.com/watch?v=abcdefghijk');assert.equal(tracks[0].favorite,true);
  assert.deepEqual(ids(await api.listPlaylistTracks(playlist)),[saved.id]);assert.equal(sqlite.prepare('SELECT track_id FROM play_history').get().track_id,saved.id);
 }finally{sqlite.close();}
});

test('a device rescan marks the file missing, never the online identity',async()=>{
 const {api,sqlite}=await fixture();try{
  await api.upsertTracks([local()]);await api.linkDownloadedVideo('https://youtube.com/watch?v=abcdefghijk','42','song.mp3');
  assert.deepEqual(ids(await api.listTracks('',true)),['42']);await api.markTracksMissingExcept([],['42']);
  const tracks=await api.listTracks();assert.deepEqual(ids(tracks),['youtube:abcdefghijk']);assert.equal(tracks[0].downloaded,false);
 }finally{sqlite.close();}
});

test('clearing download history does not sever the downloaded copy',async()=>{
 const {api,sqlite}=await fixture();try{
  await api.upsertTracks([local()]);await api.linkDownloadedVideo('https://youtu.be/abcdefghijk','42','song.mp3');
  await api.saveDownload({id:'job',url:'https://youtu.be/abcdefghijk',title:'Song',state:'done',progress:100,createdAt:1,outputTrackId:'42',fileName:'song.mp3'});
  await api.removeDownload('job');assert.equal((await api.listTracks())[0].downloaded,true);
 }finally{sqlite.close();}
});

test('matching titles do not bind unrelated local songs or changed asset filenames',async()=>{
 const {api,sqlite}=await fixture();try{
  await api.saveOnlineVideo(video());await api.upsertTracks([local()]);assert.equal((await api.listTracks()).length,2);
  await api.linkDownloadedVideo('https://youtu.be/abcdefghijk','42','wrong.mp3');assert.equal((await api.listTracks()).length,2);
  await api.linkDownloadedVideo('https://youtu.be/abcdefghijk','42','song.mp3');await api.upsertTracks([{...local(),filename:'another.mp3'}]);
  const tracks=await api.listTracks();assert.equal(tracks.length,2);assert.equal(tracks.find(t=>t.youtubeId).downloaded,false);
 }finally{sqlite.close();}
});

test('redownload rebinds canonical identity to a new MediaStore ID',async()=>{
 const {api,sqlite}=await fixture();try{
  await api.upsertTracks([local()]);await api.linkDownloadedVideo('https://youtu.be/abcdefghijk','42','song.mp3');await api.markTrackDeleted(local());
  await api.upsertTracks([local('99')]);await api.linkDownloadedVideo('https://youtu.be/abcdefghijk','99','song.mp3');
  const tracks=await api.listTracks();assert.deepEqual(ids(tracks),['youtube:abcdefghijk']);assert.equal(tracks[0].localTrackId,'99');
 }finally{sqlite.close();}
});

test('historical downloads are recovered only with an exact live asset and filename',async()=>{
 const {api,sqlite}=await fixture();try{
  await api.upsertTracks([local()]);const base={title:'Song',state:'done',progress:100,createdAt:1,outputTrackId:'42'};
  await api.saveDownload({...base,id:'good',fileName:'song.mp3',url:'https://youtu.be/abcdefghijk'});
  await api.saveDownload({...base,id:'bad',fileName:'other.mp3',url:'https://youtu.be/ABCDEFGHIJK'});
  await api.recoverOnlineDownloadLinks();assert.deepEqual(ids(await api.listTracks()),['youtube:abcdefghijk']);
 }finally{sqlite.close();}
});

test('public playlist imports commit atomically, deduplicate and append without changing custom order',async()=>{
 const {api,sqlite}=await fixture();try{
  const a=video(),b=video('ABCDEFGHIJK'),c=video('12345678901');
  const id=await api.importOnlinePlaylist('Imported',[a,a,b],'PLabcdefghijk');assert.deepEqual(ids(await api.listPlaylistTracks(id)),['youtube:'+a.id,'youtube:'+b.id]);
  await api.reorderPlaylistTracks(id,['youtube:'+b.id,'youtube:'+a.id]);
  await api.importOnlinePlaylist('Renamed remotely',[a,b,c],'PLabcdefghijk',true);
  assert.deepEqual(ids(await api.listPlaylistTracks(id)),['youtube:'+b.id,'youtube:'+a.id,'youtube:'+c.id]);
  await assert.rejects(api.importOnlinePlaylist('Broken',[video('invalid')],'PLbroken12345'));
  assert.equal((await api.listPlaylists()).length,1);
 }finally{sqlite.close();}
});

test('online backup roundtrip restores references, never trusts old device IDs',async()=>{
 const source=await fixture(),target=await fixture();try{
  const saved=await source.api.saveOnlineVideo(video());await source.api.upsertTracks([local()]);await source.api.linkDownloadedVideo('https://youtu.be/abcdefghijk','42','song.mp3');await source.api.toggleFavorite(saved.id);await source.api.createPlaylistWithTracks('Mixed',[saved.id]);
  const payload={format:'waveplay-backup',version:1,createdAt:100,...await source.api.exportBackupData(),settings:{},lyrics:[]};
  const parsed=backupUtils.parseWaveBackup(JSON.stringify(payload));assert.equal(parsed.tracks.length,1);
  await target.api.upsertTracks([{...local(),title:'Unrelated'}]);await target.api.restoreBackupData(parsed,'merge');
  const online=(await target.api.listTracks()).find(t=>t.youtubeId);assert.equal(online.downloaded,false);assert.equal(online.favorite,true);assert.equal(online.localTrackId,undefined);assert.equal(online.id,saved.id);
  await target.api.restoreBackupData({...parsed,createdAt:101},'replace');assert.equal((await target.api.listPlaylists()).length,1);
 }finally{source.sqlite.close();target.sqlite.close();}
});

test('invalid online backup identifiers and hostile playlist URLs are rejected',()=>{
 for(const url of ['https://youtube.com.evil.test/playlist?list=PLabcdefghijk','file:///playlist?list=PLabcdefghijk','garbage'])assert.throws(()=>online.playlistIdFromUrl(url));
 assert.equal(online.playlistIdFromUrl('https://music.youtube.com/playlist?list=PLabcdefghijk'),'PLabcdefghijk');
 assert.equal(online.youtubeIdFromUrl('https://youtube.com.evil.test/watch?v=abcdefghijk'),null);
 const t={id:'youtube:wrong',youtubeId:'abcdefghijk',title:'Song',artist:'Artist',album:'YouTube',filename:'',duration:1,favorite:false,playCount:0};
 assert.throws(()=>backupUtils.parseWaveBackup(JSON.stringify({format:'waveplay-backup',version:1,createdAt:1,tracks:[t],playlists:[],history:[],listening:[],settings:{},lyrics:[]})),/online/);
});

test('source resolution prefers a verified local file and falls back after external deletion',async()=>{
 let missing=false,invalidated=0;
 const api=load('src/services/playbackSource.ts',{'expo-media-library/legacy':{MediaType:{audio:'audio'},getAssetInfoAsync:async()=>{if(missing)throw Error('missing');return {uri:'content://local',filename:'song.mp3',mediaType:'audio'};}},'./database':{invalidateDownloadedCopy:async()=>{invalidated++;}}});
 const track={...online.onlineTrack(video()),downloaded:true,localTrackId:'42',filename:'song.mp3'};
 assert.equal((await api.resolvePlaybackSource(track)).uri,'content://local');assert.equal((await api.resolvePlaybackSource(track,true)).onlinePlayback,true);assert.equal(invalidated,0);
 missing=true;const fallback=await api.resolvePlaybackSource(track);assert.equal(fallback.uri,'https://www.youtube.com/watch?v=abcdefghijk');assert.equal(fallback.downloaded,false);assert.equal(invalidated,1);
});

test('a late storage response or error cannot replace a newer selection',async()=>{
 const {createPlaybackResolution}=require('../src/utils/mixedPlayback.ts');let finish;
 const resolver=createPlaybackResolution(track=>track.id==='slow'?new Promise(resolve=>{finish=resolve;}):Promise.resolve(track));
 const pending=resolver.run(local('slow'));assert.equal((await resolver.run(local('fast'))).id,'fast');finish(local('slow'));assert.equal(await pending,null);
 const stale=resolver.run(local('slow'));resolver.invalidate();finish(local('slow'));assert.equal(await stale,null);
});

test('unavailable entries are skipped once even in a repeating queue',()=>{
 const {nextPlayableIndex}=require('../src/utils/mixedPlayback.ts');const tracks=[local('a'),local('b'),local('c')],failed=new Set(['b']);
 assert.equal(nextPlayableIndex(tracks,0,failed,false),2);assert.equal(nextPlayableIndex(tracks,2,failed,true),0);
 failed.add('a');failed.add('c');assert.equal(nextPlayableIndex(tracks,1,failed,true),-1);
});

test('quick download deduplicates simultaneous presses and publishes only changed video states',async()=>{
 const api=load('src/services/quickDownload.ts',{'../utils/onlineTrack':online});let release,calls=0,updates=0;
 const dispose=api.configureQuickDownload(async()=>{calls++;await new Promise(resolve=>{release=resolve;});});
 const track=online.onlineTrack(video());const unsub=api.subscribeDownloadState(track.youtubeId,()=>updates++);
 const first=api.quickDownload(track);await api.quickDownload(track);assert.equal(calls,1);release();await first;assert.equal(updates,2);
 api.publishDownloadStates([{url:track.uri,state:'downloading'}]);api.publishDownloadStates([{url:track.uri,state:'downloading',progress:50}]);assert.equal(updates,3);
 api.publishDownloadStates([]);assert.equal(updates,4);dispose();unsub();
});

test('personal online mixes prefer favorites and limit artist repetition',()=>{
 const {buildOnlineMix}=require('../src/utils/onlineMix.ts');const tracks=Array.from({length:8},(_,i)=>({...online.onlineTrack(video(String(i).padStart(11,'a'))),artist:i<5?'Same':'Other'+i,favorite:i===7}));
 const mix=buildOnlineMix(tracks);assert.equal(mix[0].favorite,true);assert.equal(mix.filter(t=>t.artist==='Same').length,3);
});


test('a linked short download remains scan eligible after clearing download history',async()=>{
 const {api,sqlite}=await fixture();try{
  await api.upsertTracks([{...local(),duration:40}]);await api.linkDownloadedVideo('https://youtu.be/abcdefghijk','42','song.mp3');
  const assets=await api.downloadedLibraryAssets();assert.equal(assets.length,1);assert.equal(assets[0].assetId,'42');
 }finally{sqlite.close();}
});

test('replacing a backup on the same phone preserves previously verified copy links',async()=>{
 const {api,sqlite}=await fixture();try{
  const saved=await api.saveOnlineVideo(video());await api.upsertTracks([local()]);await api.linkDownloadedVideo('https://youtu.be/abcdefghijk','42','song.mp3');
  const payload={format:'waveplay-backup',version:1,createdAt:200,...await api.exportBackupData(),settings:{},lyrics:[]};
  await api.restoreBackupData(backupUtils.parseWaveBackup(JSON.stringify(payload)),'replace');
  const tracks=await api.listTracks();assert.deepEqual(ids(tracks),[saved.id]);assert.equal(tracks[0].downloaded,true);
 }finally{sqlite.close();}
});

test('old session file identifiers migrate to online identity without losing seek or source',()=>{
 const {restorePlaybackSession}=require('../src/utils/playbackSession.ts');
 const track={...online.onlineTrack(video()),downloaded:true,localTrackId:'42'};
 const restored=restorePlaybackSession({queueIds:['42'],trackId:'42',currentIndex:0,positionSeconds:63,originalQueueIds:['42'],sourceTrackIds:['42']},[],[track]);
 assert.equal(restored.queue[restored.index].id,track.id);assert.equal(restored.position,63);assert.deepEqual(restored.sourceTrackIds,[track.id]);
});

test('playlist network import paginates, hydrates metadata and preserves unavailable videos',async()=>{
 let calls=0;const progress=[];
 const fakeFetch=async raw=>{
  calls++;const url=new URL(raw);let data;
  if(url.pathname.endsWith('/playlists'))data={items:[{snippet:{title:'My &amp; Mix'}}]};
  else if(url.pathname.endsWith('/playlistItems'))data=url.searchParams.has('pageToken')?{items:[{contentDetails:{videoId:'ABCDEFGHIJK'},snippet:{title:'Deleted',channelTitle:'Someone'}}]}:{items:[{contentDetails:{videoId:'abcdefghijk'},snippet:{title:'Original',channelTitle:'Someone'}}],nextPageToken:'two'};
  else data=url.searchParams.get('id')==='abcdefghijk'?{items:[{id:'abcdefghijk',snippet:{title:'Real title',channelTitle:'Artist',thumbnails:{}},contentDetails:{duration:'PT3M'},status:{embeddable:true}}]}:{items:[]};
  return {ok:true,json:async()=>data};
 };
 const api=load('src/services/youtube.ts',{'../utils/onlineTrack':online,'../utils/requestTimeout':require('../src/utils/requestTimeout.ts')},{process:{env:{EXPO_PUBLIC_YOUTUBE_API_KEY:'test'}},fetch:fakeFetch});
 const result=await api.readPublicYouTubePlaylist('https://youtube.com/playlist?list=PLabcdefghijk',new AbortController().signal,count=>progress.push(count));
 assert.equal(calls,5);assert.equal(result.name,'My & Mix');assert.equal(result.videos[0].duration,180);assert.equal(result.videos[1].title,'Video no disponible');assert.deepEqual(progress,[1,2]);
});

test('playlist import aborts before making requests and rejects repeated pages',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const api=load('src/services/youtube.ts',{'../utils/onlineTrack':online,'../utils/requestTimeout':require('../src/utils/requestTimeout.ts')},{process:{env:{EXPO_PUBLIC_YOUTUBE_API_KEY:'test'}},fetch:async raw=>{calls++;return {ok:true,json:async()=>new URL(raw).pathname.endsWith('/playlists')?{items:[{snippet:{title:'Mix'}}]}:{items:[],nextPageToken:'same'}};}});
 await assert.rejects(api.readPublicYouTubePlaylist('https://youtube.com/playlist?list=PLabcdefghijk',controller.signal,()=>{}));assert.equal(calls,0);
 await assert.rejects(api.readPublicYouTubePlaylist('https://youtube.com/playlist?list=PLabcdefghijk',new AbortController().signal,()=>{}),/repitió/);
});


test('opening saved online metadata preserves favorite, creation date and known duration',async()=>{
 const {api,sqlite}=await fixture();try{
  const first=await api.saveOnlineVideo(video());await api.toggleFavorite(first.id);
  const reopened=await api.saveOnlineVideo({...video(),duration:0});assert.equal(reopened.favorite,true);assert.equal(reopened.duration,180);assert.equal(reopened.createdAt,first.createdAt);
 }finally{sqlite.close();}
});


test('removing an online song from Library preserves playlist membership and its local file',async()=>{
 const {api,sqlite}=await fixture();try{
  const saved=await api.saveOnlineVideo(video());await api.upsertTracks([local()]);await api.linkDownloadedVideo('https://youtu.be/abcdefghijk','42','song.mp3');const id=await api.createPlaylistWithTracks('List',[saved.id]);
  await api.hideTrack((await api.listTracks())[0]);assert.equal((await api.listTracks()).length,0);
  const playlist=await api.listPlaylistTracks(id);assert.deepEqual(ids(playlist),[saved.id]);assert.equal(playlist[0].downloaded,true);assert.equal(sqlite.prepare('SELECT missing FROM tracks WHERE id=?').get('42').missing,0);
  assert.equal((await api.listTracks('',false,true)).length,1);
  const restored=await api.saveOnlineVideo(video());assert.equal(restored.inLibrary,true);assert.equal((await api.listTracks()).length,1);
 }finally{sqlite.close();}
});

test('playing without saving keeps a catalog reference for history and session restoration',async()=>{
 const {api,sqlite}=await fixture();try{
  const track=await api.saveOnlineVideo(video(),false);assert.equal(track.inLibrary,false);assert.equal((await api.listTracks()).length,0);
  const catalog=await api.listTracks('',false,true);const restored=require('../src/utils/playbackSession.ts').restorePlaybackSession({queueIds:[track.id],trackId:track.id,currentIndex:0,positionSeconds:45},[],catalog);assert.equal(restored.position,45);
 }finally{sqlite.close();}
});


test('normal startup does not rewrite migrated songs, while interrupted legacy migration is repaired',async()=>{
 const {api,sqlite,reopen}=await fixture();
 try{
  await api.upsertTracks([local()]);
  const before=sqlite.prepare('SELECT total_changes() count').get().count;
  await reopen().initializeDatabase();
  assert.equal(sqlite.prepare('SELECT total_changes() count').get().count,before);
  sqlite.exec("UPDATE tracks SET added_at=NULL,artwork='data:image/png;base64,old'");
  await reopen().initializeDatabase();
  const repaired=sqlite.prepare('SELECT added_at,created_at,artwork FROM tracks').get();
  assert.equal(repaired.added_at,repaired.created_at);assert.equal(repaired.artwork,null);
 }finally{sqlite.close();}
});

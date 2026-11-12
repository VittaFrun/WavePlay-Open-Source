const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,load}=require('./helpers/database.cjs');
const paths=require('../src/utils/fileOrganization.ts');
const track={id:'42',uri:'content://media/external/audio/media/42',filename:'song.mp3',title:'Song',artist:'Artist',album:'Album',duration:180,createdAt:1,modifiedAt:1,source:'device'};
const moved={assetId:'42',uri:track.uri,fileName:'song (42).mp3',oldFileName:track.filename,folder:'Music/WavePlay/',destination:'Music/WavePlay/',targetName:'song (42).mp3',modifiedAt:2000,size:1000,status:'moved'};

test('organization restricts destinations to Music and sanitizes metadata folder names',()=>{
 assert.equal(paths.organizationDestination('WavePlay','flat',track),'Music/WavePlay/');
 assert.equal(paths.organizationDestination('WavePlay','album',{artist:'AC/DC',album:'..'}),'Music/WavePlay/AC DC/Álbum desconocido/');
 for(const folder of ['../other','..','/Music','C:\\temp','a\u0000b',''])assert.throws(()=>paths.organizationDestination(folder,'flat',track));
 assert.equal(paths.organizationCandidates([track,{...track,id:'youtube:abcdefghijk',source:'youtube'},{...track,id:'x',source:'waveplay'},{...track,id:'43',missing:true}],'WavePlay','flat').length,1);
});

test('moving and indexing retains playlist, favorite, queue, history, lyrics and online copy identity',async()=>{
 const {api,sql}=await fixture();try{
  await api.upsertTracks([track]);await api.toggleFavorite(track.id);await api.recordPlay(track.id);
  const playlist=await api.createPlaylistWithTracks('List',[track.id]);await api.saveQueue([track.id]);
  sql.prepare('INSERT INTO lyrics_cache(track_id,payload,source,updated_at) VALUES(?,?,?,?)').run(track.id,'lyrics','local',1);
  await api.saveDownload({id:'job',url:'https://youtu.be/abcdefghijk',title:'Song',state:'done',progress:100,createdAt:1,fileName:track.filename,outputTrackId:track.id});
  await api.linkDownloadedVideo('https://youtu.be/abcdefghijk',track.id,track.filename);
  const before=JSON.stringify(sql.prepare('SELECT * FROM playlist_tracks').all());
  await api.applyOrganizedAsset(moved);await api.applyOrganizedAsset(moved);
  const online=(await api.listTracks())[0];assert.equal(online.localTrackId,track.id);assert.equal(online.filename,moved.fileName);assert.equal(online.downloaded,true);assert.equal(online.favorite,true);
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM playlist_tracks').all()),before);assert.equal((await api.listPlaylistTracks(playlist))[0].id,online.id);
  assert.equal(sql.prepare('SELECT track_id FROM play_history').get().track_id,online.id);assert.equal(sql.prepare('SELECT track_id FROM queue').get().track_id,track.id);assert.equal(sql.prepare('SELECT payload FROM lyrics_cache').get().payload,'lyrics');
  assert.equal((await api.listDownloads())[0].fileName,moved.fileName);
 }finally{sql.close();}
});

test('indexing rejects changed asset identity and invalid destinations without modifying rows',async()=>{
 const {api,sql}=await fixture();try{
  await api.upsertTracks([track]);await assert.rejects(api.applyOrganizedAsset({...moved,oldFileName:'different.mp3'}),/cambió/);
  await assert.rejects(api.applyOrganizedAsset({...moved,uri:'content://media/external/audio/media/99'}),/válida/);
  for(const invalid of [{folder:'Music/../other/'},{uri:'content://media/a/../external/audio/media/42'},{fileName:'../song.mp3'},{size:NaN}])await assert.rejects(api.applyOrganizedAsset({...moved,...invalid}),/válida/);
  assert.equal((await api.listTracks())[0].filename,track.filename);
 }finally{sql.close();}
});

function coordinator({allow=true,index=async()=>{},moveHook=async()=>{}}={}){
 let job=null,moves=0,acknowledged=0,permissions=0;
 const native={
  prepare:async raw=>{const input=JSON.parse(raw);job={id:'job',rows:input.rows.map(row=>({...moved,...row,oldFileName:row.fileName,status:'pending'}))};return JSON.stringify(job);},
  getJob:async()=>job?JSON.stringify(job):null,
  authorize:async()=>{permissions++;return allow;},
  move:async(_,id)=>{const row=job.rows.find(r=>r.assetId===id);if(row.status!=='moved'){moves++;row.status='moved';row.fileName=row.targetName;}await moveHook();return JSON.stringify(row);},
  acknowledge:async(_,id)=>{acknowledged++;job.rows.find(r=>r.assetId===id).status='indexed';},
  finish:async()=>{job=null;},
 };
 const modules={'react-native':{Platform:{OS:'android',Version:36},NativeModules:{WavePlayFileOrganizer:native}},'./database':{listTracks:async()=>[track],applyOrganizedAsset:index},'../utils/fileOrganization':paths};
 return {api:load('src/services/fileOrganization.ts',modules),modules,native,stats:()=>({moves,acknowledged,permissions})};
}

test('preview performs no movement and denied consent pauses without touching the file',async()=>{
 const c=coordinator({allow:false});await c.api.prepareOrganization('WavePlay','flat');assert.equal(c.stats().moves,0);
 await c.api.runOrganization();assert.equal(c.stats().moves,0);assert.equal(c.api.getOrganization().paused,true);assert.equal(c.api.getOrganization().running,false);
});

test('a file moved before an indexing failure is recovered without moving it twice',async()=>{
 let fail=true,indexed=0;const c=coordinator({index:async()=>{if(fail)throw Error('sqlite busy');indexed++;}});
 await c.api.prepareOrganization('WavePlay','flat');await c.api.runOrganization();assert.equal(c.stats().moves,1);assert.equal(c.stats().acknowledged,0);assert.equal(c.api.getOrganization().job.rows[0].status,'moved');
 fail=false;const restarted=load('src/services/fileOrganization.ts',c.modules);await restarted.restoreOrganization();await restarted.runOrganization();
 assert.equal(c.stats().moves,1);assert.equal(c.stats().acknowledged,1);assert.equal(indexed,1);assert.equal(restarted.getOrganization().job.rows[0].status,'indexed');
});

test('pausing during a native step still indexes and acknowledges that completed move',async()=>{
 let c;c=coordinator({moveHook:async()=>c.api.pauseOrganization()});await c.api.prepareOrganization('WavePlay','flat');await c.api.runOrganization();
 assert.equal(c.stats().acknowledged,1);assert.equal(c.api.getOrganization().running,false);assert.equal(c.api.getOrganization().paused,true);
});

test('repeated start taps share the same job and completion batches metadata notifications',async()=>{
 let release;const c=coordinator({moveHook:()=>new Promise(resolve=>{release=resolve;})});await c.api.prepareOrganization('WavePlay','flat');let delivered=[];
 c.api.subscribeOrganizedAssets(rows=>delivered.push(...rows));const first=c.api.runOrganization();const second=c.api.runOrganization();assert.equal(first,second);
 await new Promise(resolve=>setImmediate(resolve));release();await first;assert.equal(c.stats().moves,1);assert.equal(delivered.length,1);assert.equal(delivered[0].status,'indexed');
});

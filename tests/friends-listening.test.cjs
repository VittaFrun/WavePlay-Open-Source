const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {roomPosition,adjacentRoomSong,roomSongAsTrack,roomSongFinished,roomCleanupCandidates}=require('../src/utils/listeningRoom.ts');
const {waitForSharedAudio}=require('../src/utils/sharedPlayback.ts');
const root=path.resolve(__dirname,'..');
const song=(id,status='ready')=>({id,status,roomId:'room-id',title:id,artist:'Artist',duration:180,filename:id+'.mp3',fileSize:8000,createdAt:'2026-10-06T00:00:00Z'});

test('room cleanup retires completed songs while protecting current, next and uploads',()=>{
  const queue=[song('old'),song('current'),song('next'),song('upload','uploading')];
  const completed=new Set(['old','current','next','upload']);
  assert.deepEqual(roomCleanupCandidates(queue,'current',completed).map(item=>item.id),['old']);
  assert.deepEqual(roomCleanupCandidates(queue,'old',new Set(['old'])),[]);
  assert.deepEqual(roomCleanupCandidates(queue,'current',new Set()),[]);
  assert.equal(queue.length,4);
});
test('room cleanup does not classify an early skip or unknown duration as finished',()=>{
  assert.equal(roomSongFinished(180,70),false);
  assert.equal(roomSongFinished(180,179.5),false);
  assert.equal(roomSongFinished(180,180),true);
  assert.equal(roomSongFinished(0,0),false);
  assert.equal(roomSongFinished(180,NaN),false);
});

test('room clock handles pause, clock offset, duration and future starts',()=>{
  const updatedAt='2026-10-06T00:00:00Z',now=Date.parse(updatedAt);
  assert.equal(roomPosition({updatedAt,playing:true,positionSeconds:10},180,now+2500),12.5);
  assert.equal(roomPosition({updatedAt,playing:false,positionSeconds:10},180,now+2500),10);
  assert.equal(roomPosition({updatedAt,playing:true,positionSeconds:179},180,now+2500),180);
  assert.equal(roomPosition({updatedAt,playing:true,positionSeconds:10},180,now-2500),10);
});
test('shared queue skips unfinished uploads and ends without wrapping',()=>{
  const queue=[song('a'),song('pending','uploading'),song('b'),song('bad','error')];
  assert.equal(adjacentRoomSong(queue,null,1).id,'a');
  assert.equal(adjacentRoomSong(queue,'a',1).id,'b');
  assert.equal(adjacentRoomSong(queue,'b',1),undefined);
  assert.equal(adjacentRoomSong(queue,'b',-1).id,'a');
  assert.equal(adjacentRoomSong(queue,'a',-1).id,'a');
});
test('remote songs use their downloaded source independently of local metadata',()=>{
  const item=song('remote');
  const track=roomSongAsTrack(item,'file:///cache/remote.mp3','content://cover');
  assert.equal(track.id,'room:remote');
  assert.equal(track.uri,'file:///cache/remote.mp3');
  assert.equal(track.artwork,'content://cover');
  assert.equal(track.title,item.title);
});
test('ended audio remains seekable without waiting for a new load event',async()=>{
  await waitForSharedAudio({currentStatus:{isLoaded:true},addListener:()=>{throw new Error('Unexpected listener');}});
});
test('audio loading resolves, surfaces errors and releases timed-out listeners',async()=>{
  let callback,removed=0;
  const player={currentStatus:{isLoaded:false},addListener:(_event,listener)=>{callback=listener;return {remove:()=>removed++};}};
  const loaded=waitForSharedAudio(player);callback({isLoaded:true});await loaded;assert.equal(removed,1);
  const failed=waitForSharedAudio(player);callback({isLoaded:false,error:'Invalid audio'});await assert.rejects(failed,/Invalid audio/);assert.equal(removed,2);
  await assert.rejects(waitForSharedAudio(player,5),/tardó demasiado/);assert.equal(removed,3);
});
test('shared audio policies enforce membership, host control and reserved upload paths',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261006143419_shared_room_audio.sql'),'utf8');
  assert.match(sql,/alter table public\.listening_room_queue enable row level security/);
  assert.match(sql,/private\.active_room_host\(room_id\)/);
  assert.match(sql,/q\.added_by=auth\.uid\(\) and q\.status='uploading'/);
  assert.match(sql,/metadata->>'size'/);
  assert.match(sql,/public\.set_room_playback[\s\S]*security invoker/);
});

function audioHarness(beforeSignedUrl=()=>{}){
  const ts=require('typescript'),vm=require('node:vm');
  const files=new Map(),deleted=[],uploaded=[],downloaded=[];
  let cancelled=0,uploadStatus=200;
  const fileSystem={
    cacheDirectory:'file:///cache/',FileSystemUploadType:{BINARY_CONTENT:0},FileSystemSessionType:{FOREGROUND:1},
    makeDirectoryAsync:async()=>{},
    copyAsync:async({from,to})=>{if(!files.has(from))throw new Error('missing');files.set(to,files.get(from));},
    getInfoAsync:async uri=>files.has(uri)?{exists:true,size:files.get(uri),isDirectory:false}:{exists:false},
    deleteAsync:async uri=>{deleted.push(uri);files.delete(uri);},
    moveAsync:async({from,to})=>{files.set(to,files.get(from));files.delete(from);},
    createUploadTask:(url,uri,options,progress)=>({
      cancelAsync:async()=>{cancelled++;},
      uploadAsync:async()=>{uploaded.push({url,uri,options});progress({totalBytesSent:50,totalBytesExpectedToSend:100});return {status:uploadStatus,body:'{"message":"upload error"}'};},
    }),
    createDownloadResumable:(url,uri)=>({
      cancelAsync:async()=>{cancelled++;},
      downloadAsync:async()=>{downloaded.push(url);files.set(uri,8000);return {status:200,uri};},
    }),
  };
  const accountClient={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})},storage:{from:()=>({createSignedUrl:async()=>{beforeSignedUrl();return {data:{signedUrl:'https://private-audio'}};}})}};
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(path.join(root,'src/services/roomAudio.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{exports,require:id=>id==='expo-file-system/legacy'?fileSystem:{accountClient},process:{env:{EXPO_PUBLIC_SUPABASE_URL:'https://example.supabase.co',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-key'}},Map,Date,Math,Error,AbortController});
  return {api:exports,files,deleted,uploaded,downloaded,setStatus:value=>uploadStatus=value,cancelled:()=>cancelled};
}
test('preparing audio validates actual size and cleans invalid temporary copies',async()=>{
  const h=audioHarness(),signal=new AbortController().signal;
  h.files.set('content://small',8000);h.files.set('content://large',21*1024*1024);
  const prepared=await h.api.prepareRoomAudio({...song('a'),uri:'content://small'},signal);
  assert.equal(prepared.size,8000);assert.equal(prepared.mime,'audio/mpeg');
  await assert.rejects(h.api.prepareRoomAudio({...song('large'),uri:'content://large'},signal),/20 MB/);
  assert.equal(h.deleted.length,1);
});
test('native upload uses authenticated binary transfer, reports progress and surfaces failure',async()=>{
  const h=audioHarness(),values=[],signal=new AbortController().signal;
  await h.api.uploadRoomAudio({...song('a'),objectPath:'room/user/a.audio'},{uri:'file:///audio',mime:'audio/mpeg'},signal,value=>values.push(value));
  assert.deepEqual(values,[.5]);
  assert.equal(h.uploaded[0].options.headers.Authorization,'Bearer test-token');
  assert.equal(h.uploaded[0].options.headers['x-upsert'],'false');
  h.setStatus(403);
  await assert.rejects(h.api.uploadRoomAudio(song('a'),{uri:'file:///audio',mime:'audio/mpeg'},signal,()=>{}),/upload error/);
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(h.api.uploadRoomAudio(song('a'),{},aborted.signal,()=>{}),/cancelada/);
});
test('remote audio downloads once, checks bytes, reuses cache and removes partial files',async()=>{
  const h=audioHarness(),signal=new AbortController().signal,item=song('a');
  const uri=await h.api.cachedRoomAudio(item,signal);
  assert.equal(await h.api.cachedRoomAudio(item,signal),uri);
  assert.equal(h.downloaded.length,1);
  assert.ok(h.deleted.some(path=>path.endsWith('.part')));
  await assert.rejects(h.api.cachedRoomAudio({...song('b'),fileSize:9000},signal),/incompleta/);
});
const {roomOrderWithNext}=require('../src/utils/listeningRoom.ts');
test('placing a room song next preserves every queue member and the current song',()=>{
  const queue=['a','b','c','d'].map(id=>({id}));
  assert.deepEqual(roomOrderWithNext(queue,'b','d'),['a','b','d','c']);
  assert.deepEqual(roomOrderWithNext(queue,null,'d'),['d','a','b','c']);
  assert.deepEqual(roomOrderWithNext(queue,'b','b'),['a','b','c','d']);
  assert.deepEqual(roomOrderWithNext(queue,'missing','d'),['d','a','b','c']);
  assert.deepEqual(roomOrderWithNext(queue,'a','missing'),['a','b','c','d']);
  assert.deepEqual(queue.map(item=>item.id),['a','b','c','d']);
});


test('cancelled room requests do not reuse cached audio or start downloads',async()=>{
 const h=audioHarness(),item=song('a');
 await h.api.cachedRoomAudio(item,new AbortController().signal);
 const controller=new AbortController();controller.abort();
 await assert.rejects(h.api.cachedRoomAudio(item,controller.signal),/terminó/);
 assert.equal(h.downloaded.length,1);
});


test('leaving while a signed URL resolves never starts the audio transfer',async()=>{
 const controller=new AbortController();
 const h=audioHarness(()=>controller.abort());
 await assert.rejects(h.api.cachedRoomAudio(song('a'),controller.signal),/terminó/);
 assert.equal(h.downloaded.length,0);
});

const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function harness(overrides={}){
 const data=new Map(),saved=[],released=[],destinations=[];let transfers=0,assets=0,copies=0,failSave=true;
 let items=[{id:'one',url:'https://example.com/audio',title:'Song',quality:320,state:'queued',progress:0,createdAt:1,folderUri:'content://folder'}];
 const update=fn=>{items=fn(items);};
 const storage={getItem:async k=>data.get(k)||null,setItem:async(k,v)=>data.set(k,v),removeItem:async k=>data.delete(k)};
 const modules={
  '@react-native-async-storage/async-storage':{__esModule:true,default:storage},
  'expo-file-system/legacy':{cacheDirectory:'file:///cache/',getInfoAsync:async()=>({exists:true,size:200}),deleteAsync:async()=>{},StorageAccessFramework:{createFileAsync:async()=>{const uri='content://saved/'+destinations.length;destinations.push(uri);return uri;}}},
  'expo-media-library/legacy':{requestPermissionsAsync:async()=>({granted:true}),createAssetAsync:async()=>({id:String(++assets)})},
  './downloadLibrary':{registerDownloadedAsset:async()=>'song.mp3'},
  './database':{saveDownload:async item=>saved.push({...item})},
  './performance':{performanceStart:()=>()=>{}},
  './downloader':{cancelDownload:async()=>{},isOnWifi:async()=>true,downloadAudio:async()=>{transfers++;return {uri:'file:///jobs/song.mp3',fileName:'song.mp3'};},copyDownloadedAudio:async()=>{copies++;if(failSave)throw new Error('Storage unavailable');return true;},nativeDownloadJobs:async()=>[],releaseDownloadedAudio:async uri=>released.push(uri),scheduleDownloadScan:()=>{}},
  '../utils/downloadProgress':{visibleDownloadProgress:(job,progress,state)=>({...job,progress,state})},
 };
 for(const [name,value] of Object.entries(overrides))Object.assign(modules[name],value);
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/downloadJobs.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>modules[name],setTimeout:()=>{}});
 return {api:exports,update,scan:async()=>{},data,saved,released,destinations,get item(){return items[0];},get transfers(){return transfers;},get copies(){return copies;},get assets(){return assets;},allowSave(){failSave=false;},useMedia(){delete items[0].folderUri;}};
}
test('failed folder save retains converted audio; retry reuses the destination without another transfer',async()=>{
 const h=harness();await h.api.runDownloadJob(h.item,h.update,h.scan);
 assert.equal(h.item.state,'error');assert.equal(h.item.errorCode,'SAVE_FAILED');assert.equal(h.released.length,0);assert.equal(h.transfers,1);
 h.allowSave();await h.api.runDownloadJob(h.item,h.update,h.scan);
 assert.equal(h.item.state,'done');assert.equal(h.transfers,1);assert.equal(h.copies,2);assert.equal(h.destinations.length,1);assert.equal(h.released.length,1);assert.equal(h.data.size,0);
});
test('simultaneous retries start only one transfer',async()=>{
 const h=harness();h.allowSave();await Promise.all([h.api.runDownloadJob(h.item,h.update,h.scan),h.api.runDownloadJob(h.item,h.update,h.scan)]);
 assert.equal(h.transfers,1);assert.equal(h.item.state,'done');
});
test('process interruption becomes retryable instead of leaving the row downloading',async()=>{
 const h=harness();h.item.state='downloading';await h.api.recoverDownloadJobs([h.item],h.update,h.scan);
 assert.equal(h.item.state,'error');assert.equal(h.item.errorCode,'INTERRUPTED');
});
test('an ambiguous MediaLibrary commit never silently creates another asset',async()=>{
 const h=harness();h.useMedia();h.data.set('waveplay.download.job.one',JSON.stringify({uri:'file:///jobs/song.mp3',fileName:'song.mp3',committing:true}));
 await h.api.runDownloadJob(h.item,h.update,h.scan);assert.equal(h.assets,0);assert.equal(h.transfers,0);assert.equal(h.item.state,'error');assert.match(h.item.message,/Comprueba la Biblioteca/);
});
test('native recovery preserves the folder journal instead of allocating a duplicate destination',async()=>{
 const h=harness({'./downloader':{nativeDownloadJobs:async()=>[{id:'one',uri:'file:///jobs/song.mp3',fileName:'song.mp3'}]}});
 h.data.set('waveplay.download.job.one',JSON.stringify({uri:'file:///jobs/song.mp3',fileName:'song.mp3',destination:'content://existing'}));h.allowSave();
 await h.api.recoverDownloadJobs([h.item],h.update,h.scan);
 for(let i=0;i<30;i++)await Promise.resolve();
 assert.equal(h.item.state,'done');assert.equal(h.transfers,0);assert.equal(h.destinations.length,0);
});
test('Original audio uses the container MIME instead of labelling everything MP3',()=>{
 const h=harness();assert.equal(h.api.audioMime('song.m4a'),'audio/mp4');assert.equal(h.api.audioMime('song.opus'),'audio/ogg');assert.equal(h.api.audioMime('song.mp3'),'audio/mpeg');
});
test('native MediaStore recovery retries the registered row after an interrupted commit',async()=>{
 let calls=0;
 const h=harness({'./downloader':{hasNativeLibrarySaver:true,saveDownloadedAudio:async()=>{calls++;return '42';}}});h.useMedia();
 h.data.set('waveplay.download.job.one',JSON.stringify({uri:'file:///jobs/song.mp3',fileName:'song.mp3',committing:true,nativeCommit:true}));
 await h.api.runDownloadJob(h.item,h.update,h.scan);
 assert.equal(h.item.state,'done');assert.equal(h.item.outputTrackId,'42');assert.equal(h.transfers,0);assert.equal(h.assets,0);assert.equal(calls,1);
});
test('cancelling before the transfer confirms cancellation without starting it',async()=>{
 const h=harness();const result=h.api.runDownloadJob(h.item,h.update,h.scan);await h.api.cancelDownloadJob('one');await result;
 assert.equal(h.item.state,'cancelled');assert.equal(h.transfers,0);
});
test('retrying library registration reuses the saved asset even if staging was cleared',async()=>{
 let attempts=0;
 const h=harness({'./downloadLibrary':{registerDownloadedAsset:async()=>{if(++attempts===1)throw new Error('Indexer busy');return 'song.mp3';}},'expo-file-system/legacy':{getInfoAsync:async()=>({exists:false})}});h.useMedia();
 await h.api.runDownloadJob(h.item,h.update,h.scan);assert.equal(h.item.state,'error');assert.equal(h.assets,1);
 await h.api.runDownloadJob(h.item,h.update,h.scan);assert.equal(h.item.state,'done');assert.equal(h.transfers,1);assert.equal(h.assets,1);assert.equal(attempts,2);
});
function transport(native,permission){
 const exports={};const rn={NativeModules:{WavePlayDownloader:native},Platform:{OS:'android',Version:35},PermissionsAndroid:{PERMISSIONS:{POST_NOTIFICATIONS:'notifications'},request:()=>permission},NativeEventEmitter:class{addListener(){return {remove(){}};}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/downloader.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:()=>rn,process:{env:{}},AbortController,setTimeout,clearTimeout});return exports;
}
test('cancelling during notification permission never starts a native download',async()=>{
 let allow,started=0;const permission=new Promise(r=>allow=r);
 const api=transport({getPreview:async()=>({title:'Song'}),downloadAudio:async()=>{started++;return {};},cancelDownload:async()=>true},permission);
 const result=api.downloadAudio('one','url',320,()=>{});await api.cancelDownload('one');allow();
 await assert.rejects(result,/cancelada/);assert.equal(started,0);
});
test('concurrent previews share one extraction; failed previews can retry',async()=>{
 let count=0,complete;const native={downloadAudio:async()=>{},getPreview:()=>{count++;return new Promise(resolve=>complete=resolve);}};
 const api=transport(native,Promise.resolve());const a=api.getPreview('url'),b=api.getPreview('url');assert.equal(count,1);complete({title:'Song'});await Promise.all([a,b]);await api.getPreview('url');assert.equal(count,1);
 const broken=transport({downloadAudio:async()=>{},getPreview:async()=>{throw new Error('offline');}},Promise.resolve());await assert.rejects(broken.getPreview('bad'),/offline/);await assert.rejects(broken.getPreview('bad'),/offline/);
});

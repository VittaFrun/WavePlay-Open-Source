const test=require('node:test'),assert=require('node:assert/strict');
const {availablePlayerTab,playerTabIndex}=require('../src/utils/playerPresentation.ts');
const {createListPositionMemory}=require('../src/utils/listPosition.ts');

test('the chosen player tab survives source changes and unavailable video has a safe fallback',()=>{
 for(const tab of ['cover','lyrics']){
  assert.equal(availablePlayerTab(tab,true),tab);
  assert.equal(availablePlayerTab(tab,false,true),tab);
 }
 assert.equal(availablePlayerTab('video',true),'video');
 assert.equal(availablePlayerTab('video',false),'cover');
 assert.equal(availablePlayerTab('video',false,true),'lyrics');
 assert.equal(availablePlayerTab('video',true),'video');
 assert.deepEqual(['cover','lyrics','video'].map(playerTabIndex),[0,1,2]);
});

test('list offsets are independent, bounded and reject invalid measurements',()=>{
 const positions=createListPositionMemory(2);
 assert.equal(positions.get('songs'),0);
 positions.save('songs',1200);positions.save('playlists',240);
 assert.equal(positions.get('songs'),1200);
 positions.save('songs',1500);positions.save('dj',300);
 assert.equal(positions.get('playlists'),0);assert.equal(positions.get('songs'),1500);
 for(const offset of [-1,NaN,Infinity])positions.save('songs',offset);
 assert.equal(positions.get('songs'),1500);
 positions.save('songs',0);assert.equal(positions.get('songs'),0);
});

test('quick download publishes pending state immediately and prevents duplicate taps before job creation',async()=>{
 const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/quickDownload.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:()=>({youtubeIdFromUrl:()=>null}),Map,Set});
 const api=exports,track={youtubeId:'abcdefghijk'},observed=[];
 let finish,calls=0;
 api.configureQuickDownload(()=>{calls++;return new Promise(resolve=>finish=resolve);});
 const unsubscribe=api.subscribeDownloadState(track.youtubeId,()=>observed.push(api.getDownloadState(track.youtubeId)));
 const first=api.quickDownload(track);assert.equal(api.getDownloadState(track.youtubeId),'queued');
 await api.quickDownload(track);assert.equal(calls,1);
 finish();await first;assert.equal(api.getDownloadState(track.youtubeId),'');
 assert.deepEqual(observed,['queued','']);unsubscribe();
 api.configureQuickDownload(async()=>{throw Error('failed');});
 await assert.rejects(api.quickDownload(track),/failed/);
 assert.equal(api.getDownloadState(track.youtubeId),'');
});

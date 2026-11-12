const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function harness(native={}){
 const timers=new Map();let id=0;const exports={};
 const source=ts.transpileModule(fs.readFileSync('src/services/downloader.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(source,{exports,require:()=>({NativeModules:{WavePlayDownloader:native},Platform:{OS:'android',Version:35}}),process:{env:{}},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 const fire=async()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());await Promise.resolve();await Promise.resolve();};
 return {api:exports,fire,timers};
}
test('download completions share one scan and queue a trailing scan during an active read',async()=>{
 const h=harness();let count=0,finish;const first=()=>{count++;return new Promise(resolve=>finish=resolve);};
 h.api.scheduleDownloadScan(first);h.api.scheduleDownloadScan(first);await h.fire();assert.equal(count,1);
 const next=async()=>{count++;};h.api.scheduleDownloadScan(next);await h.fire();assert.equal(count,1);
 finish();await Promise.resolve();await Promise.resolve();await h.fire();assert.equal(count,2);
});
test('folder saving prefers native streaming and propagates copy failures',async()=>{
 let copied;const h=harness({copyDownloadedAudio:async(...args)=>{copied=args;}});
 assert.equal(await h.api.copyDownloadedAudio('file:///job/song.mp3','content://folder/song'),true);
 assert.deepEqual(copied,['file:///job/song.mp3','content://folder/song']);
 assert.equal(await harness().api.copyDownloadedAudio('source','destination'),false);
 await assert.rejects(harness({copyDownloadedAudio:async()=>{throw new Error('No space');}}).api.copyDownloadedAudio('source','destination'),/No space/);
});

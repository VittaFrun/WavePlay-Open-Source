const test=require('node:test'),assert=require('node:assert/strict');
const {connectPlaybackProgress}=require('../src/utils/unifiedPlayback.ts');
test('lyrics and position references follow online progress, interruptions and return to native audio',()=>{
 const local={playing:false,position:12,duration:180,buffering:false,error:null};
 let online={video:null,playing:false,position:0,interrupted:false,error:''},listener,snapshot;
 const dispose=connectPlaybackProgress(value=>snapshot=value,local,()=>online,fn=>{listener=fn;return()=>listener=null;});
 assert.equal(snapshot,local);
 online={...online,video:{duration:240},playing:true,position:70};listener();assert.equal(snapshot.position,70);assert.equal(snapshot.duration,240);assert.equal(snapshot.playing,true);
 online={...online,interrupted:true,position:71};listener();assert.equal(snapshot.playing,false);assert.equal(snapshot.position,71);
 online={...online,video:null};listener();assert.equal(snapshot,local);
 dispose();assert.equal(listener,null);
});

const test=require('node:test'),assert=require('node:assert/strict');
const {restorePlaybackSession}=require('../src/utils/playbackSession.ts');
const tracks=['a','b','c','d'].map(id=>({id,duration:180}));
const snapshot={queueIds:['a','b','c'],originalQueueIds:['c','a','b'],trackId:'c',currentIndex:2,positionSeconds:75,repeatMode:'all',shuffleEnabled:true};
test('restore retains the active song and its position when an earlier file disappeared',()=>{
 const result=restorePlaybackSession(snapshot,[],tracks.filter(t=>t.id!=='b'));
 assert.deepEqual(result.queue.map(t=>t.id),['a','c']);assert.equal(result.index,1);assert.equal(result.position,75);assert.equal(result.repeatMode,'all');assert.equal(result.shuffleEnabled,true);
});
test('missing active songs fall forward then back without applying a different song position',()=>{
 const next=restorePlaybackSession({...snapshot,trackId:'b',currentIndex:1},[],tracks.filter(t=>t.id!=='b'));
 assert.equal(next.queue[next.index].id,'c');assert.equal(next.position,0);
 const last=restorePlaybackSession(snapshot,[],tracks.filter(t=>t.id!=='c'));assert.equal(last.queue[last.index].id,'b');assert.equal(last.position,0);
});
test('empty queues remain empty rather than resurrecting the legacy queue',()=>{
 assert.deepEqual(restorePlaybackSession({queueIds:[]},['a'],tracks).queue,[]);
 assert.equal(restorePlaybackSession(null,['a'],tracks).queue[0].id,'a');
});
test('restore handles malformed fields, missing files and obsolete originals safely',()=>{
 const result=restorePlaybackSession({...snapshot,positionSeconds:Infinity,currentIndex:'bad',repeatMode:'bad',sourceTrackIds:['a',null,'gone'],originalQueueIds:['gone','d','a']},[],tracks);
 assert.equal(result.position,0);assert.equal(result.repeatMode,'off');assert.deepEqual(result.sourceTrackIds,['a']);assert.deepEqual(result.original.map(t=>t.id),['a','b','c']);
 assert.equal(restorePlaybackSession({...snapshot,positionSeconds:900},[],tracks).position,180);
 assert.equal(restorePlaybackSession(snapshot,[],tracks.map(t=>({...t,missing:true}))).index,-1);
});
test('duplicate queue entries retain the selected occurrence',()=>{
 const result=restorePlaybackSession({...snapshot,queueIds:['a','b','a'],trackId:'a',currentIndex:2},[],tracks);
 assert.equal(result.index,2);
});

const {seekWhenLoaded}=require('../src/utils/sharedPlayback.ts');
test('restoration waits for loading and does not seek a more recently selected song',async()=>{
 let listener,generation=1;const seeks=[];
 const player={currentStatus:{isLoaded:false},duration:180,addListener:(_,cb)=>{listener=cb;return {remove(){listener=null;}};},seekTo:async seconds=>{seeks.push(seconds);}};
 const task=seekWhenLoaded(player,70,()=>generation===1);
 assert.deepEqual(seeks,[]);generation=2;listener({isLoaded:true});assert.equal(await task,false);assert.deepEqual(seeks,[]);
 player.currentStatus={isLoaded:true};assert.equal(await seekWhenLoaded(player,500,()=>true),true);assert.deepEqual(seeks,[180]);
});
test('seek load errors propagate without an automatic restart',async()=>{
 const player={currentStatus:{isLoaded:false,error:'missing'},duration:180,seekTo:async()=>assert.fail('must not seek')};
 await assert.rejects(seekWhenLoaded(player,70,()=>true),/missing/);
});

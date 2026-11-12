const test=require('node:test'),assert=require('node:assert/strict');
const {createPlaybackStore}=require('../src/utils/playbackStore.ts');
const {createTrackPositionStore}=require('../src/utils/trackPositionStore.ts');
const {createNavigationGate}=require('../src/utils/navigationGate.ts');
const {parseLyrics,lyricAt}=require('../src/utils/lyrics.ts');
const {filterTracks}=require('../src/utils/music.ts');
const {createCoalescedWriter,createBufferedWriter}=require('../src/utils/asyncWork.ts');
const {withRequestTimeout}=require('../src/utils/requestTimeout.ts');

test('playback publishes changed snapshots and leaves the active lyric unchanged within a line',()=>{
 const store=createPlaybackStore();const lines=parseLyrics('[00:00]First\n[00:04]Next');let updates=0,lineChanges=0,selected=lyricAt(lines,0);
 const unsubscribe=store.subscribe(()=>{updates++;const next=lyricAt(lines,store.getSnapshot().position);if(next!==selected){selected=next;lineChanges++;}});
 store.publish({...store.getSnapshot()});assert.equal(updates,0);
 for(const position of [.5,1,1.5,2,2.5,3,3.5,4])store.publish({...store.getSnapshot(),position});
 assert.equal(updates,8);assert.equal(lineChanges,1);unsubscribe();store.publish({...store.getSnapshot(),position:5});assert.equal(updates,8);
});
test('a late YouTube progress event cannot replace the next track clock',()=>{
 const store=createTrackPositionStore();let updates=0;store.subscribe(()=>updates++);
 store.setTrack('a');store.update('a',20);assert.equal(store.getPosition('a'),20);
 store.setTrack('b');store.update('a',21);store.update('b',NaN);store.update('b',-1);
 assert.equal(store.getPosition('b'),0);assert.equal(store.getPosition('a'),0);assert.equal(updates,3);
 store.update('b',1);store.update('b',1);assert.equal(updates,4);
});
test('rapid identical navigation taps coalesce while other routes remain responsive',()=>{
 let now=0,calls=0;const open=createNavigationGate(350,()=>now),navigate=()=>calls++;
 assert.equal(open('playlist',navigate),true);assert.equal(open('playlist',navigate),false);
 assert.equal(open('player',navigate),true);now=350;assert.equal(open('player',navigate),true);assert.equal(calls,3);
 assert.throws(()=>open('broken',()=>{throw new Error('missing route');}),/missing route/);
 assert.equal(open('broken',navigate),true);
});
test('search indexes reuse ordering and invalidate when immutable metadata changes',()=>{
 const a={id:'a',title:'Zulu',artist:'One',album:'Album',createdAt:1},b={id:'b',title:'Alpha',artist:'Two',album:'Album',createdAt:2};
 const input=[a,b],ordered=filterTracks(input,'','title');assert.deepEqual(ordered.map(t=>t.id),['b','a']);assert.equal(filterTracks(input,'','title'),ordered);
 assert.deepEqual(filterTracks(input,'album','title').map(t=>t.id),['b','a']);assert.deepEqual(input,[a,b]);
 const edited=[{...a,title:'Aardvark'},b];assert.deepEqual(filterTracks(edited,'','title').map(t=>t.id),['a','b']);assert.equal(filterTracks(edited,'zulu','title').length,0);
});
test('binary lyric lookup matches seeks, duplicate timestamps and plain trailing lines',()=>{
 const lines=parseLyrics('[00:02]One\n[00:02]Two\n[00:07]Three\nPlain');
 for(const position of [-1,0,2,3,7,Infinity,NaN]){
  let expected=-1;lines.forEach((line,index)=>{if(line.time!==undefined&&line.time<=position)expected=index;});
  assert.equal(lyricAt(lines,position),expected);
 }
});
for(const [name,make] of [['session checkpoints',createCoalescedWriter],['listening deltas',createBufferedWriter]]){
 test(`${name} drain a write submitted during promise settlement`,async()=>{
  let finish;const writes=[];const writer=make(async value=>{writes.push(value);if(value===1)await new Promise(resolve=>finish=resolve);});
  const first=writer.submit(1);await Promise.resolve();finish();
  // Two microtasks advance the write and drain continuations but not settlement.
  await Promise.resolve();await Promise.resolve();
  const second=writer.submit(2);await Promise.all([first,second]);assert.deepEqual(writes,[1,2]);
 });
}
test('network deadline settles even if the transport ignores abort',async()=>{
 let signal;
 await assert.rejects(withRequestTimeout(value=>{signal=value;return new Promise(()=>{});},5),error=>error.code==='REQUEST_TIMEOUT');
 assert.equal(signal.aborted,true);
});
test('network cancellation preserves caller intent and prevents a request starting after abort',async()=>{
 const parent=new AbortController();let started=0;
 const result=withRequestTimeout(async()=>{started++;},1000,parent.signal);parent.abort();
 await assert.rejects(result,error=>error.name==='AbortError');assert.equal(started,0);
 await assert.rejects(withRequestTimeout(async()=>{started++;},1000,parent.signal),error=>error.name==='AbortError');assert.equal(started,0);
});
test('completed requests release parent abort listeners',async()=>{
 let added=0,removed=0;const signal={aborted:false,addEventListener(){added++;},removeEventListener(){removed++;}};
 assert.equal(await withRequestTimeout(async()=>42,1000,signal),42);assert.equal(added,1);assert.equal(removed,1);
});

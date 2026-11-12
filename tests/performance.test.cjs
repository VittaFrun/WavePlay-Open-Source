const test=require('node:test');
const assert=require('node:assert/strict');
const {createActiveTrackStore}=require('../src/utils/activeTrackStore.ts');
const {createLatestRead,reconcileRows,recoveryDelay,createProgressGate,createCoalescedWriter,createBufferedWriter}=require('../src/utils/asyncWork.ts');

test('incremental history preserves failed writes across song changes without duplicating committed deltas',async()=>{
  let fail=true;const saved=[];
  const writer=createBufferedWriter(async value=>{if(fail){fail=false;throw new Error('database busy');}saved.push(value);});
  await assert.rejects(writer.submit({id:'song-a',seconds:10}),/database busy/);
  await writer.submit({id:'song-b',seconds:4});
  await writer.flush();
  assert.deepEqual(saved,[{id:'song-a',seconds:10},{id:'song-b',seconds:4}]);
});

test('incremental writes arriving during persistence remain ordered',async()=>{
  const saved=[];let release;
  const writer=createBufferedWriter(async value=>{if(value===1)await new Promise(done=>{release=done;});saved.push(value);});
  const first=writer.submit(1);await Promise.resolve();const second=writer.submit(2);
  release();await Promise.all([first,second]);assert.deepEqual(saved,[1,2]);
});

test('changing the playing song only notifies subscribers to old and new ids',()=>{
  const store=createActiveTrackStore(),counts={a:0,b:0,c:0};
  const clean=Object.keys(counts).map(id=>store.subscribe(id,()=>{counts[id]+=1;}));
  store.setActive('a');store.setActive('a');store.setActive('b');
  assert.deepEqual(counts,{a:2,b:1,c:0});assert.equal(store.isActive('b'),true);
  clean.forEach(unsubscribe=>unsubscribe());store.setActive('c');
  assert.deepEqual(counts,{a:2,b:1,c:0});
});
test('identical reads share a request; obsolete responses cannot undo a mutation',async()=>{
  const resolve=[],applied=[];
  const read=createLatestRead(()=>new Promise(done=>resolve.push(done)),value=>applied.push(value));
  const first=read.run();assert.equal(first,read.run());assert.equal(resolve.length,1);
  read.invalidate();const second=read.run();assert.equal(resolve.length,2);
  resolve[1]('new');await second;resolve[0]('old');await first;
  assert.deepEqual(applied,['new']);
});
test('failed reads release the in-flight slot so a retry can succeed',async()=>{
  let attempt=0;const applied=[];
  const read=createLatestRead(async()=>{if(++attempt===1)throw new Error('offline');return 'online';},value=>applied.push(value));
  await assert.rejects(read.run(),/offline/);await read.run();
  assert.deepEqual(applied,['online']);
});
test('reconciliation preserves unchanged row and array references through refreshes',()=>{
  const original=[{id:'a',favorite:false},{id:'b',favorite:false}];
  assert.equal(reconcileRows(original,original.map(row=>({...row}))),original);
  const changed=reconcileRows(original,[{id:'a',favorite:true},{id:'b',favorite:false}]);
  assert.notEqual(changed[0],original[0]);assert.equal(changed[1],original[1]);
  assert.deepEqual(reconcileRows(original,[{id:'b',favorite:false}]),[original[1]]);
  const members=[{userId:'u',role:'host'}];
  assert.equal(reconcileRows(members,[{userId:'u',role:'host'}],row=>row.userId),members);
});
test('room recovery uses a slower healthy poll, backs off and returns to normal',()=>{
  assert.equal(recoveryDelay(true,0),15000);assert.equal(recoveryDelay(false,0),5000);
  assert.deepEqual([1,2,3,4,5,10].map(n=>recoveryDelay(false,n)),[5000,10000,20000,40000,60000,60000]);
  assert.equal(recoveryDelay(true,0),15000);
});
test('upload progress suppresses noisy updates but always reports completion',()=>{
  const accept=createProgressGate();
  assert.equal(accept(0,0),true);assert.equal(accept(.001,10),false);
  assert.equal(accept(.02,150),true);assert.equal(accept(.03,170),false);
  assert.equal(accept(1,180),true);assert.equal(accept(1,200),false);
});

test('session writes coalesce queued snapshots and persist the last state',async()=>{
  const written=[],release=[];
  const writer=createCoalescedWriter(async value=>{written.push(value);await new Promise(done=>release.push(done));});
  const first=writer.submit({position:1});await Promise.resolve();
  writer.submit({position:2});const final=writer.submit({position:3,paused:true});
  assert.deepEqual(written,[{position:1}]);release.shift()();
  await new Promise(done=>setImmediate(done));
  assert.deepEqual(written,[{position:1},{position:3,paused:true}]);
  release.shift()();await Promise.all([first,final]);
});
test('a failed session write can be retried with the newest snapshot',async()=>{
  let fail=true;const written=[];
  const writer=createCoalescedWriter(async value=>{if(fail){fail=false;throw new Error('disk busy');}written.push(value);});
  await assert.rejects(writer.submit(1),/disk busy/);await writer.submit(2);
  assert.deepEqual(written,[2]);
});

test('cleanup tolerates an already released native player and exposes other failures',()=>{
  const {pauseForCleanup}=require('../src/utils/sharedPlayback.ts');
  assert.equal(pauseForCleanup({pause(){}}),true);
  assert.equal(pauseForCleanup({pause(){throw new Error('Cannot use shared object that was already released');}}),false);
  assert.throws(()=>pauseForCleanup({pause(){throw new Error('unexpected native failure');}}),/unexpected native failure/);
});

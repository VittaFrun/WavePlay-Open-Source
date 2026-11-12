const test=require('node:test'),assert=require('node:assert/strict');
const store=require('../src/services/djSessions.ts');
const mix={id:'daily',title:'Mix',caption:'',tracks:[{id:'a'},{id:'a'},{id:'missing',missing:true},{id:'b'}]};

test('pinning retains song references and unchanged edits do not notify the DJ view',()=>{
 const draft=store.createDjSession(mix),before=store.getDjSessions();let notifications=0;
 const unsubscribe=store.subscribeDjSessions(()=>notifications++);
 store.editDjSession(draft.id,{});assert.equal(store.getDjSessions(),before);assert.equal(notifications,0);
 store.editDjSession(draft.id,{keptIds:['a']});const pinned=store.getDjSessions().find(item=>item.id===draft.id);
 assert.equal(pinned.trackIds,draft.trackIds);assert.equal(notifications,1);
 store.editDjSession(draft.id,{keptIds:['a']});assert.equal(notifications,1);
 unsubscribe();store.discardDjSession(draft.id);
});
test('temporary collections retain unique song ids and stay available between view subscriptions',()=>{
 const draft=store.createDjSession(mix);
 assert.deepEqual(draft.trackIds,['a','b']);
 const snapshot=store.getDjSessions();let calls=0;
 const unsubscribe=store.subscribeDjSessions(()=>calls++);unsubscribe();
 assert.equal(store.getDjSessions(),snapshot);assert.equal(calls,0);
 store.discardDjSession(draft.id);assert.equal(store.getDjSessions().length,0);
});
test('failed saves keep the draft, and concurrent saves create only one permanent playlist',async()=>{
 const draft=store.createDjSession(mix);
 await assert.rejects(store.saveDjSession(draft.id,async()=>{throw new Error('disk');}),/disk/);
 assert.equal(store.getDjSessions()[0],draft);
 let calls=0,finish;
 const first=store.saveDjSession(draft.id,()=>{calls++;return new Promise(resolve=>finish=resolve);});
 const second=store.saveDjSession(draft.id,async()=>{calls++;});
 assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
 finish();await first;assert.equal(store.getDjSessions().length,0);
});
test('the draft limit preserves existing collections rather than silently discarding them',()=>{
 for(let i=0;i<20;i++)assert.ok(store.createDjSession(mix));
 const snapshot=store.getDjSessions();assert.equal(store.createDjSession(mix),null);
 assert.equal(store.getDjSessions(),snapshot);
 for(const session of snapshot)store.discardDjSession(session.id);
 assert.equal(store.createDjSession({...mix,tracks:[]}),null);
});

test('editing a DJ draft preserves unique songs and drops pins of removed songs',()=>{
 const draft=store.createDjSession(mix);
 store.editDjSession(draft.id,{keptIds:['a','a','not-in-session'],title:'Mi mezcla'});
 assert.deepEqual(store.getDjSessions()[0].keptIds,['a']);
 store.replaceDjSong(draft.id,'a','b');assert.deepEqual(store.getDjSessions()[0].trackIds,['a','b']);
 store.replaceDjSong(draft.id,'a','c');assert.deepEqual(store.getDjSessions()[0].trackIds,['c','b']);
 assert.deepEqual(store.getDjSessions()[0].keptIds,[]);
 store.discardDjSession(draft.id);
});
test('regenerating keeps pinned songs, deduplicates and respects original size',()=>{
 const draft=store.createDjSession(mix);
 store.editDjSession(draft.id,{keptIds:['b']});
 store.regenerateDjSession(draft.id,['c','b','d','c']);
 assert.deepEqual(store.getDjSessions()[0].trackIds,['b','c']);
 store.discardDjSession(draft.id);
});
test('a saving session cannot change underneath the persisted snapshot',async()=>{
 const draft=store.createDjSession(mix);let finish;
 const saving=store.saveDjSession(draft.id,()=>new Promise(resolve=>finish=resolve));
 store.editDjSession(draft.id,{trackIds:['new']});
 assert.deepEqual(store.getDjSessions()[0].trackIds,draft.trackIds);
 await Promise.resolve();finish();await saving;
});

test('empty drafts can be regenerated, and empty names retain the last usable title',()=>{
 const draft=store.createDjSession(mix);
 store.editDjSession(draft.id,{title:'  ',trackIds:[]});assert.equal(store.getDjSessions()[0].title,draft.title);
 store.regenerateDjSession(draft.id,['c','d','c']);assert.deepEqual(store.getDjSessions()[0].trackIds,['c','d']);store.discardDjSession(draft.id);
});

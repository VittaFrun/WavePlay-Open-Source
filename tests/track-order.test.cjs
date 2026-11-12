const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyTrackOrder}=require('../src/utils/trackOrder.ts');
test('saved order ignores removed members and appends new songs',()=>{
 const tracks=[{id:'a'},{id:'b'},{id:'c'}];
 assert.deepEqual(applyTrackOrder(tracks,['gone','b','b','a']).map(t=>t.id),['b','a','c']);
 assert.deepEqual(tracks.map(t=>t.id),['a','b','c']);
});
test('empty and automatic collection orders remain usable',()=>{
 assert.deepEqual(applyTrackOrder([],['a']),[]);
 const tracks=[{id:'b'},{id:'a'}];
 assert.deepEqual(applyTrackOrder(tracks,[]),tracks);
});

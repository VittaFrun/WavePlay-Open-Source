const test=require('node:test');
const assert=require('node:assert/strict');
test('room row selections update only previous and next active rows',async()=>{
 const {createRoomSelection}=await import('../src/utils/roomSelection.ts');
 let state={active:'a',playing:true,progress:0};
 const rows=['a','b','c'].map(id=>createRoomSelection(()=>({active:state.active===id,playing:state.active===id&&state.playing})));
 const before=rows.map(read=>read());
 state={...state,progress:30};rows.forEach((read,i)=>assert.equal(read(),before[i]));
 state={...state,active:'b'};
 assert.notEqual(rows[0](),before[0]);assert.notEqual(rows[1](),before[1]);assert.equal(rows[2](),before[2]);
});
test('queue selection preserves references through playback updates',async()=>{
 const {createRoomSelection}=await import('../src/utils/roomSelection.ts');
 let value={queue:[{id:'a'}],revision:1};const read=createRoomSelection(()=>({queue:value.queue}));const before=read();
 value={...value,revision:2};assert.equal(read(),before);
 value={...value,queue:[{id:'b'}]};assert.notEqual(read(),before);
});

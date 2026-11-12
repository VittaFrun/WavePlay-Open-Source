const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initialFramePolicy,nextFramePolicy}=require('../src/utils/performancePolicy.ts');

test('visual fallback requires sustained slow frames and ignores small samples',()=>{
  let state=nextFramePolicy(initialFramePolicy,40,40);
  assert.equal(state.reduced,false);
  state=nextFramePolicy(state,180,50);
  assert.equal(state.reduced,false);
  state=nextFramePolicy(state,180,50);
  assert.equal(state.reduced,true);
});

test('visual effects return only after sustained recovery',()=>{
  let state=nextFramePolicy(nextFramePolicy(initialFramePolicy,180,50),180,50);
  for(let i=0;i<5;i++)state=nextFramePolicy(state,180,4);
  assert.equal(state.reduced,true);
  state=nextFramePolicy(state,180,4);
  assert.equal(state.reduced,false);
});

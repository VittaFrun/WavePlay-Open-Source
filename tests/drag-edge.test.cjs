const {test}=require('node:test');
const assert=require('node:assert/strict');
const {dragEdgePressure}=require('../src/utils/dragEdge.ts');

test('drag fallback scrolls only near a visible edge',()=>{
  assert.equal(dragEdgePressure(14,10,18),0);
  assert.equal(dragEdgePressure(-1,10,18),0);
  assert.equal(dragEdgePressure(2,0,2),0);
});

test('fallback acceleration increases as the placeholder approaches an edge', () => {
  assert.equal(dragEdgePressure(12, 10, 18), -1 / 3);
  assert.equal(dragEdgePressure(11, 10, 18), -2 / 3);
  assert.equal(dragEdgePressure(10, 10, 18), -1);
  assert.equal(dragEdgePressure(16, 10, 18), 1 / 3);
  assert.equal(dragEdgePressure(17, 10, 18), 2 / 3);
  assert.equal(dragEdgePressure(18, 10, 18), 1);
  assert.equal(dragEdgePressure(14, 10, 18), 0);
});

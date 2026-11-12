const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createLockScreenController } = require('../src/utils/lockScreen.ts');

test('restoration, favorite changes and song changes activate only one native session', () => {
  const calls=[];
  const controller=createLockScreenController({
    setActiveForLockScreen: (...args)=>calls.push(['activate',...args]),
    updateLockScreenMetadata: metadata=>calls.push(['update',metadata]),
    clearLockScreenControls: ()=>calls.push(['clear']),
  });
  const metadata={title:'Song',artist:'Artist',albumTitle:'Album'};
  controller.update(metadata);
  controller.update(metadata);
  controller.update({...metadata,title:'Next song'});
  assert.deepEqual(calls.map(call=>call[0]),['activate','update','update']);
  assert.deepEqual(calls[0][3], {showSeekForward:false,showSeekBackward:false});
  controller.clear();controller.update(metadata);
  assert.deepEqual(calls.map(call=>call[0]),['activate','update','update','clear','activate']);
});

test('failed native activation can be retried', () => {
  let attempts=0;
  const controller=createLockScreenController({
    setActiveForLockScreen: ()=>{if(++attempts===1)throw new Error('Unavailable');},
    updateLockScreenMetadata: ()=>assert.fail('A failed session is not active'),
    clearLockScreenControls: ()=>{},
  });
  const metadata={title:'Song',artist:'Artist',albumTitle:'Album'};
  assert.throws(()=>controller.update(metadata));
  controller.update(metadata);assert.equal(attempts,2);
});

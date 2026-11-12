const {test}=require('node:test');
const assert=require('node:assert/strict');
const {leaveAppearance}=require('../src/utils/appearanceNavigation.ts');
test('appearance exits to profile when opened without history',()=>{
 const calls=[];
 leaveAppearance({canGoBack:()=>false,back:()=>calls.push('back'),replace:path=>calls.push(path)});
 assert.deepEqual(calls,['/(tabs)/profile']);
});
test('appearance retains normal back navigation with history',()=>{
 const calls=[];
 leaveAppearance({canGoBack:()=>true,back:()=>calls.push('back'),replace:path=>calls.push(path)});
 assert.deepEqual(calls,['back']);
});

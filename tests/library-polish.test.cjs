const {test}=require('node:test');
const assert=require('node:assert/strict');
const {marqueePlan}=require('../src/utils/marquee.ts');
const {addedDays,addedGroups}=require('../src/utils/addedGroups.ts');
const {toggleVisibleSelection}=require('../src/utils/playlistSelection.ts');

test('marquee only runs for measured overflowing titles with a consistent speed',()=>{
 for(const [content,viewport] of [[100,200],[200,200],[202,200],[NaN,200],[200,0],[Infinity,100]])assert.equal(marqueePlan(content,viewport),null);
 const plan=marqueePlan(280,150);
 assert.equal(plan.distance,312);assert.equal(plan.gap,32);assert.equal(plan.duration,Math.round(312/28*1000));
});
test('last-added categories use calendar days, not elapsed 24-hour periods',()=>{
 const now=new Date(2026,8,28,0,10).getTime();
 const yesterday={id:'y',addedAt:new Date(2026,8,27,23,55).getTime(),createdAt:1};
 const today={id:'t',addedAt:now,createdAt:1};
 const old={id:'o',createdAt:new Date(2026,8,24,13).getTime()};
 assert.equal(addedDays(yesterday,now),1);
 assert.deepEqual(addedGroups([old,yesterday,today],now).map(g=>g.title),['Hoy','Hace 1 día','Hace 4 días']);
 assert.deepEqual(addedGroups([old,yesterday,today],now).flatMap(g=>g.tracks.map(t=>t.id)),['t','y','o']);
});
test('category boundaries handle missing dates and future timestamps',()=>{
 const now=new Date(2026,8,28).getTime();
 assert.equal(addedDays({addedAt:now+86400000,createdAt:0},now),0);
 assert.equal(addedDays({createdAt:0},now),Infinity);
 assert.deepEqual(addedGroups([{id:'unknown',createdAt:0}],now).map(g=>g.title),['Sin fecha']);
});
test('select-all affects only the filtered candidates and preserves hidden choices',()=>{
 const selected=new Set(['hidden','a']);
 const all=toggleVisibleSelection(selected,['a','b']);
 assert.deepEqual([...all],['hidden','a','b']);
 assert.deepEqual([...toggleVisibleSelection(all,['a','b'])],['hidden']);
 assert.deepEqual([...selected],['hidden','a']);
 assert.deepEqual([...toggleVisibleSelection(selected,[])],['hidden','a']);
});

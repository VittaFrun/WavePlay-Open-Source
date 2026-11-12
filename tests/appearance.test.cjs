const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeAppearance,defaultAppearance,accents,backgroundStops}=require('../src/utils/appearance.ts');
test('WavePlay defaults to anime night and monochrome without replacing saved choices',()=>{
 assert.equal(defaultAppearance.background,'anime');assert.equal(defaultAppearance.accent,'mono');
 assert.equal(normalizeAppearance({background:'solid',accent:'mint'}).accent,'mint');
 assert.equal(normalizeAppearance({background:'solid',accent:'mint'}).background,'solid');
 for(const id of ['amber','lavender','coral'])assert.ok(accents.some(accent=>accent.id===id));
});
test('invalid stored appearance restores compatible defaults',()=>{
 assert.deepEqual(normalizeAppearance(null),defaultAppearance);
 assert.deepEqual(normalizeAppearance({accent:'unknown',imageUri:'https://remote/image',dim:NaN,blur:Infinity}),defaultAppearance);
});
test('background adjustments are bounded for readability',()=>{
 const result=normalizeAppearance({accent:'mint',background:'anime',dim:-1,blur:90});
 assert.equal(result.accent,'mint');assert.equal(result.background,'anime');assert.equal(result.dim,0);assert.equal(result.blur,20);
});
test('legacy appearance keeps uniform dimming and gradient reveals the upper image',()=>{
 const legacy=normalizeAppearance({dim:.65});
 assert.equal(legacy.gradient,0);
 assert.deepEqual(backgroundStops(legacy),Array(3).fill('rgba(10,10,16,0.65)'));
 const stops=backgroundStops({...legacy,gradient:1});
 assert.equal(stops[0],'rgba(10,10,16,0)');assert.equal(stops[2],'rgba(10,10,16,0.65)');
 assert.equal(normalizeAppearance({gradient:Infinity}).gradient,0);
 assert.equal(normalizeAppearance({gradient:3}).gradient,1);
 assert.equal(normalizeAppearance({gradient:-3}).gradient,0);
});
test('all presets round-trip and gallery background remains local',()=>{
 for(const accent of accents)assert.equal(normalizeAppearance({...defaultAppearance,accent:accent.id}).accent,accent.id);
 const value={...defaultAppearance,background:'custom',imageUri:'file:///app/appearance/background.jpg'};
 assert.deepEqual(normalizeAppearance(JSON.parse(JSON.stringify(value))),value);
});
test('image framing is validated and old settings retain cover',()=>{
 assert.equal(normalizeAppearance({}).imageFit,'cover');
 assert.equal(normalizeAppearance({imageFit:'invalid'}).imageFit,'cover');
 const value={...defaultAppearance,imageFit:'contain'};
 assert.deepEqual(normalizeAppearance(JSON.parse(JSON.stringify(value))),value);
});
test('panel blur and playlist view migrate and remain bounded',()=>{
 assert.equal(normalizeAppearance({}).panelBlur,45);
 assert.equal(normalizeAppearance({panelBlur:Infinity}).panelBlur,45);
 assert.equal(normalizeAppearance({panelBlur:500}).panelBlur,100);
 assert.equal(normalizeAppearance({panelBlur:-10}).panelBlur,0);
 assert.equal(normalizeAppearance({playlistView:'invalid'}).playlistView,'grid');
 assert.equal(normalizeAppearance({playlistView:'list'}).playlistView,'list');
});
test('zero dim leaves image visible throughout every gradient level',()=>{
 for(const gradient of [0,.25,.5,1])assert.deepEqual(backgroundStops({...defaultAppearance,dim:0,gradient}),Array(3).fill('rgba(10,10,16,0)'));
 const stops=backgroundStops({...defaultAppearance,dim:.8,gradient:.5});
 assert.deepEqual(stops,['rgba(10,10,16,0.4)','rgba(10,10,16,0.58)','rgba(10,10,16,0.8)']);
});
test('image coverage migrates without hiding legacy wallpapers',()=>{
 assert.equal(normalizeAppearance({gradient:0}).imageCoverage,1);
 assert.equal(normalizeAppearance({imageCoverage:NaN}).imageCoverage,1);
 assert.equal(normalizeAppearance({imageCoverage:-3}).imageCoverage,0);
 assert.equal(normalizeAppearance({imageCoverage:7}).imageCoverage,1);
 assert.equal(normalizeAppearance({gradientInverted:'true'}).gradientInverted,false);
 assert.equal(normalizeAppearance({gradientInverted:true}).gradientInverted,true);
});
test('coverage controls the vertical image-to-solid boundary and can invert',()=>{
 const {backgroundGradient}=require('../src/utils/appearance.ts');
 const zero=backgroundGradient({...defaultAppearance,imageCoverage:0});
 assert.ok(zero.colors.every(color=>color==='#13131A'));
 const full=backgroundGradient({...defaultAppearance,imageCoverage:1});
 assert.ok(full.colors.every(color=>color==='rgba(19,19,26,0)'));
 for(const imageCoverage of [.01,.25,.5,.9]){
  const result=backgroundGradient({...defaultAppearance,imageCoverage});
  assert.equal(result.locations[2],imageCoverage);
  assert.equal(result.colors[2],'#13131A');
  assert.ok(result.locations.every((value,index,array)=>value>=0&&value<=1&&(!index||value>=array[index-1])));
  const inverse=backgroundGradient({...defaultAppearance,imageCoverage,gradientInverted:true});
  assert.deepEqual(inverse.locations,result.locations);
  assert.deepEqual(inverse.start,{x:0,y:1});assert.deepEqual(inverse.end,{x:0,y:0});
 }
});

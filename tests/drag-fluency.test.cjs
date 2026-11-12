const test=require('node:test'),assert=require('node:assert/strict');
const {dragScrollTarget}=require('../scripts/templates/dragAutoscroll.ts');

test('drag autoscroll is gradual, refresh-rate independent and bounded at both ends',()=>{
 const step=ms=>dragScrollTarget(100,2000,436,64,500,96,520,ms)-100;
 assert.ok(Math.abs(step(1000/60)-2*step(1000/120))<.0001);
 assert.ok(step(1000)<=520*.032+.0001);
 assert.equal(dragScrollTarget(0,100,0,64,500,96,520,16),0);
 assert.equal(dragScrollTarget(100,100,436,64,500,96,520,16),100);
 assert.equal(dragScrollTarget(100,2000,200,64,500,96,520,16),100);
 const gentle=dragScrollTarget(100,2000,484-96,64,500,96,520,16)-100;
 assert.ok(gentle>0&&gentle<step(16));
});

test('the native drag driver scrolls on frames, stops on release and never bridges each step to JS',()=>{
 const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
 const value=n=>({value:n});
 const values={scrollOffset:value(100),scrollViewSize:value(2000),containerSize:value(500),activeCellSize:value(64),hoverOffset:value(536),activeIndexAnim:value(1),isTouchActiveNative:value(true),disabled:value(false),horizontalAnim:value(false)};
 const nativeRef={},scrolls=[],activation=[];let callback,prepare,react,cleanup,bridges=0;
 const modules={react:{useCallback:f=>f,useEffect:f=>cleanup=f()},'react-native-reanimated':{
  scrollTo:(...args)=>scrolls.push(args),runOnJS:f=>(...args)=>{bridges++;f(...args);},
  useFrameCallback:f=>{callback=f;return {setActive:v=>activation.push(v)};},useAnimatedReaction:(p,r)=>{prepare=p;react=r;},
 },'../context/propsContext':{useProps:()=>({autoscrollThreshold:96,autoscrollSpeed:520})},'../context/animatedValueContext':{useAnimatedValues:()=>values},'../context/refContext':{useRefs:()=>({uiScrollRef:nativeRef})},'./WavePlayAutoScroll':{dragScrollTarget}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('scripts/templates/useAutoScroll.tsx.template','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:n=>modules[n]});
 exports.useAutoScroll();react(prepare(),false);assert.deepEqual(activation,[true]);
 for(let i=0;i<12;i++){callback({timeSincePreviousFrame:16});values.scrollOffset.value=scrolls.at(-1)[2];}
 assert.equal(scrolls.length,12);assert.equal(bridges,1);assert.equal(scrolls[0][0],nativeRef);assert.equal(scrolls[0][3],false);
 values.isTouchActiveNative.value=false;react(prepare(),true);callback({timeSincePreviousFrame:16});assert.equal(scrolls.length,12);assert.equal(activation.at(-1),false);
 cleanup();assert.equal(activation.at(-1),false);
});

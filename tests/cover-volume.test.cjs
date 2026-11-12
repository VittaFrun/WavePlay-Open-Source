const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

function harness(){
  const handlers={},changes=[];
  const chain=new Proxy({}, {get:(_,name)=>(...args)=>{if(name.startsWith('on'))handlers[name]=args[0];return chain;}});
  const exports={};
  const source=ts.transpileModule(fs.readFileSync('src/components/CoverVolumeGesture.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const react={useRef:value=>({current:value}),useState:value=>[value,()=>{}],useMemo:fn=>fn(),useEffect:()=>{}};
  vm.runInNewContext(source,{exports,require:id=>id==='react'?react:id==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:id==='react-native-gesture-handler'?{Gesture:{Pan:()=>chain}}:id==='../theme'?{useTheme:()=>({colors:{}}),fonts:{}}:{},setTimeout:()=>0,clearTimeout:()=>{}});
  exports.CoverVolumeGesture({width:300,height:300,volume:.7,onVolume:value=>changes.push(value)});
  return {handlers,changes};
}
test('a rejected cover gesture or tap cannot change volume',()=>{
  const {handlers,changes}=harness();
  handlers.onFinalize({translationY:100});
  assert.deepEqual(changes,[]);
});
test('an active cover drag adjusts volume and finalizes only once',()=>{
  const {handlers,changes}=harness();
  handlers.onStart();handlers.onUpdate({translationY:46});handlers.onFinalize({translationY:46});
  assert.equal(changes[0],.5);
  const count=changes.length;handlers.onFinalize({translationY:100});
  assert.equal(changes.length,count);
});

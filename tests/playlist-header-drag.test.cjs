const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks){const exports={};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{exports,require:n=>{if(n in mocks)return mocks[n];if(n==='../utils/listPosition')return require('../src/utils/listPosition.ts');throw Error(n);},setTimeout,clearTimeout,Date,Math});return exports;}
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};

test('draggable wrapper preserves its public object reference for explicit scrolling',()=>{
 require('node:child_process').execFileSync(process.execPath,['scripts/patch-draggable-autoscroll.cjs']);
 const react={useRef:v=>({current:v}),useState:v=>[v,()=>{}],useCallback:f=>f,useMemo:f=>f(),useEffect:()=>{}};
 const api=load('src/components/FastScrollList.tsx',{
  react,'react/jsx-runtime':jsx,'react-native':{FlatList:'flat',View:'view',PanResponder:{create:()=>({panHandlers:{}})}},
  'react-native-draggable-flatlist':{__esModule:true,default:'draggable'},
  'react-native-reanimated':{__esModule:true,default:{createAnimatedComponent:c=>c,View:'animated'},useSharedValue:v=>({value:v}),useAnimatedStyle:f=>f(),useAnimatedScrollHandler:f=>f,useAnimatedReaction:()=>{}},
  'expo-haptics':{selectionAsync:async()=>{}},'../theme':{useTheme:()=>({colors:{pink:'#fff'}})},'../utils/dragEdge':require('../src/utils/dragEdge.ts'),
 });
 const tree=api.FastDraggableList({data:[],keyExtractor:x=>x,renderItem:()=>null}),ref=tree.props.children[0].props.ref;
 assert.equal(typeof ref,'object');assert.ok('current' in ref);
 const calls=[];ref.current={scrollToOffset:args=>calls.push(args)};
 ref.current.scrollToOffset({offset:120,animated:false});
 assert.equal(calls.length,1);assert.equal(calls[0].offset,120);

});

test('playlist header stays in normal layout without animated scroll work',()=>{
 const api=load('src/components/PlaylistHeader.tsx',{'react/jsx-runtime':jsx,'react-native':{View:'view',StyleSheet:{create:x=>x}}});
 const tree=api.PlaylistHeader({hero:'cover',controls:'actions'});
 assert.equal(tree.props.style.backgroundColor,'transparent');assert.equal(tree.props.style.position,undefined);
 assert.equal(tree.props.children[0].props.children,'cover');assert.equal(tree.props.children[1].props.children,'actions');
 assert.equal(tree.props.children[0].props.style.minHeight,80);
});

test('upstream native scrolling does not schedule JS when no consumer listens',()=>{
 const file='node_modules/react-native-draggable-flatlist/src/components/DraggableFlatList.tsx';
 const patch=()=>require('node:child_process').execFileSync(process.execPath,['scripts/patch-draggable-autoscroll.cjs']);patch();const first=fs.readFileSync(file,'utf8');patch();assert.equal(fs.readFileSync(file,'utf8'),first);
 assert.match(first,/if \(hasJsScrollListener\) runOnJS\(onScroll\)\(scrollOffset.value\)/);
 assert.match(first,/\[horizontalAnim, hasJsScrollListener\]/);
});

test('native draggable scroll reaches header and rail without a JS scroll listener',()=>{
 let prepare,react;let stored=null;
 const state=v=>[v,value=>{stored=value;}];
 const shared=value=>({value,set(next){this.value=next;}});
 const mocks={react:{useRef:v=>({current:v}),useState:state,useCallback:f=>f,useMemo:f=>f(),useEffect:()=>{}},'react/jsx-runtime':jsx,'react-native':{FlatList:'flat',View:'view',PanResponder:{create:()=>({panHandlers:{}})}},'react-native-draggable-flatlist':{__esModule:true,default:'draggable'},'react-native-reanimated':{__esModule:true,default:{createAnimatedComponent:c=>c,View:'animated'},useSharedValue:shared,useAnimatedStyle:f=>f(),useAnimatedScrollHandler:f=>f,useAnimatedReaction:(p,r)=>{prepare=p;react=r;}},'expo-haptics':{},'../theme':{useTheme:()=>({colors:{pink:'#fff'}})}};
 const api=load('src/components/FastScrollList.tsx',mocks),offset=shared(0),native=shared(95);
 let tree=api.FastDraggableList({data:[],scrollOffset:offset,keyExtractor:x=>x,renderItem:()=>null});
 assert.equal(tree.props.children[0].props.onScrollOffsetChange,undefined);
 tree.props.children[0].props.onAnimValInit({scrollOffset:native});assert.equal(stored,native);
 mocks.react.useState=v=>v===null?[stored,()=>{}]:[v,()=>{}];
 tree=api.FastDraggableList({data:[],scrollOffset:offset,keyExtractor:x=>x,renderItem:()=>null});react(prepare());assert.equal(offset.value,95);
 native.set(145);react(prepare());assert.equal(offset.value,145);
});

test('playlist row layout stays contiguous across 229 items and accommodates large text',()=>{
 const {playlistRowHeight,playlistItemLayout}=require('../src/utils/playlistLayout.ts');
 for(const scale of [1,1.15,1.5,2,3]){
  const height=playlistRowHeight(scale);assert.ok(height>=64);assert.ok(height>=Math.ceil(18*scale)+Math.ceil(15*scale)+19);
  let end=137;for(let i=0;i<229;i++){const layout=playlistItemLayout(height,137,i);assert.equal(layout.offset,end);end+=layout.length;}
  assert.equal(end,137+229*height);
 }
 assert.equal(playlistRowHeight(NaN),64);
});

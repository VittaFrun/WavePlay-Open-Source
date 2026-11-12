const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');

function load(file,modules){
 const exports={};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(source,{exports,require:name=>modules[name]});return exports;
}
function subscribers(){
 const consumers=[];
 return {consumers,react:{useSyncExternalStore(subscribe,read){const consumer={value:read()};consumer.unsubscribe=subscribe(()=>{consumer.value=read();});consumer.value=read();consumers.push(consumer);return consumer.value;}}};
}
test('motion consumers share one native listener and ignore an outdated accessibility query',async()=>{
 let event,resolve,queries=0,added=0,removed=0;const h=subscribers();
 const api=load('src/hooks/useSystemReducedMotion.ts',{'react':h.react,'react-native':{AccessibilityInfo:{isReduceMotionEnabled:()=>{queries++;return new Promise(done=>resolve=done);},addEventListener:(_,callback)=>{added++;event=callback;return{remove(){removed++;}};}}}});
 api.useSystemReducedMotion();api.useSystemReducedMotion();assert.equal(queries,1);assert.equal(added,1);
 event(true);resolve(false);await Promise.resolve();await Promise.resolve();
 assert.equal(h.consumers[0].value,true);assert.equal(h.consumers[1].value,true);
 h.consumers[0].unsubscribe();assert.equal(removed,0);h.consumers[1].unsubscribe();assert.equal(removed,1);
});
test('scene visibility shares the app listener and follows foreground changes',()=>{
 let event,added=0,removed=0;const h=subscribers();
 const AppState={currentState:'active',addEventListener:(_,callback)=>{added++;event=callback;return{remove(){removed++;}};}};
 const api=load('src/hooks/useSceneActive.ts',{'react':h.react,'react-native':{AppState},'expo-router':{useIsFocused:()=>true}});
 assert.equal(api.useSceneActive(),true);api.useSceneActive();assert.equal(added,1);
 AppState.currentState='background';event('background');assert.equal(h.consumers[0].value,false);assert.equal(h.consumers[1].value,false);
 h.consumers.forEach(item=>item.unsubscribe());assert.equal(removed,1);
});

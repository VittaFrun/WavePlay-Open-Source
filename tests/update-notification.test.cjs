const test=require('node:test'), assert=require('node:assert/strict');
const {load}=require('./helpers/database.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({path='/',foreground=true,allow=true,wait}={}) {
 const effects=[],cleanups=[],listeners=new Set(),alerts=[],dismissed=[],routes=[];
 let state={status:'idle',release:null},changes,checks=0;
 const app={currentState:foreground?'active':'background',addEventListener:(_event,fn)=>{changes=fn;return {remove:()=>{changes=null;}};}};
 const api=load('src/components/AppUpdateHost.tsx',{
  react:{useEffect:fn=>effects.push(fn),useRef:value=>({current:value})},
  'react-native':{AppState:app},'expo-router':{usePathname:()=>path,router:{push:value=>routes.push(value)}},
  '../services/appAlert':{AppAlert:{alert:(...args)=>alerts.push(args)}},
  '../services/appUpdates':{
   getAppUpdate:()=>state, subscribeAppUpdate:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
   shouldNotifyUpdate:async()=>{if(wait)await wait;return allow;},
   checkAppUpdate:async()=>{checks++;},dismissAppUpdate:async version=>{dismissed.push(version);},
  },
 },{setTimeout:()=>1,clearTimeout:()=>{}});
 api.AppUpdateHost();effects.forEach(fn=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);});
 return {alerts,dismissed,routes,checks:()=>checks,
  publish:version=>{state={status:'available',release:{versionCode:version,versionName:'1.'+version,notes:'Mejoras'}};listeners.forEach(fn=>fn());},
  foreground:()=>{app.currentState='active';changes?.('active');},
  dispose:()=>cleanups.reverse().forEach(fn=>fn()),listenerCount:()=>listeners.size};
}

test('availability detected by any check opens one themed popup per version',async()=>{
 const f=fixture();f.publish(2);f.publish(2);await tick();assert.equal(f.alerts.length,1);assert.equal(f.alerts[0][4],'update');
 f.alerts[0][2][0].onPress();await tick();assert.deepEqual(f.dismissed,[2]);
 f.publish(3);await tick();assert.equal(f.alerts.length,2);f.alerts[1][2][1].onPress();assert.deepEqual(f.routes,['/updates']);f.dispose();assert.equal(f.listenerCount(),0);
});

test('popup waits for foreground and avoids covering the update and authentication screens',async()=>{
 const background=fixture({foreground:false});background.publish(2);await tick();assert.equal(background.alerts.length,0);
 background.foreground();await tick();assert.equal(background.alerts.length,1);background.dispose();
 for(const path of ['/updates','/welcome','/auth/callback']){const f=fixture({path});f.publish(2);await tick();assert.equal(f.alerts.length,0);f.dispose();}
 const dismissed=fixture({allow:false});dismissed.publish(2);await tick();assert.equal(dismissed.alerts.length,0);dismissed.dispose();
});

test('stale availability checks cannot notify after unmount; newer releases are retried',async()=>{
 let resolve;const wait=new Promise(r=>resolve=r),f=fixture({wait});f.publish(2);f.publish(3);resolve();await tick();
 assert.equal(f.alerts.length,1);assert.match(f.alerts[0][1],/1.3/);f.dispose();
 let finish;const removed=fixture({wait:new Promise(r=>finish=r)});removed.publish(2);removed.dispose();finish();await tick();assert.equal(removed.alerts.length,0);
});

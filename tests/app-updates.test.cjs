const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),ts=require('typescript');
const release={versionCode:2,versionName:'1.1',apkUrl:'https://expo.dev/artifacts/eas/a.apk',sha256:'a'.repeat(64),size:100,minSdk:26,notes:''};
function fixture({allow=true,verifyError=false,development=false,setup}={}){
 let module={exports:{}},fetches=0,downloads=0,verifies=0,installs=0,permissions=0,finishDownload,progress,cancelled=0;
 const storage=new Map(),files=new Set();
 const native={getInfo:async()=>({versionCode:1,versionName:'1.0',sdk:36,development}),verify:async()=>{verifies++;if(verifyError)throw new Error('bad signature');},canInstall:async()=>allow,openPermission:async()=>{permissions++;allow=true;},install:async()=>{installs++;}};
 const filesystem={cacheDirectory:'file:///cache/',makeDirectoryAsync:async()=>{if(setup)await setup;},deleteAsync:async uri=>{files.delete(uri);},createDownloadResumable:(url,uri,options,cb)=>({downloadAsync:()=>{downloads++;files.add(uri);progress=cb;return new Promise(resolve=>finishDownload=resolve);},pauseAsync:async()=>{cancelled++;finishDownload(undefined);}})};
 const source=ts.transpileModule(fs.readFileSync(require.resolve('../src/services/appUpdates.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const mocks={'react-native':{NativeModules:{WavePlayUpdates:native},Platform:{OS:'android'}},'expo-file-system/legacy':filesystem,'@react-native-async-storage/async-storage':{getItem:async key=>storage.get(key)??null,setItem:async(key,value)=>{storage.set(key,value);}},'../utils/appRelease':require('../src/utils/appRelease.ts')};
 vm.runInNewContext(source,{exports:module.exports,require:name=>mocks[name],process:{env:{EXPO_PUBLIC_SUPABASE_URL:'https://tu-proyecto.supabase.co'}},AbortController,URL,setTimeout,clearTimeout,fetch:async()=>{fetches++;return {ok:true,status:200,text:async()=>JSON.stringify(release)};}});
 return {api:module.exports,counts:()=>({fetches,downloads,verifies,installs,permissions,cancelled}),progress:()=>progress({totalBytesWritten:50}),finish:()=>finishDownload({status:200}),files};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('checks are deduplicated and automatic checks skip development builds',async()=>{
 const f=fixture();await Promise.all([f.api.checkAppUpdate(),f.api.checkAppUpdate()]);assert.equal(f.counts().fetches,1);
 await f.api.checkAppUpdate(true);assert.equal(f.counts().fetches,1);
 const dev=fixture({development:true});await dev.api.checkAppUpdate(true);assert.equal(dev.counts().fetches,0);
});
test('download verifies before readiness; permission return retains the verified update',async()=>{
 const f=fixture({allow:false});await f.api.checkAppUpdate();const download=f.api.downloadAppUpdate();await tick();
 f.progress();assert.equal(f.api.getAppUpdate().progress,.5);assert.equal(f.counts().verifies,0);
 f.finish();await download;assert.equal(f.api.getAppUpdate().status,'ready');assert.equal(f.counts().verifies,1);
 await f.api.installAppUpdate();assert.equal(f.counts().permissions,1);assert.equal(f.counts().installs,0);
 await f.api.installAppUpdate();assert.equal(f.counts().installs,1);
});
test('cancelled downloads cannot publish readiness and remove the partial APK',async()=>{
 const f=fixture();await f.api.checkAppUpdate();const download=f.api.downloadAppUpdate();await tick();
 await f.api.cancelAppUpdate();await download;assert.equal(f.api.getAppUpdate().status,'available');assert.equal(f.counts().verifies,0);assert.equal(f.files.size,0);
});
test('failed verification removes the download and never opens the installer',async()=>{
 const f=fixture({verifyError:true});await f.api.checkAppUpdate();const download=f.api.downloadAppUpdate();await tick();f.finish();await download;
 assert.equal(f.api.getAppUpdate().status,'error');assert.equal(f.files.size,0);await f.api.installAppUpdate();assert.equal(f.counts().installs,0);
});

test('cancelling during directory setup waits for the old operation before enabling another download',async()=>{
 let finishSetup;const setup=new Promise(resolve=>finishSetup=resolve),f=fixture({setup});
 await f.api.checkAppUpdate();const download=f.api.downloadAppUpdate();const cancel=f.api.cancelAppUpdate();
 assert.equal(f.api.getAppUpdate().status,'downloading');assert.equal(f.counts().downloads,0);
 finishSetup();await Promise.all([download,cancel]);
 assert.equal(f.counts().downloads,0);assert.equal(f.api.getAppUpdate().status,'available');
});

test('deferring a popup remembers its displayed version, not a newer detected release',async()=>{
 const f=fixture();await f.api.checkAppUpdate();await f.api.dismissAppUpdate(1);assert.equal(Boolean(await f.api.shouldNotifyUpdate()),true);
 await f.api.dismissAppUpdate(2);assert.equal(Boolean(await f.api.shouldNotifyUpdate()),false);
});

const test=require('node:test'),assert=require('node:assert/strict');
const {parseAppRelease,isNewRelease}=require('../src/utils/appRelease.ts');
const base='https://tu-proyecto.supabase.co';
const release={versionCode:2,versionName:'1.1.0',apkUrl:base+'/storage/v1/object/public/waveplay-updates/android/2.apk',sha256:'a'.repeat(64),size:100,minSdk:26,notes:'Mejoras'};
test('release catalog accepts only complete releases from the configured storage or EAS',()=>{
 assert.deepEqual(parseAppRelease(release,base),release);
 assert.equal(parseAppRelease(null,base),null);
 for(const changed of [{apkUrl:'http://expo.dev/artifacts/eas/a.apk'},{apkUrl:'https://other.supabase.co/storage/v1/object/public/waveplay-updates/a.apk'},{apkUrl:'https://expo.dev.example.org/artifacts/eas/a.apk'},{apkUrl:'https://user@expo.dev/artifacts/eas/a.apk'},{apkUrl:base+'/storage/v1/object/public/other/a.apk'},{sha256:'bad'},{size:0},{size:1.1},{versionCode:1.2},{minSdk:'26'}])assert.throws(()=>parseAppRelease({...release,...changed},base));
 assert.ok(parseAppRelease({...release,apkUrl:'https://expo.dev/artifacts/eas/a.apk'},base));
});
test('updater never offers a downgrade or an unsupported Android release',()=>{
 assert.equal(isNewRelease(release,{versionCode:1,sdk:26}),true);
 assert.equal(isNewRelease(release,{versionCode:2,sdk:36}),false);
 assert.equal(isNewRelease(release,{versionCode:3,sdk:36}),false);
 assert.equal(isNewRelease(release,{versionCode:1,sdk:25}),false);
});

const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
async function cleanup({storageFail=false,busy=false}={}){
 let handler;const calls=[];
 const client={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='authorize_room_audio_cleanup'?true:name==='claim_room_cleanup'?!busy:[],error:null};},
 storage:{from:()=>({remove:async paths=>{calls.push(['storage',paths]);return {error:storageFail?new Error('Temporary storage failure'):null};}})},
 from:table=>{
  let deleting=false;const query={select(){return query;},eq(){return query;},or(){return query;},limit(){return query;},delete(){deleting=true;return query;},in(){return query;},then(resolve,reject){
   calls.push([deleting?'delete':'read',table]);return Promise.resolve({data:deleting?null:table==='listening_rooms'?[{id:'closed-room'}]:[{id:'song',object_path:'closed-room/song.audio',source:'file'}],error:null}).then(resolve,reject);
  }};return query;
 }};
 const source=ts.transpileModule(fs.readFileSync('supabase/functions/room-audio-cleanup/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const context={exports:{},require:()=>({createClient:()=>client}),Deno:{env:{get:()=>''},serve:value=>{handler=value;}},console:{info:()=>{},error:()=>{}},Response,Date};
 vm.runInNewContext(source,context);const response=await handler(new Request('https://example.com',{method:'POST',headers:{'x-cleanup-secret':'test'}}));return {response,calls};
}
test('cleanup removes Storage audio before queue metadata and releases its lease',async()=>{
 const {response,calls}=await cleanup();assert.equal(response.status,200);
 assert.ok(calls.findIndex(c=>c[0]==='storage')<calls.findIndex(c=>c[0]==='delete'));
 assert.ok(calls.some(c=>c[0]==='claim_room_cleanup'&&c[1]?.release_lease===true));
});
test('Storage failure retains metadata for retry and releases the cleanup lease',async()=>{
 const {response,calls}=await cleanup({storageFail:true});assert.equal(response.status,500);
 assert.equal(calls.some(c=>c[0]==='delete'),false);assert.ok(calls.some(c=>c[1]?.release_lease===true));
});
test('concurrent cleanup skips work while another lease is active',async()=>{
 const {response,calls}=await cleanup({busy:true});assert.equal(response.status,200);assert.deepEqual(await response.json(),{skipped:true});assert.equal(calls.some(c=>c[0]==='storage'||c[0]==='delete'),false);
});

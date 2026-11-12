const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('room cache pruning deletes only retired cache files and protects active audio',async()=>{
  const room='00000000-0000-4000-8000-000000000001';
  const retired='00000000-0000-4000-8000-000000000002';
  const current='00000000-0000-4000-8000-000000000003';
  const next='00000000-0000-4000-8000-000000000004';
  const deleted=[];
  const source=ts.transpileModule(fs.readFileSync(require.resolve('../src/services/roomAudio.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(source,{exports,require:name=>name==='expo-file-system/legacy'?{
    cacheDirectory:'file:///cache/',getInfoAsync:async()=>({exists:true}),
    readDirectoryAsync:async()=>[retired+'.mp3',current+'.mp3',next+'.mp3','../../original.mp3','upload-original'],
    deleteAsync:async uri=>{deleted.push(uri);},
  }:name==='./account'?{accountClient:null}:(()=>{throw Error(name);})()});
  await exports.pruneRoomAudioCache(room,new Set([next]),id=>id===current);
  assert.deepEqual(deleted,['file:///cache/room-audio/'+room+'/'+retired+'.mp3']);
  await exports.pruneRoomAudioCache('../music',new Set());assert.equal(deleted.length,1);
});

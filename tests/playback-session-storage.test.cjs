const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),ts=require('typescript');
function databaseFixture(){
 let committed={queue:['old'],payload:'old'},fail=false,rootWrites=0,transactions=0;
 const conn={withExclusiveTransactionAsync:async task=>{
  transactions++;const work=structuredClone(committed);
  await task({runAsync:async(sql,...args)=>{
   if(sql==='DELETE FROM queue')work.queue=[];
   else if(sql.startsWith('INSERT INTO queue'))for(let i=0;i<args.length;i+=2)work.queue[args[i]]=args[i+1];
   else if(sql.startsWith('INSERT INTO playback_session')){if(fail)throw new Error('disk');work.payload=args[0];}
  }});committed=work;
 },runAsync:async()=>{rootWrites++;throw new Error('write outside transaction');}};
 const module={exports:{}};
 const source=ts.transpileModule(fs.readFileSync(require.resolve('../src/services/database.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const mocks={'expo-sqlite':{openDatabaseAsync:async()=>conn},'./performance':{performanceStart:()=>()=>{}},'../utils/serialQueue':require('../src/utils/serialQueue.ts')};
 vm.runInNewContext(source,{exports:module.exports,require:name=>name==='../utils/listeningStats'?require('../src/utils/listeningStats.ts'):mocks[name]||{},Proxy,Reflect,Date,Map,Set,Promise});
 return {api:module.exports,read:()=>committed,fail:()=>{fail=true;},stats:()=>({rootWrites,transactions})};
}
test('queue and playback checkpoint are committed atomically, including queue batches',async()=>{
 const f=databaseFixture(),session={queueIds:Array.from({length:250},(_,i)=>String(i)),trackId:'200',positionSeconds:85};
 await f.api.savePlaybackSession(session,true);assert.deepEqual(f.read().queue,session.queueIds);assert.equal(JSON.parse(f.read().payload).trackId,'200');assert.equal(f.stats().rootWrites,0);assert.equal(f.stats().transactions,1);
});
test('a failed checkpoint rolls back queue replacement; progress-only writes retain the queue',async()=>{
 const f=databaseFixture();await f.api.savePlaybackSession({queueIds:['new'],positionSeconds:50},false);assert.deepEqual(f.read().queue,['old']);
 const previous=structuredClone(f.read());f.fail();await assert.rejects(f.api.savePlaybackSession({queueIds:['new']},true),/disk/);assert.deepEqual(f.read(),previous);
});

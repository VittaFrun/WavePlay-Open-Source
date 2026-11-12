const test=require('node:test'),assert=require('node:assert/strict');
const {createPlaylistOrderWriter}=require('../src/utils/playlistOrderWriter.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('rapid drops coalesce behind the active save and retain the latest order',async()=>{
 const writes=[],pending=[],failed=[],busy=[];
 const writer=createPlaylistOrderWriter(value=>{writes.push(value);return new Promise(resolve=>pending.push(resolve));},value=>failed.push(value),value=>busy.push(value));
 writer.submit('first','original');await tick();writer.submit('second','first');writer.submit('latest','second');
 assert.deepEqual(writes,['first']);assert.equal(writer.isBusy(),true);
 pending.shift()();await tick();assert.deepEqual(writes,['first','latest']);pending.shift()();await writer.flush();
 assert.equal(writer.isBusy(),false);assert.deepEqual(failed,[]);assert.deepEqual(busy,[true,false]);
});
test('an obsolete failure does not roll back a newer drag; final failure restores last committed order',async()=>{
 const pending=[],rollbacks=[];
 const writer=createPlaylistOrderWriter(value=>new Promise((resolve,reject)=>pending.push({value,resolve,reject})),(value,error)=>rollbacks.push([value,error.message]));
 writer.submit('first','original');await tick();writer.submit('newer','first');pending.shift().reject(Error('locked'));await tick();
 assert.deepEqual(rollbacks,[]);assert.equal(pending[0].value,'newer');pending.shift().resolve();await writer.flush();
 writer.submit('last','newer');await tick();pending.shift().reject(Error('disk full'));await writer.flush();assert.deepEqual(rollbacks,[['newer','disk full']]);
});
test('navigation finishes saving but suppresses callbacks to an unmounted screen',async()=>{
 let reject,rollbacks=0;
 const writer=createPlaylistOrderWriter(()=>new Promise((_,r)=>reject=r),()=>rollbacks++);
 writer.submit('new','old');await tick();writer.dispose();reject(Error('unavailable'));await writer.flush();assert.equal(rollbacks,0);
 writer.activate();writer.submit('next','old');await tick();reject(Error('unavailable'));await writer.flush();assert.equal(rollbacks,1);
});

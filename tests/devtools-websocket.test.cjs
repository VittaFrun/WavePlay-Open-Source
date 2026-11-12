const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),http=require('node:http');
const {once}=require('node:events'),{execFileSync}=require('node:child_process');
const expoRoot=path.dirname(require.resolve('expo/package.json'));
const cliRoot=path.dirname(require.resolve('@expo/cli/package.json',{paths:[expoRoot]}));
const filename=path.join(cliRoot,'build/src/start/server/metro/debugging/createDebugMiddleware.js');
const ws=require(require.resolve('ws',{paths:[cliRoot]}));

test('development network inspector skips compression but relays messages across reconnects',async()=>{
 execFileSync(process.execPath,['scripts/patch-expo-devtools.cjs']);
 const source=fs.readFileSync(filename,'utf8');execFileSync(process.execPath,['scripts/patch-expo-devtools.cjs']);assert.equal(fs.readFileSync(filename,'utf8'),source);
 const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true);
 const definition=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='createNetworkWebsocket');assert.ok(definition);
 const received=[],bodies=[];
 const create=vm.runInNewContext('('+definition.getText(ast)+')',{_ws:()=>ws,debug:()=>{},_NetworkResponse:{recordNetworkResponse:(...args)=>bodies.push(args)}});
 const network=create({clients:[{readyState:1,OPEN:1,send:value=>received.push(JSON.parse(value))}]});
 const server=http.createServer();server.on('upgrade',(request,socket,head)=>network.handleUpgrade(request,socket,head,client=>network.emit('connection',client,request)));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  for(let index=0;index<3;index++){
   const client=new ws.WebSocket('ws://127.0.0.1:'+server.address().port,{perMessageDeflate:true});await once(client,'open');assert.equal(client.extensions,'');
   const delivered=once([...network.clients][0],'message');client.send(JSON.stringify({method:'Network.requestWillBeSent',params:{requestId:String(index)}}));await delivered;
   client.close();await once(client,'close');
  }
  assert.equal(received.length,3);assert.equal(received[2].params.requestId,'2');assert.equal(network.options.maxPayload,16*1024*1024);
 } finally {for(const client of network.clients)client.terminate();await new Promise(resolve=>network.close(resolve));await new Promise(resolve=>server.close(resolve));}
});

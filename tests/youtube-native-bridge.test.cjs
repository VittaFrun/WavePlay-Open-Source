const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

test('persistent browser uses native transport, pauses on interruptions and retains room revision', async () => {
  const { roomYouTubeHtml } = await import('../src/utils/roomYouTubeHtml.ts');
  const html = roomYouTubeHtml('abcdefghijk', 'room-item', true);
  let state = 2, position = 0, options;
  const messages = [];
  const player = { getPlayerState: () => state, getCurrentTime: () => position,
    seekTo: value => { position = value; }, playVideo: () => { state = 1; }, pauseVideo: () => { state = 2; } };
  const context = { window: { WavePlayRoomBridge: { postMessage: raw => messages.push(JSON.parse(raw)) } },
    setInterval: () => {}, YT: { Player: function (_, value) { options = value; return player; } } };
  vm.createContext(context); vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  context.onYouTubeIframeAPIReady(); options.events.onReady();
  context.window.applyRoom({ position: 12, playing: true, revision: 8 });
  assert.equal(state, 1); assert.equal(position, 12);
  context.window.pauseLocal(); assert.equal(state, 2);
  context.window.applyRoom({ position: 15, playing: true, revision: 9 });
  assert.equal(state, 1); assert.equal(position, 15);
  options.events.onStateChange({ data: 0 });
  assert.deepEqual(messages.at(-1), { type: 'ended', id: 'room-item', revision: 9 });
});

test('video changes reuse one iframe and expose only the new item and revision',async()=>{
 const {roomYouTubeHtml}=await import('../src/utils/roomYouTubeHtml.ts');
 let state=2,position=0,options,created=0,video;const events=[];
 const player={getPlayerState:()=>state,getCurrentTime:()=>position,seekTo:p=>{position=p;},playVideo:()=>{state=1;},pauseVideo:()=>{state=2;},cueVideoById:id=>{video=id;position=0;state=5;}};
 const context={window:{WavePlayRoomBridge:{postMessage:raw=>events.push(JSON.parse(raw))}},setInterval:()=>{},YT:{Player:function(_,o){created++;options=o;return player;}}};
 vm.createContext(context);vm.runInContext(roomYouTubeHtml('abcdefghijk','first',true).match(/<script>([\s\S]*?)<\/script>/)[1],context);
 context.onYouTubeIframeAPIReady();options.events.onReady();context.window.applyRoom({position:8,playing:true,revision:1});
 context.window.changeRoomVideo('lmnopqrstuv','second');context.window.applyRoom({position:0,playing:true,revision:2});
 options.events.onStateChange({data:0});assert.equal(created,1);assert.equal(video,'lmnopqrstuv');assert.deepEqual(events.at(-1),{type:'ended',id:'second',revision:2});
});
test('gradual YouTube drift needs two samples and buffering resets the sample gate',async()=>{
 const {roomYouTubeHtml}=await import('../src/utils/roomYouTubeHtml.ts');
 let state=1,position=0,options;const seeks=[];
 const player={getPlayerState:()=>state,getCurrentTime:()=>position,seekTo:p=>{seeks.push(p);position=p;},playVideo:()=>{state=1;},pauseVideo:()=>{state=2;}};
 const context={window:{WavePlayRoomBridge:{postMessage:()=>{}}},setInterval:()=>{},YT:{Player:function(_,o){options=o;return player;}}};
 vm.createContext(context);vm.runInContext(roomYouTubeHtml('abcdefghijk','first',true).match(/<script>([\s\S]*?)<\/script>/)[1],context);
 context.onYouTubeIframeAPIReady();options.events.onReady();context.window.applyRoom({position:0,playing:true,revision:1});
 context.window.applyRoom({position:4,playing:true,revision:1});assert.equal(seeks.length,0);
 state=3;context.window.applyRoom({position:4,playing:true,revision:1});state=1;
 context.window.applyRoom({position:4,playing:true,revision:1});assert.equal(seeks.length,0);
 context.window.applyRoom({position:4,playing:true,revision:1});assert.deepEqual(seeks,[4]);
});

test('explicit short seeks are immediate and a command survives buffering',async()=>{
 const {roomYouTubeHtml}=await import('../src/utils/roomYouTubeHtml.ts');
 let state=1,position=0,options;const seeks=[];
 const player={getPlayerState:()=>state,getCurrentTime:()=>position,seekTo:p=>{seeks.push(p);position=p;},playVideo:()=>{state=1;},pauseVideo:()=>{state=2;}};
 const context={window:{WavePlayRoomBridge:{postMessage:()=>{}}},setInterval:()=>{},YT:{Player:function(_,o){options=o;return player;}}};
 vm.createContext(context);vm.runInContext(roomYouTubeHtml('abcdefghijk','first',true).match(/<script>([\s\S]*?)<\/script>/)[1],context);
 context.onYouTubeIframeAPIReady();options.events.onReady();context.window.applyRoom({position:0,playing:true,revision:1});
 context.window.applyRoom({position:1,playing:true,revision:2});assert.deepEqual(seeks,[1]);
 state=3;context.window.applyRoom({position:10,playing:true,revision:3});assert.equal(seeks.length,1);
 state=1;options.events.onStateChange({data:1});assert.equal(seeks.length,2);assert.ok(seeks[1]>=10&&seeks[1]<11);
});

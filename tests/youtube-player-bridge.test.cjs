const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

test('visible YouTube bridge applies room commands without seeking during buffering and tags completion revisions', async () => {
  const { roomYouTubeHtml } = await import('../src/utils/roomYouTubeHtml.ts');
  const html = roomYouTubeHtml('abcdefghijk', 'queue-test');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const events = [], seeks = [];
  let state = 2, position = 0, options;
  const player = { getPlayerState: () => state, getCurrentTime: () => position,
    seekTo: value => { seeks.push(value); position = value; },
    playVideo: () => { state = 1; }, pauseVideo: () => { state = 2; } };
  const context = { window: { ReactNativeWebView: { postMessage: value => events.push(JSON.parse(value)) } },
    setInterval: () => {}, YT: { Player: function (_, value) { options = value; return player; } } };
  vm.createContext(context); vm.runInContext(script, context);
  context.onYouTubeIframeAPIReady(); options.events.onReady();
  context.window.applyRoom({ position: 30, playing: true, revision: 4 });
  assert.deepEqual(seeks, [30]); assert.equal(state, 1);
  context.window.applyRoom({ position: 31, playing: true, revision: 5 });
  assert.deepEqual(seeks, [30,31]);
  state = 3;
  context.window.applyRoom({ position: 70, playing: true, revision: 6 });
  assert.equal(seeks.length, 2); assert.equal(state, 3);
  context.window.applyRoom({ position: 30, playing: false, revision: 7 });
  assert.equal(state, 2);
  options.events.onStateChange({ data: 0 });
  assert.deepEqual(events.at(-1), { type: 'ended', id: 'queue-test', revision: 7 });
});

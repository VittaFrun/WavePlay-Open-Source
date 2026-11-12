const test=require('node:test');
const assert=require('node:assert/strict');
const {youtubeVideoId,youtubeTarget,youtubeError,canControlRoom}=require('../src/utils/roomYouTube.ts');

test('room links accept supported YouTube URLs without accepting lookalike hosts or injected identifiers',()=>{
  for(const link of ['dQw4w9WgXcQ','https://youtu.be/dQw4w9WgXcQ?t=20','https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=test','https://music.youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com/shorts/dQw4w9WgXcQ'])assert.equal(youtubeVideoId(link),'dQw4w9WgXcQ');
  for(const link of ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://evil.test/youtube/dQw4w9WgXcQ','javascript:alert(1)','https://youtu.be/dQw4w9WgXcQ/extra','https://youtube.com/watch?v=<script>','short'])assert.equal(youtubeVideoId(link),null);
});
test('YouTube synchronization projects server time and clamps paused, future and completed videos',()=>{
  const now=Date.parse('2026-10-07T14:00:00Z');
  const state={revision:4,playing:true,positionSeconds:40,updatedAt:new Date(now).toISOString()};
  assert.deepEqual(youtubeTarget(state,180,now+3000),{position:43,playing:true,revision:4});
  assert.equal(youtubeTarget({...state,playing:false},180,now+3000).position,40);
  assert.equal(youtubeTarget(state,42,now+3000).position,42);
  assert.equal(youtubeTarget(state,180,now-3000).position,40);
});
test('room controls default to the host and reflect explicit collaboration',()=>{
  const room={hostUserId:'host'};
  assert.equal(canControlRoom(room,'host'),true);
  assert.equal(canControlRoom(room,'guest'),false);
  assert.equal(canControlRoom({...room,controlMode:'collaborative'},'guest'),true);
  assert.equal(canControlRoom({...room,controlMode:'collaborative'},undefined),false);
  assert.match(youtubeError(150),/no permite/);
  assert.match(youtubeError(100),/privado/);
});

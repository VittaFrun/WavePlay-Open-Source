const test=require('node:test');
const assert=require('node:assert/strict');
const player=require('../src/services/soloYouTube.ts');
const video={id:'dQw4w9WgXcQ',title:'Music',channel:'Artist',duration:180,thumbnail:'',publishedAt:''};
test('individual playback retains a stable session and rejects invalid video ids',()=>{
 player.stopSoloYouTube();player.startSoloYouTube({...video,id:'invalid'});
 assert.equal(player.getSoloYouTube().video,null);
 player.startSoloYouTube(video);const state=player.getSoloYouTube();
 player.startSoloYouTube(video);assert.equal(player.getSoloYouTube(),state);
 assert.equal(state.playing,true);
});
test('progress does not rerender controls or create playback commands',()=>{
 const status=player.getSoloYouTubeStatus(),revision=player.getSoloYouTube().revision;
 player.reportSoloYouTube({position:12});
 assert.equal(player.getSoloYouTubeStatus(),status);
 assert.equal(player.getSoloYouTube().position,12);
 assert.equal(player.getSoloYouTube().revision,revision);
 player.commandSoloYouTube(false);
 assert.ok(player.getSoloYouTube().position>=12&&player.getSoloYouTube().position<13);
 assert.equal(player.getSoloYouTube().playing,false);
 assert.equal(player.getSoloYouTube().revision,revision+1);
});
test('seek bounds, interruption recovery and stopping preserve a coherent session',()=>{
 player.commandSoloYouTube(true,1000);assert.equal(player.getSoloYouTube().position,180);
 player.reportSoloYouTube({interrupted:true});assert.equal(player.getSoloYouTubeStatus().interrupted,true);
 player.commandSoloYouTube(true,0);assert.equal(player.getSoloYouTube().interrupted,false);
 const state=player.getSoloYouTube();player.commandSoloYouTube(true,NaN);assert.equal(player.getSoloYouTube(),state);
 player.stopSoloYouTube();player.reportSoloYouTube({position:45});
 assert.equal(player.getSoloYouTube().video,null);assert.equal(player.getSoloYouTube().playing,false);
});

test('YouTube queue advances independently, removes upcoming entries and clears on stop',()=>{
 player.stopSoloYouTube();player.startSoloYouTube(video);
 const second={...video,id:'abcdefghijk',title:'Second'},third={...video,id:'lmnopqrstuv',title:'Third'};
 assert.equal(player.enqueueSoloYouTube(second),true);assert.equal(player.enqueueSoloYouTube(second),false);
 assert.equal(player.enqueueSoloYouTube({...video,id:'invalid'}),false);
 player.enqueueSoloYouTube(third);player.removeSoloYouTube(video.id);
 assert.equal(player.getSoloYouTube().queue.length,3);
 player.nextSoloYouTube();assert.equal(player.getSoloYouTube().video.id,second.id);
 player.commandSoloYouTube(true,2);player.previousSoloYouTube();assert.equal(player.getSoloYouTube().video.id,video.id);
 player.removeSoloYouTube(second.id);player.nextSoloYouTube();assert.equal(player.getSoloYouTube().video.id,third.id);
 player.nextSoloYouTube();assert.equal(player.getSoloYouTube().playing,false);
 player.stopSoloYouTube();assert.deepEqual(player.getSoloYouTube().queue,[]);assert.equal(player.getSoloYouTube().index,-1);
});

test('adding an upcoming video keeps the current playback command and progress intact',()=>{
 player.startSoloYouTube(video);player.reportSoloYouTube({position:42});
 const state=player.getSoloYouTube();player.enqueueSoloYouTube({...video,id:'abcdefghijk'});
 assert.equal(player.getSoloYouTube().revision,state.revision);assert.equal(player.getSoloYouTube().position,42);
 assert.equal(player.getSoloYouTube().video,state.video);
 player.stopSoloYouTube();
});

test('a finished last song replays from the beginning and search selection resumes a paused song',()=>{
 player.startSoloYouTube(video);player.nextSoloYouTube();
 assert.equal(player.getSoloYouTube().position,video.duration);
 player.commandSoloYouTube(true);
 assert.equal(player.getSoloYouTube().position,0);assert.equal(player.getSoloYouTube().playing,true);
 player.commandSoloYouTube(false,30);player.startSoloYouTube(video);
 assert.equal(player.getSoloYouTube().playing,true);assert.ok(player.getSoloYouTube().position>=30);
 player.stopSoloYouTube();
});

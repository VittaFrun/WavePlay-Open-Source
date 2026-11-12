const test=require('node:test'),assert=require('node:assert/strict');
const {validateAudioStream,createAudioStreamResolver}=require('../src/utils/audioStream.ts');
const source=(suffix='a')=>({url:'https://rr1.googlevideo.com/videoplayback?id='+suffix,headers:{'User-Agent':'WavePlay','Cookie':'private','Referer':'https://www.youtube.com/','X-Bad':'x'}});
test('temporary sources accept only media URLs and safe headers, and reject expired links',()=>{
 const s=validateAudioStream(source(),1000);assert.equal(s.expiresAt,601000);assert.equal(s.headers.Cookie,undefined);assert.equal(s.headers['User-Agent'],'WavePlay');
 for(const url of ['http://rr1.googlevideo.com/a','https://googlevideo.com.evil.test/a','https://user:pass@rr1.googlevideo.com/a','https://youtube.com/watch?v=x'])assert.throws(()=>validateAudioStream({url}));
 assert.throws(()=>validateAudioStream({url:'https://rr1.googlevideo.com/a?expire=1'},100000));
 assert.equal(validateAudioStream({url:source().url,headers:{Origin:'bad\r\nvalue'}}).headers.Origin,undefined);
});
test('concurrent extraction is shared and stale resolutions cannot take over a new song',async()=>{
 const pending=[],cancelled=[];const resolver=createAudioStreamResolver((id,job)=>new Promise(resolve=>pending.push({id,job,resolve})),job=>cancelled.push(job),()=>1000);
 const first=resolver.run('abcdefghijk');assert.equal(first,resolver.run('abcdefghijk'));
 const second=resolver.run('lmnopqrstuv');assert.equal(cancelled.length,1);pending[0].resolve(source('old'));assert.equal(await first,null);
 pending[1].resolve(source('new'));assert.match((await second).uri,/new/);assert.equal(pending.length,2);
 await resolver.run('lmnopqrstuv');assert.equal(pending.length,2);
 resolver.evict('lmnopqrstuv');const third=resolver.run('lmnopqrstuv');assert.equal(pending.length,3);resolver.invalidate();pending[2].resolve(source('cancelled'));assert.equal(await third,null);
});
test('failed extraction can retry and cached links expire without persisting them',async()=>{
 let time=1000,calls=0;const resolver=createAudioStreamResolver(async()=>{calls++;if(calls===1)throw Error('network');return source();},()=>{},()=>time);
 await assert.rejects(resolver.run('abcdefghijk'),/network/);await resolver.run('abcdefghijk');assert.equal(calls,2);time+=600001;await resolver.run('abcdefghijk');assert.equal(calls,3);
});
test('only embedding restrictions request audio; network errors retain the normal failure path',()=>{
 const solo=require('../src/services/soloYouTube.ts');let fallbacks=0,failures=0;
 solo.stopSoloYouTube();solo.startSoloYouTube({id:'abcdefghijk',title:'Song',channel:'Artist',duration:180,thumbnail:'',publishedAt:''});
 const release=solo.setSoloNavigation({next(){},previous(){},failed(){failures++;},fallback(code){fallbacks++;return code===101||code===150;}});
 solo.handleSoloYouTubeError(101,'blocked');assert.equal(fallbacks,1);assert.equal(failures,0);
 solo.handleSoloYouTubeError(150,'blocked');assert.equal(fallbacks,2);assert.equal(failures,0);
 solo.handleSoloYouTubeError(5,'network');assert.equal(fallbacks,2);assert.equal(failures,1);assert.equal(solo.getSoloYouTube().playing,false);
 release();solo.stopSoloYouTube();
});

test('embed restrictions before ready remain visible while obsolete progress is rejected',()=>{
 const {parseYouTubeEvent}=require('../src/utils/youtubeEvent.ts');
 const event={type:'error',id:'solo:abcdefghijk',revision:null,code:150};assert.equal(parseYouTubeEvent(JSON.stringify(event)).revision,-1);
 assert.equal(parseYouTubeEvent(JSON.stringify({...event,type:'progress'})),null);
 assert.equal(parseYouTubeEvent(JSON.stringify({...event,code:5})),null);
 assert.equal(parseYouTubeEvent(JSON.stringify({...event,revision:'bad'})),null);
 assert.equal(parseYouTubeEvent('broken'),null);
 assert.equal(parseYouTubeEvent(JSON.stringify({...event,revision:4})).revision,4);
});

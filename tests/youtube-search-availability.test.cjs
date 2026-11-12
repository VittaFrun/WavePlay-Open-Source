const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('YouTube searches request insertable videos and reject blocked detail results',async()=>{
 const urls=[],exports={};
 const source=ts.transpileModule(fs.readFileSync('src/services/youtube.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const snippet={title:'Music',channelTitle:'Artist',thumbnails:{medium:{url:'https://example.com/image'}},publishedAt:''};
 const fetch=async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('/search?')?{items:[{id:{videoId:'allowed'},snippet},{id:{videoId:'blocked'},snippet}]}:{items:[{id:'allowed',contentDetails:{duration:'PT3M'},status:{embeddable:true}},{id:'blocked',contentDetails:{duration:'PT3M'},status:{embeddable:false}}]}};};
 vm.runInNewContext(source,{exports,require:()=>require('../src/utils/requestTimeout.ts'),process:{env:{EXPO_PUBLIC_YOUTUBE_API_KEY:'test'}},fetch,URLSearchParams});
 const items=await exports.searchYouTubeMusic('Music',undefined,true);
 assert.equal(new URL(urls[0]).searchParams.get('videoEmbeddable'),'true');
 assert.equal(items.length,1);assert.equal(items[0].id,'allowed');assert.equal(items[0].duration,180);
 await exports.searchYouTubeMusic('Music',undefined,true);assert.equal(urls.length,2);
 const all=await exports.searchYouTubeMusic('Music');
 assert.equal(new URL(urls[2]).searchParams.has('videoEmbeddable'),false);
 assert.equal(all.length,2);
 await exports.searchYouTubeMusic('Music');assert.equal(urls.length,4);
});

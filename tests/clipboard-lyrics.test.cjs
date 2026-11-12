const {test}=require('node:test');
const assert=require('node:assert/strict');
const {looksLikeLyricsText}=require('../src/utils/clipboardLyrics.ts');
test('offers lyric import for copied verses or LRC, not links or brief text',()=>{
 assert.equal(looksLikeLyricsText('[00:12.30] I hear the waves tonight'),true);
 assert.equal(looksLikeLyricsText('This is the first verse\nThis is the second verse\nAnd then the chorus'),true);
 assert.equal(looksLikeLyricsText('https://lyrics.example/song'),false);
 assert.equal(looksLikeLyricsText('hello'),false);
});

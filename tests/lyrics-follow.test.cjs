const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseLyrics,lyricAt}=require('../src/utils/lyrics.ts');

test('LRC metadata is excluded and repeated timestamps are sorted',()=>{
 const lines=parseLyrics('[ar:Artist]\n[ti:Song]\n[00:20.50][00:10.25]Repeat\n[00:00.00]Start');
 assert.deepEqual(lines,[{time:0,text:'Start'},{time:10.25,text:'Repeat'},{time:20.5,text:'Repeat'}]);
});
test('follow selects exact timestamps and handles forward and backward seeks',()=>{
 const lines=parseLyrics('[00:02]First\n[00:04]Next\n[00:10]Last');
 assert.equal(lyricAt(lines,0),-1);
 assert.equal(lyricAt(lines,3.99),0);
 assert.equal(lyricAt(lines,4),1);
 assert.equal(lyricAt(lines,20),2);
 assert.equal(lyricAt(lines,2),0);
});
test('untimed lyrics remain readable without invented synchronization',()=>{
 const lines=parseLyrics('First line\n\nSecond line');
 assert.deepEqual(lines,[{text:'First line'},{text:'Second line'}]);
 assert.equal(lyricAt(lines,900),-1);
});
test('LRC offsets are milliseconds and invalid seconds are ignored',()=>{
 const lines=parseLyrics('[offset:+500]\n[00:00.25]Start\n[00:10]Later\n[00:65]Invalid');
 assert.deepEqual(lines,[{time:0,text:'Start'},{time:9.5,text:'Later'}]);
 assert.deepEqual(parseLyrics('[offset:-500]\n[00:10]Later'),[{time:10.5,text:'Later'}]);
});

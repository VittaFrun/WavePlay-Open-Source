const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/playlistDrag.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject});
const {movePlaylistRow,playlistDragTarget,playlistDragScroll}=exportsObject;
test('drag preserves song references and ignores invalid or unchanged drops',()=>{
 const rows=[{id:'a'},{id:'b'},{id:'c'}];
 const next=movePlaylistRow(rows,0,2);
 assert.deepEqual(Array.from(next,x=>x.id),['b','c','a']);assert.equal(next[2],rows[0]);
 assert.deepEqual(rows.map(x=>x.id),['a','b','c']);
 for(const [from,to] of [[0,0],[-1,2],[0,3]])assert.equal(movePlaylistRow(rows,from,to),rows);
 assert.deepEqual(Array.from(movePlaylistRow(next,2,0),x=>x.id),['a','b','c']);
});
test('target accounts for list header and clamps both ends of a large playlist',()=>{
 assert.equal(playlistDragTarget(120+64*8+32,120,64,229),8);
 assert.equal(playlistDragTarget(-500,120,64,229),0);
 assert.equal(playlistDragTarget(99999,120,64,229),228);
});
test('edge scrolling is frame independent, bounded and idle away from edges',()=>{
 assert.equal(playlistDragScroll(500,2000,200,64,600,16),500);
 assert.ok(playlistDragScroll(500,2000,530,64,600,16)>500);
 assert.ok(playlistDragScroll(500,2000,0,64,600,16)<500);
 assert.equal(playlistDragScroll(0,2000,0,64,600,16),0);
 assert.equal(playlistDragScroll(2000,2000,580,64,600,16),2000);
 assert.equal(playlistDragScroll(500,2000,580,64,600,200),playlistDragScroll(500,2000,580,64,600,32));
 assert.equal(playlistDragScroll(500,2000,580,64,600,32)-500,2*(playlistDragScroll(500,2000,580,64,600,16)-500));
});
test('ordinary scrolling retains FlatList and gesture is restricted to the handle',()=>{
 const source=fs.readFileSync('src/components/PlaylistInteractiveList.tsx','utf8');
 assert.match(source,/<AnimatedList/);assert.doesNotMatch(source,/from 'react-native-reorderable-list'/);
 assert.match(source,/x>44/);assert.match(source,/rows.every/);assert.match(source,/onFinalize/);
 assert.match(source,/useFrameCallback/);assert.match(source,/scrollTo\(nativeRef/);
});

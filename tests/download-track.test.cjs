const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveDownloadTrack}=require('../src/utils/downloadTrack.ts');
test('download deletion resolves the saved asset and refuses recycled ids or ambiguous filenames',()=>{
  const a={id:'1',filename:'song.mp3'},b={id:'2',filename:'song.mp3'};
  assert.equal(resolveDownloadTrack({outputTrackId:'1',fileName:'song.mp3'},[a,b]),a);
  assert.equal(resolveDownloadTrack({outputTrackId:'1',fileName:'other.mp3'},[a,b]),null);
  assert.equal(resolveDownloadTrack({outputTrackId:'3',fileName:'song.mp3'},[a,b]),null);
  assert.equal(resolveDownloadTrack({fileName:'song.mp3'},[a,b]),null);
  assert.equal(resolveDownloadTrack({fileName:'song.mp3'},[a]),a);
});

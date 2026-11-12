const {test}=require('node:test');
const assert=require('node:assert/strict');
const {visibleDownloadProgress,downloadPersistenceKey}=require('../src/utils/downloadProgress.ts');

const item={id:'1',url:'https://example.com',title:'Song',progress:10,state:'downloading',createdAt:1};

test('download progress skips noisy updates but publishes stage changes',()=>{
  assert.equal(visibleDownloadProgress(item,11.9,'downloading'),null);
  assert.equal(visibleDownloadProgress(item,12.8,'downloading').progress,12);
  assert.equal(visibleDownloadProgress(item,7,'converting').state,'converting');
  assert.equal(visibleDownloadProgress(item,Infinity,'downloading'),null);
});

test('database key persists milestones and terminal metadata',()=>{
  assert.equal(downloadPersistenceKey({...item,progress:11}),downloadPersistenceKey(item));
  assert.notEqual(downloadPersistenceKey({...item,progress:15}),downloadPersistenceKey(item));
  assert.notEqual(downloadPersistenceKey({...item,state:'done',fileName:'Song.mp3'}),downloadPersistenceKey(item));
});

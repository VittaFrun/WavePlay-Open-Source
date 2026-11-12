const {test}=require('node:test');
const assert=require('node:assert/strict');
const {needsMetadataRefresh}=require('../src/utils/scan.ts');

const asset={uri:'content://audio/1',filename:'Song.mp3',duration:180,modificationTime:120,creationTime:100};
const previous={uri:asset.uri,filename:asset.filename,duration:asset.duration,modifiedAt:120};

test('routine scan skips stable audio and reads new or changed files',()=>{
  assert.equal(needsMetadataRefresh(asset,previous),false);
  assert.equal(needsMetadataRefresh(asset),true);
  assert.equal(needsMetadataRefresh({...asset,modificationTime:121},previous),true);
  assert.equal(needsMetadataRefresh({...asset,uri:'content://audio/2'},previous),true);
  assert.equal(needsMetadataRefresh({...asset,duration:181},previous),true);
});

test('full scan refreshes metadata and covers even when audio is unchanged',()=>{
  assert.equal(needsMetadataRefresh(asset,previous,true),true);
});

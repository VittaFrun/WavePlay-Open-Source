const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

test('audio postinstall is repeatable and configures local seek buffering independently of streaming',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'waveplay-audio-patch-'));
  const relative='android/src/main/java/expo/modules/audio';
  try{
    for(const name of ['service/AudioControlsService.kt','service/AudioMediaSessionCallback.kt','service/MetadataInjectingPlayer.kt','AudioPlayer.kt']){
      const target=path.join(folder,relative,name);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(path.join(__dirname,'../node_modules/expo-audio',relative,name),target);
    }
    const playerPath=path.join(folder,relative,'AudioPlayer.kt');
    let original=fs.readFileSync(playerPath,'utf8');
    const start=original.indexOf('    .apply {'),end=original.indexOf('    .build(),',start);
    original=original.slice(0,start)+'    .apply {\n      if (bufferDurationMs > 0) {}\n    }\n'+original.slice(end);
    fs.writeFileSync(playerPath,original);
    const run=()=>execFileSync(process.execPath,[path.join(__dirname,'../scripts/patch-expo-audio.cjs')],{env:{...process.env,WAVEPLAY_EXPO_AUDIO_ROOT:folder}});
    run();const once=fs.readFileSync(playerPath,'utf8');run();
    assert.equal(fs.readFileSync(playerPath,'utf8'),once);
    const callback=fs.readFileSync(path.join(folder,relative,'service/AudioMediaSessionCallback.kt'),'utf8');
    assert.doesNotMatch(callback,/remove\(Player.COMMAND_SEEK_TO_NEXT/);
    assert.match(callback,/add\(Player.COMMAND_SEEK_TO_NEXT/);
    const metadata=fs.readFileSync(path.join(folder,relative,'service/MetadataInjectingPlayer.kt'),'utf8');
    assert.match(metadata,/override fun seekToNextMediaItem\(\) \{ onWavePlayAction\("next"\)/);
    assert.match(metadata,/override fun seekToPrevious\(\) \{ onWavePlayAction\("previous"\)/);
    const service=fs.readFileSync(path.join(folder,relative,'service/AudioControlsService.kt'),'utf8');
    assert.match(service,/currentMetadata\?\.artworkUrl == expected && currentArtworkUrl == expected/);
    assert.match(service,/getInputStream\(\)\.use/);
    assert.ok(service.indexOf('postOrStartForegroundNotification(startInForeground = false)',service.indexOf('private fun refreshWavePlayArtwork'))<service.indexOf('if (expected != null) loadArtworkFromUrl'));
    run();assert.equal(fs.readFileSync(path.join(folder,relative,'service/AudioControlsService.kt'),'utf8'),service);
    assert.match(once,/setBufferDurationsMsForLocalPlayback/);
    assert.match(once,/setBufferDurationsMsForStreaming/);
    assert.match(once,/DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS/);
    assert.equal((once.match(/setLoadControl\(/g)||[]).length,1);
  }finally{
    if(path.dirname(folder)!==os.tmpdir()||!path.basename(folder).startsWith('waveplay-audio-patch-'))throw new Error('Invalid test directory');
    fs.rmSync(folder,{recursive:true,force:true});
  }
});

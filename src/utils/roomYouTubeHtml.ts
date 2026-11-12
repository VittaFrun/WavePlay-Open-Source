export function roomYouTubeHtml(id:string,itemId:string,native=false){
  const bridge=native?'WavePlayRoomBridge':'ReactNativeWebView';
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#101019;height:100%;overflow:hidden}#player{width:100%;height:100%}</style></head><body><div id="player"></div><script>
    var player,ready=false,revision=null,itemId=${JSON.stringify(itemId)},videoId=${JSON.stringify(id)},driftSamples=0,pendingCommand=false,lastTarget=null,lastAppliedAt=0;
    function send(type,extra){window.${bridge}.postMessage(JSON.stringify(Object.assign({type:type,id:itemId,revision:revision},extra||{})));}
    window.changeRoomVideo=function(nextId,nextItem){itemId=nextItem;videoId=nextId;revision=null;driftSamples=0;if(ready)player.cueVideoById(nextId);};
    window.pauseLocal=function(){if(ready)player.pauseVideo();};
    window.applyRoom=function(target){lastTarget=target;lastAppliedAt=Date.now();if(!ready){revision=target.revision;pendingCommand=true;return;}var state=player.getPlayerState();if(revision!==target.revision)pendingCommand=true;revision=target.revision;var drift=Math.abs(player.getCurrentTime()-target.position);if(state!==3&&drift>(pendingCommand?.05:1.5)){driftSamples++;if(pendingCommand||driftSamples>=2){player.seekTo(target.position,true);driftSamples=0;}}else driftSamples=0;if(state!==3)pendingCommand=false;if(target.playing){if(state!==1&&state!==3)player.playVideo();}else if(state!==2)player.pauseVideo();};
    function onYouTubeIframeAPIReady(){player=new YT.Player('player',{videoId:${JSON.stringify(id)},playerVars:{playsinline:1,origin:'https://waveplay.app'},events:{onReady:function(){ready=true;send('ready');},onError:function(e){send('error',{code:e.data});},onAutoplayBlocked:function(){send('blocked');},onStateChange:function(e){if(e.data===1&&pendingCommand&&lastTarget){window.applyRoom(Object.assign({},lastTarget,{position:lastTarget.position+(lastTarget.playing?(Date.now()-lastAppliedAt)/1000:0)}));}send('state',{state:e.data});if(e.data===0)send('ended');}}});}
    setInterval(function(){if(ready)send('progress',{position:player.getCurrentTime(),state:player.getPlayerState()});},1000);
    </script><script src="https://www.youtube.com/iframe_api"></script></body></html>`;
}

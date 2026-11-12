import { useCallback, useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { roomYouTubeHtml } from '../utils/roomYouTubeHtml';
import { commandSoloYouTube, handleSoloYouTubeError, failSoloYouTube, getSoloYouTube, nextSoloYouTube, reportSoloYouTube } from '../services/soloYouTube';
import { useSoloYouTube } from '../hooks/useSoloYouTube';
import { youtubeError } from '../utils/roomYouTube';

/** Compatibility player for platforms without the Android native host. */
export function SoloYouTubeWebPlayer(){
  const solo=useSoloYouTube(),web=useRef<WebView>(null),loaded=useRef('');
  const [source]=useState(()=>{const initial=getSoloYouTube().video;return {html:roomYouTubeHtml(initial?.id||'',`solo:${initial?.id||''}`),baseUrl:'https://waveplay.app'};});
  const apply=useCallback(()=>{
    const state=getSoloYouTube();if(!state.video)return;
    const id=`solo:${state.video.id}`;
    const change=loaded.current!==state.video.id?`window.changeRoomVideo(${JSON.stringify(state.video.id)},${JSON.stringify(id)});`:'';
    loaded.current=state.video.id;
    web.current?.injectJavaScript(`${change}window.applyRoom(${JSON.stringify({position:state.position,playing:state.playing,revision:state.revision})});true;`);
  },[]);
  useEffect(()=>{apply();},[solo.video,solo.revision,apply]);
  useEffect(()=>()=>{const state=getSoloYouTube();if(state.video)commandSoloYouTube(false);},[]);
  return <WebView ref={web} source={source} style={{flex:1,width:'100%',backgroundColor:'#101019'}} javaScriptEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} onMessage={event=>{
    let value;try{value=JSON.parse(event.nativeEvent.data);}catch{return;}
    const state=getSoloYouTube();if(!state.video)return;
    if(value.type==='ready'){apply();return;}
    if(value.id!==`solo:${state.video.id}`)return;
    if(value.revision!==state.revision&&!(value.type==='error'&&(value.code===101||value.code===150)))return;
    if(value.type==='progress'&&Number.isFinite(value.position))reportSoloYouTube({position:value.position});
    else if(value.type==='ended')nextSoloYouTube();
    else if(value.type==='error'){handleSoloYouTubeError(Number(value.code),youtubeError(Number(value.code)));}
    else if(value.type==='state'&&value.state===1)reportSoloYouTube({playing:true,error:'',interrupted:false});
  }} onError={()=>{reportSoloYouTube({error:'No se pudo cargar el video.',playing:false});failSoloYouTube();}}/>;
}

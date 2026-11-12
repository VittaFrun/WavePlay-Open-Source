import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useFriendsListening } from '../providers/FriendsListeningProvider';
import { youtubeError, youtubeTarget } from '../utils/roomYouTube';
import { fonts, useTheme } from '../theme';
import { roomYouTubeNative } from '../services/roomYouTubeNative';
import { NativeRoomYouTubePlayer } from './NativeRoomYouTubePlayer';
import { roomYouTubeHtml } from '../utils/roomYouTubeHtml';

// Only the visible room owns a YouTube player. Progress stays in this subtree.
export function RoomYouTubePlayer(props:{onPosition:(seconds:number)=>void}){
  return roomYouTubeNative?<NativeRoomYouTubePlayer {...props}/>:<VisibleRoomYouTubePlayer {...props}/>;
}
function VisibleRoomYouTubePlayer({onPosition}:{onPosition:(seconds:number)=>void}){
  const friends=useFriendsListening(),{colors}=useTheme(),focused=useIsFocused();
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const [failure,setFailure]=useState(''),[blocked,setBlocked]=useState(false),[ready,setReady]=useState(false);
  const [retry,setRetry]=useState(0);
  const web=useRef<WebView>(null),latest=useRef(friends),positionCallback=useRef(onPosition),lastEnd=useRef('');
  useEffect(()=>{latest.current=friends;positionCallback.current=onPosition;},[friends,onPosition]);
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>setForeground(state==='active'));return()=>subscription.remove();},[]);
  const id=friends.current?.youtubeId||'',itemId=friends.current?.id||'';
  const visible=focused&&foreground;
  const html=useMemo(()=>roomYouTubeHtml(id,itemId),[id,itemId]);
  const apply=useCallback(()=>{
    const value=latest.current;
    if(!value.current||!value.youtubePlayback)return;
    const target=youtubeTarget(value.youtubePlayback,value.current.duration,Date.now()+value.serverClockOffset);
    web.current?.injectJavaScript(`window.applyRoom&&window.applyRoom(${JSON.stringify(target)});true;`);
  },[]);
  useEffect(()=>{
    if(!visible)return;
    apply();const timer=setInterval(apply,8000);return()=>clearInterval(timer);
  },[visible,ready,friends.youtubePlayback?.revision,apply]);
  const report=friends.reportYouTube;
  useEffect(()=>{
    if(!visible)report('idle');
    return()=>report('idle');
  },[visible,report,itemId]);
  const onMessage=useCallback((raw:string)=>{
    if(raw.length>2048)return;
    try{
      const event=JSON.parse(raw),value=latest.current;
      if(event.id!==value.current?.id)return;
      if(event.type==='ready'){setReady(true);setFailure('');apply();value.reportYouTube('preparing');}
      else if(event.type==='error'){setFailure(youtubeError(Number(event.code)));value.reportYouTube('error');}
      else if(event.type==='blocked'){setBlocked(true);value.reportYouTube('preparing');}
      else if(event.type==='state'){
        if(event.state===1){setBlocked(false);value.reportYouTube('synced');}
        else if(event.state===2)value.reportYouTube('synced');
        else if(event.state===3)value.reportYouTube('preparing');
      }else if(event.type==='progress'&&Number.isFinite(event.position)&&event.position>=0)
        positionCallback.current(Math.min(value.current?.duration||0,event.position));
      else if(event.type==='ended'&&value.youtubePlayback&&event.revision===value.youtubePlayback.revision){
        const key=event.id+':'+value.youtubePlayback.revision;
        if(lastEnd.current!==key){lastEnd.current=key;void value.youtubeEnded(event.id,value.youtubePlayback.revision).catch(()=>{});}
      }
    }catch{/* Ignore malformed web messages. */}
  },[apply]);
  return <View style={{alignSelf:'stretch',marginTop:14}}>
    {visible?<View style={{height:220,borderRadius:12,overflow:'hidden'}}><WebView key={itemId+':'+retry} ref={web}
      source={{html,baseUrl:'https://waveplay.app'}} originWhitelist={['https://*']} javaScriptEnabled
      allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} allowsFullscreenVideo
      onMessage={event=>onMessage(event.nativeEvent.data)}
      onError={()=>{setFailure('No se pudo conectar con YouTube. Revisa internet.');report('error');}}
      onContentProcessDidTerminate={()=>{setReady(false);setRetry(old=>old+1);}}
      onShouldStartLoadWithRequest={request=>{
        try{const host=new URL(request.url).hostname;return request.url==='about:blank'||host==='waveplay.app'||host==='youtube.com'||host.endsWith('.youtube.com')||host.endsWith('.youtube-nocookie.com');}catch{return false;}
      }}/></View>:null}
    {!visible?<Text style={{color:colors.muted,fontFamily:fonts.regular}}>Vuelve a la sala para escuchar YouTube.</Text>:null}
    {blocked?<Text accessibilityRole="alert" style={{color:colors.pink,fontFamily:fonts.semiBold,marginTop:8}}>Toca Reproducir en el video para habilitar el audio en este dispositivo.</Text>:null}
    {failure?<><Text accessibilityRole="alert" style={{color:colors.danger,fontFamily:fonts.semiBold,marginTop:8}}>{failure}</Text><Pressable accessibilityRole="button" onPress={()=>{setFailure('');setReady(false);setRetry(old=>old+1);}} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.pink,fontFamily:fonts.bold}}>Reintentar YouTube</Text></Pressable></>:null}
  </View>;
}

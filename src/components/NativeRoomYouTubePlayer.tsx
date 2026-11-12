import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, Text, View } from 'react-native';
import { RoomYouTubeSurface as Surface } from './RoomYouTubeSurface';
import { useRoomSelector } from '../providers/FriendsListeningProvider';
import { roomYouTubeNative, subscribeRoomYouTube } from '../services/roomYouTubeNative';
import { youtubeError } from '../utils/roomYouTube';
import { fonts, useTheme } from '../theme';

export function NativeRoomYouTubePlayer({onPosition}:{onPosition:(seconds:number)=>void}){
  const friends=useRoomSelector(v=>({current:v.current})),focused=useIsFocused(),{colors}=useTheme();
  const callback=useRef(onPosition),latest=useRef(friends);
  const [active,setActive]=useState(AppState.currentState==='active');
  const visible=useRef(false);
  useEffect(()=>{visible.current=focused&&active;},[focused,active]);
  const [failure,setFailure]=useState(''),[blocked,setBlocked]=useState(false),[interrupted,setInterrupted]=useState(false);
  useEffect(()=>{callback.current=onPosition;latest.current=friends;},[onPosition,friends]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>setActive(state==='active'));return()=>sub.remove();},[]);
  useEffect(()=>subscribeRoomYouTube(event=>{
    if(event.id!==latest.current.current?.id)return;
    if(event.type==='progress'&&Number.isFinite(event.position)&&visible.current)callback.current(Math.min(latest.current.current?.duration||0,Math.max(0,event.position!)));
    else if(event.type==='error')setFailure(youtubeError(Number(event.code)));
    else if(event.type==='blocked')setBlocked(true);
    else if(event.type==='interrupted')setInterrupted(true);
    else if(event.type==='state'&&event.state===1){setBlocked(false);setInterrupted(false);setFailure('');}
    else if(event.type==='backgroundError')setFailure('Abre la sala y vuelve a activar la reproducción para iniciar el segundo plano.');
  }),[]);
  return <View style={{alignSelf:'stretch',marginTop:14}}>
    <Surface displayPlayer={focused&&active} style={{height:220,borderRadius:12,overflow:'hidden',backgroundColor:'#101019'}}/>
    {blocked?<Text accessibilityRole="alert" style={{color:colors.pink,fontFamily:fonts.semiBold,marginTop:8}}>Toca Reproducir en el video para habilitar el audio.</Text>:null}
    {failure?<View><Text accessibilityRole="alert" style={{color:colors.danger,fontFamily:fonts.semiBold,marginTop:8}}>{failure}</Text><Pressable onPress={()=>router.push({pathname:'/(tabs)/search',params:{q:friends.current?.title||''}})} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:colors.pink,fontFamily:fonts.bold}}>Buscar otra versión</Text></Pressable><Pressable onPress={()=>{if(friends.current?.youtubeId)void Linking.openURL('https://www.youtube.com/watch?v='+friends.current.youtubeId);}} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:colors.pink}}>Abrir en YouTube</Text></Pressable></View>:null}
    {interrupted?<Pressable accessibilityRole="button" onPress={()=>roomYouTubeNative?.resumeLocal()} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.pink,fontFamily:fonts.bold}}>Reanudar audio en este dispositivo</Text></Pressable>:null}
  </View>;
}

import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { RoomYouTubeSurface } from './RoomYouTubeSurface';
import { useFriendsListening } from '../providers/FriendsListeningProvider';
import { roomYouTubeNative, subscribeRoomYouTube } from '../services/roomYouTubeNative';
import { roomYouTubeHtml } from '../utils/roomYouTubeHtml';
import { useSoloYouTube } from '../hooks/useSoloYouTube';
import { getSoloYouTube, handleSoloYouTubeError, isMixedSolo, stopSoloYouTube, commandSoloYouTube, reportSoloYouTube, nextSoloYouTube, previousSoloYouTube } from '../services/soloYouTube';
import { useWaveActions } from '../providers/WaveProvider';
import { youtubeError, youtubeTarget } from '../utils/roomYouTube';

const Surface=roomYouTubeNative?RoomYouTubeSurface:null;

export function RoomYouTubeNativeHost(){
  const friends=useFriendsListening(),path=usePathname(),solo=useSoloYouTube();
  const {pauseSharedPlayback}=useWaveActions();
  useEffect(()=>{if(friends.room)stopSoloYouTube();},[friends.room]);
  useEffect(()=>{if(solo.video&&!friends.room)pauseSharedPlayback();},[solo.video,friends.room,pauseSharedPlayback]);
  const [active,setActive]=useState(AppState.currentState==='active');
  const latest=useRef(friends),ended=useRef('');
  useEffect(()=>{latest.current=friends;},[friends]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>setActive(state==='active'));return()=>sub.remove();},[]);
  useEffect(()=>subscribeRoomYouTube(event=>{
    const value=latest.current;
    const individual=getSoloYouTube();
    if(!value.room&&individual.video&&event.id==='solo:'+individual.video.id){
      if(event.revision!==individual.revision&&!(event.type==='error'&&(event.code===101||event.code===150)))return;
      if(event.type==='progress'&&event.revision===individual.revision&&Number.isFinite(event.position))reportSoloYouTube({position:event.position});
      else if(event.type==='error'){handleSoloYouTubeError(Number(event.code),youtubeError(Number(event.code)));}
      else if(event.type==='blocked')reportSoloYouTube({error:'Toca Reproducir en el video para iniciar el audio.'});
      else if(event.type==='interrupted')reportSoloYouTube({interrupted:true});
      else if(event.type==='backgroundError')reportSoloYouTube({error:'Abre el reproductor y vuelve a iniciar el audio.'});
      else if(event.type==='state'&&event.state===1&&event.revision===individual.revision)reportSoloYouTube({interrupted:false,error:'',playing:true});
      else if(event.type==='ended')nextSoloYouTube();
      else if(event.type==='action'){
        if(event.action==='next')nextSoloYouTube();
        else if(event.action==='previous')previousSoloYouTube();
        else if(event.action==='seek'&&Number.isFinite(event.position))commandSoloYouTube(individual.playing,event.position);
        else if(event.action==='play'||event.action==='pause')commandSoloYouTube(event.action==='play');
      }
      return;
    }
    if(event.id!==value.current?.id)return;
    if(event.type==='error'||event.type==='backgroundError')value.reportYouTube('error');
    else if(event.type==='interrupted')value.reportYouTube('interrupted');
    else if(event.type==='blocked')value.reportYouTube('preparing');
    else if(event.type==='state')value.reportYouTube(event.state===2&&value.playing?'interrupted':event.state===1||event.state===2?'synced':'preparing');
    else if(event.type==='ready')value.reportYouTube('preparing');
    else if(event.type==='ended'&&event.revision===value.youtubePlayback?.revision){
      const key=event.id+':'+event.revision;if(ended.current!==key){ended.current=key;void value.youtubeEnded(event.id,event.revision).catch(()=>{});}
    }else if(event.type==='action'){
      const task=event.action==='next'?value.next:event.action==='previous'?value.previous:
        event.action==='seek'&&Number.isFinite(event.position)?()=>value.seek(event.position!):
        event.action==='play'&&!value.playing||event.action==='pause'&&value.playing?value.toggle:null;
      if(task&&value.canControl)void task().catch(()=>{});
    }
  }),[]);
  const item=friends.current,playback=friends.youtubePlayback;
  useEffect(()=>{
    if(!roomYouTubeNative)return;
    if(item?.source!=='youtube'||!item.youtubeId||!playback){
      const individual=getSoloYouTube();
      if(!friends.room&&individual.video){
        const video=individual.video;
        const position=individual.position+(individual.playing?(Date.now()-individual.updatedAt)/1000:0);
        // Native APKs use this identifier to distinguish solo commands and media
        // notifications from rooms. The compatibility route opens /player.
        const config={position:video.duration>0?Math.min(video.duration,position):position,playing:individual.playing,revision:individual.revision,itemId:'solo:'+video.id,videoId:video.id,title:video.title,artist:video.channel,duration:video.duration,canControl:true,canNext:isMixedSolo()||individual.index+1<individual.queue.length,background:true,visualActive:active&&(path==='/online-player'||path==='/player'),route:'online-player'};
        void roomYouTubeNative.configure(JSON.stringify(config),roomYouTubeHtml(video.id,config.itemId,true)).catch(()=>reportSoloYouTube({error:'No se pudo iniciar el reproductor.',playing:false}));
      }else roomYouTubeNative.stop();
      return;
    }
    const target=youtubeTarget(playback,item.duration,Date.now()+friends.serverClockOffset);
    const background=true;
    const config={...target,itemId:item.id,videoId:item.youtubeId,title:item.title,artist:item.artist,duration:item.duration,
      canControl:friends.canControl,background,visualActive:active&&path==='/friends',playing:target.playing&&(background||active&&path==='/friends')};
    void roomYouTubeNative.configure(JSON.stringify(config),roomYouTubeHtml(item.youtubeId,item.id,true))
      .catch(()=>latest.current.reportYouTube('error'));
  },[item,playback,friends.room,friends.serverClockOffset,friends.canControl,active,path,solo.video,solo.revision,solo.queue]);
  useEffect(()=>()=>roomYouTubeNative?.stop(),[]);
  if(!Surface)return null;
  // A React View must reject touches before hit testing the native FrameLayout.
  // The native surface does not implement ReactPointerEventsView itself.
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,{width:320,height:220,opacity:0}]}>
    <Surface parking style={{flex:1}}/>
  </View>;
}

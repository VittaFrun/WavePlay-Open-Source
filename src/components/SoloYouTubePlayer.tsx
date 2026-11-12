import { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useWaveActions } from '../providers/WaveProvider';
import { saveOnlineVideo } from '../services/database';
import { AppAlert as Alert } from '../services/appAlert';

/** Compatibility entry for saved links; all playback UI lives in /player. */
export function SoloYouTubePlayer(){
 const params=useLocalSearchParams<{id?:string;title?:string;channel?:string;thumbnail?:string;duration?:string}>();
 const actions=useWaveActions(),requested=useRef(false);
 const one=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]||'':value||'';
 const id=one(params.id),title=one(params.title),channel=one(params.channel),thumbnail=one(params.thumbnail),duration=Number(one(params.duration));
 useEffect(()=>{
  if(requested.current)return;requested.current=true;
  if(!id){router.replace('/player');return;}
  let alive=true;
  void saveOnlineVideo({id,title:title||'YouTube',channel:channel||'YouTube',thumbnail,duration:Number.isFinite(duration)?Math.max(0,duration):0,publishedAt:''},false)
   .then(async track=>{if(!alive)return;await actions.play(track,[track]);if(alive)router.replace('/player');})
   .catch(()=>{if(alive){Alert.alert('No se pudo abrir la canción');router.replace('/player');}});
  return()=>{alive=false;requested.current=false;};
 },[id,title,channel,thumbnail,duration,actions]);
 return null;
}

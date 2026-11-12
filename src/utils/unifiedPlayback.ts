import type { PlaybackSnapshot } from './playbackStore';

type OnlineState={video:{duration:number}|null;playing:boolean;interrupted:boolean;position:number;error:string};
/** Forward progress to selective subscribers without rerendering the provider. */
export function connectPlaybackProgress(
 publish:(snapshot:PlaybackSnapshot)=>void,
 local:PlaybackSnapshot,
 getOnline:()=>OnlineState,
 subscribe:(listener:()=>void)=>()=>void,
){
 const update=()=>{const online=getOnline();publish(online.video?{playing:online.playing&&!online.interrupted,position:online.position,duration:online.video.duration,buffering:false,error:online.error||null}:local);};
 const unsubscribe=subscribe(update);update();return unsubscribe;
}

import type { ListeningRoom, RoomPlaybackState } from '../types.ts';

export function canControlRoom(room:ListeningRoom,userId:string|undefined){
  return Boolean(userId&&(room.hostUserId===userId||room.controlMode==='collaborative'));
}
export function youtubeVideoId(value:string):string|null{
  const text=value.trim();if(/^[A-Za-z0-9_-]{11}$/.test(text))return text;
  try{
    const url=new URL(text),host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'&&url.protocol!=='http:')return null;
    let id:string|null=null;
    if(host==='youtu.be')id=url.pathname.slice(1);
    else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host))
      id=url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)$/)?.[1]||null;
    return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:null;
  }catch{return null;}
}
export function youtubeTarget(playback:RoomPlaybackState,duration:number,now:number){
  const elapsed=playback.playing?Math.max(0,(now-Date.parse(playback.updatedAt))/1000):0;
  return {position:Math.min(duration,Math.max(0,playback.positionSeconds+elapsed)),playing:playback.playing,revision:playback.revision};
}
export function youtubeError(code:number){
  if(code===101||code===150)return 'Este video no permite reproducirse dentro de WavePlay. Elige otro video.';
  if(code===100)return 'El video fue eliminado, es privado o no está disponible.';
  if(code===153)return 'YouTube no pudo verificar el origen del reproductor. Vuelve a cargarlo.';
  return 'YouTube no pudo reproducir este video. Reintenta o elige otro.';
}

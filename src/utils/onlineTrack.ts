import type { Track, YouTubeVideo } from '../types';

export function youtubeIdFromUrl(raw:string):string|null {
  try {
    const url=new URL(raw);
    if(!['https:','http:'].includes(url.protocol))return null;
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    const id=host==='youtu.be'?url.pathname.split('/')[1]:['youtube.com','m.youtube.com','music.youtube.com'].includes(host)?url.searchParams.get('v'):null;
    return id&&/^[\w-]{11}$/.test(id)?id:null;
  }catch{return null;}
}
export function onlineTrack(video:YouTubeVideo):Track {
  if(!/^[\w-]{11}$/.test(video.id))throw new Error('El identificador de YouTube no es válido.');
  return {id:`youtube:${video.id}`,youtubeId:video.id,source:'youtube',uri:`https://www.youtube.com/watch?v=${video.id}`,filename:'',title:video.title,artist:video.channel,album:'YouTube',duration:video.duration,artwork:video.thumbnail,createdAt:Date.now(),modifiedAt:Date.now()};
}
export function trackVideo(track:Track):YouTubeVideo {
  const id=track.youtubeId||track.id.replace(/^youtube:/,'');
  return {id,title:track.title,channel:track.artist,thumbnail:track.artwork||`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,duration:track.duration,publishedAt:''};
}
export function playlistIdFromUrl(raw:string):string {
  try {
    const url=new URL(raw.trim());
    if(!['https:','http:'].includes(url.protocol)||!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(url.hostname))throw new Error();
    const id=url.searchParams.get('list');
    if(!id||!(/^[\w-]{10,150}$/).test(id))throw new Error();
    return id;
  }catch{throw new Error('Pega un enlace válido de una playlist pública de YouTube.');}
}

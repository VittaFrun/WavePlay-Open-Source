import type { SharedTrack, Track, RoomPlaybackState, RoomQueueItem } from '../types';

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function sharedTrackIdentity(track:Track):SharedTrack {
  const title=normalize(track.title||track.filename);
  const artist=normalize(track.artist||'Artista desconocido');
  const duration=Math.max(0,Math.round(track.duration||0));
  return {key:`${title}|${artist}|${duration}`,title:track.title,artist:track.artist,duration:track.duration||0};
}
export function findSharedTrack(tracks:Track[], shared:SharedTrack):Track|undefined {
  const exact=tracks.find(track=>sharedTrackIdentity(track).key===shared.key);
  if(exact)return exact;
  const wantedTitle=normalize(shared.title),wantedArtist=normalize(shared.artist);
  return tracks.find(track=>normalize(track.title)===wantedTitle&&normalize(track.artist)===wantedArtist&&Math.abs((track.duration||0)-shared.duration)<=2);
}
export function expectedRoomPosition(event:{positionSeconds:number;playing:boolean;sentAt:number},now=Date.now()) {
  return Math.max(0,event.positionSeconds+(event.playing?Math.max(0,now-event.sentAt)/1000:0));
}

export function roomPosition(state:RoomPlaybackState,duration:number,serverNow=Date.now()){
  const elapsed=state.playing?Math.max(0,(serverNow-Date.parse(state.updatedAt))/1000):0;
  return Math.min(Math.max(0,duration),Math.max(0,state.positionSeconds+elapsed));
}
export function adjacentRoomSong(queue:RoomQueueItem[],currentId:string|null,direction:1|-1){
  const ready=queue.filter(item=>item.status==='ready');
  const index=ready.findIndex(item=>item.id===currentId);
  return direction===1?ready[index+1]:ready[Math.max(0,index-1)];
}
export function roomSongAsTrack(item:RoomQueueItem,uri:string,artwork?:string|null):Track{
  return {id:'room:'+item.id,uri,filename:item.filename,title:item.title,artist:item.artist,
    album:'Sala de WavePlay',duration:item.duration,artwork,createdAt:Date.parse(item.createdAt),modifiedAt:0,fileSize:item.fileSize};
}


export type RoomSongIntent='queue'|'next'|'now';
export function roomSongFinished(duration:number,position:number){
  return Number.isFinite(duration)&&duration>0&&Number.isFinite(position)&&position>=duration-.25;
}
export function roomCleanupCandidates(queue:RoomQueueItem[],currentId:string|null,completed:Set<string>){
  const nextId=adjacentRoomSong(queue,currentId,1)?.id;
  return queue.filter(item=>completed.has(item.id)&&item.status==='ready'&&item.id!==currentId&&item.id!==nextId);
}
export function roomOrderWithNext(queue:RoomQueueItem[],currentId:string|null,songId:string):string[]{
  const ids=queue.map(song=>song.id);
  if(!ids.includes(songId)||currentId===songId)return ids;
  const remaining=ids.filter(id=>id!==songId);
  const index=currentId?remaining.indexOf(currentId):-1;
  remaining.splice(index+1,0,songId);
  return remaining;
}

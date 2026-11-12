import type { PlaybackSession, Track } from '../types';

/** Restore by identity before index: unavailable files must not shift the current song. */
export function restorePlaybackSession(raw:unknown,legacyIds:readonly string[],tracks:readonly Track[]){
 const value=raw&&typeof raw==='object'?raw as Partial<PlaybackSession>:null;
 const ids=(input:unknown):string[]=>Array.isArray(input)?input.filter((id):id is string=>typeof id==='string'&&!id.startsWith('room:')):[];
 const savedIds=value&&Array.isArray(value.queueIds)?ids(value.queueIds):ids(legacyIds);
 const byId=new Map(tracks.filter(track=>!track.missing).map(track=>[track.id,track]));
 for(const track of tracks)if(track.localTrackId&&!track.missing)byId.set(track.localTrackId,track);
 const entries=savedIds.flatMap((id,oldIndex)=>{const track=byId.get(id);return track?[{track,oldIndex}]:[];});
 const savedIndex=Number.isSafeInteger(value?.currentIndex)?Math.max(0,value!.currentIndex!):0;
 const savedWanted=typeof value?.trackId==='string'?value.trackId:savedIds[savedIndex];
 const wanted=byId.get(savedWanted)?.id||savedWanted;
 let index=entries.findIndex(entry=>entry.oldIndex===savedIndex&&entry.track.id===wanted);
 if(index<0)index=entries.findIndex(entry=>entry.track.id===wanted);
 const retained=index>=0;
 if(index<0){index=entries.findIndex(entry=>entry.oldIndex>=savedIndex);if(index<0)index=entries.length-1;}
 const queue=entries.map(entry=>entry.track),active=queue[index];
 const position=retained&&Number.isFinite(value?.positionSeconds)?Math.max(0,value!.positionSeconds!):0;
 const originalIds=ids(value?.originalQueueIds),remaining=new Set(queue.map(track=>track.id));
 const original=originalIds.flatMap(id=>{const track=byId.get(id);return track&&remaining.has(id)?[track]:[];});
 const known=new Set(original.map(track=>track.id));original.push(...queue.filter(track=>!known.has(track.id)));
 return {queue,original:original.length?original:queue,index,position:active?.duration>0?Math.min(position,active.duration):position,
  repeatMode:value?.repeatMode==='one'||value?.repeatMode==='all'?value.repeatMode:'off' as const,
  shuffleEnabled:value?.shuffleEnabled===true,sourceKey:typeof value?.sourceKey==='string'&&value.sourceKey!=='friends'?value.sourceKey:null,
  sourceTrackIds:ids(value?.sourceTrackIds).map(id=>byId.get(id)?.id||id).filter(id=>remaining.has(id))};
}

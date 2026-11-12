import type { Track } from '../types';

const normalize=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
function metadataKey(track:Track) {
  if(!track.title?.trim()||!track.artist?.trim()||/desconocid|unknown/i.test(track.artist)||!Number.isFinite(track.duration)||track.duration<=0||!track.fileSize||track.fileSize<=0)return null;
  return JSON.stringify([normalize(track.title),normalize(track.artist),Math.round(track.duration*100),track.fileSize]);
}
export function sameRecording(a:Track,b:Track) {
  if(a.id===b.id)return false;
  if(a.uri&&a.uri===b.uri)return true;
  const key=metadataKey(a);return key!==null&&key===metadataKey(b);
}
export function duplicateGroups(tracks:Track[],preferredId?:string):Track[][] {
  const parent=tracks.map((_,i)=>i);const uri=new Map<string,number>();const metadata=new Map<string,number>();
  const root=(i:number):number=>parent[i]===i?i:parent[i]=root(parent[i]);
  tracks.forEach((track,i)=>{if(track.missing)return;for(const [map,key] of [[uri,track.uri],[metadata,metadataKey(track)]] as const){if(!key)continue;const previous=map.get(key);if(previous===undefined)map.set(key,i);else parent[root(i)]=root(previous)}});
  const groups=new Map<number,Track[]>();tracks.forEach((track,i)=>{if(!track.missing){const key=root(i);const group=groups.get(key);if(group)group.push(track);else groups.set(key,[track])}});
  return [...groups.values()].filter(group=>group.length>1).map(group=>group.sort((a,b)=>Number(b.id===preferredId)-Number(a.id===preferredId)||Number(Boolean(b.favorite))-Number(Boolean(a.favorite))||a.createdAt-b.createdAt));
}

import type { Track } from '../types';

const dayStamp=(time:number)=>{const date=new Date(time);return Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())};
export function addedDays(track: Track, now=Date.now()) {
  const time=track.addedAt||track.createdAt;
  if(!Number.isFinite(time)||time<=0)return Infinity;
  return Math.max(0,Math.round((dayStamp(now)-dayStamp(time))/86400000));
}
export function addedGroups(tracks:Track[],now=Date.now()) {
  const groups=new Map<number,Track[]>();
  for(const track of tracks){const days=addedDays(track,now);const group=groups.get(days)||[];group.push(track);groups.set(days,group)}
  return [...groups.entries()].sort(([a],[b])=>a-b).map(([days,items])=>({days,title:days===0?'Hoy':days===Infinity?'Sin fecha':`Hace ${days} ${days===1?'día':'días'}`,tracks:items}));
}

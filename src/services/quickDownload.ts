import type { DownloadItem, Track } from '../types';
import { youtubeIdFromUrl } from '../utils/onlineTrack';

let start:((track:Track)=>Promise<void>)|null=null;
const states=new Map<string,string>(),listeners=new Map<string,Set<()=>void>>(),starting=new Set<string>();
export function configureQuickDownload(callback:(track:Track)=>Promise<void>){start=callback;return()=>{if(start===callback)start=null;};}
export function publishDownloadStates(items:DownloadItem[]){
  const next=new Map<string,string>();
  for(const item of items){const id=youtubeIdFromUrl(item.url);if(id&&['queued','downloading','converting','embedding','saving'].includes(item.state))next.set(id,item.state);}
  const changed=new Set([...states.keys(),...next.keys()]);
  for(const id of changed){const value=next.get(id)||'';if(value!==(states.get(id)||'')){if(value)states.set(id,value);else states.delete(id);listeners.get(id)?.forEach(fn=>fn());}}
}
export function getDownloadState(id:string){return states.get(id)||(starting.has(id)?'queued':'');}
export function subscribeDownloadState(id:string,listener:()=>void){const group=listeners.get(id)||new Set();group.add(listener);listeners.set(id,group);return()=>{group.delete(listener);if(!group.size)listeners.delete(id);};}
export async function quickDownload(track:Track){
  const id=track.youtubeId;if(!id||track.downloaded||starting.has(id)||getDownloadState(id))return;
  if(!start)throw new Error('Espera a que termine de cargar la biblioteca.');
  starting.add(id);listeners.get(id)?.forEach(fn=>fn());
  try{await start(track);}finally{starting.delete(id);listeners.get(id)?.forEach(fn=>fn());}
}

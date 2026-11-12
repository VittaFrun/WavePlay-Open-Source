import type { Track } from '../types';

/** Late storage resolutions cannot steal playback from a newer selection. */
export function createPlaybackResolution(resolve:(track:Track,forceOnline?:boolean)=>Promise<Track>){
  let generation=0;
  return {
    invalidate(){generation++;},
    async run(track:Track,forceOnline=false){
      const request=++generation;
      try{const resolved=await resolve(track,forceOnline);return request===generation?resolved:null;}
      catch(error){if(request!==generation)return null;throw error;}
    },
  };
}

/** Failed entries are visited at most once, even with repeat enabled. */
export function nextPlayableIndex(items:readonly Track[],index:number,failed:ReadonlySet<string>,wrap:boolean){
  for(let i=index+1;i<items.length;i++)if(!failed.has(items[i].id))return i;
  if(wrap)for(let i=0;i<=index&&i<items.length;i++)if(!failed.has(items[i].id))return i;
  return -1;
}

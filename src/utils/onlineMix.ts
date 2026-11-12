import type { Track } from '../types';

/** A small deterministic selection from personal listening, without background searches. */
export function buildOnlineMix(tracks:readonly Track[],limit=25):Track[]{
  const ranked=tracks.filter(t=>t.youtubeId&&!t.missing&&!t.unavailable).map(t=>({track:t,score:(t.favorite?20:0)+Math.min(20,t.playCount||0)+(t.lastPlayedAt?5:0)})).sort((a,b)=>b.score-a.score||a.track.id.localeCompare(b.track.id));
  const artists=new Map<string,number>(),result:Track[]=[];
  for(const {track} of ranked){const count=artists.get(track.artist)||0;if(count>=3)continue;artists.set(track.artist,count+1);result.push(track);if(result.length>=limit)break;}
  return result;
}

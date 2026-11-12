import type { DownloadItem, Track } from '../types';

/** Never choose arbitrarily when multiple files have the same download name. */
export function resolveDownloadTrack(item:DownloadItem,tracks:Track[]) {
  if(item.outputTrackId)return tracks.find(track=>(track.id===item.outputTrackId||track.localTrackId===item.outputTrackId)&&track.filename===item.fileName)??null;
  const matches=tracks.filter(track=>track.filename===item.fileName);
  return matches.length===1?matches[0]:null;
}

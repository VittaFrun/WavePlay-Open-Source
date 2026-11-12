import * as MediaLibrary from 'expo-media-library/legacy';
import type { Track } from '../types';
import { invalidateDownloadedCopy } from './database';

/** Only the selected song touches storage; rendering lists uses the indexed snapshot. */
export async function resolvePlaybackSource(track:Track,forceOnline=false):Promise<Track>{
  if(!track.youtubeId)return track;
  const online={...track,uri:`https://www.youtube.com/watch?v=${track.youtubeId}`,downloaded:false};
  if(forceOnline)return {...track,uri:online.uri,onlinePlayback:true};
  if(!track.downloaded||!track.localTrackId)return {...online,onlinePlayback:true};
  try {
    const asset=await MediaLibrary.getAssetInfoAsync(track.localTrackId);
    if(asset.mediaType===MediaLibrary.MediaType.audio&&asset.filename===track.filename)return {...track,onlinePlayback:false,uri:asset.localUri||asset.uri};
  }catch{/* Missing or inaccessible local audio falls back to the saved online identity. */}
  await invalidateDownloadedCopy(track.id);
  return {...online,localTrackId:undefined,filename:''};
}

import * as MediaLibrary from 'expo-media-library/legacy';
import { NativeModules } from 'react-native';
import { upsertTracks, linkDownloadedVideo } from './database';
import type { DownloadItem, Track } from '../types';

/** Register the exact saved asset, without waiting for a device-wide rescan. */
export async function registerDownloadedAsset(item:DownloadItem,assetId:string,verifyFileName=false):Promise<string>{
  const asset=await MediaLibrary.getAssetInfoAsync(assetId);
  if(asset.id!==assetId||asset.mediaType!==MediaLibrary.MediaType.audio)throw new Error('No se pudo identificar el audio guardado.');
  if(verifyFileName&&(!item.fileName||asset.filename!==item.fileName))throw new Error('El archivo cambió. Actualiza la biblioteca para localizarlo.');
  const metadata=await NativeModules.WavePlayDownloader?.readMetadata?.(asset.uri).catch(()=>null);
  const track:Track={
    id:asset.id,uri:asset.uri,filename:asset.filename,
    title:metadata?.title||item.title,artist:metadata?.artist||item.artist||'Artista desconocido',album:metadata?.album||'Álbum desconocido',
    duration:asset.duration||metadata?.duration||0,createdAt:asset.creationTime||Date.now(),modifiedAt:asset.modificationTime||asset.creationTime||Date.now(),
    artwork:metadata?.artwork||item.thumbnail||null,folder:metadata?.folder,genre:metadata?.genre,mimeType:metadata?.mimeType,
    bitrate:metadata?.bitrate,sampleRate:metadata?.sampleRate,fileSize:metadata?.fileSize,source:'device',
  };
  await upsertTracks([track],{reveal:true});
  await linkDownloadedVideo(item.url,asset.id,asset.filename);
  return asset.filename;
}

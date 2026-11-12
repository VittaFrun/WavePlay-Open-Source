import { NativeModules } from 'react-native';
import { createAudioStreamResolver } from '../utils/audioStream';
const engine=NativeModules.WavePlayDownloader as {resolveAudioStream?:(id:string,job:string)=>Promise<unknown>;cancelAudioStream?:(job:string)=>Promise<void>}|undefined;
const blocked=new Set<string>();
export const canResolveYouTubeAudio=Boolean(engine?.resolveAudioStream);
export function markAudioFallback(id:string){blocked.add(id);if(blocked.size>128)blocked.delete(blocked.values().next().value!);}
export const needsAudioFallback=(id:string)=>blocked.has(id);
export const youtubeAudioResolver=createAudioStreamResolver(
 (id,job)=>engine?.resolveAudioStream?engine.resolveAudioStream(id,job):Promise.reject(new Error('Actualiza WavePlay para reproducir esta canción como audio.')),
 job=>{void engine?.cancelAudioStream?.(job).catch(()=>{});},
);

import { registerDownloadedAsset } from './downloadLibrary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import type { DownloadItem } from '../types';
import { saveDownload } from './database';
import { cancelDownload, copyDownloadedAudio, downloadAudio, hasNativeLibrarySaver, isOnWifi, nativeDownloadJobs, releaseDownloadedAudio, saveDownloadedAudio, scheduleDownloadScan } from './downloader';
import { visibleDownloadProgress } from '../utils/downloadProgress';
import { performanceStart } from './performance';

type Update=(update:(items:DownloadItem[])=>DownloadItem[])=>void;
type Journal={uri:string;fileName:string;destination?:string;outputTrackId?:string;committing?:boolean;nativeCommit?:boolean;done?:boolean};
export function audioMime(name:string){const extension=name.split('.').pop()?.toLowerCase();return ({mp3:'audio/mpeg',m4a:'audio/mp4',opus:'audio/ogg',ogg:'audio/ogg',aac:'audio/aac',flac:'audio/flac',wav:'audio/wav',webm:'audio/webm'} as Record<string,string>)[extension||'']||'application/octet-stream';}
const key=(id:string)=>`waveplay.download.job.${id}`;
const recoveredCancellations=new Set<string>();
const active=new Map<string,{cancelled:boolean;committing:boolean}>();
const names:Record<string,string>={queued:'En cola',downloading:'Descargando',converting:'Convirtiendo',embedding:'Añadiendo carátula',saving:'Guardando'};
async function read(id:string):Promise<Journal|undefined>{const value=await AsyncStorage.getItem(key(id));return value?JSON.parse(value):undefined;}
async function write(id:string,journal:Journal){await AsyncStorage.setItem(key(id),JSON.stringify(journal));}
export async function discardDownloadJob(id:string){
 if(active.has(id))throw new Error('La descarga sigue en curso.');
 const journal=await read(id);
 if(journal&&!journal.done&&journal.destination)await FileSystem.deleteAsync(journal.destination,{idempotent:true});
 if(journal)await releaseDownloadedAudio(journal.uri).catch(()=>{});
 await AsyncStorage.removeItem(key(id));
}
export async function cancelDownloadJob(id:string){
 const job=active.get(id);if(job?.committing)return;
 if(job)job.cancelled=true;else recoveredCancellations.add(id);
 await cancelDownload(id);
}
export async function runDownloadJob(item:DownloadItem,update:Update,scan:()=>Promise<unknown>,recovered?:Journal){
 if(active.has(item.id))return;
 const attempt={cancelled:false,committing:false};active.set(item.id,attempt);
 const patch=(value:Partial<DownloadItem>)=>update(items=>items.map(job=>job.id===item.id?{...job,...value}:job));
 let journal:Journal|undefined;
 const finishTotal=performanceStart('download:total');
 let phase='',finishPhase=()=>{};
 const measure=(next:string)=>{if(phase===next)return;finishPhase();phase=next;finishPhase=performanceStart(`download:${next}`);};
 const check=()=>{if(attempt.cancelled)throw new Error('Descarga cancelada');};
 try{
  // Ensure the history row exists before starting native work.
  await saveDownload(item);
  journal=await read(item.id)||recovered;
  if(journal?.done){const completed={...item,state:'done' as const,errorCode:undefined,progress:100,fileName:journal.fileName,outputTrackId:journal.outputTrackId,message:'Lista para escuchar'};await saveDownload(completed);patch(completed);await releaseDownloadedAudio(journal.uri).catch(()=>{});await AsyncStorage.removeItem(key(item.id));scheduleDownloadScan(scan);return;}
  if(journal?.committing&&!journal.nativeCommit&&!journal.outputTrackId&&!journal.destination)throw new Error('El guardado se interrumpió. Comprueba la Biblioteca antes de iniciar otra descarga para evitar duplicados.');
  if(journal&&!journal.outputTrackId){const info=await FileSystem.getInfoAsync(journal.uri);if(!info.exists)journal=undefined;}
  check();
  if(!journal){
   measure('preparing');
   patch({state:'queued',progress:0,message:'Preparando',errorCode:undefined});
   const wifiOnly=await AsyncStorage.getItem('waveplay.downloads.wifiOnly')==='1';
   if(wifiOnly&&!(await isOnWifi()))throw new Error('Conéctate a Wi-Fi o desactiva “Solo con Wi-Fi” en Ajustes.');
   check();
   const result=await downloadAudio(item.id,item.url,item.quality||320,(progress,state)=>{
    if(attempt.cancelled)return;
    measure(state);
    update(items=>{let changed=false;const next=items.map(job=>{if(job.id!==item.id)return job;const value=visibleDownloadProgress(job,progress,state as DownloadItem['state']);if(!value)return job;changed=true;return {...value,message:names[state]||state};});return changed?next:items;});
   },{wifiOnly,format:item.format,title:item.title});
   journal=result;
   // Remote fallback files must become local before the save checkpoint.
   if(result.uri.startsWith('http'))journal={...result,...await FileSystem.downloadAsync(result.uri,`${FileSystem.cacheDirectory}download-${item.id}.mp3`)};
   await write(item.id,journal);
  }
  check();measure('saving');attempt.committing=true;patch({state:'saving',progress:100,message:'Guardando en tu biblioteca'});
  if(item.folderUri){
   if(!journal.destination){journal.destination=await FileSystem.StorageAccessFramework.createFileAsync(item.folderUri,journal.fileName,audioMime(journal.fileName));try{await write(item.id,journal);}catch(error){await FileSystem.deleteAsync(journal.destination,{idempotent:true}).catch(()=>{});journal.destination=undefined;throw error;}}
   if(!(await copyDownloadedAudio(journal.uri,journal.destination))){
    const info=await FileSystem.getInfoAsync(journal.uri);
    if(info.exists&&info.size>16*1024*1024)throw new Error('Actualiza WavePlay para guardar archivos grandes en esta carpeta.');
    const content=await FileSystem.readAsStringAsync(journal.uri,{encoding:FileSystem.EncodingType.Base64});
    await FileSystem.writeAsStringAsync(journal.destination,content,{encoding:FileSystem.EncodingType.Base64});
   }
  }else if(!journal.outputTrackId){
   const permission=await MediaLibrary.requestPermissionsAsync(true,['audio']);
   if(!permission.granted)throw new Error('Autoriza a WavePlay para guardar la canción.');
   journal.committing=true;journal.nativeCommit=hasNativeLibrarySaver;await write(item.id,journal);
   journal.outputTrackId=hasNativeLibrarySaver?await saveDownloadedAudio(item.id,journal.uri):(await MediaLibrary.createAssetAsync(journal.uri)).id;
  }
  if(journal.outputTrackId){await write(item.id,journal);journal.fileName=await registerDownloadedAsset(item,journal.outputTrackId);}
  journal.done=true;await write(item.id,journal);
  const completed={...item,state:'done' as const,errorCode:undefined,progress:100,fileName:journal.fileName,outputTrackId:journal.outputTrackId,message:'Lista para escuchar'};
  await saveDownload(completed);patch(completed);
  await releaseDownloadedAudio(journal.uri).catch(()=>{});
  if(journal.uri.includes(`/download-${item.id}.mp3`))await FileSystem.deleteAsync(journal.uri,{idempotent:true}).catch(()=>{});
  await AsyncStorage.removeItem(key(item.id));scheduleDownloadScan(scan);
 }catch(error){
  if(attempt.cancelled){if(journal)await releaseDownloadedAudio(journal.uri).catch(()=>{});await AsyncStorage.removeItem(key(item.id)).catch(()=>{});}
  patch({state:attempt.cancelled?'cancelled':'error',errorCode:attempt.cancelled?undefined:journal?'SAVE_FAILED':'DOWNLOAD_FAILED',message:attempt.cancelled?'Cancelada':error instanceof Error?error.message:'No se pudo completar la descarga'});
 }finally{finishPhase();finishTotal();active.delete(item.id);}
}

// Reattach after a JS reload. A killed process has no active native jobs; its
// unfinished history becomes retryable instead of remaining stuck forever.
export async function recoverDownloadJobs(items:DownloadItem[],update:Update,scan:()=>Promise<unknown>){
 const snapshots=await nativeDownloadJobs();

 for(const item of items){
  if(active.has(item.id))continue;
  if(['done','cancelled'].includes(item.state)){const staged=snapshots.find(job=>job.id===item.id);if(staged?.uri)try{await releaseDownloadedAudio(staged.uri);await AsyncStorage.removeItem(key(item.id));}catch{/* Retry cleanup at the next startup. */}continue;}
  if(recoveredCancellations.has(item.id)){
   const pending=snapshots.find(job=>job.id===item.id);
   if(pending&&!pending.uri){setTimeout(()=>{void recoverDownloadJobs([item],update,scan).catch(()=>{});},1000);continue;}
   if(pending?.uri)await releaseDownloadedAudio(pending.uri).catch(()=>{});
   recoveredCancellations.delete(item.id);
   update(all=>all.map(job=>job.id===item.id?{...job,state:'cancelled',message:'Cancelada'}:job));continue;
  }
  const snapshot=snapshots.find(job=>job.id===item.id);
  if(snapshot?.uri&&snapshot.fileName){const saved=await read(item.id);if(item.state==='error'&&saved&&!saved.done)continue;void runDownloadJob(item,update,scan,{uri:snapshot.uri,fileName:snapshot.fileName});continue;}
  if(snapshot){
   update(all=>all.map(job=>job.id===item.id?{...job,state:'downloading',message:'Recuperando descarga'}:job));
   setTimeout(()=>{void recoverDownloadJobs([item],update,scan).catch(()=>{});},1000);continue;
  }
  const journal=await read(item.id);
  if(journal?.done){void runDownloadJob(item,update,scan,journal);continue;}
  if(item.state!=='error')update(all=>all.map(job=>job.id===item.id?{...job,state:'error',errorCode:journal?'SAVE_FAILED':'INTERRUPTED',message:journal?'La canción está descargada. Reintenta guardarla.':'La descarga se interrumpió. Puedes reintentarla.'}:job));
 }
}

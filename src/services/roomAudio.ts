import * as FileSystem from 'expo-file-system/legacy';
import { accountClient } from './account';
import type { RoomQueueItem, Track } from '../types';

export const ROOM_AUDIO_LIMIT=20*1024*1024;
const bucket='room-audio';
const mimeFor=(filename:string)=>({mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',opus:'audio/ogg',flac:'audio/flac',wav:'audio/wav'}[filename.split('.').pop()?.toLowerCase()||'']||'application/octet-stream');
const client=()=>{if(!accountClient)throw new Error('Inicia sesión para compartir canciones.');return accountClient;};
const cacheRoot=()=>{if(!FileSystem.cacheDirectory)throw new Error('No hay espacio temporal disponible.');return FileSystem.cacheDirectory+'room-audio/';};

export async function prepareRoomAudio(track:Track,signal:AbortSignal){
  if(!Number.isFinite(track.duration)||track.duration<=0||track.duration>3600)throw new Error('Selecciona una canción de hasta una hora con duración conocida.');
  if(track.fileSize&&track.fileSize>ROOM_AUDIO_LIMIT)throw new Error('Cada canción puede pesar hasta 20 MB.');
  const root=cacheRoot();await FileSystem.makeDirectoryAsync(root,{intermediates:true});
  const uri=root+'upload-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  try{
    if(signal.aborted)throw new Error('La subida fue cancelada.');
    await FileSystem.copyAsync({from:track.uri,to:uri});
    const info=await FileSystem.getInfoAsync(uri);
    if(signal.aborted)throw new Error('La subida fue cancelada.');
    if(!info.exists||info.isDirectory||!info.size||info.size>ROOM_AUDIO_LIMIT)throw new Error('El archivo no está disponible o supera 20 MB.');
    return {uri,size:info.size,mime:mimeFor(track.filename)};
  }catch(reason){await FileSystem.deleteAsync(uri,{idempotent:true});throw reason;}
}

export async function uploadRoomAudio(item:RoomQueueItem,file:{uri:string;mime:string},signal:AbortSignal,onProgress:(value:number)=>void){
  const {data,error}=await client().auth.getSession();if(error)throw error;
  if(!data.session||signal.aborted)throw new Error('La subida fue cancelada o la sesión terminó.');
  const endpoint=process.env.EXPO_PUBLIC_SUPABASE_URL!.replace(/\/$/,'')+'/storage/v1/object/'+bucket+'/'+item.objectPath;
  const task=FileSystem.createUploadTask(endpoint,file.uri,{
    httpMethod:'POST',uploadType:FileSystem.FileSystemUploadType.BINARY_CONTENT,
    sessionType:FileSystem.FileSystemSessionType.FOREGROUND,
    headers:{Authorization:'Bearer '+data.session.access_token,apikey:process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,'Content-Type':file.mime,'x-upsert':'false'},
  },progress=>onProgress(Math.min(1,progress.totalBytesSent/Math.max(1,progress.totalBytesExpectedToSend))));
  const cancel=()=>{void task.cancelAsync().catch(()=>{});};signal.addEventListener('abort',cancel);
  try{
    if(signal.aborted)throw new Error('La subida fue cancelada.');
    const response=await task.uploadAsync();
    if(!response||signal.aborted)throw new Error('La subida fue cancelada.');
    if(response.status<200||response.status>=300){
      let message='No se pudo subir el audio. Comprueba la conexión e inténtalo otra vez.';
      try{message=JSON.parse(response.body).message||message;}catch{/* Response may not be JSON. */}
      throw new Error(message);
    }
  }finally{signal.removeEventListener('abort',cancel);}
}

const downloads=new Map<string,Promise<string>>();
export async function cachedRoomAudio(item:RoomQueueItem,signal:AbortSignal):Promise<string>{
  if(signal.aborted)throw new Error('La sala terminó.');
  const root=cacheRoot()+item.roomId+'/';await FileSystem.makeDirectoryAsync(root,{intermediates:true});
  const extension=item.filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g,'')||'mp3';
  const uri=root+item.id+'.'+extension,info=await FileSystem.getInfoAsync(uri);
  if(info.exists&&info.size===item.fileSize)return uri;
  const existing=downloads.get(item.id);if(existing)return existing.catch(reason=>{if(signal.aborted)throw reason;if(downloads.get(item.id)===existing)downloads.delete(item.id);return cachedRoomAudio(item,signal);});
  const promise=(async()=>{
    if(signal.aborted)throw new Error('La sala terminó.');
    const {data,error}=await client().storage.from(bucket).createSignedUrl(item.objectPath,300);if(error)throw error;
    const partial=uri+'.part';
    const task=FileSystem.createDownloadResumable(data.signedUrl,partial,{sessionType:FileSystem.FileSystemSessionType.FOREGROUND});
    const cancel=()=>{void task.cancelAsync().catch(()=>{});};signal.addEventListener('abort',cancel);
    try{
      if(signal.aborted)throw new Error('La sala terminó.');
      const result=await task.downloadAsync();
      if(signal.aborted||!result||result.status!==200)throw new Error('No se pudo cargar la canción compartida.');
      const downloaded=await FileSystem.getInfoAsync(partial);
      if(!downloaded.exists||downloaded.size!==item.fileSize)throw new Error('La descarga quedó incompleta. Vuelve a sincronizar.');
      await FileSystem.moveAsync({from:partial,to:uri});return uri;
    }finally{signal.removeEventListener('abort',cancel);await FileSystem.deleteAsync(partial,{idempotent:true}).catch(()=>{});}
  })();
  downloads.set(item.id,promise);
  try{return await promise;}finally{if(downloads.get(item.id)===promise)downloads.delete(item.id);}
}
export async function clearRoomAudioCache(roomId:string){
  if(!/^[0-9a-f-]{36}$/i.test(roomId))return;
  await FileSystem.deleteAsync(cacheRoot()+roomId,{idempotent:true});
}
export async function pruneRoomAudioCache(roomId:string,keepIds:Set<string>,isProtected:(id:string)=>boolean=()=>false){
  if(!/^[0-9a-f-]{36}$/i.test(roomId))return;
  const root=cacheRoot()+roomId+'/';
  if(!(await FileSystem.getInfoAsync(root)).exists)return;
  const files=await FileSystem.readDirectoryAsync(root);
  for(const file of files){
    const id=file.match(/^([0-9a-f-]{36})\.[a-z0-9]+(?:\.part)?$/i)?.[1];
    if(id&&!keepIds.has(id)&&!downloads.has(id)&&!isProtected(id))await FileSystem.deleteAsync(root+file,{idempotent:true});
  }
}
export async function removePreparedAudio(uri:string){await FileSystem.deleteAsync(uri,{idempotent:true});}

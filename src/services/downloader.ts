import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

export type PreviewResult={title:string;artist?:string;uploader?:string;album?:string;duration?:number;thumbnail?:string};
const native=NativeModules.WavePlayDownloader;
const service=process.env.EXPO_PUBLIC_AUDIO_SERVICE_URL?.replace(/\/$/,'');

export const hasNativeDownloader=Boolean(native?.getPreview&&native?.downloadAudio);
export async function isOnWifi(){return native?.isOnWifi?Boolean(await native.isOnWifi()):false;}

async function json(response:Response){const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'No se pudo procesar el enlace.');return data;}

async function fetchPreview(url:string):Promise<PreviewResult>{
  if(hasNativeDownloader)return native.getPreview(url);
  if(!service)throw new Error('El motor de descarga no está disponible en esta build.');
  return json(await fetch(`${service}/preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,quality:320})}));
}

const previews=new Map<string,{value:PreviewResult;expires:number}>();
const previewRequests=new Map<string,Promise<PreviewResult>>();
export function getPreview(url:string):Promise<PreviewResult>{
 const key=url.trim(),cached=previews.get(key);
 if(cached&&cached.expires>Date.now())return Promise.resolve(cached.value);
 const pending=previewRequests.get(key);if(pending)return pending;
 const request=fetchPreview(key).then(value=>{
  if(previews.size>=24)previews.delete(previews.keys().next().value!);
  previews.set(key,{value,expires:Date.now()+60000});return value;
 }).finally(()=>previewRequests.delete(key));
 previewRequests.set(key,request);return request;
}
const transfers=new Map<string,{cancelled:boolean;controller:AbortController}>();
const progressCallbacks=new Map<string,(progress:number,state:string)=>void>();
let progressSubscription:{remove:()=>void}|undefined;
function listenToProgress(jobId:string,callback:(progress:number,state:string)=>void){
 progressCallbacks.set(jobId,callback);
 if(!progressSubscription)progressSubscription=new NativeEventEmitter(native).addListener('WavePlayDownloadProgress',event=>{
  if(!transfers.get(event.jobId)?.cancelled)progressCallbacks.get(event.jobId)?.(event.progress,event.state);
 });
 return ()=>{progressCallbacks.delete(jobId);if(!progressCallbacks.size){progressSubscription?.remove();progressSubscription=undefined;}};
}
function cancelledError(){return Object.assign(new Error('Descarga cancelada'),{code:'DOWNLOAD_CANCELLED'});}
export async function nativeDownloadJobs():Promise<{id:string;uri?:string;fileName?:string}[]>{
 return native?.getDownloadJobs?native.getDownloadJobs():[];
}
export async function downloadAudio(jobId:string,url:string,quality:number,onProgress:(progress:number,state:string)=>void,options:{wifiOnly?:boolean;format?:'mp3'|'original';title?:string}={}):Promise<{uri:string;fileName:string}>{
  if(transfers.has(jobId))throw new Error('Esta descarga ya está en curso.');
  const transfer={cancelled:false,controller:new AbortController()};transfers.set(jobId,transfer);
  const check=()=>{if(transfer.cancelled)throw cancelledError();};
  try {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS); } catch { /* No permission is needed to show progress inside WavePlay. */ }
  }
  check();
  if(hasNativeDownloader){
    const unsubscribe=listenToProgress(jobId,onProgress);
    try{if(native.setDownloadTitle)await native.setDownloadTitle(jobId,options.title||'Descarga de música');if(options.format==='original'&&!native.setDownloadFormat)throw new Error('Instala la nueva versión para descargar en formato original.');if(native.setDownloadFormat)await native.setDownloadFormat(jobId,options.format||'mp3');if(native.setDownloadWifiOnly)await native.setDownloadWifiOnly(jobId,Boolean(options.wifiOnly));check();return await native.downloadAudio(jobId,url,quality);}finally{unsubscribe();}
  }
  if(options.format==='original')throw new Error('El servicio alternativo solo admite MP3.');
  if(!service)throw new Error('El motor de descarga no está disponible.');
  const start=await json(await fetch(`${service}/downloads`,{method:'POST',headers:{'Content-Type':'application/json'},signal:transfer.controller.signal,body:JSON.stringify({url,quality,format:'mp3'})}));
  const deadline=Date.now()+30*60*1000;
  while(true){check();if(Date.now()>deadline)throw new Error('La descarga superó el tiempo de espera.');await new Promise(r=>setTimeout(r,1000));const state=await json(await fetch(`${service}/jobs/${start.jobId}`,{signal:transfer.controller.signal}));onProgress(state.progress||0,state.state);if(state.state==='error')throw new Error(state.message||'La descarga falló.');if(state.state==='ready')return {uri:state.downloadUrl,fileName:state.fileName};}
  } finally {transfers.delete(jobId);}
}

export function cancelDownload(jobId:string){const transfer=transfers.get(jobId);if(transfer){transfer.cancelled=true;transfer.controller.abort();}if(hasNativeDownloader)return native.cancelDownload(jobId);return Promise.resolve(Boolean(transfer));}

export async function copyDownloadedAudio(source:string,destination:string):Promise<boolean>{
 if(!native?.copyDownloadedAudio)return false;
 await native.copyDownloadedAudio(source,destination);return true;
}
export async function releaseDownloadedAudio(uri:string){if(native?.releaseDownloadedAudio)await native.releaseDownloadedAudio(uri);}
export const hasNativeLibrarySaver=Boolean(native?.saveDownloadedAudio)&&Platform.OS==='android'&&Number(Platform.Version)>=29;
export async function saveDownloadedAudio(jobId:string,source:string):Promise<string>{return native.saveDownloadedAudio(jobId,source);}
let scanTimer:ReturnType<typeof setTimeout>|undefined;
let pendingScan:(()=>Promise<unknown>)|undefined;
let scanning=false;
async function flushDownloadScan(){
 scanTimer=undefined;if(scanning)return;
 const scan=pendingScan;pendingScan=undefined;if(!scan)return;
 scanning=true;
 try{await scan();}catch{/* A later completion or manual scan can retry. */}
 finally{scanning=false;if(pendingScan)scanTimer=setTimeout(()=>{void flushDownloadScan();},800);}
}
export function scheduleDownloadScan(scan:()=>Promise<unknown>){
 pendingScan=scan;
 if(scanTimer)clearTimeout(scanTimer);
 scanTimer=setTimeout(()=>{void flushDownloadScan();},800);
}

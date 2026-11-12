import { NativeModules, Platform } from 'react-native';
import { applyOrganizedAsset, listTracks } from './database';
import { organizationCandidates, type OrganizationGrouping } from '../utils/fileOrganization';

export type OrganizationRow={assetId:string;uri:string;fileName:string;oldFileName:string;folder:string;destination:string;targetName:string;modifiedAt:number;size:number;status:'pending'|'moving'|'moved'|'indexed'|'skipped'|'error';error?:string};
type Job={id:string;rows:OrganizationRow[]};
type Organizer={prepare(input:string):Promise<string>;getJob():Promise<string|null>;authorize(id:string,ids:string):Promise<boolean>;move(id:string,assetId:string):Promise<string>;acknowledge(id:string,assetId:string):Promise<boolean>;finish(id:string):Promise<boolean>};
const native=Platform.OS==='android'&&Number(Platform.Version)>=30?NativeModules.WavePlayFileOrganizer as Organizer|undefined:undefined;
export const canOrganizeFiles=Boolean(native);
let state:{job:Job|null;running:boolean;preparing:boolean;error:string;paused:boolean}={job:null,running:false,preparing:false,error:'',paused:false};
const listeners=new Set<()=>void>(),indexed=new Set<(rows:OrganizationRow[])=>void>();
let operation:Promise<void>|null=null,pauseRequested=false,lastPublished=0,readVersion=0;
export const getOrganization=()=>state;
export function subscribeOrganization(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function subscribeOrganizedAssets(listener:(rows:OrganizationRow[])=>void){indexed.add(listener);return()=>{indexed.delete(listener);};}
function publish(patch:Partial<typeof state>){state={...state,...patch};listeners.forEach(fn=>fn());}
function requireNative(){if(!native)throw new Error('Esta función necesita Android 11 o posterior y una nueva compilación de WavePlay.');return native;}
export async function restoreOrganization(){
  if(state.running||state.preparing)return;
  const version=++readVersion;const raw=await requireNative().getJob();if(version===readVersion&&!state.running&&!state.preparing)publish({job:raw?JSON.parse(raw):null,error:''});
}
export async function prepareOrganization(folder:string,grouping:OrganizationGrouping){
  if(state.running||state.preparing||state.job)throw new Error('Finaliza la revisión pendiente antes de preparar otra.');
  readVersion++;publish({preparing:true,error:''});
  try{
    const rows=organizationCandidates(await listTracks('',true),folder,grouping);
    if(!rows.length)throw new Error('No hay archivos escaneados que se puedan organizar.');
    const job=JSON.parse(await requireNative().prepare(JSON.stringify({rows}))) as Job;publish({job,paused:false});
  }finally{publish({preparing:false});}
}
export function pauseOrganization(){pauseRequested=true;}
export function runOrganization(){
  if(operation)return operation;
  const job=state.job;if(!job)return Promise.reject(new Error('Prepara una vista previa primero.'));
  pauseRequested=false;publish({running:true,paused:false,error:''});
  operation=(async()=>{
    const engine=requireNative(),rows=job.rows.map(row=>({...row})),delivered:OrganizationRow[]=[];let authorized=new Set<string>();
    const flush=()=>{if(!delivered.length)return;const batch=delivered.splice(0);indexed.forEach(fn=>fn(batch));};
    try{
      for(let i=0;i<rows.length;i++){
        if(pauseRequested)break;
        let row=rows[i];if(!['pending','moving','moved'].includes(row.status))continue;
        if(row.status!=='moved'&&!authorized.has(row.assetId)){
          const batch=rows.slice(i).filter(t=>t.status==='pending'||t.status==='moving').slice(0,500).map(t=>t.assetId);
          if(!await engine.authorize(job.id,JSON.stringify(batch))){pauseRequested=true;break;}authorized=new Set(batch);
          if(pauseRequested)break;
        }
        row=JSON.parse(await engine.move(job.id,row.assetId));rows[i]=row;
        if(row.status==='moved'){
          await applyOrganizedAsset(row);await engine.acknowledge(job.id,row.assetId);
          rows[i]={...row,status:'indexed'};delivered.push(rows[i]);
        }
        if(Date.now()-lastPublished>=200){lastPublished=Date.now();flush();publish({job:{...job,rows:rows.map(t=>({...t}))}});}
      }
      flush();publish({job:{...job,rows},paused:pauseRequested});
    }catch(error){
      // Reload durable state: the file may have moved before SQLite or JS settled.
      flush();const raw=await engine.getJob().catch(()=>null);
      publish({job:raw?JSON.parse(raw):{...job,rows},error:error instanceof Error?error.message:String(error),paused:true});
    }
  })().finally(()=>{operation=null;publish({running:false});});
  return operation;
}
export async function finishOrganization(){
  if(state.running||state.preparing)throw new Error('Espera a que termine la operación actual.');
  readVersion++;if(state.job)await requireNative().finish(state.job.id);
  publish({job:null,error:'',paused:false});
}

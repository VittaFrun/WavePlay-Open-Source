import type { YouTubeVideo } from '../types';
export type SoloYouTubeState = {video:YouTubeVideo|null;queue:YouTubeVideo[];index:number;playing:boolean;position:number;revision:number;updatedAt:number;error:string;interrupted:boolean};
let state:SoloYouTubeState={video:null,queue:[],index:-1,playing:false,position:0,revision:0,updatedAt:0,error:'',interrupted:false};
type Navigation={next():void;previous():void;failed():void;fallback?:(code:number)=>boolean};
let navigation:Navigation|null=null;
export function setSoloNavigation(value:Navigation|null){navigation=value;return()=>{if(navigation===value)navigation=null;};}
export function handleSoloYouTubeError(code:number,message:string){
 if((code===101||code===150)&&navigation?.fallback?.(code))return;
 reportSoloYouTube({error:message,playing:false});
 failSoloYouTube();
}
export function failSoloYouTube(){navigation?.failed();}
export function isMixedSolo(){return navigation!==null;}
let visibleState=state;
export function getSoloYouTubeStatus(){
 if(visibleState.video!==state.video||visibleState.queue!==state.queue||visibleState.revision!==state.revision||visibleState.playing!==state.playing||visibleState.error!==state.error||visibleState.interrupted!==state.interrupted)visibleState=state;
 return visibleState;
}
const listeners=new Set<()=>void>();
export const getSoloYouTube=()=>state;
export function subscribeSoloYouTube(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function publish(patch:Partial<SoloYouTubeState>){state={...state,...patch};listeners.forEach(listener=>listener());}
export function startSoloYouTube(video:YouTubeVideo){
 if(!/^[A-Za-z0-9_-]{11}$/.test(video.id))return;
 if(state.video?.id===video.id){if(!state.playing||state.interrupted)commandSoloYouTube(true);return;}
 const index=state.queue.findIndex(item=>item.id===video.id);
 publish({video,queue:index>=0?state.queue:[...state.queue,video].slice(-100),index:index>=0?index:Math.min(state.queue.length,99),playing:true,position:0,revision:state.revision+1,updatedAt:Date.now(),error:'',interrupted:false});
}
export function enqueueSoloYouTube(video:YouTubeVideo){
 if(!/^[A-Za-z0-9_-]{11}$/.test(video.id)||state.queue.some(item=>item.id===video.id)||state.queue.length>=100)return false;
 if(!state.video)startSoloYouTube(video);else publish({queue:[...state.queue,video]});return true;
}
export function selectSoloYouTube(index:number){const video=state.queue[index];if(video)startSoloYouTube(video);}
export function nextSoloYouTube(){if(navigation){navigation.next();return;}if(state.index+1<state.queue.length)selectSoloYouTube(state.index+1);else commandSoloYouTube(false,state.video?.duration||state.position);}
export function previousSoloYouTube(){if(navigation){navigation.previous();return;}if(state.position>3||state.index<=0)commandSoloYouTube(state.playing,0);else selectSoloYouTube(state.index-1);}
export function removeSoloYouTube(id:string){if(id===state.video?.id)return;const queue=state.queue.filter(item=>item.id!==id);publish({queue,index:queue.findIndex(item=>item.id===state.video?.id)});}
export function stopSoloYouTube(){if(state.video)publish({video:null,queue:[],index:-1,playing:false,position:0,revision:state.revision+1,error:'',interrupted:false});}
export function commandSoloYouTube(playing:boolean,position=playing&&state.video&&state.video.duration>0&&state.position>=state.video.duration?0:state.position+(state.playing&&!state.interrupted?Math.max(0,(Date.now()-state.updatedAt)/1000):0)){
 if(!state.video||!Number.isFinite(position))return;
 publish({playing,position:Math.max(0,state.video.duration>0?Math.min(state.video.duration,position):position),revision:state.revision+1,updatedAt:Date.now(),error:'',interrupted:false});
}
export function reportSoloYouTube(patch:Partial<Pick<SoloYouTubeState,'position'|'error'|'interrupted'|'playing'>>){
 if(!state.video)return;
 if(patch.position!==undefined&&!Number.isFinite(patch.position))return;
 publish({...patch,updatedAt:patch.position!==undefined?Date.now():state.updatedAt});
}

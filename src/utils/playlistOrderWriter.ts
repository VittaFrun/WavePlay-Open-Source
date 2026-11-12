/** Keep the latest drag while a previous order is being persisted. */
export function createPlaylistOrderWriter<T>(
 write:(value:T)=>Promise<void>,
 failed:(committed:T,error:unknown)=>void,
 busy:(running:boolean)=>void=()=>{},
){
 let pending:T|undefined,hasPending=false,committed:T,running:Promise<void>|undefined,disposed=false;
 const drain=async()=>{
  try{
   while(hasPending){
    const value=pending!;hasPending=false;
    try{await write(value);committed=value;}
    catch(error){if(!hasPending&&!disposed)failed(committed,error);}
   }
  }finally{running=undefined;if(!disposed)busy(false);}
 };
 return {
  submit(value:T,previous:T){
   pending=value;hasPending=true;
   if(!running){committed=previous;busy(true);running=Promise.resolve().then(drain);}
  },
  flush(){return running??Promise.resolve();},
  isBusy(){return Boolean(running);},
  // Finish queued saves after navigation, but do not update the old screen.
  dispose(){disposed=true;},
  activate(){disposed=false;},
 };
}

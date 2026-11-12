/** A small UI clock; it never owns playback or sends room commands. */
export function createTrackPositionStore(){
  let trackId:string|null=null,position=0;
  const listeners=new Set<()=>void>();
  const notify=()=>{for(const listener of listeners)listener();};
  return {
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    getPosition:(id:string)=>id===trackId?position:0,
    setTrack(id:string|null){if(id===trackId)return;trackId=id;position=0;notify();},
    update(id:string,seconds:number){
      if(id!==trackId||!Number.isFinite(seconds)||seconds<0||position===seconds)return;
      position=seconds;notify();
    },
  };
}

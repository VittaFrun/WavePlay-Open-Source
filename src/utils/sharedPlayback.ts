type LoadState={isLoaded:boolean;error?:string|null};
type LoadablePlayer={
  readonly currentStatus:LoadState;
  addListener(event:'playbackStatusUpdate',listener:(state:LoadState)=>void):{remove():void};
};
export function waitForSharedAudio(player:LoadablePlayer,timeoutMs=12000):Promise<void>{
  // currentStatus also reports ended media as loaded; the native isLoaded property does not.
  if(player.currentStatus.isLoaded)return Promise.resolve();
  if(player.currentStatus.error)return Promise.reject(new Error(player.currentStatus.error));
  return new Promise((resolve,reject)=>{
    let subscription:{remove():void}|undefined;
    const finish=(error?:Error)=>{clearTimeout(timer);subscription?.remove();if(error)reject(error);else resolve();};
    const timer=setTimeout(()=>finish(new Error('El audio tardó demasiado en cargar. Vuelve a sincronizar.')),timeoutMs);
    subscription=player.addListener('playbackStatusUpdate',state=>{
      if(state.error)finish(new Error(state.error));else if(state.isLoaded)finish();
    });
    if(player.currentStatus.isLoaded)finish();
  });
}
/** Teardown can follow Expo releasing the native shared object during refresh. */
export function pauseForCleanup(player:{pause():void}) {
  try { player.pause(); return true; }
  catch (reason) {
    if (/shared object.*already released/i.test(String(reason))) return false;
    throw reason;
  }
}


/** A seek from an older load must never reposition the newly selected song. */
export async function seekWhenLoaded(
  player:LoadablePlayer&{readonly duration:number;seekTo(seconds:number):Promise<void>},
  seconds:number,
  isCurrent:()=>boolean,
){
  await waitForSharedAudio(player);
  if(!isCurrent())return false;
  const duration=player.duration;
  await player.seekTo(Math.max(0,Number.isFinite(duration)&&duration>0?Math.min(seconds,duration):seconds));
  return isCurrent();
}

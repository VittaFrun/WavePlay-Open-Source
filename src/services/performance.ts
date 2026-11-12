type Sample = { name: string; milliseconds: number; at: number };
const enabled = typeof __DEV__ !== 'undefined' && __DEV__;
const samples: Sample[] = [];
export function performanceStart(name: string) {
  if (!enabled) return () => {};
  const start = performance.now();
  let ended = false;
  return () => {
    if (ended) return; ended = true;
    const sample = { name, milliseconds: Math.round((performance.now() - start) * 10) / 10, at: Date.now() };
    samples.push(sample); if (samples.length > 200) samples.shift();
    console.info(`[WavePerf] ${sample.name}: ${sample.milliseconds}ms`);
  };
}
export function performanceSamples() { return enabled ? samples.slice() : []; }

const transitions = new Map<string, ()=>void>();
export function transitionStart(key:string) {
  if (enabled) transitions.set(key,performanceStart(`transition:${key}`));
}
export function transitionEnd(key:string) {
  transitions.get(key)?.(); transitions.delete(key);
}


const lastRenderLog=new Map<string,number>();
export function recordRender(name:string,phase:string,actualDuration:number){
  if(!enabled)return;
  const at=Date.now();
  samples.push({name:`render:${name}:${phase}`,milliseconds:Math.round(actualDuration*10)/10,at});
  if(samples.length>200)samples.shift();
  // Avoid profiling logs becoming periodic work during playback.
  if(actualDuration>=16&&at-(lastRenderLog.get(name)||0)>=1000){
    lastRenderLog.set(name,at);
    console.info(`[WaveRender] ${name} ${phase}: ${Math.round(actualDuration*10)/10}ms`);
  }
}

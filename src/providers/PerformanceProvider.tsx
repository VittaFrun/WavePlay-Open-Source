import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { initialFramePolicy, nextFramePolicy } from '../utils/performancePolicy';

const PerformanceContext=createContext(false);
export const useLightweightEffects=()=>useContext(PerformanceContext);

export function PerformanceProvider({children}:{children:React.ReactNode}) {
  const [reduced,setReduced]=useState(false);
  const policy=useRef(initialFramePolicy);
  useEffect(()=>{
    let active=AppState.currentState==='active';
    let frame=0;
    let rest:ReturnType<typeof setTimeout>|undefined;
    let previous=0;
    let windowStart=0;
    let frames=0;
    let slow=0;
    const tick=(now:number)=>{
      if(!active)return;
      if(previous&&now-previous<250){frames+=1;if(now-previous>32)slow+=1;}
      previous=now;
      if(!windowStart)windowStart=now;
      if((now-windowStart>=3000&&frames>=90)||now-windowStart>=5000){
        const next=nextFramePolicy(policy.current,frames,slow);
        if(next.reduced!==policy.current.reduced)setReduced(next.reduced);
        policy.current=next;frames=0;slow=0;windowStart=0;previous=0;
        rest=setTimeout(()=>{rest=undefined;if(active)frame=requestAnimationFrame(tick);},2000);
        return;
      }
      frame=requestAnimationFrame(tick);
    };
    const subscription=AppState.addEventListener('change',state=>{
      if(rest)clearTimeout(rest);rest=undefined;cancelAnimationFrame(frame);
      active=state==='active';previous=0;windowStart=0;frames=0;slow=0;
      if(active)frame=requestAnimationFrame(tick);
      else cancelAnimationFrame(frame);
    });
    if(active)frame=requestAnimationFrame(tick);
    return()=>{active=false;cancelAnimationFrame(frame);if(rest)clearTimeout(rest);subscription.remove();};
  },[]);
  return <PerformanceContext.Provider value={reduced}>{children}</PerformanceContext.Provider>;
}

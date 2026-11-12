import { useCallback, useLayoutEffect, useRef } from 'react';
import { useIsFocused } from 'expo-router';
import { performanceStart } from '../services/performance';

/** Post-commit layout timing; input-to-frame latency is measured on the device. */
export function useScenePerformance(name:string) {
  const focused=useIsFocused();
  const end=useRef<(()=>void)|null>(null);
  useLayoutEffect(()=>{
    if(!__DEV__||!focused)return;
    end.current=performanceStart(`scene-layout:${name}`);
    const frame=requestAnimationFrame(()=>{end.current?.();end.current=null;});
    return()=>{cancelAnimationFrame(frame);end.current=null;};
  },[focused,name]);
  return useCallback(()=>{end.current?.();end.current=null;},[]);
}

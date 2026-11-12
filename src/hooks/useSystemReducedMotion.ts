import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

let reduced=false,revision=0;
let subscription:ReturnType<typeof AccessibilityInfo.addEventListener>|undefined;
const listeners=new Set<()=>void>();
const snapshot=()=>reduced;
function accept(value:boolean){if(value===reduced)return;reduced=value;for(const listener of listeners)listener();}
function subscribe(listener:()=>void){
  listeners.add(listener);
  if(!subscription){
    subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{revision++;accept(value);});
    const requested=++revision;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(subscription&&revision===requested)accept(value);}).catch(()=>{});
  }
  return ()=>{listeners.delete(listener);if(!listeners.size){revision++;subscription?.remove();subscription=undefined;}};
}
export function useSystemReducedMotion(){return useSyncExternalStore(subscribe,snapshot,snapshot);}

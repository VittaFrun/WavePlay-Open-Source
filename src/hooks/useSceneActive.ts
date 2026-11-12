import { useIsFocused } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

const listeners=new Set<()=>void>();
let subscription:ReturnType<typeof AppState.addEventListener>|undefined;
function subscribe(listener:()=>void){
  listeners.add(listener);
  if(!subscription)subscription=AppState.addEventListener('change',()=>{for(const notify of listeners)notify();});
  return ()=>{listeners.delete(listener);if(!listeners.size){subscription?.remove();subscription=undefined;}};
}
const foreground=()=>AppState.currentState==='active';
const serverSnapshot=()=>true;

export function useSceneActive(){
  const focused=useIsFocused();
  const active=useSyncExternalStore(subscribe,foreground,serverSnapshot);
  return focused&&active;
}

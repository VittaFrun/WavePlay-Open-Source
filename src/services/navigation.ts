import { router } from 'expo-router';
import { createNavigationGate } from '../utils/navigationGate';

const open=createNavigationGate();
export function openRoute(target:Parameters<typeof router.push>[0]){
  const key=typeof target==='string'?target:JSON.stringify([target.pathname,Object.entries(target.params||{}).sort(([a],[b])=>a.localeCompare(b))]);
  return open(key,()=>router.push(target));
}

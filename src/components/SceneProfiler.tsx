import { Profiler, type PropsWithChildren, type ProfilerOnRenderCallback } from 'react';
import { recordRender } from '../services/performance';

const onRender:ProfilerOnRenderCallback=(id,phase,actualDuration)=>recordRender(id,phase,actualDuration);
export function SceneProfiler({name,children}:PropsWithChildren<{name:string}>){
  return __DEV__?<Profiler id={name} onRender={onRender}>{children}</Profiler>:children;
}

import { type PropsWithChildren, useEffect } from 'react';
import { Animated, Easing, useAnimatedValue } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSceneActive } from '../hooks/useSceneActive';

/** Animate presentation only; playback and controls never wait for this effect. */
export function TrackTransition({children,trackId}:{children:PropsWithChildren['children'];trackId?:string}){
 const reduced=useReducedMotion(),active=useSceneActive();
 const progress=useAnimatedValue(1);
 useEffect(()=>{
  if(reduced||!active){progress.stopAnimation();progress.setValue(1);return;}
  progress.setValue(0);
  const animation=Animated.timing(progress,{toValue:1,duration:180,easing:Easing.out(Easing.cubic),useNativeDriver:true,isInteraction:false});
  animation.start();return()=>animation.stop();
 },[progress,reduced,active,trackId]);
 return <Animated.View style={{opacity:progress.interpolate({inputRange:[0,1],outputRange:[.72,1]}),transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[4,0]})}]}}>{children}</Animated.View>;
}

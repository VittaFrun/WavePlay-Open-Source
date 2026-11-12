import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { View, useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

export function SwipeSurface({children,onSwipe,edgeOnly=false,excludeEdges=false,enabled=true}: {children:React.ReactNode;onSwipe:(direction:1|-1)=>void;edgeOnly?:boolean;excludeEdges?:boolean;enabled?:boolean}) {
  const {width}=useWindowDimensions();
  const gesture=useMemo(()=>Gesture.Pan().enabled(enabled).activeOffsetX([-45,45]).failOffsetY([-18,18])
    .onTouchesDown((event,manager)=>{const x=event.allTouches[0]?.x;if(x!==undefined&&((edgeOnly&&x>28&&x<width-28)||(excludeEdges&&(x<=28||x>=width-28))))manager.fail();})
    .onEnd(event=>{if(Math.abs(event.translationX)>65)scheduleOnRN(onSwipe,event.translationX<0?1:-1);}),[edgeOnly,excludeEdges,width,onSwipe,enabled]);
  return <GestureDetector gesture={gesture}><View collapsable={false} style={{flex:1}}>{children}</View></GestureDetector>;
}

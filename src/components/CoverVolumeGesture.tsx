import { useEffect, useMemo, useRef, useState } from 'react';
/* eslint-disable react-hooks/refs -- Gesture callbacks read refs only after a touch begins, not during render. */
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { fonts, useTheme } from '../theme';

export function CoverVolumeGesture({ width, height, volume, onVolume, children }: { width:number; height:number; volume:number; onVolume:(value:number)=>void; children:React.ReactNode }) {
  const {colors}=useTheme();
  const [visible,setVisible]=useState(false);
  const [display,setDisplay]=useState(volume);
  const dragging=useRef(false);
  const initial=useRef(volume);
  const current=useRef(volume);
  const hide=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{current.current=volume},[volume]);
  useEffect(()=>()=>{if(hide.current)clearTimeout(hide.current)},[]);
  const gesture=useMemo(()=>Gesture.Pan().runOnJS(true).activeOffsetY([-14,14]).failOffsetX([-24,24])
    .onTouchesDown((event,manager)=>{const point=event.allTouches[0];if(!point||point.x<width*.28||point.x>width*.72||point.y<height*.2||point.y>height*.8)manager.fail()})
    .onStart(()=>{dragging.current=true;if(hide.current)clearTimeout(hide.current);initial.current=current.current;setDisplay(current.current);setVisible(true)})
    .onUpdate(event=>{const next=Math.round(Math.max(0,Math.min(1,initial.current-event.translationY/230))*50)/50;if(Math.abs(next-current.current)<.02)return;current.current=next;setDisplay(next);onVolume(next)})
    .onFinalize(event=>{if(!dragging.current)return;dragging.current=false;const next=Math.round(Math.max(0,Math.min(1,initial.current-event.translationY/230))*100)/100;if(next!==current.current){current.current=next;setDisplay(next);onVolume(next)}hide.current=setTimeout(()=>setVisible(false),850)}),[width,height,onVolume]);
  return <GestureDetector gesture={gesture}><View style={{width,height}}>{children}{visible?<View pointerEvents="none" style={{position:'absolute',alignSelf:'center',top:height*.22,width:66,height:height*.56,borderRadius:28,alignItems:'center',justifyContent:'flex-end',padding:9,backgroundColor:'rgba(9,10,16,.84)',borderWidth:1,borderColor:colors.accentBorder}}><View style={{width:28,height:'70%',borderRadius:14,backgroundColor:colors.surfaceHigh,justifyContent:'flex-end',overflow:'hidden'}}><View style={{height:`${display*100}%`,backgroundColor:colors.pink,borderRadius:14}}/></View><MaterialCommunityIcons name={display===0?'volume-off':'volume-high'} size={18} color={colors.text} style={{marginTop:8}}/><Text style={{fontFamily:fonts.bold,fontSize:10,color:colors.text}}>{Math.round(display*100)}</Text></View>:null}</View></GestureDetector>;
}

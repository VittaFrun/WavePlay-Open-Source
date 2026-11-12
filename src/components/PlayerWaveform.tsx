import { memo, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTheme } from '../theme';

const BAR_COUNT=17;
const BAR_HEIGHT=32;

export const PlayerWaveform=memo(function PlayerWaveform({active=false}:{active?:boolean}) {
  const {colors}=useTheme();
  const reduced=useReducedMotion();
  const focused=useIsFocused();
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const phase=useRef(new Animated.Value(0)).current;
  const moving=active&&!reduced&&focused&&foreground;

  useEffect(()=>{
    const listener=AppState.addEventListener('change',state=>setForeground(state==='active'));
    return()=>listener.remove();
  },[]);

  useEffect(()=>{
    if(!moving){phase.stopAnimation();phase.setValue(0);return;}
    const loop=Animated.loop(Animated.timing(phase,{toValue:1,duration:1600,easing:Easing.linear,useNativeDriver:true,isInteraction:false}));
    loop.start();
    return()=>loop.stop();
  },[moving,phase]);

  return <View accessibilityLabel={moving?'Ondas animadas durante la reproducción':'Ondas en pausa'} style={styles.waveform}>
    {Array.from({length:BAR_COUNT},(_,index)=>{
      const stagger=(index%5)*.11;
      const scale=phase.interpolate({inputRange:[0,.25,.5,.75,1],outputRange:[.24+stagger,.7-stagger,.38+stagger,.88-stagger,.24+stagger]});
      const resting=.22+((index*3)%5)*.045;
      return <View key={index} style={styles.slot}><Animated.View style={[styles.bar,{backgroundColor:index%6===0?colors.cyan:index%2?colors.pink:colors.purple,opacity:moving?.72:.38,transform:[{scaleY:moving?scale:resting},{translateY:moving?Animated.multiply(Animated.subtract(1,scale),BAR_HEIGHT/2):(1-resting)*BAR_HEIGHT/2}]}]}/></View>;
    })}
  </View>;
});

const styles=StyleSheet.create({
  waveform:{height:38,width:'100%',flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between'},
  slot:{height:BAR_HEIGHT,width:4,justifyContent:'flex-end'},
  bar:{height:BAR_HEIGHT,width:3,borderRadius:3},
});

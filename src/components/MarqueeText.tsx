import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useAnimatedValue, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSceneActive } from '../hooks/useSceneActive';
import { useTransport } from '../providers/WaveProvider';
import { marqueePlan } from '../utils/marquee';

export function MarqueeText({text,style,enabled=true}:{text:string;style?:StyleProp<TextStyle>;enabled?:boolean}) {
  const sceneActive=useSceneActive(),reduceMotion=useReducedMotion();
  const {fontScale}=useWindowDimensions();
  const [viewport,setViewport]=useState(0);
  const [metrics,setMetrics]=useState({width:0,height:0});
  const offset=useAnimatedValue(0);
  const plan=marqueePlan(metrics.width,viewport);
  const moving=Boolean(plan&&enabled&&sceneActive&&!reduceMotion);
  const distance=plan?.distance??0;const duration=plan?.duration??0;
  useEffect(()=>{
    offset.setValue(0);
    if(!moving)return;
    const loop=Animated.loop(Animated.sequence([Animated.delay(1100),Animated.timing(offset,{toValue:-distance,duration,easing:Easing.linear,useNativeDriver:true,isInteraction:false}),Animated.delay(300)]));
    loop.start();return()=>{loop.stop();offset.stopAnimation();offset.setValue(0)};
  },[offset,moving,distance,duration,text]);
  const base=StyleSheet.flatten(style)||{};
  const height=Math.ceil(metrics.height||((base.lineHeight||((base.fontSize||14)*1.4))*fontScale));
  const textStyle=[{includeFontPadding:false,lineHeight:base.lineHeight||Math.ceil((base.fontSize||14)*1.4)},style];
  return <View accessible accessibilityLabel={text} onLayout={event=>setViewport(event.nativeEvent.layout.width)} style={{overflow:'hidden',height,alignSelf:'stretch'}}>
    <Text accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" numberOfLines={1} style={[textStyle,{position:'absolute',width:10000,opacity:0}]} onTextLayout={event=>{const line=event.nativeEvent.lines[0];if(line)setMetrics(current=>current.width===Math.ceil(line.width)+1&&current.height===line.height?current:{width:Math.ceil(line.width)+1,height:line.height})}}>{text}</Text>
    {moving?<Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{flexDirection:'row',width:distance*2,transform:[{translateX:offset}]}}><Text numberOfLines={1} style={[textStyle,{width:metrics.width,marginRight:plan?.gap}]}>{text}</Text><Text numberOfLines={1} style={[textStyle,{width:metrics.width}]}>{text}</Text></Animated.View>:<Text numberOfLines={1} style={textStyle}>{text}</Text>}
  </View>;
}

export function PlayingTitle({text,style}:{text:string;style?:StyleProp<TextStyle>}) {
  const {playing}=useTransport();
  return <MarqueeText text={text} style={style} enabled={playing}/>;
}

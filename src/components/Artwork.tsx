import { memo, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WaveLogo } from './WaveLogo';
export const Artwork=memo(function Artwork({uri,size=54,square=false}:{uri?:string|null;size?:number;square?:boolean}){const [failed,setFailed]=useState<string|null>(null);const radius=square?0:Math.min(8,size*.2);if(uri&&failed!==uri)return <Image source={{uri}} onError={()=>setFailed(uri)} resizeMode="cover" resizeMethod="resize" fadeDuration={0} style={{width:size,height:size,borderRadius:radius}}/>;if(size<=56)return <View style={[styles.fallback,{width:size,height:size,borderRadius:radius,backgroundColor:'#292932'}]}><MaterialCommunityIcons name="music-note" size={size*.5} color="#B9B6C8"/></View>;return <LinearGradient colors={['#34343C','#1B1B22']} style={[styles.fallback,{width:size,height:size,borderRadius:radius}]}><WaveLogo size={size*.52}/></LinearGradient>});
const styles=StyleSheet.create({fallback:{alignItems:'center',justifyContent:'center'}});

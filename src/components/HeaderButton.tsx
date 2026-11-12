import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useContext, type ComponentProps, type RefObject } from 'react';
import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { GlassTargets } from './GlassSurface';
import { useLightweightEffects } from '../providers/PerformanceProvider';

export function HeaderButton({icon,label,onPress,disabled=false,size=22,target}:{icon:ComponentProps<typeof MaterialCommunityIcons>['name'];label:string;onPress:()=>void;disabled?:boolean;size?:number;target?:RefObject<View|null>}) {
  const {colors}=useTheme();
  const {wallpaper}=useContext(GlassTargets);
  const lightweight=useLightweightEffects();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,{borderColor:colors.border,opacity:disabled ? .4 : pressed ? .65 : 1}]}>{!lightweight?<BlurView pointerEvents="none" blurTarget={target??wallpaper} blurMethod="dimezisBlurViewSdk31Plus" intensity={40} tint="dark" style={StyleSheet.absoluteFill}/>:null}<View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:lightweight?colors.surfaceHigh:'rgba(27,27,34,.48)'}]}/><MaterialCommunityIcons name={icon} size={size} color={colors.text}/></Pressable>;
}
const s=StyleSheet.create({button:{width:44,height:44,borderRadius:22,overflow:'hidden',alignItems:'center',justifyContent:'center',borderWidth:StyleSheet.hairlineWidth,backgroundColor:'rgba(27,27,34,.38)'}});

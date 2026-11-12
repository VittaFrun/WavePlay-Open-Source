import { BlurView } from 'expo-blur';
import { useContext, type PropsWithChildren, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassTargets } from './GlassSurface';
import { useLightweightEffects } from '../providers/PerformanceProvider';
import { useTheme } from '../theme';

/** The same readable surface for local audio, YouTube and fixed player controls. */
export function PlaybackSurface({children,style,blurTarget}:{children?:PropsWithChildren['children'];style?:StyleProp<ViewStyle>;blurTarget?:RefObject<View|null>}){
  const {colors,appearance}=useTheme(),{wallpaper}=useContext(GlassTargets),lightweight=useLightweightEffects();
  return <View style={[{backgroundColor:colors.background,overflow:'hidden',borderColor:colors.accentBorder},style]}>
    {!lightweight?<BlurView pointerEvents="none" blurTarget={blurTarget??wallpaper} blurMethod="dimezisBlurViewSdk31Plus" intensity={appearance.panelBlur} tint="dark" style={StyleSheet.absoluteFill}/>:null}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:lightweight?'rgba(19,19,26,.94)':'rgba(19,19,26,.38)'}]}/>
    {children}
  </View>;
}

import { BlurView } from 'expo-blur';
import { createContext, useContext, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { useLightweightEffects } from '../providers/PerformanceProvider';

export const GlassTargets = createContext<{ wallpaper: RefObject<View | null>; content: RefObject<View | null> }>({wallpaper:{current:null},content:{current:null}});
export function PanelBackdrop({ enabled }: { intensity?: number; target?: RefObject<View|null>; enabled?: boolean }) {
  const {appearance}=useTheme();
  if(!(enabled ?? appearance.background!=='solid'))return null;
  // Dozens of simultaneous BlurViews create large offscreen GPU surfaces.
  // Cards already have tinted backgrounds; this layer keeps the glass look
  // while reserving real blur for menus and the navigation dock.
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(19,19,26,.24)'}]}/>;
}
export function MenuBackdrop() {
  const {content}=useContext(GlassTargets);
  const lightweight=useLightweightEffects();
  if(lightweight)return <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(19,19,26,.96)'}]}/>;
  return <><BlurView pointerEvents="none" blurTarget={content} blurMethod="dimezisBlurViewSdk31Plus" intensity={35} tint="dark" style={StyleSheet.absoluteFill}/><View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(10,10,16,.18)'}]}/></>;
}

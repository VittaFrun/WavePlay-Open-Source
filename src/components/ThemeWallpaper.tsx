import { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { Appearance } from '../utils/appearance';
import { BackgroundShade } from './BackgroundShade';

export const ThemeWallpaper = memo(function ThemeWallpaper({appearance}:{appearance:Appearance}) {
  const source=appearance.background==='anime'?require('../../assets/theme-anime.png'):appearance.background==='custom'&&appearance.imageUri?{uri:appearance.imageUri}:null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#13131A',overflow:'hidden'}]}>{source?<><Image source={source} blurRadius={appearance.blur} resizeMode={appearance.imageFit} style={[StyleSheet.absoluteFill,{width:'100%',height:'100%'}]}/><BackgroundShade appearance={appearance}/></>:null}</View>;
});

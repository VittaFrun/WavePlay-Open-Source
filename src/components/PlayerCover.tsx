import { useEffect } from 'react';
import { Animated, AppState, Easing, StyleSheet, Text, View, useAnimatedValue } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Artwork } from './Artwork';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { fonts, useTheme } from '../theme';
import type { Track } from '../types';

export const playerPresentations = ['classic', 'vinyl', 'immersive', 'editorial'] as const;
export type PlayerPresentation = typeof playerPresentations[number];
export const presentationLabels: Record<PlayerPresentation, string> = {
  classic: 'Portada clásica', vinyl: 'Vinilo', immersive: 'Pantalla completa', editorial: 'Editorial',
};

export function PlayerCover({ track, mode, size, width, height, playing }: {
  track: Track; mode: PlayerPresentation; size: number; width: number; height: number; playing: boolean;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const rotation = useAnimatedValue(0);
  useEffect(() => {
    if (mode !== 'vinyl' || !playing || reduceMotion || !focused) return;
    let animation: Animated.CompositeAnimation | null = null;
    let alive = true;
    const stop = () => { animation?.stop(); rotation.stopAnimation(); };
    const start = () => {
      stop();
      rotation.stopAnimation(value => {
        if (!alive) return;
        animation = Animated.timing(rotation, { toValue: 1, duration: Math.max(1, (1 - value) * 18000),
          easing: Easing.linear, useNativeDriver: true, isInteraction: false });
        animation.start(({ finished }) => {
          if (!finished || !alive) return;
          rotation.setValue(0);
          animation = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 18000,
            easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
          animation.start();
        });
      });
    };
    if (AppState.currentState === 'active') start();
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') start(); else stop();
    });
    return () => { alive = false; listener.remove(); stop(); };
  }, [mode, playing, reduceMotion, focused, rotation]);
  if (mode === 'immersive') return <View style={{ width, height, overflow: 'hidden' }}>
    <View style={{ position: 'absolute', left: (width - Math.max(width, height)) / 2,
      top: (height - Math.max(width, height)) / 2 }}><Artwork uri={track.artwork} size={Math.max(width, height)} square/></View>
  </View>;
  if (mode === 'editorial') return <View style={{ width, height, flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 12 }}>
    <Artwork uri={track.artwork} size={Math.min(size, width * .51)}/>
    <View style={{ flex: 1 }}><Text style={{ fontFamily: fonts.bold, color: colors.pink, fontSize: 11 }}>AHORA SUENA</Text>
      <Text numberOfLines={4} style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 19, lineHeight: 26, marginTop: 10 }}>{track.title}</Text>
      <Text numberOfLines={2} style={{ fontFamily: fonts.regular, color: colors.muted, fontSize: 12, marginTop: 8 }}>{track.artist}</Text></View>
  </View>;
  if (mode === 'vinyl') return <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
    <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#111114',
      borderWidth: 2, borderColor: '#333338', alignItems: 'center', justifyContent: 'center',
      transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
      {[.92, .83, .74, .65].map(ratio => <View key={ratio} style={{ position: 'absolute', width: size * ratio,
        height: size * ratio, borderRadius: size, borderWidth: 1, borderColor: '#29292F' }}/>)}
      <View style={{ width: size * .47, height: size * .47, borderRadius: size, overflow: 'hidden' }}>
        <Artwork uri={track.artwork} size={size * .47} square/>
      </View><View style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6,
        backgroundColor: '#111114', borderWidth: 2, borderColor: '#A8A8AE' }}/>
    </Animated.View>
  </View>;
  return <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      <Artwork uri={track.artwork} size={size}/>
    </View>
  </View>;
}

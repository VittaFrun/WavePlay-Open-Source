import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { backgroundGradient, type Appearance } from '../utils/appearance';

export function BackgroundShade({ appearance }: { appearance: Appearance }) {
  return <><View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:`rgba(10,10,16,${appearance.dim})`}]}/><LinearGradient pointerEvents="none" {...backgroundGradient(appearance)} style={StyleSheet.absoluteFill}/></>;
}

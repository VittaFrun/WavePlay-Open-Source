import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { PanelBackdrop } from './GlassSurface';
import { useTheme } from '../theme';
export function GlassCard({children,style}:{children:React.ReactNode;style?:StyleProp<ViewStyle>}){const {colors}=useTheme();return <View style={[styles.card,{backgroundColor:colors.surface3},style]}><PanelBackdrop/>{children}</View>}
const styles=StyleSheet.create({card:{borderWidth:1,borderColor:'rgba(255,255,255,.08)',borderRadius:8,overflow:'hidden'}});

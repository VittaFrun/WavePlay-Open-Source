import { View, StyleSheet } from 'react-native';
import { PanelBackdrop } from './GlassSurface';
import { useTheme } from '../theme';

export function FixedHeader({children}: {children: React.ReactNode}) {
  const {colors}=useTheme();
  return <View style={{paddingHorizontal:20,overflow:'hidden',backgroundColor:colors.surface2,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border}}><PanelBackdrop enabled/>{children}</View>;
}

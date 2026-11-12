import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

export function WaveLogo({size=42,active=false}:{size?:number;active?:boolean}){
  const {gradients}=useTheme();
  const heights=[.34,.7,1,.7,.34];
  return <View style={[styles.row,{width:size,height:size}]}>{heights.map((h,i)=><LinearGradient key={i} colors={gradients.brand} style={{width:size*.115,height:size*h,borderRadius:size*.08,opacity:active?1:.9}}/>)}</View>;
}
const styles=StyleSheet.create({row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}});

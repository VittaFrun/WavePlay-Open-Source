import { Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, useTheme } from "../theme";
export function WaveSection({title,action,onPress}:{title:string;action?:string;onPress?:()=>void}){const s=useS();return <View style={s.row}><Text style={s.title}>{title}</Text>{action?<Pressable hitSlop={8} onPress={onPress}><Text style={s.action}>{action}</Text></Pressable>:null}</View>}
const useS = () => { const {colors} = useTheme(); return StyleSheet.create({row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14},title:{fontFamily:fonts.bold,fontSize:20,color:colors.text,letterSpacing:-.5},action:{fontFamily:fonts.semiBold,fontSize:13,color:colors.purple}}); };

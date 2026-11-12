import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
export function WaveSkeleton({height=64,width='100%',radius=18}:{height?:number;width?:number|string;radius?:number}){const s=useS();return <View style={[s.root,{height,width:width as any,borderRadius:radius}]}/>}
const useS = () => { const {colors} = useTheme(); return StyleSheet.create({root:{backgroundColor:colors.surface3,opacity:.75}}); };

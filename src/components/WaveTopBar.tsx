import { HeaderButton } from './HeaderButton';
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { fonts, useTheme } from "../theme";
import { WaveLogo } from "./WaveLogo";

export function WaveTopBar({title,action="settings",onAction,friends=false}:{title?:string;action?:"settings"|"activity"|"none";onAction?:()=>void;friends?:boolean}) {const {colors}=useTheme();const s=useS();
  const press=()=>{if(onAction)onAction();else if(action==='settings')router.push('/settings');};
  return <View style={s.root}>
    <View style={s.brand}><WaveLogo size={32}/><View style={{flex:1}}><Text numberOfLines={1} style={s.title}>{title||'WavePlay'}</Text><Text style={{fontFamily:fonts.semiBold,fontSize:10,color:colors.pink}}>WAVEPLAY</Text></View></View>
    {friends?<HeaderButton icon="account-group-outline" label="Escuchar con amigos" onPress={()=>router.push('/friends')}/>:null}
    {action!=='none'?<HeaderButton icon={action==='activity'?'progress-download':'cog-outline'} label={action==='activity'?'Abrir actividad de descargas':'Abrir ajustes'} onPress={press}/>:null}
  </View>;
}
const useS = () => { const {colors} = useTheme(); return StyleSheet.create({root:{minHeight:68,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{flexDirection:'row',alignItems:'center',gap:10,flex:1},wordmark:{fontFamily:fonts.extraBold,fontSize:20,color:colors.text,letterSpacing:0},title:{fontFamily:fonts.bold,fontSize:21,color:colors.text,letterSpacing:0},action:{width:46,height:46,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.055)',borderWidth:1,borderColor:colors.border},pressed:{opacity:.65,transform:[{scale:.96}]}}); };

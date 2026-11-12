import { openRoute } from '../../services/navigation';
import { useSceneActive } from '../../hooks/useSceneActive';
import { PanelBackdrop } from '../../components/GlassSurface';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WaveTopBar } from '../../components/WaveTopBar';
import { useDownloads, useLibrary, useWaveActions, useScan, useTransport } from '../../providers/WaveProvider';
import { listeningTotal } from '../../services/database';
import { fonts, useTheme } from '../../theme';

import { useRoomSelector } from '../../providers/FriendsListeningProvider';

export default function Profile() {const {colors}=useTheme();const s=useS();
  const user=useRoomSelector(value=>value.user);const avatar=typeof user?.user_metadata?.avatar_url==='string'?user.user_metadata.avatar_url:typeof user?.user_metadata?.picture==='string'?user.user_metadata.picture:null;
  const [avatarFailed,setAvatarFailed]=useState<string|null>(null);
  const wave={...useLibrary(),...useWaveActions(),...useScan()};const {downloads}=useDownloads();const insets=useSafeAreaInsets();
  const [seconds,setSeconds]=useState<number|null>(null);const [error,setError]=useState(false);
  const sceneActive=useSceneActive(),{playing}=useTransport();
  useEffect(()=>{if(!sceneActive)return;let active=true,pending=false;const update=async()=>{if(pending)return;pending=true;try{const value=await listeningTotal();if(active){setSeconds(value);setError(false);}}catch{if(active)setError(true);}finally{pending=false;}};void update();const timer=playing?setInterval(()=>void update(),30000):undefined;return()=>{active=false;if(timer)clearInterval(timer);};},[sceneActive,playing]);
  const stats=[{value:seconds===null?'—':`${Math.floor(seconds/3600)} h ${Math.floor(seconds%3600/60)} min`,label:'Tiempo escuchado'}, {value:String(wave.tracks.length),label:'Canciones'}, {value:String(wave.playlists.length),label:'Playlists'}];
  return <View style={s.root}><ScrollView contentContainerStyle={[s.content,{paddingBottom:190+insets.bottom}]}><WaveTopBar title="Perfil"/>
    <View style={s.identity}><PanelBackdrop/><View style={{position:'absolute',top:0,left:0,right:0,height:3,backgroundColor:colors.pink}}/>
      <View style={s.identityTop}><View style={s.avatar}>{avatar&&avatarFailed!==avatar?<Image source={{uri:avatar}} onError={()=>setAvatarFailed(avatar)} style={{width:54,height:54,borderRadius:27}} accessibilityLabel="Foto de tu cuenta"/>:<MaterialCommunityIcons name="account-music-outline" size={30} color={colors.pink}/>}</View><View style={s.copy}><Text style={s.kicker}>MI COLECCIÓN</Text><Text style={s.title}>Tu universo musical</Text><Text style={s.caption}>En este dispositivo</Text></View></View>
      <View style={s.stats}>{stats.map((item,index)=><View key={item.label} style={[s.stat,index===0&&{flex:1.7}]}><Text style={[s.statValue,index===0&&{fontSize:17}]}>{item.value}</Text><Text style={s.statLabel}>{item.label}</Text></View>)}</View>
      {error?<Text style={s.error}>No se pudieron cargar las horas escuchadas.</Text>:null}
    </View>
    <Text style={s.section}>Tu actividad</Text>
    <Action icon="chart-bar" title="Tu ritmo" detail="Tus canciones, artistas y días de música" onPress={()=>openRoute('/statistics' as never)}/>
    <Action icon="account-group-outline" title="Escuchar con amigos" detail="Comparte música en una sala" onPress={()=>openRoute('/friends' as never)}/>
    <Text style={s.section}>Biblioteca y almacenamiento</Text>
    <Action icon="radar" title={wave.scanning?'Escaneando música':'Actualizar biblioteca'} detail={wave.scanning?`${wave.scanCount} archivos encontrados`:undefined} onPress={()=>void wave.scan()}/>
    <Action icon="download-outline" title="Descargas" detail={`${downloads.length} en el historial`} onPress={()=>openRoute('/(tabs)/downloads')}/>
    <Text style={s.section}>Preferencias</Text>
    <Action icon="account-circle-outline" title={user?'Cuenta y respaldo local':'Iniciar sesión'} detail={user?user.email:'Google, correo o continuar sin cuenta'} onPress={()=>openRoute((user?'/account-backup':'/welcome') as never)}/>
    <Action icon="palette-outline" title="Apariencia" detail="Temas, colores y fondo" onPress={()=>openRoute('/appearance' as never)}/>
    <Action icon="cog-outline" title="Ajustes" onPress={()=>openRoute('/settings')}/>
    <Action icon="shield-check-outline" title="Privacidad y uso responsable" onPress={()=>openRoute('/legal')}/>
  </ScrollView></View>;
}

function Action({icon,title,detail,onPress}:{icon:React.ComponentProps<typeof MaterialCommunityIcons>['name'];title:string;detail?:string;onPress:()=>void}){const {colors}=useTheme();const s=useS();
  return <Pressable onPress={onPress} style={({pressed})=>[s.row,pressed&&{opacity:.7}]}><MaterialCommunityIcons name={icon} size={23} color={colors.pink}/><View style={s.copy}><Text style={s.rowTitle}>{title}</Text>{detail?<Text style={s.caption}>{detail}</Text>:null}</View><MaterialCommunityIcons name="chevron-right" size={22} color={colors.outline}/></Pressable>;
}
const useS = () => { const {colors} = useTheme(); return StyleSheet.create({root:{flex:1,backgroundColor:colors.canvas},content:{paddingHorizontal:20},identity:{overflow:'hidden',backgroundColor:colors.surface3,borderRadius:8,padding:18,marginTop:16},identityTop:{flexDirection:'row',alignItems:'center',gap:14},avatar:{width:56,height:56,borderRadius:28,backgroundColor:colors.surfaceHigh,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.pink},copy:{flex:1},kicker:{fontFamily:fonts.bold,fontSize:10,color:colors.pink},title:{fontFamily:fonts.extraBold,fontSize:20,color:colors.text,marginTop:4},caption:{fontFamily:fonts.regular,fontSize:12,color:colors.muted,marginTop:4},stats:{flexDirection:'row',marginTop:24,gap:12},stat:{flex:1,minWidth:0,borderLeftWidth:StyleSheet.hairlineWidth,borderLeftColor:colors.border,paddingLeft:10},statValue:{fontFamily:fonts.extraBold,fontSize:21,color:colors.text},statLabel:{fontFamily:fonts.regular,fontSize:11,color:colors.muted,marginTop:6},section:{fontFamily:fonts.bold,fontSize:18,color:colors.text,marginTop:28,marginBottom:10},row:{minHeight:70,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:14,borderBottomWidth:1,borderBottomColor:colors.border},rowTitle:{fontFamily:fonts.semiBold,fontSize:14,color:colors.text},track:{minHeight:76,flexDirection:'row',alignItems:'center',gap:12},rank:{width:14,fontFamily:fonts.bold,fontSize:12,color:colors.outline},error:{color:colors.danger,fontFamily:fonts.regular,fontSize:12,marginTop:12}}); };

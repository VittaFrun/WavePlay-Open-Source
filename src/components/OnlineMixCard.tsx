import { AppAlert as Alert } from '../services/appAlert';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLibrary, useWaveActions } from '../providers/WaveProvider';
import { buildOnlineMix } from '../utils/onlineMix';
import { fonts, useTheme } from '../theme';

export function OnlineMixCard(){
  const {tracks}=useLibrary(),actions=useWaveActions(),{colors}=useTheme();
  const mix=useMemo(()=>buildOnlineMix(tracks),[tracks]);
  if(!mix.length)return null;
  return <View style={{padding:16,borderRadius:18,backgroundColor:colors.surface2,marginVertical:12}}><Text style={{color:colors.text,fontFamily:fonts.bold,fontSize:17}}>Tu mezcla de YouTube</Text><Text style={{color:colors.muted,marginTop:6}}>{mix.length} canciones de tu biblioteca</Text><View style={{flexDirection:'row',gap:24}}><Pressable onPress={()=>void actions.play(mix[0],mix,'online-mix',true)} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:colors.pink,fontFamily:fonts.bold}}>Reproducir</Text></Pressable><Pressable onPress={()=>void actions.saveMixAsPlaylist('Mi mezcla de YouTube',mix.map(t=>t.id)).catch(()=>Alert.alert('No se pudo guardar la mezcla'))} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:colors.text,fontFamily:fonts.semiBold}}>Guardar playlist</Text></Pressable></View></View>;
}

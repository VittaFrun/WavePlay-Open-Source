import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { fonts, useTheme } from '../theme';
import type { Track } from '../types';
import type { RoomSongIntent } from '../utils/listeningRoom';

export const RoomSongChoiceSheet=memo(function RoomSongChoiceSheet({track,host,onClose,onChoose}:{track:Track|null;host:boolean;onClose:()=>void;onChoose:(intent:RoomSongIntent)=>void}){
  const {colors}=useTheme();
  const options: {intent:RoomSongIntent;icon:'playlist-plus'|'skip-next'|'play-circle-outline';title:string;caption:string}[]=[
    {intent:'queue',icon:'playlist-plus',title:'Añadir a la cola de la sala',caption:'Al final, sin interrumpir la canción actual.'},
    {intent:'next',icon:'skip-next',title:'Reproducir como siguiente',caption:'Después de la canción que está sonando.'},
    {intent:'now',icon:'play-circle-outline',title:'Reproducir ahora',caption:'Cambiar la canción para todos en la sala.'},
  ];
  return <BottomSheet visible={Boolean(track)} title="Estás escuchando en una sala" onClose={onClose}>
    <Text numberOfLines={2} style={{fontFamily:fonts.bold,color:colors.text,fontSize:16}}>{track?.title}</Text>
    <Text numberOfLines={1} style={{fontFamily:fonts.regular,color:colors.muted,marginTop:4,marginBottom:16}}>{track?.artist}</Text>
    <Text style={{fontFamily:fonts.regular,color:colors.muted,fontSize:13,lineHeight:19,marginBottom:8}}>Elige qué hacer con esta canción.{!host?' El anfitrión controla la reproducción y el orden; puedes añadirla al final.':''}</Text>
    {options.map(option=>{const disabled=option.intent!=='queue'&&!host;return <Pressable key={option.intent} accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={()=>onChoose(option.intent)} style={({pressed})=>({minHeight:72,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,opacity:disabled?.4:pressed?.7:1,borderBottomWidth:1,borderBottomColor:colors.border})}>
      <MaterialCommunityIcons name={option.icon} size={25} color={colors.pink}/>
      <View style={{flex:1}}><Text style={{fontFamily:fonts.semiBold,color:colors.text,fontSize:14}}>{option.title}</Text><Text style={{fontFamily:fonts.regular,color:colors.muted,fontSize:12,lineHeight:17,marginTop:4}}>{option.caption}</Text></View>
    </Pressable>;})}
    <Pressable accessibilityRole="button" onPress={onClose} style={{minHeight:52,alignItems:'center',justifyContent:'center',marginTop:8}}><Text style={{fontFamily:fonts.bold,color:colors.muted}}>Cancelar</Text></Pressable>
  </BottomSheet>;
});

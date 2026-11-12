import { AppAlert as Alert } from '../services/appAlert';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { duplicateGroups } from '../utils/duplicates';
import { useLibrary, useWaveActions, useQueue, useScan } from '../providers/WaveProvider';
import { fonts, useTheme } from '../theme';

export function DuplicateReview(props:{visible:boolean;onClose:()=>void}){return props.visible?<DuplicateReviewBody {...props}/>:null;}
function DuplicateReviewBody({visible,onClose}:{visible:boolean;onClose:()=>void}) {
  const {tracks}=useLibrary(),{current}=useQueue();const wave={current,...useWaveActions(),...useScan()};const {colors}=useTheme();const [keepers,setKeepers]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);
  const currentId=current?.id;
  const groups=useMemo(()=>duplicateGroups(tracks,currentId),[tracks,currentId]);
  const remove=(ids:string[],keep:string)=>Alert.alert('Quitar copias de WavePlay','Los archivos no se borran. Las playlists usarán la copia conservada. Puedes restaurar las entradas desde Ajustes.',[{text:'Cancelar',style:'cancel'},{text:'Quitar copias',onPress:()=>{setBusy(true);void wave.hideDuplicateCopies(keep,ids.filter(id=>id!==keep)).catch(error=>Alert.alert('Duplicados',error instanceof Error?error.message:'No se pudieron quitar las copias.')).finally(()=>setBusy(false))}}]);
  return <BottomSheet visible={visible} onClose={onClose} title="Posibles duplicados">
    <Text style={{fontFamily:fonts.regular,fontSize:12,lineHeight:18,color:colors.muted,marginBottom:18}}>Coincidencias por archivo o por título, artista, duración y tamaño. Revisa las rutas antes de conservar una copia.</Text>
    {!groups.length?<Text style={{fontFamily:fonts.bold,color:colors.text,paddingVertical:24}}>No hay coincidencias en tu biblioteca.</Text>:null}
    {groups.map(group=>{const key=group.map(track=>track.id).sort().join('|');const active=group.find(track=>track.id===wave.current?.id);const keep=active?.id||keepers[key]||group[0].id;return <View key={key} style={{paddingVertical:14,borderTopWidth:1,borderTopColor:colors.border}}><Text style={{fontFamily:fonts.bold,fontSize:14,color:colors.text,marginBottom:10}}>{group[0].title}</Text>{group.map(track=><Pressable key={track.id} disabled={busy||Boolean(active)} accessibilityRole="radio" accessibilityState={{checked:keep===track.id}} accessibilityLabel={`Conservar ${track.filename}`} onPress={()=>setKeepers(previous=>({...previous,[key]:track.id}))} style={{flexDirection:'row',gap:10,paddingVertical:10,alignItems:'center'}}><MaterialCommunityIcons name={keep===track.id?'radiobox-marked':'radiobox-blank'} size={22} color={keep===track.id?colors.purple:colors.muted}/><View style={{flex:1}}><Text style={{fontFamily:fonts.semiBold,color:colors.text,fontSize:12}}>{track.filename}{track.id===active?.id?' · En reproducción':''}</Text><Text selectable style={{fontFamily:fonts.regular,color:colors.muted,fontSize:10,marginTop:4}}>{track.folder||track.uri}</Text></View></Pressable>)}<Pressable disabled={busy||wave.scanning} onPress={()=>remove(group.map(track=>track.id),keep)} style={{opacity:(busy||wave.scanning)?0.4:1,minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:colors.accentSoft,borderRadius:8,marginTop:8}}><MaterialCommunityIcons name="content-copy" size={18} color={colors.purple}/><Text style={{fontFamily:fonts.bold,fontSize:12,color:colors.purple}}>Conservar una copia</Text></Pressable></View>})}
  </BottomSheet>;
}

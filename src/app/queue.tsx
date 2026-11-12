import { HeaderButton } from '../components/HeaderButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, Text, View, StyleSheet } from 'react-native';
import { FastFlatList, FastDraggableList } from '../components/FastScrollList';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Artwork } from '../components/Artwork';
import { ThemeWallpaper } from '../components/ThemeWallpaper';
import { WaveEmptyState } from '../components/WaveEmptyState';
import { useTransport, useQueue, useWaveActions } from '../providers/WaveProvider';
import { fonts, useTheme } from '../theme';
import type { Track } from '../types';

type RowProps={item:Track;index:number;active:boolean;dragging?:boolean;drag?:()=>void;remove:(index:number)=>void};
const QueueRow=memo(function QueueRow({item,index,active,dragging,drag,remove}:RowProps){
  const {colors}=useTheme();const s=useS();
  return <View style={[s.row,active&&s.active,dragging&&s.dragging]}>
    {drag?<Pressable accessibilityLabel={`Arrastrar ${item.title}`} onLongPress={drag} delayLongPress={150} style={s.drag}><MaterialCommunityIcons name="drag-vertical" size={24} color={colors.purple}/></Pressable>:null}
    <Artwork uri={item.artwork} size={48}/><View style={s.info}><Text numberOfLines={1} style={[s.title,active&&s.activeText]}>{item.title}</Text><Text numberOfLines={1} style={s.meta}>{item.artist}</Text></View>
    {!drag?<Pressable accessibilityLabel={`Quitar ${item.title} de la cola`} onPress={()=>remove(index)} style={s.remove}><MaterialCommunityIcons name="close" size={21} color={colors.muted}/></Pressable>:null}
  </View>;
});
export default function Queue(){
  const {colors,appearance}=useTheme();const s=useS();
  const wave={...useQueue(),...useWaveActions()};const playback=useTransport();
  const [reordering,setReordering]=useState(false);
  const duplicateIds=useMemo(()=>{const seen=new Set<string>(),duplicates=new Set<string>();for(const item of wave.queue){if(seen.has(item.id))duplicates.add(item.id);seen.add(item.id);}return duplicates;},[wave.queue]);
  const keyExtractor=useCallback((item:Track,index:number)=>duplicateIds.has(item.id)?`${item.id}-${index}`:item.id,[duplicateIds]);
  const remove=wave.removeFromQueue,currentIndex=wave.currentIndex;
  const renderItem=useCallback(({item,index}:{item:Track;index:number})=><QueueRow item={item} index={index} active={index===currentIndex} remove={remove}/>,[currentIndex,remove]);
  const header=wave.current?<><Text style={s.sectionLabel}>AHORA SUENA</Text><View style={s.now}><Artwork uri={wave.current.artwork} size={64}/><View style={s.info}><Text numberOfLines={2} style={s.title}>{wave.current.title}</Text><Text numberOfLines={1} style={s.meta}>{wave.current.artist}</Text></View><Pressable accessibilityLabel={playback.playing?'Pausar':'Reproducir'} onPress={wave.toggle} style={s.pause}><MaterialCommunityIcons name={playback.playing?'pause':'play'} size={26} color={colors.background}/></Pressable></View><Text style={s.sectionLabel}>COLA COMPLETA · {wave.queue.length}</Text></>:null;
  return <SafeAreaView style={s.root}><ThemeWallpaper appearance={appearance}/><View style={s.header}><HeaderButton icon="chevron-down" label="Cerrar cola" onPress={()=>router.back()}/><View style={s.headerCopy}><Text style={s.heading}>Cola</Text><Text style={s.count}>{wave.queue.length} canciones</Text></View><Pressable disabled={wave.queue.length<2||wave.current?.id.startsWith('room:')} onPress={()=>setReordering(value=>!value)} style={s.clearButton}><Text style={s.clear}>{reordering?'Listo':'Ordenar'}</Text></Pressable><Pressable disabled={!wave.queue.length||reordering} onPress={wave.clearQueue} style={s.clearButton}><Text style={s.clear}>Vaciar</Text></Pressable></View>
    {reordering?<FastDraggableList<Track> data={wave.queue} keyExtractor={keyExtractor} onDragEnd={({from,to})=>wave.moveInQueue(from,to)} activationDistance={8} contentContainerStyle={s.list} ListHeaderComponent={header} renderItem={({item,getIndex,drag,isActive})=><QueueRow item={item} index={getIndex()??0} active={getIndex()===currentIndex} dragging={isActive} drag={drag} remove={remove}/>} initialNumToRender={12} windowSize={5}/>:<FastFlatList<Track> data={wave.queue} keyExtractor={keyExtractor} renderItem={renderItem} extraData={currentIndex} contentContainerStyle={s.list} ListHeaderComponent={header} ListEmptyComponent={<WaveEmptyState icon="playlist-remove" title="La cola está vacía" message="Reproduce una canción para comenzar."/>} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} removeClippedSubviews={Platform.OS==='android'}/>}
  </SafeAreaView>;
}
const useS = () => { const {colors} = useTheme(); return useMemo(()=>StyleSheet.create({root:{flex:1,backgroundColor:colors.canvas},sectionLabel:{fontFamily:fonts.bold,fontSize:11,color:colors.outline,marginTop:18,marginBottom:12},now:{padding:14,borderRadius:8,backgroundColor:colors.surface3,flexDirection:'row',alignItems:'center',gap:12},pause:{width:44,height:44,borderRadius:22,backgroundColor:colors.pink,alignItems:'center',justifyContent:'center'},header:{height:72,flexDirection:'row',alignItems:'center',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:colors.border},headerButton:{width:46,height:46,alignItems:'center',justifyContent:'center'},headerCopy:{flex:1,alignItems:'center'},heading:{fontFamily:fonts.bold,fontSize:18,color:colors.text},count:{fontFamily:fonts.regular,fontSize:12,color:colors.muted,marginTop:2},clearButton:{minWidth:52,height:44,alignItems:'center',justifyContent:'center'},clear:{fontFamily:fonts.bold,fontSize:12,color:colors.pink},list:{padding:14,paddingBottom:30},row:{height:72,flexDirection:'row',alignItems:'center',gap:10,borderRadius:8,paddingRight:4,backgroundColor:colors.canvas},active:{backgroundColor:colors.accentSoft},dragging:{backgroundColor:colors.surfaceHigh},drag:{width:38,height:56,alignItems:'center',justifyContent:'center'},info:{flex:1},title:{fontFamily:fonts.semiBold,fontSize:14,color:colors.text},activeText:{color:colors.purple},meta:{fontFamily:fonts.regular,fontSize:11,color:colors.muted,marginTop:3},remove:{width:44,height:48,alignItems:'center',justifyContent:'center'}}),[colors]); };

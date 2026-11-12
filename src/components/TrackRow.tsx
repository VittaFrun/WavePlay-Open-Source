import { TrackDownloadButton } from './TrackDownloadButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Track } from '../types';
import { fonts, useTheme } from '../theme';
import { useWaveActions, useTrackActive } from '../providers/WaveProvider';
import { PlayingTitle } from './MarqueeText';
import { Artwork } from './Artwork';
import { displayTrackTitle } from '../utils/text';

const duration=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;
export const TrackRow=memo(function TrackRow({track,list,sourceKey,onPress,onLongPress,onMore,selected=false}:{track:Track;list?:Track[];sourceKey?:string;onPress?:()=>void;onLongPress?:()=>void;onMore?:()=>void;selected?:boolean}){const {colors}=useTheme();const styles=useStyles();
  const wave=useWaveActions();const active=useTrackActive(track.id);const title=displayTrackTitle(track.title);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${track.artist}`} onPress={onPress??(()=>void wave.play(track,list,sourceKey))} onLongPress={onLongPress??(()=>wave.addNext(track))} style={({pressed})=>[styles.row,selected&&styles.selected,pressed&&styles.pressed]}>
    <View><Artwork uri={track.artwork} size={44}/>{active?<View style={styles.active}><MaterialCommunityIcons name="waveform" size={12} color="#fff"/></View>:null}</View>
    <View style={styles.text}>{active?<PlayingTitle text={title} style={[styles.title,styles.titleActive]}/>:<Text numberOfLines={1} style={styles.title}>{title}</Text>}<Text numberOfLines={1} style={styles.meta}>{track.unavailable&&!track.downloaded?'No disponible online · ':''}{track.artist}{track.duration?` · ${duration(track.duration)}`:''}</Text></View>
    {!selected?<TrackDownloadButton track={track}/>:null}
    {selected?<MaterialCommunityIcons name="check-circle" size={23} color={colors.purple}/>:<Pressable accessibilityLabel={`Opciones de ${title}`} hitSlop={10} onPress={event=>{event.stopPropagation();if(onMore)onMore();else void wave.toggleTrackFavorite(track);}} style={styles.more}><MaterialCommunityIcons name={onMore?'dots-vertical':track.favorite?'heart':'heart-outline'} size={21} color={track.favorite&&!onMore?colors.pink:colors.muted}/></Pressable>}
  </Pressable>;
});
const useStyles = () => { const {colors} = useTheme(); return StyleSheet.create({row:{minHeight:64,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:4,paddingVertical:8,borderRadius:8,backgroundColor:colors.surface2,marginBottom:8},selected:{backgroundColor:colors.accentSoft},pressed:{backgroundColor:'rgba(255,255,255,.045)'},text:{flex:1},title:{color:colors.text,fontFamily:fonts.semiBold,fontSize:13,lineHeight:18},titleActive:{color:colors.purple},meta:{color:colors.muted,fontFamily:fonts.regular,fontSize:11,marginTop:3},more:{width:44,height:44,alignItems:'center',justifyContent:'center'},active:{position:'absolute',right:-3,bottom:-3,width:20,height:20,borderRadius:10,backgroundColor:colors.purpleStrong,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:colors.background}}); };

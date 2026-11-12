import { TrackDownloadButton } from './TrackDownloadButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PlayingTitle } from './MarqueeText';
import { Artwork } from './Artwork';
import { useWaveActions, useTrackActive } from '../providers/WaveProvider';
import { fonts, useTheme } from '../theme';
import type { Track } from '../types';
import { displayTrackTitle } from '../utils/text';

export const LibraryTrackRow = memo(function LibraryTrackRow({ track, list, rowHeight, selected=false, selecting=false, onSelect, onMore, onMoreTrack, onSelectTrack, sourceKey, onDrag, disabled=false, playCount, onPress, onPlayTrack, dragging=false, onLongPress, onLongPressTrack }: {
  track: Track; list: Track[]; rowHeight?:number; selected?: boolean; selecting?: boolean; onSelect?: () => void; onMore?: () => void; onMoreTrack?: (track:Track)=>void; onSelectTrack?: (id:string)=>void; sourceKey?: string; onDrag?: () => void; disabled?: boolean; playCount?: number; onPress?:()=>void; onPlayTrack?:(track:Track)=>void; dragging?:boolean; onLongPress?:()=>void; onLongPressTrack?:(id:string)=>void;
}) {const {colors}=useTheme();const s=useS();
  const wave = useWaveActions();
  const active = useTrackActive(track.id);
  const seconds = Math.max(0, Math.round(track.duration || 0));
  return <Pressable accessibilityRole="button" accessibilityLabel={`${displayTrackTitle(track.title)}, ${track.artist}${playCount!==undefined?', '+playCount+' reproducciones':''}`} accessibilityState={{ selected }}
    disabled={disabled} onPress={onPress??(() => selecting ? (onSelectTrack?onSelectTrack(track.id):onSelect?.()) : (onPlayTrack?onPlayTrack(track):void wave.play(track, list, sourceKey)))} onLongPress={onLongPress??(onLongPressTrack?()=>onLongPressTrack(track.id):onSelectTrack?()=>onSelectTrack(track.id):onSelect)}
    style={({ pressed }) => [s.row, rowHeight!==undefined&&{height:rowHeight}, active && s.active, selected && s.selected, pressed && s.pressed]}>
    {onDrag ? <Pressable accessibilityRole="button" accessibilityLabel={`Arrastrar ${track.title}`} hitSlop={{left:8,right:8}} onLongPress={onDrag} delayLongPress={100} style={{width:28,height:48,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="drag-vertical" size={24} color={colors.outline}/></Pressable> : null}
    {selecting ? <MaterialCommunityIcons name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={22} color={selected ? colors.pink : colors.outline} /> : null}
    <View><Artwork uri={track.artwork} size={44} />{active ? <View style={s.indicator}><MaterialCommunityIcons name="waveform" size={11} color={colors.background} /></View> : null}</View>
    <View style={s.copy}>{active&&!dragging?<PlayingTitle text={displayTrackTitle(track.title)} style={[s.title,{color:colors.pink}]}/>:<Text numberOfLines={1} style={s.title}>{displayTrackTitle(track.title)}</Text>}
      {playCount!==undefined?<View style={s.listened}><View style={[s.countTag,{backgroundColor:colors.accentSoft}]}><MaterialCommunityIcons name="headphones" size={12} color={colors.pink}/><Text style={s.listenedText}>{playCount}</Text></View><Text numberOfLines={1} style={[s.artist,{marginTop:0,flex:1}]}>{track.artist}</Text></View>:<View style={s.artistLine}><Text numberOfLines={1} style={[s.artist,{flex:1}]}>{track.unavailable&&!track.downloaded?'No disponible online · ':''}{track.artist}</Text></View>}
    </View>
    {!selecting?<TrackDownloadButton track={track}/>:null}
    {!selecting ? <View style={s.trailing}><Text style={s.duration}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Opciones de ${track.title}`} onPress={event => { event.stopPropagation(); if(onMoreTrack)onMoreTrack(track);else if(onMore)onMore();else void wave.toggleTrackFavorite(track); }} style={s.more}><MaterialCommunityIcons name="dots-vertical" size={22} color={colors.muted} /></Pressable></View> : null}
  </Pressable>;
});
const useS = () => { const {colors} = useTheme(); return useMemo(() => StyleSheet.create({
  row: { minHeight: 64, paddingVertical: 8, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.09)' },
  active: { backgroundColor: colors.accentSoft, borderRadius: 8 }, selected: { backgroundColor: colors.accentSoft }, pressed: { opacity: 0.7 },
  countTag:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:5,paddingVertical:2,borderRadius:4},listened:{flexDirection:'row',alignItems:'center',gap:5,marginTop:4},listenedText:{fontFamily:fonts.semiBold,fontSize:10,color:colors.pink},
  copy: { flex: 1, minWidth: 0 }, title: { fontFamily: fonts.semiBold, color: colors.text, fontSize: 13, lineHeight:18 }, artist: { fontFamily: fonts.regular, color: colors.muted, fontSize: 11, lineHeight:15, marginTop: 3 },
  trailing: { alignItems: 'center', flexDirection: 'row', gap: 2 }, duration: { fontFamily: fonts.regular, fontSize: 11, color: colors.outline }, more: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', bottom: -3, right: -3, backgroundColor: colors.pink, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  artistLine:{flexDirection:'row',alignItems:'center'},
}), [colors]); };

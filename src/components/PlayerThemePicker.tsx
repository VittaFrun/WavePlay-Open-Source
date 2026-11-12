import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { fonts, useTheme } from '../theme';
import type { Track } from '../types';
import { PlayerCover, playerPresentations, presentationLabels, type PlayerPresentation } from './PlayerCover';

export function PlayerThemePicker({track,presentation,onChoose}:{track:Track;presentation:PlayerPresentation;onChoose:(value:PlayerPresentation)=>Promise<void>}){
 const {colors}=useTheme(),{width}=useWindowDimensions();const [busy,setBusy]=useState(false);
 const cardWidth=Math.max(160,Math.min(250,width-86));
 return <><Text style={{color:colors.muted,fontFamily:fonts.regular,marginBottom:16}}>Desliza para explorar. Toca un tema para aplicarlo.</Text>
 <ScrollView horizontal snapToInterval={cardWidth+14} decelerationRate="fast" showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:14,paddingBottom:20}}>
 {playerPresentations.map(mode=><Pressable key={mode} accessibilityRole="radio" accessibilityState={{checked:mode===presentation}} accessibilityLabel={presentationLabels[mode]} disabled={busy} onPress={()=>{setBusy(true);void onChoose(mode).finally(()=>setBusy(false));}} style={{width:cardWidth,padding:12,borderRadius:24,backgroundColor:colors.surfaceHigh,borderWidth:2,borderColor:presentation===mode?colors.pink:colors.border,overflow:'hidden'}}>
 <PlayerCover track={track} mode={mode} size={Math.min(180,cardWidth-30)} width={cardWidth-24} height={200} playing={false}/>
 <Text numberOfLines={1} style={{fontFamily:fonts.bold,color:colors.text,fontSize:13,marginTop:12}}>{track.title}</Text>
 <Text numberOfLines={1} style={{color:colors.muted,fontSize:11,marginTop:4}}>{track.artist}</Text>
 <View style={{flexDirection:'row',justifyContent:'center',gap:24,marginVertical:14}}>{(['skip-previous','play-circle','skip-next'] as const).map(icon=><MaterialCommunityIcons key={icon} name={icon} size={24} color={colors.pink}/>)}</View>
 <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{flex:1,color:colors.text,fontFamily:fonts.bold}}>{presentationLabels[mode]}</Text>{presentation===mode?<MaterialCommunityIcons name="check-circle" size={20} color={colors.pink}/>:null}</View>
 </Pressable>)}</ScrollView></>;
}

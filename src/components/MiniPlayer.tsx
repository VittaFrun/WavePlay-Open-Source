import { openRoute } from '../services/navigation';
import { useSoloYouTube } from '../hooks/useSoloYouTube';
import { commandSoloYouTube } from '../services/soloYouTube';
import { roomYouTubeNative } from '../services/roomYouTubeNative';
import { type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePlayback, useTransport, useQueue, useWaveActions } from '../providers/WaveProvider';
import { Artwork } from './Artwork';
import { AnimatedWaveMark } from './AnimatedWaveMark';
import { PlaybackSurface } from './PlaybackSurface';
import { MarqueeText } from './MarqueeText';
import { fonts, useTheme } from '../theme';
import { displayTrackTitle } from '../utils/text';

export function MiniPlayer({blurTarget:targetOverride}:{blurTarget?:RefObject<View|null>}){
 const solo=useSoloYouTube();
 const {colors}=useTheme();const wave=({...useQueue(),...useWaveActions()});const playback=useTransport();const track=wave.current;
 const title=solo.video?.title||(track?displayTrackTitle(track.title):'');
 const artist=solo.video?.channel||track?.artist||'';
 const artwork=solo.video?.thumbnail||track?.artwork;
 const playing=solo.video?solo.playing&&!solo.interrupted:playback.playing;
 const toggle=()=>{if(solo.video?.id&&solo.interrupted)roomYouTubeNative?.resumeLocal();else if(solo.video)commandSoloYouTube(!solo.playing);else wave.toggle();};
 if(!track&&!solo.video)return null;
 return <PlaybackSurface style={s.shell} blurTarget={targetOverride}>
  <Pressable accessibilityLabel={`Abrir reproductor, ${title}`} style={s.main} onPress={()=>openRoute('/player')}><View><Artwork uri={artwork} size={42}/><View pointerEvents="none" style={{position:'absolute',left:0,right:0,top:0,bottom:0,alignItems:'center',justifyContent:'center',borderRadius:7,backgroundColor:'rgba(9,10,16,.42)'}}><AnimatedWaveMark playing={playing}/></View></View><View style={s.copy}><MarqueeText text={title} style={[s.title,{color:colors.text}]} enabled={playing}/><Text numberOfLines={1} style={[s.meta,{color:colors.muted}]}>{artist}</Text></View></Pressable>
  {track?<Pressable accessibilityLabel={track.favorite?'Quitar de favoritas':'Añadir a favoritas'} onPress={()=>void wave.toggleTrackFavorite(track)} style={s.next}><MaterialCommunityIcons name={track.favorite?'heart':'heart-outline'} size={18} color={track.favorite?colors.pink:colors.muted}/></Pressable>:null}
  <Pressable accessibilityLabel={playing?'Pausar':'Reproducir'} style={[s.play,{backgroundColor:colors.pink}]} onPress={toggle}><MaterialCommunityIcons name={playing?'pause':'play'} size={23} color={colors.background}/></Pressable>
  <Pressable accessibilityLabel="Siguiente canción" style={s.next} onPress={wave.next}><MaterialCommunityIcons name="skip-next" size={24} color={colors.text}/></Pressable>
  <MiniProgress/>
 </PlaybackSurface>;
}
function MiniProgress(){const {colors,gradients}=useTheme();const playback=usePlayback();const pct=playback.duration?Math.max(0,Math.min(100,playback.position/playback.duration*100)):0;return <View pointerEvents="none" style={[s.rail,{backgroundColor:colors.border}]}><LinearGradient colors={gradients.brand} start={{x:0,y:0}} end={{x:1,y:0}} style={{height:2,width:`${pct}%`}}/></View>}
const s=StyleSheet.create({shell:{minHeight:64,borderRadius:8,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:3,overflow:'hidden',borderWidth:StyleSheet.hairlineWidth},main:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10},copy:{flex:1,minWidth:0},title:{fontFamily:fonts.semiBold,fontSize:12,lineHeight:18},meta:{fontFamily:fonts.regular,fontSize:10,marginTop:2},play:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},next:{width:44,height:44,alignItems:'center',justifyContent:'center'},rail:{position:'absolute',left:0,right:0,bottom:0,height:2}});

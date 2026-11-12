import { openRoute } from '../../services/navigation';
import { PanelBackdrop } from '../../components/GlassSurface';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { memo, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Artwork } from '../../components/Artwork';
import { WaveEmptyState } from '../../components/WaveEmptyState';
import { WaveLogo } from '../../components/WaveLogo';
import { LocalMixPanel } from '../../components/LocalMixPanel';
import { WaveTopBar } from '../../components/WaveTopBar';
import { localMixes, type LocalMix } from '../../utils/music';
import { dailySelection, localDayKey, restoreDailySelection, type DailySnapshot } from '../../utils/waveDj';
import { openMix } from '../../services/mixNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback, useTransport, useLibrary, useWaveActions, useScan, useQueue } from '../../providers/WaveProvider';
import { fonts, useTheme } from '../../theme';
import type { Track } from '../../types';
import { displayTrackTitle } from '../../utils/text';

const relativeDate=(timestamp:number)=>{const days=Math.floor((Date.now()-timestamp)/86_400_000);return days<=0?'Hoy':days===1?'Ayer':days<7?`Hace ${days} días`:new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short'}).format(new Date(timestamp));};
const shuffle=<T,>(items:T[])=>{const result=[...items];for(let index=result.length-1;index>0;index-=1){const next=Math.floor(Math.random()*(index+1));[result[index],result[next]]=[result[next],result[index]];}return result;};

const SectionTitle=memo(function SectionTitle({title,action,onPress}:{title:string;action?:string;onPress?:()=>void}){const s=useS();return <View style={s.sectionHeader}><Text style={s.sectionTitle}>{title}</Text>{action?<Pressable hitSlop={10} onPress={onPress}><Text style={s.sectionAction}>{action}</Text></Pressable>:null}</View>;});

function NowHero(){const {colors}=useTheme();const s=useS();
  const wave={...useLibrary(),...useWaveActions(),...useQueue()};const playback=useTransport();const track=wave.current;
  if(!track)return <Pressable onPress={()=>{const list=shuffle(wave.tracks);if(list[0])void wave.play(list[0],wave.tracks,undefined,true);}} style={s.emptyHero}><PanelBackdrop/><View style={s.emptyHeroMark}><WaveLogo size={35}/></View><View style={s.heroCopy}><Text style={s.heroKicker}>TU COLECCIÓN</Text><Text style={s.emptyHeroTitle}>Pon tu música en movimiento</Text><Text style={s.heroArtist}>Reproducción aleatoria de {wave.tracks.length} canciones</Text></View><View style={s.heroPlay}><MaterialCommunityIcons name="shuffle-variant" size={24} color="#fff"/></View></Pressable>;
  return <Pressable onPress={()=>openRoute('/player')} style={({pressed})=>[s.hero,pressed&&s.pressed]}>
    <PanelBackdrop/><LinearGradient colors={[colors.surface3,colors.surface3,colors.surface3]} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
    <Artwork uri={track.artwork} size={76}/>
    <View style={s.heroCopy}><Text style={s.heroKicker}>{playback.playing?'REPRODUCIENDO':'AHORA'}</Text><Text numberOfLines={2} style={s.heroTitle}>{displayTrackTitle(track.title)}</Text><Text numberOfLines={1} style={s.heroArtist}>{track.artist}</Text><HeroProgress/></View>
    <Pressable accessibilityLabel={playback.playing?'Pausar':'Continuar reproducción'} onPress={event=>{event.stopPropagation();wave.toggle();}} style={s.heroPlay}><MaterialCommunityIcons name={playback.playing?'pause':'play'} size={27} color="#fff" style={!playback.playing&&{marginLeft:2}}/></Pressable>
  </Pressable>;
}

function HeroProgress(){const {gradients}=useTheme();const {duration,position}=usePlayback();const progress=duration?Math.max(0,Math.min(1,position/duration)):0;return <View style={{height:3,borderRadius:2,backgroundColor:'rgba(255,255,255,.13)',overflow:'hidden',marginTop:11}}><LinearGradient colors={gradients.brand} style={{height:3,width:`${progress*100}%`}}/></View>;}

function Mosaic({tracks,size}:{tracks:Track[];size:number}){const s=useS();const tile=(size-3)/2;const items=Array.from({length:4},(_,index)=>tracks[index%tracks.length]);return <View style={[s.mosaic,{width:size,height:size}]}>{items.map((track,index)=><Artwork key={`${track?.id}-${index}`} uri={track?.artwork} size={tile}/>)}</View>;}
function MixCard({mix,width}:{mix:LocalMix;width:number}){const s=useS();const wave=useWaveActions();return <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${mix.title}`} onPress={()=>openMix(mix)} style={({pressed})=>[s.mixCard,{width},pressed&&s.pressed]}><Mosaic tracks={mix.tracks} size={width}/><View style={s.mixBottom}><View style={s.mixCopy}><Text numberOfLines={1} style={s.mixTitle}>{mix.title}</Text><Text numberOfLines={1} style={s.mixCaption}>{mix.caption}</Text><Text numberOfLines={1} style={s.mixCaption}>{mix.tracks.length} canciones · {Math.round(mix.tracks.reduce((sum,t)=>sum+t.duration,0)/60)} min</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Reproducir ${mix.title}`} style={s.rowAction} hitSlop={6} onPress={event=>{event.stopPropagation();const tracks=mix.tracks.filter(track=>!track.missing);if(tracks[0])void wave.play(tracks[0],tracks,`mix:${mix.id}`);}}><MaterialCommunityIcons name="play-circle" size={30} color="#fff"/></Pressable></View></Pressable>;}
function HistoryCard({track,list,width}:{track:Track;list:Track[];width:number}){const s=useS();const wave=useWaveActions();return <Pressable onPress={()=>void wave.play(track,list)} style={({pressed})=>[s.historyCard,{width},pressed&&s.pressed]}><Artwork uri={track.artwork} size={width}/><Text numberOfLines={1} style={s.historyTitle}>{displayTrackTitle(track.title)}</Text><Text numberOfLines={1} style={s.historyArtist}>{track.artist}</Text></Pressable>;}
function RecentRow({track,list}:{track:Track;list:Track[]}){const {colors}=useTheme();const s=useS();const wave=useWaveActions();return <Pressable onPress={()=>void wave.play(track,list)} style={({pressed})=>[s.recentRow,pressed&&s.rowPressed]}><Artwork uri={track.artwork} size={50}/><View style={s.recentCopy}><Text numberOfLines={1} style={s.recentTitle}>{displayTrackTitle(track.title)}</Text><Text numberOfLines={1} style={s.recentMeta}>{track.artist} · {relativeDate(track.addedAt||track.createdAt)}</Text></View><Pressable accessibilityLabel={`Reproducir ${track.title}`} onPress={event=>{event.stopPropagation();void wave.play(track,list);}} style={s.rowAction}><MaterialCommunityIcons name="play-circle-outline" size={24} color={colors.muted}/></Pressable></Pressable>;}

export default function Home(){const {colors,gradients}=useTheme();const s=useS();
  const wave={...useLibrary(),...useWaveActions(),...useScan()};const {width}=useWindowDimensions();const insets=useSafeAreaInsets();
  const [day,setDay]=useState(()=>localDayKey());
  const [dailySnapshot,setDailySnapshot]=useState<DailySnapshot|null>(null);
  const focused=useIsFocused();
  useEffect(()=>{
    if(!focused)return;
    let timer:ReturnType<typeof setInterval>|undefined;
    const update=(state:string)=>{if(timer)clearInterval(timer);timer=undefined;if(state==='active'){setDay(localDayKey());timer=setInterval(()=>setDay(localDayKey()),60_000);}};
    update(AppState.currentState);const listener=AppState.addEventListener('change',update);
    return()=>{if(timer)clearInterval(timer);listener.remove();};
  },[focused]);
  useEffect(()=>{
    if(!wave.tracks.length||dailySnapshot?.day===day)return;
    let active=true;
    void (async()=>{
      const [saved,lessIds]=await Promise.all([
        AsyncStorage.getItem('waveplay.dj.daily').then(value=>value?JSON.parse(value) as DailySnapshot:null).catch(()=>null),
        AsyncStorage.getItem('waveplay.dj.less').then(value=>value?JSON.parse(value) as string[]:[]).catch(()=>[]),
      ]);
      if(!active)return;
      if(saved?.day===day){setDailySnapshot(saved);return;}
      const generated=dailySelection(wave.tracks,day,saved?.trackIds||[],lessIds);
      if(!generated)return;
      const next={day,trackIds:generated.tracks.map(track=>track.id)};
      setDailySnapshot(next);
      void AsyncStorage.setItem('waveplay.dj.daily',JSON.stringify(next)).catch(()=>{});
    })();
    return()=>{active=false;};
  },[day,wave.tracks,dailySnapshot]);
  const daily=useMemo(()=>{
    const saved=dailySnapshot?restoreDailySelection(wave.tracks,dailySnapshot,day):[];
    if(saved.length)return {id:`daily-${day}`,title:'Tu selección de hoy',caption:wave.tracks.some(track=>track.favorite||(track.playCount||0)>0)?'Favoritas, descubrimientos y lo que más escuchas':'Un punto de partida con tu música local',tracks:saved};
    return dailySelection(wave.tracks,day);
  },[wave.tracks,day,dailySnapshot]);
  const mixes=useMemo(()=>localMixes(wave.tracks),[wave.tracks]);
  const data=useMemo(()=>{
    const newest=[...wave.tracks].sort((a,b)=>(b.addedAt||b.createdAt)-(a.addedAt||a.createdAt)).slice(0,6);
    const listened=wave.recentlyPlayed.slice(0,10);
    return {newest,listened};
  },[wave.tracks,wave.recentlyPlayed]);
  const historyWidth=Math.min(132,(width-54)/2.45);const mixWidth=Math.min(176,width*.47);

  if(!wave.ready)return <LinearGradient colors={gradients.aurora} style={s.loading}><WaveLogo size={42}/><Text style={s.loadingText}>Preparando tu música</Text></LinearGradient>;
  return <LinearGradient colors={gradients.aurora} style={s.root}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.content,{paddingBottom:190+insets.bottom}]}><WaveTopBar title="Inicio" friends/>
    {!wave.tracks.length?<WaveEmptyState icon="music-box-multiple-outline" title="Tu colección empieza aquí" message="Encuentra la música guardada en tu teléfono." action={wave.scanning?'Buscando canciones…':'Buscar mi música'} onPress={()=>void wave.scan()}/>:<>
      {daily?<View style={s.section}><SectionTitle title="Wave DJ · Hoy"/><LocalMixPanel mix={daily} featured/></View>:null}
      <View style={{marginTop:16}}><NowHero/></View>
      <View style={s.quickRow}><Pressable onPress={()=>{const list=shuffle(wave.tracks);if(list[0])void wave.play(list[0],wave.tracks,undefined,true);}} style={({pressed})=>[s.shuffleAction,pressed&&s.pressed]}><View style={s.shuffleIcon}><MaterialCommunityIcons name="shuffle-variant" size={23} color={colors.pink}/></View><Text style={s.shuffleText}>Escuchar en aleatorio</Text><MaterialCommunityIcons name="chevron-right" size={20} color={colors.pink}/></Pressable><Pressable onPress={()=>openRoute({pathname:'/(tabs)/library',params:{view:'favorites'}})} style={s.roundAction}><MaterialCommunityIcons name="heart-outline" size={22} color={colors.purple}/><Text style={s.roundLabel}>Favoritas</Text></Pressable></View>
      {mixes.length?<View style={s.section}><SectionTitle title="Tus mezclas"/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontal}>{mixes.map(mix=><MixCard key={mix.id} mix={mix} width={mixWidth}/>)}</ScrollView></View>:null}
      {data.listened.length?<View style={s.section}><SectionTitle title="Volver a escuchar" action="Ver historial" onPress={()=>openRoute({pathname:'/collection/[key]',params:{key:'recently-played'}} as never)}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontal}>{data.listened.map(track=><HistoryCard key={track.id} track={track} list={data.listened} width={historyWidth}/>)}</ScrollView></View>:null}
      {data.newest.length?<View style={s.section}><SectionTitle title="Último agregado" action="Ver todo" onPress={()=>openRoute({pathname:'/collection/[key]',params:{key:'recently-added'}} as never)}/><View>{data.newest.slice(0,4).map(track=><RecentRow key={track.id} track={track} list={data.newest}/>)}</View></View>:null}
      {wave.mostPlayed.length?<View style={s.section}><SectionTitle title="Más escuchadas"/><View>{wave.mostPlayed.slice(0,4).map((track,index)=><Pressable key={track.id} onPress={()=>void wave.play(track,wave.mostPlayed)} style={({pressed})=>[s.chartRow,pressed&&s.rowPressed]}><Text style={s.rank}>{String(index+1).padStart(2,'0')}</Text><Artwork uri={track.artwork} size={48}/><View style={s.chartCopy}><Text numberOfLines={1} style={s.chartTitle}>{displayTrackTitle(track.title)}</Text><View style={{flexDirection:'row',alignItems:'center',gap:5,marginTop:3}}><MaterialCommunityIcons name="headphones" size={12} color={colors.pink}/><Text style={[s.chartArtist,{color:colors.pink,marginTop:0}]}>{track.playCount||0}</Text><Text numberOfLines={1} style={[s.chartArtist,{flex:1,marginTop:0}]}>{track.artist}</Text></View></View><MaterialCommunityIcons name="play" size={19} color={colors.outline}/></Pressable>)}</View></View>:null}
    </>}
  </ScrollView></LinearGradient>;
}

const useS = () => { const {colors} = useTheme(); return StyleSheet.create({
  root:{flex:1,backgroundColor:colors.canvas},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:15},loadingText:{fontFamily:fonts.semiBold,color:colors.muted},content:{paddingHorizontal:20,paddingTop:8,paddingBottom:180},
  top:{height:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:18},brand:{flexDirection:'row',alignItems:'center',gap:10},wordmark:{fontFamily:fonts.extraBold,fontSize:20,color:colors.text,letterSpacing:0},settings:{width:44,height:44,borderRadius:22,backgroundColor:'rgba(255,255,255,.035)',borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},collection:{fontFamily:fonts.regular,fontSize:12,color:colors.muted,marginTop:2},
  hero:{minHeight:128,borderRadius:8,overflow:'hidden',padding:16,flexDirection:'row',alignItems:'center',gap:14,borderWidth:1,borderColor:'rgba(255,255,255,.09)'},emptyHero:{overflow:'hidden',minHeight:128,borderRadius:8,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.border,padding:16,flexDirection:'row',alignItems:'center',gap:14},emptyHeroMark:{width:76,height:76,borderRadius:22,backgroundColor:'rgba(168,85,247,.13)',alignItems:'center',justifyContent:'center'},heroOrb:{position:'absolute',width:180,height:180,borderRadius:90,right:-56,top:-72,backgroundColor:'rgba(236,72,153,.16)'},heroCopy:{flex:1},heroKicker:{fontFamily:fonts.extraBold,fontSize:8,letterSpacing:0,color:'#E8C7FF',marginBottom:6},heroTitle:{fontFamily:fonts.extraBold,fontSize:18,lineHeight:23,color:'#fff',letterSpacing:0},emptyHeroTitle:{fontFamily:fonts.bold,fontSize:16,lineHeight:21,color:colors.text},heroArtist:{fontFamily:fonts.regular,fontSize:11,color:'rgba(255,255,255,.68)',marginTop:4},heroProgress:{height:3,borderRadius:2,backgroundColor:'rgba(255,255,255,.13)',overflow:'hidden',marginTop:11},heroProgressFill:{height:3},heroPlay:{width:47,height:47,borderRadius:24,backgroundColor:'rgba(255,255,255,.16)',borderWidth:1,borderColor:'rgba(255,255,255,.14)',alignItems:'center',justifyContent:'center'},
  quickRow:{minHeight:72,flexDirection:'row',alignItems:'center',gap:10,marginTop:13},shuffleAction:{minHeight:56,flex:1,borderRadius:8,overflow:'hidden',paddingHorizontal:12,backgroundColor:'transparent',flexDirection:'row',alignItems:'center',gap:10},shuffleIcon:{width:36,height:36,borderRadius:18,backgroundColor:'transparent',alignItems:'center',justifyContent:'center'},shuffleText:{flex:1,fontFamily:fonts.bold,fontSize:12,color:colors.text},roundAction:{height:64,minWidth:70,alignItems:'center',justifyContent:'center',gap:4},roundLabel:{fontFamily:fonts.semiBold,fontSize:12,color:colors.muted},
  section:{marginTop:29},sectionHeader:{minHeight:34,gap:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionTitle:{flex:1,fontFamily:fonts.extraBold,fontSize:19,color:colors.text,letterSpacing:0},sectionAction:{fontFamily:fonts.bold,fontSize:10,color:colors.purple},horizontal:{gap:13,paddingRight:20,paddingTop:7},
  mixCard:{borderRadius:8,overflow:'hidden',padding:0,backgroundColor:colors.surface2},mosaic:{borderRadius:8,overflow:'hidden',flexDirection:'row',flexWrap:'wrap',gap:3},mixBottom:{paddingHorizontal:12,minHeight:72,flexDirection:'row',alignItems:'center',gap:6},mixCopy:{flex:1},mixTitle:{fontFamily:fonts.bold,fontSize:13,color:'#fff'},mixCaption:{fontFamily:fonts.regular,fontSize:10,color:colors.muted,marginTop:2},
  historyCard:{gap:3},historyTitle:{fontFamily:fonts.semiBold,fontSize:12,color:colors.text,marginTop:6},historyArtist:{fontFamily:fonts.regular,fontSize:10,color:colors.muted},
  recentPanel:{marginTop:7,borderRadius:21,backgroundColor:'rgba(19,20,28,.68)',borderWidth:1,borderColor:colors.border,overflow:'hidden'},recentRow:{minHeight:68,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:11,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},recentCopy:{flex:1},recentTitle:{fontFamily:fonts.semiBold,fontSize:13,color:colors.text},recentMeta:{fontFamily:fonts.regular,fontSize:10,color:colors.muted,marginTop:3},rowAction:{width:40,height:40,alignItems:'center',justifyContent:'center'},
  chartRow:{minHeight:65,flexDirection:'row',alignItems:'center',gap:11},rank:{width:24,fontFamily:fonts.extraBold,fontSize:11,color:colors.outline},chartCopy:{flex:1},chartTitle:{fontFamily:fonts.semiBold,fontSize:13,color:colors.text},chartArtist:{fontFamily:fonts.regular,fontSize:10,color:colors.muted,marginTop:2},pressed:{opacity:.82,transform:[{scale:.988}]},rowPressed:{backgroundColor:'rgba(255,255,255,.025)'},
}); };

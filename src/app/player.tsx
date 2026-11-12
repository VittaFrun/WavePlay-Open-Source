import { availablePlayerTab, playerTabIndex, type PlayerTab } from '../utils/playerPresentation';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSoloYouTube } from '../hooks/useSoloYouTube';
import { TrackTransition } from '../components/TrackTransition';
import { RoomYouTubeSurface } from '../components/RoomYouTubeSurface';
import { roomYouTubeNative } from '../services/roomYouTubeNative';
import { SoloYouTubeWebPlayer } from '../components/SoloYouTubeWebPlayer';
import { SleepTimerSheet } from '../components/SleepTimerSheet';
import { useSceneActive } from '../hooks/useSceneActive';
import { AppAlert as Alert } from '../services/appAlert';
import { openRoute } from '../services/navigation';
import { HeaderButton } from '../components/HeaderButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Artwork } from '../components/Artwork';
import { ThemeWallpaper } from '../components/ThemeWallpaper';
import { PlayerCover, playerPresentations, type PlayerPresentation } from '../components/PlayerCover';
import { PlayerSettings } from '../components/PlayerSettings';
import { notifyChange } from '../services/feedback';
import { useAppearance } from '../providers/AppearanceProvider';
import { LyricsTab } from '../components/LyricsTab';
import { PlayerWaveform } from '../components/PlayerWaveform';
import { usePlayback, useTransport, useQueue, useWaveActions } from '../providers/WaveProvider';
import { fonts, radii, useTheme } from '../theme';
import { displayTrackTitle } from '../utils/text';

const formatTime=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;

function Progress({width}:{width:number}){const {colors,gradients}=useTheme();const s=useS();
  const wave=useWaveActions();const playback=usePlayback();
  const [draftPosition,setDraftPosition]=useState<number|null>(null);
  const [isDragging,setIsDragging]=useState(false);
  const dragging=useRef(false);
  const [dragStart,setDragStart]=useState(0);
  const lastDraftUpdate=useRef(0);
  const pendingSeek=useRef<number|null>(null);
  const releaseTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastDuration=useRef(playback.duration);
  const duration=Math.max(0,playback.duration||0);
  const clampPosition=useCallback((value:number)=>Math.max(0,Math.min(Number.isFinite(value)?value:0,duration)),[duration]);
  const position=clampPosition(draftPosition??playback.position);
  const progress=duration?position/duration:0;

  useEffect(()=>()=>{if(releaseTimer.current)clearTimeout(releaseTimer.current)},[]);
  useEffect(()=>{
    if(lastDuration.current!==duration&& !dragging.current){
      pendingSeek.current=null;
      setDraftPosition(null);
    }
    lastDuration.current=duration;
  },[duration]);
  useEffect(()=>{
    const target=pendingSeek.current;
    if(target===null||dragging.current)return;
    if(Math.abs(playback.position-target)<1.25){
      pendingSeek.current=null;
      setDraftPosition(null);
    }
  },[playback.position]);

  const beginSeek=useCallback((value:number)=>{
    dragging.current=true;
    setDragStart(clampPosition(value));
    lastDraftUpdate.current=Date.now();
    setIsDragging(true);
    pendingSeek.current=null;
    if(releaseTimer.current)clearTimeout(releaseTimer.current);
    setDraftPosition(clampPosition(value));
  },[clampPosition]);
  const updateSeek=useCallback((value:number)=>{
    const now=Date.now();
    if(now-lastDraftUpdate.current<100)return;
    lastDraftUpdate.current=now;
    setDraftPosition(clampPosition(value));
  },[clampPosition]);
  const finishSeek=useCallback((value:number)=>{
    const next=clampPosition(value);
    dragging.current=false;
    setIsDragging(false);
    pendingSeek.current=next;
    setDraftPosition(next);
    wave.seek(next);
    if(releaseTimer.current)clearTimeout(releaseTimer.current);
    releaseTimer.current=setTimeout(()=>{
      pendingSeek.current=null;
      setDraftPosition(null);
    },1200);
  },[clampPosition,wave]);

  return <View style={s.progressBlock}>
    <View style={s.progressTouch}>
      {!isDragging?<><View pointerEvents="none" style={s.rail}/><LinearGradient pointerEvents="none" colors={gradients.brand} start={{x:0,y:0}} end={{x:1,y:0}} style={[s.progress,{width:`${progress*100}%`}]}/><View pointerEvents="none" style={[s.thumb,{left:`${progress*100}%`},isDragging&&s.thumbActive]}/></>:null}
      <Slider
        accessibilityRole="adjustable"
        accessibilityLabel="Posición de la canción"
        accessibilityValue={{min:0,max:duration,now:position}}
        disabled={!duration}
        maximumValue={duration||1}
        minimumValue={0}
        step={0}
        onSlidingStart={beginSeek}
        onValueChange={updateSeek}
        onSlidingComplete={finishSeek}
        style={[s.slider,{width:width+24,marginLeft:-12}]}
        value={isDragging?dragStart:position}
        minimumTrackTintColor={isDragging?colors.pink:"transparent"}
        maximumTrackTintColor={isDragging?"rgba(255,255,255,.13)":"transparent"}
        thumbTintColor={isDragging?"#fff":"transparent"}
      />
    </View>
    <View style={s.timeRow}><Text style={s.time}>{formatTime(position)}</Text><Text style={s.time}>−{formatTime(Math.max(0,duration-position))}</Text></View>
  </View>;
}

export default function Player(){const {colors,gradients,appearance}=useTheme();const s=useS();
  const wave={...useQueue(),...useWaveActions()};const playback=useTransport();const track=wave.current;
  const solo=useSoloYouTube();const sceneActive=useSceneActive();
  const hasVideo=Boolean(solo.video&&track?.youtubeId===solo.video.id&&!track.audioOnly);
  const {width,height}=useWindowDimensions();const insets=useSafeAreaInsets();const pager=useRef<ScrollView>(null);
  const [preferredTab,setPreferredTab]=useState<PlayerTab>(track?.youtubeId&&!track.audioOnly&&(!track.downloaded||track.onlinePlayback)?'video':track?.audioOnly?'lyrics':'cover');
  const tab=playerTabIndex(availablePlayerTab(preferredTab,hasVideo,track?.audioOnly));const [lyricsTrack,setLyricsTrack]=useState<string|null>(track?.audioOnly?track.id:null);const [timerOpen,setTimerOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);const [presentation,setPresentation]=useState<PlayerPresentation>('classic');
  const {setReduceMotion}=useAppearance();const reduceMotion=useReducedMotion();
  useLayoutEffect(()=>{pager.current?.scrollTo({x:tab*(width-40),animated:false});},[tab,width]);
  useEffect(()=>{let alive=true;void AsyncStorage.getItem('waveplay.player-presentation').then(value=>{if(alive&&playerPresentations.includes(value as PlayerPresentation))setPresentation(value as PlayerPresentation)}).catch(()=>{});return()=>{alive=false}},[]);
  const choosePresentation=async(value:PlayerPresentation)=>{try{await AsyncStorage.setItem('waveplay.player-presentation',value);setPresentation(value);setSettingsOpen(false);notifyChange('Tema del reproductor actualizado')}catch{Alert.alert('Reproductor','No se pudo guardar la presentación.')}};
  const contentWidth=width-40;const coverHeight=height<680?205:height<740?250:Math.min(390,height*.44);const panelHeight=tab===1?Math.max(220,height-insets.top-insets.bottom-320):coverHeight;const artworkSize=Math.min(contentWidth-28,coverHeight-18);


  if(!track)return <View style={s.root}><ThemeWallpaper appearance={appearance}/><LinearGradient colors={gradients.aurora} style={s.root}><SafeAreaView style={s.empty}><MaterialCommunityIcons name="music-note-off-outline" size={36} color={colors.outline}/><Text style={s.emptyTitle}>Nada en reproducción</Text><Pressable onPress={()=>router.canGoBack()?router.back():router.replace('/(tabs)')}><Text style={s.emptyBack}>Volver</Text></Pressable></SafeAreaView></LinearGradient></View>;
  const switchTab=(next:number)=>{setPreferredTab(next===1?'lyrics':next===2?'video':'cover');if(next===1)setLyricsTrack(track.id);};
  const repeatIcon=wave.repeatMode==='one'?'repeat-once':'repeat';
  const detail=[track.album!=='Álbum desconocido'?track.album:null,track.mimeType?.replace('audio/','').toUpperCase()].filter(Boolean).join(' · ');

  return <View style={s.root}>
    <ThemeWallpaper appearance={appearance}/>
    {presentation==='immersive'?<View pointerEvents="none" style={[StyleSheet.absoluteFill,{overflow:'hidden'}]}><View style={{position:'absolute',left:(width-Math.max(width,height))/2,top:0}}><Artwork uri={track.artwork} size={Math.max(width,height)} square/></View><LinearGradient colors={['rgba(10,10,16,.35)','rgba(10,10,16,.12)','rgba(10,10,16,.92)']} locations={[0,.4,1]} style={StyleSheet.absoluteFill}/></View>:null}
    <SafeAreaView edges={['top','bottom']} style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:24}}>
      <View style={s.header}>
        <View style={s.headerSide}><HeaderButton icon="chevron-down" label="Cerrar reproductor" onPress={()=>router.canGoBack()?router.back():router.replace('/(tabs)')}/></View>
        <View style={s.headerCopy}><Text style={s.eyebrow}>{track.youtubeId?(track.downloaded&&!track.onlinePlayback?'SIN CONEXIÓN':'YOUTUBE'):'EN TU DISPOSITIVO'}</Text><Text style={s.headerTitle}>Reproductor</Text></View>
        <View style={[s.headerSide,{justifyContent:'flex-end'}]}>
      {track.youtubeId&&!track.downloaded?<HeaderButton icon="download-outline" label="Descargar canción" onPress={()=>router.push({pathname:'/(tabs)/downloads',params:{url:'https://www.youtube.com/watch?v='+track.youtubeId,title:track.title,artist:track.artist,thumbnail:track.artwork||'',duration:String(track.duration)}})}/>:null}
        <HeaderButton icon="cog-outline" label="Ajustes del reproductor" onPress={()=>setSettingsOpen(true)}/>
        </View>
      </View>

      <View style={s.switcher}>{(hasVideo?['Portada','Letras','Video']:['Portada','Letras']).map((label,index)=><Pressable key={label} onPress={()=>switchTab(index)} style={[s.switchTab,tab===index&&s.switchTabActive]}><Text style={[s.switchText,tab===index&&s.switchTextActive]}>{label}</Text></Pressable>)}</View>

      <TrackTransition trackId={track.id}>
      <ScrollView ref={pager} contentOffset={{x:tab*contentWidth,y:0}} horizontal pagingEnabled bounces={false} showsHorizontalScrollIndicator={false} style={{height:panelHeight,flexGrow:0}} onMomentumScrollEnd={event=>{const next=Math.round(event.nativeEvent.contentOffset.x/contentWidth);setPreferredTab(next===1?'lyrics':next===2?'video':'cover');if(next===1)setLyricsTrack(track.id);}}>
        <View style={{width:contentWidth,height:panelHeight}}>{presentation==='immersive'?null:<PlayerCover track={track} mode={presentation} size={artworkSize} width={contentWidth} height={panelHeight} playing={playback.playing}/>}</View>
        <View style={[s.lyricsPage,{width:contentWidth,height:panelHeight},presentation==='immersive'&&{backgroundColor:'rgba(10,10,16,.72)',borderRadius:8}]}>{tab===1||lyricsTrack===track.id?<LyricsTab key={track.id} track={track} visible={tab===1}/>:null}</View>
        {hasVideo?<View style={{width:contentWidth,height:panelHeight,justifyContent:'center'}}>{roomYouTubeNative?<RoomYouTubeSurface displayPlayer={tab===2&&sceneActive} style={{width:contentWidth,height:panelHeight}}/>:<SoloYouTubeWebPlayer/>}</View>:null}
      </ScrollView>

      {tab!==1?<View style={s.metaRow}><View style={s.metaCopy}><Text numberOfLines={2} style={[s.title,{minHeight:56}]}>{displayTrackTitle(track.title)}</Text><Text numberOfLines={1} style={s.artist}>{track.youtubeId&&track.downloaded&&!track.audioOnly?'Descargada · ':''}{track.artist||'Artista desconocido'}</Text><Text numberOfLines={1} style={[s.detail,{minHeight:16}]}>{detail||' '}</Text></View><View style={s.metaActions}><Pressable accessibilityLabel={track.favorite?'Quitar de favoritas':'Añadir a favoritas'} onPress={()=>void wave.toggleTrackFavorite(track)} style={s.like}><MaterialCommunityIcons name={track.favorite?'heart':'heart-outline'} size={25} color={track.favorite?colors.pink:colors.text}/></Pressable><HeaderButton icon="account-group-outline" label="Escuchar con amigos" onPress={()=>openRoute('/friends')}/></View></View>:null}

      </TrackTransition>
      {tab!==1?(reduceMotion?<Pressable accessibilityRole="button" onPress={()=>void setReduceMotion(false)} style={s.motionNotice}><MaterialCommunityIcons name="motion-play-outline" size={20} color={colors.pink}/><Text style={s.motionNoticeText}>Movimiento reducido activo</Text><Text style={s.motionNoticeAction}>Activar animaciones</Text></Pressable>:<PlayerWaveform active={playback.playing}/>):null}
      {playback.error?<View style={{padding:12,backgroundColor:colors.surface3,borderRadius:8,marginTop:8}}><Text style={{fontFamily:fonts.semiBold,fontSize:13,color:colors.danger}}>No se pudo reproducir esta canción</Text><View style={{flexDirection:'row',gap:16}}><Pressable style={{minHeight:44,justifyContent:'center'}} onPress={()=>void wave.play(track,wave.queue)}><Text style={{fontFamily:fonts.bold,color:colors.pink}}>Reintentar</Text></Pressable>{!track.youtubeId?<Pressable style={{minHeight:44,justifyContent:'center'}} onPress={()=>void wave.scan()}><Text style={{fontFamily:fonts.bold,color:colors.pink}}>Actualizar biblioteca</Text></Pressable>:null}</View></View>:null}
      <Progress key={track.id} width={contentWidth}/>

      <View style={s.controls}>
        <Pressable accessibilityLabel="Alternar modo aleatorio" accessibilityState={{selected:wave.shuffleEnabled}} onPress={wave.toggleShuffle} style={[s.utility,wave.shuffleEnabled&&s.utilityActive]}><MaterialCommunityIcons name="shuffle-variant" size={22} color={wave.shuffleEnabled?colors.purple:colors.muted}/></Pressable>
        <Pressable accessibilityLabel="Anterior" onPress={wave.previous} style={s.skip}><MaterialCommunityIcons name="skip-previous" size={37} color={colors.text}/></Pressable>
        <Pressable accessibilityLabel={playback.buffering?'Preparando canción':playback.playing?'Pausar':'Reproducir'} accessibilityState={{busy:playback.buffering}} onPress={wave.toggle} style={s.play}><LinearGradient colors={gradients.brand} style={StyleSheet.absoluteFill}/>{playback.buffering?<ActivityIndicator color="#fff" size="large"/>:<MaterialCommunityIcons name={playback.playing?'pause':'play'} size={39} color="#fff" style={{width:44,height:44,textAlign:'center',lineHeight:44,includeFontPadding:false}}/>}</Pressable>
        <Pressable accessibilityLabel="Siguiente" onPress={wave.next} style={s.skip}><MaterialCommunityIcons name="skip-next" size={37} color={colors.text}/></Pressable>
        <Pressable accessibilityLabel={`Repetición ${wave.repeatMode}`} onPress={wave.cycleRepeat} style={[s.utility,wave.repeatMode!=='off'&&s.utilityActive]}><MaterialCommunityIcons name={repeatIcon} size={22} color={wave.repeatMode!=='off'?colors.purple:colors.muted}/></Pressable>
      </View>


      <View style={s.secondary}>
        <Pressable onPress={()=>setTimerOpen(true)} style={s.secondaryAction}><MaterialCommunityIcons name="timer-outline" size={19} color={wave.sleepEndsAt?colors.cyan:colors.muted}/><Text style={[s.secondaryText,wave.sleepEndsAt?{color:colors.cyan}:null]}>{wave.sleepEndsAt?'Temporizador activo':'Temporizador'}</Text></Pressable>
        <View style={s.secondaryDot}/><Pressable accessibilityRole="button" onPress={()=>openRoute('/queue')} style={s.secondaryAction}><MaterialCommunityIcons name="playlist-play" size={19} color={colors.muted}/><Text style={s.secondaryText}>Cola · {wave.queue.length}</Text></Pressable>
      </View>

      <PlayerSettings visible={settingsOpen} onClose={()=>setSettingsOpen(false)} track={track} presentation={presentation} onChoose={choosePresentation} onTimer={()=>setTimerOpen(true)} onLyrics={()=>switchTab(1)}/>
      <SleepTimerSheet visible={timerOpen} onClose={()=>setTimerOpen(false)}/>
      </ScrollView>
    </SafeAreaView>
  </View>;
}

const useS = () => { const {colors} = useTheme(); return useMemo(()=>StyleSheet.create({
  root:{flex:1},safe:{flex:1,paddingHorizontal:20},empty:{flex:1,alignItems:'center',justifyContent:'center',gap:12},emptyTitle:{fontFamily:fonts.bold,fontSize:17,color:colors.text},emptyBack:{fontFamily:fonts.bold,color:colors.purple},
  header:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},headerButton:{width:46,height:46,borderRadius:23,alignItems:'center',justifyContent:'center'},headerSide:{width:96,flexDirection:'row',alignItems:'center',gap:8},headerCopy:{flex:1,alignItems:'center'},eyebrow:{fontFamily:fonts.extraBold,fontSize:8,letterSpacing:0,color:colors.purple},headerTitle:{fontFamily:fonts.bold,fontSize:14,color:colors.text,marginTop:2},
  switcher:{height:38,padding:3,borderRadius:19,backgroundColor:'rgba(22,22,31,.82)',borderWidth:1,borderColor:'rgba(255,255,255,.055)',alignSelf:'center',flexDirection:'row',marginBottom:9},switchTab:{width:86,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},switchTabActive:{backgroundColor:colors.accentSoft},switchText:{fontFamily:fonts.semiBold,fontSize:11,color:colors.outline},switchTextActive:{color:colors.text},
  coverPage:{alignItems:'center',justifyContent:'center'},lyricsPage:{paddingHorizontal:2},artGlow:{position:'absolute',backgroundColor:'rgba(180,63,255,.19)',shadowColor:colors.pink,shadowOpacity:.55,shadowRadius:38,elevation:10},artFrame:{padding:1,borderRadius:8,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  metaRow:{minHeight:72,flexDirection:'row',alignItems:'center',gap:12,marginTop:5},metaCopy:{flex:1},metaActions:{flexDirection:'row',alignItems:'center',gap:6},title:{fontFamily:fonts.extraBold,fontSize:21,lineHeight:28,letterSpacing:0,color:colors.text},artist:{fontFamily:fonts.semiBold,fontSize:13,color:colors.muted,marginTop:3},detail:{fontFamily:fonts.regular,fontSize:12,color:colors.outline,marginTop:3,textTransform:'uppercase',letterSpacing:0},like:{width:48,height:48,borderRadius:24,backgroundColor:'rgba(28,29,39,.8)',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border},
  motionNotice:{minHeight:42,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,borderRadius:8,backgroundColor:colors.accentSoft},motionNoticeText:{flex:1,fontFamily:fonts.semiBold,fontSize:11,color:colors.muted},motionNoticeAction:{fontFamily:fonts.bold,fontSize:11,color:colors.pink},
  progressBlock:{marginTop:2},progressTouch:{height:44,position:'relative',justifyContent:'center'},slider:{position:'absolute',left:0,top:0,height:44},rail:{position:'absolute',left:0,right:0,height:3,borderRadius:2,backgroundColor:'rgba(255,255,255,.13)'},progress:{position:'absolute',left:0,height:3,borderRadius:2},thumb:{position:'absolute',width:11,height:11,marginLeft:-5.5,borderRadius:6,backgroundColor:'#fff',shadowColor:colors.pink,shadowOpacity:.8,shadowRadius:7},thumbActive:{width:15,height:15,marginLeft:-7.5,shadowRadius:10},timeRow:{flexDirection:'row',justifyContent:'space-between'},time:{fontFamily:fonts.semiBold,fontSize:9,color:colors.outline},
  controls:{height:82,flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:3},utility:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center'},utilityActive:{backgroundColor:colors.accentSoft},skip:{width:50,height:50,alignItems:'center',justifyContent:'center'},play:{width:70,height:70,borderRadius:35,overflow:'hidden',alignItems:'center',justifyContent:'center'},
  secondary:{height:42,flexDirection:'row',alignItems:'center',justifyContent:'center'},secondaryAction:{height:40,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:13},secondaryText:{fontFamily:fonts.semiBold,fontSize:12,color:colors.muted},secondaryDot:{width:3,height:3,borderRadius:2,backgroundColor:colors.outline,marginHorizontal:2},
  overlay:{flex:1,backgroundColor:'transparent',justifyContent:'flex-end'},sheet:{backgroundColor:colors.surface3,borderTopLeftRadius:radii.xl,borderTopRightRadius:radii.xl,padding:20,paddingBottom:34},handle:{width:42,height:4,borderRadius:2,backgroundColor:colors.outline,alignSelf:'center'},sheetTitle:{fontFamily:fonts.bold,fontSize:20,color:colors.text,marginVertical:18},timerOption:{minHeight:52,paddingVertical:12,gap:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},timerText:{fontFamily:fonts.semiBold,fontSize:14,color:colors.text},cancelTimer:{height:48,alignItems:'center',justifyContent:'center',marginTop:10},cancelTimerText:{fontFamily:fonts.bold,fontSize:13,color:colors.danger},
}),[colors]); };

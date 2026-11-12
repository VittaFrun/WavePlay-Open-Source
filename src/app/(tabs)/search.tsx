import { ExploreHome } from '../../components/ExploreHome';
import { openRoute } from '../../services/navigation';
import { OnlineSongMenu } from '../../components/OnlineSongMenu';
import { TrackDownloadButton } from '../../components/TrackDownloadButton';
import { onlineTrack } from '../../utils/onlineTrack';
import { BottomSheet } from '../../components/BottomSheet';
import { filterTracks, type TrackSort } from '../../utils/music';
import { PanelBackdrop } from '../../components/GlassSurface';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useIsFocused } from 'expo-router';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrackRow } from '../../components/TrackRow';
import { WaveEmptyState } from '../../components/WaveEmptyState';
import { WaveTopBar } from '../../components/WaveTopBar';
import { useDownloads, useLibrary, useWaveActions } from '../../providers/WaveProvider';
import { useRoomSelector } from '../../providers/FriendsListeningProvider';
import { searchYouTubeMusic } from '../../services/youtube';
import { fonts, useTheme } from '../../theme';
import type { Track, YouTubeVideo } from '../../types';

const sortLabels:Record<TrackSort,string>={recent:'Recientes',title:'Título',artist:'Artista',played:'Más escuchadas'};
const HISTORY='waveplay.searchHistory';
const time=(value:number)=>value?`${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`:'';

const VideoRow=memo(function VideoRow({video,onOpen,inRoom}:{video:YouTubeVideo;onOpen:(video:YouTubeVideo)=>void;inRoom:boolean}) {const {colors}=useTheme();const s=useS();const {tracks}=useLibrary();const track=tracks.find(t=>t.youtubeId===video.id)||onlineTrack(video);
  const open=()=>onOpen(video);
  return <View style={s.video}><Pressable accessibilityLabel={`Reproducir ${video.title} en YouTube`} onPress={open}>
    <Image source={{uri:video.thumbnail}} style={s.thumb}/><View style={s.videoPlay}><MaterialCommunityIcons name="play" size={24} color={colors.background}/></View>
    {video.duration>0?<View style={s.duration}><Text style={s.durationText}>{time(video.duration)}</Text></View>:null}
  </Pressable><View style={s.videoInfo}><View style={s.copy}><Text numberOfLines={2} style={s.rowTitle}>{video.title}</Text><Text numberOfLines={1} style={s.rowMeta}>{video.channel}</Text></View>
    <OnlineSongMenu video={video} onRoom={inRoom?open:undefined}/>
    <TrackDownloadButton track={track}/>

  </View></View>;
});

export default function Explore() {const {colors}=useTheme();const s=useS();
  const focused=useIsFocused(),{sharedRoom,promptYouTube}=useRoomSelector(value=>({sharedRoom:Boolean(value.room),promptYouTube:value.promptYouTube}));
  const openVideo=useCallback((video:YouTubeVideo)=>{if(sharedRoom)promptYouTube(video);else openRoute({pathname:'/online-player',params:{id:video.id,title:video.title,channel:video.channel,thumbnail:video.thumbnail,duration:String(video.duration)}});},[sharedRoom,promptYouTube]);
  const wave={...useLibrary(),...useWaveActions()};const insets=useSafeAreaInsets();const request=useRef(0);
  const [insertableOnly,setInsertableOnly]=useState(false);
  const [sort,setSort]=useState<TrackSort>('recent');const [sortOpen,setSortOpen]=useState(false);
  const [source,setSource]=useState<'youtube'|'local'>('youtube');
  const params=useLocalSearchParams<{q?:string}>();
  const [searchFocused,setSearchFocused]=useState(false);
  const searchInput=useRef<TextInput>(null);
  const [query,setQuery]=useState('');const [items,setItems]=useState<YouTubeVideo[]>([]);
  const deferredQuery=useDeferredValue(query);
  const [history,setHistory]=useState<string[]>([]);const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  const incomingQuery=useRef('');
  useFocusEffect(useCallback(()=>{if(typeof params.q==='string'&&params.q.trim()&&params.q!==incomingQuery.current){incomingQuery.current=params.q;setSource('youtube');setQuery(params.q);setItems([]);setError('');}},[params.q]));
  useEffect(()=>{void AsyncStorage.getItem(HISTORY).then(value=>{if(value){const parsed:unknown=JSON.parse(value);if(Array.isArray(parsed))setHistory(parsed.filter((item):item is string=>typeof item==='string').slice(0,8));}}).catch(()=>{});},[]);
  useEffect(()=>{
    const version=++request.current;const q=query.trim();
    if(!focused||source!=='youtube'||q.length<3)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setLoading(true);
      void searchYouTubeMusic(q,controller.signal,insertableOnly).then(results=>{
        if(version!==request.current||controller.signal.aborted)return;
        setItems(results);
      }).catch(reason=>{if(version===request.current&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:'No se pudo completar la búsqueda.');})
        .finally(()=>{if(version===request.current&&!controller.signal.aborted)setLoading(false);});
    },450);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,source,retry,focused,insertableOnly]);
  const deviceTracks=useMemo(()=>wave.tracks.filter(t=>!t.youtubeId||t.downloaded),[wave.tracks]);
  const local=useMemo(()=>source==='local'?filterTracks(deviceTracks,deferredQuery,sort):[],[deferredQuery,source,deviceTracks,sort]);
  const renderItem=useCallback(({item}:{item:Track|YouTubeVideo})=>source==='local'?<TrackRow track={item as Track} list={local}/>:<VideoRow video={item as YouTubeVideo} onOpen={openVideo} inRoom={!!sharedRoom}/>,[source,local,openVideo,sharedRoom]);
  const suggestionsOpen=source==='youtube'&&searchFocused;
  const recentSuggestions=history.filter(value=>value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const rememberQuery=(raw:string)=>{const value=raw.trim();if(value.length<3)return;setHistory(old=>{const next=[value,...old.filter(item=>item.toLocaleLowerCase()!==value.toLocaleLowerCase())].slice(0,8);void AsyncStorage.setItem(HISTORY,JSON.stringify(next)).catch(()=>{});return next;});};
  const chooseQuery=(value:string)=>{rememberQuery(value);setQuery(value);setItems([]);setError('');setLoading(value.trim().length>=3);setSearchFocused(false);searchInput.current?.blur();};
  const data:(Track|YouTubeVideo)[]=source==='local'?local:suggestionsOpen?[]:items;
  const header=<View><WaveTopBar title="Explorar" action="activity" onAction={()=>openRoute('/(tabs)/downloads')}/>
    <View style={s.sources}><PanelBackdrop/>{(['youtube','local'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:source===value}} onPress={()=>{setSource(value);setItems([]);setError('');setLoading(value==='youtube'&&query.trim().length>=3);}} style={[s.source,source===value&&s.sourceOn]}><MaterialCommunityIcons name={value==='youtube'?'youtube':'folder-music-outline'} size={19} color={source===value?colors.background:colors.muted}/><Text style={[s.sourceText,source===value&&s.sourceTextOn]}>{value==='youtube'?'YouTube':'Mi música'}</Text></Pressable>)}</View>
    <View style={s.search}><PanelBackdrop/><MaterialCommunityIcons name="magnify" size={22} color={colors.pink}/><TextInput ref={searchInput} onFocus={()=>setSearchFocused(true)} onBlur={()=>setSearchFocused(false)} onSubmitEditing={()=>{rememberQuery(query);setSearchFocused(false);searchInput.current?.blur();}} value={query} onChangeText={value=>{setQuery(value);setItems([]);setError('');setLoading(source==='youtube'&&value.trim().length>=3);}} autoCorrect={false} returnKeyType="search" placeholder={source==='youtube'?'Buscar en YouTube':'Buscar en tu biblioteca'} placeholderTextColor={colors.outline} style={s.input}/>{query?<Pressable accessibilityLabel="Borrar búsqueda" style={s.iconButton} onPress={()=>{setQuery('');setItems([]);setError('');setLoading(false);}}><MaterialCommunityIcons name="close" size={20} color={colors.muted}/></Pressable>:null}{source==='youtube'?<Pressable accessibilityRole="checkbox" accessibilityState={{checked:insertableOnly}} accessibilityLabel="Mostrar solo videos que permiten reproducirse aquí" style={s.iconButton} onPress={()=>{setInsertableOnly(value=>!value);setItems([]);setError('');setLoading(query.trim().length>=3);}}><MaterialCommunityIcons name={insertableOnly?'filter-check':'filter-outline'} size={21} color={insertableOnly?colors.pink:colors.muted}/></Pressable>:null}</View>
    {suggestionsOpen?<View style={s.history}><View style={s.historyHead}><Text style={s.heading}>Búsquedas recientes</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar búsqueda" onPress={()=>{setSearchFocused(false);searchInput.current?.blur();}} style={s.iconButton}><MaterialCommunityIcons name="close" size={21} color={colors.muted}/></Pressable></View>{recentSuggestions.map(value=><View key={value} style={{flexDirection:'row',alignItems:'center'}}><Pressable accessibilityRole="button" onPress={()=>chooseQuery(value)} style={{flex:1,minHeight:52,flexDirection:'row',alignItems:'center',gap:14}}><MaterialCommunityIcons name="history" size={21} color={colors.muted}/><Text numberOfLines={1} style={[s.rowTitle,{flex:1}]}>{value}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Quitar búsqueda ${value}`} style={s.iconButton} onPress={()=>setHistory(old=>{const next=old.filter(item=>item!==value);void AsyncStorage.setItem(HISTORY,JSON.stringify(next)).catch(()=>{});return next;})}><MaterialCommunityIcons name="close" size={18} color={colors.outline}/></Pressable></View>)}{!recentSuggestions.length?<Text style={s.rowMeta}>{query?'No hay búsquedas recientes que coincidan.':'Tus búsquedas aparecerán aquí.'}</Text>:null}</View>:source==='youtube'&&!query.trim()?<ExploreHome onOpen={openVideo} onQuery={chooseQuery}/>:null}
    {!suggestionsOpen?<ActiveDownloadPreview/>:null}
    {!suggestionsOpen&&(source==='local'||query.trim())?<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:16,marginBottom:8}}>
      <Text style={[s.results,{flex:1,marginTop:0,marginBottom:0}]}>{source==='local'?'EN TU DISPOSITIVO':'YOUTUBE'} · {data.length} resultados</Text>
      {source==='local'?<Pressable accessibilityLabel="Ordenar canciones" onPress={()=>setSortOpen(true)} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:6}}><MaterialCommunityIcons name="sort" size={20} color={colors.muted}/><Text style={{color:colors.muted,fontFamily:fonts.semiBold,fontSize:12}}>{sortLabels[sort]}</Text></Pressable>:null}
    </View>:null}
  </View>;
  const empty=suggestionsOpen?null:source==='local'?<WaveEmptyState title={query?'Sin coincidencias':'No hay canciones'} action={!query?'Escanear música':undefined} onPress={()=>void wave.scan()}/>:error?<WaveEmptyState icon="wifi-alert" title="No pudimos buscar" message={error} action="Reintentar" onPress={()=>{setRetry(value=>value+1);setError('');setLoading(true);}}/>:loading?<View accessibilityLabel="Buscando en YouTube" style={s.skeleton}><View style={s.skeletonArt}/><View style={s.skeletonLine}/><View style={[s.skeletonLine,{width:'60%'}]}/></View>:query.trim().length>=3?<WaveEmptyState icon="magnify-close" title="Sin resultados"/>:null;
  return <View style={s.root}><FlatList data={data} keyExtractor={item=>item.id} ListHeaderComponent={header} ListEmptyComponent={empty} contentContainerStyle={[s.list,{paddingBottom:190+insets.bottom}]} keyboardShouldPersistTaps="handled" initialNumToRender={8} windowSize={6} renderItem={renderItem}/><BottomSheet visible={sortOpen} onClose={()=>setSortOpen(false)} title="Ordenar canciones">{(Object.keys(sortLabels) as TrackSort[]).map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:sort===value}} onPress={()=>{setSort(value);setSortOpen(false);}} style={{minHeight:54,flexDirection:'row',alignItems:'center',gap:12}}><MaterialCommunityIcons name={sort===value?'check':'sort'} size={20} color={colors.pink}/><Text style={{color:colors.text,fontFamily:fonts.semiBold}}>{sortLabels[value]}</Text></Pressable>)}</BottomSheet></View>;
}

function ActiveDownloadPreview(){
 const {downloads}=useDownloads(),{colors}=useTheme(),s=useS();
 const active=downloads.filter(item=>['queued','downloading','converting','embedding','saving'].includes(item.state));
 if(!active.length)return null;
 return <View style={s.downloads}><Pressable style={s.historyHead} onPress={()=>openRoute('/(tabs)/downloads')}><Text style={s.heading}>Descargas activas · {active.length}</Text><MaterialCommunityIcons name="chevron-right" size={22} color={colors.pink}/></Pressable>{active.slice(0,2).map(item=><View key={item.id} style={s.download}><Text style={s.rowTitle}>{item.title}</Text><View style={s.rail}><View style={[s.fill,{width:`${Math.max(0,Math.min(100,item.progress))}%`}]}/></View></View>)}</View>;
}
const useS = () => { const {colors} = useTheme(); return StyleSheet.create({root:{flex:1,backgroundColor:colors.canvas},list:{paddingHorizontal:20},copy:{flex:1},sources:{overflow:'hidden',flexDirection:'row',backgroundColor:colors.surface2,borderRadius:24,padding:4,marginVertical:16},source:{flex:1,minHeight:44,borderRadius:22,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},sourceOn:{backgroundColor:colors.pink},sourceText:{fontFamily:fonts.bold,fontSize:13,color:colors.muted},sourceTextOn:{color:colors.background},search:{overflow:'hidden',minHeight:52,borderRadius:8,backgroundColor:colors.surface2,flexDirection:'row',alignItems:'center',paddingLeft:14,gap:10},input:{flex:1,color:colors.text,fontFamily:fonts.regular,fontSize:14},iconButton:{width:44,height:44,alignItems:'center',justifyContent:'center'},history:{marginTop:22},historyHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',minHeight:44},heading:{flex:1,fontFamily:fonts.bold,fontSize:16,color:colors.text},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},results:{fontFamily:fonts.bold,fontSize:11,color:colors.outline,marginTop:24,marginBottom:14},video:{marginBottom:20},thumb:{width:'100%',aspectRatio:16/9,borderRadius:8,backgroundColor:colors.surface3},videoPlay:{position:'absolute',bottom:12,left:12,width:44,height:44,borderRadius:22,backgroundColor:colors.pink,alignItems:'center',justifyContent:'center'},duration:{position:'absolute',right:10,bottom:12,backgroundColor:colors.canvas,borderRadius:4,padding:5},durationText:{fontFamily:fonts.bold,fontSize:11,color:colors.text},videoInfo:{flexDirection:'row',alignItems:'center',gap:8,paddingTop:10},rowTitle:{fontFamily:fonts.semiBold,fontSize:14,lineHeight:20,color:colors.text},rowMeta:{fontFamily:fonts.regular,fontSize:12,color:colors.muted,marginTop:4},downloads:{marginTop:20},download:{overflow:'hidden',padding:12,backgroundColor:colors.surface2,borderRadius:8,marginTop:8},rail:{height:3,backgroundColor:colors.surfaceHighest,marginTop:10},fill:{height:3,backgroundColor:colors.pink},skeleton:{marginTop:24,gap:12},skeletonArt:{aspectRatio:16/9,backgroundColor:colors.surface3,borderRadius:8},skeletonLine:{width:'85%',height:14,backgroundColor:colors.surface3,borderRadius:4}}); };

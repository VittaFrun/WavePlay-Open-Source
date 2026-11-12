import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Artwork } from './Artwork';
import { useFriendsListening } from '../providers/FriendsListeningProvider';
import { getYouTubeVideo, searchYouTubeMusic } from '../services/youtube';
import { youtubeVideoId } from '../utils/roomYouTube';
import type { RoomSongIntent } from '../utils/listeningRoom';
import type { YouTubeVideo } from '../types';
import { fonts, useTheme } from '../theme';

export function RoomYouTubePicker({onClose}:{onClose:()=>void}){
  const friends=useFriendsListening(),{colors}=useTheme();
  const [query,setQuery]=useState(''),[videos,setVideos]=useState<YouTubeVideo[]>([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  const [selected,setSelected]=useState<YouTubeVideo|null>(null),[adding,setAdding]=useState(false);
  const locked=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    const controller=new AbortController(),term=query.trim();
    const timer=setTimeout(()=>{
      if(term.length<3){setVideos([]);setLoading(false);setError('');return;}
      setLoading(true);setError('');
      const id=youtubeVideoId(term);
      void (id?getYouTubeVideo(id,controller.signal).then(video=>[video]):searchYouTubeMusic(term,controller.signal))
        .then(items=>{if(!controller.signal.aborted)setVideos(items);})
        .catch(reason=>{if(!controller.signal.aborted){setVideos([]);setError(reason instanceof Error?reason.message:'No se pudo buscar en YouTube.');}})
        .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },450);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query]);
  const add=async(intent:RoomSongIntent)=>{
    if(!selected||locked.current)return;
    locked.current=true;setAdding(true);setError('');
    try{await friends.addYouTube(selected,intent);if(alive.current)onClose();}
    catch(reason){if(alive.current)setError(reason instanceof Error?reason.message:'No se pudo añadir el video.');}
    finally{locked.current=false;if(alive.current)setAdding(false);}
  };
  const render=useCallback(({item}:{item:YouTubeVideo})=><Pressable disabled={locked.current} accessibilityRole="button" accessibilityLabel={`Elegir ${item.title}`} onPress={()=>setSelected(item)} style={{minHeight:86,flexDirection:'row',alignItems:'center',gap:12}}><Artwork uri={item.thumbnail} size={52}/><View style={{flex:1}}><Text numberOfLines={2} style={{color:colors.text,fontFamily:fonts.semiBold}}>{item.title}</Text><Text numberOfLines={1} style={{color:colors.muted,fontFamily:fonts.regular,fontSize:12}}>{item.channel} · YouTube</Text></View></Pressable>,[colors]);
  return <>
    <Text style={{color:colors.muted,fontFamily:fonts.regular,fontSize:12,marginVertical:10}}>Busca un video o pega su enlace. Se reproducirá desde YouTube en cada dispositivo.</Text>
    <TextInput accessibilityLabel="Buscar en YouTube o pegar enlace" editable={!adding} value={query} onChangeText={value=>{setQuery(value);setSelected(null);}} autoCapitalize="none" placeholder="Canción, artista o enlace de YouTube" placeholderTextColor={colors.muted} style={{height:50,borderWidth:1,borderColor:colors.border,borderRadius:12,paddingHorizontal:12,color:colors.text,backgroundColor:colors.surface2}}/>
    {loading||adding?<ActivityIndicator color={colors.pink} style={{marginVertical:10}}/>:null}
    {error?<Text accessibilityRole="alert" style={{color:colors.danger,fontFamily:fonts.semiBold,marginVertical:10}}>{error}</Text>:null}
    {selected?<View style={{padding:14,marginVertical:12,borderRadius:12,backgroundColor:colors.surface2}}><Text numberOfLines={2} style={{color:colors.text,fontFamily:fonts.bold}}>{selected.title}</Text>
      {(['queue','next','now'] as const).map(intent=><Pressable key={intent} accessibilityRole="button" disabled={adding||(intent!=='queue'&&!friends.canControl)} onPress={()=>void add(intent)} style={{minHeight:48,justifyContent:'center',opacity:(intent!=='queue'&&!friends.canControl)?0.4:1}}><Text style={{color:colors.pink,fontFamily:fonts.semiBold}}>{intent==='queue'?'Añadir al final':intent==='next'?'Reproducir siguiente':'Reproducir ahora'}</Text></Pressable>)}
    </View>:null}
    <FlatList data={videos} keyExtractor={video=>video.id} renderItem={render} initialNumToRender={8} maxToRenderPerBatch={6} windowSize={5} keyboardShouldPersistTaps="handled" ListEmptyComponent={!loading?<Text style={{color:colors.muted,fontFamily:fonts.regular,textAlign:'center',padding:22}}>{query.trim().length<3?'Escribe al menos 3 caracteres para buscar.':'No hay resultados.'}</Text>:null}/>
  </>;
}

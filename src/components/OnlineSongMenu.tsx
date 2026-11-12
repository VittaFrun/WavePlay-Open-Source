import { AppAlert as Alert } from '../services/appAlert';
import { HeaderButton } from './HeaderButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ReactNode, type ComponentProps } from 'react';
import { Pressable, Text } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { MenuAction, MenuGroup } from './MenuAction';
import { Artwork } from './Artwork';
import { useLibrary, useWaveActions } from '../providers/WaveProvider';
import { saveOnlineVideo } from '../services/database';
import { notifyChange } from '../services/feedback';
import { useTheme } from '../theme';
import type { YouTubeVideo } from '../types';

export function OnlineSongMenu({video,onRoom,triggerIcon='dots-vertical',themes}:{video:YouTubeVideo;onRoom?:()=>void;triggerIcon?:ComponentProps<typeof MaterialCommunityIcons>['name'];themes?:ReactNode}){
  const {colors}=useTheme(),library=useLibrary(),actions=useWaveActions();
  const [open,setOpen]=useState(false),[playlists,setPlaylists]=useState(false),[themePage,setThemePage]=useState(false),[busy,setBusy]=useState(false);
  const saved=library.tracks.find(t=>t.youtubeId===video.id);
  const run=async(task:(track:Awaited<ReturnType<typeof saveOnlineVideo>>)=>Promise<unknown>|void)=>{
    if(busy)return;setBusy(true);
    try{const track=saved&&saved.inLibrary!==false?saved:await saveOnlineVideo(video);await task(track);await actions.refresh();setOpen(false);setPlaylists(false);}catch(error){Alert.alert('No se pudo completar',error instanceof Error?error.message:String(error));}finally{setBusy(false);}
  };
  const row=(label:string,task:()=>void,icon:ComponentProps<typeof MaterialCommunityIcons>['name']='playlist-music-outline')=><MenuAction key={label} label={label} icon={icon} disabled={busy} onPress={task}/>;
  const show=()=>{setOpen(true);setPlaylists(false);setThemePage(false);};
  return <>{triggerIcon==='dots-vertical'?<Pressable accessibilityLabel={`Opciones de ${video.title}`} onPress={show} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name={triggerIcon} size={23} color={colors.muted}/></Pressable>:<HeaderButton icon={triggerIcon} label="Ajustes del reproductor" onPress={show}/>}
<BottomSheet visible={open} onClose={()=>setOpen(false)} subtitle={themePage||playlists?undefined:video.channel} leading={themePage||playlists?undefined:<Artwork uri={video.thumbnail} size={52}/>} title={themePage?'Temas del reproductor':playlists?'Añadir a playlist':video.title}>
    {themePage?<>{row('Volver',()=>setThemePage(false),'arrow-left')}{themes}</>:playlists?<>{row('Volver',()=>setPlaylists(false),'arrow-left')}{library.playlists.map(p=>row(p.name,()=>void run(t=>actions.addTracksToPlaylist(p.id,[t.id]))))}{!library.playlists.length?<Text style={{color:colors.muted}}>Crea una playlist desde Biblioteca.</Text>:null}</>:<>
      <MenuGroup title="Tu reproductor">{themes?row('Temas del reproductor',()=>setThemePage(true),'palette-outline'):null}
      {row(saved&&saved.inLibrary!==false?'Guardada en Biblioteca':'Guardar en Biblioteca',()=>void run(()=>notifyChange('Canción guardada')),'bookmark-music-outline')}
      {row(saved?.favorite?'Quitar de favoritas':'Añadir a favoritas',()=>void run(t=>actions.toggleTrackFavorite(t)),saved?.favorite?'heart':'heart-outline')}
      {row('Añadir a playlist',()=>setPlaylists(true),'playlist-plus')}</MenuGroup><MenuGroup title="Escucha">
      {row(onRoom?'Añadir a la sala':'Reproducir siguiente',()=>{if(onRoom){setOpen(false);onRoom();}else void run(t=>actions.addNext(t));},onRoom?'account-group-outline':'skip-next-outline')}
      {!onRoom?row('Añadir a la cola',()=>void run(t=>actions.addToQueue(t)),'playlist-play'):null}</MenuGroup>
    </>}
  </BottomSheet></>;
}

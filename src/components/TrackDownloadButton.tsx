import { AppAlert as Alert } from '../services/appAlert';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useCallback, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import type { Track } from '../types';
import { useTheme } from '../theme';
import { getDownloadState, subscribeDownloadState, quickDownload } from '../services/quickDownload';

export const TrackDownloadButton=memo(function TrackDownloadButton({track}:{track:Track}){
  const {colors}=useTheme(),id=track.youtubeId||'';
  const subscribe=useCallback((fn:()=>void)=>subscribeDownloadState(id,fn),[id]);
  const snapshot=useCallback(()=>getDownloadState(id),[id]);
  const state=useSyncExternalStore(subscribe,snapshot,snapshot);
  if(!id){return <MaterialCommunityIcons accessibilityLabel="Archivo local" name="cellphone-check" size={14} color={colors.muted}/>;}
  if(track.downloaded)return <MaterialCommunityIcons accessibilityLabel="Descargada, disponible sin conexión" name="download-circle" size={18} color={colors.pink}/>;
  return <Pressable accessibilityRole="button" accessibilityLabel={state?(state==='queued'?'Descarga en espera':state==='downloading'?'Descargando canción':'Preparando canción'):`Descargar ${track.title}`} accessibilityState={{busy:Boolean(state),disabled:Boolean(state)}} disabled={Boolean(state)} onPress={event=>{event.stopPropagation();void quickDownload(track).catch(error=>Alert.alert('No se pudo descargar',String(error.message||error)));}} style={{width:40,height:44,alignItems:'center',justifyContent:'center'}}>{state?<ActivityIndicator size="small" color={colors.pink}/>:<MaterialCommunityIcons name="download-outline" size={20} color={colors.muted}/>}</Pressable>;
});

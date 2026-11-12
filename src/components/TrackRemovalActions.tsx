import { AppAlert as Alert } from '../services/appAlert';
import { MenuAction } from './MenuAction';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useRef } from 'react';
import { NativeModules, Pressable, Text } from 'react-native';
import { useWaveActions, useQueue, useScan } from '../providers/WaveProvider';
import { hideTrack, invalidateDownloadedCopy, markTrackDeleted, restoreHiddenTracks } from '../services/database';
import { requestAudioPermission } from '../services/library';
import { fonts, useTheme } from '../theme';
import type { Track } from '../types';
import { notifyChange } from '../services/feedback';

export function TrackRemovalActions({ track, onClose, onRemoved }: { track: Track | null; onClose: () => void; onRemoved?: () => void }) {
  const wave = {...useWaveActions(),...useQueue(),...useScan()};
  const busy = useRef(false);
  const remove = async (fromDevice: boolean) => {
    if (!track || busy.current) return;
    if (wave.scanning) { Alert.alert('Escaneo en curso', 'Espera a que termine antes de quitar canciones.'); return; }
    busy.current = true;
    try {
      if (fromDevice) {
        if(wave.current?.id===track.id)wave.pauseSharedPlayback();
        await requestAudioPermission();
        // Resolve the exact audio asset rather than passing a download job ID.
        const id = /^content:\/\/media\/.*\/audio\/media\/\d+$/.test(track.uri) ? track.uri.split('/').pop()! : track.localTrackId||track.id;
        if (!/^\d+$/.test(id)) throw new Error('Primero actualiza la biblioteca para identificar este archivo en Android.');
        const asset = await MediaLibrary.getAssetInfoAsync(id);
        if (asset.mediaType !== MediaLibrary.MediaType.audio) throw new Error('El archivo no es un audio. No se eliminó.');
        if (asset.filename !== track.filename) throw new Error('El archivo cambió. Actualiza la biblioteca antes de eliminarlo.');
        if (!await NativeModules.WavePlayDownloader.deleteAudioAsset(id)) return;
      }
      if(fromDevice&&track.youtubeId)await invalidateDownloadedCopy(track.id);else if(fromDevice)await markTrackDeleted(track);else await hideTrack(track);
      if (!track.youtubeId&&wave.current?.uri === track.uri) wave.clearQueue();
      else if(!track.youtubeId)for (let index = wave.queue.length - 1; index >= 0; index--) if (wave.queue[index].uri === track.uri) wave.removeFromQueue(index);
      await wave.refresh();
      notifyChange(fromDevice ? 'Archivo eliminado del dispositivo' : 'Canción quitada de WavePlay');
      onRemoved?.();
    } catch (error) {
      Alert.alert('No se pudo completar', error instanceof Error ? error.message : 'El archivo no se ha quitado de WavePlay.');
    } finally { busy.current = false; }
  };
  const confirm = (fromDevice: boolean) => {
    if (!track) return;
    onClose();
    Alert.alert(fromDevice ? 'Eliminar del dispositivo' : 'Quitar de WavePlay', fromDevice
      ? `Se borrará el archivo de “${track.title}”. También dejará de estar disponible en otros reproductores. Esta acción no se puede deshacer desde WavePlay.`
      : track.youtubeId?`Se quitará “${track.title}” de Biblioteca sin borrar el archivo descargado.`:`“${track.title}” se ocultará de WavePlay y sus playlists. El archivo seguirá en el dispositivo y no reaparecerá al escanear. Puedes recuperar las canciones ocultas desde Biblioteca.`,
    [{ text: 'Cancelar', style: 'cancel' }, { text: fromDevice ? 'Eliminar archivo' : 'Quitar de la app', style: 'destructive', onPress: () => void remove(fromDevice) }]);
  };
  return <>{([false,...(!track?.youtubeId||track.downloaded?[true]:[])] as boolean[]).map(fromDevice => <MenuAction key={String(fromDevice)} icon={fromDevice?'delete-outline':'eye-off-outline'} label={fromDevice?track?.youtubeId?'Quitar descarga':'Eliminar del dispositivo':'Quitar de Biblioteca'} destructive={fromDevice} onPress={()=>confirm(fromDevice)}/>)}</>;
}

export function RestoreHiddenTracksAction() {
  const wave = {...useWaveActions(),...useScan()};
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" style={{ padding: 16 }} onPress={() => Alert.alert('Recuperar canciones ocultas', 'Volverán a incorporarse al escanear si sus archivos siguen en el dispositivo.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Recuperar', onPress: () => { if (wave.scanning) return; void restoreHiddenTracks().then(() => wave.scan()).catch(() => Alert.alert('No se pudieron recuperar las canciones')); } }])}><Text style={{ color: colors.muted, fontFamily: fonts.semiBold }}>Recuperar canciones ocultas</Text></Pressable>;
}

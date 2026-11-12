import { AppAlert as Alert } from '../services/appAlert';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLibrary, useQueue, usePlaybackRef, useWaveActions } from '../providers/WaveProvider';
import { fonts, useTheme } from '../theme';
import type { Track } from '../types';
import { BottomSheet } from './BottomSheet';
import { MenuAction } from './MenuAction';
import { Artwork } from './Artwork';
import { presentationLabels, type PlayerPresentation } from './PlayerCover';
import { PlayerThemePicker } from './PlayerThemePicker';
import { TrackRemovalActions } from './TrackRemovalActions';

type Props = { visible: boolean; onClose: () => void; track: Track; presentation: PlayerPresentation; onChoose: (value: PlayerPresentation) => Promise<void>; onTimer: () => void; onLyrics: () => void };
export function PlayerSettings(props: Props) {
  // Mount a fresh panel on each opening, without effects that reset navigation.
  return <BottomSheet visible={props.visible} onClose={props.onClose} title={props.track.title} subtitle={props.track.artist} leading={<Artwork uri={props.track.artwork} size={52}/>}>{props.visible ? <SettingsBody {...props}/> : null}</BottomSheet>;
}

function SettingsBody({ onClose, track, presentation, onChoose, onTimer, onLyrics }: Props) {
  const wave = {...useLibrary(), ...useQueue(), ...useWaveActions()};
  const progress=usePlaybackRef();
  const { colors } = useTheme();
  const [page, setPage] = useState<'main' | 'themes' | 'playlists' | 'details'>('main');
  const [busy, setBusy] = useState(false);
  const action = (icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'], label: string, onPress: () => void) => <MenuAction key={label} icon={icon} label={label} onPress={onPress} disabled={busy}/>;
  if (page !== 'main') return <>
    {action('arrow-left', 'Volver a las opciones', () => setPage('main'))}
    {page === 'themes' ? <PlayerThemePicker track={track} presentation={presentation} onChoose={onChoose}/> : null}
    {page === 'playlists' ? <>{wave.playlists.length ? wave.playlists.map(list => action('playlist-plus', list.name, () => { setBusy(true); void wave.addTracksToPlaylist(list.id, [track.id]).then(onClose).catch(() => Alert.alert('No se pudo añadir la canción')).finally(() => setBusy(false)); })) : <Text style={{ color: colors.muted, paddingVertical: 16 }}>Crea una playlist desde Biblioteca para añadir esta canción.</Text>}</> : null}
    {page === 'details' ? <>{[['Título', track.title], ['Artista', track.artist], ['Álbum', track.album], ['Archivo', track.filename], ['Carpeta', track.folder || 'No disponible'], ['Duración', `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}`], ['Formato', track.mimeType || 'No disponible'], ['Calidad', track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : 'No disponible'], ['Tamaño', track.fileSize ? `${(track.fileSize / 1048576).toFixed(1)} MB` : 'No disponible']].map(([label, value]) => <View key={label} style={{ paddingVertical: 10 }}><Text style={{ fontFamily: fonts.regular, color: colors.muted, fontSize: 11 }}>{label}</Text><Text selectable style={{ fontFamily: fonts.semiBold, color: colors.text, fontSize: 13, marginTop: 4 }}>{value}</Text></View>)}</> : null}
  </>;
  return <>
    {track.youtubeId&&!track.audioOnly&&!track.onlinePlayback? action('youtube','Ver video',()=>{onClose();void wave.play(track,wave.queue,undefined,false,{forceOnline:true,position:progress.current.position});}):null}
    {action('palette-outline', `Temas del reproductor · ${presentationLabels[presentation]}`, () => setPage('themes'))}
    {action(track.favorite ? 'heart-off-outline' : 'heart-outline', track.favorite ? 'Quitar de favoritas' : 'Añadir a favoritas', () => { void wave.toggleTrackFavorite(track).catch(() => Alert.alert('No se pudo actualizar favoritas')); onClose(); })}
    {action('playlist-plus', 'Añadir a playlist', () => setPage('playlists'))}
    {action('playlist-play', 'Reproducir después', () => { wave.addNext(track); onClose(); })}
    {action('playlist-music', 'Ver cola de reproducción', () => { onClose(); router.push('/queue'); })}
    {action('timer-outline', 'Temporizador para dormir', () => { onClose(); onTimer(); })}
    {action('text', 'Ver letras', () => { onClose(); onLyrics(); })}
    {action('information-outline', 'Ver/editar información', () => { onClose(); router.push({ pathname: '/track/[id]', params: { id: track.id } } as never); })}
    <TrackRemovalActions track={track} onClose={onClose}/>
  </>;
}

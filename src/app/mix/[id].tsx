import { AppAlert as Alert } from '../../services/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FastFlatList } from '../../components/FastScrollList';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Artwork } from '../../components/Artwork';
import { FloatingMiniPlayer } from '../../components/FloatingMiniPlayer';
import { HeaderButton } from '../../components/HeaderButton';
import { LibraryTrackRow } from '../../components/LibraryTrackRow';
import { PlaylistHeading } from '../../components/PlaylistHeading';
import { ThemeWallpaper } from '../../components/ThemeWallpaper';
import { WaveEmptyState } from '../../components/WaveEmptyState';
import { BottomSheet } from '../../components/BottomSheet';
import { TrackRemovalActions } from '../../components/TrackRemovalActions';
import { TrackInfoAction } from '../../components/TrackInfoAction';
import type { Track } from '../../types';
import { useLibrary, useWaveActions } from '../../providers/WaveProvider';
import { getMixSnapshot } from '../../services/mixNavigation';
import { fonts, useTheme } from '../../theme';
import { localMixes } from '../../utils/music';
import { dailySelection } from '../../utils/waveDj';

export default function MixScreen() {
  const { id, snapshot } = useLocalSearchParams<{ id: string; snapshot?: string }>();
  const wave = {...useLibrary(),...useWaveActions()};
  const { colors, appearance } = useTheme();
  if (!wave.ready) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}><ThemeWallpaper appearance={appearance}/><WaveEmptyState title="Preparando tu mezcla" message="Cargando la música de tu dispositivo." /></SafeAreaView>;
  return <MixBody key={snapshot || id} id={id} token={snapshot} />;
}

function MixBody({ id, token }: { id: string; token?: string }) {
  const wave = {...useLibrary(),...useWaveActions()};
  const { colors, gradients, appearance } = useTheme();
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [savingMix, setSavingMix] = useState(false);
  const [restored] = useState(() => {
    const opened = getMixSnapshot(token);
    if (opened) return opened;
    const fallback = id.startsWith('daily-') ? dailySelection(wave.tracks, id.slice(6)) : localMixes(wave.tracks).find(mix => mix.id === id);
    return fallback ? { id, title: fallback.title, caption: fallback.caption, trackIds: fallback.tracks.map(track => track.id) } : undefined;
  });
  const tracks = useMemo(() => {
    const byId = new Map(wave.tracks.map(track => [track.id, track]));
    return (restored?.trackIds || []).flatMap(trackId => {
      const track = byId.get(trackId);
      return track && !track.missing ? [track] : [];
    });
  }, [wave.tracks, restored]);
  const title = restored?.title || 'Mezcla';
  const source = `mix:${id}`;
  const saveMix = async () => {
    if(savingMix || !tracks.length)return;
    setSavingMix(true);
    try {
      const name=id.startsWith('daily-')?`${title} · ${new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short'}).format(new Date())}`:title;
      await wave.saveMixAsPlaylist(name,tracks.map(track=>track.id));
      Alert.alert('Playlist guardada','La encontrarás en tu Biblioteca.');
    } catch { Alert.alert('No se pudo guardar','Inténtalo de nuevo.'); }
    finally { setSavingMix(false); }
  };
  const lessLike = async () => {
    if(!menuTrack)return;
    try {
      const saved=await AsyncStorage.getItem('waveplay.dj.less');
      const ids=saved?JSON.parse(saved) as string[]:[];
      await AsyncStorage.setItem('waveplay.dj.less',JSON.stringify([...new Set([...ids,menuTrack.id])].slice(-100)));
      setMenuTrack(null);
      Alert.alert('Wave DJ lo tendrá en cuenta','Esta canción aparecerá menos en próximas selecciones diarias.');
    } catch { Alert.alert('No se guardó la preferencia','Inténtalo de nuevo.'); }
  };
  return <LinearGradient colors={gradients.aurora} style={styles.root}>
    <ThemeWallpaper appearance={appearance} />
    <SafeAreaView style={styles.root} edges={['top']}>
      <FastFlatList data={tracks} keyExtractor={track => track.id} initialNumToRender={12} maxToRenderPerBatch={8} updateCellsBatchingPeriod={50} windowSize={5} removeClippedSubviews={Platform.OS==='android'}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
          <View style={styles.top}><HeaderButton icon="arrow-left" label="Volver" onPress={() => router.back()} /><Text style={{ fontFamily: fonts.bold, fontSize: 11, color: colors.muted }}>TU MEZCLA · MÚSICA LOCAL</Text></View>
          <PlaylistHeading title={title} count={tracks.length} cover={<View style={styles.cover}>{Array.from({ length: 4 }, (_, index) => <Artwork key={index} uri={tracks[index % Math.max(tracks.length, 1)]?.artwork} size={50} />)}</View>}
            onPlay={() => { if (tracks[0]) void wave.play(tracks[0], tracks, source); }}
            onShuffle={() => { const first = tracks[Math.floor(Math.random() * tracks.length)]; if (first) void wave.play(first, tracks, source, true); }} />
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, marginBottom: 18 }}>{restored?.caption}</Text>
          <Pressable accessibilityRole="button" disabled={savingMix||!tracks.length} onPress={()=>void saveMix()} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:9,marginBottom:18,opacity:savingMix?.5:1}}><Text style={{color:colors.pink,fontFamily:fonts.bold}}>{savingMix?'Guardando…':'Guardar como playlist'}</Text></Pressable>
        </>}
        ListEmptyComponent={<WaveEmptyState title={wave.ready ? 'No hay canciones disponibles' : 'Preparando tu mezcla'} message="Las mezclas contienen únicamente música de tu dispositivo." />}
        renderItem={({ item }) => <LibraryTrackRow track={item} list={tracks} sourceKey={source} onMore={() => setMenuTrack(item)} />} />
      <BottomSheet visible={Boolean(menuTrack)} title={menuTrack?.title || 'Canción'} onClose={() => setMenuTrack(null)}><TrackInfoAction track={menuTrack} onClose={() => setMenuTrack(null)}/>{id.startsWith('daily-')?<Pressable accessibilityRole="button" onPress={()=>void lessLike()} style={{minHeight:54,justifyContent:'center'}}><Text style={{color:colors.muted,fontFamily:fonts.semiBold}}>Menos como esta canción</Text></Pressable>:null}<TrackRemovalActions track={menuTrack} onClose={() => setMenuTrack(null)} /></BottomSheet>
      <FloatingMiniPlayer />
    </SafeAreaView>
  </LinearGradient>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, content: { paddingHorizontal: 14, paddingBottom: 180 }, top: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 15 }, cover: { width: 104, height: 104, flexDirection: 'row', flexWrap: 'wrap', gap: 4, overflow: 'hidden', borderRadius: 8 } });

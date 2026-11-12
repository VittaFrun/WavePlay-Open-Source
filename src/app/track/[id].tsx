import { AppAlert as Alert } from '../../services/appAlert';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Artwork } from '../../components/Artwork';
import { useLibrary, useWaveActions } from '../../providers/WaveProvider';
import { fonts, useTheme } from '../../theme';
import type { Track } from '../../types';
import { canEditAudioTags, normalizeTagText } from '../../utils/trackTags';

const modalSurface = '#1B1B22';

export default function TrackInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wave = {...useLibrary(),...useWaveActions()};
  const track = wave.tracks.find(item => item.id === id);
  const { colors } = useTheme();
  return <View style={s.overlay}>
    <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} accessibilityLabel="Cerrar editor" />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.center} pointerEvents="box-none">
      {track ? <TrackInfoBody key={track.id} track={track} /> : <View style={[s.card, { backgroundColor: modalSurface }]}><Text style={{ color: colors.text }}>La canción no está disponible.</Text><Pressable onPress={() => router.back()}><Text style={{ color: colors.pink, marginTop: 20 }}>Cerrar</Text></Pressable></View>}
    </KeyboardAvoidingView>
  </View>;
}

function TrackInfoBody({ track }: { track: Track }) {
  const wave = useWaveActions();
  const { colors } = useTheme();
  const [title, setTitle] = useState(normalizeTagText(track.title));
  const [artist, setArtist] = useState(normalizeTagText(track.artist));
  const [album, setAlbum] = useState(normalizeTagText(track.album));
  const [genre, setGenre] = useState(normalizeTagText(track.genre || ''));
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const editable = canEditAudioTags(track.filename);
  const changed = title !== track.title || artist !== track.artist || album !== track.album || genre !== (track.genre || '');
  const valid = editable && changed && !!normalizeTagText(title) && !busy;
  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await wave.updateTrackInfo(track.id, { title, artist, album, genre });
      router.back();
    } catch (error) {
      Alert.alert('No se pudieron editar las etiquetas', error instanceof Error ? error.message : 'Comprueba el permiso de escritura y el espacio disponible.');
    } finally { setBusy(false); }
  };
  const field = (label: string, value: string, onChangeText: (value: string) => void) => <View style={s.field} key={label}>
    <Text style={[s.label, { color: colors.muted }]}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} editable={editable && !busy} placeholder={label} placeholderTextColor={colors.outline} selectTextOnFocus style={[s.input, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]} />
  </View>;
  return <View style={[s.card, { backgroundColor: modalSurface, borderColor: colors.border }]}>
    <View style={s.header}><Text style={[s.heading, { color: colors.text }]}>Editar canción</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar" disabled={busy} onPress={() => router.back()} hitSlop={12}><MaterialCommunityIcons name="close" size={23} color={colors.muted}/></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.cover}><Artwork uri={track.artwork} size={58}/><View style={s.coverCopy}><Text numberOfLines={1} style={[s.songTitle, { color: colors.text }]}>{track.title}</Text><Text numberOfLines={1} style={[s.subtle, { color: colors.muted }]}>{track.filename}</Text></View></View>
      {field('Título', title, setTitle)}
      {field('Artista', artist, setArtist)}
      {field('Álbum', album, setAlbum)}
      {field('Género', genre, setGenre)}
      <Pressable onPress={() => setShowDetails(value => !value)} style={s.detailsButton}><Text style={{ color: colors.muted, fontFamily: fonts.semiBold, fontSize: 12 }}>Detalles del archivo {showDetails ? '⌃' : '⌄'}</Text></Pressable>
      {showDetails ? <View><Text style={[s.detail, { color: colors.muted }]}>Carpeta: {track.folder || 'No disponible'}</Text><Text style={[s.detail, { color: colors.muted }]}>Duración: {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, '0')}</Text>{track.bitrate ? <Text style={[s.detail, { color: colors.muted }]}>Calidad: {Math.round(track.bitrate / 1000)} kbps</Text> : null}</View> : null}
      {!editable ? <Text style={[s.notice, { color: colors.muted }]}>Este formato solo se puede consultar. La edición directa está disponible para MP3 y M4A.</Text> : null}
    </ScrollView>
    <View style={s.actions}><Pressable disabled={busy} onPress={() => router.back()} style={[s.cancel, { borderColor: colors.border }]}><Text style={{ color: colors.text, fontFamily: fonts.semiBold }}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" disabled={!valid} onPress={() => void save()} style={[s.save, { backgroundColor: colors.purpleStrong, opacity: valid ? 1 : .45 }]}><Text style={s.saveText}>{busy ? 'Guardando…' : 'Guardar'}</Text></Pressable></View>
  </View>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(2, 2, 8, 0.7)', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 32 },
  card: { width: '100%', maxWidth: 430, maxHeight: '100%', alignSelf: 'center', borderRadius: 24, borderWidth: 1, overflow: 'hidden', padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  heading: { fontFamily: fonts.bold, fontSize: 19 }, content: { paddingBottom: 4 },
  cover: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9 }, coverCopy: { flex: 1 },
  songTitle: { fontFamily: fonts.bold, fontSize: 14 }, subtle: { fontFamily: fonts.regular, fontSize: 11, marginTop: 4 },
  field: { marginTop: 10 }, label: { fontFamily: fonts.semiBold, fontSize: 11, marginBottom: 5 },
  input: { height: 44, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, fontFamily: fonts.regular, fontSize: 14 },
  detailsButton: { paddingVertical: 13 }, detail: { fontFamily: fonts.regular, fontSize: 11, marginBottom: 6 },
  notice: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, marginTop: 7 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 13 },
  cancel: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  save: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
});

import { PanelBackdrop } from './GlassSurface';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Artwork } from './Artwork';
import { useWaveActions } from '../providers/WaveProvider';
import { fonts, useTheme } from '../theme';
import type { LocalMix } from '../utils/music';
import { openMix } from '../services/mixNavigation';

export function LocalMixPanel({ mix, featured = false }: { mix: LocalMix; featured?: boolean }) {const {colors}=useTheme();const s=useS();
  const wave = useWaveActions();
  const duration = Math.round(mix.tracks.reduce((sum, track) => sum + track.duration, 0) / 60);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${mix.title}, ${mix.tracks.length} canciones`}
    onPress={() => openMix(mix)}
    style={({ pressed }) => [s.root, featured && s.featured, pressed && { opacity: 0.7 }]}>
    <PanelBackdrop/>{featured?<LinearGradient colors={['rgba(169,0,255,.22)','rgba(255,55,232,.07)','transparent']} style={StyleSheet.absoluteFill}/>:null}<View style={[s.artwork,featured&&{width:112,height:112}]}>{mix.tracks.slice(0, 4).map((track, index) => <View key={`${track.id}-${index}`}><Artwork uri={track.artwork} size={featured?54:30} /></View>)}</View>
    <View style={s.copy}>{featured?<View style={s.djBadge}><MaterialCommunityIcons name="waveform" size={13} color={colors.pink}/><Text style={[s.djText,{color:colors.pink}]}>WAVE DJ</Text></View>:null}<Text numberOfLines={2} style={s.title}>{mix.title}</Text><Text style={s.caption}>{mix.caption}</Text><Text style={s.meta}>{mix.tracks.length} canciones · {duration} min</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Reproducir ${mix.title}`} hitSlop={8} onPress={event => { event.stopPropagation(); const tracks = mix.tracks.filter(track => !track.missing); if (tracks[0]) void wave.play(tracks[0], tracks, `mix:${mix.id}`); }} style={s.play}><MaterialCommunityIcons name="play" size={25} color={colors.background} /></Pressable>
  </Pressable>;
}

const useS = () => { const {colors} = useTheme(); return StyleSheet.create({
  root:{overflow:'hidden', padding: 14, minHeight: 110, backgroundColor: colors.surface2, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  featured: { backgroundColor: colors.surface2, paddingVertical:20, minHeight:152, borderWidth:1, borderColor:colors.accentBorder },
  artwork: { width: 64, height: 64, gap: 4, flexDirection: 'row', flexWrap: 'wrap' },
  copy: { flex: 1 }, djBadge:{flexDirection:'row',alignItems:'center',gap:5,marginBottom:6},djText:{fontFamily:fonts.extraBold,fontSize:9,letterSpacing:1}, title: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  caption: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 4 },
  meta: { color: colors.outline, fontFamily: fonts.semiBold, fontSize: 11, marginTop: 8 },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pink },
}); };

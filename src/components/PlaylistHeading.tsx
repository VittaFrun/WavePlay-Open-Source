import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, useTheme } from '../theme';
import { SleepTimerSheet } from './SleepTimerSheet';

type Props = {
  title: string; count: number; cover: React.ReactNode; onPlay: () => void;
  onAdd?: () => void; onShuffle?: () => void;
  stats?: { playCount: number; listenedSeconds: number }; onStats?: () => void; rightInset?: number;
  showActions?: boolean; statsLoading?:boolean;
};

type ActionProps = Pick<Props, 'title' | 'count' | 'onPlay' | 'onAdd' | 'onShuffle' | 'rightInset'> & { onTimer?: () => void };

export function PlaylistActions({ title, count, onPlay, onAdd, onShuffle, rightInset = 0, onTimer }: ActionProps) {
  const { colors } = useTheme();
  const [timerOpen, setTimerOpen] = useState(false);
  const smallAction = { width: 44, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentBorder, alignItems: 'center' as const, justifyContent: 'center' as const };
  return <>
    <View style={{ flexDirection: 'row', gap: 10, paddingRight: rightInset }}>
      <Pressable accessibilityLabel={`Reproducir ${title}`} disabled={!count} onPress={onPlay} style={{ minHeight: 48, flex: 1, borderRadius: 24, backgroundColor: colors.pink, opacity: count ? 1 : .4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}><MaterialCommunityIcons name="play" size={23} color={colors.background}/><Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.background }}>Reproducir</Text></Pressable>
      {onShuffle ? <Pressable accessibilityLabel={`Escuchar ${title} en aleatorio`} disabled={!count} onPress={onShuffle} style={[smallAction, { backgroundColor: colors.accentSoft }]}><MaterialCommunityIcons name="shuffle-variant" size={22} color={colors.pink}/></Pressable> : null}
      {onAdd ? <Pressable accessibilityLabel="Añadir canciones" onPress={onAdd} style={smallAction}><MaterialCommunityIcons name="playlist-plus" size={23} color={colors.pink}/></Pressable> : null}
      <Pressable accessibilityLabel="Temporizador para dormir" onPress={onTimer ?? (() => setTimerOpen(true))} style={smallAction}><MaterialCommunityIcons name="timer-outline" size={22} color={colors.pink}/></Pressable>
    </View>
    {!onTimer ? <SleepTimerSheet visible={timerOpen} onClose={() => setTimerOpen(false)}/> : null}
  </>;
}

export function PlaylistHeading({ title, count, cover, onPlay, onAdd, onShuffle, stats, onStats, rightInset = 0, showActions = true, statsLoading = false }: Props) {
  const { colors } = useTheme();
  return <>
    <View style={{ paddingTop: 22, paddingBottom: showActions ? 18 : 0, paddingRight: rightInset }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: '40%', minWidth: 104, maxWidth: 144, gap: 10, alignItems: 'flex-start' }}>
          {cover}
          <View style={{ minWidth: 0 }}><Text numberOfLines={3} style={{ fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: colors.text }}>{title}</Text><Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 8 }}>{count} canciones</Text></View>
        </View>
        {stats||statsLoading ? <Pressable disabled={!onStats||statsLoading} onPress={onStats} accessibilityLabel="Ver estadísticas de la playlist" style={{ flex: 1, minWidth: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingLeft: 14, gap: 16 }}>
          <View><MaterialCommunityIcons name="headphones" size={19} color={colors.pink}/><Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginTop: 4 }}>{statsLoading?'…':stats?.playCount}</Text><Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.muted }}>reproducciones</Text></View>
          <View><MaterialCommunityIcons name="clock-outline" size={19} color={colors.pink}/><Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.text, marginTop: 4 }}>{statsLoading?'…':`${Math.floor((stats?.listenedSeconds||0)/3600)} h ${Math.floor((stats?.listenedSeconds||0)%3600/60)} min`}</Text><Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.muted }}>escuchadas</Text></View>
          {onStats ? <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted}/> : null}
        </Pressable> : null}
      </View>
      {showActions ? <View style={{ marginTop: 20 }}><PlaylistActions title={title} count={count} onPlay={onPlay} onShuffle={onShuffle} onAdd={onAdd}/></View> : null}
    </View>
  </>;
}

import { AppAlert as Alert } from '../services/appAlert';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { HeaderButton } from '../components/HeaderButton';
import { Screen } from '../components/Screen';
import { useLibrary, useWaveActions, useScan } from '../providers/WaveProvider';
import { importMuzioPlaylists } from '../services/database';
import { chooseMuzioBackup, stagedMuzioBackup } from '../services/muzio';
import { fonts, useTheme } from '../theme';
import { planMuzio, type MuzioEntry } from '../utils/muzio';

export default function ImportMuzio() {
  const { colors } = useTheme(), wave = {...useLibrary(),...useWaveActions(),...useScan()};
  const [entries, setEntries] = useState<MuzioEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limits,setLimits]=useState<Record<string,number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof importMuzioPlaylists>> | null>(null);
  const lock = useRef(false);
  const plans = useMemo(() => planMuzio(entries, wave.tracks), [entries, wave.tracks]);
  const chosen = plans.filter(plan => selected.has(plan.sourceKey));
  useEffect(() => {
    let alive = true;
    void stagedMuzioBackup().then(value => {
      if (!alive || !value) return;
      setEntries(value); setSelected(new Set(value.map(row => `muzio.playlist.${row.playlistId}.${encodeURIComponent(row.playlistName)}`)));
    }).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'No se pudo leer el respaldo.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => lock.current);
    return () => subscription.remove();
  }, []);
  const choose = async () => {
    if (lock.current) return;
    lock.current = true; setLoading(true); setError('');
    try {
      const value = await chooseMuzioBackup();
      if (value) {
        setEntries(value); setSelected(new Set(planMuzio(value, wave.tracks).map(plan => plan.sourceKey)));
        setExpanded(new Set()); setLimits({}); setResult(null);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo leer el respaldo.'); }
    finally { lock.current = false; setLoading(false); }
  };
  const toggle = (key: string, setter: typeof setSelected) => setter(current => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next;
  });
  const commit = async () => {
    if (lock.current || !chosen.length || !wave.ready || wave.scanning) return;
    lock.current = true; setBusy(true);
    try {
      const imported = await importMuzioPlaylists(chosen); setResult(imported);
      await wave.refresh().catch(() => Alert.alert('Importación guardada', 'Actualiza la biblioteca para ver los cambios.'));
    } catch (reason) { Alert.alert('No se pudo importar', reason instanceof Error ? reason.message : 'No se guardó ningún cambio.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const text = { color: colors.text, fontFamily: fonts.bold };
  const caption = { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 };
  return <Screen><View style={s.header}><HeaderButton icon="arrow-left" label="Volver" disabled={busy || loading} onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}/><Text style={[text, { fontSize: 23, flex: 1 }]}>Importar Muzio</Text></View>
    <Pressable disabled={busy || loading} onPress={() => void choose()} style={[s.fileButton, { borderColor: colors.border }]}><MaterialCommunityIcons name="folder-open-outline" size={22} color={colors.pink}/><Text style={[caption, { flex: 1 }]}>Seleccionar carpeta del respaldo</Text><MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted}/></Pressable>
    {loading ? <ActivityIndicator style={{ marginVertical: 24 }} color={colors.pink}/> : null}
    {error ? <Text style={[caption, { color: colors.danger, marginTop: 12 }]}>{error}</Text> : null}
    {!loading && !plans.length ? <Text style={[caption, { marginTop: 24 }]}>Sin respaldo cargado</Text> : null}
    {plans.length ? <><View style={s.summary}><Text style={[text, { fontSize: 18 }]}>{plans.filter(plan => !plan.favorites).length} playlists · {new Set(plans.flatMap(plan => plan.trackIds)).size} canciones encontradas</Text><Text style={[caption, { marginTop: 6 }]}>{plans.reduce((total, plan) => total + plan.issues.length, 0)} entradas sin coincidencia segura</Text></View>
      {plans.map(plan => <View key={plan.sourceKey} style={[s.playlist, { borderColor: colors.border }]}>
        <View style={s.playlistRow}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.has(plan.sourceKey) }} accessibilityLabel={`Importar ${plan.name}`} disabled={busy || loading} onPress={() => { toggle(plan.sourceKey, setSelected); setResult(null); }} style={s.icon}><MaterialCommunityIcons name={selected.has(plan.sourceKey) ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={colors.pink}/></Pressable><View style={{ flex: 1 }}><Text style={[text, { fontSize: 16 }]}>{plan.favorites ? 'Favoritos de Muzio' : plan.name}</Text><Text style={caption}>{plan.trackIds.length} de {plan.total} canciones</Text></View>{plan.issues.length ? <Pressable accessibilityLabel={`Ver canciones pendientes de ${plan.name}`} onPress={() => toggle(plan.sourceKey, setExpanded)} style={s.icon}><MaterialCommunityIcons name={expanded.has(plan.sourceKey) ? 'chevron-up' : 'chevron-down'} size={24} color={colors.muted}/></Pressable> : <MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.success}/>}</View>
        {expanded.has(plan.sourceKey) ? plan.issues.slice(0,limits[plan.sourceKey]??30).map((issue, index) => <View key={`${issue.path}-${index}`} style={{ paddingLeft: 44, paddingVertical: 8 }}><Text style={[caption, { color: colors.text }]}>{issue.filename}</Text><Text style={[caption, { color: colors.outline, fontSize: 10 }]}>{issue.reason === 'ambiguous' ? 'Coincidencia ambigua' : 'No encontrada'} · {issue.path}</Text></View>) : null}
        {expanded.has(plan.sourceKey)&&plan.issues.length>(limits[plan.sourceKey]??30)?<Pressable style={s.fileButton} onPress={()=>setLimits(current=>({...current,[plan.sourceKey]:(current[plan.sourceKey]??30)+30}))}><Text style={[caption,{color:colors.pink}]}>Mostrar más · {plan.issues.length-(limits[plan.sourceKey]??30)} pendientes</Text></Pressable>:null}
      </View>)}
      {result ? <View style={s.summary}><Text style={[text, { fontSize: 18 }]}>Importación guardada</Text><Text style={[caption, { marginTop: 6 }]}>{result.playlists} playlists creadas · {result.added} canciones añadidas · {result.favorites} favoritos recuperados{result.unavailable ? ` · ${result.unavailable} canciones ya no disponibles` : ''}</Text><Pressable onPress={() => router.replace('/(tabs)/library?view=playlists')} style={s.fileButton}><MaterialCommunityIcons name="playlist-music-outline" size={22} color={colors.pink}/><Text style={[text, { color: colors.pink }]}>Ver biblioteca</Text></Pressable></View> : null}
      <Pressable disabled={busy || loading || !chosen.length || !wave.ready || wave.scanning || Boolean(result)} onPress={() => void commit()} style={[s.importButton, { backgroundColor: colors.pink, opacity: busy || loading || !chosen.length || !wave.ready || wave.scanning || result ? .45 : 1 }]}>{busy ? <ActivityIndicator color={colors.background}/> : <MaterialCommunityIcons name="database-import-outline" size={22} color={colors.background}/>}<Text style={[text, { color: colors.background, fontSize: 14, flexShrink: 1 }]}>{busy ? 'Importando…' : 'Importar selección'}</Text></Pressable>
    </> : null}
  </Screen>;
}
const s = StyleSheet.create({ header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12 }, fileButton: { minHeight: 52, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth }, summary: { paddingVertical: 22 }, playlist: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 }, playlistRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, importButton: { minHeight: 50, padding: 12, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, marginBottom: 24 } });

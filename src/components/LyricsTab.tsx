import { AppAlert as Alert } from '../services/appAlert';
import { LyricsSearch } from './LyricsSearch';
import { MotionModal } from './MotionModal';
import { MenuBackdrop } from './GlassSurface';
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { findOnlineLyrics, lyricAt, loadTrackLyrics, parseLyrics, saveTrackLyrics, type TrackLyrics } from "../services/lyrics";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { usePlaybackSelector, useWaveActions } from "../providers/WaveProvider";
import { useSceneActive } from '../hooks/useSceneActive';
import { fonts, useTheme } from "../theme";
import type { Track } from "../types";

export function LyricsTab(props:{track:Track;visible?:boolean}){
  return <LyricsBody key={`${props.track.id}:${props.track.uri}`} {...props}/>;
}
function LyricsBody({ track, visible = true }: { track: Track; visible?: boolean }) {const {colors}=useTheme();const s=useS();
  const sceneActive=useSceneActive();const wave=useWaveActions();const reduceMotion=useReducedMotion();
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  const scroll=useRef<ScrollView>(null);const offsets=useRef<Record<number,number>>({});
  const [following,setFollowing]=useState(true);const [viewport,setViewport]=useState(0);const [layoutReady,setLayoutReady]=useState(0);
  const [lyrics, setLyrics] = useState<TrackLyrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [webOpen,setWebOpen]=useState(false);
  const editTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(editTimer.current)clearTimeout(editTimer.current)},[]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const synced=Boolean(lyrics?.lines.some(line=>line.time!==undefined));
  const selectLine=useCallback((playback:{position:number})=>lyrics?lyricAt(lyrics.lines,playback.position):-1,[lyrics]);
  const active=usePlaybackSelector(selectLine,visible&&sceneActive&&synced);

  useEffect(()=>{if(visible&&sceneActive&&following&&synced&&active>=0){
    const y=offsets.current[active];if(y!==undefined)scroll.current?.scrollTo({y:Math.max(0,y-viewport*.38),animated:!reduceMotion});
  }},[active,following,synced,visible,sceneActive,viewport,layoutReady,reduceMotion]);

  useEffect(() => {
    let mounted = true;
    if(editTimer.current)clearTimeout(editTimer.current);
    void loadTrackLyrics({id:track.id,uri:track.uri}).then((result) => {
      if (!mounted) return;
      setLyrics(result);
      setLoading(false);
    }).catch(()=>{if(mounted){setLoading(false);Alert.alert('Letras','No se pudieron cargar las letras guardadas.')}});
    return () => { mounted = false; };
  }, [track.id,track.uri]);

  const lookup = async () => {
    setSearching(true);
    try {
      const found = await findOnlineLyrics(track);
      if(!alive.current)return;
      if (!found) {
        Alert.alert("Letras no encontradas", "No encontramos una coincidencia para esta canción. Puedes añadirlas manualmente.");
        return;
      }
      offsets.current={};setFollowing(true);setLyrics(found);
    } catch (error) {
      if(alive.current)Alert.alert("Letras", error instanceof Error ? error.message : "No se pudieron buscar las letras.");
    } finally {
      if(alive.current)setSearching(false);
    }
  };

  const openEditor = () => { setDraft(lyrics?.text || ""); setEditorOpen(true); };
  const saveManual = async () => {
    const text = draft.trim();
    if (!text) return;
    try{await saveTrackLyrics(track.id, text);
    if(!alive.current)return;
    offsets.current={};setFollowing(true);
    setLyrics({ text, lines: parseLyrics(text), source: "saved" });
    if(alive.current)setEditorOpen(false);}catch{if(alive.current)Alert.alert('Letras','No se pudieron guardar las letras. Intenta otra vez.');}
  };

  const webSearch=<LyricsSearch visible={webOpen} track={track} onClose={()=>setWebOpen(false)} onEdit={()=>{setWebOpen(false);editTimer.current=setTimeout(()=>{if(alive.current)openEditor()},220)}} onImport={text=>{setWebOpen(false);editTimer.current=setTimeout(()=>{if(alive.current){setDraft(text);setEditorOpen(true)}},220)}}/>;
  const editor = <MotionModal transparent visible={editorOpen} animationType="slide" onRequestClose={()=>setEditorOpen(false)}><View style={s.overlay}><MenuBackdrop/><View style={s.editor}><View style={s.editorHandle}/><Text style={s.editorTitle}>Editar letras</Text><Text style={s.editorHelp}>Pega texto normal o líneas LRC como [00:15.20] Letra.</Text><TextInput multiline autoFocus value={draft} onChangeText={setDraft} placeholder="Escribe o pega la letra…" placeholderTextColor={colors.outline} style={s.input}/><View style={s.editorActions}><Pressable onPress={()=>setEditorOpen(false)} style={s.editorButton}><Text style={s.cancelText}>Cancelar</Text></Pressable><Pressable disabled={!draft.trim()} onPress={()=>void saveManual()} style={[s.saveButton,!draft.trim()&&s.disabled]}><Text style={s.saveText}>Guardar</Text></Pressable></View></View></View></MotionModal>;

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.cyan} /><Text style={s.loading}>Cargando letras locales…</Text></View>;
  if (!lyrics) return <View style={s.center}>
    <View style={s.emptyIcon}><MaterialCommunityIcons name="text-box-search-outline" size={35} color={colors.purple} /></View>
    <Text style={s.emptyTitle}>Sin letras todavía</Text>
    <Text style={s.emptyText}>Busca una coincidencia por título y artista, o añade un archivo .lrc de forma local.</Text>
    <Pressable style={s.lookup} disabled={searching} onPress={() => void lookup()}>{searching ? <ActivityIndicator color="#351246" /> : <><MaterialCommunityIcons name="cloud-search-outline" size={18} color="#351246" /><Text style={s.lookupText}>Buscar letras</Text></>}</Pressable>
    <Pressable style={s.manual} onPress={()=>setWebOpen(true)}><Text style={s.manualText}>Buscar LRC en la web</Text></Pressable>
    <Pressable style={s.manual} onPress={openEditor}><Text style={s.manualText}>Añadir manualmente</Text></Pressable>
    {webSearch}{editor}
  </View>;

  return <View style={s.fill}>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',minHeight:40,paddingHorizontal:10}}><Text style={{fontFamily:fonts.bold,fontSize:10,color:colors.muted}}>{synced?'LETRAS SINCRONIZADAS':'LETRAS'}</Text>{synced?<Pressable accessibilityRole="switch" accessibilityState={{checked:following}} accessibilityLabel="Seguimiento de letras" onPress={()=>setFollowing(value=>!value)} style={{minHeight:40,flexDirection:'row',gap:5,alignItems:'center'}}><MaterialCommunityIcons name={following?'crosshairs-gps':'crosshairs'} size={17} color={colors.pink}/><Text style={{fontFamily:fonts.bold,fontSize:11,color:colors.pink}}>{following?'Siguiendo':'Seguir'}</Text></Pressable>:null}</View>
    <ScrollView ref={scroll} onLayout={event=>setViewport(event.nativeEvent.layout.height)} onContentSizeChange={()=>setLayoutReady(value=>value+1)} onScrollBeginDrag={()=>setFollowing(false)} contentContainerStyle={[s.lines,{paddingBottom:Math.max(30,viewport*.5)}]} showsVerticalScrollIndicator={false}>{lyrics.lines.map((line,index)=><Pressable key={`${line.time??"plain"}-${index}-${line.text}`} disabled={line.time===undefined} accessibilityLabel={line.time===undefined?line.text:`Reproducir desde: ${line.text}`} onLayout={event=>{offsets.current[index]=event.nativeEvent.layout.y}} onPress={()=>{if(line.time!==undefined){wave.seek(line.time);setFollowing(true)}}}><Text style={[s.line,!synced&&s.linePlain,active===index&&s.lineActive,active>=0&&index<active&&s.linePast]}>{line.text}</Text></Pressable>)}</ScrollView>
    <View style={s.footer}><View style={s.footerActions}><Pressable accessibilityLabel="Buscar LRC en Google o Megalobiz" style={s.more} onPress={()=>setWebOpen(true)}><MaterialCommunityIcons name="web" size={18} color={colors.purple}/><Text style={s.moreText}>Web LRC</Text></Pressable><Pressable style={s.more} onPress={openEditor}><MaterialCommunityIcons name="pencil-outline" size={16} color={colors.muted} /><Text style={s.editText}>Editar</Text></Pressable><Pressable style={s.more} disabled={searching} onPress={() => void lookup()}><MaterialCommunityIcons name="refresh" size={16} color={colors.purple} /><Text style={s.moreText}>Buscar otra</Text></Pressable></View></View>
    {webSearch}{editor}
  </View>;
}

const useS = () => { const {colors} = useTheme(); return StyleSheet.create({
  fill: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 33 }, loading: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 10 }, emptyIcon: { width: 68, height: 68, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(183,109,255,.11)" }, emptyTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 17, marginTop: 14 }, emptyText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 6 }, lookup: { minWidth: 162, height: 43, borderRadius: 15, marginTop: 17, gap: 7, alignItems: "center", justifyContent: "center", flexDirection: "row", backgroundColor: colors.purple }, lookupText: { color: "#351246", fontFamily: fonts.extraBold, fontSize: 11 }, manual: { marginTop: 13, padding: 7 }, manualText: { color: colors.purple, fontFamily: fonts.bold, fontSize: 10 },
  lines: { paddingVertical: 23, paddingHorizontal: 15, gap: 16, paddingBottom: 15 }, line: { color: colors.muted, fontFamily: fonts.bold, fontSize: 23, lineHeight: 35, textAlign: "center" }, linePlain:{color:colors.text}, lineActive: { color: colors.pink, fontFamily: fonts.bold }, linePast: { color: colors.outline }, footer: { minHeight: 44, flexWrap:"wrap", gap:4, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.07)" }, footerActions:{flexDirection:"row",alignItems:"center",gap:7}, source: { flexDirection: "row", gap: 5, alignItems: "center" }, sourceText: { color: colors.cyan, fontFamily: fonts.bold, fontSize: 8 }, more: { minHeight:44,paddingHorizontal: 8, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }, moreText: { color: colors.purple, fontFamily: fonts.bold, fontSize: 9 }, editText:{color:colors.muted,fontFamily:fonts.bold,fontSize:9},
  overlay:{flex:1,backgroundColor:"transparent",justifyContent:"flex-end"},editor:{maxHeight:"78%",backgroundColor:"#1F1F26",borderTopLeftRadius:28,borderTopRightRadius:28,padding:22,paddingBottom:34},editorHandle:{width:42,height:4,borderRadius:2,backgroundColor:colors.outline,alignSelf:"center"},editorTitle:{color:colors.text,fontFamily:fonts.bold,fontSize:20,marginTop:20},editorHelp:{color:colors.muted,fontFamily:fonts.regular,fontSize:11,lineHeight:16,marginTop:5},input:{minHeight:260,maxHeight:420,borderRadius:18,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,color:colors.text,fontFamily:fonts.regular,fontSize:14,lineHeight:21,textAlignVertical:"top",padding:16,marginTop:16},editorActions:{flexDirection:"row",justifyContent:"flex-end",alignItems:"center",gap:10,marginTop:15},editorButton:{height:44,paddingHorizontal:18,alignItems:"center",justifyContent:"center"},cancelText:{color:colors.muted,fontFamily:fonts.bold,fontSize:12},saveButton:{height:44,borderRadius:15,paddingHorizontal:24,backgroundColor:colors.purpleStrong,alignItems:"center",justifyContent:"center"},saveText:{color:"#fff",fontFamily:fonts.bold,fontSize:12},disabled:{opacity:.4},
}); };

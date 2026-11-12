import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Screen } from "../../components/Screen";
import { useLibrary, useWaveActions } from "../../providers/WaveProvider";
import { fonts, useTheme } from "../../theme";

export default function PlaylistsScreen() {const {colors,gradients}=useTheme();const s=useS();
  const { playlists, tracks } = useLibrary();
  const {createNewPlaylist} = useWaveActions();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [query,setQuery]=useState('');
  const visiblePlaylists=useMemo(()=>{const term=query.trim().toLocaleLowerCase();return playlists.filter(playlist=>playlist.name.toLocaleLowerCase().includes(term));},[playlists,query]);

  const create = async () => {
    if (!name.trim()) return;
    await createNewPlaylist(name);
    setName("");
    setCreating(false);
  };

  return (
    <Screen scroll={false} opaque={false}>
      <FlatList data={visiblePlaylists} keyExtractor={playlist=>String(playlist.id)} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:170}} ListHeaderComponent={<>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>TU MUSICA · TU ORDEN</Text>
          <Text style={s.heading}>Playlists</Text>
          <Text style={s.subtitle}>Colecciones creadas con tu biblioteca local</Text>
        </View>
        <Pressable style={s.add} onPress={() => setCreating((value) => !value)}>
          <LinearGradient colors={gradients.brand} style={s.addGradient}>
            <MaterialCommunityIcons name={creating ? "close" : "plus"} size={24} color="#3B1652" />
          </LinearGradient>
        </Pressable>
      </View>

      {creating ? (
        <View style={s.composer}>
          <View style={s.inputWrap}>
            <MaterialCommunityIcons name="playlist-music-outline" size={21} color={colors.purple} />
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={create}
              autoFocus
              returnKeyType="done"
              placeholder="Nombre de la playlist"
              placeholderTextColor={colors.outline}
              style={s.input}
            />
          </View>
          <Pressable style={[s.save, !name.trim() && s.saveDisabled]} onPress={create} disabled={!name.trim()}>
            <Text style={s.saveText}>Crear</Text>
          </Pressable>
        </View>
      ) : null}

      <LinearGradient colors={["rgba(183,109,255,.22)", "rgba(76,215,246,.08)"]} style={s.hero}>
        <View style={s.heroMark}>
          <MaterialCommunityIcons name="waveform" size={34} color={colors.cyan} />
        </View>
        <View style={s.heroCopy}>
          <Text style={s.heroTitle}>Tu coleccion, sin ruido</Text>
          <Text style={s.heroText}>{tracks.length} canciones locales disponibles para organizar.</Text>
        </View>
      </LinearGradient>

      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>Tus playlists</Text>
        <Text style={s.count}>{visiblePlaylists.length}</Text>
      </View>

      <View style={s.search}><MaterialCommunityIcons name="magnify" size={20} color={colors.outline}/><TextInput value={query} onChangeText={setQuery} placeholder="Buscar playlists" placeholderTextColor={colors.outline} style={s.input}/>{query?<Pressable accessibilityLabel="Borrar búsqueda" onPress={()=>setQuery('')}><MaterialCommunityIcons name="close-circle" size={20} color={colors.outline}/></Pressable>:null}</View>

      </>} renderItem={({item:playlist,index})=>(
          <Pressable
            style={s.card}
            onPress={() => router.push({ pathname: "/playlist/[id]", params: { id: String(playlist.id) } } as never)}
          >
            <LinearGradient
              colors={index % 2 ? ["#392345", "#1C2935"] : ["#3D2051", "#222337"]}
              style={s.cover}
            >
              <MaterialCommunityIcons name={index % 2 ? "music-note-eighth" : "playlist-play"} size={31} color={index % 2 ? colors.cyan : colors.pink} />
            </LinearGradient>
            <View style={s.cardCopy}>
              <Text numberOfLines={1} style={s.title}>{playlist.name}</Text>
              <Text style={s.meta}>{playlist.trackCount || 0} canciones · En el dispositivo</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.outline} />
          </Pressable>
        )} ListEmptyComponent={
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <MaterialCommunityIcons name="playlist-plus" size={40} color={colors.purple} />
          </View>
          <Text style={s.emptyTitle}>{query?'No hay coincidencias':'Crea tu primera coleccion'}</Text>
          <Text style={s.emptyText}>{query?'Prueba con otro nombre de playlist.':'Agrupa canciones para cada momento sin mezclar contenido online.'}</Text>
          {!query?<Pressable style={s.emptyButton} onPress={() => setCreating(true)}><Text style={s.emptyButtonText}>Nueva playlist</Text></Pressable>:null}
        </View>
      }/>
    </Screen>
  );
}

const useS = () => { const {colors} = useTheme(); return StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  eyebrow: { color: colors.cyan, fontFamily: fonts.extraBold, fontSize: 8, letterSpacing: 1.4 },
  heading: { color: colors.text, fontFamily: fonts.extraBold, fontSize: 31, letterSpacing: -1, marginTop: 4 },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  add: { width: 45, height: 45, borderRadius: 23, overflow: "hidden" },
  addGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  composer: { flexDirection: "row", gap: 9, marginTop: 21 },
  search:{height:50,borderRadius:15,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,backgroundColor:colors.surfaceHigh,borderWidth:1,borderColor:colors.border,marginBottom:15},
  inputWrap: { flex: 1, height: 52, borderRadius: 17, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, color: colors.text, fontFamily: fonts.semiBold, fontSize: 13 },
  save: { height: 52, borderRadius: 17, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.purpleStrong },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: "white", fontFamily: fonts.extraBold, fontSize: 12 },
  hero: { minHeight: 112, borderRadius: 25, padding: 18, flexDirection: "row", alignItems: "center", gap: 15, marginTop: 24, borderWidth: 1, borderColor: "rgba(221,183,255,.13)" },
  heroMark: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(14,14,21,.52)" },
  heroCopy: { flex: 1 },
  heroTitle: { color: colors.text, fontFamily: fonts.extraBold, fontSize: 16 },
  heroText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 16, marginTop: 5 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 28, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 20 },
  count: { color: colors.cyan, fontFamily: fonts.extraBold, fontSize: 10, backgroundColor: "rgba(76,215,246,.10)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9 },
  card: { minHeight: 82, borderRadius: 21, backgroundColor: colors.surface2, padding: 9, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 9 },
  cover: { width: 62, height: 62, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cardCopy: { flex: 1 },
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  meta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10, marginTop: 5 },
  empty: { alignItems: "center", paddingVertical: 38, paddingHorizontal: 24, borderRadius: 25, backgroundColor: "rgba(255,255,255,.025)", borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: "rgba(183,109,255,.11)", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 17, marginTop: 16 },
  emptyText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 6 },
  emptyButton: { marginTop: 17, borderRadius: 14, backgroundColor: colors.surfaceHigh, paddingHorizontal: 18, paddingVertical: 11 },
  emptyButtonText: { color: colors.purple, fontFamily: fonts.extraBold, fontSize: 11 },
}); };

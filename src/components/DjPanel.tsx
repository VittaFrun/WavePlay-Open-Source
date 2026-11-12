import { AppAlert as Alert } from '../services/appAlert';
import { router } from "expo-router";
import Slider from "@react-native-community/slider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  memo,
  useCallback,
  useDeferredValue,
  useRef,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  FlatList,
  Pressable,
  Switch,
  Text,
  TextInput,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLibrary, useWaveActions } from "../providers/WaveProvider";
import { dailySelection, localDayKey } from "../utils/waveDj";
import {
  saveDjSession,
  createDjSession,
  discardDjSession,
  getDjSessions,
  subscribeDjSessions,
  editDjSession,
  regenerateDjSession,
  replaceDjSong,
  type DjSession,
} from "../services/djSessions";
import { PlaylistCover } from "./PlaylistCover";
import { PlaylistTile } from "./PlaylistTile";
import { fonts, useTheme } from "../theme";
import { WaveChip } from "./WaveChip";
import { BottomSheet } from "./BottomSheet";
import { DjSessionSongRow } from "./DjSessionSongRow";
import type { Track } from "../types";

const LESS = "waveplay.dj.less",
  SETTINGS = "waveplay.dj.settings";
export const DjPanel = memo(function DjPanel({onSectionChange}:{onSectionChange?:()=>void}) {
  const { tracks, playlists } = useLibrary(),
    actions = useWaveActions(),
    { colors } = useTheme();
  const [tab, setTab] = useState<"sessions" | "create" | "preferences">(
    "sessions",
  );
  const changeSection=useCallback((next:'sessions'|'create'|'preferences')=>{setTab(next);onSectionChange?.();},[onSectionChange]);
  const [unit, setUnit] = useState<"count" | "minutes">("count"),
    [amount, setAmount] = useState(20);
  const [avoidPrevious, setAvoidPrevious] = useState(true);
  const [discovery, setDiscovery] = useState(0.5),
    [variety, setVariety] = useState(true),
    [avoidRecent, setAvoidRecent] = useState(true);
  const [less, setLess] = useState<string[]>([]),
    [preferences, setPreferences] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const sessions = useSyncExternalStore(
    subscribeDjSessions,
    getDjSessions,
    getDjSessions,
  );
  const [sessionQuery, setSessionQuery] = useState(""),
    [songQuery, setSongQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  const generationLock=useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const deferredSessionQuery = useDeferredValue(
    sessionQuery.trim().toLocaleLowerCase(),
  );
  const deferredSongQuery = useDeferredValue(
    songQuery.trim().toLocaleLowerCase(),
  );
  const [activeId, setActiveId] = useState<string | null>(null),
    [name, setName] = useState("");
  const session = sessions.find((item) => item.id === activeId);
  const openSession = useCallback((item: DjSession) => {
    setSongQuery("");
    setName(item.title);
    setActiveId(item.id);
  }, []);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      AsyncStorage.getItem(LESS),
      AsyncStorage.getItem(SETTINGS),
    ])
      .then(([raw, saved]) => {
        if (!alive) return;
        try {
          const value = raw ? JSON.parse(raw) : [];
          if (Array.isArray(value))
            setLess(
              [
                ...new Set(
                  value.filter((id): id is string => typeof id === "string"),
                ),
              ].slice(-100),
            );
        } catch {
          /* Ignore malformed preferences. */
        }
        try {
          const value = saved ? JSON.parse(saved) : null;
          if (value) {
            const unit = value.unit === "minutes" ? "minutes" : "count";
            setUnit(unit);
            setAmount(
              Number.isFinite(value.amount)
                ? Math.round(
                    Math.max(
                      5,
                      Math.min(unit === "minutes" ? 120 : 100, value.amount),
                    ),
                  )
                : unit === "minutes"
                  ? 30
                  : 20,
            );
            setDiscovery(
              Number.isFinite(value.discovery)
                ? Math.max(0, Math.min(1, value.discovery))
                : 0.5,
            );
            setVariety(value.variety !== false);
            setAvoidRecent(value.avoidRecent !== false);
            setAvoidPrevious(value.avoidPrevious !== false);
          }
        } catch {
          /* Use initial choices. */
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  const byId = useMemo(
    () =>
      new Map(
        tracks
          .filter((track) => !track.missing)
          .map((track) => [track.id, track]),
      ),
    [tracks],
  );
  const selected = useMemo(
    () => session?.trackIds.flatMap((id) => byId.get(id) || []) || [],
    [session, byId],
  );
  const playSong = useCallback(
    (track: Track) => {
      if (activeId) void actions.play(track, selected, "mix:" + activeId);
    },
    [actions, selected, activeId],
  );
  const keepSong = useCallback(
    (id: string) => {
      const item = getDjSessions().find((draft) => draft.id === activeId);
      if (item)
        editDjSession(item.id, {
          keptIds: item.keptIds.includes(id)
            ? item.keptIds.filter((key) => key !== id)
            : [...item.keptIds, id],
        });
    },
    [activeId],
  );
  const saved = useMemo(
    () => playlists.filter((list) => list.name.startsWith("DJ · ")),
    [playlists],
  );
  const label = {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  } as const;
  const heading = {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
    marginTop: 24,
    marginBottom: 12,
  } as const;
  const recommend = useCallback(
    () =>
      dailySelection(
        tracks,
        localDayKey(),
        avoidPrevious ? session?.trackIds || sessions[0]?.trackIds || [] : [],
        less,
        {
          ...(unit === "count" ? { count: amount } : { minutes: amount }),
          discovery,
          variety,
          avoidRecent,
          seed: String(Date.now()),
        },
      ),
    [
      tracks,
      avoidPrevious,
      session,
      sessions,
      less,
      unit,
      amount,
      discovery,
      variety,
      avoidRecent,
    ],
  );
  const songOptions = useCallback(
    (track: Track) =>
      Alert.alert(track.title, "", [
        {
          text: "Sustituir canción",
          onPress: () => {
            const item = getDjSessions().find((draft) => draft.id === activeId);
            if (!item) return;
            const next =
              recommend()?.tracks.find(
                (song) => !item.trackIds.includes(song.id),
              ) ||
              tracks.find(
                (song) => !song.missing && !item.trackIds.includes(song.id),
              );
            if (next) replaceDjSong(item.id, track.id, next.id);
            else Alert.alert("No hay más canciones disponibles");
          },
        },
        {
          text: "Quitar de la sesión",
          onPress: () => {
            const item = getDjSessions().find((draft) => draft.id === activeId);
            if (item)
              editDjSession(item.id, {
                trackIds: item.trackIds.filter((id) => id !== track.id),
              });
          },
        },
        { text: "Cancelar", style: "cancel" },
      ]),
    [activeId, recommend, tracks],
  );
  const generateNow = () => {
    void AsyncStorage.setItem(
      SETTINGS,
      JSON.stringify({
        unit,
        amount,
        discovery,
        variety,
        avoidRecent,
        avoidPrevious,
      }),
    ).catch(() => Alert.alert("No se guardaron los ajustes del DJ"));
    const result = recommend();
    if (!result)
      return Alert.alert(
        "Añade música",
        "El DJ necesita canciones disponibles en tu biblioteca.",
      );
    const draft = createDjSession(result);
    if (draft) {
      changeSection("sessions");
      openSession(draft);
    } else
      Alert.alert(
        "Tienes 20 sesiones",
        "Guarda o elimina una sesión antes de crear otra.",
      );
  };
  const undo = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = less.filter((value) => value !== id);
      await AsyncStorage.setItem(LESS, JSON.stringify(next));
      setLess(next);
    } catch {
      Alert.alert("No se pudo guardar la preferencia");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (busy || !selected.length || !session) return;
    const draft = session;
    setBusy(true);
    try {
      await saveDjSession(draft.id, async () => {
        await actions.saveMixAsPlaylist(
          "DJ · " + (name.trim() || draft.title),
          selected.map((track) => track.id),
        );
      });
      setActiveId(null);
      Alert.alert("Playlist guardada", "La encontrarás en tus playlists.");
    } catch {
      Alert.alert("No se pudo guardar la sesión");
    } finally {
      setBusy(false);
    }
  };
  const generate = async () => {
    if (!ready || generationLock.current) return;
    generationLock.current=true;
    setGenerating(true);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => setTimeout(resolve, 0)),
    );
    if (!alive.current){generationLock.current=false;return;}
    try {
      generateNow();
    } finally {
      generationLock.current=false;setGenerating(false);
    }
  };
  const shownSessions=useMemo(()=>sessions.filter(item=>!deferredSessionQuery||item.title.toLocaleLowerCase().includes(deferredSessionQuery)),[sessions,deferredSessionQuery]);
  const shownSongs = useMemo(
    () =>
      deferredSongQuery
        ? selected.filter((track) =>
            (track.title + " " + track.artist)
              .toLocaleLowerCase()
              .includes(deferredSongQuery),
          )
        : selected,
    [selected, deferredSongQuery],
  );
  const playSession = useCallback(
    (id: string) => {
      const draft = getDjSessions().find((item) => item.id === id);
      const songs = draft?.trackIds.flatMap((key) => byId.get(key) || []) || [];
      if (songs[0]) void actions.play(songs[0], songs, "mix:" + id);
    },
    [actions, byId],
  );
  const sessionOptions = useCallback(
    (id: string) => {
      const draft = getDjSessions().find((item) => item.id === id);
      if (!draft) return;
      Alert.alert(draft.title, "", [
        {
          text: "Duplicar sesión",
          onPress: () => {
            const songs = draft.trackIds.flatMap((key) => byId.get(key) || []);
            const copy = createDjSession({
              id: "copy",
              title: draft.title,
              caption: "",
              tracks: songs,
            });
            if (copy) {
              editDjSession(copy.id, {
                title: draft.title + " · Copia",
                keptIds: draft.keptIds,
              });
              openSession({ ...copy, title: draft.title + " · Copia" });
            } else
              Alert.alert(
                "No se pudo duplicar",
                "Guarda o elimina una sesión y comprueba que sus canciones estén disponibles.",
              );
          },
        },
        {
          text: "Eliminar sesión",
          style: "destructive",
          onPress: () => discardDjSession(id),
        },
        { text: "Cancelar", style: "cancel" },
      ]);
    },
    [byId, openSession],
  );
  const totalMinutes = Math.round(
    selected.reduce((total, track) => total + (track.duration || 0), 0) / 60,
  );
  const row = ({ item: track }: { item: Track }) => (
    <DjSessionSongRow
      track={track}
      kept={Boolean(session?.keptIds.includes(track.id))}
      busy={busy}
      onPlay={playSong}
      onKeep={keepSong}
      onOptions={songOptions}
    />
  );
  return (
    <View style={dj.root}>
      <View
        style={[
          dj.hero,
          {
            backgroundColor: colors.accentSoft,
            borderColor: colors.accentBorder,
          },
        ]}
      >
        <View style={{ flex: 1, gap: 5 }}>
          <Text
            style={{
              color: colors.pink,
              fontFamily: fonts.semiBold,
              fontSize: 11,
              letterSpacing: 2,
            }}
          >
            TU MESA DE MEZCLAS
          </Text>
          <Text
            style={{
              color: colors.text,
              fontFamily: fonts.extraBold,
              fontSize: 28,
            }}
          >
            Wave DJ
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {byId.size} canciones · Mezclas a tu medida
          </Text>
        </View>
        <MaterialCommunityIcons name="waveform" size={48} color={colors.pink} />
      </View>
      <View style={[dj.tabs, { backgroundColor: colors.surface2 }]}>
        {(
          [
            ["sessions", "Sesiones", "playlist-music"],
            ["create", "Crear", "auto-fix"],
            ["preferences", "Preferencias", "tune-variant"],
          ] as const
        ).map(([key, title, icon]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => changeSection(key)}
            style={[
              dj.tab,
              tab === key && { backgroundColor: colors.accentSoft },
            ]}
          >
            <MaterialCommunityIcons
              name={icon}
              size={19}
              color={tab === key ? colors.pink : colors.muted}
            />
            <Text
              style={{
                color: tab === key ? colors.text : colors.muted,
                fontFamily: fonts.semiBold,
                fontSize: 12,
              }}
            >
              {title}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === "sessions" && (
        <>
          <View style={dj.sectionHead}>
            <Text style={[heading, { marginTop: 0, marginBottom: 0 }]}>
              Tus sesiones · {sessions.length}
            </Text>
            <Pressable
              accessibilityLabel="Crear una sesión DJ"
              onPress={() => changeSection("create")}
              style={dj.smallAction}
            >
              <MaterialCommunityIcons
                name="plus"
                size={20}
                color={colors.pink}
              />
              <Text style={{ color: colors.pink, fontFamily: fonts.bold }}>
                Nueva
              </Text>
            </Pressable>
          </View>
          {sessions.length > 3 || sessionQuery ? (
            <DjSearch
              value={sessionQuery}
              onChangeText={setSessionQuery}
              placeholder="Buscar sesiones"
            />
          ) : null}
          {shownSessions.map((item) => (
            <DjSessionCard
              key={item.id}
              item={item}
              byId={byId}
              onOpen={openSession}
              onPlay={playSession}
              onOptions={sessionOptions}
            />
          ))}
          {!shownSessions.length ? (
            <View style={[dj.empty, { backgroundColor: colors.surface2 }]}>
              <MaterialCommunityIcons
                name="playlist-music-outline"
                size={36}
                color={colors.pink}
              />
              <Text style={label}>
                {sessionQuery
                  ? "Sin coincidencias"
                  : "Dale un nuevo ritmo a tu biblioteca"}
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  textAlign: "center",
                  lineHeight: 20,
                }}
              >
                {sessionQuery
                  ? "Prueba otro nombre."
                  : "Elige un estilo y descubre tu próxima selección."}
              </Text>
              {!sessionQuery ? (
                <DjButton
                  title="Crear mi sesión"
                  icon="auto-fix"
                  onPress={() => changeSection("create")}
                />
              ) : null}
            </View>
          ) : null}
          {sessions.length ? (
            <Text
              style={{
                color: colors.muted,
                fontSize: 11,
                lineHeight: 17,
                marginTop: 4,
              }}
            >
              Guarda tus sesiones como playlist para conservarlas al cerrar la
              app.
            </Text>
          ) : null}
          <Text style={heading}>Playlists guardadas · {saved.length}</Text>
          {saved.slice(0, 6).map((list) => (
            <PlaylistTile
              key={list.id}
              playlist={list}
              size={64}
              layout="list"
            />
          ))}
          {saved.length > 6 ? (
            <Pressable
              accessibilityLabel="Ver todas las playlists"
              onPress={() => router.setParams({ view: "playlists" })}
              style={dj.smallAction}
            >
              <Text style={{ color: colors.pink, fontFamily: fonts.semiBold }}>
                Ver todas las playlists
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={colors.pink}
              />
            </Pressable>
          ) : null}
          {!saved.length ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Las selecciones que guardes aparecerán aquí.
            </Text>
          ) : null}
        </>
      )}
      {tab === "create" && (
        <>
          <Text style={heading}>¿Qué te apetece escuchar?</Text>
          <View style={dj.presets}>
            {(
              [
                ["Tus favoritas", "heart-outline", 0, 20],
                ["Descubrir", "compass-outline", 1, 20],
                ["Sesión larga", "weather-night", 0.5, 60],
              ] as const
            ).map(([title, icon, balance, size]) => {
              const active =
                discovery === balance &&
                unit === (size === 60 ? "minutes" : "count") &&
                amount === size;
              return (
                <Pressable
                  key={title}
                  onPress={() => {
                    setDiscovery(balance);
                    setUnit(size === 60 ? "minutes" : "count");
                    setAmount(size);
                  }}
                  style={[
                    dj.preset,
                    {
                      backgroundColor: active
                        ? colors.accentSoft
                        : colors.surface2,
                      borderColor: active ? colors.accentBorder : colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={icon}
                    color={colors.pink}
                    size={25}
                  />
                  <Text
                    style={{
                      color: colors.text,
                      fontFamily: fonts.semiBold,
                      fontSize: 12,
                    }}
                  >
                    {title}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    {size === 60 ? "60 min" : "20 canciones"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View
            style={[
              dj.panel,
              { backgroundColor: colors.surface2, borderColor: colors.border },
            ]}
          >
            <View style={dj.sectionHead}>
              <Text style={label}>Tamaño de tu sesión</Text>
              <Text style={{ color: colors.pink, fontFamily: fonts.bold }}>
                {amount} {unit === "count" ? "canciones" : "min"}
              </Text>
            </View>
            <View style={dj.chips}>
              <WaveChip
                label="Canciones"
                selected={unit === "count"}
                onPress={() => {
                  setUnit("count");
                  setAmount(20);
                }}
              />
              <WaveChip
                label="Duración"
                selected={unit === "minutes"}
                onPress={() => {
                  setUnit("minutes");
                  setAmount(30);
                }}
              />
            </View>
            <Slider
              accessibilityLabel="Tamaño de la sesión DJ"
              minimumValue={5}
              maximumValue={unit === "count" ? 100 : 120}
              step={1}
              value={amount}
              onSlidingComplete={setAmount}
              minimumTrackTintColor={colors.pink}
              maximumTrackTintColor={colors.surfaceHigh}
              thumbTintColor={colors.pink}
            />
            <View style={dj.chips}>
              {(unit === "count" ? [10, 20, 30, 50] : [15, 30, 60, 90]).map(
                (value) => (
                  <WaveChip
                    key={value}
                    label={
                      String(value) + (unit === "count" ? " canciones" : " min")
                    }
                    selected={value === amount}
                    onPress={() => setAmount(value)}
                  />
                ),
              )}
            </View>
            <Text style={[label, { marginTop: 12 }]}>Balance de la mezcla</Text>
            <View style={dj.chips}>
              {(
                [
                  [0, "Favoritas"],
                  [0.5, "Equilibrada"],
                  [1, "Descubrir"],
                ] as const
              ).map(([value, title]) => (
                <WaveChip
                  key={title}
                  label={title}
                  selected={discovery === value}
                  onPress={() => setDiscovery(value)}
                />
              ))}
            </View>
            <DjToggle
              title="Variedad de artistas"
              detail="Alterna artistas a lo largo de la sesión"
              value={variety}
              onChange={setVariety}
            />
            <DjToggle
              title="Menos repeticiones recientes"
              detail="Da espacio a canciones que llevas tiempo sin oír"
              value={avoidRecent}
              onChange={setAvoidRecent}
            />
          </View>
          <DjButton
            title={generating ? "Preparando tu selección…" : "Crear sesión"}
            icon="auto-fix"
            disabled={!ready || generating || !byId.size}
            onPress={() => void generate()}
          />
        </>
      )}
      {tab === "preferences" && (
        <>
          <Text style={heading}>Tu forma de escuchar</Text>
          <View
            style={[
              dj.panel,
              { backgroundColor: colors.surface2, borderColor: colors.border },
            ]}
          >
            <DjToggle
              title="Evitar la sesión anterior"
              detail="Favorece canciones diferentes al crear otra mezcla"
              value={avoidPrevious}
              onChange={(value) => {
                setAvoidPrevious(value);
                void AsyncStorage.setItem(
                  SETTINGS,
                  JSON.stringify({
                    unit,
                    amount,
                    discovery,
                    variety,
                    avoidRecent,
                    avoidPrevious: value,
                  }),
                ).catch(() => Alert.alert("No se pudo guardar la preferencia"));
              }}
            />
            <Pressable
              onPress={() => setPreferences(true)}
              style={dj.preferenceRow}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={label}>Menos como esta canción</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {less.length} preferencias · Revisa o deshaz tus elecciones
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={colors.muted}
              />
            </Pressable>
          </View>
        </>
      )}
      <BottomSheet
        visible={Boolean(session)}
        onClose={() => {
          if (!busy) setActiveId(null);
        }}
        title="Tu sesión DJ"
        scrollable={false}
      >
        <TextInput
          accessibilityLabel="Nombre de la sesión DJ"
          editable={!busy}
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (session) editDjSession(session.id, { title: value });
          }}
          placeholder="Nombre de tu sesión"
          placeholderTextColor={colors.muted}
          maxLength={80}
          style={[
            dj.input,
            {
              backgroundColor: colors.surfaceHigh,
              color: colors.text,
              fontFamily: fonts.bold,
              fontSize: 18,
            },
          ]}
        />
        <Text style={{ color: colors.muted, fontSize: 12, marginVertical: 10 }}>
          {selected.length} canciones · {totalMinutes} min
          {session?.keptIds.length
            ? " · " + session.keptIds.length + " fijadas"
            : ""}
        </Text>
        <View style={dj.actions}>
          <DjButton
            title="Escuchar"
            icon="play"
            onPress={() => {
              if (selected[0]) playSong(selected[0]);
            }}
            disabled={!selected.length || busy}
            secondary
          />
          <DjButton
            title={busy ? "Guardando…" : "Guardar playlist"}
            icon="playlist-plus"
            disabled={busy || !selected.length}
            onPress={() => void save()}
          />
        </View>
        <View style={dj.sectionHead}>
          <Text style={{ color: colors.muted, fontSize: 11, flex: 1 }}>
            Fija canciones para conservarlas al renovar.
          </Text>
          <Pressable
            disabled={busy}
            onPress={() => {
              if (session) {
                const result = recommend();
                if (result)
                  regenerateDjSession(
                    session.id,
                    result.tracks.map((track) => track.id),
                  );
              }
            }}
            style={dj.smallAction}
          >
            <MaterialCommunityIcons
              name="refresh"
              size={19}
              color={colors.pink}
            />
            <Text
              style={{
                color: colors.pink,
                fontFamily: fonts.semiBold,
                fontSize: 12,
              }}
            >
              Renovar
            </Text>
          </Pressable>
        </View>
        <DjSearch
          value={songQuery}
          onChangeText={setSongQuery}
          placeholder="Buscar en esta sesión"
        />
        <FlatList
          style={{
            height: Math.min(300, Math.max(68, shownSongs.length * 68)),
            flexShrink: 1,
          }}
          data={shownSongs}
          keyExtractor={(track) => track.id}
          getItemLayout={(_, index) => ({
            length: 68,
            offset: index * 68,
            index,
          })}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          keyboardShouldPersistTaps="handled"
          renderItem={row}
          ListEmptyComponent={
            <Text style={{ color: colors.muted, paddingVertical: 20 }}>
              {songQuery
                ? "No hay coincidencias."
                : "No quedan canciones disponibles. Renueva la selección."}
            </Text>
          }
        />
        <Pressable
          disabled={busy}
          onPress={() => {
            if (session) discardDjSession(session.id);
            setActiveId(null);
          }}
          style={dj.smallAction}
        >
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Eliminar sesión
          </Text>
        </Pressable>
      </BottomSheet>
      <BottomSheet
        visible={preferences}
        onClose={() => setPreferences(false)}
        title="Preferencias del DJ"
        scrollable={false}
      >
        <FlatList
          style={{ maxHeight: 320 }}
          data={less}
          keyExtractor={(id) => id}
          initialNumToRender={8}
          ListEmptyComponent={
            <Text style={{ color: colors.muted, paddingVertical: 16 }}>
              Todavía no has marcado canciones.
            </Text>
          }
          renderItem={({ item: id }) => (
            <View style={dj.preferenceRow}>
              <Text numberOfLines={2} style={[label, { flex: 1 }]}>
                {byId.get(id)?.title || "Canción no disponible"}
              </Text>
              <Pressable
                disabled={busy}
                onPress={() => void undo(id)}
                style={dj.smallAction}
              >
                <Text style={{ color: colors.pink }}>Deshacer</Text>
              </Pressable>
            </View>
          )}
        />
      </BottomSheet>
    </View>
  );
});

function DjButton({
  title,
  icon,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        dj.button,
        {
          backgroundColor: secondary ? colors.accentSoft : colors.pink,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={secondary ? colors.pink : colors.background}
      />
      <Text
        numberOfLines={1}
        style={{
          color: secondary ? colors.pink : colors.background,
          fontFamily: fonts.bold,
          fontSize: 13,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
function DjToggle({
  title,
  detail,
  value,
  onChange,
}: {
  title: string;
  detail: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={dj.preferenceRow}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            color: colors.text,
            fontFamily: fonts.semiBold,
            fontSize: 13,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>
          {detail}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.pink }}
      />
    </View>
  );
}
function DjSearch({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[dj.search, { backgroundColor: colors.surfaceHigh }]}>
      <MaterialCommunityIcons name="magnify" size={19} color={colors.muted} />
      <TextInput
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
        style={{ flex: 1, color: colors.text, fontSize: 13, minHeight: 44 }}
      />
      {value ? (
        <Pressable
          accessibilityLabel="Borrar búsqueda"
          onPress={() => onChangeText("")}
          style={{ padding: 8 }}
        >
          <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
const DjSessionCard = memo(function DjSessionCard({
  item,byId,
  onOpen,
  onPlay,
  onOptions,
}: {
  item:DjSession;byId:Map<string,Track>;
  onOpen: (session: DjSession) => void;
  onPlay: (id: string) => void;
  onOptions: (id: string) => void;
}) {
  const { colors } = useTheme();
  const card=useMemo(()=>{const songs=item.trackIds.flatMap(id=>byId.get(id)||[]);return {item,songs,minutes:Math.round(songs.reduce((total,track)=>total+(track.duration||0),0)/60),artworks:[...new Set(songs.flatMap(track=>track.artwork?[track.artwork]:[]))].slice(0,4)};},[item,byId]);
  return (
    <View
      style={[
        dj.sessionCard,
        { backgroundColor: colors.surface2, borderColor: colors.border },
      ]}
    >
      <Pressable
        accessibilityLabel={"Ver canciones de " + card.item.title}
        onPress={() => onOpen(card.item)}
        style={dj.sessionInfo}
      >
        <PlaylistCover
          playlist={{
            id: 0,
            name: card.item.title,
            createdAt: card.item.createdAt,
            artworks: card.artworks,
          }}
          size={62}
        />
        <View style={{ flex: 1, gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 15 }}
          >
            {card.item.title}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            {card.songs.length} canciones · {card.minutes} min
          </Text>
        </View>
      </Pressable>
      <Pressable
        disabled={!card.songs.length}
        accessibilityLabel={"Reproducir " + card.item.title}
        onPress={() => onPlay(card.item.id)}
        style={[dj.iconAction, { backgroundColor: colors.accentSoft }]}
      >
        <MaterialCommunityIcons name="play" size={24} color={colors.pink} />
      </Pressable>
      <Pressable
        accessibilityLabel={"Opciones de " + card.item.title}
        onPress={() => onOptions(card.item.id)}
        style={dj.iconAction}
      >
        <MaterialCommunityIcons
          name="dots-vertical"
          size={22}
          color={colors.muted}
        />
      </Pressable>
    </View>
  );
});
const dj = StyleSheet.create({
  root: { paddingTop: 8 },
  hero: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 16,
    marginTop: 16,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
    marginBottom: 10,
  },
  smallAction: {
    minHeight: 44,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  presets: { flexDirection: "row", gap: 8 },
  preset: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 9,
    minHeight: 116,
  },
  panel: {
    padding: 14,
    marginVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  button: {
    minHeight: 48,
    flexShrink: 1,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  actions: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  empty: { padding: 24, borderRadius: 20, gap: 14, alignItems: "center" },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
  },
  sessionInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 68,
  },
  iconAction: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  input: { minHeight: 48, paddingHorizontal: 12, borderRadius: 12 },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 68,
    paddingVertical: 8,
  },
});

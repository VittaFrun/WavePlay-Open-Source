import { createPlaylistOrderWriter } from '../../utils/playlistOrderWriter';
import { AppAlert as Alert } from '../../services/appAlert';
import { PlaylistHeader } from '../../components/PlaylistHeader';
import { BottomSheet } from '../../components/BottomSheet';
import { MenuAction, MenuGroup } from '../../components/MenuAction';
import { FloatingMiniPlayer } from '../../components/FloatingMiniPlayer';
import { TrackRemovalActions } from '../../components/TrackRemovalActions';
import { TrackInfoAction } from '../../components/TrackInfoAction';
import { MotionModal } from '../../components/MotionModal';
import { useCallback, useDeferredValue, useMemo, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AddPlaylistSongs } from "../../components/AddPlaylistSongs";
import { HeaderButton } from "../../components/HeaderButton";
import { toggleVisibleSelection } from "../../utils/playlistSelection";
import { LibraryTrackRow } from "../../components/LibraryTrackRow";
import { PlaylistActions } from "../../components/PlaylistHeading";
import { SleepTimerSheet } from "../../components/SleepTimerSheet";
import { PlaylistCover } from "../../components/PlaylistCover";
import { MenuBackdrop } from "../../components/GlassSurface";
import { Artwork } from "../../components/Artwork";
import { Screen } from "../../components/Screen";
import { useLibrary, useWaveActions, useHasPlayback } from "../../providers/WaveProvider";
import { fonts, useTheme } from "../../theme";
import type { PlaylistStats, Track } from "../../types";
import { PlaylistInteractiveList } from '../../components/PlaylistInteractiveList';
import { playlistRowHeight, playlistItemLayout } from '../../utils/playlistLayout';
import { reconcileRows } from '../../utils/asyncWork';

type PlaylistListRow =
  | { kind: 'actions' }
  | { kind: 'controls' }
  | { kind: 'track'; track: Track };

const PLAYLIST_CONTENT_INSET=14;
const EMPTY_TRACK_LIST:Track[]=[];
const PLAYLIST_TOPBAR_HEIGHT=54;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] || "" : value || "";

export default function PlaylistDetailScreen() {const {colors}=useTheme();const s=useS();
  const insets=useSafeAreaInsets();
  const {fontScale}=useWindowDimensions();
  const rowHeight=playlistRowHeight(fontScale);
  const [listHeaderHeight,setListHeaderHeight]=useState<number|null>(null);
  const onListHeaderLayout=useCallback((event:LayoutChangeEvent)=>{const height=event.nativeEvent.layout.height;setListHeaderHeight(current=>current===height?current:height);},[]);
  const getItemLayout=useCallback((_:unknown,index:number)=>playlistItemLayout(rowHeight,listHeaderHeight||0,index),[rowHeight,listHeaderHeight]);
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const playlistId = Number(first(id));
  const library=useLibrary();const libraryTracks=library.tracks;
  const wave = {...library,...useWaveActions()};
  const hasPlayback=useHasPlayback();
  const reorderTracks=wave.reorderPlaylistTracks;
  const playlistTracks = wave.playlistTracks;
  const getPlaylistStats = wave.playlistStats;
  const playlist = wave.playlists.find((item) => item.id === playlistId);
  const [items, setItems] = useState<Track[]>([]);
  const playbackItems=useRef<Track[]>([]);
  useLayoutEffect(()=>{playbackItems.current=items;},[items]);
  const playTrackAction=wave.play;
  const playPlaylistTrack=useCallback((track:Track)=>{void playTrackAction(track,playbackItems.current,`playlist:${playlistId}`);},[playTrackAction,playlistId]);
  const [menuTrack,setMenuTrack]=useState<Track|null>(null);
  const [addingBusy,setAddingBusy]=useState(false);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode,setMode]=useState<'browse'|'select'|'reorder'>('browse');
  const managing=mode==='select';
  const reordering=mode==='reorder';
  const [reorderDraft,setReorderDraft]=useState<Track[]>([]);
  const [chosen,setChosen]=useState<Set<string>>(new Set());
  const [bulkBusy,setBulkBusy]=useState(false);
  const [copyPicker,setCopyPicker]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [renameOpen,setRenameOpen]=useState(false);
  const [renameDraft,setRenameDraft]=useState('');
  const [renameBusy,setRenameBusy]=useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery=useDeferredValue(query);
  const [songQuery,setSongQuery]=useState('');
  const deferredSongQuery=useDeferredValue(songQuery);
  const refreshVersion=useRef(0);
  const savingOrderRef=useRef(false);
  const [savingOrder,setSavingOrder]=useState(false);
  const [stats,setStats]=useState<PlaylistStats|null>(null);
  const [timerOpen,setTimerOpen]=useState(false);

  const quickOrderWriter=useMemo(()=>createPlaylistOrderWriter<Track[]>(
    ordered=>reorderTracks(playlistId,ordered.map(track=>track.id)),
    (committed,error)=>{
      if(__DEV__)console.info('[PlaylistOrderFailure]',error instanceof Error?error.message:String(error));
      setItems(committed);Alert.alert('No se guardó el último cambio','Se conservó el último orden guardado. Inténtalo de nuevo.');
    },
  ),[playlistId,reorderTracks]);
  useEffect(()=>{quickOrderWriter.activate();return()=>quickOrderWriter.dispose();},[quickOrderWriter]);

  const refresh = useCallback(async () => {
    if (!Number.isFinite(playlistId)) return;
    const version=++refreshVersion.current;
    const tracks=await playlistTracks(playlistId);
    if(version!==refreshVersion.current)return;
    if(!savingOrderRef.current&&!quickOrderWriter.isBusy())setItems(previous=>reconcileRows(previous,tracks));
    void getPlaylistStats(`playlist:${playlistId}`).then(summary=>{
      if(version===refreshVersion.current)setStats(summary);
    }).catch(()=>{});
  }, [playlistId, playlistTracks, getPlaylistStats,quickOrderWriter]);

  useFocusEffect(
    useCallback(() => {
      let active=true;
      void refresh().catch(()=>{
        if(active)Alert.alert('No se pudo cargar la playlist','Inténtalo de nuevo.');
      });
      return () => {active=false;refreshVersion.current+=1;};
    }, [refresh]),
  );

  const candidates = useMemo(() => {
    if (!adding) return [];
    const present = new Set(items.map((item) => item.id));
    const search = deferredQuery.trim().toLocaleLowerCase();
    return libraryTracks.filter(
      (track) =>
        !present.has(track.id) &&
        (!search || `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(search)),
    );
  }, [adding, items, deferredQuery, libraryTracks]);
  const visibleItems=useMemo(()=>{const term=deferredSongQuery.trim().toLocaleLowerCase();return term?items.filter(item=>`${item.title} ${item.artist} ${item.album}`.toLocaleLowerCase().includes(term)):items;},[items,deferredSongQuery]);
  const chosenTracks=useMemo(()=>items.filter(item=>chosen.has(item.id)),[items,chosen]);

  const playAll = () => {
    if (items[0]) void wave.play(items[0], items,`playlist:${playlistId}`);
  };
  const shuffleAll = () => {
    const first=items[Math.floor(Math.random()*items.length)];
    if(first)void wave.play(first,items,`playlist:${playlistId}`,true);
  };
  const toggleSelection = (trackId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };
  const saveSelected = async () => {
    const ids = [...selected];
    if (!ids.length || addingBusy) return;
    setAddingBusy(true);
    try{
      await wave.addTracksToPlaylist(playlistId, ids);
      setAdding(false);
      setSelected(new Set());
      setQuery("");
      requestIdleCallback(()=>{void refresh().catch(()=>{});},{timeout:500});
    }
    catch{Alert.alert('No se pudieron añadir las canciones','La selección se conserva. Inténtalo de nuevo.');}
    finally{setAddingBusy(false);}
  };

  const remove = async (trackId: string) => {
    await wave.removeTrackFromPlaylist(playlistId, trackId);
    await refresh();
  };
  const confirmRemove = (track: Track) => Alert.alert(
    'Quitar de esta playlist',
    `¿Quitar “${track.title}” de “${playlist?.name || 'esta playlist'}”? El archivo seguirá en tu dispositivo.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => {
        setMenuTrack(null);
        void remove(track.id).catch(() => Alert.alert('No se pudo quitar la canción', 'Inténtalo de nuevo.'));
      } },
    ],
  );
  const stopManaging=()=>{setMode('browse');setChosen(new Set());};
  const beginManaging=useCallback((trackId?:string)=>{setMenuTrack(null);setSettingsOpen(false);setMode('select');setChosen(trackId?new Set([trackId]):new Set());},[]);
  const toggleChosen=useCallback((trackId:string)=>setChosen(current=>{const next=new Set(current);if(next.has(trackId))next.delete(trackId);else next.add(trackId);return next;}),[]);
  const selectOrManage=useCallback((id:string)=>managing?toggleChosen(id):beginManaging(id),[managing,toggleChosen,beginManaging]);
  const removeChosen=()=>{
    if(!chosenTracks.length||bulkBusy)return;
    Alert.alert('Quitar canciones',`¿Quitar ${chosenTracks.length} ${chosenTracks.length===1?'canción':'canciones'} de “${playlist?.name}”? Los archivos seguirán en tu dispositivo.`,[
      {text:'Cancelar',style:'cancel'},
      {text:'Quitar',style:'destructive',onPress:()=>void(async()=>{
        setBulkBusy(true);
        try{await wave.removeTracksFromPlaylist(playlistId,chosenTracks.map(track=>track.id));await refresh();stopManaging();}
        catch{Alert.alert('No se pudieron quitar las canciones','La selección se conserva. Inténtalo de nuevo.');}
        finally{setBulkBusy(false);}
      })()},
    ]);
  };
  const renameCurrent=async()=>{
    if(renameBusy||!renameDraft.trim())return;
    setRenameBusy(true);
    try{await wave.renamePlaylist(playlistId,renameDraft);setRenameOpen(false);}
    catch(error){Alert.alert('No se pudo renombrar',error instanceof Error?error.message:'Inténtalo de nuevo.');}
    finally{setRenameBusy(false);}
  };
  const duplicateCurrent=async()=>{
    setSettingsOpen(false);
    try{
      const name=`${playlist?.name || 'Playlist'} (copia)`;
      if(items.length)await wave.saveMixAsPlaylist(name,items.map(track=>track.id));
      else await wave.createNewPlaylist(name);
    }catch{Alert.alert('No se pudo duplicar la playlist','Inténtalo de nuevo.');}
  };
  const beginReordering=()=>{setSettingsOpen(false);setSongQuery('');setReorderDraft(items);setMode('reorder');};
  const cancelReordering=()=>{if(savingOrderRef.current)return;setReorderDraft([]);setMode('browse');};
  const saveDraggedOrder=async()=>{
    const ordered=reorderDraft;
    if(savingOrderRef.current)return;
    if(ordered.every((track,index)=>track.id===items[index]?.id)){cancelReordering();return;}
    const previous=items;
    savingOrderRef.current=true;
    setSavingOrder(true);
    setItems(ordered);
    try{
      await reorderTracks(playlistId,ordered.map(track=>track.id));
      setReorderDraft([]);
      setMode('browse');
    }catch{
      setItems(previous);
      Alert.alert('No se guardó el orden','La playlist volvió a su orden anterior. Inténtalo de nuevo.');
    }finally{
      savingOrderRef.current=false;
      setSavingOrder(false);
    }
  };
  const persistQuickOrder=useCallback((rows:PlaylistListRow[])=>{
    if(songQuery.trim())return;
    const ordered=rows.filter((row):row is Extract<PlaylistListRow,{kind:'track'}>=>row.kind==='track').map(row=>row.track);
    const previous=playbackItems.current;
    if(ordered.length!==previous.length||ordered.every((track,index)=>track.id===previous[index]?.id))return;
    refreshVersion.current+=1;
    setItems(ordered);quickOrderWriter.submit(ordered,previous);
  },[songQuery,quickOrderWriter]);
  const listRows=useMemo<PlaylistListRow[]>(()=>[
    ...visibleItems.map(track=>({kind:'track' as const,track})),
  ],[visibleItems]);
  const renderPlaylistRow=useCallback((item:PlaylistListRow,drag?:()=>void,isActive?:boolean)=>{
    if(item.kind!=='track')return null;
    return <LibraryTrackRow track={item.track} list={EMPTY_TRACK_LIST} onPlayTrack={playPlaylistTrack} dragging={isActive} rowHeight={rowHeight} sourceKey={`playlist:${playlistId}`} disabled={bulkBusy||isActive||savingOrder} onDrag={managing?undefined:drag} selecting={managing} selected={chosen.has(item.track.id)} onSelectTrack={toggleChosen} onLongPressTrack={selectOrManage} onMoreTrack={setMenuTrack}/>;
  },[playPlaylistTrack,rowHeight,playlistId,bulkBusy,savingOrder,managing,chosen,toggleChosen,selectOrManage]);
  const confirmDelete = () =>
    Alert.alert(
      "Eliminar playlist",
      `Se eliminará “${playlist?.name || "esta playlist"}”. Tus archivos de música no se borrarán.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => {
            void wave.deletePlaylist(playlistId).then(() => router.back());
          },
        },
      ],
    );

  if (!playlist) {
    return (
      <Screen>
        <View style={s.notFound}>
          <MaterialCommunityIcons name="playlist-remove" size={45} color={colors.purple} />
          <Text style={s.notFoundTitle}>Esta playlist ya no existe</Text>
          <Pressable style={s.backButton} onPress={() => router.back()}>
            <Text style={s.backButtonText}>Volver a playlists</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={{paddingHorizontal:PLAYLIST_CONTENT_INSET}}>
      <View style={s.topbar}>
        <HeaderButton icon={reordering?'close':'arrow-left'} label={reordering?'Cancelar reordenamiento':'Volver'} onPress={reordering?cancelReordering:()=>router.back()} disabled={savingOrder}/>
        <Text style={s.topTitle} numberOfLines={1}>{reordering?'REORDENAR':playlist.name}</Text>
        {reordering?<Pressable accessibilityRole="button" accessibilityLabel="Guardar nuevo orden" disabled={savingOrder} onPress={()=>void saveDraggedOrder()} style={s.saveOrderButton}><Text style={s.orderSave}>{savingOrder?'Guardando…':'Guardar'}</Text></Pressable>:<HeaderButton icon="cog-outline" label="Ajustes de playlist" onPress={()=>setSettingsOpen(true)}/>}
      </View>
      {reordering?<>
        <View style={s.reorderIntro}><Text style={s.sectionTitle}>Reordena las canciones</Text><Text style={s.orderHint}>Mantén presionado el control y arrastra. Los cambios se guardan al tocar Guardar.</Text></View>
        <PlaylistInteractiveList selecting={false} itemHeight={rowHeight} data={reorderDraft} keyExtractor={item=>item.id} disabled={savingOrder} contentContainerStyle={{paddingBottom:170}} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} onReorder={setReorderDraft} renderRow={(item,drag,isActive)=><View style={isActive?s.dragging:undefined}><LibraryTrackRow track={item} list={EMPTY_TRACK_LIST} rowHeight={rowHeight} dragging={isActive} sourceKey={`playlist:${playlistId}`} disabled={isActive||savingOrder} onPress={()=>{}} onDrag={drag}/></View>}/>

      </>:<>
        <View style={{flex:1}}>

        <PlaylistHeader
          hero={<View style={{minHeight:80,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:8,paddingVertical:8}}><PlaylistCover playlist={playlist} size={56}/><View style={{flex:1}}><Text numberOfLines={2} style={{color:colors.text,fontFamily:fonts.extraBold,fontSize:18,lineHeight:22,letterSpacing:-.4}}>{playlist.name}</Text><Text style={{color:colors.muted,fontFamily:fonts.regular,fontSize:11,marginTop:4}}>{items.length} {items.length===1?'canción':'canciones'} · {Math.round(items.reduce((total,track)=>total+track.duration,0)/60)} min</Text><Pressable accessibilityRole="button" accessibilityLabel="Estadísticas de la playlist" onPress={()=>router.push({pathname:'/statistics',params:{playlistId:String(playlistId)}} as never)} style={{flexDirection:'row',gap:6,alignItems:'center',minHeight:30,marginTop:0}}><MaterialCommunityIcons name="chart-bar" size={17} color={colors.pink}/><Text style={{color:colors.muted,fontFamily:fonts.semiBold,fontSize:10}}>{stats?`${stats.playCount} reproducciones`:'Tu colección'}</Text><MaterialCommunityIcons name="chevron-right" size={15} color={colors.outline}/></Pressable></View></View>}
          controls={<PlaylistActions title={playlist.name} count={items.length} onPlay={playAll} onShuffle={shuffleAll} onAdd={()=>setAdding(true)} onTimer={()=>setTimerOpen(true)}/>}/>
        <PlaylistInteractiveList<PlaylistListRow> itemHeight={rowHeight} headerHeight={listHeaderHeight??0} selecting={managing} disabled={savingOrder||Boolean(songQuery.trim())} onReorder={persistQuickOrder} getItemLayout={listHeaderHeight===null?undefined:getItemLayout} ListHeaderComponent={<View onLayout={onListHeaderLayout}><View style={s.searchRow}><MaterialCommunityIcons name="magnify" size={19} color={colors.outline}/><TextInput value={songQuery} onChangeText={setSongQuery} placeholder="Buscar en esta playlist" placeholderTextColor={colors.outline} style={s.searchInput}/>{songQuery?<Pressable accessibilityLabel="Borrar búsqueda" onPress={()=>setSongQuery('')}><MaterialCommunityIcons name="close-circle" size={19} color={colors.outline}/></Pressable>:null}</View><View style={s.sectionHead}><Text style={s.sectionTitle}>{managing?`${chosen.size} seleccionadas`:songQuery?`${visibleItems.length} resultados`:'Canciones'}</Text>{managing?<Pressable accessibilityLabel={visibleItems.every(track=>chosen.has(track.id))?'Deseleccionar visibles':'Seleccionar visibles'} onPress={()=>setChosen(current=>toggleVisibleSelection(current,visibleItems.map(track=>track.id)))} style={s.selectButton}><Text style={s.selectText}>{visibleItems.length&&visibleItems.every(track=>chosen.has(track.id))?'Deseleccionar':'Seleccionar visibles'}</Text></Pressable>:<Pressable accessibilityLabel="Seleccionar canciones" onPress={()=>beginManaging()} style={s.selectButton}><MaterialCommunityIcons name="checkbox-multiple-marked-outline" size={18} color={colors.pink}/><Text style={s.selectText}>Seleccionar</Text></Pressable>}</View>{!visibleItems.length?<View style={s.empty}><MaterialCommunityIcons name="music-note-plus" size={40} color={colors.purple}/><Text style={s.emptyTitle}>{songQuery?'Sin coincidencias':'Aún no hay canciones aquí'}</Text><Text style={s.emptyText}>{songQuery?'Prueba con otro título o artista.':'Agrega archivos de tu teléfono para comenzar.'}</Text>{!songQuery?<Pressable style={s.emptyAdd} onPress={()=>setAdding(true)}><Text style={s.emptyAddText}>Añadir canciones</Text></Pressable>:null}</View>:null}</View>} data={listRows} keyExtractor={row=>row.kind==='track'?row.track.id:row.kind} contentContainerStyle={{paddingBottom:managing?260:170}} initialNumToRender={12} maxToRenderPerBatch={4} updateCellsBatchingPeriod={16} windowSize={5} renderRow={renderPlaylistRow}/>

        </View>
      </>}

      <FloatingMiniPlayer/>
      {managing?<View style={[s.bulkBar,{bottom:Math.max(insets.bottom,8)+(hasPlayback?76:0)}]}><View style={s.bulkTop}><Text style={s.bulkCount}>{chosen.size} {chosen.size===1?'canción':'canciones'}</Text><Pressable accessibilityLabel="Cancelar selección" onPress={stopManaging}><MaterialCommunityIcons name="close" size={22} color={colors.muted}/></Pressable></View><View style={s.bulkActions}><Pressable disabled={!chosen.size||bulkBusy} onPress={()=>{if(chosenTracks[0])void wave.play(chosenTracks[0],chosenTracks,`playlist:${playlistId}`);stopManaging();}} style={[s.bulkAction,!chosen.size&&s.bulkDisabled]}><MaterialCommunityIcons name="play" size={20} color={colors.text}/><Text style={s.bulkActionText}>Reproducir</Text></Pressable><Pressable disabled={!chosen.size||bulkBusy} onPress={()=>setCopyPicker(true)} style={[s.bulkAction,!chosen.size&&s.bulkDisabled]}><MaterialCommunityIcons name="playlist-plus" size={20} color={colors.text}/><Text style={s.bulkActionText}>Copiar</Text></Pressable><Pressable disabled={!chosen.size||bulkBusy} onPress={removeChosen} style={[s.bulkAction,!chosen.size&&s.bulkDisabled]}><MaterialCommunityIcons name="playlist-remove" size={20} color={colors.danger}/><Text style={[s.bulkActionText,{color:colors.danger}]}>Quitar</Text></Pressable></View></View>:null}
      <SleepTimerSheet visible={timerOpen} onClose={()=>setTimerOpen(false)}/>
      <BottomSheet visible={Boolean(menuTrack)} onClose={()=>setMenuTrack(null)} title={menuTrack?.title||'Canción'} subtitle={menuTrack?.artist} leading={<Artwork uri={menuTrack?.artwork} size={52}/>}>
        <MenuGroup title="Escucha"><MenuAction icon="skip-next-outline" label="Reproducir después" onPress={()=>{if(menuTrack)wave.addNext(menuTrack);setMenuTrack(null)}}/><MenuAction icon={menuTrack?.favorite?'heart':'heart-outline'} label={menuTrack?.favorite?'Quitar de favoritas':'Añadir a favoritas'} onPress={()=>{if(menuTrack)void wave.toggleTrackFavorite(menuTrack);setMenuTrack(null)}}/><TrackInfoAction track={menuTrack} onClose={()=>setMenuTrack(null)}/></MenuGroup>
        <MenuGroup title="Organiza tu música"><MenuAction icon="playlist-remove" label="Quitar de esta playlist" detail="La canción sigue en tu biblioteca" onPress={()=>{if(menuTrack)confirmRemove(menuTrack)}}/><TrackRemovalActions track={menuTrack} onClose={()=>setMenuTrack(null)} onRemoved={()=>void refresh()}/></MenuGroup>
      </BottomSheet>
      <BottomSheet visible={settingsOpen} onClose={()=>setSettingsOpen(false)} title={playlist.name} subtitle={`${items.length} canciones · Opciones de playlist`} leading={<PlaylistCover playlist={playlist} size={52}/>}>
        <MenuGroup title="Tu playlist">
          <MenuAction icon="pencil-outline" label="Cambiar nombre" onPress={()=>{setSettingsOpen(false);setRenameDraft(playlist.name);setTimeout(()=>setRenameOpen(true),200);}}/>
          <MenuAction icon="playlist-plus" label="Añadir canciones" onPress={()=>{setSettingsOpen(false);setTimeout(()=>setAdding(true),200);}}/>
          <MenuAction icon="sort-variant" label="Reordenar canciones" detail="Organiza y revisa antes de guardar" onPress={beginReordering}/>
          <MenuAction icon="checkbox-multiple-marked-outline" label="Seleccionar canciones" detail="Copia o quita varias a la vez" onPress={()=>beginManaging()}/>
          <MenuAction icon="content-copy" label="Crear una copia" onPress={()=>void duplicateCurrent()}/>
        </MenuGroup>
        <MenuGroup title="Tu escucha">
          <MenuAction icon="chart-bar" label="Estadísticas" onPress={()=>{setSettingsOpen(false);setTimeout(()=>router.push({pathname:'/statistics',params:{playlistId:String(playlistId)}} as never),200);}}/>
          <MenuAction icon="timer-outline" label="Temporizador" onPress={()=>{setSettingsOpen(false);setTimeout(()=>setTimerOpen(true),200);}}/>
        </MenuGroup>
        <MenuGroup><MenuAction icon="trash-can-outline" label="Eliminar playlist" detail="Los archivos de música se conservan" destructive onPress={()=>{setSettingsOpen(false);setTimeout(confirmDelete,250);}}/></MenuGroup>
      </BottomSheet>
      <MotionModal transparent visible={renameOpen} animationType="fade" onRequestClose={()=>{if(!renameBusy)setRenameOpen(false);}}><View style={s.centerOverlay}><MenuBackdrop/><View style={s.renameCard}><Text style={s.statsTitle}>Renombrar playlist</Text><TextInput autoFocus value={renameDraft} maxLength={80} onChangeText={setRenameDraft} placeholder="Nombre de la playlist" placeholderTextColor={colors.outline} style={s.renameInput} editable={!renameBusy}/><View style={s.renameButtons}><Pressable disabled={renameBusy} onPress={()=>setRenameOpen(false)} style={s.renameButton}><Text style={s.menuText}>Cancelar</Text></Pressable><Pressable disabled={!renameDraft.trim()||renameBusy} onPress={()=>void renameCurrent()} style={[s.renameButton,s.renameSave,(!renameDraft.trim()||renameBusy)&&s.bulkDisabled]}><Text style={[s.menuText,{color:colors.background}]}>{renameBusy?'Guardando…':'Guardar'}</Text></Pressable></View></View></View></MotionModal>
      <MotionModal transparent visible={copyPicker} animationType="fade" onRequestClose={()=>{if(!bulkBusy)setCopyPicker(false);}}><Pressable style={s.statsOverlay} onPress={()=>setCopyPicker(false)}><MenuBackdrop/><Pressable style={s.statsSheet} onPress={event=>event.stopPropagation()}><View style={s.handle}/><Text style={s.statsTitle}>Copiar {chosen.size} {chosen.size===1?'canción':'canciones'} a…</Text><ScrollView style={{maxHeight:380}}>{wave.playlists.filter(target=>target.id!==playlistId).map(target=><Pressable key={target.id} disabled={bulkBusy} style={s.menuAction} onPress={()=>void(async()=>{setBulkBusy(true);try{await wave.addTracksToPlaylist(target.id,chosenTracks.map(track=>track.id));setCopyPicker(false);stopManaging();}catch{Alert.alert('No se pudieron copiar las canciones','La selección se conserva. Inténtalo de nuevo.');}finally{setBulkBusy(false);}})()}><MaterialCommunityIcons name="music-box-multiple-outline" size={22} color={colors.pink}/><Text numberOfLines={1} style={s.menuText}>{target.name}</Text></Pressable>)}</ScrollView>{wave.playlists.length<=1?<Text style={s.statsSummary}>Crea otra playlist desde Biblioteca para copiar canciones.</Text>:null}</Pressable></Pressable></MotionModal>
      <AddPlaylistSongs visible={adding} title={playlist.name} tracks={candidates} query={query} onQuery={setQuery} selected={selected} onToggle={toggleSelection} onToggleVisible={()=>setSelected(current=>toggleVisibleSelection(current,candidates.map(track=>track.id)))} onClose={()=>setAdding(false)} onSave={()=>void saveSelected()} busy={addingBusy}/>

    </Screen>
  );
}

const useS = () => { const {colors} = useTheme(); return useMemo(() => StyleSheet.create({
  stickyActions:{paddingTop:10,paddingBottom:12,overflow:'hidden',backgroundColor:colors.background,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.accentBorder},stickyContent:{zIndex:1},
  reorderIntro:{paddingTop:12,paddingBottom:14,paddingRight:22},
  saveOrderButton:{minWidth:68,height:44,alignItems:'center',justifyContent:'center'},
  menuAction:{minHeight:54,flexDirection:'row',alignItems:'center',gap:14},
  menuText:{flex:1,fontFamily:fonts.semiBold,fontSize:14,color:colors.text},
  selectButton:{minHeight:40,flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:9,borderRadius:12},selectText:{fontFamily:fonts.semiBold,fontSize:11,color:colors.pink},
  bulkBar:{position:'absolute',left:14,right:14,zIndex:24,backgroundColor:colors.surfaceLowest,borderRadius:18,borderWidth:1,borderColor:colors.accentBorder,paddingHorizontal:12,paddingTop:8,paddingBottom:10},
  bulkTop:{minHeight:30,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},bulkCount:{fontFamily:fonts.bold,fontSize:13,color:colors.text},
  bulkActions:{flexDirection:'row',gap:5},bulkAction:{flex:1,minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,borderRadius:12,backgroundColor:colors.surfaceHigh},bulkActionText:{fontFamily:fonts.semiBold,fontSize:11,color:colors.text},bulkDisabled:{opacity:.4},
  centerOverlay:{flex:1,justifyContent:'center',paddingHorizontal:20},renameCard:{backgroundColor:colors.surfaceLowest,borderRadius:20,padding:20,borderWidth:1,borderColor:colors.border},renameInput:{height:48,backgroundColor:colors.surfaceHigh,borderRadius:12,color:colors.text,fontFamily:fonts.regular,fontSize:14,paddingHorizontal:12,marginTop:8},renameButtons:{flexDirection:'row',gap:8,marginTop:18},renameButton:{flex:1,height:44,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:colors.surfaceHigh},renameSave:{backgroundColor:colors.pink},
  topbar: { height: PLAYLIST_TOPBAR_HEIGHT, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight:22 },
  topButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.07)", borderWidth: 1, borderColor: colors.border },
  topTitle: { color: colors.outline, fontFamily: fonts.extraBold, fontSize: 9, letterSpacing:0 },
  hero: { alignItems: "center", borderRadius: 0, paddingHorizontal: 0, paddingVertical: 24, marginTop: 17, overflow: "hidden", borderWidth: 0 },
  heroArt: { width: 104, height: 104, borderRadius: 31, backgroundColor: "rgba(14,14,21,.46)", alignItems: "center", justifyContent: "center" },
  name: { color: colors.text, fontFamily: fonts.extraBold, fontSize: 25, lineHeight: 32, letterSpacing:0, textAlign: "center", marginTop: 16 },
  info: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 5 },
  heroActions: { width: "100%", flexDirection: "row", gap: 9, marginTop: 23 },
  playAll: { flex: 1, borderRadius: 17, overflow: "hidden" },
  playDisabled: { opacity: 0.42 },
  playGradient: { height: 51, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  playText: { color: "#3B1652", fontFamily: fonts.extraBold, fontSize: 12 },
  addSongs: { flex: 1, height: 51, borderRadius: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, backgroundColor: "rgba(14,14,21,.44)", borderWidth: 1, borderColor: "rgba(76,215,246,.22)" },
  addSongsText: { color: colors.cyan, fontFamily: fonts.extraBold, fontSize: 12 },
  stats:{overflow:'hidden',flexDirection:'row',alignItems:'center',marginTop:18,paddingVertical:16,borderRadius:8,backgroundColor:colors.surface2},stat:{flex:1,alignItems:'center'},statValue:{fontFamily:fonts.bold,fontSize:18,color:colors.text},statLabel:{fontFamily:fonts.regular,fontSize:10,color:colors.muted,marginTop:3},statDivider:{height:34,width:1,backgroundColor:colors.border},statsLink:{height:37,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:3},statsNote:{fontFamily:fonts.regular,fontSize:10,color:colors.purple},statsOverlay:{flex:1,backgroundColor:'transparent',justifyContent:'flex-end'},statsSheet:{maxHeight:'80%',backgroundColor:'#1F1F26',borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:20,paddingTop:10,paddingBottom:38},handle:{width:42,height:4,borderRadius:2,backgroundColor:colors.outline,alignSelf:'center',marginBottom:19},statsTitle:{fontFamily:fonts.bold,fontSize:19,color:colors.text,marginBottom:10},statsSummary:{fontFamily:fonts.regular,fontSize:12,color:colors.muted,marginTop:5},statsSubheading:{fontFamily:fonts.bold,fontSize:14,color:colors.text,marginTop:23,marginBottom:7},statsTrack:{height:59,flexDirection:'row',alignItems:'center',gap:11},statsRank:{width:18,fontFamily:fonts.bold,fontSize:12,color:colors.purple},statsFoot:{fontFamily:fonts.regular,fontSize:10,lineHeight:16,color:colors.outline,marginTop:20},
  searchRow:{height:48,marginTop:8,marginRight:22,borderRadius:13,backgroundColor:colors.surfaceHigh,borderWidth:1,borderColor:colors.border,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 11, paddingRight:22, minHeight:42 },
  sectionTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 20 },
  orderHint:{color:colors.muted,fontFamily:fonts.regular,fontSize:11},orderSave:{color:colors.purple,fontFamily:fonts.bold,fontSize:12},
  trackRow: { minHeight: 65, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", padding: 8, marginBottom: 8 },
  dragging:{backgroundColor:colors.surfaceHigh,borderColor:colors.purple},dragHandle:{width:43,height:48,alignItems:'center',justifyContent:'center'},smallMove:{width:32,height:48,alignItems:'center',justifyContent:'center'},removeButton:{width:44,height:48,alignItems:'center',justifyContent:'center'},
  trackMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  trackCopy: { flex: 1 },
  trackTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 12 },
  trackMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10, marginTop: 3 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 5 },
  empty: { padding: 33, alignItems: "center", borderRadius: 24, backgroundColor: "rgba(255,255,255,.025)", borderWidth: 1, borderColor: colors.border },
  emptyTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 16, marginTop: 13 },
  emptyText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, textAlign: "center", marginTop: 5 },
  emptyAdd: { marginTop: 16, backgroundColor: colors.surfaceHigh, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 10 },
  emptyAddText: { color: colors.purple, fontFamily: fonts.extraBold, fontSize: 11 },
  notFound: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  notFoundTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 17 },
  backButton: { backgroundColor: colors.surfaceHigh, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11 },
  backButtonText: { color: colors.purple, fontFamily: fonts.extraBold, fontSize: 11 },
  modal: { flex: 1, backgroundColor: "#13131A", paddingHorizontal: 20 },
  modalTopbar: { height: 69, flexDirection: "row", alignItems: "center", gap: 12 },
  modalCopy: { flex: 1 },
  modalTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 17 },
  modalSubtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10, marginTop: 2 },
  selectedCount: { minWidth: 26, height: 26, borderRadius: 13, textAlign: "center", textAlignVertical: "center", color: colors.cyan, fontFamily: fonts.extraBold, fontSize: 11, backgroundColor: "rgba(76,215,246,.10)" },
  search: { height: 51, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 15, borderRadius: 17, backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 13 },
  candidateList: { paddingTop: 15, paddingBottom: 98, gap: 8 },
  candidate: { minHeight: 66, borderRadius: 18, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, padding: 8, flexDirection: "row", alignItems: "center", gap: 11 },
  check: { width: 25, height: 25, borderRadius: 13, borderWidth: 1.5, borderColor: colors.outline, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.purple, borderColor: colors.purple },
  noCandidates: { alignItems: "center", paddingTop: 70, gap: 12 },
  noCandidatesText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: "center" },
  confirmAdd: { position: "absolute", left: 20, right: 20, bottom: 17, borderRadius: 18, overflow: "hidden" },
  confirmGradient: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  confirmText: { color: "#3B1652", fontFamily: fonts.extraBold, fontSize: 12 },
}), [colors]); };

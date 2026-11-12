import { canResolveYouTubeAudio, markAudioFallback, needsAudioFallback, youtubeAudioResolver } from '../services/youtubeAudio';
import { AppAlert as Alert } from '../services/appAlert';
import { getOrganization, subscribeOrganizedAssets } from '../services/fileOrganization';
import { roomYouTubeNative } from '../services/roomYouTubeNative';
import { createPlaybackResolution, nextPlayableIndex } from '../utils/mixedPlayback';
import { configureQuickDownload, publishDownloadStates } from '../services/quickDownload';
import { runDownloadJob, recoverDownloadJobs } from '../services/downloadJobs';
import { restorePlaybackSession } from '../utils/playbackSession';
import { trackVideo } from '../utils/onlineTrack';
import { resolvePlaybackSource } from '../services/playbackSource';
import { commandSoloYouTube, getSoloYouTube, getSoloYouTubeStatus, subscribeSoloYouTube, setSoloNavigation, startSoloYouTube, stopSoloYouTube } from '../services/soloYouTube';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPlaybackStore, type PlaybackSnapshot } from '../utils/playbackStore';
import { connectPlaybackProgress } from '../utils/unifiedPlayback';
import { AppState, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { useDownloadNotifications } from '../hooks/useDownloadNotifications';
import { notifyChange } from '../services/feedback';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import type { DownloadItem, Playlist, PlaylistStats, RepeatMode, Track, PlaybackSession, SharedPlaybackDelegate } from "../types";
import {
  addTracksToPlaylist, createPlaylist, createPlaylistWithTracks, deletePlaylist, editTrackInfo, initializeDatabase, listDownloads,
  invalidateDownloadedCopy, recoverOnlineDownloadLinks, listPlaylistTracks, listPlaylists, listTracks, loadPlaybackSession, loadQueue, recentTracks,
  playlistStats, recordListening, recentlyPlayedTracks, removeTrackFromPlaylist, removeTracksFromPlaylist, renamePlaylist, reorderPlaylistTracks, saveDownload, savePlaybackSession,
  toggleFavorite, hideDuplicates,
  removeDownload as deleteDownloadRow,
} from "../services/database";
import { hasAudioPermission, scanDeviceMusic } from "../services/library";
import { lockScreenArtwork } from "../utils/music";
import { createLockScreenController } from "../utils/lockScreen";
import { downloadPersistenceKey } from '../utils/downloadProgress';
import { canEditAudioTags, normalizeTagText } from '../utils/trackTags';
import { createActiveTrackStore } from '../utils/activeTrackStore';
import { createLatestRead, reconcileRows, createCoalescedWriter, createBufferedWriter } from '../utils/asyncWork';
import { performanceStart } from '../services/performance';
import { waitForSharedAudio, pauseForCleanup, seekWhenLoaded } from '../utils/sharedPlayback';

type WaveContextValue = {
  ready:boolean; tracks:Track[]; recent:Track[]; recentlyPlayed:Track[]; favorites:Track[]; mostPlayed:Track[]; playlists:Playlist[];
  scanning:boolean; scanCount:number; queue:Track[]; current?:Track; currentIndex:number;
  repeatMode:RepeatMode; shuffleEnabled:boolean; sleepEndsAt:number|null;
  hideDuplicateCopies(keepId:string,removeIds:string[]):Promise<number>;
  updateTrackInfo(trackId:string,info:{title:string;artist:string;album:string;genre:string}):Promise<void>;
  saveMixAsPlaylist(name:string,trackIds:string[]):Promise<number>;
  refresh():Promise<void>; scan(full?:boolean):Promise<void>; play(track:Track, queue?:Track[], sourceKey?:string, shuffle?:boolean, options?:{forceOnline?:boolean;position?:number}):Promise<void>; toggle():void; next():void; previous():void; seek(seconds:number):void;
  synchronizePlayback(track:Track,positionSeconds:number,playing:boolean):Promise<void>;
  setSharedPlaybackDelegate(delegate:SharedPlaybackDelegate|null):void;
  pauseSharedPlayback():void;
  toggleTrackFavorite(track:Track):Promise<void>; addNext(track:Track):void; addToQueue(track:Track):void; removeFromQueue(index:number):void; moveInQueue(from:number,to:number):void;
  clearQueue():void; toggleShuffle():void; cycleRepeat():void; setSleepTimer(minutes:number|null):void;
  createNewPlaylist(name:string):Promise<void>; playlistTracks(playlistId:number):Promise<Track[]>; addTracksToPlaylist(playlistId:number, trackIds:string[]):Promise<void>;
  removeTrackFromPlaylist(playlistId:number, trackId:string):Promise<void>; removeTracksFromPlaylist(playlistId:number,trackIds:string[]):Promise<void>; renamePlaylist(playlistId:number,name:string):Promise<void>; reorderPlaylistTracks(playlistId:number, trackIds:string[]):Promise<void>; deletePlaylist(playlistId:number):Promise<void>; playlistStats(sourceKey:string):Promise<PlaylistStats>;
};

type LibraryValue = Pick<WaveContextValue, 'ready'|'tracks'|'recent'|'recentlyPlayed'|'favorites'|'mostPlayed'|'playlists'> & {secondaryReady:boolean};
type QueueValue = Pick<WaveContextValue, 'queue'|'current'|'currentIndex'|'repeatMode'|'shuffleEnabled'|'sleepEndsAt'>;
type ScanValue = Pick<WaveContextValue, 'scanning'|'scanCount'>;
type ActionsValue = Omit<WaveContextValue, keyof LibraryValue|keyof QueueValue|keyof ScanValue>;
const LibraryContext = createContext<LibraryValue|null>(null);
const QueueContext = createContext<QueueValue|null>(null);
const HasPlaybackContext=createContext(false);
const ActionsContext = createContext<ActionsValue|null>(null);
const ScanContext = createContext<ScanValue|null>(null);
const ActiveTrackContext = createContext<ReturnType<typeof createActiveTrackStore>|null>(null);
const PlaybackStoreContext = createContext<ReturnType<typeof createPlaybackStore>|null>(null);

type DownloadsContextValue = { downloads:DownloadItem[]; setDownloads:React.Dispatch<React.SetStateAction<DownloadItem[]>>; dismissDownload(id:string):Promise<void> };
type PlaybackContextValue = { playing:boolean; position:number; duration:number; buffering:boolean; error:string|null };
type TransportContextValue = Pick<PlaybackContextValue,'playing'|'buffering'|'error'>;
type VolumeContextValue = { volume:number; setVolume(value:number):void };
const WaveContext = createContext<WaveContextValue | null>(null);
const DownloadsContext = createContext<DownloadsContextValue | null>(null);
const PlaybackContext = createContext<PlaybackContextValue>({playing:false,position:0,duration:0,buffering:false,error:null});
const TransportContext = createContext<TransportContextValue>({playing:false,buffering:false,error:null});
const VolumeContext = createContext<VolumeContextValue | null>(null);
const sameQueue = (a:Track[], b:Track[]) => a.length === b.length && a.every((track,index)=>track.id===b[index]?.id);
const fisherYates = <T,>(input:T[]) => {
  const out=[...input];
  for(let i=out.length-1;i>0;i-=1){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
};

export function WaveProvider({children}:PropsWithChildren) {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const sharedDelegateRef=useRef<SharedPlaybackDelegate|null>(null);
  const sharedGenerationRef=useRef(0);
  const localSessionRef=useRef<{queue:Track[];original:Track[];index:number;position:number;source:string|null;ids:string[];shuffle:boolean}|null>(null);
  const lockScreen=useMemo(()=>createLockScreenController(player),[player]);
  const status = useAudioPlayerStatus(player);
  const soloStatus=useSyncExternalStore(subscribeSoloYouTube,getSoloYouTubeStatus,getSoloYouTubeStatus);
  const failuresRef=useRef(new Set<string>());
  const sourceResolver=useMemo(()=>createPlaybackResolution(resolvePlaybackSource),[]);
  const failedPlaybackRef=useRef<()=>void>(()=>{});
  const audioRetry=useRef({id:'',count:0});
  const audioSource=useRef<{id:string;position:number;loaded:boolean}|null>(null);
  const [audioResolving,setAudioResolving]=useState(false);
  const [audioError,setAudioError]=useState<string|null>(null);
  const [volume,setVolumeState]=useState(1);
  // Expo exposes a native volume setter, not a mutation of React state.
  // eslint-disable-next-line react-hooks/immutability
  const setVolume=useCallback((value:number)=>{const next=Math.max(0,Math.min(1,value));player.volume=next;setVolumeState(next);},[player]);
  const statusRef = useRef(status); useEffect(()=>{statusRef.current=status;},[status]);
  const [ready,setReady]=useState(false);
  const [secondaryReady,setSecondaryReady]=useState(false);
  const activeTracks=useMemo(()=>createActiveTrackStore(),[]);
  const playbackStore=useMemo(()=>createPlaybackStore(),[]);
  const [tracks,setTracks]=useState<Track[]>([]);
  const tracksRef=useRef(tracks);useEffect(()=>{tracksRef.current=tracks;},[tracks]);
  const [recent,setRecent]=useState<Track[]>([]);
  const [recentlyPlayed,setRecentlyPlayed]=useState<Track[]>([]);
  const [playlists,setPlaylists]=useState<Playlist[]>([]);
  const [queue,setQueue]=useState<Track[]>([]);
  const queueRef=useRef<Track[]>([]); useEffect(()=>{queueRef.current=queue;},[queue]);
  const [originalQueue,setOriginalQueue]=useState<Track[]>([]);
  const originalQueueRef=useRef<Track[]>([]); useEffect(()=>{originalQueueRef.current=originalQueue;},[originalQueue]);
  const [currentIndex,setCurrentIndex]=useState(-1);
  const currentIndexRef=useRef(-1); useEffect(()=>{currentIndexRef.current=currentIndex;},[currentIndex]);
  const [repeatMode,setRepeatMode]=useState<RepeatMode>('off');
  const repeatModeRef=useRef<RepeatMode>('off'); useEffect(()=>{repeatModeRef.current=repeatMode;},[repeatMode]);
  const [shuffleEnabled,setShuffleEnabled]=useState(false);
  const shuffleRef=useRef(false); useEffect(()=>{shuffleRef.current=shuffleEnabled;},[shuffleEnabled]);
  const [downloads,setDownloads]=useState<DownloadItem[]>([]);
  const savedDownloadKeys=useRef(new Map<string,string>());
  const downloadWrites=useRef(new Map<string,Promise<void>>());
  useDownloadNotifications(downloads);
  const scanLock=useRef(false);
  const [scanning,setScanning]=useState(false); const [scanCount,setScanCount]=useState(0);
  const [sleepEndsAt,setSleepEndsAt]=useState<number|null>(null);
  const current=queue[currentIndex];
  useEffect(()=>{activeTracks.setActive(current?.id);},[activeTracks,current?.id]);
  const sourceKeyRef=useRef<string|null>(null);
  const sourceTrackIdsRef=useRef<string[]>([]);
  const listeningRef=useRef<{id:string;trackId:string;sourceKey:string|null;startedAt:number;threshold:number;pending:number;lastPosition:number;lastWall:number}|null>(null);
  const persistedQueueKeyRef=useRef<string|null>(null);
  const persistedSessionKeyRef=useRef<string|null>(null);
  const sharedYouTubeRef=useRef(false);
  const sessionHydratedRef=useRef(false),loadGenerationRef=useRef(0);
  const pendingPositionRef=useRef<{id:string;position:number;generation:number}|null>(null);


  const activateLockScreen=useCallback((item:Track)=>{
    if(sharedYouTubeRef.current||getSoloYouTube().video)return;
    try {
      lockScreen.update({
        title:item.title, artist:item.artist, albumTitle:item.album,
        artworkUrl:lockScreenArtwork(item.artwork),
      });
      if (item.artwork && NativeModules.WavePlayDownloader?.getArtworkFileUri) {
        void NativeModules.WavePlayDownloader.getArtworkFileUri(item.artwork).then((uri: string | null) => {
          if (uri && !sharedYouTubeRef.current && queueRef.current[currentIndexRef.current]?.id === item.id) lockScreen.update({ title: item.title, artist: item.artist, albumTitle: item.album, artworkUrl: uri });
        }).catch(() => {});
      }
    } catch { /* Metadata must never block playback. */ }
  },[lockScreen]);

  const libraryRead=useMemo(()=>createLatestRead(async()=>{
    const end=performanceStart('library-query');
    try{return await Promise.all([listTracks(),recentTracks(),recentlyPlayedTracks(),listPlaylists()]);}finally{end();}
  },([all,rec,played,lists])=>{
    setTracks(old=>reconcileRows(old,all));setRecent(old=>reconcileRows(old,rec));
    setRecentlyPlayed(old=>reconcileRows(old,played));setPlaylists(old=>reconcileRows(old,lists));

  }),[]);
  useEffect(()=>{
    const byId=new Map(tracks.map(t=>[t.id,t])),byLocal=new Map(tracks.filter(t=>t.localTrackId).map(t=>[t.localTrackId,t]));
    const reconcile=(rows:Track[])=>rows.map(t=>{const fresh=byId.get(t.id)||byLocal.get(t.id);return fresh?{...fresh,onlinePlayback:t.onlinePlayback,audioOnly:t.audioOnly}:t;});
    const updated=reconcile(queueRef.current);queueRef.current=updated;setQueue(old=>reconcileRows(old,updated));
    const original=reconcile(originalQueueRef.current);originalQueueRef.current=original;setOriginalQueue(old=>reconcileRows(old,original));
  },[tracks]);
  const refresh=useCallback(()=>{libraryRead.invalidate();return libraryRead.run();},[libraryRead]);

  const playlistsRead=useMemo(()=>createLatestRead(listPlaylists,rows=>setPlaylists(old=>reconcileRows(old,rows))),[]);
  const refreshPlaylists=useCallback(()=>{libraryRead.invalidate();playlistsRead.invalidate();return playlistsRead.run();},[libraryRead,playlistsRead]);

  const listeningWriter=useMemo(()=>createBufferedWriter(async({event,delta}:{event:NonNullable<typeof listeningRef.current>;delta:number})=>{
      const counted=await recordListening(event.id,event.trackId,event.sourceKey,event.startedAt,delta,event.threshold);
      if(counted){
        libraryRead.invalidate();
        setTracks(all=>all.map(t=>t.id===event.trackId?{...t,playCount:(t.playCount||0)+1,lastPlayedAt:Date.now()}:t));
        // The transaction already committed; a secondary read must not retry its delta.
        try{const [rec,played]=await Promise.all([recentTracks(),recentlyPlayedTracks()]);setRecent(old=>reconcileRows(old,rec));setRecentlyPlayed(old=>reconcileRows(old,played));}catch{}
      }
  }),[libraryRead]);
  const flushListening=useCallback(()=>{
    const event=listeningRef.current;
    if(!event||event.pending<=0){void listeningWriter.flush().catch(()=>{});return;}
    const delta=event.pending;event.pending=0;
    void listeningWriter.submit({event:{...event},delta}).catch(()=>{});
  },[listeningWriter]);

  const startListening=useCallback((item:Track)=>{
    flushListening();
    if(sharedDelegateRef.current){listeningRef.current=null;return;}
    const startedAt=Date.now();
    listeningRef.current={id:`${startedAt}-${Math.random().toString(36).slice(2)}`,trackId:item.id,sourceKey:sourceKeyRef.current&&sourceTrackIdsRef.current.includes(item.id)?sourceKeyRef.current:null,startedAt,threshold:Math.min(30,Math.max(10,item.duration*.35)),pending:0,lastPosition:0,lastWall:startedAt};
  },[flushListening]);

  const loadAt=useCallback((index:number,auto=true,position=0,forceOnline=false,preserveListening=false)=>{
    const item=queueRef.current[index];if(!item)return;
    youtubeAudioResolver.invalidate();setAudioError(null);
    if(audioRetry.current.id!==item.id)audioRetry.current={id:item.id,count:0};
    const useAudio=Boolean(item.youtubeId&&needsAudioFallback(item.youtubeId)&&!forceOnline);
    setAudioResolving(true);audioSource.current=useAudio?{id:item.id,position,loaded:false}:null;
    if(useAudio){const rows=queueRef.current.map((t,i)=>i===index?{...t,audioOnly:true,onlinePlayback:false}:t);queueRef.current=rows;setQueue(rows);}
    if(getSoloYouTube().video)roomYouTubeNative?.stop();
    // Keep the previous source paused until its replacement is ready. Expo Audio's
    // native replace method requires a source and rejects null on Android.
    stopSoloYouTube();sharedYouTubeRef.current=false;player.pause();
    currentIndexRef.current=index;setCurrentIndex(index);
    const generation=++loadGenerationRef.current;
    pendingPositionRef.current={id:item.id,position,generation};
    void sourceResolver.run(item,forceOnline).then(async resolved=>{
      if(!resolved||generation!==loadGenerationRef.current)return;
      const audioOnly=Boolean(resolved.youtubeId&&!resolved.downloaded&&needsAudioFallback(resolved.youtubeId)&&!forceOnline);
      const stream=audioOnly?await youtubeAudioResolver.run(resolved.youtubeId!):null;
      if(generation!==loadGenerationRef.current||audioOnly&&!stream)return;
      resolved={...resolved,audioOnly,onlinePlayback:audioOnly?false:resolved.onlinePlayback};

      if(resolved!==item){const items=queueRef.current.map((t,i)=>i===index?resolved:t);queueRef.current=items;setQueue(items);}
      if(resolved.youtubeId&&!audioOnly&&(!resolved.downloaded||resolved.onlinePlayback)){
        setAudioResolving(false);
        lockScreen.clear();startListening(resolved);
        startSoloYouTube(trackVideo(resolved));commandSoloYouTube(auto,position);pendingPositionRef.current=null;return;
      }
      player.replace(stream?{uri:stream.uri,headers:stream.headers}:resolved.uri);if(!preserveListening||listeningRef.current?.trackId!==resolved.id)startListening(resolved);
      activateLockScreen(resolved);
      const loaded=position>0?seekWhenLoaded(player,position,()=>generation===loadGenerationRef.current):waitForSharedAudio(player);
      void loaded.then(()=>{if(generation===loadGenerationRef.current){pendingPositionRef.current=null;setAudioResolving(false);if(audioSource.current?.id===resolved.id)audioSource.current.loaded=true;}}).catch(()=>{if(generation===loadGenerationRef.current){setAudioResolving(false);failedPlaybackRef.current();}});
      if(auto)player.play();
    }).catch(()=>{if(generation===loadGenerationRef.current){setAudioResolving(false);if(useAudio){setAudioError('No se pudo reproducir esta canción.');notifyChange('No se pudo obtener el audio.');}pendingPositionRef.current=null;failedPlaybackRef.current();}});
  },[player,startListening,lockScreen,sourceResolver,activateLockScreen]);

  const next=useCallback(()=>{
    if(sharedDelegateRef.current){sharedDelegateRef.current.next();return;}
    const items=queueRef.current; if(!items.length)return;
    const index=currentIndexRef.current;
    if(repeatModeRef.current==='one'){loadAt(index);return;}
    if(index<items.length-1)loadAt(index+1);
    else if(repeatModeRef.current==='all')loadAt(0);
    else {player.pause();if(getSoloYouTube().video)commandSoloYouTube(false);}
  },[loadAt,player]);

  useEffect(()=>{if(status.didJustFinish&&!getSoloYouTube().video){if(sharedDelegateRef.current?.finished)sharedDelegateRef.current.finished();else next();}},[status.didJustFinish,next]);
  useEffect(()=>{if(current)activateLockScreen(current);},[activateLockScreen,current]);
  useEffect(()=>{
    const event=listeningRef.current;if(!event||getSoloYouTube().video)return;
    const now=Date.now();const position=status.currentTime||0;
    const advance=position-event.lastPosition;const wall=(now-event.lastWall)/1000;
    if(status.playing&&advance>0&&advance<=Math.max(2.5,wall+2)&&wall>0)event.pending+=Math.min(advance,wall+0.2);
    event.lastPosition=position;event.lastWall=now;
    if(event.pending>=10||!status.playing)flushListening();
  },[status.playing,status.currentTime,flushListening]);
  useEffect(()=>()=>flushListening(),[flushListening]);

  const writeSession=useCallback(async(session:PlaybackSession)=>{
    const queueKey=JSON.stringify(session.queueIds);
    const key=JSON.stringify({...session,positionSeconds:Math.floor(session.positionSeconds),updatedAt:0});
    if(key!==persistedSessionKeyRef.current){
      await savePlaybackSession(session,queueKey!==persistedQueueKeyRef.current);
      persistedQueueKeyRef.current=queueKey;persistedSessionKeyRef.current=key;
    }
  },[]);
  const sessionWriterRef=useRef<ReturnType<typeof createCoalescedWriter<PlaybackSession>>|null>(null);
  const persistSession=useCallback((positionOverride?:number)=>{
    if(!sessionHydratedRef.current||sharedDelegateRef.current)return;
    const items=queueRef.current;
    const session={
      trackId:items[currentIndexRef.current]?.id??null, queueIds:items.map(t=>t.id),
      originalQueueIds:originalQueueRef.current.map(t=>t.id), currentIndex:currentIndexRef.current,
      positionSeconds:(positionOverride??(pendingPositionRef.current?.id===items[currentIndexRef.current]?.id?pendingPositionRef.current?.position:(getSoloYouTube().video?getSoloYouTube().position:player.currentTime)))||0, repeatMode:repeatModeRef.current,
      shuffleEnabled:shuffleRef.current,sourceKey:sourceKeyRef.current,sourceTrackIds:sourceTrackIdsRef.current,updatedAt:Date.now(),
    };
    const writer=sessionWriterRef.current??=createCoalescedWriter(writeSession);
    void writer.submit(session).catch(()=>{/* A later snapshot retries failed writes. */});
  },[writeSession,player]);
  useEffect(()=>{
    if(!ready)return;
    let timer:ReturnType<typeof setInterval>|undefined;
    const stop=()=>{if(timer)clearInterval(timer);timer=undefined;};
    const update=(state:string)=>{stop();persistSession();flushListening();if(state==='active'||status.playing)timer=setInterval(persistSession,5000);};
    update(AppState.currentState);
    const listener=AppState.addEventListener('change',update);
    return()=>{stop();listener.remove();persistSession();flushListening();};
  },[persistSession,flushListening,ready,status.playing,player]);
  useEffect(()=>{if(ready)persistSession();},[queue,currentIndex,repeatMode,shuffleEnabled,ready,persistSession]);
  useEffect(()=>{
    for(const item of downloads){
      const key=downloadPersistenceKey(item);
      if(savedDownloadKeys.current.get(item.id)===key)continue;
      savedDownloadKeys.current.set(item.id,key);
      const previous=downloadWrites.current.get(item.id)??Promise.resolve();
      const write=previous.catch(()=>{}).then(()=>saveDownload({...item,updatedAt:Date.now()}))
        .catch(()=>{if(savedDownloadKeys.current.get(item.id)===key)savedDownloadKeys.current.delete(item.id);});
      downloadWrites.current.set(item.id,write);
      void write.then(()=>{if(downloadWrites.current.get(item.id)===write)downloadWrites.current.delete(item.id);});
    }
  },[downloads]);

  const scan=useCallback(async(full=false)=>{
    if(scanLock.current||getOrganization().running||getOrganization().preparing){notifyChange('Espera a que termine la organización de archivos.');return;}
    scanLock.current=true;setScanning(true);setScanCount(0);
    try{const count=await scanDeviceMusic(setScanCount,{full});libraryRead.invalidate();await refresh();notifyChange(`Biblioteca actualizada · ${count} canciones`);}
    catch(error){Alert.alert('No se pudo actualizar la biblioteca',error instanceof Error?error.message:'Revisa el permiso de música e inténtalo otra vez.');}
    finally{scanLock.current=false;setScanning(false);}
  },[refresh,libraryRead]);

  useEffect(()=>{let alive=true;(async()=>{
    const restoreGeneration=loadGenerationRef.current;
    const startupEnd=performanceStart('startup-library');
    await initializeDatabase();
    await recoverOnlineDownloadLinks();
    const catalog=await listTracks('',false,true);const all=catalog.filter(t=>t.inLibrary!==false);
    if(!alive)return;
    setTracks(all);
    await setAudioModeAsync({playsInSilentMode:true,shouldPlayInBackground:true,interruptionMode:'doNotMix'});
    if(!alive)return;
    setReady(true);startupEnd();
    const [legacyIds,session]=await Promise.all([loadQueue(),loadPlaybackSession()]);
    if(!alive)return;
    const restored=restorePlaybackSession(session,legacyIds,catalog);
    if(restored.queue.length&&!queueRef.current.length&&loadGenerationRef.current===restoreGeneration&&!sharedDelegateRef.current&&!sharedYouTubeRef.current){
      queueRef.current=restored.queue;originalQueueRef.current=restored.original;
      setQueue(restored.queue);setOriginalQueue(restored.original);
      repeatModeRef.current=restored.repeatMode;shuffleRef.current=restored.shuffleEnabled;
      setRepeatMode(restored.repeatMode);setShuffleEnabled(restored.shuffleEnabled);
      sourceKeyRef.current=restored.sourceKey;sourceTrackIdsRef.current=restored.sourceTrackIds;
      loadAt(restored.index,false,restored.position);
    }
    if(sharedDelegateRef.current&&restored.queue.length&&!localSessionRef.current?.queue.length){
      localSessionRef.current={queue:restored.queue,original:restored.original,index:restored.index,position:restored.position,source:restored.sourceKey,ids:restored.sourceTrackIds,shuffle:restored.shuffleEnabled};
    }
    sessionHydratedRef.current=true;
    persistSession();
    try{
      const [rec,played,lists,savedDownloads]=await Promise.all([recentTracks(),recentlyPlayedTracks(),listPlaylists(),listDownloads()]);
      if(!alive)return;
      for(const item of savedDownloads)savedDownloadKeys.current.set(item.id,downloadPersistenceKey(item));
      setRecent(rec);setRecentlyPlayed(played);setPlaylists(lists);setDownloads(savedDownloads);
      void recoverDownloadJobs(savedDownloads,setDownloads,scan).catch(()=>{});
    }catch{if(alive)notifyChange('Algunos datos no se pudieron cargar. Vuelve a actualizar la biblioteca.');}
    if(!alive)return;
    setSecondaryReady(true);
    if(!all.length&&await hasAudioPermission())void scan();
  })().catch(()=>{if(alive)Alert.alert('No se pudo abrir la biblioteca','Cierra WavePlay y vuelve a abrirla. Tus canciones y playlists se conservan.');});return()=>{alive=false;sharedGenerationRef.current+=1;};},[player,scan,startListening,loadAt,persistSession]);

  useEffect(()=>{
    if(!sleepEndsAt)return;
    const remaining=sleepEndsAt-Date.now();
    const expire=()=>{if(Date.now()<sleepEndsAt)return;player.pause();if(getSoloYouTube().video)commandSoloYouTube(false);setSleepEndsAt(null);};
    const timer=setTimeout(expire,Math.max(0,remaining));
    const listener=AppState.addEventListener('change',state=>{if(state==='active')expire();});
    return()=>{clearTimeout(timer);listener.remove();};
  },[player,sleepEndsAt]);

  const play=useCallback(async(track:Track,newQueue?:Track[],sourceKey?:string,shuffle=false,options?:{forceOnline?:boolean;position?:number})=>{
    if(sharedDelegateRef.current){await sharedDelegateRef.current.play(track);return;}
    failuresRef.current.clear();
    const base=newQueue?.length?newQueue:tracksRef.current.some(t=>t.id===track.id)?tracksRef.current:[track];
    const ordered=shuffle?[track,...fisherYates(base.filter(item=>item.id!==track.id))]:base;
    const target=options?.forceOnline?ordered.map(t=>t.id===track.id?{...t,onlinePlayback:true}:t):ordered;
    sourceKeyRef.current=sourceKey||null;sourceTrackIdsRef.current=sourceKey?target.map(t=>t.id):[];
    const index=Math.max(0,target.findIndex(t=>t.id===track.id));
    queueRef.current=target;setQueue(old=>sameQueue(old,target)?old:target);
    originalQueueRef.current=base;setOriginalQueue(base);shuffleRef.current=shuffle;setShuffleEnabled(shuffle);loadAt(index,true,options?.position||0,options?.forceOnline);
  },[loadAt]);
  const synchronizePlayback=useCallback(async(track:Track,positionSeconds:number,playing:boolean)=>{
    sharedYouTubeRef.current=false;
    const generation=sharedGenerationRef.current,started=Date.now();
    const active=queueRef.current[currentIndexRef.current];
    if(active?.id!==track.id||active.uri!==track.uri){
      player.pause();
      queueRef.current=[track];originalQueueRef.current=[track];currentIndexRef.current=0;
      setQueue([track]);setOriginalQueue([track]);setCurrentIndex(0);setShuffleEnabled(false);
      sourceKeyRef.current='friends';sourceTrackIdsRef.current=[track.id];
      player.replace(track.uri);startListening(track);
    }
    await waitForSharedAudio(player);
    if(generation!==sharedGenerationRef.current)return;
    const duration=player.duration||track.duration||Number.MAX_SAFE_INTEGER;
    await player.seekTo(Math.max(0,Math.min(positionSeconds+(playing?(Date.now()-started)/1000:0),duration)));
    if(generation!==sharedGenerationRef.current)return;
    activateLockScreen(track);
    if(playing)player.play();else player.pause();
  },[player,startListening,activateLockScreen]);
  const pauseSharedPlayback=useCallback(()=>{youtubeAudioResolver.invalidate();setAudioResolving(false);persistSession();sourceResolver.invalidate();loadGenerationRef.current++;pendingPositionRef.current=null;sharedYouTubeRef.current=Boolean(sharedDelegateRef.current);pauseForCleanup(player);lockScreen.clear();},[player,lockScreen,persistSession,sourceResolver]);
  const setSharedPlaybackDelegate=useCallback((delegate:SharedPlaybackDelegate|null)=>{
    sourceResolver.invalidate();
    if(delegate){
      persistSession();loadGenerationRef.current+=1;
      if(!sharedDelegateRef.current)localSessionRef.current={queue:queueRef.current,original:originalQueueRef.current,index:currentIndexRef.current,position:pendingPositionRef.current?.position??(getSoloYouTube().video?getSoloYouTube().position:player.currentTime),source:sourceKeyRef.current,ids:sourceTrackIdsRef.current,shuffle:shuffleRef.current};
      pendingPositionRef.current=null;sharedDelegateRef.current=delegate;player.pause();flushListening();listeningRef.current=null;
    }else if(sharedDelegateRef.current){
      sharedYouTubeRef.current=false;
      sharedDelegateRef.current=null;sharedGenerationRef.current+=1;
      const saved=localSessionRef.current;localSessionRef.current=null;
      if(!pauseForCleanup(player))return;
      if(saved){
        queueRef.current=saved.queue;originalQueueRef.current=saved.original;currentIndexRef.current=saved.index;
        setQueue(saved.queue);setOriginalQueue(saved.original);setCurrentIndex(saved.index);
        setShuffleEnabled(saved.shuffle);shuffleRef.current=saved.shuffle;
        sourceKeyRef.current=saved.source;sourceTrackIdsRef.current=saved.ids;
        if(saved.queue[saved.index])loadAt(saved.index,false,saved.position);else lockScreen.clear();
      }
    }
  },[flushListening,loadAt,lockScreen,player,persistSession,sourceResolver]);
  const previous=useCallback(()=>{if(getSoloYouTube().video&&getSoloYouTube().position>4){commandSoloYouTube(getSoloYouTube().playing,0);return;}if(sharedDelegateRef.current){sharedDelegateRef.current.previous();return;}if(!getSoloYouTube().video&&statusRef.current.currentTime>4){void player.seekTo(0).catch(()=>{});return;}const i=currentIndexRef.current;if(i>0)loadAt(i-1);else if(repeatModeRef.current==='all'&&queueRef.current.length)loadAt(queueRef.current.length-1);},[loadAt,player]);
  const toggle=useCallback(()=>{
    if(sharedDelegateRef.current){sharedDelegateRef.current.toggle();return;}
    if(getSoloYouTube().video){if(getSoloYouTube().interrupted)roomYouTubeNative?.resumeLocal();else commandSoloYouTube(!getSoloYouTube().playing);persistSession();return;}
    const selected=queueRef.current[currentIndexRef.current];
    if(audioResolving)return;
    if(selected?.youtubeId&&!selected.downloaded&&!selected.audioOnly){loadAt(currentIndexRef.current,true,player.currentTime);return;}
    try{
      stopSoloYouTube();sharedYouTubeRef.current=false;
      if(player.playing){player.pause();persistSession();}
      else if(player.currentStatus.error)loadAt(currentIndexRef.current,true,pendingPositionRef.current?.position??player.currentTime);
      else if(player.duration>0&&player.currentTime>=player.duration-.25){void player.seekTo(0).then(()=>{persistSession(0);player.play();}).catch(()=>{});}
      else player.play();
    }catch{Alert.alert('Archivo no disponible','Selecciona otra canción o actualiza la biblioteca.');}
  },[player,persistSession,loadAt,audioResolving]);
  const seek=useCallback((seconds:number)=>{
    if(sharedDelegateRef.current){sharedDelegateRef.current.seek(seconds);return;}
    if(audioResolving)return;
    if(getSoloYouTube().video){commandSoloYouTube(getSoloYouTube().playing,seconds);persistSession(seconds);return;}
    const nativeDuration=statusRef.current.duration||0;
    const trackDuration=queueRef.current[currentIndexRef.current]?.duration||0;
    const duration=nativeDuration||trackDuration;
    const target=Math.max(0,Math.min(Number.isFinite(seconds)?seconds:0,duration||Number.MAX_SAFE_INTEGER));
    const item=queueRef.current[currentIndexRef.current];if(!item)return;
    const generation=++loadGenerationRef.current;
    pendingPositionRef.current={id:item.id,position:target,generation};persistSession(target);
    void seekWhenLoaded(player,target,()=>generation===loadGenerationRef.current).then(applied=>{
      if(applied){pendingPositionRef.current=null;persistSession(target);}
    }).catch(()=>{if(generation===loadGenerationRef.current){pendingPositionRef.current=null;notifyChange('No se pudo cambiar la posición. Inténtalo de nuevo.');}});
  },[player,persistSession,audioResolving]);
  useEffect(()=>{
    const failed=()=>{
      if(sharedDelegateRef.current)return;
      const items=queueRef.current,current=items[currentIndexRef.current];if(!current)return;
      if(current.audioOnly&&audioRetry.current.count<1){
        audioRetry.current={id:current.id,count:audioRetry.current.count+1};youtubeAudioResolver.evict(current.youtubeId!);
        loadAt(currentIndexRef.current,true,audioSource.current?.loaded?statusRef.current.currentTime||0:audioSource.current?.position||0,false,true);return;
      }
      if(current.youtubeId&&current.downloaded&&!current.onlinePlayback){
        const generation=loadGenerationRef.current;
        void invalidateDownloadedCopy(current.id).then(()=>{
          if(generation!==loadGenerationRef.current)return;
          const items=queueRef.current.map(t=>t.id===current.id?{...t,downloaded:false,localTrackId:undefined}:t);queueRef.current=items;setQueue(items);
          loadAt(currentIndexRef.current,true,0,true);void refresh();
        }).catch(()=>notifyChange('No se pudo recuperar la versión online.'));return;
      }
      failuresRef.current.add(current.id);
      setTracks(rows=>rows.map(t=>t.id===current.id?{...t,unavailable:true}:t));
      const index=nextPlayableIndex(items,currentIndexRef.current,failuresRef.current,repeatModeRef.current==='all');
      if(index>=0)loadAt(index);else {player.pause();if(getSoloYouTube().video)commandSoloYouTube(false);notifyChange('No hay más canciones disponibles en la cola.');}
    };
    failedPlaybackRef.current=failed;
    return setSoloNavigation({next,previous,failed,fallback:()=>{
      const solo=getSoloYouTube(),item=queueRef.current[currentIndexRef.current];
      if(!canResolveYouTubeAudio||sharedDelegateRef.current||!solo.video||item?.youtubeId!==solo.video.id)return false;
      markAudioFallback(solo.video.id);loadAt(currentIndexRef.current,solo.playing,solo.position,false,true);return true;
    }});
  },[next,previous,loadAt,player,refresh]);
  useEffect(()=>{const sub=player.addListener('playbackStatusUpdate',event=>{const audio=audioSource.current;if(event.error&&audio?.loaded&&queueRef.current[currentIndexRef.current]?.id===audio.id&&!sharedDelegateRef.current){audio.loaded=false;audio.position=statusRef.current.currentTime||0;failedPlaybackRef.current();}});return()=>sub.remove();},[player]);
  useEffect(()=>()=>youtubeAudioResolver.invalidate(),[]);
  useEffect(()=>{
    if(!soloStatus.video)return;
    const tick=()=>{
      const event=listeningRef.current,solo=getSoloYouTube();if(!event||!solo.video||event.trackId!==`youtube:${solo.video.id}`)return;
      const now=Date.now(),wall=(now-event.lastWall)/1000,advance=solo.position-event.lastPosition;
      if(solo.playing&&!solo.interrupted&&advance>0&&advance<=Math.max(2.5,wall+2)&&wall>0)event.pending+=Math.min(advance,wall+.2);
      event.lastWall=now;event.lastPosition=solo.position;if(event.pending>=10||!solo.playing)flushListening();
    };
    const unsubscribe=subscribeSoloYouTube(tick);
    const capture=()=>{persistSession();flushListening();};
    const sub=AppState.addEventListener('change',capture);const timer=setInterval(capture,5000);
    return()=>{unsubscribe();sub.remove();clearInterval(timer);capture();};
  },[soloStatus.video,persistSession,flushListening]);
  const toggleTrackFavorite=useCallback(async(track:Track)=>{if(track.id.startsWith('room:')){notifyChange('Las canciones temporales no se guardan en favoritos.');return;}await toggleFavorite(track.id);libraryRead.invalidate();const change=(all:Track[])=>all.map(t=>t.id===track.id?{...t,favorite:!t.favorite}:t);setTracks(change);setRecent(change);setRecentlyPlayed(change);setQueue(change);setOriginalQueue(change);notifyChange(track.favorite?'Quitada de favoritas':'Añadida a favoritas');},[libraryRead]);
  useEffect(()=>{
    if(Platform.OS!=='android'||!NativeModules.WavePlayMediaControls)return;
    const emitter=new NativeEventEmitter(NativeModules.WavePlayMediaControls);
    const subscription=emitter.addListener('WavePlayMediaAction',(action:string)=>{
      if(action==='previous')previous();
      else if(action==='toggle')toggle();
      else if(action==='next')next();
      else if(action==='favorite'){
        const active=queueRef.current[currentIndexRef.current];
        if(active)void toggleTrackFavorite(active);
      }
    });
    return()=>subscription.remove();
  },[next,previous,toggle,toggleTrackFavorite]);
  useEffect(()=>{
    if(Platform.OS==='android'&&current)NativeModules.WavePlayMediaControls?.setFavorite(Boolean(current.favorite));
  },[current]);
  const updateTrackInfo=useCallback(async(trackId:string,info:{title:string;artist:string;album:string;genre:string})=>{
    const track=tracksRef.current.find(item=>item.id===trackId);
    if(!track)throw new Error('La canción ya no está disponible.');
    if(!canEditAudioTags(track.filename))throw new Error('Se pueden editar las etiquetas de archivos MP3 y M4A.');
    const writer=NativeModules.WavePlayDownloader?.editAudioTags;
    if(!writer)throw new Error('Esta versión necesita una actualización para editar etiquetas de audio.');
    const normalized={title:normalizeTagText(info.title),artist:normalizeTagText(info.artist),album:normalizeTagText(info.album),genre:normalizeTagText(info.genre)};
    if(!normalized.title)throw new Error('Escribe un título para la canción.');
    await writer(track.uri,track.id,track.filename,normalized.title,normalized.artist,normalized.album,normalized.genre);
    const updated=await editTrackInfo(trackId,normalized);
    libraryRead.invalidate();
    const change=(all:Track[])=>all.map(track=>track.id===trackId?{...track,...updated}:track);
    setTracks(change);setRecent(change);setRecentlyPlayed(change);setQueue(change);setOriginalQueue(change);
    if(queueRef.current[currentIndexRef.current]?.id===trackId){
      const active={...queueRef.current[currentIndexRef.current],...updated};
      activateLockScreen(active);
    }
    notifyChange('Información actualizada');
  },[activateLockScreen,libraryRead]);
  const addNext=useCallback((track:Track)=>{
    if(sharedDelegateRef.current){void sharedDelegateRef.current.play(track).catch(()=>{});return;}
    const out=[...queueRef.current];out.splice(Math.max(0,currentIndexRef.current+1),0,track);
    queueRef.current=out;setQueue(out);
    const original=[...originalQueueRef.current,track];originalQueueRef.current=original;setOriginalQueue(original);
  },[]);
  const addToQueue=useCallback((track:Track)=>{
    if(sharedDelegateRef.current){void sharedDelegateRef.current.play(track).catch(()=>{});return;}
    const out=[...queueRef.current,track];queueRef.current=out;setQueue(out);
    const original=[...originalQueueRef.current,track];originalQueueRef.current=original;setOriginalQueue(original);
    if(currentIndexRef.current<0)loadAt(0,false);
  },[loadAt]);
  const removeFromQueue=useCallback((index:number)=>{
    if(sharedDelegateRef.current){notifyChange('Gestiona la cola desde la sala.');return;}
    const items=queueRef.current;if(index<0||index>=items.length)return;
    const activeIndex=currentIndexRef.current,out=items.filter((_,i)=>i!==index);
    queueRef.current=out;setQueue(out);
    const remaining=new Set(out.map(track=>track.id));const original=originalQueueRef.current.filter(track=>remaining.has(track.id));
    originalQueueRef.current=original;setOriginalQueue(original);
    if(!out.length){stopSoloYouTube();player.pause();lockScreen.clear();loadGenerationRef.current+=1;pendingPositionRef.current=null;currentIndexRef.current=-1;setCurrentIndex(-1);persistSession(0);return;}
    if(index===activeIndex)loadAt(Math.min(index,out.length-1),player.playing);
    else{const nextIndex=activeIndex>index?activeIndex-1:activeIndex;currentIndexRef.current=nextIndex;setCurrentIndex(nextIndex);}
  },[loadAt,player,lockScreen,persistSession]);
  const moveInQueue=useCallback((from:number,to:number)=>{
    if(sharedDelegateRef.current){notifyChange('Gestiona la cola desde la sala.');return;}
    const items=queueRef.current;if(from===to||from<0||from>=items.length||to<0||to>=items.length)return;
    const active=currentIndexRef.current,out=[...items];const [item]=out.splice(from,1);out.splice(to,0,item);
    const index=active===from?to:from<active&&to>=active?active-1:from>active&&to<=active?active+1:active;
    queueRef.current=out;currentIndexRef.current=index;setQueue(out);setCurrentIndex(index);
    if(!shuffleRef.current){originalQueueRef.current=out;setOriginalQueue(out);}
  },[]);
  const clearQueue=useCallback(()=>{youtubeAudioResolver.invalidate();setAudioResolving(false);stopSoloYouTube();if(sharedDelegateRef.current){notifyChange('Gestiona la cola desde la sala.');return;}player.pause();lockScreen.clear();loadGenerationRef.current+=1;pendingPositionRef.current=null;queueRef.current=[];originalQueueRef.current=[];currentIndexRef.current=-1;setQueue([]);setOriginalQueue([]);setCurrentIndex(-1);persistSession(0);},[lockScreen,player,persistSession]);
  const toggleShuffle=useCallback(()=>{
    if(sharedDelegateRef.current){notifyChange('El anfitrión ordena la cola compartida.');return;}
    const items=queueRef.current;if(items.length<2)return;
    const active=items[currentIndexRef.current];
    if(shuffleRef.current){const base=originalQueueRef.current.length?originalQueueRef.current:items;queueRef.current=base;currentIndexRef.current=Math.max(0,base.findIndex(t=>t.id===active?.id));shuffleRef.current=false;setQueue(base);setCurrentIndex(currentIndexRef.current);setShuffleEnabled(false);return;}
    originalQueueRef.current=items;setOriginalQueue(items);const others=items.filter(t=>t.id!==active?.id);const shuffled=[active,...fisherYates(others)].filter(Boolean) as Track[];queueRef.current=shuffled;currentIndexRef.current=0;shuffleRef.current=true;setQueue(shuffled);setCurrentIndex(0);setShuffleEnabled(true);
  },[]);
  const cycleRepeat=useCallback(()=>{if(sharedDelegateRef.current)return;setRepeatMode(mode=>mode==='off'?'all':mode==='all'?'one':'off');},[]);
  const setSleepTimer=useCallback((minutes:number|null)=>setSleepEndsAt(minutes!==null&&Number.isFinite(minutes)&&minutes>0?Date.now()+Math.min(720,minutes)*60_000:null),[]);
  const createNewPlaylist=useCallback(async(name:string)=>{if(!name.trim())return;await createPlaylist(name);await refreshPlaylists();notifyChange('Playlist creada');},[refreshPlaylists]);
  const saveMixAsPlaylist=useCallback(async(name:string,trackIds:string[])=>{
    if(!name.trim()||!trackIds.length)throw new Error('La mezcla está vacía.');
    const id=await createPlaylistWithTracks(name,trackIds);
    await refreshPlaylists();
    notifyChange('Mezcla guardada en tus playlists');
    return id;
  },[refreshPlaylists]);
  const getPlaylistTracks=useCallback((playlistId:number)=>listPlaylistTracks(playlistId),[]);
  const addPlaylistTracks=useCallback(async(playlistId:number,trackIds:string[])=>{await addTracksToPlaylist(playlistId,trackIds);await refreshPlaylists();notifyChange('Playlist actualizada');},[refreshPlaylists]);
  const removePlaylistTrack=useCallback(async(playlistId:number,trackId:string)=>{await removeTrackFromPlaylist(playlistId,trackId);await refreshPlaylists();},[refreshPlaylists]);
  const removePlaylistTracks=useCallback(async(playlistId:number,trackIds:string[])=>{await removeTracksFromPlaylist(playlistId,trackIds);await refreshPlaylists();notifyChange(`${trackIds.length} canciones quitadas de la playlist`);},[refreshPlaylists]);
  const renameExistingPlaylist=useCallback(async(playlistId:number,name:string)=>{await renamePlaylist(playlistId,name);await refreshPlaylists();notifyChange('Playlist renombrada');},[refreshPlaylists]);
  const reorderPlaylist=useCallback(async(playlistId:number,trackIds:string[])=>{
    await reorderPlaylistTracks(playlistId,trackIds);
    // A secondary cover/count refresh must not report an already committed
    // order as failed and make the screen roll it back.
    try{await refreshPlaylists();}catch{notifyChange('Orden guardado. La portada se actualizará al volver.');}
  },[refreshPlaylists]);
  const deleteExistingPlaylist=useCallback(async(playlistId:number)=>{await deletePlaylist(playlistId);await refreshPlaylists();},[refreshPlaylists]);
  const favorites=useMemo(()=>tracks.filter(t=>t.favorite),[tracks]);
  const mostPlayed=useMemo(()=>[...tracks].filter(t=>(t.playCount||0)>0).sort((a,b)=>(b.playCount||0)-(a.playCount||0)).slice(0,30),[tracks]);
  const hideDuplicateCopies=useCallback(async(keepId:string,removeIds:string[])=>{
    if(scanLock.current)throw new Error('Espera a que termine el escaneo.');
    const activeId=queueRef.current[currentIndexRef.current]?.id;
    if(activeId&&removeIds.includes(activeId))throw new Error('Conserva la canción que está sonando.');
    scanLock.current=true;
    try{
      const removed=new Set(await hideDuplicates(keepId,removeIds));
      const nowPlaying=queueRef.current[currentIndexRef.current]?.id;
      const filtered=queueRef.current.filter(track=>!removed.has(track.id)||track.id===nowPlaying);
      const original=originalQueueRef.current.filter(track=>!removed.has(track.id)||track.id===nowPlaying);
      const index=nowPlaying?filtered.findIndex(track=>track.id===nowPlaying):-1;
      queueRef.current=filtered;originalQueueRef.current=original;currentIndexRef.current=index;
      setQueue(filtered);setOriginalQueue(original);setCurrentIndex(index);
      await refresh();return removed.size;
    }finally{scanLock.current=false;}
  },[refresh]);
  const value=useMemo(()=>({ready,tracks,recent,recentlyPlayed,favorites,mostPlayed,playlists,scanning,scanCount,queue,current,currentIndex,repeatMode,shuffleEnabled,sleepEndsAt,refresh,scan,play,toggle,next,previous,seek,synchronizePlayback,setSharedPlaybackDelegate,pauseSharedPlayback,toggleTrackFavorite,updateTrackInfo,saveMixAsPlaylist,addNext,addToQueue,removeFromQueue,moveInQueue,clearQueue,toggleShuffle,cycleRepeat,setSleepTimer,createNewPlaylist,playlistTracks:getPlaylistTracks,addTracksToPlaylist:addPlaylistTracks,removeTrackFromPlaylist:removePlaylistTrack,removeTracksFromPlaylist:removePlaylistTracks,renamePlaylist:renameExistingPlaylist,reorderPlaylistTracks:reorderPlaylist,deletePlaylist:deleteExistingPlaylist,playlistStats,hideDuplicateCopies}),[ready,tracks,recent,recentlyPlayed,favorites,mostPlayed,playlists,scanning,scanCount,queue,current,currentIndex,repeatMode,shuffleEnabled,sleepEndsAt,refresh,scan,play,toggle,next,previous,seek,synchronizePlayback,setSharedPlaybackDelegate,pauseSharedPlayback,toggleTrackFavorite,updateTrackInfo,saveMixAsPlaylist,addNext,addToQueue,removeFromQueue,moveInQueue,clearQueue,toggleShuffle,cycleRepeat,setSleepTimer,createNewPlaylist,getPlaylistTracks,addPlaylistTracks,removePlaylistTrack,removePlaylistTracks,renameExistingPlaylist,reorderPlaylist,deleteExistingPlaylist,hideDuplicateCopies]);
  const actions=useMemo(()=>({refresh:value.refresh,scan:value.scan,play:value.play,toggle:value.toggle,next:value.next,previous:value.previous,seek:value.seek,synchronizePlayback:value.synchronizePlayback,setSharedPlaybackDelegate:value.setSharedPlaybackDelegate,pauseSharedPlayback:value.pauseSharedPlayback,toggleTrackFavorite:value.toggleTrackFavorite,updateTrackInfo:value.updateTrackInfo,saveMixAsPlaylist:value.saveMixAsPlaylist,addNext:value.addNext,addToQueue:value.addToQueue,removeFromQueue:value.removeFromQueue,moveInQueue:value.moveInQueue,clearQueue:value.clearQueue,toggleShuffle:value.toggleShuffle,cycleRepeat:value.cycleRepeat,setSleepTimer:value.setSleepTimer,createNewPlaylist:value.createNewPlaylist,playlistTracks:value.playlistTracks,addTracksToPlaylist:value.addTracksToPlaylist,removeTrackFromPlaylist:value.removeTrackFromPlaylist,removeTracksFromPlaylist:value.removeTracksFromPlaylist,renamePlaylist:value.renamePlaylist,reorderPlaylistTracks:value.reorderPlaylistTracks,deletePlaylist:value.deletePlaylist,playlistStats:value.playlistStats,hideDuplicateCopies:value.hideDuplicateCopies}),[value.refresh,value.scan,value.play,value.toggle,value.next,value.previous,value.seek,value.synchronizePlayback,value.setSharedPlaybackDelegate,value.pauseSharedPlayback,value.toggleTrackFavorite,value.updateTrackInfo,value.saveMixAsPlaylist,value.addNext,value.addToQueue,value.removeFromQueue,value.moveInQueue,value.clearQueue,value.toggleShuffle,value.cycleRepeat,value.setSleepTimer,value.createNewPlaylist,value.playlistTracks,value.addTracksToPlaylist,value.removeTrackFromPlaylist,value.removeTracksFromPlaylist,value.renamePlaylist,value.reorderPlaylistTracks,value.deletePlaylist,value.playlistStats,value.hideDuplicateCopies]);
  const library=useMemo(()=>({ready,secondaryReady,tracks,recent,recentlyPlayed,favorites,mostPlayed,playlists}),[ready,secondaryReady,tracks,recent,recentlyPlayed,favorites,mostPlayed,playlists]);
  const queueState=useMemo(()=>({queue,current,currentIndex,repeatMode,shuffleEnabled,sleepEndsAt}),[queue,current,currentIndex,repeatMode,shuffleEnabled,sleepEndsAt]);
  const scanState=useMemo(()=>({scanning,scanCount}),[scanning,scanCount]);
  useEffect(()=>subscribeOrganizedAssets(assets=>{
    const changes=new Map(assets.map(asset=>[asset.assetId,asset]));
    setDownloads(items=>items.map(item=>{const asset=changes.get(item.outputTrackId||'');return asset?{...item,fileName:asset.fileName}:item;}));
    const update=(items:Track[])=>items.map(track=>{const asset=changes.get(track.localTrackId||track.id);return asset?{...track,uri:asset.uri,filename:asset.fileName,folder:asset.folder,modifiedAt:asset.modifiedAt}:track;});
    setTracks(update);setRecent(update);setRecentlyPlayed(update);
    const nextQueue=update(queueRef.current);queueRef.current=nextQueue;setQueue(nextQueue);
    const original=update(originalQueueRef.current);originalQueueRef.current=original;setOriginalQueue(original);
  }),[]);
  const dismissDownload=useCallback(async(id:string)=>{
    // Finish the last queued write before deleting so the row cannot reappear.
    await downloadWrites.current.get(id)?.catch(()=>{});
    await deleteDownloadRow(id);
    savedDownloadKeys.current.delete(id);
    setDownloads(all=>all.filter(item=>item.id!==id));
  },[]);
  useLayoutEffect(()=>publishDownloadStates(downloads),[downloads]);
  useLayoutEffect(()=>configureQuickDownload(async track=>{
    const saved=(await listTracks()).find(t=>t.id===track.id);if(saved?.downloaded&&(await resolvePlaybackSource(saved)).downloaded){notifyChange('Esta canción ya está descargada.');return;}
    const item:DownloadItem={id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,url:`https://www.youtube.com/watch?v=${track.youtubeId}`,title:track.title,artist:track.artist,thumbnail:track.artwork||undefined,quality:320,format:'mp3',progress:0,state:'queued',createdAt:Date.now()};
    await saveDownload(item);setDownloads(all=>[item,...all]);
    await runDownloadJob(item,setDownloads,async()=>{await refresh();});await refresh();
  }),[refresh]);
  const downloadValue=useMemo(()=>({downloads,setDownloads,dismissDownload}),[downloads,dismissDownload]);
  const playback=useMemo(()=>({playing:status.playing,position:status.currentTime||0,duration:status.duration||current?.duration||0,buffering:audioResolving||Boolean(status.isBuffering),error:audioError||status.error||null}),[status.playing,status.currentTime,status.duration,status.isBuffering,status.error,current?.duration,audioResolving,audioError]);
  const transport=useMemo(()=>({playing:soloStatus.video?soloStatus.playing&&!soloStatus.interrupted:status.playing,buffering:audioResolving||(soloStatus.video?false:Boolean(status.isBuffering)),error:soloStatus.video?soloStatus.error||null:audioError||status.error||null}),[soloStatus.video,soloStatus.playing,soloStatus.interrupted,soloStatus.error,status.playing,status.isBuffering,status.error,audioResolving,audioError]);
  const volumeControls=useMemo(()=>({volume,setVolume}),[volume,setVolume]);
  useLayoutEffect(()=>{
    return connectPlaybackProgress(playbackStore.publish,playback,getSoloYouTube,subscribeSoloYouTube);
  },[playbackStore,playback]);
  return <HasPlaybackContext.Provider value={Boolean(current)}><PlaybackStoreContext.Provider value={playbackStore}><ActiveTrackContext.Provider value={activeTracks}><ActionsContext.Provider value={actions}><LibraryContext.Provider value={library}><QueueContext.Provider value={queueState}><ScanContext.Provider value={scanState}><WaveContext.Provider value={value}><DownloadsContext.Provider value={downloadValue}><TransportContext.Provider value={transport}><PlaybackContext.Provider value={playback}><VolumeContext.Provider value={volumeControls}>{children}</VolumeContext.Provider></PlaybackContext.Provider></TransportContext.Provider></DownloadsContext.Provider></WaveContext.Provider></ScanContext.Provider></QueueContext.Provider></LibraryContext.Provider></ActionsContext.Provider></ActiveTrackContext.Provider></PlaybackStoreContext.Provider></HasPlaybackContext.Provider>;
}

export function useWave(){const value=useContext(WaveContext);if(!value)throw new Error('useWave requiere WaveProvider');return value;}
export function useDownloads(){const value=useContext(DownloadsContext);if(!value)throw new Error('useDownloads requiere WaveProvider');return value;}
export function usePlayback(){const local=useContext(PlaybackContext);const online=useSyncExternalStore(subscribeSoloYouTube,getSoloYouTube,getSoloYouTube);return online.video?{playing:online.playing&&!online.interrupted,position:online.position,duration:online.video.duration,buffering:false,error:online.error||null}:local;}
export function usePlaybackSelector<T extends string|number|boolean|null|undefined>(select:(value:PlaybackSnapshot)=>T,enabled=true){
  const store=useContext(PlaybackStoreContext);if(!store)throw new Error('La reproducción requiere WaveProvider');
  const subscribe=useCallback((listener:()=>void)=>enabled?store.subscribe(listener):()=>{},[enabled,store]);
  const snapshot=useCallback(()=>select(store.getSnapshot()),[select,store]);
  return useSyncExternalStore(subscribe,snapshot,snapshot);
}
/** Coordinators read fresh progress without rerendering their React provider. */
export function usePlaybackRef(){
  const store=useContext(PlaybackStoreContext);if(!store)throw new Error('La reproducción requiere WaveProvider');
  const value=useRef(store.getSnapshot());
  useLayoutEffect(()=>{const update=()=>{value.current=store.getSnapshot();};update();return store.subscribe(update);},[store]);
  return value;
}
export function useTransport(){return useContext(TransportContext);}
export function useVolume(){const value=useContext(VolumeContext);if(!value)throw new Error('useVolume requiere WaveProvider');return value;}

export function useLibrary(){const value=useContext(LibraryContext);if(!value)throw new Error('useLibrary requiere WaveProvider');return value;}
export function useQueue(){const value=useContext(QueueContext);if(!value)throw new Error('useQueue requiere WaveProvider');return value;}
export function useWaveActions(){const value=useContext(ActionsContext);if(!value)throw new Error('useWaveActions requiere WaveProvider');return value;}
export function useScan(){const value=useContext(ScanContext);if(!value)throw new Error('useScan requiere WaveProvider');return value;}
export function useTrackActive(id:string){
  const store=useContext(ActiveTrackContext);if(!store)throw new Error('useTrackActive requiere WaveProvider');
  const subscribe=useCallback((listener:()=>void)=>store.subscribe(id,listener),[store,id]);
  const snapshot=useCallback(()=>store.isActive(id),[store,id]);
  return useSyncExternalStore(subscribe,snapshot,snapshot);
}

/** Layouts needing only mini-player space do not subscribe to the full queue. */
export function useHasPlayback(){return useContext(HasPlaybackContext);}

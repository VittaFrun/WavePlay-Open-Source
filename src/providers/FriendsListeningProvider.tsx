import { AppAlert as Alert } from '../services/appAlert';
import { trackVideo } from '../utils/onlineTrack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState, useLayoutEffect, useSyncExternalStore } from 'react';
import { AppState, NativeModules } from 'react-native';
import type { ListeningRoom, ListeningRoomMember, RoomSnapshot, RoomQueueItem, Track, SharedPlaybackDelegate, YouTubeVideo, RoomPlaybackState } from '../types';
import { canControlRoom } from '../utils/roomYouTube';
import { getYouTubeVideo } from '../services/youtube';
import { accountClient } from '../services/account';
import { accountDisplayName, createListeningChannel, createListeningRoom, currentAccount, getRoomSnapshot, joinListeningRoom, leaveListeningRoom, listListeningRoomMembers, heartbeatListeningRoom, updateRoomAvatar, reorderRoomQueue, reserveRoomSong, setRoomPlayback, updateRoomSong, addRoomYouTube, setRoomControlMode } from '../services/listeningRooms';
import { cachedRoomAudio, clearRoomAudioCache, pruneRoomAudioCache, prepareRoomAudio, removePreparedAudio, uploadRoomAudio } from '../services/roomAudio';
import { adjacentRoomSong, roomPosition, roomSongAsTrack, roomOrderWithNext, type RoomSongIntent } from '../utils/listeningRoom';
import { createLatestRead, reconcileRows, recoveryDelay, createProgressGate } from '../utils/asyncWork';
import { createRoomSelection } from '../utils/roomSelection';
import { performanceStart } from '../services/performance';
import { notifyChange } from '../services/feedback';
import { RoomSongChoiceSheet } from '../components/RoomSongChoiceSheet';
import { roomYouTubeNative, subscribeRoomYouTube } from '../services/roomYouTubeNative';
import { useTransport, usePlaybackRef, useLibrary, useQueue, useWaveActions } from './WaveProvider';

type AudioStatus='idle'|'preparing'|'synced'|'error'|'interrupted';
type Upload={track:Track;progress:number;status:'uploading'|'error';message?:string};
type FriendsContextValue={
  user:User|null;room:ListeningRoom|null;role:'host'|'guest'|null;members:ListeningRoomMember[];
  onlineUserIds:Set<string>;memberAudio:Record<string,string>;connected:boolean;busy:boolean;commandPending:boolean;error:string;
  queue:RoomQueueItem[];current:RoomQueueItem|null;playing:boolean;audioStatus:AudioStatus;uploads:Upload[];
  createRoom(name:string):Promise<void>;joinRoom(code:string):Promise<void>;leaveRoom():Promise<void>;
  addSong(track:Track):Promise<void>;playSong(id:string):Promise<void>;toggle():Promise<void>;
  next():Promise<void>;previous():Promise<void>;seek(seconds:number):Promise<void>;resync():Promise<void>;setScrubbing(active:boolean):void;
  removeSong(id:string):Promise<void>;moveSong(id:string,direction:1|-1):Promise<void>;cancelUpload():void;
  canControl:boolean;controlMode:'host'|'collaborative';setControlMode(mode:'host'|'collaborative'):Promise<void>;
  addYouTube(video:YouTubeVideo,intent:RoomSongIntent):Promise<void>;promptYouTube(video:YouTubeVideo):void;
  youtubePlayback:RoomPlaybackState|null;serverClockOffset:number;reportYouTube(status:AudioStatus):void;
  youtubeEnded(id:string,revision:number):Promise<void>;
};
const FriendsContext=createContext<FriendsContextValue|null>(null);
type RoomStore={value:FriendsContextValue;listeners:Set<()=>void>};
const RoomStoreContext=createContext<RoomStore|null>(null);
export function useRoomSelector<T>(selector:(value:FriendsContextValue)=>T):T{
  const store=useContext(RoomStoreContext);if(!store)throw new Error('La sala requiere su proveedor.');
  const [snapshot]=useState(()=>createRoomSelection(()=>selector(store.value)));
  useLayoutEffect(()=>{snapshot.setRead(()=>selector(store.value));},[selector,snapshot,store]);
  const subscribe=useCallback((listener:()=>void)=>{store.listeners.add(listener);return()=>{store.listeners.delete(listener);};},[store]);

  return useSyncExternalStore(subscribe,snapshot,snapshot);
}
const storedRoom='waveplay-active-room-v2';
const message=(reason:unknown)=>{
  const text=reason instanceof Error?reason.message:typeof (reason as {message?:unknown})?.message==='string'?(reason as {message:string}).message:'No se pudo completar la operación.';
  if(/fetch failed|network request|UnknownHost|Failed to fetch|NetworkError/i.test(text))return 'No se pudo conectar. Revisa internet y vuelve a sincronizar.';
  if(text==='ROOM_STATE_CHANGED')return 'La sala cambió mientras enviabas la acción. Sincroniza y vuelve a intentarlo.';
  if(text==='room not found')return 'La sala no existe o ya finalizó.';
  return text;
};

export function FriendsListeningProvider({children}:PropsWithChildren){
  useEffect(()=>{void AsyncStorage.multiRemove(['waveplay.room.youtubeBackground','waveplay.room.cleanupPlayed']);},[]);
  const library=useLibrary(),queueState=useQueue(),actions=useWaveActions(),playback=useTransport();
  const playbackRef=usePlaybackRef();
  const wave=useMemo(()=>({...library,...queueState,...actions}),[library,queueState,actions]);
  const [user,setUser]=useState<User|null>(null),[room,setRoom]=useState<ListeningRoom|null>(null);
  const [members,setMembers]=useState<ListeningRoomMember[]>([]),[onlineUserIds,setOnlineUserIds]=useState(new Set<string>());
  const [memberAudio,setMemberAudio]=useState<Record<string,string>>({});
  const [connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [commandPending,setCommandPending]=useState(false);
  const pendingCommands=useRef(0);
  const [connectionError,setConnectionError]=useState('');
  const [syncError,setSyncError]=useState('');
  const [snapshot,setSnapshot]=useState<RoomSnapshot|null>(null),[audioStatus,setAudioStatus]=useState<AudioStatus>('idle');
  const [uploads,setUploads]=useState<Upload[]>([]);
  const waveRef=useRef(wave),snapshotRef=useRef<RoomSnapshot|null>(null);
  const sessionRef=useRef<{room:ListeningRoom;user:User;controller:AbortController}|null>(null);
  const channelRef=useRef<RealtimeChannel|null>(null),clockOffsetRef=useRef(0),syncRef=useRef(false);
  const localInterrupted=useRef(false);
  const scrubbingRef=useRef(false),localDrift=useRef({id:"",count:0});
  const setScrubbing=useCallback((active:boolean)=>{scrubbingRef.current=active;},[]);
  const audioStatusRef=useRef<AudioStatus>('idle');
  const lastAppliedAtRef=useRef(0);
  const youtubeProgress=useRef<{id:string;position:number;state:number;received:number}|null>(null);
  const failuresRef=useRef(0);
  const presenceMembersRef=useRef('');
  const refreshTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const uploadRef=useRef<AbortController|null>(null),operationRef=useRef(false);
  const actionChain=useRef<Promise<unknown>>(Promise.resolve());
  const role:'host'|'guest'|null=room&&user?(room.hostUserId===user.id?'host':'guest'):null;
  const roomId=room?.id,userId=user?.id;
  useEffect(()=>{waveRef.current=wave;},[wave]);

  useEffect(()=>{
    let active=true;
    const accept=async(next:User|null)=>{
      if(!active)return;setUser(next);
      if(!next){setRoom(null);return;}
      const saved=await AsyncStorage.getItem(storedRoom);
      if(saved)try{
        const parsed=JSON.parse(saved);
        if(parsed.userId!==next.id)return;
        const state=await getRoomSnapshot(parsed.roomId);
        if(active&&state?.room.status==='active'&&Date.parse(state.room.expiresAt)>state.serverNow)setRoom(state.room);
      }catch{/* An expired session must not block account access. */}
    };
    void accountClient?.auth.getUser().then(({data})=>accept(data.user));
    const listener=accountClient?.auth.onAuthStateChange((event,session)=>{
      if(active){setUser(session?.user??null);if(event==='SIGNED_OUT'){setRoom(null);void AsyncStorage.removeItem(storedRoom);}}
    });
    return()=>{active=false;listener?.data.subscription.unsubscribe();};
  },[]);

  const reportAudio=useCallback((status:AudioStatus,force=false)=>{
    if(!force&&audioStatusRef.current===status)return;
    audioStatusRef.current=status;
    setAudioStatus(status);
    const session=sessionRef.current;
    if(session&&channelRef.current)void channelRef.current.track({userId:session.user.id,displayName:accountDisplayName(session.user),role:session.room.hostUserId===session.user.id?'host':'guest',audioStatus:status});
  },[]);
  const finishSession=useCallback((notice='')=>{
    roomYouTubeNative?.stop();
    const session=sessionRef.current;
    session?.controller.abort();uploadRef.current?.abort();uploadRef.current=null;
    sessionRef.current=null;snapshotRef.current=null;localInterrupted.current=false;
    waveRef.current.setSharedPlaybackDelegate(null);
    setRoom(null);setSnapshot(null);setMembers([]);setOnlineUserIds(new Set());setMemberAudio({});setConnected(false);setConnectionError('');setSyncError('');setAudioStatus('idle');setUploads([]);
    setError(notice);
    void AsyncStorage.removeItem(storedRoom);
  },[]);

  const synchronize=useCallback(async(force=false)=>{
    if(force)localInterrupted.current=false;
    if(syncRef.current||(scrubbingRef.current||localInterrupted.current)&&!force)return;
    syncRef.current=true;
    try{
      let again=true;
      while(again){
        again=false;
        const session=sessionRef.current,state=snapshotRef.current;
        if(!session||!state||session.controller.signal.aborted)break;
        const item=state.queue.find(song=>song.id===state.playback.trackId&&song.status==='ready');
        if(!item){waveRef.current.pauseSharedPlayback();reportAudio('idle');break;}
        if(item.source==='youtube'){waveRef.current.pauseSharedPlayback();setSyncError('');break;}
        const expected=roomPosition(state.playback,item.duration,Date.now()+clockOffsetRef.current);
        const local=waveRef.current.current;
        const drift=Math.abs(playbackRef.current.position-expected);
        const same=local?.id==='room:'+item.id;
        if(same&&playbackRef.current.playing===state.playback.playing&&!force){
          if(localDrift.current.id!==item.id)localDrift.current={id:item.id,count:0};
          localDrift.current.count=drift>.75?localDrift.current.count+1:0;
          if(localDrift.current.count<2)break;localDrift.current.count=0;
        }
        if(!force&&local?.id==='room:'+item.id&&drift<=.75&&playbackRef.current.playing===state.playback.playing){setSyncError('');reportAudio('synced');break;}
        reportAudio('preparing');
        const uri=await cachedRoomAudio(item,session.controller.signal);
        if(sessionRef.current!==session||session.controller.signal.aborted)break;
        if(snapshotRef.current?.playback.revision!==state.playback.revision){again=true;continue;}
        const metadata=local?.id==='room:'+item.id?{artwork:local.artwork}:await NativeModules.WavePlayDownloader?.readMetadata?.(uri).catch(()=>null);
        if(sessionRef.current!==session)break;
        if(snapshotRef.current?.playback.revision!==state.playback.revision){again=true;continue;}
        const position=roomPosition(state.playback,item.duration,Date.now()+clockOffsetRef.current);
        await waveRef.current.synchronizePlayback(roomSongAsTrack(item,uri,metadata?.artwork),position,state.playback.playing);
        if(sessionRef.current!==session)break;
        lastAppliedAtRef.current=Date.now();
        setSyncError('');reportAudio('synced');
        again=snapshotRef.current?.playback.revision!==state.playback.revision;force=false;
      }
    }catch(reason){
      if(sessionRef.current&&!sessionRef.current.controller.signal.aborted){setSyncError(message(reason));waveRef.current.pauseSharedPlayback();reportAudio('error');}
    }finally{syncRef.current=false;}
  },[reportAudio,playbackRef]);

  const roomRead=useMemo(()=>createLatestRead(async()=>{
    const session=sessionRef.current;
    if(!session)return null;
    const end=performanceStart('room-snapshot-query'),started=Date.now();
    try{return {session,started,state:await getRoomSnapshot(session.room.id)};}finally{end();}
  },result=>{
    if(!result||sessionRef.current!==result.session)return;
    const {state,started}=result;
    if(!state||state.room.status==='closed'||Date.parse(state.room.expiresAt)<=state.serverNow){finishSession('La sala ha finalizado.');return;}
    if(snapshotRef.current&&(state.playback.revision<snapshotRef.current.playback.revision||state.serverNow<snapshotRef.current.serverNow))return;
    clockOffsetRef.current=state.serverNow-(started+Date.now())/2;
    failuresRef.current=0;setConnectionError('');setConnected(channelRef.current?.state==='joined');
    if(snapshotRef.current)state.queue=reconcileRows(snapshotRef.current.queue,state.queue);
    snapshotRef.current=state;setSnapshot(state);
    void synchronize();
  }),[finishSession,synchronize]);
  const refresh=useCallback(()=>roomRead.run().catch(reason=>{failuresRef.current+=1;throw reason;}),[roomRead]);

  const safeRefresh=useCallback(()=>{
    if(refreshTimerRef.current)return;
    refreshTimerRef.current=setTimeout(()=>{refreshTimerRef.current=null;void refresh().catch(reason=>{if(sessionRef.current){setConnectionError(message(reason));setConnected(false);}});},80);
  },[refresh]);
  const backgroundChecked=useRef(0);
  useEffect(()=>subscribeRoomYouTube(event=>{
    const state=snapshotRef.current;
    if(event.type==='pulse'&&AppState.currentState!=='active'&&Date.now()-backgroundChecked.current>=recoveryDelay(channelRef.current?.state==='joined',failuresRef.current)){backgroundChecked.current=Date.now();safeRefresh();}
    if(event.type==='refresh'&&!roomYouTubeNative?.setRoomActive&&AppState.currentState!=='active'&&state?.playback.trackId===event.id)safeRefresh();
    if(event.type==='progress'&&Number.isFinite(event.position)&&state?.playback.trackId===event.id)
      youtubeProgress.current={id:event.id,position:event.position!,state:event.state??-1,received:Date.now()};
  }),[safeRefresh]);
  useEffect(()=>()=>roomYouTubeNative?.stop(),[]);

  const command=useCallback((task:(state:RoomSnapshot,session:NonNullable<typeof sessionRef.current>)=>Promise<unknown>):Promise<void>=>{
    const expectedSession=sessionRef.current;
    const finishMetric=performanceStart('room-command');
    pendingCommands.current++;setCommandPending(true);
    const pending=actionChain.current.catch(()=>{}).then(async()=>{
      const session=sessionRef.current,state=snapshotRef.current;
      if(!session||session!==expectedSession||!state)return;
      if(!canControlRoom(state.room,session.user.id))throw new Error('El anfitrión controla la reproducción; puedes añadir canciones a la cola.');
      await task(state,session);
      if(sessionRef.current===session){setError('');roomRead.invalidate();await refresh();}
    });
    actionChain.current=pending;
    return pending.then(()=>{}).catch(reason=>{if(sessionRef.current===expectedSession){setError(message(reason));safeRefresh();}throw reason;}).finally(()=>{finishMetric();pendingCommands.current--;setCommandPending(pendingCommands.current>0);});
  },[refresh,roomRead,safeRefresh]);
  const playSong=useCallback((id:string)=>command(async(state,session)=>setRoomPlayback(session.room.id,id,0,true,state.playback.revision)),[command]);
  const toggle=useCallback(()=>command(async(state,session)=>{
    const item=state.queue.find(song=>song.id===state.playback.trackId)||state.queue.find(song=>song.status==='ready');
    if(!item)throw new Error('Añade una canción disponible para comenzar.');
    const position=state.playback.trackId?roomPosition(state.playback,item.duration,Date.now()+clockOffsetRef.current):0;
    const restarting=!state.playback.playing&&position>=item.duration-0.25;
    return setRoomPlayback(session.room.id,item.id,restarting?0:position,!state.playback.playing,state.playback.revision);
  }),[command]);
  const next=useCallback(()=>command(async(state,session)=>{
    const item=adjacentRoomSong(state.queue,state.playback.trackId,1);
    return setRoomPlayback(session.room.id,item?.id??null,0,Boolean(item),state.playback.revision,'skip');
  }),[command]);
  const previous=useCallback(()=>command(async(state,session)=>{
    const current=state.queue.find(song=>song.id===state.playback.trackId);
    if(current)return setRoomPlayback(session.room.id,current.id,0,true,state.playback.revision,'restart');
  }),[command]);
  const seek=useCallback((seconds:number)=>command(async(state,session)=>{
    const playback=await setRoomPlayback(session.room.id,state.playback.trackId,seconds,state.playback.playing,state.playback.revision);
    const latest=snapshotRef.current;
    if(sessionRef.current!==session||!latest||playback.revision<latest.playback.revision)return;
    const confirmed={...latest,playback};
    snapshotRef.current=confirmed;setSnapshot(confirmed);
    // The RPC already returned authoritative playback; don't wait for a full queue read.
    void synchronize(true);
  }),[command,synchronize]);

  const uploadSong=useCallback(async(track:Track)=>{
    const session=sessionRef.current;if(!session)throw new Error('Entra a una sala para compartir canciones.');
    if(uploadRef.current)throw new Error('Espera a que termine la subida actual.');
    const controller=new AbortController();uploadRef.current=controller;
    const acceptProgress=createProgressGate();
    const cancel=()=>controller.abort();session.controller.signal.addEventListener('abort',cancel);
    let file:Awaited<ReturnType<typeof prepareRoomAudio>>|undefined,item:RoomQueueItem|undefined;
    setError('');setUploads(old=>[...old.filter(value=>value.track.id!==track.id),{track,progress:0,status:'uploading'}]);
    try{
      file=await prepareRoomAudio(track,controller.signal);
      item=await reserveRoomSong(session.room.id,track,file.size,accountDisplayName(session.user));
      if(controller.signal.aborted)throw new Error('La subida fue cancelada.');
      safeRefresh();
      await uploadRoomAudio(item,file,controller.signal,progress=>{if(sessionRef.current===session&&acceptProgress(progress,Date.now()))setUploads(old=>old.map(value=>value.track.id===track.id?{...value,progress}:value));});
      await updateRoomSong(item.id,'ready');
      if(sessionRef.current===session){setUploads(old=>old.filter(value=>value.track.id!==track.id));roomRead.invalidate();await refresh();}
      return item.id;
    }catch(reason){
      if(item)await updateRoomSong(item.id,'removed').catch(()=>{});
      if(sessionRef.current===session){setError(message(reason));setUploads(old=>old.map(value=>value.track.id===track.id?{...value,status:'error',message:message(reason)}:value));safeRefresh();}
      throw reason;
    }finally{
      session.controller.signal.removeEventListener('abort',cancel);
      if(uploadRef.current===controller)uploadRef.current=null;
      if(file)await removePreparedAudio(file.uri).catch(()=>{});
    }
  },[refresh,safeRefresh,roomRead]);
  const addYouTube=useCallback(async(video:YouTubeVideo,intent:RoomSongIntent)=>{
    const session=sessionRef.current;if(!session)throw new Error('Entra a una sala.');
    try{
      if(intent!=='queue'&&!canControlRoom(snapshotRef.current?.room||session.room,session.user.id))throw new Error('Solo puedes añadir al final de la cola.');
      const verified=await getYouTubeVideo(video.id,session.controller.signal);
      if(sessionRef.current!==session||session.controller.signal.aborted)return;
      const item=await addRoomYouTube(session.room.id,verified,accountDisplayName(session.user));
      if(sessionRef.current!==session)return;
      roomRead.invalidate();await refresh();
      if(intent==='now')await playSong(item.id);
      else if(intent==='next')await command((state,active)=>reorderRoomQueue(active.room.id,roomOrderWithNext(state.queue,state.playback.trackId,item.id)));
      notifyChange('Video añadido a la sala.');
    }catch(reason){if(sessionRef.current===session)setError(message(reason));throw reason;}
  },[refresh,roomRead,playSong,command]);
  const [songChoice,setSongChoice]=useState<{track:Track;controller:AbortController;host:boolean;video?:YouTubeVideo}|null>(null);
  const choosingSong=useRef(false);
  const closeSongChoice=useCallback(()=>setSongChoice(null),[]);
  const promptSong=useCallback(async(track:Track)=>{
    const session=sessionRef.current;if(!session)return;
    if(uploadRef.current||choosingSong.current){Alert.alert('Subida en curso','Espera a que termine o cancélala desde la sala.');return;}
    setSongChoice(previous=>previous&&!previous.controller.signal.aborted?previous:{track,controller:session.controller,host:canControlRoom(snapshotRef.current?.room||session.room,session.user.id)});
  },[]);
  const chooseSong=useCallback((intent:RoomSongIntent)=>{
    if(choosingSong.current)return;
    const choice=songChoice;setSongChoice(null);
    const session=sessionRef.current;
    if(!choice||!session||session.controller!==choice.controller||session.controller.signal.aborted)return;
    choosingSong.current=true;
    const perform=async()=>{
      if(choice.video){await addYouTube(choice.video,intent);return;}
      if(intent!=='queue'&&!canControlRoom(snapshotRef.current?.room||session.room,session.user.id))throw new Error('El anfitrión controla la reproducción y el orden.');
      const existing=choice.track.id.startsWith('room:')?snapshotRef.current?.queue.find(item=>'room:'+item.id===choice.track.id&&item.status==='ready'):undefined;
      if(!existing)notifyChange('Preparando canción para la sala…');
      const id=existing?.id??await uploadSong(choice.track);
      if(sessionRef.current!==session||session.controller.signal.aborted)return;
      if(intent==='now')await playSong(id);
      else if(intent==='next')await command(async(state,currentSession)=>{
        await reorderRoomQueue(currentSession.room.id,roomOrderWithNext(state.queue,state.playback.trackId,id));
      });
      notifyChange(intent==='now'?'La canción se está reproduciendo en la sala.':intent==='next'?'La canción quedó como siguiente.':existing?'La canción ya está en la cola de la sala.':'Canción añadida a la cola de la sala.');
    };
    void perform().catch(reason=>{if(sessionRef.current===session)Alert.alert('No se pudo completar',message(reason));}).finally(()=>{choosingSong.current=false;});
  },[songChoice,uploadSong,playSong,command,addYouTube]);
  const addSong=useCallback(async(track:Track)=>{if(track.youtubeId&&!track.downloaded)await addYouTube(trackVideo(track),'queue');else await uploadSong(track);},[uploadSong,addYouTube]);
  const promptYouTube=useCallback((video:YouTubeVideo)=>{
    const session=sessionRef.current;if(!session||choosingSong.current)return;
    const track:Track={id:'youtube:'+video.id,uri:'',filename:'',title:video.title,artist:video.channel,album:'YouTube',duration:video.duration,artwork:video.thumbnail,createdAt:0,modifiedAt:0};
    setSongChoice({track,video,controller:session.controller,host:canControlRoom(snapshotRef.current?.room||session.room,session.user.id)});
  },[]);
  const actionsRef=useRef<SharedPlaybackDelegate|null>(null);
  useEffect(()=>{
    const quiet=(task:()=>Promise<void>)=>{void task().catch(()=>{});};
    actionsRef.current={play:async track=>{if(track.youtubeId)promptYouTube(trackVideo(track));else await promptSong(track);},toggle:()=>quiet(toggle),next:()=>quiet(next),finished:()=>{const session=sessionRef.current,state=snapshotRef.current;if(session&&state&&session.room.hostUserId===session.user.id&&waveRef.current.current?.id==='room:'+state.playback.trackId)quiet(next);},previous:()=>quiet(previous),seek:seconds=>quiet(()=>seek(seconds))};
  },[promptSong,promptYouTube,toggle,next,previous,seek]);

  useEffect(()=>{
    if(!roomId||!userId||!room||!user||!wave.secondaryReady)return;
    const session={room,user,controller:new AbortController()};sessionRef.current=session;snapshotRef.current=null;
    const delegate:SharedPlaybackDelegate={
      play:track=>actionsRef.current!.play(track),toggle:()=>actionsRef.current?.toggle(),next:()=>actionsRef.current?.next(),
      previous:()=>actionsRef.current?.previous(),seek:seconds=>actionsRef.current?.seek(seconds),finished:()=>actionsRef.current?.finished?.(),
    };
    waveRef.current.setSharedPlaybackDelegate(delegate);
    void AsyncStorage.setItem(storedRoom,JSON.stringify({roomId,userId}));
    const channel=createListeningChannel(roomId,userId,accountDisplayName(user),room.hostUserId===userId?'host':'guest',{
      onChange:safeRefresh,
      onPresence:()=>{
        if(sessionRef.current!==session)return;
        const ids=new Set<string>(),audio:Record<string,string>={};
        Object.values(channel.presenceState<Record<string,unknown>>()).flat().forEach(entry=>{if(typeof entry.userId==='string'){ids.add(entry.userId);audio[entry.userId]=String(entry.audioStatus||'idle');}});
        setOnlineUserIds(previous=>previous.size===ids.size&&[...ids].every(id=>previous.has(id))?previous:ids);
        setMemberAudio(previous=>JSON.stringify(previous)===JSON.stringify(audio)?previous:audio);
        const membership=[...ids].sort().join(',');
        if(presenceMembersRef.current!==membership){
          presenceMembersRef.current=membership;
          void listListeningRoomMembers(roomId).then(value=>{if(sessionRef.current===session)setMembers(old=>reconcileRows(old,value,member=>member.userId));}).catch(()=>{presenceMembersRef.current='';});
        }
      },
      onConnection:(value,reason)=>{if(sessionRef.current===session){setConnected(value);setConnectionError(reason?'La conexión en directo se interrumpió. Reintentando…':'');if(value)reportAudio(audioStatusRef.current,true);}},
    });
    roomYouTubeNative?.setRoomActive?.(true);
    channelRef.current=channel;roomRead.invalidate();failuresRef.current=0;presenceMembersRef.current='';safeRefresh();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const poll=()=>{timer=undefined;if(AppState.currentState!=='active'||session.controller.signal.aborted)return;
      void refresh().catch(reason=>{if(sessionRef.current===session){setConnectionError(message(reason));setConnected(false);}}).finally(()=>{
        if(sessionRef.current===session&&!session.controller.signal.aborted&&AppState.currentState==='active')timer=setTimeout(poll,Math.min(60000,recoveryDelay(channelRef.current?.state==='joined',failuresRef.current)*(1+Math.random()*.1)));
      });
    };
    const schedule=()=>{if(timer)clearTimeout(timer);timer=undefined;if(AppState.currentState==='active')timer=setTimeout(poll,Math.min(60000,recoveryDelay(channelRef.current?.state==='joined',failuresRef.current)*(1+Math.random()*.1)));};
    schedule();
    const app=AppState.addEventListener('change',state=>{if(state==='active'){safeRefresh();schedule();}else{if(timer)clearTimeout(timer);timer=undefined;}});
    return()=>{
      roomYouTubeNative?.setRoomActive?.(false);
      session.controller.abort();uploadRef.current?.abort();if(timer)clearTimeout(timer);app.remove();
      if(refreshTimerRef.current){clearTimeout(refreshTimerRef.current);refreshTimerRef.current=null;}
      if(sessionRef.current===session){sessionRef.current=null;snapshotRef.current=null;waveRef.current.setSharedPlaybackDelegate(null);}
      if(channelRef.current===channel)channelRef.current=null;
      void accountClient?.removeChannel(channel);
      void clearRoomAudioCache(roomId).catch(()=>{});
    };
    // Room identity changes start a session; token refreshes do not restart playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[roomId,userId,safeRefresh,wave.secondaryReady,reportAudio]);

  const driftSamples=useRef(0);
  useEffect(()=>{
    if(!roomId)return;
    const timer=setInterval(()=>{
      const session=sessionRef.current,state=snapshotRef.current;
      if(!session||!state||session.room.hostUserId!==session.user.id||syncRef.current||scrubbingRef.current||localInterrupted.current)return;
      const youtube=youtubeProgress.current;
      if(youtube&&youtube.id===state.playback.trackId&&youtube.state===1&&Date.now()-youtube.received<2500&&state.playback.playing){
        const expected=roomPosition(state.playback,state.queue.find(item=>item.id===youtube.id)?.duration||0,Date.now()+clockOffsetRef.current);
        if(Math.abs(expected-youtube.position)>1.5){driftSamples.current++;}else driftSamples.current=0;
        if(driftSamples.current>=2){driftSamples.current=0;void command((latest,currentSession)=>{
          if(latest.playback.trackId!==youtube.id||!latest.playback.playing)return Promise.resolve();
          return setRoomPlayback(currentSession.room.id,youtube.id,youtube.position,true,latest.playback.revision,'drift');
        }).catch(()=>{});}
        return;
      }
      if(playbackRef.current.buffering||waveRef.current.current?.id!=='room:'+state.playback.trackId)return;
      const duration=state.queue.find(song=>song.id===state.playback.trackId)?.duration||0;
      if(!playbackRef.current.playing||!state.playback.playing)return;
      if(Math.abs(playbackRef.current.position-roomPosition(state.playback,duration,Date.now()+clockOffsetRef.current))<=.75){driftSamples.current=0;return;}
      if(++driftSamples.current<2)return;driftSamples.current=0;
      void command((latest,currentSession)=>{
        if(syncRef.current||waveRef.current.current?.id!=='room:'+latest.playback.trackId)return Promise.resolve();
        return setRoomPlayback(currentSession.room.id,latest.playback.trackId,playbackRef.current.position,true,latest.playback.revision,'drift');
      }).catch(()=>{});
    },10000);
    return()=>clearInterval(timer);
  },[roomId,command,playbackRef]);
  useEffect(()=>{
    const state=snapshotRef.current,session=sessionRef.current;
    if(!state||!session)return;
    const nextItem=adjacentRoomSong(state.queue,state.playback.trackId,1);
    if(!nextItem||nextItem.source==='youtube')return;
    const controller=new AbortController();
    const cancel=()=>controller.abort();session.controller.signal.addEventListener('abort',cancel);
    void cachedRoomAudio(nextItem,controller.signal).catch(()=>{}).finally(()=>session.controller.signal.removeEventListener('abort',cancel));
    return()=>{if(snapshotRef.current?.playback.trackId!==nextItem.id)controller.abort();};
  },[snapshot?.queue,snapshot?.playback.trackId]);

  useEffect(()=>{
    const state=snapshotRef.current;
    if(!state||syncRef.current||playbackRef.current.buffering||Date.now()-lastAppliedAtRef.current<1500)return;
    if(state.playback.playing&&waveRef.current.current?.id==='room:'+state.playback.trackId&&!playback.playing){
      localInterrupted.current=true;reportAudio('interrupted');
    }
  },[playback.playing,reportAudio,playbackRef]);
  const localPlayingId=queueState.current?.id;
  useEffect(()=>{
    const session=sessionRef.current,state=snapshotRef.current;if(!session||!state)return;
    const next=adjacentRoomSong(state.queue,state.playback.trackId,1);
    const keep=new Set([state.playback.trackId,next?.id].filter((id):id is string=>Boolean(id)));
    if(localPlayingId?.startsWith('room:'))keep.add(localPlayingId.slice(5));
    void pruneRoomAudioCache(session.room.id,keep,id=>session.controller.signal.aborted||sessionRef.current!==session||waveRef.current.current?.id==='room:'+id||snapshotRef.current?.playback.trackId===id||adjacentRoomSong(snapshotRef.current?.queue||[],snapshotRef.current?.playback.trackId||null,1)?.id===id).catch(()=>{});
  },[snapshot?.queue,localPlayingId]);

  useEffect(()=>{
    if(!roomId||!userId)return;
    let inFlight=false,lastBeat=0;
    const beat=()=>{
      const session=sessionRef.current;
      if(!session||session.room.hostUserId!==session.user.id||inFlight||Date.now()-lastBeat<30000)return;
      inFlight=true;lastBeat=Date.now();
      const state=snapshotRef.current,youtube=youtubeProgress.current;
      const isYouTube=state?.queue.find(item=>item.id===state.playback.trackId)?.source==='youtube';
      const observation=isYouTube&&youtube&&youtube.id===state?.playback.trackId&&Date.now()-youtube.received<4500?{trackId:youtube.id,position:youtube.position,state:youtube.state===1?'playing':youtube.state===0?'ended':youtube.state===3?'buffering':'interrupted'}:{trackId:state?.playback.trackId||null,position:playbackRef.current.position,state:isYouTube?'interrupted':waveRef.current.current?.id!=='room:'+state?.playback.trackId?'idle':playbackRef.current.buffering?'buffering':playbackRef.current.playing?'playing':'paused'};
      void heartbeatListeningRoom(roomId,observation).catch(()=>{lastBeat=0;}).finally(()=>{inFlight=false;});
    };
    beat();const timer=setInterval(beat,30000);
    const native=subscribeRoomYouTube(event=>{if(event.type==='pulse')beat();});
    void updateRoomAvatar(roomId,user?.user_metadata?.avatar_url||user?.user_metadata?.picture).then(()=>listListeningRoomMembers(roomId)).then(value=>{if(sessionRef.current?.room.id===roomId)setMembers(old=>reconcileRows(old,value,member=>member.userId));}).catch(()=>{});
    return()=>{clearInterval(timer);native();};
  },[roomId,userId,user,playbackRef]);
  const perform=useCallback(async(task:()=>Promise<void>)=>{
    if(operationRef.current)return;operationRef.current=true;setBusy(true);setError('');
    try{await task();}catch(reason){setError(message(reason));throw reason;}finally{operationRef.current=false;setBusy(false);}
  },[]);
  const createRoom=useCallback((name:string)=>perform(async()=>{const account=await currentAccount();setUser(account);setRoom(await createListeningRoom(name||'Sala de WavePlay',accountDisplayName(account)));}),[perform]);
  const joinRoom=useCallback((code:string)=>perform(async()=>{const account=await currentAccount();setUser(account);setRoom(await joinListeningRoom(code,accountDisplayName(account)));}),[perform]);
  const leaveRoom=useCallback(()=>perform(async()=>{const session=sessionRef.current;if(session)await leaveListeningRoom(session.room,session.user.id);finishSession();}),[perform,finishSession]);
  const resync=useCallback(async()=>{setError('');await refresh();await synchronize(true);},[refresh,synchronize]);
  const removeSong=useCallback(async(id:string)=>{
    try{
      const session=sessionRef.current,state=snapshotRef.current;if(!session||!state)return;
      if(state.playback.trackId===id)throw new Error('Cambia de canción antes de quitar la que está sonando.');
      await updateRoomSong(id,'removed');roomRead.invalidate();await refresh();
    }catch(reason){setError(message(reason));throw reason;}
  },[refresh,roomRead]);
  const moveSong=useCallback((id:string,direction:1|-1)=>command(async(state,session)=>{
    const ids=state.queue.map(item=>item.id),index=ids.indexOf(id),target=index+direction;
    if(index<0||target<0||target>=ids.length)return;
    [ids[index],ids[target]]=[ids[target],ids[index]];await reorderRoomQueue(session.room.id,ids);
  }),[command]);
  const cancelUpload=useCallback(()=>uploadRef.current?.abort(),[]);
  const setControlMode=useCallback(async(mode:'host'|'collaborative')=>{
    try{const session=sessionRef.current;if(!session||session.room.hostUserId!==session.user.id)throw new Error('Solo el anfitrión cambia los permisos.');
      await setRoomControlMode(session.room.id,mode);roomRead.invalidate();await refresh();
    }catch(reason){setError(message(reason));throw reason;}
  },[refresh,roomRead]);
  const youtubeEnded=useCallback((id:string,revision:number)=>{
    if(sessionRef.current?.room.hostUserId!==sessionRef.current?.user.id)return Promise.resolve();
    return command(async(state,session)=>{
      if(state.playback.trackId!==id||state.playback.revision!==revision||!state.playback.playing)return;
      const item=adjacentRoomSong(state.queue,id,1);
      await setRoomPlayback(session.room.id,item?.id??null,0,Boolean(item),revision,'ended');
    });
  },[command]);
  const sharedQueue=snapshot?.queue;
  const sharedTrackId=snapshot?.playback.trackId;
  const sharedPlaying=snapshot?.playback.playing||false;
  const value=useMemo(()=>({user,room:snapshot?.room||room,role,members,onlineUserIds,memberAudio,connected,busy,commandPending,error:error||syncError||connectionError,
    queue:sharedQueue||[],current:sharedQueue?.find(item=>item.id===sharedTrackId)||null,
    playing:sharedPlaying,audioStatus,uploads,createRoom,joinRoom,leaveRoom,addSong,playSong,toggle,next,previous,seek,resync,setScrubbing,removeSong,moveSong,cancelUpload,canControl:Boolean(snapshot&&canControlRoom(snapshot.room,user?.id)),controlMode:snapshot?.room.controlMode||'host',setControlMode,addYouTube,promptYouTube,youtubePlayback:snapshot?.playback||null,serverClockOffset:clockOffsetRef.current,reportYouTube:reportAudio,youtubeEnded}),
    [user,room,role,members,onlineUserIds,memberAudio,connected,busy,commandPending,error,syncError,connectionError,sharedQueue,sharedTrackId,sharedPlaying,audioStatus,uploads,createRoom,joinRoom,leaveRoom,addSong,playSong,toggle,next,previous,seek,resync,setScrubbing,removeSong,moveSong,cancelUpload,snapshot,setControlMode,addYouTube,promptYouTube,reportAudio,youtubeEnded]);
  const [store]=useState<RoomStore>(()=>({value,listeners:new Set()}));
  useLayoutEffect(()=>{store.value=value;store.listeners.forEach(listener=>listener());},[value,store]);
  return <RoomStoreContext.Provider value={store}><FriendsContext.Provider value={value}>{children}<RoomSongChoiceSheet track={songChoice&&!songChoice.controller.signal.aborted?songChoice.track:null} host={songChoice?.host??false} onClose={closeSongChoice} onChoose={chooseSong}/></FriendsContext.Provider></RoomStoreContext.Provider>;
}
export function useFriendsListening(){const value=useContext(FriendsContext);if(!value)throw new Error('useFriendsListening requiere FriendsListeningProvider');return value;}

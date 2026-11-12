import { AppAlert as Alert } from '../services/appAlert';
import { useSceneActive } from '../hooks/useSceneActive';
import { createTrackPositionStore } from '../utils/trackPositionStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import Slider from '@react-native-community/slider';

import * as Clipboard from 'expo-clipboard';

import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { ActivityIndicator, BackHandler, Image, FlatList, Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { RoomYouTubePlayer } from '../components/RoomYouTubePlayer';

import { RoomYouTubePicker } from '../components/RoomYouTubePicker';

import { Artwork } from '../components/Artwork';

import { HeaderButton } from '../components/HeaderButton';

import { PanelBackdrop } from '../components/GlassSurface';

import { BottomSheet } from '../components/BottomSheet';
import { MotionModal } from '../components/MotionModal';

import { Screen } from '../components/Screen';

import { useRoomSelector } from '../providers/FriendsListeningProvider';

import { usePlaybackSelector, useQueue, useLibrary } from '../providers/WaveProvider';

import { fonts, radii, useTheme } from '../theme';

import type { RoomQueueItem, Track } from '../types';



type Icon=React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const run=(task:()=>Promise<unknown>)=>{void task().catch(()=>{});};

const time=(seconds:number)=>{const total=Math.max(0,Math.floor(seconds));return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');};

const audioLabel:Record<string,string>={idle:'Esperando canción',preparing:'Cargando audio',synced:'Audio sincronizado',error:'Error de audio',interrupted:'Audio interrumpido'};



export default function Friends(){

  const {colors}=useTheme(),friends=useRoomSelector(v=>({user:v.user,room:v.room,joinRoom:v.joinRoom,createRoom:v.createRoom,busy:v.busy,queue:v.queue}));

  const {code:invite}=useLocalSearchParams<{code?:string}>();

  const attemptedInvite=useRef('');

  const [name,setName]=useState('Mi sala'),[code,setCode]=useState(''),[picker,setPicker]=useState(false),[menu,setMenu]=useState(false);

  const renderSong=useCallback(({item,index}:{item:RoomQueueItem;index:number})=><QueueRow item={item} index={index}/>,[]);

  const closePicker=useCallback(()=>setPicker(false),[]);

  const back=useCallback(()=>{if(picker){setPicker(false);return;}if(menu){setMenu(false);return;}if(router.canGoBack())router.back();else router.replace('/(tabs)' as never);},[picker,menu]);

  useFocusEffect(useCallback(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{back();return true;});return()=>sub.remove();},[back]));

  const {user,room:activeRoom,joinRoom}=friends;

  useEffect(()=>{

    const invitation=typeof invite==='string'?invite.toUpperCase():'';

    if(activeRoom&&invitation){router.setParams({code:undefined});return;}

    if(!user||!/^[A-F0-9]{6}$/.test(invitation)||attemptedInvite.current===invitation)return;

    attemptedInvite.current=invitation;router.setParams({code:undefined});setCode(invitation);run(()=>joinRoom(invitation));

  },[invite,user,activeRoom,joinRoom]);

  if(!friends.user)return <Screen><Top onBack={back} onMenu={()=>setMenu(true)}/><Panel><MaterialCommunityIcons name="account-music-outline" size={46} color={colors.purple}/><Text style={[s.panelTitle,{color:colors.text}]}>Conecta tu cuenta</Text><Text style={[s.note,{color:colors.muted}]}>Invita a tus amigos y creen una cola con canciones de ambos dispositivos.</Text><Button label="Conectar mi cuenta" icon="account-arrow-right-outline" onPress={()=>router.push('/welcome' as never)}/></Panel></Screen>;

  if(!friends.room)return <Screen><Top onBack={back} onMenu={()=>setMenu(true)}/><Text style={[s.lead,{color:colors.muted}]}>Cada persona puede aportar canciones. Todos escuchan el mismo audio aunque no lo tengan en su biblioteca.</Text>

    <Panel><Text style={[s.panelTitle,{color:colors.text}]}>Crear una sala</Text><TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Nombre de la sala" placeholderTextColor={colors.muted} style={[s.input,{color:colors.text,borderColor:colors.border,backgroundColor:colors.surface3}]}/><Button label="Crear sala" icon="account-multiple-plus-outline" disabled={friends.busy||!name.trim()} onPress={()=>run(()=>friends.createRoom(name))}/></Panel>

    <Panel><Text style={[s.panelTitle,{color:colors.text}]}>Entrar con código</Text><TextInput value={code} onChangeText={value=>setCode(value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,6))} autoCapitalize="characters" maxLength={6} placeholder="CÓDIGO" placeholderTextColor={colors.muted} style={[s.input,s.codeInput,{color:colors.text,borderColor:colors.border,backgroundColor:colors.surface3}]}/><Button label="Entrar a la sala" icon="login-variant" disabled={friends.busy||code.length!==6} onPress={()=>run(()=>friends.joinRoom(code))}/></Panel>

    {friends.busy?<ActivityIndicator color={colors.purple}/>:null}<ErrorNote/>

  </Screen>;

  const header=<><Participants/><RoomPlayer/><ErrorNote/><View style={s.sectionRow}><Text style={[s.section,{color:colors.text}]}>Cola compartida · {friends.queue.length}</Text><Text style={[s.small,{color:colors.muted}]}>Lo siguiente que escucharán</Text></View><Uploads/></>;

  return <Screen scroll={false}><Top onBack={back} onMenu={()=>setMenu(true)}/><FlatList data={friends.queue} keyExtractor={item=>item.id} renderItem={renderSong}

    ListHeaderComponent={header} ListEmptyComponent={<Text style={[s.empty,{color:colors.muted}]}>La sala está lista. Añadan su primera canción.</Text>}

    contentContainerStyle={{paddingBottom:22}} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} showsVerticalScrollIndicator={false}/>

    <View style={{paddingTop:10,paddingBottom:24}}><Button label="Añadir música" icon="music-note-plus" onPress={()=>setPicker(true)}/></View>

    <SongPicker visible={picker} onClose={closePicker}/><RoomMenu visible={menu} onClose={()=>setMenu(false)}/>

  </Screen>;

}

const Participants=memo(function Participants(){

  const value=useRoomSelector(v=>({members:v.members,online:v.onlineUserIds,audio:v.memberAudio,userId:v.user?.id})),{colors}=useTheme();

  return <View style={{flexDirection:'row',flexWrap:'wrap',gap:14,paddingVertical:14}}>{value.members.map(member=><View key={member.userId} style={{alignItems:'center',maxWidth:86,gap:5}}>

    <View style={{width:48,height:48,borderRadius:24,backgroundColor:colors.surface3,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:value.online.has(member.userId)?colors.success:colors.border}}>

    {member.avatarUrl?<Image source={{uri:member.avatarUrl}} style={{width:44,height:44,borderRadius:22}}/>:<Text style={[s.memberName,{color:colors.text}]}>{member.displayName.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()}</Text>}</View>

    <Text numberOfLines={1} style={[s.small,{color:colors.text}]}>{member.userId===value.userId?'Tú':member.displayName}</Text>

    <Text numberOfLines={1} style={[s.small,{color:colors.muted,fontSize:10}]}>{value.online.has(member.userId)?audioLabel[value.audio[member.userId]]||'Conectado':'Reconectando'}</Text>

  </View>)}</View>;

});

const Uploads=memo(function Uploads(){

  const value=useRoomSelector(v=>({uploads:v.uploads,cancel:v.cancelUpload,retry:v.addSong})),{colors}=useTheme();

  return <>{value.uploads.map(upload=><View key={upload.track.id} style={[s.upload,{backgroundColor:colors.surface2,borderColor:colors.border}]}><Text numberOfLines={1} style={[s.memberName,{color:colors.text}]}>{upload.track.title}</Text><Text style={[s.small,{color:upload.status==='error'?colors.danger:colors.muted}]}>{upload.status==='error'?upload.message:`Subiendo · ${Math.round(upload.progress*100)} %`}</Text><SmallButton icon={upload.status==='error'?'refresh':'close'} label={upload.status==='error'?'Reintentar':'Cancelar subida'} onPress={()=>upload.status==='error'?run(()=>value.retry(upload.track)):value.cancel()}/></View>)}</>;

});

function RoomMenu({visible,onClose}:{visible:boolean;onClose:()=>void}){

  const value=useRoomSelector(v=>({room:v.room,host:v.role==='host',mode:v.controlMode,setMode:v.setControlMode,resync:v.resync,leave:v.leaveRoom,busy:v.busy})),{colors}=useTheme();

  const room=value.room;if(!room)return null;

  const leave=()=>Alert.alert(value.host?'Finalizar sala':'Salir de la sala',value.host?'La sala finalizará para todos.':'Dejarás de escuchar esta sala.',[{text:'Cancelar',style:'cancel'},{text:value.host?'Finalizar':'Salir',style:'destructive',onPress:()=>{onClose();run(value.leave);}}]);

  return <BottomSheet visible={visible} onClose={onClose} title="Tu sala">
    <Text selectable style={[s.codeText,{color:colors.text}]}>Código · {room.inviteCode}</Text>

    <MenuAction label="Copiar código" icon="content-copy" onPress={()=>run(()=>Clipboard.setStringAsync(room.inviteCode))}/>

    <MenuAction label="Invitar a un amigo" icon="share-variant" onPress={()=>run(()=>Share.share({message:`Escuchemos música en WavePlay: waveplay:///friends?code=${room.inviteCode}\nCódigo: ${room.inviteCode}`}))}/>

    {value.host?<View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={[s.memberName,{color:colors.text,flex:1}]}>Controles colaborativos</Text><Switch accessibilityLabel="Controles colaborativos" value={value.mode==='collaborative'} onValueChange={enabled=>run(()=>value.setMode(enabled?'collaborative':'host'))}/></View>:null}

    <MenuAction label="Volver a sincronizar" icon="sync" onPress={()=>{onClose();run(value.resync);}}/>

    <Pressable disabled={value.busy} onPress={leave} style={s.leave}><MaterialCommunityIcons name="exit-to-app" size={20} color={colors.danger}/><Text style={[s.actionText,{color:colors.danger}]}>{value.host?'Finalizar sala':'Salir de la sala'}</Text></Pressable>

  </BottomSheet>;

}



function RoomPlayer(){

  const friends=useRoomSelector(v=>({current:v.current,playing:v.playing,commandPending:v.commandPending,audioStatus:v.audioStatus,canControl:v.canControl,queue:v.queue,seek:v.seek,previous:v.previous,toggle:v.toggle,next:v.next,resync:v.resync,setScrubbing:v.setScrubbing})),wave=useQueue(),{colors}=useTheme();

  const item=friends.current,isHost=friends.canControl;
  const [youtubeClock]=useState(createTrackPositionStore);
  const itemId=item?.id||null;
  useEffect(()=>youtubeClock.setTrack(itemId),[itemId,youtubeClock]);
  const receivePosition=useCallback((seconds:number)=>{if(itemId)youtubeClock.update(itemId,seconds);},[itemId,youtubeClock]);

  const local=wave.current?.id==='room:'+item?.id;

  const status=friends.commandPending?'Actualizando la sala…':friends.audioStatus==='interrupted'?'Audio pausado en este dispositivo':friends.audioStatus==='preparing'?'Preparando audio…':friends.audioStatus==='error'?'No se pudo cargar el audio':friends.playing?'Escuchando juntos':'En pausa';

  return <Panel><Text style={[s.kicker,{color:colors.pink}]}>{item?status:'TU SALA, SU MÚSICA'}</Text>{item?.source==='youtube'?<RoomYouTubePlayer onPosition={receivePosition}/>:<View style={{marginTop:14}}><Artwork uri={local?wave.current?.artwork:null} size={130}/></View>}

    <Text numberOfLines={2} style={[s.nowTitle,{color:colors.text}]}>{item?.title||'Añadan una canción para comenzar'}</Text><Text style={[s.note,{color:colors.muted}]}>{item?.artist||'Ambos pueden aportar canciones a la cola'}</Text>

    {item?<><Text style={[s.small,{color:colors.pink,marginTop:8}]}>Añadida por {item.addedByName}</Text><RoomTimeline key={item.id} clock={youtubeClock}/></>:null}

    {friends.audioStatus==='interrupted'&&item?.source!=='youtube'?<Button label="Reanudar en este dispositivo" icon="play" onPress={()=>run(friends.resync)}/>:null}

    {isHost?<View style={s.controls}><Round icon="skip-previous" label="Anterior" disabled={!item||friends.commandPending} onPress={()=>run(friends.previous)}/><Round icon={friends.playing?'pause':'play'} label={friends.playing?'Pausar':'Reproducir'} main disabled={friends.commandPending||!friends.queue.some(song=>song.status==='ready')} onPress={()=>run(friends.toggle)}/><Round icon="skip-next" label="Siguiente" disabled={!item||friends.commandPending} onPress={()=>run(friends.next)}/></View>:<Text style={[s.guestNote,{color:colors.pink}]}>Añade canciones locales o de YouTube. El anfitrión controla la reproducción.</Text>}

  </Panel>;

}

function RoomTimeline({clock}:{clock:ReturnType<typeof createTrackPositionStore>}){
 const friends=useRoomSelector(v=>({current:v.current,canControl:v.canControl,audioStatus:v.audioStatus,seek:v.seek,setScrubbing:v.setScrubbing}));
 const {current}=useQueue(),active=useSceneActive(),{colors}=useTheme(),item=friends.current;
 const itemId=item?.id||'',youtube=item?.source==='youtube',local=current?.id==='room:'+itemId;
 const localPosition=usePlaybackSelector(value=>value.position,active&&local&&!youtube);
 const subscribe=useCallback((listener:()=>void)=>active&&youtube?clock.subscribe(listener):()=>{},[active,youtube,clock]);
 const snapshot=useCallback(()=>clock.getPosition(itemId),[clock,itemId]);
 const youtubePosition=useSyncExternalStore(subscribe,snapshot,snapshot);
 const [scrub,setScrub]=useState<number|null>(null),[pending,setPending]=useState<number|null>(null);
 const [dragStart,setDragStart]=useState(0);const lastLabel=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const {setScrubbing}=friends;
 useEffect(()=>()=>{setScrubbing(false);if(timer.current)clearTimeout(timer.current);},[setScrubbing]);
 const actual=youtube?youtubePosition:local?localPosition:0,position=scrub??pending??actual,duration=item?.duration||0;
 return <><Slider style={{alignSelf:'stretch',height:40,marginTop:8}} disabled={!friends.canControl||friends.audioStatus!=='synced'||!duration} minimumValue={0} maximumValue={duration||1} value={scrub===null?position:dragStart} minimumTrackTintColor={colors.pink} maximumTrackTintColor={colors.border} thumbTintColor={colors.pink} onSlidingStart={()=>{setDragStart(position);setScrubbing(true);setScrub(position);}} onValueChange={value=>{const now=Date.now();if(now-lastLabel.current>=60){lastLabel.current=now;setScrub(value);}}} onSlidingComplete={value=>{setScrubbing(false);setScrub(null);setPending(value);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setPending(null),1200);run(()=>friends.seek(value));}}/><View style={s.times}><Text style={[s.small,{color:colors.muted}]}>{time(position)}</Text><Text style={[s.small,{color:colors.muted}]}>{time(duration)}</Text></View></>;
}

const QueueRow=memo(function QueueRow({item,index}:{item:RoomQueueItem;index:number}){

  const friends=useRoomSelector(v=>({canControl:v.canControl,active:v.current?.id===item.id,userId:v.user?.id,playing:v.current?.id===item.id&&v.playing,length:v.queue.length,playSong:v.playSong,moveSong:v.moveSong,removeSong:v.removeSong})),{colors}=useTheme(),host=friends.canControl,active=friends.active;

  const canRemove=(host||friends.userId===item.addedBy)&&!active;

  return <View style={[s.queueRow,{borderColor:active?colors.pink:colors.border,backgroundColor:colors.surface2}]}><Pressable accessibilityRole="button" accessibilityLabel={`Reproducir ${item.title}`} disabled={!host||item.status!=='ready'} onPress={()=>run(()=>friends.playSong(item.id))} style={s.queueBody}><MaterialCommunityIcons name={active?'equalizer':item.status==='ready'?(item.source==='youtube'?'youtube':'music-note'):'cloud-upload-outline'} size={25} color={active?colors.pink:colors.purple}/><View style={{flex:1}}><Text numberOfLines={1} style={[s.memberName,{color:colors.text}]}>{item.title}</Text><Text numberOfLines={1} style={[s.small,{color:colors.muted}]}>{item.artist} · {time(item.duration)}{item.source==='youtube'?' · YouTube':''}</Text><Text numberOfLines={1} style={[s.small,{color:colors.pink}]}>{item.addedByName} · {item.status==='ready'?(active?(friends.playing?'Sonando':'En pausa'):'Disponible'):item.status==='uploading'?'Subiendo…':'Error al subir'}</Text></View></Pressable>

    {host?<View><SmallButton icon="chevron-up" label="Subir canción" disabled={index===0} onPress={()=>run(()=>friends.moveSong(item.id,-1))}/><SmallButton icon="chevron-down" label="Bajar canción" disabled={index===friends.length-1} onPress={()=>run(()=>friends.moveSong(item.id,1))}/></View>:null}

    {canRemove?<SmallButton icon="close" label="Quitar canción" onPress={()=>Alert.alert('Quitar canción',item.title,[{text:'Cancelar',style:'cancel'},{text:'Quitar',style:'destructive',onPress:()=>run(()=>friends.removeSong(item.id))}])}/>:null}

  </View>;

});

function SongPicker({visible,onClose}:{visible:boolean;onClose:()=>void}){

  const wave=useLibrary(),{addSong}=useRoomSelector(v=>({addSong:v.addSong})),{colors}=useTheme();

  const [query,setQuery]=useState(''),[source,setSource]=useState<'file'|'youtube'>('file'),deferred=useDeferredValue(query);

  const tracks=useMemo(()=>{if(source==='youtube')return [];const term=deferred.trim().toLocaleLowerCase();return wave.tracks.filter(track=>!track.missing&&(!term||(track.title+' '+track.artist).toLocaleLowerCase().includes(term)));},[wave.tracks,deferred,source]);

  const add=useCallback((track:Track)=>{onClose();run(()=>addSong(track));},[addSong,onClose]);

  const render=useCallback(({item}:{item:Track})=><PickerRow track={item} onAdd={add}/>,[add]);

  return <MotionModal visible={visible} onRequestClose={onClose} animationType="none"><Screen scroll={false}><View style={s.top}><HeaderButton icon="chevron-left" label="Cerrar selector" onPress={onClose}/><Text style={[s.title,{color:colors.text}]}>Añadir a la sala</Text></View><View style={{flexDirection:'row',gap:12}}>{(['file','youtube'] as const).map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:source===value}} onPress={()=>setSource(value)} style={{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',backgroundColor:source===value?colors.purpleStrong:colors.surface2,borderRadius:12}}><Text style={{color:source===value?'#fff':colors.text,fontFamily:fonts.bold}}>{value==='file'?'Dispositivo':'YouTube'}</Text></Pressable>)}</View>{source==='youtube'?(visible?<RoomYouTubePicker onClose={onClose}/>:null):<><Text style={[s.note,{color:colors.muted}]}>La canción se compartirá temporalmente con los participantes.</Text><TextInput accessibilityLabel="Buscar canciones" value={query} onChangeText={setQuery} placeholder="Buscar canción o artista" placeholderTextColor={colors.muted} style={[s.input,{color:colors.text,backgroundColor:colors.surface2,borderColor:colors.border,marginBottom:12}]}/>

    <FlatList data={tracks} keyExtractor={item=>item.id} renderItem={render} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} getItemLayout={(_data,index)=>({length:72,offset:72*index,index})} ListEmptyComponent={<Text style={[s.empty,{color:colors.muted}]}>No hay canciones disponibles. Actualiza tu biblioteca.</Text>}/></>}

  </Screen></MotionModal>;

}

const PickerRow=memo(function PickerRow({track,onAdd}:{track:Track;onAdd:(track:Track)=>void}){

  const {colors}=useTheme();return <Pressable accessibilityRole="button" accessibilityLabel={`Añadir ${track.title}`} onPress={()=>onAdd(track)} style={s.pickerRow}><Artwork uri={track.artwork} size={46}/><View style={{flex:1}}><Text numberOfLines={1} style={[s.memberName,{color:colors.text}]}>{track.title}</Text><Text numberOfLines={1} style={[s.small,{color:colors.muted}]}>{track.artist} · {time(track.duration)}</Text></View><MaterialCommunityIcons name="plus-circle-outline" size={27} color={colors.pink}/></Pressable>;

});

function ErrorNote(){const friends=useRoomSelector(v=>({error:v.error})),{colors}=useTheme();return friends.error?<Text accessibilityRole="alert" style={[s.error,{color:colors.danger}]}>{friends.error}</Text>:null;}

function Panel({children}:{children:React.ReactNode}){const {colors}=useTheme();return <View style={[s.panel,{backgroundColor:colors.surface2,borderColor:colors.border}]}><PanelBackdrop/>{children}</View>;}

function Top({onBack,onMenu}:{onBack:()=>void;onMenu:()=>void}){const {colors}=useTheme(),value=useRoomSelector(v=>({name:v.room?.name,connected:v.connected,room:Boolean(v.room)}));return <View style={s.top}><HeaderButton icon="chevron-left" label="Volver" onPress={onBack}/><View style={{flex:1}}><Text numberOfLines={1} style={[s.title,{color:colors.text}]}>{value.name||'Escuchar con amigos'}</Text><Text style={[s.small,{color:value.connected?colors.success:colors.muted}]}>{value.room?(value.connected?'Escuchando juntos':'Reconectando…'):'Una sala, su música'}</Text></View>{value.room?<HeaderButton icon="dots-horizontal" label="Opciones de la sala" onPress={onMenu}/>:null}</View>;}

function MenuAction({label,icon,onPress}:{label:string;icon:Icon;onPress:()=>void}){const {colors}=useTheme();return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>({minHeight:54,flexDirection:'row',alignItems:'center',gap:12,opacity:pressed?.65:1,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border})}><MaterialCommunityIcons name={icon} size={22} color={colors.pink}/><Text style={[s.memberName,{color:colors.text}]}>{label}</Text></Pressable>;}
function Button({label,icon,onPress,disabled=false}:{label:string;icon:Icon;onPress:()=>void;disabled?:boolean}){const {colors}=useTheme();return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,{backgroundColor:colors.purpleStrong,opacity:disabled?.45:1}]}><MaterialCommunityIcons name={icon} size={20} color="#fff"/><Text style={s.buttonText}>{label}</Text></Pressable>;}

function Round({icon,label,onPress,main=false,disabled=false}:{icon:Icon;label:string;onPress:()=>void;main?:boolean;disabled?:boolean}){const {colors}=useTheme();return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed})=>[s.round,{backgroundColor:main?colors.purpleStrong:colors.surface3,borderColor:colors.border,opacity:disabled?.4:pressed?.65:1}]}><MaterialCommunityIcons name={icon} size={main?32:27} color={main?'#fff':colors.text}/></Pressable>;}

function SmallButton({icon,label,onPress,disabled=false}:{icon:Icon;label:string;onPress:()=>void;disabled?:boolean}){const {colors}=useTheme();return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={{width:42,minHeight:36,alignItems:'center',justifyContent:'center',opacity:disabled?.3:1}}><MaterialCommunityIcons name={icon} size={22} color={colors.purple}/></Pressable>;}

const s=StyleSheet.create({

  top:{height:68,flexDirection:'row',alignItems:'center',gap:12},title:{fontFamily:fonts.extraBold,fontSize:21},

  lead:{fontFamily:fonts.regular,fontSize:13,lineHeight:20,marginVertical:8},

  panel:{borderWidth:1,borderRadius:radii.xl,marginTop:14,padding:18,overflow:'hidden',alignItems:'center'},

  panelTitle:{fontFamily:fonts.bold,fontSize:17,marginTop:8,marginBottom:4},note:{fontFamily:fonts.regular,fontSize:12,lineHeight:18,textAlign:'center'},

  input:{alignSelf:'stretch',height:50,borderWidth:1,borderRadius:radii.lg,paddingHorizontal:14,fontFamily:fonts.semiBold,fontSize:14,marginTop:12},

  codeInput:{fontFamily:fonts.extraBold,fontSize:20,letterSpacing:6,textAlign:'center'},

  button:{minHeight:49,alignSelf:'stretch',borderRadius:radii.lg,marginTop:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9},

  buttonText:{fontFamily:fonts.bold,color:'#fff',fontSize:14},error:{fontFamily:fonts.semiBold,fontSize:12,textAlign:'center',marginTop:14,lineHeight:18},

  roomHead:{borderWidth:1,borderRadius:radii.xl,padding:16,overflow:'hidden',flexDirection:'row',alignItems:'center',gap:12},

  kicker:{fontFamily:fonts.bold,fontSize:10,letterSpacing:1},roomName:{fontFamily:fonts.extraBold,fontSize:21,marginTop:4},

  code:{borderWidth:1,borderRadius:radii.lg,paddingHorizontal:12,minHeight:46,flexDirection:'row',alignItems:'center',gap:7},

  codeText:{fontFamily:fonts.extraBold,fontSize:16,letterSpacing:2},section:{fontFamily:fonts.bold,fontSize:15},

  sectionRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:22,marginBottom:8},

  nowTitle:{fontFamily:fonts.extraBold,fontSize:20,textAlign:'center',marginTop:14},

  controls:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:22,marginTop:18},

  round:{width:55,height:55,borderRadius:28,borderWidth:1,alignItems:'center',justifyContent:'center'},

  guestNote:{fontFamily:fonts.semiBold,fontSize:12,marginTop:18,textAlign:'center',lineHeight:18},

  times:{flexDirection:'row',justifyContent:'space-between',alignSelf:'stretch'},

  members:{borderWidth:1,borderRadius:radii.xl,overflow:'hidden',paddingHorizontal:15},

  member:{minHeight:64,flexDirection:'row',alignItems:'center',gap:10},dot:{width:9,height:9,borderRadius:5},

  memberName:{fontFamily:fonts.semiBold,fontSize:13},small:{fontFamily:fonts.regular,fontSize:11,lineHeight:17},

  leave:{minHeight:56,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:20},

  textAction:{minHeight:40,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},

  actionText:{fontFamily:fonts.semiBold,fontSize:12},limit:{fontFamily:fonts.regular,fontSize:11,lineHeight:17,marginVertical:10},

  queueRow:{borderWidth:1,borderRadius:radii.lg,overflow:'hidden',flexDirection:'row',alignItems:'center',marginTop:8,paddingHorizontal:10,minHeight:86},

  queueBody:{flex:1,flexDirection:'row',alignItems:'center',gap:12,minHeight:84},

  pickerRow:{height:72,flexDirection:'row',alignItems:'center',gap:12},empty:{fontFamily:fonts.regular,fontSize:13,lineHeight:20,textAlign:'center',paddingVertical:26},

  upload:{borderWidth:1,borderRadius:radii.lg,padding:12,marginBottom:8},

});

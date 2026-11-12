import { AppAlert as Alert } from '../services/appAlert';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { useWaveActions } from '../providers/WaveProvider';
import { readPublicYouTubePlaylist } from '../services/youtube';
import { findImportedOnlinePlaylist, importOnlinePlaylist } from '../services/database';
import { openRoute } from '../services/navigation';
import { fonts, useTheme } from '../theme';

export function ImportOnlinePlaylist({compact=false}:{compact?:boolean}){
  const {colors}=useTheme(),{refresh}=useWaveActions();
  const [open,setOpen]=useState(false),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[count,setCount]=useState(0),[committing,setCommitting]=useState(false);
  const request=useRef<AbortController|null>(null),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current?.abort();};},[]);
  const close=()=>{if(committing)return;request.current?.abort();setOpen(false);};
  const run=async()=>{
    if(request.current)return;const controller=new AbortController();request.current=controller;setBusy(true);setCount(0);
    try{
      const result=await readPublicYouTubePlaylist(url,controller.signal,n=>{if(alive.current)setCount(n);});
      if(controller.signal.aborted||!alive.current)return;
      if(!result.videos.length)throw new Error('Esta playlist no contiene canciones disponibles.');
      const existing=await findImportedOnlinePlaylist(result.id);let mode='new';
      if(existing)mode=await new Promise<string>(resolve=>Alert.alert('Playlist ya importada',existing.name,[{text:'Cancelar',style:'cancel',onPress:()=>resolve('cancel')},{text:'Abrir',onPress:()=>resolve('open')},{text:'Añadir canciones nuevas',onPress:()=>resolve('append')}],{cancelable:true,onDismiss:()=>resolve('cancel')}));
      if(mode==='cancel'||controller.signal.aborted||!alive.current)return;
      setCommitting(true);const id=mode==='open'?existing!.id:await importOnlinePlaylist(result.name,result.videos,result.id,mode==='append');await refresh();
      if(alive.current){setOpen(false);setUrl('');openRoute({pathname:'/playlist/[id]',params:{id:String(id)}});}
    }catch(error){if(alive.current&&!controller.signal.aborted)Alert.alert('No se pudo importar',error instanceof Error?error.message:String(error));}
    finally{request.current=null;if(alive.current){setBusy(false);setCommitting(false);}}
  };
  return <><Pressable accessibilityLabel="Importar playlist pública de YouTube" onPress={()=>setOpen(true)} style={{minHeight:44,minWidth:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}}><MaterialCommunityIcons name="playlist-plus" size={21} color={colors.pink}/>{!compact?<Text style={{color:colors.text,fontFamily:fonts.semiBold}}>Importar desde enlace</Text>:null}</Pressable><BottomSheet visible={open} onClose={close} title="Importar playlist"><TextInput accessibilityLabel="Enlace de la playlist pública" value={url} editable={!busy} onChangeText={setUrl} placeholder="Enlace de una playlist pública" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={{color:colors.text,backgroundColor:colors.surfaceHigh,borderRadius:12,padding:14,minHeight:50}}/><Pressable disabled={busy||!url.trim()} onPress={()=>void run()} style={{minHeight:54,justifyContent:'center'}}><Text style={{color:colors.pink,fontFamily:fonts.bold}}>{committing?'Guardando playlist…':busy?`Consultando ${count} canciones…`:'Importar'}</Text></Pressable>{busy&&!committing?<Pressable onPress={close} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:colors.muted}}>Cancelar</Text></Pressable>:null}</BottomSheet></>;
}

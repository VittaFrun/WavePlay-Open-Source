import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotionModal } from './MotionModal';
import { HeaderButton } from './HeaderButton';
import { fonts, useTheme } from '../theme';
import { lyricsSearchUrl } from '../utils/lyricsSearch';
import { looksLikeLyricsText } from '../utils/clipboardLyrics';
import type { Track } from '../types';

export function LyricsSearch({visible,track,onClose,onEdit,onImport}:{visible:boolean;track:Track;onClose:()=>void;onEdit:()=>void;onImport:(text:string)=>void}) {
  return <MotionModal visible={visible} onRequestClose={onClose}>{visible?<SearchBody track={track} onClose={onClose} onEdit={onEdit} onImport={onImport}/>:null}</MotionModal>;
}
function SearchBody({track,onClose,onEdit,onImport}:{track:Track;onClose:()=>void;onEdit:()=>void;onImport:(text:string)=>void}) {
  const {colors}=useTheme();const web=useRef<WebView>(null);
  const [megalobiz,setMegalobiz]=useState(false);const [canGoBack,setCanGoBack]=useState(false);
  const [failed,setFailed]=useState(false);const [loading,setLoading]=useState(false);const [host,setHost]=useState('google.com');
  const [copied,setCopied]=useState('');
  const lastClipboard=useRef('');
  useEffect(()=>{
    let active=true;
    void Clipboard.getStringAsync().then(text=>{if(active)lastClipboard.current=text}).catch(()=>{});
    const check=()=>{void Clipboard.getStringAsync().then(text=>{
      if(!active||!text||text===lastClipboard.current)return;
      lastClipboard.current=text;
      if(looksLikeLyricsText(text))setCopied(text);
    }).catch(()=>{});};
    const clipboard=Clipboard.addClipboardListener(check);
    const appState=AppState.addEventListener('change',state=>{if(state==='active')check()});
    return()=>{active=false;clipboard.remove();appState.remove();};
  },[]);
  const url=lyricsSearchUrl(track,megalobiz);
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
      <View style={s.header}><HeaderButton icon="close" label="Cerrar búsqueda web" onPress={onClose}/><View style={{flex:1}}><Text style={[s.title,{color:colors.text}]}>Buscar LRC</Text><Text numberOfLines={1} style={[s.subtitle,{color:colors.muted}]}>{track.title}</Text></View><HeaderButton icon="clipboard-edit-outline" label="Volver al editor de letras" onPress={onEdit}/></View>
      <View style={s.sources}>{[false,true].map(option=><Pressable key={String(option)} accessibilityRole="button" accessibilityState={{selected:megalobiz===option}} onPress={()=>{setFailed(false);setMegalobiz(option)}} style={[s.source,{backgroundColor:megalobiz===option?colors.accentSoft:colors.surface2}]}><Text style={[s.sourceText,{color:megalobiz===option?colors.purple:colors.muted}]}>{option?'Megalobiz':'Google'}</Text></Pressable>)}</View>
      <View style={{flex:1}}>{<WebView key={String(megalobiz)} ref={web} source={{uri:url}} style={{flex:1}} originWhitelist={['*']} setSupportMultipleWindows={false} allowFileAccess={false} mixedContentMode="never" onShouldStartLoadWithRequest={request=>request.url==='about:blank'||request.url.startsWith('https://')} onLoadStart={()=>{setLoading(true);setFailed(false)}} onLoadEnd={()=>setLoading(false)} onError={()=>{setFailed(true);setLoading(false)}} onHttpError={event=>{if(event.nativeEvent.statusCode>=400&&event.nativeEvent.url===url){setFailed(true);setLoading(false)}}} onNavigationStateChange={state=>{setCanGoBack(state.canGoBack);try{setHost(new URL(state.url).hostname)}catch{setHost('')}}}/>}
        {failed?<View style={[s.error,{backgroundColor:colors.background}]}><MaterialCommunityIcons name="wifi-off" size={32} color={colors.muted}/><Text style={[s.title,{color:colors.text}]}>No se pudo abrir la página</Text><Pressable onPress={()=>{setFailed(false);web.current?.reload()}} style={[s.retry,{backgroundColor:colors.accentSoft}]}><MaterialCommunityIcons name="reload" size={20} color={colors.purple}/><Text style={[s.sourceText,{color:colors.purple}]}>Reintentar</Text></Pressable></View>:null}
      </View>
      {copied?<View style={{marginHorizontal:14,marginBottom:8,padding:12,borderRadius:14,backgroundColor:colors.accentSoft,borderWidth:1,borderColor:colors.accentBorder,flexDirection:'row',alignItems:'center',gap:10}}><MaterialCommunityIcons name="content-copy" size={20} color={colors.pink}/><Text style={{flex:1,fontFamily:fonts.semiBold,fontSize:11,color:colors.text}}>Detecté letras copiadas</Text><Pressable accessibilityRole="button" onPress={()=>{onImport(copied);setCopied('')}} style={{minHeight:40,justifyContent:'center',paddingHorizontal:10,borderRadius:9,backgroundColor:colors.pink}}><Text style={{fontFamily:fonts.bold,fontSize:11,color:colors.background}}>Agregar</Text></Pressable></View>:null}
      <View style={[s.toolbar,{borderTopColor:colors.border}]}><HeaderButton icon="arrow-left" label="Página anterior" disabled={!canGoBack} onPress={()=>web.current?.goBack()}/><Text numberOfLines={1} style={[s.domain,{color:colors.muted}]}>{host}</Text>{loading?<ActivityIndicator color={colors.purple} style={{width:44}}/>:<HeaderButton icon="reload" label="Recargar página" onPress={()=>{setFailed(false);web.current?.reload()}}/>}</View>
    </SafeAreaView>;
}
const s=StyleSheet.create({header:{minHeight:64,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:12},title:{fontFamily:fonts.bold,fontSize:16},subtitle:{fontFamily:fonts.regular,fontSize:11,marginTop:3},sources:{flexDirection:'row',gap:8,paddingHorizontal:16,paddingBottom:12},source:{minHeight:40,paddingHorizontal:18,justifyContent:'center',borderRadius:8},sourceText:{fontFamily:fonts.bold,fontSize:12},toolbar:{minHeight:58,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:StyleSheet.hairlineWidth},domain:{fontFamily:fonts.regular,fontSize:11,flex:1,textAlign:'center'},error:{position:'absolute',top:0,bottom:0,left:0,right:0,alignItems:'center',justifyContent:'center',gap:18,padding:24},retry:{minHeight:44,paddingHorizontal:18,borderRadius:8,flexDirection:'row',gap:8,alignItems:'center'}});

import { commandSoloYouTube } from '../services/soloYouTube';
import { useRoomSelector } from '../providers/FriendsListeningProvider';
import { useWaveActions } from '../providers/WaveProvider';
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { HeaderButton } from '../components/HeaderButton';
import { fonts, useTheme } from '../theme';

// The official watch page is a separate fallback, without extracting streams
// or trying to control it using the embedded player's transport commands.
export default function YouTubeWatch(){
 const {id}=useLocalSearchParams<{id?:string}>(),{colors}=useTheme();
 const [loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 const focused=useIsFocused(),room=useRoomSelector(value=>value.room),{pauseSharedPlayback}=useWaveActions();
 useFocusEffect(useCallback(()=>{if(!room){commandSoloYouTube(false);pauseSharedPlayback();}},[room,pauseSharedPlayback]));
 const videoId=typeof id==='string'&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:'';
 const url='https://m.youtube.com/watch?v='+videoId;
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
 <View style={{paddingHorizontal:16,minHeight:60,flexDirection:'row',alignItems:'center',gap:12}}><HeaderButton icon="arrow-left" label="Volver al reproductor" onPress={()=>router.canGoBack()?router.back():router.replace('/online-player')}/><Text style={{flex:1,color:colors.text,fontFamily:fonts.bold}}>YouTube</Text><HeaderButton icon="open-in-new" label="Abrir YouTube externo" onPress={()=>void Linking.openURL(url).catch(()=>setFailed(true))}/></View>
 {focused&&!room&&videoId&&!failed?<WebView source={{uri:url}} style={{flex:1}} javaScriptEnabled domStorageEnabled allowsFullscreenVideo mediaPlaybackRequiresUserAction setSupportMultipleWindows={false} onLoadStart={()=>setLoading(true)} onLoadEnd={()=>setLoading(false)} onError={()=>{setLoading(false);setFailed(true);}} onRenderProcessGone={()=>{setLoading(false);setFailed(true);}}/>:null}
 {room?<Text style={{color:colors.muted,padding:16}}>Vuelve a la sala para continuar escuchando juntos.</Text>:null}
 {focused&&!room&&loading&&videoId?<ActivityIndicator accessibilityLabel="Cargando YouTube" color={colors.pink} style={{position:'absolute',top:80,alignSelf:'center'}}/>:null}
 {failed||!videoId?<Text accessibilityRole="alert" style={{color:colors.danger,padding:16}}>No se pudo abrir esta página. Puedes intentar abrirla con el botón de YouTube externo.</Text>:null}
 </SafeAreaView>;
}

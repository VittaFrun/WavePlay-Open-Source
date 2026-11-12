import { AppAlert as Alert } from '../services/appAlert';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { HeaderButton } from '../components/HeaderButton';
import { Screen } from '../components/Screen';
import { WaveChip } from '../components/WaveChip';
import { useScan, useWaveActions } from '../providers/WaveProvider';
import { useRoomSelector } from '../providers/FriendsListeningProvider';
import { canOrganizeFiles, finishOrganization, getOrganization, pauseOrganization, prepareOrganization, restoreOrganization, runOrganization, subscribeOrganization } from '../services/fileOrganization';
import type { OrganizationGrouping } from '../utils/fileOrganization';
import { fonts, useTheme } from '../theme';

export default function OrganizeFiles(){
  const {colors}=useTheme(),state=useSyncExternalStore(subscribeOrganization,getOrganization,getOrganization),actions=useWaveActions(),{scanning}=useScan(),inRoom=useRoomSelector(value=>Boolean(value.room));
  const [folder,setFolder]=useState('WavePlay'),[grouping,setGrouping]=useState<OrganizationGrouping>('flat');
  useEffect(()=>{if(canOrganizeFiles)void restoreOrganization().catch(error=>Alert.alert('No se pudo recuperar la revisión',error.message));},[]);
  const counts=useMemo(()=>{const rows=state.job?.rows||[];return {total:rows.length,pending:rows.filter(r=>['pending','moving','moved'].includes(r.status)).length,done:rows.filter(r=>r.status==='indexed').length,skipped:rows.filter(r=>r.status==='skipped').length,errors:rows.filter(r=>r.status==='error').length};},[state.job]);
  const busy=state.running||state.preparing;
  const preview=async()=>{try{await prepareOrganization(folder,grouping);}catch(error){Alert.alert('No se pudo preparar',error instanceof Error?error.message:String(error));}};
  const start=()=>Alert.alert(state.paused?'Continuar organización':'Organizar archivos',`Se moverán ${counts.pending} archivos. Se conservarán tus playlists y favoritos. Los archivos ya movidos mantendrán su nueva ubicación si pausas el proceso.`,[{text:'Cancelar',style:'cancel'},{text:'Continuar',onPress:()=>{actions.pauseSharedPlayback();void runOrganization().then(()=>actions.refresh()).catch(error=>Alert.alert('No se pudo organizar',error.message));}}]);
  const finish=()=>void finishOrganization().then(()=>actions.refresh()).catch(error=>Alert.alert('Revisión pendiente',error.message));
  const button=(label:string,onPress:()=>void,disabled=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{minHeight:48,paddingHorizontal:16,justifyContent:'center',alignItems:'center',borderRadius:16,backgroundColor:colors.accentSoft,opacity:disabled?.45:1,marginTop:10}}><Text style={{color:colors.pink,fontFamily:fonts.bold}}>{label}</Text></Pressable>;
  return <Screen scroll={false}><View style={{flexDirection:'row',alignItems:'center',gap:12,marginBottom:14}}><HeaderButton icon="arrow-left" label="Volver" onPress={()=>router.back()}/><Text style={{color:colors.text,fontFamily:fonts.bold,fontSize:23}}>Organizar archivos</Text></View>
    <FlatList data={state.job?.rows||[]} keyExtractor={row=>row.assetId} initialNumToRender={10} maxToRenderPerBatch={8} windowSize={5} contentContainerStyle={{paddingBottom:180}} ListHeaderComponent={<>
      {!canOrganizeFiles?<Text style={{color:colors.muted,lineHeight:20}}>Esta función no está disponible en esta versión o dispositivo.</Text>:null}
      {!state.job?<><Text style={{color:colors.muted,lineHeight:20}}>Mueve las canciones de tu biblioteca a una misma carpeta del teléfono. Primero revisa la lista y después confirma.</Text><Text style={{color:colors.text,fontFamily:fonts.semiBold,marginTop:20}}>Carpeta de destino en Música</Text><TextInput accessibilityLabel="Nombre de carpeta de destino" editable={!busy} value={folder} onChangeText={setFolder} maxLength={65} style={{backgroundColor:colors.surfaceHigh,color:colors.text,padding:14,borderRadius:12,marginTop:8}}/><View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12}}>{([['flat','Una carpeta'],['artist','Por artista'],['album','Artista y álbum']] as const).map(([value,label])=><WaveChip key={value} label={label} selected={grouping===value} onPress={()=>{if(!busy)setGrouping(value);}}/>)}</View>{button(state.preparing?'Preparando…':'Revisar canciones',()=>void preview(),!canOrganizeFiles||busy||scanning||inRoom)}</>:<>
        <Text style={{color:colors.text,fontFamily:fonts.bold,fontSize:18}}>Revisión de {counts.total} archivos</Text><Text style={{color:colors.muted,lineHeight:20,marginTop:8}}>{counts.done} organizados · {counts.pending} pendientes{counts.skipped?` · ${counts.skipped} ya estaban en su carpeta`:''}{counts.errors?` · ${counts.errors} no disponibles`:''}</Text>
        {state.running?button('Pausar al terminar este archivo',pauseOrganization):counts.pending?button(state.paused?'Continuar':'Organizar archivos',start,busy||scanning||inRoom):null}
        {!busy?button(counts.pending?'Finalizar sin mover los pendientes':'Finalizar',finish):null}
      </>}
      {scanning||inRoom?<Text style={{color:colors.muted,lineHeight:20,marginTop:12}}>{inRoom?'Sal de la sala antes de organizar los archivos.':'Espera a que termine el escaneo.'}</Text>:null}
      {state.error?<Text style={{color:colors.danger,lineHeight:20,marginTop:12}}>{state.error}</Text>:null}
      {state.job?<Text style={{color:colors.muted,fontFamily:fonts.semiBold,marginTop:22,marginBottom:8}}>Archivos de esta revisión</Text>:null}
    </>} renderItem={({item})=><View style={{paddingVertical:12,borderBottomWidth:.5,borderBottomColor:colors.border}}><Text numberOfLines={1} style={{color:colors.text,fontFamily:fonts.semiBold,fontSize:13}}>{item.fileName}</Text><Text numberOfLines={2} style={{color:colors.muted,fontSize:11,lineHeight:17,marginTop:4}}>{item.error||`${item.status==='indexed'?'Organizado':item.status==='skipped'?'Sin cambios':'Destino'}: ${item.destination||item.folder}${item.targetName||item.fileName}`}</Text></View>}/>
  </Screen>;
}

import { AppAlert as Alert } from '../services/appAlert';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRoomSelector } from '../providers/FriendsListeningProvider';
import { HeaderButton } from '../components/HeaderButton';
import { PanelBackdrop } from '../components/GlassSurface';
import { Screen } from '../components/Screen';
import { useLibrary, useWaveActions, useScan } from '../providers/WaveProvider';
import { useAppearance } from '../providers/AppearanceProvider';
import { signOutAccount } from '../services/account';
import { applyLocalBackup, chooseLocalBackup, createLocalBackup, saveLocalBackupToDevice } from '../services/backup';
import { fonts, radii, useTheme } from '../theme';
import { normalizeAppearance } from '../utils/appearance';
import type { WaveBackup } from '../utils/backup';

export default function AccountBackup(){
  const {colors}=useTheme(),wave={...useLibrary(),...useWaveActions(),...useScan()},appearance=useAppearance();
  const user=useRoomSelector(value=>value.user), pending=useRef(false);
  const [busy,setBusy]=useState(false),[backup,setBackup]=useState<WaveBackup|null>(null),[message,setMessage]=useState('');
  const perform=async(task:()=>Promise<void>)=>{if(pending.current)return;pending.current=true;setBusy(true);setMessage('');try{await task();}catch(error){Alert.alert('Cuenta y respaldo local',error instanceof Error?error.message:'No se pudo completar la operación.')}finally{pending.current=false;setBusy(false)}};
  const restore=(mode:'merge'|'replace')=>{if(!backup)return;Alert.alert(mode==='replace'?'Reemplazar organización':'Fusionar respaldo',mode==='replace'?'Se reemplazarán playlists, favoritos e historial actuales. No se borrará ningún archivo de música.':'Se añadirán playlists y datos del respaldo sin borrar tus canciones ni playlists actuales.',[{text:'Cancelar',style:'cancel'},{text:'Continuar',style:mode==='replace'?'destructive':'default',onPress:()=>void perform(async()=>{const result=await applyLocalBackup(backup,mode);if(backup.settings['waveplay.appearance.v1'])try{await appearance.save(normalizeAppearance(JSON.parse(backup.settings['waveplay.appearance.v1'])));}catch{/* Other restored data remains valid. */}await wave.refresh();setBackup(null);setMessage(`${result.playlists} playlists restauradas · ${result.matched} canciones vinculadas · ${result.missing} pendientes de escaneo.`);})}]);};
  return <Screen><View style={s.head}><HeaderButton icon="chevron-left" label="Volver" disabled={busy} onPress={()=>router.canGoBack()?router.back():router.replace('/(tabs)')}/><Text style={[s.title,{color:colors.text}]}>Cuenta y respaldo local</Text></View>
    <Text style={[s.note,{color:colors.muted}]}>Tu música sigue en el teléfono y WavePlay funciona sin cuenta. Los respaldos guardan playlists, favoritos y ajustes; no incluyen archivos de audio.</Text>
    <Text style={[s.section,{color:colors.text}]}>Cuenta opcional</Text>
    <View style={[s.panel,{backgroundColor:colors.surface2,borderColor:colors.border}]}>
      <PanelBackdrop/>
      {user?<><Text style={[s.label,{color:colors.text}]}>{user.email||'Cuenta conectada'}</Text><Action icon="logout" label="Cerrar sesión" disabled={busy} onPress={()=>void perform(async()=>{await signOutAccount();setMessage('Sesión cerrada. Tu biblioteca local permanece intacta.');})}/></>
      :<><Text style={[s.label,{color:colors.text}]}>Tu música, también con amigos</Text><Text style={[s.note,{color:colors.muted}]}>Conecta tu cuenta con Google o correo para escuchar juntos.</Text><Action icon="account-arrow-right-outline" label="Iniciar sesión o crear cuenta" disabled={busy} onPress={()=>router.push('/welcome' as never)}/></>}
    </View>
    <Text style={[s.section,{color:colors.text}]}>Respaldo local</Text>
    <View style={[s.panel,{backgroundColor:colors.surface2,borderColor:colors.border}]}>
      <PanelBackdrop/>
      <Action icon="content-save-outline" label="Guardar en el dispositivo" disabled={busy||!wave.ready} onPress={()=>void perform(async()=>{const saved=await saveLocalBackupToDevice();if(saved)setMessage(`${saved.fileName} guardado. Incluye ${saved.backup.playlists.length} playlists y ${saved.backup.tracks.length} canciones referenciadas.`);})}/>
      <Action icon="share-variant-outline" label="Compartir respaldo" disabled={busy||!wave.ready} onPress={()=>void perform(async()=>{const saved=await createLocalBackup();setMessage(`Respaldo preparado: ${saved.playlists.length} playlists y ${saved.tracks.length} canciones referenciadas.`);})}/>
      <Action icon="import" label="Seleccionar respaldo para restaurar" disabled={busy||!wave.ready||wave.scanning} onPress={()=>void perform(async()=>{const selected=await chooseLocalBackup();if(selected)setBackup(selected);})}/>
    </View>
    {backup?<View style={[s.panel,s.selectedBackup,{backgroundColor:colors.surface2,borderColor:colors.border}]}><PanelBackdrop/><Text style={[s.label,{color:colors.text}]}>Respaldo del {new Date(backup.createdAt).toLocaleDateString()}</Text><Text style={[s.note,{color:colors.muted}]}>{backup.playlists.length} playlists · {backup.tracks.length} canciones referenciadas · {backup.history.length} entradas del historial</Text><View style={s.buttons}><Action icon="playlist-plus" label="Fusionar" disabled={busy} onPress={()=>restore('merge')}/><Action icon="playlist-remove" label="Reemplazar" disabled={busy} onPress={()=>restore('replace')}/></View></View>:null}
    {busy?<ActivityIndicator style={{marginTop:20}} color={colors.purple}/>:null}
    {message?<Text style={[s.message,{color:colors.success}]}>{message}</Text>:null}
    <Text style={[s.caption,{color:colors.muted}]}>Al cambiar de teléfono, escanea primero la música y después restaura el respaldo. Las canciones sin coincidencia segura conservarán su lugar hasta un próximo escaneo.</Text>
  </Screen>;
}
function Action({icon,label,onPress,disabled}:{icon:any;label:string;onPress:()=>void;disabled:boolean}){const {colors}=useTheme();return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[s.action,{opacity:disabled?.45:1,borderTopColor:colors.border}]}><MaterialCommunityIcons name={icon} size={21} color={colors.purple}/><Text style={[s.actionText,{color:colors.text}]}>{label}</Text><MaterialCommunityIcons name="chevron-right" size={19} color={colors.muted}/></Pressable>}
const s=StyleSheet.create({head:{height:60,flexDirection:'row',alignItems:'center',gap:10},title:{fontFamily:fonts.extraBold,fontSize:23,flex:1},section:{fontFamily:fonts.bold,fontSize:16,marginTop:26,marginBottom:10},panel:{borderWidth:1,borderRadius:radii.lg,overflow:'hidden',paddingHorizontal:14,paddingTop:12},selectedBackup:{marginTop:18},label:{fontFamily:fonts.bold,fontSize:14,marginBottom:7},note:{fontFamily:fonts.regular,fontSize:12,lineHeight:19,marginVertical:6},caption:{fontFamily:fonts.regular,fontSize:11,lineHeight:17,marginTop:16},input:{height:48,borderWidth:1,borderRadius:radii.lg,paddingHorizontal:12,marginVertical:5,fontFamily:fonts.regular,fontSize:13},action:{minHeight:55,flexDirection:'row',alignItems:'center',gap:12,borderTopWidth:StyleSheet.hairlineWidth},actionText:{fontFamily:fonts.semiBold,fontSize:13,flex:1},preview:{paddingVertical:12,borderTopWidth:StyleSheet.hairlineWidth},buttons:{marginTop:8},message:{fontFamily:fonts.semiBold,fontSize:12,marginTop:18,lineHeight:19}});

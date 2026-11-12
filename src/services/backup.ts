import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { exportBackupData, restoreBackupData } from './database';
import { saveTrackLyrics } from './lyrics';
import { parseWaveBackup, type WaveBackup } from '../utils/backup';

const preferenceKeys = ['waveplay.appearance.v1','waveplay.reduceMotion','waveplay.player-presentation','waveplay.downloads.wifiOnly','waveplay.dj.less','waveplay.dj.settings','waveplay.youtube-presentation'];

export async function buildPortableBackup() {
  const data=await exportBackupData();
  const values=await AsyncStorage.multiGet(preferenceKeys);
  const settings=Object.fromEntries(values.filter((entry):entry is [string,string]=>entry[1]!==null));
  if(settings['waveplay.appearance.v1']) {
    try {const appearance=JSON.parse(settings['waveplay.appearance.v1']);appearance.imageUri=null;if(appearance.background==='custom')appearance.background='anime';settings['waveplay.appearance.v1']=JSON.stringify(appearance);}catch{delete settings['waveplay.appearance.v1'];}
  }
  const lyricRows=await AsyncStorage.multiGet(data.tracks.map(t=>`@waveplay/lyrics/${t.id}`));
  const lyrics=lyricRows.flatMap(([key,text])=>text?.trim()?[{trackId:key.slice('@waveplay/lyrics/'.length),text}]:[]);
  const backup:WaveBackup={format:'waveplay-backup',version:1,createdAt:Date.now(),...data,settings,lyrics};
  const payload=JSON.stringify(backup);
  if(payload.length>25_000_000)throw new Error('El respaldo supera 25 MB; reduce el historial antes de exportarlo.');
  const name=`WavePlay-${new Date(backup.createdAt).toISOString().slice(0,10)}-${backup.createdAt}`;
  return {backup,payload,name};
}

export async function createLocalBackup() {
  const {backup,payload,name}=await buildPortableBackup();
  const file=new File(Paths.cache,`${name}.json`);
  file.create();file.write(payload);
  if(!await Sharing.isAvailableAsync())throw new Error('No hay una aplicación disponible para guardar el respaldo.');
  await Sharing.shareAsync(file.uri,{mimeType:'application/json',dialogTitle:'Guardar respaldo WavePlay'});
  return backup;
}

export async function saveLocalBackupToDevice():Promise<{backup:WaveBackup;fileName:string}|null> {
  const permission=await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if(!permission.granted)return null;
  const {backup,payload,name}=await buildPortableBackup();
  const uri=await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri,name,'application/json');
  await FileSystem.writeAsStringAsync(uri,payload);
  if(await FileSystem.readAsStringAsync(uri)!==payload)throw new Error('No se pudo verificar el respaldo guardado.');
  return {backup,fileName:`${name}.json`};
}

export async function chooseLocalBackup():Promise<WaveBackup|null> {
  const picked=await DocumentPicker.getDocumentAsync({type:['application/json','text/plain','*/*'],copyToCacheDirectory:true});
  if(picked.canceled)return null;
  const asset=picked.assets[0];
  if(!asset||asset.size && asset.size>25_000_000)throw new Error('El respaldo supera 25 MB.');
  return parseWaveBackup(await new File(asset.uri).text());
}

export async function applyLocalBackup(backup:WaveBackup,mode:'merge'|'replace') {
  const summary=await restoreBackupData(backup,mode);
  for(const [key,value] of Object.entries(backup.settings))if(preferenceKeys.includes(key))await AsyncStorage.setItem(key,value);
  const map=new Map(summary.mappings.map(item=>[item.from,item.to]));
  for(const lyric of backup.lyrics){const target=map.get(lyric.trackId);if(target)await saveTrackLyrics(target,lyric.text);}
  return summary;
}

export async function reattachSavedLyrics(mappings:{from:string;to:string}[]) {
  for(const {from,to} of mappings){
    const oldKey=`@waveplay/lyrics/${from}`;
    const text=await AsyncStorage.getItem(oldKey);
    if(text&&!await AsyncStorage.getItem(`@waveplay/lyrics/${to}`))await saveTrackLyrics(to,text);
    if(text)await AsyncStorage.removeItem(oldKey);
  }
}

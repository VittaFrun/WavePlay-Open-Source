import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { parseMuzio, type MuzioEntry } from '../utils/muzio';

const staged = 'file:///storage/emulated/0/Android/data/com.waveplay.app/files/muzio-import/';
const nameOf = (uri: string) => { try { return decodeURIComponent(uri).split('/').pop() || ''; } catch { return ''; } };
const isBackup = (uri: string) => /^playlist_song_backup_\d+\.json$/i.test(nameOf(uri));

async function readFiles(files: string[]) {
  if (!files.length) throw new Error('No se encontraron archivos playlist_song_backup en esa carpeta. Selecciona audio/playlist del respaldo extraído.');
  const entries: MuzioEntry[] = [];
  for (const uri of files.sort((a,b) => nameOf(a).localeCompare(nameOf(b), 'en', {numeric:true}))) {
    const text = await FileSystem.readAsStringAsync(uri);
    if (text.length > 20_000_000) throw new Error('El respaldo supera el tamaño admitido.');
    entries.push(...parseMuzio(text));
    if (entries.length > 50000) throw new Error('El respaldo supera las 50.000 entradas.');
  }
  return entries;
}

export async function stagedMuzioBackup() {
  if (Platform.OS !== 'android') return null;
  const info = await FileSystem.getInfoAsync(staged);
  if (!info.exists) return null;
  const files = (await FileSystem.readDirectoryAsync(staged)).map(name => staged + name).filter(isBackup);
  return files.length ? readFiles(files) : null;
}

export async function chooseMuzioBackup() {
  if (Platform.OS !== 'android') throw new Error('La selección de carpetas de Muzio está disponible en Android.');
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return null;
  let dirs = [permission.directoryUri];
  for (let depth = 0; depth < 3; depth++) {
    const files: string[] = [], next: string[] = [];
    for (const dir of dirs) {
      const children = await FileSystem.StorageAccessFramework.readDirectoryAsync(dir);
      files.push(...children.filter(isBackup));
      next.push(...children.filter(uri => /^(audio|playlist)$/i.test(nameOf(uri))));
    }
    if (files.length) return readFiles(files);
    dirs = next;
  }
  throw new Error('Selecciona la carpeta audio/playlist del respaldo de Muzio, sin comprimir.');
}

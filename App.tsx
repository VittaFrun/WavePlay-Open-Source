import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

type Quality = '320' | '256' | '192';
type Preview = { title: string; thumbnail?: string; duration?: number; uploader?: string };
type Download = Preview & { id: string; state: string; progress: number; message?: string; jobId?: string; fileName?: string; downloadUrl?: string };
const SERVICE_URL = process.env.EXPO_PUBLIC_AUDIO_SERVICE_URL;
const api = (path: string) => `${SERVICE_URL?.replace(/\/$/, '')}${path}`;
const time = (seconds?: number) => seconds ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}` : '';

export default function App() {
  const [url, setUrl] = useState(''); const [quality, setQuality] = useState<Quality>('320');
  const [preview, setPreview] = useState<Preview>(); const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloads, setDownloads] = useState<Download[]>([]); const [folderUri, setFolderUri] = useState<string>();

  const request = async (path: string, body: object) => {
    if (!SERVICE_URL) throw new Error('Falta configurar EXPO_PUBLIC_AUDIO_SERVICE_URL.');
    const response = await fetch(api(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'El servidor no pudo completar la solicitud.');
    return data;
  };

  const getPreview = async () => {
    if (!/^https?:\/\//i.test(url.trim())) return Alert.alert('Enlace inválido', 'Pega una URL que comience por http:// o https://.');
    setLoadingPreview(true); setPreview(undefined);
    try { setPreview(await request('/preview', { url: url.trim(), quality: Number(quality) })); }
    catch (error) { Alert.alert('No se pudo ver la vista previa', error instanceof Error ? error.message : 'Error desconocido'); }
    finally { setLoadingPreview(false); }
  };

  const update = (id: string, changes: Partial<Download>) => setDownloads((all) => all.map((item) => item.id === id ? { ...item, ...changes } : item));
  const chooseFolder = async () => {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (permission.granted) setFolderUri(permission.directoryUri);
  };

  const saveToDevice = async (id: string, job: Download) => {
    if (!job.downloadUrl || !job.fileName) return;
    try {
      update(id, { state: 'saving', message: 'Guardando en el teléfono…' });
      const local = `${FileSystem.cacheDirectory}${job.fileName}`;
      const result = await FileSystem.downloadAsync(job.downloadUrl, local);
      if (folderUri) {
        const destination = await FileSystem.StorageAccessFramework.createFileAsync(folderUri, job.fileName, 'audio/mpeg');
        const content = await FileSystem.readAsStringAsync(result.uri, { encoding: FileSystem.EncodingType.Base64 });
        await FileSystem.writeAsStringAsync(destination, content, { encoding: FileSystem.EncodingType.Base64 });
      } else {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) throw new Error('Autoriza el acceso a música para guardar el archivo o elige una carpeta.');
        await MediaLibrary.createAssetAsync(result.uri);
      }
      update(id, { state: 'done', progress: 100, message: folderUri ? 'Guardado en la carpeta elegida.' : 'Guardado en Música.' });
    } catch (error) { update(id, { state: 'error', message: error instanceof Error ? error.message : 'No se pudo guardar el archivo.' }); }
  };

  const watchJob = async (id: string, jobId: string) => {
    try {
      const response = await fetch(api(`/jobs/${jobId}`)); const job = await response.json();
      if (!response.ok) throw new Error(job.message || 'No se encontró la descarga.');
      update(id, job);
      if (job.state === 'ready') return saveToDevice(id, { id, ...job });
      if (job.state !== 'error') setTimeout(() => watchJob(id, jobId), 1100);
    } catch (error) { update(id, { state: 'error', message: error instanceof Error ? error.message : 'Se perdió la conexión.' }); }
  };

  const startDownload = async () => {
    if (!preview) return;
    try {
      const data = await request('/downloads', { url: url.trim(), quality: Number(quality), format: 'mp3' });
      const id = data.jobId; const entry: Download = { id, jobId: id, state: 'queued', progress: 0, title: data.title, thumbnail: data.thumbnail, duration: data.duration, uploader: data.uploader, message: 'En cola…' };
      setDownloads((all) => [entry, ...all]); setPreview(undefined); setUrl(''); watchJob(id, id);
    } catch (error) { Alert.alert('No se pudo iniciar', error instanceof Error ? error.message : 'Error desconocido'); }
  };

  const folderName = folderUri ? decodeURIComponent(folderUri.split('/').pop() || 'carpeta elegida') : 'Música del teléfono';
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>WavePlay</Text><Text style={styles.subtitle}>Convierte y guarda contenido propio o autorizado.</Text>
    <View style={styles.card}><Text style={styles.label}>Enlace</Text><TextInput value={url} onChangeText={(value) => { setUrl(value); setPreview(undefined); }} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…" placeholderTextColor="#8994a5" style={styles.input} />
      <Text style={[styles.label, styles.marginTop]}>Calidad MP3</Text><View style={styles.qualityRow}>{(['320', '256', '192'] as Quality[]).map((item) => <Pressable key={item} onPress={() => setQuality(item)} style={[styles.quality, quality === item && styles.selected]}><Text style={[styles.qualityText, quality === item && styles.selectedText]}>{item} kbps</Text></Pressable>)}</View>
      {!preview && <Pressable onPress={getPreview} disabled={loadingPreview} style={styles.button}>{loadingPreview ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ver vista previa</Text>}</Pressable>}
      {preview && <View style={styles.preview}>{preview.thumbnail ? <Image source={{ uri: preview.thumbnail }} style={styles.thumbnail} /> : <View style={[styles.thumbnail, styles.placeholder]}><Text>♫</Text></View>}<View style={styles.previewText}><Text numberOfLines={2} style={styles.previewTitle}>{preview.title}</Text><Text style={styles.meta}>{[preview.uploader, time(preview.duration)].filter(Boolean).join(' · ')}</Text><Pressable onPress={startDownload} style={styles.smallButton}><Text style={styles.buttonText}>Descargar MP3</Text></Pressable></View></View>}
    </View>
    <View style={styles.folder}><View><Text style={styles.label}>Destino: {folderName}</Text><Text style={styles.hint}>Puedes cambiarlo antes de descargar.</Text></View><Pressable onPress={chooseFolder}><Text style={styles.link}>Elegir carpeta</Text></Pressable></View>
    <Text style={styles.section}>Descargas</Text>{downloads.length === 0 ? <Text style={styles.empty}>Aquí aparecerán tus descargas y su progreso.</Text> : downloads.map((item) => <View key={item.id} style={styles.download}><View style={styles.row}>{item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={styles.mini} /> : null}<View style={styles.flex}><Text numberOfLines={1} style={styles.downloadTitle}>{item.title}</Text><Text style={styles.meta}>{item.message || item.state}</Text></View></View><View style={styles.track}><View style={[styles.bar, { width: `${item.progress || (item.state === 'converting' ? 100 : 4)}%` }]} /></View></View>)}
    <Text style={styles.notice}>Respeta los derechos de autor, los permisos del creador y las condiciones de cada plataforma.</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#f7f9fc'},flex:{flex:1},content:{padding:22,paddingTop:48},title:{fontSize:30,fontWeight:'800',color:'#172033'},subtitle:{fontSize:16,color:'#627086',marginTop:7,marginBottom:22},card:{backgroundColor:'#fff',padding:18,borderRadius:20,elevation:3,shadowColor:'#172033',shadowOpacity:.08,shadowRadius:14},label:{fontWeight:'700',color:'#28354b',fontSize:14},input:{height:52,borderWidth:1,borderColor:'#d6dce8',borderRadius:12,marginTop:8,paddingHorizontal:14,fontSize:16,color:'#172033'},marginTop:{marginTop:18},qualityRow:{flexDirection:'row',gap:8,marginTop:8},quality:{flex:1,borderWidth:1,borderColor:'#d6dce8',borderRadius:10,paddingVertical:11,alignItems:'center'},selected:{backgroundColor:'#4053cb',borderColor:'#4053cb'},qualityText:{fontWeight:'700',fontSize:13,color:'#536075'},selectedText:{color:'#fff'},button:{backgroundColor:'#4053cb',paddingVertical:15,borderRadius:12,alignItems:'center',marginTop:21},buttonText:{color:'#fff',fontWeight:'800'},preview:{flexDirection:'row',gap:13,marginTop:20,backgroundColor:'#f3f5fb',padding:10,borderRadius:13},thumbnail:{width:92,height:70,borderRadius:9,backgroundColor:'#dce3f8'},placeholder:{justifyContent:'center',alignItems:'center'},previewText:{flex:1},previewTitle:{fontWeight:'800',fontSize:15,color:'#172033'},meta:{fontSize:12,color:'#69778d',marginTop:4},smallButton:{backgroundColor:'#4053cb',paddingVertical:8,alignItems:'center',borderRadius:8,marginTop:8},folder:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:18,backgroundColor:'#eaf0ff',padding:14,borderRadius:13},hint:{fontSize:12,color:'#637086',marginTop:3},link:{fontWeight:'800',color:'#4053cb',fontSize:13},section:{fontSize:20,fontWeight:'800',color:'#172033',marginTop:28,marginBottom:10},empty:{color:'#718096',lineHeight:20},download:{backgroundColor:'#fff',padding:12,borderRadius:14,marginBottom:10,elevation:1},row:{flexDirection:'row',gap:10},mini:{width:46,height:38,borderRadius:7},downloadTitle:{fontWeight:'800',color:'#263247'},track:{height:5,backgroundColor:'#e3e8f2',borderRadius:5,marginTop:10,overflow:'hidden'},bar:{height:'100%',backgroundColor:'#4053cb',borderRadius:5},notice:{color:'#69778d',fontSize:12,lineHeight:18,marginTop:22,marginBottom:20} });

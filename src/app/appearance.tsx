import { AppAlert as Alert } from '../services/appAlert';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Slider from '@react-native-community/slider';
import { BlurTargetView } from 'expo-blur';
import { PanelBackdrop } from '../components/GlassSurface';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '../providers/AppearanceProvider';
import { buildTheme, fonts, useTheme } from '../theme';
import { accents, defaultAppearance, type Appearance } from '../utils/appearance';
import { leaveAppearance } from '../utils/appearanceNavigation';
import { ThemeWallpaper } from '../components/ThemeWallpaper';
import { HeaderButton } from '../components/HeaderButton';
import { notifyChange } from '../services/feedback';

export default function AppearanceScreen() {
  const { settings, save, preview:livePreview, reduceMotion, setReduceMotion } = useAppearance();
  const { colors } = useTheme();
  const exit = () => leaveAppearance({ canGoBack: () => router.canGoBack(), back: () => router.back(), replace: path => router.replace(path as never) });
  const [draft, setDraft] = useState<Appearance>(settings);
  const previewTarget=useRef<View|null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(()=>{livePreview(draft)},[draft,livePreview]);
  useEffect(()=>()=>livePreview(null),[livePreview]);
  const preview = buildTheme(draft);
  const pick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
      if (!result.canceled && result.assets[0]) setDraft(d => ({...d, background:'custom',imageUri:result.assets[0].uri}));
    } catch { Alert.alert('No se pudo abrir la galería', 'Inténtalo de nuevo desde Apariencia.'); }
  };
  const apply = async () => {
    setBusy(true);
    let copied: File | null = null;
    try {
      let next = {...draft};
      if(next.background==='custom' && !next.imageUri) throw new Error('image missing');
      if(next.background==='custom' && next.imageUri!==settings.imageUri){
        const dir=new Directory(Paths.document,'appearance');dir.create({idempotent:true,intermediates:true});
        const original=new File(next.imageUri!);
        const ext=original.extension || '.jpg';
        copied=new File(dir,`background-${Date.now()}${ext}`); original.copy(copied); next.imageUri=copied.uri;
      }
      await save(next);
      notifyChange('Apariencia actualizada');
      if(settings.imageUri && settings.imageUri!==next.imageUri && settings.imageUri.startsWith(new Directory(Paths.document,'appearance').uri)) {
        try { const old=new File(settings.imageUri); if(old.exists)old.delete(); } catch {}
      }
      exit();
    } catch { if(copied?.exists)copied.delete(); Alert.alert('No se pudo guardar', 'Tu tema anterior se conserva. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };
  const patch = (value: Partial<Appearance>) => setDraft(d=>({...d,...value}));
  return <SafeAreaView style={{flex:1}} edges={['top','bottom']}>
    <View style={[s.header,{paddingHorizontal:20}]}><HeaderButton icon="arrow-left" label="Volver" disabled={busy} onPress={exit}/><Text style={[s.heading,{color:colors.text}]}>Apariencia</Text><HeaderButton icon="restore" label="Restaurar tema original" disabled={busy} onPress={()=>setDraft({...defaultAppearance,playlistView:settings.playlistView})}/></View>
    <ScrollView contentContainerStyle={s.content}>
    <View style={s.preview}><BlurTargetView ref={previewTarget} style={StyleSheet.absoluteFill}><ThemeWallpaper appearance={draft}/></BlurTargetView>
      <Text style={[s.previewTitle,{color:preview.colors.text}]}>Tu música, tu estilo</Text><View style={s.previewRow}><View style={[s.record,{backgroundColor:preview.colors.pinkStrong}]}><MaterialCommunityIcons name="music-note" size={25} color="#fff"/></View><View style={{flex:1}}><Text style={[s.label,{color:preview.colors.pink}]}>WavePlay</Text><Text style={[s.caption,{color:preview.colors.muted}]}>Biblioteca personal</Text></View><MaterialCommunityIcons name="play-circle" size={44} color={preview.colors.pink}/></View>
      <View style={s.previewNav}><PanelBackdrop target={previewTarget} enabled={draft.background!=='solid'} intensity={draft.panelBlur}/>{(['home-outline','compass-outline','playlist-music','account-outline'] as const).map((icon,i)=><MaterialCommunityIcons key={icon} name={icon} size={24} color={i===2?preview.colors.pink:preview.colors.muted}/>)}</View>
    </View>
    <View style={s.option}><View style={{flex:1}}><Text style={[s.label,{color:colors.text}]}>Reducir movimiento</Text><Text style={[s.caption,{color:colors.muted}]}>Desactiva animaciones y transiciones</Text></View><Switch accessibilityLabel="Reducir movimiento" value={reduceMotion} onValueChange={value=>void setReduceMotion(value).catch(()=>Alert.alert('No se pudo guardar el ajuste'))} trackColor={{false:colors.surfaceHighest,true:colors.pinkStrong}} thumbColor={colors.text}/></View>
    <Text style={[s.section,{color:colors.text}]}>Color de acento</Text><View style={s.swatches}>{accents.map(a=><Pressable key={a.id} accessibilityRole="radio" accessibilityLabel={a.name} accessibilityState={{selected:draft.accent===a.id}} onPress={()=>patch({accent:a.id})} style={s.swatchItem}><View style={[s.swatch,{backgroundColor:a.color,borderColor:draft.accent===a.id?'#fff':'transparent'}]}>{draft.accent===a.id?<MaterialCommunityIcons name="check" size={24} color="#13131A"/>:null}</View><Text style={[s.swatchName,{color:colors.muted}]}>{a.name}</Text></Pressable>)}</View>
    <Text style={[s.section,{color:colors.text}]}>Fondo</Text>{([['solid','Fondo sólido','circle-outline'],['anime','Noche anime','weather-night'],['custom','Tu galería','image-outline']] as const).map(([key,label,icon])=><Pressable key={key} accessibilityRole="radio" accessibilityState={{selected:draft.background===key}} onPress={()=>key==='custom'?void pick():patch({background:key})} style={s.option}><MaterialCommunityIcons name={icon} size={24} color={colors.pink}/><Text style={[s.label,{flex:1,color:colors.text}]}>{label}</Text><MaterialCommunityIcons name={draft.background===key?'radiobox-marked':'radiobox-blank'} size={22} color={colors.pink}/></Pressable>)}
    {draft.background!=='solid'?<><View style={s.option}><Text style={[s.label,{flex:1,color:colors.text}]}>Encuadre</Text>{([['cover','Cubrir'],['contain','Imagen completa']] as const).map(([value,label])=><Pressable key={value} accessibilityRole="radio" accessibilityState={{selected:draft.imageFit===value}} onPress={()=>patch({imageFit:value})} style={{minHeight:44,paddingHorizontal:8,justifyContent:'center'}}><Text style={[s.caption,{color:draft.imageFit===value?colors.pink:colors.muted}]}>{label}</Text></Pressable>)}</View><Adjustment label="Oscurecimiento" value={draft.dim*100} max={90} onChange={value=>patch({dim:value/100})}/><Adjustment label="Espacio de imagen" value={draft.imageCoverage*100} onChange={value=>patch({imageCoverage:value/100})}/><View style={s.option}><Text style={[s.label,{flex:1,color:colors.text}]}>Invertir degradado</Text><Switch accessibilityLabel="Invertir degradado" value={draft.gradientInverted} onValueChange={value=>patch({gradientInverted:value})} trackColor={{false:colors.surfaceHighest,true:colors.pinkStrong}} thumbColor={colors.text}/></View><Adjustment label="Desenfoque del fondo" value={draft.blur*5} step={5} onChange={value=>patch({blur:value/5})}/><Adjustment label="Desenfoque de paneles" value={draft.panelBlur} onChange={value=>patch({panelBlur:value})}/></>:null}
    <Pressable disabled={busy} onPress={()=>void apply()} style={[s.apply,{backgroundColor:colors.pink,opacity:busy ? .5 : 1}]}><MaterialCommunityIcons name="check" size={22} color="#13131A"/><Text style={[s.label,{color:'#13131A'}]}>{busy?'Guardando…':'Aplicar tema'}</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
function Adjustment({label,value,max=100,step=1,onChange}:{label:string;value:number;max?:number;step?:number;onChange:(value:number)=>void}) {
 const {colors}=useTheme(); return <View style={{paddingVertical:12}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={[s.label,{color:colors.text,flex:1,paddingRight:12}]}>{label}</Text><Text style={[s.caption,{color:colors.muted}]}>{Math.round(value)} %</Text></View><Slider accessibilityLabel={label} minimumValue={0} maximumValue={max} step={step} value={value} onValueChange={onChange} minimumTrackTintColor={colors.pink} maximumTrackTintColor={colors.outline} thumbTintColor={colors.pink} style={{height:44,width:'100%'}}/></View>;
}
const s=StyleSheet.create({content:{paddingHorizontal:20,paddingBottom:28},header:{flexDirection:'row',alignItems:'center',minHeight:68,gap:8},heading:{flex:1,fontFamily:fonts.bold,fontSize:23},icon:{width:44,height:44,alignItems:'center',justifyContent:'center'},preview:{minHeight:240,borderRadius:8,overflow:'hidden',padding:18,justifyContent:'flex-end'},previewTitle:{fontFamily:fonts.bold,fontSize:20,marginBottom:24},previewRow:{flexDirection:'row',alignItems:'center',gap:12},record:{width:48,height:48,borderRadius:8,alignItems:'center',justifyContent:'center'},previewNav:{overflow:'hidden',marginTop:24,flexDirection:'row',justifyContent:'space-around',backgroundColor:'rgba(255,255,255,.08)',borderRadius:24,paddingVertical:14},label:{fontFamily:fonts.semiBold,fontSize:14},caption:{fontFamily:fonts.regular,fontSize:12,marginTop:3},section:{fontFamily:fonts.bold,fontSize:18,marginTop:26,marginBottom:12},swatches:{flexDirection:'row',flexWrap:'wrap',rowGap:16},swatchItem:{width:'25%',alignItems:'center',paddingHorizontal:3},swatch:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',borderWidth:2},swatchName:{fontFamily:fonts.regular,fontSize:11,textAlign:'center',marginTop:8},option:{minHeight:62,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'rgba(255,255,255,.1)'},apply:{minHeight:50,borderRadius:25,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:24}});

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { HeaderButton } from '../components/HeaderButton';
import { Artwork } from '../components/Artwork';
import { useSceneActive } from '../hooks/useSceneActive';
import { useLibrary } from '../providers/WaveProvider';
import { listeningAnalytics } from '../services/database';
import { fonts, useTheme } from '../theme';
import { listeningChange, listeningTime, type ListeningAnalytics, type StatsPeriod } from '../utils/listeningStats';

const periods: {id:StatsPeriod; label:string}[]=[{id:'week',label:'7 días'},{id:'month',label:'30 días'},{id:'all',label:'Todo'}];
const dayLabel=(day:string)=>new Date(day+'T12:00:00').toLocaleDateString('es',{day:'numeric',month:'short'});
export default function Statistics(){
 const {playlistId}=useLocalSearchParams<{playlistId?:string}>();
 const library=useLibrary(),{colors}=useTheme(),active=useSceneActive();
 const playlist=library.playlists.find(p=>String(p.id)===playlistId);
 const invalid=playlistId!==undefined&&(!/^[1-9]\d*$/.test(playlistId)||library.ready&&!playlist);
 const [period,setPeriod]=useState<StatsPeriod>('week'),[refresh,setRefresh]=useState(0);
 const [data,setData]=useState<ListeningAnalytics|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),[selected,setSelected]=useState<string|null>(null);
 const source=playlistId?`playlist:${playlistId}`:null;
 useEffect(()=>{
  if(!active||invalid)return;
  let current=true;
  listeningAnalytics(period,source).then(value=>{if(current){setData(value);setError(false);}}).catch(()=>{if(current)setError(true);}).finally(()=>{if(current)setBusy(false);});
  return()=>{current=false;};
 },[active,invalid,period,source,refresh]);
 const shown=data?.period===period&&data.sourceKey===source?data:null;
 const change=shown?listeningChange(shown.summary.seconds,shown.previousSeconds):null;
 const day=shown?.days.find(d=>d.day===selected);
 const maximum=Math.max(1,...(shown?.days.map(d=>d.seconds)||[]));
 const text={color:colors.text},muted={color:colors.muted};
 const section=(title:string,detail?:string)=><View style={s.section}><Text style={[s.sectionTitle,text]}>{title}</Text>{detail?<Text style={[s.caption,muted]}>{detail}</Text>:null}</View>;
 const featured=shown?.topTracks[0];
 const reload=()=>{setBusy(true);setError(false);setRefresh(v=>v+1);};
 return <Screen><View style={s.header}><HeaderButton icon="arrow-left" label="Volver" onPress={()=>router.canGoBack()?router.back():router.replace('/(tabs)')}/><View style={{flex:1}}><Text style={[s.title,text]}>Tu ritmo</Text><Text numberOfLines={1} style={[s.caption,muted]}>{playlist?.name||'Tu música en números'}</Text></View><HeaderButton icon="refresh" label="Actualizar estadísticas" disabled={busy||invalid} onPress={reload}/></View>
 {invalid?<Text style={[s.message,muted]}>Esta playlist ya no está disponible.</Text>:<>
 <View style={s.periods}>{periods.map(p=><Pressable key={p.id} accessibilityRole="radio" accessibilityState={{selected:period===p.id}} onPress={()=>{if(period!==p.id){setBusy(true);setError(false);setPeriod(p.id);setSelected(null);}}} style={[s.period,{backgroundColor:period===p.id?colors.pink:colors.surfaceHigh}]}><Text style={{fontFamily:fonts.bold,color:period===p.id?'#15151A':colors.text}}>{p.label}</Text></Pressable>)}</View>
 {busy?<ActivityIndicator color={colors.pink} style={{marginVertical:12}}/>:null}
 {error?<Pressable onPress={reload}><Text style={[s.message,{color:colors.danger}]}>No se pudieron cargar tus estadísticas. Toca para reintentar.</Text></Pressable>:null}
 {shown?<>
 {featured?<View style={[s.hero,{backgroundColor:colors.surfaceHigh}]}>
   <View pointerEvents="none" style={s.heroArtwork}><Artwork uri={featured.artwork} size={240} square/></View>
   <LinearGradient pointerEvents="none" colors={['rgba(13,13,20,.08)','rgba(13,13,20,.85)','#0D0D14']} locations={[0,.55,1]} style={StyleSheet.absoluteFill}/>
   <View style={s.heroTop}><View style={[s.badge,{backgroundColor:colors.pink}]}><MaterialCommunityIcons name="music-note" size={14} color="#15151A"/><Text style={s.badgeText}>EN REPETICIÓN</Text></View><Text style={s.heroRank}>01</Text></View>
   <View style={s.heroCopy}><Text numberOfLines={2} style={s.featureTitle}>{featured.title}</Text><Text numberOfLines={1} style={s.featureArtist}>{featured.artist||'Tu canción más escuchada'}</Text><Text style={s.featureTime}>{listeningTime(featured.seconds)} contigo</Text></View>
 </View>:<View style={[s.empty,{backgroundColor:colors.surfaceHigh}]}><MaterialCommunityIcons name="music-circle-outline" size={54} color={colors.pink}/><Text style={[s.sectionTitle,text]}>Tu próxima canción favorita</Text><Text style={[s.caption,muted]}>Dale play. Tu historia empieza aquí.</Text></View>}
 <View style={s.summary}><View style={s.timeBlock}><Text style={[s.kicker,muted]}>TIEMPO CON TU MÚSICA</Text><Text style={[s.total,text]}>{listeningTime(shown.summary.seconds)}</Text></View><View style={s.counts}><Text style={[s.count,text]}>{shown.summary.tracks} <Text style={s.countLabel}>{shown.summary.tracks===1?'canción':'canciones'}</Text></Text><Text style={[s.count,text]}>{shown.summary.activeDays} <Text style={s.countLabel}>{shown.summary.activeDays===1?'día activo':'días activos'}</Text></Text></View></View>
 {change!==null?<Text style={[s.comparison,{color:colors.pink}]}>{change>0?'↗ ':change<0?'↘ ':''}{change>0?'+':''}{change}% frente al período anterior</Text>:null}
 {shown.summary.seconds>0?<>
 {section('Tu pulso',period==='all'?'Últimos 30 días':undefined)}
 <View style={s.chart}><View style={s.chartHeading}><Text style={[s.caption,muted]}>{day?dayLabel(day.day):'Día a día'}</Text><Text style={[s.chartValue,{color:colors.pink}]}>{day?listeningTime(day.seconds):`${shown.summary.activeDays} ${shown.summary.activeDays===1?'día':'días'} de música`}</Text></View><View style={s.bars}>{shown.days.map(d=><Pressable key={d.day} accessibilityLabel={`${dayLabel(d.day)}, ${listeningTime(d.seconds)}`} accessibilityRole="button" accessibilityState={{selected:selected===d.day}} onPress={()=>setSelected(d.day)} style={s.barSlot}><View style={{height:Math.max(3,d.seconds/maximum*78),width:'100%',borderRadius:4,backgroundColor:selected===d.day?colors.text:colors.pink,opacity:d.seconds?1:.15}}/></Pressable>)}</View><View style={s.axis}><Text style={[s.caption,muted]}>{dayLabel(shown.days[0].day)}</Text><Text style={[s.caption,muted]}>{dayLabel(shown.days[shown.days.length-1].day)}</Text></View></View>
 </>:null}
 {shown.topArtists.length?<>{section('Tus voces favoritas')}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.artistRail}>{shown.topArtists.map((artist,i)=><View key={artist.id} style={s.artist}><View style={[s.artistImage,{borderColor:i===0?colors.pink:colors.border}]}><Artwork uri={artist.artwork} size={76} square/></View><Text numberOfLines={2} style={[s.artistName,text]}>{artist.title}</Text><Text style={[s.small,muted]}>{listeningTime(artist.seconds)}</Text></View>)}</ScrollView></>:null}
 {shown.topTracks.length?<>{section('Tu banda sonora')}<View>{shown.topTracks.map((track,i)=><View key={track.id} style={[s.rank,{borderBottomColor:colors.border}]}><Text style={[s.number,{color:i===0?colors.pink:colors.muted}]}>{String(i+1).padStart(2,'0')}</Text><Artwork uri={track.artwork} size={46}/><View style={{flex:1,gap:4}}><Text numberOfLines={1} style={[s.rowTitle,text]}>{track.title}</Text><Text numberOfLines={1} style={[s.small,muted]}>{track.artist||'Artista desconocido'}</Text></View><Text style={[s.small,muted]}>{listeningTime(track.seconds)}</Text></View>)}</View></>:null}
 {shown.playlists.length?<>{section('Lugares para volver')}<View style={s.playlistGrid}>{shown.playlists.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Estadísticas de ${item.title}`} onPress={()=>router.push({pathname:'/statistics',params:{playlistId:String(item.id)}} as never)} style={[s.playlist,{backgroundColor:colors.surfaceHigh}]}><View style={s.playlistArt}><Artwork uri={item.artwork} size={128}/></View><View style={s.playlistCopy}><Text numberOfLines={2} style={[s.rowTitle,text]}>{item.title}</Text><View style={s.playlistMeta}><Text style={[s.small,muted]}>{listeningTime(item.seconds)}</Text><MaterialCommunityIcons name="arrow-top-right" size={18} color={colors.pink}/></View></View></Pressable>)}</View></>:null}
 </>:!error&&!busy?<ActivityIndicator color={colors.pink} style={{marginTop:40}}/>:null}</>}

 </Screen>;
}
const s=StyleSheet.create({
 header:{flexDirection:'row',gap:12,alignItems:'center',marginBottom:20},title:{fontFamily:fonts.extraBold,fontSize:25},caption:{fontFamily:fonts.regular,fontSize:12},small:{fontFamily:fonts.regular,fontSize:11},
 periods:{flexDirection:'row',gap:8,marginBottom:22},period:{flex:1,alignItems:'center',paddingVertical:10,borderRadius:20},
 hero:{minHeight:300,borderRadius:22,overflow:'hidden',justifyContent:'space-between'},heroArtwork:{position:'absolute',right:-14,top:-6,transform:[{rotate:'8deg'}]},heroTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',padding:20},badge:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:9,paddingVertical:6,borderRadius:8},badgeText:{fontFamily:fonts.extraBold,fontSize:8,color:'#15151A',letterSpacing:.6},heroRank:{fontFamily:fonts.extraBold,fontSize:47,lineHeight:49,color:'rgba(255,255,255,.6)',letterSpacing:-3},heroCopy:{paddingHorizontal:22,paddingBottom:24,paddingTop:58},featureTitle:{fontFamily:fonts.extraBold,fontSize:25,lineHeight:30,color:'#fff',letterSpacing:-.7},featureArtist:{fontFamily:fonts.regular,fontSize:12,color:'#D6D4DE',marginTop:7},featureTime:{fontFamily:fonts.semiBold,fontSize:11,color:'#D6D4DE',marginTop:12},
 summary:{flexDirection:'row',gap:12,alignItems:'center',paddingTop:24},timeBlock:{flex:1.35},kicker:{fontFamily:fonts.bold,fontSize:8,letterSpacing:1.1},total:{fontFamily:fonts.extraBold,fontSize:29,letterSpacing:-1,marginTop:7},counts:{flex:1,gap:9,borderLeftWidth:1,borderLeftColor:'rgba(170,170,190,.25)',paddingLeft:16},count:{fontFamily:fonts.extraBold,fontSize:18},countLabel:{fontFamily:fonts.regular,fontSize:11},comparison:{fontFamily:fonts.semiBold,fontSize:11,marginTop:13},
 section:{marginTop:30,marginBottom:15,gap:5},sectionTitle:{fontFamily:fonts.extraBold,fontSize:21,letterSpacing:-.5},chart:{paddingTop:2,paddingBottom:8},chartHeading:{flexDirection:'row',justifyContent:'space-between',gap:12},chartValue:{fontFamily:fonts.semiBold,fontSize:12},bars:{height:92,flexDirection:'row',alignItems:'flex-end',gap:5,marginTop:10},barSlot:{flex:1,height:88,justifyContent:'flex-end'},axis:{flexDirection:'row',justifyContent:'space-between',marginTop:9},
 artistRail:{gap:18,paddingBottom:4},artist:{width:88,alignItems:'center',gap:6},artistImage:{width:82,height:82,borderRadius:41,overflow:'hidden',borderWidth:2,alignItems:'center',justifyContent:'center'},artistName:{fontFamily:fonts.semiBold,fontSize:11,textAlign:'center',lineHeight:16},
 rank:{minHeight:72,flexDirection:'row',gap:10,alignItems:'center',borderBottomWidth:StyleSheet.hairlineWidth},number:{fontFamily:fonts.bold,fontSize:11,width:19},rowTitle:{fontFamily:fonts.semiBold,fontSize:13},playlistGrid:{flexDirection:'row',flexWrap:'wrap',gap:12},playlist:{width:'47%',borderRadius:16,overflow:'hidden'},playlistArt:{alignItems:'center',paddingTop:12},playlistCopy:{padding:12,gap:9},playlistMeta:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},empty:{padding:26,borderRadius:22,alignItems:'center',gap:12},message:{fontFamily:fonts.regular,fontSize:14,lineHeight:22,paddingVertical:20}
});

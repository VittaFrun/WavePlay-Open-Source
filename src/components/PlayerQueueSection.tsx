import { openRoute } from '../services/navigation';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useQueue, useWaveActions } from '../providers/WaveProvider';
import { fonts, useTheme } from '../theme';
import { Artwork } from './Artwork';
import { displayTrackTitle } from '../utils/text';

export function PlayerQueueSection() {
  const {queue,currentIndex}=useQueue();const {play}=useWaveActions();const {colors}=useTheme();
  const start=Math.max(0,currentIndex+1);
  const upcomingCount=Math.max(0,queue.length-start);
  // The dedicated queue screen virtualizes long lists. Keep this embedded
  // preview bounded so the player doesn't mount hundreds of song rows.
  const shown=queue.slice(start,start+5);
  return <View style={{marginTop:24,paddingTop:18,borderTopWidth:1,borderTopColor:colors.border,paddingBottom:30}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}><View><Text style={{fontFamily:fonts.bold,fontSize:18,color:colors.text}}>A continuación</Text><Text style={{fontFamily:fonts.regular,fontSize:11,color:colors.muted,marginTop:2}}>{upcomingCount} canciones en cola</Text></View><Pressable accessibilityRole="button" onPress={()=>openRoute('/queue')} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:5}}><Text style={{fontFamily:fonts.bold,fontSize:11,color:colors.pink}}>Gestionar cola</Text><MaterialCommunityIcons name="chevron-right" size={18} color={colors.pink}/></Pressable></View>
    {shown.length?shown.map((track,index)=><Pressable key={`${track.id}-${index}`} accessibilityRole="button" onPress={()=>void play(track,queue)} style={{minHeight:61,flexDirection:'row',alignItems:'center',gap:11,paddingVertical:5}}><Artwork uri={track.artwork} size={47}/><View style={{flex:1}}><Text numberOfLines={1} style={{fontFamily:fonts.semiBold,fontSize:12,color:colors.text}}>{displayTrackTitle(track.title)}</Text><Text numberOfLines={1} style={{fontFamily:fonts.regular,fontSize:10,color:colors.muted}}>{track.artist}</Text></View><MaterialCommunityIcons name="play" size={19} color={colors.pink}/></Pressable>):<Text style={{fontFamily:fonts.regular,fontSize:12,color:colors.muted,paddingVertical:16}}>No hay más canciones en la cola.</Text>}
    {upcomingCount>5?<Pressable accessibilityRole="button" onPress={()=>openRoute('/queue')} style={{minHeight:44,alignItems:'center',justifyContent:'center'}}><Text style={{fontFamily:fonts.bold,fontSize:12,color:colors.pink}}>{`Ver las ${upcomingCount} canciones`}</Text></Pressable>:null}
  </View>;
}

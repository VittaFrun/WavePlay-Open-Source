import { openRoute } from '../services/navigation';
import { memo } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { PlaylistCover } from './PlaylistCover';
import { fonts, useTheme } from '../theme';
import type { SmartCollection } from '../services/collections';
import type { Playlist } from '../types';

export const collectionIcons = {'favorites':'heart-outline','most-played':'headphones','recently-played':'history','recently-added':'music-note-plus'} as const;
const collectionCovers = {
  favorites: require('../../assets/collection-favorites.png'),
  'most-played': require('../../assets/collection-most-played.png'),
  'recently-played': require('../../assets/collection-recently-played.png'),
  'recently-added': require('../../assets/collection-recently-added.png'),
} as const;
export function CollectionArtwork({collectionKey,size}:{collectionKey:string;size:number}) {
  const {colors}=useTheme();
  const source=collectionCovers[collectionKey as keyof typeof collectionCovers] ?? collectionCovers.favorites;
  return <View style={{width:size,height:size,overflow:'hidden',backgroundColor:colors.surface2}}><Image source={source} resizeMode="cover" style={{width:size,height:size}}/><View pointerEvents="none" style={{position:'absolute',top:size<80?5:10,left:size<80?5:10,width:size<80?24:30,height:size<80?24:30,borderRadius:8,backgroundColor:'rgba(10,10,16,.58)',alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name={collectionIcons[collectionKey as keyof typeof collectionIcons]??'playlist-music'} size={size<80?15:19} color={colors.pink}/></View></View>;
}
export const PlaylistTile=memo(function PlaylistTile({collection,playlist,size,layout='grid'}:{collection?:SmartCollection;playlist?:Playlist;size:number;layout?:'grid'|'list'}) {
  const {colors}=useTheme();
  const title=collection?.title || playlist?.name || '';
  const count=collection?.tracks.length ?? playlist?.trackCount ?? 0;
  const coverSize=layout==='list'?64:size;
  const cover=collection?<CollectionArtwork collectionKey={collection.key} size={coverSize}/>:playlist?<PlaylistCover playlist={playlist} size={coverSize} square/>:null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${count} canciones`} onPress={()=>openRoute(collection?`/collection/${collection.key}` as never:`/playlist/${playlist?.id}` as never)}
    style={({pressed})=>[layout==='grid'?[s.grid,{width:size,height:size,borderColor:'rgba(255,255,255,.28)'}]:[s.list,{borderColor:colors.border}],pressed&&{opacity:.75}]}>
    {cover}
    {layout==='grid'?<><LinearGradient pointerEvents="none" colors={['rgba(8,8,14,0)','rgba(8,8,14,.9)']} locations={[.2,1]} style={StyleSheet.absoluteFill}/><View style={s.gridCopy}><Text numberOfLines={2} style={s.gridTitle}>{title}</Text><Text style={s.gridCount}>{count} canciones</Text></View></>:<><View style={{flex:1}}><Text numberOfLines={2} style={[s.title,{color:colors.text}]}>{title}</Text><Text style={[s.count,{color:colors.muted}]}>{count} canciones</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={colors.outline}/></>}
  </Pressable>;
});
const s=StyleSheet.create({grid:{overflow:'hidden',borderRightWidth:StyleSheet.hairlineWidth,borderBottomWidth:StyleSheet.hairlineWidth},gridCopy:{position:'absolute',left:12,right:12,bottom:12},gridTitle:{fontFamily:fonts.bold,fontSize:14,lineHeight:19,color:'#fff'},gridCount:{fontFamily:fonts.regular,fontSize:11,color:'rgba(255,255,255,.8)',marginTop:4},list:{minHeight:86,flexDirection:'row',alignItems:'center',gap:14,paddingVertical:10,borderBottomWidth:StyleSheet.hairlineWidth},title:{fontFamily:fonts.semiBold,fontSize:15},count:{fontFamily:fonts.regular,fontSize:12,marginTop:5}});

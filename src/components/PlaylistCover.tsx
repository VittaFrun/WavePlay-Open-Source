import { memo } from 'react';
import { View } from 'react-native';
import { Artwork } from './Artwork';
import type { Playlist } from '../types';

export const PlaylistCover=memo(function PlaylistCover({ playlist, size, square=false }: { playlist: Playlist; size: number; square?: boolean }) {
  const art=playlist.artworks||[];
  if (art.length < 4) return <Artwork uri={art[0] || playlist.artwork} size={size} square={square} />;
  return <View style={{ width: size, height: size, borderRadius: square?0:8, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>{art.map(uri => <Artwork key={uri} uri={uri} size={size / 2} square />)}</View>;
});

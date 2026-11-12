import type { Track } from '../types';

export type LocalMix = { id: string; title: string; caption: string; tracks: Track[] };
export type TrackSort = 'title' | 'artist' | 'recent' | 'played';
// Library rows and arrays are immutable. Weak keys release old indexes after
// edits or scans, without retaining a second history of the music library.
const sortedTracks=new WeakMap<Track[],Map<TrackSort,Track[]>>();
const searchText=new WeakMap<Track,string>();

export function filterTracks(tracks: Track[], query: string, sort: TrackSort): Track[] {
  const q = query.trim().toLocaleLowerCase();
  let sorts=sortedTracks.get(tracks);
  if(!sorts){sorts=new Map();sortedTracks.set(tracks,sorts);}
  let sorted=sorts.get(sort);
  if(!sorted){
    sorted=tracks.filter(track=>!track.missing).sort((a, b) => sort === 'recent' ? (b.addedAt || b.createdAt) - (a.addedAt || a.createdAt)
      : sort === 'played' ? (b.playCount || 0) - (a.playCount || 0)
      : sort === 'artist' ? a.artist.localeCompare(b.artist) : a.title.localeCompare(b.title));
    sorts.set(sort,sorted);
  }
  if(!q)return sorted;
  return sorted.filter(track=>{
    let text=searchText.get(track);
    if(text===undefined){text=`${track.title} ${track.artist} ${track.album} ${track.folder || ''}`.toLocaleLowerCase();searchText.set(track,text);}
    return text.includes(q);
  });
}

export function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

export function localMixes(tracks: Track[]): LocalMix[] {
  const available = tracks.filter(track => !track.missing);
  const favorites = available.filter(track => track.favorite);
  const mostPlayed = available.filter(track => (track.playCount || 0) > 0)
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 30);
  const unplayed = available.filter(track => !(track.playCount || 0)).slice(0, 30);
  const artists = new Map<string, Track[]>();
  for (const track of available) {
    if (!track.artist || track.artist === 'Artista desconocido') continue;
    const items=artists.get(track.artist);
    if(items)items.push(track);else artists.set(track.artist,[track]);
  }
  let artist: [string,Track[]] | undefined;
  let bestScore=-1;
  for(const entry of artists){
    if(entry[1].length<4)continue;
    const score=entry[1].reduce((sum,track)=>sum+(track.playCount||0),0);
    if(score>bestScore){artist=entry;bestScore=score;}
  }
  const mixes: LocalMix[] = [];
  if (favorites.length) mixes.push({ id: 'favorites', title: 'Tu frecuencia', caption: 'Tus canciones favoritas', tracks: favorites.slice(0, 24) });
  if (mostPlayed.length) mixes.push({ id: 'essentials', title: 'En repetición', caption: 'Tus imprescindibles', tracks: mostPlayed });
  if (artist) mixes.push({ id: 'artist', title: artist[0], caption: 'Una sesión con tu artista', tracks: artist[1] });
  if (unplayed.length) mixes.push({ id: 'rediscover', title: 'Por descubrir', caption: 'Aún no las escuchas', tracks: unplayed });
  return mixes;
}

// Android lock-screen metadata uses java.net.URL, not a content resolver.
export function lockScreenArtwork(uri?: string | null): string | undefined {
  return uri && /^https?:\/\//i.test(uri) ? uri : undefined;
}

import type { Track } from '../types';

export function lyricsSearchUrl(track: Pick<Track, 'title' | 'artist'>, megalobiz = false) {
  const artist = /desconocid|unknown/i.test(track.artist || '') ? '' : track.artist;
  const query = [track.title, artist, 'lrc', megalobiz ? 'megalobiz' : ''].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

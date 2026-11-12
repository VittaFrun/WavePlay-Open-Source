import { withRequestTimeout } from '../utils/requestTimeout';
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import type { Track } from "../types";

import { parseLyrics, type LyricLine } from '../utils/lyrics';
export { parseLyrics, lyricAt } from '../utils/lyrics';
export type TrackLyrics = {
  text: string;
  lines: LyricLine[];
  source: "saved" | "sidecar" | "online";
};

const storageKey = (trackId: string) => `@waveplay/lyrics/${trackId}`;
function lrcSibling(uri: string) {
  const clean = uri.split("?")[0].split("#")[0];
  return clean.replace(/\.[^./]+$/, ".lrc");
}

export async function loadTrackLyrics(track: Pick<Track, 'id' | 'uri'>): Promise<TrackLyrics | null> {
  const saved = await AsyncStorage.getItem(storageKey(track.id));
  if (saved?.trim()) return { text: saved, lines: parseLyrics(saved), source: "saved" };

  const candidate = lrcSibling(track.uri);
  if (!candidate.startsWith("file://")) return null;
  try {
    const info = await FileSystem.getInfoAsync(candidate);
    if (!info.exists) return null;
    const text = await FileSystem.readAsStringAsync(candidate, { encoding: FileSystem.EncodingType.UTF8 });
    return text.trim() ? { text, lines: parseLyrics(text), source: "sidecar" } : null;
  } catch {
    return null;
  }
}

export async function saveTrackLyrics(trackId: string, text: string) {
  await AsyncStorage.setItem(storageKey(trackId), text.trim());
}

export type LyricsLookupResult = TrackLyrics | null;

/**
 * Looks up lyrics only after an explicit user action.  LRCLIB receives the
 * track metadata (title, artist, album and duration), never the audio file.
 */
export async function findOnlineLyrics(track: Track): Promise<LyricsLookupResult> {
  if (!track.title.trim() || !track.artist.trim() || /^artista desconocido$/i.test(track.artist.trim())) {
    throw new Error("Añade artista y título correctos para buscar letras.");
  }
  const params = new URLSearchParams({
    track_name: track.title.trim(),
    artist_name: track.artist.trim(),
    duration: String(Math.max(1, Math.round(track.duration))),
  });
  if (track.album?.trim() && !/^álbum desconocido$/i.test(track.album.trim())) params.set("album_name", track.album.trim());
  let response: Response,payload:{syncedLyrics?:string|null;plainLyrics?:string|null};
  try {
    const result=await withRequestTimeout(async signal=>{
      const response=await fetch(`https://lrclib.net/api/get?${params.toString()}`,{headers:{"User-Agent":"WavePlay/1.0 (personal local music player)"},signal});
      return {response,payload:response.ok?await response.json():{}};
    });
    response=result.response;payload=result.payload;
  } catch {
    throw new Error("No fue posible conectarse al buscador de letras.");
  }
  if (response.status === 404) return null;
  if (response.status === 429) throw new Error("El buscador está ocupado. Intenta nuevamente en un momento.");
  if (!response.ok) throw new Error("No se pudo buscar letras en este momento.");
  const text = payload.syncedLyrics?.trim() || payload.plainLyrics?.trim();
  if (!text) return null;
  await saveTrackLyrics(track.id, text);
  return { text, lines: parseLyrics(text), source: "online" };
}

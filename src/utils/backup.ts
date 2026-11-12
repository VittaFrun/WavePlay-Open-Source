import type { Track } from '../types';

export type BackupTrack = Pick<Track, 'id' | 'filename' | 'title' | 'artist' | 'album' | 'duration'> & {
  inLibrary?: boolean; youtubeId?: string | null; artwork?: string | null; fileSize?: number | null; favorite: boolean; playCount: number; lastPlayedAt?: number | null;
};
export type BackupPlaylist = { name: string; createdAt: number; trackIds: string[] };
export type WaveBackup = {
  format: 'waveplay-backup'; version: 1; createdAt: number;
  tracks: BackupTrack[]; playlists: BackupPlaylist[];
  history: { trackId: string; playedAt: number }[];
  listening: { id: string; trackId: string; sourceKey: string | null; startedAt: number; updatedAt: number; listenedSeconds: number; counted: boolean }[];
  settings: Record<string, string>;
  lyrics: { trackId: string; text: string }[];
};

const obj = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const norm = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();
export const backupTrackKey = (track:Pick<BackupTrack,'title'|'artist'>) => `${norm(track.title)}\0${norm(track.artist)}`;
const near = (left: number, right: number) => Math.abs(left - right) <= 2;

export function parseWaveBackup(raw: string): WaveBackup {
  if (raw.length > 25_000_000) throw new Error('El respaldo supera 25 MB.');
  let data: unknown;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw new Error('El archivo no contiene un respaldo JSON válido.'); }
  if (!obj(data) || data.format !== 'waveplay-backup' || data.version !== 1 ||
      !Array.isArray(data.tracks) || !Array.isArray(data.playlists) || !Array.isArray(data.history) || !Array.isArray(data.listening) ||
      !obj(data.settings) || !Array.isArray(data.lyrics) || typeof data.createdAt !== 'number' || !Number.isFinite(data.createdAt) || data.createdAt<0)
    throw new Error('El archivo no es un respaldo WavePlay compatible.');
  if (data.tracks.length > 100_000 || data.playlists.length > 10_000 || data.history.length > 100_000 || data.listening.length > 100_000 || data.lyrics.length > 100_000)
    throw new Error('El respaldo contiene demasiadas entradas.');
  for (const t of data.tracks) if (!obj(t) || typeof t.id !== 'string' || !t.id || t.id.length>200 || typeof t.filename !== 'string' || t.filename.length>500 ||
    typeof t.title !== 'string' || typeof t.artist !== 'string' || typeof t.album !== 'string' ||
    t.title.length>500 || t.artist.length>500 || t.album.length>500 ||
    typeof t.duration !== 'number' || !Number.isFinite(t.duration) || t.duration<0 || typeof t.favorite !== 'boolean' ||
    typeof t.playCount !== 'number' || !Number.isFinite(t.playCount) || t.playCount<0 ||
    (t.fileSize!=null && (typeof t.fileSize!=='number' || !Number.isFinite(t.fileSize) || t.fileSize<0))) throw new Error('El respaldo contiene una canción inválida.');
  for(const t of data.tracks as Record<string,unknown>[])if((t.inLibrary!==undefined&&typeof t.inLibrary!=='boolean')||(t.youtubeId!=null&&(typeof t.youtubeId!=='string'||!(/^[\w-]{11}$/).test(t.youtubeId)||t.id!==`youtube:${t.youtubeId}`))||(t.artwork!=null&&(typeof t.artwork!=='string'||t.artwork.length>2000)))throw new Error('La referencia online del respaldo no es válida.');
  const ids = new Set((data.tracks as BackupTrack[]).map(t => t.id));
  if (ids.size !== data.tracks.length) throw new Error('El respaldo contiene identificadores duplicados.');
  for (const p of data.playlists) if (!obj(p) || typeof p.name !== 'string' || !p.name.trim() || p.name.length>80 ||
    typeof p.createdAt !== 'number' || !Number.isFinite(p.createdAt) || !Array.isArray(p.trackIds) ||
    p.trackIds.some((id: unknown) => typeof id !== 'string' || !ids.has(id)))
    throw new Error('El respaldo contiene una playlist inválida.');
  for (const h of data.history) if (!obj(h) || typeof h.trackId !== 'string' || !ids.has(h.trackId) ||
    typeof h.playedAt !== 'number' || !Number.isFinite(h.playedAt)) throw new Error('El historial del respaldo es inválido.');
  for (const e of data.listening) if (!obj(e) || typeof e.id !== 'string' || !e.id || typeof e.trackId !== 'string' || !ids.has(e.trackId) ||
    typeof e.startedAt !== 'number' || !Number.isFinite(e.startedAt) || typeof e.updatedAt !== 'number' || !Number.isFinite(e.updatedAt) || typeof e.listenedSeconds !== 'number' || !Number.isFinite(e.listenedSeconds) || e.listenedSeconds<0 ||
    typeof e.counted !== 'boolean' || (e.sourceKey !== null && typeof e.sourceKey !== 'string'))
    throw new Error('Las estadísticas del respaldo son inválidas.');
  for (const l of data.lyrics) if (!obj(l) || typeof l.trackId !== 'string' || !ids.has(l.trackId) ||
    typeof l.text !== 'string' || l.text.length > 100_000) throw new Error('Las letras del respaldo son inválidas.');
  for (const [key, value] of Object.entries(data.settings)) if (typeof value !== 'string' || key.length > 150 || value.length > 100_000)
    throw new Error('Los ajustes del respaldo son inválidos.');
  return data as WaveBackup;
}

// Never trust a MediaStore ID on another device. Only accept an unambiguous match.
export function matchBackupTrack(saved: BackupTrack, available: BackupTrack[]): string | null {
  const candidates = available.filter(track =>
    near(track.duration, saved.duration) && norm(track.title) === norm(saved.title) &&
    norm(track.artist) === norm(saved.artist) &&
    (!saved.fileSize || !track.fileSize || saved.fileSize === track.fileSize));
  if (candidates.length === 1) return candidates[0].id;
  const named = candidates.filter(track => norm(track.filename) === norm(saved.filename));
  return named.length === 1 ? named[0].id : null;
}

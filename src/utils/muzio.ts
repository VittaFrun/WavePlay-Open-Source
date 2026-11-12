import type { Track } from '../types';

export type MuzioEntry = { filePath: string; identicalKey: string; playlistId: number; playlistName: string };
export type MuzioIssue = { filename: string; path: string; reason: 'missing' | 'ambiguous' };
export type MuzioPlaylistPlan = { sourceKey: string; name: string; favorites: boolean; total: number; trackIds: string[]; issues: MuzioIssue[] };

export function parseMuzio(text: string): MuzioEntry[] {
  const value: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!Array.isArray(value) || value.length > 50000) throw new Error('El archivo no es una lista válida de Muzio.');
  return value.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('El respaldo contiene una entrada inválida.');
    const r = row as Record<string, unknown>;
    const emptyPlaylist = r.filePath === '' && r.mediaId === -1 && r.identicalKey === '';
    if (typeof r.filePath !== 'string' || (!r.filePath.trim() && !emptyPlaylist) || typeof r.playlistName !== 'string' ||
      !r.playlistName.trim() || !Number.isSafeInteger(r.playlistId) || Number(r.playlistId) < 0)
      throw new Error('Faltan datos de canción o playlist en el respaldo.');
    return { filePath: r.filePath, identicalKey: typeof r.identicalKey === 'string' ? r.identicalKey : '',
      playlistId: Number(r.playlistId), playlistName: r.playlistName.trim() };
  });
}

function normalize(value: string) { return value.normalize('NFC').toLocaleLowerCase('en-US'); }
function path(value: string) {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch {}
  return normalize(decoded.replace(/^file:\/\//, '').replace(/\\/g, '/').replace(/^\/sdcard\//, '/storage/emulated/0/'));
}
function filename(value: string) { return path(value).split('/').pop() || ''; }
function compatible(entry: MuzioEntry, track: Track) {
  const identity = /^(\d+)_(\d+)_/.exec(entry.identicalKey);
  if (!identity) return true;
  const duration = Number(identity[1]) / 1000, size = Number(identity[2]);
  return (!size || !track.fileSize || size === track.fileSize) &&
    (!duration || !track.duration || Math.abs(duration - track.duration) <= 2);
}

export function planMuzio(entries: MuzioEntry[], tracks: Track[]): MuzioPlaylistPlan[] {
  const paths = new Map<string, Track[]>(), names = new Map<string, Track[]>();
  const index = (map: Map<string, Track[]>, key: string, track: Track) => {
    const list = map.get(key) || []; if (!list.some(item => item.id === track.id)) list.push(track); map.set(key, list);
  };
  for (const track of tracks.filter(track => !track.missing)) {
    index(names, filename(track.filename), track);
    if (track.uri.startsWith('file://') || track.uri.startsWith('/')) index(paths, path(track.uri), track);
    if (track.folder?.startsWith('/') || track.folder?.startsWith('file://')) index(paths, path(`${track.folder}/${track.filename}`), track);
  }
  const groups = new Map<string, MuzioPlaylistPlan>(), seen = new Map<string, Set<string>>();
  for (const entry of entries) {
    const key = `muzio.playlist.${entry.playlistId}.${encodeURIComponent(entry.playlistName)}`;
    let group = groups.get(key);
    if (!group) {
      group = { sourceKey: key, name: entry.playlistName, favorites: entry.playlistId === 1 && /^(favorites|favoritos|favoritas)$/i.test(entry.playlistName), total: 0, trackIds: [], issues: [] };
      groups.set(key, group); seen.set(key, new Set());
    }
    if (!entry.filePath) continue;
    const original = path(entry.filePath);
    if (seen.get(key)!.has(original)) continue;
    seen.get(key)!.add(original); group.total++;
    const exact = (paths.get(original) || []).filter(track => compatible(entry, track));
    const candidates = exact.length ? exact : (names.get(filename(entry.filePath)) || []).filter(track => compatible(entry, track));
    if (candidates.length === 1) {
      if (!group.trackIds.includes(candidates[0].id)) group.trackIds.push(candidates[0].id);
    } else group.issues.push({ filename: entry.filePath.replace(/\\/g, '/').split('/').pop() || entry.filePath,
      path: entry.filePath, reason: candidates.length ? 'ambiguous' : 'missing' });
  }
  return [...groups.values()];
}

export function importedPlaylistName(name: string, existing: string[]) {
  const names = new Set(existing.map(normalize));
  if (!names.has(normalize(name))) return name;
  let candidate = `${name} (Muzio)`, suffix = 2;
  while (names.has(normalize(candidate))) candidate = `${name} (Muzio ${suffix++})`;
  return candidate;
}

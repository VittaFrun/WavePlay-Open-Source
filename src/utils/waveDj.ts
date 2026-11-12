import type { Track } from '../types';
import type { LocalMix } from './music';

export type DjOptions={count?:number;minutes?:number;discovery?:number;variety?:boolean;avoidRecent?:boolean;now?:number;seed?:string};
export type DailySnapshot = { day: string; trackIds: string[] };

export function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 4294967296;
}

export function dailySelection(tracks: Track[], day: string, previousIds: readonly string[] = [], lessIds: readonly string[] = [], options:DjOptions = {}): LocalMix | null {
  const seen = new Set<string>();
  const available = tracks.filter(track => {
    if (track.missing || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
  if (!available.length) return null;
  const discovery=Number.isFinite(options.discovery)?Math.max(0,Math.min(1,options.discovery!)):.5;
  const now=options.now??Date.now();
  const minutes=Number.isFinite(options.minutes)?Math.max(1,Math.min(120,options.minutes!)):0;
  const requested=Number.isFinite(options.count)?Math.round(Math.max(1,Math.min(100,options.count!))):20;
  const previous = new Set(previousIds);
  const less = new Set(lessIds);
  const artistAffinity = new Map<string, number>();
  const genreAffinity = new Map<string, number>();
  for (const track of available) {
    const affinity = (track.favorite ? 3 : 0) + Math.min(4, Math.log2((track.playCount || 0) + 1));
    if (!affinity) continue;
    if (track.artist && track.artist !== 'Artista desconocido') artistAffinity.set(track.artist, (artistAffinity.get(track.artist) || 0) + affinity);
    if (track.genre) genreAffinity.set(track.genre, (genreAffinity.get(track.genre) || 0) + affinity);
  }
  const ranked = available.map(track => {
    const played = track.playCount || 0;
    const score = hash(`${day}:${options.seed||''}:${track.id}`) * 5
      + (track.favorite ? 6*(1-discovery) : 0)
      + Math.min(3, Math.log2(played + 1))
      + Math.min(2, (artistAffinity.get(track.artist) || 0) / 6)
      + Math.min(1.5, (genreAffinity.get(track.genre || '') || 0) / 8)
      + (!played ? 3*discovery : 0)
      - (options.avoidRecent&&track.lastPlayedAt&&now-track.lastPlayedAt<48*3600_000 ? 5 : 0)
      - (previous.has(track.id) && available.length > 24 ? 3 : 0)
      - (less.has(track.id) ? 20 : 0);
    return { track, score };
  }).sort((a, b) => b.score - a.score || a.track.id.localeCompare(b.track.id));
  const selected: Track[] = [];
  const selectedIds = new Set<string>();
  const artistCounts = new Map<string, number>();
  const target = Math.min(minutes?100:requested, available.length);
  const artistLimit=Math.max(3,Math.ceil(target/Math.max(1,new Set(available.map(t=>t.artist)).size)));
  for (const { track } of ranked) {
    if (selected.length >= target) break;
    const count = artistCounts.get(track.artist) || 0;
    if (options.variety!==false && count >= artistLimit && available.length > target) continue;
    selected.push(track);
    selectedIds.add(track.id);
    artistCounts.set(track.artist, count + 1);
  }
  for (const { track } of ranked) {
    if (selected.length >= target) break;
    if (!selectedIds.has(track.id)) { selected.push(track); selectedIds.add(track.id); }
  }
  // Spread artists across the session; at most 20 entries are compared per step.
  const remaining = [...selected];
  const ordered: Track[] = [];
  while (remaining.length) {
    if(options.variety===false){ordered.push(...remaining);break;}
    const lastArtist = ordered[ordered.length - 1]?.artist;
    const counts = new Map<string, number>();
    for (const track of remaining) counts.set(track.artist, (counts.get(track.artist) || 0) + 1);
    let index = -1;
    let largest = -1;
    for (let i = 0; i < remaining.length; i++) {
      const artist = remaining[i].artist;
      const count = counts.get(artist) || 0;
      if (artist !== lastArtist && count > largest) { index = i; largest = count; }
    }
    ordered.push(remaining.splice(index < 0 ? 0 : index, 1)[0]);
  }
  if(minutes){
    let seconds=0,end=0;
    while(end<ordered.length&&seconds<minutes*60){const value=ordered[end++].duration;seconds+=Number.isFinite(value)&&value>0?value:180;}
    ordered.splice(end);
  }
  const personalized = available.some(track => track.favorite || (track.playCount || 0) > 0);
  return {
    id: `daily-${day}`,
    title: 'Tu selección de hoy',
    caption: personalized ? 'Favoritas, descubrimientos y lo que más escuchas' : 'Un punto de partida con tu música local',
    tracks: ordered,
  };
}

export function restoreDailySelection(tracks: Track[], snapshot: DailySnapshot, day: string): Track[] {
  if (snapshot.day !== day) return [];
  const byId = new Map(tracks.filter(track => !track.missing).map(track => [track.id, track]));
  return [...new Set(snapshot.trackIds)].flatMap(id => byId.get(id) || []);
}

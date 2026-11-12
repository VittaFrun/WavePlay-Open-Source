import type { Track } from '../types';

// Keep saved positions only for current members; append newly added songs.
export function applyTrackOrder(tracks: Track[], ids: string[]): Track[] {
  const remaining = new Map(tracks.map(track => [track.id, track]));
  const ordered: Track[] = [];
  for (const id of ids) {
    const track = remaining.get(id);
    if (track) { ordered.push(track); remaining.delete(id); }
  }
  return [...ordered, ...remaining.values()];
}

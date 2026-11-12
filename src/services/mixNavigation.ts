import { router } from 'expo-router';
import type { LocalMix } from '../utils/music';

export type MixSnapshot = { id: string; title: string; caption: string; trackIds: string[] };
const snapshots = new Map<string, MixSnapshot>();
let sequence = 0;

// Freeze membership/order when opening: listening must not empty “Por descubrir”.
export function openMix(mix: LocalMix) {
  const token = `${Date.now()}-${++sequence}`;
  snapshots.set(token, { id: mix.id, title: mix.title, caption: mix.caption, trackIds: [...new Set(mix.tracks.filter(track => !track.missing).map(track => track.id))] });
  if (snapshots.size > 100) snapshots.delete(snapshots.keys().next().value!);
  router.push({ pathname: '/mix/[id]', params: { id: mix.id, snapshot: token } } as never);
}

export function getMixSnapshot(token?: string) {
  return token ? snapshots.get(token) : undefined;
}

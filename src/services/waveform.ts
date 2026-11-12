import { useSyncExternalStore } from 'react';

const BAR_COUNT = 25;
const idle = Array.from({ length: BAR_COUNT }, (_, index) => 0.08 + (index % 5 === 2 ? 0.04 : 0));
let snapshot = idle;
let lastPublishedAt = 0;
const listeners = new Set<() => void>();

export function publishAudioFrames(channels: number[][]) {
  const frames = channels[0]?.length ?? 0;
  if (!frames) return;
  const now = Date.now();
  if (now - lastPublishedAt < 50) return;
  lastPublishedAt = now;

  const next = Array.from({ length: BAR_COUNT }, (_, band) => {
    const start = Math.floor((band / BAR_COUNT) * frames);
    const end = Math.max(start + 1, Math.floor(((band + 1) / BAR_COUNT) * frames));
    let energy = 0;
    let count = 0;
    for (const channel of channels) {
      for (let index = start; index < end && index < channel.length; index += 1) {
        energy += channel[index] * channel[index];
        count += 1;
      }
    }
    const rms = count ? Math.sqrt(energy / count) : 0;
    const normalized = Math.min(1, Math.max(0.06, rms * 4.2));
    return snapshot[band] * 0.42 + normalized * 0.58;
  });
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function resetWaveform() {
  snapshot = idle;
  listeners.forEach((listener) => listener());
}

export function useWaveformLevels() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => snapshot,
    () => idle,
  );
}

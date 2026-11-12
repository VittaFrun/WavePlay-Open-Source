export type PlaybackSnapshot = {
  playing: boolean; position: number; duration: number; buffering: boolean; error: string | null;
};

export const emptyPlayback: PlaybackSnapshot = {playing:false,position:0,duration:0,buffering:false,error:null};

export function createPlaybackStore(initial: PlaybackSnapshot = emptyPlayback) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish(next: PlaybackSnapshot) {
      if (value.playing===next.playing && value.position===next.position && value.duration===next.duration && value.buffering===next.buffering && value.error===next.error) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

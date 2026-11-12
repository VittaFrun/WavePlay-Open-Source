/** Only the old and new song subscribers are notified on a track change. */
export function createActiveTrackStore() {
  let active: string | undefined;
  const listeners = new Map<string, Set<() => void>>();
  return {
    isActive: (id: string) => active === id,
    subscribe(id: string, listener: () => void) {
      let group = listeners.get(id);
      if (!group) { group = new Set(); listeners.set(id, group); }
      group.add(listener);
      return () => { group.delete(listener); if (!group.size) listeners.delete(id); };
    },
    setActive(id: string | undefined) {
      if (active === id) return;
      const previous = active;
      active = id;
      for (const key of [previous, id]) if (key) listeners.get(key)?.forEach(listener => listener());
    },
  };
}

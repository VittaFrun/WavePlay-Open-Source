import type { LocalMix } from "../utils/music";
export type DjSession = {
  id: string;
  title: string;
  trackIds: string[];
  keptIds: string[];
  createdAt: number;
};
let sessions: DjSession[] = [];
let sequence = 0;
const listeners = new Set<() => void>();
export const getDjSessions = () => sessions;
export function subscribeDjSessions(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(next: DjSession[]) {
  if(next.length===sessions.length&&next.every((item,index)=>item===sessions[index]))return;
  sessions = next;
  listeners.forEach((listener) => listener());
}
export function createDjSession(mix: LocalMix): DjSession | null {
  const trackIds = [
    ...new Set(
      mix.tracks.filter((track) => !track.missing).map((track) => track.id),
    ),
  ];
  if (!trackIds.length || sessions.length >= 20) return null;
  const createdAt = Date.now();
  const session = {
    id: `dj-${createdAt}-${++sequence}`,
    title: `Sesión ${sequence}`,
    trackIds,
    keptIds: [],
    createdAt,
  };
  publish([session, ...sessions]);
  return session;
}
export function discardDjSession(id: string) {
  publish(sessions.filter((session) => session.id !== id));
}
const pendingSaves = new Map<string, Promise<void>>();
export function editDjSession(
  id: string,
  change: Partial<Pick<DjSession, "title" | "trackIds" | "keptIds">>,
) {
  if (pendingSaves.has(id)) return;
  publish(
    sessions.map((session) => {
      if (session.id !== id) return session;
      const trackIds = [...new Set(change.trackIds ?? session.trackIds)].slice(
        0,
        100,
      );
      const keptIds=[...new Set(change.keptIds??session.keptIds)].filter(key=>trackIds.includes(key));
      const title=change.title!==undefined?change.title.trim().slice(0,80)||session.title:session.title;
      const sameTracks=trackIds.length===session.trackIds.length&&trackIds.every((id,index)=>id===session.trackIds[index]);
      const sameKept=keptIds.length===session.keptIds.length&&keptIds.every((id,index)=>id===session.keptIds[index]);
      if(sameTracks&&sameKept&&title===session.title)return session;
      return {...session,title,trackIds:sameTracks?session.trackIds:trackIds,keptIds:sameKept?session.keptIds:keptIds};
    }),
  );
}
export function regenerateDjSession(id: string, candidates: readonly string[]) {
  const session = sessions.find((item) => item.id === id);
  if (!session) return;
  const kept = session.trackIds.filter((key) => session.keptIds.includes(key));
  editDjSession(id, {
    trackIds: [
      ...kept,
      ...[...new Set(candidates)].filter((key) => !kept.includes(key)),
    ].slice(
      0,
      Math.max(
        kept.length,
        session.trackIds.length || Math.min(100, candidates.length),
      ),
    ),
  });
}
export function replaceDjSong(
  id: string,
  trackId: string,
  replacement: string,
) {
  const session = sessions.find((item) => item.id === id);
  if (!session || session.trackIds.includes(replacement)) return;
  editDjSession(id, {
    trackIds: session.trackIds.map((key) =>
      key === trackId ? replacement : key,
    ),
  });
}
export function saveDjSession(
  id: string,
  persist: (session: DjSession) => Promise<void>,
): Promise<void> {
  const existing = pendingSaves.get(id);
  if (existing) return existing;
  const session = sessions.find((item) => item.id === id);
  if (!session)
    return Promise.reject(new Error("La sesión ya no está disponible."));
  const saving = Promise.resolve()
    .then(() => persist(session))
    .then(() => discardDjSession(id))
    .finally(() => pendingSaves.delete(id));
  pendingSaves.set(id, saving);
  return saving;
}

export type StatsPeriod = 'week' | 'month' | 'all';
export type ListeningSummary = {seconds: number; plays: number; tracks: number; activeDays: number; artists: number; lastAt: number | null};
export type ListeningDay = {day: string; seconds: number; plays: number};
export type ListeningRank = {id: string; title: string; artist: string; artwork: string | null; seconds: number; plays: number};
export type PlaylistRank = {id: number; title: string; artwork: string | null; seconds: number; plays: number};
export type ListeningAnalytics = {
  period: StatsPeriod; sourceKey: string | null; asOf: number;
  summary: ListeningSummary; previousSeconds: number | null; firstRecordedAt: number | null;
  days: ListeningDay[]; topTracks: ListeningRank[]; topArtists: ListeningRank[]; playlists: PlaylistRank[];
};

export const localDateKey = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
export function shiftCalendarDay(timestamp: number, count: number) {
  const date = new Date(timestamp); date.setDate(date.getDate()+count); return date.getTime();
}
export function statsWindow(period: StatsPeriod, now = Date.now()) {
  if (!['week','month','all'].includes(period) || !Number.isFinite(now) || now < 0) throw new Error('Período de escucha inválido.');
  const days = period === 'week' ? 7 : 30;
  const today = new Date(now); today.setHours(0,0,0,0);
  const chartStart = shiftCalendarDay(today.getTime(), -(days-1));
  return {
    start: period === 'all' ? 0 : chartStart, end: now+1, chartStart,
    previousStart: period === 'all' ? null : shiftCalendarDay(chartStart,-days),
    previousEnd: period === 'all' ? null : shiftCalendarDay(now,-days)+1,
    keys: Array.from({length: days}, (_,index) => localDateKey(shiftCalendarDay(chartStart,index))),
  };
}
export function completeListeningDays(keys: string[], rows: ListeningDay[]) {
  const index = new Map(rows.map(row => [row.day,row]));
  return keys.map(day => ({day,seconds: Math.max(0,index.get(day)?.seconds || 0),plays: Math.max(0,index.get(day)?.plays || 0)}));
}
export function listeningTime(seconds: number) {
  const value = Math.max(0,Math.floor(Number.isFinite(seconds) ? seconds : 0));
  if (value < 60) return `${value} s`;
  if (value < 3600) return `${Math.floor(value/60)} min`;
  return `${Math.floor(value/3600)} h ${Math.floor(value%3600/60)} min`;
}
export function listeningChange(current: number, previous: number | null) {
  if (previous === null || previous <= 0) return null;
  return Math.round((current-previous)/previous*100);
}

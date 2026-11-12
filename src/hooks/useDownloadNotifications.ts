import { useEffect, useRef } from 'react';
import { NativeModules } from 'react-native';
import type { DownloadItem } from '../types';
import { notifyChange } from '../services/feedback';

export function useDownloadNotifications(downloads: DownloadItem[]) {
  const seen = useRef(new Map<string, string>());
  useEffect(() => {
    const ids=new Set(downloads.map(item=>item.id));
    for(const id of seen.current.keys())if(!ids.has(id))seen.current.delete(id);
    for (const item of downloads) {
      const signature = `${item.state}:${Math.floor(item.progress / 5)}`;
      const previous = seen.current.get(item.id);
      if (signature === previous) continue;
      seen.current.set(item.id, signature);
      const terminal = ['done', 'error', 'cancelled'].includes(item.state);
      if (!previous && terminal) continue; // Do not notify old history on startup.
      if(terminal||item.state==='saving'||!NativeModules.WavePlayDownloader?.getDownloadJobs)NativeModules.WavePlayDownloader?.updateDownloadNotification?.(item.id, item.title, item.state, item.progress);
      if (terminal && previous) notifyChange(item.state === 'done' ? `Descarga lista: ${item.title}` : item.state === 'cancelled' ? 'Descarga cancelada' : `Error al descargar: ${item.title}`);
    }
  }, [downloads]);
}

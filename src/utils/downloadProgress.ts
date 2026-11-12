import type { DownloadItem } from '../types';

export function visibleDownloadProgress(previous: DownloadItem, progress: number, state: DownloadItem['state']) {
  const safe = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : previous.progress;
  const displayed = Math.floor(safe / 2) * 2;
  if (state === previous.state && displayed <= previous.progress) return null;
  return { ...previous, state, progress: displayed };
}

export function downloadPersistenceKey(item: DownloadItem) {
  return JSON.stringify([item.state, Math.floor(item.progress / 5), item.message, item.fileName,
    item.errorCode, item.outputTrackId, item.folderUri, item.format]);
}

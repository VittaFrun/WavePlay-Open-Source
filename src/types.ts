export type Track = {
  id: string; uri: string; filename: string; title: string; artist: string; album: string;
  duration: number; artwork?: string | null; createdAt: number; addedAt?: number; lastPlayedAt?: number; modifiedAt: number; folder?: string;
  genre?: string; mimeType?: string; bitrate?: number; sampleRate?: number; fileSize?: number;
  inLibrary?: boolean; onlinePlayback?: boolean; audioOnly?:boolean; youtubeId?: string; localTrackId?: string; downloaded?: boolean; unavailable?: boolean; source?: 'device' | 'waveplay' | 'youtube'; favorite?: boolean; playCount?: number; missing?: boolean;
};

export type RepeatMode = 'off' | 'all' | 'one';
export type PlaybackSession = {
  trackId: string | null; queueIds: string[]; originalQueueIds: string[]; currentIndex: number;
  positionSeconds: number; repeatMode: RepeatMode; shuffleEnabled: boolean; sourceKey?: string | null; sourceTrackIds?: string[]; updatedAt: number;
};

export type PlaylistStats = { playCount:number; listenedSeconds:number; lastPlayedAt:number|null; topTracks:{trackId:string;title:string;artist:string;artwork?:string|null;playCount:number;listenedSeconds:number}[] };

export type DownloadState = 'queued' | 'downloading' | 'converting' | 'embedding' | 'saving' | 'done' | 'error' | 'cancelled';
export type DownloadItem = {
  id: string; url: string; title: string; artist?: string; thumbnail?: string; quality?: number;
  folderUri?: string; format?: 'mp3'|'original'; progress: number; state: DownloadState; message?: string; fileName?: string;
  errorCode?: string; outputTrackId?: string; createdAt: number; updatedAt?: number;
};
export type Playlist = { id: number; name: string; createdAt: number; trackCount?: number; artwork?:string|null; artworks?:string[] };

export type ScanReport = { added: number; updated: number; missing: number; skipped: number; errors: number; total: number };

export type YouTubeVideo = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  publishedAt: string;
};

export type ListeningRoom = {
  id:string; hostUserId:string; inviteCode:string; name:string; status:'active'|'closed';
  createdAt:string; expiresAt:string;
  controlMode?:'host'|'collaborative';
};
export type ListeningRoomMember = {
  roomId:string; userId:string; displayName:string; role:'host'|'guest'; joinedAt:string; avatarUrl?:string|null;
};
export type SharedTrack = { key:string; title:string; artist:string; duration:number };
export type RoomPlaybackEvent = {
  revision:number; track:SharedTrack|null; positionSeconds:number; playing:boolean; sentAt:number;
};

export type RoomQueueItem = {
  id:string; roomId:string; addedBy:string; addedByName:string; title:string; artist:string;
  duration:number; filename:string; objectPath:string; artworkPath:string|null; fileSize:number;
  status:'uploading'|'ready'|'error'|'removed'; position:number; createdAt:string;
  source?:'file'|'youtube'; youtubeId?:string|null;
};
export type RoomPlaybackState = {
  revision:number; trackId:string|null; positionSeconds:number; playing:boolean; updatedAt:string;
};
export type RoomSnapshot = { room:ListeningRoom; queue:RoomQueueItem[]; playback:RoomPlaybackState; serverNow:number };
export type SharedPlaybackDelegate = {
  play(track:Track):Promise<void>; toggle():void; next():void; previous():void; seek(seconds:number):void;
  finished?():void;
};

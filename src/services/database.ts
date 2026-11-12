import { statsWindow, completeListeningDays, type StatsPeriod, type ListeningAnalytics, type ListeningSummary, type ListeningDay, type ListeningRank, type PlaylistRank } from '../utils/listeningStats';
import { onlineTrack, youtubeIdFromUrl } from '../utils/onlineTrack';
import { performanceStart } from './performance';
import { sameRecording } from '../utils/duplicates';
import * as SQLite from 'expo-sqlite';
import type { DownloadItem, PlaybackSession, Playlist, PlaylistStats, Track, YouTubeVideo } from '../types';
import { importedPlaylistName, type MuzioPlaylistPlan } from '../utils/muzio';
import { createSerialQueue } from '../utils/serialQueue';
import type { BackupTrack, WaveBackup } from '../utils/backup';

let database: Promise<SQLite.SQLiteDatabase> | null = null;
let onlineIndex:Promise<{byId:Map<string,OnlineLink>;linked:Set<string|null>}>|null=null;
type OnlineLink={trackId:string;youtubeId:string;localTrackId:string|null;uri:string|null;filename:string|null;missing:number|null;expected:string|null;inLibrary:number};
const enqueueDatabase = createSerialQueue();
const serializedMethods = new Set(['runAsync', 'execAsync', 'getAllAsync', 'getFirstAsync', 'withExclusiveTransactionAsync']);
// Exclusive transactions use another native connection. Serialize whole transactions
// alongside regular queries; their callbacks receive the unwrapped transaction.
const db = () => database ??= SQLite.openDatabaseAsync('waveplay.db').then(conn => new Proxy(conn, {
  get(target, property) {
    const value = Reflect.get(target, property, target);
    if (typeof value !== 'function') return value;
    if (serializedMethods.has(String(property))) return (...args: unknown[]) => {
      const end=performanceStart(`sqlite:${String(property)}`);
      return enqueueDatabase(async () => Reflect.apply(value, target, args)).finally(end);
    };
    return value.bind(target);
  },
}));

let initialization:Promise<void>|null=null;
export function initializeDatabase(){return initialization??=migrateDatabase().catch(error=>{initialization=null;throw error;});}
async function migrateDatabase() {
  const conn = await db();
  await conn.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY, uri TEXT NOT NULL, filename TEXT NOT NULL, title TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT 'Artista desconocido', album TEXT NOT NULL DEFAULT 'Álbum desconocido',
      duration REAL NOT NULL DEFAULT 0, artwork TEXT, created_at INTEGER NOT NULL, added_at INTEGER, modified_at INTEGER NOT NULL,
      folder TEXT, favorite INTEGER NOT NULL DEFAULT 0, play_count INTEGER NOT NULL DEFAULT 0,
      missing INTEGER NOT NULL DEFAULT 0, last_played_at INTEGER, genre TEXT, mime_type TEXT,
      bitrate INTEGER, sample_rate INTEGER, file_size INTEGER, source TEXT NOT NULL DEFAULT 'device'
    );
    CREATE TABLE IF NOT EXISTS online_tracks (track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE, youtube_id TEXT NOT NULL UNIQUE, local_track_id TEXT, local_filename TEXT, imported_from TEXT, in_library INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX IF NOT EXISTS idx_online_local ON online_tracks(local_track_id);
    CREATE TABLE IF NOT EXISTS playlists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS playlist_tracks (playlist_id INTEGER NOT NULL, track_id TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(playlist_id, track_id), FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL, artist TEXT, thumbnail TEXT,
      quality INTEGER, folder_uri TEXT, state TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0,
      message TEXT, file_name TEXT, error_code TEXT, output_track_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS play_history (id INTEGER PRIMARY KEY AUTOINCREMENT, track_id TEXT NOT NULL, played_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS listening_events (id TEXT PRIMARY KEY, track_id TEXT NOT NULL, source_key TEXT, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, listened_seconds REAL NOT NULL DEFAULT 0, counted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS queue (position INTEGER PRIMARY KEY, track_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS playback_session (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS lyrics_cache (track_id TEXT PRIMARY KEY, payload TEXT NOT NULL, source TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS duplicate_exclusions (track_id TEXT PRIMARY KEY, kept_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS duplicate_playlist_links (track_id TEXT NOT NULL, playlist_id INTEGER NOT NULL, position INTEGER NOT NULL, added_keeper INTEGER NOT NULL, PRIMARY KEY(track_id,playlist_id));
    CREATE TABLE IF NOT EXISTS scan_rules (pattern TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS hidden_tracks (uri TEXT PRIMARY KEY, track_id TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_tracks_visible_title ON tracks(missing,title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_tracks_visible_recent ON tracks(missing,COALESCE(last_played_at,created_at) DESC);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_created ON tracks(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_order ON playlist_tracks(playlist_id,position);
    CREATE INDEX IF NOT EXISTS idx_tracks_visible_created ON tracks(missing, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tracks_visible_favorite ON tracks(missing, favorite);
    CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id, played_at DESC);
    CREATE INDEX IF NOT EXISTS idx_listening_events_source ON listening_events(source_key, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_listening_events_started ON listening_events(started_at);
  `);
  const onlineColumns=await conn.getAllAsync<{name:string}>('PRAGMA table_info(online_tracks)');
  if(!onlineColumns.some(c=>c.name==='in_library'))await conn.execAsync('ALTER TABLE online_tracks ADD COLUMN in_library INTEGER NOT NULL DEFAULT 1');
  const trackColumns = await conn.getAllAsync<{name:string}>('PRAGMA table_info(tracks)');
  const trackNames = new Set(trackColumns.map(({name})=>name));
  const trackMigrations: [string,string][] = [
    ['genre','ALTER TABLE tracks ADD COLUMN genre TEXT'],
    ['mime_type','ALTER TABLE tracks ADD COLUMN mime_type TEXT'],
    ['bitrate','ALTER TABLE tracks ADD COLUMN bitrate INTEGER'],
    ['sample_rate','ALTER TABLE tracks ADD COLUMN sample_rate INTEGER'],
    ['file_size','ALTER TABLE tracks ADD COLUMN file_size INTEGER'],
    ['source',"ALTER TABLE tracks ADD COLUMN source TEXT NOT NULL DEFAULT 'device'"],
    ['added_at','ALTER TABLE tracks ADD COLUMN added_at INTEGER'],
  ];
  for (const [name,sql] of trackMigrations) if (!trackNames.has(name)) await conn.execAsync(sql);
  // Normal launches should not acquire a writer lock for a completed migration.
  if(await conn.getFirstAsync('SELECT 1 FROM tracks WHERE added_at IS NULL LIMIT 1'))
    await conn.runAsync('UPDATE tracks SET added_at=created_at WHERE added_at IS NULL');
  const downloadColumns = await conn.getAllAsync<{name:string}>('PRAGMA table_info(downloads)');
  const downloadNames = new Set(downloadColumns.map(({name})=>name));
  const downloadMigrations: [string,string][] = [
    ['format',"ALTER TABLE downloads ADD COLUMN format TEXT NOT NULL DEFAULT 'mp3'"],
    ['artist','ALTER TABLE downloads ADD COLUMN artist TEXT'],
    ['thumbnail','ALTER TABLE downloads ADD COLUMN thumbnail TEXT'],
    ['quality','ALTER TABLE downloads ADD COLUMN quality INTEGER'],
    ['folder_uri','ALTER TABLE downloads ADD COLUMN folder_uri TEXT'],
    ['file_name','ALTER TABLE downloads ADD COLUMN file_name TEXT'],
    ['error_code','ALTER TABLE downloads ADD COLUMN error_code TEXT'],
    ['output_track_id','ALTER TABLE downloads ADD COLUMN output_track_id TEXT'],
    ['updated_at','ALTER TABLE downloads ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [name,sql] of downloadMigrations) if (!downloadNames.has(name)) await conn.execAsync(sql);
  if(await conn.getFirstAsync("SELECT 1 FROM tracks WHERE artwork LIKE 'data:image/%' LIMIT 1")){
    const legacyArtwork = await conn.runAsync("UPDATE tracks SET artwork=NULL WHERE artwork LIKE 'data:image/%'");
    if (legacyArtwork.changes) await conn.execAsync('VACUUM');
  }
}

export async function upsertTracks(tracks: Track[], options:{reveal?:boolean}={}) {
  const conn = await db();
  await conn.withExclusiveTransactionAsync(async (transaction) => {
    for (const track of tracks) {
      if(options.reveal)await transaction.runAsync('DELETE FROM hidden_tracks WHERE uri=? OR track_id=?',track.uri,track.id);
      if (await transaction.getFirstAsync('SELECT uri FROM hidden_tracks WHERE uri=?', track.uri)) continue;
      await transaction.runAsync(`INSERT INTO tracks(id,uri,filename,title,artist,album,duration,artwork,created_at,added_at,modified_at,folder,missing,genre,mime_type,bitrate,sample_rate,file_size,source)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET uri=excluded.uri, filename=excluded.filename, title=excluded.title,
        artist=excluded.artist, album=excluded.album, duration=excluded.duration, artwork=COALESCE(excluded.artwork,tracks.artwork),
        modified_at=excluded.modified_at, folder=excluded.folder, genre=excluded.genre, mime_type=excluded.mime_type,
        bitrate=excluded.bitrate, sample_rate=excluded.sample_rate, file_size=excluded.file_size, source=excluded.source, missing=0`,
        track.id, track.uri, track.filename, track.title, track.artist, track.album, track.duration, track.artwork ?? null,
        track.createdAt, track.addedAt ?? Date.now(), track.modifiedAt, track.folder ?? null,track.genre??null,track.mimeType??null,track.bitrate??null,track.sampleRate??null,track.fileSize??null,track.source??'device');
    }
  });
  onlineIndex=null;
}

export type TrackInfoEdit = { title:string; artist:string; album:string; genre:string };
export async function editTrackInfo(trackId:string, info:TrackInfoEdit) {
  const title=info.title.trim();
  if(!title)throw new Error('Escribe un título para la canción.');
  const artist=info.artist.trim()||'Artista desconocido';
  const album=info.album.trim()||'Álbum desconocido';
  const genre=info.genre.trim();
  await (await db()).withExclusiveTransactionAsync(async transaction=>{
    const result=await transaction.runAsync('UPDATE tracks SET title=?,artist=?,album=?,genre=? WHERE id=?',title,artist,album,genre||null,trackId);
    if(!result.changes)throw new Error('La canción ya no está disponible.');
  });
  return {title,artist,album,genre};
}

export async function createPlaylistWithTracks(name:string, trackIds:string[]):Promise<number> {
  const conn=await db();
  let playlistId=0;
  await conn.withExclusiveTransactionAsync(async transaction=>{
    const result=await transaction.runAsync('INSERT INTO playlists(name,created_at) VALUES(?,?)',name.trim(),Date.now());
    playlistId=result.lastInsertRowId;
    for(const [index,id] of [...new Set(trackIds)].entries())
      await transaction.runAsync('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)',playlistId,id,index);
  });
  return playlistId;
}

async function removeTrackEntry(track:Track,hidden:boolean){
  await (await db()).withExclusiveTransactionAsync(async transaction => {
    if(hidden)await transaction.runAsync('INSERT OR REPLACE INTO hidden_tracks(uri,track_id) VALUES(?,?)', track.uri, track.id);
    else await transaction.runAsync('DELETE FROM hidden_tracks WHERE uri=? OR track_id=?',track.uri,track.id);
    await transaction.runAsync('UPDATE tracks SET missing=1 WHERE uri=?', track.uri);
    await transaction.runAsync('DELETE FROM queue WHERE track_id IN (SELECT id FROM tracks WHERE uri=?)', track.uri);
  });
  onlineIndex=null;
}
export async function hideTrack(track:Track){
  if(track.youtubeId){await (await db()).withExclusiveTransactionAsync(async tx=>{await tx.runAsync('UPDATE online_tracks SET in_library=0 WHERE track_id=?',track.id);await tx.runAsync('UPDATE tracks SET favorite=0 WHERE id=?',track.id);});onlineIndex=null;return;}
  return removeTrackEntry(track,true);
}
/** A deleted file may return later; deletion must not create a permanent exclusion. */
export function markTrackDeleted(track:Track){return removeTrackEntry(track,false);}

export async function downloadedLibraryAssets():Promise<{assetId:string;fileName:string}[]>{
  return (await db()).getAllAsync<{assetId:string;fileName:string}>("SELECT output_track_id assetId,file_name fileName FROM downloads WHERE state='done' AND output_track_id IS NOT NULL AND file_name IS NOT NULL UNION SELECT local_track_id assetId,local_filename fileName FROM online_tracks WHERE local_track_id IS NOT NULL AND local_filename IS NOT NULL");
}

export async function restoreHiddenTracks() {
  // Only a fresh scan decides whether the audio files still exist.
  await (await db()).runAsync('DELETE FROM hidden_tracks');
}

export async function listTracks(search = '', deviceScan = false, includeCatalog = false): Promise<Track[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<any>(`SELECT id,uri,filename,title,artist,album,duration,artwork,created_at createdAt,added_at addedAt,last_played_at lastPlayedAt,modified_at modifiedAt,folder,favorite,play_count playCount,missing,genre,mime_type mimeType,bitrate,sample_rate sampleRate,file_size fileSize,source FROM tracks WHERE missing=0 ${search?'AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)':''} ORDER BY title COLLATE NOCASE`, ...(search?[`%${search}%`,`%${search}%`,`%${search}%`]:[]));
  const mapped=rows.map((r) => ({ ...r, favorite: Boolean(r.favorite), missing: Boolean(r.missing) }));
  if(deviceScan)return mapped.filter(t=>t.source!=='youtube');
  const hydrated=await hydrateOnlineTracks(mapped);return includeCatalog?hydrated:hydrated.filter(t=>t.inLibrary!==false);
}

export async function recentTracks(limit = 12): Promise<Track[]> {
  const conn = await db();
  return hydrateOnlineTracks(await conn.getAllAsync<any>(`SELECT id,uri,filename,title,artist,album,duration,artwork,created_at createdAt,modified_at modifiedAt,folder,favorite,play_count playCount,source FROM tracks WHERE missing=0 ORDER BY COALESCE(last_played_at,created_at) DESC LIMIT ?`, limit));
}

export async function favoriteTracks(limit = 30): Promise<Track[]> {
  return hydrateOnlineTracks(await (await db()).getAllAsync<any>(`SELECT id,uri,filename,title,artist,album,duration,artwork,created_at createdAt,modified_at modifiedAt,folder,favorite,play_count playCount,missing,genre,mime_type mimeType,bitrate,sample_rate sampleRate,file_size fileSize,source FROM tracks WHERE missing=0 AND favorite=1 ORDER BY COALESCE(last_played_at,created_at) DESC LIMIT ?`, limit));
}

export async function mostPlayedTracks(limit = 30): Promise<Track[]> {
  return hydrateOnlineTracks(await (await db()).getAllAsync<any>(`SELECT id,uri,filename,title,artist,album,duration,artwork,created_at createdAt,modified_at modifiedAt,folder,favorite,play_count playCount,missing,genre,mime_type mimeType,bitrate,sample_rate sampleRate,file_size fileSize,source FROM tracks WHERE missing=0 AND play_count>0 ORDER BY play_count DESC,COALESCE(last_played_at,created_at) DESC LIMIT ?`, limit));
}

export async function recentlyPlayedTracks(limit = 100): Promise<Track[]> {
  const rows = await (await db()).getAllAsync<any>(`SELECT t.id,t.uri,t.filename,t.title,t.artist,t.album,t.duration,t.artwork,t.created_at createdAt,t.added_at addedAt,t.last_played_at lastPlayedAt,t.modified_at modifiedAt,t.folder,t.favorite,t.play_count playCount,t.missing,t.genre,t.mime_type mimeType,t.bitrate,t.sample_rate sampleRate,t.file_size fileSize,t.source
    FROM tracks t WHERE t.missing=0 AND t.last_played_at IS NOT NULL ORDER BY t.last_played_at DESC LIMIT ?`,limit);
  return hydrateOnlineTracks(rows.map(row=>({...row,favorite:Boolean(row.favorite),missing:Boolean(row.missing)})));
}

export async function recordListening(eventId:string, trackId:string, sourceKey:string|null, startedAt:number, listenedSeconds:number, thresholdSeconds:number) {
  if(listenedSeconds<=0)return false;
  const conn=await db();let newlyCounted=false;
  await conn.withExclusiveTransactionAsync(async transaction=>{
    const previous=await transaction.getFirstAsync<{listened_seconds:number;counted:number}>('SELECT listened_seconds,counted FROM listening_events WHERE id=?',eventId);
    const total=(previous?.listened_seconds||0)+listenedSeconds;
    const counted=Boolean(previous?.counted)||total>=thresholdSeconds;
    const now=Date.now();
    await transaction.runAsync(`INSERT INTO listening_events(id,track_id,source_key,started_at,updated_at,listened_seconds,counted) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,listened_seconds=excluded.listened_seconds,counted=excluded.counted`,eventId,trackId,sourceKey,startedAt,now,total,counted?1:0);
    if(counted&&!previous?.counted){
      newlyCounted=true;
      await transaction.runAsync('UPDATE tracks SET play_count=play_count+1,last_played_at=? WHERE id=?',now,trackId);
      await transaction.runAsync('INSERT INTO play_history(track_id,played_at) VALUES(?,?)',trackId,now);
    }
  });
  return newlyCounted;
}

export async function listeningTotal():Promise<number>{
  const total=await (await db()).getFirstAsync<{seconds:number}>('SELECT COALESCE(SUM(listened_seconds),0) seconds FROM listening_events');
  return total?.seconds||0;
}

export async function playlistStats(sourceKey:string):Promise<PlaylistStats>{
  const conn=await db();
  const total=await conn.getFirstAsync<{playCount:number;listenedSeconds:number;lastPlayedAt:number|null}>(`SELECT COALESCE(SUM(counted),0) playCount,COALESCE(SUM(listened_seconds),0) listenedSeconds,MAX(CASE WHEN counted=1 THEN updated_at END) lastPlayedAt FROM listening_events WHERE source_key=?`,sourceKey);
  const topTracks=await conn.getAllAsync<PlaylistStats['topTracks'][number]>(`SELECT e.track_id trackId,COALESCE(t.title,'Canción no disponible') title,COALESCE(t.artist,'') artist,t.artwork artwork,SUM(e.counted) playCount,SUM(e.listened_seconds) listenedSeconds FROM listening_events e LEFT JOIN tracks t ON t.id=e.track_id WHERE e.source_key=? GROUP BY e.track_id ORDER BY listenedSeconds DESC LIMIT 5`,sourceKey);
  return {playCount:total?.playCount||0,listenedSeconds:total?.listenedSeconds||0,lastPlayedAt:total?.lastPlayedAt||null,topTracks};
}

/**
 * Runs only after a complete device scan.  Marking every track as missing at
 * the beginning of a scan made a transient MediaStore/metadata error hide a
 * user's whole library.  Keeping the previous index until the scan succeeds
 * makes scanning safely retryable.
 */
export async function markTracksMissingExcept(seenTrackIds: string[], initialTrackIds?:readonly string[]) {
  const conn = await db();
  const seen = new Set(seenTrackIds);
  const current = await conn.getAllAsync<{ id: string }>("SELECT id FROM tracks WHERE missing=0 AND source='device'");
  const initial=initialTrackIds?new Set(initialTrackIds):null;
  const missing = current.filter(({ id }) => !seen.has(id)&&(!initial||initial.has(id))).map(({ id }) => id);
  if (!missing.length) return;
  await conn.withExclusiveTransactionAsync(async (transaction) => {
    for (const id of missing) await transaction.runAsync('UPDATE tracks SET missing=1 WHERE id=?', id);
  });
  onlineIndex=null;
}
export async function toggleFavorite(id: string) { await (await db()).runAsync('UPDATE tracks SET favorite=CASE favorite WHEN 1 THEN 0 ELSE 1 END WHERE id=?', id); }
export async function recordPlay(id: string) {
  const conn = await db(); const now = Date.now();
  await conn.withExclusiveTransactionAsync(async transaction=>{
    await transaction.runAsync('UPDATE tracks SET play_count=play_count+1,last_played_at=? WHERE id=?', now, id);
    await transaction.runAsync('INSERT INTO play_history(track_id,played_at) VALUES(?,?)', id, now);
  });
}
export async function saveQueue(ids: string[]) {
  const conn = await db();
  await conn.withExclusiveTransactionAsync(async transaction => {
    await transaction.runAsync('DELETE FROM queue');
    // Bound parameter count and native crossings without changing atomicity.
    for(let offset=0;offset<ids.length;offset+=100){
      const batch=ids.slice(offset,offset+100);
      await transaction.runAsync(`INSERT INTO queue(position,track_id) VALUES ${batch.map(()=>'(?,?)').join(',')}`,
        ...batch.flatMap((id,index)=>[offset+index,id]));
    }
  });
}
export async function loadQueue(): Promise<string[]> { return (await (await db()).getAllAsync<{track_id:string}>('SELECT track_id FROM queue ORDER BY position')).map(r=>r.track_id); }
/** Queue and checkpoint commit together; progress-only saves do not rewrite the queue. */
export async function savePlaybackSession(session: PlaybackSession, replaceQueue=false) {
  const conn=await db();
  await conn.withExclusiveTransactionAsync(async transaction=>{
    if(replaceQueue){
      await transaction.runAsync('DELETE FROM queue');
      for(let offset=0;offset<session.queueIds.length;offset+=100){
        const batch=session.queueIds.slice(offset,offset+100);
        await transaction.runAsync(`INSERT INTO queue(position,track_id) VALUES ${batch.map(()=>'(?,?)').join(',')}`,...batch.flatMap((id,index)=>[offset+index,id]));
      }
    }
    await transaction.runAsync('INSERT INTO playback_session(id,payload,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',JSON.stringify(session),Date.now());
  });
}
export async function loadPlaybackSession(): Promise<PlaybackSession | null> {
  const row = await (await db()).getFirstAsync<{payload:string}>('SELECT payload FROM playback_session WHERE id=1');
  if (!row?.payload) return null;
  try { return JSON.parse(row.payload) as PlaybackSession; } catch { return null; }
}

export async function saveDownload(item: DownloadItem) {
  const now = Date.now();
  await (await db()).runAsync(`INSERT INTO downloads(id,url,title,artist,thumbnail,quality,folder_uri,state,progress,message,file_name,error_code,output_track_id,created_at,updated_at,format)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET format=excluded.format,title=excluded.title,artist=excluded.artist,thumbnail=excluded.thumbnail,quality=excluded.quality,folder_uri=excluded.folder_uri,state=excluded.state,progress=excluded.progress,message=excluded.message,file_name=excluded.file_name,error_code=excluded.error_code,output_track_id=excluded.output_track_id,updated_at=excluded.updated_at`,
    item.id,item.url,item.title,item.artist??null,item.thumbnail??null,item.quality??null,item.folderUri??null,item.state,item.progress,item.message??null,item.fileName??null,item.errorCode??null,item.outputTrackId??null,item.createdAt,item.updatedAt??now,item.format||'mp3');
}
export async function listDownloads(): Promise<DownloadItem[]> {
  const rows = await (await db()).getAllAsync<any>('SELECT id,url,title,artist,thumbnail,quality,format,folder_uri folderUri,state,progress,message,file_name fileName,error_code errorCode,output_track_id outputTrackId,created_at createdAt,updated_at updatedAt FROM downloads ORDER BY created_at DESC');
  return rows as DownloadItem[];
}
export async function clearFinishedDownloads() {
  await (await db()).runAsync("DELETE FROM downloads WHERE state IN ('done','cancelled')");
}
export async function removeDownload(id:string) {
  await (await db()).runAsync('DELETE FROM downloads WHERE id=?',id);
}
export async function createPlaylist(name: string) { await (await db()).runAsync('INSERT INTO playlists(name,created_at) VALUES(?,?)', name.trim(), Date.now()); }
export async function importMuzioPlaylists(plans: MuzioPlaylistPlan[]) {
  const result = { playlists: 0, added: 0, favorites: 0, unavailable: 0 };
  const conn = await db();
  await conn.withExclusiveTransactionAsync(async transaction => {
    const available = new Set((await transaction.getAllAsync<{id:string}>('SELECT id FROM tracks WHERE missing=0')).map(track => track.id));
    const existing = await transaction.getAllAsync<{id:number;name:string}>('SELECT id,name FROM playlists');
    for (const plan of plans) {
      const ids = [...new Set(plan.trackIds)].filter(id => { if (available.has(id)) return true; result.unavailable++; return false; });
      if (plan.favorites) {
        for (const id of ids) {
          const row = await transaction.runAsync('UPDATE tracks SET favorite=1 WHERE id=? AND favorite=0', id);
          result.favorites += row.changes;
        }
        continue;
      }
      const mapped = await transaction.getFirstAsync<{value:string}>('SELECT value FROM settings WHERE key=?', plan.sourceKey);
      let playlistId = Number(mapped?.value);
      if (!existing.some(playlist => playlist.id === playlistId)) {
        const name = importedPlaylistName(plan.name, existing.map(playlist => playlist.name));
        const row = await transaction.runAsync('INSERT INTO playlists(name,created_at) VALUES(?,?)', name, Date.now());
        playlistId = row.lastInsertRowId; existing.push({ id: playlistId, name }); result.playlists++;
        await transaction.runAsync('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', plan.sourceKey, String(playlistId));
      }
      const last = await transaction.getFirstAsync<{position:number|null}>('SELECT MAX(position) position FROM playlist_tracks WHERE playlist_id=?', playlistId);
      let position = (last?.position ?? -1) + 1;
      for (const id of ids) {
        const row = await transaction.runAsync('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)', playlistId, id, position);
        if (row.changes) { position++; result.added++; }
      }
    }
  });
  return result;
}
export async function listPlaylists(): Promise<Playlist[]> {
  const rows=await (await db()).getAllAsync<Playlist & {artworkMosaic:string|null}>(`
    SELECT p.id,p.name,p.created_at createdAt,COUNT(pt.track_id) trackCount,
      (SELECT t.artwork FROM playlist_tracks first_track JOIN tracks t ON t.id=first_track.track_id
       WHERE first_track.playlist_id=p.id AND t.missing=0 AND t.artwork IS NOT NULL
       ORDER BY first_track.position LIMIT 1) artwork,
      (SELECT GROUP_CONCAT(artwork,char(31)) FROM (
        SELECT DISTINCT t.artwork artwork FROM playlist_tracks cover
        JOIN tracks t ON t.id=cover.track_id
        WHERE cover.playlist_id=p.id AND t.missing=0 AND t.artwork IS NOT NULL AND t.artwork<>''
        ORDER BY cover.position LIMIT 4
      )) artworkMosaic
    FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id=p.id
    GROUP BY p.id ORDER BY p.created_at DESC
  `);
  return rows.map(({artworkMosaic,...playlist})=>({...playlist,artworks:artworkMosaic?.split('\u001F')??[]}));
}
export async function renamePlaylist(playlistId:number,name:string) {
  const next=name.trim();
  if(!next||next.length>80)throw new Error('El nombre debe tener entre 1 y 80 caracteres.');
  const result=await (await db()).runAsync('UPDATE playlists SET name=? WHERE id=?',next,playlistId);
  if(!result.changes)throw new Error('La playlist ya no existe.');
}
export async function listPlaylistTracks(playlistId: number): Promise<Track[]> {
  const rows = await (await db()).getAllAsync<any>(`
    SELECT t.id,t.uri,t.filename,t.title,t.artist,t.album,t.duration,t.artwork,
      t.created_at createdAt,t.modified_at modifiedAt,t.folder,t.favorite,
      t.play_count playCount,t.missing,t.source
    FROM playlist_tracks pt
    JOIN tracks t ON t.id=pt.track_id
    WHERE pt.playlist_id=? AND t.missing=0
    ORDER BY pt.position ASC
  `, playlistId);
  return hydrateOnlineTracks(rows.map((row) => ({ ...row, favorite: Boolean(row.favorite), missing: Boolean(row.missing) })));
}
export async function addTracksToPlaylist(playlistId: number, trackIds: string[]) {
  if (!trackIds.length) return;
  const conn = await db();
  await conn.withExclusiveTransactionAsync(async (transaction) => {
    const last = await transaction.getFirstAsync<{position:number}>('SELECT MAX(position) position FROM playlist_tracks WHERE playlist_id=?', playlistId);
    let position = (last?.position ?? -1) + 1;
    for (const trackId of [...new Set(trackIds)]) {
      const result = await transaction.runAsync('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)', playlistId, trackId, position);
      if (result.changes) position += 1;
    }
  });
}
export async function removeTrackFromPlaylist(playlistId: number, trackId: string) {
  const conn = await db();
  await conn.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?', playlistId, trackId);
    const rows = await transaction.getAllAsync<{track_id:string}>('SELECT track_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position', playlistId);
    for (let index = 0; index < rows.length; index += 1) {
      await transaction.runAsync('UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND track_id=?', index, playlistId, rows[index].track_id);
    }
  });
}
export async function removeTracksFromPlaylist(playlistId:number,trackIds:string[]) {
  const unique=[...new Set(trackIds)];
  if(!unique.length)return;
  const conn=await db();
  await conn.withExclusiveTransactionAsync(async transaction=>{
    for(const trackId of unique)await transaction.runAsync('DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?',playlistId,trackId);
    const rows=await transaction.getAllAsync<{track_id:string}>('SELECT track_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position',playlistId);
    for(let index=0;index<rows.length;index++)await transaction.runAsync('UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND track_id=?',index,playlistId,rows[index].track_id);
  });
}
export async function reorderPlaylistTracks(playlistId: number, trackIds: string[]) {
  const conn = await db();
  await conn.withExclusiveTransactionAsync(async (transaction) => {
    // Expo creates a separate connection for this transaction. Its busy timeout
    // is not inherited from the main connection. Reserve the writer before
    // reading so a concurrent writer cannot invalidate our read snapshot.
    await transaction.execAsync('PRAGMA busy_timeout = 1500');
    await transaction.runAsync('UPDATE playlist_tracks SET position=position WHERE playlist_id=? AND 0',playlistId);
    const existing=await transaction.getAllAsync<{track_id:string;position:number}>('SELECT track_id,position FROM playlist_tracks WHERE playlist_id=? ORDER BY position',playlistId);
    const original=existing.map(row=>row.track_id);
    const originalSet=new Set(original);
    const requested=new Set(trackIds);
    if(requested.size!==trackIds.length||trackIds.some(id=>!originalSet.has(id)))throw new Error('La playlist cambió durante la edición.');
    const final=[...trackIds,...original.filter(id=>!requested.has(id))];
    const positions=new Map(existing.map(row=>[row.track_id,row.position]));
    const changed=final.map((id,index)=>({id,index})).filter(row=>positions.get(row.id)!==row.index);
    const temporaryBase=existing.reduce((max,row)=>Math.max(max,row.position),final.length)+1;
    // Two phases keep intermediate positions distinct. Batch only changed rows
    // so a short drag does not make hundreds of native database round trips.
    for(const temporary of [true,false])for(let start=0;start<changed.length;start+=100){
      const batch=changed.slice(start,start+100);
      const cases=batch.map(()=> 'WHEN ? THEN ?').join(' ');
      const ids=batch.map(row=>row.id);
      const values=batch.flatMap(row=>[row.id,temporary?temporaryBase+row.index:row.index]);
      await transaction.runAsync(`UPDATE playlist_tracks SET position=CASE track_id ${cases} ELSE position END WHERE playlist_id=? AND track_id IN (${ids.map(()=>'?').join(',')})`,...values,playlistId,...ids);
    }
  });
}
export async function deletePlaylist(playlistId: number) { await (await db()).runAsync('DELETE FROM playlists WHERE id=?', playlistId); }
export async function setting(key: string) { return (await db()).getFirstAsync<{value:string}>('SELECT value FROM settings WHERE key=?', key); }
export async function setSetting(key: string, value: string) { await (await db()).runAsync('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value); }

const backupTrackColumns = 'id,filename,title,artist,album,duration,file_size fileSize,favorite,play_count playCount,last_played_at lastPlayedAt,artwork,(SELECT youtube_id FROM online_tracks WHERE track_id=tracks.id) youtubeId,(SELECT in_library FROM online_tracks WHERE track_id=tracks.id) inLibrary';
function restoredPlaylistName(name:string,existing:string[]) {
  if(!existing.some(value=>value.toLocaleLowerCase()===name.toLocaleLowerCase()))return name;
  let suffix=2;
  while(existing.some(value=>value.toLocaleLowerCase()===`${name} (${suffix})`.toLocaleLowerCase()))suffix++;
  return `${name} (${suffix})`;
}
export async function exportBackupData(): Promise<Omit<WaveBackup, 'format' | 'version' | 'createdAt' | 'settings' | 'lyrics'>> {
  const conn = await db();
  let result!: Omit<WaveBackup, 'format' | 'version' | 'createdAt' | 'settings' | 'lyrics'>;
  await conn.withExclusiveTransactionAsync(async tx => {
    const rows = await tx.getAllAsync<Omit<BackupTrack,'favorite'> & {favorite:number}>(`SELECT ${backupTrackColumns} FROM tracks WHERE NOT EXISTS(SELECT 1 FROM online_tracks o WHERE o.local_track_id=tracks.id)`);
    const playlists = await tx.getAllAsync<{id:number;name:string;createdAt:number}>('SELECT id,name,created_at createdAt FROM playlists ORDER BY created_at');
    const links = await tx.getAllAsync<{playlistId:number;trackId:string}>('SELECT playlist_id playlistId,track_id trackId FROM playlist_tracks ORDER BY playlist_id,position');
    const history = await tx.getAllAsync<{trackId:string;playedAt:number}>('SELECT track_id trackId,played_at playedAt FROM play_history ORDER BY id');
    const listening = await tx.getAllAsync<{id:string;trackId:string;sourceKey:string|null;startedAt:number;updatedAt:number;listenedSeconds:number;counted:number}>('SELECT id,track_id trackId,source_key sourceKey,started_at startedAt,updated_at updatedAt,listened_seconds listenedSeconds,counted FROM listening_events');
    const known = new Set(rows.map(row => row.id));
    const members=new Map<number,string[]>();for(const link of links){if(!known.has(link.trackId))continue;const ids=members.get(link.playlistId)||[];ids.push(link.trackId);members.set(link.playlistId,ids);}
    result = {
      tracks: rows.map(row => ({...row,...(row.youtubeId?{inLibrary:Boolean(row.inLibrary)}:{inLibrary:undefined}),favorite:Boolean(row.favorite)})),
      playlists: playlists.map(p => ({name:p.name,createdAt:p.createdAt,trackIds:members.get(p.id)||[]})),
      history: history.filter(h=>known.has(h.trackId)),
      listening: listening.filter(e=>known.has(e.trackId)).map(e=>({...e,counted:Boolean(e.counted)})),
    };
  });
  return result;
}

export async function restoreBackupData(backup: WaveBackup, mode: 'merge' | 'replace') {
  const {matchBackupTrack,backupTrackKey}=await import('../utils/backup');
  const conn = await db();
  const summary = {playlists:0,matched:0,missing:0};
  const mappings: {from:string;to:string}[] = [];
  await conn.withExclusiveTransactionAsync(async tx => {
    const receipt = `waveplay.backup.import.${backup.createdAt}`;
    if (mode === 'merge' && await tx.getFirstAsync('SELECT 1 FROM settings WHERE key=?',receipt))
      throw new Error('Este respaldo ya fue importado. Puedes usar Reemplazar para aplicarlo de nuevo.');
    const verifiedLinks=await tx.getAllAsync<{youtubeId:string;assetId:string;fileName:string}>(`SELECT o.youtube_id youtubeId,o.local_track_id assetId,o.local_filename fileName FROM online_tracks o JOIN tracks t ON t.id=o.local_track_id WHERE t.missing=0 AND t.filename=o.local_filename`);
    const live = await tx.getAllAsync<BackupTrack>(`SELECT ${backupTrackColumns} FROM tracks WHERE missing=0`);
    const buckets = new Map<string,BackupTrack[]>();
    for(const row of live){if(row.youtubeId)continue;const key=backupTrackKey(row);const group=buckets.get(key)||[];group.push(row);buckets.set(key,group);}
    if (mode === 'replace') {
      await tx.runAsync('DELETE FROM playlist_tracks'); await tx.runAsync('DELETE FROM playlists');
      await tx.runAsync('DELETE FROM play_history'); await tx.runAsync('DELETE FROM listening_events');
      await tx.runAsync('UPDATE tracks SET favorite=0,play_count=0,last_played_at=NULL');
      await tx.runAsync("DELETE FROM tracks WHERE id LIKE 'backup:%' OR source='youtube'");
      await tx.runAsync("DELETE FROM settings WHERE key LIKE 'waveplay.backup.import.%'");
    }
    const existingNames = (await tx.getAllAsync<{name:string}>('SELECT name FROM playlists')).map(p=>p.name);
    const map = new Map<string,string>();
    for(const [index,saved] of backup.tracks.entries()) {
      if(saved.youtubeId){
        const id=`youtube:${saved.youtubeId}`;map.set(saved.id,id);mappings.push({from:saved.id,to:id});summary.matched++;
        await tx.runAsync(`INSERT INTO tracks(id,uri,filename,title,artist,album,duration,artwork,created_at,added_at,modified_at,source,favorite,play_count,last_played_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'youtube',?,?,?) ON CONFLICT(id) DO UPDATE SET missing=0,favorite=MAX(favorite,excluded.favorite),play_count=MAX(play_count,excluded.play_count),last_played_at=MAX(COALESCE(last_played_at,0),COALESCE(excluded.last_played_at,0))`,id,`https://www.youtube.com/watch?v=${saved.youtubeId}`,'',saved.title,saved.artist,saved.album,saved.duration,saved.artwork??null,backup.createdAt,backup.createdAt,backup.createdAt,saved.favorite?1:0,saved.playCount,saved.lastPlayedAt??null);
        await tx.runAsync('INSERT INTO online_tracks(track_id,youtube_id,in_library) VALUES(?,?,?) ON CONFLICT(track_id) DO UPDATE SET in_library=MAX(in_library,excluded.in_library)',id,saved.youtubeId,saved.inLibrary===false?0:1);
        const link=verifiedLinks.find(l=>l.youtubeId===saved.youtubeId);if(link)await tx.runAsync('UPDATE online_tracks SET local_track_id=?,local_filename=? WHERE track_id=?',link.assetId,link.fileName,id);continue;
      }
      const key=backupTrackKey(saved);
      const matched=matchBackupTrack(saved,buckets.get(key)||[]);
      const id=matched||`backup:${backup.createdAt}:${index}`;
      map.set(saved.id,id);mappings.push({from:saved.id,to:id});
      if(matched){summary.matched++;await tx.runAsync('UPDATE tracks SET favorite=MAX(favorite,?),play_count=MAX(play_count,?),last_played_at=MAX(COALESCE(last_played_at,0),?) WHERE id=?',saved.favorite?1:0,saved.playCount,saved.lastPlayedAt||0,id);}
      else {
        summary.missing++;
        await tx.runAsync(`INSERT OR IGNORE INTO tracks(id,uri,filename,title,artist,album,duration,created_at,modified_at,favorite,play_count,last_played_at,missing,file_size,source)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,'device')`,id,`waveplay-backup://${id}`,saved.filename,saved.title,saved.artist,saved.album,saved.duration,backup.createdAt,backup.createdAt,saved.favorite?1:0,saved.playCount,saved.lastPlayedAt||null,saved.fileSize||null);
      }
    }
    for(const playlist of backup.playlists){
      const name=mode==='merge'?restoredPlaylistName(playlist.name,existingNames):playlist.name;
      existingNames.push(name);
      const created=await tx.runAsync('INSERT INTO playlists(name,created_at) VALUES(?,?)',name,playlist.createdAt);
      summary.playlists++;
      for(const [position,oldId] of playlist.trackIds.entries()) await tx.runAsync('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)',created.lastInsertRowId,map.get(oldId)!,position);
    }
    for(const h of backup.history) await tx.runAsync('INSERT INTO play_history(track_id,played_at) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM play_history WHERE track_id=? AND played_at=?)',map.get(h.trackId)!,h.playedAt,map.get(h.trackId)!,h.playedAt);
    for(const e of backup.listening) await tx.runAsync('INSERT OR IGNORE INTO listening_events(id,track_id,source_key,started_at,updated_at,listened_seconds,counted) VALUES(?,?,?,?,?,?,?)',e.id,map.get(e.trackId)!,e.sourceKey,e.startedAt,e.updatedAt,e.listenedSeconds,e.counted?1:0);
    await tx.runAsync('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)',receipt,String(Date.now()));
  });
  onlineIndex=null;
  return {...summary,mappings};
}

export async function repairBackupTracks():Promise<{from:string;to:string}[]> {
  const {matchBackupTrack,backupTrackKey}=await import('../utils/backup');
  const conn=await db();const repaired:{from:string;to:string}[]=[];
  await conn.withExclusiveTransactionAsync(async tx=>{
    const missing=await tx.getAllAsync<BackupTrack>(`SELECT ${backupTrackColumns} FROM tracks WHERE id LIKE 'backup:%' AND missing=1`);
    if(!missing.length)return;
    const live=await tx.getAllAsync<BackupTrack>(`SELECT ${backupTrackColumns} FROM tracks WHERE missing=0`);
    const buckets=new Map<string,BackupTrack[]>();for(const row of live){if(row.youtubeId)continue;const key=backupTrackKey(row);const group=buckets.get(key)||[];group.push(row);buckets.set(key,group);}
    for(const saved of missing){
      const to=matchBackupTrack(saved,buckets.get(backupTrackKey(saved))||[]);if(!to)continue;
      const links=await tx.getAllAsync<{playlistId:number;position:number}>('SELECT playlist_id playlistId,position FROM playlist_tracks WHERE track_id=?',saved.id);
      for(const link of links)await tx.runAsync('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)',link.playlistId,to,link.position);
      await tx.runAsync('DELETE FROM playlist_tracks WHERE track_id=?',saved.id);
      await tx.runAsync('UPDATE play_history SET track_id=? WHERE track_id=?',to,saved.id);
      await tx.runAsync('UPDATE listening_events SET track_id=? WHERE track_id=?',to,saved.id);
      await tx.runAsync('UPDATE tracks SET favorite=MAX(favorite,?),play_count=MAX(play_count,?),last_played_at=MAX(COALESCE(last_played_at,0),?) WHERE id=?',saved.favorite?1:0,saved.playCount,saved.lastPlayedAt||0,to);
      await tx.runAsync('DELETE FROM tracks WHERE id=?',saved.id);repaired.push({from:saved.id,to});
    }
  });
  return repaired;
}


export async function excludedDuplicateIds():Promise<string[]> {
  return (await (await db()).getAllAsync<{track_id:string}>('SELECT track_id FROM duplicate_exclusions')).map(row=>row.track_id);
}
export async function hideDuplicates(keepId:string,removeIds:string[]):Promise<string[]> {
  const removed:string[]=[];
  await (await db()).withExclusiveTransactionAsync(async transaction=>{
    const query='SELECT id,uri,title,artist,duration,file_size fileSize,missing FROM tracks WHERE id=?';
    const keep=await transaction.getFirstAsync<Track>(query,keepId);
    if(!keep||keep.missing)throw new Error('La copia seleccionada ya no está disponible.');
    for(const id of new Set(removeIds)) {
      const copy=await transaction.getFirstAsync<Track>(query,id);
      if(!copy||copy.missing||!sameRecording(keep,copy))continue;
      const links=await transaction.getAllAsync<{playlist_id:number;position:number}>('SELECT playlist_id,position FROM playlist_tracks WHERE track_id=?',id);
      for(const link of links) {
        const result=await transaction.runAsync('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)',link.playlist_id,keepId,link.position);
        await transaction.runAsync('INSERT INTO duplicate_playlist_links(track_id,playlist_id,position,added_keeper) VALUES(?,?,?,?)',id,link.playlist_id,link.position,result.changes?1:0);
      }
      await transaction.runAsync('DELETE FROM playlist_tracks WHERE track_id=?',id);
      await transaction.runAsync('INSERT INTO duplicate_exclusions(track_id,kept_id) VALUES(?,?)',id,keepId);
      await transaction.runAsync('UPDATE tracks SET missing=1 WHERE id=?',id);
      removed.push(id);
    }
  });
  return removed;
}
export async function restoreDuplicates() {
  await (await db()).withExclusiveTransactionAsync(async transaction=>{
    const links=await transaction.getAllAsync<{track_id:string;playlist_id:number;position:number;added_keeper:number;kept_id:string}>('SELECT l.*,e.kept_id FROM duplicate_playlist_links l JOIN duplicate_exclusions e ON e.track_id=l.track_id');
    for(const link of links) {
      const playlist=await transaction.getFirstAsync('SELECT id FROM playlists WHERE id=?',link.playlist_id);
      if(!playlist)continue;
      if(link.added_keeper)await transaction.runAsync('DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?',link.playlist_id,link.kept_id);
      await transaction.runAsync('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)',link.playlist_id,link.track_id,link.position);
    }
    await transaction.runAsync('UPDATE tracks SET missing=0 WHERE id IN (SELECT track_id FROM duplicate_exclusions)');
    await transaction.runAsync('DELETE FROM duplicate_playlist_links');
    await transaction.runAsync('DELETE FROM duplicate_exclusions');
  });
}

/** Resolve online identities in one read, never one storage lookup per rendered row. */
export async function hydrateOnlineTracks(rows:Track[]):Promise<Track[]> {
  const {byId,linked}=await (onlineIndex??=readOnlineIndex());
  return rows.filter(row=>!linked.has(row.id)).map(row=>{
    const link=byId.get(row.id);if(!link)return row;
    const available=Boolean(link.uri&&link.missing===0&&link.filename===link.expected);
    return {...row,inLibrary:Boolean(link.inLibrary),source:'youtube',youtubeId:link.youtubeId,downloaded:available,localTrackId:available?link.localTrackId!:undefined,uri:available?link.uri!:`https://www.youtube.com/watch?v=${link.youtubeId}`,filename:available?link.filename!:'',favorite:Boolean(row.favorite)};
  });
}
async function readOnlineIndex(){
  const links=await (await db()).getAllAsync<OnlineLink>(`SELECT o.track_id trackId,o.youtube_id youtubeId,o.local_track_id localTrackId,t.uri,t.filename,t.missing,o.local_filename expected,o.in_library inLibrary FROM online_tracks o LEFT JOIN tracks t ON t.id=o.local_track_id`);
  return {byId:new Map(links.map(link=>[link.trackId,link])),linked:new Set(links.filter(l=>l.uri&&l.missing===0&&l.filename===l.expected).map(l=>l.localTrackId))};
}
export async function saveOnlineVideo(video:YouTubeVideo,saveToLibrary=true):Promise<Track> {
  await initializeDatabase();
  const track=onlineTrack(video),conn=await db();
  await conn.withExclusiveTransactionAsync(async tx=>{
    await tx.runAsync(`INSERT INTO tracks(id,uri,filename,title,artist,album,duration,artwork,created_at,added_at,modified_at,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,'youtube') ON CONFLICT(id) DO UPDATE SET title=excluded.title,artist=excluded.artist,artwork=excluded.artwork,duration=CASE WHEN excluded.duration>0 THEN excluded.duration ELSE tracks.duration END,missing=0`,track.id,track.uri,'',track.title,track.artist,track.album,track.duration,track.artwork??null,track.createdAt,track.createdAt,track.modifiedAt);
    await tx.runAsync('INSERT INTO online_tracks(track_id,youtube_id,in_library) VALUES(?,?,?) ON CONFLICT(track_id) DO UPDATE SET in_library=MAX(in_library,excluded.in_library)',track.id,video.id,saveToLibrary?1:0);
    await tx.runAsync('DELETE FROM hidden_tracks WHERE track_id=?',track.id);
  });
  onlineIndex=null;
  const saved=await conn.getFirstAsync<Track>(`SELECT id,uri,filename,title,artist,album,duration,artwork,created_at createdAt,added_at addedAt,modified_at modifiedAt,favorite,play_count playCount,last_played_at lastPlayedAt,source FROM tracks WHERE id=?`,track.id);
  return (await hydrateOnlineTracks([saved!]))[0];
}
export async function linkDownloadedVideo(url:string,assetId:string,fileName:string){
  const videoId=youtubeIdFromUrl(url);if(!videoId)return;
  const conn=await db();
  const local=await conn.getFirstAsync<Track>(`SELECT id,uri,filename,title,artist,album,duration,artwork,created_at createdAt,modified_at modifiedAt FROM tracks WHERE id=? AND missing=0 AND filename=?`,assetId,fileName);
  if(!local)return;
  const canonical=await saveOnlineVideo({id:videoId,title:local.title,channel:local.artist,thumbnail:local.artwork||'',duration:local.duration,publishedAt:''});
  await conn.withExclusiveTransactionAsync(async tx=>{
    await tx.runAsync('UPDATE online_tracks SET local_track_id=?,local_filename=? WHERE track_id=?',assetId,fileName,canonical.id);
    await tx.runAsync('UPDATE tracks SET favorite=MAX(favorite,(SELECT favorite FROM tracks WHERE id=?)),play_count=MAX(play_count,(SELECT play_count FROM tracks WHERE id=?)),last_played_at=MAX(COALESCE(last_played_at,0),COALESCE((SELECT last_played_at FROM tracks WHERE id=?),0)) WHERE id=?',assetId,assetId,assetId,canonical.id);
    const links=await tx.getAllAsync<{playlistId:number;position:number}>('SELECT playlist_id playlistId,position FROM playlist_tracks WHERE track_id=?',assetId);
    for(const link of links)await tx.runAsync('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)',link.playlistId,canonical.id,link.position);
    await tx.runAsync('DELETE FROM playlist_tracks WHERE track_id=?',assetId);
    await tx.runAsync('UPDATE play_history SET track_id=? WHERE track_id=?',canonical.id,assetId);
    await tx.runAsync('UPDATE listening_events SET track_id=? WHERE track_id=?',canonical.id,assetId);
  });
  onlineIndex=null;
}
export async function recoverOnlineDownloadLinks(){
  const conn=await db();
  const rows=await conn.getAllAsync<{url:string;assetId:string;fileName:string}>(`SELECT d.url,d.output_track_id assetId,d.file_name fileName FROM downloads d JOIN tracks t ON t.id=d.output_track_id AND t.filename=d.file_name AND t.missing=0 WHERE d.state='done' AND NOT EXISTS(SELECT 1 FROM online_tracks o WHERE o.local_track_id=t.id) ORDER BY d.created_at`);
  for(const row of rows)await linkDownloadedVideo(row.url,row.assetId,row.fileName);
}
export async function invalidateDownloadedCopy(trackId:string){
  const conn=await db();
  await conn.withExclusiveTransactionAsync(async tx=>{
    const row=await tx.getFirstAsync<{id:string}>('SELECT local_track_id id FROM online_tracks WHERE track_id=?',trackId);
    if(row?.id)await tx.runAsync('UPDATE tracks SET missing=1 WHERE id=?',row.id);
    await tx.runAsync('UPDATE online_tracks SET local_track_id=NULL,local_filename=NULL WHERE track_id=?',trackId);
  });
  onlineIndex=null;
}
export async function findImportedOnlinePlaylist(origin:string){return (await db()).getFirstAsync<{id:number;name:string}>('SELECT id,name FROM playlists WHERE id=(SELECT CAST(value AS INTEGER) FROM settings WHERE key=?)',`youtube.playlist.${origin}`);}
export async function importOnlinePlaylist(name:string,videos:YouTubeVideo[],origin:string,appendNew=false){
  await initializeDatabase();
  const unique=[...new Map(videos.map(video=>[video.id,video])).values()];
  // Network collection finishes before opening the single commit transaction.
  const conn=await db();let playlistId=0;
  await conn.withExclusiveTransactionAsync(async tx=>{
    const existing=await tx.getFirstAsync<{id:number}>('SELECT id FROM playlists WHERE id=(SELECT CAST(value AS INTEGER) FROM settings WHERE key=?)',`youtube.playlist.${origin}`);
    if(existing&&!appendNew)throw new Error('Esta playlist ya fue importada. Ábrela desde Biblioteca.');
    if(existing)playlistId=existing.id;else {const result=await tx.runAsync('INSERT INTO playlists(name,created_at) VALUES(?,?)',name.trim().slice(0,80)||'Playlist de YouTube',Date.now());playlistId=result.lastInsertRowId;}
    const known=new Set((await tx.getAllAsync<{id:string}>('SELECT track_id id FROM playlist_tracks WHERE playlist_id=?',playlistId)).map(t=>t.id));
    const last=await tx.getFirstAsync<{position:number|null}>('SELECT MAX(position) position FROM playlist_tracks WHERE playlist_id=?',playlistId);let position=(last?.position??-1)+1;
    for(const video of unique){
      const t=onlineTrack(video);
      await tx.runAsync(`INSERT OR IGNORE INTO tracks(id,uri,filename,title,artist,album,duration,artwork,created_at,added_at,modified_at,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,'youtube')`,t.id,t.uri,'',t.title,t.artist,t.album,t.duration,t.artwork??null,t.createdAt,t.createdAt,t.modifiedAt);
      await tx.runAsync('UPDATE tracks SET missing=0 WHERE id=?',t.id);
      await tx.runAsync('INSERT OR IGNORE INTO online_tracks(track_id,youtube_id,imported_from) VALUES(?,?,?)',t.id,video.id,origin);
      if(!known.has(t.id)){await tx.runAsync('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)',playlistId,t.id,position++);known.add(t.id);}
    }
    await tx.runAsync('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)',`youtube.playlist.${origin}`,String(playlistId));
  });onlineIndex=null;return playlistId;
}


/** MediaStore IDs stay unchanged: relationships and listening history need no remapping. */
export async function applyOrganizedAsset(asset:{assetId:string;uri:string;oldFileName:string;fileName:string;folder:string;modifiedAt:number;size:number}){
  const validUri=/^content:\/\/media\/[A-Za-z0-9_-]+\/audio\/media\/\d+$/.test(asset.uri)&&asset.uri.endsWith('/'+asset.assetId);
  const safeFolder=asset.folder.startsWith('Music/')&&asset.folder.endsWith('/')&&asset.folder.slice(0,-1).split('/').every(part=>part.trim()&&part!=='.'&&part!=='..'&&!/[\\:\x00-\x1f]/.test(part));
  if(!/^\d+$/.test(asset.assetId)||!validUri||!safeFolder||!asset.fileName.trim()||/[\/\\\x00-\x1f]/.test(asset.fileName)||!Number.isFinite(asset.modifiedAt)||!Number.isFinite(asset.size)||asset.size<0)throw new Error('La ubicación organizada no es válida.');
  await (await db()).withExclusiveTransactionAsync(async tx=>{
    const track=await tx.getFirstAsync<{uri:string;filename:string}>('SELECT uri,filename FROM tracks WHERE id=? AND source=\'device\'',asset.assetId);
    if(!track||![asset.oldFileName,asset.fileName].includes(track.filename))throw new Error('El archivo cambió en la biblioteca. Actualiza y continúa la revisión.');
    await tx.runAsync('UPDATE tracks SET uri=?,filename=?,folder=?,modified_at=?,file_size=?,missing=0 WHERE id=?',asset.uri,asset.fileName,asset.folder,asset.modifiedAt,asset.size,asset.assetId);
    await tx.runAsync('UPDATE online_tracks SET local_filename=? WHERE local_track_id=? AND local_filename IN (?,?)',asset.fileName,asset.assetId,asset.oldFileName,asset.fileName);
    await tx.runAsync('UPDATE downloads SET file_name=? WHERE output_track_id=? AND file_name IN (?,?)',asset.fileName,asset.assetId,asset.oldFileName,asset.fileName);
    if(track.uri!==asset.uri)await tx.runAsync('UPDATE OR IGNORE hidden_tracks SET uri=? WHERE track_id=? AND uri=?',asset.uri,asset.assetId,track.uri);
  });
  onlineIndex=null;
}


const analyticsRequests = new Map<string,Promise<ListeningAnalytics>>();
/** Bounded aggregates, one consistent read transaction; no timers or playback subscriptions. */
export function listeningAnalytics(period:StatsPeriod, sourceKey:string|null=null, now=Date.now()):Promise<ListeningAnalytics> {
  const range=statsWindow(period,now);
  if(sourceKey!==null&&!/^playlist:[1-9]\d*$/.test(sourceKey))return Promise.reject(new Error('Playlist inválida.'));
  const key=JSON.stringify([period,sourceKey,Math.floor(now/10000)]);
  const pending=analyticsRequests.get(key);if(pending)return pending;
  const request=(async()=>{
    await initializeDatabase();
    const conn=await db();
    let result:ListeningAnalytics;
    await conn.withExclusiveTransactionAsync(async tx=>{
      const source=sourceKey===null?'':' AND e.source_key=?';
      const params:(string|number)[]=[range.start,range.end,...(sourceKey===null?[]:[sourceKey])];
      const filter=`e.started_at>=? AND e.started_at<?${source} AND (e.listened_seconds>0 OR e.counted>0)`;
      const seconds='MAX(0,COALESCE(e.listened_seconds,0))';
      const plays='CASE WHEN e.counted=1 THEN 1 ELSE 0 END';
      const day="strftime('%Y-%m-%d',e.started_at/1000.0,'unixepoch','localtime')";
      const summary=await tx.getFirstAsync<ListeningSummary>(`SELECT COALESCE(SUM(${seconds}),0) seconds,COALESCE(SUM(${plays}),0) plays,COUNT(DISTINCT e.track_id) tracks,COUNT(DISTINCT ${day}) activeDays,COUNT(DISTINCT CASE WHEN TRIM(COALESCE(t.artist,''))<>'' THEN LOWER(TRIM(t.artist)) END) artists,MAX(e.updated_at) lastAt FROM listening_events e LEFT JOIN tracks t ON t.id=e.track_id WHERE ${filter}`,...params);
      const topTracks=await tx.getAllAsync<ListeningRank>(`SELECT e.track_id id,COALESCE(t.title,'Canción no disponible') title,COALESCE(t.artist,'') artist,t.artwork, SUM(${seconds}) seconds,SUM(${plays}) plays FROM listening_events e LEFT JOIN tracks t ON t.id=e.track_id WHERE ${filter} GROUP BY e.track_id ORDER BY seconds DESC,plays DESC,e.track_id LIMIT 10`,...params);
      const topArtists=await tx.getAllAsync<ListeningRank>(`SELECT LOWER(TRIM(t.artist)) id,MIN(TRIM(t.artist)) title,'' artist,NULL artwork,SUM(${seconds}) seconds,SUM(${plays}) plays FROM listening_events e JOIN tracks t ON t.id=e.track_id WHERE ${filter} AND TRIM(COALESCE(t.artist,''))<>'' GROUP BY LOWER(TRIM(t.artist)) ORDER BY seconds DESC,plays DESC,id LIMIT 6`,...params);
      // Artwork comes from the highest ranked song for that artist when available.
      for(const artist of topArtists)artist.artwork=topTracks.find(track=>track.artist.trim().toLocaleLowerCase()===artist.id)?.artwork||null;
      const chartParams=[range.chartStart,range.end,...(sourceKey===null?[]:[sourceKey])];
      const daily=await tx.getAllAsync<ListeningDay>(`SELECT ${day} day,SUM(${seconds}) seconds,SUM(${plays}) plays FROM listening_events e WHERE ${filter} GROUP BY day ORDER BY day`,...chartParams);
      const previous=range.previousStart===null?null:await tx.getFirstAsync<{seconds:number}>(`SELECT COALESCE(SUM(${seconds}),0) seconds FROM listening_events e WHERE ${filter}`,range.previousStart,range.previousEnd!,...(sourceKey===null?[]:[sourceKey]));
      const first=await tx.getFirstAsync<{at:number|null}>(`SELECT MIN(e.started_at) at FROM listening_events e WHERE e.started_at>=0 AND e.started_at<?${source} AND (e.listened_seconds>0 OR e.counted>0)`,range.end,...(sourceKey===null?[]:[sourceKey]));
      const playlists=sourceKey===null?await tx.getAllAsync<PlaylistRank>(`SELECT p.id,p.name title,(SELECT artwork FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND artwork IS NOT NULL ORDER BY pt.position LIMIT 1) artwork,SUM(${seconds}) seconds,SUM(${plays}) plays FROM listening_events e JOIN playlists p ON e.source_key='playlist:'||p.id WHERE ${filter} GROUP BY p.id ORDER BY seconds DESC,p.id LIMIT 6`,...params):[];
      result={period,sourceKey,asOf:now,summary:summary!,previousSeconds:previous?.seconds??null,firstRecordedAt:first?.at??null,days:completeListeningDays(range.keys,daily),topTracks,topArtists,playlists};
    });
    return result!;
  })();
  analyticsRequests.set(key,request);
  void request.finally(()=>{if(analyticsRequests.get(key)===request)analyticsRequests.delete(key);}).catch(()=>{});
  return request;
}

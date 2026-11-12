import { getOrganization } from './fileOrganization';
import * as MediaLibrary from "expo-media-library/legacy";
import { NativeModules } from "react-native";
import type { Track } from "../types";
import { needsMetadataRefresh, includeScannedAudio, audioFilePattern } from "../utils/scan";
import { downloadedLibraryAssets, excludedDuplicateIds, listTracks, markTracksMissingExcept, repairBackupTracks, upsertTracks } from "./database";
import { reattachSavedLyrics } from './backup';

const audioExtensions=audioFilePattern;
const cleanTitle = (filename: string) =>
  filename.replace(audioExtensions, "").replace(/[_]+/g, " ").trim();
const metadataReader = NativeModules.WavePlayDownloader;

export async function requestAudioPermission() {
  const response = await MediaLibrary.requestPermissionsAsync(false, ["audio"]);
  if (!response.granted) {
    if (!response.canAskAgain)
      throw new Error(
        "El acceso a Música está bloqueado. Actívalo en Ajustes → Apps → WavePlay → Permisos → Música y audio.",
      );
    throw new Error(
      "Debes permitir el acceso a Música y audio para escanear el teléfono.",
    );
  }
  return true;
}

export async function hasAudioPermission() {
  const response = await MediaLibrary.getPermissionsAsync(false, ["audio"]);
  return response.granted;
}

async function mapWithConcurrency<T, Result>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<Result>,
) {
  const results = new Array<Result>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

export async function scanDeviceMusic(onProgress?: (count: number) => void, options?: {full?:boolean}) {
  if(getOrganization().running||getOrganization().preparing)throw new Error('Espera a que termine la organización de archivos.');
  await requestAudioPermission();
  const indexed = new Map((await listTracks('',true)).map((track) => [track.id, track]));
  const excluded=new Set(await excludedDuplicateIds());
  const downloaded=new Map<string,Set<string>>();
  for(const {assetId,fileName} of await downloadedLibraryAssets()){
    const names=downloaded.get(assetId)||new Set<string>();names.add(fileName);downloaded.set(assetId,names);
  }
  let after: string | undefined;
  let total = 0;
  const seenTrackIds: string[] = [];
  do {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.audio,
      first: 200,
      after,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });
    // Asset.uri is already a stable MediaStore URI on Android. Avoiding one
    // getAssetInfo call per song makes large libraries much faster to index.
    const audioAssets = page.assets.filter((asset) => {
      const uri = asset.uri;
      const previous = indexed.get(asset.id);
      const knownFolder = previous?.folder || uri;
      return !excluded.has(asset.id)&&includeScannedAudio(asset,knownFolder,downloaded.get(asset.id)?.has(asset.filename));
    });
    seenTrackIds.push(...audioAssets.map(asset=>asset.id));
    total += audioAssets.length;
    const changedAssets=audioAssets.filter(asset=>needsMetadataRefresh(asset,indexed.get(asset.id),options?.full));
    const tracks = await mapWithConcurrency(changedAssets, 4, async (asset): Promise<Track> => {
      const uri = asset.uri;
      const modifiedAt = asset.modificationTime || asset.creationTime || Date.now();
      const previous = indexed.get(asset.id);
      // Full scans refresh embedded covers; routine scans only process new or changed files.
      const metadata = metadataReader?.readMetadata
        ? await metadataReader.readMetadata(uri).catch(() => null)
        : null;
      return {
        id: asset.id,
        uri,
        filename: asset.filename,
        title: metadata?.title || previous?.title || cleanTitle(asset.filename),
        artist: metadata?.artist || previous?.artist || "Artista desconocido",
        album: metadata?.album || previous?.album || "Álbum desconocido",
        genre: metadata?.genre || undefined,
        mimeType: metadata?.mimeType || undefined,
        bitrate: metadata?.bitrate || undefined,
        sampleRate: metadata?.sampleRate || undefined,
        fileSize: metadata?.fileSize || previous?.fileSize || undefined,
        source: "device",
        artwork: metadata?.artwork || previous?.artwork || null,
        duration: asset.duration || metadata?.duration || 0,
        createdAt: asset.creationTime || Date.now(),
        modifiedAt,
        folder: metadata?.folder || uri.split("/").slice(0, -1).join("/"),
      };
    });
    await upsertTracks(tracks);
    onProgress?.(total);
    after = page.hasNextPage ? page.endCursor : undefined;
  } while (after);
  // A download may register a new file while these pages are being scanned.
  // Only the library present at scan start can be declared missing here.
  await markTracksMissingExcept(seenTrackIds,[...indexed.keys()]);
  await reattachSavedLyrics(await repairBackupTracks());
  return total;
}

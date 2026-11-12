import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { NativeModules, Platform } from "react-native";
import {
  isNewRelease,
  parseAppRelease,
  type AppRelease,
} from "../utils/appRelease";
export type InstalledApp = {
  versionName: string;
  versionCode: number;
  packageName: string;
  sdk: number;
  development: boolean;
};
type UpdateNative = {
  getInfo(): Promise<InstalledApp>;
  canInstall(): Promise<boolean>;
  openPermission(): Promise<void>;
  verify(uri: string, sha: string, size: number, code: number): Promise<void>;
  install(uri: string, sha: string, size: number, code: number): Promise<void>;
};
const native =
  Platform.OS === "android"
    ? (NativeModules.WavePlayUpdates as UpdateNative | undefined)
    : undefined;
const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const LAST = "waveplay.updates.lastCheck",
  DISMISSED = "waveplay.updates.dismissed";
type State = {
  status:
    | "idle"
    | "checking"
    | "available"
    | "current"
    | "downloading"
    | "verifying"
    | "ready"
    | "error";
  release: AppRelease | null;
  installed: InstalledApp | null;
  progress: number;
  error: string | null;
};
let state: State = {
    status: "idle",
    release: null,
    installed: null,
    progress: 0,
    error: null,
  },
  request: Promise<void> | null = null,
  download: FileSystem.DownloadResumable | null = null,
  serial = 0;
let operation: Promise<void> | null = null,
  cancellation: Promise<void> | null = null;
const listeners = new Set<() => void>();
export const getAppUpdate = () => state;
export function subscribeAppUpdate(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(change: Partial<State>) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}
const directory = FileSystem.cacheDirectory + "waveplay-updates/";
const apk = directory + "update.apk";
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo completar la actualización.";
}
export async function checkAppUpdate(automatic = false) {
  if (!native || !base) {
    if (!automatic)
      publish({
        status: "error",
        error:
          "Las actualizaciones estarán disponibles en la próxima compilación de WavePlay.",
      });
    return;
  }
  if (request) return request;
  if (["downloading", "verifying", "ready"].includes(state.status)) return;
  request = (async () => {
    try {
      const installed = await native.getInfo();
      publish({ installed });
      if (automatic) {
        if (installed.development) return;
        const last = Number(await AsyncStorage.getItem(LAST));
        if (Date.now() - last < 86400000) return;
      }
      if (state.status === "idle")
        await FileSystem.deleteAsync(apk, { idempotent: true }).catch(() => {});
      publish({ status: "checking", error: null });
      const controller = new AbortController(),
        timeout = setTimeout(() => controller.abort(), 12000);
      let release: AppRelease | null;
      try {
        const response = await fetch(
          base +
            "/storage/v1/object/public/waveplay-updates/latest.json?t=" +
            Date.now(),
          { signal: controller.signal },
        );
        if (response.status === 404)
          throw new Error(
            "Todavía no se ha publicado una versión para actualizar.",
          );
        if (!response.ok)
          throw new Error("No se pudieron consultar las actualizaciones.");
        const body = await response.text();
        if (body.length > 16000)
          throw new Error("El catálogo de actualizaciones no es válido.");
        release = parseAppRelease(JSON.parse(body), base);
      } finally {
        clearTimeout(timeout);
      }
      await AsyncStorage.setItem(LAST, String(Date.now()));
      publish({
        release: release && isNewRelease(release, installed) ? release : null,
        status:
          release && isNewRelease(release, installed) ? "available" : "current",
      });
    } catch (error) {
      publish({ status: "error", error: message(error) });
    }
  })().finally(() => {
    request = null;
  });
  return request;
}
export async function shouldNotifyUpdate() {
  return (
    state.status === "available" &&
    state.release &&
    String(state.release.versionCode) !==
      (await AsyncStorage.getItem(DISMISSED))
  );
}
export async function dismissAppUpdate(versionCode = state.release?.versionCode) {
  if (versionCode)
    await AsyncStorage.setItem(DISMISSED, String(versionCode));
}
export async function downloadAppUpdate() {
  const release = state.release;
  if (
    !native ||
    !release ||
    ["downloading", "verifying"].includes(state.status)
  )
    return;
  const token = ++serial;
  publish({ status: "downloading", error: null, progress: 0 });
  const work = (async () => {
    try {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      if (token !== serial) return;
      await FileSystem.deleteAsync(apk, { idempotent: true });
      if (token !== serial) return;
      let last = 0;
      download = FileSystem.createDownloadResumable(
        release.apkUrl,
        apk,
        {},
        (event) => {
          if (token !== serial) return;
          const now = Date.now();
          if (now - last < 250) return;
          last = now;
          publish({
            progress: Math.min(1, event.totalBytesWritten / release.size),
          });
        },
      );
      const result = await download.downloadAsync();
      if (token !== serial) return;
      if (!result || result.status !== 200)
        throw new Error("No se pudo descargar el APK. Inténtalo de nuevo.");
      publish({ status: "verifying", progress: 1 });
      await native.verify(
        apk,
        release.sha256,
        release.size,
        release.versionCode,
      );
      if (token === serial) publish({ status: "ready" });
    } catch (error) {
      if (token === serial) {
        await FileSystem.deleteAsync(apk, { idempotent: true }).catch(() => {});
        publish({ status: "error", error: message(error) });
      }
    } finally {
      if (token === serial) download = null;
    }
  })();
  operation = work;
  try {
    await work;
  } finally {
    if (operation === work) operation = null;
  }
}
export function cancelAppUpdate() {
  if (cancellation) return cancellation;
  ++serial;
  const task = download,
    pending = operation;
  download = null;
  cancellation = (async () => {
    // Wait for setup/old writes too: a very early cancel must not delete a later download.
    try {
      await task?.pauseAsync();
      await pending;
      await FileSystem.deleteAsync(apk, { idempotent: true });
    } finally {
      publish({ status: state.release ? "available" : "idle", progress: 0 });
    }
  })().finally(() => {
    cancellation = null;
  });
  return cancellation;
}
export async function installAppUpdate() {
  if (!native || !state.release || state.status !== "ready") return;
  if (!(await native.canInstall())) {
    await native.openPermission();
    return;
  }
  const release = state.release;
  await native.install(apk, release.sha256, release.size, release.versionCode);
}

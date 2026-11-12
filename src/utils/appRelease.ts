export type AppRelease = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  sha256: string;
  size: number;
  notes: string;
  minSdk: number;
};
export function parseAppRelease(
  raw: unknown,
  baseUrl: string,
): AppRelease | null {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object")
    throw new Error("El catálogo de actualizaciones no es válido.");
  const item = raw as Record<string, unknown>;
  if (
    !Number.isSafeInteger(item.versionCode) ||
    (item.versionCode as number) < 1 ||
    typeof item.versionName !== "string" ||
    !item.versionName.trim() ||
    item.versionName.length > 40 ||
    typeof item.sha256 !== "string" ||
    !/^[a-f\d]{64}$/i.test(item.sha256) ||
    !Number.isSafeInteger(item.size) ||
    (item.size as number) < 1 ||
    (item.size as number) > 1073741824 ||
    typeof item.apkUrl !== "string"
  )
    throw new Error("Los datos de la actualización no son válidos.");
  const url = new URL(item.apkUrl),
    base = new URL(baseUrl);
  const storage =
    url.origin === base.origin &&
    url.pathname.startsWith("/storage/v1/object/public/waveplay-updates/");
  const eas =
    url.hostname === "expo.dev" && url.pathname.startsWith("/artifacts/eas/");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (!storage && !eas)
  )
    throw new Error("El enlace de descarga no pertenece a WavePlay.");
  if (
    item.minSdk !== undefined &&
    (!Number.isSafeInteger(item.minSdk) || (item.minSdk as number) < 1)
  )
    throw new Error("Versión de Android no válida.");
  return {
    versionCode: item.versionCode as number,
    versionName: item.versionName,
    apkUrl: url.href,
    sha256: item.sha256.toLowerCase(),
    size: item.size as number,
    notes: typeof item.notes === "string" ? item.notes.slice(0, 4000) : "",
    minSdk: typeof item.minSdk === "number" ? item.minSdk : 26,
  };
}
export function isNewRelease(
  release: AppRelease,
  installed: { versionCode: number; sdk: number },
) {
  return (
    release.versionCode > installed.versionCode &&
    release.minSdk <= installed.sdk
  );
}

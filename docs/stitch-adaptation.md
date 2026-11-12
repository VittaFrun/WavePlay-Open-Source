# WavePlay: Stitch adaptation

## Delivered behavior
- Four primary destinations: Inicio, Explorar, Biblioteca, Perfil.
- Safe-area-aware dock with the local miniplayer above navigation.
- Library modes: songs and playlists, opening directly on songs. DJ references
  are removed; existing rule-based mixes remain on Home without AI branding.
- Floating navigation uses frosted glass, an independent blur target per screen
  and a translucent selected state. Older Android versions use a tint fallback.
- Default collections above user playlists; search, sort menu and multiselect
  preserved. Shuffle uses the visible list and marks shuffle active.
- Library-only song rows use open spacing, artwork, duration and a subtle active
  state. Selection displays explicit checkboxes without changing other lists.
- Library has collection shortcuts and two-column user playlists. Covers use
  four distinct existing artwork URIs when available, otherwise one cover or
  the normal fallback. The shuffle action is a circular frosted-glass control.
- Profile uses saved songs, playlists and actual listening-event totals.
- YouTube and local search are distinct. Stale requests are discarded; online
  errors support retry. Opening the YouTube player pauses local playback.
- Native local player retains lyrics, waveform, timer, repeat and queue. Small
  screens can scroll. Playback errors offer retry and library refresh.
- Queue displays the current track and retains reorder/remove operations.
- Android lock-screen artwork accepts HTTP(S) only. In-app artwork can still use
  local URIs and has an image-load fallback.

## Verification
Run `npx expo lint`, `npx tsc --noEmit` and
`node --test tests/music.test.cjs tests/lock-screen.test.cjs`.
The Android bundle can be checked with `npx expo export --platform android`.
`tests/ui-smoke.cjs` is an optional Playwright web smoke test, not a substitute
for native tests. It requires Playwright, Edge and a SQLite-enabled preview on
port 8093. `WAVEPLAY_PLAYWRIGHT_MODULE` can identify an external Playwright install.

Implementation checks: lint and TypeScript passed; all nine music and lock-screen tests
passed; Android export and the ARM64 release APK build succeeded. The web smoke
test timed out loading Metro, so visual screenshots were not verified. The
temporary preview server was stopped. This is a test build, not an approved
production release.

This workspace has no generated Android project. The test APK is built using
the existing native project at `C:\wp`, which includes the download engine.
Its JavaScript sources are mirrored from this workspace. No native files were
edited for this redesign. Do not regenerate that native project without first
preserving its custom downloader module and build configuration.

## Native acceptance checklist
Device follow-up (2026-09-28): installed the ARM64 APK on Android model
23117RA68G without clearing app data. Found and fixed a startup crash caused by
duplicate asynchronous MediaSession activation. A single effect now owns
activation; subsequent metadata changes update the existing session. The
corrected build opens and survives a force-stop/relaunch. The initial Home
screenshot shows the restored track and artwork. Automated touch tests are
pending because the phone denies ADB input injection. Before treating this
build as release-ready, verify:
- Local playback with/without artwork, deleted files, denied permissions,
  seeking, pause, previous/next, background controls and restored sessions.
- Favorites, filtered shuffle, playlist creation/add/remove/reorder and
  persistence after restart. Listening hours must exclude pauses and seeking.
- YouTube search, online playback, offline errors and retry; downloads must use
  the existing native engine and retain Wi-Fi settings.
- Small screens, enlarged system text, keyboard-open forms, long titles and
  large libraries. The dock and shuffle action must not cover the last row.

## Deferred features
AI chat, mood/energy/BPM analysis, AI playlist generation, cloud accounts,
sync, physical file renaming and a shared online/local queue are not included.
Stitch's sample songs, counts, lossless labels and unsupported controls were not
copied into production data.

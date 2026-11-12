const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('player motion is independent from the adaptive visual fallback', () => {
  const hook = read('src/hooks/useReducedMotion.ts');
  assert.doesNotMatch(hook, /PerformanceProvider|useLightweightEffects/);
  assert.match(hook, /reduceMotion \|\| system/);
});

test('playlist quick dragging retains sticky actions and explicit reorder mode', () => {
  const screen = read('src/app/playlist/[id].tsx');
  assert.match(screen, /PlaylistInteractiveList<PlaylistListRow>/);
  assert.doesNotMatch(screen, /stickyHeaderIndices=/);
  assert.doesNotMatch(screen, /\{kind:'actions'\}|\{kind:'controls'\}/);
  assert.match(screen, /PlaylistHeader/);
  assert.match(screen, /reordering\?<.*PlaylistInteractiveList selecting=\{false\}/s);
  assert.match(screen, /Reordenar canciones/);
  assert.doesNotMatch(screen, /onScrollOffsetChange=/);
});

test('Google Drive backup code is removed while Google account login remains', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/services/drive-backup.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'android/app/src/main/java/com/waveplay/app/GoogleDriveModule.kt')), false);
  const account = read('src/app/account-backup.tsx');
  const nativePackage = read('android/app/src/main/java/com/waveplay/app/WavePlayPackage.kt');
  assert.doesNotMatch(account, /DriveBackup|Google Drive|uploadDriveBackup|downloadDriveBackup/);
  assert.match(nativePackage, /GoogleAccountModule/);
  assert.doesNotMatch(nativePackage, /GoogleDriveModule/);
});

test('Android media controls replace ten-second seeks with track and favorite actions', () => {
  const installer = read('scripts/patch-expo-audio.cjs');
  const provider = read('src/providers/WaveProvider.tsx');
  const lockScreen = read('src/utils/lockScreen.ts');
  assert.match(installer, /ICON_PREVIOUS/);
  assert.match(installer, /ICON_NEXT/);
  assert.match(installer, /ICON_HEART_FILLED/);
  assert.match(provider, /WavePlayMediaAction/);
  assert.match(provider, /toggleTrackFavorite\(active\)/);
  assert.doesNotMatch(lockScreen, /showSeekForward: true|showSeekBackward: true/);
});

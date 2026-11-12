type Metadata = { title: string; artist: string; albumTitle: string; artworkUrl?: string };
type LockScreenPlayer = {
  setActiveForLockScreen(active: boolean, metadata: Metadata, options?: { showSeekForward: boolean; showSeekBackward: boolean }): void;
  updateLockScreenMetadata(metadata: Metadata): void;
  clearLockScreenControls(): void;
};

export function createLockScreenController(player: LockScreenPlayer) {
  let active = false;
  return {
    update(metadata: Metadata) {
      // Rebuilding an already-active Android MediaSession can race its async creation.
      if (active) player.updateLockScreenMetadata(metadata);
      else {
        player.setActiveForLockScreen(true, metadata, { showSeekForward: false, showSeekBackward: false });
        active = true;
      }
    },
    clear() {
      player.clearLockScreenControls();
      active = false;
    },
  };
}

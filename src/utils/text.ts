export function displayTrackTitle(title: string) {
  // Keep source metadata intact; clean legacy "artist - title" separators only in the UI.
  return title.replace(/^\s*[-–—]\s+/, '').trim() || title;
}

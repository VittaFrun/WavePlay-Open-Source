export function leaveAppearance(navigator: { canGoBack(): boolean; back(): void; replace(path: '/(tabs)/profile'): void }) {
  if (navigator.canGoBack()) navigator.back();
  else navigator.replace('/(tabs)/profile');
}

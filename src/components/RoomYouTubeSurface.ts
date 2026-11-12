import { requireNativeComponent, type ViewProps } from 'react-native';

// Both hosts must reuse the same registration in React Native's view registry.
export const RoomYouTubeSurface = requireNativeComponent<
  ViewProps & { parking?: boolean; displayPlayer?: boolean }
>('WavePlayRoomYouTubeSurface');

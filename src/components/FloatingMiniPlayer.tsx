import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from './MiniPlayer';

export function FloatingMiniPlayer() {
  const insets=useSafeAreaInsets();
  return <View pointerEvents="box-none" style={{position:'absolute',left:20,right:20,bottom:Math.max(insets.bottom,8)}}><MiniPlayer/></View>;
}

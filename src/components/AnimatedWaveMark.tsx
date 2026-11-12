import { memo, useEffect } from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withRepeat, withTiming, cancelAnimation, Easing } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSceneActive } from '../hooks/useSceneActive';
import { useTheme } from '../theme';

const Bar = Animated.createAnimatedComponent(Rect);
function Wave({ index, active }: { index: number; active: boolean }) {
  const phase = useSharedValue(0);
  const base = [10, 20, 28, 20, 10][index];
  useEffect(() => {
    phase.value = active ? withRepeat(withTiming(1, { duration: [640,850,720,970,780][index], easing: Easing.inOut(Easing.sin) }), -1, true) : 0;
    return () => cancelAnimation(phase);
  }, [active, index, phase]);
  const props = useAnimatedProps(() => {
    const height = base * (1 - phase.value * [0.5,0.62,0.48,0.58,0.52][index]);
    return { height, y: 30 - height };
  });
  return <Bar x={2 + index * 7} width={4.5} rx={2.25} fill="url(#wave)" animatedProps={props}/>;
}
export const AnimatedWaveMark = memo(function AnimatedWaveMark({ playing }: { playing: boolean }) {
  const reduced = useReducedMotion();
  const sceneActive=useSceneActive();
  const { colors } = useTheme();
  return <Svg width={27} height={25} viewBox="0 0 35 32" accessibilityLabel="WavePlay"><Defs><LinearGradient id="wave" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={colors.purple}/><Stop offset="1" stopColor={colors.pink}/></LinearGradient></Defs>{[0,1,2,3,4].map(index => <Wave key={index} index={index} active={playing && !reduced && sceneActive}/>)}</Svg>;
});

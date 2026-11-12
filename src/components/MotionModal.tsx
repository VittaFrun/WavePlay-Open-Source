import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, View, type ModalProps, useAnimatedValue } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';

export function MotionModal({ visible = true, children, ...props }: ModalProps) {
  const reduceMotion = useReducedMotion();
  const [retained, setRetained] = useState(visible);
  const progress = useAnimatedValue(0);
  useEffect(() => {
    if (reduceMotion) { progress.stopAnimation(); return; }
    const frame = visible ? requestAnimationFrame(() => setRetained(true)) : null;
    const animation = Animated.timing(progress, { toValue: visible ? 1 : 0,
      duration: visible ? 260 : 180,
      easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start(({ finished }) => { if (finished && !visible) setRetained(false); });
    return () => { if (frame !== null) cancelAnimationFrame(frame); animation.stop(); };
  }, [visible, reduceMotion, progress]);
  if (reduceMotion) return <Modal {...props} visible={Boolean(visible)} animationType="none"><View style={{flex:1}}>{children}</View></Modal>;
  return <Modal {...props} visible={Boolean(visible || retained)} animationType="none"><Animated.View
    pointerEvents={visible ? 'auto' : 'none'} style={{ flex: 1, opacity: progress,
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 18, 0] }) }] }}>
    {children}
  </Animated.View></Modal>;
}

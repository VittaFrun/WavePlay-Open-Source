import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeFeedback } from '../services/feedback';
import { fonts, useTheme } from '../theme';
import { WaveLogo } from './WaveLogo';

export function FeedbackHost() {
  const [message, setMessage] = useState('');
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => { let timer: ReturnType<typeof setTimeout>; const unsubscribe = subscribeFeedback(text => { clearTimeout(timer); setMessage(text); timer = setTimeout(() => setMessage(''), 2600); }); return () => { unsubscribe(); clearTimeout(timer); }; }, []);
  return message ? <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: 'absolute', top: insets.top + 10, left: 24, right: 24, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceHigh, elevation: 12 }}><WaveLogo size={22}/><Text style={{ flex: 1, fontFamily: fonts.semiBold, color: colors.text, fontSize: 12 }}>{message}</Text></View> : null;
}

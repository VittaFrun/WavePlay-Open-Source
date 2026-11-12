import { usePathname } from 'expo-router';
import { useScenePerformance } from '../hooks/useScenePerformance';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { ThemeWallpaper } from './ThemeWallpaper';

type ScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  opaque?: boolean;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
};

export function Screen({ children, scroll = true, contentStyle, opaque = true, keyboardShouldPersistTaps }: ScreenProps) {
  const onLayout=useScenePerformance(usePathname());
  const { gradients, appearance } = useTheme();
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={[styles.content, { paddingBottom: 190 + insets.bottom }, contentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.full, contentStyle]}>{children}</View>
  );

  return (
    <View onLayout={onLayout} style={styles.flex}>
      {opaque ? <ThemeWallpaper appearance={appearance} /> : null}
      <LinearGradient colors={gradients.aurora} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.flex}>
        <SafeAreaView edges={['top']} style={styles.flex}>{body}</SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  full: { flex: 1, paddingBottom: 0 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 160, flexGrow: 1, backgroundColor: 'transparent' },
});

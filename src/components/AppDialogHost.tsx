import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSyncExternalStore } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appDialogs } from '../services/appAlert';
import { fonts, useTheme } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { sheetTokens } from './BottomSheet';

export function AppDialogHost() {
  const dialog = useSyncExternalStore(appDialogs.subscribe, appDialogs.read, appDialogs.read);
  const {colors} = useTheme();
  const reducedMotion = useReducedMotion(), insets = useSafeAreaInsets();
  if (!dialog) return null;
  const destructive = dialog.buttons.some(button => button.style === 'destructive');
  const accent = destructive ? colors.danger : colors.purple;
  return <Modal transparent visible statusBarTranslucent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => appDialogs.dismiss(dialog.id)}>
    <View style={[s.overlay, {paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24}]}>
      <Pressable accessibilityLabel="Cerrar aviso" accessible={Boolean(dialog.options?.cancelable)} style={StyleSheet.absoluteFill} onPress={() => appDialogs.dismiss(dialog.id)}/>
      <View accessibilityViewIsModal style={[s.card, {borderColor: colors.border}]}>
        <View style={[s.icon, {backgroundColor: destructive ? 'rgba(255,180,171,.12)' : colors.accentSoft}]}><MaterialCommunityIcons name={dialog.icon === 'update' ? 'update' : destructive ? 'alert-circle-outline' : 'bell-outline'} size={29} color={accent}/></View>
        <ScrollView style={{flexShrink: 1, flexGrow: 0}} showsVerticalScrollIndicator={false}>
          <Text accessibilityRole="header" style={[s.title, {color: colors.text}]}>{dialog.title}</Text>
          {dialog.message ? <Text style={[s.message, {color: colors.muted}]}>{dialog.message}</Text> : null}
        </ScrollView>
        <View style={s.actions}>{dialog.buttons.map((button, index) => {
          const primary = button.style !== 'cancel' && index === dialog.buttons.length - 1;
          return <Pressable key={index} accessibilityRole="button" onPress={() => appDialogs.choose(dialog.id, index)} style={({pressed}) => [s.button, {backgroundColor: primary ? (button.style === 'destructive' ? colors.danger : colors.purple) : colors.surfaceHighest, opacity: pressed ? .7 : 1}]}><Text style={[s.label, {color: primary ? colors.background : colors.text}]}>{button.text || 'Entendido'}</Text></Pressable>;
        })}</View>
      </View>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(8,8,14,.72)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24},
  card: {width: '100%', maxWidth: 420, maxHeight: '100%', backgroundColor: sheetTokens.background, borderRadius: 28, borderWidth: 1, padding: 24, gap: 18},
  icon: {width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center'},
  title: {fontFamily: fonts.extraBold, fontSize: 23, lineHeight: 30},
  message: {fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, marginTop: 10},
  actions: {gap: 9}, button: {minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 12}, label: {fontFamily: fonts.bold, fontSize: 14, textAlign: 'center'},
});

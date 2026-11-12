import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, useTheme } from '../theme';

type Icon = ComponentProps<typeof MaterialCommunityIcons>['name'];
export function MenuAction({icon, label, detail, onPress, disabled = false, destructive = false, selected, trailing}: {
  icon: Icon; label: string; detail?: string; onPress: () => void; disabled?: boolean; destructive?: boolean; selected?: boolean; trailing?: ReactNode;
}) {
  const {colors} = useTheme(), color = destructive ? colors.danger : colors.purple;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled, ...(selected === undefined ? {} : {selected})}} disabled={disabled} onPress={onPress} style={({pressed}) => [s.row, {backgroundColor: destructive ? 'rgba(255,180,171,.055)' : pressed ? colors.surfaceHighest : 'rgba(255,255,255,.025)', opacity: disabled ? .4 : 1}]}>
    <View style={[s.icon, {backgroundColor: destructive ? 'rgba(255,180,171,.1)' : colors.accentSoft}]}><MaterialCommunityIcons name={icon} size={21} color={color}/></View>
    <View style={s.copy}><Text style={[s.label, {color: destructive ? colors.danger : colors.text}]}>{label}</Text>{detail ? <Text style={[s.detail, {color: colors.muted}]}>{detail}</Text> : null}</View>
    {trailing ?? <MaterialCommunityIcons name={selected ? 'check-circle' : 'chevron-right'} size={selected ? 21 : 18} color={selected ? colors.purple : colors.outline}/>}
  </Pressable>;
}
export function MenuGroup({title, children}: {title?: string; children: ReactNode}) {
  const {colors} = useTheme();
  return <View style={s.group}>{title ? <Text style={[s.groupTitle, {color: colors.outline}]}>{title}</Text> : null}<View style={{gap: 3}}>{children}</View></View>;
}
const s = StyleSheet.create({row: {minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 15}, icon: {width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center'}, copy: {flex: 1, paddingVertical: 3}, label: {fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 19}, detail: {fontFamily: fonts.regular, fontSize: 11, lineHeight: 17, marginTop: 2}, group: {marginBottom: 13}, groupTitle: {fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', paddingHorizontal: 10, paddingTop: 7, paddingBottom: 10}});

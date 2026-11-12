import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionModal } from './MotionModal';
import { MenuBackdrop } from './GlassSurface';
import { fonts, useTheme } from '../theme';

export const sheetTokens={background:'#1F1F26',radius:28,padding:16,rowHeight:60};
export function BottomSheet({visible,onClose,title,subtitle,leading,children,scrollable=true}:{visible:boolean;onClose:()=>void;title:string;subtitle?:string;leading?:ReactNode;children:ReactNode;scrollable?:boolean}) {
  const {colors}=useTheme(),insets=useSafeAreaInsets();
  return <MotionModal transparent visible={visible} onRequestClose={onClose}>
    <View style={{flex:1,justifyContent:'flex-end'}}><MenuBackdrop/>
      <Pressable accessibilityLabel="Cerrar menú" style={StyleSheet.absoluteFill} onPress={onClose}/>
      <View accessibilityViewIsModal style={{maxHeight:'87%',backgroundColor:sheetTokens.background,borderRadius:sheetTokens.radius,marginHorizontal:10,marginBottom:Math.max(10,insets.bottom),paddingHorizontal:sheetTokens.padding,paddingTop:10,paddingBottom:12,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.border,overflow:'hidden'}}>
        <View style={{width:32,height:3,borderRadius:2,backgroundColor:colors.outline,opacity:.6,alignSelf:'center',marginBottom:14}}/>
        <View style={{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:5,paddingBottom:18}}>
          {leading}
          <View style={{flex:1}}><Text accessibilityRole="header" numberOfLines={2} style={{fontFamily:fonts.bold,fontSize:20,lineHeight:26,color:colors.text}}>{title}</Text>{subtitle?<Text numberOfLines={2} style={{fontFamily:fonts.regular,fontSize:12,lineHeight:18,color:colors.muted,marginTop:4}}>{subtitle}</Text>:null}</View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar menú" onPress={onClose} style={{width:40,height:40,borderRadius:20,backgroundColor:colors.surfaceHighest,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="close" size={20} color={colors.muted}/></Pressable>
        </View>
        {scrollable?<ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{flexGrow:0}}>{children}</ScrollView>:<View style={{flexShrink:1}}>{children}</View>}
      </View>
    </View>
  </MotionModal>;
}

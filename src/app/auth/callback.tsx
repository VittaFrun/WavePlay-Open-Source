import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { finishAccountRedirect } from '../../services/account';
import { fonts, useTheme } from '../../theme';

export default function AuthCallback(){
  const url=Linking.useURL(),{colors}=useTheme(),[error,setError]=useState('');
  useEffect(()=>{if(!url)return;let active=true;void finishAccountRedirect(url).then(()=>{if(active)router.replace('/account-backup' as never)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'No se pudo completar el acceso.')});return()=>{active=false}},[url]);
  return <View style={{flex:1,backgroundColor:colors.canvas,alignItems:'center',justifyContent:'center',padding:28}}>{error?<Text style={{fontFamily:fonts.regular,color:colors.text,textAlign:'center'}}>{error}</Text>:<><ActivityIndicator color={colors.purple}/><Text style={{fontFamily:fonts.regular,color:colors.muted,marginTop:16}}>Conectando cuenta…</Text></>}</View>;
}

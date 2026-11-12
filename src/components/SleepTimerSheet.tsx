import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { useQueue, useWaveActions } from '../providers/WaveProvider';
import { fonts, useTheme } from '../theme';

export function SleepTimerSheet({visible,onClose}:{visible:boolean;onClose:()=>void}){
 if(!visible)return null;
 return <TimerBody onClose={onClose}/>;
}
function TimerBody({onClose}:{onClose:()=>void}){
 const {sleepEndsAt}=useQueue(),{setSleepTimer}=useWaveActions(),{colors}=useTheme();
 const [now,setNow]=useState(()=>Date.now()),[minutes,setMinutes]=useState('30');
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const remaining=Math.max(0,Math.ceil(((sleepEndsAt||0)-now)/1000));
 const valid=/^\d{1,3}$/.test(minutes)&&Number(minutes)>=1&&Number(minutes)<=720;
 const start=(value:number)=>{setSleepTimer(value);onClose();};
 return <BottomSheet visible onClose={onClose} title="Temporizador para dormir">
  <View style={{alignItems:'center',paddingVertical:18,gap:8}}>
   <MaterialCommunityIcons name="moon-waning-crescent" size={30} color={colors.pink}/>
   <Text style={{fontFamily:fonts.extraBold,fontSize:36,color:colors.text}}>{sleepEndsAt?`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:'Buenas noches'}</Text>
   <Text style={{fontFamily:fonts.regular,color:colors.muted,textAlign:'center'}}>La música se pausará al terminar el tiempo.</Text>
  </View>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{[5,15,30,45,60,90].map(value=><Pressable key={value} accessibilityRole="button" onPress={()=>start(value)} style={{minWidth:'29%',flexGrow:1,minHeight:48,borderRadius:16,backgroundColor:colors.surfaceHigh,alignItems:'center',justifyContent:'center'}}><Text style={{fontFamily:fonts.bold,color:colors.text}}>{value} min</Text></Pressable>)}</View>
  <View style={{flexDirection:'row',alignItems:'center',gap:12,marginTop:18}}><TextInput accessibilityLabel="Minutos personalizados, de 1 a 720" keyboardType="number-pad" maxLength={3} value={minutes} onChangeText={setMinutes} selectTextOnFocus style={{flex:1,minHeight:48,borderRadius:12,paddingHorizontal:14,backgroundColor:colors.surfaceHigh,color:colors.text,fontFamily:fonts.bold}}/><Text style={{color:colors.muted}}>min</Text><Pressable accessibilityRole="button" disabled={!valid} onPress={()=>start(Number(minutes))} style={{minHeight:48,paddingHorizontal:18,borderRadius:16,backgroundColor:colors.accentSoft,justifyContent:'center',opacity:valid?1:.4}}><Text style={{color:colors.text,fontFamily:fonts.bold}}>Iniciar</Text></Pressable></View>
  {sleepEndsAt?<View style={{flexDirection:'row',gap:12,marginTop:16}}><Pressable accessibilityRole="button" onPress={()=>start(Math.min(720,remaining/60+5))} style={{flex:1,minHeight:48,justifyContent:'center',alignItems:'center'}}><Text style={{color:colors.pink,fontFamily:fonts.bold}}>Añadir 5 minutos</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>{setSleepTimer(null);onClose();}} style={{flex:1,minHeight:48,justifyContent:'center',alignItems:'center'}}><Text style={{color:colors.danger,fontFamily:fonts.bold}}>Cancelar temporizador</Text></Pressable></View>:null}
 </BottomSheet>;
}

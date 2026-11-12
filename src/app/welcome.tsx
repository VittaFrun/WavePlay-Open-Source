import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderButton } from '../components/HeaderButton';
import { Screen } from '../components/Screen';
import { WaveLogo } from '../components/WaveLogo';
import { accountClient, accountConfigured, accountRedirectUrl, isGoogleProviderEnabled, nativeGoogleConfigured, signInWithGoogle } from '../services/account';
import { AppAlert } from '../services/appAlert';
import { fonts, useTheme } from '../theme';
import { accountAccessMessage, validateAccountCredentials } from '../utils/accountAccess';

export default function Welcome() {
  const {colors} = useTheme(), insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'welcome' | 'signin' | 'signup'>('welcome');
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [visiblePassword, setVisiblePassword] = useState(false), [busy, setBusy] = useState(false);
  const [googleReady, setGoogleReady] = useState(false), [error, setError] = useState('');
  const pending = useRef(false), mounted = useRef(true);
  const passwordInput = useRef<TextInput>(null);
  useEffect(() => {
    mounted.current = true;
    void isGoogleProviderEnabled().then(value => { if (mounted.current) setGoogleReady(value); });
    return () => { mounted.current = false; };
  }, []);
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); };
  const perform = async (task: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await task(); }
    catch (reason) { if (mounted.current) setError(accountAccessMessage(reason)); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const google = () => { void perform(async () => { const session = await signInWithGoogle(); if (mounted.current && session) leave(); }); };
  const submit = () => { void perform(async () => {
    if (!accountClient) throw new Error('El acceso con cuenta no está disponible por ahora. Puedes continuar sin cuenta.');
    const credentials = validateAccountCredentials(email, password);
    const result = mode === 'signup'
      ? await accountClient.auth.signUp({...credentials, options: {emailRedirectTo: accountRedirectUrl}})
      : await accountClient.auth.signInWithPassword(credentials);
    if (result.error) throw result.error;
    if (!mounted.current) return;
    setPassword('');
    if (result.data.session) leave();
    else AppAlert.alert('Revisa tu correo', 'Te enviamos un enlace para confirmar tu cuenta. Después podrás iniciar sesión.', [{text: 'Entendido', onPress: () => { if (mounted.current) setMode('signin'); }}]);
  }); };
  const changeMode = (next: typeof mode) => { setMode(next); setError(''); setPassword(''); setVisiblePassword(false); };
  return <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen keyboardShouldPersistTaps="handled" contentStyle={{paddingBottom: insets.bottom + 28}}>
      <View style={s.header}><HeaderButton icon="chevron-left" label="Volver" disabled={busy} onPress={() => mode === 'welcome' ? leave() : changeMode('welcome')}/><View style={s.brandRow}><WaveLogo size={22}/><Text style={[s.brand, {color: colors.text}]}>WavePlay</Text></View><View style={{width: 44}}/></View>
      {mode === 'welcome' ? <View style={s.hero}>
        <View pointerEvents="none" style={s.recordArt}>
          <View style={[s.albumArt,{borderColor:colors.accentBorder}]}><LinearGradient colors={['#42204F','#171528','#23433F']} style={StyleSheet.absoluteFill}/><Text style={s.albumWord}>WAVE</Text><View style={s.albumWave}><WaveLogo size={54}/></View><Text style={s.albumCaption}>SOUND OF YOUR WORLD</Text></View>
          <View style={s.record}><View style={s.recordRing}/><View style={[s.recordLabel,{backgroundColor:colors.purple}]}><View style={s.recordHole}/></View></View>
        </View>
        <Text style={[s.kicker,{color:colors.purple}]}>DALE PLAY A LO TUYO</Text>
        <Text accessibilityRole="header" style={[s.title,{color:colors.text}]}>Tu música.{'\n'}Tu gente.</Text>
        <Text style={[s.description,{color:colors.muted}]}>Tu colección y tus próximos descubrimientos. Mejor si los compartes.</Text>
        <View style={s.benefits}>{[['music-note-outline','Escucha'],['heart-outline','Descubre'],['account-group-outline','Comparte']].map(([icon,label])=><View key={label} style={s.benefit}><MaterialCommunityIcons name={icon as 'music-note-outline'} size={15} color={colors.purple}/><Text style={[s.benefitLabel,{color:colors.text}]}>{label}</Text></View>)}</View>
      </View> : <View style={s.formHero}>
        <Text style={[s.kicker,{color:colors.purple}]}>{mode==='signup'?'TU NUEVA CUENTA':'BIENVENIDO DE NUEVO'}</Text>
        <Text accessibilityRole="header" style={[s.formTitle,{color:colors.text}]}>{mode==='signup'?'Empieza a compartir':'Sigue donde quedaste'}</Text>
        <Text style={[s.formDescription,{color:colors.muted}]}>{mode==='signup'?'Crea tu espacio para escuchar con amigos.':'Entra con tu correo y vuelve a tu música.'}</Text>
      </View>}
      <View style={[s.panel, {backgroundColor: 'rgba(22,22,30,.96)', borderColor: colors.border}]}>
        {mode === 'welcome' ? <>
          <Text style={[s.panelTitle,{color:colors.text}]}>Entra a WavePlay</Text>
          <AccessButton icon="google" label="Continuar con Google" primary disabled={busy || !googleReady || !nativeGoogleConfigured} onPress={google}/>
          <AccessButton icon="email-outline" label="Continuar con correo" disabled={busy || !accountConfigured} onPress={() => changeMode('signin')}/>
          <View style={s.switchRow}><Text style={[s.caption, {color: colors.muted}]}>¿Es tu primera vez?</Text><Pressable accessibilityRole="button" disabled={busy || !accountConfigured} onPress={() => changeMode('signup')} style={s.link}><Text style={[s.linkText, {color: colors.purple}]}>Crear cuenta</Text></Pressable></View>
        </> : <>
          <Text style={[s.fieldLabel, {color: colors.muted}]}>Correo electrónico</Text>
          <TextInput accessibilityLabel="Correo electrónico" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()} placeholder="tu@correo.com" placeholderTextColor={colors.outline} style={[s.input, {backgroundColor: colors.surfaceHighest, color: colors.text, borderColor: colors.border}]}/>
          <Text style={[s.fieldLabel, {color: colors.muted}]}>Contraseña</Text>
          <View style={[s.password, {backgroundColor: colors.surfaceHighest, borderColor: colors.border}]}>
            <TextInput ref={passwordInput} accessibilityLabel="Contraseña" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!visiblePassword} autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} textContentType={mode === 'signup' ? 'newPassword' : 'password'} returnKeyType="go" onSubmitEditing={submit} placeholder="Al menos 6 caracteres" placeholderTextColor={colors.outline} style={[s.passwordInput, {color: colors.text}]}/>
            <Pressable accessibilityRole="button" accessibilityLabel={visiblePassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onPress={() => setVisiblePassword(value => !value)} style={s.eye}><MaterialCommunityIcons name={visiblePassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.muted}/></Pressable>
          </View>
          <AccessButton icon={mode === 'signup' ? 'account-plus-outline' : 'login'} label={mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'} primary disabled={busy} onPress={submit}/>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => changeMode(mode === 'signup' ? 'signin' : 'signup')} style={s.link}><Text style={[s.linkText, {color: colors.purple}]}>{mode === 'signup' ? 'Ya tengo una cuenta' : 'Crear una cuenta'}</Text></Pressable>
        </>}
        {busy ? <ActivityIndicator accessibilityLabel="Conectando cuenta" color={colors.purple}/> : null}
        {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.error, {color: colors.danger}]}>{error}</Text> : null}
        {!accountConfigured ? <Text style={[s.caption, {color: colors.muted}]}>El acceso con cuenta no está disponible por ahora.</Text> : null}
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={leave} style={s.guest}><MaterialCommunityIcons name="headphones" size={19} color={colors.purple}/><Text style={[s.guestLabel, {color: colors.text}]}>Continuar sin cuenta</Text><MaterialCommunityIcons name="arrow-right" size={19} color={colors.muted}/></Pressable>
      <Text style={[s.footer, {color: colors.muted}]}>Tu biblioteca, playlists y respaldos locales funcionan sin cuenta.</Text>
    </Screen>
  </KeyboardAvoidingView>;
}

function AccessButton({icon, label, onPress, disabled, primary = false}: {icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress: () => void; disabled: boolean; primary?: boolean}) {
  const {colors} = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed}) => [s.action, {backgroundColor: primary ? '#F3F0F7' : 'rgba(255,255,255,.055)', opacity: disabled ? .4 : pressed ? .75 : 1}]}><MaterialCommunityIcons name={icon} size={22} color={primary ? colors.background : colors.text}/><Text style={[s.actionLabel, {color: primary ? colors.background : colors.text}]}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  header: {height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, brandRow:{flexDirection:'row',alignItems:'center',gap:10},brand: {fontFamily: fonts.extraBold, fontSize: 18},
  hero: {paddingTop:12,paddingBottom:24},recordArt:{height:164,alignSelf:'center',width:244,marginVertical:16},albumArt:{position:'absolute',left:2,top:5,width:148,height:148,borderRadius:12,borderWidth:1,overflow:'hidden',transform:[{rotate:'-10deg'}],padding:15,zIndex:2},albumWord:{color:'#F0D2F6',fontFamily:fonts.extraBold,fontSize:24,letterSpacing:4},albumWave:{alignItems:'flex-end',marginTop:4},albumCaption:{fontFamily:fonts.bold,fontSize:6,letterSpacing:1.3,color:'#DFD3E8',marginTop:14},record:{position:'absolute',right:0,top:10,width:144,height:144,borderRadius:72,backgroundColor:'#0B0B11',borderWidth:7,borderColor:'#24232E',alignItems:'center',justifyContent:'center'},recordRing:{position:'absolute',width:112,height:112,borderRadius:56,borderWidth:1,borderColor:'#37343F'},recordLabel:{width:54,height:54,borderRadius:27,alignItems:'center',justifyContent:'center'},recordHole:{width:8,height:8,borderRadius:4,backgroundColor:'#15131D'},
  kicker: {fontFamily: fonts.bold, fontSize: 9, letterSpacing: 2, marginBottom: 12}, title: {fontFamily: fonts.extraBold, fontSize: 43, lineHeight: 47,letterSpacing:-1.5}, description: {fontFamily: fonts.regular, fontSize: 13, lineHeight: 21, maxWidth: 310, marginTop: 12},benefits:{flexDirection:'row',gap:20,marginTop:18},benefit:{flexDirection:'row',alignItems:'center',gap:6},benefitLabel:{fontFamily:fonts.semiBold,fontSize:10},
  formHero:{paddingTop:28,paddingBottom:24},formTitle:{fontFamily:fonts.extraBold,fontSize:30,lineHeight:37,letterSpacing:-.8},formDescription:{fontFamily:fonts.regular,fontSize:13,lineHeight:21,marginTop:10},
  panel: {width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: 24, borderWidth: 1, padding: 18, gap: 10},panelTitle:{fontFamily:fonts.bold,fontSize:16,marginBottom:4},action: {minHeight: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12}, actionLabel: {fontFamily: fonts.bold, fontSize: 13, textAlign: 'center', flexShrink: 1},
  switchRow: {flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap'}, caption: {fontFamily: fonts.regular, fontSize: 11, lineHeight: 19}, link: {minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8}, linkText: {fontFamily: fonts.bold, fontSize: 12, textAlign: 'center'},
  fieldLabel: {fontFamily: fonts.semiBold, fontSize: 12}, input: {minHeight: 52, borderRadius: 12, padding: 14, borderWidth: 1, fontFamily: fonts.regular, fontSize: 14}, password: {minHeight: 52, flexDirection: 'row', borderWidth: 1, borderRadius: 12}, passwordInput: {flex: 1, minWidth: 0, padding: 14, fontFamily: fonts.regular, fontSize: 14}, eye: {width: 48, alignItems: 'center', justifyContent: 'center'},
  guest: {minHeight: 52, flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 14,borderRadius:16,borderWidth:1,borderColor:'rgba(255,255,255,.12)'}, guestLabel: {fontFamily: fonts.bold, fontSize: 12}, footer: {fontFamily: fonts.regular, fontSize: 10, lineHeight: 17, textAlign: 'center', alignSelf: 'center', maxWidth: 280, marginTop: 12}, error: {fontFamily: fonts.regular, fontSize: 13, lineHeight: 20},
});

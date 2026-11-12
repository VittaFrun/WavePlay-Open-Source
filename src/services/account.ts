import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { NativeModules, Platform } from 'react-native';

const url=process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const googleWebClientId=process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
export const accountConfigured=Boolean(url && /^https:\/\/[^/]+\.supabase\.co\/?$/.test(url) && key?.startsWith('sb_publishable_'));
export const nativeGoogleConfigured=Platform.OS==='android' && Boolean(googleWebClientId?.endsWith('.apps.googleusercontent.com'));
export const accountClient=accountConfigured?createClient(url!,key!,{
  auth:{storage:AsyncStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,flowType:'pkce'},
}):null;

export const accountRedirectUrl='waveplay:///auth/callback';
let redirectInFlight:{url:string;promise:Promise<Awaited<ReturnType<NonNullable<typeof accountClient>['auth']['getSession']>>['data']['session']>}|null=null;

export async function isGoogleProviderEnabled() {
  if(!accountConfigured)return false;
  try {
    const response=await fetch(`${url}/auth/v1/settings`,{headers:{apikey:key!}});
    if(!response.ok)return false;
    const settings=await response.json() as {external?:{google?:boolean}};
    return settings.external?.google===true;
  }catch{return false;}
}

export function finishAccountRedirect(callbackUrl:string) {
  if(redirectInFlight?.url===callbackUrl)return redirectInFlight.promise;
  const promise=finishAccountRedirectOnce(callbackUrl);
  redirectInFlight={url:callbackUrl,promise};
  return promise;
}

async function finishAccountRedirectOnce(callbackUrl:string) {
  if(!accountClient)throw new Error('La cuenta todavía no está configurada.');
  const parsed=new URL(callbackUrl);
  const query=parsed.searchParams;
  const fragment=new URLSearchParams(parsed.hash.replace(/^#/,''));
  const error=query.get('error_description')||fragment.get('error_description');
  if(error)throw new Error(error);
  const code=query.get('code');
  if(code){const result=await accountClient.auth.exchangeCodeForSession(code);if(result.error)throw result.error;return result.data.session;}
  const access=fragment.get('access_token'),refresh=fragment.get('refresh_token');
  if(access&&refresh){const result=await accountClient.auth.setSession({access_token:access,refresh_token:refresh});if(result.error)throw result.error;return result.data.session;}
  throw new Error('Google no devolvió una sesión. Revisa la URL de redirección configurada en Supabase.');
}

export async function signInWithGoogle() {
  if(!accountClient)throw new Error('La cuenta todavía no está configurada.');
  if(!nativeGoogleConfigured)throw new Error('Falta configurar el Client ID web de Google para Android.');
  const native=NativeModules.WavePlayGoogleAccount as {signIn:(clientId:string)=>Promise<{token:string;nonce:string}|null>}|undefined;
  if(!native)throw new Error('Instala una nueva development build de WavePlay para usar el selector nativo de Google.');
  const credential=await native.signIn(googleWebClientId!);
  if(!credential)return null;
  const {data,error}=await accountClient.auth.signInWithIdToken({provider:'google',token:credential.token,nonce:credential.nonce});
  if(error)throw error;
  return data.session;
}

export async function signOutAccount() {
  if(!accountClient)throw new Error('La cuenta todavía no está configurada.');
  const {error}=await accountClient.auth.signOut();
  if(error)throw error;
  const native=NativeModules.WavePlayGoogleAccount as {clearCredentialState:()=>Promise<void>}|undefined;
  if(native)try{await native.clearCredentialState();}catch{/* La sesión de Supabase ya se cerró. */}
}

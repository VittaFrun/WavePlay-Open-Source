import { AppUpdateHost } from '../components/AppUpdateHost';
import { AppDialogHost } from '../components/AppDialogHost';
import { SceneProfiler } from '../components/SceneProfiler';
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { WaveProvider, useLibrary } from "../providers/WaveProvider";
import { AppearanceProvider } from '../providers/AppearanceProvider';
import { transitionStart, transitionEnd } from '../services/performance';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { FeedbackHost } from '../components/FeedbackHost';
import { FriendsListeningProvider } from '../providers/FriendsListeningProvider';
import { RoomYouTubeNativeHost } from '../components/RoomYouTubeNativeHost';
import { useReducedMotion } from '../hooks/useReducedMotion';
export const unstable_settings = { initialRouteName: '(tabs)' };
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({duration:0,fade:false});
function StartupReady() {
  const {ready}=useLibrary();
  useEffect(()=>{if(ready)void SplashScreen.hideAsync();},[ready]);
  useEffect(()=>{const timer=setTimeout(()=>{void SplashScreen.hideAsync();},10000);return()=>clearTimeout(timer);},[]);
  return null;
}
export default function RootLayout() { return <AppearanceProvider><AppLayout/></AppearanceProvider>; }
function AppLayout() {
  const reducedMotion=useReducedMotion();
  const [loaded,error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  if (!loaded&&!error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}><WaveProvider><FriendsListeningProvider>
      <StartupReady/>
      <StatusBar style="light" />
      <Stack
        screenLayout={({children,route})=><SceneProfiler name={route.name}>{children}</SceneProfiler>}
        screenListeners={({route})=>({transitionStart:()=>transitionStart(route.name),transitionEnd:()=>transitionEnd(route.name)})}
        screenOptions={{
          headerShown: false,
          freezeOnBlur: true,
          contentStyle: { backgroundColor: '#13131A' },
          animation: reducedMotion ? "none" : "simple_push",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="player"
          options={{ presentation: "modal", animation: reducedMotion ? "none" : "slide_from_bottom" }}
        />
        <Stack.Screen
          name="queue"
          options={{ presentation: "modal", animation: reducedMotion ? "none" : "slide_from_bottom" }}
        />
        <Stack.Screen
          name="settings"
          options={{ animation: reducedMotion ? "none" : "simple_push" }}
        />
        <Stack.Screen name="account-backup" options={{ animation: reducedMotion ? "none" : "simple_push" }} />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="friends" options={{ animation: reducedMotion ? "none" : "simple_push" }} />
        <Stack.Screen
          name="legal"
          options={{ animation: reducedMotion ? "none" : "simple_push" }}
        />
        <Stack.Screen
          name="online-player"
          options={{ presentation: "modal", animation: reducedMotion ? "none" : "slide_from_bottom" }}
        />
        <Stack.Screen name="youtube-watch" options={{ animation: reducedMotion ? 'none' : 'simple_push' }} />
        <Stack.Screen
          name="playlist/[id]"
          options={{ animation: reducedMotion ? "none" : "simple_push" }}
        />
        <Stack.Screen
          name="collection/[key]"
          options={{ animation: reducedMotion ? "none" : "simple_push" }}
        />
        <Stack.Screen name="mix/[id]" options={{ animation: reducedMotion ? "none" : "simple_push" }} />
        <Stack.Screen name="track/[id]" options={{ presentation: 'transparentModal', animation: reducedMotion ? 'none' : 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
      </Stack>
      <FeedbackHost/>
      <AppUpdateHost/>
      <AppDialogHost/>
      <RoomYouTubeNativeHost/>
    </FriendsListeningProvider></WaveProvider></GestureHandlerRootView>
  );
}

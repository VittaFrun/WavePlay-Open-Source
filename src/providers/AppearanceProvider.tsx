import { BlurTargetView } from 'expo-blur';
import { GlassTargets } from '../components/GlassSurface';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { buildTheme, ThemeContext } from '../theme';
import { ThemeWallpaper } from '../components/ThemeWallpaper';
import { defaultAppearance, normalizeAppearance, type Appearance } from '../utils/appearance';
import { PerformanceProvider } from './PerformanceProvider';

const KEY = 'waveplay.appearance.v1';
const AppearanceContext = createContext({ settings: defaultAppearance, preview: (_: Appearance|null) => {}, reduceMotion:false, setReduceMotion: async (_:boolean)=>{}, save: async (_: Appearance) => {} });
export const useAppearance = () => useContext(AppearanceContext);
export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const {width,height}=useWindowDimensions();
  const wallpaper=useRef<View|null>(null);const content=useRef<View|null>(null);
  const [previewSettings,setPreviewSettings]=useState<Appearance|null>(null);
  const [reduceMotion,setMotion]=useState(false);
  const setReduceMotion=useCallback(async(value:boolean)=>{await AsyncStorage.setItem('waveplay.reduceMotion',value?'1':'0');setMotion(value)},[]);
  const [settings, setSettings] = useState(defaultAppearance);
  const [ready, setReady] = useState(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => { let mounted = true; void Promise.all([AsyncStorage.getItem(KEY),AsyncStorage.getItem('waveplay.reduceMotion')]).then(([raw,motion]) => {
    if(mounted)setMotion(motion==='1');
    if (mounted && raw) setSettings(normalizeAppearance(JSON.parse(raw)));
  }).catch(() => {}).finally(() => { if (mounted) setReady(true); }); return () => { mounted = false; }; }, []);
  const effective=useMemo(()=>normalizeAppearance(previewSettings??settings),[previewSettings,settings]);
  const theme = useMemo(() => buildTheme(effective), [effective]);
  const save = useCallback(async (next: Appearance) => {
    const valid = normalizeAppearance(next);
    const task = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, JSON.stringify(valid)));
    writes.current = task;
    await task;
    setSettings(valid);
    setPreviewSettings(null);
  },[]);
  const appearanceValue=useMemo(()=>({settings,save,preview:setPreviewSettings,reduceMotion,setReduceMotion}),[settings,save,reduceMotion,setReduceMotion]);
  const targets=useMemo(()=>({wallpaper,content}),[]);
  if (!ready) return <View style={{flex:1,backgroundColor:'#13131A'}}/>;
  return <AppearanceContext.Provider value={appearanceValue}><ThemeContext.Provider value={theme}><PerformanceProvider><GlassTargets.Provider value={targets}>
    <BlurTargetView ref={content} style={{ flex: 1, backgroundColor: '#13131A' }}><BlurTargetView ref={wallpaper} pointerEvents="none" style={{position:'absolute',top:0,left:0,width,height,overflow:'hidden'}}><ThemeWallpaper appearance={effective}/></BlurTargetView>{children}</BlurTargetView>
  </GlassTargets.Provider></PerformanceProvider></ThemeContext.Provider></AppearanceContext.Provider>;
}

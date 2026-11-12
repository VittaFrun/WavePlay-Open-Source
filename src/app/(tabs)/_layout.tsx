import { SceneProfiler } from '../../components/SceneProfiler';
import { useScenePerformance } from '../../hooks/useScenePerformance';
import { transitionStart, transitionEnd } from '../../services/performance';
import { SwipeSurface } from '../../components/SwipeSurface';
import { router, Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createRef, useCallback, useRef, type ComponentProps, type RefObject } from 'react';
import { BlurTargetView, BlurView } from 'expo-blur';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, useTheme } from '../../theme';
import { MiniPlayer } from '../../components/MiniPlayer';
import { ThemeWallpaper } from '../../components/ThemeWallpaper';
import { useLightweightEffects } from '../../providers/PerformanceProvider';
import type { Appearance } from '../../utils/appearance';

import { useReducedMotion } from '../../hooks/useReducedMotion';
const destinations = [
  { name: 'index', title: 'Inicio', icon: 'home-variant-outline' },
  { name: 'search', title: 'Explorar', icon: 'compass-outline' },
  { name: 'library', title: 'Biblioteca', icon: 'playlist-music-outline' },
  { name: 'profile', title: 'Perfil', icon: 'account-outline' },
] as const;

type DockProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type TabSceneProps = {children:React.ReactNode;routeName:string;target:RefObject<View|null>;appearance:Appearance;insetTop:number;onSwipeRoute:(routeName:string,direction:1|-1)=>void};

function TabScene({children,routeName,target,appearance,insetTop,onSwipeRoute}:TabSceneProps){
  const onLayout=useScenePerformance(routeName);
  const onSwipe=useCallback((direction:1|-1)=>onSwipeRoute(routeName,direction),[onSwipeRoute,routeName]);
  return <SwipeSurface edgeOnly onSwipe={onSwipe}><BlurTargetView ref={target} onLayout={onLayout} style={sceneStyles.root}><View pointerEvents="none" style={[StyleSheet.absoluteFill,{top:-insetTop}]}><ThemeWallpaper appearance={appearance}/></View><SceneProfiler name={`tab:${routeName}`}>{children}</SceneProfiler></BlurTargetView></SwipeSurface>;
}
function Dock({ state, navigation, blurTarget }: DockProps & { blurTarget: RefObject<View | null> }) {const {colors,appearance}=useTheme();const s=useS();
  const insets = useSafeAreaInsets();
  const lightweight=useLightweightEffects();
  return <View style={[s.dock, { bottom: Math.max(insets.bottom, 8) }]}>
    <MiniPlayer blurTarget={blurTarget} />
    <View style={s.halo}><View style={s.navigation}>
      {lightweight?<View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(19,19,26,.96)'}]}/>:<BlurView pointerEvents="none" blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" tint="dark" intensity={appearance.panelBlur} style={StyleSheet.absoluteFill} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.glassTint]} />
      {destinations.map(item => {
      const route = state.routes.find(candidate => candidate.name === item.name);
      if (!route) return null;
      const selected = state.routes[state.index]?.key === route.key;
      return <Pressable key={item.name} accessibilityRole="tab" accessibilityLabel={item.title} accessibilityState={{ selected }}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }} onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        style={[s.item, selected && s.selected]}>
        <MaterialCommunityIcons name={item.icon} size={22} color={selected ? colors.pink : colors.muted} />
        <Text style={[s.label, selected && s.selectedLabel]}>{item.title}</Text>
      </Pressable>;
    })}</View></View>
  </View>;
}

export default function TabsLayout() {const reducedMotion=useReducedMotion();const {appearance}=useTheme();const s=useS();
  const insets=useSafeAreaInsets();
  const targets = useRef<Record<string, RefObject<View | null>>>({});
  const lastSwipe=useRef(0);
  const targetFor = (name: string) => targets.current[name] ?? (targets.current[name] = createRef<View>());
  const navigateFrom=useCallback((routeName:string,direction:1|-1)=>{const now=Date.now();if(now-lastSwipe.current<400)return;const index=destinations.findIndex(item=>item.name===routeName);if(index<0)return;const next=destinations[index+direction];if(next){lastSwipe.current=now;router.navigate(next.name==='index'?'/(tabs)':`/(tabs)/${next.name}`);}},[]);
  return <View style={s.root}><SafeAreaView edges={['top']} style={s.safe}>
    <Tabs screenListeners={({route})=>({transitionStart:()=>transitionStart(route.name),transitionEnd:()=>transitionEnd(route.name)})} detachInactiveScreens screenLayout={({ children, route }) => <TabScene routeName={route.name} target={targetFor(route.name)} appearance={appearance} insetTop={insets.top} onSwipeRoute={navigateFrom}>{children}</TabScene>} tabBar={props => <Dock {...props} blurTarget={targetFor(props.state.routes[props.state.index].name)} />} screenOptions={{ sceneStyle: { backgroundColor: '#13131A' }, headerShown: false, lazy: true, freezeOnBlur: true, animation: reducedMotion ? 'none' : 'fade' }}>
      {destinations.map(item => <Tabs.Screen key={item.name} name={item.name} options={{ title: item.title }} />)}
      <Tabs.Screen name="playlists" options={{ href: null }} />
      <Tabs.Screen name="downloads" options={{ href: null }} />
    </Tabs>
  </SafeAreaView></View>;
}

const sceneStyles=StyleSheet.create({root:{flex:1,backgroundColor:'#13131A'}});

const useS = () => { const {colors} = useTheme(); return StyleSheet.create({
  root: { flex: 1, backgroundColor: '#13131A' },
  safe: {flex:1},
  dock: { position: 'absolute', left: 20, right: 20, gap: 8 },
  halo:{borderRadius:32,boxShadow:[{offsetX:0,offsetY:0,blurRadius:3,spreadDistance:0,color:colors.accentSoft}],borderWidth:StyleSheet.hairlineWidth,borderColor:colors.border},
  navigation: { height: 64, borderRadius: 32, overflow: 'hidden', padding: 4, backgroundColor: 'rgba(25,25,32,0.4)', flexDirection: 'row', borderWidth: 1, borderColor: colors.border },
  glassTint: { backgroundColor: 'rgba(25,25,32,0.35)' },
  item: { flex: 1, minWidth: 0, borderRadius: 28, alignItems: 'center', justifyContent: 'center', gap: 3 },
  selected: { backgroundColor: colors.accentSoft },
  label: { fontFamily: fonts.semiBold, fontSize: 10, color: colors.muted },
  selectedLabel: { color: colors.pink },
}); };

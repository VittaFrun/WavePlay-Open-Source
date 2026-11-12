import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
/* eslint-disable react-hooks/refs -- PanResponder reads refs outside render. */
import { FlatList, PanResponder, View, type FlatListProps } from 'react-native';
import type { FlatList as GestureFlatList } from 'react-native-gesture-handler';
import DraggableFlatList, { type DraggableFlatListProps } from 'react-native-draggable-flatlist';
import Animated, { useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { createListPositionMemory } from '../utils/listPosition';

const THUMB_HEIGHT = 42;
const DRAG_ANIMATION={damping:30,stiffness:300,mass:.6,overshootClamping:true};
const listPositions=createListPositionMemory();
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList) as unknown as typeof FlatList;

export function useRail<T, ListInstance extends FlatList<T> = FlatList<T>>(externalScrollOffset?:SharedValue<number>) {
  const { colors } = useTheme();
  const ref = useRef<ListInstance>(null);
  const progress = useSharedValue(0);
  const active = useSharedValue(0);
  const railHeight = useSharedValue(1);
  const contentHeight = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const metrics = useRef({ content: 0, viewport: 0, rail: 1, offset: 0 });
  const gestureStart = useRef(0);
  const fraction = useRef(0);
  const scrubbing = useRef(false);
  const pendingOffset = useRef(0);
  const frame = useRef<number | null>(null);
  const dragging = useRef(false);
  const setDragging=useCallback((value:boolean)=>{dragging.current=value;},[]);
  const [scrollable, setScrollable] = useState(false);
  const updateThumb = useCallback((ratio: number) => {
    const next = Math.max(0, Math.min(1, ratio));
    fraction.current = next;
    // Reanimated shared values are mutable by design.
    // eslint-disable-next-line react-hooks/immutability
    progress.value = next;
  }, [progress]);
  const updateScrollable = useCallback(() => {
    const { content, viewport } = metrics.current;
    setScrollable(content > viewport + 2 && viewport > 0);
  }, []);
  const syncThumb = useCallback(() => {
    const { content, viewport, offset } = metrics.current;
    updateThumb(offset / Math.max(1, content - viewport));
  }, [updateThumb]);
  const move = useCallback((y: number) => {
    const ratio = Math.max(0, Math.min(1, (y - THUMB_HEIGHT / 2) / Math.max(1, metrics.current.rail - THUMB_HEIGHT)));
    updateThumb(ratio);
    const offset = ratio * Math.max(0, metrics.current.content - metrics.current.viewport);
    metrics.current.offset = offset;
    pendingOffset.current = offset;
    if (frame.current === null) frame.current = requestAnimationFrame(() => {
      frame.current = null;
      ref.current?.scrollToOffset({ offset: pendingOffset.current, animated: false });
    });
  }, [updateThumb]);
  const finishScrub = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
      ref.current?.scrollToOffset({ offset: pendingOffset.current, animated: false });
    }
    scrubbing.current = false;
    // eslint-disable-next-line react-hooks/immutability
    active.value = 0;
  }, [active]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !dragging.current,
    onMoveShouldSetPanResponder: () => !dragging.current,
    onPanResponderGrant: event => { gestureStart.current = event.nativeEvent.locationY; scrubbing.current = true;
      // eslint-disable-next-line react-hooks/immutability
      active.value = 1; move(gestureStart.current); },
    onPanResponderMove: (_event, gesture) => move(gestureStart.current + gesture.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: finishScrub,
    onPanResponderTerminate: finishScrub,
  }), [active, finishScrub, move]);
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: active.value ? .95 : .48,
    transform: [
      { translateY: progress.value * Math.max(0, railHeight.value - THUMB_HEIGHT) },
      { scaleX: active.value ? 1.5 : 1 },
    ],
  }));
  const scrollHandler = useAnimatedScrollHandler(event => {
    const offset=event.contentOffset.y;
    const max = Math.max(1, contentHeight.value - viewportHeight.value);
    // Reanimated shared values are updated on the UI thread by this worklet.
    // eslint-disable-next-line react-hooks/immutability
    progress.value = Math.max(0, Math.min(1, offset / max));
    // eslint-disable-next-line react-hooks/immutability
    if(externalScrollOffset)externalScrollOffset.value=offset;
  });
  const rail = <View accessibilityRole="adjustable" accessibilityLabel="Navegación rápida de la lista" accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={event => move(THUMB_HEIGHT / 2 + (fraction.current + (event.nativeEvent.actionName === 'increment' ? .1 : -.1)) * Math.max(1, metrics.current.rail - THUMB_HEIGHT))} onLayout={event => { metrics.current.rail = event.nativeEvent.layout.height; railHeight.value = metrics.current.rail; }} {...responder.panHandlers} style={{ position: 'absolute', right: 0, top: 8, bottom: 8, width: 16, alignItems: 'flex-end' }}>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: 3, top: 0, width: 6, height: THUMB_HEIGHT, borderRadius: 3, backgroundColor: colors.pink }, thumbStyle]} />
  </View>;
  return {
    progress, contentHeight, viewportHeight, ref, rail, scrollable, setDragging,
    scrollHandler,
    layout: (height: number) => { metrics.current.viewport = height; viewportHeight.value = height; updateScrollable(); if (!scrubbing.current) syncThumb(); },
    content: (height: number) => { metrics.current.content = height; contentHeight.value = height; updateScrollable(); if (!scrubbing.current) syncThumb(); },
    offset: (offset: number) => { if (scrubbing.current) return; metrics.current.offset = offset; updateThumb(offset / Math.max(1, metrics.current.content - metrics.current.viewport));
      // eslint-disable-next-line react-hooks/immutability
      if(externalScrollOffset)externalScrollOffset.value=offset;
    },
    scrollBy: (delta: number) => {
      const max = Math.max(0, metrics.current.content - metrics.current.viewport);
      const target = Math.max(0, Math.min(max, metrics.current.offset + delta));
      if (Math.abs(target - metrics.current.offset) < 1) return false;
      metrics.current.offset = target;
      ref.current?.scrollToOffset({ offset: target, animated: false });
      return true;
    },
  };
}

type FastFlatListProps<T> = FlatListProps<T> & { scrollOffset?: SharedValue<number>; resetKey?:number; positionKey?:string };

export function FastFlatList<T>({scrollOffset,resetKey,positionKey,...props}: FastFlatListProps<T>) {
  const rail = useRail<T>(scrollOffset);
  const [initialOffset]=useState(()=>positionKey?listPositions.get(positionKey):0);
  const listRef=rail.ref;
  useEffect(()=>{if(resetKey!==undefined)listRef.current?.scrollToOffset({offset:0,animated:false});},[resetKey,listRef]);
  const remember=useCallback((offset:number)=>{if(positionKey)listPositions.save(positionKey,offset);},[positionKey]);
  return <View style={{ flex: 1 }}><AnimatedFlatList {...props} contentOffset={props.contentOffset??{x:0,y:initialOffset}} onScrollEndDrag={event=>{remember(event.nativeEvent.contentOffset.y);props.onScrollEndDrag?.(event);}} onMomentumScrollEnd={event=>{remember(event.nativeEvent.contentOffset.y);rail.offset(event.nativeEvent.contentOffset.y);props.onMomentumScrollEnd?.(event);}} ref={rail.ref} showsVerticalScrollIndicator={false} onLayout={event => { rail.layout(event.nativeEvent.layout.height); props.onLayout?.(event); }} onContentSizeChange={(w, h) => { rail.content(h); props.onContentSizeChange?.(w, h); }} onScroll={rail.scrollHandler} scrollEventThrottle={16} />{rail.scrollable ? rail.rail : null}</View>;
}

export function FastDraggableList<T>({scrollOffset,...props}: DraggableFlatListProps<T> & {scrollOffset?:SharedValue<number>}) {
  const rail = useRail<T, GestureFlatList<T>>();
  const [nativeOffset,setNativeOffset]=useState<SharedValue<number>|null>(null);
  const {progress,contentHeight,viewportHeight}=rail;
  useAnimatedReaction(()=>nativeOffset?.value??0,offset=>{
    // The header and rail follow the library's UI-thread value, without a JS round trip.
    progress.set(Math.max(0,Math.min(1,offset/Math.max(1,contentHeight.value-viewportHeight.value))));
    if(scrollOffset)scrollOffset.set(offset);
  },[nativeOffset,scrollOffset]);
  const suppliedAnimInit=props.onAnimValInit;
  const onAnimValInit=useCallback<NonNullable<DraggableFlatListProps<T>['onAnimValInit']>>(values=>{
    setNativeOffset(values.scrollOffset);suppliedAnimInit?.(values);
  },[suppliedAnimInit]);
  return <View style={{flex:1}}><DraggableFlatList {...props} ref={rail.ref}
    autoscrollThreshold={props.autoscrollThreshold ?? 100} autoscrollSpeed={props.autoscrollSpeed ?? 520}
    dragItemOverflow animationConfig={props.animationConfig ?? DRAG_ANIMATION}
    showsVerticalScrollIndicator={false}
    onContainerLayout={event=>{rail.layout(event.layout.height);props.onContainerLayout?.(event);}}
    onContentSizeChange={(w,h)=>{rail.content(h);props.onContentSizeChange?.(w,h);}}
    onAnimValInit={onAnimValInit}
    onScrollOffsetChange={props.onScrollOffsetChange}
    onDragBegin={index=>{rail.setDragging(true);void Haptics.selectionAsync().catch(()=>{});props.onDragBegin?.(index);}}
    onDragEnd={event=>{rail.setDragging(false);void Haptics.selectionAsync().catch(()=>{});props.onDragEnd?.(event);}}
  />{rail.scrollable?rail.rail:null}</View>;
}

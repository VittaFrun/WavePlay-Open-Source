/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable UI-thread state. */
/* eslint-disable react-hooks/refs -- Gesture callbacks read refs only when dispatched, never during render. */
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Platform, View, type FlatListProps, type ListRenderItem } from 'react-native';
import Animated, { measure, runOnJS, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useComposedEventHandler, useFrameCallback, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTheme } from '../theme';
import { movePlaylistRow, playlistDragScroll, playlistDragTarget } from '../utils/playlistDrag';
import { FastFlatList, useRail } from './FastScrollList';
const ignoreDrag=()=>{};
const AnimatedList=Animated.createAnimatedComponent(FlatList) as unknown as typeof FlatList;
type Props<T> = Omit<FlatListProps<T>,'data'|'renderItem'|'keyExtractor'|'onScroll'|'scrollEventThrottle'|'removeClippedSubviews'|'CellRendererComponent'|'numColumns'> & {
 data:T[];keyExtractor:(item:T,index:number)=>string;selecting:boolean;itemHeight:number;headerHeight?:number;
 scrollOffset?:SharedValue<number>;renderRow:(item:T,drag?:()=>void,active?:boolean)=>ReactNode;
 onReorder:(rows:T[])=>void;disabled?:boolean;onDragStateChange?:(dragging:boolean)=>void;
};
const MovingRow=memo(function MovingRow({index,height,from,to,reduced,children}:{index:number;height:number;from:SharedValue<number>;to:SharedValue<number>;reduced:boolean;children:ReactNode}){
 const style=useAnimatedStyle(()=>{
  const source=from.value,target=to.value;
  const shift=source<0?0:source<target&&index>source&&index<=target?-height:target<source&&index>=target&&index<source?height:0;
  return {opacity:source===index?0:1,transform:[{translateY:withTiming(shift,{duration:reduced?0:100})}]};
 });
 return <Animated.View style={style}>{children}</Animated.View>;
});
export function PlaylistInteractiveList<T>({selecting,renderRow,itemHeight,headerHeight=0,...props}:Props<T>){
 const renderPlain=useCallback<ListRenderItem<T>>(({item})=><>{renderRow(item)}</>,[renderRow]);
 if(selecting)return <FastFlatList {...props} renderItem={renderPlain}/>;
 return <PlaylistDragBody {...props} itemHeight={itemHeight} headerHeight={headerHeight} renderRow={renderRow}/>;
}
function PlaylistDragBody<T>({renderRow,onReorder,disabled,onDragStateChange,scrollOffset,itemHeight,headerHeight=0,...props}:Omit<Props<T>,'selecting'>){
 const reduced=useReducedMotion();const {colors}=useTheme();const {keyExtractor}=props;
 const [snapshot,setSnapshot]=useState<{item:T;keys:string[]}|null>(null);
 const latest=useRef(props.data),snapshotRef=useRef<typeof snapshot>(null);
 useLayoutEffect(()=>{latest.current=props.data;},[props.data]);
 const {ref:listRef,rail:scrollRail,scrollable,scrollHandler,layout,content,setDragging}=useRail<T>(scrollOffset);
 const nativeRef=useAnimatedRef<FlatList<T>>(),container=useAnimatedRef<View>();
 const attach=useCallback((node:FlatList<T>|null)=>{listRef.current=node;nativeRef(node);},[listRef,nativeRef]);
 const from=useSharedValue(-1),to=useSharedValue(-1),offset=useSharedValue(0),startOffset=useSharedValue(0),translation=useSharedValue(0);
 const candidate=useSharedValue(-1),ending=useSharedValue(false),viewport=useSharedValue(0),extent=useSharedValue(0);
 const begin=useCallback((index:number)=>{
  const rows=latest.current;if(!rows[index])return;
  const next={item:rows[index],keys:rows.map(keyExtractor)};
  snapshotRef.current=next;setSnapshot(next);setDragging(true);onDragStateChange?.(true);
  void Haptics.selectionAsync().catch(()=>{});
 },[keyExtractor,setDragging,onDragStateChange]);
 const finish=useCallback((source:number,target:number,commit:boolean)=>{
  const captured=snapshotRef.current;const rows=latest.current;
  if(commit&&captured&&rows.length===captured.keys.length&&rows.every((row,index)=>keyExtractor(row,index)===captured.keys[index])){
   const next=movePlaylistRow(rows,source,target);if(next!==rows)onReorder(next);
  }
  snapshotRef.current=null;setSnapshot(null);setDragging(false);onDragStateChange?.(false);
  from.value=-1;to.value=-1;ending.value=false;
 },[keyExtractor,onReorder,setDragging,onDragStateChange,from,to,ending]);
 const ownScroll=useAnimatedScrollHandler(event=>{offset.value=event.contentOffset.y;});
 const composed=useComposedEventHandler([scrollHandler,ownScroll]);
 const count=props.data.length;
 const frame=useFrameCallback(info=>{
  if(from.value<0||ending.value)return;
  const top=headerHeight+from.value*itemHeight-startOffset.value+translation.value;
  const next=playlistDragScroll(offset.value,Math.max(0,extent.value-viewport.value),top,itemHeight,viewport.value,info.timeSincePreviousFrame??16);
  if(next!==offset.value){offset.value=next;scrollTo(nativeRef,0,next,false);}
  to.value=playlistDragTarget(top+offset.value+itemHeight/2,headerHeight,itemHeight,count);
 },false);
 useLayoutEffect(()=>{frame.setActive(Boolean(snapshot));return()=>frame.setActive(false);},[frame,snapshot]);
 const pan=useMemo(()=>Gesture.Pan().enabled(!disabled).activateAfterLongPress(120)
  .onTouchesDown((event,manager)=>{
   const bounds=measure(container),touch=event.allTouches[0];
   if(!bounds||!touch||ending.value){manager.fail();return;}
   const x=touch.absoluteX-bounds.pageX,y=touch.absoluteY-bounds.pageY;
   const index=Math.floor((y+offset.value-headerHeight)/itemHeight);
   if(x<0||x>44||y<0||y>bounds.height||y+offset.value<headerHeight||index<0||index>=count){manager.fail();return;}
   candidate.value=index;
  })
  .onStart(()=>{from.value=candidate.value;to.value=candidate.value;startOffset.value=offset.value;translation.value=0;runOnJS(begin)(candidate.value);})
  .onUpdate(event=>{translation.value=event.translationY;to.value=playlistDragTarget(headerHeight+from.value*itemHeight+itemHeight/2+translation.value+offset.value-startOffset.value,headerHeight,itemHeight,count);})
  .onEnd(()=>{
   ending.value=true;const source=from.value,target=to.value;
   translation.value=withTiming((target-source)*itemHeight-offset.value+startOffset.value,{duration:reduced?0:100},done=>{if(done)runOnJS(finish)(source,target,true);});
  })
  .onFinalize(()=>{if(from.value>=0&&!ending.value)runOnJS(finish)(from.value,from.value,false);}),
 [disabled,container,ending,offset,headerHeight,itemHeight,count,candidate,from,to,startOffset,translation,begin,reduced,finish]);
 const overlayStyle=useAnimatedStyle(()=>({transform:[{translateY:headerHeight+from.value*itemHeight-startOffset.value+translation.value}]}));
 const renderItem=useCallback<ListRenderItem<T>>(({item,index})=><MovingRow index={index} height={itemHeight} from={from} to={to} reduced={reduced}>{renderRow(item,ignoreDrag,false)}</MovingRow>,[itemHeight,from,to,reduced,renderRow]);
 return <GestureDetector gesture={pan}><Animated.View ref={container} collapsable={false} style={{flex:1,overflow:'hidden'}}>
  <AnimatedList {...props} ref={attach} renderItem={renderItem} scrollEnabled={!snapshot} removeClippedSubviews={Platform.OS==='android'&&!snapshot} onScroll={composed} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
   onLayout={event=>{const height=event.nativeEvent.layout.height;viewport.value=height;layout(height);props.onLayout?.(event);}}
   onContentSizeChange={(width,height)=>{extent.value=height;content(height);props.onContentSizeChange?.(width,height);}}/>
  {snapshot?<Animated.View pointerEvents="none" style={[{position:'absolute',left:0,right:0,top:0,height:itemHeight,backgroundColor:colors.background,elevation:6,zIndex:2},overlayStyle]}>{renderRow(snapshot.item,ignoreDrag,true)}</Animated.View>:null}
  {scrollable?scrollRail:null}
 </Animated.View></GestureDetector>;
}

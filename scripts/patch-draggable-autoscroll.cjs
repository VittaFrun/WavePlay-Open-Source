const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(require.resolve('react-native-draggable-flatlist/package.json'));
const target = path.join(root, 'src/hooks/useAutoScroll.tsx');
const template = fs.readFileSync(path.join(__dirname,'templates/useAutoScroll.tsx.template'),'utf8');
if(!fs.readFileSync(target,'utf8').includes('export function useAutoScroll'))throw new Error('Revisa la versión del arrastre antes de aplicar el parche.');
if(fs.readFileSync(target,'utf8')!==template)fs.writeFileSync(target,template);
const mathTarget=path.join(root,'src/hooks/WavePlayAutoScroll.ts');
const math=fs.readFileSync(path.join(__dirname,'templates/dragAutoscroll.ts'),'utf8');
if(!fs.existsSync(mathTarget)||fs.readFileSync(mathTarget,'utf8')!==math)fs.writeFileSync(mathTarget,math);

// Preserve the public object ref and also register an animated native scroll ref.
const refTarget=path.join(root,'src/context/refContext.tsx');
let refs=fs.readFileSync(refTarget,'utf8');
if(!refs.includes('waveplay:animated-scroll-ref')){
 if(!refs.includes('useSharedValue, WithSpringConfig')||!refs.includes('  const refs = useMemo('))throw new Error('Revisa los refs de DraggableFlatList.');
 refs=refs.replace('useSharedValue, WithSpringConfig','useSharedValue, useAnimatedRef, WithSpringConfig')
  .replace('  scrollViewRef: React.RefObject<Animated.ScrollView>;','  scrollViewRef: React.RefObject<Animated.ScrollView>;\n  uiScrollRef: ReturnType<typeof useAnimatedRef<FlatList<T>>>;')
  .replace('  const refs = useMemo(', '  // waveplay:animated-scroll-ref\n  const uiScrollRef=useAnimatedRef<FlatList<T>>();\n  const refs = useMemo(')
  .replace('      scrollViewRef,','      scrollViewRef,\n      uiScrollRef,');
 fs.writeFileSync(refTarget,refs);
}

// Upstream schedules JS on every scroll frame even with no JS subscriber.
// Keep native scrolling and drag animation entirely on the UI thread in that case.
const listTarget=path.join(root,'src/components/DraggableFlatList.tsx');
let list=fs.readFileSync(listTarget,'utf8');
const scrollMarker='waveplay:optional-js-scroll';
if(!list.includes(scrollMarker)){
 const handler='  const scrollHandler = useAnimatedScrollHandler(';
 const bridge='        runOnJS(onScroll)(scrollOffset.value);';
 if(!list.includes(handler)||!list.includes(bridge)||!list.includes('[horizontalAnim]'))throw new Error('DraggableFlatList cambió el puente de scroll; revisa el parche.');
 list=list.replace(handler,`  // ${scrollMarker}
  const hasJsScrollListener = !!props.onScrollOffsetChange;
${handler}`)
  .replace(bridge,'        if (hasJsScrollListener) runOnJS(onScroll)(scrollOffset.value);')
  .replace('[horizontalAnim]','[horizontalAnim, hasJsScrollListener]');
 fs.writeFileSync(listTarget,list);
}

// The FlatList has one stable callback, forwarding both ref contracts.
list=fs.readFileSync(listTarget,'utf8');
if(!list.includes('waveplay:composed-scroll-ref')){
 if(!list.includes('    flatlistRef,')||!list.includes('ref={flatlistRef}'))throw new Error('Revisa el montaje de DraggableFlatList.');
 list=list.replace('    flatlistRef,','    flatlistRef,\n    uiScrollRef,')
  .replace('  const reset = useStableCallback(', `  // waveplay:composed-scroll-ref
  const setListRef=useStableCallback((node: FlatList<T> | null)=>{
    uiScrollRef(node);
    if(typeof flatlistRef === 'function')flatlistRef(node);
    else if(flatlistRef)(flatlistRef as React.MutableRefObject<FlatList<T> | null>).current=node;
  });
  const reset = useStableCallback(`)
  .replace('ref={flatlistRef}','ref={setListRef}');
 fs.writeFileSync(listTarget,list);
}

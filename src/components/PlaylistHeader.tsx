import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/** Fixed, compact header: scrolling never moves or resizes the list viewport. */
export function PlaylistHeader({hero,controls}:{hero:ReactNode;controls:ReactNode}) {
 return <View style={s.header}><View style={s.hero}>{hero}</View><View style={s.controls}>{controls}</View></View>;
}
const s=StyleSheet.create({header:{backgroundColor:'transparent'},hero:{minHeight:80},controls:{minHeight:68,paddingVertical:10,paddingHorizontal:8}});

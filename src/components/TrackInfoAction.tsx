import { router } from 'expo-router';
import type { Track } from '../types';
import { MenuAction } from './MenuAction';
export function TrackInfoAction({track,onClose}:{track:Track|null;onClose:()=>void}) {
 if(!track)return null;
 return <MenuAction icon="information-outline" label="Información de la canción" onPress={()=>{onClose();router.push({pathname:'/track/[id]',params:{id:track.id}} as never);}}/>;
}

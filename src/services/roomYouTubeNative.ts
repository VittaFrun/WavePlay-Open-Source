import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { parseYouTubeEvent, type YouTubeEvent } from '../utils/youtubeEvent';
export type RoomYouTubeEvent=YouTubeEvent;
type NativePlayer={setRoomActive?(active:boolean):void;configure(config:string,html:string):Promise<void>;stop():void;resumeLocal():void;addListener(name:string):void;removeListeners(count:number):void};
export const roomYouTubeNative=Platform.OS==='android'?NativeModules.WavePlayRoomYouTube as NativePlayer|undefined:undefined;
export function subscribeRoomYouTube(listener:(event:RoomYouTubeEvent)=>void){
  if(!roomYouTubeNative)return()=>{};
  const subscription=new NativeEventEmitter(roomYouTubeNative).addListener('WavePlayRoomYouTubeEvent',(raw:unknown)=>{
    const event=parseYouTubeEvent(raw);if(event)listener(event);
  });
  return()=>subscription.remove();
}

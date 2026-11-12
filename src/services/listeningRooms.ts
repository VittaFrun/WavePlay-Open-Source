import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ListeningRoom, ListeningRoomMember, RoomQueueItem, RoomSnapshot, RoomPlaybackState, Track } from '../types';
import { accountClient } from './account';

type RoomRow={id:string;host_user_id:string;invite_code:string;name:string;status:'active'|'closed';created_at:string;expires_at:string;control_mode?:'host'|'collaborative'};
type MemberRow={room_id:string;user_id:string;display_name:string;role:'host'|'guest';joined_at:string;avatar_url?:string|null};
const roomFromRow=(row:RoomRow):ListeningRoom=>({id:row.id,hostUserId:row.host_user_id,inviteCode:row.invite_code,name:row.name,status:row.status,createdAt:row.created_at,expiresAt:row.expires_at,controlMode:row.control_mode||'host'});
const memberFromRow=(row:MemberRow):ListeningRoomMember=>({roomId:row.room_id,userId:row.user_id,displayName:row.display_name,role:row.role,joinedAt:row.joined_at,avatarUrl:row.avatar_url||null});
const client=()=>{if(!accountClient)throw new Error('La cuenta todavía no está configurada.');return accountClient;};
const roomResult=(data:unknown)=>roomFromRow((Array.isArray(data)?data[0]:data) as RoomRow);

export async function currentAccount(){const {data,error}=await client().auth.getUser();if(error)throw error;if(!data.user)throw new Error('Inicia sesión para escuchar con amigos.');return data.user;}
export function accountDisplayName(user:{email?:string|null;user_metadata?:Record<string,unknown>}) {
  const named=typeof user.user_metadata?.name==='string'?user.user_metadata.name.trim():'';
  return (named||user.email?.split('@')[0]||'Amigo').slice(0,60);
}
export async function createListeningRoom(name:string,displayName:string){const {data,error}=await client().rpc('create_listening_room',{room_name:name.trim(),member_name:displayName});if(error)throw error;return roomResult(data);}
export async function joinListeningRoom(code:string,displayName:string){const {data,error}=await client().rpc('join_listening_room',{room_code:code.trim().toUpperCase(),member_name:displayName});if(error)throw error;return roomResult(data);}
export async function listListeningRoomMembers(roomId:string){const {data,error}=await client().from('listening_room_members').select('*').eq('room_id',roomId).order('joined_at');if(error)throw error;return (data as MemberRow[]).map(memberFromRow);}
export async function leaveListeningRoom(room:ListeningRoom,userId:string){
  if(room.hostUserId===userId){const {error}=await client().from('listening_rooms').update({status:'closed'}).eq('id',room.id);if(error)throw error;}
  else {const {error}=await client().from('listening_room_members').delete().eq('room_id',room.id).eq('user_id',userId);if(error)throw error;}
}
export function createListeningChannel(roomId:string,userId:string,displayName:string,role:'host'|'guest',handlers:{onChange:()=>void;onPresence:()=>void;onConnection:(connected:boolean,reason?:string)=>void}):RealtimeChannel {
  const channel=client().channel(`room:${roomId}`,{config:{private:true,broadcast:{self:false,ack:true},presence:{key:userId}}});
  channel.on('postgres_changes',{event:'*',schema:'public',table:'listening_room_playback',filter:`room_id=eq.${roomId}`},handlers.onChange);
  channel.on('postgres_changes',{event:'*',schema:'public',table:'listening_room_queue',filter:`room_id=eq.${roomId}`},handlers.onChange);
  channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'listening_rooms',filter:`id=eq.${roomId}`},handlers.onChange);
  channel.on('presence',{event:'sync'},handlers.onPresence);
  channel.subscribe((status,error)=>{
    handlers.onConnection(status==='SUBSCRIBED',error?.message);
    if(status==='SUBSCRIBED')handlers.onChange();
    else if(error){
      const cause=error.cause as {message?:string}|undefined;
      console.warn('[Sala] '+status+': '+error.message+(cause?.message?' · '+cause.message.replace(/\?[^\s]*/g,''):''));
    }
  });
  return channel;
}

export const queueFromRow=(row:any):RoomQueueItem=>({id:row.id,roomId:row.room_id,addedBy:row.added_by,addedByName:row.added_by_name,title:row.title,artist:row.artist,duration:row.duration,filename:row.filename,objectPath:row.object_path,artworkPath:row.artwork_path,fileSize:row.file_size,status:row.status,position:row.position,createdAt:row.created_at,source:row.source||'file',youtubeId:row.youtube_id||null});
const playbackFromRow=(row:any):RoomPlaybackState=>({revision:row.revision,trackId:row.track_id,positionSeconds:row.position_seconds,playing:row.playing,updatedAt:row.updated_at});
export async function getRoomSnapshot(roomId:string):Promise<RoomSnapshot|null>{
  const {data,error}=await client().rpc('get_room_snapshot',{target_room:roomId});if(error)throw error;if(!data)return null;
  return {room:roomFromRow(data.room),queue:data.queue.map(queueFromRow),playback:playbackFromRow(data.playback),serverNow:Number(data.server_now)};
}
export async function reserveRoomSong(roomId:string,track:Track,size:number,displayName:string){
  const {data,error}=await client().rpc('reserve_room_song',{target_room:roomId,song_title:track.title||track.filename,song_artist:track.artist||'Artista desconocido',song_duration:track.duration,song_filename:track.filename,song_size:size,member_name:displayName});
  if(error)throw error;return queueFromRow(data);
}
export async function updateRoomSong(id:string,status:RoomQueueItem['status']){
  const {data,error}=await client().from('listening_room_queue').update({status}).eq('id',id).select('id').single();if(error)throw error;if(!data)throw new Error('La canción ya no está disponible.');
}
export async function setRoomPlayback(roomId:string,trackId:string|null,seconds:number,playing:boolean,revision:number,reason:'command'|'skip'|'ended'|'restart'|'drift'='command'){
  const {data,error}=await client().rpc('control_room_playback_v2',{target_room:roomId,song_id:trackId,seconds,is_playing:playing,expected_revision:revision,transition_reason:reason});if(error)throw error;return playbackFromRow(data);
}
export async function addRoomYouTube(roomId:string,video:import('../types').YouTubeVideo,displayName:string){
  const {data,error}=await client().rpc('add_room_youtube',{target_room:roomId,video_id:video.id,song_title:video.title,song_artist:video.channel,song_duration:video.duration,member_name:displayName});if(error)throw error;return queueFromRow(data);
}
export async function setRoomControlMode(roomId:string,mode:'host'|'collaborative'){
  const {error}=await client().from('listening_rooms').update({control_mode:mode}).eq('id',roomId).select('id').single();if(error)throw error;
}
export async function reorderRoomQueue(roomId:string,ids:string[]){
  const {error}=await client().rpc('reorder_room_queue',{target_room:roomId,song_ids:ids});if(error)throw error;
}

export async function heartbeatListeningRoom(roomId:string,observed:{trackId:string|null;position:number;state:string}){const {error}=await client().rpc('heartbeat_listening_room',{target_room:roomId,observed_track:observed.trackId,observed_position:observed.position,player_state:observed.state});if(error)throw error;}
export async function updateRoomAvatar(roomId:string,avatar:unknown){
  if(typeof avatar!=='string'||!/^https:\/\//.test(avatar)||avatar.length>2048)return;
  const {error}=await client().rpc('set_room_avatar',{target_room:roomId,avatar_url:avatar});if(error)throw error;
}

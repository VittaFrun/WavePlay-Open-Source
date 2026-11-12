type ScannableAsset = {uri:string; filename:string; duration:number; modificationTime?:number; creationTime?:number};
type IndexedTrack = {uri:string; filename:string; duration:number; modifiedAt:number};

export function needsMetadataRefresh(asset:ScannableAsset, previous?:IndexedTrack, full=false) {
  if(full||!previous)return true;
  const modifiedAt=asset.modificationTime || asset.creationTime || 0;
  return previous.uri!==asset.uri || previous.filename!==asset.filename || previous.modifiedAt!==modifiedAt || Math.abs(previous.duration-asset.duration)>0.5;
}

export const audioFilePattern=/\.(mp3|m4a|aac|flac|wav|ogg|opus|webm)$/i;
const whatsappAudioName=/^(AUD|PTT)[-_]\d{8}[-_]WA\d+/i;
const whatsappAudioFolder=/[\\/]WhatsApp[\\/](Media[\\/])?(WhatsApp Audio|WhatsApp Voice Notes)([\\/]|$)/i;
const systemAudioFolder=/(^|[\\/])(Notifications|Ringtones|Alarms)([\\/]|$)/i;
export function includeScannedAudio(asset:{filename:string;duration:number;uri:string},folder?:string,explicitDownload=false){
 if(!audioFilePattern.test(asset.filename))return false;
 // An intentional download must not disappear because MediaStore hasn't
 // populated duration yet, or because automatic discovery limits exclude it.
 if(explicitDownload)return true;
 const location=folder||asset.uri;
 return asset.duration>90&&asset.duration<13*60&&!whatsappAudioName.test(asset.filename)&&!whatsappAudioFolder.test(location)&&!systemAudioFolder.test(location);
}

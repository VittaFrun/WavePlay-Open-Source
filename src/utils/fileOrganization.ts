import type { Track } from '../types';
export type OrganizationGrouping='flat'|'artist'|'album';
export function folderSegment(raw:string,fallback:string){
  const value=raw.normalize('NFKC').replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').replace(/\s+/g,' ').replace(/^[. ]+|[. ]+$/g,'').slice(0,65).trim();
  return value||fallback;
}
export function organizationDestination(folder:string,grouping:OrganizationGrouping,track:Pick<Track,'artist'|'album'>){
  const name=folder.trim();
  if(!name||name==='.'||name==='..'||/[\\/:*?"<>|\x00-\x1f]/.test(name)||name.length>65)throw new Error('Escribe un nombre de carpeta de hasta 65 caracteres, sin barras ni caracteres especiales.');
  const base=`Music/${folderSegment(name,'WavePlay')}/`;
  return grouping==='flat'?base:base+folderSegment(track.artist,'Artista desconocido')+'/'+(grouping==='album'?folderSegment(track.album,'Álbum desconocido')+'/':'');
}
export function organizationCandidates(tracks:readonly Track[],folder:string,grouping:OrganizationGrouping){
  return tracks.filter(t=>t.source==='device'&&!t.missing&&/^\d+$/.test(t.id)).map(t=>({assetId:t.id,uri:t.uri,fileName:t.filename,destination:organizationDestination(folder,grouping,t)}));
}

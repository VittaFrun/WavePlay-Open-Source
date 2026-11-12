import { playlistIdFromUrl } from '../utils/onlineTrack';
import { withRequestTimeout } from '../utils/requestTimeout';
import type { YouTubeVideo } from "../types";

const API = "https://www.googleapis.com/youtube/v3";
const PACKAGE = "com.waveplay.app";
const CERT = "5E8F16062EA3CD2C4A0D547876BAA6F38CABF625";
const cache = new Map<string, { time: number; items: YouTubeVideo[] }>();
const CACHE_TTL = 10 * 60_000;
const CACHE_LIMIT = 40;

const decode = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const seconds = (iso: string) => {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return match
    ? Number(match[1] || 0) * 3600 +
        Number(match[2] || 0) * 60 +
        Number(match[3] || 0)
    : 0;
};
const key = () => process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
const headers = () => ({
  "X-Goog-Api-Key": key() || "",
  "X-Android-Package": PACKAGE,
  "X-Android-Cert": CERT,
});

export async function getYouTubeVideo(id:string,signal?:AbortSignal):Promise<YouTubeVideo>{
  if(!/^[A-Za-z0-9_-]{11}$/.test(id))throw new Error('El enlace de YouTube no es válido.');
  if(!key())throw new Error('Falta configurar la clave de YouTube para esta compilación.');
  const params=new URLSearchParams({part:'snippet,contentDetails,status',id});
  const {response,data}=await withRequestTimeout(async signal=>{const response=await fetch(`${API}/videos?${params}`,{headers:headers(),signal});return {response,data:await response.json()};},15000,signal);
  if(!response.ok)throw new Error(data?.error?.message||'No se pudo consultar el video.');
  const item=data.items?.[0],duration=seconds(item?.contentDetails?.duration||'');
  if(!item||!item.status?.embeddable)throw new Error('Este video no está disponible para reproducirse en la sala.');
  if(duration<=0||duration>3600)throw new Error('Elige un video de hasta una hora; las transmisiones en vivo no se admiten.');
  return {id,title:decode(item.snippet.title),channel:decode(item.snippet.channelTitle),thumbnail:item.snippet.thumbnails?.medium?.url||`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,duration,publishedAt:item.snippet.publishedAt};
}

export async function searchYouTubeMusic(
  query: string,
  signal?: AbortSignal,
  insertableOnly = false,
): Promise<YouTubeVideo[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const cacheKey=q.toLocaleLowerCase()+':'+(insertableOnly?'insertable':'all');
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.items;
  if (!key())
    throw new Error(
      "Falta configurar la clave de YouTube para esta compilación.",
    );
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    maxResults: "15",
    q,
    regionCode: "CO",
    safeSearch: "moderate",
    ...(insertableOnly?{videoEmbeddable:"true"}:{}),
    fields:
      "items(id/videoId,snippet(title,channelTitle,thumbnails,publishedAt))",
  });
  const {response,data}=await withRequestTimeout(async signal=>{
    const response=await fetch(`${API}/search?${params}`,{headers:headers(),signal});
    return {response,data:await response.json()};
  },15000,signal);
  if (!response.ok)
    throw new Error(
      data?.error?.message || "YouTube no pudo completar la búsqueda.",
    );
  const ids = (data.items || [])
    .map((item: any) => item.id.videoId)
    .filter(Boolean);
  if (!ids.length) return [];
  const detailParams = new URLSearchParams({
    part: "contentDetails,status",
    id: ids.join(","),
    fields: "items(id,contentDetails/duration,status/embeddable)",
  });
  const {detailResponse,detailData}=await withRequestTimeout(async signal=>{
    const detailResponse=await fetch(`${API}/videos?${detailParams}`,{headers:headers(),signal});
    return {detailResponse,detailData:await detailResponse.json()};
  },15000,signal);
  if (!detailResponse.ok)
    throw new Error(
      detailData?.error?.message || "No se pudo obtener la duración.",
    );
  const unavailable = new Set<string>((detailData.items || []).filter((item:any)=>item.status?.embeddable===false).map((item:any)=>item.id));
  const durations = new Map(
    (detailData.items || []).map((item: any) => [
      item.id,
      seconds(item.contentDetails?.duration || ""),
    ]),
  );
  const items: YouTubeVideo[] = (data.items || []).filter((item:any)=>!insertableOnly||!unavailable.has(item.id.videoId)).map((item: any) => ({
    id: item.id.videoId,
    title: decode(item.snippet.title),
    channel: decode(item.snippet.channelTitle),
    thumbnail:
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.medium?.url ||
      item.snippet.thumbnails?.default?.url,
    duration: Number(durations.get(item.id.videoId) || 0),
    publishedAt: item.snippet.publishedAt,
  }));
  const now=Date.now();
  for(const [query,entry] of cache)if(now-entry.time>=CACHE_TTL)cache.delete(query);
  cache.delete(cacheKey);
  cache.set(cacheKey, { time: now, items });
  while(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value!);
  return items;
}

/** Collect first, commit later: cancellation never creates a partial playlist. */
export async function readPublicYouTubePlaylist(url:string,signal:AbortSignal,onProgress:(count:number)=>void){
  const id=playlistIdFromUrl(url);if(!key())throw new Error('YouTube no está configurado en esta versión.');
  const read=async(endpoint:string,params:Record<string,string>)=>{
    const {response,data}=await withRequestTimeout(async signal=>{const response=await fetch(`${API}/${endpoint}?${new URLSearchParams(params)}`,{headers:headers(),signal});return {response,data:await response.json()};},15000,signal);
    if(!response.ok)throw new Error(data?.error?.message||'No se pudo consultar la playlist pública.');return data;
  };
  const info=await read('playlists',{part:'snippet',id});
  if(!info.items?.length)throw new Error('La playlist no existe o no es pública.');
  const videos=new Map<string,YouTubeVideo>(),pages=new Set<string>();let page='';
  do{
    if(signal.aborted)throw new Error('Importación cancelada.');
    if(pages.has(page))throw new Error('YouTube repitió una página. Intenta de nuevo.');pages.add(page);
    const data=await read('playlistItems',{part:'snippet,contentDetails',playlistId:id,maxResults:'50',...(page?{pageToken:page}:{})});
    const entries=(data.items||[]).filter((item:any)=>/^[\w-]{11}$/.test(item.contentDetails?.videoId||''));
    const ids=entries.map((item:any)=>item.contentDetails.videoId);
    const details=ids.length?await read('videos',{part:'snippet,contentDetails,status',id:ids.join(',')}):{items:[]};
    const byId=new Map<string,any>((details.items||[]).map((item:any)=>[item.id,item]));
    for(const item of entries){const videoId=item.contentDetails.videoId,detail=byId.get(videoId),snippet=detail?.snippet||item.snippet;
      videos.set(videoId,{id:videoId,title:detail?decode(snippet.title):'Video no disponible',channel:decode(snippet.videoOwnerChannelTitle||snippet.channelTitle||'YouTube'),thumbnail:snippet.thumbnails?.medium?.url||`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,duration:seconds(detail?.contentDetails?.duration||''),publishedAt:snippet.publishedAt||''});
    }
    onProgress(videos.size);page=data.nextPageToken||'';
    if(videos.size>5000||pages.size>100)throw new Error('Importa playlists de hasta 5000 canciones.');
  }while(page);
  if(signal.aborted)throw new Error('Importación cancelada.');
  return {id,name:decode(info.items[0].snippet.title),videos:[...videos.values()]};
}

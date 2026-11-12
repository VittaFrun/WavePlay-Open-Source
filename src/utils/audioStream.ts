export type AudioStream={uri:string;headers:Record<string,string>;expiresAt:number};
export function validateAudioStream(raw:unknown,now=Date.now()):AudioStream{
 const value=raw as {url?:unknown;headers?:unknown};
 if(typeof value?.url!=='string')throw new Error('No se pudo obtener el audio.');
 const url=new URL(value.url),host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||!(host==='googlevideo.com'||host.endsWith('.googlevideo.com'))||url.username||url.password)throw new Error('La fuente de audio no es válida.');
 const expires=Number(url.searchParams.get('expire'))*1000;
 const expiresAt=Math.min(now+10*60*1000,Number.isFinite(expires)&&expires>0?expires-60000:now+10*60*1000);
 if(expiresAt<=now)throw new Error('El enlace de audio venció.');
 const headers:Record<string,string>={};
 if(value.headers&&typeof value.headers==='object')for(const [key,val] of Object.entries(value.headers))if(['user-agent','referer','origin','accept','accept-language'].includes(key.toLowerCase())&&typeof val==='string'&&!/[\r\n]/.test(val))headers[key]=val;
 return {uri:url.toString(),headers,expiresAt};
}
/** One active extraction; obsolete work can never publish a source. URLs remain in memory. */
export function createAudioStreamResolver(resolve:(id:string,job:string)=>Promise<unknown>,cancel:(job:string)=>void,now=()=>Date.now()){
 let generation=0,active:{id:string;job:string;promise:Promise<AudioStream|null>}|null=null;
 const cache=new Map<string,AudioStream>();
 const invalidate=()=>{generation++;if(active)cancel(active.job);active=null;};
 return {
  invalidate,evict(id:string){cache.delete(id);},
  run(id:string):Promise<AudioStream|null>{
   if(!/^[A-Za-z0-9_-]{11}$/.test(id))return Promise.reject(new Error('Canción inválida.'));
   if(active?.id===id)return active.promise;
   invalidate();const saved=cache.get(id);if(saved&&saved.expiresAt>now())return Promise.resolve(saved);
   const request=generation,job=`stream-${now()}-${request}`;
   const promise=resolve(id,job).then(raw=>{
    if(request!==generation)return null;
    const source=validateAudioStream(raw,now());cache.delete(id);cache.set(id,source);
    while(cache.size>8)cache.delete(cache.keys().next().value!);
    return source;
   }).catch(error=>{if(request!==generation)return null;throw error;}).finally(()=>{if(active?.job===job)active=null;});
   active={id,job,promise};return promise;
  }
 };
}

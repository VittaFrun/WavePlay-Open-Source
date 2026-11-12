/** Bound the whole request, including JSON decoding, and retain caller cancellation. */
export async function withRequestTimeout<T>(request:(signal:AbortSignal)=>Promise<T>,milliseconds=15000,parent?:AbortSignal):Promise<T>{
  const cancelled=()=>Object.assign(new Error('Operación cancelada'),{name:'AbortError'});
  if(parent?.aborted)throw cancelled();
  const controller=new AbortController();
  let rejectWait:(error:Error)=>void=()=>{};
  const interrupted=new Promise<never>((_,reject)=>{rejectWait=reject;});
  const abort=()=>{rejectWait(cancelled());controller.abort();};
  parent?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(()=>{
    rejectWait(Object.assign(new Error('La conexión tardó demasiado. Inténtalo otra vez.'),{code:'REQUEST_TIMEOUT'}));
    controller.abort();
  },milliseconds);
  const work=Promise.resolve().then(()=>{if(controller.signal.aborted)throw cancelled();return request(controller.signal);});
  try{return await Promise.race([work,interrupted]);}
  finally{clearTimeout(timeout);parent?.removeEventListener('abort',abort);}
}

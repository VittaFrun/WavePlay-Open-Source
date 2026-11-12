/** Coalesce accidental repeated taps without blocking a different destination. */
export function createNavigationGate(cooldown=350,clock=Date.now){
  let lastKey='',lastAt=-Infinity;
  return (key:string,open:()=>void)=>{
    const now=clock();
    if(key===lastKey&&now>=lastAt&&now-lastAt<cooldown)return false;
    const previousKey=lastKey,previousAt=lastAt;
    lastKey=key;lastAt=now;
    try{open();return true;}
    catch(error){lastKey=previousKey;lastAt=previousAt;throw error;}
  };
}

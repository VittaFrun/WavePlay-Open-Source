/** Stable projections keep unrelated room updates out of subscribed components. */
export function shallowRoomEqual(a:unknown,b:unknown){
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
  return Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>Object.is(left[key],right[key]));
}
export function createRoomSelection<T>(read:()=>T){
  let cached:{value:T}|undefined;
  const snapshot=()=>{
    const next=read();
    if(!cached||!shallowRoomEqual(cached.value,next))cached={value:next};
    return cached.value;
  };
  snapshot.setRead=(next:()=>T)=>{read=next;};
  return snapshot;
}

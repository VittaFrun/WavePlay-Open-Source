/** Short-lived UI state, bounded so obsolete searches cannot accumulate. */
export function createListPositionMemory(limit=40){
 const offsets=new Map<string,number>();
 return {
  get(key:string){return offsets.get(key)??0;},
  save(key:string,offset:number){
   if(!Number.isFinite(offset)||offset<0)return;
   offsets.delete(key);offsets.set(key,offset);
   while(offsets.size>limit)offsets.delete(offsets.keys().next().value!);
  },
 };
}

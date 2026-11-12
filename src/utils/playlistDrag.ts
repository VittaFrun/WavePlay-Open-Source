/** Move one existing row without cloning song objects or accepting stale membership. */
export function movePlaylistRow<T>(rows:T[],from:number,to:number){
 if(from===to||from<0||to<0||from>=rows.length||to>=rows.length)return rows;
 const next=rows.slice();const [item]=next.splice(from,1);next.splice(to,0,item);return next;
}
export function playlistDragTarget(center:number,header:number,height:number,count:number){
 'worklet';
 return Math.max(0,Math.min(count-1,Math.floor((center-header)/height)));
}
export function playlistDragScroll(offset:number,max:number,top:number,height:number,viewport:number,frameMs:number){
 'worklet';
 const edge=Math.min(90,viewport*.18);
 if(edge<=0||max<=0)return offset;
 const above=Math.max(0,top),below=Math.max(0,viewport-top-height),distance=Math.min(above,below);
 if(distance>=edge)return offset;
 const pressure=1-distance/edge;
 return Math.max(0,Math.min(max,offset+(above<below?-1:1)*pressure*pressure*720*Math.min(32,Math.max(0,frameMs))/1000));
}

/** Pixels per second, independent of refresh rate; no jumps after dropped frames. */
export function dragScrollTarget(offset:number,maxOffset:number,hoverTop:number,cellSize:number,viewport:number,threshold:number,speed:number,frameMs:number){
 'worklet';
 if(viewport<=0||threshold<=0||maxOffset<=0)return offset;
 const top=Math.max(0,hoverTop),bottom=Math.max(0,viewport-hoverTop-cellSize);
 const distance=Math.min(top,bottom);
 if(distance>=threshold)return offset;
 const pressure=Math.min(1,Math.max(0,1-distance/threshold));
 const delta=pressure*pressure*Math.max(0,speed)*Math.min(32,Math.max(0,frameMs))/1000;
 return Math.max(0,Math.min(maxOffset,offset+(top<bottom?-delta:delta)));
}

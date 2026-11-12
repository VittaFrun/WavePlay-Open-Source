/** Fixed playlist rows reserve both scaled text lines, padding and touch targets. */
export function playlistRowHeight(fontScale:number){
 const scale=Number.isFinite(fontScale)&&fontScale>0?fontScale:1;
 return Math.max(64,Math.ceil(18*scale)+Math.ceil(15*scale)+19);
}
export function playlistItemLayout(rowHeight:number,headerHeight:number,index:number){
 return {length:rowHeight,offset:headerHeight+rowHeight*index,index};
}

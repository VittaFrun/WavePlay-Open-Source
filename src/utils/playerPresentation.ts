export type PlayerTab='cover'|'lyrics'|'video';

/** Preserve the user's choice while adapting to the selected source. */
export function availablePlayerTab(preferred:PlayerTab,hasVideo:boolean,audioOnly=false):PlayerTab{
 return preferred==='video'&&!hasVideo?(audioOnly?'lyrics':'cover'):preferred;
}

export function playerTabIndex(tab:PlayerTab){return tab==='cover'?0:tab==='lyrics'?1:2;}

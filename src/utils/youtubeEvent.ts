export type YouTubeEvent={type:string;id:string;revision:number;position?:number;state?:number;code?:number;action?:string};
export function parseYouTubeEvent(raw:unknown):YouTubeEvent|null{
 if(typeof raw!=='string'||raw.length>2048)return null;
 let event;try{event=JSON.parse(raw);}catch{return null;}
 if(!event||typeof event.type!=='string'||typeof event.id!=='string')return null;
 // An embed restriction can arrive before the player is ready for its first command.
 if(event.type==='error'&&(event.code===101||event.code===150)&&event.revision===null)return {...event,revision:-1};
 return Number.isSafeInteger(event.revision)?event:null;
}

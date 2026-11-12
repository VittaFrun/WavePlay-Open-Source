import type { Track } from '../types';

export type SmartCollectionKey='most-played'|'recently-added'|'recently-played'|'favorites';
export type SmartCollection={key:SmartCollectionKey;title:string;tracks:Track[];subtitle:string};

export function smartCollections(tracks:Track[],recentlyPlayed:Track[]):SmartCollection[]{
  const most=[...tracks].filter(t=>(t.playCount||0)>0).sort((a,b)=>(b.playCount||0)-(a.playCount||0)||(b.lastPlayedAt||0)-(a.lastPlayedAt||0));
  const added=[...tracks].sort((a,b)=>(b.addedAt||b.createdAt)-(a.addedAt||a.createdAt));
  const favorites=[...tracks].filter(t=>t.favorite).sort((a,b)=>(b.lastPlayedAt||0)-(a.lastPlayedAt||0)||(b.addedAt||b.createdAt)-(a.addedAt||a.createdAt));
  const played=recentlyPlayed.slice(0,100);
  return [
    {key:'favorites',title:'Favoritas',tracks:favorites,subtitle:`${favorites.length} canciones`},
    {key:'most-played',title:'Más escuchadas',tracks:most,subtitle:`${most.length} canciones`},
    {key:'recently-played',title:'Reproducidas recientemente',tracks:played,subtitle:`${played.length} canciones`},
    {key:'recently-added',title:'Último agregado',tracks:added,subtitle:`${added.length} canciones`},
  ];
}

const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/database.cjs');
const {statsWindow,localDateKey,listeningTime,listeningChange}=require('../src/utils/listeningStats.ts');
const now=new Date(2026,9,26,12).getTime();
test('calendar periods include today and compare the same elapsed part of the previous period',()=>{
 const r=statsWindow('week',now);assert.equal(r.keys.length,7);assert.equal(r.keys[6],localDateKey(now));assert.equal(r.end,now+1);
 assert.equal(new Date(r.previousEnd-1).getHours(),12);assert.equal(statsWindow('all',now).previousStart,null);
 assert.throws(()=>statsWindow('bad',now));assert.equal(listeningTime(3675),'1 h 1 min');assert.equal(listeningChange(60,0),null);assert.equal(listeningChange(90,60),50);
});
test('empty analytics has bounded zero-filled activity and no invented comparison',async()=>{
 const {api,sql}=await fixture();try{const a=await api.listeningAnalytics('week',null,now);assert.equal(a.summary.seconds,0);assert.equal(a.days.length,7);assert.ok(a.days.every(d=>d.seconds===0));assert.equal(a.topTracks.length,0);assert.equal(a.firstRecordedAt,null);}finally{sql.close();}
});
test('analytics aggregates real listened seconds, isolates playlist sources and excludes future events',async()=>{
 const {api,sql}=await fixture();try{
 sql.exec("INSERT INTO tracks(id,uri,filename,title,artist,album,duration,created_at,modified_at) VALUES('a','a','a','Alpha','Artist','',300,0,0),('b','b','b','Beta','Artist','',400,0,0); INSERT INTO playlists(id,name,created_at) VALUES(1,'Mix',0);");
 const insert=sql.prepare('INSERT INTO listening_events(id,track_id,source_key,started_at,updated_at,listened_seconds,counted) VALUES(?,?,?,?,?,?,?)');
 insert.run('one','a','playlist:1',now-3600000,now,80,1);insert.run('two','a',null,now-3000000,now,20,0);insert.run('three','b','playlist:1',now-2000000,now,40,1);
 insert.run('future','b',null,now+1000,now+1000,999,1);insert.run('previous','b',null,statsWindow('week',now).previousStart+3600000,now,50,1);
 const pending=api.listeningAnalytics('week',null,now);assert.equal(pending,api.listeningAnalytics('week',null,now));const a=await pending;
 assert.equal(a.summary.seconds,140);assert.equal(a.summary.plays,2);assert.equal(a.summary.tracks,2);assert.equal(a.summary.activeDays,1);assert.equal(a.previousSeconds,50);assert.equal(a.topTracks[0].seconds,100);assert.equal(a.topArtists[0].seconds,140);assert.equal(a.playlists[0].seconds,120);assert.equal(a.days.reduce((v,d)=>v+d.seconds,0),140);
 const p=await api.listeningAnalytics('week','playlist:1',now);assert.equal(p.summary.seconds,120);assert.equal(p.topTracks[0].seconds,80);assert.equal(p.playlists.length,0);
 await assert.rejects(api.listeningAnalytics('week','playlist:abc',now));
 }finally{sql.close();}
});

test('removed metadata does not erase listening totals and all-time keeps a bounded chart',async()=>{
 const {api,sql}=await fixture();try{
 sql.prepare('INSERT INTO listening_events(id,track_id,started_at,updated_at,listened_seconds,counted) VALUES(?,?,?,?,?,?)').run('old','missing',new Date(2025,1,1,12).getTime(),now,125,1);
 const a=await api.listeningAnalytics('all',null,now);assert.equal(a.summary.seconds,125);assert.equal(a.topTracks[0].title,'Canci\u00f3n no disponible');assert.equal(a.days.length,30);assert.equal(a.days.reduce((v,d)=>v+d.seconds,0),0);assert.equal(a.previousSeconds,null);assert.equal(a.topArtists.length,0);
 }finally{sql.close();}
});

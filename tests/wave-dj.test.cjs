const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dailySelection, localDayKey, restoreDailySelection } = require('../src/utils/waveDj.ts');

const tracks = Array.from({ length: 34 }, (_, index) => ({
  id: String(index), title: `Canción ${index}`, artist: `Artista ${Math.floor(index / 5)}`,
  album: 'Álbum', filename: `${index}.mp3`, uri: `content://media/audio/${index}`,
  duration: 180, createdAt: 1, modifiedAt: 1, favorite: index % 8 === 0,
  playCount: index % 6 === 0 ? 10 : 0,
}));

test('Wave DJ is deterministic during a local day and changes the next day', () => {
  const today = dailySelection(tracks, '2026-09-30');
  assert.equal(today.tracks.length, 20);
  assert.deepEqual(today.tracks.map(track => track.id), dailySelection(tracks, '2026-09-30').tracks.map(track => track.id));
  assert.notDeepEqual(today.tracks.map(track => track.id), dailySelection(tracks, '2026-10-01', today.tracks.map(track => track.id)).tracks.map(track => track.id));
  assert.equal(localDayKey(new Date(2026, 8, 30)), '2026-09-30');
});

test('saved daily selection keeps order without missing songs', () => {
  const snapshot = { day: '2026-09-30', trackIds: ['2', '1', '2', 'missing'] };
  assert.deepEqual(restoreDailySelection(tracks, snapshot, snapshot.day).map(track => track.id), ['2', '1']);
  assert.deepEqual(restoreDailySelection(tracks, snapshot, '2026-10-01'), []);
  assert.equal(dailySelection([], snapshot.day), null);
});


test('DJ spreads artists and never duplicates a song', () => {
  const selection = dailySelection([...tracks, tracks[0]], '2026-10-07');
  assert.equal(new Set(selection.tracks.map(track => track.id)).size, 20);
  for (let i = 1; i < selection.tracks.length; i++) {
    assert.notEqual(selection.tracks[i].artist, selection.tracks[i - 1].artist);
  }
});
test('less feedback changes the first choices even in a small library', () => {
  const small = tracks.slice(0, 8).map(track => ({...track, artist: track.id}));
  const first = dailySelection(small, '2026-10-07').tracks[0].id;
  const next = dailySelection(small, '2026-10-07', [], [first]);
  assert.notEqual(next.tracks[0].id, first);
  assert.equal(next.tracks.length, small.length);
});

test('DJ sessions respect song count and approximate duration without duplicate files',()=>{
 const count=dailySelection(tracks,'2026-10-13',[],[],{count:10,seed:'session'});
 assert.equal(count.tracks.length,10);
 const duration=dailySelection(tracks,'2026-10-13',[],[],{minutes:15,seed:'session'});
 assert.equal(duration.tracks.length,5);
 assert.equal(duration.tracks.reduce((sum,track)=>sum+track.duration,0),900);
 assert.deepEqual(count.tracks.map(track=>track.id),dailySelection(tracks,'2026-10-13',[],[],{count:10,seed:'session'}).tracks.map(track=>track.id));
 assert.equal(dailySelection(tracks,'2026-10-13',[],[],{count:NaN}).tracks.length,20);
});
test('recent avoidance demotes songs heard in the last 48 hours',()=>{
 const now=Date.parse('2026-10-13T12:00:00Z');
 const library=tracks.map((track,index)=>({...track,artist:track.id,favorite:false,playCount:0,lastPlayedAt:index<10?now-1000:0}));
 const selection=dailySelection(library,'2026-10-13',[],[],{count:10,avoidRecent:true,now});
 assert.ok(selection.tracks.every(track=>Number(track.id)>=10));
});

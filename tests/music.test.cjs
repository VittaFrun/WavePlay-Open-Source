const assert = require('node:assert/strict');
const { test } = require('node:test');
const { filterTracks, localMixes, shuffled, lockScreenArtwork } = require('../src/utils/music.ts');
const { smartCollections } = require('../src/services/collections.ts');

const track = (id, extra = {}) => ({ id, title: id, artist: 'Artista desconocido', album: '', filename: `${id}.mp3`, uri: `content://media/audio/${id}`, duration: 180, createdAt: 1, modifiedAt: 1, ...extra });

test('lock-screen metadata never passes content, file or data URIs to Android URL', () => {
  for (const uri of [null, undefined, '', 'content://media/artwork/1', 'file:///cover.jpg', 'data:image/png;base64,AA', 'not a URI']) {
    assert.equal(lockScreenArtwork(uri), undefined);
  }
  assert.equal(lockScreenArtwork('https://example.com/cover.jpg'), 'https://example.com/cover.jpg');
});

test('empty libraries produce no fictional mixes', () => {
  assert.deepEqual(localMixes([]), []);
  assert.deepEqual(localMixes([track('missing', { missing: true })]), []);
});

test('mixes contain actual songs and respect listening history', () => {
  const tracks = [track('favorite', { favorite: true, playCount: 1 }), track('top', { playCount: 9 }), track('new'), track('gone', { favorite: true, missing: true })];
  const mixes = localMixes(tracks);
  assert.deepEqual(mixes.find(mix => mix.id === 'favorites').tracks.map(t => t.id), ['favorite']);
  assert.deepEqual(mixes.find(mix => mix.id === 'essentials').tracks.map(t => t.id), ['top', 'favorite']);
  assert.deepEqual(mixes.find(mix => mix.id === 'rediscover').tracks.map(t => t.id), ['new']);
  for (const mix of mixes) for (const item of mix.tracks) assert.ok(tracks.includes(item));
});

test('artist sessions require a real group, not unknown artist metadata', () => {
  assert.equal(localMixes(Array.from({ length: 4 }, (_, i) => track(String(i)))).some(mix => mix.id === 'artist'), false);
  const songs = Array.from({ length: 4 }, (_, i) => track(String(i), { artist: 'Mi artista' }));
  assert.equal(localMixes(songs).find(mix => mix.id === 'artist').title, 'Mi artista');
});

test('shuffle keeps the filtered membership and never mutates the original', () => {
  const list = Object.freeze([track('a'), track('b'), track('c')]);
  const result = shuffled(list);
  assert.notEqual(result, list);
  assert.deepEqual(result.map(t => t.id).sort(), ['a', 'b', 'c']);
  assert.deepEqual(list.map(t => t.id), ['a', 'b', 'c']);
  assert.deepEqual(shuffled([]), []);
  assert.deepEqual(shuffled([list[0]]), [list[0]]);
});

test('default playlists keep stable keys, correct ordering and real counts', () => {
  const songs = [track('a', { favorite: true, playCount: 1, addedAt: 3 }), track('b', { playCount: 5, addedAt: 5 })];
  const collections = smartCollections(songs, [songs[1]]);
  assert.deepEqual(collections.map(c => c.key), ['favorites', 'most-played', 'recently-played', 'recently-added']);
  assert.deepEqual(collections[1].tracks.map(t => t.id), ['b', 'a']);
  assert.equal(collections[0].subtitle, '1 canciones');
  assert.equal(collections[2].tracks[0].id, 'b');
});

test('library filtering, sorting and shuffle share the exact visible subset', () => {
  const songs = [track('b', { artist: 'Artista local', addedAt: 4 }), track('a', { artist: 'Artista local', addedAt: 6 }), track('other'), track('missing', { artist: 'Artista local', missing: true })];
  assert.deepEqual(filterTracks(songs, ' ARTISTA LOCAL ', 'title').map(t => t.id), ['a', 'b']);
  assert.deepEqual(filterTracks(songs, 'artista local', 'recent').map(t => t.id), ['a', 'b']);
  assert.deepEqual(shuffled(filterTracks(songs, 'artista local', 'title')).map(t => t.id).sort(), ['a', 'b']);
  assert.deepEqual(filterTracks(songs, 'absent', 'title'), []);
  assert.equal(songs[0].id, 'b');
});
test('recently played collection never exceeds 100 and last-added keeps its stable key',()=>{
 const songs=Array.from({length:150},(_,i)=>track(String(i),{playCount:150-i,addedAt:i+1}));
 const result=smartCollections(songs,songs);
 assert.equal(result[2].tracks.length,100);
 assert.equal(result[2].subtitle,'100 canciones');
 assert.deepEqual(result[2].tracks.map(t=>t.id),songs.slice(0,100).map(t=>t.id));
 assert.equal(result[3].title,'Último agregado');assert.equal(result[3].key,'recently-added');
 assert.deepEqual(result[1].tracks.map(t=>t.playCount),songs.map(t=>t.playCount));
});

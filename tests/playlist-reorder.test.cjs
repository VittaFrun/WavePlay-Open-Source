const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function databaseHarness() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE playlists (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  INSERT INTO playlists VALUES (1, 'Original'), (2, 'Otra');
  CREATE TABLE queue (position INTEGER PRIMARY KEY, track_id TEXT NOT NULL);
  CREATE TABLE downloads (id TEXT PRIMARY KEY,state TEXT);
  INSERT INTO downloads VALUES ('download-a','done'),('download-b','done');
  CREATE TABLE playlist_tracks (
    playlist_id INTEGER NOT NULL,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_id)
  );
  INSERT INTO playlist_tracks VALUES (1, 'a', 0), (1, 'b', 1), (1, 'c', 2), (2, 'a', 0);`);
  const conn = {
    execAsync:async query=>sql.exec(query),
    getAllAsync: async (query, ...params) => sql.prepare(query).all(...params),
    runAsync: async (query, ...params) => sql.prepare(query).run(...params),
  };
  conn.withExclusiveTransactionAsync = async (callback) => {
    sql.exec('BEGIN');
    try { await callback(conn); sql.exec('COMMIT'); }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  };
  const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/services/database.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: (name) => name === '../utils/listeningStats' ? require('../src/utils/listeningStats.ts') : name === './performance' ? require('../src/services/performance.ts') : name === 'expo-sqlite'
      ? { openDatabaseAsync: async () => conn }
      : name === '../utils/onlineTrack' ? require('../src/utils/onlineTrack.ts')
      : name === '../utils/serialQueue' ? require('../src/utils/serialQueue.ts')
      : name === '../utils/duplicates' ? require('../src/utils/duplicates.ts')
      : name === '../utils/muzio' ? require('../src/utils/muzio.ts')
      : (() => { throw new Error(name); })(),
  });
  const order = () => sql.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id=1 ORDER BY position').all().map((row) => row.track_id);
  return { sql, removeDownload:exports.removeDownload, saveQueue:exports.saveQueue, reorder: exports.reorderPlaylistTracks, removeMany: exports.removeTracksFromPlaylist, rename: exports.renamePlaylist, order };
}

test('dismissing a download persists without changing playlist songs or other downloads',async()=>{
  const db=databaseHarness();
  try{await db.removeDownload('download-a');await db.removeDownload('download-a');
    assert.deepEqual(db.sql.prepare('SELECT id FROM downloads').all().map(row=>row.id),['download-b']);
    assert.deepEqual(db.order(),['a','b','c']);
  }finally{db.sql.close();}
});

test('a dropped playlist order persists and invalid changes roll back', async () => {
  const db = databaseHarness();
  try {
    await db.reorder(1, ['c', 'a', 'b']);
    assert.deepEqual(db.order(), ['c', 'a', 'b']);
    await assert.rejects(db.reorder(1, ['c', 'c', 'b']));
    assert.deepEqual(db.order(), ['c', 'a', 'b']);
  } finally { db.sql.close(); }
});

test('a short drag in 229 songs updates only the affected range and failure rolls back both phases',async()=>{
 const db=databaseHarness();
 try{
  db.sql.exec('DELETE FROM playlist_tracks WHERE playlist_id=1; CREATE UNIQUE INDEX unique_playlist_position ON playlist_tracks(playlist_id,position)');
  const insert=db.sql.prepare('INSERT INTO playlist_tracks VALUES(1,?,?)');
  const original=Array.from({length:229},(_,i)=>`song-${i}`);original.forEach((id,i)=>insert.run(id,i));
  const next=[...original];next.splice(4,0,next.splice(1,1)[0]);
  const changes=()=>db.sql.prepare('SELECT total_changes() count').get().count;
  const before=changes();await db.reorder(1,next);assert.equal(changes()-before,8);
  assert.deepEqual(db.order(),next);
  const unchanged=changes();await db.reorder(1,next);assert.equal(changes(),unchanged);
  db.sql.exec("CREATE TRIGGER fail_order BEFORE UPDATE OF position ON playlist_tracks WHEN NEW.track_id='song-1' AND NEW.position=1 BEGIN SELECT RAISE(ABORT,'write failed'); END;");
  await assert.rejects(db.reorder(1,original));assert.deepEqual(db.order(),next);
 }finally{db.sql.close();}
});

test('bulk removal only changes the chosen playlist and compacts its order', async () => {
  const db = databaseHarness();
  try {
    await db.removeMany(1, ['a', 'c', 'a']);
    assert.deepEqual(db.order(), ['b']);
    assert.equal(db.sql.prepare('SELECT position FROM playlist_tracks WHERE playlist_id=1 AND track_id=?').get('b').position, 0);
    assert.equal(db.sql.prepare('SELECT COUNT(*) count FROM playlist_tracks WHERE playlist_id=2').get().count, 1);
  } finally { db.sql.close(); }
});

test('playlist rename validates and persists a trimmed name', async () => {
  const db = databaseHarness();
  try {
    await db.rename(1, '  Mi mezcla  ');
    assert.equal(db.sql.prepare('SELECT name FROM playlists WHERE id=1').get().name, 'Mi mezcla');
    await assert.rejects(db.rename(1, '  '));
    assert.equal(db.sql.prepare('SELECT name FROM playlists WHERE id=1').get().name, 'Mi mezcla');
  } finally { db.sql.close(); }
});


test('large queue batches preserve positions and atomically replace prior contents',async()=>{
  const {sql,saveQueue}=databaseHarness();
  try{
    const ids=Array.from({length:798},(_,index)=>`track-${index}`);
    await saveQueue(ids);
    assert.deepEqual(sql.prepare('SELECT track_id FROM queue ORDER BY position').all().map(row=>row.track_id),ids);
    await assert.rejects(saveQueue(['replacement',null]));
    assert.equal(sql.prepare('SELECT count(*) total FROM queue').get().total,798);
    await saveQueue([]);
    assert.equal(sql.prepare('SELECT count(*) total FROM queue').get().total,0);
  }finally{sql.close();}
});

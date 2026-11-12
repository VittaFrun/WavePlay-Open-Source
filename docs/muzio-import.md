# Muzio Playlist Import

Settings opens `/import-muzio`. Android users can select an extracted Muzio
backup root, `audio`, or `audio/playlist` using Storage Access Framework.
The importer reads numerically ordered `playlist_song_backup_N.json` files.
It does not execute backup content, modify original files, or upload data.

For this device migration, the original playlist JSON files are staged in
the app-owned external files directory `muzio-import`. They are not bundled
in the APK or added to the repository. Opening the importer previews them;
only pressing Import Selection writes to the database.

Matching uses normalized file paths, or an unambiguous full filename if the
file moved. Known size and duration must agree with Muzio's identicalKey.
Old MediaStore IDs and fuzzy song-title matches are deliberately not trusted.
Unavailable and ambiguous songs are omitted and listed in the preview.
Memberships are deduplicated and ordered as recorded in the JSON files;
the backup does not provide a separate explicit position field.

Favorites (Muzio ID 1 and a recognized favorite name) are added to WavePlay's
favorite flags. Existing favorites are never cleared. Other lists are created
without replacing existing playlists. Name collisions receive a Muzio suffix.
Source-to-target mappings in the settings table make repeated imports additive
and idempotent. Re-importing after a scan can add newly found songs. Deleting
an imported playlist permits it to be recreated on a later import.

Muzio's empty-playlist sentinel (`mediaId: -1`, empty path and identicalKey)
preserves playlist metadata but is not counted as a song or missing entry.

All selected playlist memberships, favorite flags, and mappings are committed
in one exclusive transaction. Track availability is checked again inside it.
Any failure rolls back the entire import. No listening counts, audio files,
lyrics, tags, or custom covers are imported in this first version.

Tests cover schema validation, moved files, duplicate filenames, changed
files, membership order, Favorites, name collisions, repeat imports, deletion
and recreation, and transaction rollback against an in-memory SQLite database.

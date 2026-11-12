# Home, Navigation and Lyrics Review

## Implemented

- Headers remain inside their original scrolling content.
- Larger cover mosaic for the daily selection; mixes show real song counts and duration.
- Recent additions now play from their action button; most-played rows show actual counts.
- Swipe inside Library to switch Songs/Playlists. Swipes starting at the outer 28 points
  switch main tabs without claiming horizontal song carousels. Tab transitions move horizontally; Library content slides when changing its internal tab.
- Compact playlist cover/statistics columns and a shuffle action with a random first track.
- Shared bottom-sheet component for player settings, timer, collection actions and duplicates.
- In-app HTTPS Google LRC search with an optional megalobiz keyword, browser back,
  reload, recoverable loading errors and an editor shortcut. Text selection/copy uses the
  native WebView; paste uses the existing lyrics editor. No scraping or automatic imports.
- Duplicate review in Settings uses exact URI or matching title, known artist, duration
  and file size. These are possible matches, not content hashes. The user chooses a keeper.
- Hiding duplicates never deletes audio, retains history/favorites in the stored records,
  transfers playlist membership, removes queue copies and records scan exclusions.
  Restore reverses the hidden entries and original playlist links. Cleanup is transactional.
- Scan is guarded against concurrent runs, preserves existing metadata when title/artist/
  album/artwork reads fail, skips hidden duplicates and does not mark app-source downloads
  missing when they are absent from MediaStore. Existing duration/WhatsApp filters remain.

## Checks

TypeScript, Expo lint without cache and 44 Node tests passed. The duplicate tests cover
conservative matching, keeper preference, playlist restoration, rollback and app-source
protection. The LRC test checks query encoding and the Megalobiz filter.

## Phone Acceptance

- Swipe Library both directions, then main tabs from the screen edges; verify vertical
  lists, horizontal carousels, selection and drag reordering still work.
- Scroll each screen; check the dock, mini player, long names and large text.
- Open lyrics Web LRC, visit a result, select/copy LRC, open the editor, paste and save.
  Check back, close, keyboard, offline/retry and switching Google/Megalobiz. External pages
  may present consent/CAPTCHA or restrict copying; their availability is not guaranteed.
- Review duplicate routes, keep one copy, rescan, restart and restore. Confirm original
  playlists and physical files remain; the playing copy must be retained.
- Check the playlist shuffle action starts a varied first song and retains membership.

No AI DJ, mood classification, web audio downloads or filesystem duplicate deletion added.

## Follow-Up Adjustments

- Reverted the new fixed-header wrappers; header content and background are back in
  their earlier positions within the scrolling views.
- The Lyrics presentation hides song metadata and waveform, allocates more vertical
  space, enlarges the lyric text and removes saved-source labels. Follow, editing and
  both search options remain available.
- Playlist details and smart collections use the shared floating MiniPlayer, respecting
  the bottom safe area. The play glyph uses an explicit centered line box.
- Main tabs slide horizontally instead of fading; Library internal tab content slides.
  Reduced-motion preferences disable those JS transitions.
- Home no longer has the update shortcut; shuffle uses a compact glass/accent action.
- The optional search query suffix is now just `megalobiz`, without `site:` or `.com`.
- Fixed the web-search modal not being mounted in the already-loaded lyrics branch.

TypeScript, uncached Expo lint and the 44 tests passed again. Gesture motion, copy/paste
and keyboard interaction still require user acceptance on the phone.

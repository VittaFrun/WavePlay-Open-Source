# Appearance

Profile > Apariencia offers five accents, a solid background, Noche anime and
a gallery image. Changes preview live across the interface without writing preferences; Apply saves,
and leaving discards the draft.
Restore resets the draft, so it also requires Apply. Existing audio, playlists
and playback session data are untouched.

Settings are validated and saved under `waveplay.appearance.v1` in AsyncStorage.
The picker uses the system photo selection UI, not a full-library scan. On Apply,
the selected image is copied into the app document `appearance` directory.
The previous owned image is removed only after persistence succeeds. Missing or
unreadable background images leave the dark base behind the interface.

The shared ThemeContext drives inline colors and component style factories.
Canvas transparency is separate from the dark foreground color used on bright
buttons. Artwork, semantic error colors and YouTube content are not recolored.
Dim is bounded to 0-90 percent; blur is bounded to 0-20. The image coverage slider is bounded to 0-100 percent: zero covers the entire
wallpaper with the solid canvas color; 100 keeps the whole image visible.
Intermediate levels fade to solid before the selected vertical boundary.
Invert places the image area at the bottom. Legacy settings default to full
image coverage; the old gradient field remains compatible but is no longer used
by the renderer. Dim remains an independent uniform overlay. The same
ThemeWallpaper/BackgroundShade components render the preview, live app and
song-selection modal. Backgrounds are static,
pointer-inert and do not interrupt native media playback.
Image themes use translucent panels rather than opaque surface colors. Framing
can fill the viewport (cover) or show the complete image (contain), with dark
space around images whose aspect ratio differs. Artwork thumbnails retain their
original appearance. Solid themes retain their opaque panels.

## Original Asset

`assets/theme-anime.png` was generated with the built-in image_gen tool.
Prompt: Create a single original anime-style portrait wallpaper for a music app,
9:16 vertical. Quiet illustrated nighttime rooftop with one young adult woman
wearing over-ear headphones at the lower right, turquoise city windows and
cherry blossoms at the upper edges, deep charcoal center with ample uncluttered
negative space for readable music lists. Hand-painted anime background,
restrained pink and mint accents, crisp illustration, no text, no logos,
no existing franchise characters. Save as an app background asset.

## Checks

Run lint, TypeScript and `node --test tests/*.test.cjs`. Native acceptance should
cover preset changes across all tabs/player, background persistence after
restart, picker cancellation, gallery files being moved/deleted externally,
small screens and larger system text. Tests of appearance normalization do not
replace these device interactions.
## Glass and Library Update

Wallpaper blur (0-20 native radius, displayed as 0-100%) and panel blur
(0-100 intensity, default 45) are separate sliders. Dim and gradient also use
sliders. Preview panels sample their own preview wallpaper, not the saved theme.
Android SDK 57 BlurViews use BlurTargetView references and
dimezisBlurViewSdk31Plus; older Android versions retain the tinted fallback.
Menus have fixed 35-intensity background blur and opaque sheets for readability.

Library uses joined image cells with dividing lines. Created playlists share
the same tile component and can switch between grid/list; the selection persists.
Default and created playlist headers and song rows are shared. Long-press the
leading drag handle to reorder. Created playlists retain Save/Cancel ordering;
smart collections save their display order separately without changing membership.
New collection members append after the saved order; missing members are ignored.

assets/playlist-anime-atlas.png is an original image_gen illustration, 2x2 atlas:
romantic cherry-blossom balcony (favorites), mint music studio (most played),
dusk train platform (recently played), lavender record shop (recently added).
No franchise characters, logos or text. Created playlists continue using real
song artwork, with the same tile treatment.

Device acceptance also covers sliders/preview/Apply, translucent panels,
dropdown blur, saved collection order, playlist drag Save/Cancel, grid/list
persistence and accent-colored navigation edges.
## Compact Library Polish

Song rows use 44px artwork, 13px titles, 64px minimum row height and 14px
screen insets. Current overflowing titles use a native-driver marquee at
28px/second, with an initial reading pause. Short titles stay still. Motion
stops on pause, screen blur, backgrounding or system/app reduced-motion mode.
The miniplayer retains favorites and adds next-track access, with a glass
surface and a restrained bottom progress line. Navigation edge glow is smaller.

Default artwork has a collection icon. Most-played rows show headphones with
the real play count. Most played, recently played and last-added open in their
canonical rank/time order, regardless of older custom display orders; manual
dragging can override the order during the current visit. Recent history is
limited to 100 distinct songs. Last-added has calendar-day group headings.
Dragging last-added cannot move songs between day groups. Favorites retains
its saved manual order.

Song selection uses shared compact rows, visible-result select/deselect-all,
a selected counter, search and a safe-area footer rather than a floating
confirmation button. Hidden selections survive filtering. Save errors retain
the selection. Header icon buttons sample the wallpaper through the shared
blur target, with a local target inside the selection modal.

Native acceptance: long/short titles with pause/resume and reduced motion,
live theme Apply/back and gallery cancellation, 0/50/100% coverage and inversion,
menus, long playlists, day categories, drag/save/cancel and batch selection.

The navigation dock now uses `appearance.panelBlur` rather than a fixed blur.
Its border halo is a single subtle 3px shadow. Shared MotionModal animates
opening and closing with native opacity/translation, retaining the modal for
the closing transition; app and system reduced-motion settings take priority.

Player presentation is stored separately in `waveplay.player-presentation`:
classic artwork, rotating vinyl, full-screen artwork, or editorial layout.
Presentation changes do not alter playback or the global appearance settings.
Vinyl rotation stops while paused, unfocused or backgrounded. The queue and
sleep timer remain available below the transport controls.

Timed lyrics follow the active line, pause following on manual scrolling and
resume through the Follow control or a timestamped line tap. Untimed text does
not invent timing. LRC metadata is omitted, offsets are applied in milliseconds,
and searching remains explicitly user initiated. Both playlist detail types
place real listening totals in a right-hand column beside artwork and title.

Native acceptance also includes presentation persistence, vinyl pause/resume,
full-screen contrast, modal reversal, synchronized lyric seeks and manual
scrolling, untimed lyrics, font scaling, and dock blur at 0/50/100.

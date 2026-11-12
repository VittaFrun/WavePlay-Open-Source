# WavePlay: adaptation of the Stitch proposal

## Visual Theme
Mobile-first music interface, balanced density, artwork-led content and compact
controls. Stitch project: 7325073541907909465. The eight source screens remain
unchanged. Generated HTML is a visual reference, not application code.

## Palette and Typography
Canvas #13131A, lowest surface #0E0E15, low surface #1B1B22, surface #1F1F26,
high surface #2A2931, text #E4E1EC, secondary text #D6C0D3, outline #9F8B9D.
Use restrained pink #FBABFF for selection and primary actions. Keep the existing
Plus Jakarta Sans family: body 14, metadata 12, section titles 20, screen titles
24. Zero letter spacing. Do not use decorative glow or background orbs.

## Components and Layout
Four bottom destinations, persistent local miniplayer above navigation. Respect
bottom safe areas and reserve list space for both. Controls have at least 44px
touch targets. Repeated cards have 8px corners; navigation and segmented modes
may be pill-shaped. Sections are unframed. Use real library artwork with a
recoverable fallback. Truncate list titles; allow detail titles to wrap.

## Behavior and Motion
Preserve native playback and existing database. Prefer restrained feedback,
no perpetual decoration. DJ displays local rule-based mixes, not an AI chat.
Show only actual metadata; never infer lossless quality, moods or BPM. No fake
accounts, notifications, synchronization or online/local unified queue.

## Validation
Typecheck, lint, Android bundle, pure logic regression tests. Verify on a real
device when available: playback, permissions, missing media, session restoration,
navigation, long text, small screens and YouTube error recovery.

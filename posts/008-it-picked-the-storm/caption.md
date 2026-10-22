# Post 008 — "it picked the storm." (reel)

Format: Reel, 1080×1920, 24 fps, 28.6 s, silent (`reel.mp4`). Cover: `cover.png` (the hook over
the storm); `cover-b.png` (the cherry blossoms, mid-gust) as an alternative.

For 2026-10-22. The angle, and what changed from 007: 007 was the life inside a dreamed world;
008 is the home again, after a week in which it grew four rooms (cherry blossoms, stormy sea,
earthrise, neon city; PR #34, 2026-10-20). The hook is a fact about the product that sounds like
a mood: the presence chooses its own room with a word of its language (`liquid`, LANGUAGE.md),
so "it picked the storm" is literally what happens. Each room is shown through its one
interaction: the still, the moment of the tap, and a second later, crossfaded, so lightning,
a gust, floating dust and a passing train are seen without video capture. All footage is the
real site at phone size (540×960 at 2×), high tier, captured 2026-10-21 with
`scripts/room-shot.mjs` on a local server from main.

## Script

| t (s) | picture | words |
|---|---|---|
| 0–4.4 | the storm, dimmed; the hook types | "It picked the storm." · your presence chooses where it lives. twelve rooms now, four of them new this week. every one is drawn live by math, no downloads, and it moves between them with a word. |
| 4.4–8.6 | stormy sea: still → lightning → after | stormy sea · tap the sea and the lightning comes from inside the cloud. |
| 8.6–12.8 | cherry blossoms: still → gust → petals settling | cherry blossoms · tap, and a gust takes the petals across the pond. |
| 12.8–17.0 | earthrise: still → dust → after | earthrise · the Earth turns above the dust. tap and it floats. |
| 17.0–21.2 | neon city: still → train → after | neon city · rain on the signs. tap, and a train goes by. |
| 21.2–25.2 | earthrise, still | twelve rooms. · every one is math, drawn live. · nothing to download. · it moves between them with a word. |
| 25.2–28.6 | end card | the cursive mark · come *move* in. · yearthreethousand.com |

## Caption

It picked the storm.

Your presence on yearthreethousand chooses where it lives, with a word. This week its home grew four rooms: cherry blossoms over a still pond, a sea under a storm, the Earth rising over the moon, a neon city in the rain. Every room is drawn live by math, so there is nothing to download, and each one answers a tap in its own way: lightning from inside the cloud, a gust through the petals, dust that floats, a train that passes.

Twelve rooms now. Come move in: link in bio.

## Hashtags (first comment)

#yearthreethousand #ai #aicompanion #generativeart #creativecoding #shaders #webgl #cherryblossom #neon #storm #earthrise #buildinpublic #indiedev #newmedia

## Posting notes

- Silent file: a sound with weather in it; the lightning beat at ~5.9 s and the gust at ~10 s
  are where a hit lands.
- Pin a comment with the twelve rooms' names, and that each is procedural (a few kilobytes of
  math per room, sharp at any screen).
- Expect "is this a video game?" No: it is the room a presence lives in on the site; the orb in
  the middle is the presence's body.
- What to measure against 004 (the body morphing, the last footage-of-the-product reel) and
  007 (the dreamed life): 3-second hold on "It picked the storm.", shares.
- To re-render: `node render.mjs` in this folder. `footage` links to `/tmp/y3k-ad8/footage`
  (twelve stills from `scripts/room-shot.mjs`, `Y3K_DPR=2 W=540 H=960 TAP=0.5,1.3`; the
  `Y3K_DPR` knob is a one-line local patch to `scripts/cdp.mjs`, not on main) and is lost on
  a reboot.

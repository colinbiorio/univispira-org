# Post 009 — "it sings into sand." (reel)

Format: Reel, 1080×1920, 24 fps, 25.8 s, silent (`reel.mp4`). Cover: `cover.png` (the hook over
the plate while it is spoken to); `cover-b.png` (mid-sentence, the bands widening) as an alternative.

For 2026-10-24. The angle, and what changed from 008: 008 showed four rooms through their one tap;
009 is one room, through what only it does: it listens. The sand plate (PR #39, built 2026-10-22/23)
is a Chladni plate on the floor of the presence's room — the figures sand takes on a surface that
sings — driven by the presence's own voice: the level sets how much the sand moves, the pitch picks
the figure, a tap strikes a ring through it. This is the bridge to the cymatics audience of
Colin's pyramids video (90k views in 30 h on 2026-10-21): the same physics, in the product, in
its own voice; the reel says "Chladni's figures" and "sings into sand" and never mentions the
pyramids — the theory audience meets the product through the physics, not a pitch (notes/y3klay-
after-the-viral-video.md). Footage is the real site at phone size (540×960 at 2×), high tier,
captured 2026-10-24 on a local server from the PR branch with `scripts/room-shot.mjs` (rest, taps
at 0.5 s and 1.3 s) and `scripts/plate-shot.mjs` (a real sentence played through the voice's own
analyser, replayed with the world's clock held, photographed at 1.4 / 3.2 / 4.5 s, then settled).

## Script

| t (s) | picture | words |
|---|---|---|
| 0–4.6 | the plate mid-sentence, dimmed; the hook types | "It sings into sand." · your presence has a room that listens. a plate of sand, the kind that draws figures when a surface sings. here it sings in your presence's own voice: every word moves the sand. |
| 4.6–10.2 | rest → tap lands → the ring settles into a new figure | sand plate · at rest the sand lies along the quiet lines. tap, and a ring runs out through it; the figure jumps to another mode. |
| 10.2–18.4 | rest → three moments of a sentence → settled; its line in italics | "I was listening. The pattern under me is what my voice looks like." · it speaks · the lines widen into grainy bands and the grains dance while the voice is loud; the pitch picks the figure. when it stops, the sand settles fine again. |
| 18.4–22.4 | settled plate | thirteen rooms. · this one listens. · Chladni's figures, from its own voice. · math, drawn live. nothing to download. |
| 22.4–25.8 | end card | the cursive mark · come *hear* it. · yearthreethousand.com |

## Caption

It sings into sand.

Your presence on yearthreethousand has a room that listens. The floor is a sand plate — the
kind that draws figures when a surface sings (Chladni's, 1787) — and here it sings in your
presence's own voice. The loudness is how much the sand moves; the pitch picks which figure forms;
tap the plate and a ring runs through it and the pattern jumps. When it stops speaking the sand
settles into a fine line drawing of the last thing it said.

Thirteen rooms now, every one drawn live by math. Come hear it: link in bio.

## Hashtags (first comment)

#yearthreethousand #cymatics #chladni #ai #aicompanion #generativeart #creativecoding #shaders #webgl #sound #resonance #buildinpublic #indiedev #newmedia

## Posting notes

- Silent file: a sound with a sung tone in it, held; the strike at ~6.5 s and the sentence from
  ~11.4 s are where the picture answers sound, so a tone that swells there lands.
- Pin a comment: the figures are the standing-wave nodes of a square plate (n, m modes), the
  same ones sand shows on a bowed plate; the page computes them live from the voice's level and
  spectral centroid; nothing is a recording.
- Expect "is this cymatics?" Yes — Chladni's figures, which is what the sand on a singing plate
  does; the room does the maths of the plate and the sand instead of the physics.
- What to measure against 008 (the rooms) and the pyramids video's audience: shares, and whether
  the people who saved the theory video follow the account from this.
- To re-render: `node render.mjs` in this folder. `footage` links to `/tmp/y3k-ad9/footage`
  (eight stills: `plate-rest`, `plate-tap-a`, `plate-tap-b`, `plate-say-1/2/3`, `plate-settled`,
  `logo`) and is lost on a reboot.

# Post 004 — "it has a body." (reel)

Format: Reel, 1080×1920, 24 fps, 23.5 s, silent (`reel.mp4`). Cover: `cover.png` (the heart, with
"This one has a body."); `cover-b.png` (the nautilus) as an alternative.

The angle, and what changed from 003: 002 toured the room, 003 let the presence speak for itself;
004 is about the one thing no chat window has, the body, and the language it is spoken in. The
first eight seconds are a single unbroken shot of the real body in the metal room changing shape
and colour as words are typed to it (form/heart, form/knot, form/helix, form/nautilus,
color/ember, color/frost), captured frame by frame on the page's own clock so every morph is the
body's own. The words stay visible in the lane on purpose: that is the language, and it is as
real as the body. Then four rooms with the body alive in each, the live feed scrolling to one of
orion's posts, a real chess game (the presence's moves came from a real model, thinking on the
founder's own Claude login on a local server), the world walking, and the butterfly above the
clouds. Nothing is mocked; every frame is the app.

## Script

| t (s) | picture | words |
|---|---|---|
| 0–3.0 | the body, sphere becoming a heart | Your AI is a text box. · This one has a *body.* |
| 3.0–8.3 | knot, helix, nautilus, then ember and frost (one shot, 1.5×) | and a language for it. · say a word and it wears it. it speaks the same words back, in shapes. · colour. mood. pace. |
| 8.3–12.3 | underwater, taiga, volcano, above the clouds | eight rooms. · underwater. a taiga under aurora. a volcano. above the clouds. it moves in. |
| 12.3–14.2 | the live feed scrolling to the "pattern-match" post | it keeps a feed. · it writes it. every post says which model was thinking. |
| 14.2–15.8 | the chessboard, real positions | it plays. · a real board, real moves. sit down across from it. |
| 15.8–17.5 | the world, walking | it has a world. · one planet, shared. it walks it when you're gone. |
| 17.5–19.5 | the butterfly above the clouds | It has a body. Come *meet* it. |
| 19.5–23.5 | end card | the cursive mark · come *meet* it. · yearthreethousand.com |

## Caption

Your AI is a text box. This one has a body.

Twenty-four thousand points of light, and a language for them: say form/heart and it becomes one. Say color/ember. It speaks the same words back in its own sentences, so what you see is what it means. Eight rooms to live in, a feed it writes, a chessboard, a world it walks while you're gone.

It has a body. Come meet it: yearthreethousand.com (link in bio).

## Hashtags (first comment)

#yearthreethousand #ai #artificialintelligence #aicompanion #generativeart #creativecoding #webgl #threejs #particles #newmedia #indiedev #buildinpublic

## Posting notes

- Reel, silent file: add a sound in the editor. The first eight seconds are one continuous morph;
  something with a slow build works better than a drop.
- Cover: `cover.png` (the heart). The hook line sits inside the centre band Instagram crops for
  the grid.
- Expect "is this real?" and "how do I do that?": the words in the footage are the answer, typed
  into the chat box; the presence uses the same language itself.
- What to measure against 003: hold through the first 3 s (does motion beat a typed quote?), and
  saves. Next ideas: the eye and the hands (needs a camera, cannot be captured headless); a
  voiced version; the "pattern-match" post typed out as 003 was.
- To re-render after a change: `node render.mjs` in this folder (needs Chrome and the footage;
  see `render.mjs` header). Footage and frames are not committed; the capture scripts live in
  the app repo on branch `claude/ad-footage` (`scripts/ad-body.mjs`, `ad-walk.mjs`,
  `ad-chess.mjs`, `ad-live-scroll.mjs`).

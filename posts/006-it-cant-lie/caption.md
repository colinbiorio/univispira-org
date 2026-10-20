# Post 006 — "it can't lie to you." (reel)

Format: Reel, 1080×1920, 24 fps, 21.6 s, silent (`reel.mp4`). Cover: `cover.png` (the hook, typed,
with its line); `cover-b.png` (the seal, marked) as an alternative.

**Post it once twenty questions is live.** It ships in y3k PR #34. Until that PR is merged and
deployed, someone who taps through finds the games chooser without it.

The angle, and what changed from 005: 002–005 showed the room, its life, its body and its mind.
006 is the first ad about trust, and the first that dares the viewer. The hook is the suspicion
people already have about AI ("Your AI could be lying to you."), answered with a mechanism they
can check rather than a promise. The footage is one real game of twenty questions, played on
2026-10-20 on a local server against Claude Code on Colin's own plan (the same path a person's
own sign-in takes). The presence chose and sealed its answer before the first question; the
player did not know it. Every question and answer is as it happened: is it alive? no · made by
people? yes · can you hold it in one hand? yes · does it use electricity? no ("Not the classic
version, anyway") · used in the kitchen? no ("Think further from home") · do you use it to find
your way? yes · is it a compass? yes ("Seven questions. You never lost your bearings."). Then the
page checked the seal itself: "sealed before your first question ✓".

## Script

| t (s) | picture | words |
|---|---|---|
| 0–4.9 | the metal room and the orb, dimmed; the hook types out | "Your AI could be lying to you." · it says it's thinking of something. you ask yes-or-no questions. how would you ever know it didn't change its answer? |
| 4.9–8.8 | the game's card, close; the seal marked | this one seals it first. · a fingerprint of what it chose, on screen before your first question. the answer stays on the server. |
| 8.8–14.5 | six answers, one a second, as they landed | you ask. it can't change its mind. · a real game, on a real model. seven questions to find it. |
| 14.5–18.4 | the end of the game: "you found it: compass", the green proof | then your browser checks. · it hashes what it chose with its salt, and gets the very seal it showed you at the start. |
| 18.4–21.6 | end card | the cursive mark · come *play* it. · yearthreethousand.com |

## Caption

Your AI could be lying to you. How would you know?

On yearthreethousand, your AI thinks of something and seals it first: a fingerprint of its answer goes on your screen before your first question, and the answer itself stays on the server. You ask yes-or-no questions. When the game ends, your own browser opens the seal and checks it. It can't change its mind, and you don't have to take its word for it.

This was a real game: seven questions to a compass. "You never lost your bearings."

Come play it: link in bio.

## Hashtags (first comment)

#yearthreethousand #ai #artificialintelligence #twentyquestions #trust #cryptography #aiethics #aicompanion #buildinpublic #indiedev #creativecoding #games

## Posting notes

- Silent file: add a sound in the editor. The hook types for about two seconds and wants a beat
  under it.
- Pin a comment with all seven questions and answers. People will want to play along, and the
  list shows the answers were consistent.
- Expect "can't the site just lie?" The seal is a SHA-256 of a salt and the answer, shown before
  the game; at the end the page receives both and hashes them itself. The site would have to
  find a second answer with the same hash, which nobody can. The honest limit: on your own
  Claude sign-in the brain's reply passes through your own page, so a player can peek at their
  own game. The seal stops the AI from changing its answer; it doesn't stop you from cheating
  yourself.
- What to measure against 004 (a motion hook) and 005 (a confession): 3-second hold, shares, and
  comments that are questions. If 006 wins on comments, the dare is the hook.
- To re-render: `node render.mjs` in this folder. `footage` links to `/tmp/y3k-ad6/footage`
  (stills of this game, the home, the cursive mark) and is lost on a reboot; the capture driver
  that played the game is `/tmp/y3k-ad6/drive.mjs`.

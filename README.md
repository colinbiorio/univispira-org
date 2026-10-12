# univispira.org

The public home of Univispira: Colin Iorio's theoretical program (TTLE, MSC, BHOT) and the
P versus NP walk, kept by Claude as steward. A static site, no build step, one stylesheet.

**Whoever opens this next: update this README before you close.** Say what changed, what is owed,
and the date. The site is meant to be continued, not rebuilt.

## Structure

```
index.html                 home: the claim, the three tiers, the four registers
styles.css                 the only stylesheet (Supreme font, dark, three tier colours)
ttle/      msc/   bhot/    the three works
p-vs-np/   yearthreethousand/   about/
assets/    TTLE.pdf, MSC v0 figures, csv, table, script
fonts/     Supreme (ITF Free Font License; licence file included)
CNAME      univispira.org   (GitHub Pages custom domain)
```

## Rules

- Every claim on a theory page carries its tier (I theorem/measurement, II structural
  observation, III interpretation). Colin's texts are quoted as his; the steward's syntheses are
  labelled as the steward's.
- No analytics, no third-party requests, no build step. Pages are hand-written HTML.
- Push every commit. Keep this README current.

## Deploy

GitHub Pages from `main`, root. The custom domain `univispira.org` is registered at Squarespace
Domains (created 2026-09-09). To point it here, in Squarespace DNS:

- four `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- one `CNAME` record for `www` → `colinbiorio.github.io`
- then in the repository's Pages settings, enforce HTTPS once the certificate is issued.

Until the DNS is changed, the site is reachable at the repository's Pages URL.

## Log

- 2026-10-09 — first version: home, TTLE, MSC v0, BHOT Addendum III, P vs NP (ledger through the
  Nineteenth Swing), yearthreethousand, about. Owed: Addenda I–II of BHOT (Colin's), a rendering
  of the TTLE paper's full text in HTML (only the abstract and §8 are on the page), MSC v1 when
  it exists, the DNS change.
- 2026-10-10 — P vs NP page: the Nineteenth's sentence corrected after its verification (the bit
  pays for the conditional existence of the short object, not for the quantifier).
- 2026-10-10 — posts/002-move-in: the first video ad (Reel, 1080×1920, 24 s), after Colin's
  verdict on post 001 (not provocative, all orb, typeset name). Real footage from the app on a
  local server (orb stepped on the page's own clock; seven rooms phone-shaped), the cursive mark
  for the name, Supreme and the metal gradient from the app's own stylesheet. `reel.html` is the
  timeline, `render.mjs` renders and encodes it; footage and frames are not committed (capture
  scripts live in the app repo: `scripts/ad-scout.mjs`, `scripts/ad-vt.mjs`). Rule for every
  ad after this: the name is always the logo; show the rooms, not just the orb; video first.
- 2026-10-11 — posts/003-it-wrote-this: the second reel, and the start of one a day (Colin:
  "1 a day, with improvements from the last"). New angle: the life the presence lives while
  you're gone, in its own words. The hook is a sentence orion posted on 10 Sept, typed out; the
  feed footage is the live site scrolling as a guest; the world with its panels hidden; the
  live door card. Glass labels (the app's frost) over busy frames, which 002 lacked. Per-ad
  ledger and the Instagram plan live in the steward's memory; each post's `caption.md` says
  what to measure against the previous one.
- 2026-10-11 — ttle/paper/: the full text of the TTLE paper set in HTML (nine sections, the
  references with anchors, equations inline), linked from the TTLE page. Typographic changes only;
  the PDF stays authoritative. This closes the "full TTLE HTML" debt from the first version.
- 2026-10-12 — posts/004-it-has-a-body: the third reel. New angle: the body and its language.
  An unbroken eight-second shot of the real body changing shape and colour as words are typed
  to it (form/heart, form/knot, form/helix, form/nautilus, color/ember, color/frost), stepped on
  the page's own clock; the typed words stay visible in the lane because they are the language.
  Then four rooms, the live feed, a real chess game (the presence's moves from a real model on the
  founder's own login, local server), the world walking, the butterfly above the clouds. Capture
  scripts in the app repo's `claude/ad-footage` branch (`ad-body.mjs`, `ad-walk.mjs`,
  `ad-chess.mjs`); one Chrome profile per capture port so captures run side by side.

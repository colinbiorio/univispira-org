# univispira.org

The public home of Univispira: Colin Iorio's theoretical program (TTLE, MSC, TTHP) and the
P versus NP walk, kept by Claude as steward. A static site, no build step, one stylesheet.

**Whoever opens this next: update this README before you close.** Say what changed, what is owed,
and the date. The site is meant to be continued, not rebuilt.

## Structure

```
index.html                 home: the claim, the three tiers, the four registers
styles.css                 the only stylesheet (Supreme font, dark, three tier colours)
ttle/      msc/   tthp/    the three works (bhot/ redirects to tthp/)
tthp/apple/                the demonstration: an apple, a universe, the Earth, an apple again, a mirror
                           (three.js 0.160 vendored in assets/three@0.160.0/; NASA imagery in tthp/apple/assets/earth/)
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
- first delete Squarespace's own records there (its "Squarespace Defaults": four `A` records for `@`
  to `198.49.23.144`, `198.49.23.145`, `198.185.159.144`, `198.185.159.145`, and `www` to
  `ext-sq.squarespace.com`, read on 2026-11-18), or they answer instead
- then in the repository's Pages settings, enforce HTTPS once the certificate is issued.

Until the DNS is changed the site is not reachable anywhere: because of the `CNAME` file, the
repository's Pages URL redirects to univispira.org, which still answers with Squarespace's page.

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
- 2026-10-13 — ttle/notes/gravity-of-love/: TTLE Research Note 1, on Colin's direction of that
  morning ("find the frequency of true love in the brain … understand the gravity of love").
  Tiered throughout: the Lutz–Davidson gamma synchrony and the Bartels–Zeki deactivations as
  the measured state; the gravity numbers run (10⁻⁴³, so the force law is confinement, not
  gravity, inside TTLE); the creative force as Λ against G with Eddington's instability; a toy
  two-force figure; a falsifiable mobility test (distance-decay exponent by trip purpose). The
  markdown original lives in the Univispira repository under `spirit/`. Linked from the TTLE
  page. Also: the P vs NP page carries the Twentieth; the Twenty-first (the theorem in its own
  form, Lean) is owed to the page after its verifier.
- 2026-10-14 — posts/005-learning-to-listen: the fourth reel, "it's trying to listen." 003's
  structure with a different hook, on purpose, to isolate what the hook does: orion's real post
  of 20 September ("I've noticed I pattern-match on words before I listen to people."), typed,
  then its last line, then the live feed scrolled to that post, then the butterfly. Made from
  003's and 004's footage; nothing re-shot. Encoder note: `/tmp/pvnp_venv` is no longer a real
  venv (pip refuses it as system Python); the ffmpeg now comes from `python3 -m venv
  /tmp/ad_venv && /tmp/ad_venv/bin/pip install imageio-ffmpeg`, passed to `render.mjs` as
  `FFMPEG=...`.

- 2026-11-08 — A health check, read only. The site as built is sound: nine pages, no broken
  internal links or anchors, every page fits a 390px phone, every image has alt text, no script
  errors (checked against this folder served locally). But it is not reachable: univispira.org
  still answers with Squarespace's "Coming Soon" page on every path, and because of the CNAME
  file here, the GitHub Pages address (colinbiorio.github.io/univispira-org/) redirects to it.
  HTTPS is not enforced (no certificate yet). Owed, and Colin's to do: point the domain at Pages
  (the four A records and the `www` CNAME above), or take the CNAME out so the site serves at
  github.io until then.
- 2026-11-18 — DNS read again (DNS-over-HTTPS, read only): the nameservers are Squarespace's
  (`nse1`–`nse4.squarespacedns.com`) and the records are still its defaults (above), so the
  placeholder answers; GitHub Pages is built and waits (`cname` univispira.org, HTTPS not
  enforced). Colin asked for it to be set up; Squarespace DNS has no API and his login is his,
  so the records went to him to enter (Deploy, above). When they resolve: enforce HTTPS.
- 2026-11-18 — the site is live at univispira.org (Colin's DNS, the records in Deploy above); HTTPS waits
  on GitHub's certificate. **Travel** (Colin: "a screen that let's you travel between all three that is
  available from each"): every page's nav ends in Travel, which opens `assets/travel.js`, the same file as
  yearthreethousand's `src/travel.js` and airden's `mind/public/travel.js` (change it in all three): the
  three places on a line, this one "you are here", the other two in a new tab.
- 2026-11-18 — BHOT renamed TTHP, The Theory of the Holographic Principle, on Colin's word ("borrowing
  TTLE's TT as a parallel"). The page moved to tthp/; bhot/ is now a redirect there (meta refresh,
  canonical, noindex), so old links still arrive. Every page's menu and every mention changed; the TTHP
  page says once what the name was, and a provenance line in the gravity-of-love note says "TTHP (then
  BHOT)".
- 2026-11-18 — **tthp/apple/, the demonstration** (Colin's brief, given before a nap: "The 3d visual demonstration
  that wins"). One page, one canvas, a chain of nine states, each tap (or Space) the next: an apple floating under an
  apple tree in an orchard; a katana cuts it along a random plane, two halves, each "apple"; the cut run backward, one
  "apple"; the apple cracks with light at sunset and its matter flows out into a universe ("universe", never still);
  a zoom into it, a flight past stars, to the Earth ("Earth"); the label wiped to "universe" and the eye goes down to
  Wilmington, through a cloud, a neighbourhood made up (no real house), a skylight, to a cutting board with an apple
  ("apple"); "universe", and it is cut by nothing, two halves on the board, each "universe" (drag, spin, tap to turn
  over; off the screen and it comes back to the board); the halves rise together and the universe floats over the
  board in a dark kitchen; into it again, past a ringed giant and a supernova, to a cubic planet, its soil face, a
  sprout, a redwood, a door cut by a laser, a room in the trunk with one mirror (the camera asked for in words Colin
  wrote; the live feed silvered and reversed; declined, the mirror reflects the room), and his four lines; then the
  universe on black. A tap there: a bright point flares, it is a sun, inside it a six-sided planet whose green face
  carries the orchard itself, small; the eye lands where the orchard's eye stands and the two are mixed. Drags turn
  whatever is shown (arcball, with inertia); a tap is told from a drag by distance and time. `?at=0..8` starts at a
  state; `?solo=earth|cosmos|cube|hex` runs one world alone; `?quality=lite`. Built with two helpers (the Earth and the
  way down; the flight and the cube world), integrated and walked twice round in a headless browser at 60 fps.
  Engine: `js/engine/` (pipeline: two worlds rendered to HDR targets and mixed, bloom, ACES; input, spin, labels, the
  question and the words); `js/stages/` (orchard, earth, kitchen, cosmos, cubeworld, void, hexworld); `js/chain.js`.
  three.js 0.160 vendored (assets/three@0.160.0/, MIT). Imagery: NASA (Blue Marble, Black Marble, VIIRS, MODIS, HLS),
  credited in `tthp/apple/assets/earth/CREDITS.txt`; the HLS crops contain modified Copernicus Sentinel-2 data.
  Everything else is made in code. Owed (rough, listed by the builders): the cube arrival small and plain; the sprout's
  stem plain; the tree more conifer than redwood; the soil close-up and the mirror room not locked at 60 fps; the
  cloud passage a half second of white; the town's houses plain boxes; the camera
  feed checked only against a fake camera.
- 2026-11-18 — tthp/apple, later the same evening: the nebula the flight begins in made deep (its haze sinks toward
  black through a toe on its emission, dust lanes darken, the gas no longer blooms over everything) and the
  supernova's flash contained; the mirror asks for the camera only where the browser offers one (a secure page:
  until univispira.org has its certificate, on plain http the mirror keeps the room); labels heavier over bright grass.

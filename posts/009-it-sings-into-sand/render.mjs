// RENDER THE REEL. Opens reel.html in headless Chrome at 1080x1920, steps the
// timeline a frame at a time through window.seek(t), screenshots each frame
// into frames/, then (unless NOENC) encodes frames -> reel.mp4 with ffmpeg.
// Also writes cover.png (1080x1920, the reel's cover) and cover-4x5.png.
//
//   node render.mjs                 # full render, 24 fps
//   FROM=3 TO=6 node render.mjs     # a slice, for looking
//   FFMPEG=/path/to/ffmpeg          # default: the imageio-ffmpeg binary in /tmp/pvnp_venv
//
// Needs: Google Chrome, footage/ (the stills of the sand plate at rest, struck and spoken to, the logo), fonts/.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 24, W = 1080, H = 1920;
let DUR = 24;   // read from the page once it is open: this reel's length follows its words
let FROM = Number(process.env.FROM ?? 0), TO = Number(process.env.TO ?? -1);
const port = 9347;
const frames = join(here, 'frames'); mkdirSync(frames, { recursive: true });

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--window-size=${W},${H}`,
  '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--user-data-dir=/tmp/y3k-ad9/profile-render', '--font-render-hinting=none', 'about:blank'], { stdio: 'ignore' });
let targets = null;
for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await new Promise((r) => setTimeout(r, 250)); } }
if (!targets) { chrome.kill(); throw new Error('chrome did not come up'); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => { const r = await Promise.race([send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }), new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate timed out')), 8000))]); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file://' + join(here, 'reel.html') });
  await new Promise((r) => setTimeout(r, 1500));
  console.log('preloaded', await evaluate('window.ready'), 'images');
  DUR = Number(await evaluate('window.DUR')) || DUR; if (TO < 0) TO = DUR; console.log('duration', DUR.toFixed(2), 's');
  const n0 = Math.round(FROM * FPS), n1 = Math.round(TO * FPS);
  const t0 = Date.now();
  for (let n = n0; n < n1; n++) {
    if (process.env.RESUME && existsSync(join(frames, `f${String(n).padStart(4, '0')}.png`))) continue;
    try { await evaluate(`window.seek(${(n / FPS).toFixed(5)}); new Promise(r => setTimeout(r, 40))`); }
    catch (e) { console.log('frame', n, e.message, '- retrying once'); await evaluate(`window.seek(${(n / FPS).toFixed(5)}); new Promise(r => setTimeout(r, 120))`); }
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(frames, `f${String(n).padStart(4, '0')}.png`), Buffer.from(r.data, 'base64'));
    if (n % 48 === 0) console.log('frame', n, '/', n1, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  console.log('frames done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  // covers: the reel cover (a moment of the hook) and a 4:5 crop for the grid
  for (const [t, name] of [[3.4, "cover.png"], [14.0, "cover-b.png"]]) {
    await evaluate(`window.seek(${t}); new Promise(r => setTimeout(r, 120))`);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(here, name), Buffer.from(r.data, 'base64'));
  }
} finally { try { ws.close(); } catch {} chrome.kill(); }

if (!process.env.NOENC && (process.env.ENCODE || (FROM === 0 && TO === DUR))) {
  // the ffmpeg: FFMPEG, else imageio-ffmpeg's binary in lucid's venv (2026-10-25: /tmp/ad_venv2 was gone; `uv pip install --python ~/y3k-code/lucid/.venv/bin/python imageio-ffmpeg`)
  const ffmpeg = process.env.FFMPEG || execFileSync(join(process.env.HOME || '', 'y3k-code/lucid/.venv/bin/python'), ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())']).toString().trim();
  const out = join(here, 'reel.mp4');
  execFileSync(ffmpeg, ['-y', '-framerate', String(FPS), '-i', join(frames, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log('wrote', out);
}

// Renders the promo reel to a 720x1280, 30 fps MP4.
// Each frame: the real site is drawn at 1440x810 in capture mode, screenshotted, and handed to the
// 3D desk scene (reel.html + room.js) as the monitor image; the composed frame is then captured.
//
// Usage:
//   node reel/render.cjs [--handle @yourhandle] [--out reel/patient-creations-reel.mp4]
//   node reel/render.cjs --stills 0.5,4,9.5 --out-dir /tmp/stills    # preview a few frames as PNGs
// Requires: playwright (npm i -D playwright) and ffmpeg on PATH.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const OUT = path.resolve(opt('out', path.join(__dirname, 'patient-creations-reel.mp4')));
const HANDLE = opt('handle', '');
const STILLS = opt('stills', '');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const frames = STILLS ? path.resolve(opt('out-dir', '.')) : fs.mkdtempSync(path.join(os.tmpdir(), 'pc-reel-'));
  fs.mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const site = await browser.newPage({ viewport: { width: 1440, height: 810 } });
    const reel = await browser.newPage({ viewport: { width: 720, height: 1280 } });
    for (const p of [site, reel]) p.on('pageerror', (e) => console.error('page error:', e.message));
    await site.goto(`${base}/index.html?capture=1`);
    await site.waitForFunction(() => window.__pcReady, null, { timeout: 120000 });
    const M = await site.evaluate(() => window.__pc.span());
    const qs = HANDLE ? `?handle=${encodeURIComponent(HANDLE)}` : '';
    await reel.goto(`${base}/reel/reel.html${qs}`);
    await reel.waitForFunction(() => window.reelReady, null, { timeout: 180000 });
    const { duration, fps } = await reel.evaluate(() => ({ duration: window.REEL.duration, fps: window.REEL.fps }));

    const times = STILLS ? STILLS.split(',').map(Number) : Array.from({ length: Math.round(duration * fps) }, (_, i) => i / fps);
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const y = await reel.evaluate(([t, M]) => window.REEL.scrollAt(t, M), [t, M]);
      await site.evaluate(([y, t]) => window.__pc.frame(y, t), [y, t]);
      const shot = await site.screenshot({ type: 'jpeg', quality: 92 });
      await reel.evaluate(([t, src, y]) => window.renderFrame(t, src, y), [t, 'data:image/jpeg;base64,' + shot.toString('base64'), y]);
      const name = STILLS ? `still-${t}.png` : `f${String(i).padStart(4, '0')}.png`;
      await reel.screenshot({ path: path.join(frames, name) });
      if (i % 30 === 0) process.stdout.write(`frame ${i}/${times.length}\n`);
    }
    if (STILLS) { console.log('wrote stills to', frames); return; }
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
    console.log('wrote', OUT);
  } finally {
    await browser.close();
    server.close();
    if (!STILLS) fs.rmSync(frames, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });

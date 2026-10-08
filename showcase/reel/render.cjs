// Renders reel.html to a 720x1280, 30 fps MP4.
// Usage: node reel/render.cjs [--handle @yourhandle] [--out reel/patient-creations-reel.mp4]
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
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-reel-'));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    const qs = HANDLE ? `?handle=${encodeURIComponent(HANDLE)}` : '';
    await page.goto(`http://127.0.0.1:${port}/reel/reel.html${qs}`);
    await page.waitForFunction(() => window.reelReady, null, { timeout: 120000 });
    const { duration, fps } = await page.evaluate(() => window.REEL);
    const total = Math.round(duration * fps);
    for (let i = 0; i < total; i++) {
      await page.evaluate((t) => window.renderFrame(t), i / fps);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`) });
      if (i % 30 === 0) process.stdout.write(`frame ${i}/${total}\n`);
    }
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
    console.log('wrote', OUT);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(frames, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });

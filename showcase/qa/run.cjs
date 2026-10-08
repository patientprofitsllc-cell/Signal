// End-to-end QA for the showcase. Usage: npm run qa   (writes qa/output/report.md + screenshots)
// Runs the single-file build (dist/) under the same Content-Security-Policy as the artifact host, so what
// passes here is what viewers get. Run `npm run build:artifact` first.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'output');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const page = fs.readFileSync(path.join(ROOT, 'dist/patient-creations.html'), 'utf8');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
// Mirrors the artifact host: it supplies the skeleton, and only inline scripts/styles + allowlisted CDNs load.
const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui;background:#fafaf7}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`;
const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net/npm/ https://unpkg.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; connect-src 'self'";

const VIEWPORTS = [
  { name: 'phone-320', width: 320, height: 640, mobile: true },
  { name: 'phone-390', width: 390, height: 844, mobile: true },
  { name: 'phone-landscape', width: 844, height: 390, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'laptop-1280', width: 1280, height: 720 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'wide-1920', width: 1920, height: 1080 },
];

const results = [];
const fail = (vp, check, detail) => results.push({ vp, check, ok: false, detail });
const pass = (vp, check, detail = '') => results.push({ vp, check, ok: true, detail });

async function checkViewport(browser, base, vp, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, colorScheme: opts.dark ? 'dark' : 'light', reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  const label = vp.name + (opts.dark ? ' (dark OS)' : '') + (opts.reduced ? ' (reduced motion)' : '');
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('requestfailed', (r) => { if (!r.url().startsWith('data:')) errors.push('request failed: ' + r.url()); });

  await p.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.getElementById('loader')?.classList.contains('done'), null, { timeout: 15000 })
    .then(() => pass(label, 'loader clears'), () => fail(label, 'loader clears', 'loader still visible after 15s'));
  await p.waitForTimeout(800);

  const info = await p.evaluate(() => ({
    fonts: [['Inter', '400 16px Inter'], ['Instrument Serif italic', 'italic 400 16px "Instrument Serif"'], ['Fraunces light', '300 16px Fraunces']].map(([n, f]) => [n, document.fonts.check(f)]),
    canvas: (() => { const c = document.getElementById('world-canvas'); return { w: c.width, h: c.height }; })(),
    stats: window.__pcStats ? window.__pcStats() : null,
  }));
  info.fonts.forEach(([f, ok]) => (ok ? pass(label, `font ${f}`) : fail(label, `font ${f}`, 'not loaded')));
  info.canvas.w > 0 ? pass(label, 'WebGL canvas sized', `${info.canvas.w}×${info.canvas.h}`) : fail(label, 'WebGL canvas sized', JSON.stringify(info.canvas));
  if (info.stats && !opts.dark && !opts.reduced) pass(label, 'render stats', JSON.stringify(info.stats));

  // The card fits on screen and doesn't collide with the header or the chapter bar
  const fit = await p.evaluate(() => {
    const r = (id) => document.querySelector(id).getBoundingClientRect();
    const c = r('#hero-card'), brand = r('.brand'), nav = r('#chapters');
    const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return { inView: c.top >= 0 && c.bottom <= innerHeight && c.left >= 0 && c.right <= innerWidth, hitsBrand: overlap(c, brand), hitsNav: overlap(c, nav) };
  });
  fit.inView && !fit.hitsBrand && !fit.hitsNav ? pass(label, 'card fits without collisions') : fail(label, 'card fits without collisions', JSON.stringify(fit));

  // Walk each chapter via the chapter buttons
  const chapters = await p.$$eval('#chapters button', (b) => b.length);
  chapters === 6 ? pass(label, 'chapter buttons', '6') : fail(label, 'chapter buttons', String(chapters));
  for (let i = 0; i < chapters; i++) {
    await p.click(`#chapters button:nth-child(${i + 1})`);
    // wait until the scroll and the eased camera have both arrived (slow software GPU here)
    await p.waitForFunction((i) => { const s = window.__pcStats?.(); return s && Math.abs(s.progress - i) < 0.02 && Math.abs(s.target - i) < 0.02; }, i, { timeout: 30000 })
      .catch(() => {});
    await p.waitForTimeout(300);
    const st = await p.evaluate((i) => {
      const active = [...document.querySelectorAll('#chapters button')].findIndex((b) => b.classList.contains('active'));
      const num = document.getElementById('chapter-num').textContent;
      const card = document.getElementById('hero-card').getBoundingClientRect();
      const hs = [...document.querySelectorAll('.hs')].filter((h) => +getComputedStyle(h).opacity > 0.5).map((h) => {
        const r = h.querySelector('button').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      const underCard = hs.filter((h) => h.x > card.left && h.x < card.right && h.y > card.top && h.y < card.bottom).length;
      return { active, num, visibleHotspots: hs.length, underCard, overflowX: document.documentElement.scrollWidth - innerWidth };
    }, i);
    const name = `chapter ${i + 1}`;
    st.active === i && st.num === '0' + (i + 1) ? pass(label, `${name} nav`) : fail(label, `${name} nav`, JSON.stringify(st));
    st.visibleHotspots > 0 ? pass(label, `${name} hotspots`, `${st.visibleHotspots} visible`) : fail(label, `${name} hotspots`, 'none visible');
    st.underCard === 0 ? pass(label, `${name} hotspots clear of card`) : fail(label, `${name} hotspots clear of card`, `${st.underCard} under the card`);
    const activeVisible = await p.evaluate(() => { const b = document.querySelector('#chapters button.active'); const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
    activeVisible ? pass(label, `${name} active chapter button on screen`) : fail(label, `${name} active chapter button on screen`, 'scrolled out of view');
    st.overflowX <= 0 ? pass(label, `${name} no horizontal scroll`) : fail(label, `${name} no horizontal scroll`, `${st.overflowX}px`);
    if (!opts.dark && !opts.reduced) await p.screenshot({ path: path.join(OUT, `${vp.name}-ch${i + 1}.png`) });
  }

  // Hotspot tooltip opens on click and stays inside the viewport
  const tip = await p.evaluate(async () => {
    const h = [...document.querySelectorAll('.hs')].find((e) => +getComputedStyle(e).opacity > 0.5);
    if (!h) return null;
    h.querySelector('button').click();
    await new Promise((r) => setTimeout(r, 400));
    const r = h.querySelector('.tip').getBoundingClientRect();
    const open = h.classList.contains('open') && h.querySelector('button').getAttribute('aria-expanded') === 'true';
    return { open, left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
  });
  if (!tip) fail(label, 'tooltip', 'no hotspot to test');
  else {
    tip.open ? pass(label, 'tooltip opens (aria-expanded)') : fail(label, 'tooltip opens (aria-expanded)', JSON.stringify(tip));
    tip.left >= 0 && tip.right <= tip.vw && tip.top >= 0 && tip.bottom <= tip.vh ? pass(label, 'tooltip inside viewport') : fail(label, 'tooltip inside viewport', JSON.stringify(tip));
  }
  await p.keyboard.press('Escape');

  // Scroll to the end: world fades, content sections are reachable
  await p.evaluate(() => window.scrollTo(0, document.getElementById('welcome').offsetTop));
  await p.waitForTimeout(1200);
  const end = await p.evaluate(() => ({
    fade: +getComputedStyle(document.getElementById('world-fade')).opacity,
    overflowX: document.documentElement.scrollWidth - innerWidth,
    h2: document.querySelector('#welcome h2').getBoundingClientRect().top,
  }));
  end.fade > 0.95 ? pass(label, 'world fades into content') : fail(label, 'world fades into content', JSON.stringify(end));
  end.overflowX <= 0 ? pass(label, 'content: no horizontal scroll') : fail(label, 'content: no horizontal scroll', `${end.overflowX}px`);
  if (!opts.dark && !opts.reduced) await p.screenshot({ path: path.join(OUT, `${vp.name}-welcome.png`), fullPage: false });

  // Elements wider than the viewport anywhere in the content
  const wide = await p.evaluate(() => [...document.querySelectorAll('main *, footer *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.tagName + '.' + e.className).slice(0, 5));
  wide.length === 0 ? pass(label, 'nothing spills past the right edge') : fail(label, 'nothing spills past the right edge', wide.join(', '));

  // Mobile menu
  if (await p.isVisible('#menu-btn')) {
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.click('#menu-btn');
    const open = await p.evaluate(() => !document.getElementById('mobile-nav').hidden && document.getElementById('menu-btn').getAttribute('aria-expanded') === 'true');
    await p.keyboard.press('Escape');
    const closed = await p.evaluate(() => document.getElementById('mobile-nav').hidden && document.activeElement?.id === 'menu-btn');
    open && closed ? pass(label, 'mobile menu opens, Escape closes and returns focus') : fail(label, 'mobile menu', JSON.stringify({ open, closed }));
  }

  // Keyboard: on a fresh load, the first Tab lands on the skip link, which is visible when focused
  await p.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.getElementById('loader')?.classList.contains('done'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1000);
  await p.keyboard.press('Tab');
  const skip = await p.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { cls: a.className, inView: r.left >= 0 && r.top >= 0 }; });
  skip.cls === 'skip' && skip.inView ? pass(label, 'skip link first and visible') : fail(label, 'skip link first and visible', JSON.stringify(skip));

  // Accessibility scan (axe) of the whole page
  if (vp.name === 'desktop-1440' || vp.name === 'phone-390') {
    await p.addScriptTag({ content: axeSrc }).catch(() => {});
    const axe = await p.evaluate(async () => {
      if (!window.axe) return { error: 'axe could not load' };
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') }));
    });
    if (axe.error) fail(label, 'axe accessibility', axe.error);
    else if (axe.length === 0) pass(label, 'axe accessibility', 'no violations');
    else axe.forEach((v) => fail(label, `axe: ${v.id}`, `${v.impact}, ${v.n} node(s), e.g. ${v.sample}`));
  }

  // Resize mid-scroll keeps the canvas in sync
  if (vp.name === 'desktop-1440') {
    await p.setViewportSize({ width: 1000, height: 700 });
    await p.waitForTimeout(600);
    const c = await p.evaluate(() => { const r = document.getElementById('world-canvas').getBoundingClientRect(); return { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight }; });
    c.w === c.iw && Math.abs(c.h - c.ih) < 2 ? pass(label, 'resize keeps canvas full-bleed') : fail(label, 'resize keeps canvas full-bleed', JSON.stringify(c));
  }

  const uniq = [...new Set(errors)];
  uniq.length === 0 ? pass(label, 'no console errors') : fail(label, 'no console errors', uniq.slice(0, 5).join(' | '));
  await ctx.close();
}

async function checkNoWebGL(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForTimeout(3000);
  const s = await p.evaluate(() => ({ loaderDone: document.getElementById('loader').classList.contains('done'), fallback: document.documentElement.classList.contains('no-webgl'), cardVisible: getComputedStyle(document.getElementById('hero-card')).display !== 'none' }));
  s.loaderDone && s.fallback && s.cardVisible && errors.length === 0 ? pass('no WebGL', 'graceful fallback') : fail('no WebGL', 'graceful fallback', JSON.stringify({ ...s, errors }));
  await p.screenshot({ path: path.join(OUT, 'no-webgl.png') });
  await ctx.close();
}

async function checkLinks() {
  const hrefs = [...new Set([...page.matchAll(/href="(https:[^"]+)"/g)].map((m) => m[1]))];
  for (const h of hrefs) {
    let status = 0;
    // curl honours HTTPS_PROXY, which Node's fetch does not
    for (let i = 0; i < 3 && !(status >= 200 && status < 400); i++) {
      try { status = +execFileSync('curl', ['-s', '-o', '/dev/null', '-L', '-w', '%{http_code}', '--max-time', '20', h.replace(/&amp;/g, '&')]).toString(); } catch { status = 0; }
    }
    status >= 200 && status < 400 ? pass('links', h, String(status)) : status === 0 ? results.push({ vp: 'links', check: h, ok: null, detail: 'unreachable from the QA machine' }) : fail('links', h, String(status));
  }
}

(async () => {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': CSP }); res.end(doc); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    // One failing viewport is recorded and the run continues, so the report is always written
    const guard = async (name, fn) => { try { await fn(); } catch (e) { fail(name, 'run completed', e.message.split('\n')[0]); } };
    for (const vp of VIEWPORTS) await guard(vp.name, () => checkViewport(browser, base, vp));
    await guard('desktop-1440 (dark OS)', () => checkViewport(browser, base, VIEWPORTS[5], { dark: true }));
    await guard('phone-390 (reduced motion)', () => checkViewport(browser, base, VIEWPORTS[1], { reduced: true }));
    await guard('no WebGL', () => checkNoWebGL(browser, base));
    if (!process.argv.includes('--no-links')) await checkLinks();
  } finally { await browser.close(); server.close(); }

  const bad = results.filter((r) => r.ok === false), warn = results.filter((r) => r.ok === null);
  const md = [`# QA report`, '', `${results.length} checks: ${results.length - bad.length - warn.length} passed, ${bad.length} failed, ${warn.length} could not be checked.`, '',
    '| Where | Check | Result | Detail |', '|---|---|---|---|',
    ...results.map((r) => `| ${r.vp} | ${r.check} | ${r.ok === true ? 'pass' : r.ok === false ? '**FAIL**' : 'skipped'} | ${String(r.detail).replace(/\|/g, '/')} |`)].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), md + '\n');
  console.log(`${results.length} checks, ${bad.length} failed, ${warn.length} skipped`);
  bad.forEach((r) => console.log(`FAIL [${r.vp}] ${r.check}: ${r.detail}`));
  warn.forEach((r) => console.log(`SKIP [${r.vp}] ${r.check}: ${r.detail}`));
  process.exitCode = bad.length ? 1 : 0;
})();

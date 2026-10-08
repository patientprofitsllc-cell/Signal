import { createWorld } from './world.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const root = document.documentElement;
if (CAPTURE) root.classList.add('capture');
if (!root.lang) root.lang = 'en'; // hosts that wrap this page in their own <html> may not set it

const CHAPTERS = [
  { nav: 'Studio', title: 'The studio', text: 'One creative partner. Every next step.' },
  { nav: 'Websites', title: 'Give your business a presence.', text: 'Websites from $1,250, live in about 72 hours.' },
  { nav: 'Process', title: 'From idea to online.', text: 'Less back and forth. More forward.' },
  { nav: 'Ads & video', title: 'Stop the scroll.', text: 'Cinematic and UGC ads from $129 an ad.' },
  { nav: 'Automation', title: 'Make the work work for you.', text: 'Lead capture, follow-up, payments, AI agents.' },
  { nav: 'Launch', title: 'Your next chapter.', text: 'Business Cards and the $2,499 Launch Bundle.' },
];

const $ = (id) => document.getElementById(id);
const worldEl = document.querySelector('.world');
const canvas = $('world-canvas');
const fadeEl = $('world-fade');
const card = $('hero-card');
const hint = $('scroll-hint');
const loader = $('loader');
const loaderFill = $('loader-fill');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function done() {
  loaderFill.style.width = '100%';
  setTimeout(() => loader.classList.add('done'), 250);
}
// Whatever happens below, never leave the loader covering the page
setTimeout(() => loader.classList.add('done'), 8000);

// ---------------------------------------------------------------- mobile menu
const menuBtn = $('menu-btn'), mobileNav = $('mobile-nav');
function setMenu(open, { focusButton = false } = {}) {
  mobileNav.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.textContent = open ? 'Close' : 'Menu';
  if (open) mobileNav.querySelector('a')?.focus();
  else if (focusButton) menuBtn.focus();
}
menuBtn.addEventListener('click', () => setMenu(mobileNav.hidden));
mobileNav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('click', (e) => {
  if (!mobileNav.hidden && !mobileNav.contains(e.target) && e.target !== menuBtn) setMenu(false);
});

// ---------------------------------------------------------------- assets
async function loadLogo() {
  const img = new Image();
  img.src = 'assets/logo-mark.webp';
  try { await img.decode(); } catch { return null; }
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}
async function loadFonts() {
  const faces = ['300 40px Inter', '400 40px Inter', '500 40px Inter', '600 40px Inter', 'italic 400 40px "Instrument Serif"', '300 40px Fraunces'];
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => {})));
}

loaderFill.style.width = '25%';
const [logo] = await Promise.all([loadLogo(), loadFonts()]);
loaderFill.style.width = '60%';

// ---------------------------------------------------------------- world (with a static fallback)
const lowPower = matchMedia('(max-width: 640px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
let world = null;
try {
  world = createWorld(canvas, { logo, lowPower, capture: CAPTURE });
} catch (e) {
  console.warn('3D world unavailable, showing the static page instead:', e.message);
}
function useFallback() {
  root.classList.add('no-webgl');
  hint.hidden = true;
  done();
}

// ---------------------------------------------------------------- Escape closes popovers
const hsEls = [];
function closeTips() {
  hsEls.forEach((o) => { o.classList.remove('open'); o.querySelector('button').setAttribute('aria-expanded', 'false'); });
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!mobileNav.hidden) setMenu(false, { focusButton: true });
  closeTips();
});

if (!world) {
  useFallback();
} else {
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); useFallback(); });

  // -------------------------------------------------------------- chapter nav
  const navEl = $('chapters');
  const navBtns = CHAPTERS.map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `0${i + 1}<span>${c.nav}</span>`;
    b.setAttribute('aria-label', `Go to chapter ${i + 1}: ${c.nav}`);
    b.addEventListener('click', () => scrollToStop(i));
    navEl.appendChild(b);
    return b;
  });
  const scrollSpan = () => worldEl.offsetHeight - H;
  function scrollToStop(i) {
    const top = worldEl.offsetTop + (i / world.stops) * scrollSpan();
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // -------------------------------------------------------------- hotspots
  const hsLayer = $('hotspots');
  world.hotspots.forEach((h, i) => {
    const el = document.createElement('div');
    el.className = 'hs';
    el.innerHTML = `<button type="button" aria-expanded="false" aria-controls="hs-tip-${i}" aria-label="${h.title}">+</button><div class="tip" id="hs-tip-${i}" role="tooltip"><b>${h.title}</b>${h.text}</div>`;
    const btn = el.querySelector('button');
    btn.addEventListener('click', () => {
      const was = el.classList.contains('open');
      closeTips();
      if (!was) { el.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    });
    hsLayer.appendChild(el);
    hsEls.push(el);
  });

  // -------------------------------------------------------------- layout
  let W = 0, H = 0;
  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    // Phones resize the viewport as the URL bar shows and hides; skip those small height-only changes
    // so the scene doesn't jump while scrolling.
    if (W && w === W && Math.abs(h - H) < 160 && matchMedia('(pointer: coarse)').matches) return;
    W = w; H = h;
    // Same breakpoints as the CSS: phones and portrait tablets get the card along the bottom
    const stacked = W <= 640 || (W <= 1024 && H > W);
    const shortLandscape = H <= 520 && W > H;
    world.resize(W, H, stacked ? { shiftY: H * 0.16 } : { shiftX: shortLandscape ? Math.min(150, W * 0.18) : Math.min(210, W * 0.14) });
  }
  layout();
  window.addEventListener('resize', layout);

  // -------------------------------------------------------------- resolution governor (up to 4K)
  // Render at the screen's full sharpness, capped at a 4K pixel budget (3840×2160). If frames run slow,
  // step the resolution down; when there is headroom again, step back up.
  const PIXEL_BUDGET = 3840 * 2160;
  const dpr = () => window.devicePixelRatio || 1;
  const maxRatio = () => Math.max(1, Math.min(dpr(), 3, Math.sqrt(PIXEL_BUDGET / (W * H))));
  // Never drop below a crisp floor: at least 1×, and at least ~70% of the screen's own sharpness
  const minRatio = () => Math.min(maxRatio(), Math.max(1, dpr() * 0.7));
  let ratio = maxRatio(), frameMs = 16, lastFrameAt = 0, lastAdjust = 0, slowWindows = 0, fastWindows = 0;
  const startedAt = performance.now();
  world.setPixelRatio(ratio);
  window.addEventListener('resize', () => { ratio = Math.min(Math.max(ratio, minRatio()), maxRatio()); world.setPixelRatio(ratio); });
  function govern(now) {
    if (lastFrameAt) frameMs = frameMs * 0.92 + Math.min(100, now - lastFrameAt) * 0.08;
    lastFrameAt = now;
    if (now - startedAt < 3000 || now - lastAdjust < 1000) return; // ignore start-up (shader compile) hitches
    lastAdjust = now;
    slowWindows = frameMs > 26 ? slowWindows + 1 : 0;
    fastWindows = frameMs < 14 ? fastWindows + 1 : 0;
    // Step down only after ~3 s of sustained slowness; step back up after ~2 s of headroom
    if (slowWindows >= 3 && ratio > minRatio()) { ratio = Math.max(minRatio(), ratio * 0.88); slowWindows = 0; }
    else if (fastWindows >= 2 && ratio < maxRatio()) { ratio = Math.min(maxRatio(), ratio * 1.12); fastWindows = 0; }
    else return;
    world.setPixelRatio(ratio);
  }

  // -------------------------------------------------------------- frame
  let cur = 0, lastChapter = -1, lastTime = null;
  const progressFromScroll = () => Math.min(1, Math.max(0, (window.scrollY - worldEl.offsetTop) / scrollSpan()));
  const target = () => progressFromScroll() * world.stops;

  function frame(time, damping) {
    const p = progressFromScroll();
    const goal = p * world.stops;
    // Frame-rate independent easing toward the scroll position
    const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, time - lastTime));
    lastTime = time;
    cur = damping ? cur + (goal - cur) * (1 - Math.exp(-damping * dt)) : goal;
    if (Math.abs(goal - cur) < 1e-3) cur = goal;

    world.update(time);
    world.setProgress(cur);
    world.render();

    // Fade the world into the cream welcome section at the very end
    const end = Math.min(1, Math.max(0, (p - 0.94) / 0.06));
    fadeEl.style.opacity = end;
    card.style.opacity = 1 - Math.min(1, Math.max(0, (cur - (world.stops - 0.75)) / 0.45));
    card.style.visibility = card.style.opacity === '0' ? 'hidden' : 'visible';
    hint.style.opacity = cur > 0.25 ? 0 : 1;

    const ch = Math.min(CHAPTERS.length - 1, Math.round(cur));
    if (ch !== lastChapter) {
      const first = lastChapter === -1;
      lastChapter = ch;
      $('chapter-num').textContent = '0' + (ch + 1);
      $('chapter-title').textContent = CHAPTERS[ch].title;
      $('chapter-text').textContent = CHAPTERS[ch].text;
      const chEl = $('chapter');
      if (!first) { chEl.classList.remove('swap'); void chEl.offsetWidth; chEl.classList.add('swap'); } // animate changes, not the first paint
      navBtns.forEach((b, i) => { b.classList.toggle('active', i === ch); b.toggleAttribute('aria-current', i === ch); });
      // Narrow screens scroll the chapter row; keep the active chapter in view
      if (navEl.scrollWidth > navEl.clientWidth) navEl.scrollTo({ left: navBtns[ch].offsetLeft - 16, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    // Hotspots: only near their scene, on screen, and never under the card or the bars
    const cr = card.getBoundingClientRect();
    const pad = 18;
    world.hotspots.forEach((h, i) => {
      const el = hsEls[i];
      const near = Math.abs(cur - h.scene) < 0.3 && cur <= world.stops - 0.6;
      let vis = false, s = null;
      if (near) {
        s = world.project(h.pos);
        const underCard = s.x > cr.left - pad && s.x < cr.right + pad && s.y > cr.top - pad && s.y < cr.bottom + pad;
        vis = !s.behind && !underCard && s.x > 16 && s.x < W - 16 && s.y > 76 && s.y < H - 64;
      }
      if (!vis) {
        el.style.opacity = 0; el.style.pointerEvents = 'none'; el.style.visibility = 'hidden';
        if (el.classList.contains('open')) closeTips();
        return;
      }
      el.style.visibility = 'visible';
      el.style.opacity = 1 - Math.abs(cur - h.scene) / 0.3;
      el.style.pointerEvents = 'auto';
      el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
      // Keep the tooltip on screen: open it leftward near the right edge, downward near the top
      el.classList.toggle('flip-x', s.x > W - 250);
      el.classList.toggle('flip-y', s.y < 150);
    });
  }

  // Read-only hooks for QA and the promo-reel renderer
  window.__pcStats = () => ({ ...world.stats(), progress: +cur.toFixed(3), target: +target().toFixed(3) });

  if (CAPTURE) {
    // Deterministic hook for the promo-reel renderer: scroll to a position and draw one frame at a fixed time.
    window.__pc = {
      span: () => ({ top: worldEl.offsetTop, span: scrollSpan(), welcome: $('welcome').offsetTop, viewport: H }),
      frame(scrollY, time) { window.scrollTo(0, scrollY); frame(time, 0); },
    };
    frame(0, 0);
    done();
    window.__pcReady = true;
  } else {
    const t0 = performance.now();
    let visible = true;
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      // Scrolled past the 3D section (e.g. via a link): leave it in its finished, faded state
      if (!visible && window.scrollY > worldEl.offsetTop) { fadeEl.style.opacity = 1; card.style.opacity = 0; card.style.visibility = 'hidden'; }
    }).observe(worldEl);
    const loop = (now) => {
      requestAnimationFrame(loop); // schedule first so one bad frame can't stop the animation
      try {
        // rAF time can precede t0 on the first frame, so clamp at zero
        if (visible) { frame(reduceMotion ? 0 : Math.max(0, now - t0) / 1000, reduceMotion ? 0 : 7); govern(now); }
        else lastFrameAt = 0;
      } catch (e) { console.error(e); }
    };
    requestAnimationFrame(loop);
    done();
  }
}

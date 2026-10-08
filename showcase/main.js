import { createWorld } from './world.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
if (CAPTURE) document.documentElement.classList.add('capture');

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
const loaderFill = $('loader-fill');

// ---------------------------------------------------------------- mobile menu
const menuBtn = $('menu-btn'), mobileNav = $('mobile-nav');
menuBtn.addEventListener('click', () => {
  const open = mobileNav.hidden;
  mobileNav.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.textContent = open ? 'Close' : 'Menu';
});
mobileNav.addEventListener('click', (e) => { if (e.target.closest('a')) menuBtn.click(); });

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

// If anything below fails, still reveal the page content rather than an endless loader
setTimeout(() => $('loader').classList.add('done'), 8000);

const lowPower = matchMedia('(max-width: 640px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const world = createWorld(canvas, { logo, lowPower, capture: CAPTURE });

// ---------------------------------------------------------------- chapter nav
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
function scrollToStop(i) {
  const top = worldEl.offsetTop + (i / world.stops) * scrollSpan();
  window.scrollTo({ top, behavior: 'smooth' });
}

// ---------------------------------------------------------------- hotspots
const hsLayer = $('hotspots');
const hsEls = world.hotspots.map((h) => {
  const el = document.createElement('div');
  el.className = 'hs';
  el.innerHTML = `<button type="button" aria-label="${h.title}">+</button><div class="tip" role="tooltip"><b>${h.title}</b>${h.text}</div>`;
  el.querySelector('button').addEventListener('click', () => {
    const was = el.classList.contains('open');
    hsEls.forEach((o) => o.classList.remove('open'));
    if (!was) el.classList.add('open');
  });
  hsLayer.appendChild(el);
  return el;
});

// ---------------------------------------------------------------- layout
let W = 0, H = 0;
function layout() {
  W = window.innerWidth; H = window.innerHeight;
  const mobile = W <= 640;
  world.resize(W, H, mobile ? { shiftY: H * 0.16 } : { shiftX: Math.min(210, W * 0.14) });
}
const scrollSpan = () => worldEl.offsetHeight - H;
layout();
window.addEventListener('resize', layout);

// ---------------------------------------------------------------- frame
let cur = 0, lastChapter = -1;
function progressFromScroll() {
  return Math.min(1, Math.max(0, (window.scrollY - worldEl.offsetTop) / scrollSpan()));
}
function frame(time, smoothing) {
  const p = progressFromScroll();
  const target = p * world.stops;
  cur = smoothing ? cur + (target - cur) * smoothing : target;
  if (Math.abs(target - cur) < 1e-4) cur = target;

  world.update(time);
  world.setProgress(cur);
  world.render();

  // Fade the world into the cream welcome section at the very end
  const end = Math.min(1, Math.max(0, (p - 0.94) / 0.06));
  fadeEl.style.opacity = end;
  card.style.opacity = 1 - Math.min(1, Math.max(0, (cur - (world.stops - 0.75)) / 0.45));
  hint.style.opacity = cur > 0.25 ? 0 : 1;

  const ch = Math.min(CHAPTERS.length - 1, Math.round(cur));
  if (ch !== lastChapter) {
    lastChapter = ch;
    $('chapter-num').textContent = '0' + (ch + 1);
    $('chapter-title').textContent = CHAPTERS[ch].title;
    $('chapter-text').textContent = CHAPTERS[ch].text;
    const chEl = $('chapter');
    chEl.classList.remove('swap'); void chEl.offsetWidth; chEl.classList.add('swap');
    navBtns.forEach((b, i) => b.classList.toggle('active', i === ch));
  }

  world.hotspots.forEach((h, i) => {
    const el = hsEls[i];
    const near = Math.abs(cur - h.scene) < 0.3 && cur <= world.stops - 0.6;
    if (!near) { el.style.opacity = 0; el.style.pointerEvents = 'none'; return; }
    const s = world.project(h.pos);
    const vis = !s.behind && s.x > 12 && s.x < W - 12 && s.y > 70 && s.y < H - 60;
    el.style.opacity = vis ? 1 - Math.abs(cur - h.scene) / 0.3 : 0;
    el.style.pointerEvents = vis ? 'auto' : 'none';
    el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
  });
}

function done() {
  loaderFill.style.width = '100%';
  setTimeout(() => $('loader').classList.add('done'), 250);
}

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
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(worldEl);
  const loop = (now) => {
    requestAnimationFrame(loop); // schedule first so one bad frame can't stop the animation
    try {
      if (visible) frame(reduce ? 0 : Math.max(0, now - t0) / 1000, reduce ? 0 : 0.085); // rAF time can precede t0
    } catch (e) { console.error(e); }
  };
  requestAnimationFrame(loop);
  done();
}

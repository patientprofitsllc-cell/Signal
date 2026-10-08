// Patient Creations: scroll-driven isometric world.
// Everything is built from primitives and canvas textures, so there are no model files to load.
import * as THREE from './vendor/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from './vendor/jsm/environments/RoomEnvironment.js';

const C = {
  ground: '#f2f1ec',
  pad: '#e5e3db',
  road: '#d9d6cc',
  white: '#fbfaf6',
  offwhite: '#f3f1ea',
  sand: '#dbb77e',
  tan: '#d6ba8e',
  ink: '#1a1a16',
  inkSoft: '#2c2d27',
  glass: '#39403f',
  sage: '#b9c6a2',
  water: '#a9cdd6',
  trees: ['#5e8a73', '#4d7a65', '#739c84', '#68927b'],
};

// ---------------------------------------------------------------- helpers
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;

const matCache = new Map();
function mat(color, o = {}) {
  if (color === C.glass && o.rough === undefined) o = { ...o, rough: 0.08, metal: 0.55 }; // glass reflects the sky
  const key = color + JSON.stringify(o, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (o.basic) m = new THREE.MeshBasicMaterial({ color, map: o.map || null, transparent: !!o.transparent, side: o.side || THREE.FrontSide, toneMapped: false });
  else m = new (o.clearcoat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({
    color, map: o.map || null, flatShading: !!o.flat, side: o.side || THREE.FrontSide,
    roughness: o.rough ?? 0.82, metalness: o.metal ?? 0, ...(o.clearcoat ? { clearcoat: o.clearcoat, clearcoatRoughness: 0.18 } : {}),
    emissive: o.emissive || '#000000', emissiveMap: o.emissiveMap || null, emissiveIntensity: o.ei ?? 1,
    vertexColors: !!o.vc, transparent: !!o.transparent, opacity: o.opacity ?? 1,
    polygonOffset: !!o.offset, polygonOffsetFactor: o.offset ? -2 : 0, polygonOffsetUnits: o.offset ? -4 : 0,
  });
  matCache.set(key, m);
  return m;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
// Box whose y is its base, not its centre.
function box(parent, w, h, d, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(BOX, o.material || mat(color, o));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  if (o.ry) m.rotation.y = o.ry;
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  parent.add(m);
  return m;
}
function plane(parent, w, h, material, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0, 'YXZ');
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 16), o.material || mat(color, o));
  m.position.set(x, y + h / 2, z);
  m.castShadow = o.cast !== false;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- canvas textures
// Canvas textures are drawn at TEX_SCALE× their logical size so signs and screens stay crisp at 4K.
let TEX_SCALE = 2, MAX_ANISO = 8;
function tex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * TEX_SCALE); c.height = Math.round(h * TEX_SCALE);
  const g = c.getContext('2d');
  g.scale(TEX_SCALE, TEX_SCALE);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
const F = {
  sans: (wgt, px) => `${wgt} ${px}px Inter, system-ui, sans-serif`,
  serif: (px) => `italic 400 ${px}px "Instrument Serif", Georgia, serif`,
  display: (px) => `300 ${px}px Fraunces, Georgia, serif`,
};

function chrome(g, w, h, bg = '#e9e7e0') {
  const bh = Math.round(h * 0.075);
  g.fillStyle = bg; g.fillRect(0, 0, w, bh);
  ['#e7a28f', '#e8cf8a', '#a8c79a'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(bh * 0.6 + i * bh * 0.55, bh / 2, bh * 0.16, 0, 7); g.fill(); });
  g.fillStyle = 'rgba(0,0,0,0.07)'; rr(g, w * 0.3, bh * 0.22, w * 0.4, bh * 0.56, bh * 0.28); g.fill();
  return bh;
}
function pillBtn(g, x, y, text, bg, fg, px) {
  g.font = F.sans(600, px);
  const tw = g.measureText(text).width;
  g.fillStyle = bg; rr(g, x, y, tw + px * 2.2, px * 2.2, px * 1.1); g.fill();
  g.fillStyle = fg; g.textBaseline = 'middle'; g.fillText(text, x + px * 1.1, y + px * 1.12);
  g.textBaseline = 'alphabetic';
}

function siteTexture(kind, logo) {
  return tex(1024, 640, (g, w, h) => {
    const top = chrome(g, w, h);
    const H = h - top;
    if (kind === 'pc') {
      g.fillStyle = '#141412'; g.fillRect(0, top, w, H);
      const grd = g.createRadialGradient(w * 0.78, top + H * 0.5, 10, w * 0.78, top + H * 0.5, H * 0.55);
      grd.addColorStop(0, 'rgba(219,183,126,0.55)'); grd.addColorStop(1, 'rgba(219,183,126,0)');
      g.fillStyle = grd; g.fillRect(0, top, w, H);
      if (logo) g.drawImage(logo, w * 0.66, top + H * 0.18, H * 0.62, H * 0.62);
      g.fillStyle = '#ecebe4'; g.font = F.sans(600, 22); g.fillText('patient creations.', 48, top + 50);
      g.font = F.sans(300, 64); g.fillText('Built to stand out.', 48, top + H * 0.42);
      g.fillStyle = '#dbb77e'; g.font = F.serif(70); g.fillText('Made to move you', 48, top + H * 0.58); g.fillText('forward.', 48, top + H * 0.72);
      pillBtn(g, 48, top + H * 0.8, 'Start a project  →', '#dbb77e', '#1a1a16', 18);
    } else if (kind === 'barber') {
      g.fillStyle = '#16130f'; g.fillRect(0, top, w, H);
      g.fillStyle = '#2a241c'; g.fillRect(w * 0.55, top, w * 0.45, H);
      g.strokeStyle = '#dbb77e'; g.lineWidth = 6;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(w * 0.6 + i * 40, top); g.lineTo(w * 0.6 + i * 40 - 120, top + H); g.stroke(); }
      g.fillStyle = '#a3a39a'; g.font = F.sans(500, 18); g.fillText('DESIGN CONCEPT / 01 · BARBERSHOP', 48, top + 56);
      g.fillStyle = '#ecebe4'; g.font = F.serif(96); g.fillText('The cut.', 48, top + H * 0.42);
      g.font = F.sans(300, 34); g.fillText('Sharp style.', 48, top + H * 0.56); g.fillText('Lasting impressions.', 48, top + H * 0.66);
      pillBtn(g, 48, top + H * 0.78, 'Book a chair', '#dbb77e', '#16130f', 18);
    } else if (kind === 'restaurant') {
      g.fillStyle = '#f2ead9'; g.fillRect(0, top, w, H);
      const cx = w * 0.76, cy = top + H * 0.52;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, H * 0.34, 0, 7); g.fill();
      g.fillStyle = '#d9a35f'; g.beginPath(); g.arc(cx, cy, H * 0.24, 0, 7); g.fill();
      g.fillStyle = '#8fa37a'; g.beginPath(); g.arc(cx - 30, cy - 20, 34, 0, 7); g.fill();
      g.fillStyle = '#c4553f'; g.beginPath(); g.arc(cx + 40, cy + 18, 28, 0, 7); g.fill();
      g.fillStyle = '#8b7350'; g.font = F.sans(500, 18); g.fillText('DESIGN CONCEPT / 02 · RESTAURANT', 48, top + 56);
      g.fillStyle = '#1a1a16'; g.font = F.display(86); g.fillText('At the table', 48, top + H * 0.42);
      g.font = F.sans(300, 34); g.fillText('Good food.', 48, top + H * 0.56); g.fillText('Great company.', 48, top + H * 0.66);
      pillBtn(g, 48, top + H * 0.78, 'See the menu', '#1a1a16', '#f2ead9', 18);
    } else if (kind === 'retail') {
      g.fillStyle = '#e1e7d4'; g.fillRect(0, top, w, H);
      [[0.62, 0.3, '#b9c6a2'], [0.8, 0.3, '#dbb77e'], [0.62, 0.62, '#1d2826'], [0.8, 0.62, '#f8f6ef']].forEach(([x, y, c]) => {
        g.fillStyle = c; rr(g, w * x, top + H * y - 70, w * 0.16, H * 0.28, 14); g.fill();
      });
      g.fillStyle = '#5d6b4c'; g.font = F.sans(500, 18); g.fillText('DESIGN CONCEPT / 03 · LOCAL RETAIL', 48, top + 56);
      g.fillStyle = '#1d2826'; g.font = F.sans(300, 60); g.fillText('Something', 48, top + H * 0.38);
      g.font = F.serif(78); g.fillText('worth', 48, top + H * 0.52);
      g.font = F.sans(300, 60); g.fillText('discovering.', 48, top + H * 0.66);
      pillBtn(g, 48, top + H * 0.78, 'Shop local', '#1d2826', '#e1e7d4', 18);
    } else if (kind === 'form') {
      g.fillStyle = '#f7f6f1'; g.fillRect(0, top, w, H);
      g.fillStyle = '#1a1a16'; g.font = F.sans(300, 54); g.fillText('Get a quote', 64, top + 100);
      ['Your name', 'Phone or email', 'What do you need?'].forEach((l, i) => {
        const y = top + 150 + i * 92;
        g.fillStyle = '#fff'; rr(g, 64, y, w - 128, 64, 12); g.fill();
        g.strokeStyle = 'rgba(26,26,22,0.18)'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#8a8a80'; g.font = F.sans(400, 24); g.fillText(l, 88, y + 41);
      });
      pillBtn(g, 64, top + 440, 'Send  →', '#dbb77e', '#1a1a16', 22);
    }
  });
}

function adTexture(kind) {
  if (kind === 'ugc') {
    return tex(540, 960, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#e8d8bf'); grd.addColorStop(1, '#b99a6e');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f3e8d8'; g.beginPath(); g.arc(w / 2, h * 0.42, 90, 0, 7); g.fill();
      g.fillStyle = '#2c2d27'; g.beginPath(); g.arc(w / 2, h * 0.37, 96, Math.PI, 0); g.fill();
      g.fillStyle = '#1d2826'; rr(g, w / 2 - 170, h * 0.55, 340, 420, 140); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.78)'; rr(g, 40, h * 0.12, w - 80, 120, 22); g.fill();
      g.fillStyle = '#fff'; g.font = F.sans(600, 34); g.textAlign = 'center';
      g.fillText('POV: you finally got', w / 2, h * 0.12 + 50); g.fillText('a real website', w / 2, h * 0.12 + 92);
      g.textAlign = 'left';
      g.fillStyle = '#fff'; g.font = F.sans(600, 22); g.fillText('UGC AD · HOOK 1 of 3', 40, h - 60);
      ['♥', '✦', '↗'].forEach((s, i) => { g.font = F.sans(600, 44); g.fillText(s, w - 80, h * 0.55 + i * 90); });
    });
  }
  return tex(1024, 576, (g, w, h) => {
    if (kind === 'cinematic') {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#2b2a38'); grd.addColorStop(0.55, '#d79b62'); grd.addColorStop(1, '#f1d29a');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f8e6bd'; g.beginPath(); g.arc(w * 0.68, h * 0.62, 70, 0, 7); g.fill();
      g.fillStyle = '#1d2826';
      g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.7); g.bezierCurveTo(w * 0.25, h * 0.55, w * 0.45, h * 0.78, w * 0.7, h * 0.68); g.bezierCurveTo(w * 0.85, h * 0.62, w, h * 0.72, w, h * 0.72); g.lineTo(w, h); g.fill();
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h * 0.11); g.fillRect(0, h * 0.89, w, h * 0.11);
      g.fillStyle = '#ecebe4'; g.font = F.serif(86); g.fillText('Stop the scroll.', 70, h * 0.42);
      g.font = F.sans(500, 22); g.fillStyle = '#dbb77e'; g.fillText('CINEMATIC AD SPECIAL · 16:9 + 9:16', 72, h * 0.52);
    } else if (kind === 'lake') {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#cfe0e6'); grd.addColorStop(0.6, '#eef1ea'); grd.addColorStop(0.6, '#8fbccb'); grd.addColorStop(1, '#5d8ea3');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.fillStyle = '#6f9a86'; g.beginPath(); g.moveTo(0, h * 0.6); g.lineTo(w * 0.2, h * 0.42); g.lineTo(w * 0.45, h * 0.6); g.fill();
      g.fillStyle = '#fbfaf6'; g.fillRect(w * 0.5, h * 0.38, w * 0.28, h * 0.22);
      g.fillStyle = '#dbb77e'; g.fillRect(w * 0.48, h * 0.35, w * 0.32, h * 0.04);
      g.fillStyle = '#39403f'; g.fillRect(w * 0.53, h * 0.44, w * 0.22, h * 0.08);
      g.fillStyle = 'rgba(0,0,0,0.55)'; rr(g, 50, h - 120, 470, 70, 35); g.fill();
      g.fillStyle = '#fff'; g.font = F.sans(600, 28); g.fillText('Lakehouse · 2 nights left', 80, h - 74);
      g.fillStyle = '#1a1a16'; g.font = F.sans(600, 22); g.fillText('RENTAL LISTING FILM', 54, 60);
    }
  });
}

function cardTexture(line, sub, logo) {
  return tex(700, 420, (g, w, h) => {
    g.fillStyle = '#141412'; rr(g, 0, 0, w, h, 34); g.fill();
    const grd = g.createRadialGradient(w * 0.82, h * 0.2, 5, w * 0.82, h * 0.2, w * 0.6);
    grd.addColorStop(0, 'rgba(219,183,126,0.35)'); grd.addColorStop(1, 'rgba(219,183,126,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    if (logo) g.drawImage(logo, 40, 40, 120, 120);
    g.fillStyle = '#dbb77e'; g.font = F.serif(70); g.fillText(line, 44, h * 0.68);
    g.fillStyle = '#a3a39a'; g.font = F.sans(500, 26); g.fillText(sub, 46, h * 0.84);
    g.strokeStyle = '#dbb77e'; g.lineWidth = 5;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(w - 110, 110, 20 + i * 22, -0.9, 0.9); g.stroke(); }
  });
}

function wordmarkTexture(logo, dark = true) {
  return tex(1024, 256, (g, w, h) => {
    g.fillStyle = dark ? '#1a1a16' : '#fbfaf6'; rr(g, 0, 0, w, h, 34); g.fill();
    if (logo) g.drawImage(logo, 26, 18, 220, 220);
    g.fillStyle = dark ? '#ecebe4' : '#1a1a16';
    g.font = F.sans(600, 92); g.fillText('patient', 270, 118);
    g.fillText('creations.', 270, 210);
  });
}
// Backlit neon sign: smoked-glass panel, glowing rim and glowing letters
function labelTexture(text, { bg = '#1a1a16', fg = '#ecebe4', font = F.sans(600, 80), w = 1024, h = 192 } = {}) {
  return tex(w, h, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, shade(bg, 18)); grd.addColorStop(1, shade(bg, -10));
    g.fillStyle = grd; rr(g, 0, 0, w, h, 24); g.fill();
    g.save(); g.shadowColor = fg; g.shadowBlur = h * 0.12;
    g.strokeStyle = fg; g.globalAlpha = 0.85; g.lineWidth = Math.max(3, h * 0.025); rr(g, h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14, 16); g.stroke();
    g.globalAlpha = 1; g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowBlur = h * 0.18; g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = h * 0.05; g.fillText(text, w / 2, h / 2 + 4);
    g.restore();
    const sheen = g.createLinearGradient(0, 0, w, h); // glass reflection
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,0.04)');
    g.fillStyle = sheen; rr(g, 0, 0, w, h, 24); g.fill();
  });
}
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
// Asphalt with painted lane lines, tiled along the road
function asphaltTexture(withCentre = true) {
  const t = tex(512, 256, (g, w, h) => {
    g.fillStyle = '#5b5a55'; g.fillRect(0, 0, w, h);
    const r = rng(21);
    for (let i = 0; i < 5000; i++) { g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${r() * 0.07})` : `rgba(0,0,0,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 1.4, 1.4); }
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, h * 0.18, w, h * 0.12); g.fillRect(0, h * 0.7, w, h * 0.12); // tyre wear
    g.fillStyle = '#ecebe4'; g.fillRect(0, h * 0.045, w, h * 0.03); g.fillRect(0, h * 0.925, w, h * 0.03); // edge lines
    if (withCentre) { g.fillStyle = '#e6c77d'; g.fillRect(0, h * 0.485, w * 0.55, h * 0.03); } // dashed centre line
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function paverTexture() {
  const t = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#e8e4da'; g.fillRect(0, 0, w, h);
    const r = rng(8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const v = r() * 26; // one tone shift per stone, so pavers vary in lightness, not hue
      g.fillStyle = `rgba(${206 + v},${200 + v},${188 + v},0.55)`;
      g.fillRect(x * 64 + (y % 2) * 32 + 2, y * 32 + 2, 60, 28);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function numberSprite(n) {
  const t = tex(256, 256, (g) => {
    g.fillStyle = 'rgba(219,183,126,0.25)'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.fillStyle = '#dbb77e'; g.beginPath(); g.arc(128, 128, 96, 0, 7); g.fill();
    g.fillStyle = '#1a1a16'; g.font = F.sans(600, 84); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 128, 134);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, toneMapped: false }));
  s.scale.set(3.2, 3.2, 1);
  return s;
}
function windowsTexture(cols, rows) {
  const t = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#23241f'; g.fillRect(0, 0, w, h);
    const r = rng(7);
    const cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = r() > 0.28;
      g.fillStyle = lit ? (r() > 0.5 ? '#f1cf8f' : '#dbb77e') : '#3a3b34';
      g.fillRect(x * cw + cw * 0.14, y * ch + ch * 0.2, cw * 0.72, ch * 0.6);
    }
  });
  return t;
}
function serverTexture() {
  return tex(1024, 256, (g, w, h) => {
    g.fillStyle = '#1d2826'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let x = 0; x < 24; x++) {
      g.fillStyle = '#25332f'; g.fillRect(12 + x * 42, 16, 34, h - 32);
      for (let y = 0; y < 10; y++) { g.fillStyle = r() > 0.4 ? '#dbb77e' : '#5f7a6f'; g.fillRect(20 + x * 42, 28 + y * 21, 6, 6); }
    }
  });
}
function poleTexture() {
  const t = tex(128, 256, (g, w, h) => {
    const cols = ['#fbfaf6', '#dbb77e', '#fbfaf6', '#1a1a16'];
    for (let i = -8; i < 16; i++) {
      g.fillStyle = cols[((i % 4) + 4) % 4];
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32 - 64); g.lineTo(w, i * 32 - 32); g.lineTo(0, i * 32 + 32); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- world
export function createWorld(canvas, { logo, lowPower = false, capture = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
  renderer.setPixelRatio(1); // main.js picks the real resolution (up to 4K) via setPixelRatio()
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const caps = renderer.capabilities;
  MAX_ANISO = caps.getMaxAnisotropy();
  TEX_SCALE = lowPower ? 1.5 : 2;
  const SHADOW_SIZE = !lowPower && caps.maxTextureSize >= 8192 ? 4096 : 2048;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.ground);
  scene.fog = new THREE.Fog(C.ground, 200, 600);
  // Soft studio reflections for glass, paint and water
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.38;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(22, 1, 1, 3000);

  const hemi = new THREE.HemisphereLight('#ffffff', '#cfc7b4', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff6e8', 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  // Late-morning sun from the right, so shadows fall toward the viewer and give every object depth
  const SUN_OFFSET = new THREE.Vector3(85, 115, 25);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1400), mat(C.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(220, 0, -90);
  ground.receiveShadow = true;
  scene.add(ground);

  const updaters = [];
  const hotspots = [];
  const trees = [];
  const R = rng(42);
  let cur = new THREE.Vector3(); // centre of the scene being built; hotspot and tree coords are local to it
  const hs = (scene, x, y, z, title, text) => hotspots.push({ scene, pos: new THREE.Vector3(x, y, z).add(cur), title, text });

  const CENTERS = [0, 1, 2, 3, 4, 5].map((i) => new THREE.Vector3(i * 85, 0, -i * 32));
  const keepOut = []; // circles trees should avoid: [x, z, r]

  const wordmark = wordmarkTexture(logo, true);

  // ---- shared vehicle parts
  const paint = mat(C.white, { rough: 0.32, clearcoat: 0.7 });
  const paintSand = mat(C.sand, { rough: 0.35, clearcoat: 0.6 });
  const glassMat = mat('#2b3436', { rough: 0.08, metal: 0.4 });
  const tyreMat = mat('#1f1f1c', { rough: 0.9 });
  const rimMat = mat('#c9ccca', { rough: 0.3, metal: 0.8 });
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.3), toneMapped: false });
  const tailMat = new THREE.MeshBasicMaterial({ color: '#c8402e' });
  const rounded = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
  function part(parent, geo, material, x, y, z, cast = true) {
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
  }
  const tyreGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.34, 20); tyreGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.36, 16); rimGeo.rotateZ(Math.PI / 2);
  function wheels(g, pts) {
    for (const [x, z] of pts) { part(g, tyreGeo, tyreMat, x, 0.46, z); part(g, rimGeo, rimMat, x, 0.46, z, false); }
  }

  // Branded delivery van: rounded body, glass, wheels with rims, head and tail lights, wordmark on the sides
  const decalMat = mat('#ffffff', { map: wordmark, rough: 0.4 });
  const vanBody = rounded(2.3, 2.45, 4.05, 0.22), vanCab = rounded(2.3, 1.7, 1.6, 0.32);
  const vanStripe = rounded(2.33, 0.3, 4.07, 0.08), vanGlass = rounded(1.98, 0.78, 0.12, 0.08);
  const sideGlass = rounded(0.06, 0.62, 0.9, 0.05), lampGeo = rounded(0.42, 0.18, 0.08, 0.04), mirrorGeo = rounded(0.1, 0.3, 0.22, 0.04);
  function van(parent, x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry;
    part(g, vanBody, paint, 0, 0.45 + 1.225, -0.7);
    part(g, vanCab, paint, 0, 0.45 + 0.85, 2.05);
    part(g, vanStripe, paintSand, 0, 1.4, -0.7);
    part(g, vanGlass, glassMat, 0, 1.62, 2.82, false).rotation.x = -0.18;
    part(g, sideGlass, glassMat, 1.15, 1.7, 2.1, false); part(g, sideGlass, glassMat, -1.15, 1.7, 2.1, false);
    part(g, lampGeo, headMat, 0.78, 0.95, 2.85, false); part(g, lampGeo, headMat, -0.78, 0.95, 2.85, false);
    part(g, lampGeo, tailMat, 0.85, 1.0, -2.74, false); part(g, lampGeo, tailMat, -0.85, 1.0, -2.74, false);
    part(g, mirrorGeo, paint, 1.25, 1.85, 2.55); part(g, mirrorGeo, paint, -1.25, 1.85, 2.55);
    plane(g, 2.6, 0.65, decalMat, 1.17, 2.3, -0.7, Math.PI / 2);
    plane(g, 2.6, 0.65, decalMat, -1.17, 2.3, -0.7, -Math.PI / 2);
    wheels(g, [[1.02, 1.95], [-1.02, 1.95], [1.02, -1.75], [-1.02, -1.75]]);
    for (const sx of [1.17, -1.17]) part(g, rounded(0.03, 0.05, 3.6, 0.02), cyanGlow, sx, 0.78, -0.7, false); // underglow line
    contactShadow(g, 0, 0, 3.1, 5.6, 0.45);
    parent.add(g);
    return g;
  }
  // Sleek electric car: extruded aerodynamic profile, glass canopy, light bars and glowing wheel rims
  function profileGeo(pts, depth, bevel) {
    const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
    geo.translate(0, 0, -depth / 2); geo.rotateY(-Math.PI / 2); // length along +z, like the vans
    geo.computeVertexNormals();
    return geo;
  }
  const evBody = profileGeo([[-2.2, 0.42], [2.15, 0.42], [2.3, 0.62], [2.05, 0.86], [1.15, 0.98], [0.2, 1.36], [-1.35, 1.34], [-2.15, 1.02]], 1.72, 0.09);
  const evGlass = profileGeo([[1.1, 0.99], [0.22, 1.33], [-1.3, 1.31], [-1.98, 1.04]], 1.9, 0.03); // a touch wider than the body, so the windows show
  const barGeo = rounded(1.6, 0.06, 0.06, 0.025);
  const rimGlowGeo = new THREE.TorusGeometry(0.3, 0.025, 8, 28); rimGlowGeo.rotateY(Math.PI / 2);
  const cyanGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 1.9, 2.3), toneMapped: false });
  const EV_PAINT = [paint, paintSand, mat('#2c3038', { rough: 0.25, metal: 0.6, clearcoat: 0.8 }), mat('#9fb3ad', { rough: 0.3, metal: 0.4, clearcoat: 0.7 })];
  let evCount = 0;
  function car(parent) {
    const g = new THREE.Group();
    part(g, evBody, EV_PAINT[evCount++ % EV_PAINT.length], 0, 0, 0);
    part(g, evGlass, glassMat, 0, 0, 0, false);
    part(g, barGeo, headMat, 0, 0.78, 2.32, false);
    part(g, barGeo, tailMat, 0, 0.92, -2.24, false);
    for (const [x, z] of [[0.8, 1.35], [-0.8, 1.35], [0.8, -1.35], [-0.8, -1.35]]) {
      part(g, tyreGeo, tyreMat, x, 0.44, z); part(g, rimGeo, rimMat, x, 0.44, z, false);
      part(g, rimGlowGeo, cyanGlow, x * 1.02, 0.44, z, false);
    }
    contactShadow(g, 0, 0, 2.3, 4.9, 0.5);
    parent.add(g);
    return g;
  }
  // Traffic in both lanes of a straight road (local x axis), looping out of view
  function traffic(parent, roadZ, len, n, speed) {
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1, c = car(parent);
      c.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const lane = roadZ + (dir > 0 ? 1.75 : -1.75), off = (i / n) * len;
      updaters.push((t) => {
        const x = (((t * speed + off) % len) + len) % len - len / 2; // same speed per lane, so cars never overlap
        c.position.set(dir * x, 0.06, lane);
      });
    }
  }

  // ---- soft contact shadows (cheap ambient occlusion where things meet the ground)
  const blobTex = tex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.45, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
  const aoTex = tex(128, 128, (g) => {
    g.filter = 'blur(10px)'; g.fillStyle = '#000'; g.fillRect(26, 26, 76, 76);
  });
  const shadowMats = new Map();
  function shadowMat(map, opacity) {
    const k = map.uuid + opacity;
    if (!shadowMats.has(k)) shadowMats.set(k, new THREE.MeshBasicMaterial({ map, color: '#2a2618', transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    return shadowMats.get(k);
  }
  const flatPlane = new THREE.PlaneGeometry(1, 1); flatPlane.rotateX(-Math.PI / 2);
  function contactShadow(parent, x, z, w, d, opacity = 0.35, y = 0.035, map = blobTex) {
    const m = new THREE.Mesh(flatPlane, shadowMat(map, opacity));
    m.scale.set(w, 1, d); m.position.set(x, y, z); m.renderOrder = 1;
    parent.add(m);
    return m;
  }

  // Realistic street: textured asphalt, raised curbs, paver sidewalks, crosswalks and street lamps.
  // Layers are spaced in height (asphalt 0.06, curbs 0.2, sidewalks 0.17) so nothing is coplanar and flickers.
  const asphalt = asphaltTexture(), paver = paverTexture();
  const curbMat = mat('#d6d2c8', { rough: 0.7 });
  const lampHead = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.25, 1.0), toneMapped: false });
  const metal = mat('#b9bcbb', { rough: 0.35, metal: 0.8 });
  function road(parent, x, z, len, w, ry = 0, { sidewalk = 2.6, lamps = true, crossings = [] } = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const at = asphalt.clone(); at.repeat.set(len / 14, 1); at.needsUpdate = true;
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(len, w).rotateX(-Math.PI / 2), mat('#ffffff', { map: at, rough: 0.92 }));
    surf.position.y = 0.06; surf.receiveShadow = true; g.add(surf);
    for (const sd of [-1, 1]) {
      box(g, len, 0.2, 0.3, '', 0, 0, sd * (w / 2 + 0.15), { material: curbMat });
      if (sidewalk) {
        const pt = paver.clone(); pt.repeat.set(len / 3, sidewalk / 3); pt.needsUpdate = true;
        box(g, len, 0.17, sidewalk, '', 0, 0, sd * (w / 2 + 0.3 + sidewalk / 2), { material: mat('#ffffff', { map: pt, rough: 0.85 }), cast: false });
      }
      if (lamps) for (let i = -len / 2 + 7; i < len / 2 - 4; i += 16) {
        const lz = sd * (w / 2 + 0.6);
        cyl(g, 0.07, 0.1, 4.6, '', i, 0.17, lz, { material: metal, seg: 10 });
        const arm = box(g, 0.12, 0.1, 1.3, '', i, 4.65, lz - sd * 0.6, { material: metal });
        const head = box(g, 0.3, 0.08, 0.7, '', i, 4.58, lz - sd * 1.15, { material: lampHead, cast: false });
        glow(g, i, 4.4, lz - sd * 1.15, 1.4, '#ffe2a8', 0.16);
      }
    }
    for (const cx of crossings) for (let k = -w / 2 + 0.6; k < w / 2 - 0.4; k += 0.9) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5).rotateX(-Math.PI / 2), mat('#eeece5', { rough: 0.8, offset: true }));
      bar.position.set(cx, 0.065, k); bar.receiveShadow = true; g.add(bar);
    }
    parent.add(g);
    return g;
  }
  // Additive glow sprite: a soft halo around lights and neon so they read as luminous
  const glowTex = tex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
  const glowMats = new Map();
  function glow(parent, x, y, z, size, color, opacity = 0.5) {
    const k = color + opacity;
    if (!glowMats.has(k)) glowMats.set(k, new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const sp = new THREE.Sprite(glowMats.get(k)); sp.position.set(x, y, z); sp.scale.set(size, size, 1);
    parent.add(sp);
    return sp;
  }
  // Self-lit sign face + a soft halo so signage glows like a backlit panel
  const signMat = (map) => new THREE.MeshBasicMaterial({ map, toneMapped: false });
  function sign(parent, w, h, map, x, y, z, ry = 0, rx = 0, haloColor = '#ffd994') {
    const m = plane(parent, w, h, signMat(map), x, y, z, ry, rx);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.7, h * 2.4), new THREE.MeshBasicMaterial({ map: glowTex, color: haloColor, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    back.position.set(x, y, z); back.rotation.set(rx, ry, 0, 'YXZ'); back.translateZ(-0.04); parent.add(back);
    return m;
  }

  function treeField(cx, cz, rx, rz, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const x = cur.x + cx + (R() * 2 - 1) * rx, z = cur.z + cz + (R() * 2 - 1) * rz;
      if (R() < 0.4) continue;
      trees.push({ x, z, y: opts.h ? opts.h(x, z) : 0, s: 0.6 + R() * 0.7 });
    }
  }

  // ------------------------------------------------ 01 · The studio (Emons dock scene)
  {
    const g = new THREE.Group(); g.position.copy(CENTERS[0]); scene.add(g); cur = CENTERS[0];
    road(g, 0, 15.8, 150, 7, 0, { sidewalk: 2.2, crossings: [-20, 30] });
    box(g, 44, 0.04, 10, C.pad, 2, 0, 6.5, { cast: false });
    box(g, 30, 8, 14, C.white, 2, 0, -6);
    box(g, 5, 8.6, 14.4, C.sand, 19.5, 0, -6);
    box(g, 30.1, 0.5, 14.1, C.offwhite, 2, 8, -6);
    for (let i = 0; i < 6; i++) {
      box(g, 3, 4, 0.2, '#3b3c36', -10 + i * 4.6, 0, 1.05);
      box(g, 3.4, 0.25, 0.6, C.sand, -10 + i * 4.6, 4.1, 1.2, { cast: false });
    }
    // Rooftop solar arrays
    const solarTex = tex(256, 128, (c, w, h) => {
      c.fillStyle = '#1b2738'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(160,190,220,0.35)'; c.lineWidth = 2;
      for (let x = 0; x <= w; x += w / 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 0; y <= h; y += h / 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    });
    const solarMat = mat('#ffffff', { map: solarTex, rough: 0.12, metal: 0.6 });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      const pnl = box(g, 3.6, 0.08, 2.2, '', -10 + c * 4, 8.85, -11 + r * 4, { material: solarMat });
      pnl.rotation.x = -0.32;
      box(g, 0.12, 0.5, 0.12, '', -10 + c * 4, 8.5, -11 + r * 4 + 0.7, { material: metal });
    }
    // Rooftop sign
    sign(g, 12, 3, wordmark, 2, 10.6, -0.2);
    box(g, 0.3, 2.2, 0.3, C.ink, -3, 8.5, -0.4); box(g, 0.3, 2.2, 0.3, C.ink, 7, 8.5, -0.4);
    // Glass office annex
    box(g, 11, 6.5, 11, C.white, -21, 0, -4);
    box(g, 11.1, 1.8, 11.1, C.glass, -21, 2.4, -4, { cast: false });
    box(g, 11.1, 1.0, 11.1, C.glass, -21, 5.0, -4, { cast: false });
    // Pallets
    for (let i = 0; i < 7; i++) box(g, 1.2, 0.9 + (i % 3) * 0.5, 1.2, '#d8c39e', -14 + i * 1.6, 0, 3.2 + (i % 2));
    // Parked vans backed into the docks
    [-10, -5.4, -0.8, 8.4].forEach((x) => van(g, x, 6.4, 0));
    // Moving vans on the road
    const v1 = van(g, 0, 14.05, -Math.PI / 2), v2 = van(g, 0, 17.55, Math.PI / 2);
    v1.position.y = v2.position.y = 0.06;
    updaters.push((t) => {
      v1.position.x = 70 - ((t * 7) % 140);
      v2.position.x = -70 + ((t * 5 + 60) % 140);
    });
    // Car park + trees
    for (let i = 0; i < 6; i++) box(g, 0.15, 0.04, 4.5, '#ffffff', 26 + i * 3, 0, 5, { cast: false });
    treeField(-38, -10, 9, 16, 26); treeField(36, -14, 10, 10, 18); treeField(0, -26, 30, 5, 20);
    treeField(-30, 28, 30, 6, 22); treeField(30, 28, 30, 6, 22);
    keepOut.push([CENTERS[0].x, CENTERS[0].z, 28]);
    hs(0, 2, 12, -4, 'Patient Creations Studio', 'One creative partner. Every next step.');
    hs(0, -5.4, 3.5, 6.4, 'Ships on a private preview', 'See it before it goes live, then approve.');
  }

  // ------------------------------------------------ 02 · Websites (Emons warehouse cutaway)
  {
    const g = new THREE.Group(); g.position.copy(CENTERS[1]); scene.add(g); cur = CENTERS[1];
    box(g, 38, 0.3, 28, '#f6f5f0', 0, 0, 0);
    box(g, 38, 7.5, 0.6, C.white, 0, 0, -13.7);            // back wall (tall)
    box(g, 0.6, 7.5, 28, C.white, 18.7, 0, 0);             // right wall (tall)
    box(g, 0.7, 7.6, 12, C.sand, 19.1, 0, 4);               // sand accent
    box(g, 38, 1.1, 0.4, C.white, 0, 0, 13.8);              // front wall (cut away)
    box(g, 0.4, 1.1, 28, C.white, -18.8, 0, 0);             // left wall (cut away)
    for (let x = -15; x <= 15; x += 6) box(g, 0.3, 0.45, 21, '#d8d5cc', x, 7.4, 3.5);
    // Giant concept screens on the back wall
    const concepts = ['barber', 'restaurant', 'retail'].map((k) => siteTexture(k, logo));
    concepts.forEach((t, i) => {
      const x = -12 + i * 12;
      box(g, 10, 6.2, 0.3, C.ink, x, 0.9, -13.2);
      plane(g, 9.5, 5.94, mat('#ffffff', { basic: true, map: t }), x, 3.97, -13.03);
    });
    // Desks with live sites
    const deskTex = [siteTexture('pc', logo), ...concepts];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      const x = -13 + c * 6.5, z = -6 + r * 5;
      box(g, 3.8, 0.9, 1.7, '#e7e2d6', x, 0.3, z);
      box(g, 2.5, 1.6, 0.14, C.ink, x, 1.5, z - 0.5);
      box(g, 0.2, 0.35, 0.2, C.ink, x, 1.2, z - 0.5);
      plane(g, 2.36, 1.48, mat('#ffffff', { basic: true, map: deskTex[(r + c) % 4] }), x, 2.3, z - 0.42);
      box(g, 0.9, 0.9, 0.9, r % 2 ? C.sand : C.inkSoft, x, 0.3, z + 1.3);
    }
    treeField(-34, 0, 8, 22, 26); treeField(0, -24, 26, 5, 18); treeField(32, -20, 8, 10, 12); treeField(0, 24, 30, 5, 22);
    keepOut.push([CENTERS[1].x, CENTERS[1].z, 26]);
    hs(1, -12, 9, -13, 'Design concept / 01 · Barbershop', 'The cut. Sharp style. Lasting impressions.');
    hs(1, 12, 9, -13, 'Design concept / 03 · Local retail', 'Something worth discovering.');
    hs(1, -6.5, 4, 4, 'Website Special · $1,250', 'A one-page website, live in about 72 hours, with 3 months of care.');
  }

  // ------------------------------------------------ 03 · From idea to online (Emons mountain road)
  {
    const base = CENTERS[2]; cur = base;
    const g = new THREE.Group(); g.position.copy(base); scene.add(g);
    const W = 110, D = 84;
    const hRaw = (x, z) => 3.2 + 3.6 * Math.sin(x * 0.075) * Math.cos(z * 0.07) + 2.2 * Math.sin(x * 0.16 + 1.3) + 1.8 * Math.cos(z * 0.13 + 0.5);
    const fall = (x, z) => smooth(clamp01((W / 2 - Math.abs(x)) / 16)) * smooth(clamp01((D / 2 - Math.abs(z)) / 14));
    // +0.08 keeps flat valleys just above the ground plane; at exactly 0 the two surfaces z-fight and flicker
    const height = (x, z) => Math.max(0, hRaw(x, z)) * fall(x, z) + 0.08;
    const geo = new THREE.PlaneGeometry(W, D, 88, 68);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    const cols = new Float32Array(flat.attributes.position.count * 3);
    const lo = new THREE.Color('#a9bb94'), hi = new THREE.Color('#d2dcc0'), cream = new THREE.Color(C.ground), tmp = new THREE.Color();
    for (let i = 0; i < flat.attributes.position.count; i++) {
      const x = flat.attributes.position.getX(i), y = flat.attributes.position.getY(i), z = flat.attributes.position.getZ(i);
      tmp.copy(lo).lerp(hi, clamp01(y / 8)).lerp(cream, 1 - fall(x, z));
      cols.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    flat.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const terrain = new THREE.Mesh(flat, mat('#ffffff', { vc: true, flat: true }));
    terrain.receiveShadow = true;
    g.add(terrain);

    const pts = [[-58, 30], [-40, 27], [-26, 18], [-34, 4], [-22, -8], [-4, -4], [4, 10], [18, 12], [26, -2], [16, -16], [30, -26], [58, -30]]
      .map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const N = 500, half = 1.5;
    const verts = [], idx = [], samples = curve.getSpacedPoints(N);
    for (let i = 0; i <= N; i++) {
      const p = samples[i], q = samples[Math.min(N, i + 1)], o = samples[Math.max(0, i - 1)];
      const tx = q.x - o.x, tz = q.z - o.z, l = Math.hypot(tx, tz) || 1;
      const nx = -tz / l, nz = tx / l;
      for (const s of [-1, 1]) {
        const x = p.x + nx * half * s, z = p.z + nz * half * s;
        verts.push(x, height(x, z) + 0.3, z);
      }
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    rg.setIndex(idx); rg.computeVertexNormals();
    // Lifted and depth-biased so the faceted hills never poke through the road
    const roadMesh = new THREE.Mesh(rg, mat('#f6f4ee', { side: THREE.DoubleSide, offset: true }));
    roadMesh.receiveShadow = true;
    g.add(roadMesh);
    // Car travelling the road
    const hatch = car(g);
    const up = new THREE.Vector3();
    updaters.push((t) => {
      const u = Math.min(0.999, Math.max(0, (t * 0.03) % 1));
      const p = curve.getPointAt(u), tg = curve.getTangentAt(u);
      hatch.position.set(p.x, height(p.x, p.z) + 0.3, p.z);
      up.set(p.x + tg.x, 0, p.z + tg.z);
      hatch.lookAt(up.x, hatch.position.y, up.z);
    });
    // Process milestones
    const steps = [
      ['01 · Choose your move.', 'Pick your service and order online, or start with a Growth Audit.'],
      ['02 · Make it yours.', 'A short intake with your business info, brand, and goals.'],
      ['03 · Preview and refine.', 'A private preview before anything goes live.'],
      ['04 · Launch and keep going.', 'We put it live. 3 months of care on the Website Special.'],
    ];
    [0.14, 0.38, 0.62, 0.86].forEach((u, i) => {
      const p = curve.getPointAt(u);
      const y = height(p.x, p.z);
      cyl(g, 0.12, 0.12, 3.2, C.ink, p.x + 2.2, y, p.z);
      const s = numberSprite('0' + (i + 1)); s.position.set(p.x + 2.2, y + 4.4, p.z); g.add(s);
      hs(2, p.x + 2.2, y + 8.6, p.z, steps[i][0], steps[i][1]); // clear of the number disc below it
    });
    // Trees on the hills, kept off the road
    for (let i = 0; i < 180; i++) {
      const x = (R() * 2 - 1) * (W / 2 - 6), z = (R() * 2 - 1) * (D / 2 - 6);
      if (samples.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 14)) continue;
      trees.push({ x: base.x + x, z: base.z + z, y: height(x, z), s: 0.6 + R() * 0.6 });
    }
    keepOut.push([base.x, base.z, 50]);
  }

  // ------------------------------------------------ 04 · Get seen (Emons port & airport)
  {
    const base = CENTERS[3]; cur = base;
    const g = new THREE.Group(); g.position.copy(base); scene.add(g);
    box(g, 70, 0.08, 26, C.water, -6, 0, -24, { cast: false, material: mat(C.water) });
    box(g, 70, 0.1, 1.2, '#e3dccd', -6, 0, -10.6, { cast: false });
    box(g, 2, 0.5, 12, '#e3dccd', 2, 0, -16);
    // Lakehouse (short-term rental)
    box(g, 11, 4, 7, C.white, 15, 0, -6.5);
    box(g, 11.1, 1.6, 7.1, C.glass, 15, 1.3, -6.5, { cast: false });
    box(g, 7.5, 3.4, 6, C.white, 16, 4, -7);
    box(g, 8.2, 0.35, 6.7, C.sand, 16, 7.4, -7);
    // Boat
    const boat = new THREE.Group(); boat.position.set(-4, 0, -20); g.add(boat);
    box(boat, 1.8, 0.7, 4.6, C.white, 0, 0, 0); box(boat, 1.82, 0.2, 4.62, C.sand, 0, 0.5, 0); box(boat, 1.2, 0.8, 1.4, C.white, 0, 0.7, -0.4);
    updaters.push((t) => { boat.position.y = Math.sin(t * 1.6) * 0.08; boat.rotation.z = Math.sin(t * 1.3) * 0.03; boat.position.x = -4 + Math.sin(t * 0.25) * 5; });
    // Soundstages
    function stage(x, z, n) {
      box(g, 15, 5, 10, C.white, x, 0, z);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 14.8, 24), mat(C.offwhite));
      roof.rotation.z = Math.PI / 2; roof.position.set(x, 5, z); roof.castShadow = roof.receiveShadow = true; g.add(roof);
      box(g, 5, 4.2, 0.2, C.sand, x, 0, z + 5.05);
      sign(g, 2.4, 1.2, labelTexture('STAGE ' + n, { w: 512, h: 256, fg: '#dbb77e', font: F.sans(600, 90) }), x, 7.2, z + 4.4, 0, -0.35);
    }
    stage(-22, 6, 1); stage(-5, 9, 2);
    // Billboards
    const face = -0.6;
    function billboard(x, z, w, h, texture, y0 = 4) {
      cyl(g, 0.2, 0.2, y0, C.ink, x, 0, z);
      const b = new THREE.Group(); b.position.set(x, y0, z); b.rotation.y = face; g.add(b);
      box(b, w + 0.5, h + 0.5, 0.4, C.ink, 0, 0, 0);
      plane(b, w, h, mat('#ffffff', { basic: true, map: texture }), 0, (h + 0.5) / 2, 0.21);
    }
    billboard(14, 10, 10, 5.6, adTexture('cinematic'));
    billboard(30, 2, 9, 5.06, adTexture('lake'));
    billboard(24, 18, 3.8, 6.76, adTexture('ugc'), 1.2);
    // Camera crane
    cyl(g, 1.2, 1.4, 0.6, C.ink, 4, 0, 16);
    cyl(g, 0.25, 0.25, 5, C.inkSoft, 4, 0.6, 16);
    const arm = new THREE.Group(); arm.position.set(4, 5.6, 16); g.add(arm);
    box(arm, 9, 0.35, 0.35, C.sand, 2.5, 0, 0);
    box(arm, 1.4, 0.9, 0.9, C.ink, 7.2, -0.9, 0);
    updaters.push((t) => { arm.rotation.y = 0.6 + Math.sin(t * 0.4) * 0.7; arm.rotation.z = Math.sin(t * 0.55) * 0.12; });
    // Drones (the planes from the original)
    const rotorGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12);
    for (let i = 0; i < 4; i++) {
      const d = new THREE.Group(); g.add(d);
      box(d, 0.9, 0.3, 0.9, C.ink, 0, 0, 0);
      for (const [rx, rz] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) {
        const r = new THREE.Mesh(rotorGeo, mat(C.sand)); r.position.set(rx, 0.32, rz); r.castShadow = true; d.add(r);
      }
      const cx = [15, -12, 26, 0][i], cz = [-6, 4, 6, -16][i], rad = 6 + i * 1.5, h = 9 + i * 1.6, sp = 0.35 + i * 0.07;
      updaters.push((t) => {
        const a = t * sp + i * 1.7;
        d.position.set(cx + Math.cos(a) * rad, h + Math.sin(t * 1.4 + i) * 0.4, cz + Math.sin(a) * rad);
        d.rotation.y = -a;
      });
    }
    treeField(40, -2, 6, 14, 14); treeField(-40, 12, 8, 6, 14); treeField(10, 28, 26, 4, 18);
    keepOut.push([base.x, base.z, 34]);
    hs(3, 14, 13, 10, 'Cinematic Ad Special · $299', 'Film-style ads in wide & vertical formats.');
    hs(3, 24, 10, 18, 'UGC Ad Special · $129', 'Creator-style AI ads with opening hooks to test.');
    hs(3, 16, 9, -7, 'Rental listing films', 'Made from your photos. No shoot on your calendar.');
    hs(3, -13, 11, 8, 'Monthly Ads · from $300/mo', '10 short ads a month, up to 40 plus cinematic videos.');
  }

  // ------------------------------------------------ 05 · Work smarter (Emons rail)
  {
    const base = CENTERS[4]; cur = base;
    const g = new THREE.Group(); g.position.copy(base); scene.add(g);
    const trackLen = 170;
    box(g, trackLen, 0.15, 3.4, '#e1ddd2', 0, 0, 8, { cast: false });
    box(g, trackLen, 0.2, 0.15, '#8e8b82', 0, 0.15, 7.3, { cast: false });
    box(g, trackLen, 0.2, 0.15, '#8e8b82', 0, 0.15, 8.7, { cast: false });
    const sleepers = new THREE.InstancedMesh(BOX, mat('#b9b3a5'), Math.floor(trackLen / 1.3));
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < sleepers.count; i++) {
      m4.compose(new THREE.Vector3(-trackLen / 2 + i * 1.3, 0.12, 8), new THREE.Quaternion(), new THREE.Vector3(0.35, 0.08, 2.6));
      sleepers.setMatrixAt(i, m4);
    }
    sleepers.receiveShadow = true; g.add(sleepers);
    // Train carrying leads
    const cars = [];
    for (let i = 0; i < 7; i++) {
      const car = new THREE.Group(); g.add(car);
      if (i === 0) {
        part(car, rounded(5.4, 2.4, 2.4, 0.45), paintSand, 0, 1.6, 0);
        part(car, rounded(1.4, 0.9, 2.44, 0.12), glassMat, 1.9, 2.15, 0, false);
        part(car, lampGeo, headMat, 2.72, 1.2, 0.6, false).rotation.y = Math.PI / 2;
        part(car, lampGeo, headMat, 2.72, 1.2, -0.6, false).rotation.y = Math.PI / 2;
      } else {
        part(car, rounded(5, 1.0, 2.3, 0.2), paint, 0, 0.9, 0);
        for (let k = 0; k < 3; k++) part(car, rounded(1.2, 0.8, 1.6, 0.12), k === 1 ? paintSand : paint, -1.6 + k * 1.6, 1.8, 0);
      }
      for (const wx of [-1.7, 1.7]) for (const wz of [-0.95, 0.95]) part(car, tyreGeo, tyreMat, wx, 0.46, wz);
      cars.push(car);
    }
    updaters.push((t) => {
      cars.forEach((car, i) => {
        const x = ((t * 7 - i * 5.8) % trackLen + trackLen) % trackLen - trackLen / 2;
        car.position.set(x, 0, 8);
        car.visible = Math.abs(x) < trackLen / 2 - 6;
      });
    });
    // Storefront with a lead form
    box(g, 11, 5, 8, C.white, -22, 0, -4);
    box(g, 12, 0.3, 3, C.sand, -22, 3.6, 1.2);
    plane(g, 7.2, 4.5, mat('#ffffff', { basic: true, map: siteTexture('form', logo) }), -22, 6.5, 0.05);
    box(g, 7.6, 4.9, 0.1, C.ink, -22, 4.05, -0.02, { cast: false });
    // Lead engine
    box(g, 17, 7.5, 12, C.white, 16, 0, -6);
    box(g, 17.1, 4.2, 0.15, C.ink, 16, 1.6, 0.05, { cast: false, material: mat('#ffffff', { map: serverTexture() }) });
    box(g, 4, 7.9, 12.2, C.sand, 26.5, 0, -6);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.32, 12, 48), mat(C.sand));
    ring.position.set(14, 11.5, -6); ring.castShadow = true; g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.22, 12, 40), mat(C.ink));
    ring2.position.copy(ring.position); g.add(ring2);
    cyl(g, 0.3, 0.5, 1.3, C.ink, 14, 7.5, -6);
    updaters.push((t) => { ring.rotation.y = t * 0.6; ring2.rotation.x = t * 0.8; });
    sign(g, 8, 1.5, labelTexture('LEAD ENGINE', { fg: '#8fe9ff' }), 12, 8.6, 0.1, 0, 0, '#8fe9ff');
    // Conduit with travelling packets
    box(g, 30, 0.35, 0.35, '#cfcabd', -3, 6.5, -2);
    const packets = [];
    for (let i = 0; i < 8; i++) { packets.push(box(g, 0.7, 0.5, 0.5, C.sand, 0, 6.8, -2)); }
    updaters.push((t) => packets.forEach((p, i) => { p.position.x = -18 + ((t * 5 + i * 3.75) % 30); }));
    cyl(g, 0.25, 0.25, 6.5, '#cfcabd', -17.6, 0, -2); cyl(g, 0.25, 0.25, 6.5, '#cfcabd', 11.6, 0, -2);
    // Payment kiosk
    box(g, 1.8, 2.8, 1.2, C.ink, -3, 0, 2);
    sign(g, 1.3, 0.9, labelTexture('PAID ✓', { bg: '#141412', fg: '#dbb77e', w: 512, h: 352, font: F.sans(600, 96) }), -3, 2.2, 2.61);
    treeField(-44, -6, 8, 12, 16); treeField(0, -22, 30, 4, 16); treeField(44, -10, 8, 10, 14); treeField(0, 22, 40, 5, 20);
    keepOut.push([base.x, base.z, 34]);
    hs(4, -22, 9.5, 0, 'Lead capture', 'Forms that catch every inquiry, day or night.');
    hs(4, -30, 4, 8, 'Automatic follow-up', 'Follow-up emails go out while you work.');
    hs(4, 14, 15.5, -6, 'Multi-agent AI systems', 'Custom apps and agents scoped to your business.');
    hs(4, -3, 4, 2, 'Stripe payment setup', 'Accept payments without the busywork.');
  }

  // ------------------------------------------------ 06 · Main Street + tower (Emons HQ)
  {
    const base = CENTERS[5]; cur = base;
    const g = new THREE.Group(); g.position.copy(base); scene.add(g);
    road(g, 0, 12, 100, 7, 0, { sidewalk: 3, crossings: [-19.5, 6] });
    traffic(g, 12, 100, 4, 7);
    const shops = [
      { x: -26, label: 'THE CUT', bg: '#1a1a16', fg: '#dbb77e', body: C.white, card: ['Tap to review', 'Google reviews, one tap'] },
      { x: -13, label: 'AT THE TABLE', bg: '#dbb77e', fg: '#1a1a16', body: '#f3ebdc', card: ['Tap for our menu', 'Menu, hours & location'] },
      { x: 0, label: 'LOCAL / ORIGINAL', bg: '#1d2826', fg: '#ecebe4', body: '#dfe5d2', card: ['Tap to follow', 'Instagram · TikTok · YouTube'] },
    ];
    shops.forEach((s, i) => {
      box(g, 11, 5.5, 8, s.body, s.x, 0, 1);
      box(g, 11.1, 0.5, 8.1, C.offwhite, s.x, 5.5, 1);
      box(g, 6, 2.6, 0.12, C.glass, s.x - 1.5, 0.3, 5.02, { cast: false });
      box(g, 1.6, 3, 0.12, C.ink, s.x + 3.2, 0, 5.02, { cast: false });
      sign(g, 7, 1.3, labelTexture(s.label, { bg: s.bg === '#dbb77e' ? '#2a2216' : s.bg, fg: s.fg === '#1a1a16' ? '#ffd994' : s.fg }), s.x, 4.4, 5.14, 0, 0, s.fg === '#1a1a16' ? '#ffd994' : s.fg);
      // Floating tap-to-share Business Card
      const card = new THREE.Group(); g.add(card);
      box(card, 3.6, 2.16, 0.08, C.ink, 0, -1.08, 0);
      plane(card, 3.6, 2.16, mat('#ffffff', { basic: true, map: cardTexture(s.card[0], s.card[1], logo) }), 0, 0, 0.05);
      const glow = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.35, 40), mat(C.sand, { basic: true, side: THREE.DoubleSide }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(s.x, 5.85, 1); g.add(glow);
      updaters.push((t) => {
        card.position.set(s.x, 9.4 + Math.sin(t * 1.3 + i) * 0.35, 1.5);
        card.rotation.y = -0.45 + Math.sin(t * 0.7 + i) * 0.25;
        const k = 1 + ((t * 0.8 + i * 0.33) % 1) * 0.8;
        glow.scale.set(k, k, k);
      });
    });
    // Barber pole
    const poleTex = poleTexture();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 20), mat('#ffffff', { map: poleTex }));
    pole.position.set(-31, 2.6, 5.4); g.add(pole);
    updaters.push((t) => { poleTex.offset.y = -t * 0.5; });
    // Restaurant awning + tables
    const awning = box(g, 8, 0.25, 2.4, C.sand, -13, 3.3, 6); awning.rotation.x = 0.25;
    for (const tx of [-16, -11]) { cyl(g, 0.7, 0.7, 0.9, C.white, tx, 0.17, 7.2); cyl(g, 0.06, 0.06, 2.2, C.ink, tx, 1.07, 7.2); const u = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.7, 16), mat(C.offwhite)); u.position.set(tx, 3.47, 7.2); u.castShadow = true; g.add(u); }
    // Patient Creations tower
    const win = windowsTexture(6, 12);
    // Glass curtain wall: reflects the sky, with warm light from inside
    const winMat = mat('#ffffff', { map: win, emissiveMap: win, emissive: '#ffffff', ei: 0.45, rough: 0.12, metal: 0.5 });
    box(g, 14, 4, 12, C.white, 22, 0, -4);
    box(g, 12, 22, 10, C.ink, 22, 4, -4, { material: winMat });
    box(g, 12.4, 0.6, 10.4, C.offwhite, 22, 26, -4);
    box(g, 4.2, 26.6, 4.2, C.sand, 29, 0, 1);
    box(g, 9, 12, 9, C.ink, 10, 0, -10, { material: winMat });
    // Gold vertical fins and white floor slabs (instanced), rooftop garden and a glowing crown ring
    const finMat = mat(C.sand, { rough: 0.3, metal: 0.85 });
    const fins = new THREE.InstancedMesh(BOX, finMat, 24), slabs = new THREE.InstancedMesh(BOX, mat(C.offwhite, { rough: 0.6 }), 10);
    const fm = new THREE.Matrix4(), q0 = new THREE.Quaternion();
    for (let i = 0; i < 12; i++) { fins.setMatrixAt(i, fm.compose(new THREE.Vector3(16.5 + i, 15, 1.15), q0, new THREE.Vector3(0.14, 22, 0.5))); }
    for (let i = 0; i < 12; i++) { fins.setMatrixAt(12 + i, fm.compose(new THREE.Vector3(28.15, 15, -8.5 + i * 0.85), q0, new THREE.Vector3(0.5, 22, 0.12))); }
    for (let i = 0; i < 10; i++) slabs.setMatrixAt(i, fm.compose(new THREE.Vector3(22, 6.2 + i * 2.2, -4), q0, new THREE.Vector3(12.25, 0.14, 10.25)));
    fins.castShadow = slabs.castShadow = true; fins.receiveShadow = slabs.receiveShadow = true;
    g.add(fins, slabs);
    box(g, 11, 0.5, 9, C.sage, 22, 26.6, -4, { material: mat('#8fae84', { rough: 0.95 }) });
    for (let i = 0; i < 6; i++) trees.push({ x: base.x + 18.5 + (i % 3) * 3.4, z: base.z - 6.8 + Math.floor(i / 3) * 4.6, y: 27.1, s: 0.45 + (i % 2) * 0.15 });
    const crown = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.14, 10, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.6, 0.9), toneMapped: false }));
    crown.rotation.x = Math.PI / 2; crown.position.set(22, 28.2, -4); g.add(crown);
    updaters.push((t) => { crown.position.y = 28.2 + Math.sin(t * 0.8) * 0.25; crown.rotation.z = t * 0.2; });
    glow(g, 22, 28.2, -4, 22, '#ffd58f', 0.18);
    box(g, 0.3, 2.6, 0.3, C.ink, 18, 26.6, -1.5); box(g, 0.3, 2.6, 0.3, C.ink, 26, 26.6, -1.5);
    sign(g, 11, 2.75, wordmark, 22, 30.4, -1.2);
    // Plaza + park
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(6, 40), mat('#e6e2d6'));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(36, 0.03, 8); plaza.receiveShadow = true; g.add(plaza);
    cyl(g, 1.2, 1.4, 1.0, C.sand, 36, 0, 8);
    treeField(44, -6, 6, 12, 18); treeField(-40, -6, 6, 12, 16); treeField(-6, -16, 26, 4, 22); treeField(0, 22, 46, 5, 24);
    keepOut.push([base.x, base.z, 36]);
    hs(5, -26, 12.5, 1.5, 'Smart Business Cards', 'Tap-to-share cards: reviews, menus, socials, WiFi.');
    hs(5, 22, 28, -4, 'All-in-One Launch Bundle · $2,499', 'Website Special, 4 Cinematic Ads, 4 UGC Ads, 5 Business Cards. Save $563.');
    hs(5, -6, 7, 5, 'Built for local businesses', 'Barbers, restaurants, shops, salons, contractors & more.');
  }

  // ------------------------------------------------ fields between the scenes
  cur = new THREE.Vector3();
  for (let i = 0; i < 260; i++) {
    const t = R() * 6 - 0.5;
    const x = t * 85 + (R() * 2 - 1) * 70;
    const z = -t * 32 + (R() * 2 - 1) * 90;
    if (keepOut.some(([kx, kz, r]) => (kx - x) ** 2 + (kz - z) ** 2 < r * r)) continue;
    trees.push({ x, z, y: 0, s: 0.6 + R() * 0.8 });
  }
  for (let i = 0; i < 28; i++) {
    const t = R() * 6;
    const x = t * 85 + (R() * 2 - 1) * 80, z = -t * 32 + (R() * 2 - 1) * 90;
    if (keepOut.some(([kx, kz, r]) => (kx - x) ** 2 + (kz - z) ** 2 < (r + 8) ** 2)) continue;
    const f = new THREE.Mesh(new THREE.CircleGeometry(6 + R() * 10, 7), mat('#dfe3cf'));
    f.rotation.x = -Math.PI / 2; f.rotation.z = R() * 6; f.position.set(x, 0.02, z); f.receiveShadow = true;
    scene.add(f);
  }

  // ------------------------------------------------ life: people, birds, cloud shadows, water shimmer
  {
    const at = (i, x, z) => new THREE.Vector3(CENTERS[i].x + x, 0, CENTERS[i].z + z);
    // ---- people: tall athletic figures in tech-wear (armour plates, backpack loadout, light-lined suits,
    // glowing visors). Each figure is a skeleton of joints; all body parts are drawn as instanced meshes,
    // so the whole crowd costs ~30 draw calls no matter how many people there are.
    const crew = [];
    const SUIT = ['#2b2f36', '#e8e6e1', '#cdb184', '#4a5568', '#f2efe8', '#1f3a34', '#3b2f2a'];
    const ARMOR = ['#d9bd86', '#f4f3ef', '#3a3d42', '#c9cdd2'];
    const SKIN = ['#8d5a3b', '#c68e6a', '#e0b48f', '#a86f4c', '#f1c9a5', '#6b4430'];
    const HAIR = ['#1f1a16', '#3b2a1f', '#d8d4cc', '#c9a46a', '#2a2a2a'];
    const PART_MATS = {
      suit: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.15 }),
      armor: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.6, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
      skin: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }),
      hair: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
      gold: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.65, 0.9), toneMapped: false, side: THREE.DoubleSide }),
      cyan: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 1.9, 2.3), toneMapped: false, side: THREE.DoubleSide }),
    };
    const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
    const sph = (r, ts = Math.PI) => new THREE.SphereGeometry(r, 20, 14, 0, Math.PI * 2, 0, ts);
    const chestGeo = new THREE.CylinderGeometry(0.25, 0.165, 0.42, 18); // broad shoulders, narrow waist
    const visorGeo = new THREE.CylinderGeometry(0.121, 0.121, 0.042, 24, 1, true, -1.15, 2.3);
    const ringGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16, 1, true);
    const accentBar = new THREE.BoxGeometry(1, 1, 1);
    // [joint, geometry, material ('accent' = gold or cyan per person), local matrix]
    const PARTS = [
      ['body', rounded(0.34, 0.2, 0.22, 0.07), 'suit', M4(0, 0.02, 0)],
      ['body', cap(0.14, 0.14), 'suit', M4(0, 0.24, 0)],
      ['body', chestGeo, 'suit', M4(0, 0.5, 0, 0, 0, 0, 1, 1, 0.62)],
      ['body', rounded(0.36, 0.26, 0.08, 0.035), 'armor', M4(0, 0.53, 0.11)],
      ['body', accentBar, 'accent', M4(0, 0.47, 0.152, 0, 0, 0, 0.3, 0.018, 0.012)],
      ['body', accentBar, 'accent', M4(0, 0.3, 0.13, 0, 0, 0, 0.018, 0.2, 0.012)],
      ['body', new THREE.CylinderGeometry(0.055, 0.06, 0.1, 12), 'skin', M4(0, 0.76, 0)],
      ['body', sph(0.115), 'skin', M4(0, 0.88, 0.01, 0, 0, 0, 0.92, 1.08, 1)],
      ['body', sph(0.124, Math.PI * 0.55), 'hair', M4(0, 0.9, -0.012, -0.3, 0, 0, 0.94, 1.05, 1.02)],
      ['body', visorGeo, 'accent', M4(0, 0.893, 0.012)],
      ['body', rounded(0.3, 0.36, 0.13, 0.04), 'armor', M4(0, 0.5, -0.17)],
      ['body', accentBar, 'accent', M4(0.08, 0.5, -0.237, 0, 0, 0, 0.02, 0.26, 0.012)],
      ['body', accentBar, 'accent', M4(-0.08, 0.5, -0.237, 0, 0, 0, 0.02, 0.26, 0.012)],
      ['body', sph(0.118, Math.PI / 2), 'armor', M4(0.28, 0.68, 0, 0, 0, -0.35)],
      ['body', sph(0.118, Math.PI / 2), 'armor', M4(-0.28, 0.68, 0, 0, 0, 0.35)],
      ...['L', 'R'].flatMap((k) => [
        ['arm' + k, cap(0.055, 0.22), 'suit', M4(0, -0.17, 0)],
        ['elbow' + k, cap(0.05, 0.2), 'suit', M4(0, -0.15, 0)],
        ['elbow' + k, ringGeo, 'accent', M4(0, -0.2, 0)],
        ['elbow' + k, sph(0.05), 'skin', M4(0, -0.31, 0, 0, 0, 0, 0.8, 1.25, 0.6)],
        ['leg' + k, cap(0.085, 0.3), 'suit', M4(0, -0.22, 0)],
        ['knee' + k, sph(0.07), 'armor', M4(0, 0, 0.045, 0, 0, 0, 1, 1.2, 0.8)],
        ['knee' + k, cap(0.07, 0.3), 'suit', M4(0, -0.21, 0)],
        ['knee' + k, rounded(0.12, 0.11, 0.27, 0.04), 'armor', M4(0, -0.47, 0.04)],
        ['knee' + k, accentBar, 'accent', M4(0, -0.52, 0.04, 0, 0, 0, 0.125, 0.018, 0.275)],
      ]),
      ['root', flatPlane, 'shadow', M4(0, 0.03, 0, 0, 0, 0, 0.95, 1, 0.95)],
    ];
    function person(k, baseY = 0) {
      const root = new THREE.Object3D(); root.position.y = baseY; scene.add(root);
      const body = new THREE.Object3D(); body.position.y = 1.0; root.add(body);
      const j = { root, body };
      for (const side of ['L', 'R']) {
        const sx = side === 'L' ? 1 : -1;
        const arm = new THREE.Object3D(); arm.position.set(0.28 * sx, 0.62, 0); body.add(arm);
        const elbow = new THREE.Object3D(); elbow.position.set(0, -0.33, 0); arm.add(elbow);
        const leg = new THREE.Object3D(); leg.position.set(0.105 * sx, -0.04, 0); body.add(leg);
        const knee = new THREE.Object3D(); knee.position.set(0, -0.45, 0); leg.add(knee);
        Object.assign(j, { ['arm' + side]: arm, ['elbow' + side]: elbow, ['leg' + side]: leg, ['knee' + side]: knee });
      }
      const p = {
        g: root, body, armL: j.armL, armR: j.armR, legL: j.legL, legR: j.legR, joints: j,
        accent: k % 3 === 0 ? 'cyan' : 'gold',
        colors: { suit: SUIT[(k * 3) % SUIT.length], armor: ARMOR[(k * 5) % ARMOR.length], skin: SKIN[k % SKIN.length], hair: HAIR[(k * 7) % HAIR.length] },
      };
      crew.push(p);
      return p;
    }
    function pose(p, phase, swing) {
      const s = Math.sin(phase), c = Math.cos(phase), j = p.joints;
      j.legL.rotation.x = -s * 0.5 * swing; j.legR.rotation.x = s * 0.5 * swing;
      j.kneeL.rotation.x = Math.max(0, c) * 0.85 * swing; j.kneeR.rotation.x = Math.max(0, -c) * 0.85 * swing;
      j.armL.rotation.x = s * 0.45 * swing; j.armR.rotation.x = -s * 0.45 * swing;
      j.elbowL.rotation.x = -0.2 - Math.max(0, -s) * 0.35 * swing; j.elbowR.rotation.x = -0.2 - Math.max(0, s) * 0.35 * swing;
      j.armL.rotation.z = 0.06; j.armR.rotation.z = -0.06;
      j.body.position.y = 1.0 + Math.abs(c) * 0.04 * swing;
      j.body.rotation.y = s * 0.07 * swing;
    }
    const STRIDE = 1.6; // metres per full gait cycle
    function walker(points, speed, offset, k, baseY = 0) {
      const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.2);
      const p = person(k, baseY);
      const len = curve.getLength();
      updaters.push((t) => {
        const dist = t * speed + offset * len;
        const u = Math.min(0.999, Math.max(0, ((dist / len) % 1 + 1) % 1));
        const pt = curve.getPointAt(u), tg = curve.getTangentAt(u);
        p.g.position.set(pt.x, baseY, pt.z);
        p.g.rotation.y = Math.atan2(tg.x, tg.z);
        pose(p, (dist / STRIDE) * Math.PI * 2, 1);
      });
    }
    // Small groups standing and talking
    function idle(x, z, face, k, baseY = 0) {
      const p = person(k, baseY);
      p.g.position.set(x, baseY, z); p.g.rotation.y = face;
      updaters.push((t) => {
        pose(p, 0, 0);
        const talk = Math.max(0, Math.sin(t * 1.3 + k * 2));
        p.joints.armR.rotation.x = -0.45 - talk * 0.5;
        p.joints.elbowR.rotation.x = -0.9 - talk * 0.4;
        p.body.rotation.y = Math.sin(t * 0.7 + k) * 0.12;
      });
    }
    const chat = (i, x, z, n, k0, baseY = 0) => { for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; idle(CENTERS[i].x + x + Math.cos(a) * 0.8, CENTERS[i].z + z + Math.sin(a) * 0.8, Math.atan2(-Math.cos(a), -Math.sin(a)), k0 + j, baseY); } }; // each faces the group's centre
    chat(0, 6, 4.5, 2, 40, 0.04); chat(0, -18, 5, 3, 43, 0.04); chat(3, -14, 17, 2, 46); chat(5, -20, 6.6, 2, 48, 0.17); chat(5, 8, 6.8, 3, 50, 0.17); chat(4, -8, 3.6, 2, 53);
    const loops = [
      [[at(0, -15, 3.5), at(0, 14, 3.5), at(0, 14, 9.5), at(0, -15, 9.5)], 4],
      [[at(1, -16, -9.5), at(1, 16, -9.5), at(1, 16, 11), at(1, -16, 11)], 3],
      [[at(3, -26, 15), at(3, 8, 17), at(3, 12, 22), at(3, -24, 21)], 3],
      [[at(4, -30, 3), at(4, 10, 3), at(4, 10, 4.5), at(4, -30, 4.5)], 2],
      [[at(5, -38, 6.2), at(5, 30, 6.2), at(5, 30, 7.8), at(5, -38, 7.8)], 6],
    ];
    let k = 0;
    const loopY = [0.04, 0, 0, 0, 0.17];
    loops.forEach(([pts, n], li) => { for (let i = 0; i < n; i++, k++) walker(pts, 1.3 + (k % 3) * 0.25, i / n + R() * 0.1, k, loopY[li]); });

    // Draw the whole crew: one instanced mesh per body part, filled from each figure's joints every frame
    const parts = PARTS.flatMap(([joint, geo, kind, local]) => (kind === 'accent' ? ['gold', 'cyan'] : [kind]).map((m) => {
      const material = m === 'shadow' ? shadowMat(blobTex, 0.42) : PART_MATS[m];
      const im = new THREE.InstancedMesh(geo, material, crew.length);
      im.frustumCulled = false;
      im.castShadow = m !== 'shadow'; im.receiveShadow = m !== 'shadow' && m !== 'gold' && m !== 'cyan';
      if (m === 'shadow') im.renderOrder = 1;
      if (PART_MATS[m] && !(m === 'gold' || m === 'cyan')) crew.forEach((p, i) => im.setColorAt(i, new THREE.Color(p.colors[m])));
      scene.add(im);
      return { joint, im, local, accent: kind === 'accent' ? m : null };
    }));
    const tmpM = new THREE.Matrix4(), hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    updaters.push(() => {
      crew.forEach((p) => p.g.updateMatrixWorld(true));
      for (const part of parts) {
        crew.forEach((p, i) => {
          if (part.accent && part.accent !== p.accent) part.im.setMatrixAt(i, hidden);
          else part.im.setMatrixAt(i, tmpM.multiplyMatrices(p.joints[part.joint].matrixWorld, part.local));
        });
        part.im.instanceMatrix.needsUpdate = true;
      }
    });

    // Bird flocks
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.22, 0, 0, 0.22, 0.8, 0, 0], 3));
    wingGeo.computeVertexNormals();
    const wingMat = mat('#7d7b72', { side: THREE.DoubleSide });
    for (let f = 0; f < 4; f++) {
      const c = CENTERS[[0, 2, 3, 5][f]];
      for (let b = 0; b < 6; b++) {
        const bird = new THREE.Group();
        const l = new THREE.Mesh(wingGeo, wingMat), r = new THREE.Mesh(wingGeo, wingMat);
        r.scale.x = -1; bird.add(l, r); scene.add(bird);
        const ox = (b % 3) * 1.6 - 1.6, oz = Math.floor(b / 3) * 1.8 + Math.abs(ox) * 0.6;
        updaters.push((t) => {
          const a = t * 0.12 + f * 1.9;
          const R0 = 34 + f * 4;
          const cx = c.x + Math.cos(a) * R0, cz = c.z + Math.sin(a) * R0;
          const dir = a + Math.PI / 2;
          bird.position.set(cx + Math.cos(dir) * -oz + Math.sin(dir) * ox, 30 + f * 2 + Math.sin(t * 0.8 + b) * 0.6, cz + Math.sin(dir) * -oz - Math.cos(dir) * ox);
          bird.rotation.y = -dir + Math.PI / 2;
          const flap = Math.sin(t * 9 + b * 0.9) * 0.55;
          l.rotation.z = flap; r.rotation.z = -flap;
        });
      }
    }

    // Drifting cloud shadows
    const cloudTex = tex(256, 256, (g) => {
      const r2 = rng(11);
      for (let i = 0; i < 7; i++) {
        const x = 128 + (r2() - 0.5) * 110, y = 128 + (r2() - 0.5) * 70, rad = 40 + r2() * 50;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      }
    });
    const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.16, depthWrite: false, color: '#3a3626' });
    for (let i = 0; i < 12; i++) {
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(90 + R() * 60, 70 + R() * 40), cloudMat);
      cl.rotation.x = -Math.PI / 2; cl.renderOrder = 1;
      scene.add(cl);
      const x0 = R() * 620 - 80, z0 = -R() * 260 + 60, sp = 2.2 + R() * 1.5;
      updaters.push((t) => {
        const x = ((x0 + t * sp) % 640 + 640) % 640 - 100;
        cl.position.set(x, 0.25, z0 - (x - x0) * 0.1); // above every street layer (max 0.2) so it never z-fights
      });
    }

    // Water shimmer
    const shimmer = tex(256, 256, (g) => {
      const r2 = rng(5);
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2; g.lineCap = 'round';
      for (let i = 0; i < 70; i++) { const x = r2() * 256, y = r2() * 256, l = 6 + r2() * 18; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke(); }
    });
    shimmer.wrapS = shimmer.wrapT = THREE.RepeatWrapping; shimmer.repeat.set(8, 3);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(70, 26), new THREE.MeshBasicMaterial({ map: shimmer, transparent: true, opacity: 0.55, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(CENTERS[3].x - 6, 0.1, CENTERS[3].z - 24 + 13);
    scene.add(sh);
    updaters.push((t) => { shimmer.offset.set(t * 0.02, Math.sin(t * 0.5) * 0.02); sh.material.opacity = 0.4 + Math.sin(t * 1.7) * 0.15; });
  }

  // ------------------------------------------------ ambient occlusion under everything that stands on the ground
  {
    const standing = [];
    scene.traverse((m) => {
      if (!m.isMesh || m.geometry !== BOX) return;
      const base = m.position.y - m.scale.y / 2;
      if (m.scale.y > 0.8 && m.scale.x * m.scale.z > 1.2 && base > -0.1 && base < 0.5) standing.push(m);
    });
    for (const m of standing) {
      const k = Math.min(1, m.scale.y / 8);
      const ao = contactShadow(m.parent, m.position.x, m.position.z, m.scale.x * 1.18 + 1.4 + k * 1.5, m.scale.z * 1.18 + 1.4 + k * 1.5, 0.22 + 0.2 * k, m.position.y - m.scale.y / 2 + 0.045, aoTex);
      ao.rotation.y = m.rotation.y;
    }
  }

  // ------------------------------------------------ instanced trees: two-lobed rounded crowns, colour variation, contact shadows
  {
    const crown = new THREE.IcosahedronGeometry(1, 1);
    const trunk = new THREE.CylinderGeometry(0.11, 0.17, 1, 8);
    const leafMat = mat('#ffffff', { flat: true, rough: 1 });
    leafMat.envMapIntensity = 0.2; // foliage shouldn't pick up studio reflections
    const crowns = new THREE.InstancedMesh(crown, leafMat, trees.length);
    const tops = new THREE.InstancedMesh(crown, leafMat, trees.length);
    const trunks = new THREE.InstancedMesh(trunk, mat('#7d6a52', { rough: 0.95 }), trees.length);
    const blobs = new THREE.InstancedMesh(flatPlane, shadowMat(blobTex, 0.32), trees.length);
    blobs.renderOrder = 1;
    const q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), hsl = {};
    const m = new THREE.Matrix4(), one = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3();
    trees.forEach((tr, i) => {
      const s = tr.s;
      e.set((R() - 0.5) * 0.3, R() * 6, (R() - 0.5) * 0.3); q.setFromEuler(e);
      m.compose(v3.set(tr.x, tr.y + 2.15 * s, tr.z), q, sc3.set(1.15 * s, 1.35 * s, 1.15 * s));
      crowns.setMatrixAt(i, m);
      const ox = (R() - 0.5) * 0.5 * s, oz = (R() - 0.5) * 0.5 * s;
      m.compose(v3.set(tr.x + ox, tr.y + 3.25 * s, tr.z + oz), q, sc3.set(0.72 * s, 0.85 * s, 0.72 * s));
      tops.setMatrixAt(i, m);
      col.set(C.trees[i % C.trees.length]).getHSL(hsl);
      col.setHSL(hsl.h + (R() - 0.5) * 0.04, hsl.s * (0.85 + R() * 0.3), hsl.l * (0.9 + R() * 0.2));
      crowns.setColorAt(i, col);
      tops.setColorAt(i, col.offsetHSL(0, 0, 0.05));
      m.compose(v3.set(tr.x, tr.y + 0.65 * s, tr.z), one, sc3.set(s, 1.3 * s, s));
      trunks.setMatrixAt(i, m);
      // flat blobs only on flat ground; on the hills they'd cut into the slope
      const bs = tr.y > 0.15 ? 1e-4 : 2.6 * s;
      m.compose(v3.set(tr.x, tr.y + 0.04, tr.z), one, sc3.set(bs, 1, bs));
      blobs.setMatrixAt(i, m);
    });
    crowns.castShadow = tops.castShadow = trunks.castShadow = true;
    crowns.receiveShadow = tops.receiveShadow = true;
    scene.add(blobs, crowns, tops, trunks);
  }

  // ------------------------------------------------ camera path
  const KEYS = [
    { c: 0, off: [3, 0, -2], dist: 132, az: -38, el: 30 },
    { c: 1, off: [2, 0, 0], dist: 112, az: -28, el: 44 },
    { c: 2, off: [0, 0, 0], dist: 170, az: -26, el: 38 },
    { c: 3, off: [9, 0, -1], dist: 150, az: -34, el: 32 },
    { c: 4, off: [0, 0, -2], dist: 138, az: -36, el: 30 },
    { c: 5, off: [6, 6, -3], dist: 150, az: -30, el: 26 },
    { c: 5, off: [6, 4, -3], dist: 270, az: -22, el: 40 },
  ].map((k) => ({ ...k, target: CENTERS[k.c].clone().add(new THREE.Vector3(...k.off)) }));
  const STOPS = KEYS.length - 1;

  const target = new THREE.Vector3(), snapped = new THREE.Vector3();
  const LIGHT_FWD = SUN_OFFSET.clone().negate().normalize();
  const LIGHT_RIGHT = new THREE.Vector3().crossVectors(LIGHT_FWD, new THREE.Vector3(0, 1, 0)).normalize();
  const LIGHT_UP = new THREE.Vector3().crossVectors(LIGHT_RIGHT, LIGHT_FWD).normalize();
  const state = { f: 0, time: 0, distScale: 1, dist: 120, w: 1, h: 1, shiftX: 0, shiftY: 0 };
  function setProgress(f) {
    f = Math.min(STOPS, Math.max(0, f));
    state.f = f;
    const i = Math.min(STOPS - 1, Math.floor(f));
    // Hold on each scene, then glide to the next
    const t = smooth(clamp01((f - i - 0.18) / 0.64));
    const a = KEYS[i], b = KEYS[i + 1];
    target.lerpVectors(a.target, b.target, t);
    // Pull back a little mid-flight for a sense of travel
    const lift = Math.sin(t * Math.PI) * (i + 1 === STOPS ? 0 : 0.22);
    const dist = lerp(a.dist, b.dist, t) * (1 + lift) * state.distScale;
    // Slow idle drift so the world never feels frozen
    const az = THREE.MathUtils.degToRad(lerp(a.az, b.az, t) + Math.sin(state.time * 0.23) * 1.8);
    const el = THREE.MathUtils.degToRad(lerp(a.el, b.el, t) + lift * 10 + Math.sin(state.time * 0.31) * 0.9);
    camera.position.set(
      target.x + dist * Math.cos(el) * Math.sin(az),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(target);
    state.dist = dist;
    scene.fog.near = dist * 0.75;
    scene.fog.far = dist * 2.6;
    // Tight depth range around the subject: far better depth precision, so thin layers (roads, pads, decals) don't shimmer
    camera.near = Math.max(1, dist * 0.3);
    camera.far = dist * 3.2;
    camera.updateProjectionMatrix();
    // Shadow frustum: quantised size and texel-snapped position, so shadow edges stay still while the camera glides
    const span = Math.min(260, Math.max(60, Math.ceil(dist * 0.5 / 15) * 15));
    const texel = (2 * span) / SHADOW_SIZE;
    const tr = target.dot(LIGHT_RIGHT), tu = target.dot(LIGHT_UP);
    snapped.copy(target)
      .addScaledVector(LIGHT_RIGHT, Math.round(tr / texel) * texel - tr)
      .addScaledVector(LIGHT_UP, Math.round(tu / texel) * texel - tu);
    sun.position.copy(snapped).add(SUN_OFFSET);
    sun.target.position.copy(snapped);
    if (sc.right !== span) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); }
  }

  function resize(w, h, { shiftX = 0, shiftY = 0 } = {}) {
    state.w = w; state.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait screens need the camera further back to fit the same scene
    state.distScale = w / h < 1 ? Math.min(2.1, 1.05 / (w / h) ** 0.85) : w / h < 1.3 ? 1.12 : 1;
    if (shiftX || shiftY) camera.setViewOffset(w, h, -shiftX, shiftY, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    setProgress(state.f);
  }

  function update(time) { state.time = time; for (const u of updaters) u(time); }
  // Render resolution multiplier; main.js raises it up to a 4K pixel budget and lowers it if frames run slow
  function setPixelRatio(pr) {
    if (Math.abs(renderer.getPixelRatio() - pr) < 0.01) return;
    renderer.setPixelRatio(pr);
    renderer.setSize(state.w, state.h, false);
  }
  function render() { renderer.render(scene, camera); }

  const v = new THREE.Vector3();
  function project(p) {
    v.copy(p).project(camera);
    return { x: (v.x * 0.5 + 0.5) * state.w, y: (-v.y * 0.5 + 0.5) * state.h, behind: v.z > 1 };
  }

  const stats = () => {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, renderPx: `${size.x}×${size.y}`, pixelRatio: +renderer.getPixelRatio().toFixed(2), shadowMap: SHADOW_SIZE };
  };

  return { setProgress, resize, update, render, project, stats, setPixelRatio, hotspots, stops: STOPS, renderer };
}

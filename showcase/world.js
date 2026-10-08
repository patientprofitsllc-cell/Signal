// Patient Creations: scroll-driven isometric world.
// Everything is built from primitives and canvas textures, so there are no model files to load.
import * as THREE from './vendor/three.module.min.js';

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
  trees: ['#6f9a86', '#5d8a77', '#86a993', '#7aa08a'],
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
  const key = color + JSON.stringify(o, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (o.basic) m = new THREE.MeshBasicMaterial({ color, map: o.map || null, transparent: !!o.transparent, side: o.side || THREE.FrontSide, toneMapped: false });
  else m = new THREE.MeshLambertMaterial({
    color, map: o.map || null, flatShading: !!o.flat, side: o.side || THREE.FrontSide,
    emissive: o.emissive || '#000000', emissiveMap: o.emissiveMap || null, emissiveIntensity: o.ei ?? 1,
    vertexColors: !!o.vc, transparent: !!o.transparent, opacity: o.opacity ?? 1,
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
function tex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
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
function labelTexture(text, { bg = '#1a1a16', fg = '#ecebe4', font = F.sans(600, 80), w = 1024, h = 192 } = {}) {
  return tex(w, h, (g) => {
    g.fillStyle = bg; rr(g, 0, 0, w, h, 24); g.fill();
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.ground);
  scene.fog = new THREE.Fog(C.ground, 200, 600);

  const camera = new THREE.PerspectiveCamera(22, 1, 1, 3000);

  const hemi = new THREE.HemisphereLight('#ffffff', '#d8d2c2', 2.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff8ee', 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const SUN_OFFSET = new THREE.Vector3(-60, 120, 70);

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

  // Branded van: cargo box + cab + sand stripe + wordmark decal
  const decalMat = mat('#ffffff', { map: wordmark });
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  function van(parent, x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry;
    box(g, 2.3, 2.4, 4.0, C.white, 0, 0.45, -0.7);
    box(g, 2.3, 1.55, 1.5, C.white, 0, 0.45, 2.0);
    box(g, 2.32, 0.32, 4.02, C.sand, 0, 1.25, -0.7);
    box(g, 1.95, 0.7, 0.06, C.glass, 0, 1.15, 2.76, { cast: false });
    plane(g, 2.6, 0.65, decalMat, 1.17, 2.15, -0.7, Math.PI / 2);
    plane(g, 2.6, 0.65, decalMat, -1.17, 2.15, -0.7, -Math.PI / 2);
    for (const [wx, wz] of [[1.05, 1.9], [-1.05, 1.9], [1.05, -1.8], [-1.05, -1.8]]) {
      const w = new THREE.Mesh(wheelGeo, mat(C.ink)); w.position.set(wx, 0.45, wz); g.add(w);
    }
    parent.add(g);
    return g;
  }
  function road(parent, x, z, len, w, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    box(g, len, 0.05, w, C.road, 0, 0, 0, { cast: false });
    for (let i = -len / 2 + 2; i < len / 2 - 2; i += 5) box(g, 2.2, 0.06, 0.25, '#f7f6f1', i, 0, 0, { cast: false });
    parent.add(g);
    return g;
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
    road(g, 0, 15, 150, 7);
    box(g, 44, 0.04, 10, C.pad, 2, 0, 6.5, { cast: false });
    box(g, 30, 8, 14, C.white, 2, 0, -6);
    box(g, 5, 8.6, 14.4, C.sand, 19.5, 0, -6);
    box(g, 30.1, 0.5, 14.1, C.offwhite, 2, 8, -6);
    for (let i = 0; i < 6; i++) {
      box(g, 3, 4, 0.2, '#3b3c36', -10 + i * 4.6, 0, 1.05);
      box(g, 3.4, 0.25, 0.6, C.sand, -10 + i * 4.6, 4.1, 1.2, { cast: false });
    }
    for (let r = 0; r < 3; r++) box(g, 24, 0.7, 1.4, '#cfd5d4', 1, 8.5, -11 + r * 4);
    // Rooftop sign
    const sign = plane(g, 12, 3, mat('#ffffff', { map: wordmark }), 2, 10.6, -0.2);
    sign.castShadow = true;
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
    const v1 = van(g, 0, 13.3, -Math.PI / 2), v2 = van(g, 0, 16.7, Math.PI / 2);
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
    const height = (x, z) => Math.max(0, hRaw(x, z)) * fall(x, z);
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
        verts.push(x, height(x, z) + 0.12, z);
      }
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    rg.setIndex(idx); rg.computeVertexNormals();
    const roadMesh = new THREE.Mesh(rg, mat('#f6f4ee', { side: THREE.DoubleSide }));
    roadMesh.receiveShadow = true;
    g.add(roadMesh);
    // Car travelling the road
    const car = new THREE.Group();
    box(car, 1.6, 0.8, 3, C.white, 0, 0.3, 0); box(car, 1.4, 0.6, 1.6, C.sand, 0, 1.1, -0.2);
    g.add(car);
    const up = new THREE.Vector3();
    updaters.push((t) => {
      const u = (t * 0.03) % 1;
      const p = curve.getPointAt(u), tg = curve.getTangentAt(u);
      car.position.set(p.x, height(p.x, p.z) + 0.1, p.z);
      up.set(p.x + tg.x, 0, p.z + tg.z);
      car.lookAt(up.x, car.position.y, up.z);
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
      hs(2, p.x + 2.2, y + 6.4, p.z, steps[i][0], steps[i][1]);
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
      plane(g, 2.4, 1.2, mat('#ffffff', { map: labelTexture('STAGE ' + n, { w: 512, h: 256, font: F.sans(600, 90) }) }), x, 7.2, z + 4.4, 0, -0.35);
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
        box(car, 5.4, 2.4, 2.4, C.sand, 0, 0.4, 0);
        box(car, 1.6, 1.0, 2.42, C.glass, 1.6, 1.6, 0, { cast: false });
      } else {
        box(car, 5, 1.0, 2.3, C.white, 0, 0.4, 0);
        for (let k = 0; k < 3; k++) box(car, 1.2, 0.8, 1.6, k === 1 ? C.sand : '#f7f3ea', -1.6 + k * 1.6, 1.4, 0);
      }
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
    plane(g, 8, 1.5, mat('#ffffff', { map: labelTexture('LEAD ENGINE') }), 12, 8.6, 0.1);
    // Conduit with travelling packets
    box(g, 30, 0.35, 0.35, '#cfcabd', -3, 6.5, -2);
    const packets = [];
    for (let i = 0; i < 8; i++) { packets.push(box(g, 0.7, 0.5, 0.5, C.sand, 0, 6.8, -2)); }
    updaters.push((t) => packets.forEach((p, i) => { p.position.x = -18 + ((t * 5 + i * 3.75) % 30); }));
    cyl(g, 0.25, 0.25, 6.5, '#cfcabd', -17.6, 0, -2); cyl(g, 0.25, 0.25, 6.5, '#cfcabd', 11.6, 0, -2);
    // Payment kiosk
    box(g, 1.8, 2.8, 1.2, C.ink, -3, 0, 2);
    plane(g, 1.3, 0.9, mat('#ffffff', { basic: true, map: labelTexture('PAID ✓', { bg: '#141412', fg: '#dbb77e', w: 512, h: 352, font: F.sans(600, 96) }) }), -3, 2.2, 2.61);
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
    road(g, 0, 12, 100, 7);
    box(g, 70, 0.12, 3.4, '#f4f2ec', -4, 0, 7, { cast: false });
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
      plane(g, 7, 1.3, mat('#ffffff', { map: labelTexture(s.label, { bg: s.bg, fg: s.fg }) }), s.x, 4.4, 5.12);
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
    for (const tx of [-16, -11]) { cyl(g, 0.7, 0.7, 0.9, C.white, tx, 0, 7.4); cyl(g, 0.06, 0.06, 2.2, C.ink, tx, 0.9, 7.4); const u = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.7, 12), mat(C.offwhite)); u.position.set(tx, 3.3, 7.4); u.castShadow = true; g.add(u); }
    // Patient Creations tower
    const win = windowsTexture(6, 12);
    const winMat = mat('#ffffff', { map: win, emissiveMap: win, emissive: '#ffffff', ei: 0.55 });
    box(g, 14, 4, 12, C.white, 22, 0, -4);
    box(g, 12, 22, 10, C.ink, 22, 4, -4, { material: winMat });
    box(g, 12.4, 0.6, 10.4, C.offwhite, 22, 26, -4);
    box(g, 4.2, 26.6, 4.2, C.sand, 29, 0, 1);
    box(g, 9, 12, 9, C.ink, 10, 0, -10, { material: winMat });
    box(g, 0.3, 2.6, 0.3, C.ink, 18, 26.6, -1.5); box(g, 0.3, 2.6, 0.3, C.ink, 26, 26.6, -1.5);
    plane(g, 11, 2.75, mat('#ffffff', { map: wordmark }), 22, 30.4, -1.2);
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
    const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.85, 4, 10);
    const headGeo = new THREE.SphereGeometry(0.24, 14, 10);
    const shirts = [C.white, C.sand, C.inkSoft, '#8fa58f', '#c9a77a', '#e9e4d8'];
    function walker(points, speed, offset, k) {
      const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.2);
      const p = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, mat(shirts[k % shirts.length])); body.position.y = 0.95; body.castShadow = true;
      const head = new THREE.Mesh(headGeo, mat('#c79a7c')); head.position.y = 1.78; head.castShadow = true;
      p.add(body, head); scene.add(p);
      const len = curve.getLength();
      updaters.push((t) => {
        const u = (((t * speed) / len + offset) % 1 + 1) % 1;
        const pt = curve.getPointAt(u), tg = curve.getTangentAt(u);
        const step = Math.abs(Math.sin(t * speed * 2.6 + k));
        p.position.set(pt.x, step * 0.12, pt.z);
        p.rotation.y = Math.atan2(tg.x, tg.z);
        body.rotation.z = Math.sin(t * speed * 2.6 + k) * 0.06;
      });
    }
    const loops = [
      [[at(0, -15, 3.5), at(0, 14, 3.5), at(0, 14, 9.5), at(0, -15, 9.5)], 4],
      [[at(1, -16, -9.5), at(1, 16, -9.5), at(1, 16, 11), at(1, -16, 11)], 3],
      [[at(3, -26, 15), at(3, 8, 17), at(3, 12, 22), at(3, -24, 21)], 3],
      [[at(4, -30, 3), at(4, 10, 3), at(4, 10, 4.5), at(4, -30, 4.5)], 2],
      [[at(5, -38, 6.2), at(5, 30, 6.2), at(5, 30, 7.8), at(5, -38, 7.8)], 6],
    ];
    let k = 0;
    loops.forEach(([pts, n]) => { for (let i = 0; i < n; i++, k++) walker(pts, 1.3 + (k % 3) * 0.25, i / n + R() * 0.1, k); });

    // Bird flocks
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.35, 0, 0, 0.35, 1.3, 0, 0], 3));
    wingGeo.computeVertexNormals();
    const wingMat = mat(C.inkSoft, { side: THREE.DoubleSide });
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
          bird.position.set(cx + Math.cos(dir) * -oz + Math.sin(dir) * ox, 24 + f * 2 + Math.sin(t * 0.8 + b) * 0.6, cz + Math.sin(dir) * -oz - Math.cos(dir) * ox);
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
        cl.position.set(x, 0.12, z0 - (x - x0) * 0.1);
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

  // ------------------------------------------------ instanced trees
  {
    const crown = new THREE.IcosahedronGeometry(1, 0);
    const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1, 6);
    const crowns = new THREE.InstancedMesh(crown, mat('#ffffff', { flat: true }), trees.length);
    const trunks = new THREE.InstancedMesh(trunk, mat('#8b7a63'), trees.length);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const m = new THREE.Matrix4();
    trees.forEach((tr, i) => {
      const s = tr.s;
      e.set(0, R() * 6, 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(tr.x, tr.y + 1.3 * s + 1.1 * s, tr.z), q, new THREE.Vector3(1.1 * s, 1.6 * s, 1.1 * s));
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, col.set(C.trees[i % C.trees.length]));
      m.compose(new THREE.Vector3(tr.x, tr.y + 0.65 * s, tr.z), new THREE.Quaternion(), new THREE.Vector3(s, 1.3 * s, s));
      trunks.setMatrixAt(i, m);
    });
    crowns.castShadow = trunks.castShadow = true;
    crowns.receiveShadow = true;
    scene.add(crowns, trunks);
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

  const target = new THREE.Vector3();
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
    sun.position.copy(target).add(SUN_OFFSET);
    sun.target.position.copy(target);
    const span = Math.min(260, Math.max(75, dist * 0.55));
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix();
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
  function render() { renderer.render(scene, camera); }

  const v = new THREE.Vector3();
  function project(p) {
    v.copy(p).project(camera);
    return { x: (v.x * 0.5 + 0.5) * state.w, y: (-v.y * 0.5 + 0.5) * state.h, behind: v.z > 1 };
  }

  return { setProgress, resize, update, render, project, hotspots, stops: STOPS, renderer };
}

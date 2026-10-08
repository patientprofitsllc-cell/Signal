// Photoreal-ish desk scene for the promo reel: a phone filming an all-in-one monitor that shows the live site.
// Everything is driven by renderFrame(t, screenImage) so the renderer can capture frames deterministically.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from '../vendor/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { BokehPass } from '../vendor/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';

const W = 720, H = 1280;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Smooth pseudo-noise from summed sines (deterministic, no state)
const wob = (t, s) => Math.sin(t * 1.13 + s) * 0.5 + Math.sin(t * 2.71 + s * 1.7) * 0.3 + Math.sin(t * 5.3 + s * 2.3) * 0.2;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createRoom(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a2622');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(60, W / H, 0.03, 30);
  const updaters = [];
  const R = rng(9);

  // ------------------------------------------------------------ materials
  const terrazzo = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#bdb3a2'; g.fillRect(0, 0, w, h);
    const r = rng(4);
    for (let i = 0; i < 9000; i++) {
      const c = r();
      g.fillStyle = c < 0.5 ? `rgba(120,108,92,${0.15 + r() * 0.35})` : c < 0.8 ? `rgba(250,248,242,${0.4 + r() * 0.5})` : `rgba(170,150,120,${0.3 + r() * 0.4})`;
      const s = 0.8 + r() * (c > 0.97 ? 7 : 2.4);
      g.beginPath(); g.ellipse(r() * w, r() * h, s, s * (0.5 + r() * 0.6), r() * 3, 0, 7); g.fill();
    }
  });
  terrazzo.wrapS = terrazzo.wrapT = THREE.RepeatWrapping; terrazzo.repeat.set(3, 1.4);
  const deskMat = new THREE.MeshPhysicalMaterial({ map: terrazzo, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.25 });
  const alu = new THREE.MeshPhysicalMaterial({ color: '#e2e4e2', metalness: 0.35, roughness: 0.38 });
  const bezel = new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.25 });
  const whitePlastic = new THREE.MeshPhysicalMaterial({ color: '#ecebe7', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const wallMat = new THREE.MeshStandardMaterial({ color: '#bdb7ac', roughness: 0.95 });

  // ------------------------------------------------------------ room shell
  const desk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.04, 1.4), deskMat);
  desk.position.set(0, 0.72, -0.12); desk.receiveShadow = true; scene.add(desk);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: '#8f8577', roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // Back wall with a window opening (four slabs around the hole)
  const WZ = -1.75, WX0 = -1.75, WX1 = 0.55, WY0 = 0.95, WY1 = 2.75;
  const slab = (x0, x1, y0, y1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, 0.12), wallMat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, WZ); m.receiveShadow = true; scene.add(m);
  };
  slab(-4, WX0, 0, 3.4); slab(WX1, 4, 0, 3.4); slab(WX0, WX1, 0, WY0); slab(WX0, WX1, WY1, 3.4);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshStandardMaterial({ color: '#d8d3ca', roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 2.9, 0); scene.add(ceiling);

  // Bright exterior seen through the window: sky, blurred trees, a neighbouring house
  const outside = canvasTex(1024, 768, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#f3f6f7'); sky.addColorStop(0.55, '#e6ecea'); sky.addColorStop(1, '#c7cfc4');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.filter = 'blur(18px)';
    const r = rng(12);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(126,148,112,0.75)' : 'rgba(92,116,88,0.7)';
      g.beginPath(); g.arc(r() * w, h * (0.45 + r() * 0.5), 40 + r() * 90, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(236,232,224,0.9)'; g.fillRect(w * 0.62, h * 0.48, w * 0.3, h * 0.3);
    g.fillStyle = 'rgba(170,160,150,0.8)'; g.fillRect(w * 0.6, h * 0.44, w * 0.34, h * 0.05);
  });
  const outsideMat = new THREE.MeshBasicMaterial({ map: outside, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) });
  const outsidePlane = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 3.6), outsideMat);
  outsidePlane.position.set(-0.6, 1.85, WZ - 1.6); scene.add(outsidePlane);
  // Window frame + mullions
  const frameMat = new THREE.MeshStandardMaterial({ color: '#6d6a64', roughness: 0.6, metalness: 0.3 });
  for (const x of [WX0 + 0.03, -0.98, -0.22, WX1 - 0.03]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, WY1 - WY0, 0.08), frameMat); m.position.set(x, (WY0 + WY1) / 2, WZ + 0.02); scene.add(m); }
  for (const y of [WY0 + 0.03, 1.95, WY1 - 0.03]) { const m = new THREE.Mesh(new THREE.BoxGeometry(WX1 - WX0, 0.05, 0.08), frameMat); m.position.set((WX0 + WX1) / 2, y, WZ + 0.02); scene.add(m); }

  // ------------------------------------------------------------ curtains (vertex-animated cloth)
  function curtain(x, width, color, opacity, pleats, amp, seed, emissive) {
    const geo = new THREE.PlaneGeometry(width, 2.8, Math.round(width * 70), 24);
    const base = geo.attributes.position.array.slice();
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.9, side: THREE.DoubleSide, transparent: opacity < 1, opacity,
      emissive: emissive || '#000000', emissiveIntensity: emissive ? 0.55 : 0, depthWrite: opacity >= 1,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 1.48, WZ + 0.12); m.castShadow = opacity >= 1; m.receiveShadow = true;
    scene.add(m);
    const pos = geo.attributes.position;
    updaters.push((t) => {
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1];
        const hang = clamp01((1.4 - by) / 2.8); // 0 at the rail, 1 at the hem
        const breeze = Math.sin(t * 0.9 + bx * 2.2 + seed) * 0.5 + Math.sin(t * 1.7 + bx * 4.1 + seed) * 0.3;
        pos.setZ(i, Math.sin(bx * pleats) * amp * (0.8 + 0.2 * hang) + breeze * 0.05 * hang * hang);
        pos.setX(i, bx + Math.sin(t * 0.7 + seed) * 0.015 * hang);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    });
  }
  curtain(-1.2, 0.95, '#f6f4ef', 0.6, 38, 0.025, 1, '#fffaf0');
  curtain(-0.35, 0.95, '#f6f4ef', 0.55, 42, 0.022, 2.3, '#fffaf0');
  curtain(1.05, 1.15, '#4d3f35', 1, 26, 0.05, 4.1);
  curtain(-2.1, 0.6, '#4d3f35', 1, 26, 0.05, 5.7);

  // ------------------------------------------------------------ lights
  scene.add(new THREE.HemisphereLight('#f4efe6', '#5b5248', 0.32));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
  sun.position.set(-1.6, 3.2, -4.2); sun.target.position.set(0.1, 0.72, 0.1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 1, far: 9 });
  sun.shadow.bias = -0.0004; sun.shadow.radius = 6;
  scene.add(sun, sun.target);
  const windowLight = new THREE.RectAreaLight('#eef3f4', 3.2, WX1 - WX0, WY1 - WY0);
  windowLight.position.set((WX0 + WX1) / 2, (WY0 + WY1) / 2, WZ + 0.2); windowLight.lookAt((WX0 + WX1) / 2, (WY0 + WY1) / 2, 2);
  scene.add(windowLight);
  const lampLight = new THREE.PointLight('#ffd7a0', 0.5, 4, 2);
  lampLight.position.set(0.05, 2.25, -0.55); scene.add(lampLight);

  // God rays: additive gradient sheets falling from the window across the desk
  const rayTex = canvasTex(64, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,248,232,0.9)'); grd.addColorStop(1, 'rgba(255,248,232,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.5, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, w, h);
  });
  const rays = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22 + R() * 0.25, 2.6), new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(-1.35 + i * 0.32, 1.7, -1.05);
    m.rotation.set(-0.62, 0.18, 0.12);
    scene.add(m); rays.push(m);
  }

  // ------------------------------------------------------------ dust in the light
  const DUST = 520;
  const dustGeo = new THREE.BufferGeometry();
  const dustBase = new Float32Array(DUST * 3), dustPos = new Float32Array(DUST * 3), dustCol = new Float32Array(DUST * 3), dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dustBase.set([-1.6 + R() * 2.4, 0.8 + R() * 1.8, -1.6 + R() * 1.6], i * 3);
    dustSeed[i] = R() * 100;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dotTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.006, map: dotTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(dust);
  updaters.push((t) => {
    for (let i = 0; i < DUST; i++) {
      const s = dustSeed[i];
      const x = dustBase[i * 3] + Math.sin(t * 0.21 + s) * 0.06 + t * 0.006;
      const y = dustBase[i * 3 + 1] + Math.sin(t * 0.17 + s * 1.3) * 0.05 - t * 0.004;
      const z = dustBase[i * 3 + 2] + Math.cos(t * 0.19 + s * 0.7) * 0.06;
      dustPos.set([x, y, z], i * 3);
      // Bright only inside the beam that slants from the window down toward the desk
      const d = y - (0.8 - z * 0.9);
      const beam = Math.exp(-d * d * 12) * clamp01((0.4 - x) * 2);
      const tw = 0.45 + 0.55 * Math.sin(t * 3 + s * 7) ** 2;
      const v = 0.08 + beam * tw * 0.9;
      dustCol.set([v, v * 0.96, v * 0.9], i * 3);
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.color.needsUpdate = true;
  });

  // ------------------------------------------------------------ pendant lamp
  const shade = new THREE.Mesh(new THREE.SphereGeometry(0.2, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8e0d2', roughness: 0.6, side: THREE.DoubleSide }));
  shade.position.set(0.05, 2.3, -0.55); scene.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6), toneMapped: false }));
  bulb.position.set(0.05, 2.28, -0.55); scene.add(bulb);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6), new THREE.MeshStandardMaterial({ color: '#333' }));
  cord.position.set(0.05, 2.8, -0.55); scene.add(cord);
  updaters.push((t) => { shade.rotation.z = Math.sin(t * 0.6) * 0.01; });

  // ------------------------------------------------------------ the monitor
  const SCREEN_W = 0.52, SCREEN_H = 0.2925;
  const mon = new THREE.Group(); mon.position.set(0, 0.74, -0.32); scene.add(mon);
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.547, 0.461, 0.0115, 4, 0.012), alu);
  body.position.set(0, 0.105 + 0.2305, 0); body.castShadow = true; mon.add(body);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.545, 0.33), bezel);
  front.position.set(0, 0.105 + 0.461 - 0.165 - 0.001, 0.0059); mon.add(front);
  const screenCanvas = document.createElement('canvas'); screenCanvas.width = 1440; screenCanvas.height = 810;
  const sctx = screenCanvas.getContext('2d');
  sctx.fillStyle = '#f2f1ec'; sctx.fillRect(0, 0, 1440, 810);
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.anisotropy = 16;
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, color: new THREE.Color(1.05, 1.05, 1.05) });
  const SCREEN_Y = 0.105 + 0.461 - 0.012 - SCREEN_H / 2;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat);
  screen.position.set(0, SCREEN_Y, 0.0062); mon.add(screen);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.545, 0.33), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 1.4 }));
  glass.position.set(0, front.position.y, 0.0068); mon.add(glass);
  const camDot = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 12), new THREE.MeshBasicMaterial({ color: '#222' }));
  camDot.position.set(0, 0.105 + 0.461 - 0.006, 0.0065); mon.add(camDot);
  const neck = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.17, 0.006, 2, 0.002), alu);
  neck.position.set(0, 0.09, -0.04); neck.rotation.x = -0.32; neck.castShadow = true; mon.add(neck);
  const foot = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.005, 0.15, 2, 0.002), alu);
  foot.position.set(0, 0.003, -0.07); foot.castShadow = true; foot.receiveShadow = true; mon.add(foot);
  const screenLight = new THREE.RectAreaLight('#ffffff', 4, SCREEN_W, SCREEN_H);
  screenLight.position.set(0, 0.74 + SCREEN_Y, -0.30); screenLight.lookAt(0, 0.74 + SCREEN_Y, 2);
  scene.add(screenLight);
  const SCREEN_WORLD = new THREE.Vector3(0, 0.74 + SCREEN_Y, -0.31);

  // ------------------------------------------------------------ keyboard + mouse
  const kb = new THREE.Group(); kb.position.set(-0.02, 0.74, -0.03); kb.rotation.y = 0.025; scene.add(kb);
  const kbBase = new THREE.Mesh(new RoundedBoxGeometry(0.279, 0.007, 0.115, 3, 0.003), new THREE.MeshPhysicalMaterial({ color: '#b9bcba', metalness: 0.5, roughness: 0.35 }));
  kbBase.position.y = 0.0035; kbBase.castShadow = kbBase.receiveShadow = true; kb.add(kbBase);
  const keyGeo = new RoundedBoxGeometry(0.0158, 0.004, 0.0158, 2, 0.0015);
  const keys = new THREE.InstancedMesh(keyGeo, whitePlastic, 6 * 15);
  const km = new THREE.Matrix4(); let ki = 0;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 15; c++) {
    const wide = (r === 5 && c === 7) ? 5 : 1;
    if (r === 5 && c > 7 && c < 12) continue;
    km.compose(new THREE.Vector3(-0.124 + c * 0.0178 + (wide > 1 ? 0.035 : 0), 0.0085, -0.047 + r * 0.0182), new THREE.Quaternion(), new THREE.Vector3(wide, r === 0 ? 0.6 : 1, r === 0 ? 0.6 : 1));
    keys.setMatrixAt(ki++, km);
  }
  keys.count = ki; keys.castShadow = true; kb.add(keys);

  const mouse = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), whitePlastic);
  mouse.scale.set(0.03, 0.012, 0.057); mouse.position.set(0.22, 0.742, 0.06); mouse.castShadow = true; scene.add(mouse);

  // ------------------------------------------------------------ props: plant, mug with steam, notebook
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.12, 28), new THREE.MeshStandardMaterial({ color: '#b7735a', roughness: 0.8 }));
  pot.position.set(-0.52, 0.8, -0.42); pot.castShadow = true; scene.add(pot);
  const leafGeo = new THREE.PlaneGeometry(0.05, 0.22, 1, 6);
  { const p = leafGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.11; p.setX(i, p.getX(i) * Math.sin((y / 0.22) * Math.PI) * 1.2); p.setZ(i, (y * y) * 2.2); p.setY(i, y); } leafGeo.computeVertexNormals(); }
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4f6b45', roughness: 0.6, side: THREE.DoubleSide });
  const leaves = [];
  for (let i = 0; i < 16; i++) {
    const l = new THREE.Mesh(leafGeo, leafMat);
    l.position.set(-0.52, 0.86, -0.42); l.castShadow = true;
    const a = (i / 16) * Math.PI * 2, tilt = 0.35 + R() * 0.5;
    l.userData = { a, tilt, s: R() * 10 };
    scene.add(l); leaves.push(l);
  }
  updaters.push((t) => leaves.forEach((l) => { l.rotation.set(0, 0, 0); l.rotateY(l.userData.a); l.rotateX(-l.userData.tilt - Math.sin(t * 1.1 + l.userData.s) * 0.04); }));

  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 32), new THREE.MeshPhysicalMaterial({ color: '#ece7de', roughness: 0.3, clearcoat: 0.8 }));
  mug.position.set(0.5, 0.785, -0.2); mug.castShadow = true; scene.add(mug);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 10, 24), mug.material);
  handle.position.set(0.54, 0.79, -0.2); handle.rotation.y = Math.PI / 2; scene.add(handle);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.036, 28), new THREE.MeshStandardMaterial({ color: '#3b2516', roughness: 0.15 }));
  coffee.rotation.x = -Math.PI / 2; coffee.position.set(0.5, 0.823, -0.2); scene.add(coffee);
  const steamTex = canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
  const steam = [];
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.o = i / 22; scene.add(s); steam.push(s);
  }
  updaters.push((t) => steam.forEach((s, i) => {
    const life = (t * 0.28 + s.userData.o) % 1;
    s.position.set(0.5 + Math.sin(life * 6 + i) * 0.012 * (1 + life * 2), 0.83 + life * 0.26, -0.2 + Math.cos(life * 5 + i) * 0.01);
    const k = 0.02 + life * 0.07; s.scale.set(k, k, k);
    s.material.opacity = Math.sin(life * Math.PI) * 0.22;
  }));

  const notebook = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.012, 0.21, 2, 0.003), new THREE.MeshStandardMaterial({ color: '#2d3a34', roughness: 0.7 }));
  notebook.position.set(-0.34, 0.746, 0.0); notebook.rotation.y = 0.35; notebook.castShadow = notebook.receiveShadow = true; scene.add(notebook);
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 12), new THREE.MeshStandardMaterial({ color: '#dbb77e', metalness: 0.8, roughness: 0.3 }));
  pen.rotation.set(Math.PI / 2, 0, 0.9); pen.position.set(-0.31, 0.756, -0.01); scene.add(pen);

  // ------------------------------------------------------------ post: DOF, bloom, phone-camera grade
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 0.85, aperture: 0.009, maxblur: 0.006 });
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.2, 0.55, 0.93);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDim: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uDim; uniform float uFlash; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 61.7) * 43758.5453); }
      void main(){
        vec2 c = vUv - 0.5;
        float r2 = dot(c, c);
        // lens: slight chromatic aberration toward the edges
        vec2 off = c * r2 * 0.012;
        vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
        // phone look: lifted blacks, warm mids, gentle contrast
        col = clamp((col - 0.5) * 1.12 + 0.5, 0.0, 1.0);
        col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.08);
        col = mix(col, col * vec3(1.04, 1.0, 0.95), 0.6);
        col = col * (1.0 + uFlash * 0.12);
        // vignette
        col *= mix(1.0, 0.78, smoothstep(0.12, 0.62, r2 * 1.8));
        // sensor grain
        col += (hash(vUv * vec2(720.0, 1280.0)) - 0.5) * 0.035;
        col *= 1.0 - uDim;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(grade);

  // ------------------------------------------------------------ camera: hand-held phone
  const look = new THREE.Vector3();
  function placeCamera(t, scrollSpeed) {
    const p = smooth(clamp01(t / 8.6));
    // Slow push-in with a slight arc to the right, then settle
    const base = new THREE.Vector3(lerp(-0.04, 0.02, p), lerp(1.27, 1.235, p), lerp(0.76, 0.64, p));
    // Two small "reframing" corrections like a real operator
    const bump = (c, w) => Math.exp(-((t - c) ** 2) / w);
    base.x += bump(3.2, 0.08) * 0.012 - bump(6.3, 0.1) * 0.01;
    base.y += bump(3.2, 0.08) * -0.008 + bump(6.3, 0.1) * 0.006;
    // Hand tremor + breathing
    const shake = 0.0045;
    base.x += wob(t * 1.4, 1) * shake;
    base.y += wob(t * 1.2, 2) * shake + Math.sin(t * 1.6) * 0.0018;
    base.z += wob(t * 0.9, 3) * shake * 0.8;
    camera.position.copy(base);
    look.set(lerp(-0.01, 0.01, p) + wob(t * 1.1, 4) * 0.004, 1.05 + wob(t, 5) * 0.003, -0.32);
    camera.lookAt(look);
    camera.rotateZ(wob(t * 0.7, 6) * 0.006 + Math.sin(t * 0.35) * 0.004);
    // Focus breathing on the screen
    // Opens on a rack focus from the desk to the screen, then breathes slightly
    const onScreen = camera.position.distanceTo(SCREEN_WORLD) + Math.sin(t * 0.8) * 0.02 + scrollSpeed * 0.01;
    const rack = smooth(clamp01((t - 0.15) / 0.9));
    bokeh.uniforms.focus.value = lerp(0.42, onScreen, rack);
    camera.fov = 60 - 1.2 * rack; camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ frame
  const avg = document.createElement('canvas'); avg.width = avg.height = 6;
  const actx = avg.getContext('2d', { willReadFrequently: true });
  let lastScroll = null;
  function setScreen(img) {
    sctx.drawImage(img, 0, 0, 1440, 810);
    screenTex.needsUpdate = true;
    actx.drawImage(img, 0, 0, 6, 6);
    const d = actx.getImageData(0, 0, 6, 6).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4 * 255;
    screenLight.color.setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace);
    screenLight.intensity = 3 + (r + g + b) / (3 * n) * 5;
  }

  function render(t, { scroll = 0, dim = 0 } = {}) {
    const speed = lastScroll === null ? 0 : Math.min(1, Math.abs(scroll - lastScroll) * 30);
    lastScroll = scroll;
    for (const u of updaters) u(t);
    // Clouds passing the sun: light breathes
    const cloud = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.37) * Math.sin(t * 0.23 + 1));
    sun.intensity = 1.45 * cloud;
    rays.forEach((r, i) => { r.material.opacity = (0.02 + 0.022 * Math.sin(t * 0.5 + i * 1.3) ** 2) * cloud; });
    outsideMat.color.setScalar(1.0 + 0.22 * cloud);
    placeCamera(t, speed);
    grade.uniforms.uTime.value = t;
    grade.uniforms.uDim.value = dim;
    composer.render();
  }

  return { setScreen, render };
}

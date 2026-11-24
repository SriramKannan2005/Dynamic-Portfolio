/**
 * scene.js: persistent fixed WebGL backdrop.
 *  - Neural-network shell: glowing nodes on an icosahedral sphere, k-nearest links,
 *    signal pulses walking the graph, cursor attraction, click shockwaves.
 *  - Morphing particle core: icosahedron > torus knot > particle sphere > cube grid,
 *    blended in the vertex shader, driven by scroll position.
 *  - Scroll-linked camera keyframes per section, eased with frame-rate independent lerp.
 */
import * as THREE from 'three';

const SECTION_IDS = ['hero', 'about', 'skills', 'projects', 'experience', 'achievements', 'education', 'contact'];

// Camera keyframes per section: [camX, camY, camZ, lookX, lookY], core shape index, network opacity
const KEYS_DESKTOP = [
  { cam: [-3.6, 0, 14.5], look: [-3.6, 0], shape: 0, net: 1.0 },
  { cam: [5.5, 1.2, 12], look: [3, 0], shape: 1, net: 0.5 },
  { cam: [-6, -0.8, 11.5], look: [-3.2, 0], shape: 1, net: 0.42 },
  { cam: [0, 4.5, 17], look: [0, 0.5], shape: 2, net: 0.38 },
  { cam: [6, -2, 13], look: [3.5, 0], shape: 2, net: 0.42 },
  { cam: [-6.5, 2, 12.5], look: [-3.5, 0], shape: 3, net: 0.45 },
  { cam: [0, -3, 15], look: [0, 0], shape: 3, net: 0.4 },
  { cam: [-5, 0.5, 13], look: [-4, 0], shape: 3, net: 0.55 },
];
const KEYS_MOBILE = KEYS_DESKTOP.map((k, i) => ({
  cam: [0, i % 2 ? 1 : -1, k.cam[2] + 3], look: [0, 0], shape: k.shape, net: Math.min(k.net, 0.5) + (i === 0 ? 0.5 : 0),
}));

const SHAPE_COLORS_DARK = ['#818cf8', '#a78bfa', '#22d3ee', '#c4b5fd'];
const SHAPE_COLORS_LIGHT = ['#4f46e5', '#7c3aed', '#0891b2', '#6d28d9'];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

/* ---------- geometry samplers ---------- */
function uniqueIcoVertices(detail) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const seen = new Set();
  const out = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    if (!seen.has(key)) { seen.add(key); out.push(new THREE.Vector3(x, y, z).normalize()); }
  }
  g.dispose();
  return out;
}

function sampleSegments(segments, n, rand, out, offset) {
  const segCount = segments.length / 6;
  for (let i = 0; i < n; i++) {
    const s = (i % segCount) * 6;
    const t = rand();
    out[offset + i * 3] = segments[s] + (segments[s + 3] - segments[s]) * t;
    out[offset + i * 3 + 1] = segments[s + 1] + (segments[s + 4] - segments[s + 1]) * t;
    out[offset + i * 3 + 2] = segments[s + 2] + (segments[s + 5] - segments[s + 2]) * t;
  }
}

function buildCoreShapes(n, rand) {
  const shapes = [new Float32Array(n * 3), new Float32Array(n * 3), new Float32Array(n * 3), new Float32Array(n * 3)];

  // 0: icosahedron wireframe (points along its 30 edges)
  const ico = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.9, 0));
  sampleSegments(ico.attributes.position.array, n, rand, shapes[0], 0);
  ico.dispose();

  // 1: torus knot surface
  const knot = new THREE.TorusKnotGeometry(1.2, 0.34, 220, 18);
  const kp = knot.attributes.position;
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rand() * kp.count);
    shapes[1][i * 3] = kp.getX(j) + (rand() - 0.5) * 0.06;
    shapes[1][i * 3 + 1] = kp.getY(j) + (rand() - 0.5) * 0.06;
    shapes[1][i * 3 + 2] = kp.getZ(j) + (rand() - 0.5) * 0.06;
  }
  knot.dispose();

  // 2: particle sphere (fibonacci shell + sparse interior)
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const shell = i % 5 !== 0;
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const R = shell ? 2.0 : 2.0 * Math.cbrt(rand());
    shapes[2][i * 3] = Math.cos(th) * r * R;
    shapes[2][i * 3 + 1] = y * R;
    shapes[2][i * 3 + 2] = Math.sin(th) * r * R;
  }

  // 3: 3x3x3 grid of wireframe cubes
  const cubeEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.56, 0.56, 0.56)).attributes.position.array;
  const segs = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    for (let e = 0; e < cubeEdges.length; e += 3) segs.push(cubeEdges[e] + x * 1.1, cubeEdges[e + 1] + y * 1.1, cubeEdges[e + 2] + z * 1.1);
  }
  sampleSegments(segs, n, rand, shapes[3], 0);

  // Shuffle the later shapes so the morph swirls instead of sliding
  for (let s = 1; s < 4; s++) {
    const a = shapes[s];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      for (let k = 0; k < 3; k++) { const t = a[i * 3 + k]; a[i * 3 + k] = a[j * 3 + k]; a[j * 3 + k] = t; }
    }
  }
  return shapes;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- shaders ---------- */
const POINT_VERT = /* glsl */`
  attribute float aSize;
  attribute float aGlow;
  uniform float uPR;
  uniform float uScale;
  varying float vGlow;
  varying float vDepth;
  void main() {
    vGlow = aGlow;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = smoothstep(-24.0, -8.0, mv.z);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * (1.0 + aGlow * 1.3) * uPR * uScale / -mv.z;
  }`;
const POINT_FRAG = /* glsl */`
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  varying float vGlow;
  varying float vDepth;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float halo = pow(smoothstep(0.5, 0.0, d), 2.4);
    float core = smoothstep(0.16, 0.0, d);
    vec3 col = mix(uColorA, uColorB, clamp(vGlow, 0.0, 1.0));
    float a = (halo * 0.8 + core) * uOpacity * mix(0.3, 1.0, vDepth) * (0.75 + vGlow * 0.5);
    gl_FragColor = vec4(col * (1.0 + vGlow * 0.5), a);
  }`;
const CORE_VERT = /* glsl */`
  attribute vec3 aP1;
  attribute vec3 aP2;
  attribute vec3 aP3;
  attribute float aRand;
  uniform float uMorph;
  uniform float uTime;
  uniform float uPR;
  uniform float uScale;
  uniform float uPulse;
  varying float vA;
  void main() {
    vec3 p = mix(position, aP1, smoothstep(0.0, 1.0, clamp(uMorph, 0.0, 1.0)));
    p = mix(p, aP2, smoothstep(0.0, 1.0, clamp(uMorph - 1.0, 0.0, 1.0)));
    p = mix(p, aP3, smoothstep(0.0, 1.0, clamp(uMorph - 2.0, 0.0, 1.0)));
    float f = fract(uMorph);
    float mid = f * (1.0 - f) * 4.0;
    p += vec3(sin(aRand * 40.0 + uTime * 1.3), cos(aRand * 31.0 + uTime * 1.1), sin(aRand * 23.0 + uTime * 0.9)) * mid * 0.45;
    p *= 1.0 + uPulse * (0.045 * sin(uTime * 2.2) + 0.02 * sin(uTime * 5.3 + aRand * 6.28));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.13 + aRand * 0.15) * uPR * uScale / -mv.z;
    vA = 0.6 + 0.4 * sin(uTime * 1.7 + aRand * 12.0);
  }`;
const CORE_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = pow(smoothstep(0.5, 0.0, d), 1.6) * vA * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }`;

/* ---------- scene factory ---------- */
function isSoftwareRenderer(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(name));
  } catch (e) { return false; }
}

const yieldToMain = () => new Promise((r) => setTimeout(r, 0));

export async function createScene(canvas, opts = {}) {
  const reduced = !!opts.reduced;
  let theme = opts.theme || 'dark';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.mobile, alpha: true, powerPreference: 'high-performance' });
  // No GPU (software rasteriser): use the low-power profile and cap the frame rate.
  const software = isSoftwareRenderer(renderer.getContext());
  const mobile = !!opts.mobile || software;
  const minFrameMs = software ? 1000 / 30 : 0;
  let pr = Math.min(window.devicePixelRatio || 1, software ? 1 : mobile ? 1.5 : 2);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 0);
  await yieldToMain(); // context creation is the single most expensive step; let input run

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 0, reduced ? 14 : 44);
  const lookAt = new THREE.Vector3();

  const world = new THREE.Group();   // mouse parallax
  const spin = new THREE.Group();    // auto rotation (network)
  world.add(spin);
  scene.add(world);

  const rand = mulberry32(20052027);
  const KEYS = mobile ? KEYS_MOBILE : KEYS_DESKTOP;

  /* ---- network nodes ---- */
  const N = mobile ? 50 : 120;
  const R = 5.2;
  // r125+ subdivides each edge into (detail + 1) parts: detail 3 → 10·4²+2 = 162 vertices
  const pool = uniqueIcoVertices(3);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const base = pool.slice(0, N).map((v) => v.multiplyScalar(R * (0.93 + rand() * 0.14)));
  const normals = base.map((v) => v.clone().normalize());
  const offsets = new Float32Array(N * 3);
  const glow = new Float32Array(N);
  const glowTarget = new Float32Array(N);

  const nodePos = new Float32Array(N * 3);
  const nodeSize = new Float32Array(N);
  base.forEach((v, i) => { nodePos.set([v.x, v.y, v.z], i * 3); nodeSize[i] = 0.32 + rand() * 0.4; });
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3).setUsage(THREE.DynamicDrawUsage));
  nodeGeo.setAttribute('aSize', new THREE.BufferAttribute(nodeSize, 1));
  nodeGeo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage));
  const nodeMat = new THREE.ShaderMaterial({
    uniforms: {
      uPR: { value: pr }, uScale: { value: 400 }, uOpacity: { value: 1 },
      uColorA: { value: new THREE.Color() }, uColorB: { value: new THREE.Color() },
    },
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false,
  });
  const nodes = new THREE.Points(nodeGeo, nodeMat);
  spin.add(nodes);

  await yieldToMain();
  /* ---- links (k-nearest, deduplicated) ---- */
  const K = mobile ? 3 : 4;
  const linkSet = new Set();
  const links = [];
  for (let i = 0; i < N; i++) {
    const d = [];
    for (let j = 0; j < N; j++) if (j !== i) d.push([base[i].distanceToSquared(base[j]), j]);
    d.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < K; k++) {
      const j = d[k][1];
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!linkSet.has(key)) { linkSet.add(key); links.push([Math.min(i, j), Math.max(i, j)]); }
    }
  }
  const L = links.length;
  const adjacency = Array.from({ length: N }, () => []);
  links.forEach(([a, b], li) => { adjacency[a].push(li); adjacency[b].push(li); });
  const linkPos = new Float32Array(L * 6);
  const linkCol = new Float32Array(L * 6);
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3).setUsage(THREE.DynamicDrawUsage));
  linkGeo.setAttribute('color', new THREE.BufferAttribute(linkCol, 3).setUsage(THREE.DynamicDrawUsage));
  const linkMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
  const linkMesh = new THREE.LineSegments(linkGeo, linkMat);
  spin.add(linkMesh);

  /* ---- signal pulses ---- */
  const P = mobile ? 10 : 28;
  const pulses = [];
  const pulsePos = new Float32Array(P * 3);
  const pulseSize = new Float32Array(P).fill(0.5);
  const pulseGlow = new Float32Array(P).fill(1);
  for (let i = 0; i < P; i++) {
    const li = Math.floor(rand() * L);
    pulses.push({ li, from: links[li][0], to: links[li][1], t: rand(), speed: 0.5 + rand() * 0.7 });
  }
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3).setUsage(THREE.DynamicDrawUsage));
  pulseGeo.setAttribute('aSize', new THREE.BufferAttribute(pulseSize, 1));
  pulseGeo.setAttribute('aGlow', new THREE.BufferAttribute(pulseGlow, 1));
  const pulseMat = nodeMat.clone();
  pulseMat.uniforms = THREE.UniformsUtils.clone(nodeMat.uniforms);
  const pulseMesh = new THREE.Points(pulseGeo, pulseMat);
  spin.add(pulseMesh);

  await yieldToMain();
  /* ---- morphing core ---- */
  const CN = mobile ? 900 : 2600;
  const shapes = buildCoreShapes(CN, rand);
  const coreRand = new Float32Array(CN);
  for (let i = 0; i < CN; i++) coreRand[i] = rand();
  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute('position', new THREE.BufferAttribute(shapes[0], 3));
  coreGeo.setAttribute('aP1', new THREE.BufferAttribute(shapes[1], 3));
  coreGeo.setAttribute('aP2', new THREE.BufferAttribute(shapes[2], 3));
  coreGeo.setAttribute('aP3', new THREE.BufferAttribute(shapes[3], 3));
  coreGeo.setAttribute('aRand', new THREE.BufferAttribute(coreRand, 1));
  coreGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      uMorph: { value: 0 }, uTime: { value: 0 }, uPR: { value: pr }, uScale: { value: 400 },
      uPulse: { value: reduced ? 0 : 1 }, uColor: { value: new THREE.Color() }, uOpacity: { value: 1 },
    },
    vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, transparent: true, depthWrite: false,
  });
  const core = new THREE.Points(coreGeo, coreMat);
  world.add(core);

  await yieldToMain();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, opacity: 0.5 }));
  halo.scale.setScalar(7);
  world.add(halo);

  /* ---- theme ---- */
  const coreColor = new THREE.Color();
  const tmpColor = new THREE.Color();
  let palette;
  function applyTheme(t) {
    theme = t;
    const dark = t !== 'light';
    const blend = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    [nodeMat, pulseMat, coreMat, linkMat, halo.material].forEach((m) => { m.blending = blend; m.needsUpdate = true; });
    nodeMat.uniforms.uColorA.value.set(dark ? '#6366f1' : '#4f46e5');
    nodeMat.uniforms.uColorB.value.set(dark ? '#67e8f9' : '#0891b2');
    pulseMat.uniforms.uColorA.value.set(dark ? '#a5f3fc' : '#0e7490');
    pulseMat.uniforms.uColorB.value.set(dark ? '#ffffff' : '#0e7490');
    linkMat.opacity = dark ? 0.55 : 0.42;
    halo.material.color.set(dark ? '#6366f1' : '#a5b4fc');
    palette = (dark ? SHAPE_COLORS_DARK : SHAPE_COLORS_LIGHT).map((c) => new THREE.Color(c));
    linkBase.set(dark ? '#4f46e5' : '#6366f1').multiplyScalar(dark ? 0.55 : 1);
    linkHot.set(dark ? '#22d3ee' : '#0891b2');
    coreColor.copy(palette[0]);
    if (reduced) requestRender();
  }
  const linkBase = new THREE.Color();
  const linkHot = new THREE.Color();

  /* ---- layout / sections ---- */
  let vw = 1, vh = 1;
  let sections = [];
  function measure() {
    sections = SECTION_IDS.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: Math.max(1, r.height) };
    }).filter(Boolean);
  }
  function resize() {
    vw = window.innerWidth; vh = window.innerHeight;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    const scale = vh * 0.62;
    nodeMat.uniforms.uScale.value = scale;
    pulseMat.uniforms.uScale.value = scale;
    coreMat.uniforms.uScale.value = scale;
    measure();
    if (reduced) requestRender();
  }

  /* ---- input ---- */
  const mouse = new THREE.Vector2(0, 0);
  const mouseSmooth = new THREE.Vector2(0, 0);
  let lastMove = -1e9;
  const ripples = [];
  const projected = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const ray = new THREE.Ray();
  const invQ = new THREE.Quaternion();

  function onMove(e) {
    if (e.pointerType === 'touch') return;
    mouse.set((e.clientX / vw) * 2 - 1, -(e.clientY / vh) * 2 + 1);
    lastMove = performance.now();
  }
  function onDown(e) {
    if (reduced) return;
    const mx = (e.clientX / vw) * 2 - 1, my = -(e.clientY / vh) * 2 + 1;
    // One-time screen-space search for the node nearest the click.
    spin.updateMatrixWorld();
    let best = -1, bestD = Infinity;
    for (let i = 0; i < N; i++) {
      projected.copy(base[i]).applyMatrix4(spin.matrixWorld).project(camera);
      if (projected.z > 1) continue;
      const dx = (projected.x - mx) * camera.aspect, dy = projected.y - my;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return;
    ripples.push({ origin: base[best].clone(), t0: clock.elapsedTime });
    if (ripples.length > 3) ripples.shift();
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });

  /* ---- scroll state ---- */
  // Zig-zag camera: each section has an anchor scroll position (its top settled near the
  // top of the screen; the hero's is 0). Between two anchors the camera glides from one
  // section's keyframe to the next, so the motion is continuous whatever the section
  // heights. Sections hold their pose for the first part of the way (HOLD); the hero
  // doesn't, so leaving it is one long glide, like the original pinned hero.
  const HOLD = 0.3;
  function scrollState() {
    const y = window.scrollY;
    let prev = 0;
    const anchors = sections.map((s, k) => (prev = k === 0 ? 0 : Math.max(prev + 1, s.top - vh * 0.15)));
    let i = 0;
    for (let k = 0; k < anchors.length; k++) if (y >= anchors[k]) i = k;
    const j = Math.min(i + 1, KEYS.length - 1, anchors.length - 1);
    let t = 0;
    if (j > i) {
      const p = clamp((y - anchors[i]) / Math.max(1, anchors[j] - anchors[i]), 0, 1);
      const hold = i === 0 ? 0 : HOLD;
      t = smooth(clamp((p - hold) / (1 - hold), 0, 1));
    }
    const hero = sections[0];
    // progress through the (one-screen) hero: 0 at the top, 1 once it has scrolled away
    const heroP = hero ? clamp(y / Math.max(1, hero.height), 0, 1) : 0;
    return { i, j, t, heroP };
  }

  /* ---- loop ---- */
  const clock = new THREE.Clock();
  let introStarted = reduced;
  let running = false;
  let raf = 0;
  let pageVisible = !document.hidden;
  let canvasVisible = true;
  let renderQueued = false;
  const camTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  let morph = 0;
  let netOpacity = 1;

  function frame(dt, time, snap) {
    const { i, j, t, heroP } = scrollState();
    const a = KEYS[i], b = KEYS[j];
    const zMul = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 0.9 : 1;
    camTarget.set(
      a.cam[0] + (b.cam[0] - a.cam[0]) * t,
      a.cam[1] + (b.cam[1] - a.cam[1]) * t,
      (a.cam[2] + (b.cam[2] - a.cam[2]) * t) * zMul - (i === 0 ? heroP * 3.5 : 0),
    );
    lookTarget.set(a.look[0] + (b.look[0] - a.look[0]) * t, a.look[1] + (b.look[1] - a.look[1]) * t, 0);
    if (!introStarted) camTarget.set(0, 0, 44);
    const shapeTarget = a.shape + (b.shape - a.shape) * t;
    const netTarget = (a.net + (b.net - a.net) * t) * (i === 0 ? 1 - heroP * 0.45 : 1);

    const k = snap ? 1 : 1 - Math.exp(-(introStarted ? 2.4 : 6) * dt);
    camera.position.lerp(camTarget, k);
    lookAt.lerp(lookTarget, snap ? 1 : 1 - Math.exp(-2.4 * dt));
    camera.lookAt(lookAt);
    morph = snap ? shapeTarget : damp(morph, shapeTarget, 2.2, dt);
    netOpacity = snap ? netTarget : damp(netOpacity, netTarget, 3, dt);

    // Core colour follows the morph
    const lo = Math.floor(clamp(morph, 0, 2.999));
    coreColor.copy(palette[lo]).lerp(palette[lo + 1], morph - lo);
    coreMat.uniforms.uColor.value.copy(coreColor);
    coreMat.uniforms.uMorph.value = morph;
    coreMat.uniforms.uTime.value = time;
    halo.material.opacity = (theme === 'light' ? 0.25 : 0.42) * (0.85 + 0.15 * Math.sin(time * 2.2));
    halo.material.color.copy(coreColor);

    coreMat.uniforms.uOpacity.value = 0.4 + 0.6 * netOpacity; // full in hero, dimmer behind content
    nodeMat.uniforms.uOpacity.value = netOpacity;
    pulseMat.uniforms.uOpacity.value = netOpacity;
    linkMesh.material.opacity = (theme === 'light' ? 0.42 : 0.55) * netOpacity;

    // Rotation + parallax
    if (!reduced) {
      spin.rotation.y += dt * 0.06;
      spin.rotation.x = Math.sin(time * 0.05) * 0.25;
      core.rotation.y -= dt * 0.18;
      core.rotation.x += dt * 0.07;
      mouseSmooth.x = damp(mouseSmooth.x, mouse.x, 2.5, dt);
      mouseSmooth.y = damp(mouseSmooth.y, mouse.y, 2.5, dt);
      world.rotation.y = mouseSmooth.x * 0.3;
      world.rotation.x = -mouseSmooth.y * 0.2;
    }
    world.updateMatrixWorld();

    // Node interaction
    const attract = !mobile && !reduced && performance.now() - lastMove < 4000 && netOpacity > 0.2;
    if (attract) {
      ray.origin.copy(camera.position);
      ray.direction.set(mouse.x, mouse.y, 0.5).unproject(camera).sub(camera.position).normalize();
      spin.getWorldQuaternion(invQ).invert();
    }
    const radius = 0.32;
    for (let n = 0; n < N; n++) {
      let ox = 0, oy = 0, oz = 0, g = 0;
      if (attract) {
        tmp.copy(base[n]).applyMatrix4(spin.matrixWorld);
        projected.copy(tmp).project(camera);
        const dx = (projected.x - mouse.x) * camera.aspect, dy = projected.y - mouse.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < radius && projected.z < 1) {
          const f = smooth(1 - d / radius);
          ray.closestPointToPoint(tmp, tmp2);
          tmp2.sub(tmp).multiplyScalar(0.28 * f).applyQuaternion(invQ);
          ox = tmp2.x; oy = tmp2.y; oz = tmp2.z;
          g = f;
        }
      }
      // Shockwaves travel across the shell from the clicked node
      for (let r = 0; r < ripples.length; r++) {
        const age = time - ripples[r].t0;
        const dist = base[n].distanceTo(ripples[r].origin);
        const front = age * 7.5;
        const amp = Math.exp(-Math.pow((dist - front) * 0.9, 2)) * Math.exp(-age * 1.1);
        const nn = normals[n];
        ox += nn.x * amp * 1.1; oy += nn.y * amp * 1.1; oz += nn.z * amp * 1.1;
        g += amp * 1.4;
      }
      const s = snap ? 1 : 1 - Math.exp(-9 * dt);
      offsets[n * 3] += (ox - offsets[n * 3]) * s;
      offsets[n * 3 + 1] += (oy - offsets[n * 3 + 1]) * s;
      offsets[n * 3 + 2] += (oz - offsets[n * 3 + 2]) * s;
      glowTarget[n] = Math.min(1.6, g);
      glow[n] += (glowTarget[n] - glow[n]) * (snap ? 1 : 1 - Math.exp(-8 * dt));
      nodePos[n * 3] = base[n].x + offsets[n * 3];
      nodePos[n * 3 + 1] = base[n].y + offsets[n * 3 + 1];
      nodePos[n * 3 + 2] = base[n].z + offsets[n * 3 + 2];
    }
    for (let r = ripples.length - 1; r >= 0; r--) if (time - ripples[r].t0 > 3) ripples.splice(r, 1);
    nodeGeo.attributes.position.needsUpdate = true;
    nodeGeo.attributes.aGlow.needsUpdate = true;

    for (let l = 0; l < L; l++) {
      const [ia, ib] = links[l];
      const o = l * 6;
      linkPos[o] = nodePos[ia * 3]; linkPos[o + 1] = nodePos[ia * 3 + 1]; linkPos[o + 2] = nodePos[ia * 3 + 2];
      linkPos[o + 3] = nodePos[ib * 3]; linkPos[o + 4] = nodePos[ib * 3 + 1]; linkPos[o + 5] = nodePos[ib * 3 + 2];
      const ga = clamp(glow[ia], 0, 1), gb = clamp(glow[ib], 0, 1);
      tmpColor.copy(linkBase).lerp(linkHot, ga);
      linkCol[l * 6] = tmpColor.r; linkCol[l * 6 + 1] = tmpColor.g; linkCol[l * 6 + 2] = tmpColor.b;
      tmpColor.copy(linkBase).lerp(linkHot, gb);
      linkCol[l * 6 + 3] = tmpColor.r; linkCol[l * 6 + 4] = tmpColor.g; linkCol[l * 6 + 5] = tmpColor.b;
    }
    linkGeo.attributes.position.needsUpdate = true;
    linkGeo.attributes.color.needsUpdate = true;

    // Pulses walk the graph: at the end of a link, hop to a random adjacent link.
    for (let p = 0; p < P; p++) {
      const pu = pulses[p];
      if (!reduced) pu.t += dt * pu.speed;
      if (pu.t >= 1) {
        const node = pu.to;
        const options = adjacency[node];
        const li = options[Math.floor(rand() * options.length)];
        pu.li = li; pu.from = node; pu.to = links[li][0] === node ? links[li][1] : links[li][0]; pu.t = 0;
      }
      const f3 = pu.from * 3, t3 = pu.to * 3;
      pulsePos[p * 3] = nodePos[f3] + (nodePos[t3] - nodePos[f3]) * pu.t;
      pulsePos[p * 3 + 1] = nodePos[f3 + 1] + (nodePos[t3 + 1] - nodePos[f3 + 1]) * pu.t;
      pulsePos[p * 3 + 2] = nodePos[f3 + 2] + (nodePos[t3 + 2] - nodePos[f3 + 2]) * pu.t;
    }
    pulseGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }

  // Adaptive quality: if the first ~90 frames average over 24ms, drop the pixel ratio once.
  let sampled = 0, sampledMs = 0, lastStamp = 0, downgraded = false;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (minFrameMs && now - lastStamp < minFrameMs - 1) return;
    if (lastStamp && !downgraded && sampled < 90) {
      sampled++; sampledMs += now - lastStamp;
      if (sampled === 90 && sampledMs / 90 > 24 && pr > 1) {
        downgraded = true;
        pr = 1;
        renderer.setPixelRatio(pr);
        [nodeMat, pulseMat, coreMat].forEach((m) => { m.uniforms.uPR.value = pr; });
        resize();
      }
    }
    lastStamp = now;
    const dt = Math.min(clock.getDelta(), 0.05);
    frame(dt, clock.elapsedTime, false);
  }
  function start() {
    if (running || reduced || !pageVisible || !canvasVisible) return;
    running = true;
    clock.getDelta();
    raf = requestAnimationFrame(tick);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // Reduced motion: render a static frame on demand only (scroll / resize / theme).
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; frame(0, 0, true); });
  }

  document.addEventListener('visibilitychange', () => {
    pageVisible = !document.hidden;
    if (pageVisible) start(); else stop();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      canvasVisible = entries[0].isIntersecting;
      if (canvasVisible) start(); else stop();
    }).observe(canvas);
  }
  window.addEventListener('resize', resize, { passive: true });
  if (reduced) window.addEventListener('scroll', requestRender, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(() => measure()).observe(document.body);

  applyTheme(theme);
  resize();
  // Compile shader programs without blocking (KHR_parallel_shader_compile when available)
  await yieldToMain();
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* falls back to compile on first render */ }
  if (reduced) requestRender(); else start();

  return {
    intro() { introStarted = true; },
    setTheme(t) { applyTheme(t); },
    refresh() { measure(); if (reduced) requestRender(); },
    get running() { return running; },
  };
}

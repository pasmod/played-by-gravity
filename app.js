// Shur in g — the picture, drawn live in the browser. Everything the balls do comes from
// scene.js (the physics run); this file only draws it. Each frame is drawn from the time alone,
// so the piece can be paused and scrubbed. Looks: "gonbad" (night dome, the default),
// "negar" (ink on paper) and "divar" (a pale studio), chosen with ?look=…
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const S = window.SCENE;
const LOOK = new URLSearchParams(location.search).get("look");
export const THEME = ["gonbad", "negar", "divar"].includes(LOOK) ? LOOK : "gonbad";
let W = 1920;
let H = 1080;
let PR = 1;
export const quality = { maxPR: 2 };
// The visitor's camera. While `free` is false the camera keeps its course and az/el are a turn on
// top of it; once the visitor takes over (`free`), az/el are the angles themselves. zoom < 1 is closer.
export const view = { az: 0, el: 0, zoom: 1, free: false, sway: 0 };
export function rigAt(t) {
  const [az, el] = spline(RIGS[THEME], t);
  return { az, el };
}
const [PW, PL, PT] = S.pad;
const R = S.r;
const SEC = S.sections.map((s) => s.t);
export const T_LAST = S.t_last;
export const T_REL = Math.min(S.ramps[0].t_release, S.ramps[1].t_release);

const LOOKS = {
  gonbad: {
    dark: true, bg: 0x02040c, fog: 0x040816, fogK: 0.085, fov: 36, exposure: 1.02,
    bloom: [0.55, 0.55, 0.78], grain: 0.028, vig: 0.4, paper: 0,
    pc: { G: "#2ec4d6", Ak: "#46d6a0", Bb: "#b6d65a", C: "#f6c453", Dk: "#f7a548", D: "#f27d4f", Eb: "#e85a6b", F: "#c66ad0" },
    balls: ["#ffd9a0", "#cfe4ff"],
  },
  negar: {
    dark: false, bg: 0xeee3ca, fog: null, fogK: 0, fov: 13, exposure: 1.0,
    bloom: null, grain: 0.035, vig: 0.16, paper: 0.09,
    pc: { G: "#1f4e8c", Ak: "#1d8a8a", Bb: "#5a8f3d", C: "#c9982a", Dk: "#d17a2a", D: "#c8452c", Eb: "#9e2b3c", F: "#6b3d8a" },
    balls: ["#c99a2e", "#c99a2e"],
  },
  divar: {
    dark: false, bg: 0xd9d0c2, fog: 0xd9d0c2, fogK: 0.035, fov: 30, exposure: 0.92,
    bloom: [0.1, 0.5, 0.95], grain: 0.018, vig: 0.2, paper: 0,
    pc: { G: "#2f9fb3", Ak: "#3fb48a", Bb: "#9dbb45", C: "#e8b23c", Dk: "#ea8f3e", D: "#e2684c", Eb: "#cf4d68", F: "#9263c2" },
    balls: ["#c9a24a", "#b9bcc4"],
  },
};
const L = LOOKS[THEME];
const pcOf = (name) => name.replace(/[0-9]/g, "");
// the notes of the mode, in order above the home note of the piece, each with its colour
const PCS = [];
{
  const seen = {};
  for (const l of S.lanes) {
    const pc = pcOf(l.name);
    if (!(pc in seen)) seen[pc] = (((l.cents - (S.home || 0)) % 1200) + 1200) % 1200;
  }
  PCS.push(...Object.keys(seen).sort((a, b) => seen[a] - seen[b]));
}
const PALETTE = Object.values(L.pc);
const PC_COLOR = {};
PCS.forEach((pc, i) => (PC_COLOR[pc] = PALETTE[i % PALETTE.length]));
const laneColor = S.lanes.map((l) => new THREE.Color(PC_COLOR[pcOf(l.name)]));

// ---------------------------------------------------------------- data helpers
function lastLE(arr, t) {
  let lo = 0;
  let hi = arr.length - 1;
  if (hi < 0 || arr[0][0] > t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid][0] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
function ballAt(b, t, out) {
  const segs = S.balls[b];
  const s = segs[Math.max(0, lastLE(segs, t))];
  const d = t - s[0];
  const h = 0.5 * d * d;
  return out.set(s[1] + s[4] * d + s[7] * h, s[2] + s[5] * d + s[8] * h, s[3] + s[6] * d + s[9] * h);
}
const cam = S.cam;
function camAt(t) {
  const f = Math.min(Math.max(t * cam.fps, 0), cam.x.length - 1.001);
  const i = Math.floor(f);
  const a = f - i;
  const mix = (arr) => arr[i] * (1 - a) + arr[i + 1] * a;
  return { x: mix(cam.x), y: mix(cam.y), z: mix(cam.z), span: mix(cam.span) };
}
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
// Catmull-Rom through keyframes [t, a, b, ...]
function spline(keys, t) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0].slice(1);
  if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let i = 0;
  while (keys[i + 1][0] < t) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(n - 1, i + 2)];
  const u = (t - k1[0]) / (k2[0] - k1[0]);
  const out = [];
  for (let c = 1; c < k1.length; c++) {
    const m1 = ((k2[c] - k0[c]) / (k2[0] - k0[0])) * (k2[0] - k1[0]);
    const m2 = ((k3[c] - k1[c]) / (k3[0] - k1[0])) * (k2[0] - k1[0]);
    const u2 = u * u;
    const u3 = u2 * u;
    out.push((2 * u3 - 3 * u2 + 1) * k1[c] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[c] + (u3 - u2) * m2);
  }
  return out;
}

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.toneMapping = L.dark ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
renderer.toneMappingExposure = L.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(L.bg);
if (L.fog !== null) scene.fog = new THREE.FogExp2(L.fog, L.fogK);
const camera = new THREE.PerspectiveCamera(L.fov, W / H, 0.02, 600);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = THEME === "gonbad" ? 0.14 : THEME === "divar" ? 0.3 : 0.0;

const Zax = new THREE.Vector3(0, 0, 1);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const sc = new THREE.Vector3(1, 1, 1);
const gc = new THREE.Color();
const black = new THREE.Color(0, 0, 0);
const white = new THREE.Color(1, 1, 1);

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const DOT = dotTexture();

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0x8fa0e0, 0x130c1c, 0.9);
const key = new THREE.DirectionalLight(0xfff1dd, 1.3);
scene.add(hemi, key, key.target);
if (THEME === "negar") {
  hemi.color.set(0xffffff);
  hemi.groundColor.set(0xb9ab8c);
  hemi.intensity = 2.3;
  key.intensity = 1.1;
}
if (THEME === "divar") {
  hemi.color.set(0xfffaf2);
  hemi.groundColor.set(0xcdbfae);
  hemi.intensity = 0.55;
  key.color.set(0xfff3e2);
  key.intensity = 2.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.004;
  key.shadow.radius = 9;
}

// ---------------------------------------------------------------- pads
const hops = S.pads.filter((p) => p.k === "h");
const bars = S.pads.filter((p) => p.k !== "h");
const NH = hops.length;
const padGeo = new RoundedBoxGeometry(PW, PT, PL, 3, Math.min(0.0022, PT * 0.3));
let padMat;
if (THEME === "gonbad") {
  padMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.2 });
} else if (THEME === "negar") {
  padMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
} else {
  padMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.0 });
}
if (THEME === "gonbad") {
  padMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance += vColor.rgb * 0.8;\n#endif",
    );
  };
}
const padMesh = new THREE.InstancedMesh(padGeo, padMat, NH);
padMesh.frustumCulled = false;
if (THEME === "divar") {
  padMesh.castShadow = true;
  padMesh.receiveShadow = true;
}
scene.add(padMesh);
const baseCol = (lane) =>
  THEME === "gonbad" ? laneColor[lane].clone().multiplyScalar(0.2) : laneColor[lane].clone();
const padQ = [];
const padTop = [];
hops.forEach((p, i) => {
  const [nx, ny] = p.n;
  const qq = new THREE.Quaternion().setFromAxisAngle(Zax, Math.atan2(-nx, ny));
  padQ.push(qq);
  padTop.push(new THREE.Vector3(p.c[0], p.c[1], p.c[2]));
  tmp.set(p.c[0] - (nx * PT) / 2, p.c[1] - (ny * PT) / 2, p.c[2]);
  m4.compose(tmp, qq, sc);
  padMesh.setMatrixAt(i, m4);
  padMesh.setColorAt(i, baseCol(p.l));
});
padMesh.instanceMatrix.needsUpdate = true;

// ink outline (negar): an inverted hull
let outline = null;
if (THEME === "negar") {
  outline = new THREE.InstancedMesh(padGeo, new THREE.MeshBasicMaterial({ color: 0x2a2018, side: THREE.BackSide }), NH);
  outline.frustumCulled = false;
  hops.forEach((p, i) => {
    padMesh.getMatrixAt(i, m4);
    m4.decompose(tmp, q, tmp2);
    tmp2.set(1 + 0.0028 / PW, 1 + 0.0028 / PT, 1 + 0.0028 / PL);
    m4.compose(tmp, q, tmp2);
    outline.setMatrixAt(i, m4);
  });
  scene.add(outline);
}

// inlay (gonbad): an eight-pointed star on every tile; it lights when the tile is struck
function starTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d");
  g.strokeStyle = "#fff";
  g.lineJoin = "round";
  g.lineWidth = 5;
  g.strokeRect(11, 11, 106, 234);
  const star = (cx, cy, r, lw) => {
    g.lineWidth = lw;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + (k * Math.PI) / 4;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.stroke();
    }
  };
  g.fillStyle = "rgba(255,255,255,0.22)";
  g.beginPath();
  g.arc(64, 128, 26, 0, Math.PI * 2);
  g.fill();
  star(64, 128, 38, 5);
  star(64, 44, 13, 4);
  star(64, 212, 13, 4);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}
let inlay = null;
if (THEME === "gonbad") {
  const g = new THREE.PlaneGeometry(PW * 0.94, PL * 0.96).rotateX(-Math.PI / 2);
  inlay = new THREE.InstancedMesh(
    g,
    new THREE.MeshBasicMaterial({ map: starTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    NH,
  );
  inlay.frustumCulled = false;
  hops.forEach((p, i) => {
    tmp.set(p.c[0] + p.n[0] * 0.0006, p.c[1] + p.n[1] * 0.0006, p.c[2]);
    m4.compose(tmp, padQ[i], sc);
    inlay.setMatrixAt(i, m4);
    inlay.setColorAt(i, black);
  });
  scene.add(inlay);
}

// far-away tiles as points of light (gonbad): keeps the played path visible into the distance
let pearls = null;
if (THEME === "gonbad") {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(NH * 3);
  hops.forEach((p, i) => pos.set([p.c[0] + p.n[0] * 0.004, p.c[1] + p.n[1] * 0.004, p.c[2]], i * 3));
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(NH * 3), 3));
  pearls = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      uniforms: { uScale: { value: H / (2 * Math.tan((L.fov * Math.PI) / 360)) }, uFog: { value: L.fogK }, uPx: { value: 1 } },
      vertexShader: `attribute vec3 color; varying vec3 vC; uniform float uScale; uniform float uFog; uniform float uPx;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          float px = 0.034 * uScale / -mv.z; gl_PointSize = max(2.6 * uPx, px);
          float far = min(1.0, px / (2.6 * uPx)); float f = exp(-pow(uFog * 0.55 * -mv.z, 2.0));
          vC = color * f * mix(0.75, 1.0, far); }`,
      fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
          gl_FragColor = vec4(vC * exp(-d * d * 3.5), 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
  );
  pearls.frustumCulled = false;
  scene.add(pearls);
}

// resting bars and launch ramps: a handful of single meshes
const barMeshes = [];
const BW = 0.014;   // drawn as slender beams inside the physical 3 cm plate
const BT = 0.005;
function barMaterial(lane) {
  if (THEME === "gonbad") {
    return new THREE.MeshPhysicalMaterial({ color: laneColor[lane].clone().multiplyScalar(0.12), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.25, emissive: laneColor[lane], emissiveIntensity: 0 });
  }
  if (THEME === "negar") return new THREE.MeshLambertMaterial({ color: laneColor[lane] });
  return new THREE.MeshStandardMaterial({ color: laneColor[lane], roughness: 0.72 });
}
function addOutline(mesh, geo, len) {
  if (THEME !== "negar") return;
  const o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2a2018, side: THREE.BackSide }));
  o.scale.set(1 + 0.0028 / BW, 1 + 0.0028 / BT, 1 + 0.0028 / len);
  mesh.add(o);
}
bars.forEach((p) => {
  const len = p.z1 - p.z0;
  const geo = new RoundedBoxGeometry(BW, BT, len, 2, 0.0015);
  const m = new THREE.Mesh(geo, barMaterial(p.l));
  m.position.set(p.c[0], p.c[1] - BT / 2, (p.z0 + p.z1) / 2);
  if (THEME === "divar") m.castShadow = m.receiveShadow = true;
  addOutline(m, geo, len);
  scene.add(m);
  barMeshes.push({ mesh: m, pad: p });
});
const gates = [];
S.ramps.forEach((r, b) => {
  const th = (r.deg * Math.PI) / 180;
  const d = new THREE.Vector3(0, -Math.sin(th), Math.cos(th));
  const nr = new THREE.Vector3(0, Math.cos(th), Math.sin(th));
  const len = r.length + 0.05;
  const geo = new RoundedBoxGeometry(BW, BT, len, 2, 0.0015);
  const lane = (S.pads.find((p) => p.b === b && p.k === "s") || S.pads.find((p) => p.b === b)).l;
  const mat = barMaterial(lane);
  const m = new THREE.Mesh(geo, mat);
  const top = new THREE.Vector3(...r.top);
  const lip = new THREE.Vector3(...r.lip);
  m.position.copy(top).add(lip).multiplyScalar(0.5).addScaledVector(nr, -(R + BT / 2)).addScaledVector(d, -0.02);
  m.rotation.x = th;
  if (THEME === "divar") m.castShadow = m.receiveShadow = true;
  addOutline(m, geo, len);
  scene.add(m);
  // the gate that holds the ball until it is released
  const gate = new THREE.Mesh(new THREE.BoxGeometry(BW, 0.02, 0.003), mat);
  const home = top.clone().addScaledVector(d, R + 0.0025).addScaledVector(nr, -R + 0.008);
  gate.rotation.x = th;
  if (THEME === "divar") gate.castShadow = true;
  scene.add(gate);
  gates.push({ gate, home, nr, t: r.t_release });
});

// ---------------------------------------------------------------- balls
const ballMeshes = [];
const ballLights = [];
const halos = [];
for (let b = 0; b < 2; b++) {
  const col = new THREE.Color(L.balls[b]);
  let mat;
  if (THEME === "gonbad") mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.6, roughness: 0.3 });
  else if (THEME === "negar") mat = new THREE.MeshLambertMaterial({ color: col });
  else mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.22, metalness: 1.0 });
  const m = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 24), mat);
  if (THEME === "divar") m.castShadow = true;
  if (THEME === "negar") {
    const o = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0x2a2018, side: THREE.BackSide }));
    o.scale.setScalar(1 + 0.0016 / R);
    m.add(o);
  }
  scene.add(m);
  ballMeshes.push(m);
  if (THEME === "gonbad") {
    const light = new THREE.PointLight(col, 0.07, 1.6, 2);
    scene.add(light);
    ballLights.push(light);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.4 }));
    halo.scale.setScalar(R * 5.5);
    scene.add(halo);
    halos.push(halo);
  }
}

// comet tails (gonbad)
const TRAIL = 110;
const trails = [];
if (THEME === "gonbad") {
  for (let b = 0; b < 2; b++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: R * 1.7, map: DOT, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    trails.push(pts);
  }
}

// the trace: every arc flown so far stays (light in gonbad, ink in negar)
const TRACE_HZ = 160;
const TRACE_N = Math.ceil(S.t_end * TRACE_HZ);
const traces = [];
let traceMat = null;
if (THEME !== "divar") {
  traceMat = new THREE.LineBasicMaterial(
    THEME === "gonbad"
      ? { vertexColors: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }
      : { color: 0x1c140e, transparent: true, opacity: 0.9, depthWrite: false },
  );
  const v = new THREE.Vector3();
  for (let b = 0; b < 2; b++) {
    const P = new Float32Array(TRACE_N * 3);
    const C = new Float32Array(TRACE_N * 3);
    const mine = S.hits.filter((h) => h[1] === b);
    let hi = -1;
    for (let i = 0; i < TRACE_N; i++) {
      const tt = i / TRACE_HZ;
      ballAt(b, tt, v);
      P.set([v.x, v.y, v.z], i * 3);
      while (hi + 1 < mine.length && mine[hi + 1][0] <= tt) hi++;
      const c = hi >= 0 ? laneColor[mine[hi][2]] : white;
      C.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(P, 3));
    g.setAttribute("color", new THREE.BufferAttribute(C, 3));
    const line = new THREE.Line(g, traceMat);
    line.frustumCulled = false;
    scene.add(line);
    traces.push(line);
  }
}

// ripples on the struck tile, and sparks (gonbad)
const RINGS = 26;
const rings = [];
for (let i = 0; i < RINGS; i++) {
  const mat = new THREE.MeshBasicMaterial(
    THEME === "gonbad"
      ? { color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }
      : { color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide },
  );
  const r = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.0, 56), mat);
  r.visible = false;
  scene.add(r);
  rings.push(r);
}
const SPK = 8;
const SPARK_HITS = 22;
let sparks = null;
if (THEME === "gonbad") {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPARK_HITS * SPK * 3), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(SPARK_HITS * SPK * 3), 3));
  sparks = new THREE.Points(g, new THREE.PointsMaterial({ size: R * 0.55, map: DOT, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false;
  scene.add(sparks);
}
// which pad each hit belongs to (for the ripple's plane), and seeded spark directions
const hitPad = S.hits.map((h) => {
  let best = null;
  for (const p of S.pads) {
    if (p.b !== h[1] || p.l !== h[2]) continue;
    for (const ht of p.h) if (Math.abs(ht - h[0]) < 2e-4) best = p;
  }
  return best;
});

// ---------------------------------------------------------------- the sky (gonbad)
function rosetteTexture() {
  const N = 2048;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  const cx = N / 2;
  const R0 = N * 0.49;
  g.strokeStyle = "rgba(255,214,150,0.9)";
  g.lineWidth = 1.5;
  const arms = 32;
  const rin = 0.085;
  const k = 1.55;
  for (let dir = -1; dir <= 1; dir += 2) {
    for (let i = 0; i < arms; i++) {
      g.beginPath();
      for (let s = 0; s <= 220; s++) {
        const r = rin * Math.pow(1 / rin, s / 220);
        const th = (2 * Math.PI * i) / arms + dir * k * Math.log(r / rin);
        const x = cx + R0 * r * Math.cos(th);
        const y = cx + R0 * r * Math.sin(th);
        if (s === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  for (const [r, lw] of [[1.0, 2.6], [0.975, 1.2], [rin, 1.8], [rin * 0.72, 1.2]]) {
    g.lineWidth = lw;
    g.beginPath();
    g.arc(cx, cx, R0 * r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 1.8;
  for (let kk = 0; kk < 4; kk++) {
    g.beginPath();
    for (let i = 0; i <= 4; i++) {
      const a = (Math.PI / 2) * i + (kk * Math.PI) / 8;
      const x = cx + R0 * rin * 0.72 * Math.cos(a);
      const y = cx + R0 * rin * 0.72 * Math.sin(a);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let sky = null;
let stars = null;
const upSlope = new THREE.Vector3(0, -cam.slope, -1).normalize();
if (THEME === "gonbad") {
  const axU = new THREE.Vector3(1, 0, 0);
  const axV = new THREE.Vector3().crossVectors(upSlope, axU).normalize();
  sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { uAxis: { value: upSlope }, uAxU: { value: axU }, uAxV: { value: axV }, uRos: { value: rosetteTexture() }, uRosI: { value: 0.5 }, uHalf: { value: 0.52 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vDir; uniform vec3 uAxis; uniform vec3 uAxU; uniform vec3 uAxV; uniform sampler2D uRos; uniform float uRosI; uniform float uHalf;
        void main(){ vec3 d = normalize(vDir);
          vec3 col = mix(vec3(0.0050,0.0095,0.027), vec3(0.0012,0.0026,0.009), smoothstep(-0.2, 0.9, d.y));
          col = mix(col, vec3(0.0006,0.0011,0.004), smoothstep(0.0, -0.8, d.y));
          float r = acos(clamp(dot(d, uAxis), -1.0, 1.0)) / uHalf;
          if (r < 1.0) {
            vec2 p = normalize(vec2(dot(d, uAxU), dot(d, uAxV)) + 1e-6) * r;
            vec4 t = texture2D(uRos, 0.5 + 0.5 * p);
            col += t.rgb * t.a * uRosI * 0.085 * (1.0 - 0.75 * smoothstep(0.25, 1.0, r));
          }
          col += vec3(0.010,0.016,0.038) * exp(-r * r * 2.6) * uRosI;
          gl_FragColor = vec4(col, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  const rand = rng(1347);
  const NS = 2600;
  const sp = new Float32Array(NS * 3);
  const scol = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) {
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const rr = Math.sqrt(1 - u * u);
    sp.set([rr * Math.cos(th) * 250, u * 250, rr * Math.sin(th) * 250], i * 3);
    const kk = 0.2 + 0.8 * Math.pow(rand(), 4);
    scol.set([kk * 0.85, kk * 0.9, kk], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  sg.setAttribute("color", new THREE.BufferAttribute(scol, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, map: DOT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  scene.add(stars);
}

// the wall (divar): a pale backdrop that catches the shadows
let wall = null;
if (THEME === "divar") {
  wall = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xe4dccf, roughness: 0.96 }));
  wall.receiveShadow = true;
  scene.add(wall);
}

// ---------------------------------------------------------------- post
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
if (L.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), L.bloom[0], L.bloom[1], L.bloom[2]));
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: L.grain }, uVig: { value: L.vig }, uPaper: { value: L.paper }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig; uniform float uPaper; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      vec2 qv = (vUv - 0.5) * vec2(1.0, 0.8);
      c.rgb *= 1.0 - uVig * smoothstep(0.28, 0.82, length(qv));
      float seed = uPaper > 0.0 ? 0.0 : floor(uTime * 60.0);
      c.rgb += (hash(vUv * uRes + seed * 17.0) - 0.5) * uGrain;
      if (uPaper > 0.0) {
        float m = vnoise(vUv * vec2(16.0, 9.0) * 5.0) * 0.6 + vnoise(vUv * vec2(16.0, 9.0) * 22.0) * 0.4;
        float fib = vnoise(vec2(vUv.x * 260.0, vUv.y * 14.0));
        c.rgb *= 1.0 + (m - 0.5) * uPaper + (fib - 0.5) * uPaper * 0.45;
      }
      gl_FragColor = c; }`,
});
composer.addPass(grade);

// ---------------------------------------------------------------- camera
const END = new THREE.Vector3();
ballAt(0, T_LAST, END);
function target(t, out) {
  const c = camAt(t);
  out.set(c.x, c.y, c.z);
  return c.span;
}
// keyframes: t, azimuth (deg, 0 = behind the balls), elevation (deg), frame height (in spans), look-ahead (spans)
// the camera's course is laid out over the length of the piece, whatever its parts are
const T_FIRST = S.t0;
const at = (u) => T_FIRST + u * (T_LAST - T_FIRST);
// keyframes: t, azimuth (deg, 0 = up the slope behind the balls), elevation above the slope (deg),
// frame height (in spans), look-ahead (spans), lift of the look point (spans)
const RIGS = {
  gonbad: [
    [0, 38, 12, 3.1, 0, 1.3], [T_REL - 0.4, 34, 13, 2.9, 0, 1.15], [T_FIRST + 0.6, 26, 18, 1.71, 0.1, 0.1],
    [at(0.045), 18, 23, 1.57, 0.3, 0], [at(0.17), -20, 24, 1.62, 0.35, 0],
    [at(0.33), -68, 15, 1.57, 0.2, 0], [at(0.45), -134, 17, 1.62, 0.3, 0], [at(0.565), -180, 19, 1.67, 0.4, 0.1],
    [at(0.645), -214, 17, 1.62, 0.35, 0], [at(0.74), -296, 24, 1.75, 0.35, 0], [at(0.82), -350, 30, 1.84, 0.4, 0],
    [at(0.92), -386, 22, 1.62, 0.3, 0], [T_LAST, -400, 17, 1.44, 0.2, 0],
  ],
  negar: [[0, -62, 20, 1.45, 0, 0], [S.t_end, -62, 20, 1.45, 0, 0]],
  divar: [[0, 34, 38, 1.55, 0.25, 0], [at(0.4), 24, 42, 1.6, 0.3, 0], [at(0.7), 14, 46, 1.7, 0.3, 0], [S.t_end, 30, 38, 1.55, 0.25, 0]],
};
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const revPos = new THREE.Vector3();
const revLook = new THREE.Vector3();
const T0v = new THREE.Vector3();
const T1v = new THREE.Vector3();
const dir = new THREE.Vector3();
// the frame of the slope: f runs down the cascade, u stands on it, r points right
const fS = upSlope.clone().multiplyScalar(-1);
const rS = new THREE.Vector3(1, 0, 0);
const uS = new THREE.Vector3().crossVectors(fS, rS).normalize();
if (uS.y < 0) uS.multiplyScalar(-1);
function follow(t, pos, look) {
  const span = target(t, T0v);
  target(t + 1.2, T1v);
  dir.copy(T1v).sub(T0v).normalize();
  let [azD, elD, fh, la, lift] = spline(RIGS[THEME], t);
  if (view.free) {
    azD = view.az;
    elD = view.el;
    fh = 1.7;
    la = 0.25;
    lift = 0;
  } else {
    azD += view.az + view.sway;
    elD += view.el;
  }
  const az = (azD * Math.PI) / 180;
  const el = (Math.min(86, Math.max(-30, elD)) * Math.PI) / 180;
  const fit = Math.max(1, 0.85 / camera.aspect);      // tall screens: step back so the width still fits
  const D = (view.zoom * fit * fh * span) / (2 * Math.tan((L.fov * Math.PI) / 360));
  pos.copy(T0v)
    .addScaledVector(rS, D * Math.sin(az) * Math.cos(el))
    .addScaledVector(uS, D * Math.sin(el))
    .addScaledVector(fS, -D * Math.cos(az) * Math.cos(el));
  look.copy(T0v).addScaledVector(dir, la * span * Math.cos(az));
  look.y += lift * span;
  return span;
}
let reveal = 0;
function renderCamera(t) {
  const span = follow(t, camPos, camLook);
  reveal = THEME === "gonbad" && !view.free ? smooth01((t - (T_LAST + 0.5)) / 5.5) : 0;
  if (reveal > 0) {
    // the last view: past the end, looking back up the whole stairway into the dome
    const drift = t - T_LAST;
    revPos.copy(END).addScaledVector(fS, 2.6 + 0.16 * drift).addScaledVector(uS, 0.9 + 0.03 * drift);
    const side = Math.min(1, camera.aspect / 1.6);   // on tall screens the stairway stays in the middle
    revPos.x += (1.25 + 0.04 * drift) * side;
    revLook.copy(revPos).addScaledVector(upSlope, 40).addScaledVector(uS, -1.2);
    revLook.x -= 4.6 * side;
    revPos.addScaledVector(rS, Math.sin((view.az * Math.PI) / 180) * 2.0).addScaledVector(uS, Math.sin((view.el * Math.PI) / 180) * 1.5);
    camPos.lerp(revPos, reveal);
    camLook.lerp(revLook, Math.pow(reveal, 1.4));
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (scene.fog) scene.fog.density = THEME === "gonbad" ? (0.1 / span) * (1 - reveal) + 0.014 * reveal : L.fogK / span;
  key.position.copy(camLook).addScaledVector(rS, 0.9 * span).addScaledVector(uS, 2.2 * span).addScaledVector(fS, -1.0 * span);
  key.target.position.copy(camLook);
  if (THEME === "divar") {
    key.position.copy(T0v).addScaledVector(uS, 3.0 * span).addScaledVector(rS, 1.5 * span).addScaledVector(fS, -1.1 * span);
    key.target.position.copy(T0v);
    key.target.updateMatrixWorld();
    const sh = key.shadow.camera;
    const e = 2.4 * span;
    sh.left = -e;
    sh.right = e;
    sh.top = e;
    sh.bottom = -e;
    sh.near = 0.05;
    sh.far = 9 * span;
    sh.updateProjectionMatrix();
    wall.position.copy(T0v).addScaledVector(uS, -(0.34 * span + 0.06));
    wall.quaternion.setFromUnitVectors(Zax, uS);
  }
  if (sky) {
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    sky.material.uniforms.uRosI.value = 0.55 + 0.6 * reveal;
  }
  if (pearls) pearls.material.uniforms.uFog.value = scene.fog.density;
  return span;
}

// ---------------------------------------------------------------- HUD
const SMALL = { k: "koron", s: "sori" };
function pcLabel(pc) {
  const m = pc.match(/^([A-G])(b|#|k|s)?$/);
  if (!m) return pc;
  if (m[2] === "b") return `${m[1]}♭`;
  if (m[2] === "#") return `${m[1]}♯`;
  if (m[2]) return `${m[1]}<small data-layout-ignore>${SMALL[m[2]]}</small>`;
  return m[1];
}
const scaleEl = document.getElementById("scale");
const noteEls = {};
for (const pc of PCS) {
  const el = document.createElement("div");
  el.className = "note";
  el.dataset.pc = pc;
  el.innerHTML = `<span class="lamp"></span><span class="nm">${pcLabel(pc)}</span>`;
  scaleEl.appendChild(el);
  noteEls[pc] = el;
}
const countEl = document.getElementById("count");
const secEn = document.getElementById("sec-en");
const secFa = document.getElementById("sec-fa");
const secNo = document.getElementById("sec-no");
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
const INK = L.dark ? "236,230,214" : "42,32,24";

// ---------------------------------------------------------------- one frame
const hitT = S.hits;
function renderAt(t) {
  renderCamera(t);

  // balls, their light and tails
  for (let b = 0; b < 2; b++) {
    ballAt(b, t, tmp);
    ballMeshes[b].position.copy(tmp);
    if (THEME === "gonbad") {
      ballLights[b].position.copy(tmp);
      halos[b].position.copy(tmp);
      const pa = trails[b].geometry.attributes.position;
      const ca = trails[b].geometry.attributes.color;
      const base = ballMeshes[b].material.color;
      for (let i = 0; i < TRAIL; i++) {
        ballAt(b, Math.max(0, t - i * 0.003), tmp2);
        pa.setXYZ(i, tmp2.x, tmp2.y, tmp2.z);
        const k = Math.pow(1 - i / TRAIL, 2.4) * 0.34;
        ca.setXYZ(i, base.r * k, base.g * k, base.b * k);
      }
      pa.needsUpdate = true;
      ca.needsUpdate = true;
    }
  }
  for (const g of gates) {
    const k = smooth01((t - g.t + 0.03) / 0.09);
    g.gate.position.copy(g.home).addScaledVector(g.nr, -0.03 * k);
  }

  // tiles: waiting, struck (a flash), then ringing on as memory
  const pulse = THEME === "gonbad" && reveal > 0 ? t - (T_LAST + 1.2) : -1;
  for (let i = 0; i < NH; i++) {
    const p = hops[i];
    const d = t - p.h[0];
    let flash = 0;
    let ring = 0;
    if (d >= 0) {
      flash = Math.exp(-d / 0.085);
      ring = Math.exp(-d / 1.3);
    }
    if (tapped[i]) {                 // a tile the visitor touched lights up as if struck
      const dt = (performance.now() - tapped[i]) / 1000;
      if (dt > 2.5) tapped[i] = 0;
      else flash = Math.max(flash, Math.exp(-dt / 0.12) + 0.35 * Math.exp(-dt / 0.9));
    }
    if (THEME === "gonbad") {
      let g = d >= 0 ? 0.5 + 2.6 * flash + 0.9 * ring : 0.16 + 2.6 * flash;
      if (pulse >= 0) {   // one last wave of light runs down the whole stairway
        const w = pulse - ((p.h[0] - SEC[0]) / (T_LAST - SEC[0])) * 3.2;
        if (w > 0) g += 1.6 * Math.exp(-w / 0.5);
        g += 0.35 * reveal;
      }
      gc.copy(laneColor[p.l]).multiplyScalar(g);
      inlay.setColorAt(i, gc);
      gc.copy(laneColor[p.l]).multiplyScalar(d >= 0 ? 0.3 + 1.5 * flash + 0.45 * ring : 0.085 + 1.5 * flash);
      padMesh.setColorAt(i, gc);
      const pa = pearls.geometry.attributes.color;
      const k = d >= 0 ? 0.42 + 1.4 * flash + 0.5 * ring + (pulse >= 0 ? 0.3 * reveal : 0) : 0.06;
      pa.setXYZ(i, laneColor[p.l].r * k, laneColor[p.l].g * k, laneColor[p.l].b * k);
    } else {
      gc.copy(laneColor[p.l]);
      if (d < 0) gc.lerp(scene.background, THEME === "negar" ? 0.72 : 0.5);
      gc.lerp(white, 0.65 * flash);
      padMesh.setColorAt(i, gc);
    }
  }
  if (THEME === "gonbad") {
    inlay.instanceColor.needsUpdate = true;
    padMesh.instanceColor.needsUpdate = true;
    pearls.geometry.attributes.color.needsUpdate = true;
    for (const bm of barMeshes) {
      let g = 0;
      for (const ht of bm.pad.h) {
        const d = t - ht;
        if (d < 0) break;
        g += 0.9 * Math.exp(-d / 0.09) + 0.2 * Math.exp(-d / 1.3);
      }
      bm.mesh.material.emissiveIntensity = Math.min(1.8, g) + (bm.pad.h.length && t >= bm.pad.h[0] ? 0.32 : 0.14);
    }
  } else {
    padMesh.instanceColor.needsUpdate = true;
  }

  // the trace of every arc flown so far
  if (traceMat) {
    const nDraw = Math.min(TRACE_N, Math.max(0, Math.floor(t * TRACE_HZ)));
    for (const tr of traces) tr.geometry.setDrawRange(0, nDraw);
    if (THEME === "gonbad") traceMat.opacity = 0.2 + 0.5 * reveal;
  }

  // ripples and sparks for the latest strikes
  const last = lastLE(hitT, t);
  let used = 0;
  let sUsed = 0;
  const flash = {};
  for (let j = last; j >= 0; j--) {
    const h = S.hits[j];
    const d = t - h[0];
    if (d > 0.7) break;
    const pad = hitPad[j];
    const lane = h[2];
    const amp = Math.min(1.5, 0.35 + h[3] / 2.6);
    if (used < RINGS && pad) {
      const r = rings[used++];
      ballAt(h[1], h[0], tmp);
      tmp2.set(pad.n[0], pad.n[1], 0);
      r.position.copy(tmp).addScaledVector(tmp2, -R + 0.0012);
      r.quaternion.setFromUnitVectors(Zax, tmp2);
      const s = 0.012 + 0.036 * Math.sqrt(d / 0.7) * amp;
      r.scale.set(s, s, s);
      if (THEME === "gonbad") r.material.color.copy(laneColor[lane]).multiplyScalar(1.5 * (1 - d / 0.7));
      else {
        r.material.color.copy(THEME === "negar" ? laneColor[lane] : white);
        r.material.opacity = 0.8 * (1 - d / 0.7);
      }
      r.visible = true;
    }
    if (sparks && sUsed < SPARK_HITS && pad && d < 0.5) {
      const rand = rng(j * 7919 + 13);
      const pa = sparks.geometry.attributes.position;
      const ca = sparks.geometry.attributes.color;
      ballAt(h[1], h[0], tmp);
      for (let s = 0; s < SPK; s++) {
        const a = rand() * Math.PI * 2;
        const sp = (0.25 + 0.55 * rand()) * Math.min(2.2, 0.5 + h[3] * 0.5);
        const up = 0.35 + 0.65 * rand();
        const vx = pad.n[0] * sp * up + Math.cos(a) * sp * 0.6;
        const vy = pad.n[1] * sp * up;
        const vz = S.vz * 0.5 + Math.sin(a) * sp * 0.6;
        const idx = sUsed * SPK + s;
        pa.setXYZ(idx, tmp.x + vx * d, tmp.y - R + vy * d - 0.5 * S.g * d * d, tmp.z + vz * d);
        const k = Math.pow(1 - d / 0.5, 1.6) * 1.3 * amp;
        ca.setXYZ(idx, laneColor[lane].r * k, laneColor[lane].g * k, laneColor[lane].b * k);
      }
      sUsed++;
    }
    const pc = pcOf(S.lanes[lane].name);
    flash[pc] = Math.max(flash[pc] || 0, Math.exp(-d / 0.2));
  }
  for (let i = used; i < RINGS; i++) rings[i].visible = false;
  if (sparks) {
    const ca = sparks.geometry.attributes.color;
    for (let i = sUsed * SPK; i < SPARK_HITS * SPK; i++) ca.setXYZ(i, 0, 0, 0);
    sparks.geometry.attributes.position.needsUpdate = true;
    ca.needsUpdate = true;
  }

  // HUD: bounce count, section, the notes of the mode
  countEl.textContent = String(last + 1).padStart(3, "0");
  let si = 0;
  for (let i = 0; i < SEC.length; i++) if (t + 0.001 >= SEC[i]) si = i;
  secEn.textContent = S.sections[si].en;
  secFa.textContent = S.sections[si].fa;
  secNo.textContent = ROMAN[si];
  for (const pc of PCS) {
    const f = flash[pc] || 0;
    const el = noteEls[pc];
    el.style.color = f > 0.03 ? PC_COLOR[pc] : `rgba(${INK},0.62)`;
    el.firstChild.style.background = f > 0.03 ? PC_COLOR[pc] : `rgba(${INK},0.22)`;
    el.firstChild.style.boxShadow = f > 0.03 && L.dark ? `0 0 ${Math.round(22 * f)}px ${PC_COLOR[pc]}` : "none";
    el.firstChild.style.transform = `scaleX(${(1 + 1.6 * f).toFixed(3)})`;
  }

  grade.uniforms.uTime.value = t;
  composer.render();
}

export function resize() {
  const box = canvas.getBoundingClientRect();
  W = Math.max(280, Math.round(box.width));
  H = Math.max(200, Math.round(box.height));
  PR = Math.min(window.devicePixelRatio || 1, quality.maxPR);
  renderer.setPixelRatio(PR);
  renderer.setSize(W, H, false);
  composer.setPixelRatio(PR);
  composer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  if (pearls) {
    pearls.material.uniforms.uScale.value = (H * PR) / (2 * Math.tan((L.fov * Math.PI) / 360));
    pearls.material.uniforms.uPx.value = PR;
  }
  if (stars) stars.material.size = Math.max(1.2, 2.2 * Math.min(1, Math.min(W, H) / 900)) * PR;
  grade.uniforms.uRes.value.set(W * PR, H * PR);
}
resize();
// which tile is under a point of the screen (client coordinates)? For tapping tiles like keys.
const tapped = new Float64Array(NH);
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
export function pick(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  ndc.set(((clientX - box.left) / box.width) * 2 - 1, -(((clientY - box.top) / box.height) * 2 - 1));
  ray.setFromCamera(ndc, camera);
  let best = -1;
  let bestD = Infinity;
  // tiles are small on screen: take the nearest tile within a finger's width of the ray
  const tol = 0.03 + 0.012 * (camera.position.distanceTo(camLook) || 1);
  for (let i = 0; i < NH; i++) {
    const d = ray.ray.distanceToPoint(padTop[i]);
    if (d < tol) {
      const along = padTop[i].distanceTo(camera.position);
      const score = d * 6 + along * 0.02;
      if (score < bestD) {
        bestD = score;
        best = i;
      }
    }
  }
  if (best < 0) return null;
  tapped[best] = performance.now();
  return { lane: hops[best].l, name: S.lanes[hops[best].l].name };
}
export const PITCH_CLASS = (lane) => pcOf(S.lanes[lane].name);
export { renderAt };

// Shur in g — the app: live sound, time, gestures and controls.
// Nothing here is a recording of the piece. The picture (app.js) is drawn from the time alone, and
// every note is triggered at the moment of its collision from a bank of single notes.
const $ = (id) => document.getElementById(id);

let app;
try {
  app = await import("./app.js");
} catch (err) {
  $("fail").style.display = "grid";
  $("home").style.display = "none";
  throw err;
}
const { renderAt, resize, view, rigAt, pick, S, T_LAST, T_REL, THEME, quality } = app;
document.documentElement.dataset.look = THEME;

const NOTES = window.NOTES || {};
const DUR = S.t_end;
const START_AT = T_REL - 0.7;      // "drop" begins just before the balls are let go
const IDLE_AT = T_REL - 0.9;       // the waiting picture behind the start screen
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------- this piece: titles, texts, the list of pieces
const titleHtml = S.title.replace(/ g$/, " <i>g</i>");
document.querySelector("#home h1").innerHTML = titleHtml;
document.querySelector("#hud-title .t").innerHTML = titleHtml;
document.querySelector("#about h2").innerHTML = titleHtml;
// a long title is set smaller, so that it fits the width of the screen
function fitTitle() {
  const el = document.querySelector("#home h1");
  el.style.fontSize = "";
  el.style.whiteSpace = "nowrap";
  const room = document.documentElement.clientWidth - 32;
  const probe = document.createRange();
  probe.selectNodeContents(el);
  const w = probe.getBoundingClientRect().width;
  if (w > room) el.style.fontSize = `${Math.max(16, (parseFloat(getComputedStyle(el).fontSize) * room) / w)}px`;
}
fitTitle();
addEventListener("resize", fitTitle);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
document.querySelectorAll('.fa[lang="fa"]').forEach((el) => (el.textContent = S.fa));
document.title = `${S.name}, played by gravity`;
$("done-name").textContent = `That was ${S.name}.`;
$("piece-text").textContent = (window.PIECES.find((p) => p.id === window.PIECE_ID) || {}).text || "";
document.querySelectorAll("[data-kind]").forEach((el) => (el.style.display = el.dataset.kind === S.kind ? "" : "none"));
function pieceLink(p, withSub) {
  const a = document.createElement("a");
  a.className = "piece";
  const q = new URLSearchParams(location.search);
  if (p.id === window.PIECES[0].id) q.delete("piece");
  else q.set("piece", p.id);
  a.href = `./${q.toString() ? "?" + q.toString() : ""}`;
  a.innerHTML = withSub ? `<span>${p.name}</span><small>${p.sub}</small>` : p.name;
  if (p.id === window.PIECE_ID) a.setAttribute("aria-current", "true");
  return a;
}
for (const p of window.PIECES) {
  $("pieces").appendChild(pieceLink(p, false));
  $("menu").appendChild(pieceLink(p, true));
}
$("piece-chip").addEventListener("click", () => $("menu").classList.toggle("open"));
if (window.PIECES.length < 2) for (const id of ["pieces", "piece-chip", "menu"]) $(id).style.display = "none";   // one piece: nothing to choose

// ---------------------------------------------------------------- facts in the text
const ys = S.pads.map((p) => p.c[1]);
const drop = Math.round(Math.max(...ys) - Math.min(...ys));
document.querySelectorAll(".n-hits").forEach((el) => (el.textContent = S.hits.length));
document.querySelectorAll(".n-score").forEach((el) => (el.textContent = S.n_score));
document.querySelectorAll(".n-drop").forEach((el) => (el.textContent = `${drop} m`));

// ---------------------------------------------------------------- the sound: one note per collision
const FILES = { santur: "snd/santur.m4a" };
const CUT = { piano: [1500, 2800, 5200, 20000], santur: [2200, 4200, 8000, 20000] };   // softer strokes are darker
const insts = Object.keys(FILES).filter((k) => NOTES[k]);
const asked = new URLSearchParams(location.search).get("sound");
let inst = insts.includes(asked) ? asked : insts[0];
const banks = {};
function bank(name) {
  if (!banks[name]) {
    banks[name] = {
      buffer: null,
      calib: 0,
      conv: null,
      data: fetch(FILES[name]).then((r) => {
        if (!r.ok) throw new Error("sound bank missing");
        return r.arrayBuffer();
      }),
    };
  }
  return banks[name];
}
if (inst) bank(inst);
let ctx = null;
let master = null;
let silent = !inst;

function unlock() {
  if (silent) return;
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const guard = ctx.createDynamicsCompressor();     // only catches the rare pile-up of loud notes
    guard.threshold.value = -8;
    guard.knee.value = 6;
    guard.ratio.value = 8;
    guard.attack.value = 0.003;
    guard.release.value = 0.2;
    master = ctx.createGain();
    master.connect(guard);
    guard.connect(ctx.destination);
  }
  if (ctx.state !== "running") ctx.resume();
}
function room(seconds) {
  // a small computed room: decaying noise, a little different left and right
  const n = Math.floor(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  let seed = 20261112;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let low = 0;
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      low += 0.35 * (rnd() - low);                     // darker tail
      d[i] = low * Math.exp((-6.9 * t) / seconds) * (1 - Math.exp(-t / 0.008));
    }
  }
  return buf;
}
// Compressed sound can start a few milliseconds off, depending on the browser. The first note of the
// bank starts at zero, so the decoded sound is measured against that.
function offsetOf(buf) {
  const d = buf.getChannelData(0);
  const n = Math.min(d.length, Math.floor(0.4 * buf.sampleRate));
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak < 1e-4) return 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(d[i]) > 0.06 * peak) {
      const off = i / buf.sampleRate - 0.0007;
      return off > -0.01 && off < 0.09 ? off : 0;
    }
  }
  return 0;
}
async function ready(name) {
  unlock();
  const b = bank(name);
  if (!b.buffer) {
    const data = await b.data;
    b.buffer = await new Promise((res, rej) => ctx.decodeAudioData(data.slice(0), res, rej));
    b.calib = offsetOf(b.buffer);
    b.conv = ctx.createConvolver();
    b.conv.buffer = room(NOTES[name].room);
    const wet = ctx.createGain();
    wet.gain.value = NOTES[name].wet;
    b.conv.connect(wet);
    wet.connect(master);
  }
  if (ctx.state !== "running") await ctx.resume();
  return b;
}
const live = new Set();
let strings = {};
const stat = { struck: 0 };          // for checks from the console: how many notes have been triggered
window.shurStat = () => ({ ...stat, audio: ctx ? ctx.state : "none", instrument: inst, speed, offset: banks[inst] ? banks[inst].calib : null });
function hush(node, when) {
  const t = Math.max(when, ctx.currentTime);
  node.g.gain.cancelScheduledValues(t);
  node.g.gain.setValueAtTime(node.level, t);
  node.g.gain.linearRampToValueAtTime(0, t + 0.028);
  try {
    node.src.stop(t + 0.04);
  } catch (e) {
    /* already stopped */
  }
}
function hushAll() {
  if (!ctx) return;
  for (const n of live) hush(n, ctx.currentTime);
  strings = {};
}
// one note: slot of the bank, when, how loud, how dark, and on which string (-1: it just rings on)
function strike(name, slot, when, amp, bucket, string) {
  const b = banks[name];
  if (!b || !b.buffer) return;
  const info = NOTES[name];
  const src = ctx.createBufferSource();
  src.buffer = b.buffer;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = CUT[name][bucket];
  lp.Q.value = 0.5;
  const g = ctx.createGain();
  const node = { src, g, level: amp * info.gain };
  g.gain.value = node.level;
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  g.connect(b.conv);
  src.start(when, Math.max(0, slot * info.slot + b.calib), info.slot - 0.06);
  stat.struck++;
  live.add(node);
  src.onended = () => {
    live.delete(node);
    g.disconnect();
  };
  if (string !== -1) {              // the next note on a string stops the one before it
    const key = `${name}:${string}`;
    if (strings[key]) hush(strings[key], when);
    strings[key] = node;
  }
}

// ---------------------------------------------------------------- time
let speed = 1;
let playing = false;
let started = false;
let tPaused = IDLE_AT;
let tBase = 0;
let cBase = 0;
let ptr = 0;
const clock = () => (ctx && !silent ? ctx.currentTime : performance.now() / 1000);
const latency = () => (ctx && !silent ? ctx.outputLatency || ctx.baseLatency || 0 : 0);
const filmNow = () => (playing ? Math.min(DUR, tBase + Math.max(0, clock() - cBase) * speed) : tPaused);
// what the eye should see now: the sound leaves the speakers a little late
const seen = () => (playing ? Math.max(tBase, filmNow() - latency() * speed) : tPaused);
function lower(plan, t) {
  let lo = 0;
  let hi = plan.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (plan[mid][0] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
let token = 0;
async function start(from) {
  const mine = ++token;
  if (!silent) {
    try {
      await ready(inst);
    } catch (err) {
      console.error(err);
      silent = true;
    }
  }
  if (mine !== token) return;
  hushAll();
  if (from >= DUR - 0.05) from = START_AT;
  tBase = from;
  cBase = clock() + 0.06;
  ptr = silent ? 0 : lower(NOTES[inst].plan, from);
  playing = true;
}
function pause() {
  token++;
  tPaused = filmNow();
  playing = false;
  hushAll();
}
function schedule() {
  if (!playing || silent || !ctx) return;
  const plan = NOTES[inst].plan;
  if (!banks[inst] || !banks[inst].buffer) return;
  // a hidden tab is only woken about once a second, so it plans further ahead
  const horizon = filmNow() + (document.hidden ? 1.8 : 0.14) * speed;
  while (ptr < plan.length && plan[ptr][0] <= horizon) {
    const n = plan[ptr++];
    const when = cBase + (n[0] - tBase) / speed;
    if (when > ctx.currentTime - 0.03) strike(inst, n[2], Math.max(when, ctx.currentTime), n[3], n[4], n[1]);
  }
}
async function touchNote(lane) {
  if (silent) return;
  try {
    await ready(inst);
  } catch (err) {
    console.error(err);
    return;
  }
  strike(inst, lane, ctx.currentTime + 0.01, 0.95, 3, "touch");
}

// ---------------------------------------------------------------- controls
const body = document.body;
const canvas = $("stage");
const toast = $("toast");
let toastTimer = 0;
function say(text, ms = 4600) {
  toast.textContent = text;
  toast.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.style.opacity = "0"), ms);
}

// instrument
const instBtns = [...document.querySelectorAll("[data-inst]")];
function showInst() {
  for (const el of instBtns) {
    el.style.display = insts.includes(el.dataset.inst) ? "" : "none";
    el.setAttribute("aria-pressed", String(el.dataset.inst === inst));
  }
}
showInst();
for (const el of instBtns) {
  el.addEventListener("click", async () => {
    const name = el.dataset.inst;
    if (name === inst) return;
    inst = name;
    bank(inst);
    showInst();
    if (!started || silent) return;
    try {
      await ready(inst);            // the old instrument keeps playing while the new one loads
    } catch (err) {
      console.error(err);
      return;
    }
    if (playing && inst === name) {
      hushAll();
      ptr = lower(NOTES[inst].plan, filmNow());
    }
  });
}

// drop, again, play and pause
const dropBtn = $("drop");
async function begin(from) {
  if (!started) dropBtn.textContent = "ONE MOMENT";
  dropBtn.disabled = true;
  await start(from);
  dropBtn.disabled = false;
  if (!started) {
    started = true;
    body.classList.add("started");
    say(silent ? "The sound could not be loaded. Drag to look around." : "Drag to look around. Tap a tile to play it.");
  }
}
dropBtn.addEventListener("click", () => begin(START_AT));
$("again").addEventListener("click", () => {
  follow();
  begin(START_AT);
});
const togglePath = $("toggle-path");
$("toggle").addEventListener("click", () => (playing ? pause() : begin(tPaused)));

// speed: slower without changing the pitch, because the notes are triggered one by one
const speedBtn = $("speed");
const SPEEDS = [1, 0.5, 0.25];
speedBtn.addEventListener("click", () => {
  const t = filmNow();
  speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  tBase = t;
  cBase = clock();
  speedBtn.textContent = speed === 1 ? "1×" : speed === 0.5 ? "½×" : "¼×";
  speedBtn.setAttribute("aria-pressed", String(speed !== 1));
});

// camera: it follows the balls on its own course until the visitor takes over
const camBtn = $("cam");
function showCam() {
  camBtn.textContent = view.free ? "FREE VIEW" : "FOLLOW";
  camBtn.setAttribute("aria-pressed", String(!view.free));
}
function takeOver() {
  if (view.free) return;
  const r = rigAt(seen());
  view.az = r.az + view.az + view.sway;
  view.el = clamp(r.el + view.el, -25, 84);
  view.sway = 0;
  view.free = true;
  showCam();
}
function follow() {
  view.free = false;
  view.az = 0;
  view.el = 0;
  view.zoom = 1;
  showCam();
}
camBtn.addEventListener("click", () => (view.free ? follow() : takeOver()));

// gestures on the picture: drag to turn, pinch or wheel to come closer, tap a tile to play it
const fingers = new Map();
let downAt = 0;
let moved = 0;
let last = null;
let pinch0 = 0;
let zoom0 = 1;
const spread = () => {
  const [a, b] = [...fingers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};
canvas.addEventListener("pointerdown", (e) => {
  $("menu").classList.remove("open");
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    /* a synthetic pointer cannot be captured */
  }
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (fingers.size === 1) {
    downAt = performance.now();
    moved = 0;
    last = { x: e.clientX, y: e.clientY };
  } else if (fingers.size === 2) {
    pinch0 = spread();
    zoom0 = view.zoom;
    moved = 99;
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!fingers.has(e.pointerId)) return;
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (fingers.size === 2) {
    view.zoom = clamp((zoom0 * pinch0) / Math.max(20, spread()), 0.3, 3);
  } else if (last) {
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 8) {
      takeOver();
      view.az -= dx * 0.25;
      view.el = clamp(view.el + dy * 0.2, -25, 84);
    }
    last = { x: e.clientX, y: e.clientY };
  }
});
function lift(e) {
  if (!fingers.has(e.pointerId)) return;
  const tap = e.type === "pointerup" && fingers.size === 1 && moved <= 8 && performance.now() - downAt < 450;
  fingers.delete(e.pointerId);
  last = null;
  if (tap) {
    const hit = pick(e.clientX, e.clientY);
    if (hit) touchNote(hit.lane);
  }
}
canvas.addEventListener("pointerup", lift);
canvas.addEventListener("pointercancel", lift);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    view.zoom = clamp(view.zoom * Math.exp(e.deltaY * 0.0012), 0.3, 3);
  },
  { passive: false },
);

// the note names at the bottom are keys too
const laneOf = {};
S.lanes.forEach((l, i) => {
  const pc = l.name.replace(/[0-9]/g, "");
  if (!(pc in laneOf) && i >= 3) laneOf[pc] = i;      // the middle octave
});
$("scale").addEventListener("click", (e) => {
  const el = e.target.closest(".note");
  if (!el || !(el.dataset.pc in laneOf)) return;
  touchNote(laneOf[el.dataset.pc]);
  el.animate([{ transform: "translateY(-4px)" }, { transform: "none" }], { duration: 260, easing: "ease-out" });
});

// chapters: the parts of the piece, as one line you can touch
const chapters = $("chapters");
const bounds = [0, ...S.sections.slice(1).map((s) => s.t), DUR];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
const named = new Set(S.sections.map((s) => s.en)).size > 1;       // parts with names of their own
const chaps = S.sections.map((s, i) => {
  const el = document.createElement("div");
  el.className = "chap";
  el.style.flex = `${bounds[i + 1] - bounds[i]} 1 0`;
  // many short parts: their numbers would run into each other, so only the line is drawn
  const no = S.sections.length > 8 ? "&nbsp;" : ROMAN[i] || "";
  el.innerHTML = `<div class="name">${no}${named ? `<span class="long"> · ${s.en}</span>` : ""}</div><div class="line"><span></span></div>`;
  chapters.appendChild(el);
  return { el, fill: el.querySelector(".line span") };
});
function timeAt(clientX) {
  for (let i = 0; i < chaps.length; i++) {
    const r = chaps[i].el.getBoundingClientRect();
    if (clientX <= r.right + 2 || i === chaps.length - 1) {
      return bounds[i] + clamp((clientX - r.left) / r.width, 0, 1) * (bounds[i + 1] - bounds[i]);
    }
  }
  return 0;
}
let dragChap = false;
let resumeAfter = false;
chapters.addEventListener("pointerdown", (e) => {
  try {
    chapters.setPointerCapture(e.pointerId);
  } catch (err) {
    /* a synthetic pointer cannot be captured */
  }
  dragChap = true;
  resumeAfter = playing;
  if (playing) pause();
  tPaused = timeAt(e.clientX);
});
chapters.addEventListener("pointermove", (e) => {
  if (dragChap) tPaused = timeAt(e.clientX);
});
const endChap = () => {
  if (!dragChap) return;
  dragChap = false;
  if (resumeAfter) begin(tPaused);
};
chapters.addEventListener("pointerup", endChap);
chapters.addEventListener("pointercancel", endChap);

// the "about" sheet
const about = $("about");
document.querySelectorAll("[data-about]").forEach((el) => el.addEventListener("click", () => about.classList.toggle("open")));
$("close").addEventListener("click", () => about.classList.remove("open"));

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") about.classList.remove("open");
  if (!started) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (playing) pause();
    else begin(tPaused);
  } else if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
    const t = clamp(filmNow() + (e.code === "ArrowRight" ? 5 : -5), 0, DUR);
    if (playing) begin(t);
    else tPaused = t;
  } else if (e.code === "KeyF") {
    follow();
  }
});

window.addEventListener("resize", resize);
document.addEventListener("fullscreenchange", resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

// ---------------------------------------------------------------- the loop
const top = $("top");
const done = $("done");
top.style.opacity = "0";
let lastTs = 0;
let acc = 0;
let nAcc = 0;
let downgrades = 0;

function frame(ts) {
  const dt = Math.min(0.1, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  schedule();
  if (playing && filmNow() >= DUR) {
    pause();
    tPaused = DUR;
  }
  const t = seen();
  // before the drop the camera breathes a little; afterwards that fades out
  if (!started && !view.free) view.sway = 7 * Math.sin(ts / 3800);
  else view.sway *= Math.exp(-dt / 0.8);
  renderAt(t);

  top.style.opacity = started ? "1" : "0";
  done.classList.toggle("show", started && t >= T_LAST + 6.5 && !about.classList.contains("open"));
  for (let i = 0; i < chaps.length; i++) {
    const f = clamp((t - bounds[i]) / (bounds[i + 1] - bounds[i]), 0, 1);
    chaps[i].fill.style.width = `${f * 100}%`;
    chaps[i].el.classList.toggle("on", t >= bounds[i] && t < bounds[i + 1]);
  }
  const want = playing ? "M1 0h3v10H1zM6 0h3v10H6z" : "M1 0l9 5-9 5z";
  if (togglePath.getAttribute("d") !== want) {
    togglePath.setAttribute("d", want);
    $("toggle").setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  // slow machine: draw fewer pixels rather than drop frames
  if (playing) {
    acc += dt;
    if (++nAcc === 90) {
      if (acc / nAcc > 0.024 && quality.maxPR > 1 && downgrades < 2) {
        quality.maxPR = Math.max(1, quality.maxPR - 0.5);
        downgrades++;
        resize();
      }
      acc = 0;
      nAcc = 0;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(schedule, 80);          // keeps the notes coming when the picture is not being drawn

// installable: the page keeps working without a connection once it has been opened
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

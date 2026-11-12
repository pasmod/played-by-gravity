// Shur in g — the player: sound, time and controls.
// The picture (app.js) is drawn from the time alone; the time is the clock of the sound.
const $ = (id) => document.getElementById(id);

let app;
try {
  app = await import("./app.js");
} catch (err) {
  $("fail").style.display = "grid";
  $("card-title").style.display = "none";
  $("more").style.display = "none";
  throw err;
}
const { renderAt, resize, view, S, T_LAST, T_REL, THEME, quality } = app;
document.documentElement.dataset.look = THEME;

const DUR = S.t_end;
const T0 = S.t0;
const START_AT = 0.9;          // where "play" begins: just before the title fades
const IDLE_AT = 2.2;           // the still picture behind the title before anyone presses play

// ---------------------------------------------------------------- facts in the text
const ys = S.pads.map((p) => p.c[1]);
const drop = Math.round(Math.max(...ys) - Math.min(...ys));
document.querySelectorAll(".n-hits").forEach((el) => (el.textContent = S.hits.length));
document.querySelectorAll(".n-score").forEach((el) => (el.textContent = S.n_score));
document.querySelectorAll(".n-drop").forEach((el) => (el.textContent = `${drop} m`));

// ---------------------------------------------------------------- sound
// Two computed instruments play the same collisions: a setar (plucked) and a santur (struck).
const SOUNDS = { setar: "setar.m4a", santur: "santur.m4a" };
let inst = new URLSearchParams(location.search).get("sound") === "santur" ? "santur" : "setar";
const sounds = {};
function sound(name) {
  if (!sounds[name]) {
    sounds[name] = {
      buffer: null,
      calib: 0,
      data: fetch(SOUNDS[name]).then((r) => {
        if (!r.ok) throw new Error("sound file missing");
        return r.arrayBuffer();
      }),
    };
  }
  return sounds[name];
}
sound(inst);
let ctx = null;
let gain = null;
let source = null;

// Compressed sound can start a few milliseconds late or early, depending on the browser.
// The first strike of the piece is at T0, so the decoded sound is measured against it.
function findOffset(buf) {
  const sr = buf.sampleRate;
  const d = buf.getChannelData(0);
  const i0 = Math.max(0, Math.floor((T0 - 0.2) * sr));
  const i1 = Math.min(d.length, Math.floor((T0 + 0.3) * sr));
  let peak = 0;
  for (let i = i0; i < i1; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak < 1e-4) return 0;
  for (let i = i0; i < i1; i++) {
    if (Math.abs(d[i]) > 0.06 * peak) {
      const off = i / sr - (T0 + 0.0006);
      return Math.abs(off) < 0.15 ? off : 0;
    }
  }
  return 0;
}

async function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    gain = ctx.createGain();
    gain.connect(ctx.destination);
  }
  if (ctx.state !== "running") ctx.resume();       // inside the click, as phones require
  const snd = sound(inst);
  if (!snd.buffer) {
    const data = await snd.data;
    snd.buffer = await new Promise((res, rej) => ctx.decodeAudioData(data.slice(0), res, rej));
    snd.calib = findOffset(snd.buffer);
  }
  if (ctx.state !== "running") await ctx.resume();
  return snd;
}

// ---------------------------------------------------------------- time
let playing = false;
let started = false;
let silent = false;            // if the sound cannot be decoded, the piece still plays, on a plain clock
let wallStart = 0;
let tPaused = IDLE_AT;
let tStart = 0;
let ctxStart = 0;

const latency = () => (ctx ? ctx.outputLatency || ctx.baseLatency || 0 : 0);
function now() {
  if (!playing) return tPaused;
  const run = silent ? performance.now() / 1000 - wallStart : Math.max(0, ctx.currentTime - ctxStart - latency());
  return Math.min(DUR, tStart + run);
}
function stopSource() {
  if (!source) return;
  try {
    source.stop();
  } catch (e) {
    /* already stopped */
  }
  source.disconnect();
  source = null;
}
let token = 0;
async function play(from) {
  const mine = ++token;
  let snd = null;
  if (!silent) {
    try {
      snd = await ensureAudio();
    } catch (err) {
      console.error(err);
      silent = true;
    }
  }
  if (mine !== token) return;
  stopSource();
  if (from >= DUR - 0.05) from = START_AT;
  if (silent) {
    wallStart = performance.now() / 1000;
    tStart = from;
    playing = true;
    return;
  }
  source = ctx.createBufferSource();
  source.buffer = snd.buffer;
  source.connect(gain);
  const when = ctx.currentTime + 0.08;
  source.start(when, Math.max(0, from + snd.calib));
  ctxStart = when;
  tStart = from;
  playing = true;
}
function pause() {
  token++;
  tPaused = now();
  stopSource();
  playing = false;
}

// ---------------------------------------------------------------- controls
const body = document.body;
const playBig = $("play-big");
const toggle = $("toggle");
const togglePath = $("toggle-path");
const scrub = $("scrub");
const fill = $("fill");
const timeEl = $("time");
const hint = $("hint");
const again = $("again");
const wrap = $("stage-wrap");
const canvas = $("stage");
scrub.max = String(DUR);
for (const s of S.sections.slice(1)) {
  const tick = document.createElement("span");
  tick.className = "tick";
  tick.style.left = `${(s.t / DUR) * 100}%`;
  $("scrub-wrap").insertBefore(tick, scrub);
}
const PATH_PAUSE = "M1 0h3v10H1zM6 0h3v10H6z";
const PATH_PLAY = "M1 0l9 5-9 5z";
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

async function begin(from) {
  const label = playBig.querySelector("span");
  if (!sound(inst).buffer) label.textContent = "LOADING";
  await play(from);
  if (!started) {
    started = true;
    body.classList.add("started");
    hint.textContent = silent ? "The sound could not be loaded. Drag to look around" : hint.textContent;
    hint.style.opacity = "1";
    setTimeout(() => (hint.style.opacity = "0"), 5200);
  }
}
playBig.addEventListener("click", () => begin(START_AT));
again.addEventListener("click", () => begin(START_AT));
toggle.addEventListener("click", () => (playing ? pause() : begin(tPaused)));

// the instrument switch: the picture stays, only the computed sound changes
const instBtns = { setar: $("inst-setar"), santur: $("inst-santur") };
function showInst() {
  for (const [name, el] of Object.entries(instBtns)) el.setAttribute("aria-pressed", String(name === inst));
}
showInst();
for (const [name, el] of Object.entries(instBtns)) {
  el.addEventListener("click", async () => {
    if (name === inst) return;
    inst = name;
    showInst();
    if (!playing || silent) return;
    try {
      await ensureAudio();           // the old sound keeps playing while the new one loads
    } catch (err) {
      console.error(err);
      return;
    }
    if (playing && inst === name) begin(now());
  });
}

let resumeAfterScrub = false;
let scrubbing = false;
scrub.addEventListener("input", () => {
  if (!scrubbing) {
    scrubbing = true;
    resumeAfterScrub = playing;
    if (playing) pause();
  }
  tPaused = Number(scrub.value);
});
scrub.addEventListener("change", () => {
  scrubbing = false;
  tPaused = Number(scrub.value);
  if (resumeAfterScrub) begin(tPaused);
});

const fullBtn = $("full");
if (!wrap.requestFullscreen) fullBtn.style.display = "none";
fullBtn.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else wrap.requestFullscreen().catch(() => {});
});

window.addEventListener("keydown", (e) => {
  if (!started || e.target === scrub) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (playing) pause();
    else begin(tPaused);
  } else if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
    const t = Math.min(DUR, Math.max(0, now() + (e.code === "ArrowRight" ? 5 : -5)));
    if (playing) begin(t);
    else tPaused = t;
  }
});

// drag to look around: the camera keeps its course, the visitor adds a turn on top
let dragging = false;
let px = 0;
let py = 0;
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  px = e.clientX;
  py = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  view.az = Math.max(-80, Math.min(80, view.az - (e.clientX - px) * 0.22));
  view.el = Math.max(-30, Math.min(40, view.el + (e.clientY - py) * 0.18));
  px = e.clientX;
  py = e.clientY;
});
const endDrag = () => (dragging = false);
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

window.addEventListener("resize", resize);
document.addEventListener("fullscreenchange", resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

// ---------------------------------------------------------------- the loop
const ramp = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const titleCard = $("card-title");
const endCard = $("card-end");
const hud = $("hud");
let lastTs = 0;
let acc = 0;
let nAcc = 0;
let downgrades = 0;

function frame(ts) {
  const dt = Math.min(0.1, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  let t = now();
  if (playing && t >= DUR) {
    pause();
    tPaused = t = DUR;
  }
  if (!dragging && playing) {          // the visitor's turn eases back while the piece plays
    const k = Math.exp(-dt / 1.6);
    view.az *= k;
    view.el *= k;
  }
  renderAt(t);

  const title = ramp(t, 0.4, 1.4) * (1 - ramp(t, T_REL - 0.75, T_REL - 0.05));
  titleCard.style.opacity = title.toFixed(3);
  titleCard.style.visibility = title < 0.01 ? "hidden" : "visible";
  playBig.style.opacity = started ? "0" : "1";
  playBig.style.pointerEvents = started ? "none" : "auto";
  hud.style.opacity = (ramp(t, T_REL + 0.1, T_REL + 1.0) * (1 - ramp(t, T_LAST + 2.6, T_LAST + 4.0))).toFixed(3);
  const end = ramp(t, T_LAST + 4.4, T_LAST + 6.0);
  endCard.style.opacity = end.toFixed(3);
  endCard.style.visibility = end < 0.01 ? "hidden" : "visible";
  const over = t >= DUR - 1.2 ? "1" : "0";
  again.style.opacity = over;
  again.style.pointerEvents = over === "1" ? "auto" : "none";
  if (!scrubbing) scrub.value = String(t);
  fill.style.width = `${(t / DUR) * 100}%`;
  timeEl.textContent = `${fmt(t)} / ${fmt(DUR)}`;
  const wantPath = playing ? PATH_PAUSE : PATH_PLAY;
  if (togglePath.getAttribute("d") !== wantPath) {
    togglePath.setAttribute("d", wantPath);
    toggle.setAttribute("aria-label", playing ? "Pause" : "Play");
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

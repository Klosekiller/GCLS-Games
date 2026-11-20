// Shush! Keep the library calm: tap noisy patrons before the noise meter fills.

// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width,
  H = canvas.height;

// ---------- Tunables (units: ms, noise points) ----------
const NOISE_MAX = 100;
const NOISE_DECAY = 4; // noise points that fade away per second
const RAMP_MS = 1200; // a new noisy patron takes this long to get to full volume
const LEVEL_MS = 20000; // a new level every 20 seconds
const POP_MS = 260; // pop-in animation
const CALM_MS = 1600; // how long a shushed patron stays (reading) before leaving
const READER_MS = 3800; // how long a quiet reader stays
const LEAVE_MS = 350;
const MISTAKE_NOISE = 10; // shushing a quiet reader adds this much noise
const STREAK_EVERY = 5,
  STREAK_BONUS = 25;
const WALL_Y = 220; // where the wall meets the floor

// Each noisy patron adds `rate` noise points per second (giggles: per giggling kid).
// `unlock` is the level where that kind of noise starts showing up.
const TYPES = {
  phone: { rate: 9, word: "Ring ring!", unlock: 1 },
  squeak: { rate: 6, word: "Squeak!", unlock: 1 },
  crinkle: { rate: 7, word: "Crinkle!", unlock: 1 },
  headphones: { rate: 5, word: "♪ ♫ ♪", unlock: 2 },
  giggle: { rate: 6, word: "Hee hee!", unlock: 3 },
  toy: { rate: 8, word: "Beep boop!", unlock: 4 },
};

// ---------- Palette (from the library) ----------
const PAPER = "#f3ead7";
const GOLD = "#d4a64a";
const MAPLE = "#d7a35e";
const NAVY = "#34404f";
const RIBBON_RED = "#c92a2f",
  RIBBON_BLUE = "#3d4c8c",
  RIBBON_YELLOW = "#e8b52a";
const BRIGHT = ["#d94b4b", "#4b79d9", "#f2c14e", "#5cb85c", "#9b59b6", "#f39c4a", "#3aa6a6"];
const SKINS = ["#f1c7a5", "#e0a77f", "#c68642", "#8d5524", "#5c3a21"];
const HAIRS = ["#2b1b12", "#6b3e1f", "#d9a441", "#1a1a1a", "#a0522d", "#8a8a8a"];
const SHIRTS = ["#d94b4b", "#4b79d9", "#f2c14e", "#5cb85c", "#9b59b6", "#f39c4a", "#3aa6a6", "#e8e8e8"];

// Six places where patrons show up: a back row by the computers and a front row
// with the polka-dot armchairs and the kids' table. Keys 1–6 match this order.
const SPOTS = [
  { cx: 150, by: 285, s: 0.8, kind: "computer" },
  { cx: 400, by: 285, s: 0.8, kind: "round" },
  { cx: 650, by: 285, s: 0.8, kind: "computer" },
  { cx: 150, by: 432, s: 1, kind: "armchair" },
  { cx: 400, by: 432, s: 1, kind: "kidstable" },
  { cx: 650, by: 432, s: 1, kind: "armchair" },
];
// where a patron's seat is, relative to the spot
const SEAT = {
  computer: [10, -46],
  round: [0, -44],
  kidstable: [0, -46],
  armchair: [0, -42],
};

// ---------- State ----------
let occupants = Array(SPOTS.length).fill(null);
let noise = 0,
  score = 0,
  shushed = 0,
  streak = 0,
  elapsed = 0,
  level = 1,
  spawnTimer = 0,
  warnTimer = 0;
let particles = [],
  popups = [];
let state = "ready"; // ready | playing | paused | over
let best = Number(safeGet("shush-best")) || 0;
let time = 0;

function startGame() {
  occupants = Array(SPOTS.length).fill(null);
  noise = 0;
  score = 0;
  shushed = 0;
  streak = 0;
  elapsed = 0;
  level = 1;
  spawnTimer = 800;
  warnTimer = 0;
  particles = [];
  popups = [];
  state = "playing";
  sfx.start();
}

// ---------- Patrons ----------
function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}
function makeLook() {
  return { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), style: (Math.random() * 4) | 0 };
}

function seatOf(i) {
  const sp = SPOTS[i];
  const [dx, dy] = SEAT[sp.kind];
  return { x: sp.cx + dx * sp.s, y: sp.by + dy * sp.s, s: sp.s };
}

function spawn(dt) {
  spawnTimer -= dt;
  if (spawnTimer > 0) return;
  const interval = Math.max(650, 2300 - (level - 1) * 220);
  spawnTimer = interval * (0.7 + Math.random() * 0.6);

  const free = occupants.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  if (!free.length) return;
  const i = pick(free);

  let type;
  if (level >= 2 && Math.random() < 0.22) type = "reader";
  else type = pick(Object.keys(TYPES).filter((k) => TYPES[k].unlock <= level));

  occupants[i] = {
    spot: i,
    type,
    state: type === "reader" ? "reader" : "noisy",
    t: 0,
    age: 0,
    appear: 0,
    look: makeLook(),
    look2: makeLook(),
    kidsLeft: type === "giggle" ? 2 : 1,
    phase: Math.random() * Math.PI * 2,
    shake: 0,
  };
  if (type !== "reader") sfx.cue[type]();
}

function ramp(p) {
  return Math.min(1, p.age / RAMP_MS);
}

function leave(p) {
  p.state = "leaving";
  p.t = 0;
}

function tapSpot(i) {
  if (state !== "playing") return;
  const p = occupants[i];
  if (!p || p.state === "leaving" || p.state === "calm") return;
  const seat = seatOf(i);
  const headY = seat.y - 90 * seat.s;

  if (p.state === "reader") {
    // Oops: they were already being quiet
    noise = Math.min(NOISE_MAX, noise + MISTAKE_NOISE);
    streak = 0;
    p.shake = 400;
    sfx.oops();
    popup("Oops! Just reading", seat.x, headY, "#f2c14e");
    return;
  }

  sfx.shush();
  burst(seat.x, headY + 20 * seat.s, 8, "#bfe3ff");

  if (p.type === "giggle" && p.kidsLeft > 1) {
    // one giggling kid settles down; the other is still going
    p.kidsLeft--;
    score += 5;
    popup("+5", seat.x, headY);
    return;
  }

  const pts = 10 + Math.max(0, Math.round(10 - p.age / 300)); // quicker shush, more points
  p.state = "calm";
  p.t = 0;
  p.kidsLeft = 0;
  score += pts;
  shushed++;
  streak++;
  popup("+" + pts, seat.x, headY);
  if (streak % STREAK_EVERY === 0) {
    score += STREAK_BONUS;
    sfx.sparkle();
    popup("So quiet! +" + STREAK_BONUS, seat.x, headY - 30, "#bfe3ff");
  }
}

function gameOver() {
  state = "over";
  sfx.over();
  score = Math.floor(score);
  if (score > best) {
    best = score;
    safeSet("shush-best", best);
  }
}

// ---------- Update ----------
function update(dt) {
  time += dt;
  updateFx(dt);
  if (state !== "playing") return;

  elapsed += dt;
  score += dt * 0.002; // 2 points per second of calm

  const newLevel = 1 + Math.floor(elapsed / LEVEL_MS);
  if (newLevel > level) {
    level = newLevel;
    sfx.level();
    popup("Level " + level, W / 2, 110, PAPER);
  }

  spawn(dt);

  let rate = 0;
  occupants.forEach((p, i) => {
    if (!p) return;
    p.t += dt;
    p.appear = Math.min(1, p.appear + dt / POP_MS);
    p.shake = Math.max(0, p.shake - dt);
    if (p.state === "noisy") {
      p.age += dt;
      rate += TYPES[p.type].rate * ramp(p) * p.kidsLeft;
    } else if (p.state === "reader" && p.t > READER_MS) leave(p);
    else if (p.state === "calm" && p.t > CALM_MS) leave(p);
    else if (p.state === "leaving" && p.t > LEAVE_MS) occupants[i] = null;
  });

  noise = Math.max(0, noise + ((rate - NOISE_DECAY) * dt) / 1000);
  if (noise >= NOISE_MAX) {
    noise = NOISE_MAX;
    return gameOver();
  }

  // soft heartbeat when it's getting too loud
  if (noise > 75) {
    warnTimer -= dt;
    if (warnTimer <= 0) {
      sfx.warn();
      warnTimer = 700;
    }
  } else warnTimer = 0;
}

// ---------- Particles & popups ----------
function burst(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -0.03 - Math.random() * 0.08,
      life: 600 + Math.random() * 400,
      color,
    });
  }
}
function popup(text, x, y, color = PAPER) {
  popups.push({ text, x, y, color, life: 900 });
}
function updateFx(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) {
    p.y -= 0.035 * dt;
    p.life -= dt;
  }
  popups = popups.filter((p) => p.life > 0);
}

// ---------- Sound (Web Audio API, no files needed) ----------
let audio = null;
let muted = safeGet("shush-muted") === "1";

function ac() {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
  return audio;
}

function tone(freqStart, freqEnd, duration, type = "sine", volume = 0.08, delay = 0) {
  if (muted) return;
  try {
    const a = ac();
    const t = a.currentTime + delay;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + duration);
  } catch {
    // no audio support: play silently
  }
}

// Filtered white noise: a soft "shhh", or a crinkle.
function hiss(duration, volume, freq, q = 0.8, delay = 0) {
  if (muted) return;
  try {
    const a = ac();
    const t = a.currentTime + delay;
    const len = Math.ceil(a.sampleRate * duration);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const filter = a.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + Math.min(0.06, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start(t);
    src.stop(t + duration);
  } catch {
    // no audio support
  }
}

// Noise cues are kept gentle on purpose: it's a library!
const sfx = {
  cue: {
    phone: () => [0, 0.09, 0.18].forEach((d) => tone(1320, 1320, 0.06, "sine", 0.04, d)),
    squeak: () => tone(900, 1500, 0.12, "sine", 0.04),
    crinkle: () => [0, 0.05, 0.11].forEach((d) => hiss(0.05, 0.05, 5000, 1.5, d)),
    headphones: () => [660, 784, 880].forEach((f, i) => tone(f, f, 0.09, "triangle", 0.035, i * 0.1)),
    giggle: () => [700, 820, 700, 860].forEach((f, i) => tone(f, f * 1.1, 0.06, "triangle", 0.04, i * 0.08)),
    toy: () => {
      tone(880, 880, 0.07, "square", 0.025);
      tone(587, 587, 0.09, "square", 0.025, 0.09);
    },
  },
  shush: () => hiss(0.45, 0.22, 3200, 0.7),
  oops: () => {
    tone(330, 260, 0.12, "triangle", 0.08);
    tone(260, 200, 0.16, "triangle", 0.08, 0.12);
  },
  sparkle: () => [1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.1, "sine", 0.07, i * 0.06)),
  warn: () => tone(70, 55, 0.14, "sine", 0.15),
  level: () => [392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.1, "triangle", 0.08, i * 0.08)),
  over: () => tone(500, 220, 0.6, "triangle", 0.1),
  start: () => {
    tone(523, 523, 0.08, "triangle", 0.1);
    tone(784, 784, 0.12, "triangle", 0.1, 0.08);
  },
};

const muteBtn = document.getElementById("mute");
function updateMuteLabel() {
  if (muteBtn) muteBtn.textContent = muted ? "Sound: off" : "Sound: on";
}
function toggleMute() {
  muted = !muted;
  safeSet("shush-muted", muted ? "1" : "0");
  updateMuteLabel();
  if (!muted) tone(660, 660, 0.08, "sine", 0.1);
}
updateMuteLabel();
if (muteBtn) muteBtn.addEventListener("click", toggleMute);

// ---------- Library logo ----------
// Drawn on a white badge so the brand colors stay true on any background.
const LOGO = new Image();
LOGO.src = "logo-icon.svg";
const LOGO_RATIO = 122 / 182; // width / height of the icon
function drawLogo(cx, top, h) {
  const w = h * LOGO_RATIO,
    pad = h * 0.18;
  ctx.fillStyle = "#ffffff";
  roundRect(cx - w / 2 - pad, top, w + pad * 2, h + pad * 2, Math.min(8, pad * 1.5));
  if (LOGO.complete && LOGO.naturalWidth) ctx.drawImage(LOGO, cx - w / 2, top + pad, w, h);
}

// ---------- Drawing helpers ----------
function hash(a, b) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function R(x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}
function oval(x, y, rx, ry, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function poly(c, ...pts) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}
function text(str, x, y, font, color, align = "center") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
}
function line(x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineCap = "butt";
}

// ---------- The room: the children's area ----------
function ribbon(baseY, amp, thickness, phase, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 10) {
    const y = baseY + Math.sin(x * 0.012 + phase) * amp;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let x = W; x >= 0; x -= 10) {
    ctx.lineTo(x, baseY + Math.sin(x * 0.012 + phase) * amp + thickness + Math.sin(x * 0.02 + phase) * 3);
  }
  ctx.fill();
}

function lowShelf(x, y, w, h, seed) {
  R(x, y, w, h, "#cda46c");
  R(x + 4, y + 4, w - 8, h - 8, "#efe6d4");
  let bx = x + 6;
  for (let k = 0; ; k++) {
    const rnd = hash(seed, k);
    const bw = 4 + rnd * 5;
    if (bx + bw > x + w - 6) break;
    const bh = (h - 10) * (0.6 + hash(k, seed + 3) * 0.35);
    R(bx, y + h - 5 - bh, bw, bh, BRIGHT[(rnd * BRIGHT.length) | 0]);
    bx += bw + 1;
  }
}

function drawRoom() {
  // ceiling, lights and the wavy banners
  R(0, 0, W, 64, "#2b2b30");
  R(0, 0, W, 12, "#e9e6df");
  for (let i = 0; i * 90 < W; i++) R(15 + i * 90, 22, 55, 3, "#f1eee4");
  R(0, 64, W, WALL_Y - 64, "#8b919a");
  R(0, 64, 260, WALL_Y - 64, "#aab3c1");
  text("a b c", 130, 150, "bold 72px Georgia, serif", "rgba(70, 85, 130, 0.22)");
  ribbon(40, 10, 9, 4.0, "#f1f0ec");
  ribbon(34, 12, 12, 1.4, RIBBON_YELLOW);
  ribbon(14, 7, 26, 2.6, RIBBON_BLUE);
  ribbon(18, 6, 32, 0.0, RIBBON_RED);
  const cones = ["#3a5bd0", RIBBON_RED, "#e8743a"];
  for (let i = 0; i < 7; i++) {
    const lx = 60 + i * 115,
      ly = 74 + (i % 3) * 8;
    R(lx, 60, 1, ly - 60, "#555");
    poly(cones[i % 3], lx - 6, ly + 10, lx, ly, lx + 7, ly + 10);
  }

  // wall: red columns, logo sign, bulletin board, Summer Reading banner
  for (const cx of [0, W - 26]) {
    R(cx, 56, 26, WALL_Y - 56, "#c62a2f");
    R(cx + 18, 56, 8, WALL_Y - 56, "#a31f24");
  }
  drawLogo(300, 86, 46);
  R(350, 88, 150, 56, "#c9c6c0");
  R(350, 88, 150, 4, RIBBON_YELLOW);
  R(350, 140, 150, 4, "#5cb85c");
  for (let i = 0; i < 5; i++) R(362 + i * 27, 100 + (i % 2) * 8, 18, 24, i === 2 ? "#4b79d9" : "#fbfaf6");
  R(560, 84, 130, 56, "#4caa3a");
  text("SUMMER", 625, 107, "bold 15px system-ui, sans-serif", "#fff");
  text("READING", 625, 127, "bold 15px system-ui, sans-serif", "#fff");

  // low shelves along the wall
  lowShelf(30, 168, 230, 52, 1);
  lowShelf(300, 176, 200, 44, 2);
  lowShelf(540, 168, 230, 52, 3);
  // the black bear and white horse plush on top
  oval(110, 154, 16, 13, "#1c1817");
  oval(126, 141, 10, 9, "#1c1817");
  oval(120, 133, 4, 4, "#1c1817");
  oval(132, 133, 4, 4, "#1c1817");
  oval(680, 156, 20, 11, "#f2f0ea");
  oval(700, 141, 7, 11, "#f2f0ea");
  R(673, 150, 14, 7, "#222");

  // floor: blue carpet band, then the beige carpet
  R(0, WALL_Y, W, 110, "#5e6e8b");
  R(0, WALL_Y, W, 3, "rgba(0, 0, 0, 0.2)");
  R(0, WALL_Y + 110, W, H - WALL_Y - 110, "#c3b493");
  for (let k = 0; k < 260; k++) {
    R(hash(k, 1) * W, WALL_Y + 112 + hash(k, 2) * (H - WALL_Y - 114), 2, 1, "#a99a7a");
  }
}

// ---------- Furniture (back part behind the patron, front part in front) ----------
function polkaDots(x, y, w, h, seed, s) {
  for (let i = 0; i < 16; i++) {
    oval(x + 5 * s + hash(i, seed) * (w - 10 * s), y + 5 * s + hash(seed, i) * (h - 10 * s), 2.6 * s, 2.6 * s, BRIGHT[i % BRIGHT.length]);
  }
}

function furnitureBack(sp, i) {
  const { cx, by, s } = sp;
  if (sp.kind === "computer") {
    ctx.fillStyle = "#1d1d20"; // office chair back
    roundRect(cx - 8 * s, by - 96 * s, 36 * s, 40 * s, 8 * s);
  } else if (sp.kind === "armchair") {
    ctx.fillStyle = "#b8262c";
    roundRect(cx - 52 * s, by - 118 * s, 104 * s, 80 * s, 14 * s);
    polkaDots(cx - 52 * s, by - 118 * s, 104 * s, 70 * s, i * 7, s);
  } else if (sp.kind === "kidstable") {
    // red chair back with the cut-out holes, like the photo
    ctx.fillStyle = "#c62a2f";
    roundRect(cx - 26 * s, by - 100 * s, 52 * s, 44 * s, 6 * s);
    for (let k = 0; k < 4; k++) oval(cx - 15 * s + k * 10 * s, by - 92 * s, 2.5 * s, 2.5 * s, "#8b1f22");
  }
}

function furnitureFront(sp, i) {
  const { cx, by, s } = sp;
  if (sp.kind === "computer") {
    // monitor off to the side so faces stay visible
    R(cx - 62 * s, by - 100 * s, 42 * s, 32 * s, "#1b1b1e");
    R(cx - 59 * s, by - 97 * s, 36 * s, 26 * s, "#5b3fa6");
    R(cx - 43 * s, by - 68 * s, 4 * s, 10 * s, "#222");
    R(cx - 68 * s, by - 58 * s, 136 * s, 7 * s, "#e6e8ea");
    R(cx - 60 * s, by - 51 * s, 120 * s, 34 * s, "#c5c9ce");
    for (let py = by - 47 * s; py < by - 22 * s; py += 6 * s)
      for (let px = cx - 56 * s; px < cx + 56 * s; px += 6 * s) R(px, py, 2 * s, 2 * s, "#aab0b6");
    R(cx - 56 * s, by - 51 * s, 5 * s, 51 * s, "#b8bdc3");
    R(cx + 51 * s, by - 51 * s, 5 * s, 51 * s, "#b8bdc3");
  } else if (sp.kind === "round") {
    R(cx - 6 * s, by - 46 * s, 12 * s, 44 * s, "#8f6a3a");
    oval(cx, by - 2 * s, 30 * s, 5 * s, "#8f6a3a");
    oval(cx, by - 50 * s, 74 * s, 13 * s, "#b98a4e");
    oval(cx, by - 53 * s, 74 * s, 13 * s, MAPLE);
    // a little stack of picture books on the table
    R(cx + 36 * s, by - 62 * s, 22 * s, 5 * s, "#4b79d9");
    R(cx + 38 * s, by - 67 * s, 18 * s, 5 * s, "#f2c14e");
  } else if (sp.kind === "kidstable") {
    R(cx - 76 * s, by - 56 * s, 152 * s, 9 * s, "#e9d7a8");
    R(cx - 76 * s, by - 48 * s, 152 * s, 3 * s, "#c9b382");
    R(cx - 70 * s, by - 46 * s, 5 * s, 46 * s, "#222");
    R(cx + 65 * s, by - 46 * s, 5 * s, 46 * s, "#222");
    // checkers board left on the table
    for (let k = 0; k < 4; k++) oval(cx - 46 * s + k * 9 * s, by - 59 * s, 3.5 * s, 1.6 * s, k % 2 ? "#222" : "#c62a2f");
  } else if (sp.kind === "armchair") {
    ctx.fillStyle = "#c92f35";
    roundRect(cx - 58 * s, by - 50 * s, 116 * s, 42 * s, 10 * s);
    ctx.fillStyle = "#b8262c";
    roundRect(cx - 66 * s, by - 84 * s, 24 * s, 76 * s, 10 * s);
    roundRect(cx + 42 * s, by - 84 * s, 24 * s, 76 * s, 10 * s);
    polkaDots(cx - 58 * s, by - 50 * s, 116 * s, 42 * s, i * 13 + 5, s);
    R(cx - 50 * s, by - 8 * s, 4 * s, 8 * s, "#888");
    R(cx + 46 * s, by - 8 * s, 4 * s, 8 * s, "#888");
  }
}

// Little number tag so keyboard players know which key is which spot.
function badge(sp, i) {
  const x = sp.cx + 70 * sp.s,
    y = sp.by - 16 * sp.s;
  oval(x, y, 10, 10, NAVY);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.stroke();
  text(String(i + 1), x, y + 4.5, "bold 12px system-ui, sans-serif", PAPER);
}

// ---------- Patrons ----------
// Draws one person sitting with their seat at (x, y). `mood` is noisy | giggle | calm | read.
function drawPerson(x, y, s, look, mood, prop) {
  const headY = y - 64 * s;
  // long hair falls behind the shoulders
  if (look.style === 2) {
    ctx.fillStyle = look.hair;
    roundRect(x - 21 * s, headY - 14 * s, 42 * s, 44 * s, 10 * s);
  }
  ctx.fillStyle = look.shirt;
  roundRect(x - 22 * s, y - 46 * s, 44 * s, 56 * s, 12 * s);
  oval(x, headY, 19 * s, 19 * s, look.skin);

  // hair
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.ellipse(x, headY - 5 * s, 20 * s, 15 * s, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  if (look.style === 1) oval(x, headY - 23 * s, 8 * s, 7 * s, look.hair);
  if (look.style === 3) for (let k = -2; k <= 2; k++) oval(x + k * 8 * s, headY - 16 * s + Math.abs(k) * 3 * s, 6 * s, 6 * s, look.hair);

  // face
  const ink = "#2a1d16";
  const eyeY = headY - 1 * s;
  if (mood === "noisy") {
    oval(x - 7 * s, eyeY, 2.4 * s, 2.6 * s, ink);
    oval(x + 7 * s, eyeY, 2.4 * s, 2.6 * s, ink);
    oval(x, headY + 9 * s, 5 * s, 4.5 * s, "#6a2a2a");
  } else if (mood === "giggle") {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    ctx.arc(x - 7 * s, eyeY + 2 * s, 3 * s, Math.PI * 1.1, Math.PI * 1.9);
    ctx.moveTo(x + 10 * s, eyeY + 1 * s);
    ctx.arc(x + 7 * s, eyeY + 2 * s, 3 * s, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.fillStyle = "#6a2a2a";
    ctx.beginPath();
    ctx.ellipse(x, headY + 7 * s, 6 * s, 5 * s, 0, 0, Math.PI);
    ctx.fill();
  } else if (mood === "calm") {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.arc(x - 7 * s, eyeY - 1 * s, 3 * s, Math.PI * 0.15, Math.PI * 0.85);
    ctx.moveTo(x + 10 * s, eyeY);
    ctx.arc(x + 7 * s, eyeY - 1 * s, 3 * s, Math.PI * 0.15, Math.PI * 0.85);
    ctx.moveTo(x + 4 * s, headY + 8 * s);
    ctx.arc(x, headY + 6 * s, 4 * s, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    oval(x - 12 * s, headY + 6 * s, 3.5 * s, 2.2 * s, "rgba(230, 110, 120, 0.45)");
    oval(x + 12 * s, headY + 6 * s, 3.5 * s, 2.2 * s, "rgba(230, 110, 120, 0.45)");
  } else {
    // reading: eyes looking down at the book
    oval(x - 7 * s, eyeY + 3 * s, 2.2 * s, 1.6 * s, ink);
    oval(x + 7 * s, eyeY + 3 * s, 2.2 * s, 1.6 * s, ink);
    R(x - 3 * s, headY + 9 * s, 6 * s, 1.5 * s, ink);
  }

  // props and hands
  const hand = (hx, hy) => oval(hx, hy, 4.5 * s, 4.5 * s, look.skin);
  const sleeve = (x1, y1, x2, y2) => line(x1, y1, x2, y2, look.shirt, 9 * s);
  if (prop === "phone") {
    sleeve(x + 18 * s, y - 38 * s, x + 24 * s, y - 60 * s);
    R(x + 17 * s, y - 84 * s, 10 * s, 18 * s, "#222");
    R(x + 19 * s, y - 82 * s, 6 * s, 12 * s, "#7fc4e8");
    hand(x + 22 * s, y - 64 * s);
    const j = Math.sin(time * 0.08) * 1.5 * s;
    line(x + 31 * s + j, y - 86 * s, x + 35 * s + j, y - 90 * s, "#fff", 1.6 * s);
    line(x + 32 * s + j, y - 76 * s, x + 37 * s + j, y - 76 * s, "#fff", 1.6 * s);
  } else if (prop === "crinkle") {
    sleeve(x - 18 * s, y - 38 * s, x - 12 * s, y - 24 * s);
    sleeve(x + 18 * s, y - 38 * s, x + 12 * s, y - 24 * s);
    const zig = [];
    for (let k = 0; k <= 6; k++) zig.push(x - 13 * s + k * 4.33 * s, y - 40 * s + (k % 2) * 3 * s);
    poly("#f39c4a", x - 13 * s, y - 14 * s, ...zig, x + 13 * s, y - 14 * s);
    R(x - 13 * s, y - 30 * s, 26 * s, 6 * s, "#f2c14e");
    hand(x - 13 * s, y - 22 * s);
    hand(x + 13 * s, y - 22 * s);
  } else if (prop === "headphones") {
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.arc(x, headY, 22 * s, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    oval(x - 20 * s, headY + 2 * s, 5 * s, 8 * s, "#333");
    oval(x + 20 * s, headY + 2 * s, 5 * s, 8 * s, "#333");
    hand(x - 14 * s, y - 18 * s);
    hand(x + 14 * s, y - 18 * s);
  } else if (prop === "toy") {
    sleeve(x - 18 * s, y - 38 * s, x - 12 * s, y - 26 * s);
    sleeve(x + 18 * s, y - 38 * s, x + 12 * s, y - 26 * s);
    R(x - 10 * s, y - 40 * s, 20 * s, 18 * s, "#9aa3ad");
    R(x - 6 * s, y - 35 * s, 4 * s, 4 * s, "#1b2230");
    R(x + 2 * s, y - 35 * s, 4 * s, 4 * s, "#1b2230");
    R(x - 1 * s, y - 47 * s, 2 * s, 7 * s, "#666");
    oval(x, y - 48 * s, 3 * s, 3 * s, Math.sin(time * 0.02) > 0 ? "#d94b4b" : "#f2c14e");
    hand(x - 12 * s, y - 28 * s);
    hand(x + 12 * s, y - 28 * s);
  } else if (prop === "book") {
    const cover = look.shirt === "#4b79d9" ? "#c92a2f" : "#3d4c8c";
    poly(cover, x, y - 22 * s, x - 21 * s, y - 33 * s, x - 21 * s, y - 13 * s, x, y - 7 * s, x + 21 * s, y - 13 * s, x + 21 * s, y - 33 * s);
    poly(PAPER, x, y - 24 * s, x - 18 * s, y - 33 * s, x - 18 * s, y - 15 * s, x, y - 10 * s);
    poly("#e6dcc5", x, y - 24 * s, x + 18 * s, y - 33 * s, x + 18 * s, y - 15 * s, x, y - 10 * s);
    hand(x - 20 * s, y - 20 * s);
    hand(x + 20 * s, y - 20 * s);
  } else if (prop === "giggle") {
    hand(x + 9 * s, headY + 10 * s); // hand over a giggling mouth
    hand(x - 14 * s, y - 16 * s);
  } else {
    hand(x - 14 * s, y - 16 * s);
    hand(x + 14 * s, y - 16 * s);
  }
}

function drawOccupant(p) {
  const seat = seatOf(p.spot);
  const s = seat.s;
  const alpha = p.state === "leaving" ? Math.max(0, 1 - p.t / LEAVE_MS) : 1;
  const k = p.appear;
  const pop = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); // ease-out-back
  const shakeX = p.shake > 0 ? Math.sin(p.shake * 0.08) * 4 : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(seat.x + shakeX, seat.y);
  ctx.scale(pop, pop);
  if (p.type === "squeak" && p.state === "noisy") ctx.rotate(Math.sin(time * 0.02 + p.phase) * 0.08);

  const quietish = p.state === "calm" || p.state === "leaving";
  if (p.type === "giggle") {
    // two kids; the first one settles down after the first shush
    const looks = [p.look, p.look2];
    for (let i = 0; i < 2; i++) {
      const kidCalm = quietish || i < 2 - p.kidsLeft;
      const bounce = kidCalm ? 0 : Math.abs(Math.sin(time * 0.015 + i * 1.3)) * -4 * s;
      drawPerson((i ? 21 : -21) * s, bounce, s * 0.82, looks[i], kidCalm ? "calm" : "giggle", kidCalm ? "book" : "giggle");
    }
  } else if (p.state === "reader") {
    drawPerson(0, 0, s, p.look, "read", "book");
  } else if (quietish) {
    drawPerson(0, 0, s, p.look, "calm", "book");
  } else {
    drawPerson(0, 0, s, p.look, "noisy", p.type);
  }
  ctx.restore();
}

// Speech bubbles go on top of everything so they're always readable.
function drawBubble(p) {
  const seat = seatOf(p.spot);
  const s = seat.s;
  const top = seat.y - 104 * s;
  if (p.state === "noisy") {
    const r = ramp(p);
    const size = Math.round((13 + 5 * r) * (0.85 + 0.15 * s));
    const word = TYPES[p.type].word;
    const wob = Math.sin(time * 0.02 + p.phase) * 2;
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    const tw = ctx.measureText(word).width;
    const bx = seat.x + wob,
      by = top - 6;
    ctx.globalAlpha = Math.min(1, p.appear * 1.5);
    ctx.fillStyle = "#ffffff";
    roundRect(bx - tw / 2 - 9, by - size - 4, tw + 18, size + 12, 10);
    poly("#ffffff", bx - 6, by + 7, bx + 6, by + 7, bx, by + 15);
    text(word, bx, by + 1, `bold ${size}px system-ui, sans-serif`, "#1c140f");
    // sound waves around the head
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + 0.5 * r})`;
    ctx.lineWidth = 2;
    for (let k = 1; k <= 3; k++) {
      const rad = (8 + k * 6 + ((time * 0.02) % 6)) * s;
      ctx.beginPath();
      ctx.arc(seat.x - 24 * s, seat.y - 64 * s, rad, Math.PI * 0.75, Math.PI * 1.25);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (p.state === "calm") {
    const a = Math.min(1, (CALM_MS - p.t) / 400);
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = "italic bold 18px Georgia, serif";
    const tw = ctx.measureText("Shh…").width;
    ctx.fillStyle = NAVY;
    roundRect(seat.x - tw / 2 - 12, top - 26 - p.t * 0.01, tw + 24, 30, 12);
    text("Shh…", seat.x, top - 5 - p.t * 0.01, "italic bold 18px Georgia, serif", PAPER);
    ctx.globalAlpha = 1;
  }
}

// ---------- HUD ----------
function drawHUD() {
  ctx.fillStyle = "rgba(20, 14, 10, 0.7)";
  roundRect(12, 12, 190, 34, 8);
  text(`LEVEL ${level}  ·  Shushed ${shushed}`, 24, 34, "bold 14px Georgia, serif", PAPER, "left");

  // noise meter
  const mx = W / 2 - 150;
  ctx.fillStyle = "rgba(20, 14, 10, 0.7)";
  roundRect(mx, 12, 300, 34, 8);
  text("NOISE", mx + 12, 34, "bold 13px system-ui, sans-serif", GOLD, "left");
  const bx = mx + 70,
    bw = 216;
  R(bx, 22, bw, 14, "#1a1410");
  const color = noise < 50 ? "#5cb85c" : noise < 75 ? "#f2c14e" : "#d94b4b";
  const pulse = noise > 75 ? 0.75 + 0.25 * Math.sin(time * 0.015) : 1;
  ctx.globalAlpha = pulse;
  R(bx, 22, (bw * noise) / NOISE_MAX, 14, color);
  ctx.globalAlpha = 1;
  for (const m of [0.5, 0.75]) R(bx + bw * m, 22, 1, 14, "rgba(255, 255, 255, 0.35)");

  ctx.fillStyle = "rgba(20, 14, 10, 0.7)";
  roundRect(W - 222, 12, 210, 34, 8);
  text("SCORE " + Math.floor(score), W - 210, 34, "bold 14px Georgia, serif", PAPER, "left");
  text("BEST " + Math.max(best, Math.floor(score)), W - 24, 34, "bold 14px Georgia, serif", GOLD, "right");
}

function overlay(title, sub, extra) {
  ctx.fillStyle = "rgba(26, 18, 12, 0.45)";
  ctx.fillRect(0, 0, W, H);
  const widths = [["bold 34px Georgia, serif", title], ["18px Georgia, serif", sub], ["15px Georgia, serif", extra || ""]].map(
    ([font, t]) => ((ctx.font = font), ctx.measureText(t).width)
  );
  const pw = Math.max(...widths) + 56,
    ph = (extra ? 112 : 88) + 50; // + room for the logo
  ctx.fillStyle = "rgba(26, 18, 12, 0.92)";
  roundRect(W / 2 - pw / 2, H / 2 - 104, pw, ph, 12);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawLogo(W / 2, H / 2 - 96, 30);
  text(title, W / 2, H / 2 - 14, "bold 34px Georgia, serif", PAPER);
  text(sub, W / 2, H / 2 + 18, "18px Georgia, serif", GOLD);
  if (extra) text(extra, W / 2, H / 2 + 44, "15px Georgia, serif", PAPER);
}

function draw() {
  drawRoom();
  SPOTS.forEach((sp, i) => {
    furnitureBack(sp, i);
    if (occupants[i]) drawOccupant(occupants[i]);
    furnitureFront(sp, i);
    badge(sp, i);
  });
  for (const p of occupants) if (p) drawBubble(p);

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 1000);
    oval(p.x, p.y, 2.5, 2.5, p.color);
  }
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 400));
    ctx.font = "bold 16px Georgia, serif";
    const tw = ctx.measureText(p.text).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.8)";
    roundRect(p.x - tw / 2 - 8, p.y - 17, tw + 16, 24, 7);
    text(p.text, p.x, p.y, "bold 16px Georgia, serif", p.color);
  }
  ctx.globalAlpha = 1;

  drawHUD();

  if (state === "ready") overlay("Shush!", "Press Enter or tap to start", "Tap noisy patrons before the noise meter fills up");
  if (state === "paused") overlay("Paused", "Press P to keep the peace");
  if (state === "over") overlay("Too noisy!", "Press Enter or tap to try again", `Score: ${score} · Shushed: ${shushed}`);
}

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50); // clamp so tab-switching doesn't skip ahead
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Input ----------
function togglePause() {
  if (state === "playing") state = "paused";
  else if (state === "paused") state = "playing";
}

// Which spot is at canvas point (x, y)? Front row first, since it's drawn on top.
function spotAt(x, y) {
  for (const i of [3, 4, 5, 0, 1, 2]) {
    const sp = SPOTS[i];
    const top = sp.by - (i >= 3 ? 150 : 175) * sp.s;
    if (x >= sp.cx - 78 * sp.s && x <= sp.cx + 78 * sp.s && y >= top && y <= sp.by + 6) return i;
  }
  return -1;
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (state === "ready" || state === "over") return startGame();
  if (state === "paused") return togglePause();
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  const y = ((e.clientY - rect.top) / rect.height) * H;
  const i = spotAt(x, y);
  if (i >= 0) tapSpot(i);
});

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyP" || e.code === "Escape") return togglePause();
  if (e.code === "KeyM") return toggleMute();
  if ((e.code === "Enter" || e.code === "Space") && (state === "ready" || state === "over")) {
    e.preventDefault();
    return startGame();
  }
  const m = /^(Digit|Numpad)([1-6])$/.exec(e.code);
  if (m && !e.repeat) tapSpot(Number(m[2]) - 1);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") state = "paused";
});

// ---------- Storage (guarded: can throw in private mode) ----------
function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

// Book Drop Sort: returned items roll along a conveyor from the return slots.
// Send each one to the matching cart before it falls off the end of the belt.

// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width,
  H = canvas.height;

// ---------- Tunables (px, seconds) ----------
const BELT_Y = 215; // top surface of the conveyor belt
const BELT_X0 = 20,
  BELT_X1 = 700; // items fall off past BELT_X1
const FLOOR_Y = 282;
const CAB_TOP = 70,
  CAB_BOTTOM = 170; // the return cabinet
const START_LIVES = 3;
const POINTS = 10; // per correct sort, × streak multiplier
const STREAK_STEP = 5; // every 5 in a row raises the multiplier
const MAX_MULT = 5;
const PER_LEVEL = 8; // correct sorts per speed-up
const FLY_TIME = 0.35; // seconds for an item to fly into a cart
const GRAVITY = 1400;

function beltSpeed() {
  return Math.min(170, 55 + (level - 1) * 12);
}
function spawnInterval() {
  return Math.max(0.8, 2.6 - (level - 1) * 0.18);
}

// ---------- Palette (from the library) ----------
const PAPER = "#f3ead7";
const GOLD = "#d4a64a";
const MAPLE = "#d7a35e";
const NAVY = "#34404f";
const RED = "#c92a2f",
  BLUE = "#3d4c8c",
  YELLOW = "#e8b52a";
const BRIGHT = ["#d94b4b", "#4b79d9", "#f2c14e", "#5cb85c", "#9b59b6", "#f39c4a", "#3aa6a6"];
const SPINES = ["#8c2f39", "#2f5d62", "#b5893b", "#3b4a7a", "#6b3e75", "#a0522d", "#4f7942"];

// ---------- Item types and their carts ----------
const TYPES = [
  { name: "Picture Book", plural: "Picture Books", w: 52, h: 40, color: YELLOW },
  { name: "Chapter Book", plural: "Chapter Books", w: 26, h: 50, color: "#2f5d62" },
  { name: "DVD", plural: "DVDs", w: 34, h: 46, color: BLUE },
  { name: "Audiobook", plural: "Audiobooks", w: 40, h: 42, color: "#6b3e75" },
];
const CARTS = TYPES.map((t, i) => ({ type: i, x: 22 + i * 172, y: 300, w: 156, h: 124, count: 0, bump: 0, flash: 0 }));

// The A/V slot returns DVDs and audiobooks; the two book slots return books.
const SLOTS = [
  { x: 130, label: "A/V DROP", flash: 0 },
  { x: 320, label: "BOOK DROP", flash: 0 },
  { x: 510, label: "BOOK DROP", flash: 0 },
];

// ---------- State ----------
let items = [];
let particles = [],
  popups = [];
let score = 0,
  lives = START_LIVES,
  level = 1,
  sorted = 0,
  streak = 0;
let spawnTimer = 0,
  beltOffset = 0,
  time = 0;
let state = "ready"; // ready | playing | paused | over
let best = Number(safeGet("sort-best")) || 0;

function mult() {
  return Math.min(MAX_MULT, 1 + Math.floor(streak / STREAK_STEP));
}

function startGame() {
  items = [];
  particles = [];
  popups = [];
  score = 0;
  lives = START_LIVES;
  level = 1;
  sorted = 0;
  streak = 0;
  spawnTimer = 0.6;
  for (const c of CARTS) c.count = 0;
  state = "playing";
  sfx.start();
}

// ---------- Items ----------
function spawnItem() {
  const type = (Math.random() * TYPES.length) | 0;
  const choices = type >= 2 ? [0] : Math.random() < 0.5 ? [1, 2] : [2, 1];
  // don't drop onto another item
  const slotIdx = choices.find((s) =>
    items.every((it) => !(it.state === "drop" || it.state === "belt") || Math.abs(it.x - SLOTS[s].x) > 70)
  );
  if (slotIdx === undefined) return false;
  const slot = SLOTS[slotIdx];
  slot.flash = 1;
  const palette = type === 0 ? BRIGHT : type === 1 ? SPINES : type === 2 ? ["#1d2a4a", "#1b1b22", "#3d4c8c"] : ["#6b3e75", "#2f7d84", "#8c2f39"];
  items.push({
    type,
    x: slot.x,
    y: CAB_BOTTOM, // y is the item's bottom edge
    vx: 0,
    vy: 0,
    rot: 0,
    state: "drop",
    color: palette[(Math.random() * palette.length) | 0],
  });
  return true;
}

// The item nearest the end of the belt is the one you sort next.
function frontItem() {
  let front = null;
  for (const it of items) if (it.state === "belt" && (!front || it.x > front.x)) front = it;
  return front;
}

function pick(cartIdx) {
  if (state !== "playing") return;
  const cart = CARTS[cartIdx];
  cart.flash = 1;
  const it = frontItem();
  if (!it) return;
  it.state = "fly";
  it.target = cartIdx;
  it.t = 0;
  it.sx = it.x;
  it.sy = it.y;
  sfx.whoosh();
}

function loseLife(text, x, y) {
  lives--;
  streak = 0;
  popup(text, x, y, "#ffb4b4");
  if (lives <= 0) gameOver();
}

function landInCart(it) {
  const cart = CARTS[it.target];
  const cx = cart.x + cart.w / 2;
  if (it.type === cart.type) {
    streak++;
    const pts = POINTS * mult();
    score += pts;
    sorted++;
    cart.count++;
    cart.bump = 1;
    sfx.correct();
    burst(cx, cart.y + 20, 10, TYPES[it.type].color);
    popup("+" + pts, cx, cart.y - 6);
    if (streak > 0 && streak % STREAK_STEP === 0 && mult() > 1) popup("Streak ×" + mult() + "!", cx, cart.y - 34, YELLOW);
    if (sorted % PER_LEVEL === 0) {
      level++;
      setTimeout(() => sfx.level(), 200);
      popup("Faster!", W / 2, BELT_Y - 70, YELLOW);
    }
    it.state = "done";
  } else {
    // bounces back out of the wrong cart
    sfx.wrong();
    it.state = "fall";
    it.vx = (Math.random() < 0.5 ? -1 : 1) * 140;
    it.vy = -420;
    loseLife("Oops! That's " + article(TYPES[it.type].name), cx, cart.y - 6);
  }
}

function article(name) {
  return (/^[AEIOU]/.test(name) ? "an " : "a ") + name;
}

function gameOver() {
  state = "over";
  sfx.over();
  if (score > best) {
    best = score;
    safeSet("sort-best", best);
  }
}

// ---------- Update ----------
function update(dt) {
  time += dt;
  updateParticles(dt);
  for (const c of CARTS) {
    c.bump = Math.max(0, c.bump - dt * 3);
    c.flash = Math.max(0, c.flash - dt * 4);
  }
  for (const s of SLOTS) s.flash = Math.max(0, s.flash - dt * 3);
  if (state !== "playing") return;

  const speed = beltSpeed();
  beltOffset += speed * dt;

  spawnTimer -= dt;
  if (spawnTimer <= 0) spawnTimer = spawnItem() ? spawnInterval() : 0.25;

  for (const it of items) {
    const t = TYPES[it.type];
    if (it.state === "drop") {
      it.vy += GRAVITY * dt;
      it.y += it.vy * dt;
      if (it.y >= BELT_Y) {
        it.y = BELT_Y;
        it.state = "belt";
        sfx.thunk();
      }
    } else if (it.state === "belt") {
      it.x += speed * dt;
      if (it.x - t.w / 2 > BELT_X1) {
        it.state = "fall";
        it.vx = speed;
        it.vy = 0;
        sfx.fall();
        loseLife("Dropped!", BELT_X1 - 30, BELT_Y - 60);
        if (state !== "playing") return;
      }
    } else if (it.state === "fly") {
      it.t += dt / FLY_TIME;
      const cart = CARTS[it.target];
      const tx = cart.x + cart.w / 2,
        ty = cart.y + 46;
      const k = Math.min(1, it.t);
      it.x = it.sx + (tx - it.sx) * k;
      it.y = it.sy + (ty - it.sy) * k - Math.sin(Math.PI * k) * 80;
      it.rot = k * Math.PI * 2 * (it.target % 2 ? -1 : 1);
      if (it.t >= 1) {
        it.rot = 0;
        landInCart(it);
        if (state !== "playing") return;
      }
    } else if (it.state === "fall") {
      it.vy += GRAVITY * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += dt * 6;
    }
  }
  items = items.filter((it) => it.state !== "done" && it.y < H + 80);
}

// ---------- Particles & popups ----------
function burst(x, y, n, color, size = 5) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 260,
      vy: -Math.random() * 260,
      life: 0.5 + Math.random() * 0.4,
      color,
      size,
    });
  }
}
function popup(text, x, y, color = PAPER) {
  popups.push({ text, x, y, color, life: 1.1 });
}
function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 900 * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) {
    p.y -= 30 * dt;
    p.life -= dt;
  }
  popups = popups.filter((p) => p.life > 0);
}

// ---------- Sound (Web Audio API, no files needed) ----------
let audio = null;
let muted = safeGet("sort-muted") === "1";

function tone(freqStart, freqEnd, duration, type = "square", volume = 0.12, delay = 0) {
  if (muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + duration);
  } catch {
    // no audio support: play silently
  }
}

const sfx = {
  thunk: () => tone(180, 90, 0.07, "triangle", 0.1),
  whoosh: () => tone(300, 700, 0.12, "sine", 0.08),
  correct: () => {
    const f = 660 * Math.pow(2, Math.min(streak, 8) / 12); // climbs with your streak
    tone(f, f, 0.08, "sine", 0.13);
    tone(f * 1.5, f * 1.5, 0.12, "sine", 0.12, 0.07);
  },
  wrong: () => {
    tone(200, 140, 0.18, "square", 0.1);
    tone(150, 100, 0.2, "square", 0.08, 0.12);
  },
  fall: () => tone(500, 80, 0.4, "triangle", 0.12),
  level: () => [392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.1, "triangle", 0.12, i * 0.08)),
  over: () => {
    tone(400, 100, 0.6, "sawtooth", 0.12);
    tone(200, 60, 0.6, "square", 0.08, 0.1);
  },
  start: () => {
    tone(523, 523, 0.08, "triangle", 0.12);
    tone(784, 784, 0.12, "triangle", 0.12, 0.08);
  },
};

const muteBtn = document.getElementById("mute");
function updateMuteLabel() {
  if (muteBtn) muteBtn.textContent = muted ? "Sound: off" : "Sound: on";
}
function toggleMute() {
  muted = !muted;
  safeSet("sort-muted", muted ? "1" : "0");
  updateMuteLabel();
  if (!muted) tone(660, 660, 0.08, "sine", 0.12);
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
function pill(str, x, y, font, color, bg = "rgba(20, 14, 10, 0.8)") {
  ctx.font = font;
  const tw = ctx.measureText(str).width;
  ctx.fillStyle = bg;
  roundRect(x - tw / 2 - 10, y - 18, tw + 20, 26, 8);
  text(str, x, y, font, color);
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

// Draw one returned item, centered on x with its bottom at y. Each type has its own
// shape so kids can tell them apart at a glance.
function drawItem(type, x, y, color, scale = 1) {
  const t = TYPES[type];
  const w = t.w * scale,
    h = t.h * scale;
  const l = x - w / 2,
    top = y - h;
  if (type === 0) {
    // Picture book: wide, bright cover with a little sun-and-hill picture
    R(l, top, w, h, color);
    R(l, top, 5 * scale, h, shade(color, 0.7));
    R(l + 9 * scale, top + 5 * scale, w - 14 * scale, h - 10 * scale, "#fbf6e9");
    oval(l + w * 0.68, top + h * 0.38, 5 * scale, 5 * scale, YELLOW);
    ctx.fillStyle = "#5cb85c";
    ctx.beginPath();
    ctx.moveTo(l + 9 * scale, top + h - 5 * scale);
    ctx.quadraticCurveTo(l + w * 0.45, top + h * 0.35, l + w - 5 * scale, top + h - 5 * scale);
    ctx.fill();
  } else if (type === 1) {
    // Chapter book: tall and thin, dark cover, gold bands and a title label
    R(l, top, w, h, color);
    R(l, top, 4 * scale, h, shade(color, 0.7));
    R(l + 6 * scale, top + 5 * scale, w - 10 * scale, 2 * scale, GOLD);
    R(l + 6 * scale, top + h - 8 * scale, w - 10 * scale, 2 * scale, GOLD);
    R(l + 7 * scale, top + h * 0.3, w - 12 * scale, h * 0.22, PAPER);
    R(l + 9 * scale, top + h * 0.36, w - 16 * scale, 1.5 * scale, "#888");
    R(l + 9 * scale, top + h * 0.43, w - 18 * scale, 1.5 * scale, "#888");
  } else if (type === 2) {
    // DVD: slim dark case with a shiny disc showing through
    ctx.fillStyle = color;
    roundRect(l, top, w, h, 3 * scale);
    R(l, top, w, 9 * scale, "#e8e8ef");
    text("DVD", x, top + 8 * scale, `bold ${7 * scale}px system-ui, sans-serif`, "#1b1b22");
    const cy = top + h * 0.6;
    oval(x, cy, w * 0.36, w * 0.36, "#c9ced6");
    oval(x - w * 0.1, cy - w * 0.1, w * 0.12, w * 0.08, "rgba(255,255,255,0.7)");
    oval(x, cy, w * 0.08, w * 0.08, color);
  } else {
    // Audiobook: chunky case with headphones on the front
    ctx.fillStyle = color;
    roundRect(l, top, w, h, 4 * scale);
    R(l + 3 * scale, top + 3 * scale, w - 6 * scale, h - 6 * scale, shade(color, 1.25));
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.arc(x, top + h * 0.55, w * 0.26, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    roundRect(x - w * 0.34, top + h * 0.5, 7 * scale, 12 * scale, 2 * scale);
    roundRect(x + w * 0.34 - 7 * scale, top + h * 0.5, 7 * scale, 12 * scale, 2 * scale);
  }
}

// ---------- Scene ----------
function drawRoom() {
  // wall, blue-framed windows and the logo sign
  R(0, 0, W, H, "#bcc6d1");
  R(110, 6, 600, 52, "#4d6b98");
  for (let k = 0; k < 6; k++) R(116 + k * 99, 12, 88, 40, "#edf2f6");
  // window stickers spelling LIBRARY, kept inside the panes
  const letters = "LIBRARY",
    lx = [132, 158, 184, 240, 272, 332, 364];
  for (let i = 0; i < letters.length; i++) {
    text(letters[i], lx[i], 38 + (i % 2) * 8, "bold 18px Georgia, serif", BRIGHT[i % BRIGHT.length]);
  }
  drawLogo(55, 8, 38);

  // the return cabinet
  R(34, CAB_TOP - 8, W - 68, 10, "#e3b06a");
  R(40, CAB_TOP, W - 80, CAB_BOTTOM - CAB_TOP, MAPLE);
  R(40, CAB_TOP + 2, W - 80, 30, "#cf9a55");
  R(40, CAB_TOP + 32, W - 80, 2, "#b98340");
  for (const x of [225, 415, 600]) R(x, CAB_TOP + 34, 2, CAB_BOTTOM - CAB_TOP - 40, "#b98340");
  R(40, CAB_BOTTOM - 6, W - 80, 6, "#2a2c30");
  for (const s of SLOTS) {
    text(s.label, s.x, CAB_TOP + 23, "bold 15px system-ui, sans-serif", "#eceef0");
    R(s.x - 40, CAB_TOP + 40, 80, 16, "#6f7378");
    R(s.x - 36, CAB_TOP + 44, 72, 8, "#1c1c1c");
    // the opening items drop out of, glowing briefly when something comes through
    R(s.x - 34, CAB_BOTTOM - 4, 68, 6, "#111");
    if (s.flash > 0) R(s.x - 34, CAB_BOTTOM - 4, 68, 6, `rgba(255, 220, 140, ${s.flash})`);
  }

  // slate tile floor
  R(0, FLOOR_Y, W, H - FLOOR_Y, "#4a3a3b");
  for (let y = FLOOR_Y + 30; y < H; y += 30) R(0, y, W, 1, "#352a2a");
  for (let row = 0, y = FLOOR_Y; y < H; row++, y += 30)
    for (let x = (row % 2) * 40; x < W; x += 80) R(x, y, 1, 30, "#352a2a");
}

function drawBelt() {
  const len = BELT_X1 - BELT_X0;
  // legs
  for (const lx of [BELT_X0 + 30, BELT_X0 + len / 2, BELT_X1 - 30]) R(lx - 4, BELT_Y + 20, 8, FLOOR_Y - BELT_Y - 16, "#6f747b");
  // frame and belt surface
  R(BELT_X0 - 10, BELT_Y + 8, len + 20, 14, "#5b6068");
  R(BELT_X0, BELT_Y, len, 9, "#2a2c31");
  // moving chevrons show which way the belt runs
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = BELT_X0 - 30 + (beltOffset % 30); x < BELT_X1; x += 30) {
    if (x < BELT_X0) continue;
    ctx.moveTo(x, BELT_Y + 1);
    ctx.lineTo(x + 4, BELT_Y + 4.5);
    ctx.lineTo(x, BELT_Y + 8);
  }
  ctx.stroke();
  // rollers
  for (const rx of [BELT_X0, BELT_X1]) {
    oval(rx, BELT_Y + 11, 11, 11, "#8a9098");
    oval(rx, BELT_Y + 11, 4, 4, "#3a3d42");
  }
  // warning stripes at the drop-off end
  for (let i = 0; i < 4; i++) R(BELT_X1 - 40 + i * 10, BELT_Y + 9, 5, 12, i % 2 ? "#222" : YELLOW);
}

function drawCart(c) {
  const t = TYPES[c.type];
  const by = c.y - Math.sin(c.bump * Math.PI) * 6; // little hop when an item lands
  // body
  R(c.x + 6, by + 30, c.w - 12, c.h - 46, "#c08f48");
  R(c.x + 12, by + 36, c.w - 24, c.h - 58, "#3a2e25");
  R(c.x + 6, by + 30 + (c.h - 46) / 2 - 2, c.w - 12, 5, "#c08f48");
  // items collected so far, as mini spines on the two shelves
  const shelfTop = by + 36,
    shelfH = (c.h - 58) / 2;
  for (let i = 0; i < Math.min(c.count, 24); i++) {
    const row = Math.floor(i / 12) % 2,
      col = i % 12;
    const sh = shelfH - 8 - ((i * 7) % 5);
    R(c.x + 15 + col * 10.5, shelfTop + (row + 1) * shelfH - sh - 3, 8, sh, i % 2 ? shade(t.color, 1.3) : t.color);
  }
  // wheels
  for (const wx of [c.x + 20, c.x + c.w - 20]) {
    oval(wx, by + c.h - 8, 8, 8, "#2a2a2a");
    oval(wx, by + c.h - 8, 3, 3, "#999");
  }
  // label plate with the item picture and name
  ctx.fillStyle = c.flash > 0 ? `rgba(212, 166, 74, ${0.5 + c.flash / 2})` : NAVY;
  roundRect(c.x, by, c.w, 34, 7);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawItem(c.type, c.x + 22, by + 30, t.color, 0.5);
  text(t.plural, c.x + 40, by + 23, "bold 14px Georgia, serif", PAPER, "left");
  // key number badge, sitting above the plate's corner
  oval(c.x + c.w - 6, by - 6, 11, 11, GOLD);
  text(String(c.type + 1), c.x + c.w - 6, by - 1, "bold 14px system-ui, sans-serif", "#1c140f");
}

function drawItems() {
  const front = state === "playing" ? frontItem() : null;
  for (const it of items) {
    ctx.save();
    if (it.rot) {
      const t = TYPES[it.type];
      ctx.translate(it.x, it.y - t.h / 2);
      ctx.rotate(it.rot);
      ctx.translate(-it.x, -(it.y - t.h / 2));
    }
    drawItem(it.type, it.x, it.y, it.color);
    ctx.restore();
  }
  if (front) {
    // gold arrow and outline on the item to sort next
    const t = TYPES[front.type];
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.strokeRect(front.x - t.w / 2 - 4, front.y - t.h - 4, t.w + 8, t.h + 8);
    const ay = front.y - t.h - 12 + Math.sin(time * 8) * 3;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(front.x - 9, ay - 12);
    ctx.lineTo(front.x + 9, ay - 12);
    ctx.lineTo(front.x, ay);
    ctx.fill();
    // name tag for the first few, to help new players learn the items
    if (sorted < 6) pill(t.name, front.x, ay - 20, "bold 14px Georgia, serif", PAPER);
  }
}

function drawHud() {
  ctx.fillStyle = "rgba(20, 14, 10, 0.75)";
  roundRect(W - 340, 10, 330, 34, 8);
  // lives as bookmarks
  for (let i = 0; i < START_LIVES; i++) {
    const x = W - 328 + i * 18,
      y = 17,
      c = i < lives ? RED : "rgba(255,255,255,0.2)";
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 11, y);
    ctx.lineTo(x + 11, y + 20);
    ctx.lineTo(x + 5.5, y + 15);
    ctx.lineTo(x, y + 20);
    ctx.fill();
  }
  text("SCORE " + score, W - 20, 33, "bold 16px Georgia, serif", PAPER, "right");
  text("BEST " + Math.max(best, score), W - 150, 33, "bold 16px Georgia, serif", GOLD, "right");
  if (state === "playing" && mult() > 1) pill("Streak ×" + mult(), W - 70, 70, "bold 14px Georgia, serif", YELLOW);
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
  drawBelt();
  for (const c of CARTS) drawCart(c);
  drawItems();

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.9);
    R(p.x, p.y, p.size, p.size * 0.75, p.color);
  }
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.4));
    pill(p.text, p.x, p.y, "bold 18px Georgia, serif", p.color);
  }
  ctx.globalAlpha = 1;

  drawHud();

  if (state === "ready") overlay("Book Drop Sort", "Press Enter or tap to start", "Send each returned item to its matching cart");
  if (state === "paused") overlay("Shh… paused", "Press P to keep sorting");
  if (state === "over") overlay("Return desk closed!", "Press Enter or tap to play again", `Score: ${score} · Items sorted: ${sorted}`);
}

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50) / 1000; // clamp so tab-switching doesn't skip ahead
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

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyP" || e.code === "Escape") return togglePause();
  if (e.code === "KeyM") return toggleMute();
  if ((e.code === "Enter" || e.code === "Space") && (state === "ready" || state === "over")) {
    e.preventDefault();
    return startGame();
  }
  const m = /^(Digit|Numpad)([1-4])$/.exec(e.code);
  if (m && !e.repeat) {
    e.preventDefault();
    pick(Number(m[2]) - 1);
  }
});

// Tap/click: start or resume, otherwise send the front item to the tapped cart.
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (state === "ready" || state === "over") return startGame();
  if (state === "paused") return togglePause();
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  const y = ((e.clientY - rect.top) / rect.height) * H;
  // generous hit areas: anywhere in a cart's column below the belt counts
  const i = CARTS.findIndex((c) => x >= c.x - 8 && x <= c.x + c.w + 8 && y >= BELT_Y + 30);
  if (i >= 0) pick(i);
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

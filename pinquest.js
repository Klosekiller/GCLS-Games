// Pin Quest: five gentle mini-games for little learners (ages 2–5).
// Finish a game to earn its pin for your tote bag. No scores, no timers that
// punish, no wrong answers that end anything: just encouragement. Everything is
// read aloud (Web Speech API) so pre-readers can play.

// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width,
  H = canvas.height;

// ---------- Palette ----------
const PAPER = "#f3ead7";
const GOLD = "#d4a64a";
const MAPLE = "#d7a35e";
const NAVY = "#34404f";
const INK = "#2a2320";
const RED = "#c92a2f",
  BLUE = "#3d4c8c",
  YELLOW = "#e8b52a";

// ---------- The five pins ----------
const PINS = [
  { key: "calm", name: "Love & Calm", spoken: "Love and Calm", color: "#e0488f" },
  { key: "talk", name: "Talk & Sing", spoken: "Talk and Sing", color: "#3d7fd9" },
  { key: "count", name: "Count & Compare", spoken: "Count and Compare", color: "#e0a020" },
  { key: "move", name: "Move & Play", spoken: "Move and Play", color: "#3f9e4f" },
  { key: "read", name: "Read & Share", spoken: "Read and Share", color: "#d9673a" },
];
const PIN = Object.fromEntries(PINS.map((p) => [p.key, p]));

// ---------- State ----------
let state = "ready"; // ready | playing | paused
let scene = "home"; // home | calm | talk | count | move | read | pin
let act = null; // the current activity's own state
let celebrate = null;
let pins = new Set(loadPins());
let buttons = []; // rebuilt every frame by draw()
let particles = [];
let time = 0;
let resetHold = null;
let lastSaid = "";

function loadPins() {
  try {
    const p = JSON.parse(safeGet("pinquest-pins") || "[]");
    return Array.isArray(p) ? p.filter((k) => PIN[k]) : [];
  } catch {
    return [];
  }
}
function savePins() {
  safeSet("pinquest-pins", JSON.stringify([...pins]));
}

// ---------- Talking (read every prompt aloud) ----------
function say(text) {
  lastSaid = text;
  if (muted) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.85;
    u.pitch = 1.15;
    u.lang = "en-US";
    synth.speak(u);
  } catch {
    // no speech support: the words are still on screen for a grown-up to read
  }
}
function hush() {
  try {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  } catch {}
}
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];
const pick = (a) => a[(Math.random() * a.length) | 0];
const cheer = () => pick(["Yay!", "Great job!", "Wonderful!", "You did it!", "Hooray!"]);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Sound (Web Audio API, soft and gentle) ----------
let audio = null;
let muted = safeGet("pinquest-muted") === "1";

function tone(freqStart, freqEnd, duration, type = "sine", volume = 0.1, delay = 0) {
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
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  } catch {}
}

const sfx = {
  tap: () => tone(660, 700, 0.08, "sine", 0.08),
  yay: () => [523, 659, 784].forEach((f, i) => tone(f, f, 0.16, "sine", 0.1, i * 0.09)),
  soft: () => tone(392, 370, 0.14, "triangle", 0.06),
  count: (n) => tone(440 * Math.pow(2, n / 6), 440 * Math.pow(2, n / 6), 0.14, "sine", 0.1),
  pop: () => tone(900, 1400, 0.07, "sine", 0.09),
  boing: () => tone(220, 520, 0.18, "sine", 0.09),
  clap: () => tone(1800, 1200, 0.05, "square", 0.025),
  wobble: () => tone(330, 280, 0.2, "triangle", 0.07),
  pin: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, "triangle", 0.1, i * 0.1)),
  allPins: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.2, "triangle", 0.1, i * 0.12)),
  page: () => tone(500, 350, 0.12, "triangle", 0.05),
  // an original little tune for the singing part
  song: () =>
    [523, 587, 659, 784, 659, 587, 523, 659, 784, 880, 784, 659, 587, 523].forEach((f, i) =>
      tone(f, f, 0.3, "triangle", 0.09, i * 0.34)
    ),
};

const muteBtn = document.getElementById("mute");
function updateMuteLabel() {
  if (muteBtn) muteBtn.textContent = muted ? "Sound: off" : "Sound: on";
}
function toggleMute() {
  muted = !muted;
  safeSet("pinquest-muted", muted ? "1" : "0");
  updateMuteLabel();
  if (muted) hush();
  else tone(660, 660, 0.08, "sine", 0.1);
}
updateMuteLabel();
if (muteBtn) muteBtn.addEventListener("click", toggleMute);

// ---------- Library logo ----------
const LOGO = new Image();
LOGO.src = "logo-icon.svg";
const LOGO_RATIO = 122 / 182;
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
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}
function circle(x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function oval(x, y, rx, ry, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function text(str, x, y, font, color, align = "center") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
}
// text on a dark rounded label so it's readable on any background
function label(str, x, y, size = 22) {
  ctx.font = `bold ${size}px Georgia, serif`;
  const tw = ctx.measureText(str).width;
  ctx.fillStyle = "rgba(20, 14, 10, 0.82)";
  roundRect(x - tw / 2 - 14, y - size - 4, tw + 28, size + 16, 10);
  text(str, x, y, `bold ${size}px Georgia, serif`, PAPER);
}
function addButton(x, y, w, h, action, hold) {
  buttons.push({ x, y, w, h, action, hold });
}

// ---------- The children's area ----------
function ribbon(baseY, amp, thickness, phase, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 10) {
    const y = baseY + Math.sin(x * 0.014 + phase) * amp;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let x = W; x >= 0; x -= 10) ctx.lineTo(x, baseY + Math.sin(x * 0.014 + phase) * amp + thickness);
  ctx.fill();
}

function shelfUnit(x, y, w, h) {
  R(x, y, w, h, "#cda46c");
  R(x + 5, y + 5, w - 10, h - 10, "#efe6d4");
  const colors = ["#d94b4b", "#4b79d9", "#f2c14e", "#5cb85c", "#9b59b6", "#f39c4a", "#3aa6a6"];
  for (let row = 0; row < 2; row++) {
    const bottom = y + 5 + (row + 1) * ((h - 10) / 2);
    for (let bx = x + 8, k = 0; bx < x + w - 14; k++) {
      const bw = 5 + ((k * 7 + row * 3 + x) % 5);
      const bh = (h - 10) / 2 - 8 - ((k * 5 + row) % 4) * 3;
      R(bx, bottom - bh - 3, bw, bh, colors[(k + row * 2 + x) % colors.length]);
      bx += bw + 1;
    }
    R(x + 5, bottom - 3, w - 10, 3, "#b88e55");
  }
}

function drawRoom(dim) {
  R(0, 0, W, H, "#8b919a");
  R(0, 60, 300, 410, "#aab3c1");
  // ceiling and the red / blue / yellow / white banners
  R(0, 0, W, 60, "#2b2b30");
  R(0, 0, W, 8, "#e9e6df");
  ribbon(34, 8, 8, 4.0, "#f1f0ec");
  ribbon(30, 10, 10, 1.4, YELLOW);
  ribbon(12, 6, 24, 2.6, BLUE);
  ribbon(14, 5, 30, 0.0, RED);
  // red columns
  for (const cx of [292, 770]) {
    R(cx, 52, 30, 418, "#c62a2f");
    R(cx + 22, 52, 8, 418, "#a31f24");
  }
  // low bookcases with the bear and horse plush on top
  shelfUnit(20, 392, 250, 78);
  shelfUnit(500, 392, 250, 78);
  oval(90, 376, 16, 14, "#1c1817");
  circle(106, 362, 10, "#1c1817");
  circle(100, 352, 4, "#1c1817");
  circle(112, 353, 4, "#1c1817");
  oval(600, 378, 22, 12, "#f2f0ea");
  oval(622, 362, 8, 12, "#f2f0ea");
  R(592, 366, 14, 7, "#222");
  // carpet
  R(0, 470, W, H - 470, "#c3b493");
  R(0, 470, W, 18, "#5e6e8b");
  for (let i = 0; i < 90; i++) R((i * 97) % W, 496 + ((i * 53) % 100), 2, 1, "#a99a7a");
  if (dim) R(0, 0, W, H, "rgba(20, 14, 10, 0.35)");
}

// ---------- Icons ----------
function drawIcon(key, x, y, s, color = "#fff") {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (key === "calm") {
    // heart
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.38);
    ctx.bezierCurveTo(x - s * 0.62, y - s * 0.05, x - s * 0.32, y - s * 0.55, x, y - s * 0.2);
    ctx.bezierCurveTo(x + s * 0.32, y - s * 0.55, x + s * 0.62, y - s * 0.05, x, y + s * 0.38);
    ctx.fill();
  } else if (key === "talk") {
    // music note
    oval(x - s * 0.14, y + s * 0.26, s * 0.17, s * 0.13, color);
    R(x - s * 0.01, y - s * 0.4, s * 0.08, s * 0.66, color);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.06, y - s * 0.4);
    ctx.quadraticCurveTo(x + s * 0.38, y - s * 0.28, x + s * 0.3, y - s * 0.02);
    ctx.lineWidth = s * 0.08;
    ctx.stroke();
  } else if (key === "count") {
    text("123", x, y + s * 0.17, `bold ${s * 0.5}px Georgia, serif`, color);
  } else if (key === "move") {
    // star
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        r = i % 2 ? s * 0.18 : s * 0.42;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else if (key === "read") {
    // open book
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.18);
    ctx.quadraticCurveTo(x - s * 0.2, y - s * 0.3, x - s * 0.42, y - s * 0.22);
    ctx.lineTo(x - s * 0.42, y + s * 0.26);
    ctx.quadraticCurveTo(x - s * 0.2, y + s * 0.18, x, y + s * 0.3);
    ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.18, x + s * 0.42, y + s * 0.26);
    ctx.lineTo(x + s * 0.42, y - s * 0.22);
    ctx.quadraticCurveTo(x + s * 0.2, y - s * 0.3, x, y - s * 0.18);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.16);
    ctx.lineTo(x, y + s * 0.28);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

// A pin badge: colored disc, white ring, gold rim and the icon.
function drawPin(key, x, y, r) {
  const p = PIN[key];
  circle(x, y + r * 0.08, r, "rgba(0,0,0,0.25)");
  circle(x, y, r, GOLD);
  circle(x, y, r * 0.9, "#fff");
  circle(x, y, r * 0.78, p.color);
  circle(x - r * 0.25, y - r * 0.3, r * 0.22, "rgba(255,255,255,0.25)");
  drawIcon(key, x, y, r * 1.1);
}

function drawHouse(x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.42);
  ctx.lineTo(x + s * 0.45, y);
  ctx.lineTo(x + s * 0.32, y);
  ctx.lineTo(x + s * 0.32, y + s * 0.38);
  ctx.lineTo(x - s * 0.32, y + s * 0.38);
  ctx.lineTo(x - s * 0.32, y);
  ctx.lineTo(x - s * 0.45, y);
  ctx.closePath();
  ctx.fill();
  R(x - s * 0.08, y + s * 0.12, s * 0.16, s * 0.26, NAVY);
}

function drawSpeakerIcon(x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4, y - s * 0.14);
  ctx.lineTo(x - s * 0.18, y - s * 0.14);
  ctx.lineTo(x + s * 0.06, y - s * 0.36);
  ctx.lineTo(x + s * 0.06, y + s * 0.36);
  ctx.lineTo(x - s * 0.18, y + s * 0.14);
  ctx.lineTo(x - s * 0.4, y + s * 0.14);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = "round";
  for (const r of [0.2, 0.36]) {
    ctx.beginPath();
    ctx.arc(x + s * 0.06, y, s * r, -Math.PI / 3.2, Math.PI / 3.2);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  if (muted) {
    ctx.strokeStyle = "#ff8a80";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.42, y + s * 0.42);
    ctx.lineTo(x + s * 0.42, y - s * 0.42);
    ctx.stroke();
  }
}

// Round control buttons used on every screen.
function roundButton(x, y, r, color, drawInside, action) {
  circle(x, y + 4, r, "rgba(0,0,0,0.25)");
  circle(x, y, r, color);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x, y, r - 2, 0, Math.PI * 2);
  ctx.stroke();
  drawInside(x, y, r);
  addButton(x - r, y - r, r * 2, r * 2, action);
}

function chrome(showHome = true) {
  if (showHome) roundButton(56, 106, 36, NAVY, (x, y, r) => drawHouse(x, y, r, PAPER), () => goHome());
  roundButton(W - 56, 106, 36, NAVY, (x, y, r) => drawSpeakerIcon(x, y, r, PAPER), () => {
    if (muted) toggleMute();
    say(lastSaid);
  });
}

function progressDots(done, total, color) {
  const gap = 34,
    x0 = W / 2 - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    circle(x0 + i * gap, 104, 12, "rgba(20,14,10,0.55)");
    circle(x0 + i * gap, 104, 9, i < done ? color : "rgba(243,234,215,0.3)");
  }
}

// ---------- The tote bag ----------
function toteSlot(i, x, y, w, h) {
  if (i < 3) return { x: x + w * (0.22 + 0.28 * i), y: y + h * 0.5 };
  return { x: x + w * (0.36 + 0.28 * (i - 3)), y: y + h * 0.77 };
}
function drawTote(x, y, w, h, hideKey) {
  // handles
  ctx.lineWidth = w * 0.05;
  ctx.strokeStyle = "#b89a6a";
  for (const hx of [0.32, 0.68]) {
    ctx.beginPath();
    ctx.arc(x + w * hx, y + h * 0.2, w * 0.14, Math.PI, 0);
    ctx.stroke();
  }
  // bag
  ctx.fillStyle = "#efe3c8";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.08, y + h * 0.2);
  ctx.lineTo(x + w * 0.92, y + h * 0.2);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  R(x + w * 0.08, y + h * 0.2, w * 0.84, h * 0.05, "#d8c7a3");
  drawLogo(x + w / 2, y + h * 0.27, h * 0.09);
  PINS.forEach((p, i) => {
    const s = toteSlot(i, x, y, w, h);
    if (pins.has(p.key) && p.key !== hideKey) drawPin(p.key, s.x, s.y, w * 0.11);
    else {
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(120, 95, 60, 0.45)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, w * 0.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

// ---------- Characters & things ----------
function drawFace(x, y, r, mood) {
  circle(x, y + 4, r, "rgba(0,0,0,0.2)");
  circle(x, y, r, "#ffd166");
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = "round";
  const ex = r * 0.35,
    ey = -r * 0.18;
  if (mood === "sleepy") {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + s * ex, y + ey, r * 0.13, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
    oval(x, y + r * 0.4, r * 0.12, r * 0.15, INK);
    text("z", x + r * 0.8, y - r * 0.7, `bold ${r * 0.45}px Georgia, serif`, "#fff");
    text("z", x + r * 1.05, y - r * 1.0, `bold ${r * 0.32}px Georgia, serif`, "#fff");
  } else {
    circle(x - ex, y + ey, r * 0.1, INK);
    circle(x + ex, y + ey, r * 0.1, INK);
    ctx.beginPath();
    if (mood === "happy") ctx.arc(x, y + r * 0.1, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
    else ctx.arc(x, y + r * 0.65, r * 0.4, 1.2 * Math.PI, 1.8 * Math.PI);
    ctx.stroke();
    if (mood === "sad") oval(x + ex + r * 0.05, y + r * 0.08, r * 0.07, r * 0.12, "#5aa9e6");
  }
  if (mood === "happy") {
    circle(x - r * 0.62, y + r * 0.2, r * 0.12, "rgba(240,110,110,0.45)");
    circle(x + r * 0.62, y + r * 0.2, r * 0.12, "rgba(240,110,110,0.45)");
  }
  ctx.lineCap = "butt";
}

function drawBear(x, y, s, look = 0) {
  // Bea the bear: a brown plush bear (s = about her height)
  const brown = "#8a5a35",
    light = "#c99a6b";
  oval(x, y - s * 0.28, s * 0.3, s * 0.3, brown);
  oval(x, y - s * 0.24, s * 0.18, s * 0.2, light);
  circle(x - s * 0.24, y - s * 0.06, s * 0.1, brown);
  circle(x + s * 0.24, y - s * 0.06, s * 0.1, brown);
  const hy = y - s * 0.7;
  circle(x - s * 0.17, hy - s * 0.17, s * 0.09, brown);
  circle(x + s * 0.17, hy - s * 0.17, s * 0.09, brown);
  circle(x, hy, s * 0.24, brown);
  oval(x + look * s * 0.05, hy + s * 0.07, s * 0.11, s * 0.08, light);
  circle(x + look * s * 0.06, hy + s * 0.04, s * 0.035, INK);
  circle(x - s * 0.08 + look * s * 0.05, hy - s * 0.05, s * 0.03, INK);
  circle(x + s * 0.08 + look * s * 0.05, hy - s * 0.05, s * 0.03, INK);
}

function drawBookmarkShape(x, y, w, h, color, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(0, h / 2 - w * 0.45);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawStoryBook(x, y, w, h, color) {
  R(x, y, w, h, color);
  R(x + w * 0.1, y + h * 0.12, w * 0.8, h * 0.12, GOLD);
  R(x, y, w * 0.12, h, "rgba(0,0,0,0.2)");
}

function drawBall(x, y, r) {
  const cols = [RED, YELLOW, BLUE, "#4fae5a"];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
    ctx.fill();
  }
  circle(x - r * 0.3, y - r * 0.35, r * 0.18, "rgba(255,255,255,0.45)");
}

function drawPuppet(x, y, s) {
  // a hand puppet: a green dragon with a red mouth
  const g = "#4fae5a";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.3, y);
  ctx.lineTo(x - s * 0.26, y - s * 0.55);
  ctx.quadraticCurveTo(x, y - s * 0.85, x + s * 0.26, y - s * 0.55);
  ctx.lineTo(x + s * 0.3, y);
  ctx.fill();
  oval(x, y - s * 0.62, s * 0.3, s * 0.22, g);
  oval(x, y - s * 0.52, s * 0.22, s * 0.07, "#c0392b");
  circle(x - s * 0.12, y - s * 0.78, s * 0.08, "#fff");
  circle(x + s * 0.12, y - s * 0.78, s * 0.08, "#fff");
  circle(x - s * 0.11, y - s * 0.77, s * 0.04, INK);
  circle(x + s * 0.13, y - s * 0.77, s * 0.04, INK);
  for (const sx of [-0.2, 0, 0.2]) {
    ctx.fillStyle = YELLOW;
    ctx.beginPath();
    ctx.moveTo(x + s * sx - s * 0.05, y - s * 0.86);
    ctx.lineTo(x + s * sx, y - s * 0.98);
    ctx.lineTo(x + s * sx + s * 0.05, y - s * 0.86);
    ctx.fill();
  }
  R(x - s * 0.3, y - s * 0.06, s * 0.6, s * 0.08, "#3d8a48");
}

function drawHorse(x, y, s) {
  oval(x, y - s * 0.3, s * 0.36, s * 0.22, "#f2f0ea");
  oval(x + s * 0.34, y - s * 0.62, s * 0.13, s * 0.22, "#f2f0ea");
  R(x + s * 0.26, y - s * 0.86, s * 0.06, s * 0.28, "#555");
  circle(x + s * 0.38, y - s * 0.68, s * 0.03, INK);
  for (const lx of [-0.24, -0.08, 0.1, 0.24]) R(x + s * lx, y - s * 0.14, s * 0.07, s * 0.16, "#e2ded4");
  R(x - s * 0.14, y - s * 0.46, s * 0.26, s * 0.12, "#222");
}

function drawBird(x, y, s, flap) {
  oval(x, y, s * 0.3, s * 0.24, "#3d7fd9");
  ctx.fillStyle = "#2b5fa6";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.05, y - s * 0.02);
  ctx.lineTo(x - s * 0.35, y - s * (0.32 + flap * 0.2));
  ctx.lineTo(x + s * 0.12, y - s * 0.05);
  ctx.fill();
  circle(x + s * 0.14, y - s * 0.08, s * 0.05, "#fff");
  circle(x + s * 0.15, y - s * 0.08, s * 0.025, INK);
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.28, y - s * 0.04);
  ctx.lineTo(x + s * 0.42, y + s * 0.02);
  ctx.lineTo(x + s * 0.28, y + s * 0.06);
  ctx.fill();
}

function drawChair(x, y, w, h) {
  ctx.fillStyle = "#b8262c";
  roundRect(x, y, w, h * 0.6, 12);
  ctx.fillStyle = "#c92f35";
  roundRect(x - 6, y + h * 0.45, w + 12, h * 0.4, 10);
  const dots = ["#f2c14e", "#4b79d9", "#5cb85c", "#e8e8e8", "#f39c4a"];
  for (let i = 0; i < 16; i++) circle(x + 8 + ((i * 37) % (w - 16)), y + 8 + ((i * 23) % (h * 0.75)), 3.5, dots[i % dots.length]);
  R(x + 6, y + h * 0.85, 5, h * 0.15, "#888");
  R(x + w - 11, y + h * 0.85, 5, h * 0.15, "#888");
}

// The friend from Stacks Dash: a teal book with glasses and little arms.
function drawFriend(x, y, s, pose, t) {
  let dy = 0,
    rot = 0,
    armA = 0.25; // 0 = straight out, 0.5 = straight up, 1 = across
  if (pose === "jump") dy = -Math.abs(Math.sin(t * Math.PI)) * s * 0.3;
  if (pose === "clap") armA = 0.3 + Math.abs(Math.sin(t * Math.PI)) * 0.45;
  if (pose === "wiggle") rot = Math.sin(t * Math.PI * 2) * 0.18;
  oval(x, y + 4, s * 0.38 * (1 + dy / (s * 2)), s * 0.06, "rgba(0,0,0,0.25)");
  ctx.save();
  ctx.translate(x, y + dy);
  ctx.rotate(rot);
  const bw = s * 0.62,
    bh = s * 0.8;
  // legs
  R(-bw * 0.28, -s * 0.12, s * 0.08, s * 0.12, "#1e2b2c");
  R(bw * 0.16, -s * 0.12, s * 0.08, s * 0.12, "#1e2b2c");
  // body: pages + cover + spine
  ctx.fillStyle = PAPER;
  roundRect(-bw / 2 + 6, -s * 0.12 - bh + 4, bw, bh - 8, 4);
  ctx.fillStyle = "#2f5d62";
  roundRect(-bw / 2, -s * 0.12 - bh, bw - 6, bh, 6);
  R(-bw / 2, -s * 0.12 - bh, s * 0.09, bh, "#234548");
  R(-bw / 2 + s * 0.14, -s * 0.12 - s * 0.2, bw * 0.55, s * 0.04, GOLD);
  // glasses and eyes
  const ey = -s * 0.12 - bh * 0.68;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = s * 0.025;
  for (const ex of [-s * 0.02, s * 0.16]) {
    ctx.beginPath();
    ctx.arc(ex, ey, s * 0.075, 0, Math.PI * 2);
    ctx.stroke();
    circle(ex, ey, s * 0.025, INK);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = s * 0.025;
  ctx.beginPath();
  ctx.arc(s * 0.07, ey + s * 0.14, s * 0.07, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  // arms, waving from the sides of the cover
  ctx.strokeStyle = "#1e2b2c";
  ctx.lineWidth = s * 0.05;
  ctx.lineCap = "round";
  const shoulderY = -s * 0.12 - bh * 0.5;
  for (const side of [-1, 1]) {
    const sx = side * (bw / 2 - 2);
    ctx.beginPath();
    ctx.moveTo(sx, shoulderY);
    ctx.lineTo(sx + side * s * 0.34 * Math.cos(armA * Math.PI), shoulderY - s * 0.34 * Math.sin(armA * Math.PI));
    ctx.stroke();
    circle(sx + side * s * 0.34 * Math.cos(armA * Math.PI), shoulderY - s * 0.34 * Math.sin(armA * Math.PI), s * 0.04, "#1e2b2c");
  }
  ctx.lineCap = "butt";
  ctx.restore();
}

// ---------- Confetti ----------
function confetti(x, y, n = 40) {
  const cols = [RED, BLUE, YELLOW, "#ffffff", "#e0488f", "#4fae5a"];
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -Math.random() * 0.5 - 0.1,
      life: 900 + Math.random() * 700,
      color: cols[i % cols.length],
      spin: Math.random() * 6,
    });
  }
}
function sparkle(x, y) {
  confetti(x, y, 14);
}

// =====================================================================
// Activities. Each has init / update / draw / tap (and down/up if needed).
// =====================================================================

// ---------- Love & Calm: balloon breathing, then feelings ----------
const calm = {
  init() {
    act = { phase: "breathe", s: 0, holding: false, breaths: 0, peaked: false, faces: shuffle(["happy", "sad", "sleepy"]), round: 0, hug: null, t: 0 };
    say("Let's breathe with the balloon. Press and hold to breathe in. Let go to breathe out.");
  },
  update(dt) {
    act.t += dt;
    if (act.phase === "breathe") {
      act.s = act.holding ? Math.min(1, act.s + dt / 2200) : Math.max(0, act.s - dt / 1800);
      if (act.s >= 0.85) act.peaked = true;
      if (act.peaked && !act.holding && act.s <= 0.1) {
        act.peaked = false;
        act.breaths++;
        sfx.yay();
        sparkle(W / 2, 260);
        if (act.breaths >= 3) {
          act.phase = "faces";
          act.round = 0;
          setTimeout(() => say("Great breathing! Now, which face is happy?"), 300);
        } else say(act.breaths === 1 ? "Nice and slow! Let's do it again." : "One more big breath!");
      }
    }
    if (act.hug && time - act.hug > 2600) earnPin("calm");
  },
  down() {
    if (act.phase !== "breathe" || act.holding) return;
    act.holding = true;
    say("Breathe in...");
  },
  up() {
    if (act.phase !== "breathe" || !act.holding) return;
    act.holding = false;
    if (act.s > 0.4) say("And breathe out...");
  },
  faceAt(x, y) {
    return act.faces.findIndex((m, i) => Math.hypot(x - (200 + i * 200), y - 310) < 95);
  },
  tap(x, y) {
    if (act.phase !== "faces" || act.hug) return;
    const i = this.faceAt(x, y);
    if (i < 0) return;
    const mood = act.faces[i],
      target = act.round === 0 ? "happy" : "sad";
    if (mood === target) {
      sfx.yay();
      sparkle(200 + i * 200, 310);
      if (act.round === 0) {
        act.round = 1;
        say("Yes! That's a happy face! Now, which friend feels sad? Tap to give them a hug.");
      } else {
        act.hug = time;
        act.hugIndex = i;
        say("Aww. A big hug! Hugs help us feel better.");
      }
    } else {
      sfx.soft();
      say(`That face looks ${mood}. ${act.round === 0 ? "Which face is happy?" : "Which friend feels sad?"}`);
    }
  },
  progress() {
    return [act.breaths + act.round + (act.hug ? 1 : 0), 5];
  },
  draw() {
    if (act.phase === "breathe") {
      const r = 45 + act.s * 115,
        cx = W / 2,
        cy = 300 - act.s * 20;
      // string
      ctx.strokeStyle = "#f3ead7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 1.1);
      ctx.quadraticCurveTo(cx + 20, cy + r * 1.1 + 50, cx, 470);
      ctx.stroke();
      oval(cx, cy, r, r * 1.1, "#e0488f");
      ctx.fillStyle = "#e0488f";
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy + r * 1.1 + 8);
      ctx.lineTo(cx, cy + r * 1.1 - 4);
      ctx.lineTo(cx + 8, cy + r * 1.1 + 8);
      ctx.fill();
      oval(cx - r * 0.35, cy - r * 0.45, r * 0.18, r * 0.28, "rgba(255,255,255,0.35)");
      drawFace(cx, cy, r * 0.5, "happy");
      label(act.holding ? "Breathe in…" : act.s > 0.05 ? "Breathe out…" : "Press and hold", W / 2, 545, 26);
    } else {
      act.faces.forEach((mood, i) => {
        const x = 200 + i * 200,
          hugging = act.hug && i === act.hugIndex;
        drawFace(x, 310, 80, hugging ? "happy" : mood);
        if (hugging) {
          const k = Math.min(1, (time - act.hug) / 500);
          drawIcon("calm", x + 70, 230 - k * 20, 60 + k * 20, "#e0488f");
        }
      });
      label(act.round === 0 ? "Which face is happy?" : "Who feels sad? Give a hug!", W / 2, 520, 26);
    }
  },
};

// ---------- Talk & Sing: find things, then sing ----------
const TALK_ITEMS = { bear: "teddy bear", book: "book", ball: "ball", puppet: "puppet" };
const talk = {
  init() {
    const spots = shuffle([140, 313, 487, 660]);
    const names = Object.keys(TALK_ITEMS);
    act = { pos: Object.fromEntries(names.map((n, i) => [n, spots[i]])), order: shuffle([...names]), round: 0, found: new Set(), bounce: {}, phase: "find", singAt: 0 };
    say(`Let's find things in the library! Can you find the ${TALK_ITEMS[act.order[0]]}?`);
  },
  update() {
    if (act.phase === "sing" && time - act.singAt > 6800) earnPin("talk");
  },
  itemAt(x, y) {
    return Object.keys(TALK_ITEMS).find((n) => Math.abs(x - act.pos[n]) < 85 && y > 200 && y < 450);
  },
  tap(x, y) {
    if (act.phase !== "find") return;
    const n = this.itemAt(x, y);
    if (!n) return;
    const target = act.order[act.round];
    act.bounce[n] = time;
    if (n === target) {
      act.found.add(n);
      sfx.yay();
      sparkle(act.pos[n], 300);
      act.round++;
      if (act.round < act.order.length) say(`Yes! That's the ${TALK_ITEMS[n]}! Can you say ${TALK_ITEMS[n]}? Now, find the ${TALK_ITEMS[act.order[act.round]]}!`);
      else {
        act.phase = "sing";
        act.singAt = time;
        say("You found them all! Now let's sing! La la la!");
        setTimeout(() => sfx.song(), 2200);
      }
    } else {
      sfx.soft();
      say(`That's the ${TALK_ITEMS[n]}! Where is the ${TALK_ITEMS[target]}?`);
    }
  },
  progress() {
    return [act.found.size + (act.phase === "sing" ? 1 : 0), 5];
  },
  draw() {
    // a rug "stage" for the toys
    oval(W / 2, 440, 360, 46, "rgba(232, 181, 42, 0.5)");
    for (const n of Object.keys(TALK_ITEMS)) {
      const x = act.pos[n];
      const b = act.bounce[n] ? Math.max(0, 1 - (time - act.bounce[n]) / 500) : 0;
      const dance = act.phase === "sing" ? Math.abs(Math.sin(time * 0.006 + x)) * 18 : 0;
      const y = 430 - Math.sin(b * Math.PI) * 30 - dance;
      if (n === "bear") drawBear(x, y, 190);
      if (n === "book") {
        ctx.save();
        ctx.translate(x, y - 80);
        ctx.rotate(-0.08);
        drawStoryBook(-50, -70, 100, 140, RED);
        ctx.restore();
      }
      if (n === "ball") drawBall(x, y - 60, 60);
      if (n === "puppet") drawPuppet(x, y, 190);
      if (act.found.has(n)) drawIcon("move", x + 55, 230, 50, YELLOW);
    }
    if (act.phase === "sing") {
      for (let i = 0; i < 6; i++) {
        const k = ((time * 0.0004 + i / 6) % 1);
        ctx.globalAlpha = 1 - k;
        drawIcon("talk", 120 + i * 112, 220 - k * 80, 46, ["#fff", YELLOW, "#e0488f"][i % 3]);
        ctx.globalAlpha = 1;
      }
      label("La la la! Sing along!", W / 2, 545, 26);
    } else label(`Find the ${TALK_ITEMS[act.order[act.round]]}!`, W / 2, 545, 28);
  },
};

// ---------- Count & Compare ----------
const count = {
  init() {
    const more = Math.random() < 0.5 ? "left" : "right";
    act = { phase: "count", round: 0, rounds: [3, 5], counted: [], wait: null, more, cmpDone: null };
    say("Let's count books! Tap each book and count with me.");
  },
  update() {
    if (act.wait !== null && time > act.wait) {
      act.wait = null;
      act.round++;
      act.counted = [];
      if (act.round < act.rounds.length) say("Let's count some more! Tap each book.");
      else {
        act.phase = "compare";
        say("Which stack has more books? Tap it!");
      }
    }
    if (act.cmpDone && time - act.cmpDone > 2600) earnPin("count");
  },
  bookX(i, n) {
    return W / 2 - ((n - 1) * 100) / 2 + i * 100;
  },
  tap(x, y) {
    if (act.phase === "count" && act.wait === null) {
      const n = act.rounds[act.round];
      for (let i = 0; i < n; i++) {
        if (Math.abs(x - this.bookX(i, n)) < 48 && y > 230 && y < 450 && !act.counted.includes(i)) {
          act.counted.push(i);
          const c = act.counted.length;
          sfx.count(c);
          if (c < n) say(NUMBER_WORDS[c]);
          else {
            const word = NUMBER_WORDS[c][0].toUpperCase() + NUMBER_WORDS[c].slice(1);
            say(`${word}! ${word} books! Great counting!`);
            sparkle(W / 2, 300);
            act.wait = time + 2800;
          }
          return;
        }
      }
    } else if (act.phase === "compare" && !act.cmpDone) {
      const side = x < W / 2 ? "left" : "right";
      if (y < 200 || y > 480) return;
      if (side === act.more) {
        act.cmpDone = time;
        sfx.yay();
        sparkle(side === "left" ? 230 : 570, 330);
        say("Yes! That stack has more books! Four books!");
      } else {
        sfx.soft();
        say("That stack has two books. Which stack has more?");
      }
    }
  },
  progress() {
    return [act.round + (act.cmpDone ? 1 : 0), 3];
  },
  draw() {
    const colors = [RED, BLUE, YELLOW, "#4fae5a", "#9b59b6"];
    if (act.phase === "count") {
      const n = act.rounds[act.round];
      R(W / 2 - n * 55 - 20, 440, n * 110 + 40, 16, "#b88e55");
      for (let i = 0; i < n; i++) {
        const x = this.bookX(i, n),
          counted = act.counted.indexOf(i);
        const lift = counted >= 0 ? 10 : 0;
        drawStoryBook(x - 36, 270 - lift, 72, 170, colors[i % colors.length]);
        if (counted >= 0) {
          circle(x, 236 - lift, 30, "#fff");
          text(String(counted + 1), x, 249 - lift, "bold 36px Georgia, serif", INK);
        }
      }
      label(act.wait ? `${NUMBER_WORDS[n]} books!` : "Tap each book to count", W / 2, 545, 26);
    } else {
      const stacks = act.more === "left" ? [4, 2] : [2, 4];
      stacks.forEach((k, si) => {
        const cx = si === 0 ? 230 : 570;
        for (let i = 0; i < k; i++) {
          const y = 440 - (i + 1) * 40;
          R(cx - 80 + (i % 2) * 8, y, 160, 36, colors[(i + si * 2) % colors.length]);
          R(cx - 72 + (i % 2) * 8, y + 6, 148, 24, PAPER);
          R(cx - 80 + (i % 2) * 8, y, 14, 36, colors[(i + si * 2) % colors.length]);
        }
        R(cx - 100, 440, 200, 10, "#b88e55");
      });
      label("Which stack has more?", W / 2, 545, 28);
    }
  },
};

// ---------- Move & Play: jump, clap, wiggle, then pop bubbles ----------
const MOVES = [
  { pose: "jump", say: "Stand up! Let's jump like a bunny! Ready? Jump!", word: "Jump!" },
  { pose: "clap", say: "Now clap your hands with me!", word: "Clap!" },
  { pose: "wiggle", say: "Wiggle, wiggle, wiggle!", word: "Wiggle!" },
];
const BEAT = 750,
  LEAD = 2400,
  BEATS = 5,
  POPS = 10;
const move = {
  init() {
    act = { phase: "moves", i: 0, t: 0, beat: 0, pops: 0, bubbles: [], doneAt: null };
    say(MOVES[0].say);
  },
  update(dt) {
    act.t += dt;
    if (act.phase === "moves") {
      const b = act.t < LEAD ? 0 : Math.floor((act.t - LEAD) / BEAT) + 1;
      if (b !== act.beat && b <= BEATS) {
        act.beat = b;
        const pose = MOVES[act.i].pose;
        if (pose === "jump") sfx.boing();
        else if (pose === "clap") {
          sfx.clap();
          setTimeout(sfx.clap, 60);
        } else sfx.wobble();
      }
      if (act.t > LEAD + BEATS * BEAT + 700) {
        act.i++;
        act.t = 0;
        act.beat = 0;
        if (act.i < MOVES.length) say(MOVES[act.i].say);
        else {
          act.phase = "bubbles";
          say("Pop the bubbles! Tap, tap, tap!");
        }
      }
    } else {
      while (act.bubbles.length < 5) {
        act.bubbles.push({
          x: 120 + Math.random() * (W - 240),
          y: H + 60 + Math.random() * 120,
          r: 48 + Math.random() * 14,
          vy: 0.045 + Math.random() * 0.03,
          ph: Math.random() * 6,
        });
      }
      for (const b of act.bubbles) b.y -= b.vy * dt;
      act.bubbles = act.bubbles.filter((b) => b.y > 70 - b.r);
      if (act.doneAt && time - act.doneAt > 900) earnPin("move");
    }
  },
  tap(x, y) {
    if (act.phase !== "bubbles" || act.doneAt) return;
    const i = act.bubbles.findIndex((b) => Math.hypot(x - (b.x + Math.sin(time * 0.002 + b.ph) * 20), y - b.y) < b.r + 14);
    if (i < 0) return;
    const b = act.bubbles[i];
    act.bubbles.splice(i, 1);
    act.pops++;
    sfx.pop();
    sparkle(b.x, b.y);
    if (act.pops >= POPS) {
      act.doneAt = time;
      say("Pop pop pop! You popped them all!");
    }
  },
  progress() {
    return [act.i + (act.doneAt ? 1 : 0), MOVES.length + 1];
  },
  draw() {
    if (act.phase === "moves") {
      const m = MOVES[act.i];
      const beatT = act.t < LEAD ? 0 : ((act.t - LEAD) % BEAT) / BEAT;
      drawFriend(W / 2, 460, 260, act.t < LEAD ? "" : m.pose, beatT);
      if (act.beat > 0) {
        circle(640, 250, 58, "rgba(20,14,10,0.7)");
        text(String(act.beat), 640, 272, "bold 64px Georgia, serif", YELLOW);
      }
      label(m.word, W / 2, 545, 30);
    } else {
      for (const b of act.bubbles) {
        const x = b.x + Math.sin(time * 0.002 + b.ph) * 20;
        ctx.fillStyle = "rgba(170, 220, 255, 0.35)";
        ctx.beginPath();
        ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 3;
        ctx.stroke();
        circle(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.16, "rgba(255,255,255,0.8)");
      }
      for (let i = 0; i < POPS; i++) circle(W / 2 - 135 + i * 30, 150, 10, i < act.pops ? "#aee0ff" : "rgba(243,234,215,0.3)");
      label("Pop the bubbles!", W / 2, 545, 28);
    }
  },
};

// ---------- Read & Share: a tiny picture story ----------
const PAGES = [
  "This is Bea the bear. Bea loves books!",
  "Whoosh! The wind blew Bea's red bookmark away!",
  "Bea looked under the chair. Not there!",
  "Bea looked by the shelf. Not there! Where could it be?",
];
const ENDINGS = [
  { key: "bird", text: "A friendly bird flew down with the bookmark. Thank you, bird!" },
  { key: "horse", text: "Her friend Hazel the horse found it! Friends help friends." },
  { key: "book", text: "It was inside her book the whole time! Silly Bea!" },
];
const read = {
  init() {
    act = { page: 0, choice: null, endAt: null, turnAt: 0 };
    say(PAGES[0]);
  },
  update() {
    if (act.endAt && time - act.endAt > 9000) earnPin("read");
  },
  next() {
    if (act.page < 3) {
      act.page++;
      act.turnAt = time;
      sfx.page();
      say(PAGES[act.page]);
    } else if (act.page === 3) {
      act.page = 4;
      act.turnAt = time;
      sfx.page();
      say("What happens next? You choose! Tap a picture.");
    } else if (act.page === 5) earnPin("read");
  },
  prev() {
    if (act.page > 0 && act.page <= 4) {
      act.page--;
      act.turnAt = time;
      sfx.page();
      say(PAGES[act.page]);
    }
  },
  tap(x, y) {
    if (act.page !== 4) return;
    const i = [0, 1, 2].find((k) => Math.abs(x - (160 + k * 240)) < 110 && y > 170 && y < 450);
    if (i === undefined) return;
    act.choice = i;
    act.page = 5;
    act.endAt = time;
    act.turnAt = time;
    sfx.yay();
    say(ENDINGS[i].text + " The end!");
  },
  progress() {
    return [Math.min(5, act.page), 5];
  },
  drawScene(kind, x, y, w, h) {
    // book page background
    R(x, y, w, h, "#fffaf0");
    ctx.strokeStyle = "#e5d8bd";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    const cx = x + w / 2,
      base = y + h - 20;
    R(x, base, w, 20, "#d8c7a3");
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (kind === 0) {
      drawBear(cx - 40, base, h * 0.75);
      drawStoryBook(cx - 10, base - h * 0.42, h * 0.3, h * 0.22, BLUE);
      drawBookmarkShape(cx + h * 0.08, base - h * 0.47, 14, 34, RED);
    } else if (kind === 1) {
      drawBear(cx - 90, base, h * 0.75, 1);
      ctx.strokeStyle = "#9fb7cc";
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx + 20 + i * 40, y + h * 0.4 + i * 14, 26, Math.PI, Math.PI * 1.8);
        ctx.stroke();
      }
      const k = (time - act.turnAt) / 1000;
      drawBookmarkShape(cx + 120 + Math.sin(k * 3) * 10, y + h * 0.3 - Math.min(20, k * 10), 16, 38, RED, Math.sin(k * 2) * 0.6);
    } else if (kind === 2) {
      drawChair(cx - 20, base - 110, 130, 110);
      drawBear(cx - 110, base, h * 0.7, 1);
    } else if (kind === 3) {
      shelfUnit(cx - 10, y + 40, 170, h - 60);
      drawBear(cx - 110, base, h * 0.7, 1);
      text("?", cx - 120, y + 60, "bold 44px Georgia, serif", BLUE);
      text("?", cx - 60, y + 46, "bold 32px Georgia, serif", RED);
    } else if (kind === "bird") {
      const f = Math.sin(time * 0.012);
      drawBird(cx - h * 0.05, y + h * 0.42, h * 0.55, f);
      drawBookmarkShape(cx + h * 0.2, y + h * 0.5, 14, 32, RED, 0.5); // held in its beak
    } else if (kind === "horse") {
      drawHorse(cx - h * 0.08, base, h * 0.7);
      drawBookmarkShape(cx + h * 0.2, base - h * 0.42, 14, 32, RED, -0.3); // held in its mouth
    } else if (kind === "book") {
      drawStoryBook(cx - h * 0.25, base - h * 0.62, h * 0.5, h * 0.6, BLUE);
      drawBookmarkShape(cx, base - h * 0.66, 16, 40, RED);
    }
    ctx.restore();
  },
  draw() {
    if (act.page <= 3) {
      this.drawScene(act.page, 110, 140, 580, 320);
      label(PAGES[act.page], W / 2, 520, PAGES[act.page].length > 42 ? 21 : 24);
      roundButton(W - 66, 300, 44, "#3f9e4f", (x, y, r) => arrow(x, y, r, 1), () => this.next());
      if (act.page > 0) roundButton(66, 300, 44, NAVY, (x, y, r) => arrow(x, y, r, -1), () => this.prev());
    } else if (act.page === 4) {
      ENDINGS.forEach((e, k) => {
        const x = 160 + k * 240;
        this.drawScene(e.key, x - 105, 180, 210, 250);
      });
      label("What happens next? You choose!", W / 2, 520, 24);
    } else {
      this.drawScene(ENDINGS[act.choice].key, 190, 140, 420, 320);
      label("The End!", W / 2, 520, 28);
      roundButton(W - 66, 300, 44, "#3f9e4f", (x, y, r) => drawIcon("move", x, y, r * 1.2, "#fff"), () => this.next());
    }
  },
};

function arrow(x, y, r, dir) {
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(x + dir * r * 0.42, y);
  ctx.lineTo(x - dir * r * 0.22, y - r * 0.4);
  ctx.lineTo(x - dir * r * 0.22, y + r * 0.4);
  ctx.closePath();
  ctx.fill();
}

const ACTS = { calm, talk, count, move, read };

// =====================================================================
// Screens
// =====================================================================
const HOME_SPOTS = [
  { x: 120, y: 250 },
  { x: 290, y: 250 },
  { x: 460, y: 250 },
  { x: 205, y: 424 },
  { x: 375, y: 424 },
];

function goHome() {
  hush();
  scene = "home";
  act = null;
  celebrate = null;
  say(pins.size === PINS.length ? "You have all five pins! Play any game again." : "Pick a game! Tap a circle.");
}

function startActivity(key) {
  scene = key;
  sfx.tap();
  ACTS[key].init();
}

function earnPin(key) {
  if (scene === "pin") return;
  const isNew = !pins.has(key);
  pins.add(key);
  savePins();
  const all = isNew && pins.size === PINS.length;
  scene = "pin";
  act = null;
  celebrate = { key, t: 0, all, isNew };
  confetti(W / 2, 220, 60);
  if (all) {
    sfx.allPins();
    say(`Hooray! You earned the ${PIN[key].spoken} pin! Wow! You have all five pins! Your tote bag is full!`);
  } else {
    sfx.pin();
    say(isNew ? `Hooray! You earned the ${PIN[key].spoken} pin!` : `You did it again! Great job!`);
  }
}

function drawHome() {
  drawRoom(false);
  // title sign
  ctx.fillStyle = MAPLE;
  roundRect(110, 72, 420, 70, 10);
  R(110, 134, 420, 8, "#b07636");
  drawLogo(146, 80, 40);
  text("LITTLE LEARNERS", 330, 100, "bold 14px system-ui, sans-serif", "#5a3b1c");
  text("Pin Quest", 330, 130, "bold 32px Georgia, serif", "#fffaf0");
  chrome(false);

  PINS.forEach((p, i) => {
    const s = HOME_SPOTS[i];
    const bob = Math.sin(time * 0.003 + i) * 3;
    circle(s.x, s.y + 6 + bob, 66, "rgba(0,0,0,0.25)");
    circle(s.x, s.y + bob, 66, "#fff");
    circle(s.x, s.y + bob, 58, p.color);
    drawIcon(p.key, s.x, s.y + bob, 74);
    if (pins.has(p.key)) {
      circle(s.x + 46, s.y - 46 + bob, 18, GOLD);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.x + 37, s.y - 46 + bob);
      ctx.lineTo(s.x + 44, s.y - 39 + bob);
      ctx.lineTo(s.x + 55, s.y - 53 + bob);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    ctx.font = "bold 16px Georgia, serif";
    const tw = ctx.measureText(p.name).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.78)";
    roundRect(s.x - tw / 2 - 10, s.y + 74, tw + 20, 26, 8);
    text(p.name, s.x, s.y + 93, "bold 16px Georgia, serif", PAPER);
    addButton(s.x - 70, s.y - 70, 140, 175, () => startActivity(p.key));
  });

  // the tote bag with earned pins
  drawTote(560, 170, 210, 290);
  label(`${pins.size} of 5 pins`, 665, 500, 20);

  // grown-ups: hold to reset (small, out of the way)
  const rx = 600,
    ry = 560,
    rw = 186,
    rh = 30;
  ctx.fillStyle = "rgba(20, 14, 10, 0.55)";
  roundRect(rx, ry, rw, rh, 8);
  const k = resetHold ? Math.min(1, (time - resetHold) / 2000) : 0;
  if (k > 0) {
    ctx.fillStyle = "rgba(212, 166, 74, 0.6)";
    roundRect(rx, ry, rw * k, rh, 8);
  }
  text("Grown-ups: hold to reset", rx + rw / 2, ry + 20, "bold 12px system-ui, sans-serif", PAPER);
  addButton(rx, ry, rw, rh, null, true);
}

function drawPinScene() {
  drawRoom(true);
  const c = celebrate;
  const tx = 290,
    ty = 150,
    tw = 220,
    th = 300;
  const i = PINS.findIndex((p) => p.key === c.key);
  const slot = toteSlot(i, tx, ty, tw, th);
  drawTote(tx, ty, tw, th, c.t < 1100 ? c.key : null);
  // the pin flies onto the bag
  if (c.t < 1100) {
    const k = Math.min(1, Math.max(0, (c.t - 300) / 800));
    const e = 1 - Math.pow(1 - k, 3);
    const x = W / 2 + (slot.x - W / 2) * e,
      y = 120 + (slot.y - 120) * e;
    drawPin(c.key, x, y, 70 - (70 - tw * 0.11) * e);
  }
  if (c.all) {
    for (let s = 0; s < 8; s++) {
      const a = time * 0.001 + (s * Math.PI) / 4;
      drawIcon("move", W / 2 + Math.cos(a) * 300, 300 + Math.sin(a) * 180, 46, [YELLOW, "#fff"][s % 2]);
    }
    label("All 5 pins! Your tote bag is full!", W / 2, 120, 26);
  } else label(c.isNew ? `You earned the ${PIN[c.key].name} pin!` : "You did it again!", W / 2, 120, 26);
  if (c.t > 1200) {
    roundButton(W / 2, 520, 46, "#3f9e4f", (x, y, r) => drawHouse(x, y, r, "#fff"), () => goHome());
  }
  chrome(false);
}

function overlay(title, sub, extra) {
  ctx.fillStyle = "rgba(26, 18, 12, 0.45)";
  ctx.fillRect(0, 0, W, H);
  const widths = [["bold 34px Georgia, serif", title], ["18px Georgia, serif", sub], ["15px Georgia, serif", extra || ""]].map(
    ([font, t]) => ((ctx.font = font), ctx.measureText(t).width)
  );
  const pw = Math.max(...widths) + 56,
    ph = (extra ? 112 : 88) + 50;
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
  buttons = [];
  if (scene === "home" || state === "ready") drawHome();
  else if (scene === "pin") drawPinScene();
  else {
    drawRoom(true);
    const a = ACTS[scene];
    a.draw();
    const [done, total] = a.progress();
    progressDots(done, total, PIN[scene].color);
    chrome(true);
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 500));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    R(-4, -3, 8, 6, p.color);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  if (state === "ready") {
    buttons = [];
    overlay("Pin Quest", "Tap to start", "Five little games · earn pins for your tote bag");
  }
  if (state === "paused") {
    buttons = [];
    overlay("Paused", "Tap to keep playing");
  }
}

// ---------- Main loop ----------
function update(dt) {
  if (state !== "playing") return;
  time += dt;
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.0007 * dt;
    p.spin += dt * 0.01;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  if (scene === "pin") celebrate.t += dt;
  else if (ACTS[scene]) ACTS[scene].update(dt);
  if (resetHold && time - resetHold >= 2000) {
    resetHold = null;
    pins.clear();
    savePins();
    sfx.soft();
    say("All pins cleared. Ready for a new friend!");
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Input ----------
function toCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
}

function start() {
  state = "playing";
  sfx.tap();
  goHome();
}

function pause() {
  if (state !== "playing") return;
  state = "paused";
  hush();
  if (act) act.holding = false;
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (state === "ready") return start();
  if (state === "paused") {
    state = "playing";
    return;
  }
  const p = toCanvas(e);
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      if (b.hold) resetHold = time;
      else b.action();
      return;
    }
  }
  const a = ACTS[scene];
  if (!a) return;
  if (a.down) a.down(p.x, p.y);
  if (a.tap) a.tap(p.x, p.y);
});
function release() {
  resetHold = null;
  const a = ACTS[scene];
  if (a && a.up && state === "playing") a.up();
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("pointerleave", release);

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyM") return toggleMute();
  if (e.code === "KeyP" || e.code === "Escape") {
    if (state === "playing") pause();
    else if (state === "paused") state = "playing";
    return;
  }
  if (state === "ready") {
    if (e.code === "Enter" || e.code === "Space") {
      e.preventDefault();
      start();
    }
    return;
  }
  if (state !== "playing") return;
  if (scene === "home" && /^Digit[1-5]$/.test(e.code)) return startActivity(PINS[+e.code.slice(5) - 1].key);
  if (e.code === "KeyH" || e.code === "Home") return goHome();
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (e.repeat) return;
    if (scene === "pin" && celebrate.t > 1200) return goHome();
    if (scene === "calm") return calm.down();
    if (scene === "read") return read.next();
  }
  if (scene === "read" && e.code === "ArrowRight") read.next();
  if (scene === "read" && e.code === "ArrowLeft") read.prev();
});
document.addEventListener("keyup", (e) => {
  if ((e.code === "Space" || e.code === "Enter") && scene === "calm" && state === "playing") calm.up();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});

// ---------- Storage (guarded: can throw in private mode) ----------
function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

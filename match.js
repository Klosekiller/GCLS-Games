// Spine Match: a library memory game.
// Book spines stand on the shelf with their backs showing. Flip two at a time to find the pairs.
// Early shelves match picture to picture; later shelves match a picture to its book topic.

// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width,
  H = canvas.height;

// ---------- Tunables (units: px and ms) ----------
const CARD_W = 60,
  CARD_H = 100,
  GAP_X = 10;
const SHELF_H = CARD_H + 22; // headroom + card + shelf board
const CASE_PAD = 16; // space inside the bookcase frame
const FRAME = 12; // bookcase frame thickness
const FLIP_MS = 220; // time for half a flip
const MATCH_DELAY = 350; // pause before a found pair is marked
const MISS_DELAY = 900; // how long a wrong pair stays face up

// Rows × columns for each shelf (level). "genre" levels pair a picture with its topic label.
const LEVELS = [
  { rows: 2, cols: 4, mode: "picture" },
  { rows: 2, cols: 6, mode: "picture" },
  { rows: 3, cols: 6, mode: "picture" },
  { rows: 3, cols: 6, mode: "genre" },
  { rows: 4, cols: 6, mode: "genre" },
];

// Each item: a picture, the book topic it belongs to, and its spine color.
const ITEMS = [
  { icon: "rocket", topic: "Space", color: "#3d4c8c" },
  { icon: "fish", topic: "Ocean", color: "#2f7d84" },
  { icon: "tree", topic: "Nature", color: "#4f7942" },
  { icon: "crown", topic: "Fairy Tales", color: "#6b3e75" },
  { icon: "ghost", topic: "Spooky", color: "#4a4f5c" },
  { icon: "note", topic: "Music", color: "#c92a2f" },
  { icon: "apple", topic: "Cooking", color: "#a0522d" },
  { icon: "cat", topic: "Animals", color: "#d9773a" },
  { icon: "glass", topic: "Mystery", color: "#2b3768" },
  { icon: "heart", topic: "Friends", color: "#bf4097" },
  { icon: "sun", topic: "Weather", color: "#b5893b" },
  { icon: "ball", topic: "Sports", color: "#3a7fc0" },
];

// ---------- State ----------
let levelIndex = 0;
let cards = []; // { item, face: "icon"|"label", state: "down"|"up"|"matched", flip, shake, x, y }
let up = []; // indexes of face-up, unresolved cards
let resolving = null; // null | "match" | "miss"
let resolveTimer = 0;
let moves = 0,
  elapsed = 0,
  timing = false;
let lastStars = 0;
let focus = 0,
  keyboardMode = false;
let particles = [],
  popups = [];
let state = "ready"; // ready | playing | paused | over
let time = 0;
let best = loadBest(); // { [level]: { stars, moves, time } }
let caseBox = { x: 0, y: 0, w: 0, h: 0 };

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startLevel(i, silent = false) {
  levelIndex = i;
  const L = LEVELS[i];
  const pairs = (L.rows * L.cols) / 2;
  const items = shuffle([...ITEMS]).slice(0, pairs);
  cards = [];
  for (const item of items) {
    cards.push({ item, face: "icon" });
    cards.push({ item, face: L.mode === "genre" ? "label" : "icon" });
  }
  shuffle(cards);
  for (const c of cards) Object.assign(c, { state: "down", flip: 0, shake: 0 });
  layout(L);
  up = [];
  resolving = null;
  moves = 0;
  elapsed = 0;
  timing = false;
  particles = [];
  popups = [];
  focus = 0;
  state = "playing";
  if (!silent) sfx.start();
}

// Center the bookcase in the space below the score bar.
function layout(L) {
  const innerW = L.cols * CARD_W + (L.cols - 1) * GAP_X;
  const w = innerW + CASE_PAD * 2 + FRAME * 2;
  const h = L.rows * SHELF_H + FRAME * 2;
  const top = 116,
    bottom = H - 12;
  caseBox = { x: (W - w) / 2, y: top + Math.max(0, (bottom - top - h) / 2), w, h };
  cards.forEach((c, i) => {
    const r = Math.floor(i / L.cols),
      col = i % L.cols;
    c.x = caseBox.x + FRAME + CASE_PAD + col * (CARD_W + GAP_X);
    c.y = caseBox.y + FRAME + r * SHELF_H + 14;
  });
}

// ---------- Rules ----------
function flipCard(i) {
  const c = cards[i];
  if (state !== "playing" || !c || c.state !== "down") return;
  if (resolving === "match") return;
  if (resolving === "miss") resolveNow(); // tapping a new book hurries the wrong pair back
  c.state = "up";
  up.push(i);
  timing = true;
  sfx.flip();
  if (up.length === 2) {
    moves++;
    const [a, b] = up.map((k) => cards[k]);
    resolving = a.item === b.item ? "match" : "miss";
    resolveTimer = resolving === "match" ? MATCH_DELAY : MISS_DELAY;
    if (resolving === "miss") {
      a.shake = b.shake = 350;
      setTimeout(() => sfx.miss(), 200);
    }
  }
}

function resolveNow() {
  const pair = up.map((k) => cards[k]);
  if (resolving === "match") {
    for (const c of pair) {
      c.state = "matched";
      for (let n = 0; n < 6; n++) burst(c.x + CARD_W / 2, c.y + CARD_H / 2, 1, n % 2 ? GOLD : PAPER);
    }
    sfx.match();
    const mid = pair.reduce((s, c) => s + c.x + CARD_W / 2, 0) / 2;
    const midY = Math.min(...pair.map((c) => c.y)) - 4;
    popup("Match!", mid, midY);
    if (cards.every((c) => c.state === "matched")) setTimeout(levelComplete, 500);
  } else {
    for (const c of pair) c.state = "down";
  }
  up = [];
  resolving = null;
}

function starsFor(m, pairs) {
  if (m <= Math.ceil(pairs * 1.5)) return 3;
  if (m <= Math.ceil(pairs * 2.2)) return 2;
  return 1;
}

function levelComplete() {
  if (state !== "playing") return;
  timing = false;
  const pairs = cards.length / 2;
  lastStars = starsFor(moves, pairs);
  const prev = best[levelIndex];
  const better = !prev || lastStars > prev.stars || (lastStars === prev.stars && moves < prev.moves) ||
    (lastStars === prev.stars && moves === prev.moves && elapsed < prev.time);
  if (better) {
    best[levelIndex] = { stars: lastStars, moves, time: Math.round(elapsed) };
    safeSet("match-best", JSON.stringify(best));
  }
  state = "over";
  sfx.level(lastStars);
}

function nextLevel() {
  startLevel(levelIndex + 1 < LEVELS.length ? levelIndex + 1 : 0);
}

function loadBest() {
  try {
    const v = JSON.parse(safeGet("match-best") || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

// ---------- Update ----------
function update(dt) {
  time += dt;
  updateParticles(dt);
  if (state !== "playing") return;
  if (timing) elapsed += dt;

  for (const c of cards) {
    const target = c.state === "down" ? 0 : 1;
    const step = dt / (FLIP_MS * 2);
    c.flip = target > c.flip ? Math.min(target, c.flip + step) : Math.max(target, c.flip - step);
    if (c.shake > 0) c.shake = Math.max(0, c.shake - dt);
  }

  if (resolving) {
    resolveTimer -= dt;
    if (resolveTimer <= 0) resolveNow();
  }
}

// ---------- Particles & popups ----------
function burst(x, y, n, color, size = 5) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -Math.random() * 0.35,
      life: 500 + Math.random() * 400,
      color,
      size,
    });
  }
}
function popup(text, x, y) {
  popups.push({ text, x, y, life: 900 });
}
function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.0009 * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) {
    p.y -= 0.03 * dt;
    p.life -= dt;
  }
  popups = popups.filter((p) => p.life > 0);
}

// ---------- Sound (Web Audio API, no files needed) ----------
setupSound("match");

const sfx = {
  flip: () => tone(600, 900, 0.06, "triangle", 0.1),
  match: () => {
    tone(784, 784, 0.08, "sine", 0.13);
    tone(1175, 1175, 0.14, "sine", 0.12, 0.07);
  },
  miss: () => tone(320, 220, 0.14, "triangle", 0.08),
  level: (stars) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.12, "triangle", 0.12, i * 0.08));
    for (let s = 0; s < stars; s++) tone(1319, 1568, 0.1, "sine", 0.1, 0.45 + s * 0.18);
  },
  start: () => {
    tone(523, 523, 0.08, "triangle", 0.12);
    tone(784, 784, 0.12, "triangle", 0.12, 0.08);
  },
};

// ---------- Drawing helpers ----------
function circle(x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function poly(c, ...pts) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.fill();
}
function star(cx, cy, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
function shade(hex, f) {
  // darken (f < 1) or lighten (f > 1) a #rrggbb color
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f)));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

// ---------- Pictures (all drawn in code, centered on cx, cy, about 36px across) ----------
function drawIcon(name, cx, cy) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (name) {
    case "rocket":
      poly("#f39c4a", cx - 5, cy + 10, cx, cy + 20, cx + 5, cy + 10); // flame
      poly("#c92a2f", cx - 8, cy + 4, cx - 13, cy + 13, cx - 6, cy + 10); // fins
      poly("#c92a2f", cx + 8, cy + 4, cx + 13, cy + 13, cx + 6, cy + 10);
      ctx.fillStyle = "#e8e8ee";
      ctx.beginPath();
      ctx.ellipse(cx, cy, 8, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      poly("#c92a2f", cx - 6, cy - 9, cx, cy - 18, cx + 6, cy - 9);
      circle(cx, cy - 2, 4, "#4b79d9");
      break;
    case "fish":
      poly("#f39c4a", cx + 8, cy, cx + 18, cy - 9, cx + 18, cy + 9);
      ctx.fillStyle = "#f2c14e";
      ctx.beginPath();
      ctx.ellipse(cx - 2, cy, 13, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      circle(cx - 8, cy - 2, 2.2, "#1a1a1a");
      R(cx - 1, cy - 7, 2, 14, "rgba(0,0,0,0.12)");
      break;
    case "tree":
      R(cx - 3, cy + 4, 6, 14, "#8b5a2b");
      circle(cx, cy - 6, 11, "#4f9a45");
      circle(cx - 8, cy + 1, 8, "#5cb85c");
      circle(cx + 8, cy + 1, 8, "#5cb85c");
      break;
    case "crown":
      poly("#e8b52a", cx - 15, cy + 10, cx - 15, cy - 8, cx - 7, cy + 1, cx, cy - 12, cx + 7, cy + 1, cx + 15, cy - 8, cx + 15, cy + 10);
      R(cx - 15, cy + 7, 30, 4, "#b88a17");
      circle(cx - 15, cy - 9, 2.5, "#e8b52a");
      circle(cx, cy - 13, 2.5, "#e8b52a");
      circle(cx + 15, cy - 9, 2.5, "#e8b52a");
      circle(cx, cy + 2, 2.5, "#c92a2f");
      break;
    case "ghost":
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy - 4, 12, Math.PI, 0);
      ctx.lineTo(cx + 12, cy + 14);
      for (let i = 0; i < 4; i++) ctx.lineTo(cx + 12 - 3 - i * 6, cy + (i % 2 ? 14 : 9));
      ctx.lineTo(cx - 12, cy + 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#9aa0aa";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      circle(cx - 4, cy - 4, 2.4, "#1a1a1a");
      circle(cx + 4, cy - 4, 2.4, "#1a1a1a");
      break;
    case "note":
      ctx.strokeStyle = "#1f1f24";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy + 10);
      ctx.lineTo(cx + 2, cy - 14);
      ctx.quadraticCurveTo(cx + 12, cy - 8, cx + 10, cy);
      ctx.stroke();
      ctx.fillStyle = "#1f1f24";
      ctx.beginPath();
      ctx.ellipse(cx - 3, cy + 11, 6, 4.5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "apple":
      circle(cx - 5, cy + 3, 10, "#d43a3a");
      circle(cx + 5, cy + 3, 10, "#d43a3a");
      R(cx - 1, cy - 12, 3, 8, "#6b4423");
      ctx.fillStyle = "#5cb85c";
      ctx.beginPath();
      ctx.ellipse(cx + 6, cy - 10, 6, 3, -0.5, 0, Math.PI * 2);
      ctx.fill();
      circle(cx - 6, cy, 2.5, "rgba(255,255,255,0.5)");
      break;
    case "cat":
      poly("#e8913a", cx - 13, cy - 2, cx - 12, cy - 16, cx - 3, cy - 9);
      poly("#e8913a", cx + 13, cy - 2, cx + 12, cy - 16, cx + 3, cy - 9);
      circle(cx, cy + 2, 13, "#f0a04b");
      circle(cx - 5, cy, 2.2, "#1a1a1a");
      circle(cx + 5, cy, 2.2, "#1a1a1a");
      poly("#c9566a", cx - 2, cy + 5, cx + 2, cy + 5, cx, cy + 7);
      ctx.strokeStyle = "#7a4a1e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy + 7);
      ctx.lineTo(cx - 14, cy + 5);
      ctx.moveTo(cx + 4, cy + 7);
      ctx.lineTo(cx + 14, cy + 5);
      ctx.stroke();
      break;
    case "glass":
      ctx.strokeStyle = "#6b4423";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx + 5, cy + 5);
      ctx.lineTo(cx + 14, cy + 15);
      ctx.stroke();
      circle(cx - 3, cy - 3, 11, "#4b5b7a");
      circle(cx - 3, cy - 3, 8, "#bfe3f2");
      circle(cx - 6, cy - 6, 2.5, "rgba(255,255,255,0.8)");
      break;
    case "heart":
      ctx.fillStyle = "#d94b7a";
      ctx.beginPath();
      ctx.moveTo(cx, cy + 14);
      ctx.bezierCurveTo(cx - 20, cy, cx - 12, cy - 16, cx, cy - 6);
      ctx.bezierCurveTo(cx + 12, cy - 16, cx + 20, cy, cx, cy + 14);
      ctx.fill();
      break;
    case "sun":
      ctx.strokeStyle = "#f39c4a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
        ctx.lineTo(cx + Math.cos(a) * 17, cy + Math.sin(a) * 17);
      }
      ctx.stroke();
      circle(cx, cy, 10, "#f2c14e");
      break;
    case "ball": {
      const cols = ["#d94b4b", "#ffffff", "#4b79d9", "#ffffff", "#f2c14e", "#ffffff"];
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, 14, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3);
        ctx.fill();
      }
      ctx.strokeStyle = "#8a8f99";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.stroke();
      circle(cx, cy, 2.5, "#ffffff");
      break;
    }
  }
  ctx.lineCap = "butt";
}

// ---------- Cards ----------
// The face-down side: every book has the same library binding with the logo on it.
function drawBack(x, y, w, h) {
  ctx.fillStyle = NAVY;
  roundRect(x, y, w, h, 4);
  R(x, y + 2, 6, h - 4, "#26303c");
  R(x + 8, y + 9, w - 16, 3, GOLD);
  R(x + 8, y + 15, w - 16, 1.5, GOLD);
  R(x + 8, y + h - 16, w - 16, 1.5, GOLD);
  R(x + 8, y + h - 12, w - 16, 3, GOLD);
  if (w > 24) drawLogo(x + w / 2 + 2, y + h / 2 - 17, 26);
}

// The face-up side: a colored spine with a picture (or topic label) on a cream label.
function drawFace(c, x, y, w, h) {
  const col = c.item.color;
  ctx.fillStyle = col;
  roundRect(x, y, w, h, 4);
  R(x, y + 2, 6, h - 4, shade(col, 0.7));
  R(x + 8, y + 8, w - 16, 3, GOLD);
  R(x + 8, y + h - 11, w - 16, 3, GOLD);
  if (w < 30) return; // too thin mid-flip to show detail
  const cx = x + w / 2 + 2,
    cy = y + h / 2;
  if (c.face === "icon") {
    circle(cx, cy, 23, PAPER);
    drawIcon(c.item.icon, cx, cy);
  } else {
    // topic label: cream rectangle with one or two lines of text, shrunk to fit
    ctx.fillStyle = PAPER;
    roundRect(cx - 25, cy - 24, 50, 48, 4);
    const words = c.item.topic.split(" ");
    let size = 13;
    for (; size > 8; size--) {
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      if (words.every((wd) => ctx.measureText(wd).width <= 46)) break;
    }
    const lh = size + 3;
    words.forEach((wd, i) =>
      text(wd, cx, cy + 4 - ((words.length - 1) * lh) / 2 + i * lh, `bold ${size}px system-ui, sans-serif`, "#2a2320")
    );
  }
}

function drawCard(c, i) {
  // flip: 0 = back showing, 1 = face showing; squeeze horizontally through the middle
  const s = Math.abs(Math.cos(c.flip * Math.PI));
  const w = Math.max(2, CARD_W * s);
  const shake = c.shake > 0 ? Math.sin(c.shake * 0.08) * 3 : 0;
  const x = c.x + (CARD_W - w) / 2 + shake,
    y = c.y;
  // shadow on the back of the bookcase
  R(x + 3, y + 3, w, CARD_H - 3, "rgba(0,0,0,0.25)");
  if (c.flip < 0.5) drawBack(x, y, w, CARD_H);
  else drawFace(c, x, y, w, CARD_H);

  if (c.state === "matched" && c.flip >= 1) {
    // a red bookmark ribbon peeks out of the top of every matched book
    const bx = c.x + CARD_W - 18;
    poly("#c92a2f", bx, c.y - 10, bx + 9, c.y - 10, bx + 9, c.y + 6, bx + 4.5, c.y + 2, bx, c.y + 6);
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(time * 0.004 + i);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.strokeRect(c.x - 2, c.y - 2, CARD_W + 4, CARD_H + 4);
    ctx.globalAlpha = 1;
  }

  if (keyboardMode && i === focus && state === "playing") {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(c.x - 5, c.y - 5, CARD_W + 10, CARD_H + 10);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(c.x - 5, c.y - 5, CARD_W + 10, CARD_H + 10);
  }
}

// ---------- Room ----------
function ribbon(baseY, amp, thickness, phase, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 10) {
    const y = baseY + Math.sin(x * 0.018 + phase) * amp;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let x = W; x >= 0; x -= 10) {
    ctx.lineTo(x, baseY + Math.sin(x * 0.018 + phase) * amp + thickness + Math.sin(x * 0.03 + phase) * 3);
  }
  ctx.fill();
}

function drawRoom() {
  // lobby: light wall with maple paneling below, children's-area banners above
  R(0, 0, W, H, "#c8cdd4");
  R(0, 300, W, H - 300, "#d49853");
  for (let x = 40; x < W; x += 80) R(x, 300, 2, H - 300, "#b07636");
  R(0, 300, W, 4, "#b07636");
  R(0, 0, W, 44, "#2b2b30");
  R(0, 0, W, 8, "#e9e6df");
  ribbon(26, 8, 8, 4.0, "#f1f0ec");
  ribbon(22, 10, 10, 1.4, "#e8b52a");
  ribbon(10, 6, 20, 2.6, "#3d4c8c");
  ribbon(12, 5, 24, 0.0, "#c92a2f");
  R(0, H - 8, W, 8, "#3b3c43"); // slate floor
}

function drawBookcase() {
  const { x, y, w, h } = caseBox;
  R(x + 6, y + 6, w, h, "rgba(0,0,0,0.25)");
  R(x, y, w, h, "#cda46c");
  R(x, y, w, 4, "#e0b97f");
  R(x + FRAME, y + FRAME, w - FRAME * 2, h - FRAME * 2, "#3a2e25");
  const L = LEVELS[levelIndex];
  for (let r = 0; r < L.rows; r++) {
    const boardY = y + FRAME + r * SHELF_H + 14 + CARD_H;
    R(x + FRAME, boardY, w - FRAME * 2, 8, MAPLE);
    R(x + FRAME, boardY + 6, w - FRAME * 2, 2, "#b88e55");
  }
}

function drawHud() {
  ctx.fillStyle = "rgba(20, 14, 10, 0.75)";
  roundRect(12, 52, W - 24, 36, 8);
  const secs = Math.floor(elapsed / 1000);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const f = "bold 15px Georgia, serif";
  text(`Shelf ${levelIndex + 1}/${LEVELS.length}`, 26, 76, f, PAPER, "left");
  text(`Moves ${moves}`, 150, 76, f, PAPER, "left");
  text(`Time ${clock}`, 262, 76, f, PAPER, "left");
  text("Best", 380, 76, f, GOLD, "left");
  const b = best[levelIndex];
  for (let s = 0; s < 3; s++) star(430 + s * 22, 71, 8, b && s < b.stars ? GOLD : "rgba(243,234,215,0.25)");

  const tip = LEVELS[levelIndex].mode === "genre" ? "Match each picture to its book topic" : "Find the matching pictures";
  ctx.font = "bold 14px Georgia, serif";
  const tw = ctx.measureText(tip).width;
  ctx.fillStyle = "rgba(20, 14, 10, 0.6)";
  roundRect(W / 2 - tw / 2 - 10, caseBox.y - 26, tw + 20, 22, 6);
  text(tip, W / 2, caseBox.y - 10, "bold 14px Georgia, serif", PAPER);
}

function overlay(title, sub, extra, stars) {
  ctx.fillStyle = "rgba(26, 18, 12, 0.45)";
  ctx.fillRect(0, 0, W, H);
  const widths = [["bold 34px Georgia, serif", title], ["18px Georgia, serif", sub], ["15px Georgia, serif", extra || ""]].map(
    ([font, t]) => ((ctx.font = font), ctx.measureText(t).width)
  );
  const starRoom = stars != null ? 44 : 0;
  const pw = Math.max(...widths) + 56,
    ph = (extra ? 112 : 88) + 50 + starRoom; // + room for the logo (and stars)
  const top = H / 2 - 104 - starRoom;
  ctx.fillStyle = "rgba(26, 18, 12, 0.92)";
  roundRect(W / 2 - pw / 2, top, pw, ph, 12);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawLogo(W / 2, top + 8, 30);
  if (stars != null) for (let s = 0; s < 3; s++) star(W / 2 + (s - 1) * 40, H / 2 - 74, 16, s < stars ? GOLD : "rgba(243,234,215,0.2)");
  text(title, W / 2, H / 2 - 14, "bold 34px Georgia, serif", PAPER);
  text(sub, W / 2, H / 2 + 18, "18px Georgia, serif", GOLD);
  if (extra) text(extra, W / 2, H / 2 + 44, "15px Georgia, serif", PAPER);
}

function draw() {
  drawRoom();
  drawBookcase();
  cards.forEach(drawCard);
  drawHud();

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 900);
    R(p.x, p.y, p.size, p.size * 0.75, p.color);
  }
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 400));
    ctx.font = "bold 18px Georgia, serif";
    const tw = ctx.measureText(p.text).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.8)";
    roundRect(p.x - tw / 2 - 10, p.y - 20, tw + 20, 28, 8);
    text(p.text, p.x, p.y, "bold 18px Georgia, serif", PAPER);
  }
  ctx.globalAlpha = 1;

  if (state === "ready") overlay("Spine Match", "Press Enter or tap to start", "Flip two books at a time to find pairs");
  if (state === "paused") overlay("Shh… paused", "Press P or tap to keep matching");
  if (state === "over") {
    const secs = Math.round(elapsed / 1000);
    const lastShelf = levelIndex === LEVELS.length - 1;
    overlay(
      lastShelf ? "All shelves matched!" : `Shelf ${levelIndex + 1} done!`,
      lastShelf ? "Press Enter or tap to play again" : "Press Enter or tap for the next shelf",
      `${moves} moves · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
      lastStars
    );
  }
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
// Show the first shelf (face down) behind the start screen.
startLevel(0, true);
state = "ready";
requestAnimationFrame(frame);

// ---------- Input ----------
function advance() {
  if (state === "ready") startLevel(levelIndex);
  else if (state === "over") nextLevel();
  else if (state === "paused") state = "playing";
}

function togglePause() {
  if (state === "playing") state = "paused";
  else if (state === "paused") state = "playing";
}

function moveFocus(dx, dy) {
  const cols = LEVELS[levelIndex].cols;
  const r = Math.floor(focus / cols),
    c = focus % cols;
  const nr = Math.max(0, Math.min(cards.length / cols - 1, r + dy));
  const nc = Math.max(0, Math.min(cols - 1, c + dx));
  focus = nr * cols + nc;
}

document.addEventListener("keydown", (e) => {
  const k = e.code;
  if (k === "KeyP" || k === "Escape") return togglePause();
  if (k === "KeyM") return toggleMute();
  if (k === "KeyR" && (state === "playing" || state === "paused")) return startLevel(levelIndex);
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[k]) {
    e.preventDefault();
    if (state === "playing") {
      if (keyboardMode) moveFocus(...arrows[k]);
      keyboardMode = true; // first press just shows the highlight
    }
    return;
  }
  if (k === "Enter" || k === "Space") {
    e.preventDefault();
    if (e.repeat) return;
    if (state === "playing") {
      keyboardMode = true;
      flipCard(focus);
    } else advance();
  }
});

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (state !== "playing") return advance();
  keyboardMode = false;
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * W;
  const py = ((e.clientY - rect.top) / rect.height) * H;
  // generous hit area: the whole slot on the shelf, including the gap
  const i = cards.findIndex(
    (c) => px >= c.x - GAP_X / 2 && px <= c.x + CARD_W + GAP_X / 2 && py >= c.y - 10 && py <= c.y + CARD_H + 8
  );
  if (i >= 0) {
    focus = i;
    flipCard(i);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") state = "paused";
});

// Bookmark Catch: things drift down from the children's-area banners.
// Catch the good stuff in your book cart, dodge the drinks.

// ---------- Setup ----------
const canvas = document.getElementById("game");
const screenCtx = canvas.getContext("2d");
// `ctx` is the context being drawn to: the screen, or an offscreen layer while building scenery.
let ctx = screenCtx;
const W = canvas.width,
  H = canvas.height;

// ---------- Tunables (units: px and ms) ----------
const CEIL = 74; // where the ceiling meets the wall
const FLOOR = H - 44; // floor line
const CART_W = 112,
  CART_H = 62;
const CART_Y = FLOOR - CART_H - 8; // top of the cart (8px of wheels below it)
const CATCH_DEPTH = 22; // how far into the cart's bin an item counts as caught
const CART_SPEED = 0.62; // keyboard speed
const MAX_HEARTS = 3;
const COMBO_STEP = 5; // every 5 catches in a row raises the multiplier
const MAX_MULT = 5;

// Item kinds. Good items score points; drinks cost a heart if you catch them.
const ITEMS = {
  page: { good: true, points: 5, w: 20, h: 26, speed: 0.75 },
  bookmark: { good: true, points: 10, w: 14, h: 26, speed: 1 },
  card: { good: true, points: 50, w: 32, h: 22, speed: 1.35 },
  coffee: { good: false, w: 20, h: 26, speed: 1 },
  juice: { good: false, w: 18, h: 26, speed: 1.1 },
};

// Difficulty rises with time played.
const fallSpeed = () => 0.1 + Math.min(0.22, elapsed * 0.000004);
const spawnInterval = () => Math.max(320, 950 - elapsed * 0.012);
const badChance = () => Math.min(0.35, 0.12 + elapsed * 0.000004);
const CARD_CHANCE = 0.05;

// ---------- Palette (from the library) ----------
const RIBBON_RED = "#c92a2f",
  RIBBON_BLUE = "#3d4c8c",
  RIBBON_YELLOW = "#e8b52a";
const MARK_COLORS = [RIBBON_RED, RIBBON_BLUE, RIBBON_YELLOW];
const BRIGHT = ["#d94b4b", "#4b79d9", "#f2c14e", "#5cb85c", "#9b59b6", "#f39c4a", "#e8e8e8", "#3aa6a6"];
const COLORFUL = BRIGHT.filter((c) => c !== "#e8e8e8"); // no near-white, for small details
const CARD_BLUE = "#0d84c7"; // from the library logo

// ---------- State ----------
let items = [],
  particles = [],
  popups = [],
  cartLoad = []; // recently caught items peeking out of the cart
let score = 0,
  hearts = MAX_HEARTS,
  combo = 0,
  elapsed = 0,
  spawnTimer = 0,
  shake = 0,
  time = 0;
const cart = { x: W / 2, vx: 0, wheel: 0 };
let targetX = null; // where the pointer wants the cart
const keys = { left: false, right: false };
let state = "ready"; // ready | playing | paused | over
let best = Number(safeGet("catch-best")) || 0;

function startGame() {
  items = [];
  particles = [];
  popups = [];
  cartLoad = [];
  score = 0;
  hearts = MAX_HEARTS;
  combo = 0;
  elapsed = 0;
  spawnTimer = 400;
  shake = 0;
  cart.x = W / 2;
  targetX = null;
  state = "playing";
  sfx.start();
}

function gameOver() {
  state = "over";
  sfx.over();
  if (score > best) {
    best = score;
    safeSet("catch-best", best);
  }
}

const multiplier = () => 1 + Math.min(MAX_MULT - 1, Math.floor(combo / COMBO_STEP));

// ---------- Items ----------
function spawnItem() {
  let type;
  if (Math.random() < badChance()) type = Math.random() < 0.5 ? "coffee" : "juice";
  else {
    const r = Math.random();
    type = r < CARD_CHANCE ? "card" : r < 0.4 ? "page" : "bookmark";
  }
  const k = ITEMS[type];
  const x = 40 + Math.random() * (W - 80);
  items.push({
    type,
    x,
    baseX: x,
    y: 18, // starts tucked behind the banners
    w: k.w,
    h: k.h,
    vy: fallSpeed() * k.speed * (0.9 + Math.random() * 0.2),
    age: 0,
    phase: Math.random() * Math.PI * 2,
    color: MARK_COLORS[(Math.random() * MARK_COLORS.length) | 0],
    done: false,
  });
}

function catchItem(it) {
  it.done = true;
  const k = ITEMS[it.type];
  if (!k.good) {
    hearts--;
    combo = 0;
    shake = 250;
    sfx.spill();
    popup("Spill!", it.x, CART_Y - 12, "#ffb3a8");
    burst(it.x, CART_Y, 14, it.type === "coffee" ? "#6b4226" : "#f39c4a");
    if (hearts <= 0) gameOver();
    return;
  }
  const before = multiplier();
  combo++;
  const mult = multiplier();
  const pts = k.points * mult;
  score += pts;
  cartLoad.push({ type: it.type, color: it.color, dx: (Math.random() - 0.5) * (CART_W - 40), tilt: (Math.random() - 0.5) * 0.6 });
  if (cartLoad.length > 6) cartLoad.shift();
  burst(it.x, CART_Y, 8, it.type === "card" ? CARD_BLUE : it.type === "page" ? PAPER : it.color);

  if (it.type === "card") {
    sfx.card();
    let text = "Library card! +" + pts;
    if (hearts < MAX_HEARTS) {
      hearts++;
      text += " ♥";
      setTimeout(() => sfx.heart(), 260);
    }
    popup(text, it.x, CART_Y - 12);
  } else {
    if (it.type === "page") sfx.page();
    else sfx.catch();
    popup("+" + pts, it.x, CART_Y - 12);
  }
  if (mult > before) {
    popup("Combo ×" + mult + "!", cart.x, CART_Y - 44, GOLD);
    setTimeout(() => sfx.combo(), 120);
  }
}

function missItem(it) {
  it.done = true;
  const k = ITEMS[it.type];
  if (k.good) {
    if (combo >= COMBO_STEP) popup("Combo lost", it.x, FLOOR - 20, "#d8cfc0");
    combo = 0;
    sfx.miss();
    burst(it.x, FLOOR, 4, "#d8cfc0");
  } else {
    // drinks splash harmlessly on the carpet
    burst(it.x, FLOOR, 10, it.type === "coffee" ? "#6b4226" : "#f39c4a");
  }
}

// ---------- Update ----------
function update(dt) {
  time += dt;
  updateParticles(dt);
  if (shake > 0) shake -= dt;
  if (state !== "playing") return;
  elapsed += dt;

  // cart: keyboard moves directly; the pointer steers it toward a target
  const oldX = cart.x;
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (dir) {
    targetX = null;
    cart.x += dir * CART_SPEED * dt;
  } else if (targetX !== null) {
    const d = targetX - cart.x;
    cart.x += Math.sign(d) * Math.min(Math.abs(d), CART_SPEED * 1.6 * dt);
  }
  cart.x = Math.max(CART_W / 2 + 6, Math.min(W - CART_W / 2 - 6, cart.x));
  cart.vx = (cart.x - oldX) / Math.max(dt, 1);
  cart.wheel += cart.x - oldX;

  // spawning
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnItem();
    spawnTimer = spawnInterval();
  }

  // falling
  for (const it of items) {
    it.age += dt;
    it.y += it.vy * dt;
    if (it.type === "page") {
      // pages flutter side to side as they fall
      it.x = Math.max(20, Math.min(W - 20, it.baseX + Math.sin(it.age * 0.003 + it.phase) * 22));
    }
    const bottom = it.y + it.h / 2;
    if (bottom >= CART_Y && bottom <= CART_Y + CATCH_DEPTH && Math.abs(it.x - cart.x) < CART_W / 2 - 4) {
      catchItem(it);
      if (state !== "playing") break;
    } else if (it.y - it.h / 2 > FLOOR) missItem(it);
  }
  items = items.filter((it) => !it.done);
}

// ---------- Particles & popups ----------
function burst(x, y, n, color, size = 4) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.3,
      life: 400 + Math.random() * 300,
      color,
      size,
    });
  }
}
function popup(text, x, y, color = "#fff") {
  popups.push({ text, x: Math.max(70, Math.min(W - 70, x)), y, color, life: 800 });
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
    p.y -= 0.04 * dt;
    p.life -= dt;
  }
  popups = popups.filter((p) => p.life > 0);
}

// ---------- Sound (Web Audio API, no files needed) ----------
setupSound("catch");

const sfx = {
  // each catch in a streak is a little higher
  catch: () => {
    const f = 660 * Math.pow(2, Math.min(combo, 12) / 12);
    tone(f, f * 1.25, 0.08, "sine", 0.12);
  },
  page: () => tone(900, 1300, 0.06, "triangle", 0.08),
  card: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, "sine", 0.13, i * 0.06)),
  heart: () => tone(784, 1175, 0.15, "sine", 0.12),
  combo: () => {
    tone(880, 880, 0.06, "triangle", 0.1);
    tone(1320, 1320, 0.1, "triangle", 0.1, 0.06);
  },
  spill: () => {
    tone(180, 60, 0.3, "sawtooth", 0.14);
    tone(90, 40, 0.25, "square", 0.08, 0.05);
  },
  miss: () => tone(260, 180, 0.08, "triangle", 0.05),
  start: () => {
    tone(523, 523, 0.08, "triangle", 0.12);
    tone(784, 784, 0.12, "triangle", 0.12, 0.08);
  },
  over: () => {
    tone(400, 100, 0.6, "sawtooth", 0.12);
    tone(200, 60, 0.6, "square", 0.08, 0.1);
  },
};

// ---------- Drawing helpers ----------

// Deterministic pseudo-random in [0,1) so scenery looks the same every time.
function hash(a, b) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function poly(c, ...pts) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.fill();
}
function oval(x, y, rx, ry, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- Scenery (built once into offscreen layers) ----------
// A low kids' bookcase with bright spines.
function shelfUnit(x, y, w, h, rows, seed) {
  R(x, y, w, h, "#cda46c");
  R(x + 5, y + 5, w - 10, h - 10, "#efe6d4");
  const rowH = (h - 10) / rows;
  for (let r = 0; r < rows; r++) {
    const bottom = y + 5 + (r + 1) * rowH;
    let bx = x + 7;
    for (let k = 0; ; k++) {
      const rnd = hash(seed * 50 + r, k);
      const bw = 4 + rnd * 5;
      if (bx + bw > x + w - 7) break;
      const bh = rowH * (0.6 + hash(k + 7, seed + r) * 0.3);
      R(bx, bottom - bh - 3, bw, bh, BRIGHT[(rnd * BRIGHT.length) | 0]);
      bx += bw + 1;
    }
    R(x + 5, bottom - 3, w - 10, 3, "#b88e55");
  }
}

// The children's-area banners, waving across the ceiling.
function ribbon(baseY, amp, thickness, phase, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 10) {
    const y = baseY + Math.sin(x * 0.013 + phase) * amp;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let x = W; x >= 0; x -= 10) {
    ctx.lineTo(x, baseY + Math.sin(x * 0.013 + phase) * amp + thickness + Math.sin(x * 0.02 + phase) * 3);
  }
  ctx.fill();
}

function makeLayer() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

const bgLayer = makeLayer(); // ceiling, wall, shelves, carpet
const bannerLayer = makeLayer(); // banners, drawn in front of the falling items

function buildScenery() {
  ctx = bgLayer.getContext("2d");
  // ceiling
  R(0, 0, W, CEIL, "#2b2b30");
  R(0, 0, W, 10, "#e9e6df");
  for (let i = 0; i * 90 < W; i++) {
    R(15 + i * 90, 22, 55, 3, "#f1eee4");
    R(60 + i * 90, 44, 40, 3, "#d9d6cc");
  }
  // walls
  R(0, CEIL, W, FLOOR - CEIL, "#8b919a");
  R(0, CEIL, 240, FLOOR - CEIL, "#aab3c1");
  text("a b c", 120, CEIL + 120, "bold 80px Georgia, serif", "rgba(70, 85, 130, 0.25)");
  // red columns
  for (const cx of [240, W - 70]) {
    R(cx, CEIL, 34, FLOOR - CEIL, "#c62a2f");
    R(cx + 24, CEIL, 10, FLOOR - CEIL, "#a31f24");
  }
  // colorful pendant lights
  const cones = ["#3a5bd0", RIBBON_RED, "#e8743a"];
  for (let i = 0; 40 + i * 120 < W; i++) {
    const lx = 40 + i * 120,
      ly = CEIL + 14 + (i % 3) * 10;
    R(lx, CEIL, 1, ly - CEIL, "#555");
    poly(cones[i % 3], lx - 6, ly + 10, lx, ly, lx + 7, ly + 10);
    oval(lx + 0.5, ly + 11, 3, 1.5, "#fff3c4");
  }
  // bulletin board and Summer Reading banner
  R(300, CEIL + 34, 150, 56, "#c9c6c0");
  R(300, CEIL + 34, 150, 4, RIBBON_YELLOW);
  R(300, CEIL + 86, 150, 4, "#5cb85c");
  for (let i = 0; i < 5; i++) R(312 + i * 27, CEIL + 46 + (i % 2) * 8, 18, 24, i === 2 ? "#4b79d9" : "#fbfaf6");
  R(470, CEIL + 30, 92, 50, "#4caa3a");
  text("SUMMER", 516, CEIL + 51, "bold 13px system-ui, sans-serif", "#fff");
  text("READING", 516, CEIL + 69, "bold 13px system-ui, sans-serif", "#fff");

  // carpet
  R(0, FLOOR, W, H - FLOOR, "#c3b493");
  for (let k = 0; k * 9 < W; k++) R(k * 9, FLOOR + 14 + hash(k, 5) * (H - FLOOR - 18), 2, 1, "#a99a7a");
  R(0, FLOOR, W, 12, "#5e6e8b");

  // low bookcases along the back wall, with stuffed animals on top
  const top = FLOOR - 84;
  shelfUnit(20, top, 210, 84, 2, 1);
  shelfUnit(290, top, 270, 84, 2, 2);
  oval(110, top - 15, 18, 15, "#1c1817"); // black bear
  oval(128, top - 30, 11, 10, "#1c1817");
  oval(122, top - 40, 4, 4, "#1c1817");
  oval(135, top - 39, 4, 4, "#1c1817");
  oval(137, top - 27, 4, 3, "#4a3d36");
  oval(420, top - 13, 24, 13, "#f2f0ea"); // white plush horse
  oval(444, top - 30, 8, 13, "#f2f0ea");
  R(412, top - 26, 16, 8, "#222");
  R(438, top - 42, 4, 12, "#444");

  // push the scenery back a touch so the falling items pop
  R(0, 0, W, FLOOR, "rgba(20, 14, 10, 0.18)");

  // banners on their own layer so items can drift out from behind them
  ctx = bannerLayer.getContext("2d");
  ribbon(40, 10, 9, 4.0, "#f1f0ec");
  ribbon(34, 14, 12, 1.4, RIBBON_YELLOW);
  ribbon(14, 8, 28, 2.6, RIBBON_BLUE);
  ribbon(18, 6, 34, 0.0, RIBBON_RED);
  ctx = screenCtx;
}
buildScenery();

// ---------- Item art ----------
function drawBookmark(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w / 2, y + h - w * 0.45);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  oval(x + w / 2, y + w * 0.4, w * 0.15, w * 0.15, "#fff");
}

function drawPage(w, h) {
  R(-w / 2, -h / 2, w, h, PAPER);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
  for (let ly = -h / 2 + 6; ly < h / 2 - 3; ly += 4) R(-w / 2 + 4, ly, w - 8, 1, "#9a8f7c");
  poly("#d8cdb6", w / 2 - 6, -h / 2, w / 2, -h / 2 + 6, w / 2 - 6, -h / 2 + 6); // folded corner
}

function drawCard(w, h) {
  // soft glow so the rare card stands out
  oval(0, 0, w * 0.9, h * 1.1, "rgba(255, 246, 200, 0.35)");
  ctx.fillStyle = CARD_BLUE;
  roundRect(-w / 2, -h / 2, w, h, 3);
  R(-w / 2, -h / 2 + 4, w, 4, "#42c4dc");
  R(-w / 2 + 4, -h / 2 + 11, 9, 7, "#fff");
  for (let i = 0; i < 7; i++) R(-w / 2 + 16 + i * 2, -h / 2 + 11, i % 3 ? 1 : 1.5, 7, "#fff"); // barcode
}

function drawCoffee(w, h) {
  poly("#f2efe9", -w / 2 + 2, -h / 2 + 6, w / 2 - 2, -h / 2 + 6, w / 2 - 4, h / 2, -w / 2 + 4, h / 2);
  R(-w / 2 + 3, -h / 2 + 12, w - 6, 7, "#8a5a36"); // sleeve
  ctx.fillStyle = "#3b2a20";
  roundRect(-w / 2, -h / 2 + 2, w, 5, 2); // lid
  // steam
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const sx of [-3, 3]) {
    ctx.moveTo(sx, -h / 2);
    ctx.quadraticCurveTo(sx + 4, -h / 2 - 5, sx, -h / 2 - 10);
  }
  ctx.stroke();
}

function drawJuice(w, h) {
  R(-w / 2, -h / 2 + 4, w, h - 4, "#f39c4a");
  R(-w / 2, -h / 2 + 4, w, 5, "#e07b2a");
  oval(0, 2, w * 0.28, w * 0.28, "#5cb85c"); // fruit logo
  R(w / 2 - 6, -h / 2 - 4, 2, 10, "#f2f2f2"); // straw
  R(w / 2 - 6, -h / 2 - 4, 6, 2, "#f2f2f2");
}

function drawItem(it) {
  ctx.save();
  ctx.translate(it.x, it.y);
  const wobble = it.type === "page" ? Math.sin(it.age * 0.004 + it.phase) * 0.4 : Math.sin(it.age * 0.005 + it.phase) * 0.12;
  ctx.rotate(wobble);
  if (it.type === "bookmark") drawBookmark(-it.w / 2, -it.h / 2, it.w, it.h, it.color);
  else if (it.type === "page") drawPage(it.w, it.h);
  else if (it.type === "card") drawCard(it.w, it.h);
  else if (it.type === "coffee") drawCoffee(it.w, it.h);
  else drawJuice(it.w, it.h);
  ctx.restore();
}

// ---------- The book cart ----------
function drawCart() {
  const left = cart.x - CART_W / 2;
  oval(cart.x, FLOOR + 2, CART_W / 2, 5, "rgba(0, 0, 0, 0.25)");

  // caught items peeking out of the bin
  for (const c of cartLoad) {
    ctx.save();
    ctx.translate(cart.x + c.dx, CART_Y + 2);
    ctx.rotate(c.tilt);
    if (c.type === "bookmark") drawBookmark(-7, -16, 14, 26, c.color);
    else if (c.type === "page") {
      ctx.translate(0, -4);
      drawPage(20, 26);
    } else {
      ctx.translate(0, -4);
      drawCard(32, 22);
    }
    ctx.restore();
  }

  // metal posts
  R(left + 4, CART_Y, 5, CART_H, "#5d6670");
  R(left + CART_W - 9, CART_Y, 5, CART_H, "#5d6670");
  // bin front with the library logo (navy, so the cart stands out from the maple bookcases)
  R(left, CART_Y, CART_W, CATCH_DEPTH, "#34404f");
  R(left, CART_Y, CART_W, 3, GOLD);
  R(left, CART_Y + CATCH_DEPTH - 2, CART_W, 2, "#232c37");
  drawLogo(cart.x, CART_Y + 2, 13);
  // lower shelf of books
  const shelfTop = CART_Y + CATCH_DEPTH + 4;
  let bx = left + 10;
  for (let k = 0; bx < left + CART_W - 14; k++) {
    const bw = 5 + hash(k, 3) * 5;
    const bh = 18 + hash(k, 9) * 8;
    R(bx, CART_Y + CART_H - 6 - bh, bw, bh, COLORFUL[k % COLORFUL.length]);
    bx += bw + 1;
  }
  R(left, shelfTop - 2, CART_W, 2, "rgba(0, 0, 0, 0.15)");
  R(left, CART_Y + CART_H - 6, CART_W, 6, "#34404f");
  R(left, CART_Y + CART_H - 6, CART_W, 1, GOLD);
  // wheels with spokes that turn as the cart rolls
  for (const wx of [left + 14, left + CART_W - 14]) {
    oval(wx, CART_Y + CART_H + 3, 7, 7, "#2a2a2a");
    const a = cart.wheel / 7;
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wx - Math.cos(a) * 5, CART_Y + CART_H + 3 - Math.sin(a) * 5);
    ctx.lineTo(wx + Math.cos(a) * 5, CART_Y + CART_H + 3 + Math.sin(a) * 5);
    ctx.stroke();
  }
}

// ---------- HUD & overlays ----------
function drawHeart(x, y, s, filled) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  if (filled) {
    ctx.fillStyle = "#e0475b";
    ctx.fill();
  } else {
    ctx.strokeStyle = "#9a8f7c";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawHUD() {
  ctx.fillStyle = "rgba(20, 14, 10, 0.7)";
  roundRect(12, 12, 24 + MAX_HEARTS * 26, 32, 8);
  for (let i = 0; i < MAX_HEARTS; i++) drawHeart(32 + i * 26, 19, 18, i < hearts);

  ctx.fillStyle = "rgba(20, 14, 10, 0.7)";
  roundRect(W - 312, 12, 300, 32, 8);
  const mult = multiplier();
  text("×" + mult, W - 296, 34, "bold 16px Georgia, serif", mult > 1 ? GOLD : "#9a8f7c", "left");
  text("BEST " + String(Math.max(best, score)).padStart(5, "0"), W - 150, 34, "bold 16px Georgia, serif", GOLD, "right");
  text("SCORE " + String(score).padStart(5, "0"), W - 24, 34, "bold 16px Georgia, serif", PAPER, "right");
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
  ctx = screenCtx;
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  ctx.drawImage(bgLayer, 0, 0);
  for (const it of items) drawItem(it);
  ctx.drawImage(bannerLayer, 0, 0);
  drawCart();
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 700);
    R(p.x, p.y, p.size, p.size * 0.75, p.color);
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
  ctx.restore();

  drawHUD();
  if (state === "ready") overlay("Bookmark Catch", "Press Enter or tap to start", "Catch bookmarks, dodge the drinks!");
  if (state === "paused") overlay("Shh… paused", "Press P to keep catching");
  if (state === "over") overlay("Closing time!", "Press Enter or tap to play again", `Score: ${score} · Best: ${best}`);
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

const KEYS = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyP" || e.code === "Escape") return togglePause();
  if (e.code === "KeyM") return toggleMute();
  if ((e.code === "Enter" || e.code === "Space") && (state === "ready" || state === "over")) {
    e.preventDefault();
    return startGame();
  }
  const k = KEYS[e.code];
  if (k) {
    e.preventDefault();
    keys[k] = true;
  }
});
document.addEventListener("keyup", (e) => {
  const k = KEYS[e.code];
  if (k) keys[k] = false;
});

// Pointer: the cart follows your finger or mouse across the game.
function pointerToCanvasX(e) {
  const rect = canvas.getBoundingClientRect();
  return ((e.clientX - rect.left) / rect.width) * W;
}
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (state === "ready" || state === "over") return startGame();
  if (state === "paused") return togglePause();
  targetX = pointerToCanvasX(e);
});
canvas.addEventListener("pointermove", (e) => {
  if (state === "playing") targetX = pointerToCanvasX(e);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") state = "paused";
});

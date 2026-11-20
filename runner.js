// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width,
  H = canvas.height;

// ---------- Tunables (units: px and ms) ----------
const GRAVITY = 0.0025,
  JUMP_VELOCITY = -0.9,
  JUMP_CUT = 0.45, // multiply upward velocity by this when jump is released early
  GROUND_Y = 240; // player's top y when standing
const FLOOR = GROUND_Y + 44; // y of the floor line
const CEIL = 64; // y where ceiling meets wall
const START_SPEED = 0.35, // px per ms
  MAX_SPEED = 0.95,
  SPEED_RAMP = 0.000008; // speed gained per ms
const BG_PARALLAX = 0.5; // background scrolls at half the ground speed
const BOOKMARK_BONUS = 25;
const DUCK_W = 48,
  DUCK_H = 26; // player size while ducking
const FLYER_BOTTOM = FLOOR - 34; // flying books clear a ducking player but hit a standing one
const FLYER_MIN_SPEED = 0.45; // flying books start appearing once the run has sped up a bit
const FLYER_CHANCE = 0.3;

// ---------- Palette ----------
const SPINES = ["#8c2f39", "#2f5d62", "#b5893b", "#3b4a7a", "#6b3e75", "#a0522d", "#4f7942", "#c2b280"];
const BRIGHT = ["#d94b4b", "#4b79d9", "#f2c14e", "#5cb85c", "#9b59b6", "#f39c4a", "#e8e8e8", "#3aa6a6"];
const COLORFUL = BRIGHT.filter((c) => c !== "#e8e8e8"); // for decorations on pale backgrounds
const RIBBON_RED = "#c92a2f",
  RIBBON_BLUE = "#3d4c8c",
  RIBBON_YELLOW = "#e8b52a";
const MARK_COLORS = [RIBBON_RED, RIBBON_BLUE, RIBBON_YELLOW];

// ---------- State ----------
const player = { x: 70, y: GROUND_Y, w: 40, h: 44, vy: 0, onGround: true };
let obstacles = [];
let bookmarks = [];
let particles = [];
let popups = [];
let speed, score, marks, nextSpawn, state, runTime;
let distance = 0; // total scrolled distance, drives the background
let duckHeld = false; // is the duck key / touch held?
let best = Number(safeGet("runner-best")) || 0;

// ---------- Sound (generated with the Web Audio API, no files needed) ----------
setupSound("runner");
let lastMarkTime = -1e9,
  markCombo = 0;

const sfx = {
  jump: () => tone(300, 620, 0.14),
  land: () => tone(140, 70, 0.06, "triangle", 0.1),
  duck: () => tone(420, 200, 0.08, "triangle", 0.1),
  bookmark: () => {
    // grabbing bookmarks in quick succession climbs the scale
    markCombo = runTime - lastMarkTime < 500 ? Math.min(markCombo + 1, 6) : 0;
    lastMarkTime = runTime;
    const f = 880 * Math.pow(2, (markCombo * 2) / 12);
    tone(f, f, 0.07, "sine", 0.14);
    tone(f * 1.5, f * 1.5, 0.12, "sine", 0.12, 0.06);
  },
  crash: () => {
    tone(220, 40, 0.45, "sawtooth", 0.18);
    tone(90, 30, 0.3, "square", 0.12, 0.05);
  },
  start: () => {
    tone(523, 523, 0.08, "triangle", 0.12);
    tone(784, 784, 0.12, "triangle", 0.12, 0.08);
  },
};

const MUTE_BTN = { x: 12, y: 12, w: 120, h: 32 };

function reset() {
  player.y = GROUND_Y;
  player.vy = 0;
  player.onGround = true;
  player.ducking = false;
  duckHeld = false;
  obstacles = [];
  bookmarks = [];
  particles = [];
  popups = [];
  speed = START_SPEED;
  score = 0;
  marks = 0;
  runTime = 0;
  nextSpawn = 600;
}
reset();
state = "ready"; // ready | running | paused | over

// ---------- Player ----------
function jump() {
  if (player.onGround) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
    burst(player.x + player.w / 2, FLOOR, 6, PAPER);
    sfx.jump();
  }
}

function releaseJump() {
  if (player.vy < 0) player.vy *= JUMP_CUT;
}

function updatePlayer(dt) {
  // Holding duck in the air pulls you down faster so you can drop under a flying book.
  const gravity = duckHeld && !player.onGround ? GRAVITY * 2.5 : GRAVITY;
  player.vy += gravity * dt;
  player.y += player.vy * dt;
  if (player.y >= GROUND_Y) {
    if (!player.onGround) {
      burst(player.x + player.w / 2, FLOOR, 4, PAPER);
      sfx.land();
    }
    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
  }
  player.ducking = duckHeld && player.onGround;
}

// The player's collision box: shorter and a bit wider while ducking.
function playerBox() {
  if (player.ducking) return { x: player.x, y: FLOOR - DUCK_H, w: DUCK_W, h: DUCK_H };
  return { x: player.x, y: player.y, w: player.w, h: player.h };
}

// ---------- Obstacles: stacks of books ----------
function makeStack(x, stackW, targetH) {
  const books = [];
  let y = FLOOR;
  while (FLOOR - y < targetH) {
    const t = 8 + Math.random() * 6;
    const bw = stackW - Math.random() * 8;
    books.push({
      x: x + Math.random() * (stackW - bw),
      y: y - t,
      w: bw,
      h: t,
      color: SPINES[(Math.random() * SPINES.length) | 0],
    });
    y -= t;
  }
  return { books, h: FLOOR - y };
}

function spawnObstacle() {
  const count = speed > 0.55 && Math.random() < 0.35 ? 2 + (Math.random() < 0.3) : 1;
  const stackW = count === 1 ? 30 : 26;
  const targetH = 26 + Math.random() * 26;
  const x = W + 10;
  const books = [];
  let h = 0;
  for (let i = 0; i < count; i++) {
    // neighbouring stacks vary in height a little
    const s = makeStack(x + i * (stackW + 4), stackW, targetH * (i % 2 ? 0.75 : 1));
    books.push(...s.books);
    h = Math.max(h, s.h);
  }
  const w = count * stackW + (count - 1) * 4;
  const o = { type: "stack", x, y: FLOOR - h, w, h, books };
  obstacles.push(o);
  return o;
}

// A book flapping its covers at head height: duck under it (or time a jump over it).
function spawnFlyer() {
  const h = 22;
  const o = {
    type: "flyer",
    x: W + 10,
    y: FLYER_BOTTOM - h,
    w: 44,
    h,
    books: [],
    color: SPINES[(Math.random() * SPINES.length) | 0],
    phase: Math.random() * Math.PI * 2,
  };
  obstacles.push(o);
  return o;
}

function updateObstacles(dt) {
  const dx = speed * dt;
  for (const o of obstacles) {
    o.x -= dx;
    for (const b of o.books) b.x -= dx;
    if (o.type === "flyer") o.y = FLYER_BOTTOM - o.h + Math.sin(runTime * 0.006 + o.phase) * 2;
  }
  obstacles = obstacles.filter((o) => o.x + o.w > -20);

  // Spawn based on distance so gaps stay jumpable as speed rises.
  nextSpawn -= dx;
  if (nextSpawn <= 0) {
    const flyer = speed > FLYER_MIN_SPEED && Math.random() < FLYER_CHANCE;
    const o = flyer ? spawnFlyer() : spawnObstacle();
    const airTime = (2 * -JUMP_VELOCITY) / GRAVITY; // ms spent in a full jump
    nextSpawn = speed * airTime * (1.1 + Math.random() * 1.4) + 60;
    spawnBookmarks(o, airTime);
  }
}

function hits(o) {
  const p = playerBox();
  const pad = 6; // forgiving hitbox
  return p.x + pad < o.x + o.w && p.x + p.w - pad > o.x && p.y + pad < o.y + o.h && p.y + p.h > o.y + 2;
}

// ---------- Bookmarks (collectibles) ----------
function addBookmark(cx, y) {
  bookmarks.push({
    x: cx - 7,
    y,
    w: 14,
    h: 26,
    color: MARK_COLORS[(Math.random() * MARK_COLORS.length) | 0],
    phase: Math.random() * Math.PI * 2,
  });
}

function spawnBookmarks(o, airTime) {
  const r = Math.random();
  if (o.type === "flyer") {
    // A pair tucked right under the flying book, a reward for ducking.
    if (r < 0.5) for (let k = 0; k < 2; k++) addBookmark(o.x + 8 + k * 28, FLOOR - 28);
    return;
  }
  if (r < 0.4) {
    // An arc over the stack that traces a full jump. The side marks sit where the
    // player is a quarter of the jump away from the peak, so this works at any speed.
    const cx = o.x + o.w / 2;
    const side = speed * airTime * 0.25;
    addBookmark(cx - side, GROUND_Y - 100);
    addBookmark(cx, GROUND_Y - 136);
    addBookmark(cx + side, GROUND_Y - 100);
  } else if (r < 0.7) {
    // A row on the floor, halfway between this stack and the next one.
    const mid = o.x + (o.w + nextSpawn) / 2;
    for (let k = -1; k <= 1; k++) addBookmark(mid + k * 28, FLOOR - 34);
  }
}

function updateBookmarks(dt) {
  const dx = speed * dt;
  for (const b of bookmarks) b.x -= dx;
  const p = playerBox();
  bookmarks = bookmarks.filter((b) => {
    if (b.x + b.w < -10) return false;
    const touching = p.x < b.x + b.w && p.x + p.w > b.x && p.y < b.y + b.h && p.y + p.h > b.y;
    if (touching) {
      sfx.bookmark();
      marks++;
      score += BOOKMARK_BONUS;
      burst(b.x + b.w / 2, b.y + b.h / 2, 8, b.color);
      popups.push({ x: b.x + b.w / 2, y: b.y, text: "+" + BOOKMARK_BONUS, life: 700 });
      return false;
    }
    return true;
  });
}

// ---------- Particles & popups ----------
function burst(x, y, n, color, size = 4) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.25,
      life: 400 + Math.random() * 300,
      color,
      size,
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt - speed * dt * 0.5;
    p.y += p.vy * dt;
    p.vy += 0.0008 * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) {
    p.y -= 0.04 * dt;
    p.life -= dt;
  }
  popups = popups.filter((p) => p.life > 0);
}

// ---------- Game loop ----------
function update(dt) {
  runTime += dt;
  speed = Math.min(MAX_SPEED, speed + SPEED_RAMP * dt);
  score += speed * dt * 0.02;
  distance += speed * dt;

  updatePlayer(dt);
  updateObstacles(dt);
  updateBookmarks(dt);
  updateParticles(dt);

  if (obstacles.some(hits)) gameOver();
}

function gameOver() {
  state = "over";
  sfx.crash();
  // loose pages fly everywhere
  burst(player.x + player.w / 2, player.y + player.h / 2, 18, PAPER, 7);
  burst(player.x + player.w / 2, player.y + player.h / 2, 8, "#2f5d62", 5);
  if (score > best) {
    best = Math.floor(score);
    safeSet("runner-best", best);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50); // clamp so tab-switching doesn't teleport things
  last = now;
  if (state === "running") update(dt);
  else if (state === "over") updateParticles(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Drawing helpers ----------
// Deterministic pseudo-random in [0,1) so scenery looks the same each time it scrolls past.
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
function label(text, x, y, size, color, family = "system-ui, sans-serif") {
  ctx.font = `bold ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

// Floors. Patterns move at full ground speed so they read as the surface you run on.
function tiles(x, w, base, line) {
  R(x, FLOOR, w, H - FLOOR, base);
  R(x, FLOOR + 13, w, 1, line);
  for (let tx = -((distance * 0.9) % 56); tx < W; tx += 56) R(tx, FLOOR, 1, 13, line);
  for (let tx = -((distance * 1.1 + 30) % 72); tx < W; tx += 72) R(tx, FLOOR + 14, 1, H - FLOOR, line);
}
function carpet(x, w, base, fleck) {
  R(x, FLOOR, w, H - FLOOR, base);
  for (let k = Math.floor(distance / 9); k * 9 - distance < W; k++) {
    R(k * 9 - distance, FLOOR + 3 + hash(k, 5) * (H - FLOOR - 6), 2, 1, fleck);
  }
}
function recessedLights(x, w, y, spacing) {
  for (let lx = x + spacing / 2; lx < x + w; lx += spacing) oval(lx, y, 8, 2.5, "#fff6d8");
}

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

// ---------- Library scenes ----------
// Each scene draws its own ceiling, wall, furniture and floor between x and x + w.

// Children's area: dark ceiling, wavy red/blue/yellow/white banners, red columns,
// low bookcases with stuffed animals, polka-dot chairs, a red A-frame display.
function sceneKids(x, w) {
  R(x, 0, w, CEIL, "#2b2b30");
  R(x, 0, w, 12, "#e9e6df");
  for (let i = 0; i * 90 < w; i++) {
    R(x + 15 + i * 90, 22, 55, 3, "#f1eee4");
    R(x + 60 + i * 90, 40, 40, 3, "#d9d6cc");
  }
  R(x, CEIL, w, FLOOR - CEIL, "#8b919a");
  R(x, CEIL, 330, FLOOR - CEIL, "#aab3c1");
  label("a b c", x + 165, CEIL + 120, 80, "rgba(70, 85, 130, 0.25)", "Georgia, serif");

  // red columns
  for (const cx of [x + 345, x + 770]) {
    R(cx, CEIL, 36, FLOOR - CEIL, "#c62a2f");
    R(cx + 26, CEIL, 10, FLOOR - CEIL, "#a31f24");
  }

  // ceiling banners, back to front
  ribbon(x, w, 44, 10, 9, 4.0, "#f1f0ec");
  ribbon(x, w, 38, 14, 12, 1.4, RIBBON_YELLOW);
  ribbon(x, w, 18, 8, 28, 2.6, RIBBON_BLUE);
  ribbon(x, w, 22, 6, 34, 0.0, RIBBON_RED);

  // colorful pendant lights
  const cones = ["#3a5bd0", RIBBON_RED, "#e8743a"];
  for (let i = 0; 40 + i * 120 < w; i++) {
    const lx = x + 40 + i * 120,
      ly = CEIL + 14 + (i % 3) * 10;
    R(lx, CEIL, 1, ly - CEIL, "#555");
    poly(cones[i % 3], lx - 6, ly + 10, lx, ly, lx + 7, ly + 10);
    oval(lx + 0.5, ly + 11, 3, 1.5, "#fff3c4");
  }

  // bulletin board and Summer Reading banner
  R(x + 430, CEIL + 28, 150, 56, "#c9c6c0");
  R(x + 430, CEIL + 28, 150, 4, RIBBON_YELLOW);
  R(x + 430, CEIL + 80, 150, 4, "#5cb85c");
  for (let i = 0; i < 5; i++) R(x + 442 + i * 27, CEIL + 40 + (i % 2) * 8, 18, 24, i === 2 ? "#4b79d9" : "#fbfaf6");
  R(x + 840, CEIL + 24, 130, 56, "#4caa3a");
  label("SUMMER", x + 905, CEIL + 47, 15, "#fff");
  label("READING", x + 905, CEIL + 67, 15, "#fff");

  // floor first so furniture stands on it
  carpet(x, w, "#c3b493", "#a99a7a");
  R(x, FLOOR, w, 12, "#5e6e8b");

  // low bookcases with stuffed animals on top
  const top = FLOOR - 84;
  shelfUnit(x + 30, top, 260, 84, 2, 1);
  shelfUnit(x + 400, top, 230, 84, 2, 2);
  const bx = x + 110; // black bear
  oval(bx, top - 15, 18, 15, "#1c1817");
  oval(bx + 18, top - 30, 11, 10, "#1c1817");
  oval(bx + 12, top - 40, 4, 4, "#1c1817");
  oval(bx + 25, top - 39, 4, 4, "#1c1817");
  oval(bx + 27, top - 27, 4, 3, "#4a3d36");
  const hx = x + 500; // white plush horse
  oval(hx, top - 13, 24, 13, "#f2f0ea");
  oval(hx + 24, top - 30, 8, 13, "#f2f0ea");
  R(hx - 8, top - 26, 16, 8, "#222");
  R(hx + 18, top - 42, 4, 12, "#444");

  // red A-frame display on wheels
  const ax = x + 705;
  poly("#d42b2b", ax - 45, FLOOR - 4, ax, FLOOR - 134, ax + 45, FLOOR - 4);
  for (const lvl of [30, 62, 94]) {
    const hw = 45 * (1 - lvl / 134) + 12;
    R(ax - hw, FLOOR - lvl, hw * 2, 4, "#b82222");
    for (let i = 0; i < 4; i++) R(ax - hw + 4 + i * (hw / 2), FLOOR - lvl - 16, 8, 16, BRIGHT[(i + lvl) % BRIGHT.length]);
  }
  oval(ax - 38, FLOOR - 2, 3, 3, "#333");
  oval(ax + 38, FLOOR - 2, 3, 3, "#333");

  // polka-dot armchairs
  for (const cx of [x + 815, x + 895]) {
    ctx.fillStyle = "#b8262c";
    roundRect(cx, FLOOR - 62, 70, 40, 10);
    ctx.fillStyle = "#c92f35";
    roundRect(cx - 4, FLOOR - 36, 78, 30, 8);
    for (let i = 0; i < 14; i++) {
      oval(cx + 4 + hash(i, cx) * 62, FLOOR - 58 + hash(cx, i) * 48, 2.5, 2.5, BRIGHT[i % BRIGHT.length]);
    }
    R(cx + 4, FLOOR - 6, 3, 6, "#888");
    R(cx + 63, FLOOR - 6, 3, 6, "#888");
  }
}

function ribbon(x, w, baseY, amp, thickness, phase, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= w; i += 10) {
    const y = baseY + Math.sin(i * 0.013 + phase) * amp;
    if (i === 0) ctx.moveTo(x + i, y);
    else ctx.lineTo(x + i, y);
  }
  for (let i = w; i >= 0; i -= 10) {
    ctx.lineTo(x + i, baseY + Math.sin(i * 0.013 + phase) * amp + thickness + Math.sin(i * 0.02 + phase) * 3);
  }
  ctx.fill();
}

// Lobby: maple-paneled Meeting Room doors and the big memorial globe behind a glass railing.
function sceneLobby(x, w) {
  R(x, 0, w, CEIL, "#ecebe7");
  R(x + 230, 0, 440, CEIL - 14, "#f7f6f2");
  recessedLights(x, w, CEIL - 7, 110);
  for (let i = 0; i < 4; i++) oval(x + 330 + i * 80, 24, 8, 3, "#fff6d8");
  R(x, CEIL - 2, w, 2, "#d5d3cd");
  R(x, CEIL, w, FLOOR - CEIL, "#c8cdd4");

  // Meeting Room paneling
  const px = x + 20,
    pw = 320,
    pt = CEIL + 16;
  R(px, pt, pw, FLOOR - pt, "#d49853");
  R(px, pt, pw, 34, "#cf914b");
  R(px, pt + 34, pw, 2, "#b07636");
  label("M E E T I N G   R O O M", px + pw / 2, pt + 24, 14, "#f4efe6");
  for (let k = 1; k < 4; k++) R(px + k * 80, pt + 36, 2, FLOOR - pt - 36, "#b07636");
  R(px + 90, pt + 46, 140, FLOOR - pt - 46, "#c98a45");
  R(px + 159, pt + 46, 2, FLOOR - pt - 46, "#a8702f");
  R(px + 150, FLOOR - 90, 3, 26, "#d8d8d8");
  R(px + 167, FLOOR - 90, 3, 26, "#d8d8d8");

  // side paneling, door and exit sign
  R(x + 640, pt, 240, FLOOR - pt, "#d49853");
  R(x + 715, CEIL + 44, 80, FLOOR - CEIL - 44, "#b07636");
  R(x + 720, CEIL + 48, 70, FLOOR - CEIL - 48, "#dfa865");
  R(x + 722, FLOOR - 80, 66, 4, "#9a9a9a");
  R(x + 590, CEIL + 4, 36, 15, "#f2f2f2");
  label("EXIT", x + 608, CEIL + 16, 10, "#d22");

  tiles(x, w, "#3b3c43", "#2b2c31");

  // globe on its pedestal, ringed by a wood-topped glass railing
  const gx = x + 470,
    gy = FLOOR - 124,
    r = 88;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#cfa265";
  ctx.beginPath();
  ctx.ellipse(gx, FLOOR - 66, 160, 20, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  R(gx - 70, FLOOR - 16, 140, 10, "#222");
  poly("#b9bec4", gx - 30, FLOOR - 14, gx - 16, gy + r - 8, gx + 16, gy + r - 8, gx + 30, FLOOR - 14);

  const sea = ctx.createRadialGradient(gx - 30, gy - 30, 10, gx, gy, r);
  sea.addColorStop(0, "#8cc8ef");
  sea.addColorStop(1, "#2f74ad");
  ctx.fillStyle = sea;
  ctx.beginPath();
  ctx.arc(gx, gy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(gx, gy, r, 0, Math.PI * 2);
  ctx.clip();
  const land = "#d9d4b2";
  const shape = (pts) => poly(land, ...pts.flatMap(([a, b]) =>[gx + a, gy + b]));
  shape([[-58, -52], [-30, -74], [0, -80], [22, -66], [14, -50], [30, -40], [8, -22], [-6, -8], [-18, -2], [-28, -20], [-48, -30]]);
  shape([[12, -84], [36, -80], [30, -64], [16, -68]]);
  shape([[-6, -4], [6, 0], [30, 8], [46, 24], [34, 48], [16, 66], [6, 86], [2, 60], [-4, 30], [-10, 10]]);
  oval(gx - 28, gy - 36, 26, 18, "rgba(255,255,255,0.12)");
  ctx.restore();

  ctx.fillStyle = "rgba(200, 230, 240, 0.22)";
  ctx.beginPath();
  ctx.ellipse(gx, FLOOR - 66, 160, 20, 0, 0, Math.PI);
  ctx.ellipse(gx, FLOOR - 22, 160, 20, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  for (let a = 0.15; a < Math.PI; a += Math.PI / 9) {
    const postX = gx + Math.cos(a) * 160,
      top = FLOOR - 66 + Math.sin(a) * 20;
    R(postX - 1.5, top, 3, 44, "#a9b0b8");
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#9aa1a9";
  ctx.beginPath();
  ctx.ellipse(gx, FLOOR - 22, 160, 20, 0, 0, Math.PI);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#d6a868";
  ctx.beginPath();
  ctx.ellipse(gx, FLOOR - 66, 160, 20, 0, 0, Math.PI);
  ctx.stroke();
}

// Computer area: bright tiled ceiling, round disc pendants, white columns,
// a brick wall, white desks with perforated panels and purple-screened monitors.
function sceneComputers(x, w) {
  R(x, 0, w, CEIL, "#f3f1eb");
  for (let i = 0; i * 60 < w; i++) R(x + i * 60, 0, 1, CEIL, "#e2dfd7");
  R(x, 30, w, 1, "#e2dfd7");
  R(x, CEIL, w, FLOOR - CEIL, "#a5adb7");

  // brick wall
  R(x, CEIL, 230, FLOOR - CEIL, "#b8653d");
  for (let row = 0, y = CEIL; y < FLOOR; row++, y += 9) {
    R(x, y, 230, 1, "#9c5332");
    for (let bx = x + (row % 2) * 11; bx < x + 230; bx += 22) R(bx, y, 1, 9, "#9c5332");
  }
  // big windows by the entrance
  R(x + 780, CEIL + 14, 210, FLOOR - CEIL - 24, "#eef4f7");
  for (let mx = x + 780; mx <= x + 990; mx += 42) R(mx, CEIL + 14, 3, FLOOR - CEIL - 24, "#c4ccd2");
  R(x + 780, CEIL + 90, 210, 3, "#c4ccd2");

  carpet(x, w, "#4a4e57", "#5d626c");

  // white round columns
  for (const cx of [x + 250, x + 640]) {
    const g = ctx.createLinearGradient(cx, 0, cx + 42, 0);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#c9ced4");
    ctx.fillStyle = g;
    ctx.fillRect(cx, 0, 42, FLOOR);
  }

  // disc pendant lights
  for (let lx = x + 120; lx < x + w; lx += 170) {
    const glow = ctx.createRadialGradient(lx, 54, 4, lx, 54, 90);
    glow.addColorStop(0, "rgba(255, 246, 220, 0.5)");
    glow.addColorStop(1, "rgba(255, 246, 220, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(lx - 90, 0, 180, 150);
    R(lx - 1, 0, 2, 46, "#cfd3d6");
    oval(lx, 50, 32, 7, "#d6dadd");
    oval(lx, 51, 18, 3, "#fff6dc");
  }

  // computer desks with chairs
  for (const dx of [x + 40, x + 320, x + 480, x + 700]) {
    R(dx, FLOOR - 52, 140, 6, "#e6e8ea");
    R(dx + 10, FLOOR - 46, 120, 30, "#c5c9ce");
    for (let py = FLOOR - 42; py < FLOOR - 20; py += 6)
      for (let pxx = dx + 14; pxx < dx + 128; pxx += 6) R(pxx, py, 2, 2, "#aab0b6");
    R(dx + 14, FLOOR - 46, 5, 46, "#b8bdc3");
    R(dx + 121, FLOOR - 46, 5, 46, "#b8bdc3");
    R(dx + 50, FLOOR - 84, 38, 28, "#1b1b1e");
    R(dx + 53, FLOOR - 81, 32, 22, "#5b3fa6");
    R(dx + 67, FLOOR - 56, 4, 4, "#222");
    R(dx + 44, FLOOR - 55, 40, 3, "#2a2a2a");
    const cx = dx + 95;
    ctx.fillStyle = "#1d1d20";
    roundRect(cx, FLOOR - 72, 30, 28, 8);
    R(cx - 2, FLOOR - 40, 34, 6, "#1d1d20");
    R(cx + 13, FLOOR - 34, 4, 22, "#8f959c");
    R(cx - 4, FLOOR - 12, 38, 3, "#8f959c");
    oval(cx - 3, FLOOR - 6, 3, 3, "#222");
    oval(cx + 33, FLOOR - 6, 3, 3, "#222");
  }
}

// Circulation desk: long maple counter with self-checkout kiosks, navy wall,
// decorated windows and a TV screen.
function sceneDesk(x, w) {
  R(x, 0, w, CEIL, "#d8d4cc");
  poly("#cbc6bd", x, 0, x + w, 0, x + w, CEIL - 28, x, CEIL - 8);
  for (let i = 0; 50 + i * 90 < w; i++) oval(x + 50 + i * 90, 16 + (i % 2) * 16, 7, 2.5, "#fffbe8");
  R(x, CEIL, w, FLOOR - CEIL, "#344050");

  // view down the hallway into the stacks
  R(x, CEIL, 150, FLOOR - CEIL, "#ddd8cc");
  shelfUnit(x + 10, FLOOR - 70, 120, 70, 2, 9);

  // library logo sign on the navy wall
  drawLogo(x + 470, CEIL + 14, 46);

  // TV with colorful profiles
  R(x + 330, CEIL + 18, 78, 46, "#111");
  R(x + 334, CEIL + 22, 70, 38, "#1f2747");
  oval(x + 356, CEIL + 41, 10, 14, "#e0488f");
  oval(x + 369, CEIL + 41, 10, 14, "#f0a23a");
  oval(x + 382, CEIL + 41, 10, 14, "#5a8de0");

  // decorated windows with bunting
  R(x + 520, CEIL + 40, 360, 80, "#5a6b80");
  for (let k = 0; k < 6; k++) {
    const wx = x + 526 + k * 59;
    R(wx, CEIL + 46, 53, 68, "#e8eef2");
    oval(wx + 26, CEIL + 84, 12, 10, COLORFUL[(k * 3) % COLORFUL.length]);
    for (let t = 0; t < 3; t++) {
      const c = ["#c0392b", "#ffffff", "#2c4a8a"][t];
      poly(c, wx + 4 + t * 16, CEIL + 46, wx + 18 + t * 16, CEIL + 46, wx + 11 + t * 16, CEIL + 58);
    }
  }

  tiles(x, w, "#3e3633", "#2d2725");

  // the counter
  R(x + 70, FLOOR - 76, 860, 76, MAPLE);
  R(x + 70, FLOOR - 80, 860, 6, "#2b2d31");
  R(x + 70, FLOOR - 58, 860, 2, "#c08f48");
  for (let px = x + 118; px < x + 930; px += 48) R(px, FLOOR - 56, 2, 56, "#b9873f");
  R(x + 700, FLOOR - 98, 230, 98, "#dcae68");
  R(x + 696, FLOOR - 102, 238, 5, "#c8964f");
  for (let px = x + 740; px < x + 930; px += 48) R(px, FLOOR - 90, 2, 90, "#c08f48");

  // self-checkout kiosks
  for (const kx of [x + 180, x + 290]) {
    R(kx, FLOOR - 132, 32, 52, "#283246");
    R(kx + 4, FLOOR - 128, 24, 18, "#7fc4e8");
    R(kx + 8, FLOOR - 104, 16, 6, "#1b2230");
  }
  // brochure stands
  R(x + 720, FLOOR - 126, 22, 24, "#f2f2f2");
  R(x + 760, FLOOR - 128, 26, 26, "#8e5bc8");
  R(x + 800, FLOOR - 124, 24, 22, "#c0392b");
  R(x + 840, FLOOR - 126, 26, 24, "#56b04a");
}

// Returns: maple cabinet with A/V and Book Drop slots, blue-framed windows spelling LIBRARY.
function sceneBookDrop(x, w) {
  R(x, 0, w, CEIL, "#e8e5de");
  recessedLights(x, w, 24, 130);
  R(x, CEIL, w, FLOOR - CEIL, "#bcc6d1");

  R(x + 260, CEIL + 6, 620, FLOOR - CEIL - 6, "#4d6b98");
  for (let k = 0; k < 6; k++) R(x + 272 + k * 100, CEIL + 16, 88, 96, "#edf2f6");
  const letters = "LIBRARY";
  for (let i = 0; i < letters.length; i++) {
    label(letters[i], x + 300 + i * 82, CEIL + 50 + (i % 3) * 22, 20, COLORFUL[i % COLORFUL.length], "Georgia, serif");
  }

  tiles(x, w, "#4a3a3b", "#352a2a");

  // library logo sign above the return cabinet
  drawLogo(x + 150, CEIL + 10, 50);

  // wood pillar
  R(x + 14, CEIL, 24, FLOOR - CEIL, "#dcae68");
  R(x + 32, CEIL, 6, FLOOR - CEIL, "#c08f48");

  // the return cabinet
  const cx = x + 60,
    top = FLOOR - 118;
  R(cx, top, 800, 118, MAPLE);
  R(cx - 6, top - 8, 812, 10, "#e3b06a");
  R(cx, top + 2, 800, 34, "#cf9a55");
  R(cx, top + 36, 800, 2, "#b98340");
  for (let px = cx + 133; px < cx + 800; px += 133) R(px, top + 38, 2, 72, "#b98340");
  R(cx, FLOOR - 8, 800, 8, "#2a2c30");
  for (const [sx, text] of [[cx + 140, "A/V DROP"], [cx + 410, "BOOK DROP"], [cx + 680, "BOOK DROP"]]) {
    label(text, sx, top + 26, 15, "#eceef0");
    R(sx - 40, top + 44, 80, 16, "#6f7378");
    R(sx - 36, top + 48, 72, 8, "#1c1c1c");
  }
}

const SCENES = [
  { w: 1000, draw: sceneKids },
  { w: 900, draw: sceneLobby },
  { w: 1000, draw: sceneComputers },
  { w: 1000, draw: sceneDesk },
  { w: 900, draw: sceneBookDrop },
];
const LOOP = SCENES.reduce((s, z) => s + z.w, 0);

function drawBackground() {
  const off = distance * BG_PARALLAX;
  let sx = Math.floor(off / LOOP) * LOOP - off; // screen x where the current loop starts
  const seams = [];
  for (let i = 0; sx < W; i++) {
    const z = SCENES[i % SCENES.length];
    if (sx + z.w > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, 0, z.w, H);
      ctx.clip();
      z.draw(sx, z.w);
      ctx.restore();
      seams.push(sx);
    }
    sx += z.w;
  }
  // a pale column hides each seam between scenes
  for (const s of seams) {
    R(s - 13, 0, 26, FLOOR, "#d3d8de");
    R(s + 7, 0, 6, FLOOR, "#b9bfc7");
  }
  // push the scenery back a touch so the obstacles and bookmarks pop
  R(0, 0, W, FLOOR, "rgba(20, 14, 10, 0.12)");
  R(0, FLOOR, W, 2, "rgba(0, 0, 0, 0.3)");
}

// ---------- Drawing ----------
function draw() {
  drawBackground();

  for (const o of obstacles) {
    if (o.type === "flyer") drawFlyingBook(o);
    else for (const b of o.books) drawLyingBook(b);
  }

  for (const b of bookmarks) {
    drawBookmark(b.x, b.y + Math.sin(runTime * 0.005 + b.phase) * 3, b.w, b.h, b.color);
  }

  if (state !== "over") drawPlayer();

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 700);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size * 0.75);
  }
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, p.life / 700);
    ctx.font = "bold 16px Georgia, serif";
    const tw = ctx.measureText(p.text).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.75)";
    roundRect(p.x - tw / 2 - 6, p.y - 16, tw + 12, 22, 6);
    label(p.text, p.x, p.y, 16, "#fff", "Georgia, serif");
  }
  ctx.globalAlpha = 1;

  // Sound button (click/tap it, or press M)
  const mb = MUTE_BTN;
  ctx.fillStyle = "rgba(20, 14, 10, 0.65)";
  roundRect(mb.x, mb.y, mb.w, mb.h, 8);
  drawSpeaker(mb.x + 12, mb.y + 16, muted);
  ctx.font = "bold 14px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillStyle = muted ? "#9a8f7c" : PAPER;
  ctx.fillText(muted ? "Sound off" : "Sound on", mb.x + 42, mb.y + 21);

  // HUD
  ctx.fillStyle = "rgba(20, 14, 10, 0.65)";
  roundRect(W - 370, 12, 358, 32, 8);
  drawBookmark(W - 356, 18, 10, 19, RIBBON_RED);
  ctx.font = "bold 16px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillStyle = PAPER;
  ctx.fillText("× " + marks, W - 340, 34);
  ctx.textAlign = "right";
  ctx.fillText("PAGES " + String(Math.floor(score)).padStart(5, "0"), W - 24, 34);
  ctx.fillStyle = GOLD;
  ctx.fillText("BEST " + String(best).padStart(5, "0"), W - 170, 34);

  // Overlays
  if (state === "ready") overlay("Stacks Dash", "Press Space or tap to start", "Grab bookmarks for +" + BOOKMARK_BONUS + " pages");
  if (state === "paused") overlay("Shh… paused", "Press P to keep reading");
  if (state === "over") {
    overlay("Overdue!", "Press Space or tap to check out again", `Bookmarks collected: ${marks}`);
  }
}

// Speaker icon with sound waves, or a cross when muted. (x, y) is the left-middle.
function drawSpeaker(x, y, off) {
  const c = off ? "#9a8f7c" : PAPER;
  poly(c, x, y - 4, x + 5, y - 4, x + 11, y - 9, x + 11, y + 9, x + 5, y + 4, x, y + 4);
  ctx.strokeStyle = c;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (off) {
    ctx.moveTo(x + 15, y - 4);
    ctx.lineTo(x + 21, y + 4);
    ctx.moveTo(x + 21, y - 4);
    ctx.lineTo(x + 15, y + 4);
  } else {
    ctx.arc(x + 12, y, 5, -Math.PI / 3, Math.PI / 3);
    ctx.moveTo(x + 12 + 9 * Math.cos(-Math.PI / 3), y + 9 * Math.sin(-Math.PI / 3));
    ctx.arc(x + 12, y, 9, -Math.PI / 3, Math.PI / 3);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
}

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

// One book lying flat in a stack: cover color, cream page edge, gold band.
function drawLyingBook(b) {
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = PAPER;
  ctx.fillRect(b.x + 3, b.y + 2, b.w - 3, b.h - 4);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  for (let y = b.y + 4; y < b.y + b.h - 3; y += 2) ctx.fillRect(b.x + 3, y, b.w - 3, 1);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, 6, b.h);
  ctx.fillStyle = GOLD;
  ctx.fillRect(b.x + 2, b.y + 2, 2, b.h - 4);
}

// The hero: a little teal hardcover with reading glasses.
// A book flapping its covers like wings, with a shadow on the floor below.
function drawFlyingBook(o) {
  const cx = o.x + o.w / 2,
    bottom = o.y + o.h;
  oval(cx, FLOOR - 1, 16, 3, "rgba(0, 0, 0, 0.25)");
  const flap = Math.sin(runTime * 0.025 + o.phase) * 7;
  const sx = cx,
    sy = bottom - 3; // spine
  const lx = cx - 22,
    rx = cx + 22,
    tipY = bottom - 14 - flap;
  // fanned pages between the covers
  poly(PAPER, sx, sy, lx + 2, tipY + 2, cx, tipY - 6, rx - 2, tipY + 2);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const t of [0.3, 0.55, 0.8]) {
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - 20 * t, tipY - 4 * t);
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 20 * t, tipY - 4 * t);
  }
  ctx.stroke();
  // covers
  ctx.strokeStyle = o.color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(lx, tipY);
  ctx.lineTo(sx, sy);
  ctx.lineTo(rx, tipY);
  ctx.stroke();
  ctx.lineCap = "butt";
  // angry little eyes on the spine so it reads as a creature
  R(sx - 5, sy - 9, 3, 3, "#1a1a1a");
  R(sx + 2, sy - 9, 3, 3, "#1a1a1a");
}

function drawPlayer() {
  const duck = player.ducking;
  const { x, y, w, h } = duck ? { x: player.x, y: FLOOR - DUCK_H, w: DUCK_W, h: DUCK_H } : player;
  // squash & stretch based on vertical velocity
  const stretch = player.onGround ? 1 : 1 + Math.min(Math.abs(player.vy) * 0.15, 0.12);
  const pw = w / stretch,
    ph = h * stretch;
  const px = x + (w - pw) / 2,
    py = duck ? FLOOR - ph - 2 : y + h - ph - 6; // standing: lift the body so the legs reach the floor

  // legs, animated while running on the ground (tucked away while ducking)
  ctx.fillStyle = "#1e2b2c";
  if (duck) {
    const step = Math.sin(runTime * 0.04) * 3;
    ctx.fillRect(px + 8 + step, FLOOR - 2, 6, 2);
    ctx.fillRect(px + pw - 16 - step, FLOOR - 2, 6, 2);
  } else {
    const step = player.onGround && state === "running" ? Math.sin(runTime * 0.03) * 5 : 0;
    ctx.fillRect(px + 8 + step, py + ph - 2, 5, 8);
    ctx.fillRect(px + pw - 14 - step, py + ph - 2, 5, 8);
  }

  // page edges peeking out on the right
  ctx.fillStyle = PAPER;
  roundRect(px + 4, py + 3, pw - 2, ph - 6, 3);
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  for (let ly = py + 6; ly < py + ph - 6; ly += 3) ctx.fillRect(px + pw - 2, ly, 2, 1);

  // cover
  ctx.fillStyle = "#2f5d62";
  roundRect(px, py, pw - 4, ph, 4);
  // spine
  ctx.fillStyle = "#234548";
  ctx.fillRect(px, py, 7, ph);
  // gold title band
  ctx.fillStyle = GOLD;
  ctx.fillRect(px + 10, py + ph - 12, pw - 18, 3);

  // eyes + round reading glasses
  const ex = px + pw - 22,
    ey = py + 15;
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(ex - 1, ey - 1, 3, 4);
  ctx.fillRect(ex + 9, ey - 1, 3, 4);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ex, ey, 5, 0, Math.PI * 2);
  ctx.moveTo(ex + 15, ey);
  ctx.arc(ex + 10, ey, 5, 0, Math.PI * 2);
  ctx.stroke();
}

function overlay(title, sub, extra) {
  ctx.fillStyle = "rgba(26, 18, 12, 0.45)";
  ctx.fillRect(0, 0, W, H);

  // solid panel sized to the widest line
  const widths = [["bold 34px Georgia, serif", title], ["18px Georgia, serif", sub], ["15px Georgia, serif", extra || ""]].map(
    ([font, text]) => ((ctx.font = font), ctx.measureText(text).width)
  );
  const pw = Math.max(...widths) + 56,
    ph = (extra ? 112 : 88) + 50; // + room for the logo
  ctx.fillStyle = "rgba(26, 18, 12, 0.9)";
  roundRect(W / 2 - pw / 2, H / 2 - 104, pw, ph, 12);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawLogo(W / 2, H / 2 - 96, 30);

  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.font = "bold 34px Georgia, serif";
  ctx.fillText(title, W / 2, H / 2 - 14);
  ctx.fillStyle = GOLD;
  ctx.font = "18px Georgia, serif";
  ctx.fillText(sub, W / 2, H / 2 + 18);
  if (extra) {
    ctx.fillStyle = PAPER;
    ctx.font = "15px Georgia, serif";
    ctx.fillText(extra, W / 2, H / 2 + 44);
  }
}

// ---------- Input ----------
function press() {
  if (state === "ready") {
    state = "running";
    sfx.start();
    jump();
  } else if (state === "running") {
    jump();
  } else if (state === "over") {
    reset();
    state = "running";
    sfx.start();
  }
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    e.preventDefault();
    if (!e.repeat) press();
  } else if (e.code === "ArrowDown" || e.code === "KeyS") {
    e.preventDefault();
    startDuck();
  } else if (e.code === "KeyM") {
    toggleMute();
  } else if (e.code === "KeyP" || e.code === "Escape") {
    if (state === "running") state = "paused";
    else if (state === "paused") state = "running";
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") releaseJump();
  if (e.code === "ArrowDown" || e.code === "KeyS") duckHeld = false;
});
// Touch / mouse: press on the bottom third of the game to duck, anywhere else to jump.
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  // convert to canvas coordinates (the canvas is scaled by CSS)
  const cx = ((e.clientX - rect.left) / rect.width) * W;
  const cy = ((e.clientY - rect.top) / rect.height) * H;
  const b = MUTE_BTN;
  if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) return toggleMute();
  if (cy / H > 0.67 && state === "running") startDuck();
  else press();
});
function startDuck() {
  if (!duckHeld && state === "running") sfx.duck();
  duckHeld = true;
}
function pointerRelease() {
  duckHeld = false;
  releaseJump();
}
canvas.addEventListener("pointerup", pointerRelease);
canvas.addEventListener("pointercancel", pointerRelease);
canvas.addEventListener("pointerleave", pointerRelease);

// Auto-pause when the tab is hidden
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "running") state = "paused";
});

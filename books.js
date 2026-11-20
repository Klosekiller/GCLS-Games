// Shelf Help: a falling-books puzzle set in the library.
// Fill a whole shelf (row) with books to clear it.

// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width,
  H = canvas.height;

// ---------- Tunables (units: px and ms) ----------
const COLS = 10,
  ROWS = 20,
  CELL = 28;
const BX = 30,
  BY = 64; // board top-left
const PX = 346,
  PW = 150; // side panel
const DAS = 170; // delay before a held left/right starts repeating
const ARR = 50; // time between those repeats
const SOFT_DROP_MS = 35;
const LOCK_MS = 500; // time a piece can sit on the stack before it locks
const MAX_LOCK_RESETS = 15; // moves allowed on the stack before it locks anyway
const CLEAR_MS = 320; // length of the row-clear flash
const LINE_SCORES = [0, 100, 300, 500, 800]; // × level
const CLEAR_NAMES = ["", "Shelved!", "Double shelf!", "Triple shelf!", "Full bookcase!"];

// ---------- Palette (from the library) ----------
// Each piece is a bundle of books in one color. Matrix values: 0 = empty, 1 = book.
const PIECES = {
  I: { color: "#3d4c8c", light: "#5466b0", dark: "#2b3768", m: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  O: { color: "#e8b52a", light: "#f2c94e", dark: "#b88a17", m: [[1, 1], [1, 1]] },
  T: { color: "#6b3e75", light: "#87538f", dark: "#4d2b55", m: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  S: { color: "#4f7942", light: "#669456", dark: "#3a5a30", m: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  Z: { color: "#c92a2f", light: "#de4a4e", dark: "#951e22", m: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
  J: { color: "#2f7d84", light: "#3f9aa2", dark: "#215a5f", m: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  L: { color: "#d9773a", light: "#ea9257", dark: "#a95a28", m: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
};
const TYPES = Object.keys(PIECES);

// ---------- State ----------
let board, piece, queue, holdType, holdUsed;
let score, lines, level;
let dropTimer, lockTimer, lockResets;
let clearing = false,
  clearingRows = [],
  clearTimer = 0;
let particles = [],
  popups = [];
let state = "ready"; // ready | playing | paused | over
let best = Number(safeGet("shelf-best")) || 0;
let time = 0;

// held inputs for auto-repeat
const held = { left: false, right: false, down: false };
let moveDir = 0,
  dasTimer = 0,
  arrTimer = 0;

function newBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}
board = newBoard();
queue = [];

function startGame() {
  board = newBoard();
  queue = [];
  holdType = null;
  holdUsed = false;
  score = 0;
  lines = 0;
  level = 1;
  particles = [];
  popups = [];
  clearing = false;
  clearingRows = [];
  state = "playing";
  spawnNext();
  sfx.start();
}

// ---------- Pieces ----------
// "7-bag": every 7 pieces contain one of each, so droughts never get too long.
function nextType() {
  if (queue.length < 7) {
    const bag = [...TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    queue.push(...bag);
  }
  return queue.shift();
}

function makePiece(type) {
  // Each book gets a random look (1–4) that travels with it when the piece rotates.
  const m = PIECES[type].m.map((row) => row.map((v) => (v ? 1 + ((Math.random() * 4) | 0) : 0)));
  const firstRow = m.findIndex((row) => row.some(Boolean));
  const y = -firstRow; // top books start on the top shelf
  return { type, m, x: Math.floor((COLS - m.length) / 2), y, lowest: y };
}

function spawnNext(type = nextType()) {
  piece = makePiece(type);
  dropTimer = 0;
  lockTimer = 0;
  lockResets = 0;
  if (collides(piece.m, piece.x, piece.y)) gameOver();
}

function forEachCell(m, x, y, fn) {
  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m[r].length; c++) if (m[r][c]) fn(x + c, y + r, m[r][c]);
}

function collides(m, x, y) {
  let hit = false;
  forEachCell(m, x, y, (bx, by) => {
    if (bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && board[by][bx])) hit = true;
  });
  return hit;
}

function onGround() {
  return collides(piece.m, piece.x, piece.y + 1);
}

// Moving or rotating while resting on the stack buys a little more time (up to a limit).
function afterMove() {
  if (onGround() && lockResets < MAX_LOCK_RESETS) {
    lockTimer = 0;
    lockResets++;
  }
}

function shift(dx) {
  if (!piece || collides(piece.m, piece.x + dx, piece.y)) return false;
  piece.x += dx;
  sfx.move();
  afterMove();
  return true;
}

function rotateMatrix(m, dir) {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (dir > 0) out[c][n - 1 - r] = m[r][c];
      else out[n - 1 - c][r] = m[r][c];
    }
  return out;
}

// If a rotation is blocked, try nudging the piece sideways or up ("wall kicks").
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
function rotate(dir) {
  if (!piece || piece.type === "O") return;
  const m = rotateMatrix(piece.m, dir);
  for (const [kx, ky] of KICKS) {
    if (!collides(m, piece.x + kx, piece.y + ky)) {
      piece.m = m;
      piece.x += kx;
      piece.y += ky;
      sfx.rotate();
      afterMove();
      return;
    }
  }
}

function dropDistance() {
  let d = 0;
  while (!collides(piece.m, piece.x, piece.y + d + 1)) d++;
  return d;
}

function hardDrop() {
  if (!piece) return;
  const d = dropDistance();
  piece.y += d;
  score += 2 * d;
  sfx.drop();
  forEachCell(piece.m, piece.x, piece.y, (bx, by) => {
    if (by >= 0) burst(BX + bx * CELL + CELL / 2, BY + (by + 1) * CELL, 2, PAPER);
  });
  lockPiece();
}

function holdPiece() {
  if (!piece || holdUsed) return;
  const t = piece.type;
  if (holdType) {
    const swap = holdType;
    holdType = t;
    spawnNext(swap);
  } else {
    holdType = t;
    spawnNext();
  }
  holdUsed = true;
  sfx.hold();
}

function lockPiece() {
  let above = false;
  forEachCell(piece.m, piece.x, piece.y, (bx, by, v) => {
    if (by < 0) above = true;
    else board[by][bx] = { t: piece.type, v };
  });
  piece = null;
  holdUsed = false;
  if (above) return gameOver();
  sfx.lock();

  const full = [];
  for (let r = 0; r < ROWS; r++) if (board[r].every(Boolean)) full.push(r);
  if (!full.length) return spawnNext();

  // Shelf cleared!
  const n = full.length;
  score += LINE_SCORES[n] * level;
  lines += n;
  clearing = true;
  clearingRows = full;
  clearTimer = CLEAR_MS;
  sfx.clear(n);
  for (const r of full)
    for (let c = 0; c < COLS; c++) burst(BX + c * CELL + CELL / 2, BY + r * CELL + CELL / 2, 2, PAPER, 6);
  const avgRow = full.reduce((a, b) => a + b, 0) / n;
  popup(CLEAR_NAMES[n], BY + avgRow * CELL);

  const newLevel = 1 + Math.floor(lines / 10);
  if (newLevel > level) {
    level = newLevel;
    setTimeout(() => sfx.level(), 250);
    popup("Level " + level, BY + avgRow * CELL - 34);
  }
}

function finishClear() {
  board = board.filter((_, r) => !clearingRows.includes(r));
  while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
  clearing = false;
  clearingRows = [];
  spawnNext();
}

function gravityMs() {
  return Math.max(60, 800 * Math.pow(0.85, level - 1));
}

function gameOver() {
  state = "over";
  sfx.over();
  if (score > best) {
    best = score;
    safeSet("shelf-best", best);
  }
}

// ---------- Update ----------
function update(dt) {
  time += dt;
  updateParticles(dt);
  if (state !== "playing") return;

  if (clearing) {
    clearTimer -= dt;
    if (clearTimer <= 0) finishClear();
    return;
  }
  if (!piece) return;

  // held left/right auto-repeat
  if (moveDir !== 0) {
    dasTimer += dt;
    if (dasTimer >= DAS) {
      arrTimer += dt;
      while (arrTimer >= ARR) {
        arrTimer -= ARR;
        if (!shift(moveDir)) {
          arrTimer = 0;
          break;
        }
      }
    }
  }

  // gravity (faster while soft-dropping)
  const interval = held.down ? Math.min(SOFT_DROP_MS, gravityMs()) : gravityMs();
  dropTimer += dt;
  while (dropTimer >= interval) {
    dropTimer -= interval;
    if (onGround()) {
      dropTimer = 0;
      break;
    }
    piece.y++;
    if (held.down) score += 1;
    if (piece.y > piece.lowest) {
      piece.lowest = piece.y; // reaching a new low gives back the lock-delay moves
      lockResets = 0;
    }
  }

  if (onGround()) {
    lockTimer += dt;
    if (lockTimer >= LOCK_MS) lockPiece();
  } else lockTimer = 0;
}

// ---------- Particles & popups ----------
function burst(x, y, n, color, size = 4) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.3,
      life: 400 + Math.random() * 400,
      color,
      size,
    });
  }
}
function popup(text, y) {
  popups.push({ text, x: BX + (COLS * CELL) / 2, y, life: 1000 });
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
setupSound("shelf");

const sfx = {
  move: () => tone(520, 520, 0.03, "square", 0.04),
  rotate: () => tone(660, 880, 0.05, "triangle", 0.08),
  lock: () => tone(160, 90, 0.08, "triangle", 0.14),
  drop: () => tone(300, 80, 0.12, "square", 0.1),
  hold: () => tone(500, 300, 0.1, "sine", 0.1),
  clear: (n) => {
    // one more note in the arpeggio for each shelf cleared
    [523, 659, 784, 1047, 1319].slice(0, n + 1).forEach((f, i) => tone(f, f, 0.12, "sine", 0.13, i * 0.07));
  },
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

// ---------- Drawing helpers ----------

// One cell = two upright books side by side. `v` (1–4) picks which of the two is shorter.
function drawBook(x, y, size, p, v) {
  const half = size / 2;
  const bits = v - 1;
  for (let i = 0; i < 2; i++) {
    const sx = x + i * half + 0.5;
    const top = y + ((bits >> i) & 1 ? size * 0.16 : size * 0.05);
    const bottom = y + size - 2;
    R(sx, top, half - 1, bottom - top, i ? p.light : p.color);
    R(sx, top, Math.max(1, half * 0.22), bottom - top, p.dark);
    const band = Math.max(1, size * 0.06);
    R(sx + half * 0.3, top + size * 0.1, half * 0.5, band, GOLD);
    R(sx + half * 0.3, bottom - size * 0.2, half * 0.5, band, GOLD);
  }
}

// The children's-area banners, waving across the top of the room.
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
  R(0, 0, W, H, "#8b919a");
  R(0, 0, W, 44, "#2b2b30");
  R(0, 0, W, 8, "#e9e6df");
  ribbon(26, 8, 8, 4.0, "#f1f0ec");
  ribbon(22, 10, 10, 1.4, "#e8b52a");
  ribbon(10, 6, 20, 2.6, "#3d4c8c");
  ribbon(12, 5, 24, 0.0, "#c92a2f");
  // red column between the bookcase and the panel
  R(326, 44, 14, H - 52, "#c62a2f");
  R(336, 44, 4, H - 52, "#a31f24");
  // carpet
  R(0, H - 8, W, 8, "#c3b493");
}

function drawBoard() {
  const bw = COLS * CELL,
    bh = ROWS * CELL;
  // bookcase frame and back
  R(BX - 12, BY - 12, bw + 24, bh + 24, "#cda46c");
  R(BX - 12, BY - 12, bw + 24, 4, "#e0b97f");
  R(BX, BY, bw, bh, "#3a2e25");
  for (let r = 1; r <= ROWS; r++) R(BX, BY + r * CELL - 2, bw, 2, "rgba(205, 164, 108, 0.35)");

  // shelved books
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (cell) drawBook(BX + c * CELL, BY + r * CELL, CELL, PIECES[cell.t], cell.v);
    }

  // flash the shelves being cleared
  if (clearing) {
    const a = 0.45 + 0.45 * Math.sin(time * 0.05);
    for (const r of clearingRows) R(BX, BY + r * CELL, bw, CELL, `rgba(255, 246, 220, ${a})`);
  }

  if (piece && state !== "ready") {
    const p = PIECES[piece.type];
    // ghost: where the piece will land
    if (state === "playing") {
      const gy = piece.y + dropDistance();
      ctx.strokeStyle = p.light;
      ctx.lineWidth = 2;
      forEachCell(piece.m, piece.x, gy, (bx, by) => {
        if (by < 0) return;
        R(BX + bx * CELL + 3, BY + by * CELL + 3, CELL - 6, CELL - 6, "rgba(255, 255, 255, 0.06)");
        ctx.strokeRect(BX + bx * CELL + 3, BY + by * CELL + 3, CELL - 6, CELL - 6);
      });
    }
    forEachCell(piece.m, piece.x, piece.y, (bx, by, v) => {
      if (by >= 0) drawBook(BX + bx * CELL, BY + by * CELL, CELL, p, v);
    });
  }

  if (state === "over") R(BX, BY, bw, bh, "rgba(0, 0, 0, 0.35)");
}

// Small preview of a piece, centered on (cx, cy).
function drawMini(type, cx, cy, size) {
  const p = PIECES[type];
  const cells = [];
  forEachCell(p.m, 0, 0, (c, r) => cells.push([c, r]));
  const minC = Math.min(...cells.map((a) => a[0])),
    maxC = Math.max(...cells.map((a) => a[0]));
  const minR = Math.min(...cells.map((a) => a[1])),
    maxR = Math.max(...cells.map((a) => a[1]));
  const w = (maxC - minC + 1) * size,
    h = (maxR - minR + 1) * size;
  for (const [c, r] of cells) {
    drawBook(cx - w / 2 + (c - minC) * size, cy - h / 2 + (r - minR) * size, size, p, 1 + ((r * 3 + c) % 4));
  }
}

function panelBox(y, h, title) {
  R(PX, y, PW, h, NAVY);
  ctx.strokeStyle = MAPLE;
  ctx.lineWidth = 2;
  ctx.strokeRect(PX + 1, y + 1, PW - 2, h - 2);
  text(title, PX + 12, y + 20, "bold 12px system-ui, sans-serif", GOLD, "left");
}

function drawPanel() {
  // wood sign, like the Meeting Room lettering
  R(PX, BY - 12, PW, 52, MAPLE);
  R(PX, BY + 36, PW, 4, "#b07636");
  drawLogo(PX + 22, BY - 5, 28);
  text("Shelf Help", PX + 97, BY + 20, "bold 20px Georgia, serif", "#f4efe6");

  panelBox(BY + 52, 150, "NEXT");
  for (let i = 0; i < 3 && i < queue.length; i++) {
    if (state === "ready") break;
    drawMini(queue[i], PX + PW / 2, BY + 52 + 52 + i * 40, i === 0 ? 16 : 13);
  }

  panelBox(BY + 214, 82, "HOLD  (C)");
  if (holdType && state !== "ready") {
    ctx.globalAlpha = holdUsed ? 0.35 : 1;
    drawMini(holdType, PX + PW / 2, BY + 214 + 50, 16);
    ctx.globalAlpha = 1;
  }

  const sy = BY + 308;
  panelBox(sy, ROWS * CELL - 308, "");
  const rows = [
    ["SCORE", score ?? 0],
    ["SHELVES", lines ?? 0],
    ["LEVEL", level ?? 1],
    ["BEST", Math.max(best, score ?? 0)],
  ];
  rows.forEach(([label, value], i) => {
    const y = sy + 26 + i * 62;
    text(label, PX + 14, y, "bold 12px system-ui, sans-serif", GOLD, "left");
    text(String(value), PX + 14, y + 28, "bold 24px Georgia, serif", PAPER, "left");
  });
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
  drawBoard();
  drawPanel();

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 800);
    R(p.x, p.y, p.size, p.size * 0.75, p.color);
  }
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 400));
    ctx.font = "bold 20px Georgia, serif";
    const tw = ctx.measureText(p.text).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.8)";
    roundRect(p.x - tw / 2 - 10, p.y - 22, tw + 20, 30, 8);
    text(p.text, p.x, p.y, "bold 20px Georgia, serif", PAPER);
  }
  ctx.globalAlpha = 1;

  if (state === "ready") overlay("Shelf Help", "Press Enter or tap to start", "Fill a whole shelf to clear it");
  if (state === "paused") overlay("Shh… paused", "Press P to keep shelving");
  if (state === "over") overlay("Shelves full!", "Press Enter or tap to try again", `Score: ${score} · Shelves: ${lines}`);
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
// Keyboard, touch buttons and taps all go through actionDown / actionUp.
function actionDown(a) {
  if (a in held) held[a] = true;
  if (state === "ready" || state === "over") return startGame();
  if (state !== "playing" || clearing) {
    if (a === "left" || a === "right") moveDir = a === "left" ? -1 : 1;
    return;
  }
  switch (a) {
    case "left":
    case "right":
      moveDir = a === "left" ? -1 : 1;
      dasTimer = arrTimer = 0;
      shift(moveDir);
      break;
    case "cw":
      rotate(1);
      break;
    case "ccw":
      rotate(-1);
      break;
    case "drop":
      hardDrop();
      break;
    case "hold":
      holdPiece();
      break;
  }
}

function actionUp(a) {
  if (a in held) held[a] = false;
  if (a === "left" || a === "right") {
    moveDir = held.left ? -1 : held.right ? 1 : 0;
    dasTimer = arrTimer = 0;
  }
}

const KEYS = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowDown: "down", KeyS: "down",
  ArrowUp: "cw", KeyX: "cw", KeyW: "cw",
  KeyZ: "ccw",
  Space: "drop",
  KeyC: "hold", ShiftLeft: "hold", ShiftRight: "hold",
};

function togglePause() {
  if (state === "playing") state = "paused";
  else if (state === "paused") state = "playing";
}

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyP" || e.code === "Escape") return togglePause();
  if (e.code === "KeyM") return toggleMute();
  if (e.code === "Enter" && (state === "ready" || state === "over")) return startGame();
  const a = KEYS[e.code];
  if (!a) return;
  e.preventDefault();
  if (!e.repeat) actionDown(a);
});
document.addEventListener("keyup", (e) => {
  const a = KEYS[e.code];
  if (a) actionUp(a);
});

// Tapping the game starts it, resumes it, or rotates the piece.
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (state === "paused") togglePause();
  else actionDown("cw");
});

// On-screen buttons (touch screens)
for (const btn of document.querySelectorAll(".controls button")) {
  const a = btn.dataset.action;
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    actionDown(a);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, () => actionUp(a));
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") state = "paused";
});

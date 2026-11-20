// Bookmobile Route: drive the library's Bookmobile through a town maze, bring
// each stop the item they asked for, then head back to the Library.
// All stops are made-up, cheerful places, not real locations.

// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 900,
  H = 600;

// ---------- Tunables ----------
const SPEED = 4.2; // Bookmobile speed in cells per second
const ROAMER_SPEED = { ducks: 1.3, truck: 2.3 };
const BUFFER_MS = 900; // a direction pressed early is remembered this long (about 4 blocks)
const SWIPE_BUFFER_MS = 1400;
const BUMP_MS = 900; // how long the Bookmobile stops after a bump
const SAFE_MS = 2000; // no second bump right after the first
const DELIVERY_POINTS = [100, 50, 25]; // right on the 1st, 2nd, 3rd+ try
const BOOKMARK_POINTS = 10;
const TIME_BONUS = 5; // points per second left on the clock
const FINISH_BONUS = 50;
// maze size (in blocks across × down) for each level; the last one repeats
const LEVELS = [[6, 4], [7, 4], [7, 5], [8, 5], [9, 5], [9, 6], [10, 6]];

// ---------- Palette ----------
const PAPER = "#f3ead7";
const GOLD = "#d4a64a";
const MAPLE = "#d7a35e";
const NAVY = "#34404f";
const RED = "#c92a2f",
  BLUE = "#3d4c8c",
  YELLOW = "#e8b52a";
const SPINES = ["#c92a2f", "#3d4c8c", "#e8b52a", "#2f7d84", "#6b3e75", "#e07b39", "#4f7942"];

// What patrons can ask for
const ITEMS = [
  { key: "book", label: "Book", article: "a", color: "#c92a2f" },
  { key: "dvd", label: "DVD", article: "a", color: "#3d4c8c" },
  { key: "magazine", label: "Magazine", article: "a", color: "#e07b39" },
  { key: "audiobook", label: "Audiobook", article: "an", color: "#6b3e75" },
];
const ITEM_BY_KEY = Object.fromEntries(ITEMS.map((it) => [it.key, it]));

// Made-up stops around town (not real places)
const STOP_NAMES = [
  "Sunny Park", "Maple Apartments", "Fire Station", "Duck Pond", "Grandma's Porch",
  "Little League Field", "Corner Market", "School Bus Stop", "Community Garden",
  "Bakery", "Swimming Pool", "Playground", "Farm Stand", "Treehouse Lane",
];
const STOP_COLORS = ["#c92a2f", "#3d4c8c", "#e8b52a", "#2f7d84", "#6b3e75", "#e07b39", "#4f7942"];
const SKIN = ["#f1c9a5", "#d9a679", "#a86b45", "#7a4a2e", "#e8b98f"];

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: "down", down: "up", left: "right", right: "left" };

// ---------- State ----------
let state = "ready"; // ready | playing | picker | paused | done
let pausedFrom = "playing";
let level = 1,
  score = 0,
  best = Number(safeGet("bookmobile-best")) || 0;
let grid, cols, rows, seed;
let blocked = new Set(); // road cells closed by traffic cones
let bookmarks = new Set();
let lib, stops, roamers, van;
let timeLeft = 0,
  timeLimit = 0;
let stats = { deliveries: 0, bookmarks: 0, time: 0, bumps: 0 };
let picker = null; // { stop, tries, msg }
let pickerButtons = [];
let popups = [],
  particles = [];
let heldDir = null;
let time = 0;

const key = (c, r) => c + "," + r;
const rand = (n) => (Math.random() * n) | 0;
const pick = (a) => a[rand(a.length)];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function hash(a, b, c) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- The town maze ----------
function isRoad(c, r) {
  return c >= 0 && r >= 0 && c < cols && r < rows && grid[r][c] === 1;
}
function passable(c, r) {
  return isRoad(c, r) && !blocked.has(key(c, r));
}

// Distance (in cells) from a start cell to every reachable cell; -1 = unreachable.
function bfs(sc, sr) {
  const dist = new Int16Array(cols * rows).fill(-1);
  const q = [[sc, sr]];
  dist[sr * cols + sc] = 0;
  for (let i = 0; i < q.length; i++) {
    const [c, r] = q[i];
    for (const [dx, dy] of Object.values(DIRS)) {
      const nc = c + dx,
        nr = r + dy;
      if (passable(nc, nr) && dist[nr * cols + nc] < 0) {
        dist[nr * cols + nc] = dist[r * cols + c] + 1;
        q.push([nc, nr]);
      }
    }
  }
  return dist;
}

function generateLevel(n) {
  const [a, b] = LEVELS[Math.min(n - 1, LEVELS.length - 1)];
  const [mw, mh] = portrait ? [b, a] : [a, b]; // tall maze on tall screens
  cols = mw * 2 + 1;
  rows = mh * 2 + 1;
  seed = rand(100000);
  grid = Array.from({ length: rows }, () => new Uint8Array(cols));

  // Carve a maze between junctions (cells at odd x, odd y)...
  const seen = new Set(["0,0"]);
  const stack = [[0, 0]];
  grid[1][1] = 1;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const next = Object.values(DIRS)
      .map(([dx, dy]) => [x + dx, y + dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < mw && ny < mh && !seen.has(nx + "," + ny));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = pick(next);
    grid[y + ny + 1][x + nx + 1] = 1; // the street between them
    grid[ny * 2 + 1][nx * 2 + 1] = 1;
    seen.add(nx + "," + ny);
    stack.push([nx, ny]);
  }
  // ...then open some extra streets so there's more than one way around.
  for (let r = 1; r < rows - 1; r++)
    for (let c = 1; c < cols - 1; c++) {
      const link = (r % 2 === 1 && c % 2 === 0) || (r % 2 === 0 && c % 2 === 1);
      if (link && !grid[r][c] && Math.random() < 0.22) grid[r][c] = 1;
    }

  blocked = new Set();
  lib = { c: 1, r: 1 };
  let fromLib = bfs(lib.c, lib.r);

  // Stops: junctions not too close to the Library or to each other
  const count = Math.min(3 + n - 1, 7);
  const junctions = [];
  for (let r = 1; r < rows; r += 2) for (let c = 1; c < cols; c += 2) if (fromLib[r * cols + c] >= 4) junctions.push({ c, r });
  shuffle(junctions);
  stops = [];
  for (let spacing = 3; stops.length < count && spacing >= 0; spacing--) {
    for (const j of junctions) {
      if (stops.length >= count) break;
      if (stops.some((s) => s.c === j.c && s.r === j.r)) continue;
      if (stops.every((s) => Math.abs(s.c - j.c) + Math.abs(s.r - j.r) >= spacing)) stops.push({ ...j });
    }
  }
  const names = shuffle([...STOP_NAMES]);
  const wants = shuffle([...ITEMS]);
  stops.forEach((s, i) => {
    s.name = names[i];
    s.color = STOP_COLORS[i % STOP_COLORS.length];
    s.skin = pick(SKIN);
    s.want = (i < wants.length ? wants[i] : pick(ITEMS)).key;
    s.done = false;
  });

  // Traffic cones close a few streets from level 2 on, but never cut off a stop.
  const special = [lib, ...stops];
  const near = (c, r) => special.some((s) => Math.abs(s.c - c) + Math.abs(s.r - r) <= 1);
  const links = [];
  for (let r = 1; r < rows - 1; r++)
    for (let c = 1; c < cols - 1; c++) if (grid[r][c] && (r % 2 === 0 || c % 2 === 0) && !near(c, r)) links.push({ c, r });
  shuffle(links);
  let cones = Math.min(n - 1, 4);
  for (const l of links) {
    if (!cones) break;
    blocked.add(key(l.c, l.r));
    const d = bfs(lib.c, lib.r);
    if (stops.every((s) => d[s.r * cols + s.c] >= 0)) cones--;
    else blocked.delete(key(l.c, l.r));
  }
  fromLib = bfs(lib.c, lib.r);

  // Bookmarks to collect on the streets
  bookmarks = new Set();
  const free = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (fromLib[r * cols + c] > 0 && !special.some((s) => s.c === c && s.r === r)) free.push(key(c, r));
  shuffle(free)
    .slice(0, 4 + n)
    .forEach((k) => bookmarks.add(k));

  // Friendly traffic: duck families and a slow truck
  const kinds = ["ducks", "truck", "ducks", "truck"].slice(0, Math.min(1 + Math.floor(n / 2), 4)); // 1 on level 1, up to 4
  const far = [];
  for (let r = 1; r < rows; r += 2) for (let c = 1; c < cols; c += 2) if (fromLib[r * cols + c] >= 6) far.push({ c, r });
  shuffle(far);
  roamers = kinds.map((type, i) => {
    const at = far[i % Math.max(1, far.length)] || { c: cols - 2, r: rows - 2 };
    const m = { type, c: at.c, r: at.r, tc: at.c, tr: at.r, t: 0, moving: false, dir: "left", facing: -1 };
    roamerChoose(m);
    return m;
  });

  van = { c: lib.c, r: lib.r, tc: lib.c, tr: lib.r, t: 0, moving: false, dir: "right", facing: 1, next: null, nextAge: 0, bump: 0, safe: 0 };

  // Closing time: about twice a sensible route, plus a little extra.
  let cur = lib,
    total = 0;
  const left = [...stops];
  while (left.length) {
    const d = bfs(cur.c, cur.r);
    left.sort((p, q) => d[p.r * cols + p.c] - d[q.r * cols + q.c]);
    total += d[left[0].r * cols + left[0].c];
    cur = left.shift();
  }
  total += bfs(cur.c, cur.r)[lib.r * cols + lib.c];
  timeLimit = Math.round((total / SPEED) * 2 + 20);
  timeLeft = timeLimit;
  stats = { deliveries: 0, bookmarks: 0, time: 0, bumps: 0 };
  popups = [];
  particles = [];
  picker = null;
  fitMap();
}

// ---------- Moving along the streets ----------
function startMove(e, dir) {
  const [dx, dy] = DIRS[dir];
  if (!passable(e.c + dx, e.r + dy)) return false;
  e.dir = dir;
  e.tc = e.c + dx;
  e.tr = e.r + dy;
  e.moving = true;
  if (dx) e.facing = dx;
  return true;
}

function steer(dir, buffer = BUFFER_MS) {
  if (state !== "playing") return;
  // turning around works instantly, even between junctions
  if (van.moving && dir === OPP[van.dir]) {
    [van.c, van.tc] = [van.tc, van.c];
    [van.r, van.tr] = [van.tr, van.r];
    van.t = 1 - van.t;
    van.dir = dir;
    if (DIRS[dir][0]) van.facing = DIRS[dir][0];
    van.next = null;
    return;
  }
  van.next = dir;
  van.nextAge = BUFFER_MS - buffer; // swipes are remembered a little longer
  if (!van.moving && van.bump <= 0 && startMove(van, dir)) van.next = null;
}

function updateVan(dt) {
  van.safe = Math.max(0, van.safe - dt);
  if (van.bump > 0) {
    van.bump -= dt;
    return;
  }
  if (van.next) {
    van.nextAge += dt;
    if (van.nextAge > BUFFER_MS) van.next = null;
  }
  if (!van.moving) {
    if (van.next && startMove(van, van.next)) van.next = null;
    else return;
  }
  van.t += (SPEED * dt) / 1000;
  while (van.moving && van.t >= 1) {
    van.t -= 1;
    van.c = van.tc;
    van.r = van.tr;
    if (arrive()) {
      van.moving = false;
      van.t = 0;
      break;
    }
    // turn if a direction was pressed early, otherwise keep going if the road does
    if (van.next && startMove(van, van.next)) van.next = null;
    else if (!startMove(van, van.dir)) {
      van.moving = false;
      van.t = 0;
    }
  }
}

// Things that happen when the Bookmobile reaches a cell. Returns true to stop there.
function arrive() {
  const k = key(van.c, van.r);
  if (bookmarks.has(k)) {
    bookmarks.delete(k);
    score += BOOKMARK_POINTS;
    stats.bookmarks += BOOKMARK_POINTS;
    popupAt(van.c, van.r, "+" + BOOKMARK_POINTS);
    sfx.bookmark();
  }
  const s = stops.find((s) => !s.done && s.c === van.c && s.r === van.r);
  if (s) {
    openPicker(s);
    return true;
  }
  if (van.c === lib.c && van.r === lib.r && stops.every((s) => s.done)) {
    finishLevel();
    return true;
  }
  return false;
}

function roamerChoose(m) {
  let opts = Object.keys(DIRS).filter((d) => d !== OPP[m.dir] && passable(m.c + DIRS[d][0], m.r + DIRS[d][1]));
  if (!opts.length) opts = [OPP[m.dir]];
  startMove(m, pick(opts));
}

function updateRoamers(dt) {
  for (const m of roamers) {
    if (!m.moving) roamerChoose(m);
    m.t += (ROAMER_SPEED[m.type] * dt) / 1000;
    if (m.t >= 1) {
      m.t -= 1;
      m.c = m.tc;
      m.r = m.tr;
      m.moving = false;
      roamerChoose(m);
    }
  }
}

function posOf(e) {
  return e.moving ? { x: e.c + (e.tc - e.c) * e.t, y: e.r + (e.tr - e.r) * e.t } : { x: e.c, y: e.r };
}

function checkBumps() {
  if (van.safe > 0) return;
  const v = posOf(van);
  for (const m of roamers) {
    const p = posOf(m);
    if (Math.hypot(p.x - v.x, p.y - v.y) < 0.65) {
      van.bump = BUMP_MS;
      van.safe = SAFE_MS;
      stats.bumps++;
      // the roamer turns around and wanders off
      if (m.moving) {
        [m.c, m.tc] = [m.tc, m.c];
        [m.r, m.tr] = [m.tr, m.r];
        m.t = 1 - m.t;
        m.dir = OPP[m.dir];
        if (DIRS[m.dir][0]) m.facing = DIRS[m.dir][0];
      }
      if (m.type === "ducks") {
        popupAt(v.x, v.y, "Quack! Ducks first!");
        sfx.quack();
      } else {
        popupAt(v.x, v.y, "Honk honk!");
        sfx.horn();
      }
      return;
    }
  }
}

// ---------- Deliveries ----------
function openPicker(s) {
  state = "picker";
  picker = { stop: s, tries: 0, msg: "" };
  sfx.arrive();
}

function choose(i) {
  if (state !== "picker" || !picker) return;
  const item = ITEMS[i];
  const s = picker.stop;
  if (item.key === s.want) {
    const pts = DELIVERY_POINTS[Math.min(picker.tries, DELIVERY_POINTS.length - 1)];
    score += pts;
    stats.deliveries += pts;
    s.done = true;
    popupAt(s.c, s.r, `Thank you! +${pts}`);
    confetti(s.c, s.r);
    sfx.deliver();
    picker = null;
    state = "playing";
    if (stops.every((st) => st.done)) {
      popupAt(lib.c, lib.r, "Back to the Library!");
      setTimeout(() => sfx.horn(), 500);
    }
  } else {
    picker.tries++;
    const want = ITEM_BY_KEY[s.want];
    picker.msg = `Oops, they asked for ${want.article} ${want.label}!`;
    sfx.oops();
  }
}

function finishLevel() {
  state = "done";
  stats.time = timeLeft > 0 ? Math.ceil(timeLeft) * TIME_BONUS : 0;
  score += stats.time + FINISH_BONUS;
  if (score > best) {
    best = score;
    safeSet("bookmobile-best", best);
  }
  sfx.done();
}

function startGame() {
  level = 1;
  score = 0;
  generateLevel(level);
  state = "playing";
  sfx.start();
}

function nextLevel() {
  level++;
  generateLevel(level);
  state = "playing";
  sfx.start();
}

// ---------- Update ----------
function update(dt) {
  time += dt;
  updateEffects(dt);
  if (state !== "playing") return;
  if (heldDir) steer(heldDir);
  timeLeft -= dt / 1000;
  updateVan(dt);
  if (state !== "playing") return; // a stop or the Library was reached
  updateRoamers(dt);
  checkBumps();
}

function updateEffects(dt) {
  for (const p of popups) {
    p.life -= dt;
    p.y -= dt * 0.025;
  }
  popups = popups.filter((p) => p.life > 0);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.0008 * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

function popupAt(c, r, textStr) {
  popups.push({ c, r, y: 0, text: textStr, life: 1300 });
}
function confetti(c, r) {
  const colors = [RED, BLUE, YELLOW, "#ffffff"];
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: ox + (c + 0.5) * cell, y: oy + (r + 0.5) * cell,
      vx: (Math.random() - 0.5) * 0.3, vy: -Math.random() * 0.3 - 0.05,
      life: 600 + Math.random() * 500, color: colors[i % 4],
    });
  }
}

// ---------- Sound (Web Audio API, no files needed) ----------
let audio = null;
let muted = safeGet("bookmobile-muted") === "1";

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
  horn: () => {
    tone(440, 440, 0.11, "square", 0.07);
    tone(554, 554, 0.16, "square", 0.07, 0.15);
  },
  quack: () => {
    tone(620, 380, 0.1, "sawtooth", 0.06);
    tone(620, 380, 0.1, "sawtooth", 0.06, 0.16);
  },
  bookmark: () => tone(1046, 1318, 0.08, "sine", 0.1),
  arrive: () => tone(660, 660, 0.07, "triangle", 0.1),
  deliver: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.12, "sine", 0.12, i * 0.07)),
  oops: () => tone(330, 260, 0.18, "triangle", 0.1),
  done: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.14, "triangle", 0.12, i * 0.1)),
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
  safeSet("bookmobile-muted", muted ? "1" : "0");
  updateMuteLabel();
  if (!muted) tone(660, 660, 0.08, "sine", 0.12);
}
updateMuteLabel();
if (muteBtn) muteBtn.addEventListener("click", toggleMute);

// ---------- Layout (wide screens vs. phones) ----------
let portrait = false;
let MAP, PANEL, cell = 40, ox = 0, oy = 0;

function layout() {
  portrait = window.innerWidth < 700;
  if (portrait) {
    W = 540;
    H = 900;
    MAP = { x: 10, y: 62, w: 520, h: 620 };
    PANEL = { x: 10, y: 692, w: 520, h: 198 };
  } else {
    W = 900;
    H = 600;
    MAP = { x: 10, y: 62, w: 630, h: 528 };
    PANEL = { x: 650, y: 62, w: 240, h: 528 };
  }
  canvas.width = W;
  canvas.height = H;
  canvas.style.maxWidth = W + "px";
  fitMap();
}

function fitMap() {
  if (!grid) return;
  cell = Math.floor(Math.min(MAP.w / cols, MAP.h / rows));
  ox = MAP.x + Math.floor((MAP.w - cell * cols) / 2);
  oy = MAP.y + Math.floor((MAP.h - cell * rows) / 2);
}

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
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fill();
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
function text(str, x, y, font, color, align = "center") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
}
function fitFont(str, maxW, size, weight = "bold", family = "Georgia, serif") {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 8 && ctx.measureText(str).width > maxW) ctx.font = `${weight} ${--s}px ${family}`;
  return ctx.font;
}
function box(b, fill = NAVY) {
  R(b.x, b.y, b.w, b.h, fill);
  ctx.strokeStyle = MAPLE;
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
}

// The four things patrons ask for, drawn so they're easy to tell apart.
function drawItem(k, cx, cy, s) {
  if (k === "book") {
    R(cx - s * 0.32, cy - s * 0.42, s * 0.64, s * 0.84, "#c92a2f");
    R(cx - s * 0.22, cy - s * 0.38, s * 0.5, s * 0.76, "#f6efdc");
    R(cx - s * 0.32, cy - s * 0.42, s * 0.56, s * 0.84, "#c92a2f");
    R(cx - s * 0.32, cy - s * 0.42, s * 0.1, s * 0.84, "#951e22");
    R(cx - s * 0.14, cy - s * 0.22, s * 0.32, s * 0.06, GOLD);
    R(cx - s * 0.14, cy + s * 0.18, s * 0.32, s * 0.06, GOLD);
  } else if (k === "dvd") {
    R(cx - s * 0.36, cy - s * 0.42, s * 0.6, s * 0.84, "#3d4c8c");
    circle(cx + s * 0.1, cy, s * 0.3, "#d9dde3");
    circle(cx + s * 0.1, cy, s * 0.24, "#b9c6d6");
    circle(cx + s * 0.1, cy, s * 0.07, "#3d4c8c");
    R(cx - s * 0.3, cy - s * 0.36, s * 0.1, s * 0.72, "#5466b0");
  } else if (k === "magazine") {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.12);
    R(-s * 0.32, -s * 0.42, s * 0.64, s * 0.84, "#ffffff");
    R(-s * 0.3, -s * 0.4, s * 0.6, s * 0.8, "#e07b39");
    R(-s * 0.26, -s * 0.36, s * 0.52, s * 0.14, "#ffffff");
    circle(0, s * 0.08, s * 0.18, "#f2c14e");
    R(-s * 0.22, s * 0.28, s * 0.44, s * 0.05, "#ffffff");
    ctx.restore();
  } else {
    // audiobook: a case with headphones over it
    R(cx - s * 0.3, cy - s * 0.2, s * 0.6, s * 0.62, "#6b3e75");
    R(cx - s * 0.22, cy - s * 0.12, s * 0.44, s * 0.08, GOLD);
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.06, s * 0.36, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    oval(cx - s * 0.36, cy - s * 0.02, s * 0.09, s * 0.14, "#2a2a2a");
    oval(cx + s * 0.36, cy - s * 0.02, s * 0.09, s * 0.14, "#2a2a2a");
  }
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
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
}

// ---------- Drawing: the town ----------
function drawTown() {
  R(MAP.x, MAP.y, MAP.w, MAP.h, "#7fb35f");
  const u = cell;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = ox + c * u,
        y = oy + r * u;
      if (isRoad(c, r)) {
        R(x, y, u, u, "#5c6068");
        const h = isRoad(c - 1, r) && isRoad(c + 1, r) && !isRoad(c, r - 1) && !isRoad(c, r + 1);
        const v = isRoad(c, r - 1) && isRoad(c, r + 1) && !isRoad(c - 1, r) && !isRoad(c + 1, r);
        if (h) {
          R(x + u * 0.12, y + u / 2 - 1, u * 0.3, 2, "#e8d27a");
          R(x + u * 0.58, y + u / 2 - 1, u * 0.3, 2, "#e8d27a");
        } else if (v) {
          R(x + u / 2 - 1, y + u * 0.12, 2, u * 0.3, "#e8d27a");
          R(x + u / 2 - 1, y + u * 0.58, 2, u * 0.3, "#e8d27a");
        }
      } else {
        R(x, y, u, u, "#d8d2c2"); // sidewalk
        R(x + 2, y + 2, u - 4, u - 4, "#86bd68");
        if (!(c === lib.c && r === lib.r - 1)) drawLot(c, r, x, y, u);
      }
    }
  drawLibrary();
  for (const k of blocked) {
    const [c, r] = k.split(",").map(Number);
    drawCones(ox + c * u, oy + r * u, u);
  }
  for (const k of bookmarks) {
    const [c, r] = k.split(",").map(Number);
    const bob = Math.sin(time * 0.005 + c + r) * u * 0.04;
    drawBookmark(ox + (c + 0.5) * u - u * 0.11, oy + (r + 0.3) * u + bob, u * 0.22, u * 0.38, pick3(c, r));
  }
  for (const s of stops) drawStop(s);
}
function pick3(c, r) {
  return [RED, BLUE, YELLOW][(c * 7 + r * 3) % 3];
}

// What's on each block: houses, trees, ponds and little parks.
function drawLot(c, r, x, y, u) {
  const h = hash(c, r, seed);
  if (h < 0.45) {
    const roof = ["#c92a2f", "#3d4c8c", "#e8b52a", "#2f7d84", "#6b3e75"][(hash(r, c, seed) * 5) | 0];
    R(x + u * 0.22, y + u * 0.42, u * 0.56, u * 0.42, "#f3ead7");
    poly(roof, x + u * 0.14, y + u * 0.45, x + u * 0.5, y + u * 0.14, x + u * 0.86, y + u * 0.45);
    R(x + u * 0.44, y + u * 0.62, u * 0.13, u * 0.22, "#7a4a2a");
    R(x + u * 0.27, y + u * 0.52, u * 0.11, u * 0.1, "#cfe6f2");
    R(x + u * 0.63, y + u * 0.52, u * 0.11, u * 0.1, "#cfe6f2");
  } else if (h < 0.75) {
    circle(x + u * 0.5, y + u * 0.56, u * 0.3, "#3f7a3a");
    circle(x + u * 0.42, y + u * 0.46, u * 0.18, "#5c9a4c");
  } else if (h < 0.92) {
    R(x + u * 0.25, y + u * 0.55, u * 0.5, u * 0.08, "#8a5a30"); // bench
    R(x + u * 0.28, y + u * 0.63, u * 0.05, u * 0.12, "#8a5a30");
    R(x + u * 0.67, y + u * 0.63, u * 0.05, u * 0.12, "#8a5a30");
    for (let i = 0; i < 4; i++) circle(x + u * (0.2 + i * 0.2), y + u * 0.3, u * 0.06, [RED, YELLOW, "#ffffff", "#e07b39"][i]);
  } else {
    oval(x + u / 2, y + u / 2, u * 0.36, u * 0.26, "#4f9fd6");
    oval(x + u * 0.42, y + u * 0.44, u * 0.12, u * 0.05, "#8fcbf2");
  }
}

function drawCones(x, y, u) {
  R(x + u * 0.12, y + u * 0.42, u * 0.76, u * 0.12, "#f2f2f2");
  for (let i = 0; i < 3; i++) R(x + u * (0.16 + i * 0.26), y + u * 0.42, u * 0.12, u * 0.12, "#e07b39");
  for (const cx of [0.25, 0.75]) {
    poly("#e8743a", x + u * (cx - 0.12), y + u * 0.86, x + u * cx, y + u * 0.5, x + u * (cx + 0.12), y + u * 0.86);
    R(x + u * (cx - 0.07), y + u * 0.68, u * 0.14, u * 0.05, "#ffffff");
  }
}

// The Library: a brick building just above the Bookmobile's parking spot.
function drawLibrary() {
  const u = cell;
  const x = ox + lib.c * u,
    y = oy + (lib.r - 1) * u;
  R(x - u * 0.45, y + u * 0.18, u * 1.9, u * 0.82, "#a8593a");
  R(x - u * 0.5, y + u * 0.1, u * 2, u * 0.14, "#3d6b5f");
  R(x + u * 0.38, y + u * 0.56, u * 0.24, u * 0.44, "#2b211d");
  for (const wx of [-0.3, 0.85]) R(x + u * wx, y + u * 0.4, u * 0.38, u * 0.26, "#cfe6f2");
  drawLogo(x + u * 0.5, y + u * 0.2, u * 0.26);
  // parking spot
  R(x + 2, y + u + 2, u - 4, u - 4, "rgba(215, 163, 94, 0.45)");
  if (state !== "ready" && stops.every((s) => s.done)) {
    // glowing ring: come back here!
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(232, 181, 42, ${0.5 + 0.5 * Math.sin(time * 0.008)})`;
    ctx.beginPath();
    ctx.arc(x + u / 2, y + u * 1.5, u * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawStop(s) {
  const u = cell;
  const x = ox + s.c * u,
    y = oy + s.r * u;
  ctx.globalAlpha = 0.45;
  circle(x + u / 2, y + u / 2, u * 0.42, s.color);
  ctx.globalAlpha = 1;
  // sign post
  R(x + u * 0.14, y + u * 0.2, u * 0.05, u * 0.6, "#8a8f96");
  circle(x + u * 0.165, y + u * 0.22, u * 0.11, s.color);
  // the patron waiting
  circle(x + u * 0.7, y + u * 0.38, u * 0.1, s.skin);
  R(x + u * 0.62, y + u * 0.48, u * 0.16, u * 0.26, s.color);
  R(x + u * 0.63, y + u * 0.74, u * 0.05, u * 0.12, "#333");
  R(x + u * 0.72, y + u * 0.74, u * 0.05, u * 0.12, "#333");
}

// Speech bubbles go on top of everything on the map.
function drawBubbles() {
  const u = cell;
  for (const s of stops) {
    const cx = ox + (s.c + 0.5) * u,
      top = oy + s.r * u;
    if (s.done) {
      circle(cx, top - u * 0.05, u * 0.24, "#2f9e44");
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(2, u * 0.07);
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.11, top - u * 0.05);
      ctx.lineTo(cx - u * 0.02, top + u * 0.05);
      ctx.lineTo(cx + u * 0.13, top - u * 0.15);
      ctx.stroke();
      continue;
    }
    const item = ITEM_BY_KEY[s.want];
    const fs = Math.max(9, Math.round(u * 0.26));
    ctx.font = `bold ${fs}px system-ui, sans-serif`;
    const iconS = Math.max(16, u * 0.5);
    const bw = iconS + ctx.measureText(item.label).width + 14,
      bh = iconS + 6;
    let bx = cx - bw / 2;
    bx = Math.max(MAP.x + 2, Math.min(MAP.x + MAP.w - bw - 2, bx));
    const by = Math.max(MAP.y + 2, top - bh + u * 0.05);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    roundRect(bx + 1, by + 2, bw, bh, 6);
    ctx.fillStyle = "#ffffff";
    roundRect(bx, by, bw, bh, 6);
    poly("#ffffff", cx - 5, by + bh - 1, cx + 5, by + bh - 1, cx, by + bh + 6);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    drawItem(item.key, bx + 4 + iconS / 2, by + bh / 2, iconS * 0.9);
    text(item.label, bx + iconS + 8, by + bh / 2 + fs * 0.35, `bold ${fs}px system-ui, sans-serif`, "#2a1d12", "left");
  }
}

// The Bookmobile, seen from the side so it's easy to recognize.
function drawVan() {
  const u = cell;
  const p = posOf(van);
  const px = ox + (p.x + 0.5) * u;
  const bounce = van.moving ? Math.sin(time * 0.03) * u * 0.02 : 0;
  const shake = van.bump > 0 ? Math.sin(time * 0.08) * u * 0.04 : 0;
  const py = oy + (p.y + 0.5) * u + bounce;
  const f = van.facing;
  const w = u * 1.25,
    h = u * 0.66;
  const x0 = px - w / 2 + shake,
    y0 = py - h / 2 - u * 0.06;
  oval(px, py + h * 0.55, w * 0.5, u * 0.08, "rgba(0, 0, 0, 0.25)");
  ctx.save();
  ctx.translate(px, 0);
  ctx.scale(f, 1);
  ctx.translate(-px, 0);
  ctx.fillStyle = "#f6efdc";
  roundRect(x0, y0, w, h, u * 0.12);
  R(x0 + w * 0.8, y0 + h * 0.12, w * 0.15, h * 0.38, "#9fd0ea"); // windshield
  R(x0, y0 + h * 0.6, w, h * 0.04, RED);
  R(x0, y0 + h * 0.64, w, h * 0.16, "#2f7d84");
  // side windows full of books
  for (const i of [0, 2]) {
    const wx = x0 + w * 0.06 + i * w * 0.22,
      wy = y0 + h * 0.12,
      ww = w * 0.19,
      wh = h * 0.38;
    R(wx, wy, ww, wh, "#2a1d14");
    const sw = (ww - 2) / 4;
    for (let k = 0; k < 4; k++) R(wx + 1 + k * sw, wy + wh * (0.2 + (k % 2) * 0.12), sw - 0.8, wh * (0.78 - (k % 2) * 0.12), SPINES[(i * 4 + k) % SPINES.length]);
  }
  circle(x0 + w * 0.97, y0 + h * 0.7, u * 0.04, "#ffe08a"); // headlight
  for (const wx of [0.22, 0.78]) {
    circle(x0 + w * wx, y0 + h, u * 0.13, "#222");
    circle(x0 + w * wx, y0 + h, u * 0.05, "#aab0b6");
  }
  ctx.restore();
  drawLogo(px + f * -w * 0.125 + shake, y0 + h * 0.1, h * 0.3);
}

function drawRoamer(m) {
  const u = cell;
  const p = posOf(m);
  const px = ox + (p.x + 0.5) * u,
    py = oy + (p.y + 0.5) * u;
  const f = m.facing;
  if (m.type === "ducks") {
    const waddle = Math.sin(time * 0.02) * u * 0.03;
    for (const [dx, sz, col] of [[0, 1, "#f4f4f0"], [-0.34, 0.6, "#f2c14e"], [-0.58, 0.6, "#f2c14e"]]) {
      const x = px + f * dx * u,
        y = py + u * 0.08 + (dx ? waddle : -waddle);
      oval(x, y, u * 0.2 * sz, u * 0.13 * sz, col);
      circle(x + f * u * 0.16 * sz, y - u * 0.13 * sz, u * 0.09 * sz, col);
      poly("#e8743a", x + f * u * 0.23 * sz, y - u * 0.15 * sz, x + f * u * 0.33 * sz, y - u * 0.12 * sz, x + f * u * 0.23 * sz, y - u * 0.09 * sz);
      circle(x + f * u * 0.18 * sz, y - u * 0.15 * sz, u * 0.018, "#222");
    }
  } else {
    const w = u * 1.15,
      h = u * 0.6;
    const x0 = px - w / 2,
      y0 = py - h / 2 - u * 0.05;
    ctx.save();
    ctx.translate(px, 0);
    ctx.scale(f, 1);
    ctx.translate(-px, 0);
    R(x0, y0, w * 0.7, h * 0.85, "#6a9a58"); // container
    for (let i = 1; i < 5; i++) R(x0 + i * w * 0.14, y0 + 2, 1.5, h * 0.8, "#557f46");
    ctx.fillStyle = "#4f7942";
    roundRect(x0 + w * 0.72, y0 + h * 0.2, w * 0.28, h * 0.65, u * 0.06);
    R(x0 + w * 0.8, y0 + h * 0.28, w * 0.16, h * 0.22, "#9fd0ea");
    for (const wx of [0.18, 0.55, 0.86]) {
      circle(x0 + w * wx, y0 + h * 0.9, u * 0.11, "#222");
      circle(x0 + w * wx, y0 + h * 0.9, u * 0.04, "#aab0b6");
    }
    ctx.restore();
  }
}

// ---------- Drawing: the top sign and the side panel ----------
function drawTopBar() {
  R(0, 0, W, 54, MAPLE);
  R(0, 50, W, 4, "#b07636");
  drawLogo(30, 9, 26);
  text("Bookmobile Route", 54, 36, "bold 26px Georgia, serif", "#f4efe6", "left");
  if (state !== "ready") text(`Level ${level}`, W - 18, 35, "bold 20px Georgia, serif", "#3a2512", "right");
}

function clockText() {
  if (timeLeft <= 0) return "After hours";
  const s = Math.ceil(timeLeft);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function drawPanel() {
  const P = PANEL;
  box(P);
  const lab = "bold 12px system-ui, sans-serif";
  const val = "bold 22px Georgia, serif";
  const rowsData = [
    ["SCORE", String(score)],
    ["BEST", String(Math.max(best, score))],
    ["CLOSING TIME", state === "ready" ? "--:--" : clockText()],
  ];
  const colW = portrait ? 190 : P.w;
  rowsData.forEach(([l, v], i) => {
    const y = P.y + 22 + i * (portrait ? 50 : 52);
    text(l, P.x + 14, y, lab, GOLD, "left");
    text(v, P.x + 14, y + 26, val, l === "CLOSING TIME" && timeLeft < 15 && state !== "ready" ? "#ffb48a" : PAPER, "left");
  });
  // clock bar
  const by = P.y + (portrait ? 154 : 160);
  R(P.x + 14, by, colW - 28, 6, "rgba(243,234,215,0.2)");
  if (timeLimit) R(P.x + 14, by, (colW - 28) * Math.max(0, timeLeft / timeLimit), 6, timeLeft < 15 ? "#e07b39" : "#7fc4e8");

  // stops list
  const lx = portrait ? P.x + 200 : P.x + 14;
  let ly = portrait ? P.y + 22 : P.y + 196;
  const rowH = portrait ? 24 : 34;
  text("STOPS", lx, ly, lab, GOLD, "left");
  ly += portrait ? 8 : 12;
  const listW = (portrait ? P.x + P.w - 12 : P.x + P.w - 14) - lx;
  for (const s of stops || []) {
    if (state === "ready") break;
    const cy = ly + rowH / 2;
    circle(lx + 6, cy, 5, s.color);
    drawItem(s.want, lx + 24, cy, rowH * 0.62);
    ctx.globalAlpha = s.done ? 0.55 : 1;
    text(s.name, lx + 40, cy + 5, fitFont(s.name, listW - 64, portrait ? 14 : 15), PAPER, "left");
    ctx.globalAlpha = 1;
    if (s.done) text("✓", lx + listW, cy + 6, "bold 18px system-ui, sans-serif", "#8fe08a", "right");
    ly += rowH;
  }
  if (!portrait && state !== "ready") {
    const msg = stops.every((s) => s.done) ? "All delivered! Drive back to the Library." : "Drive to each stop and bring what they asked for.";
    wrapText(msg, P.x + 14, Math.max(ly + 22, P.y + P.h - 60), P.w - 28, 18, "italic 14px Georgia, serif", stops.every((s) => s.done) ? GOLD : PAPER);
  }
}

function wrapText(str, x, y, maxW, lineH, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  let line = "";
  for (const word of str.split(" ")) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lineH;
      line = word;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

// ---------- Drawing: the delivery picker ----------
function drawPicker() {
  const s = picker.stop;
  R(MAP.x, MAP.y, MAP.w, MAP.h, "rgba(20, 14, 10, 0.55)");
  const pw = portrait ? 500 : 580,
    ph = portrait ? 400 : 280;
  const px = W / 2 - pw / 2,
    py = portrait ? 150 : H / 2 - ph / 2 + 10;
  ctx.fillStyle = "rgba(26, 18, 12, 0.95)";
  roundRect(px, py, pw, ph, 14);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(`Delivery for ${s.name}!`, W / 2, py + 40, fitFont(`Delivery for ${s.name}!`, pw - 40, 26), PAPER);
  text(picker.msg || "What did they ask for?", W / 2, py + 70, fitFont(picker.msg || "What did they ask for?", pw - 40, 18, "italic"), picker.msg ? "#ffb4a8" : GOLD);

  pickerButtons = [];
  const colsN = portrait ? 2 : 4;
  const gap = 12;
  const bw = (pw - 40 - gap * (colsN - 1)) / colsN,
    bh = portrait ? 140 : 170;
  ITEMS.forEach((item, i) => {
    const bx = px + 20 + (i % colsN) * (bw + gap),
      by = py + 92 + Math.floor(i / colsN) * (bh + gap);
    ctx.fillStyle = PAPER;
    roundRect(bx, by, bw, bh, 10);
    R(bx + 8, by, bw - 16, 5, item.color);
    drawItem(item.key, bx + bw / 2, by + bh * 0.42, Math.min(bw, bh) * 0.5);
    text(item.label, bx + bw / 2, by + bh - 26, fitFont(item.label, bw - 12, 18), "#2a1d12");
    text(`press ${i + 1}`, bx + bw / 2, by + bh - 8, "11px system-ui, sans-serif", "#7a6a55");
    pickerButtons.push({ x: bx, y: by, w: bw, h: bh, i });
  });
}

function overlay(title, sub, extra) {
  ctx.fillStyle = "rgba(26, 18, 12, 0.45)";
  ctx.fillRect(0, 0, W, H);
  const widths = [["bold 34px Georgia, serif", title], ["18px Georgia, serif", sub], ["15px Georgia, serif", extra || ""]].map(
    ([font, t]) => ((ctx.font = font), ctx.measureText(t).width)
  );
  const pw = Math.min(W - 24, Math.max(...widths) + 56),
    ph = (extra ? 112 : 88) + 50;
  ctx.fillStyle = "rgba(26, 18, 12, 0.92)";
  roundRect(W / 2 - pw / 2, H / 2 - 104, pw, ph, 12);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawLogo(W / 2, H / 2 - 96, 30);
  text(title, W / 2, H / 2 - 14, "bold 34px Georgia, serif", PAPER);
  text(sub, W / 2, H / 2 + 18, fitFont(sub, pw - 24, 18, "normal"), GOLD);
  if (extra) text(extra, W / 2, H / 2 + 44, fitFont(extra, pw - 24, 15, "normal"), PAPER);
}

function draw() {
  R(0, 0, W, H, "#2e2219");
  drawTopBar();
  if (grid) {
    drawTown();
    for (const m of roamers) drawRoamer(m);
    drawVan();
    drawBubbles();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 800);
      R(p.x, p.y, 5, 4, p.color);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) {
      const x = ox + (p.c + 0.5) * cell,
        y = oy + p.r * cell - 10 + p.y;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 400));
      ctx.font = "bold 16px Georgia, serif";
      const tw = ctx.measureText(p.text).width;
      const cx = Math.max(MAP.x + tw / 2 + 12, Math.min(MAP.x + MAP.w - tw / 2 - 12, x));
      ctx.fillStyle = "rgba(20, 14, 10, 0.85)";
      roundRect(cx - tw / 2 - 10, y - 20, tw + 20, 28, 8);
      text(p.text, cx, y, "bold 16px Georgia, serif", PAPER);
    }
    ctx.globalAlpha = 1;
  } else {
    R(MAP.x, MAP.y, MAP.w, MAP.h, "#7fb35f");
  }
  drawPanel();

  if (state === "picker" && picker) drawPicker();
  if (state === "ready") overlay("Bookmobile Route", "Press Enter or tap to start your route", "Bring each stop what they asked for, then head back to the Library!");
  if (state === "paused") overlay("Paused", "Press P or tap to keep driving");
  if (state === "done")
    overlay(`Level ${level} route complete!`, `Press Enter or tap for Level ${level + 1}`, `Deliveries +${stats.deliveries} · Bookmarks +${stats.bookmarks} · Time bonus +${stats.time} · Finish +${FINISH_BONUS}`);
}

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- Input ----------
function togglePause() {
  if (state === "playing" || state === "picker") {
    pausedFrom = state;
    state = "paused";
  } else if (state === "paused") state = pausedFrom;
}

function primary() {
  if (state === "ready") startGame();
  else if (state === "done") nextLevel();
  else if (state === "paused") togglePause();
}

const KEY_DIRS = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };

document.addEventListener("keydown", (e) => {
  const d = KEY_DIRS[e.code];
  if (d) {
    e.preventDefault();
    heldDir = d;
    if (state === "playing") steer(d);
    return;
  }
  if (e.code === "KeyM") return toggleMute();
  if (e.code === "KeyP" || e.code === "Escape") return togglePause();
  if (e.code === "KeyH") return sfx.horn();
  if (/^Digit[1-4]$/.test(e.code) || /^Numpad[1-4]$/.test(e.code)) return choose(Number(e.code.slice(-1)) - 1);
  if (e.code === "Enter" || e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) primary();
  }
});
document.addEventListener("keyup", (e) => {
  if (KEY_DIRS[e.code] === heldDir) heldDir = null;
});

function toCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
}

// Swipe on the game to steer; tap to start, pick an item, or honk.
let swipe = null;
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  swipe = { ...toCanvas(e), done: false };
});
canvas.addEventListener("pointermove", (e) => {
  if (!swipe || swipe.done || state !== "playing") return;
  const p = toCanvas(e);
  const dx = p.x - swipe.x,
    dy = p.y - swipe.y;
  if (Math.hypot(dx, dy) > 24) {
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up", SWIPE_BUFFER_MS);
    swipe.done = true;
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const s = swipe;
  swipe = null;
  if (s.done) return;
  const p = toCanvas(e);
  if (state === "picker") {
    const b = pickerButtons.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    if (b) choose(b.i);
    return;
  }
  if (state === "playing") {
    const v = posOf(van);
    if (Math.hypot(p.x - (ox + (v.x + 0.5) * cell), p.y - (oy + (v.y + 0.5) * cell)) < cell) sfx.horn(); // tap the van to honk
    return;
  }
  primary();
});
canvas.addEventListener("pointercancel", () => (swipe = null));

// On-screen steering pad (touch screens)
for (const btn of document.querySelectorAll(".controls button")) {
  const d = btn.dataset.dir;
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === "ready" || state === "done") return primary();
    heldDir = d;
    steer(d);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"])
    btn.addEventListener(ev, () => {
      if (heldDir === d) heldDir = null;
    });
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && (state === "playing" || state === "picker")) togglePause();
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if ((window.innerWidth < 700) !== portrait) layout();
  }, 150);
});

// ---------- Storage (guarded: can throw in private mode) ----------
function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

// ---------- Go ----------
layout();
generateLevel(1); // a town to show behind the start screen
requestAnimationFrame(frame);

// Seed Library Garden: pick free seed packets at the library's Seed Library,
// then plant, water and weed a garden through one summer season.
// Calm on purpose: nothing dies. Thirsty plants wilt and perk back up with water.

// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 860,
  H = 560,
  portrait = false,
  L;

// ---------- Tunables ----------
const SEASON_DAYS = 16;
const DAILY_LIMIT = 10; // packets per family per day (the real Seed Library rule)
const PER_KIND = 2; // at most two packets of each kind per day (also the real rule)
const PLOT_COUNT = 10;
const MAX_WATER = 3;
const MAX_WEEDS = 3;
const WEED_CHANCE = 0.22; // chance a planted spot sprouts a weed each night
const POINTS = { okraPod: 10, melon: 40, bloomDay: 3, visit: 5, caterpillar: 5, page: 10 };

// ---------- Palette ----------
const LEAF = "#3f8f3a";
const LEAF_LIGHT = "#5aae4a";
const SOIL = "#5a3d26";

// ---------- Seeds (the varieties the Seed Library offers) ----------
const SEEDS = {
  okra: { name: "Okra", color: "#7fae5a", mature: 7, food: true, height: 80,
    tip: "Plant ½ to 1 inch deep once the soil is warm.",
    fact: "Okra loves hot summer weather. Its flowers look like hibiscus flowers, and the pods grow fast, so pick them while they're small!" },
  watermelon: { name: "Watermelon", color: "#e05a5a", mature: 11, food: true, height: 30,
    tip: "Plant 1 inch deep and give the vines lots of room to spread.",
    fact: "Watermelon vines love heat and sunshine. Bees carry pollen between the flowers so the melons can grow." },
  sunflower: { name: "Sunflower", color: "#f2c14e", mature: 9, height: 105,
    tip: "Plant 1 inch deep in the sunniest spot you have.",
    fact: "Young sunflowers turn to follow the sun across the sky. When the big flower ripens, birds come to eat the seeds." },
  zinnia: { name: "Zinnia", color: "#e8743a", mature: 6, height: 55,
    tip: "Plant just ¼ inch deep. Sprouts pop up in about a week.",
    fact: "Zinnias bloom in bright colors all summer long, and butterflies love to land on their flat flowers." },
  milkweed: { name: "Milkweed", color: "#b67bb5", mature: 8, height: 70,
    tip: "Plant ¼ inch deep in a sunny spot.",
    fact: "Milkweed is the only plant monarch caterpillars can eat. Planting it helps monarch butterflies!" },
  beebalm: { name: "Bee Balm", color: "#c94f7c", mature: 7, height: 60,
    tip: "Barely cover the tiny seeds. They need light to sprout.",
    fact: "Bee balm's tube-shaped flowers are full of nectar for bees, butterflies and hummingbirds." },
};
const SEED_KEYS = Object.keys(SEEDS);

// ---------- Garden visitors ----------
const VISITORS = {
  bee: { name: "Bumblebee", fact: "Bumblebees carry pollen from flower to flower, which helps plants make fruit and seeds." },
  monarch: { name: "Monarch butterfly", fact: "Monarchs lay their eggs only on milkweed. Many fly thousands of miles to Mexico for the winter!" },
  caterpillar: { name: "Monarch caterpillar", fact: "Monarch caterpillars munch milkweed for about two weeks. Then each one turns into a chrysalis." },
  swallowtail: { name: "Tiger swallowtail", fact: "The Eastern tiger swallowtail is South Carolina's state butterfly. It loves to sip from zinnias." },
  hummingbird: { name: "Hummingbird", fact: "Ruby-throated hummingbirds can hover in place and even fly backwards while they sip nectar." },
  goldfinch: { name: "Goldfinch", fact: "American goldfinches eat seeds. They love to snack on ripe sunflower heads." },
};
const JOURNAL = {
  seedlib: { name: "The Seed Library", fact: "Seeds from the Seed Library are yours to keep, and every packet comes with planting instructions." },
};
for (const k of SEED_KEYS) JOURNAL[k] = SEEDS[k];
for (const k of Object.keys(VISITORS)) JOURNAL[k] = VISITORS[k];
const JOURNAL_ORDER = ["seedlib", ...SEED_KEYS, "bee", "monarch", "caterpillar", "swallowtail", "hummingbird", "goldfinch"];
const PAGE_SIZE = 6;

// ---------- State ----------
let state = "ready"; // ready | pick | garden | over
let paused = false,
  journalOpen = false,
  journalPage = 0;
let day, weather, plots, bag, selected, takenToday, takenTotal, stats, score;
let visitors = [],
  popups = [],
  particles = [],
  banner = null;
let message = { title: "", text: "" };
let time = 0;
let best = Number(safeGet("garden-best")) || 0;
let journal = new Set(loadJournal());
let targets = [],
  focusId = null,
  keyboardUsed = false;

function loadJournal() {
  try {
    const j = JSON.parse(safeGet("garden-journal") || "[]");
    return Array.isArray(j) ? j.filter((k) => JOURNAL[k]) : [];
  } catch {
    return [];
  }
}

function emptyPlot() {
  return { seed: null, age: 0, water: 0, weeds: 0, wilted: false, pods: 0, caterpillars: 0 };
}

function newSeason() {
  day = 1;
  weather = "sunny";
  plots = Array.from({ length: PLOT_COUNT }, emptyPlot);
  bag = [];
  selected = 0;
  takenToday = {};
  takenTotal = 0;
  stats = { okra: 0, melons: 0, bloomDays: 0, visits: {}, caterpillars: 0, pages: 0 };
  score = 0;
  visitors = [];
  popups = [];
  particles = [];
  state = "pick";
  say("Welcome to the Seed Library!", `Pick up to ${DAILY_LIMIT} free seed packets to plant. They're yours to keep!`);
  sfx.start();
}

function say(title, text) {
  message = { title, text };
}

// ---------- Rules ----------
function stageOf(p) {
  if (!p.seed) return -1;
  return Math.min(4, Math.floor((p.age / SEEDS[p.seed].mature) * 4));
}
function isBlooming(p) {
  // flowers open at full size; okra and watermelon flower as they near harvest
  if (!p.seed || p.wilted) return false;
  return SEEDS[p.seed].food ? stageOf(p) >= 3 : stageOf(p) === 4;
}
function canHarvest(p) {
  if (!p.seed) return false;
  if (p.seed === "okra") return p.pods > 0;
  if (p.seed === "watermelon") return stageOf(p) === 4;
  return false;
}
function seedsRipe(p) {
  return p.seed === "sunflower" && p.age >= SEEDS.sunflower.mature + 3;
}

function unlock(key) {
  if (journal.has(key)) return false;
  journal.add(key);
  safeSet("garden-journal", JSON.stringify([...journal]));
  stats.pages++;
  score += POINTS.page;
  popups.push({ text: "New journal page!", x: W / 2, y: H * 0.22, life: 1600, big: true });
  setTimeout(() => sfx.page(), 200);
  return true;
}

// Seed Library counter
function takePacket(kind) {
  if (takenTotal >= DAILY_LIMIT) {
    sfx.limit();
    return say("That's today's limit", `Each family can take ${DAILY_LIMIT} packets a day, so there are seeds for everyone. Come back tomorrow for more!`);
  }
  if ((takenToday[kind] || 0) >= PER_KIND) {
    sfx.limit();
    return say("Two of each, please", `Only ${PER_KIND} packets of each kind per family each day, so other gardeners get some too. Try a different seed!`);
  }
  bag.push(kind);
  takenToday[kind] = (takenToday[kind] || 0) + 1;
  takenTotal++;
  sfx.pick();
  say(SEEDS[kind].name, SEEDS[kind].fact + " Packet tip: " + SEEDS[kind].tip);
  unlock("seedlib");
}

function returnPacket(i) {
  const kind = bag[i];
  if (!kind) return;
  bag.splice(i, 1);
  if (takenToday[kind] > 0) {
    takenToday[kind]--;
    takenTotal--;
  }
  selected = Math.min(selected, Math.max(0, bag.length - 1));
  sfx.putBack();
  say("Packet returned", `You put the ${SEEDS[kind].name} packet back in the drawer.`);
}

function goGarden() {
  if (!bag.length && !plots.some((p) => p.seed)) {
    sfx.limit();
    return say("Pick some seeds first", "Tap a drawer to take a seed packet, then head out to the garden.");
  }
  state = "garden";
  selected = Math.min(selected, Math.max(0, bag.length - 1));
  focusId = null;
  if (!plots.some((p) => p.seed)) say("Time to plant!", "Choose a packet from your seed bag, then tap an empty spot in the garden beds to plant it.");
  else say("Back in the garden", "Your plants are waiting. Water, weed and watch for visitors!");
}

// Garden actions
function tapPlot(i) {
  const p = plots[i];
  const r = plotRect(i);
  if (!p.seed) return plantAt(i);
  const name = SEEDS[p.seed].name;
  if (p.weeds > 0) {
    p.weeds--;
    sfx.weed();
    burst(r.x + r.w / 2, r.y + r.h - 30, 6, "#6aa84f");
    return say("Pulled a weed!", "Weeds take water and sunshine from your plants. Plants with 2 or more weeds stop growing.");
  }
  if (canHarvest(p)) return harvest(i);
  if (p.water < MAX_WATER) {
    const perked = p.wilted;
    p.water = MAX_WATER;
    p.wilted = false;
    sfx.water();
    for (let k = 0; k < 8; k++)
      particles.push({ x: r.x + r.w / 2 + (Math.random() - 0.5) * 30, y: r.y + r.h * 0.35, vx: (Math.random() - 0.5) * 0.05, vy: 0.12 + Math.random() * 0.1, life: 500, color: "#7cc3f0", size: 4 });
    return say(perked ? `The ${name} perked right up!` : `Watered the ${name}`, perked ? "Wilted plants recover when you water them." : "Plants need water every day to keep growing. Hot days dry the soil faster.");
  }
  const st = stageOf(p);
  const words = ["Just planted", "Sprouting", "Growing", "Almost there", SEEDS[p.seed].food ? "Fruiting" : "Blooming!"];
  say(`${name}: ${words[st]}`, SEEDS[p.seed].fact);
}

function plantAt(i) {
  if (!bag.length) {
    sfx.limit();
    return say("Your seed bag is empty", "Visit the Seed Library for more packets. You can take up to 10 each day.");
  }
  selected = Math.min(selected, bag.length - 1);
  const kind = bag[selected];
  bag.splice(selected, 1);
  selected = Math.min(selected, Math.max(0, bag.length - 1));
  plots[i] = { ...emptyPlot(), seed: kind, water: MAX_WATER };
  sfx.plant();
  const r = plotRect(i);
  burst(r.x + r.w / 2, r.y + r.h - 30, 6, "#8a5a36");
  say(`Planted ${SEEDS[kind].name}`, "Packet tip: " + SEEDS[kind].tip);
  unlock(kind);
}

function harvest(i) {
  const p = plots[i];
  const r = plotRect(i);
  if (p.seed === "okra") {
    const n = p.pods;
    p.pods = 0;
    stats.okra += n;
    score += n * POINTS.okraPod;
    popups.push({ text: "+" + n * POINTS.okraPod, x: r.x + r.w / 2, y: r.y + 30, life: 1000 });
    say(`Picked ${n} okra pod${n > 1 ? "s" : ""}!`, "Okra keeps making new pods when you pick them often.");
  } else {
    stats.melons++;
    score += POINTS.melon;
    plots[i] = emptyPlot();
    popups.push({ text: "+" + POINTS.melon, x: r.x + r.w / 2, y: r.y + 30, life: 1000 });
    say("What a watermelon!", "This spot is ready for new seeds if you have any packets left.");
  }
  sfx.harvest();
  burst(r.x + r.w / 2, r.y + r.h * 0.5, 14, "#ffd166");
}

function rollWeather() {
  const r = Math.random();
  return r < 0.2 ? "rain" : r < 0.45 ? "hot" : "sunny";
}

function nextDay() {
  if (day >= SEASON_DAYS) return endSeason();
  // Yesterday's care decides growth: plants grow if they had water and few weeds.
  for (const p of plots) if (p.seed && p.water > 0 && p.weeds < 2) p.age++;

  day++;
  weather = rollWeather();
  takenToday = {};
  takenTotal = 0;

  let blooms = 0;
  for (const p of plots) {
    if (!p.seed) continue;
    p.water = weather === "rain" ? MAX_WATER : Math.max(0, p.water - (weather === "hot" ? 2 : 1));
    p.wilted = p.water === 0;
    if (Math.random() < WEED_CHANCE) p.weeds = Math.min(MAX_WEEDS, p.weeds + 1);
    const s = SEEDS[p.seed];
    if (p.seed === "okra" && p.age >= s.mature && !p.wilted && (p.age - s.mature) % 2 === 0) p.pods = Math.min(3, p.pods + 1);
    if (!s.food && isBlooming(p)) blooms++;
  }
  stats.bloomDays += blooms;
  score += blooms * POINTS.bloomDay;
  spawnVisitors();

  const label = { sunny: "Sunny", hot: "Hot", rain: "Rainy" }[weather];
  banner = { text: `Day ${day} · ${label}`, life: 1600 };
  const tips = {
    sunny: ["A sunny day", "A great day for growing. Check which plants need water."],
    hot: ["A hot day!", "Plants get thirsty twice as fast today. Water the wilting ones."],
    rain: ["A rainy day", "The rain watered every plant for you. Nice!"],
  };
  say(...tips[weather]);
  if (day === SEASON_DAYS) message.text += " It's the last day of the season!";
  sfx.newDay();
}

function addVisit(type, plot) {
  stats.visits[type] = (stats.visits[type] || 0) + 1;
  score += POINTS.visit;
  visitors.push({ type, plot, phase: Math.random() * Math.PI * 2, speed: 0.7 + Math.random() * 0.6 });
  unlock(type);
}

function spawnVisitors() {
  visitors = [];
  const living = plots.map((p, i) => ({ p, i })).filter((o) => o.p.seed && !o.p.wilted);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const of = (kind, test) => living.filter((o) => o.p.seed === kind && test(o.p));

  const flowering = living.filter((o) => isBlooming(o.p));
  if (flowering.length) {
    const bees = Math.min(3, 1 + Math.floor(flowering.length / 3));
    for (let k = 0; k < bees; k++) addVisit("bee", pick(flowering).i);
  }
  const balm = of("beebalm", isBlooming);
  if (balm.length && Math.random() < 0.6) addVisit("hummingbird", pick(balm).i);
  const zin = of("zinnia", isBlooming);
  if (zin.length && Math.random() < 0.6) addVisit("swallowtail", pick(zin).i);
  const milk = of("milkweed", (p) => stageOf(p) >= 2);
  if (milk.length && Math.random() < 0.65) {
    const m = pick(milk);
    addVisit("monarch", m.i);
    if (m.p.caterpillars < 3 && Math.random() < 0.6) {
      m.p.caterpillars++;
      stats.caterpillars++;
      score += POINTS.caterpillar;
      unlock("caterpillar");
    }
  }
  const sun = of("sunflower", seedsRipe);
  if (sun.length && Math.random() < 0.7) addVisit("goldfinch", pick(sun).i);
  if (visitors.length) setTimeout(() => sfx.visitor(), 500);
}

function endSeason() {
  state = "over";
  visitors = [];
  if (score > best) {
    best = score;
    safeSet("garden-best", best);
  }
  sfx.done();
}

// ---------- Layout ----------
function layout() {
  portrait = window.innerWidth < 700;
  if (portrait) {
    W = 520;
    H = 900;
    L = {
      sign: { x: 20, y: 14, w: 480, h: 58 },
      cab: { x: 20, y: 84, w: 480, h: 400 },
      bag: { x: 20, y: 496, w: 480, h: 390 },
      scene: { x: 0, y: 0, w: 520, h: 492 },
      beds: { x: 10, y: 176, w: 500, h: 306 },
      panel: { x: 16, y: 500, w: 488, h: 388 },
      building: { x: 18, y: 36, w: 230, h: 116 },
      gsign: { x: 270, y: 80, w: 232, h: 54 },
      fenceY: 156,
    };
  } else {
    W = 860;
    H = 560;
    L = {
      sign: { x: 20, y: 14, w: 820, h: 58 },
      cab: { x: 20, y: 84, w: 500, h: 462 },
      bag: { x: 536, y: 84, w: 304, h: 462 },
      scene: { x: 0, y: 0, w: 590, h: 560 },
      beds: { x: 14, y: 196, w: 562, h: 350 },
      panel: { x: 600, y: 14, w: 246, h: 532 },
      building: { x: 26, y: 44, w: 270, h: 132 },
      gsign: { x: 330, y: 96, w: 220, h: 56 },
      fenceY: 176,
    };
  }
  canvas.width = W;
  canvas.height = H;
  canvas.style.maxWidth = W + "px";
}

function plotRect(i) {
  const b = L.beds,
    pw = b.w / 5,
    ph = b.h / 2;
  return { x: b.x + (i % 5) * pw, y: b.y + Math.floor(i / 5) * ph, w: pw, h: ph };
}
function plantScale() {
  return Math.min(1.2, (L.beds.h / 2 - 30) / 110);
}
function plantBase(i) {
  const r = plotRect(i);
  return { x: r.x + r.w / 2, y: r.y + r.h - 30 };
}

// ---------- Sound (Web Audio API, gentle) ----------
setupSound("garden", { type: "sine", volume: 0.1, blip: 0.1 });

const sfx = {
  pick: () => tone(660, 880, 0.08, "sine", 0.1),
  putBack: () => tone(620, 440, 0.08, "sine", 0.08),
  limit: () => tone(330, 300, 0.16, "triangle", 0.08),
  plant: () => tone(220, 150, 0.12, "triangle", 0.12),
  water: () => {
    tone(900, 500, 0.14, "sine", 0.08);
    tone(760, 420, 0.14, "sine", 0.06, 0.07);
  },
  weed: () => tone(480, 880, 0.06, "triangle", 0.08),
  harvest: () => [659, 880, 1047].forEach((f, i) => tone(f, f, 0.12, "sine", 0.1, i * 0.07)),
  newDay: () => {
    tone(392, 392, 0.12, "triangle", 0.08);
    tone(523, 523, 0.18, "triangle", 0.08, 0.1);
  },
  visitor: () => {
    tone(1319, 1319, 0.06, "sine", 0.05);
    tone(1568, 1568, 0.08, "sine", 0.05, 0.07);
  },
  page: () => tone(523, 784, 0.18, "sine", 0.08),
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, "triangle", 0.1, i * 0.11)),
  start: () => {
    tone(523, 523, 0.08, "triangle", 0.1);
    tone(784, 784, 0.12, "triangle", 0.1, 0.08);
  },
};

// ---------- Drawing helpers ----------
function circle(x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function oval(x, y, rx, ry, c, rot = 0) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}
// Wrapped text; stops before maxY. Returns the y below the last line drawn.
function wrap(str, x, y, maxW, lineH, font, color, maxY = Infinity, align = "left") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  let line = "";
  for (const word of str.split(" ")) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      if (y > maxY) return y;
      ctx.fillText(line, x, y);
      y += lineH;
      line = word;
    } else line = test;
  }
  if (line && y <= maxY) ctx.fillText(line, x, y);
  return y + lineH;
}
function fitFont(str, maxW, size, weight = "bold", family = "system-ui, sans-serif") {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 7 && ctx.measureText(str).width > maxW) {
    s--;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return ctx.font;
}
function box(b, fill = NAVY) {
  R(b.x, b.y, b.w, b.h, fill);
  ctx.strokeStyle = MAPLE;
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
}
function inside(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function addTarget(id, r, act) {
  targets.push({ id, ...r, act });
}
function button(id, r, label, act, primary = false, enabled = true) {
  ctx.fillStyle = !enabled ? "#4a4f57" : primary ? MAPLE : "#46546a";
  roundRect(r.x, r.y, r.w, r.h, 10);
  ctx.strokeStyle = primary ? "#b07636" : GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(label, r.x + r.w / 2, r.y + r.h / 2 + 6, fitFont(label, r.w - 16, 16, "bold", "Georgia, serif"), primary ? "#2a1d12" : PAPER);
  addTarget(id, r, act);
}
function burst(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    particles.push({ x, y, vx: (Math.random() - 0.5) * 0.25, vy: -Math.random() * 0.25, life: 500 + Math.random() * 300, color, size: 4, grav: true });
  }
}

// ---------- Drawing: plants ----------
function stem(x, y, h, w, c = LEAF) {
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
}
function leaf(x, y, len, ang, c = LEAF_LIGHT, width = 0.24) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.ellipse(len / 2, 0, len / 2, len * width, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function leafPair(y, len, c, width) {
  leaf(0, y, len, -0.5, c, width);
  leaf(0, y, len, Math.PI + 0.5, c, width);
}

// Draws a plant with its base at (bx, by). `stage` overrides the growth stage (for icons).
function drawPlant(p, bx, by, s, stage = stageOf(p)) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(s, s);
  if (p.wilted) {
    ctx.rotate(0.22);
    ctx.filter = "saturate(35%) brightness(92%)";
  }
  if (stage <= 0) {
    oval(0, -1, 12, 5, SOIL);
    ctx.strokeStyle = "#8a6a45";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(10, -24);
    ctx.stroke();
    R(10, -24, 13, 9, SEEDS[p.seed].color);
  } else if (stage === 1) {
    stem(0, 0, 11, 2);
    leafPair(-11, 11, LEAF_LIGHT, 0.32);
  } else {
    ({ okra: drawOkra, watermelon: drawMelon, sunflower: drawSunflower, zinnia: drawZinnia, milkweed: drawMilkweed, beebalm: drawBeeBalm })[p.seed](p, stage);
  }
  ctx.restore();
}

function drawSunflower(p, st) {
  const h = st === 2 ? 40 : st === 3 ? 80 : 100;
  stem(0, 0, h, 4);
  for (let y = 14; y < h - 12; y += 20) leafPair(-y, 22, LEAF_LIGHT, 0.34);
  if (st === 3) circle(0, -h, 6, LEAF);
  if (st === 4) {
    const ripe = seedsRipe(p);
    ctx.save();
    ctx.translate(0, -h);
    if (ripe) ctx.rotate(0.25);
    for (let k = 0; k < 16; k++) oval(Math.cos((k / 16) * Math.PI * 2) * 17, Math.sin((k / 16) * Math.PI * 2) * 17, 10, 4, ripe ? "#e0a92e" : "#f2c14e", (k / 16) * Math.PI * 2);
    circle(0, 0, 12, ripe ? "#4a2f1a" : "#7a4b25");
    if (ripe) for (let k = 0; k < 14; k++) circle(Math.cos(k * 2.4) * (3 + (k % 3) * 3), Math.sin(k * 2.4) * (3 + (k % 3) * 3), 1.3, "#c9a36b");
    ctx.restore();
  }
}

function drawZinnia(p, st) {
  const colors = ["#e0559b", "#f08a3c", "#d63a3a"];
  if (st === 2) {
    stem(0, 0, 22, 2.5);
    leafPair(-12, 14, LEAF_LIGHT);
    return;
  }
  const stems = [[-8, 44, -0.15], [0, 52, 0], [9, 40, 0.18]];
  stems.forEach(([dx, h, tilt], k) => {
    const sh = st === 3 ? h * 0.8 : h;
    ctx.strokeStyle = LEAF;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dx + tilt * sh, -sh);
    ctx.stroke();
    leaf(dx * 0.4, -sh * 0.4, 12, k % 2 ? -0.4 : Math.PI + 0.4);
    const fx = dx + tilt * sh,
      fy = -sh;
    if (st === 3) circle(fx, fy, 4, LEAF);
    else {
      circle(fx, fy, 9, colors[k]);
      circle(fx, fy, 5.5, "rgba(255,255,255,0.35)");
      circle(fx, fy, 2.6, "#f2c14e");
    }
  });
}

function drawMilkweed(p, st) {
  const h = st === 2 ? 28 : st === 3 ? 55 : 66;
  stem(0, 0, h, 3);
  for (let y = 10; y < h - 6; y += 13) leafPair(-y, 18, "#6aa86a", 0.3);
  const heads = st === 4 ? [[-8, -h + 4], [7, -h - 2]] : st === 3 ? [[0, -h]] : [];
  for (const [x, y] of heads) {
    if (st === 3) circle(x, y, 6, "#7fae7a");
    else for (let k = 0; k < 9; k++) circle(x + Math.cos(k * 0.7) * 6, y + Math.sin(k * 0.7) * 4 - 2, 3, k % 2 ? "#d68fb8" : "#c06aa0");
  }
  // monarch caterpillars munching the leaves
  for (let c = 0; c < p.caterpillars; c++) {
    const y = -14 - c * 14,
      x = c % 2 ? -12 : 12;
    for (let s = 0; s < 5; s++) circle(x + (s - 2) * 3.2 * (c % 2 ? -1 : 1), y + Math.sin(time * 0.006 + s + c) * 0.8, 2.3, ["#f2c14e", "#222", "#fff", "#222", "#f2c14e"][s]);
  }
}

function drawBeeBalm(p, st) {
  if (st === 2) {
    stem(0, 0, 24, 2.5);
    leafPair(-12, 14, "#5f9e55");
    return;
  }
  const heads = [[-9, 46], [6, 56], [14, 42]];
  heads.forEach(([dx, h], k) => {
    const sh = st === 3 ? h * 0.8 : h;
    ctx.strokeStyle = LEAF;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dx, -sh);
    ctx.stroke();
    leaf(dx * 0.5, -sh * 0.45, 11, k % 2 ? -0.5 : Math.PI + 0.5, "#5f9e55");
    if (st === 3) circle(dx, -sh, 5, "#6d9e5a");
    else {
      const c = k === 1 ? "#8e44ad" : "#c43b6d";
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(dx, -sh);
        ctx.lineTo(dx + Math.cos(ang) * 10, -sh + Math.sin(ang) * 8 - 3);
        ctx.stroke();
      }
      circle(dx, -sh, 4.5, c);
    }
  });
}

function drawOkra(p, st) {
  const h = st === 2 ? 30 : st === 3 ? 62 : 76;
  stem(0, 0, h, 4, "#4f7f3a");
  for (let y = 12; y < h - 4; y += 18) leafPair(-y, 22, "#4f9a45", 0.4);
  if (st >= 3) {
    circle(9, -h + 6, 7, "#f6e7a1");
    circle(9, -h + 6, 2.6, "#7a1f2b");
  }
  for (let k = 0; k < (st === 4 ? p.pods : 0); k++) {
    const x = k % 2 ? -10 : 6 + k * 3,
      y = -h * 0.55 - k * 9;
    oval(x, y, 3, 9, "#5f9b3f", k % 2 ? -0.2 : 0.2);
    R(x - 0.5, y - 8, 1, 16, "#4c7f30");
  }
}

function drawMelon(p, st) {
  const spread = st === 2 ? 22 : 40;
  ctx.strokeStyle = "#4f8f3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-spread, -2);
  ctx.quadraticCurveTo(0, -10, spread, -3);
  ctx.stroke();
  for (let k = -2; k <= 2; k++) {
    if (st === 2 && Math.abs(k) > 1) continue;
    oval(k * spread * 0.45, -8 - (k % 2 ? 4 : 0), 8, 6, k % 2 ? LEAF_LIGHT : "#4f9a45", k * 0.3);
  }
  if (st === 3) {
    circle(-12, -16, 3.5, "#f2d24e");
    circle(16, -14, 3.5, "#f2d24e");
  }
  if (st === 4) {
    oval(10, -12, 20, 13, "#3f8f3a");
    ctx.strokeStyle = "#2a6b2a";
    ctx.lineWidth = 2.5;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.ellipse(10 + k * 6, -12, 3, 12, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
    oval(4, -18, 6, 3, "rgba(255,255,255,0.25)");
  }
}

// ---------- Drawing: visitors ----------
function drawVisitor(type, x, y, s = 1, t = time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const flap = Math.abs(Math.sin(t * 0.03));
  if (type === "bee") {
    oval(-2, -5, 4, 6 * flap + 1, "rgba(255,255,255,0.8)");
    oval(3, -5, 4, 6 * flap + 1, "rgba(255,255,255,0.8)");
    oval(0, 0, 7, 5, "#f2c14e");
    R(-2, -5, 2, 10, "#222");
    R(3, -4.5, 2, 9, "#222");
    circle(-6, -1, 2.5, "#222");
  } else if (type === "monarch" || type === "swallowtail") {
    const wing = type === "monarch" ? "#f08a24" : "#f6d24a";
    const w = 0.35 + 0.65 * flap;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side * w, 1);
      oval(7, -5, 8, 6, wing, -0.3);
      oval(6, 5, 6, 4.5, wing, 0.3);
      ctx.strokeStyle = "#1d1d1d";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(7, -5, 8, 6, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      if (type === "swallowtail") for (let k = 0; k < 3; k++) R(3 + k * 4, -10, 1.6, 9, "#1d1d1d");
      else {
        ctx.beginPath();
        ctx.moveTo(1, -2);
        ctx.lineTo(12, -8);
        ctx.moveTo(1, 2);
        ctx.lineTo(10, 6);
        ctx.stroke();
      }
      ctx.restore();
    }
    oval(0, 0, 1.6, 7, "#1d1d1d");
  } else if (type === "hummingbird") {
    oval(-2, -6, 3, 9 * flap + 1, "rgba(220,240,230,0.7)", -0.5);
    oval(0, 0, 8, 4.5, "#2f9e6a");
    circle(6, -2, 3.6, "#2f9e6a");
    circle(6, 0.5, 2, "#d62f3a");
    R(9, -2.5, 9, 1.4, "#333");
    circle(7, -3, 0.9, "#111");
    ctx.fillStyle = "#256f4c";
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(-14, -3);
    ctx.lineTo(-14, 3);
    ctx.fill();
  } else if (type === "goldfinch") {
    oval(0, 0, 9, 6, "#f5d21f");
    circle(7, -4, 4.5, "#f5d21f");
    R(4, -9, 7, 3, "#1d1d1d");
    oval(-2, -1, 6, 3.4, "#1d1d1d", 0.2);
    ctx.fillStyle = "#f08a3c";
    ctx.beginPath();
    ctx.moveTo(11, -4);
    ctx.lineTo(15, -3);
    ctx.lineTo(11, -2);
    ctx.fill();
    circle(8, -5, 0.9, "#111");
  } else if (type === "caterpillar") {
    for (let k = 0; k < 6; k++) circle((k - 2.5) * 4, Math.sin(t * 0.006 + k) * 0.8, 3, ["#f2c14e", "#222", "#fff"][k % 3]);
  }
  ctx.restore();
}

// Where a visitor hangs out over a plant.
function flowerPoint(i) {
  const p = plots[i],
    b = plantBase(i),
    s = plantScale();
  const h = SEEDS[p.seed].height;
  return { x: b.x, y: b.y - h * s + 6 };
}

// ---------- Drawing: seed packets ----------
function drawPacket(x, y, w, h, kind, opts = {}) {
  const s = SEEDS[kind];
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  roundRect(x + 2, y + 3, w, h, 4);
  ctx.fillStyle = s.color;
  roundRect(x, y, w, h, 4);
  R(x + 3, y + 3, w - 6, h * 0.62, "#fdf8ec");
  // little picture of the plant on the front
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + 3, w - 6, h * 0.62);
  ctx.clip();
  const icon = { ...emptyPlot(), seed: kind, age: 99, pods: 2, caterpillars: 0 };
  const sc = (h * 0.5) / Math.max(40, s.height);
  drawPlant(icon, x + w / 2, y + 3 + h * 0.6, sc, 4);
  ctx.restore();
  if (w >= 52) drawLogo(x + 11, y + 5, 10);
  if (opts.label !== false) text(s.name, x + w / 2, y + h - 8, fitFont(s.name, w - 6, Math.round(h * 0.15)), "#2a1d12");
  if (opts.selected) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
  }
}

// ---------- Drawing: the seed cabinet ----------
// Styled after the real Seed Library cabinet: walnut card-catalog drawers in
// columns split by black uprights, white label cards in brass holders with a
// purple sprout and typewriter lettering, big brushed-brass pulls and rod holes.
const WALNUT = "#8a5a33",
  WALNUT_DARK = "#5b3a22",
  BRASS = "#c9ac6a",
  BRASS_DARK = "#9c7f3f",
  TYPE = '"Courier New", Courier, monospace';
// Other seeds on the real cabinet's labels (shown on closed drawers).
const MORE_SEEDS = ["Basil", "Carrots", "Dill", "Beans", "Cilantro", "Eggplant"];

function drawSprout(x, y, s) {
  // orange dot, purple leaf pair, orange dot, bigger purple leaf pair
  const purple = "#9b84c4",
    orange = "#e0703a";
  circle(x, y, s * 0.13, orange);
  oval(x - s * 0.17, y + s * 0.3, s * 0.15, s * 0.2, purple, -0.6);
  oval(x + s * 0.17, y + s * 0.3, s * 0.15, s * 0.2, purple, 0.6);
  circle(x, y + s * 0.56, s * 0.12, orange);
  oval(x - s * 0.21, y + s * 0.86, s * 0.19, s * 0.24, purple, -0.6);
  oval(x + s * 0.21, y + s * 0.86, s * 0.19, s * 0.24, purple, 0.6);
}

function woodGrain(x, y, w, h, seed) {
  for (let k = 0; k < 6; k++) {
    const r = Math.abs(Math.sin(seed * 12.9898 + k * 78.233)) % 1;
    const gy = y + 3 + ((k + r) / 6) * (h - 6);
    R(x + r * w * 0.3, gy, w * (0.5 + r * 0.5) - r * w * 0.3, 1, "rgba(50, 25, 8, 0.18)");
  }
}

// One drawer front: label card in a brass holder, sprout + typewriter name,
// a tall brushed-brass pull, and the round rod hole underneath.
function drawDrawerFront(x, y, w, h, name, seed) {
  R(x, y, w, h, WALNUT);
  woodGrain(x, y, w, h, seed);
  R(x, y, w, 2, "rgba(255, 220, 170, 0.25)"); // top edge catching the light
  R(x, y + h - 2, w, 2, "rgba(0, 0, 0, 0.3)");
  // label card
  const lw = w * 0.78,
    lh = Math.max(18, Math.min(30, h * 0.3));
  const lx = x + (w - lw) / 2 - w * 0.06,
    ly = y + Math.max(5, h * 0.1);
  R(lx - 2, ly - 2, lw + 4, lh + 4, BRASS_DARK);
  R(lx, ly, lw, lh, "#fbfaf5");
  R(lx, ly, lw, lh * 0.35, "rgba(255, 255, 255, 0.6)"); // glass sheen
  const iconS = lh * 0.7;
  drawSprout(lx + 6 + iconS * 0.3, ly + lh * 0.12, iconS);
  const tx = lx + 10 + iconS * 0.6;
  text(name, tx, ly + lh * 0.68, fitFont(name, lw - (tx - lx) - 4, Math.round(lh * 0.55), "bold", TYPE), "#2e3a40", "left");
  // brushed-brass pull: top arm, long front bar, bottom arm
  const hx = lx + lw * 0.82,
    hTop = ly - 3,
    hBot = Math.min(y + h - 10, ly + lh + h * 0.38),
    bw = Math.max(5, w * 0.05);
  R(hx - bw * 1.4, hTop, bw * 1.6, bw * 0.8, BRASS_DARK);
  R(hx - bw * 1.4, hBot - bw * 0.8, bw * 1.6, bw * 0.8, BRASS_DARK);
  const g = ctx.createLinearGradient(hx, 0, hx + bw, 0);
  g.addColorStop(0, "#e6cf92");
  g.addColorStop(0.5, BRASS);
  g.addColorStop(1, BRASS_DARK);
  ctx.fillStyle = g;
  roundRect(hx, hTop, bw, hBot - hTop, bw / 2);
  // rod hole with a brass ring
  const ry = Math.min(y + h - 8, hBot + 2),
    rx = hx - w * 0.12; // just inside the pull, like the real drawers
  circle(rx, ry, Math.max(3.5, h * 0.06), BRASS_DARK);
  circle(rx, ry, Math.max(2.5, h * 0.045), "#1a1410");
}

function drawCabinet() {
  const c = L.cab;
  // cabinet body: walnut frame, dark gaps behind the drawers
  R(c.x, c.y, c.w, c.h, WALNUT_DARK);
  R(c.x, c.y, c.w, 34, "#6b4529"); // top board
  R(c.x, c.y + 32, c.w, 2, "rgba(0, 0, 0, 0.3)");
  // brass plaque on the top board
  const plaque = portrait ? "FREE SEEDS · YOURS TO KEEP" : "FREE SEEDS · YOURS TO KEEP · TAP A DRAWER";
  ctx.font = "bold 12px system-ui, sans-serif";
  const pw = ctx.measureText(plaque).width + 24;
  R(c.x + c.w / 2 - pw / 2, c.y + 7, pw, 20, BRASS);
  R(c.x + c.w / 2 - pw / 2, c.y + 7, pw, 2, "#e6cf92");
  text(plaque, c.x + c.w / 2, c.y + 21, "bold 12px system-ui, sans-serif", "#3a2512");

  const pad = 8,
    sep = 7, // black uprights between the columns
    top = c.y + 40,
    bottom = c.y + c.h - pad;
  const colW = (c.w - pad * 2 - sep * 2) / 3;
  const closedH = Math.min(78, (bottom - top) * 0.22); // a row of closed drawers at the bottom
  const seedH = (bottom - top - closedH - 8) / 2;
  R(c.x + pad, top - 2, c.w - pad * 2, bottom - top + 2, "#1c1714");

  for (let col = 0; col < 3; col++) {
    const x = c.x + pad + col * (colW + sep);
    if (col) R(x - sep, top - 2, sep, bottom - top + 2, "#141210");

    // two seed drawers per column, pulled open to show the packets inside
    for (let row = 0; row < 2; row++) {
      const i = row * 3 + col;
      const kind = SEED_KEYS[i];
      const y = top + row * (seedH + 4);
      const left = PER_KIND - (takenToday[kind] || 0);
      const frontH = Math.min(seedH * 0.5, 74);
      const openH = seedH - frontH;
      // inside of the open drawer: dark walnut box with packets standing up
      R(x + 4, y, colW - 8, openH, "#2a1d14");
      R(x + 4, y, 4, openH, WALNUT_DARK);
      R(x + colW - 8, y, 4, openH, WALNUT_DARK);
      const pw2 = Math.min(62, colW * 0.4),
        ph2 = Math.min(openH - 8, pw2 * 1.32);
      for (let k = 0; k < left; k++) {
        const px = x + colW / 2 - pw2 + k * (pw2 * 0.9) - (left === 1 ? -pw2 / 2 : 0) + 4;
        drawPacket(px, y + openH - ph2 - 2, pw2, ph2, kind, { label: false });
      }
      if (!left) text("Come back tomorrow", x + colW / 2, y + openH / 2 + 5, fitFont("Come back tomorrow", colW - 16, 12, "italic", "Georgia, serif"), "rgba(243,234,215,0.75)");
      // drawer front
      const fy = y + openH;
      drawDrawerFront(x, fy, colW, frontH, SEEDS[kind].name, i + 1);
      // how many are left, tucked under the label
      text(left ? `${left} left today` : "None left today", x + 8, fy + frontH - 6, "bold 10px system-ui, sans-serif", "#f3e2c4", "left");
      addTarget("drawer-" + kind, { x, y, w: colW, h: seedH }, () => takePacket(kind));
    }

    // closed drawers along the bottom, like the rest of the real cabinet
    const cy = top + 2 * (seedH + 4) + 4;
    const name = MORE_SEEDS[col + (portrait ? 3 : 0)];
    drawDrawerFront(x, cy, colW, closedH, name, 20 + col);
    addTarget("more-" + col, { x, y: cy, w: colW, h: closedH }, () =>
      say("Even more seeds!", `The real Seed Library cabinet at the Berea Branch has lots more drawers, like ${name.toLowerCase()}. In this game's garden we grow six kinds. Visit with a grown-up to see them all!`)
    );
  }
}

// ---------- Drawing: Seed Library counter ----------
function drawPick() {
  // library wall and floor
  R(0, 0, W, H, "#cfd3d8");
  R(0, H - 20, W, 20, "#3b3c43");
  // sign
  const s = L.sign;
  R(s.x, s.y, s.w, s.h, MAPLE);
  R(s.x, s.y + s.h - 5, s.w, 5, "#b07636");
  drawLogo(s.x + 26, s.y + 8, 30);
  text("SEED LIBRARY", s.x + 56, s.y + 38, "bold 26px Georgia, serif", "#f4efe6", "left");
  if (!portrait) text("Grow your world!", s.x + s.w - 18, s.y + 37, "italic 18px Georgia, serif", "#5a3a1c", "right");

  // card-catalog cabinet of seed drawers, styled after the real Seed Library cabinet
  drawCabinet();

  // seed bag
  const b = L.bag;
  box(b);
  text("YOUR SEED BAG", b.x + 16, b.y + 26, "bold 13px system-ui, sans-serif", GOLD, "left");
  text(`Today: ${takenTotal} / ${DAILY_LIMIT}`, b.x + b.w - 16, b.y + 26, "bold 13px system-ui, sans-serif", PAPER, "right");
  for (let k = 0; k < DAILY_LIMIT; k++) {
    const pw = (b.w - 32 - (DAILY_LIMIT - 1) * 4) / DAILY_LIMIT;
    R(b.x + 16 + k * (pw + 4), b.y + 36, pw, 6, k < takenTotal ? GOLD : "rgba(243,234,215,0.2)");
  }
  const cols = 5,
    slotW = (b.w - 32 - (cols - 1) * 8) / cols;
  const pw = Math.min(56, slotW),
    ph = pw * 1.32;
  const gy = b.y + 54;
  for (let k = 0; k < 10; k++) {
    const sx = b.x + 16 + (k % cols) * (slotW + 8) + (slotW - pw) / 2,
      sy = gy + Math.floor(k / cols) * (ph + 10);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "rgba(243,234,215,0.25)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx, sy, pw, ph);
    ctx.setLineDash([]);
    if (bag[k]) {
      drawPacket(sx, sy, pw, ph, bag[k]);
      addTarget("bag-" + k, { x: sx, y: sy, w: pw, h: ph }, () => returnPacket(k));
    }
  }
  let y = gy + 2 * (ph + 10) + 4;
  if (bag.length > 10) {
    text(`+ ${bag.length - 10} more in your bag`, b.x + b.w / 2, y + 4, "12px Georgia, serif", PAPER);
    y += 14;
  }
  if (bag.length) text("Tap a packet in your bag to put it back.", b.x + b.w / 2, y + 8, "italic 12px Georgia, serif", "rgba(243,234,215,0.7)");
  y += 30;
  const btnH = 48;
  const maxY = b.y + b.h - btnH - 28;
  y = wrap(message.title, b.x + 16, y, b.w - 32, 20, "bold 16px Georgia, serif", PAPER, maxY);
  wrap(message.text, b.x + 16, y, b.w - 32, 18, "14px Georgia, serif", PAPER, maxY);
  const started = plots.some((p) => p.seed) || day > 1;
  button("go", { x: b.x + 16, y: b.y + b.h - btnH - 14, w: b.w - 32, h: btnH }, started ? "Back to the garden →" : "Go to the garden →", goGarden, true, bag.length > 0 || started);
}

// ---------- Drawing: the garden ----------
function drawSky() {
  const sc = L.scene;
  const g = ctx.createLinearGradient(0, 0, 0, L.fenceY);
  const sky = { sunny: ["#8fcbf2", "#e3f3fb"], hot: ["#f7c27a", "#fff0d2"], rain: ["#8292a6", "#c5ced8"] }[weather];
  g.addColorStop(0, sky[0]);
  g.addColorStop(1, sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(sc.x, 0, sc.w, L.fenceY + 10);
  if (weather !== "rain") {
    const sx = sc.x + sc.w - 60,
      sy = 46;
    circle(sx, sy, 34, weather === "hot" ? "rgba(255,150,60,0.25)" : "rgba(255,240,150,0.35)");
    circle(sx, sy, 22, weather === "hot" ? "#ff9a3c" : "#ffd84a");
  }
  // drifting clouds
  const cloud = weather === "rain" ? "#9aa6b5" : "rgba(255,255,255,0.9)";
  for (let k = 0; k < 3; k++) {
    const cx = ((time * 0.01 + k * 220) % (sc.w + 160)) - 80,
      cy = 30 + k * 18;
    oval(cx, cy, 30, 12, cloud);
    oval(cx + 22, cy - 6, 22, 12, cloud);
    oval(cx - 20, cy + 2, 18, 9, cloud);
  }
}

// The Berea Branch (Sarah Dobey Jones Branch), home of the real Seed Library:
// red-brown brick, green metal roofs, a tall gabled entrance with a big brick
// pier and an open frame, a low side wing, and a crape myrtle out front.
// Drawn on a 270 × 132 grid and scaled to fit the layout's building box.
const BRICK = "#a8593a",
  BRICK_DARK = "#8f4a30",
  MORTAR = "rgba(222, 170, 140, 0.35)",
  ROOF = "#3d6b5f",
  ROOF_EDGE = "#2f5a4f";

function shape(color, ...pts) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}

// Brick wall: fill a shape, then draw mortar lines clipped to it.
function brickShape(color, ...pts) {
  shape(color, ...pts);
  ctx.save();
  ctx.clip();
  const xs = pts.filter((_, i) => i % 2 === 0),
    ys = pts.filter((_, i) => i % 2 === 1);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  ctx.fillStyle = MORTAR;
  for (let row = 0, y = y0; y < y1; row++, y += 3.2) {
    ctx.fillRect(x0, y, x1 - x0, 0.5);
    for (let x = x0 + (row % 2) * 3.5; x < x1; x += 7) ctx.fillRect(x, y, 0.5, 3.2);
  }
  ctx.restore();
}

function drawBranch() {
  const b = L.building;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(b.w / 270, b.h / 132);

  // big shade tree behind the left end
  circle(6, 60, 34, "#4f8a43");
  circle(26, 42, 24, "#5c9a4c");

  // tall back section: roofline rising to the gable over the entrance
  brickShape(BRICK, 56, 52, 133, 8, 157, 30, 157, 132, 56, 132);

  // recessed upper window band and the shaded entry below it
  shape(BRICK_DARK, 78, 37, 106, 37, 106, 70, 78, 70);
  shape("#23272b", 81, 57, 105, 57, 105, 65, 81, 65); // windows
  R(81, 61, 24, 0.8, "#5a6470");
  shape("#2b211d", 88, 82, 106, 82, 106, 132, 88, 132); // entry recess
  shape("#191514", 93, 88, 105, 88, 105, 132, 93, 132); // door
  R(94, 104, 3, 5, "#d9d2c5"); // notices on the door
  R(99, 106, 3, 4, "#d9d2c5");

  // open portico under the gable: shade, with trees seen through the big frame
  shape("#6b3d2c", 117, 56, 157, 56, 157, 132, 117, 132);
  shape("#8fbf78", 117, 40, 157, 40, 157, 56, 117, 56);
  R(117, 40, 40, 2.5, "#d8c9b8"); // underside of the roof
  circle(128, 52, 7, "#6a9a58");
  circle(146, 50, 8, "#6a9a58");
  // gable face over the portico
  brickShape(BRICK, 106, 23, 133, 8, 157, 30, 157, 40, 106, 40);
  // one long green roof edge up to the gable peak and down its far side
  ctx.strokeStyle = ROOF;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(50, 56);
  ctx.lineTo(133, 7);
  ctx.lineTo(160, 31);
  ctx.stroke();
  ctx.lineJoin = "miter";
  // the big front pier and the small right pier
  brickShape(BRICK, 106, 20, 117, 20, 117, 132, 106, 132);
  R(116, 20, 1.2, 112, BRICK_DARK);
  brickShape(BRICK, 146, 100, 157, 100, 157, 132, 146, 132);
  // downspout
  R(105, 24, 1.2, 108, ROOF_EDGE);

  // low side wing with its hipped green roof and two small windows
  brickShape(BRICK, 2, 80, 89, 80, 89, 132, 2, 132);
  shape(ROOF, -3, 81, 10, 68, 80, 68, 93, 81);
  R(-3, 80, 96, 1.8, ROOF_EDGE);
  R(87, 81, 1.2, 51, ROOF_EDGE); // downspout
  shape("#1f1f22", 24, 91, 33, 91, 33, 103, 24, 103);
  shape("#1f1f22", 41, 91, 50, 91, 50, 103, 41, 103);
  R(9, 84, 5, 1.5, "rgba(0,0,0,0.35)"); // little vents
  R(17, 84, 5, 1.5, "rgba(0,0,0,0.35)");

  // low brick wall and shrubs along the walk
  brickShape(BRICK, 150, 114, 270, 114, 270, 132, 150, 132);
  R(150, 114, 120, 1.5, "#b8694a");
  for (const [x, y, r] of [[14, 120, 10], [28, 122, 8], [196, 108, 9], [214, 110, 10], [236, 107, 10], [258, 109, 11]]) {
    circle(x, y, r, "#3f7a3a");
    circle(x - r * 0.3, y - r * 0.3, r * 0.55, "#4f8f46");
  }

  // crape myrtle in front of the entrance, with a few pale blossoms
  ctx.strokeStyle = "#7a5a46";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [tx, ty] of [[182, 84], [192, 80], [202, 86]]) {
    ctx.moveTo(192, 126);
    ctx.lineTo(tx, ty);
  }
  ctx.stroke();
  circle(192, 68, 22, "#4c8a40");
  circle(177, 76, 13, "#5a9a4a");
  circle(208, 74, 14, "#5a9a4a");
  circle(188, 55, 12, "#63a352");
  for (const [x, y] of [[180, 62], [198, 56], [208, 68], [184, 78], [202, 82], [192, 48]]) circle(x, y, 1.8, "#f3dfe6");

  // brick sign pillar with the library logo and branch name
  brickShape(BRICK, 226, 92, 270, 92, 270, 118, 226, 118);
  R(224, 90, 48, 3, "#b8694a");
  R(229, 96, 38, 16, "#2a2c30");
  drawLogo(235, 97.5, 10);
  text("BEREA", 253, 104, "bold 5.5px system-ui, sans-serif", "#f3ead7");
  text("BRANCH", 253, 110, "bold 4.5px system-ui, sans-serif", "#d4a64a");

  ctx.restore();
}

function drawGardenSign() {
  const s = L.gsign;
  R(s.x + 16, s.y + s.h - 4, 6, L.fenceY - s.y - s.h + 30, "#8a5a30");
  R(s.x + s.w - 22, s.y + s.h - 4, 6, L.fenceY - s.y - s.h + 30, "#8a5a30");
  R(s.x, s.y, s.w, s.h, MAPLE);
  R(s.x, s.y + s.h - 4, s.w, 4, "#b07636");
  drawLogo(s.x + 20, s.y + 9, 24);
  text("Seed Library Garden", s.x + 40 + (s.w - 40) / 2, s.y + 26, fitFont("Seed Library Garden", s.w - 50, 16, "bold", "Georgia, serif"), "#3a2512");
  text("Grow your world!", s.x + 40 + (s.w - 40) / 2, s.y + 44, "italic 12px Georgia, serif", "#5a3a1c");
}

function drawGarden() {
  const sc = L.scene;
  R(0, 0, W, H, "#2e2219"); // behind the side panel
  drawSky();
  // grass
  const g = ctx.createLinearGradient(0, L.fenceY, 0, sc.h);
  g.addColorStop(0, "#8cc06c");
  g.addColorStop(1, "#5e9a4f");
  ctx.fillStyle = g;
  ctx.fillRect(sc.x, L.fenceY, sc.w, sc.h - L.fenceY);
  drawBranch();
  drawGardenSign();
  // wooden fence
  R(sc.x, L.fenceY - 14, sc.w, 4, "#e9e2d0");
  R(sc.x, L.fenceY - 2, sc.w, 4, "#e9e2d0");
  for (let x = sc.x + 4; x < sc.x + sc.w; x += 16) {
    ctx.fillStyle = "#f4efe2";
    ctx.beginPath();
    ctx.moveTo(x, L.fenceY + 8);
    ctx.lineTo(x, L.fenceY - 22);
    ctx.lineTo(x + 4, L.fenceY - 27);
    ctx.lineTo(x + 8, L.fenceY - 22);
    ctx.lineTo(x + 8, L.fenceY + 8);
    ctx.fill();
  }

  // raised beds
  const ph = L.beds.h / 2;
  for (let row = 0; row < 2; row++) {
    const y = L.beds.y + row * ph + ph - 40;
    R(L.beds.x + 2, y, L.beds.w - 4, 12, "#6b4a2f");
    R(L.beds.x + 2, y + 10, L.beds.w - 4, 30, "#a8743f");
    R(L.beds.x + 2, y + 10, L.beds.w - 4, 4, "#c08a4c");
    R(L.beds.x + 2, y + 25, L.beds.w - 4, 1.5, "#8a5a30");
  }

  // plots (back row first so the front row overlaps it)
  const s = plantScale();
  for (let i = 0; i < PLOT_COUNT; i++) {
    const p = plots[i],
      r = plotRect(i),
      base = plantBase(i);
    addTarget("plot-" + i, r, () => tapPlot(i));
    if (!p.seed) {
      // empty spot: a soft marker
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(base.x, base.y - 2, r.w * 0.3, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    drawPlant(p, base.x, base.y, s);
    // weeds
    for (let k = 0; k < p.weeds; k++) {
      const wx = base.x + [-r.w * 0.32, r.w * 0.3, -r.w * 0.12][k];
      ctx.strokeStyle = "#4e7d2c";
      ctx.lineWidth = 2;
      for (let b = -1; b <= 1; b++) {
        ctx.beginPath();
        ctx.moveTo(wx, base.y);
        ctx.lineTo(wx + b * 5, base.y - 12 - Math.abs(b) * -3);
        ctx.stroke();
      }
      if (k === 1) circle(wx, base.y - 14, 3, "#f2d024");
    }
    // ready to pick: twinkles
    if (canHarvest(p)) {
      const tw = (Math.sin(time * 0.008 + i) + 1) / 2;
      ctx.globalAlpha = 0.4 + 0.6 * tw;
      text("✦", base.x + r.w * 0.28, base.y - 40 * s, "bold 16px system-ui, sans-serif", "#fff6c0");
      text("✦", base.x - r.w * 0.3, base.y - 18 * s, "bold 12px system-ui, sans-serif", "#fff6c0");
      ctx.globalAlpha = 1;
    }
    // thirsty bubble
    if (p.water === 0) {
      const bx = base.x + r.w * 0.28,
        by = r.y + 18;
      circle(bx, by, 11, "rgba(255,255,255,0.92)");
      ctx.fillStyle = "#3d8fd4";
      ctx.beginPath();
      ctx.moveTo(bx, by - 7);
      ctx.quadraticCurveTo(bx + 6, by + 1, bx, by + 5);
      ctx.quadraticCurveTo(bx - 6, by + 1, bx, by - 7);
      ctx.fill();
    }
    // water level on the bed front
    for (let k = 0; k < MAX_WATER; k++) {
      const dx = r.x + 10 + k * 10,
        dy = r.y + r.h - 20;
      circle(dx, dy, 3.2, k < p.water ? "#5fb0ee" : "rgba(0,0,0,0.25)");
    }
  }

  // visitors
  for (const v of visitors) {
    if (!plots[v.plot].seed) continue;
    const f = flowerPoint(v.plot);
    const t = time * 0.001 * v.speed + v.phase;
    if (v.type === "goldfinch") drawVisitor("goldfinch", f.x + 10, f.y - 18 + Math.sin(time * 0.01) * 1.5, 1.1);
    else {
      const range = v.type === "bee" ? 18 : 24;
      drawVisitor(v.type, f.x + Math.sin(t * 1.7) * range, f.y - 14 + Math.cos(t * 2.3) * range * 0.6, v.type === "hummingbird" ? 1.1 : 1, time + v.phase * 500);
    }
  }

  // rain
  if (weather === "rain") {
    ctx.strokeStyle = "rgba(200,225,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < 70; k++) {
      const x = (k * 53 + time * 0.05) % sc.w,
        y = (k * 97 + time * 0.45) % sc.h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 10);
    }
    ctx.stroke();
  }

  drawPanel();
}

function weatherIcon(x, y, r) {
  if (weather === "rain") {
    oval(x - 6, y, r * 0.6, r * 0.45, "#c5ced8");
    oval(x + 6, y - 4, r * 0.55, r * 0.5, "#dfe5ec");
    for (let k = -1; k <= 1; k++) R(x + k * 8, y + 10, 2, 8, "#7cc3f0");
    return;
  }
  const c = weather === "hot" ? "#ff8a3c" : "#ffd84a";
  ctx.strokeStyle = c;
  ctx.lineWidth = 3;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
  circle(x, y, r * 0.55, c);
}

function drawPanel() {
  const P = L.panel;
  box(P);
  const pad = 12,
    wide = P.w > 400;
  let y = P.y + pad;
  const innerW = P.w - pad * 2;

  // day, weather, points
  text(`DAY ${day} OF ${SEASON_DAYS}`, P.x + pad, y + 16, "bold 13px system-ui, sans-serif", GOLD, "left");
  const wLabel = { sunny: "Sunny", hot: "Hot day", rain: "Rainy" }[weather];
  text(wLabel, P.x + pad + 34, y + 46, "bold 18px Georgia, serif", PAPER, "left");
  weatherIcon(P.x + pad + 14, y + 40, 14);
  if (wide) {
    text("POINTS", P.x + P.w - pad - 120, y + 16, "bold 12px system-ui, sans-serif", GOLD, "left");
    text(String(score), P.x + P.w - pad - 120, y + 46, "bold 22px Georgia, serif", PAPER, "left");
    text("BEST", P.x + P.w - pad, y + 16, "bold 12px system-ui, sans-serif", GOLD, "right");
    text(String(Math.max(best, score)), P.x + P.w - pad, y + 46, "bold 22px Georgia, serif", PAPER, "right");
    y += 62;
  } else {
    y += 62;
    text("POINTS", P.x + pad, y + 18, "bold 12px system-ui, sans-serif", GOLD, "left");
    text(String(score), P.x + pad + 56, y + 20, "bold 20px Georgia, serif", PAPER, "left");
    text(String(Math.max(best, score)), P.x + P.w - pad, y + 20, "bold 20px Georgia, serif", PAPER, "right");
    ctx.font = "bold 20px Georgia, serif";
    const bw = ctx.measureText(String(Math.max(best, score))).width;
    text("BEST", P.x + P.w - pad - bw - 6, y + 18, "bold 12px system-ui, sans-serif", GOLD, "right");
    y += 32;
  }

  // buttons
  button("next", { x: P.x + pad, y, w: innerW, h: 48 }, day >= SEASON_DAYS ? "Finish the season ✓" : "Next day →", nextDay, true);
  y += 56;
  if (wide) {
    const half = (innerW - 8) / 2;
    button("journal", { x: P.x + pad, y, w: half, h: 42 }, "Garden Journal", openJournal);
    button("library", { x: P.x + pad + half + 8, y, w: half, h: 42 }, "Seed Library", () => {
      state = "pick";
      focusId = null;
      say("Back at the Seed Library", takenTotal >= DAILY_LIMIT ? "You've taken today's 10 packets. Come back tomorrow for more!" : `You can take ${DAILY_LIMIT - takenTotal} more packets today.`);
    });
    y += 50;
  } else {
    button("journal", { x: P.x + pad, y, w: innerW, h: 40 }, "Garden Journal", openJournal);
    y += 46;
    button("library", { x: P.x + pad, y, w: innerW, h: 40 }, "Seed Library", () => {
      state = "pick";
      focusId = null;
      say("Back at the Seed Library", takenTotal >= DAILY_LIMIT ? "You've taken today's 10 packets. Come back tomorrow for more!" : `You can take ${DAILY_LIMIT - takenTotal} more packets today.`);
    });
    y += 48;
  }

  // seed bag tray: choose which packet to plant
  text("SEED BAG · pick one, then tap a spot", P.x + pad, y + 12, fitFont("SEED BAG · pick one, then tap a spot", innerW, 11), GOLD, "left");
  y += 20;
  const pw = 34,
    ph = 46,
    cols = Math.max(1, Math.floor((innerW + 6) / (pw + 6)));
  if (!bag.length) {
    text("Empty. Visit the Seed Library!", P.x + pad, y + 20, "italic 13px Georgia, serif", "rgba(243,234,215,0.7)", "left");
    y += 34;
  } else {
    const shown = Math.min(bag.length, cols * 2);
    for (let k = 0; k < shown; k++) {
      const x = P.x + pad + (k % cols) * (pw + 6),
        yy = y + Math.floor(k / cols) * (ph + 6);
      drawPacket(x, yy, pw, ph, bag[k], { label: false, selected: k === selected });
      addTarget("tray-" + k, { x, y: yy, w: pw, h: ph }, () => {
        selected = k;
        sfx.pick();
        say(`${SEEDS[bag[k]].name} selected`, "Now tap an empty spot in the garden to plant it.");
      });
    }
    y += Math.ceil(shown / cols) * (ph + 6);
  }

  // message
  y += 14;
  const maxY = P.y + P.h - 10;
  y = wrap(message.title, P.x + pad, y, innerW, 19, "bold 15px Georgia, serif", PAPER, maxY);
  wrap(message.text, P.x + pad, y, innerW, 17, "13px Georgia, serif", "rgba(243,234,215,0.9)", maxY);
}

// ---------- Journal ----------
function openJournal() {
  journalOpen = true;
  journalPage = 0;
  focusId = null;
  sfx.page();
}

function journalIcon(key, x, y, size) {
  if (key === "seedlib") return drawPacket(x - size * 0.36, y - size * 0.5, size * 0.72, size * 0.95, "sunflower", { label: false });
  if (SEEDS[key]) {
    const icon = { ...emptyPlot(), seed: key, age: 99, pods: 2, caterpillars: key === "milkweed" ? 1 : 0 };
    return drawPlant(icon, x, y + size * 0.45, (size * 0.85) / Math.max(45, SEEDS[key].height), 4);
  }
  drawVisitor(key, x, y, size / 22);
}

function drawJournal() {
  targets = [];
  ctx.fillStyle = "rgba(20, 14, 10, 0.7)";
  ctx.fillRect(0, 0, W, H);
  const m = portrait ? 14 : 30;
  const J = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
  ctx.fillStyle = "#7a4a26";
  roundRect(J.x, J.y, J.w, J.h, 14);
  ctx.fillStyle = PAPER;
  roundRect(J.x + 10, J.y + 10, J.w - 20, J.h - 20, 8);
  if (!portrait) R(J.x + J.w / 2 - 1, J.y + 14, 2, J.h - 28, "rgba(122,74,38,0.25)");
  text("Garden Journal", J.x + 28, J.y + 46, "bold 24px Georgia, serif", "#3a2512", "left");
  text(`${journal.size} / ${JOURNAL_ORDER.length} pages`, J.x + J.w - 28, J.y + 44, "15px Georgia, serif", "#7a4a26", "right");

  const pages = Math.ceil(JOURNAL_ORDER.length / PAGE_SIZE);
  const cols = portrait ? 1 : 2,
    rows = PAGE_SIZE / cols;
  const gx = J.x + 24,
    gy = J.y + 62,
    gw = J.w - 48,
    gh = J.h - 62 - 70;
  const cw = gw / cols,
    ch = gh / rows;
  JOURNAL_ORDER.slice(journalPage * PAGE_SIZE, journalPage * PAGE_SIZE + PAGE_SIZE).forEach((key, k) => {
    const x = gx + (k % cols) * cw,
      y = gy + Math.floor(k / cols) * ch;
    const known = journal.has(key);
    const iconSize = Math.min(58, ch - 18);
    ctx.fillStyle = known ? "#fffaf0" : "#e6dcc8";
    roundRect(x + 4, y + 4, cw - 8, ch - 8, 8);
    if (known) journalIcon(key, x + 12 + iconSize / 2, y + ch / 2, iconSize);
    else text("?", x + 12 + iconSize / 2, y + ch / 2 + 10, "bold 30px Georgia, serif", "#b9ab90");
    const tx = x + 22 + iconSize,
      tw = cw - iconSize - 38;
    if (known) {
      let yy = wrap(JOURNAL[key].name, tx, y + 26, tw, 18, "bold 15px Georgia, serif", "#3a2512");
      wrap(JOURNAL[key].fact, tx, yy, tw, 16, "13px Georgia, serif", "#4a3a2a", y + ch - 12);
    } else {
      text("A page to discover", tx, y + 26, "bold 15px Georgia, serif", "#8a7a60", "left");
      wrap("Keep gardening to fill in this page!", tx, y + 46, tw, 16, "italic 13px Georgia, serif", "#8a7a60");
    }
  });

  const by = J.y + J.h - 58,
    bw = Math.min(150, (J.w - 80) / 3);
  if (journalPage > 0) button("j-prev", { x: J.x + 24, y: by, w: bw, h: 40 }, "← Back", () => journalPage--);
  if (journalPage < pages - 1) button("j-next", { x: J.x + J.w - 24 - bw, y: by, w: bw, h: 40 }, "More →", () => journalPage++);
  button("j-close", { x: J.x + J.w / 2 - bw / 2, y: by, w: bw, h: 40 }, "Close", () => {
    journalOpen = false;
    focusId = null;
  }, true);
  text(`Page ${journalPage + 1} of ${pages}`, J.x + J.w / 2, by - 8, "12px Georgia, serif", "#7a4a26");
}

// ---------- Overlays ----------
function overlay(title, sub, extra) {
  ctx.fillStyle = "rgba(26, 18, 12, 0.5)";
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
  text(sub, W / 2, H / 2 + 18, "18px Georgia, serif", GOLD);
  if (extra) text(extra, W / 2, H / 2 + 44, "15px Georgia, serif", PAPER);
}

function drawSummary() {
  ctx.fillStyle = "rgba(26, 18, 12, 0.6)";
  ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - 32, 470),
    ph = Math.min(H - 32, 470);
  const x = W / 2 - pw / 2,
    y = H / 2 - ph / 2;
  ctx.fillStyle = "rgba(26, 18, 12, 0.95)";
  roundRect(x, y, pw, ph, 14);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawLogo(W / 2, y + 14, 30);
  text("Season complete!", W / 2, y + 88, "bold 30px Georgia, serif", PAPER);
  const v = stats.visits;
  const flyers = (v.monarch || 0) + (v.swallowtail || 0);
  const rows = [
    ["Okra pods picked", stats.okra],
    ["Watermelons harvested", stats.melons],
    ["Flower bloom days", stats.bloomDays],
    ["Bee visits", v.bee || 0],
    ["Butterfly visits", flyers],
    ["Hummingbird & goldfinch visits", (v.hummingbird || 0) + (v.goldfinch || 0)],
    ["Monarch caterpillars", stats.caterpillars],
    ["Journal pages", `${journal.size} / ${JOURNAL_ORDER.length}`],
  ];
  let yy = y + 122;
  const lh = Math.min(28, (ph - 230) / rows.length);
  for (const [label, val] of rows) {
    text(label, x + 34, yy, "16px Georgia, serif", PAPER, "left");
    text(String(val), x + pw - 34, yy, "bold 16px Georgia, serif", GOLD, "right");
    yy += lh;
  }
  R(x + 30, yy - 10, pw - 60, 1, "rgba(212,166,74,0.5)");
  text(`Points: ${score}   ·   Best: ${best}`, W / 2, yy + 20, "bold 20px Georgia, serif", PAPER);
  text("Press Enter or tap to plant a new season", W / 2, y + ph - 22, "16px Georgia, serif", GOLD);
}

// ---------- Main draw ----------
function draw() {
  targets = [];
  if (state === "ready") {
    drawPick();
    targets = [];
    overlay("Seed Library Garden", "Press Enter or tap to start", "Grow your world!");
    addTarget("start", { x: 0, y: 0, w: W, h: H }, newSeason);
  } else if (state === "pick") drawPick();
  else drawGarden();

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 400));
    R(p.x, p.y, p.size, p.size * 0.8, p.color);
  }
  ctx.globalAlpha = 1;
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 400));
    const font = `bold ${p.big ? 18 : 16}px Georgia, serif`;
    ctx.font = font;
    const tw = ctx.measureText(p.text).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.85)";
    roundRect(p.x - tw / 2 - 10, p.y - 20, tw + 20, 28, 8);
    text(p.text, p.x, p.y, font, p.big ? GOLD : PAPER);
  }
  ctx.globalAlpha = 1;
  if (banner && state === "garden") {
    ctx.globalAlpha = Math.max(0, Math.min(1, banner.life / 400));
    const cx = L.scene.x + L.scene.w / 2;
    ctx.font = "bold 24px Georgia, serif";
    const tw = ctx.measureText(banner.text).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.85)";
    roundRect(cx - tw / 2 - 18, L.beds.y - 6, tw + 36, 40, 10);
    text(banner.text, cx, L.beds.y + 22, "bold 24px Georgia, serif", PAPER);
    ctx.globalAlpha = 1;
  }

  if (state === "over") {
    targets = [];
    drawSummary();
    addTarget("start", { x: 0, y: 0, w: W, h: H }, newSeason);
  }
  if (journalOpen && state !== "over") drawJournal();
  if (paused) {
    targets = [];
    overlay("Shh… paused", "Press P or tap to keep gardening");
    addTarget("resume", { x: 0, y: 0, w: W, h: H }, () => (paused = false));
  }
  drawFocus();
}

function drawFocus() {
  if (!keyboardUsed) return;
  const t = targets.find((t) => t.id === focusId);
  if (!t || (t.w >= W && t.h >= H)) return;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(t.x - 3, t.y - 3, t.w + 6, t.h + 6);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = GOLD;
  ctx.strokeRect(t.x - 6, t.y - 6, t.w + 12, t.h + 12);
}

// ---------- Update / loop ----------
function update(dt) {
  if (paused) return;
  time += dt;
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.grav) p.vy += 0.0008 * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) {
    p.life -= dt;
    p.y -= 0.03 * dt;
  }
  popups = popups.filter((p) => p.life > 0);
  if (banner) {
    banner.life -= dt;
    if (banner.life <= 0) banner = null;
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

// ---------- Input ----------
function toCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const p = toCanvas(e);
  // later targets are drawn on top, so check them first
  for (let i = targets.length - 1; i >= 0; i--) {
    if (inside(targets[i], p.x, p.y)) {
      focusId = targets[i].id;
      targets[i].act();
      return;
    }
  }
});

// Arrow keys move a highlight between buttons, drawers, packets and garden spots.
function moveFocus(dx, dy) {
  if (!targets.length) return;
  let cur = targets.find((t) => t.id === focusId);
  if (!cur) {
    focusId = targets[0].id;
    return;
  }
  const cx = cur.x + cur.w / 2,
    cy = cur.y + cur.h / 2;
  let bestT = null,
    bestScore = Infinity;
  for (const t of targets) {
    if (t === cur) continue;
    const tx = t.x + t.w / 2 - cx,
      ty = t.y + t.h / 2 - cy;
    const along = tx * dx + ty * dy;
    if (along <= 4) continue;
    const across = Math.abs(tx * dy - ty * dx);
    const sc = along + across * 2.5;
    if (sc < bestScore) {
      bestScore = sc;
      bestT = t;
    }
  }
  if (bestT) focusId = bestT.id;
}

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
document.addEventListener("keydown", (e) => {
  if (ARROWS[e.code]) {
    e.preventDefault();
    keyboardUsed = true;
    moveFocus(...ARROWS[e.code]);
    return;
  }
  if (e.code === "KeyM") return toggleMute();
  if (e.code === "KeyP") {
    if (state === "pick" || state === "garden") paused = !paused;
    return;
  }
  if (e.code === "Escape") {
    if (journalOpen) {
      journalOpen = false;
      focusId = null;
    } else if (state === "pick" || state === "garden") paused = !paused;
    return;
  }
  if (paused) {
    if (e.code === "Enter" || e.code === "Space") {
      e.preventDefault();
      paused = false;
    }
    return;
  }
  if (e.code === "KeyJ" && (state === "garden" || state === "pick")) {
    if (journalOpen) journalOpen = false;
    else openJournal();
    return;
  }
  if (e.code === "KeyN" && state === "garden" && !journalOpen) return nextDay();
  if (e.code === "Enter" || e.code === "Space") {
    e.preventDefault();
    if (e.repeat) return;
    keyboardUsed = true;
    const t = targets.find((t) => t.id === focusId) || (targets.length === 1 ? targets[0] : null);
    if (t) t.act();
    else if (targets.length) focusId = targets[0].id;
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && (state === "pick" || state === "garden")) paused = true;
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if ((window.innerWidth < 700) !== portrait) layout();
  }, 150);
});

// ---------- Go ----------
layout();
day = 1;
weather = "sunny";
plots = Array.from({ length: PLOT_COUNT }, emptyPlot);
bag = [];
selected = 0;
takenToday = {};
takenTotal = 0;
stats = { okra: 0, melons: 0, bloomDays: 0, visits: {}, caterpillars: 0, pages: 0 };
score = 0;
requestAnimationFrame(frame);

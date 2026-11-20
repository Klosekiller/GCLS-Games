// Globe Trotter: spin the lobby globe and find continents and oceans from clues.
//
// How the globe works: at startup the continents are painted onto a hidden flat
// world map (720 × 360, half a degree per pixel) that records which place every
// spot belongs to. Each frame, every pixel of the globe is turned back into a
// longitude/latitude and looked up in that map. Taps use the exact same lookup,
// so whatever a child sees under their finger is what they picked.

// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 860,
  H = 560;

// ---------- Tunables ----------
const DEG = Math.PI / 180;
const STOPS = 10; // questions per trip
const POINTS = [100, 60, 30]; // for a right answer on try 1, 2, 3
const MAX_TRIES = 3;
const KEY_SPIN = 0.09; // degrees per ms when spinning with the arrow keys
const MAX_TILT = 75; // how far north/south the globe can tip
const MAP_W = 720,
  MAP_H = 360;

// ---------- Palette ----------
const RIGHT = "#a6e08f";
const WRONG = "#ffb4a8";

// ---------- Places ----------
// Outlines are simplified [longitude, latitude] points: close enough for spotting
// continents, not for navigation!
const LAND = {
  africa: [
    [[-17, 21], [-16, 28], [-10, 30], [-9, 33], [-6, 36], [0, 36], [10, 37], [11, 34], [20, 31], [25, 32], [32, 31], [33, 28], [36, 22], [39, 16], [43, 12], [51, 12], [51, 10], [48, 5], [42, -1], [40, -10], [40, -16], [35, -24], [32, -29], [27, -34], [20, -35], [18.2, -34.4], [18, -32], [15, -27], [12, -18], [13, -12], [9, -1], [10, 4], [6, 4], [2, 6], [-4, 5], [-8, 4], [-13, 8], [-17, 14]],
    [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]], // Madagascar
  ],
  asia: [
    [[178, 63], [172, 61], [164, 60], [162, 56], [160, 53], [157, 51], [156, 57], [160, 61], [155, 60], [147, 59], [142, 59], [137, 54], [141, 52], [140, 48], [135, 43], [132, 43], [130, 42], [129, 36], [127, 35], [126, 37], [125, 40], [122, 40], [121, 39], [122, 37], [119, 35], [121, 32], [122, 29], [120, 26], [117, 24], [113, 22], [110, 21], [108, 21], [106, 18], [108, 15], [109, 12], [107, 10], [105, 9], [103, 10], [100, 13], [101, 7], [103, 5], [104, 1.5], [101, 3], [98, 8], [98, 15], [97, 17], [94, 17], [92, 21], [89, 22], [86, 20], [82, 17], [80, 15], [80, 10], [77, 8], [75, 12], [73, 16], [72, 21], [69, 22], [67, 25], [61, 25], [57, 26], [56, 27], [52, 28], [50, 30], [48, 30], [50, 26], [51, 24], [56, 24], [56, 26], [59, 22], [57, 19], [55, 17], [52, 16], [45, 13], [43, 13.5], [42, 16], [39, 21], [35, 28], [34, 30], [34.5, 31.5], [35, 33], [36, 36], [33, 36], [30, 36], [27, 37], [26, 40], [29, 41], [31, 41], [36, 42], [41, 41], [40, 43], [48, 42], [50, 45], [52, 47], [60, 50], [60, 68], [70, 73], [80, 73], [90, 76], [105, 78], [115, 74], [130, 72], [140, 72], [150, 71], [160, 70], [170, 70], [180, 68], [180, 65]],
    [[130, 31], [132, 34], [135, 34], [140, 35], [141, 38], [142, 42], [145, 44], [141, 45], [140, 42], [139, 38], [136, 36], [132, 35], [130, 33]], // Japan
    [[95, 5], [98, 4], [106, -6], [104, -6], [100, -2]], // Sumatra
    [[109, 1], [111, -3], [116, -4], [119, 1], [117, 7], [113, 4]], // Borneo
    [[105, -6], [114, -7], [114, -8.5], [106, -7.5]], // Java
    [[120, 18], [122, 18], [124, 13], [126, 8], [125, 6], [122, 7], [121, 13]], // Philippines
    [[80, 10], [82, 7], [80, 6]], // Sri Lanka
  ],
  europe: [
    [[-9, 37], [-6, 36], [-2, 37], [0, 39], [3, 42], [5, 43], [9, 44], [11, 42], [16, 38], [17, 40], [13, 45], [15, 45], [19, 42], [20, 40], [23, 37], [26, 40], [29, 41], [28, 44], [30, 46], [34, 45], [38, 47], [40, 43], [48, 42], [50, 45], [52, 47], [60, 50], [60, 68], [50, 68], [44, 66], [40, 66], [33, 69], [25, 71], [18, 70], [12, 66], [6, 62], [5, 59], [7, 58], [10, 59], [12, 56], [10, 57], [8, 57], [8, 54], [5, 53], [3, 51], [1, 50], [-2, 49], [-5, 48], [-2, 47], [-1, 45], [-2, 43.5], [-8, 44], [-9, 43]],
    [[-5, 50], [1, 51], [2, 53], [0, 54], [-2, 56], [-2, 58], [-5, 59], [-6, 57], [-5, 55], [-3, 54], [-5, 52]], // Great Britain
    [[-10, 52], [-6, 52], [-6, 55], [-8, 55], [-10, 54]], // Ireland
    [[-24, 65], [-14, 66], [-14, 64], [-22, 63]], // Iceland
  ],
  namerica: [
    [[-168, 66], [-162, 70], [-156, 71.5], [-140, 70], [-128, 70], [-115, 68], [-95, 72], [-82, 73], [-80, 63], [-94, 59], [-90, 57], [-82, 55], [-79, 52], [-77, 60], [-72, 62], [-65, 60], [-60, 55], [-56, 52], [-60, 47], [-66, 45], [-70, 42], [-74, 40], [-76, 35], [-81, 31], [-80, 25], [-82, 27], [-84, 30], [-89, 30], [-94, 29], [-97, 26], [-97, 22], [-94, 18], [-90, 21], [-87, 21], [-88, 16], [-84, 15], [-83, 10], [-79, 9.5], [-77, 8], [-80, 7.5], [-84, 9], [-86, 12], [-92, 14], [-96, 16], [-105, 20], [-110, 23], [-114, 30], [-117, 33], [-121, 35], [-124, 40], [-124, 47], [-123, 49], [-130, 54], [-135, 58], [-140, 60], [-147, 61], [-152, 59], [-158, 57], [-162, 55], [-160, 58], [-164, 60], [-166, 62], [-165, 64]],
    [[-73, 78], [-60, 82], [-30, 83], [-20, 80], [-20, 72], [-22, 70], [-30, 68], [-40, 65], [-43, 60], [-50, 62], [-53, 67], [-56, 72], [-66, 76]], // Greenland
    [[-85, 22], [-80, 23], [-74, 20], [-78, 20]], // Cuba
  ],
  samerica: [
    [[-77, 8], [-72, 12], [-63, 11], [-60, 8], [-52, 5], [-50, 0], [-44, -2], [-35, -5], [-35, -9], [-39, -14], [-39, -18], [-41, -22], [-48, -26], [-49, -29], [-53, -34], [-58, -35], [-57, -38], [-62, -39], [-65, -42], [-64, -46], [-68, -50], [-69, -53], [-68, -55], [-72, -54], [-75, -50], [-74, -44], [-73, -37], [-71, -30], [-70, -18], [-76, -14], [-80, -6], [-81, -4], [-80, 0], [-78, 2], [-77, 4]],
  ],
  australia: [
    [[114, -22], [114, -26], [115, -34], [118, -35], [124, -34], [130, -32], [135, -35], [138, -35], [140, -38], [147, -39], [150, -37], [153, -31], [153, -25], [149, -20], [146, -19], [145, -15], [142, -11], [141, -17], [136, -15], [137, -12], [132, -11], [129, -15], [126, -14], [122, -18]],
    [[145, -41], [148, -41], [147, -43.5]], // Tasmania
    [[173, -35], [178, -37.5], [177, -39], [175, -41.5], [174, -39]], // New Zealand (north)
    [[172, -41], [174, -41.5], [171, -44], [169, -46.5], [166, -46], [168, -44]], // New Zealand (south)
    [[131, -1], [141, -3], [150, -10], [143, -9], [138, -8], [132, -4]], // New Guinea
  ],
  antarctica: [
    [[-180, -78], [-160, -77], [-150, -76], [-130, -74], [-110, -74], [-100, -73], [-80, -73], [-70, -69], [-60, -64], [-58, -63], [-62, -66], [-60, -75], [-40, -78], [-30, -76], [-10, -71], [0, -70], [20, -70], [40, -69], [60, -67], [80, -67], [100, -66], [120, -66], [140, -66], [160, -70], [170, -72], [180, -78], [180, -90], [-180, -90]],
  ],
};

// Every place has an id (its index here). 1–7 continents, 8–12 oceans, 13+ seas
// that can be tapped (and named) but are never asked about.
const REGIONS = [
  null,
  { key: "africa", kind: "land", label: "Africa", short: "AFRICA", color: "#e3c25a", ink: "#b08a1f", center: [20, 5],
    clues: ["Find the continent where lions, giraffes and zebras roam the grasslands.", "Find the continent with the Sahara, the biggest hot desert in the world.", "Find the continent where the Nile River flows."],
    fact: "Africa has 54 countries, more than any other continent!" },
  { key: "asia", kind: "land", label: "Asia", short: "ASIA", color: "#e39b5a", ink: "#b0612a", center: [95, 45],
    clues: ["Find the biggest continent of all.", "Find the continent with Mount Everest, the tallest mountain on Earth.", "Find the continent where giant pandas munch bamboo."],
    fact: "More than half of all the people on Earth live in Asia!" },
  { key: "europe", kind: "land", label: "Europe", short: "EUROPE", color: "#b48ad0", ink: "#7d4f9a", center: [15, 52],
    clues: ["Find the continent where the Eiffel Tower stands.", "Find the continent with the snowy Alps mountains."],
    fact: "Europe has some of the smallest countries in the world, like Vatican City." },
  { key: "namerica", kind: "land", label: "North America", short: "N. AMERICA", color: "#6dbb6a", ink: "#3d7f3b", center: [-100, 45],
    clues: ["Find the continent we live on!", "Find the continent where bald eagles soar.", "Find the continent with the Grand Canyon."],
    fact: "Greenland, the biggest island in the world, is part of North America." },
  { key: "samerica", kind: "land", label: "South America", short: "S. AMERICA", color: "#a9d36b", ink: "#6a9a2a", center: [-60, -15],
    clues: ["Find the continent with the Amazon rainforest.", "Find the continent with the Andes, the longest mountain range on land.", "Find the continent where llamas live high in the mountains."],
    fact: "The Amazon River carries more water than any other river on Earth!" },
  { key: "australia", kind: "land", label: "Australia", short: "AUSTRALIA", color: "#e5807a", ink: "#b0463f", center: [134, -25],
    clues: ["Find the continent where kangaroos and koalas live.", "Find the continent with the Great Barrier Reef off its coast."],
    fact: "Australia is both a country and a continent!" },
  { key: "antarctica", kind: "land", label: "Antarctica", short: "ANTARCTICA", color: "#f4f6f8", ink: "#5a7fa8", center: [0, -80],
    clues: ["Find the coldest continent, where emperor penguins live.", "Find the continent that is almost completely covered in ice."],
    fact: "About 70% of Earth's fresh water is frozen in Antarctica's ice!" },
  { key: "pacific", kind: "ocean", label: "the Pacific Ocean", short: "PACIFIC", ink: "#2463a3", center: [-150, 0],
    clues: ["Find the biggest and deepest ocean.", "Find the ocean between Asia and the Americas."],
    fact: "The Pacific is bigger than all the land on Earth put together!" },
  { key: "atlantic", kind: "ocean", label: "the Atlantic Ocean", short: "ATLANTIC", ink: "#2463a3", center: [-35, 25],
    clues: ["Find the ocean between the Americas and Africa.", "Find the ocean you would cross to sail from North America to Europe."],
    fact: "The Atlantic is the second-biggest ocean in the world." },
  { key: "indian", kind: "ocean", label: "the Indian Ocean", short: "INDIAN", ink: "#2463a3", center: [75, -20],
    clues: ["Find the ocean just south of India.", "Find the ocean between Africa and Australia."],
    fact: "The Indian Ocean is the warmest ocean in the world." },
  { key: "arctic", kind: "ocean", label: "the Arctic Ocean", short: "ARCTIC", ink: "#2463a3", center: [0, 82],
    clues: ["Find the icy ocean at the top of the world, where polar bears hunt.", "Find the ocean around the North Pole."],
    fact: "The Arctic is the smallest and shallowest ocean." },
  { key: "southern", kind: "ocean", label: "the Southern Ocean", short: "SOUTHERN", ink: "#2463a3", center: [60, -63],
    clues: ["Find the ocean that circles all the way around Antarctica."],
    fact: "The Southern Ocean is the newest ocean to get its own name." },
  { key: "med", kind: "sea", label: "the Mediterranean Sea" },
  { key: "black", kind: "sea", label: "the Black Sea" },
  { key: "caspian", kind: "sea", label: "the Caspian Sea" },
];
const ID = {};
REGIONS.forEach((r, i) => r && (ID[r.key] = i));
const CONTINENTS = REGIONS.map((r, i) => i).filter((i) => REGIONS[i] && REGIONS[i].kind === "land");
const OCEANS = REGIONS.map((r, i) => i).filter((i) => REGIONS[i] && REGIONS[i].kind === "ocean");
const STAMP_IDS = [...CONTINENTS, ...OCEANS]; // 12 passport stamps

// Which body of water a spot belongs to (only used where there's no land).
// Ocean borders are conventions anyway; these simple rules match the usual ones.
function waterAt(lon, lat) {
  if (lat <= -60) return "southern";
  if (lat >= 66) return "arctic";
  if (lon >= 27 && lon <= 42 && lat >= 40.5 && lat <= 47.5) return "black";
  if (lon >= 46 && lon <= 55 && lat >= 36 && lat <= 47.5) return "caspian";
  if (lon >= -5.6 && lon <= 37 && lat >= 30 && lat <= 46 && (lon > 0 || lat < 40)) return "med";
  if (lat < 30 && lon >= 20 && lon < 147 && (lon < 100 || lat < -8)) return "indian";
  const west = lat > 20 ? -100 : lat > 8 ? -84 : -70;
  if (lon >= west && lon <= 20) return "atlantic";
  return "pacific";
}

// ---------- The hidden world map ----------
const idMap = new Uint8Array(MAP_W * MAP_H);
const colorMap = new Uint8ClampedArray(MAP_W * MAP_H * 3);

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildMaps() {
  const c = document.createElement("canvas");
  c.width = MAP_W;
  c.height = MAP_H;
  const g = c.getContext("2d", { willReadFrequently: true });
  // Paint each continent on its own so soft (antialiased) edges never mix two ids.
  REGIONS.forEach((reg, id) => {
    if (!reg || reg.kind !== "land") return;
    g.clearRect(0, 0, MAP_W, MAP_H);
    g.fillStyle = "#000";
    for (const poly of LAND[reg.key]) {
      g.beginPath();
      poly.forEach(([lon, lat], i) => {
        const x = ((lon + 180) / 360) * MAP_W,
          y = ((90 - lat) / 180) * MAP_H;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
      g.fill();
    }
    const a = g.getImageData(0, 0, MAP_W, MAP_H).data;
    for (let i = 0; i < MAP_W * MAP_H; i++) if (a[i * 4 + 3] >= 128) idMap[i] = id;
  });

  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      if (!idMap[i]) idMap[i] = ID[waterAt(((x + 0.5) / MAP_W) * 360 - 180, 90 - ((y + 0.5) / MAP_H) * 180)];
    }

  // Colors, with darker coastlines on land, shallow water near coasts and
  // faint latitude/longitude lines every 30° on the sea.
  const isLand = (x, y) => {
    x = (x + MAP_W) % MAP_W;
    if (y < 0 || y >= MAP_H) return false;
    return REGIONS[idMap[y * MAP_W + x]].kind === "land";
  };
  const deep = [47, 127, 196],
    pale = [111, 176, 224],
    shallow = [143, 201, 238];
  for (let y = 0; y < MAP_H; y++) {
    const lat = 90 - ((y + 0.5) / MAP_H) * 180;
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const land = isLand(x, y);
      const edge = land !== isLand(x + 1, y) || land !== isLand(x - 1, y) || land !== isLand(x, y + 1) || land !== isLand(x, y - 1);
      let rgb;
      if (land) {
        rgb = hexToRgb(REGIONS[idMap[i]].color);
        if (edge) rgb = rgb.map((v) => v * 0.68);
      } else {
        const t = (Math.abs(lat) / 90) * 0.6;
        rgb = deep.map((v, k) => v + (pale[k] - v) * t);
        if (edge) rgb = rgb.map((v, k) => v + (shallow[k] - v) * 0.5);
        else if (x % 60 === 0 || y % 60 === 0) rgb = rgb.map((v) => v + (255 - v) * 0.16);
      }
      colorMap[i * 3] = rgb[0];
      colorMap[i * 3 + 1] = rgb[1];
      colorMap[i * 3 + 2] = rgb[2];
    }
  }
}
buildMaps();

function regionAt(lon, lat) {
  let L = lon + 180;
  L -= 360 * Math.floor(L / 360);
  const mx = Math.min(MAP_W - 1, Math.floor((L / 360) * MAP_W));
  const my = Math.max(0, Math.min(MAP_H - 1, Math.floor(((90 - lat) / 180) * MAP_H)));
  return idMap[my * MAP_W + mx];
}

// ---------- Layout (wide screens vs. phones) ----------
let G, L; // globe {cx, cy, r} and panel boxes
let portrait = false;

function layout() {
  portrait = window.innerWidth < 700;
  if (portrait) {
    W = 520;
    H = 900;
    G = { cx: 260, cy: 264, r: 165 };
    L = {
      floor: 454,
      sign: { x: 20, y: 14, w: 480, h: 50 },
      clue: { x: 20, y: 496, w: 480, h: 158 },
      score: { x: 20, y: 664, w: 480, h: 44 },
      pass: { x: 20, y: 718, w: 480, h: 168 },
      cols: 6,
    };
  } else {
    W = 860;
    H = 560;
    G = { cx: 272, cy: 250, r: 188 };
    L = {
      floor: 472,
      sign: { x: 530, y: 20, w: 310, h: 52 },
      clue: { x: 530, y: 84, w: 310, h: 190 },
      score: { x: 530, y: 286, w: 310, h: 46 },
      pass: { x: 530, y: 344, w: 310, h: 196 },
      cols: 4,
    };
  }
  canvas.width = W;
  canvas.height = H;
  canvas.style.maxWidth = W + "px";
  prepDisk();
}

// Per-pixel geometry for the globe disk only changes with the layout, so it's
// worked out once: each pixel's 3D position on the sphere and its lighting.
const gcan = document.createElement("canvas");
const gctx = gcan.getContext("2d");
let disk, globeImg;

function prepDisk() {
  const r = G.r,
    D = Math.ceil(r * 2);
  gcan.width = D;
  gcan.height = D;
  globeImg = gctx.createImageData(D, D);
  const xs = [], ys = [], zs = [], shade = [], off = [];
  const len = Math.hypot(-0.45, 0.55, 0.7);
  const lx = -0.45 / len, ly = 0.55 / len, lz = 0.7 / len; // light from top-left
  for (let py = 0; py < D; py++)
    for (let px = 0; px < D; px++) {
      const nx = (px + 0.5 - r) / r,
        ny = (r - (py + 0.5)) / r;
      const rho = nx * nx + ny * ny;
      if (rho > 1) continue;
      const nz = Math.sqrt(1 - rho);
      xs.push(nx);
      ys.push(ny);
      zs.push(nz);
      const light = Math.max(0, nx * lx + ny * ly + nz * lz);
      shade.push((0.5 + 0.55 * light) * (0.82 + 0.18 * nz));
      off.push((py * D + px) * 4);
    }
  disk = {
    n: xs.length,
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    z: Float32Array.from(zs),
    shade: Float32Array.from(shade),
    off: Int32Array.from(off),
  };
  dirty = true;
}

// ---------- State ----------
let lon0 = -80, // longitude at the center of the globe
  lat0 = 20; // latitude at the center
let vLon = 0,
  vLat = 0; // spin left over after a drag (degrees per ms)
let tween = null;
let drag = null;
let dirty = true;
let lastRender = { lon: null, lat: null };
const hlA = new Float32Array(REGIONS.length),
  hlRGB = new Float32Array(REGIONS.length * 3),
  prevHlA = new Float32Array(REGIONS.length);

let state = "ready"; // ready | playing | paused | over
let phase = "ask"; // ask | result (while playing)
let trip = [],
  stop = 0,
  tries = 0,
  score = 0;
let feedback = "",
  feedbackColor = PAPER,
  resultFact = "",
  resultRight = false;
let flashes = [],
  pins = [],
  popups = [],
  particles = [];
let stampAnim = null;
let keyboardUsed = false;
let time = 0;
let best = Number(safeGet("globe-best")) || 0;
let stamps = new Set(loadStamps());

function loadStamps() {
  try {
    const s = JSON.parse(safeGet("globe-stamps") || "[]");
    return Array.isArray(s) ? s.filter((k) => ID[k]) : [];
  } catch {
    return [];
  }
}
function saveStamps() {
  safeSet("globe-stamps", JSON.stringify([...stamps]));
}

// ---------- Trip ----------
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pickOne = (a) => a[(Math.random() * a.length) | 0];

// 3 continents by name, 4 continents by clue, then 3 oceans (name or clue).
function buildTrip() {
  const lands = shuffle([...CONTINENTS]);
  const seas = shuffle([...OCEANS]).slice(0, 3);
  const nameQ = (id) => ({ id, text: `Find ${REGIONS[id].label}!` });
  const clueQ = (id) => ({ id, text: pickOne(REGIONS[id].clues) });
  return [
    ...lands.slice(0, 3).map(nameQ),
    ...lands.slice(3, 7).map(clueQ),
    ...seas.map((id) => (Math.random() < 0.5 ? nameQ(id) : clueQ(id))),
  ];
}

function startTrip() {
  trip = buildTrip();
  stop = 0;
  score = 0;
  state = "playing";
  pins = [];
  flashes = [];
  sfx.start();
  ask();
}

function ask() {
  phase = "ask";
  tries = 0;
  feedback = "";
  resultFact = "";
}

function nextStop() {
  stop++;
  pins = [];
  if (stop >= STOPS) return finishTrip();
  ask();
}

function finishTrip() {
  state = "over";
  phase = "ask";
  sfx.done();
  if (score > best) {
    best = score;
    safeSet("globe-best", best);
  }
}

function capital(s) {
  return s[0].toUpperCase() + s.slice(1);
}

function choose(id, lon, lat) {
  if (state !== "playing") return;
  if (phase === "result") return nextStop();
  if (!id) return;
  const q = trip[stop];
  const reg = REGIONS[id];
  if (id === q.id) {
    const pts = POINTS[tries];
    score += pts;
    resultRight = true;
    feedback = `Yes! That's ${reg.label}! +${pts}`;
    feedbackColor = RIGHT;
    resultFact = reg.fact;
    phase = "result";
    flashes.push({ id, rgb: [255, 214, 102], life: 900, max: 900 });
    pins.push({ lon, lat, color: "#2f9e44", label: capital(reg.label) });
    popups.push({ text: "+" + pts, lon, lat, life: 1100 });
    confetti(lon, lat);
    sfx.right();
    if (!stamps.has(reg.key)) {
      stamps.add(reg.key);
      saveStamps();
      stampAnim = { id, t: 0 };
      setTimeout(() => sfx.stamp(), 350);
    }
  } else {
    tries++;
    flashes.push({ id, rgb: [235, 87, 87], life: 700, max: 700 });
    pins.push({ lon, lat, color: "#c0392b", life: 1200 });
    if (tries >= MAX_TRIES) return reveal(q.id, reg);
    feedback = `That's ${reg.label}. Try again!`;
    feedbackColor = WRONG;
    sfx.wrong();
  }
}

// After three misses, spin the globe to the answer and point it out.
function reveal(id, lastPick) {
  const reg = REGIONS[id];
  resultRight = false;
  feedback = `That was ${lastPick.label}. Here's ${reg.label}!`;
  feedbackColor = PAPER;
  resultFact = reg.fact;
  phase = "result";
  spinTo(reg.center[0], reg.center[1]);
  pins.push({ lon: reg.center[0], lat: reg.center[1], color: GOLD, label: capital(reg.label) });
  sfx.reveal();
}

function spinTo(lon, lat) {
  const dLon = ((lon - lon0 + 540) % 360) - 180;
  tween = { lon: lon0, lat: lat0, dLon, dLat: clampLat(lat) - lat0, t: 0, dur: 1100 };
  vLon = vLat = 0;
}

// ---------- Projection ----------
function clampLat(v) {
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, v));
}
function wrapLon(v) {
  return ((((v + 180) % 360) + 360) % 360) - 180;
}

// longitude/latitude → position on screen (z < 0 means it's on the far side)
function project(lon, lat) {
  const p0 = lat0 * DEG,
    l = (lon - lon0) * DEG,
    p = lat * DEG;
  const x = Math.cos(p) * Math.sin(l);
  const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l);
  const z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  return { x: G.cx + G.r * x, y: G.cy - G.r * y, z };
}

// screen position → longitude/latitude, or null if it's off the globe
function unproject(sx, sy) {
  const x = (sx - G.cx) / G.r,
    y = (G.cy - sy) / G.r;
  const rho = x * x + y * y;
  if (rho > 1) return null;
  const z = Math.sqrt(1 - rho);
  const cp = Math.cos(lat0 * DEG),
    sp = Math.sin(lat0 * DEG);
  const lat = Math.asin(Math.max(-1, Math.min(1, y * cp + z * sp))) / DEG;
  const lon = wrapLon(lon0 + Math.atan2(x, z * cp - y * sp) / DEG);
  return { lon, lat };
}

function renderGlobe() {
  const d = globeImg.data;
  const cp = Math.cos(lat0 * DEG),
    sp = Math.sin(lat0 * DEG),
    l0 = lon0 + 180; // map x starts at longitude -180
  const { n, x: X, y: Y, z: Z, shade: S, off: O } = disk;
  const toMap = MAP_W / 360;
  for (let k = 0; k < n; k++) {
    const x = X[k],
      y = Y[k],
      z = Z[k];
    let s = y * cp + z * sp;
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    const lat = Math.asin(s) / DEG;
    let L = l0 + Math.atan2(x, z * cp - y * sp) / DEG;
    L -= 360 * Math.floor(L / 360);
    let mx = (L * toMap) | 0;
    if (mx >= MAP_W) mx = MAP_W - 1;
    let my = ((90 - lat) * toMap) | 0;
    if (my >= MAP_H) my = MAP_H - 1;
    const mi = my * MAP_W + mx;
    const id = idMap[mi];
    let r = colorMap[mi * 3],
      g = colorMap[mi * 3 + 1],
      b = colorMap[mi * 3 + 2];
    const a = hlA[id];
    if (a > 0) {
      r += (hlRGB[id * 3] - r) * a;
      g += (hlRGB[id * 3 + 1] - g) * a;
      b += (hlRGB[id * 3 + 2] - b) * a;
    }
    const sh = S[k],
      o = O[k];
    d[o] = r * sh;
    d[o + 1] = g * sh;
    d[o + 2] = b * sh;
    d[o + 3] = 255;
  }
  gctx.putImageData(globeImg, 0, 0);
}

// Work out highlight tints for this frame; returns true if they changed.
function updateHighlights() {
  hlA.fill(0);
  for (const f of flashes) {
    const a = 0.65 * (f.life / f.max);
    if (a > hlA[f.id]) {
      hlA[f.id] = a;
      hlRGB.set(f.rgb, f.id * 3);
    }
  }
  if (state === "playing" && phase === "result") {
    const id = trip[stop].id;
    const a = 0.3 + 0.2 * Math.sin(time * 0.006);
    if (a > hlA[id]) {
      hlA[id] = a;
      hlRGB.set([255, 214, 102], id * 3);
    }
  }
  let changed = false;
  for (let i = 0; i < hlA.length; i++) if (Math.abs(hlA[i] - prevHlA[i]) > 0.004) changed = true;
  if (changed) prevHlA.set(hlA);
  return changed;
}

// ---------- Update ----------
const keys = { left: false, right: false, up: false, down: false };

function update(dt) {
  time += dt;
  updateEffects(dt);
  if (state === "paused") return;

  const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
    ky = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  if (kx || ky) {
    tween = null;
    vLon = vLat = 0;
    lon0 += kx * KEY_SPIN * dt;
    lat0 = clampLat(lat0 + ky * KEY_SPIN * dt);
  } else if (tween) {
    tween.t += dt;
    const k = Math.min(1, tween.t / tween.dur),
      e = 1 - Math.pow(1 - k, 3);
    lon0 = tween.lon + tween.dLon * e;
    lat0 = tween.lat + tween.dLat * e;
    if (k >= 1) tween = null;
  } else if (!drag && (Math.abs(vLon) > 0.0005 || Math.abs(vLat) > 0.0005)) {
    lon0 += vLon * dt;
    lat0 = clampLat(lat0 + vLat * dt);
    const f = Math.exp(-dt / 300);
    vLon *= f;
    vLat *= f;
  } else if (state === "ready" || state === "over") {
    lon0 += dt * 0.012; // gentle idle spin
  }
  lon0 = wrapLon(lon0);
}

function updateEffects(dt) {
  for (const f of flashes) f.life -= dt;
  flashes = flashes.filter((f) => f.life > 0);
  for (const p of pins) if (p.life !== undefined) p.life -= dt;
  pins = pins.filter((p) => p.life === undefined || p.life > 0);
  for (const p of popups) {
    p.life -= dt;
    p.rise = (p.rise || 0) + dt * 0.03;
  }
  popups = popups.filter((p) => p.life > 0);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.0008 * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  if (stampAnim) {
    stampAnim.t += dt;
    if (stampAnim.t > 1600) stampAnim = null;
  }
}

function confetti(lon, lat) {
  const p = project(lon, lat);
  const colors = ["#c92a2f", "#3d4c8c", "#e8b52a", "#ffffff"];
  for (let i = 0; i < 22; i++) {
    particles.push({
      x: p.x, y: p.y,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -Math.random() * 0.35 - 0.05,
      life: 600 + Math.random() * 500,
      color: colors[i % colors.length],
    });
  }
}

// ---------- Sound (Web Audio API, no files needed) ----------
setupSound("globe");

const sfx = {
  right: () => [523, 659, 784].forEach((f, i) => tone(f, f, 0.14, "sine", 0.13, i * 0.08)),
  wrong: () => {
    tone(330, 300, 0.12, "triangle", 0.1);
    tone(262, 240, 0.16, "triangle", 0.1, 0.1);
  },
  stamp: () => {
    tone(150, 70, 0.12, "square", 0.14);
    tone(900, 900, 0.04, "square", 0.04);
  },
  reveal: () => tone(440, 660, 0.35, "sine", 0.1),
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, "triangle", 0.12, i * 0.11)),
  start: () => {
    tone(523, 523, 0.08, "triangle", 0.12);
    tone(784, 784, 0.12, "triangle", 0.12, 0.08);
  },
};

// ---------- Drawing helpers ----------
// Draws wrapped text; returns the y below the last line.
function wrap(str, x, y, maxW, lineH, font, color, align = "left") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
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
  return y + lineH;
}
function box(b, fill = NAVY) {
  R(b.x, b.y, b.w, b.h, fill);
  ctx.strokeStyle = MAPLE;
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
}

// ---------- Drawing: the lobby ----------
function drawRoom() {
  // wall, ceiling and recessed lights
  R(0, 0, W, H, "#c8cdd4");
  R(0, 0, W, 34, "#ecebe7");
  for (let x = 60; x < W; x += 140) {
    ctx.fillStyle = "#fff6d8";
    ctx.beginPath();
    ctx.ellipse(x, 24, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  R(0, 34, W, 2, "#d5d3cd");

  // maple paneling, like the walls around the Meeting Room
  const top = 64;
  R(0, top, W, L.floor - top, "#d49853");
  R(0, top, W, 30, "#cf914b");
  R(0, top + 30, W, 2, "#b07636");
  for (let x = 90; x < W; x += 110) R(x, top + 32, 2, L.floor - top - 32, "#b07636");
  if (!portrait) text("M E E T I N G   R O O M", 120, top + 21, "bold 13px system-ui, sans-serif", "#f4efe6");

  // slate tile floor
  R(0, L.floor, W, H - L.floor, "#3b3c43");
  for (let y = L.floor + 18; y < H; y += 28) R(0, y, W, 1, "#2b2c31");
  for (let x = 0; x < W; x += 70) R(x, L.floor, 1, H - L.floor, "#2b2c31");
}

function drawGlobeStand(front) {
  const { cx, cy, r } = G;
  const rx = r * 1.3,
    ry = r * 0.13;
  const railY = L.floor - r * 0.26,
    baseY = L.floor - r * 0.04;
  if (!front) {
    // back half of the railing, then the pedestal
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#cfa265";
    ctx.beginPath();
    ctx.ellipse(cx, railY, rx, ry, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    R(cx - r * 0.4, L.floor - 10, r * 0.8, 10, "#222");
    ctx.fillStyle = "#b9bec4";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.17, L.floor - 8);
    ctx.lineTo(cx - r * 0.09, cy + r - 6);
    ctx.lineTo(cx + r * 0.09, cy + r - 6);
    ctx.lineTo(cx + r * 0.17, L.floor - 8);
    ctx.fill();
    return;
  }
  // glass panels and the wood rail in front
  ctx.fillStyle = "rgba(200, 230, 240, 0.2)";
  ctx.beginPath();
  ctx.ellipse(cx, railY, rx, ry, 0, 0, Math.PI);
  ctx.ellipse(cx, baseY, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  for (let a = 0.15; a < Math.PI; a += Math.PI / 10) {
    const px = cx + Math.cos(a) * rx,
      py = railY + Math.sin(a) * ry;
    R(px - 1.5, py, 3, baseY - railY, "#a9b0b8");
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#9aa1a9";
  ctx.beginPath();
  ctx.ellipse(cx, baseY, rx, ry, 0, 0, Math.PI);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#d6a868";
  ctx.beginPath();
  ctx.ellipse(cx, railY, rx, ry, 0, 0, Math.PI);
  ctx.stroke();
}

function drawGlobe() {
  const changed = updateHighlights();
  if (dirty || changed || lon0 !== lastRender.lon || lat0 !== lastRender.lat) {
    renderGlobe();
    lastRender = { lon: lon0, lat: lat0 };
    dirty = false;
  }
  const { cx, cy, r } = G;
  // soft glow behind
  const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.12);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.35)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);

  ctx.drawImage(gcan, cx - r, cy - r);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(15, 40, 70, 0.7)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // pins
  for (const p of pins) drawPin(p);

  // ring for keyboard players: Enter picks the spot inside it
  if (state === "playing" && phase === "ask" && keyboardUsed) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    R(cx - 1, cy - 1, 2, 2, "#fff");
  }
}

function drawPin(p) {
  const s = project(p.lon, p.lat);
  if (s.z < 0.05) return;
  ctx.globalAlpha = p.life !== undefined ? Math.min(1, p.life / 300) : 1;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(s.x - 6, s.y - 12);
  ctx.arc(s.x, s.y - 16, 7, Math.PI * 0.8, Math.PI * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(s.x, s.y - 16, 2.5, 0, Math.PI * 2);
  ctx.fill();
  if (p.label) {
    ctx.font = "bold 15px Georgia, serif";
    const tw = ctx.measureText(p.label).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.85)";
    roundRect(s.x - tw / 2 - 8, s.y - 50, tw + 16, 24, 6);
    text(p.label, s.x, s.y - 33, "bold 15px Georgia, serif", PAPER);
  }
  ctx.globalAlpha = 1;
}

// ---------- Drawing: the side panel ----------
function drawPanel() {
  // wood sign with the library logo
  const s = L.sign;
  R(s.x, s.y, s.w, s.h, MAPLE);
  R(s.x, s.y + s.h - 5, s.w, 5, "#b07636");
  drawLogo(s.x + 24, s.y + 6, 28);
  text("Globe Trotter", s.x + 46 + (s.w - 46) / 2, s.y + 33, "bold 24px Georgia, serif", "#f4efe6");

  // clue card
  const c = L.clue;
  box(c);
  const pad = 16;
  if (state === "ready" || !trip.length) {
    text("HOW TO PLAY", c.x + pad, c.y + 24, "bold 12px system-ui, sans-serif", GOLD, "left");
    wrap("Read the clue, spin the globe, then tap the right place. Each right answer stamps your passport!", c.x + pad, c.y + 52, c.w - pad * 2, 24, "bold 18px Georgia, serif", PAPER);
  } else {
    const shown = Math.min(stop, STOPS - 1);
    text(`STOP ${shown + 1} OF ${STOPS}`, c.x + pad, c.y + 24, "bold 12px system-ui, sans-serif", GOLD, "left");
    // tries left, as little globes
    for (let i = 0; i < MAX_TRIES; i++) {
      const used = i < tries;
      ctx.fillStyle = used ? "rgba(243, 234, 215, 0.2)" : "#5aa9e6";
      ctx.beginPath();
      ctx.arc(c.x + c.w - pad - 8 - i * 20, c.y + 20, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (phase === "ask" || state === "over") {
      let y = wrap(trip[shown].text, c.x + pad, c.y + 54, c.w - pad * 2, 25, "bold 19px Georgia, serif", PAPER);
      if (feedback && phase === "ask") wrap(feedback, c.x + pad, y + 4, c.w - pad * 2, 20, "italic 16px Georgia, serif", feedbackColor);
    } else {
      let y = wrap(feedback, c.x + pad, c.y + 54, c.w - pad * 2, 24, "bold 18px Georgia, serif", feedbackColor);
      y = wrap(resultFact, c.x + pad, y + 2, c.w - pad * 2, 20, "15px Georgia, serif", PAPER);
      text(stop + 1 < STOPS ? "Tap or press Enter for the next stop →" : "Tap or press Enter to finish your trip →", c.x + pad, c.y + c.h - 14, "bold 13px system-ui, sans-serif", GOLD, "left");
    }
  }

  // score
  const sc = L.score;
  box(sc);
  text("SCORE", sc.x + pad, sc.y + 29, "bold 12px system-ui, sans-serif", GOLD, "left");
  text(String(score), sc.x + pad + 54, sc.y + 31, "bold 22px Georgia, serif", PAPER, "left");
  text(String(Math.max(best, score)), sc.x + sc.w - pad, sc.y + 31, "bold 22px Georgia, serif", PAPER, "right");
  ctx.font = "bold 22px Georgia, serif";
  const bw = ctx.measureText(String(Math.max(best, score))).width;
  text("BEST", sc.x + sc.w - pad - bw - 8, sc.y + 29, "bold 12px system-ui, sans-serif", GOLD, "right");

  drawPassport();
}

function drawPassport() {
  const p = L.pass;
  box(p, "#6e1f2b");
  text("P A S S P O R T", p.x + 16, p.y + 24, "bold 13px system-ui, sans-serif", GOLD, "left");
  text(`${stamps.size} / ${STAMP_IDS.length} stamps`, p.x + p.w - 16, p.y + 24, "13px Georgia, serif", PAPER, "right");
  const cols = L.cols,
    rows = Math.ceil(STAMP_IDS.length / cols);
  const gx = p.x + 12,
    gy = p.y + 36,
    cw = (p.w - 24) / cols,
    ch = (p.h - 46) / rows;
  STAMP_IDS.forEach((id, i) => {
    const x = gx + (i % cols) * cw + cw / 2,
      y = gy + Math.floor(i / cols) * ch + ch / 2;
    let scale = 1;
    if (stampAnim && stampAnim.id === id) {
      const k = Math.min(1, stampAnim.t / 350);
      scale = 1.7 - 0.7 * k; // stamps down onto the page
    }
    drawStamp(x, y, cw - 8, ch - 8, id, stamps.has(REGIONS[id].key), scale);
  });
}

function drawStamp(x, y, w, h, id, collected, scale) {
  const reg = REGIONS[id];
  ctx.save();
  ctx.translate(x, y);
  if (collected) ctx.rotate(((((id * 37) % 11) - 5) * DEG) * 1.2);
  ctx.scale(scale, scale);
  if (collected) {
    ctx.fillStyle = "rgba(243, 234, 215, 0.92)";
    roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.strokeStyle = reg.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
    const two = reg.kind === "ocean";
    text(reg.short, 0, two ? -1 : 4, `bold ${reg.short.length > 8 ? 9 : 11}px system-ui, sans-serif`, reg.ink);
    if (two) text("OCEAN", 0, 11, "bold 8px system-ui, sans-serif", reg.ink);
  } else {
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "rgba(243, 234, 215, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
    ctx.setLineDash([]);
    text("?", 0, 6, "bold 16px Georgia, serif", "rgba(243, 234, 215, 0.3)");
  }
  ctx.restore();
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
  text(sub, W / 2, H / 2 + 18, "18px Georgia, serif", GOLD);
  if (extra) text(extra, W / 2, H / 2 + 44, "15px Georgia, serif", PAPER);
}

function draw() {
  drawRoom();
  drawGlobeStand(false);
  drawGlobe();
  drawGlobeStand(true);
  drawPanel();

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 800);
    R(p.x, p.y, 5, 4, p.color);
  }
  for (const p of popups) {
    const s = project(p.lon, p.lat);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 400));
    ctx.font = "bold 20px Georgia, serif";
    const tw = ctx.measureText(p.text).width;
    const y = s.y - 62 - p.rise;
    ctx.fillStyle = "rgba(20, 14, 10, 0.8)";
    roundRect(s.x - tw / 2 - 10, y - 22, tw + 20, 30, 8);
    text(p.text, s.x, y, "bold 20px Georgia, serif", PAPER);
  }
  ctx.globalAlpha = 1;
  if (stampAnim && stampAnim.t < 1400) {
    const p = L.pass;
    ctx.globalAlpha = Math.min(1, (1400 - stampAnim.t) / 300);
    ctx.font = "bold 16px Georgia, serif";
    const label = "New stamp!";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.85)";
    roundRect(p.x + p.w / 2 - tw / 2 - 10, p.y - 16, tw + 20, 26, 8);
    text(label, p.x + p.w / 2, p.y + 2, "bold 16px Georgia, serif", GOLD);
    ctx.globalAlpha = 1;
  }

  if (state === "ready") overlay("Globe Trotter", "Press Enter or tap to start your trip", `${STOPS} stops around the world · collect passport stamps`);
  if (state === "paused") overlay("Shh… paused", "Press P to keep exploring");
  if (state === "over") overlay("Trip complete!", "Press Enter or tap for a new trip", `Score: ${score} of ${STOPS * POINTS[0]} · Passport: ${stamps.size}/${STAMP_IDS.length} stamps`);
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
function toCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
}

function tapAt(p) {
  if (state === "ready" || state === "over") return startTrip();
  if (state === "paused") return (state = "playing");
  if (phase === "result") return nextStop();
  const ll = unproject(p.x, p.y);
  if (ll) choose(regionAt(ll.lon, ll.lat), ll.lon, ll.lat);
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const p = toCanvas(e);
  const onGlobe = Math.hypot(p.x - G.cx, p.y - G.cy) <= G.r;
  drag = { x: p.x, y: p.y, lon: lon0, lat: lat0, moved: false, onGlobe, lastX: p.x, lastY: p.y, lastT: performance.now() };
  if (onGlobe) {
    tween = null;
    vLon = vLat = 0;
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = toCanvas(e);
  if (!drag.moved && Math.hypot(p.x - drag.x, p.y - drag.y) > 7) drag.moved = true;
  if (!drag.moved || !drag.onGlobe || state === "paused") return;
  // the surface follows the finger
  const perPx = 1 / G.r / DEG;
  lon0 = wrapLon(drag.lon - (p.x - drag.x) * perPx);
  lat0 = clampLat(drag.lat + (p.y - drag.y) * perPx);
  const now = performance.now(),
    ddt = Math.max(1, now - drag.lastT);
  vLon = (-(p.x - drag.lastX) * perPx) / ddt;
  vLat = ((p.y - drag.lastY) * perPx) / ddt;
  drag.lastX = p.x;
  drag.lastY = p.y;
  drag.lastT = now;
});

function endDrag(e, cancelled) {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (cancelled) return;
  if (!d.moved) tapAt(toCanvas(e));
  else if (performance.now() - d.lastT > 80) vLon = vLat = 0; // finger stopped before lifting
}
canvas.addEventListener("pointerup", (e) => endDrag(e, false));
canvas.addEventListener("pointercancel", (e) => endDrag(e, true));

const ARROWS = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };

document.addEventListener("keydown", (e) => {
  if (ARROWS[e.code]) {
    e.preventDefault();
    keys[ARROWS[e.code]] = true;
    keyboardUsed = true;
    return;
  }
  if (e.code === "KeyM") return toggleMute();
  if (e.code === "KeyP" || e.code === "Escape") {
    if (state === "playing") state = "paused";
    else if (state === "paused") state = "playing";
    return;
  }
  if (e.code === "Enter" || e.code === "Space") {
    e.preventDefault();
    if (e.repeat) return;
    if (state === "ready" || state === "over") return startTrip();
    if (state === "paused") return (state = "playing");
    if (phase === "result") return nextStop();
    keyboardUsed = true;
    choose(regionAt(lon0, lat0), lon0, lat0); // the spot inside the ring
  }
});
document.addEventListener("keyup", (e) => {
  if (ARROWS[e.code]) keys[ARROWS[e.code]] = false;
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") state = "paused";
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
requestAnimationFrame(frame);

// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = canvas.width, // these change with the layout (see Layout below)
  H = canvas.height;

// ---------- Tunables (units: px and ms) ----------
const GRAVITY = 0.0025,
  JUMP_VELOCITY = -0.9,
  JUMP_CUT = 0.45, // multiply upward velocity by this when jump is released early
  GROUND_Y = 240; // player's top y when standing
const FLOOR = GROUND_Y + 44; // y of the floor line
const CEIL = 64; // y where ceiling meets wall
// The run goes at one steady speed for now. To have it speed up over a run again,
// lower START_SPEED and set SPEED_RAMP above 0 (it used to be 0.35 → 0.95, ramp 0.000008).
const START_SPEED = 0.3, // px per ms
  MAX_SPEED = 0.95,
  SPEED_RAMP = 0; // speed gained per ms
const BG_PARALLAX = 0.25; // background scrolls at a quarter of the ground speed, so it feels far away
const BOOKMARK_CHANCE = 0.015; // each collectible has this chance of being a rare bookmark instead of a page
const BOOKMARK_PAGES = 10; // a bookmark is worth this many pages
const PLUS_MS = 700; // how long the little "+1" for a page takes to float up and fade away
const PAGE_GAP = 40; // px between the middles of neighbouring pages in a row (arcs over jumps follow the jump instead)
const PAGES_LOST_ON_HIT = 3; // a bump knocks this many pages loose (not on the last heart)
// Book tape wins back a heart. It only shows up while you're missing one, never right away,
// and always at the top of a jump over a stack, so you have to go for it.
const REPAIR_FIRST_MS = 15000; // hurt for at least this long before the first roll appears…
const REPAIR_EVERY_MS = 30000; // …and this long between rolls after that
// Power-ups: a glowing badge at the top of a jump arc over a stack (like book tape), one at a
// time. Grab it for a few seconds of help:
//   magnet — loose pages and bookmarks nearby fly to you
//   shield — a hardcover that takes the next bump for you (then it's used up)
//   speed  — speed reading: run faster, pages count double, and knock flying books out of the way
const POWER_FIRST_MS = 20000; // the first one can turn up this far into a run…
const POWER_GAP_MS = [25000, 40000]; // …then one every this long (a random time in between)
const POWERS = {
  magnet: { name: "Magnet", popup: "Bookmark magnet! Pages fly to you", ms: 8000, color: "#d94b4b" },
  shield: { name: "Hardcover", popup: "Hardcover! It takes the next bump", ms: 20000, color: "#4b79d9" },
  speed: { name: "Speed reading", popup: "Speed reading! Double pages", ms: 6000, color: "#f2c14e" },
};
const MAGNET_RANGE = 280; // px ahead of the book that the magnet reaches
const MAGNET_PULL = 0.75; // how fast pages fly to the book (px per ms)
const SPEED_BOOST = 1.6; // speed reading's speed, times normal
const METERS_PER_PX = 0.02; // for showing the distance run
const LIVES = 3; // hearts per run
const HURT_MS = 1200; // after a bump the player blinks and can't be hit again for this long
const START_DRIFT = 0.12; // how fast the library drifts by on the start screen (px per ms)
const DUCK_W = 48,
  DUCK_H = 26; // player size while ducking
const FLYER_BOTTOM = FLOOR - 34; // flying books clear a ducking player but hit a standing one
// New things join the run as it goes on (by time, since the speed is steady):
const FLYER_START_MS = 12000; // flying books after this long
const DOUBLE_STACKS_START_MS = 25000; // stacks of two or three side by side after this long
const FLYER_CHANCE = 0.3;
// Swoopers: orange flying books that rise and dive as they come at you. Near the top you run
// under them (they're too high to jump over), through the middle you duck, and at the bottom
// they skim the floor, so you jump.
const SWOOP_START_MS = 25000; // they join in after this long
const SWOOP_CHANCE = 0.4; // share of flying books that swoop
const SWOOP_HIGH = 140; // y of a swooper's underside at the top: clears a standing book, but even a full jump can't get over it
const SWOOP_LOW = FLOOR - 16; // …and at the bottom (too low to duck under)
const SWOOP_PERIOD_MS = 1800; // one full rise and dive
const SWOOP_COLOR = "#e07b39";
// Darters: blue flying books that fly at you faster than the floor moves. They start farther
// off screen by however much they'll catch up, so they still arrive with the usual room.
const DART_START_MS = 15000;
const DART_CHANCE = 0.3; // share of (non-swooping) flying books that dart
const DART_EXTRA = 0.12; // px per ms faster than the floor
const DART_COLOR = "#3a7bd5";
// Chargers: red flying books that drift in like the others, then shake for a moment (with a
// "!") and charge forward. They also start a little farther off, to make room for the charge.
const CHARGE_START_MS = 30000;
const CHARGE_CHANCE = 0.3; // share of (non-swooping) flying books that charge
const CHARGE_DELAY_MS = [500, 1000]; // how long one is on screen before it winds up
const CHARGE_WINDUP_MS = 450; // the shake-and-"!" warning
const CHARGE_EXTRA = 0.35; // px per ms faster than the floor, once charging
const CHARGE_LEAD = 240; // px farther off screen it starts
const CHARGE_COLOR = "#c0392b";
// A murder of books: a dark flock of flying books bursting in, a little faster than the floor
// (with a head start to make up for it, like the darters). Three kinds:
//   low   — skimming the floor: too low to duck under, so jump
//   high  — head height and up: too high to jump over, so duck
//   split — a high bunch, then a low bunch right behind it: duck, then jump
const FLOCK_START_MS = 40000;
const FLOCK_CHANCE = 0.12;
const FLOCK_EXTRA = 0.07; // px per ms faster than the floor
const FLOCK_COLORS = ["#2b2733", "#3a2f45", "#23303a", "#402a2a"];
// Wet floor: a yellow sign to jump (a normal bump if you hit it), then 1–3 puddles. Splashing
// through a puddle soaks a page and makes the book slip: it can't jump for a moment.
const WET_START_MS = 18000; // wet floor stretches join the run after this long
const WET_CHANCE = 0.15; // chance that the next obstacle is a wet floor stretch
// Furniture to jump onto and run along: a book cart and three kinds of reading furniture.
// Running into the side is a hard stop: the book smashes into it and falls over backwards.
const PLATFORM_START_MS = 30000; // furniture joins the run after this long
const PLATFORM_CHANCE = 0.15; // chance that the next obstacle is a piece of furniture
const PLATFORMS = {
  cart: { w: 200, h: 72 }, // a book cart (the tallest)
  bench: { w: 220, h: 44 }, // a padded reading bench
  chair: { w: 190, h: 50 }, // a big comfy reading chair (you run along the seat)
  table: { w: 180, h: FLOOR - GROUND_Y }, // a low reading table: run along the top, or duck and slide underneath
};
const TABLE_SLAB = 14; // the tabletop's thickness: the only solid part of the table (it's open underneath)
// Book tunnels: a long wall of books hanging from the ceiling with a low gap at the floor. Too
// tall to jump: duck in and keep ducking until you're out the other side. It's a solid bookshelf,
// so running into it ends the run, like furniture does (see smashInto).
const TUNNEL_START_MS = 20000;
const TUNNEL_CHANCE = 0.12;
const TUNNEL_W = [200, 360]; // length range
const TUNNEL_GAP = FLOOR - GROUND_Y - TABLE_SLAB; // the opening's height: a ducking book fits, a standing one doesn't
// On top of furniture, sometimes there's more to do:
const SKIM_CHANCE = 0.3; // a flying book skimming along the top (jump it)…
const TOP_STACK_CHANCE = 0.3; // …a stack of books sitting on it (jump it)…
const PERCH_CHANCE = 0.25; // …or a bookmark floating high above it (jump for it)

// Spacing. What's coming next is picked ahead of time, so the gap before it can suit the pair:
// each way of getting past something (jump over, duck under, up on top) has the smallest gap
// that still leaves time to do the next thing. Gaps are in jump lengths, from the end of one
// thing to the start of the next.
const MIN_GAP = {
  jump: { jump: 1.05, duck: 1.05, high: 1.0 }, // landing from a jump, then… (about a tenth of a second to spare)
  duck: { jump: 0.45, duck: 0.45, high: 0.45 }, // coming out from ducking, then…
  high: { jump: 0.6, duck: 0.7, high: 0.6 }, // running off the end of furniture, then…
  wet: { jump: 1.4, duck: 0.95, high: 1.4 }, // after puddles (room to dry off if you slipped)
};
// Each gap is quick (right on top of each other), normal, or a breather. Quick ones get more
// common the longer you last.
const QUICK_START = 0.15, // share of quick gaps at the start of a run…
  QUICK_MAX = 0.45, // …rising to this…
  QUICK_RAMP_MS = 120000; // …over this long
const BREATHER = 0.1; // share of long, easy gaps
const SMASH_MS = 1150; // a smash from start to finish: hit, fall back, lie there, get up
const SLIP_MS = 1500; // no jumping for this long after a puddle (bumps still happen as normal)
const SLIP_JUMP_BUFFER_MS = 250; // a jump pressed this close to the end of a slip happens as it ends
// Each puddle is its own size and shape, with a random stretch of dry floor before the next.
const PUDDLE_W = [40, 86]; // width range (the widest is still well inside a jump)
const PUDDLE_GAP = [220, 380]; // dry floor between one puddle and the next (a slip lasts longer, so one splash usually means more)
// Wipeout: hitting a puddle while speed reading. The book's feet go out from under it: it flips
// over backwards a few times, sailing forward a little, slams down flat on its back and lies
// there with a halo of stars around its head. It takes every heart left, so the run ends.
const WIPEOUT = {
  flipMs: 1000, // in the air, flipping
  flips: 3, // full backflips (then a quarter more, to land on its back)
  peak: 110, // px high at the top of the flips
  forward: 90, // px it sails forward
  starsAt: 120, // ms after the slam that the first star appears…
  starEvery: 90, // …then another every this long…
  stars: 6, // …until the halo has this many
  overMs: 1900, // ms after the slip that the game-over panel starts to fade in
};

// When each hazard joins a run. In Endless Mode, at these times. In Story Mode, each level says
// which ones it has and when (its `features`), and can change how often they turn up (`chances`).
const FEATURES = {
  flyer: FLYER_START_MS,
  double: DOUBLE_STACKS_START_MS,
  swoop: SWOOP_START_MS,
  dart: DART_START_MS,
  charge: CHARGE_START_MS,
  flock: FLOCK_START_MS,
  wet: WET_START_MS,
  platform: PLATFORM_START_MS,
  tunnel: TUNNEL_START_MS,
};
function has(f) {
  const at = story ? story.level.features[f] : FEATURES[f];
  return at != null && runTime > at;
}
function chance(f, base) {
  const c = story && story.level.chances && story.level.chances[f];
  return c != null ? c : base;
}

// ---------- Palette ----------
const SPINES = [
  "#8c2f39",
  "#2f5d62",
  "#b5893b",
  "#3b4a7a",
  "#6b3e75",
  "#a0522d",
  "#4f7942",
  "#c2b280",
];
const BRIGHT = [
  "#d94b4b",
  "#4b79d9",
  "#f2c14e",
  "#5cb85c",
  "#9b59b6",
  "#f39c4a",
  "#e8e8e8",
  "#3aa6a6",
];
const COLORFUL = BRIGHT.filter((c) => c !== "#e8e8e8"); // for decorations on pale backgrounds
const RIBBON_RED = "#c92a2f",
  RIBBON_BLUE = "#3d4c8c",
  RIBBON_YELLOW = "#e8b52a";
const MARK_COLORS = [RIBBON_RED, RIBBON_BLUE, RIBBON_YELLOW];

// ---------- State ----------
const PLAYER_X = 70; // where the book runs, from the left of the screen (every run and level starts here)
const player = { x: PLAYER_X, y: GROUND_Y, w: 40, h: 44, vy: 0, onGround: true };
let obstacles = [];
let pickups = []; // loose pages and the odd bookmark: { kind, x, y, w, h, color, phase }
let particles = [];
let popups = [];
let plusOnes = []; // the faint "+1" that floats up from each page picked up: { x, y, text, life }
let speed, pages, runDist, nextSpawn, state, runTime; // pages collected, px run this run
let upcoming = "stack"; // what turns up next (picked ahead of time: see Spacing)
let distance = 0; // total scrolled distance, drives the background
let duckHeld = false; // is the duck key / touch held?
let lives = LIVES;
let hurtTime = 0; // ms left of blinking after a bump
let shake = 0; // ms left of screen shake
let heartPop = null; // { index, life }: the heart that was just lost, popping away
let shedTimer = 0; // on the last heart, the book drops a loose page now and then
let tumble = null; // after the last bump: { x, y, vx, vy, rot, shed } of the book flying off screen
let smash = null; // a hard stop into furniture: { t, final, faceX, groundY }
let wipeout = null; // speed reading into a puddle: { t, x, groundY, slammed } (see wipeOut)
// The Story Mode level being played, or null in Endless Mode. Story Mode lives in
// deweydash-story.js (loaded after this file); this file calls into it only while `story` is set
// or on Story Mode's own screens.
let story = null;
let standingOn = null; // the piece of furniture the book is standing on, if any
let lostPages = []; // pages knocked loose by a bump, flying off: { x, y, vx, vy, rot, spin, life }
let pageLoss = null; // { amount, life }: the page counter flashes red and shows "−3"
let repairWait = REPAIR_FIRST_MS; // ms of being hurt until the next roll of tape can appear
let power = null; // the power-up in use: { type, time } (time: ms left)
let powerWait = POWER_FIRST_MS; // ms until the next power-up can appear
let baseSpeed = START_SPEED, // the run's own speed…
  boost = 1; // …times this (eases up to SPEED_BOOST while speed reading)
let healTime = 0; // ms left of the tape-sweeping-across-the-book animation
let heartGain = null; // { index, life }: the heart that was just won back, popping in
let slipTime = 0; // ms left of slipping after a puddle (no jumping)
let jumpQueued = false; // jump pressed while slipping: it happens as soon as the slip ends
let accLift = 0, // hats / glasses lifted by a jump: 0 in place … about 1 floating (see updateAccessories)
  accVel = 0;
// (Saved settings keep their "runner-" names from before the game was renamed, so nobody loses
// their best score, character or sound setting.)
let best = Number(safeGet("runner-best-pages")) || 0; // most pages collected in one run

// ---------- Sound (generated with the Web Audio API, no files needed) ----------
setupSound("runner", { startMuted: true }); // sound stays off until the player turns it on
let lastMarkTime = -1e9,
  markCombo = 0;

const sfx = {
  jump: () => tone(300, 620, 0.14),
  land: () => tone(140, 70, 0.06, "triangle", 0.1),
  duck: () => tone(420, 200, 0.08, "triangle", 0.1),
  page: () => {
    // grabbing pages in quick succession climbs the scale
    markCombo = runTime - lastMarkTime < 500 ? Math.min(markCombo + 1, 6) : 0;
    lastMarkTime = runTime;
    const f = 880 * Math.pow(2, (markCombo * 2) / 12);
    tone(f, f, 0.07, "sine", 0.14);
    tone(f * 1.5, f * 1.5, 0.12, "sine", 0.12, 0.06);
  },
  bookmark: () =>
    [784, 988, 1175, 1568].forEach((f, i) =>
      tone(f, f, 0.12, "sine", 0.13, i * 0.06),
    ),
  // pages fluttering away
  thunk: () => {
    tone(130, 55, 0.22, "square", 0.16);
    tone(85, 40, 0.3, "triangle", 0.14, 0.02);
    [1400, 1700, 1500].forEach((f, i) => tone(f, f * 1.1, 0.06, "sine", 0.05, 0.25 + i * 0.09)); // seeing stars
  },
  lose: () =>
    [1100, 900, 700].forEach((f, i) =>
      tone(f, f * 0.8, 0.07, "triangle", 0.06, 0.08 + i * 0.06),
    ),
  heal: () =>
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, f * 1.02, 0.14, "sine", 0.12, i * 0.07),
    ),
  splash: () => {
    tone(900, 320, 0.12, "sine", 0.1);
    tone(620, 220, 0.14, "sine", 0.08, 0.06);
  },
  // feet out from under it: a squeak, then a "whoa-oa-oa" wobbling up and down through the flips
  wipeout: () => {
    tone(1300, 1700, 0.08, "sine", 0.08);
    [0, 1, 2].forEach((i) => tone(320, 700, 0.17, "triangle", 0.07, 0.1 + i * 0.3));
    [0, 1, 2].forEach((i) => tone(700, 320, 0.13, "triangle", 0.06, 0.27 + i * 0.3));
  },
  hurt: () => {
    tone(330, 160, 0.16, "triangle", 0.16);
    tone(160, 90, 0.12, "square", 0.06, 0.04);
  },
  crash: () => {
    tone(220, 40, 0.45, "sawtooth", 0.18);
    tone(90, 30, 0.3, "square", 0.12, 0.05);
    tone(520, 110, 0.6, "triangle", 0.07, 0.2); // a falling "wheee" as the book tumbles away
  },
  count: () => tone(440, 440, 0.1, "triangle", 0.12), // each number of the 3, 2, 1
  // power-ups: a bright run up when you grab one, a step down when it wears off
  power: () =>
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f * 1.01, 0.12, "sine", 0.11, i * 0.05)),
  powerEnd: () => {
    tone(784, 523, 0.14, "triangle", 0.07);
    tone(523, 392, 0.16, "triangle", 0.06, 0.1);
  },
  block: () => {
    tone(880, 300, 0.14, "square", 0.07);
    tone(1400, 1400, 0.06, "sine", 0.08, 0.02);
  },
  knock: () => tone(240, 110, 0.1, "square", 0.08),
  whoosh: () => tone(260, 900, 0.22, "sine", 0.06), // "Dash" zooming into the title
  // a murder of books on its way: a flurry of flapping
  flock: () => {
    for (let i = 0; i < 7; i++) {
      const f = 260 + Math.random() * 260;
      tone(f, f * 0.6, 0.05, "triangle", 0.05, i * 0.045);
    }
  },
  start: () => {
    tone(523, 523, 0.08, "triangle", 0.12);
    tone(784, 784, 0.12, "triangle", 0.12, 0.08);
  },
};

// ---------- Music (generated in code, like the sound effects: no files) ----------
// A bouncy "storybook chiptune" loop at 150 BPM, two of the book's hops to a beat. It follows
// the game: plucks and bass on the start screen, the full tune while running, an extra
// sparkly layer later in a run, muffled when paused, a dip on a bump, and a little "aww" at
// game over, then a slow, wistful music-box tune on the game-over screen (see OVER_MELODY).
// The Sound button turns it off with everything else.
const MUSIC_BPM = 150;
const MUSIC_VOLUME = 0.55; // overall music level (the sound effects aren't affected)
const MUSIC_STEP = 60 / MUSIC_BPM / 4; // one 16th note, in seconds
const noteHz = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note number → frequency
// 8 bars in C major: C  G  Am  F | F  G  Am  G
const MUSIC_CHORDS = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65], [57, 60, 65], [59, 62, 67], [57, 60, 64], [59, 62, 67]];
const MUSIC_BASS = [48, 43, 45, 41, 41, 43, 45, 43];
// the tune, bar by bar: [16th-note step, note, length in steps]
const MUSIC_MELODY = [
  [[0, 76, 2], [2, 79, 2], [4, 76, 2], [6, 72, 2], [8, 74, 2], [10, 76, 2], [12, 79, 4]],
  [[0, 74, 2], [2, 71, 2], [4, 74, 2], [6, 79, 2], [8, 77, 2], [10, 76, 2], [12, 74, 4]],
  [[0, 72, 2], [2, 76, 2], [4, 81, 2], [6, 79, 2], [8, 76, 2], [10, 72, 2], [12, 76, 4]],
  [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2], [8, 69, 4], [12, 72, 4]],
  [[0, 69, 2], [2, 72, 2], [4, 77, 3], [7, 76, 1], [8, 77, 2], [10, 81, 2], [12, 79, 4]],
  [[0, 79, 2], [2, 77, 2], [4, 76, 2], [6, 74, 2], [8, 71, 2], [10, 74, 2], [12, 79, 4]],
  [[0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 76, 2], [8, 81, 3], [11, 79, 1], [12, 76, 4]],
  [[0, 74, 2], [2, 76, 2], [4, 77, 2], [6, 74, 2], [8, 71, 2], [10, 74, 2], [12, 71, 2], [14, 74, 2]],
];
// The game-over tune: slower and gentler, a music box over a library clock's tick-tock, in
// A minor. 8 bars: Am  F  C  G | Am  F  Dm  E (the E leans back round to the Am).
const OVER_BPM = 92;
const OVER_STEP = 60 / OVER_BPM / 4;
const OVER_VOLUME = MUSIC_VOLUME * 0.8;
const OVER_CHORDS = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62], [57, 60, 64], [57, 60, 65], [57, 62, 65], [56, 59, 64]];
const OVER_BASS = [45, 41, 48, 43, 45, 41, 50, 40];
const OVER_MELODY = [
  [[0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 71, 4]],
  [[0, 72, 6], [6, 69, 2], [8, 72, 8]],
  [[0, 67, 4], [4, 72, 4], [8, 76, 6], [14, 74, 2]],
  [[0, 74, 8], [8, 71, 8]],
  [[0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 76, 4]],
  [[0, 77, 6], [6, 76, 2], [8, 74, 4], [12, 72, 4]],
  [[0, 74, 4], [4, 72, 4], [8, 69, 4], [12, 71, 4]],
  [[0, 68, 8], [8, 71, 8]],
];
const OVER_DELAY = 1.6; // seconds after the run ends before it starts (once the "aww" has finished)
let music = null; // the music's audio nodes, made the first time it plays
let musicStep = 0, // where we are in the loop (128 sixteenths = 8 bars)
  musicNext = 0, // when the next 16th is due, on the audio clock
  musicMode = "", // menu | run | build | paused | over
  musicLevel = -1, // the volume last asked for
  musicUnlocked = false; // browsers only allow sound after the player taps or presses a key

// The chain every note goes through: input → muffle filter (for pause) → duck (for bumps) → volume.
function buildMusicNodes(a) {
  const input = a.createGain();
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 18000;
  const duck = a.createGain();
  const out = a.createGain();
  out.gain.value = 0;
  input.connect(filter).connect(duck).connect(out).connect(a.destination);
  const len = Math.floor(a.sampleRate * 0.05); // a short burst of noise, for the hi-hat
  const noise = a.createBuffer(1, len, a.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return { a, input, filter, duck, out, noise };
}
function musicNodes() {
  return (music ??= buildMusicNodes(getAudio()));
}

// One note: a quick fade in, then it dies away (plucky), on the audio clock at time t.
function mNote(freq, t, dur, type, vol, attack = 0.005) {
  const { a, input } = music;
  const o = a.createOscillator(),
    g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(input);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function mThump(t) {
  // a soft kick: a low sine that drops in pitch
  const { a, input } = music;
  const o = a.createOscillator(),
    g = a.createGain();
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.09, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(g).connect(input);
  o.start(t);
  o.stop(t + 0.16);
}
function mHat(t, vol) {
  // a soft "tsk": a sliver of high noise
  const { a, input, noise } = music;
  const src = a.createBufferSource(),
    hp = a.createBiquadFilter(),
    g = a.createGain();
  src.buffer = noise;
  hp.type = "highpass";
  hp.frequency.value = 7000;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  src.connect(hp).connect(g).connect(input);
  src.start(t);
  src.stop(t + 0.05);
}

// Everything that plays on one 16th note of the loop.
function scheduleMusicStep(step, t, mode) {
  const bar = Math.floor(step / 16) % 8,
    s = step % 16;
  const chord = MUSIC_CHORDS[bar],
    root = MUSIC_BASS[bar];
  // bass: the root on the beat, bouncing up an octave in between
  if (s === 0 || s === 8) mNote(noteHz(root), t, MUSIC_STEP * 3, "triangle", 0.09);
  if (s === 6 || s === 14) mNote(noteHz(root + 12), t, MUSIC_STEP * 1.5, "triangle", 0.06);
  // plucked chords, up and down on the 8ths
  if (s % 2 === 0) mNote(noteHz(chord[[0, 1, 2, 1][(s / 2) % 4]]), t, 0.2, "triangle", mode === "menu" ? 0.03 : 0.036);
  if (mode === "menu") return; // the start screen gets just those two
  // the tune
  for (const [ms, n, len] of MUSIC_MELODY[bar]) if (ms === s) mNote(noteHz(n), t, MUSIC_STEP * len * 0.9, "square", 0.02, 0.01);
  // light percussion
  if (s === 0 || s === 8) mThump(t);
  if (s === 4 || s === 12) mNote(1600, t, 0.03, "sine", 0.04); // woodblock
  if (s % 4 === 2) mHat(t, 0.025);
  if (mode === "build") {
    // later in a run: busier hats and a high, sparkly arpeggio
    if (s % 2 === 1) mHat(t, 0.012);
    if (s % 2 === 1) mNote(noteHz(chord[(s >> 1) % 3] + 24), t, 0.14, "sine", 0.014);
  }
}

// Everything that plays on one 16th note of the game-over tune.
function scheduleOverStep(step, t) {
  const bar = Math.floor(step / 16) % 8,
    s = step % 16;
  const chord = OVER_CHORDS[bar],
    root = OVER_BASS[bar];
  // a soft, held bass note at the start of each bar, and again (quieter) halfway
  if (s === 0) mNote(noteHz(root), t, OVER_STEP * 10, "triangle", 0.07, 0.02);
  if (s === 8) mNote(noteHz(root), t, OVER_STEP * 6, "triangle", 0.045, 0.02);
  // the music box: the chord rippling up and down an octave higher, ringing on
  if (s % 2 === 0) mNote(noteHz(chord[[0, 1, 2, 1][(s / 2) % 4]] + 12), t, 0.6, "sine", 0.02);
  // the tune
  for (const [ms, n, len] of OVER_MELODY[bar]) if (ms === s) mNote(noteHz(n), t, OVER_STEP * len * 0.95, "triangle", 0.04, 0.02);
  // the library clock: tick… tock…
  if (s % 4 === 0) mNote(s % 8 === 0 ? 1250 : 940, t, 0.03, "sine", 0.018);
}

// A little "aww" for game over: three notes stepping down.
function playMusicSting(t) {
  [67, 63, 60].forEach((n, i) => mNote(noteHz(n), t + i * 0.28, i === 2 ? 0.8 : 0.3, "triangle", 0.07, 0.02));
}

// A quick dip in the music when the book gets bumped.
function musicDuck() {
  if (!music) return;
  const t = music.a.currentTime,
    g = music.duck.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.4, t);
  g.linearRampToValueAtTime(1, t + 0.5);
}

// Called every frame: picks the mood from what's on screen, and schedules the next few notes.
function updateMusic() {
  if (!musicUnlocked || (muted && !music)) return; // no audio until sound is turned on
  const mode =
    state === "over" ? "over"
    : state === "paused" || (state === "howto" && howtoFrom === "paused") ? "paused"
    : state === "running" ? (runTime > SWOOP_START_MS ? "build" : "run")
    : "menu";
  const m = musicNodes(),
    now = m.a.currentTime;
  if (mode !== musicMode) {
    if (mode === "over") {
      playMusicSting(now + 0.05);
      // then the game-over tune, from the top, once the "aww" (and a long wipeout) has played out
      musicStep = 0;
      musicNext = now + Math.max(OVER_DELAY, deathMs / 1000 + 0.2);
    } else if (musicMode === "over" || musicMode === "") {
      musicStep = 0; // a fresh start after game over (or the very first time)
      musicNext = now + 0.05;
    }
    m.filter.frequency.setTargetAtTime(mode === "paused" ? 650 : 18000, now, 0.1); // muffled when paused
    musicMode = mode;
  }
  const level = muted ? 0
    : mode === "menu" ? MUSIC_VOLUME * 0.75
    : mode === "paused" ? MUSIC_VOLUME * 0.6
    : mode === "over" ? OVER_VOLUME
    : MUSIC_VOLUME;
  if (level !== musicLevel) {
    m.out.gain.setTargetAtTime(level, now, 0.08);
    musicLevel = level;
  }
  if (muted) return;
  if (musicNext < now - 0.2) musicNext = now + 0.05; // fell behind (the tab was hidden): pick up from now
  while (musicNext < now + 0.15) {
    if (mode === "over") scheduleOverStep(musicStep, musicNext);
    else scheduleMusicStep(musicStep, musicNext, mode === "paused" ? "run" : mode);
    musicStep = (musicStep + 1) % 128;
    musicNext += mode === "over" ? OVER_STEP : MUSIC_STEP;
  }
}
// The first tap or key press is allowed to start sound, so the music can begin.
for (const ev of ["keydown", "pointerdown"]) {
  document.addEventListener(ev, () => {
    if (musicUnlocked) return;
    musicUnlocked = true;
    if (!muted) getAudio(); // create / wake the audio inside the tap, as browsers require
  });
}

const MUTE_BTN = { x: 12, y: 12, w: 120, h: 32 };
// The profile badge in the top-right corner: the chosen character's name and portrait.
// It shows on every screen; on the start screen, tapping it opens the Characters screen.
// (Its position, and the score bar's, are set by the layout.)
let PROFILE = { x: 0, y: 12, w: 112, h: 32 };
let SCORE = { x: 0, y: 12 }; // the pages / best / distance bar

function reset() {
  player.x = PLAYER_X; // (the end of a story level has it run on to the goal, off its spot)
  player.y = GROUND_Y;
  player.vy = 0;
  player.onGround = true;
  player.ducking = false;
  duckHeld = false;
  obstacles = [];
  pickups = [];
  particles = [];
  popups = [];
  plusOnes = [];
  speed = baseSpeed = START_SPEED;
  boost = 1;
  power = null;
  powerWait = POWER_FIRST_MS;
  pages = 0;
  runDist = 0;
  runTime = 0;
  nextSpawn = 600;
  upcoming = "stack";
  lives = LIVES;
  hurtTime = 0;
  shake = 0;
  heartPop = null;
  shedTimer = 0;
  tumble = null;
  smash = null;
  wipeout = null;
  standingOn = null;
  lostPages = [];
  pageLoss = null;
  repairWait = REPAIR_FIRST_MS;
  healTime = 0;
  heartGain = null;
  slipTime = 0;
  jumpQueued = false;
  accLift = 0;
  accVel = 0;
}
reset();
state = "ready"; // ready | countdown | running | paused | over (+ howto, chars)

// ---------- Player ----------
let jumpCount = 0; // goes up by one with every jump that actually happens
function jump() {
  if (slipTime > 0) {
    // no jumping while slipping; a press right at the end is remembered for when it ends
    if (slipTime <= SLIP_JUMP_BUFFER_MS) jumpQueued = true;
    return;
  }
  if (player.onGround) {
    jumpCount++;
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
    burst(player.x + player.w / 2, player.y + player.h, 6, PAPER);
    sfx.jump();
  }
}

function releaseJump() {
  if (player.vy < 0) player.vy *= JUMP_CUT;
}

function updatePlayer(dt) {
  // Holding duck in the air pulls you down faster so you can drop under a flying book.
  const gravity = duckHeld && !player.onGround ? GRAVITY * 2.5 : GRAVITY;
  const prevBottom = player.y + player.h;
  player.vy += gravity * dt;
  player.y += player.vy * dt;
  // What's under the book: the floor, or the top of a piece of furniture it was above
  // (or standing on) a moment ago. Run off the end and there's nothing under it, so it drops.
  let support = GROUND_Y;
  standingOn = null;
  for (const o of obstacles) {
    if (o.type !== "platform") continue;
    const over = player.x + 8 < o.x + o.w && player.x + player.w - 8 > o.x;
    if (over && prevBottom <= o.y + 2 && o.y - player.h < support) {
      support = o.y - player.h;
      standingOn = o;
    }
  }
  if (player.y >= support) {
    if (!player.onGround) {
      burst(player.x + player.w / 2, support + player.h, 4, PAPER);
      sfx.land();
    }
    player.y = support;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
    if (player.y < support - 1) standingOn = null;
  }
  player.ducking = duckHeld && player.onGround;
  updateAccessories(dt);

  // every few steps, a little puff of dust kicks up behind the back foot
  if (player.onGround && !player.ducking) {
    const footfall = Math.floor(
      (runTime * RUN_CADENCE + Math.PI / 2) / Math.PI,
    ); // counts each foot landing
    if (footfall !== lastFootfall) {
      lastFootfall = footfall;
      if (++steps % 3 === 0) {
        for (let i = 0; i < 3; i++) {
          particles.push({
            x: player.x + 4,
            y: player.y + player.h - 2,
            vx: -0.06 - Math.random() * 0.06,
            vy: -0.04 - Math.random() * 0.05,
            life: 300 + Math.random() * 150,
            color: "#cdbfa3",
            size: 2.5 + Math.random() * 1.5,
          });
        }
      }
    }
  }
}
let lastFootfall = 0,
  steps = 0;

// The player's collision box: shorter and a bit wider while ducking.
function playerBox() {
  if (player.ducking)
    return { x: player.x, y: player.y + player.h - DUCK_H, w: DUCK_W, h: DUCK_H }; // (on the floor or on furniture)
  return { x: player.x, y: player.y, w: player.w, h: player.h };
}

// ---------- Obstacles: stacks of books ----------
// Where a swooper's underside is right now, between SWOOP_HIGH and SWOOP_LOW.
function swoopBottom(o) {
  const t = Math.sin((runTime / SWOOP_PERIOD_MS) * Math.PI * 2 + o.phase); // -1 … 1
  return SWOOP_HIGH + ((t + 1) / 2) * (SWOOP_LOW - SWOOP_HIGH);
}
// A stack of books standing on `base` (the floor, or the top of a piece of furniture).
function makeStack(x, stackW, targetH, base = FLOOR) {
  const books = [];
  let y = base;
  while (base - y < targetH) {
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
  return { books, h: base - y };
}

function spawnObstacle() {
  const count =
    has("double") && Math.random() < 0.35
      ? 2 + (Math.random() < 0.3)
      : 1;
  const stackW = count === 1 ? 30 : 26;
  const targetH = 26 + Math.random() * 26;
  const x = W + 10;
  const books = [];
  let h = 0;
  for (let i = 0; i < count; i++) {
    // neighbouring stacks vary in height a little
    const s = makeStack(
      x + i * (stackW + 4),
      stackW,
      targetH * (i % 2 ? 0.75 : 1),
    );
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
  const swoop = has("swoop") && Math.random() < chance("swoop", SWOOP_CHANCE);
  const o = {
    type: "flyer",
    swoop,
    x: W + 10,
    y: FLYER_BOTTOM - h,
    w: 44,
    h,
    books: [],
    color: swoop ? SWOOP_COLOR : SPINES[(Math.random() * SPINES.length) | 0],
    phase: Math.random() * Math.PI * 2,
  };
  if (swoop) o.y = swoopBottom(o) - h;
  else if (has("charge") && Math.random() < chance("charge", CHARGE_CHANCE)) {
    const [a, b] = CHARGE_DELAY_MS;
    o.charge = { t: 0, at: a + Math.random() * (b - a) }; // t: ms on screen
    o.color = CHARGE_COLOR;
    o.x += CHARGE_LEAD;
  } else if (has("dart") && Math.random() < chance("dart", DART_CHANCE)) {
    o.dart = true;
    o.color = DART_COLOR;
    o.x += (DART_EXTRA * (W + 10 - player.x)) / speed; // the head start it'll make up
  }
  obstacles.push(o);
  return o;
}
// How a charger is doing: ms into its wind-up (negative before), and whether it's charging.
function chargeState(o) {
  const into = o.charge.t - o.charge.at;
  return { into, winding: into > 0 && into <= CHARGE_WINDUP_MS, charging: into > CHARGE_WINDUP_MS };
}

function updateObstacles(dt) {
  const dx = speed * dt;
  for (const o of obstacles) {
    o.x -= dx;
    for (const b of o.books) b.x -= dx;
    if (o.type === "flyer") {
      if (o.flock) o.x -= FLOCK_EXTRA * dt;
      o.y =
        o.skimY != null
          ? o.skimY + Math.sin(runTime * 0.006 + o.phase) * 1.5 // skimming along the top of furniture
          : o.flock
            ? o.baseY + Math.sin(runTime * 0.008 + o.phase) * o.bob // a jostling flock
          : o.swoop
            ? swoopBottom(o) - o.h
            : FLYER_BOTTOM - o.h + Math.sin(runTime * 0.006 + o.phase) * 2;
      if (o.dart) o.x -= DART_EXTRA * dt;
      if (o.charge && o.x < W) {
        o.charge.t += dt;
        const { into, winding, charging } = chargeState(o);
        if (winding) o.x += 0.04 * dt; // pulls back a touch, winding up
        else if (charging) o.x -= CHARGE_EXTRA * Math.min(1, (into - CHARGE_WINDUP_MS) / 200) * dt; // and off it goes
      }
    }
  }
  obstacles = obstacles.filter((o) => o.x + o.w > -20);

  // Spawn based on distance so gaps stay jumpable as speed rises.
  nextSpawn -= dx;
  if (nextSpawn <= 0 && !(story && storyNearEnd())) { // (nothing new near the end of a story level)
    const airTime = (2 * -JUMP_VELOCITY) / GRAVITY; // ms spent in a full jump
    let o = null,
      len, // how far it reaches past where it starts
      moves; // the ways you might be getting past it (see MIN_GAP)
    if (upcoming === "wet") {
      len = spawnWetFloor();
      moves = ["wet"];
    } else if (upcoming === "platform") {
      const p = spawnPlatform();
      len = p.w;
      moves = p.jumpy ? ["high", "jump"] : ["high"]; // (jumping something up there can carry you off the end)
    } else if (upcoming === "tunnel") {
      len = spawnTunnel();
      moves = ["duck"];
    } else if (upcoming.startsWith("flock")) {
      const kind = upcoming.slice(6); // "low", "high" or "split"
      len = spawnFlock(kind, speed * airTime);
      moves = kind === "high" ? ["duck"] : ["jump"];
    } else {
      o = upcoming === "flyer" ? spawnFlyer() : spawnObstacle();
      len = o.w;
      moves = o.swoop ? ["jump", "duck"] : o.type === "flyer" ? ["duck"] : ["jump"];
    }
    upcoming = pickNext();
    nextSpawn = len + gapBefore(moves, nextMoves(upcoming), speed * airTime);
    if (o) spawnPickups(o, airTime); // (after the gap is set: a row of pages can go in it)
  }
}

// ---------- Spacing ----------
function pickNext() {
  if (has("wet") && Math.random() < chance("wet", WET_CHANCE)) return "wet";
  if (has("platform") && Math.random() < chance("platform", PLATFORM_CHANCE)) return "platform";
  if (has("tunnel") && Math.random() < chance("tunnel", TUNNEL_CHANCE)) return "tunnel";
  if (has("flock") && Math.random() < chance("flock", FLOCK_CHANCE))
    return "flock-" + ["low", "high", "split"][(Math.random() * 3) | 0];
  if (has("flyer") && Math.random() < chance("flyer", FLYER_CHANCE)) return "flyer";
  return "stack";
}
// How you might need to get past what's coming. (A flying book might turn out to be a swooper,
// which sometimes needs a jump.)
function nextMoves(kind) {
  if (kind === "flyer") return has("swoop") ? ["duck", "jump"] : ["duck"];
  if (kind === "platform") return ["high"];
  if (kind === "tunnel" || kind === "flock-high" || kind === "flock-split") return ["duck"];
  return ["jump"];
}

// A murder of books (see FLOCK_*). Returns how far it reaches, as it'll arrive.
function spawnFlock(kind, jumpLen) {
  const x0 = W + 10 + (FLOCK_EXTRA * (W + 10 - player.x)) / speed; // the head start it'll make up
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const add = (dx, bottom, bob = 2 + Math.random() * 3) =>
    obstacles.push({
      type: "flyer",
      flock: true,
      x: x0 + dx,
      baseY: bottom - 22,
      y: bottom - 22,
      w: 44,
      h: 22,
      books: [],
      color: pick(FLOCK_COLORS),
      phase: Math.random() * Math.PI * 2,
      bob,
    });
  // a low bunch skims the floor (a ducking book still can't get under it); a high bunch flies
  // from head height up (clear of a ducking book, but in the way of any jump). Each returns where it ends.
  const low = (start, n) => {
    for (let i = 0; i < n; i++) add(start + i * 26 + Math.random() * 10, FLOOR - 6 - Math.random() * 8);
    return start + (n - 1) * 26 + 54;
  };
  const high = (start, n) => {
    // every other one right at head height (so you can't just run through), the rest above
    for (let i = 0; i < n; i++)
      if (i % 2 === 0) add(start + i * 30 + Math.random() * 10, FLYER_BOTTOM + 2 + Math.random() * 4, 1.5);
      else add(start + i * 30 + Math.random() * 10, FLYER_BOTTOM - 10 - Math.random() * 28);
    return start + (n - 1) * 30 + 54;
  };
  const n = () => 3 + ((Math.random() * 3) | 0); // 3–5
  let end;
  if (kind === "low") end = low(0, n());
  else if (kind === "high") end = high(0, n());
  else end = low(high(0, 2 + (Math.random() < 0.5)) + jumpLen * (MIN_GAP.duck.jump + 0.1), 2 + (Math.random() < 0.5));
  sfx.flock();
  return end;
}
// The gap from the end of one thing to the start of the next: never less than the pair needs,
// and quick, normal or a breather.
function gapBefore(prevMoves, upMoves, jumpLen) {
  let min = 0;
  for (const p of prevMoves) for (const n of upMoves) min = Math.max(min, MIN_GAP[p][n]);
  const quick = Math.min(QUICK_MAX, QUICK_START + (runTime / QUICK_RAMP_MS) * (QUICK_MAX - QUICK_START));
  const r = Math.random();
  let k;
  if (r < quick) k = min + Math.random() * 0.15; // right on top of each other
  else if (r < quick + BREATHER) k = min + 1.6 + Math.random() * 0.8; // a breather
  else k = min + 0.35 + Math.random() * 1.1;
  return jumpLen * k;
}

// A piece of furniture to jump onto, with a row of pages along the top for anyone who lands on it.
// Sometimes there's more up there: a flying book skimming along the top or a stack of books
// sitting on it (jump them), or a bookmark floating high above to jump for. The low table can be
// ducked under too (pages there as well). Returns { w, jumpy } (jumpy: something up there to jump).
function spawnPlatform() {
  const kinds = Object.keys(PLATFORMS);
  const kind = kinds[(Math.random() * kinds.length) | 0];
  const { w, h } = PLATFORMS[kind];
  const o = { type: "platform", kind, x: W + 10, y: FLOOR - h, w, h, books: [], seed: Math.random() * 1000 };
  obstacles.push(o);
  const r = Math.random();
  const skim = r < SKIM_CHANCE,
    topStack = !skim && r < SKIM_CHANCE + TOP_STACK_CHANCE,
    perch = !skim && !topStack && r < SKIM_CHANCE + TOP_STACK_CHANCE + PERCH_CHANCE;
  if (topStack) {
    // a short stack of books sitting on top, past where you'd land
    const sw = 28,
      sx = o.x + w * (0.55 + Math.random() * 0.15),
      s = makeStack(sx, sw, 16 + Math.random() * 14, o.y);
    obstacles.push({ type: "stack", x: sx, y: o.y - s.h, w: sw, h: s.h, books: s.books });
    addPickup(o.x + 30, o.y - 34);
    const fx = sx + sw / 2;
    addPickup(fx - 34, o.y - 100);
    addPickup(fx, o.y - 124);
    addPickup(fx + 34, o.y - 100);
  } else if (skim) {
    // a flying book skimming the top, past where you'd land
    const fh = 22;
    obstacles.push({
      type: "flyer",
      skimY: o.y - fh - 3,
      x: o.x + w * (0.55 + Math.random() * 0.15),
      y: o.y - fh - 3,
      w: 44,
      h: fh,
      books: [],
      color: SPINES[(Math.random() * SPINES.length) | 0],
      phase: Math.random() * Math.PI * 2,
    });
    // pages before it, and a few over it for jumping it
    addPickup(o.x + 30, o.y - 34);
    const fx = o.x + w * 0.62 + 22;
    addPickup(fx - 34, o.y - 110);
    addPickup(fx, o.y - 130);
    addPickup(fx + 34, o.y - 110);
  } else if (perch) {
    // a bookmark floating high above the top (you have to jump from up there to reach it),
    // with pages leading up to it
    const cx = o.x + w * 0.6;
    pickups.push({
      kind: "bookmark",
      x: cx - 7,
      y: o.y - 140,
      w: 14,
      h: 26,
      color: MARK_COLORS[(Math.random() * MARK_COLORS.length) | 0],
      phase: Math.random() * Math.PI * 2,
    });
    for (let cx2 = o.x + 30; cx2 < cx - 30; cx2 += PAGE_GAP) addPickup(cx2, o.y - 34);
  } else {
    for (let cx = o.x + 30; cx < o.x + w - 20; cx += PAGE_GAP) addPickup(cx, o.y - 34);
  }
  if (kind === "table")
    for (let cx = o.x + 34; cx < o.x + w - 24; cx += PAGE_GAP) addPickup(cx, FLOOR - 34); // under the table too
  return { w, jumpy: skim || topStack };
}

// A book tunnel, with a row of pages along the floor inside. Returns its length.
function spawnTunnel() {
  const [a, b] = TUNNEL_W;
  const w = a + Math.random() * (b - a);
  const top = CEIL - 12;
  obstacles.push({
    type: "tunnel",
    x: W + 10,
    y: top,
    w,
    h: FLOOR - TUNNEL_GAP - top,
    books: [],
    color: SPINES[2],
    seed: Math.random() * 1000,
  });
  for (let cx = W + 10 + 34; cx < W + 10 + w - 24; cx += PAGE_GAP) addPickup(cx, FLOOR - 34);
  return w;
}

// A wet floor sign, then 1–3 puddles, each with an arc of pages over it (jump them to keep
// your pages dry). Returns how far the stretch reaches, to the end of the last puddle.
function spawnWetFloor() {
  const airTime = (2 * -JUMP_VELOCITY) / GRAVITY;
  const sign = {
    type: "sign",
    x: W + 10,
    y: FLOOR - 46,
    w: 34,
    h: 46,
    books: [],
  };
  obstacles.push(sign);
  const count = 1 + Math.floor(Math.random() * 3);
  const between = (r) => r[0] + Math.random() * (r[1] - r[0]);
  let px = sign.x + 260;
  for (let i = 0; i < count; i++) {
    const w = between(PUDDLE_W);
    obstacles.push({
      type: "puddle",
      x: px,
      y: FLOOR - 3,
      w,
      h: 8,
      books: [],
      soaked: false,
      phase: Math.random() * 6,
      ...puddleShape(w),
    });
    // pages in a jump arc over the puddle
    const cx = px + w / 2,
      side = speed * airTime * 0.25;
    addPickup(cx - side, GROUND_Y - 100);
    addPickup(cx, GROUND_Y - 136);
    addPickup(cx + side, GROUND_Y - 100);
    px += w; // past this puddle…
    if (i < count - 1) px += between(PUDDLE_GAP); // …and some dry floor before the next
  }
  return px - (W + 10);
}

// A puddle's own look: a main pool with one or two smaller lobes running off it, sometimes a
// little splash on its own, and a slightly different blue. Everything stays within its width w,
// so what you see is exactly what soaks you. Lobes are { dx, dy, rx, ry } from the middle.
const PUDDLE_BLUES = [
  ["#4f93cf", "#9fd0f2"], // [water, its lighter middle]
  ["#5a9bd1", "#a8d6f4"],
  ["#4886bd", "#94c6ea"],
  ["#5c9ec4", "#a3d2e8"], // a touch greener
];
function puddleShape(w) {
  const half = w / 2,
    rand = (a, b) => a + Math.random() * (b - a);
  const main = { rx: half * rand(0.68, 0.85), ry: rand(5.5, 8), dy: 0 };
  main.dx = (half - main.rx) * rand(-0.6, 0.6);
  const lobes = [main];
  const extra = Math.random() < 0.5 ? 1 : 2;
  for (let k = 0; k < extra; k++) {
    const rx = half * rand(0.28, 0.48),
      side = k === 0 ? (Math.random() < 0.5 ? -1 : 1) : -Math.sign(lobes[1].dx); // a second one goes the other way
    lobes.push({
      rx,
      ry: main.ry * rand(0.55, 0.8),
      dx: side * (half - rx) * rand(0.75, 1),
      dy: rand(-1.5, 1.5),
    });
  }
  if (Math.random() < 0.4) {
    // a little splash of its own, near one end
    const rx = rand(3.5, 6);
    lobes.push({ rx, ry: rand(1.8, 2.8), dx: (Math.random() < 0.5 ? -1 : 1) * (half - rx), dy: rand(1, 3) });
  }
  return { lobes, blue: PUDDLE_BLUES[(Math.random() * PUDDLE_BLUES.length) | 0] };
}

// Running (or ducking) through a puddle: splash, lose a soggy page, and slip for a moment.
function checkPuddles() {
  if (!player.onGround || standingOn || hurtTime > 0) return; // jumping over is safe, so is furniture, and so is the blink after a bump
  const p = playerBox();
  for (const o of obstacles) {
    if (o.type !== "puddle" || o.soaked) continue;
    if (p.x + 8 < o.x + o.w - 8 && p.x + p.w - 8 > o.x + 8) {
      if (power && power.type === "speed") return wipeOut(o); // far too fast for a wet floor
      soak(o);
    }
  }
}
function soak(o) {
  o.soaked = true;
  slipTime = SLIP_MS;
  sfx.splash();
  const b = playerBox();
  splash(b);
  popups.push({ x: b.x + b.w / 2, y: b.y - 8, text: "Slippery!", life: 700 });
  if (pages > 0) {
    // one soggy page comes loose
    pages--;
    pageLoss = { amount: 1, life: 900 };
    lostPages.push({
      x: b.x + b.w / 2,
      y: b.y + b.h * 0.4,
      vx: 0.05,
      vy: -0.4,
      rot: 0.2,
      spin: 0.008,
      life: 900,
    });
  }
}

// Speed reading into a puddle: the book wipes out (see drawWipeout) and the run ends.
function wipeOut(o) {
  o.soaked = true;
  const b = playerBox();
  splash(b);
  splash(b);
  sfx.splash();
  sfx.wipeout();
  heartPop = { index: 0, count: lives, life: 500 }; // every heart left pops at once
  lives = 0;
  wipeout = { t: 0, x: player.x, groundY: player.y + player.h, slammed: false };
  player.ducking = false;
  duckHeld = false;
  popups.push({ x: b.x + b.w / 2, y: b.y - 8, text: "Wipeout!", life: 1100 });
  gameOver(true);
}
function updateWipeout(dt) {
  const wo = wipeout;
  wo.t += dt;
  if (wo.slammed || wo.t < WIPEOUT.flipMs) return;
  // the slam: the screen jolts, dust puffs out both ways, and a few pages fly loose
  wo.slammed = true;
  shake = 320;
  sfx.thunk();
  const { cx, cy } = wipeoutPose(wo.t);
  for (let i = 0; i < 12; i++) {
    const dir = i % 2 ? 1 : -1;
    particles.push({
      x: cx + dir * (10 + Math.random() * 20),
      y: FLOOR - 3,
      vx: dir * (0.06 + Math.random() * 0.16) + speed * 0.5, // (particles drift with the run: cancel that, the run has stopped)
      vy: -0.06 - Math.random() * 0.14,
      life: 380 + Math.random() * 250,
      color: i % 3 ? "#d8cfc0" : "#b3a893",
      size: 4 + Math.random() * 2,
    });
  }
  burst(cx, cy, 8, PAPER, 6);
}
// The wiping-out book, t ms in: its middle (cx, cy), how far it's turned, and its squash (in
// its own turned frame). Flipping backwards is turning anticlockwise, ending flat on its back.
function wipeoutPose(t) {
  const k = Math.min(1, t / WIPEOUT.flipMs);
  const forward = WIPEOUT.forward * (1 - (1 - k) * (1 - k)); // eases off as it sails
  const cx = Math.min(W - 30, wipeout.x + player.w / 2 + forward);
  const ang = -(WIPEOUT.flips * 2 + 0.5) * Math.PI * k;
  let sx = 1,
    sy = 1,
    bounce = 0;
  const after = t - WIPEOUT.flipMs;
  if (after > 0) {
    const s = Math.max(0, 1 - after / 180); // slammed flat, springing back
    sx = 1 - 0.3 * s; // (on its back, the book's own x runs up and down the screen)
    sy = 1 + 0.2 * s;
    if (after > 60 && after < 320) bounce = Math.sin(((after - 60) / 260) * Math.PI) * 8; // a little bounce
  }
  // half its height on screen: 25 standing (legs too), 20 lying down (squashed a bit more)
  const half = k < 1 ? 25 - 5 * k : 20 * sx;
  const cy = wipeout.groundY - half - 4 * WIPEOUT.peak * k * (1 - k) - bounce;
  return { cx, cy, ang, sx, sy };
}

function splash(b) {
  for (let i = 0; i < 12; i++) {
    particles.push({
      x: b.x + b.w / 2 + (Math.random() - 0.5) * 30,
      y: FLOOR - 2,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -0.2 - Math.random() * 0.3,
      life: 400 + Math.random() * 300,
      color: Math.random() < 0.5 ? "#7fb8e0" : "#cfe6f5",
      size: 3 + Math.random() * 2,
    });
  }
}

function hits(o) {
  if (o.type === "puddle") return false; // puddles soak instead (see checkPuddles)
  const p = playerBox();
  // furniture only counts if you run into its side: standing on top is fine
  if (o.type === "platform" && p.y + p.h <= o.y + 6) return false;
  const pad = 6; // forgiving hitbox
  // the low table is open underneath: only its top is solid
  const bottom = o.type === "platform" && o.kind === "table" ? o.y + TABLE_SLAB : o.y + o.h;
  return (
    p.x + pad < o.x + o.w &&
    p.x + p.w - pad > o.x &&
    p.y + pad < bottom &&
    p.y + p.h > o.y + 2
  );
}

// ---------- Pages to collect (and the rare bookmark) ----------
// `cx` is the item's center, `y` the top of where a bookmark would hang.
function addPickup(cx, y) {
  const bookmark = Math.random() < BOOKMARK_CHANCE;
  if (story) story.pagesThere += bookmark ? BOOKMARK_PAGES : 1; // (the pages there were to find, for a level's stars)
  if (bookmark) {
    pickups.push({
      kind: "bookmark",
      x: cx - 7,
      y,
      w: 14,
      h: 26,
      color: MARK_COLORS[(Math.random() * MARK_COLORS.length) | 0],
      phase: Math.random() * Math.PI * 2,
    });
  } else {
    pickups.push({
      kind: "page",
      x: cx - 8,
      y: y + 3,
      w: 16,
      h: 20,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function spawnPickups(o, airTime) {
  const r = Math.random();
  if (o.type === "flyer") {
    if (o.swoop || o.dart || o.charge) return; // nothing under the tricky ones, so nobody gets lured in
    // A pair tucked right under the flying book, a reward for ducking.
    if (r < 0.5)
      for (let k = -0.5; k <= 0.5; k++) addPickup(o.x + o.w / 2 + k * PAGE_GAP, FLOOR - 28);
    return;
  }
  const tape =
    lives < LIVES &&
    repairWait <= 0 &&
    !pickups.some((b) => b.kind === "repair");
  const powerUp =
    !tape && !power && powerWait <= 0 && !pickups.some((b) => b.kind === "power");
  if (tape || powerUp || r < 0.4) {
    // An arc over the stack that traces a full jump. The side items sit where the
    // player is a quarter of the jump away from the peak, so this works at any speed.
    const cx = o.x + o.w / 2;
    const side = speed * airTime * 0.25;
    addPickup(cx - side, GROUND_Y - 100);
    if (tape) {
      // the roll of book tape takes the top spot, where only a full jump reaches
      pickups.push({
        kind: "repair",
        x: cx - 11,
        y: GROUND_Y - 138,
        w: 22,
        h: 22,
        phase: Math.random() * Math.PI * 2,
      });
      repairWait = REPAIR_EVERY_MS;
    } else if (powerUp) {
      // so does a power-up
      const types = Object.keys(POWERS);
      pickups.push({
        kind: "power",
        type: types[(Math.random() * types.length) | 0],
        x: cx - 13,
        y: GROUND_Y - 142,
        w: 26,
        h: 26,
        phase: Math.random() * Math.PI * 2,
      });
      powerWait = POWER_GAP_MS[0] + Math.random() * (POWER_GAP_MS[1] - POWER_GAP_MS[0]);
    } else addPickup(cx, GROUND_Y - 136);
    addPickup(cx + side, GROUND_Y - 100);
  } else if (r < 0.7) {
    // A row on the floor, halfway between this stack and the next one.
    const mid = o.x + (o.w + nextSpawn) / 2;
    for (let k = -1; k <= 1; k++) addPickup(mid + k * PAGE_GAP, FLOOR - 34);
  }
}

function updatePickups(dt) {
  const dx = speed * dt;
  for (const b of pickups) b.x -= dx;
  const p = playerBox();
  const using = power && power.type;
  if (using === "magnet") {
    // loose pages and bookmarks just ahead fly to the book
    const pcx = p.x + p.w / 2,
      pcy = p.y + p.h / 2;
    for (const b of pickups) {
      if (b.kind !== "page" && b.kind !== "bookmark") continue;
      const bx = b.x + b.w / 2,
        by = b.y + b.h / 2;
      if (bx < pcx - 60 || bx > pcx + MAGNET_RANGE) continue;
      const ddx = pcx - bx,
        ddy = pcy - by,
        dist = Math.hypot(ddx, ddy) || 1,
        step = Math.min(dist, MAGNET_PULL * dt);
      b.x += (ddx / dist) * step;
      b.y += (ddy / dist) * step;
    }
  }
  const mult = using === "speed" ? 2 : 1; // speed reading: pages count double
  pickups = pickups.filter((b) => {
    if (b.x + b.w < -10) return false;
    const touching =
      p.x < b.x + b.w && p.x + p.w > b.x && p.y < b.y + b.h && p.y + p.h > b.y;
    if (!touching) return true;
    if (b.kind === "page") {
      pages += mult;
      sfx.page();
      burst(b.x + b.w / 2, b.y + b.h / 2, 5, PAPER, 3);
      // (+2 while speed reading). It starts just above the book's head, clear of its face.
      plusOnes.push({ x: b.x + b.w / 2, y: Math.min(b.y, p.y) - 4, text: `+${mult}`, life: PLUS_MS });
    } else if (b.kind === "repair") {
      heal(b);
    } else if (b.kind === "power") {
      startPower(b);
    } else {
      pages += BOOKMARK_PAGES * mult;
      sfx.bookmark();
      burst(b.x + b.w / 2, b.y + b.h / 2, 14, b.color);
      popups.push({
        x: b.x + b.w / 2,
        y: b.y,
        text: `Bookmark! +${BOOKMARK_PAGES * mult} pages`,
        life: 900,
      });
    }
    return false;
  });
}

// ---------- Power-ups ----------
function startPower(b) {
  const def = POWERS[b.type];
  power = { type: b.type, time: def.ms };
  sfx.power();
  burst(b.x + b.w / 2, b.y + b.h / 2, 16, def.color, 5);
  burst(b.x + b.w / 2, b.y + b.h / 2, 8, "#fff6c8", 3);
  popups.push({ x: b.x + b.w / 2, y: b.y, text: def.popup, life: 1300 });
}
function updatePower(dt) {
  if (power) {
    power.time -= dt;
    if (power.time <= 0) endPower();
  } else if (powerWait > 0) powerWait -= dt; // the next one's clock only runs while none is in use
}
function endPower() {
  power = null;
  sfx.powerEnd();
}
// Speed reading knocks a flying book out of the way.
function knockAway(o) {
  obstacles = obstacles.filter((x) => x !== o);
  const cx = o.x + o.w / 2,
    cy = o.y + o.h / 2;
  const colors = o.books.length ? o.books.map((b) => b.color) : [o.color || "#f2c14e"];
  for (let i = 0; i < 14; i++) {
    particles.push({
      x: cx,
      y: cy,
      vx: 0.1 + Math.random() * 0.35, // flung forward, out of the way
      vy: -0.2 - Math.random() * 0.35,
      life: 500 + Math.random() * 300,
      color: colors[i % colors.length],
      size: 5 + Math.random() * 3,
    });
  }
  shake = 90;
  sfx.knock();
  popups.push({ x: cx, y: o.y - 6, text: "Whoosh!", life: 600 });
}
// The hardcover takes a bump: it's used up, and the book blinks safely past.
function blockHit() {
  power = null;
  hurtTime = HURT_MS;
  shake = 140;
  sfx.block();
  const b = playerBox();
  burst(b.x + b.w / 2, b.y + b.h / 2, 14, POWERS.shield.color, 5);
  burst(b.x + b.w / 2, b.y + b.h / 2, 8, GOLD, 4);
  popups.push({ x: b.x + b.w / 2, y: b.y - 8, text: "Blocked!", life: 800 });
}

// Book tape: win back a heart (never more than LIVES).
function heal(b) {
  sfx.heal();
  burst(b.x + b.w / 2, b.y + b.h / 2, 12, "#f3dc9a", 4);
  if (lives >= LIVES) {
    pages += 5; // can't happen in normal play (tape only appears when hurt), but just in case
    return;
  }
  lives++;
  heartGain = { index: lives - 1, life: 600 };
  healTime = 700;
  popups.push({
    x: b.x + b.w / 2,
    y: b.y,
    text: "Taped up! +1 heart",
    life: 900,
  });
}

// ---------- Particles & popups ----------
function burst(x, y, n, color, size = 4) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x,
      y,
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
  for (const p of plusOnes) {
    p.x -= speed * dt; // left behind where the page was, so a row of pages leaves a row of +1s
    p.y -= 0.035 * dt;
    p.life -= dt;
  }
  plusOnes = plusOnes.filter((p) => p.life > 0);
  // these keep going on the game-over screen too
  if (shake > 0) shake -= dt;
  if (heartPop && (heartPop.life -= dt) <= 0) heartPop = null;
  if (heartGain && (heartGain.life -= dt) <= 0) heartGain = null;
  updateLostPages(dt);
}

// ---------- Game loop ----------
function update(dt) {
  // a hard stop into furniture: the whole run freezes while the book smashes and falls back
  if (smash) {
    smash.t += dt;
    updateParticles(dt);
    if (smash.t >= SMASH_MS) {
      smash = null;
      hurtTime = HURT_MS; // blink, so the book can get past the furniture
    }
    return;
  }
  if (story && storyFinishing(dt)) return; // the end of a story level: the book runs on to the goal
  runTime += dt;
  baseSpeed = Math.min(MAX_SPEED, baseSpeed + SPEED_RAMP * dt);
  const wantBoost = power && power.type === "speed" ? SPEED_BOOST : 1;
  boost += (wantBoost - boost) * Math.min(1, dt / 250); // eases up and back down
  speed = baseSpeed * boost;
  runDist += speed * dt;
  distance += speed * dt;
  if (story) storyCheckEnd(); // reached the end of the level's library?

  updatePlayer(dt);
  updateObstacles(dt);
  updatePickups(dt);
  updateParticles(dt);
  updatePower(dt);

  if (hurtTime > 0) hurtTime -= dt;
  if (healTime > 0) healTime -= dt;
  if (slipTime > 0) {
    slipTime -= dt;
    if (slipTime <= 0 && jumpQueued) {
      jumpQueued = false;
      jump(); // the jump pressed during the slip
    }
  }
  if (lives < LIVES && repairWait > 0) repairWait -= dt; // the clock only runs while hurt
  if (lives === 1) {
    // hanging on by a thread: the occasional loose page flutters off
    shedTimer -= dt;
    if (shedTimer <= 0) {
      shedTimer = 450 + Math.random() * 400;
      const b = playerBox();
      burst(b.x + 6, b.y + 8, 1, PAPER, 5);
    }
  }

  checkPuddles();
  if (state !== "running") return; // wiped out in a puddle: the run's over
  if (hurtTime <= 0) {
    const hit = obstacles.find(hits);
    const using = power && power.type;
    if (hit) {
      // furniture and bookshelves (the book tunnels) are solid: running into one ends the run
      const solid = hit.type === "platform" || hit.type === "tunnel";
      if (using === "speed" && hit.type === "flyer") knockAway(hit); // speed reading only clears flying books
      else if (using === "shield") blockHit();
      else if (solid) smashInto(hit); // (the table's edge too: duck under it or hop up)
      else takeHit();
    }
  }
}

// Running into furniture or a bookshelf: a hard stop, and the end of the run. The run freezes
// while the book smashes into it and falls over backwards, and it stays down (see drawSmash) as
// the game ends.
function smashInto(o) {
  // takes every heart you have left: the run ends with the smash
  heartPop = { index: 0, count: lives, life: 500 };
  lives = 0;
  const b = playerBox();
  // Usually it's the front face. But standing up inside a book tunnel hits the shelf overhead:
  // then the book stays where it is rather than snapping back to the tunnel's entrance.
  const faceX = o.x < player.x ? player.x + player.w : o.x;
  smash = { t: 0, final: true, faceX, groundY: player.y + player.h };
  player.ducking = false;
  duckHeld = false;
  shake = 260;
  sfx.thunk();
  for (let i = 0; i < 6; i++) {
    // little stars burst off the impact
    particles.push({ x: o.x, y: b.y + 10 + Math.random() * 20, vx: -0.05 - Math.random() * 0.15, vy: -0.15 - Math.random() * 0.2, life: 500 + Math.random() * 200, color: i % 2 ? "#ffe27a" : "#fff6c8", size: 4 });
  }
  popups.push({ x: b.x + b.w / 2, y: b.y - 8, text: "Thunk!", life: 900 });
  burst(b.x + b.w / 2, b.y + b.h / 2, 10, PAPER, 6);
  gameOver(true);
}

// A bump costs one heart. The last heart ends the run.
function takeHit() {
  lives--;
  heartPop = { index: lives, life: 500 };
  if (lives <= 0) return gameOver();
  hurtTime = HURT_MS;
  shake = 200;
  sfx.hurt();
  musicDuck();
  const b = playerBox();
  burst(b.x + b.w / 2, b.y + b.h / 2, 10, PAPER, 6);
  popups.push({
    x: b.x + b.w / 2,
    y: b.y - 8,
    text: lives === 1 ? "Last heart!" : "Ouch!",
    life: 700,
  });
  losePages(b);
}

// A bump knocks a few pages out of the book: they fly off as real sheets, and the
// page counter flashes red with a "−3".
function losePages(b) {
  const lost = Math.min(PAGES_LOST_ON_HIT, pages);
  if (lost === 0) return;
  pages -= lost;
  pageLoss = { amount: lost, life: 900 };
  sfx.lose();
  for (let i = 0; i < lost; i++) {
    lostPages.push({
      x: b.x + b.w / 2,
      y: b.y + b.h * 0.4,
      vx: 0.04 + (i - (lost - 1) / 2) * 0.08 + (Math.random() - 0.5) * 0.03, // fanned out over the book
      vy: -0.42 - Math.random() * 0.12, // popped upward
      rot: Math.random() * 0.6 - 0.3,
      spin: (Math.random() < 0.5 ? -1 : 1) * (0.006 + Math.random() * 0.006),
      life: 900,
    });
  }
}

function updateLostPages(dt) {
  for (const l of lostPages) {
    l.vy += 0.0011 * dt; // lighter than the book, so they float down
    l.x += l.vx * dt - speed * dt * 0.25; // and drift back gently as the run carries on
    l.y += l.vy * dt;
    l.rot += l.spin * dt;
    l.life -= dt;
  }
  lostPages = lostPages.filter((l) => l.life > 0 && l.y < H + 30);
  if (pageLoss && (pageLoss.life -= dt) <= 0) pageLoss = null;
}

// stayPut: the book ends the run where it is, on its back (a smash or a wipeout draws it), rather
// than tumbling away off the screen.
function gameOver(stayPut = false) {
  state = "over";
  power = null;
  deathMs = wipeout ? WIPEOUT.overMs : DEATH_MS; // a wipeout takes longer to play out
  const b = playerBox();
  if (!stayPut) {
    shake = 300;
    sfx.crash();
    // loose pages fly everywhere…
    burst(b.x + b.w / 2, b.y + b.h / 2, 18, PAPER, 7);
    burst(b.x + b.w / 2, b.y + b.h / 2, 8, "#2f5d62", 5);
    // …and the book gets knocked up and backwards, tumbling off the bottom of the screen
    tumble = {
      x: b.x + b.w / 2,
      y: b.y + b.h / 2,
      vx: TUMBLE.vx,
      vy: TUMBLE.vy,
      rot: 0,
      shed: 0,
    };
  }
  player.ducking = false; // it tumbles as the standing book
  player.vy = 0;
  newBest = saveBest();
  overTime = 0;
  selected.over = 0;
}

// The tumble: the book flies up, spins and falls out of the bottom of the screen.
// With these numbers it's gone in about 0.6 s, well inside DEATH_MS.
const TUMBLE = { vx: -0.08, vy: -0.6, spin: -0.014 }; // px/ms, px/ms, radians per ms

function updateTumble(dt) {
  if (!tumble || tumble.y > H + 60) return;
  tumble.vy += GRAVITY * dt;
  tumble.x += tumble.vx * dt;
  tumble.y += tumble.vy * dt;
  tumble.rot += TUMBLE.spin * dt;
  // a trail of loose pages
  tumble.shed -= dt;
  if (tumble.shed <= 0) {
    tumble.shed = 70;
    burst(tumble.x, tumble.y, 1, PAPER, 5);
  }
}

function drawTumble() {
  if (!tumble || tumble.y > H + 60) return;
  ctx.save();
  // spin around the book's center: move there, rotate, then draw the book as usual
  ctx.translate(tumble.x, tumble.y);
  ctx.rotate(tumble.rot);
  ctx.translate(-(player.x + player.w / 2), -(player.y + player.h / 2));
  drawPlayer();
  ctx.restore();
}

// ---------- Menus: start screen, pause, how to play, game over ----------
// Each menu screen has a row of buttons. Pick one with the mouse or a tap, or with
// ← → and Enter / Space. Esc goes back.
let newBest = false;
let overTime = 0; // ms since the run ended
const DEATH_MS = 900; // let the crash play out (pages flying, the book tumbling away) first…
const OVER_FADE_MS = 300; // …then fade the game-over panel in over this long
let deathMs = DEATH_MS; // (this run's wait: longer after a wipeout, see WIPEOUT.overMs)
const overGraceMs = () => deathMs + OVER_FADE_MS; // its buttons work once the panel is fully shown
let howtoFrom = "ready"; // the screen How to play goes back to: "ready" or "paused"
let howtoPage = 0; // How to play: which topic (see HOWTO_PAGES)
const selected = { ready: 0, paused: 0, howto: 0, over: 0, chars: 0, levels: 0, cleared: 0 }; // highlighted button on each screen
// Was the highlight last moved with the keyboard? If not (mouse or finger), the start screen's
// highlight stays on Start except while another button is hovered.
let keyNav = false;

// Keep the most pages collected in one run. Returns true if this run beat it.
function saveBest() {
  if (story) return false; // (Endless Mode's best only: a story level has stars instead)
  if (pages <= best) return false;
  best = pages;
  safeSet("runner-best-pages", best);
  return true;
}

// A row of buttons, centered across the game (three to a row are a bit narrower).
function buttonRow(y, ...items) {
  const w = items.length > 2 ? 140 : 160,
    gap = 16,
    total = items.length * w + (items.length - 1) * gap;
  return items.map(([id, label], i) => ({
    id,
    label,
    x: W / 2 - total / 2 + i * (w + gap),
    y,
    w,
    h: 42,
  }));
}
// A column of buttons, centered (the tall layout, on phones held upright): big, easy to tap,
// with room between them.
const COL_BTN = { w: 270, h: 54, gap: 18 };
function buttonCol(y, ...items) {
  const { w, h, gap } = COL_BTN;
  return items.map(([id, label], i) => ({
    id,
    label,
    x: W / 2 - w / 2,
    y: y + i * (h + gap),
    w,
    h,
  }));
}
const MENU = {
  ready: [
    ["story", "Story"],
    ["endless", "Endless"],
    ["howto", "How to play"],
  ], // (+ the character card under them, added in makeButtons)
  levels: [["home", "Back"]], // Story Mode's level list (+ a tile for each level: see storyButtons)
  cleared: [
    ["continue", "Continue"],
    ["replay", "Play again"],
    ["map", "Levels"],
  ],
  chars: [["done", "Done"]],
  paused: [
    ["resume", "Resume"],
    ["howto", "How to play"],
    ["quit", "Quit"],
  ],
  howto: [
    ["next", "Next ›"], // ("Done" on the last page)
    ["back", "Close"],
  ],
  over: [
    ["again", "Play again"],
    ["menu", "Main menu"],
  ],
};
// Where each screen's buttons go: a row in the wide layout, a column in the tall one.
const BUTTON_Y = {
  wide: { ready: 178, chars: 234, paused: 196, howto: 220, over: 196, levels: 252, cleared: 226 },
  tall: { ready: 340, chars: 494, paused: 288, howto: 446, over: 330, levels: 486, cleared: 318 },
};
let BUTTONS = {};
function makeButtons() {
  BUTTONS = {};
  for (const [screen, items] of Object.entries(MENU)) {
    BUTTONS[screen] = (tall() ? buttonCol : buttonRow)(
      BUTTON_Y[layout][screen],
      ...items,
    );
  }
  // The start screen's Characters option is a card with the chosen character's portrait,
  // set apart under the main buttons. It's still a button, so the arrow keys reach it.
  const card = tall()
    ? { w: COL_BTN.w, h: 58, y: BUTTON_Y.tall.ready + MENU.ready.length * (COL_BTN.h + COL_BTN.gap) + 6 } // (just under the buttons)
    : { w: 260, h: 46, y: 232 };
  BUTTONS.ready.push({ id: "chars", label: "Characters", card: true, x: W / 2 - card.w / 2, ...card });
  if (typeof storyButtons === "function") storyButtons(); // (once deweydash-story.js has loaded)
}
const isMenu = () => state in BUTTONS;
// Is the start screen (or a screen opened from it) showing? Then there's no score bar.
const onStartScreen = () =>
  state === "ready" ||
  state === "chars" ||
  state === "levels" ||
  (state === "howto" && howtoFrom === "ready");

// Changing scenes (starting a run, or going back to the start screen from pause or game over):
// an iris closes in on the book (pausing on it for a moment, like an old cartoon) down to black;
// the change happens in the dark, then the iris opens out from the book in the new scene.
// Starting a run then has the book standing ready, a 3, 2, 1 countdown, and "Go!".
const IRIS_CLOSE_MS = 400, // closing in, down to a small circle around the book
  IRIS_PAUSE_MS = 220, // holding on the book
  IRIS_SNAP_MS = 130, // then shut
  IRIS_PAUSE_R = 46, // the small circle's radius
  FADE_OUT_MS = IRIS_CLOSE_MS + IRIS_PAUSE_MS + IRIS_SNAP_MS,
  FADE_HOLD_MS = 150, // black, for a moment
  FADE_IN_MS = 450, // the iris opening on the new scene
  COUNT_START_MS = FADE_HOLD_MS + FADE_IN_MS, // when the "3" appears (once the screen is clear)
  COUNT_STEP_MS = 750, // how long each number stays
  GO_MS = 600; // how long "Go!" shows once running
let fadeOut = null, // ms into the fade to black, or null when not fading
  fadeThen = null, // what to do once the screen is black
  fadeIn = Infinity, // ms since the new scene started fading in
  countTime = 0, // ms into the countdown
  countShown = 0; // the number last shown (so each one ticks once)
function fadeTo(then) {
  if (fadeOut !== null) return; // already on its way
  fadeOut = 0;
  fadeThen = then;
}
// Called every frame: moves the fades along, and makes the change once the screen is black.
function updateFade(dt) {
  fadeIn += dt;
  if (fadeOut === null) return;
  fadeOut += dt; // (the screen underneath keeps animating as it fades)
  if (fadeOut < FADE_OUT_MS) return;
  const then = fadeThen;
  fadeOut = fadeThen = null;
  then();
  fadeIn = -FADE_HOLD_MS; // counts up through the hold (still black), then the reveal
}
function startRun() {
  fadeTo(beginCountdown);
}
// Back to the start screen (Main menu from game over, or Quit from pause).
function goHome() {
  fadeTo(() => {
    if (story) leaveStory();
    reset();
    state = "ready";
    if (!keyNav) selected.ready = 0; // Start is highlighted
  });
}
// Called when the screen is fully black: set up the run and begin the countdown.
function beginCountdown() {
  reset(); // a fresh run (the start screen's animation clock kept ticking)
  state = "countdown";
  countTime = 0;
  countShown = 0;
}
function updateCountdown(dt) {
  countTime += dt;
  const n = 3 - Math.floor((countTime - COUNT_START_MS) / COUNT_STEP_MS);
  if (countTime >= COUNT_START_MS && n >= 1 && n !== countShown) {
    countShown = n;
    sfx.count();
  }
  if (countTime >= COUNT_START_MS + 3 * COUNT_STEP_MS) {
    state = "running";
    sfx.start();
  }
}
// Drawn over everything: the iris, the numbers and "Go!".
function drawTransition() {
  const ease = (p) => p * p * (3 - 2 * p);
  if (fadeOut !== null) {
    const [cx, cy, full] = irisCenter();
    let r;
    if (fadeOut < IRIS_CLOSE_MS) r = IRIS_PAUSE_R + (full - IRIS_PAUSE_R) * (1 - ease(fadeOut / IRIS_CLOSE_MS));
    else if (fadeOut < IRIS_CLOSE_MS + IRIS_PAUSE_MS) r = IRIS_PAUSE_R;
    else {
      const p = Math.min(1, (fadeOut - IRIS_CLOSE_MS - IRIS_PAUSE_MS) / IRIS_SNAP_MS);
      r = IRIS_PAUSE_R * (1 - p * p); // speeding up as it shuts
    }
    drawIris(cx, cy, r);
    return;
  }
  if (fadeIn < 0) drawIris(0, 0, 0);
  else if (fadeIn < FADE_IN_MS) {
    const [cx, cy, full] = irisCenter();
    drawIris(cx, cy, full * ease(fadeIn / FADE_IN_MS));
  }
  const cy = WORLD_Y + 140; // the middle of the room
  if (state === "countdown") {
    if (countTime < COUNT_START_MS) return;
    const into = (countTime - COUNT_START_MS) % COUNT_STEP_MS,
      p = into / COUNT_STEP_MS; // 0 → 1 through this number
    // each number pops in big, settles, then fades as the next one comes
    const scale = 1 + Math.max(0, 0.5 - p * 2.5),
      alpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
    countNumber(String(3 - Math.floor((countTime - COUNT_START_MS) / COUNT_STEP_MS)), cy, scale, alpha);
  } else if (state === "running" && runTime < GO_MS) {
    const p = runTime / GO_MS;
    countNumber("Go!", cy, 1 + p * 0.4, 1 - p);
  }
}
// Where the iris centers: on the book, wherever it is (standing, crashed into furniture, or
// tumbling away at game over), kept on screen. Also returns the radius that uncovers everything.
function irisCenter() {
  let x = player.x + player.w / 2,
    y = player.y + player.h / 2;
  if (wipeout) {
    ({ cx: x, cy: y } = wipeoutPose(wipeout.t)); // wherever it is in its flips, or lying flat
  } else if (smash) {
    x = smash.faceX - 18; // pressed against the furniture
    y = smash.groundY - 22;
  } else if (state === "over" && tumble) {
    x = tumble.x;
    y = tumble.y;
  }
  const cx = Math.min(W - 40, Math.max(40, x)),
    cy = Math.min(H + TOP - 40, Math.max(40 - TOP, WORLD_Y + y));
  const full = Math.hypot(Math.max(cx, W - cx), Math.max(cy + TOP, H + TOP - cy)) + 10; // past the farthest corner
  return [cx, cy, full];
}
// Black everywhere except a circle of radius r around (cx, cy).
function drawIris(cx, cy, r) {
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.rect(0, -TOP, W, H + 2 * TOP); // (the whole screen)
  if (r > 0) {
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.fill("evenodd");
}

function countNumber(text, cy, scale, alpha) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(W / 2, cy);
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 72px Georgia, serif";
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(20, 14, 10, 0.85)";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = text === "Go!" ? GOLD : PAPER;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function pause() {
  if (state !== "running") return;
  state = "paused";
  selected.paused = 0;
}

function choose(id) {
  if (state === "over" && overTime < overGraceMs()) return; // let the crash and the fade finish
  if (fadeOut !== null) return; // fading to another scene: the buttons are done
  if (storyChoose(id)) return; // Story Mode's choices (and Endless, which leaves it)
  if (id === "start" || id === "again") startRun();
  else if (id === "menu") goHome();
  else if (id === "quit") {
    saveBest(); // pages collected before quitting still count toward the best
    goHome();
  } else if (id === "resume") state = "running";
  else if (id === "howto") {
    howtoFrom = state;
    selected.howto = 0; // Next, so Enter / Space step through the pages
    howtoPage = 0;
    topics.open = false;
    state = "howto";
  } else if (id === "next") {
    if (howtoPage < HOWTO_PAGES.length - 1) howtoPage++;
    else choose("back"); // (Done)
  }
  else if (id === "back") state = howtoFrom;
  else if (id === "chars") state = "chars";
  else if (id === "done") state = "ready";
  if (state === "ready" && !keyNav) selected.ready = 0; // back on the start screen: Start is highlighted
}

// What Esc does on each menu screen.
function goBack() {
  if (storyGoBack()) return;
  if (state === "paused") choose("resume");
  else if (state === "howto") choose("back");
  else if (state === "chars") choose("done");
  else if (state === "over") choose("menu");
}

// ---------- Layout: wide (desktop, tablets, phones on their side) or tall (phones held upright) ----------
// The game area changes shape to suit the screen, but never mid-run: a new layout is only
// applied on the start screen (and the screens opened from it), when paused, or on game over.
// worldY: how far down the screen the library strip is drawn. In the tall layout it sits in the
// middle, with a dark ceiling above (where the buttons and score go) and the floor below.
const LAYOUTS = { wide: { w: 800, h: 320, worldY: 0 }, tall: { w: 450, h: 640, worldY: 140 } };
let layout = "wide";
let WORLD_Y = 0;
// Full screen (a phone held upright, with the game on its own page): the game takes over the
// whole screen like an app, and the page never scrolls. Everything is still laid out in the
// layout's W × H area, which sits in the middle; the canvas is TOP taller above and below it to
// match the screen's shape (the ceiling and floor carry on into it), and the top bar (sound,
// hearts, score, profile) is pinned to the very top of the screen.
let TOP = 0;
const tall = () => layout === "tall";
function wantedLayout() {
  return window.innerHeight > window.innerWidth && window.innerWidth <= 600
    ? "tall"
    : "wide";
}
function fullTop(name) {
  if (name !== "tall") return 0;
  const { w, h } = LAYOUTS.tall;
  return Math.max(0, Math.round(((w * window.innerHeight) / window.innerWidth - h) / 2));
}
function applyLayout(name) {
  layout = name;
  W = LAYOUTS[name].w;
  H = LAYOUTS[name].h;
  TOP = fullTop(name);
  document.documentElement.classList.toggle("fullscreen", name === "tall");
  canvas.width = W;
  canvas.height = H + 2 * TOP;
  WORLD_Y = LAYOUTS[name].worldY;
  canvas.style.setProperty("--ratio", W / canvas.height); // lets the page shrink the game to fit the screen's height
  // the top bar: pinned to the top of the screen. On a phone, the profile badge is bigger.
  MUTE_BTN.y = 12 - TOP;
  PROFILE = tall()
    ? { x: W - 12 - 136, y: 12 - TOP - 4, w: 136, h: 40 }
    : { x: W - 12 - 112, y: 12, w: 112, h: 32 };
  // wide: the score bar sits beside the profile; tall: there isn't room, so it goes on the
  // ceiling, under the row of buttons
  SCORE = tall()
    ? { x: W / 2 - 179, y: 54 - TOP }
    : { x: PROFILE.x - 8 - 358, y: 12 };
  makeButtons();
  fitCanvas();
}
// Full screen: size the canvas to fill the screen exactly. Otherwise the page's CSS sizes it.
function fitCanvas() {
  if (!document.documentElement.classList.contains("fullscreen")) {
    canvas.style.width = canvas.style.height = "";
    return;
  }
  const s = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
  canvas.style.width = canvas.width * s + "px";
  canvas.style.height = canvas.height * s + "px";
}
window.addEventListener("resize", fitCanvas);
function checkLayout() {
  if (state === "running" || state === "countdown" || fadeOut !== null) return; // locked during a run
  const want = wantedLayout();
  if (want !== layout || fullTop(want) !== TOP) applyLayout(want); // (also when a phone's screen changes shape)
}

let last = performance.now();
function frame(now) {
  checkLayout();
  updateMusic();
  const dt = Math.min(now - last, 50); // clamp so tab-switching doesn't teleport things
  last = now;
  updateFade(dt);
  if (state === "running") update(dt);
  else if (state === "countdown") updateCountdown(dt);
  else if (state === "over") {
    updateTumble(dt);
    if (smash) smash.t += dt; // a final smash keeps animating (the book lies there, seeing stars)
    if (wipeout) updateWipeout(dt); // so does a wipeout (the flips, the slam, the halo)
    updateParticles(dt);
    overTime += dt;
  } else if (state === "book") updateBook(dt);
  else if (state === "cleared") updateCleared(dt);
  else if (onStartScreen()) {
    // start screen: the library drifts by slowly while the book jogs on the spot
    runTime += dt;
    distance += START_DRIFT * dt;
    // the title animates once the screen is fully showing (after the iris opens)
    if (intro) updateIntro(dt);
    if (!intro || introTime >= INTRO_TITLE_AT) updateTitle(dt);
  }
  ctx.save();
  ctx.translate(0, TOP); // (full screen: the layout sits in the middle)
  draw();
  drawTransition();
  ctx.restore();
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
// (The floor runs on down past the bottom of the layout: in full screen there's more below.)
function tiles(x, w, base, line) {
  const fh = H + 2 * TOP - FLOOR;
  R(x, FLOOR, w, fh, base);
  R(x, FLOOR + 13, w, 1, line);
  for (let tx = -((distance * 0.9) % 56); tx < W; tx += 56)
    R(tx, FLOOR, 1, 13, line);
  for (let tx = -((distance * 1.1 + 30) % 72); tx < W; tx += 72)
    R(tx, FLOOR + 14, 1, fh, line);
}
function carpet(x, w, base, fleck) {
  const fh = H + 2 * TOP - FLOOR;
  R(x, FLOOR, w, fh, base);
  for (let k = Math.floor(distance / 9); k * 9 - distance < W; k++) {
    R(k * 9 - distance, FLOOR + 3 + hash(k, 5) * (fh - 6), 2, 1, fleck);
  }
}
function recessedLights(x, w, y, spacing) {
  for (let lx = x + spacing / 2; lx < x + w; lx += spacing)
    oval(lx, y, 8, 2.5, "#fff6d8");
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
  label(
    "a b c",
    x + 165,
    CEIL + 120,
    80,
    "rgba(70, 85, 130, 0.25)",
    "Georgia, serif",
  );

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
  for (let i = 0; i < 5; i++)
    R(
      x + 442 + i * 27,
      CEIL + 40 + (i % 2) * 8,
      18,
      24,
      i === 2 ? "#4b79d9" : "#fbfaf6",
    );
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
    for (let i = 0; i < 4; i++)
      R(
        ax - hw + 4 + i * (hw / 2),
        FLOOR - lvl - 16,
        8,
        16,
        BRIGHT[(i + lvl) % BRIGHT.length],
      );
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
      oval(
        cx + 4 + hash(i, cx) * 62,
        FLOOR - 58 + hash(cx, i) * 48,
        2.5,
        2.5,
        BRIGHT[i % BRIGHT.length],
      );
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
    ctx.lineTo(
      x + i,
      baseY +
        Math.sin(i * 0.013 + phase) * amp +
        thickness +
        Math.sin(i * 0.02 + phase) * 3,
    );
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
  for (let k = 1; k < 4; k++)
    R(px + k * 80, pt + 36, 2, FLOOR - pt - 36, "#b07636");
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
  poly(
    "#b9bec4",
    gx - 30,
    FLOOR - 14,
    gx - 16,
    gy + r - 8,
    gx + 16,
    gy + r - 8,
    gx + 30,
    FLOOR - 14,
  );

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
  const shape = (pts) =>
    poly(land, ...pts.flatMap(([a, b]) => [gx + a, gy + b]));
  shape([
    [-58, -52],
    [-30, -74],
    [0, -80],
    [22, -66],
    [14, -50],
    [30, -40],
    [8, -22],
    [-6, -8],
    [-18, -2],
    [-28, -20],
    [-48, -30],
  ]);
  shape([
    [12, -84],
    [36, -80],
    [30, -64],
    [16, -68],
  ]);
  shape([
    [-6, -4],
    [6, 0],
    [30, 8],
    [46, 24],
    [34, 48],
    [16, 66],
    [6, 86],
    [2, 60],
    [-4, 30],
    [-10, 10],
  ]);
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
    for (let bx = x + (row % 2) * 11; bx < x + 230; bx += 22)
      R(bx, y, 1, 9, "#9c5332");
  }
  // big windows by the entrance
  R(x + 780, CEIL + 14, 210, FLOOR - CEIL - 24, "#eef4f7");
  for (let mx = x + 780; mx <= x + 990; mx += 42)
    R(mx, CEIL + 14, 3, FLOOR - CEIL - 24, "#c4ccd2");
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
      for (let pxx = dx + 14; pxx < dx + 128; pxx += 6)
        R(pxx, py, 2, 2, "#aab0b6");
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
  for (let i = 0; 50 + i * 90 < w; i++)
    oval(x + 50 + i * 90, 16 + (i % 2) * 16, 7, 2.5, "#fffbe8");
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
      poly(
        c,
        wx + 4 + t * 16,
        CEIL + 46,
        wx + 18 + t * 16,
        CEIL + 46,
        wx + 11 + t * 16,
        CEIL + 58,
      );
    }
  }

  tiles(x, w, "#3e3633", "#2d2725");

  // the counter
  R(x + 70, FLOOR - 76, 860, 76, MAPLE);
  R(x + 70, FLOOR - 80, 860, 6, "#2b2d31");
  R(x + 70, FLOOR - 58, 860, 2, "#c08f48");
  for (let px = x + 118; px < x + 930; px += 48)
    R(px, FLOOR - 56, 2, 56, "#b9873f");
  R(x + 700, FLOOR - 98, 230, 98, "#dcae68");
  R(x + 696, FLOOR - 102, 238, 5, "#c8964f");
  for (let px = x + 740; px < x + 930; px += 48)
    R(px, FLOOR - 90, 2, 90, "#c08f48");

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
  for (let k = 0; k < 6; k++)
    R(x + 272 + k * 100, CEIL + 16, 88, 96, "#edf2f6");
  const letters = "LIBRARY";
  for (let i = 0; i < letters.length; i++) {
    label(
      letters[i],
      x + 300 + i * 82,
      CEIL + 50 + (i % 3) * 22,
      20,
      COLORFUL[i % COLORFUL.length],
      "Georgia, serif",
    );
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
  for (let px = cx + 133; px < cx + 800; px += 133)
    R(px, top + 38, 2, 72, "#b98340");
  R(cx, FLOOR - 8, 800, 8, "#2a2c30");
  for (const [sx, text] of [
    [cx + 140, "A/V DROP"],
    [cx + 410, "BOOK DROP"],
    [cx + 680, "BOOK DROP"],
  ]) {
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
  if (story) return drawStoryBackground(); // a story level's own run of scenes, start to finish
  const off = distance * BG_PARALLAX;
  let sx = Math.floor(off / LOOP) * LOOP - off; // screen x where the current loop starts
  const seams = [];
  for (let i = 0; sx < W; i++) {
    const z = SCENES[i % SCENES.length];
    if (sx + z.w > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, 0, z.w, H + 2 * TOP);
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
  // push the scenery back a touch so the obstacles and pages pop
  R(0, 0, W, FLOOR, "rgba(20, 14, 10, 0.12)");
  R(0, FLOOR, W, 2, "rgba(0, 0, 0, 0.3)");
}

// ---------- Drawing ----------
// In the tall layout the library strip sits in the middle of the screen. Above it: a dark
// ceiling (the buttons and score bar sit on it). Below it: the floor carries on.
function drawTallCeiling() {
  const g = ctx.createLinearGradient(0, -TOP, 0, WORLD_Y);
  g.addColorStop(0, "#1a1512");
  g.addColorStop(1, "#2e2724");
  ctx.fillStyle = g;
  ctx.fillRect(0, -TOP, W, WORLD_Y + TOP); // (full screen: all the way up to the top)
  // a row of soft ceiling lights just above the room
  for (let lx = 45; lx < W; lx += 90) {
    oval(lx, WORLD_Y - 12, 16, 3, "rgba(255, 236, 190, 0.18)");
    oval(lx, WORLD_Y - 12, 7, 1.6, "rgba(255, 244, 214, 0.8)");
  }
  R(0, WORLD_Y - 3, W, 3, "#14100d"); // where the ceiling meets the room
}
// Shade the floor below the room so it reads as floor, and for the first few seconds of a
// run, show the touch controls there.
function drawTallFloor() {
  const bottom = H + TOP - WORLD_Y; // the bottom of the screen, in room coordinates
  const g = ctx.createLinearGradient(0, FLOOR + 30, 0, bottom);
  g.addColorStop(0, "rgba(20, 14, 10, 0)");
  g.addColorStop(1, "rgba(20, 14, 10, 0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, FLOOR + 2, W, bottom - FLOOR);
  if (state === "running" && runTime < 6000) {
    ctx.globalAlpha = Math.min(1, (6000 - runTime) / 1000); // fades out over the last second
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(20, 14, 10, 0.6)";
    roundRect(W / 2 - 170, FLOOR + 96, 340, 64, 12);
    ctx.fillStyle = PAPER;
    ctx.font = "bold 17px Georgia, serif";
    ctx.fillText("Tap to jump", W / 2, FLOOR + 122);
    ctx.font = "15px Georgia, serif";
    ctx.fillText("Swipe down & hold to duck", W / 2, FLOOR + 146);
    ctx.globalAlpha = 1;
  }
}

function draw() {
  if (state === "book") return drawBook(); // a Story Mode picture book takes the whole screen
  // a quick shake when the player gets bumped (the HUD stays still)
  ctx.save();
  if (shake > 0) {
    const s = Math.min(1, shake / 200) * 4;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  if (WORLD_Y) {
    drawTallCeiling();
    ctx.translate(0, WORLD_Y); // everything in the room is drawn lower down the screen
  }
  drawBackground();
  if (tall()) drawTallFloor();

  for (const o of obstacles) if (o.type === "puddle") drawPuddle(o); // on the floor, under everything
  for (const o of obstacles) {
    if (story && storyDrawObstacle(o)) continue; // (outdoors: hedges, birds and sprinklers)
    if (o.type === "flyer") drawFlyingBook(o, o.skimY == null); // (no floor shadow when it's up on furniture)
    else if (o.type === "tunnel") drawTunnel(o);
    else if (o.type === "sign") drawWetSign(o);
    else if (o.type === "platform") drawPlatform(o);
    else for (const b of o.books) drawLyingBook(b);
  }

  for (const b of pickups) {
    const bob = Math.sin(runTime * 0.005 + b.phase) * 3;
    if (b.kind === "page")
      drawPage(
        b.x,
        b.y + bob,
        b.w,
        b.h,
        Math.sin(runTime * 0.004 + b.phase) * 0.18,
      );
    else if (b.kind === "repair")
      drawTape(b.x + b.w / 2, b.y + b.h / 2 + bob, true);
    else if (b.kind === "power") drawPowerUp(b, bob);
    else drawBookmark(b.x, b.y + bob, b.w, b.h, b.color);
  }

  if (wipeout) drawWipeout();
  else if (smash) drawSmash();
  else if (state !== "over") {
    if (!(story && story.hidden)) {
      // (at the end of some story levels the book goes in through a door, or aboard the Bookmobile)
      drawPlayer();
      drawPowerAura();
    }
  } else drawTumble();

  for (const l of lostPages) {
    ctx.globalAlpha = Math.min(1, l.life / 300); // fade out at the end
    drawPage(l.x - 7, l.y - 9, 14, 18, l.rot);
  }
  ctx.globalAlpha = 1;

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 700);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size * 0.75);
  }
  // each page's "+1": small, no box, drifting up and fading out. Gold with a dark outline, so it
  // reads against the pale shelves and the dark walls alike.
  ctx.font = "bold 15px Georgia, serif";
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(30, 20, 12, 0.85)";
  ctx.fillStyle = "#ffd84a";
  for (const p of plusOnes) {
    ctx.globalAlpha = Math.min(1, p.life / (PLUS_MS * 0.4)); // solid, then fades over its last part
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.lineJoin = "miter";
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, Math.max(0, p.life / 700));
    ctx.font = "bold 16px Georgia, serif";
    const tw = ctx.measureText(p.text).width;
    const px = Math.min(Math.max(p.x, tw / 2 + 10), W - tw / 2 - 10); // keep it on screen
    ctx.fillStyle = "rgba(20, 14, 10, 0.75)";
    roundRect(px - tw / 2 - 6, p.y - 16, tw + 12, 22, 6);
    label(p.text, px, p.y, 16, "#fff", "Georgia, serif");
  }
  ctx.globalAlpha = 1;
  ctx.restore(); // end of the shaking part

  if (state === "ready") drawStartScreen();
  else if (!onStartScreen()) drawHearts(MUTE_BTN.x + MUTE_BTN.w + 8, MUTE_BTN.y);
  if (state === "running") drawPauseButton();

  // (the corner badges fade up with the rest of the start screen in the opening sequence)
  ctx.globalAlpha = state === "ready" ? introUI() : 1;
  // Sound button (click/tap it, or press M)
  const mb = MUTE_BTN;
  ctx.fillStyle = "rgba(20, 14, 10, 0.65)";
  roundRect(mb.x, mb.y, mb.w, mb.h, 8);
  drawSpeaker(mb.x + 12, mb.y + 16, muted);
  ctx.font = "bold 14px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillStyle = muted ? "#9a8f7c" : PAPER;
  ctx.fillText(muted ? "Sound off" : "Sound on", mb.x + 42, mb.y + 21);

  drawProfile();

  if (onStartScreen()) {
    drawBestBadge();
    ctx.globalAlpha = 1;
    if (state === "howto") drawHowTo();
    if (state === "chars") drawCharacters();
    if (state === "levels") drawLevels();
    return; // the start screen has no score bar
  }
  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle = "rgba(20, 14, 10, 0.65)";
  const sy = SCORE.y; // top of the score bar
  roundRect(SCORE.x, sy, 358, 32, 8);
  drawPage(SCORE.x + 12, sy + 6, 14, 18, -0.08);
  ctx.font = "bold 16px Georgia, serif";
  ctx.textAlign = "left";
  if (pageLoss) {
    const t = 1 - pageLoss.life / 900; // 0 → 1 over the flash
    const jiggle = Math.sin(t * 40) * 3 * (1 - t);
    ctx.fillStyle = Math.floor(t * 8) % 2 ? PAPER : "#ff8a7a"; // flash red
    ctx.fillText("× " + pages, SCORE.x + 32 + jiggle, sy + 22);
    // "−3" drops out below the counter and fades
    ctx.globalAlpha = Math.min(1, (1 - t) * 2);
    const label = "−" + pageLoss.amount,
      ly = sy + 50 + t * 14;
    const lw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.75)";
    roundRect(SCORE.x + 28, ly - 16, lw + 12, 22, 6);
    ctx.fillStyle = "#ff8a7a";
    ctx.fillText(label, SCORE.x + 34, ly);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = PAPER;
    ctx.fillText("× " + pages, SCORE.x + 32, sy + 22);
  }
  if (story) drawStoryProgress(SCORE.x, sy); // the level, and how far through it the book is
  else {
    ctx.fillStyle = GOLD;
    ctx.fillText("BEST " + best, SCORE.x + 108, sy + 22);
    ctx.textAlign = "right";
    ctx.fillStyle = PAPER;
    ctx.fillText(
      "DISTANCE " + Math.floor(runDist * METERS_PER_PX) + " m",
      SCORE.x + 346,
      sy + 22,
    );
  }

  drawPowerHUD();

  // Overlays
  if (state === "paused") drawPause();
  if (state === "howto") drawHowTo();
  if (state === "over") drawGameOver();
  if (story) drawStoryOverlay(); // a level's title as it begins, and the card when it's cleared
}

// ---------- Menu drawing ----------
// The menus (pause, how to play, game over, characters) are library catalog cards: cream paper
// with a soft shadow, dark ink, a red double rule under the title and a red ribbon bookmark.
const INK = "#3a2a1e", // text on the cards
  INK_SOFT = "#7a6a55", // quieter text
  CARD_RED = "#a8382f"; // the rules, ribbon and stamp

// Fill the whole screen (in full screen, that reaches past the layout, above and below).
function fillScreen() {
  ctx.fillRect(0, -TOP, W, H + 2 * TOP);
}
// A darker veil over the game, so the card stands out.
function dimBehindCard() {
  ctx.fillStyle = "rgba(10, 6, 4, 0.6)";
  fillScreen();
}
// The card. `title` (optional) is written at the top, with the rules under it.
function drawCard(x, y, w, h, title, ribbon = true) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  const paper = ctx.createLinearGradient(0, y, 0, y + h);
  paper.addColorStop(0, "#f7f0df");
  paper.addColorStop(1, "#eadfc5");
  ctx.fillStyle = paper;
  roundRect(x, y, w, h, 6);
  ctx.restore();
  // a faint inner border, like a printed card
  ctx.strokeStyle = "rgba(168, 56, 47, 0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
  // the ribbon bookmark, hanging from the top edge near the right corner
  if (ribbon) drawRibbon(x + w - 46, y);
  if (!title) return;
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "bold 26px Georgia, serif";
  ctx.fillText(title, x + w / 2, y + 36);
  cardRules(x, y + 48, w);
}
// The red ribbon bookmark hanging over a card's top edge at (rx, y).
function drawRibbon(rx, y) {
  const rw = 16,
    rh = 34;
  ctx.fillStyle = CARD_RED;
  ctx.beginPath();
  ctx.moveTo(rx, y - 4);
  ctx.lineTo(rx + rw, y - 4);
  ctx.lineTo(rx + rw, y + rh);
  ctx.lineTo(rx + rw / 2, y + rh - 7);
  ctx.lineTo(rx, y + rh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)"; // the fold over the top edge
  ctx.fillRect(rx, y - 4, rw, 4);
}
// The red double rule across a card at y.
function cardRules(x, y, w) {
  ctx.fillStyle = CARD_RED;
  ctx.fillRect(x + 22, y, w - 44, 2);
  ctx.fillRect(x + 22, y + 4, w - 44, 1);
}

// One button; the selected one is gold. `scale` makes it pulse.
function drawButton(b, on, scale = 1) {
  const w = b.w * scale,
    h = b.h * scale,
    x = b.x + (b.w - w) / 2,
    y = b.y + (b.h - h) / 2;
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  roundRect(x + 2, y + 3, w, h, 10);
  ctx.fillStyle = on ? MAPLE : NAVY;
  roundRect(x, y, w, h, 10);
  ctx.strokeStyle = on ? PAPER : GOLD;
  ctx.lineWidth = on ? 2 : 1.5;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = on ? "#fff" : PAPER;
  ctx.font = `bold ${tall() ? 20 : 18}px Georgia, serif`; // (a touch bigger on a phone)
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + (tall() ? 7 : 6));
}

// The current screen's buttons. On the start screen the selected one gently pulses.
function drawButtons() {
  BUTTONS[state].forEach((b, i) => {
    const on = i === selected[state];
    if (b.card) return drawCharacterCard(b, on);
    if (b.tile != null) return drawLevelTile(b, on); // Story Mode's level list
    if (story && state === "over") b = { ...b, label: b.id === "again" ? "Try again" : "Levels" };
    if (b.id === "next" && howtoPage === HOWTO_PAGES.length - 1) b = { ...b, label: "Done" };
    drawButton(
      b,
      on,
      on && state === "ready" ? 1 + Math.sin(runTime * 0.005) * 0.04 : 1,
    );
  });
}

// The start screen's character card: portrait, "Playing as" and the name, and "Change ›".
// Quieter than the main buttons (a dark panel, not a filled button) until it's selected.
function drawCharacterCard(b, on) {
  ctx.fillStyle = on ? "rgba(215, 163, 94, 0.3)" : "rgba(20, 14, 10, 0.7)";
  roundRect(b.x, b.y, b.w, b.h, b.h / 2);
  ctx.strokeStyle = on ? PAPER : "rgba(212, 166, 74, 0.7)";
  ctx.lineWidth = on ? 2 : 1.5;
  ctx.stroke();
  const r = b.h / 2 - 6,
    cy = b.y + b.h / 2;
  drawAvatar(b.x + 6 + r, cy, r);
  const tx = b.x + 12 + r * 2 + 10;
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.font = "11px Georgia, serif";
  ctx.fillText("Playing as", tx, cy - 5);
  ctx.fillStyle = PAPER;
  ctx.font = "bold 16px Georgia, serif";
  ctx.fillText(CHARACTERS[charIndex].name, tx, cy + 13);
  ctx.textAlign = "right";
  ctx.fillStyle = on ? "#fff" : "#c9bc9f";
  ctx.font = `${on ? "bold " : ""}13px Georgia, serif`;
  ctx.fillText("Change ›", b.x + b.w - 18, cy + 5);
}

function hint(text, y) {
  ctx.textAlign = "center";
  ctx.fillStyle = INK_SOFT;
  ctx.font = "12px Georgia, serif";
  ctx.fillText(text, W / 2, y);
}

// The pause button shown during a run (so touch screens can pause too), right of the hearts.
const PAUSE_BTN = {
  x: MUTE_BTN.x + MUTE_BTN.w + 8 + LIVES * 24 + 10 + 8,
  get y() {
    return MUTE_BTN.y; // (in the top bar, wherever that is)
  },
  w: 32,
  h: 32,
};
function drawPauseButton() {
  const b = PAUSE_BTN;
  ctx.fillStyle = "rgba(20, 14, 10, 0.65)";
  roundRect(b.x, b.y, b.w, b.h, 8);
  R(b.x + 10, b.y + 9, 4, 14, PAPER);
  R(b.x + 18, b.y + 9, 4, 14, PAPER);
}

function drawPause() {
  dimBehindCard();
  const pw = tall() ? 380 : 500, // wide enough for three buttons in a row
    py = tall() ? 120 : 34,
    ph = tall() ? 400 : 252;
  drawCard(W / 2 - pw / 2, py, pw, ph, "Shh… paused");
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "16px Georgia, serif";
  ctx.fillText("Your run will wait right here.", W / 2, py + 92);
  ctx.fillStyle = CARD_RED;
  ctx.font = "bold 15px Georgia, serif";
  ctx.fillText("Press P or Esc to keep reading", W / 2, py + 120);
  drawButtons();
  hint(
    tall()
      ? "Quit goes back to the start screen"
      : "← → to choose · Enter or Space to select · Quit goes back to the start screen",
    py + ph - 14,
  );
}

// How to play: its own screen, opened from the start screen or the pause screen. One topic per
// page, with only what that topic needs: Next steps through them, and the Topics list in the top
// right jumps straight to one. (Keyboard: ← → flip pages, T opens Topics, Esc closes.)
// Touch screens are told about taps and swipes, keyboards about keys.
const touchUI = window.matchMedia && window.matchMedia("(hover: none)").matches;
const HOWTO_PAGES = [
  {
    name: "Objective",
    tip: "Dash through the library and collect as many pages as you can!",
    rows: () => [
      { title: "Loose pages", how: "Every one you grab adds to your score.", icon: iconPage },
      { title: "Bookmarks", how: `Rare, but worth ${BOOKMARK_PAGES} pages each!`, icon: iconBookmarkPick },
      { title: "Go the distance", how: "The farther you run, the trickier it gets.", icon: iconStar },
    ],
  },
  {
    name: "Controls",
    tip: touchUI ? "Tap and swipe anywhere on the game." : "Use the arrow keys, or Space and the letters below.",
    rows: () =>
      touchUI
        ? [
            { title: "Jump", how: "Tap. Hold your tap to jump higher.", icon: iconArrowUp },
            { title: "Duck", how: "Swipe down and hold. Mid-air, it drops you fast.", icon: iconArrowDown },
            { title: "Pause", how: "The pause button at the top.", icon: iconPauseBars },
            { title: "Sound", how: "The Sound button at the top left.", icon: iconSound },
          ]
        : [
            { title: "Jump", how: "Space or ↑. Hold it to jump higher.", icon: iconArrowUp },
            { title: "Duck", how: "↓ or S, and hold. Mid-air, it drops you fast.", icon: iconArrowDown },
            { title: "Pause", how: "P or Esc.", icon: iconPauseBars },
            { title: "Sound", how: "M turns it on and off.", icon: iconSound },
          ],
  },
  {
    name: "Hearts",
    tip: "Bumps hurt, but a little book tape fixes everything.",
    rows: () => [
      { title: `You have ${LIVES} hearts`, how: `Each bump costs a heart and ${PAGES_LOST_ON_HIT} pages.`, icon: iconHeart },
      { title: "Book tape", how: "Shows up when you're hurt: grab it for +1 heart.", icon: iconTape },
    ],
  },
  {
    name: "Obstacles",
    tip: "Things on the floor and in the way. Jump or duck!",
    rows: () => [
      { title: "Book stacks", how: "Jump over them. Some come two or three wide.", icon: iconStack },
      { title: "Wet floors", how: "Jump the sign and the puddles: puddles make you slip.", icon: iconWetFloor },
      { title: "Book tunnels", how: "Duck in and hold it. Hit it and the run's over!", icon: iconTunnel },
    ],
  },
  {
    name: "Furniture",
    tip: "Jump on top and run along it. Never run into its side!",
    rows: () => [
      { title: "Carts, benches & chairs", how: "Hop up. Hitting the side ends your run!", icon: iconCart },
      { title: "Reading tables", how: "Hop on top, or duck and slide under.", icon: iconTable },
      { title: "Things on top", how: "Stacks and flying books up there: jump!", icon: iconTopStack },
      { title: "Bookmarks up high", how: "Jump from the furniture to grab them.", icon: iconPerch },
    ],
  },
  {
    name: "Enemies",
    tip: "Flying books! Duck most of them. Each kind moves its own way.",
    rows: () => [
      { title: "Flying books", how: "Duck under them, or jump clean over.", icon: iconFlyerOf("plain") },
      { title: "Orange swoopers", how: "They rise and dive: run under, duck or jump.", icon: iconFlyerOf("swoop") },
      { title: "Blue darters", how: "Faster than the floor. Duck early!", icon: iconFlyerOf("dart") },
      { title: "Red chargers", how: "They shake and flash a “!”, then charge!", icon: iconFlyerOf("charge") },
      { title: "A murder of books", how: "Skimming the floor? Jump! Up high? Duck!", icon: iconFlock },
    ],
  },
  {
    name: "Power-ups",
    tip: "Glowing badges at the very top of a jump. One works at a time.",
    rows: () => {
      const secs = (type) => POWERS[type].ms / 1000;
      return [
        { title: "Bookmark magnet", how: `Pages fly to you for ${secs("magnet")} seconds.`, power: "magnet" },
        { title: "Hardcover", how: `Takes your next bump. Lasts up to ${secs("shield")} seconds.`, power: "shield" },
        { title: "Speed reading", how: `${secs("speed")} seconds: double pages, flying books bounce off!`, power: "speed" },
      ];
    },
  },
];
// The Topics list: open or not, which topic is highlighted, and where things were drawn (for taps).
const topics = { open: false, focus: 0, pill: null, items: [] };

// A line of text split into lines that fit `width` (at the current font).
function wrapLines(text, width) {
  const words = text.split(" "),
    lines = [];
  let line = "";
  for (const w of words) {
    const tryLine = line ? line + " " + w : w;
    if (line && ctx.measureText(tryLine).width > width) {
      lines.push(line);
      line = w;
    } else line = tryLine;
  }
  if (line) lines.push(line);
  if (lines.length === 2) {
    // two lines: split where they come out about even, so no word is left on its own
    let bestLines = lines,
      bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "),
        b = words.slice(i).join(" "),
        w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (w <= width && w < bestW) {
        bestW = w;
        bestLines = [a, b];
      }
    }
    return bestLines;
  }
  return lines;
}

function drawHowTo() {
  dimBehindCard();
  const pw = tall() ? 420 : 600,
    px = W / 2 - pw / 2,
    py = tall() ? 20 : 12,
    ph = tall() ? 590 : 284;
  const page = HOWTO_PAGES[howtoPage],
    n = HOWTO_PAGES.length;
  drawCard(px, py, pw, ph, null, false); // (no ribbon: the Topics list goes in that corner)

  // the header: a small "How to play" and the page number, the topic's name, the red rules
  ctx.textAlign = "left";
  ctx.fillStyle = INK_SOFT;
  ctx.font = "italic 12px Georgia, serif";
  ctx.fillText(`How to play · ${howtoPage + 1} of ${n}`, px + 22, py + 24);
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `bold ${tall() ? 24 : 22}px Georgia, serif`;
  ctx.fillText(page.name, W / 2, tall() ? py + 58 : py + 34);
  const rulesY = tall() ? py + 68 : py + 42;
  cardRules(px, rulesY, pw);

  // one line about the topic (two on a phone, if it needs them)
  ctx.fillStyle = INK;
  ctx.font = "14px Georgia, serif";
  const tipLines = wrapLines(page.tip, pw - 48);
  tipLines.forEach((l, i) => ctx.fillText(l, W / 2, rulesY + 24 + i * 19));

  // the topic's rows: one column, or two when there are four or more on a wide screen
  const rows = page.rows();
  const twoCol = !tall() && rows.length >= 4;
  const top = rulesY + 24 + (tipLines.length - 1) * 19 + (tall() ? 14 : 8); // just under the tip
  const btnTop = BUTTON_Y[layout].howto;
  const step = tall() ? Math.min(84, (btnTop - 28 - top) / rows.length) : 41;
  rows.forEach((r, i) => {
    let cx, ry, room;
    if (tall()) {
      cx = px + 24;
      ry = top + i * step;
      room = pw - 24 - 46 - 14;
    } else if (twoCol) {
      cx = px + 36 + (i % 2) * 284;
      ry = top + Math.floor(i / 2) * step;
      room = 284 - 46 - 26; // (clear of the next column's picture)
    } else {
      cx = px + 110;
      ry = top + i * step;
      room = pw - 110 - 46 - 60;
    }
    if (r.power) drawPowerIcon(r.power, cx + 14, ry + 16, 19);
    else {
      // each picture on a little navy badge, so it shows up on the paper
      ctx.fillStyle = NAVY;
      ctx.beginPath();
      ctx.arc(cx + 14, ry + 16, 19, 0, Math.PI * 2);
      ctx.fill();
      r.icon(cx + 14, ry + 16);
    }
    // the title and what to do, each a touch smaller if it's too long for its space
    const fit = (text, size, min, weight) => {
      ctx.font = `${weight}${size}px Georgia, serif`;
      const s = Math.max(min, Math.min(size, (size * room) / ctx.measureText(text).width));
      ctx.font = `${weight}${s}px Georgia, serif`;
    };
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    fit(r.title, 15, 12, "bold ");
    ctx.fillText(r.title, cx + 46, ry + 13);
    ctx.fillStyle = INK_SOFT;
    fit(r.how, 13, 11, "");
    ctx.fillText(r.how, cx + 46, ry + 31);
  });

  drawButtons();
  hint(
    tall() ? (touchUI ? "Tap Topics to jump to any page" : "← → flip pages · T for topics") : "← → flip pages · T for topics · Esc to close",
    py + ph - 12,
  );
  drawTopics(px, py, pw);
}

// The Topics list, in the card's top right corner: a little button, and when it's open, the list
// of every topic (the one you're on in red).
function drawTopics(px, py, pw) {
  const pill = { x: px + pw - 22 - 96, y: py + 10, w: 96, h: 26 };
  topics.pill = pill;
  ctx.fillStyle = topics.open ? NAVY : "rgba(52, 64, 79, 0.1)";
  roundRect(pill.x, pill.y, pill.w, pill.h, 13);
  ctx.strokeStyle = topics.open ? NAVY : "rgba(52, 64, 79, 0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = topics.open ? PAPER : INK;
  ctx.font = "bold 13px Georgia, serif";
  ctx.fillText("Topics ▾", pill.x + pill.w / 2, pill.y + 18);
  topics.items = [];
  if (!topics.open) return;
  const iw = 160,
    ih = tall() ? 34 : 24, // (taller rows on a phone, easier to tap)
    ix = pill.x + pill.w - iw,
    iy = pill.y + pill.h + 6;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#fbf6ea";
  roundRect(ix, iy, iw, ih * HOWTO_PAGES.length + 8, 8);
  ctx.restore();
  ctx.strokeStyle = "rgba(52, 64, 79, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  HOWTO_PAGES.forEach((p, i) => {
    const r = { x: ix + 4, y: iy + 4 + i * ih, w: iw - 8, h: ih };
    topics.items.push(r);
    if (i === topics.focus) {
      ctx.fillStyle = "rgba(215, 163, 94, 0.3)";
      roundRect(r.x, r.y, r.w, r.h, 5);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = i === howtoPage ? CARD_RED : INK;
    ctx.font = `${i === howtoPage ? "bold " : ""}14px Georgia, serif`;
    ctx.fillText(`${i + 1}. ${p.name}`, r.x + 10, r.y + r.h / 2 + 5);
  });
}
function openTopics() {
  topics.open = true;
  topics.focus = howtoPage;
}
function pickTopic(i) {
  howtoPage = i;
  topics.open = false;
}

// Little pictures for the Controls and Objective pages, each centered on (x, y).
function iconArrowUp(x, y) {
  poly(PAPER, x, y - 11, x + 9, y, x + 4, y, x + 4, y + 10, x - 4, y + 10, x - 4, y, x - 9, y);
}
function iconArrowDown(x, y) {
  poly(PAPER, x, y + 11, x + 9, y, x + 4, y, x + 4, y - 10, x - 4, y - 10, x - 4, y, x - 9, y);
}
function iconPauseBars(x, y) {
  R(x - 7, y - 9, 5, 18, PAPER);
  R(x + 2, y - 9, 5, 18, PAPER);
}
function iconSound(x, y) {
  drawSpeaker(x - 10, y, false);
}
function iconBookmarkPick(x, y) {
  drawBookmark(x - 6, y - 12, 12, 23, RIBBON_RED);
}
function iconStar(x, y) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      r = i % 2 ? 5 : 12;
    pts.push(x + Math.cos(a) * r, y + 1 + Math.sin(a) * r);
  }
  poly(GOLD, ...pts);
}
function iconWetFloor(x, y) {
  oval(x + 5, y + 10, 9, 3, "#4f93cf");
  poly("#f2c230", x - 4, y - 12, x + 4, y + 9, x - 12, y + 9);
  poly("#1a1a1a", x - 4, y - 5, x, y + 4, x - 8, y + 4);
}

function drawGameOver() {
  // wait for the crash to finish, then fade in (rising slightly as it appears)
  const fade = Math.min(1, Math.max(0, (overTime - deathMs) / OVER_FADE_MS));
  if (fade === 0) return;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(0, (1 - fade) * 12);

  dimBehindCard();
  const pw = 380,
    px = W / 2 - pw / 2,
    py = tall() ? 120 : 34,
    ph = tall() ? 384 : 252;
  drawCard(px, py, pw, ph);

  // the run's numbers, like the lines of a due-date card
  const sy = py + (tall() ? 122 : 100); // the numbers' baseline
  ctx.textAlign = "center";
  const stats = [
    [pages, pages === 1 ? "page collected" : "pages collected"],
    story
      ? [`${Math.round(storyProgress() * 100)}%`, "of the way through " + story.level.id]
      : [`${Math.floor(runDist * METERS_PER_PX)} m`, "run"],
  ];
  stats.forEach(([n, label], i) => {
    const x = W / 2 + (i === 0 ? -80 : 80);
    ctx.fillStyle = INK;
    ctx.font = "bold 30px Georgia, serif";
    ctx.fillText(String(n), x, sy);
    ctx.fillStyle = INK_SOFT;
    ctx.font = "13px Georgia, serif";
    ctx.fillText(label, x, sy + 18);
  });
  ctx.fillStyle = "rgba(168, 56, 47, 0.3)"; // a line between them
  ctx.fillRect(W / 2 - 0.5, sy - 26, 1, 48);
  cardRules(px, sy + 26, pw);
  ctx.fillStyle = newBest && best > 0 ? CARD_RED : INK_SOFT;
  ctx.font = "bold 15px Georgia, serif";
  ctx.fillText(
    story
      ? `Level ${story.level.id} · ${story.level.name}`
      : newBest && best > 0 ? "★ New best! ★" : `Best: ${best} pages`,
    W / 2,
    sy + 48,
  );

  // "OVERDUE", rubber-stamped across the top of the card: it slams down as the card appears
  const sp = Math.min(1, Math.max(0, (overTime - deathMs - 120) / 220));
  if (sp > 0) {
    const scale = 1 + (1 - sp) * (1 - sp) * 0.9;
    ctx.save();
    ctx.globalAlpha = fade * Math.min(1, sp * 2) * 0.92;
    ctx.translate(W / 2, py + (tall() ? 52 : 44));
    ctx.rotate(-0.07);
    ctx.scale(scale, scale);
    ctx.strokeStyle = CARD_RED;
    ctx.lineWidth = 3;
    ctx.strokeRect(-104, -24, 208, 48);
    ctx.lineWidth = 1;
    ctx.strokeRect(-98, -18, 196, 36);
    ctx.fillStyle = CARD_RED;
    ctx.font = "bold 30px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OVERDUE", 0, 2);
    ctx.restore();
  }

  drawButtons();
  hint(
    tall()
      ? story ? "Levels goes back to the list of levels" : "Main menu goes back to the start screen"
      : "← → to choose · Enter or Space to select · Esc for the menu",
    py + ph - 14,
  );
  ctx.restore();
}

// A heart centered on (cx, cy), about 2*s wide.
function heartPath(cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + 0.8 * s);
  ctx.bezierCurveTo(
    cx - 1.25 * s,
    cy,
    cx - 0.95 * s,
    cy - 0.95 * s,
    cx,
    cy - 0.35 * s,
  );
  ctx.bezierCurveTo(
    cx + 0.95 * s,
    cy - 0.95 * s,
    cx + 1.25 * s,
    cy,
    cx,
    cy + 0.8 * s,
  );
  ctx.closePath();
}

// The profile badge: the character's name, then a round portrait (worn as the book is worn).
// The ring flashes red when bumped and bright when taped up.
function drawProfile() {
  const b = PROFILE;
  ctx.fillStyle = "rgba(20, 14, 10, 0.65)";
  roundRect(b.x, b.y, b.w, b.h, 8);
  // (sized to the badge: bigger on a phone)
  const r = b.h / 2 - 3;
  ctx.textAlign = "left";
  ctx.fillStyle = PAPER;
  ctx.font = `bold ${b.h > 32 ? 17 : 15}px Georgia, serif`;
  ctx.fillText(CHARACTERS[charIndex].name, b.x + 12, b.y + b.h / 2 + 5);
  drawAvatar(b.x + b.w - r - 6, b.y + b.h / 2, r);
}

// On the start screen: the best score, in a badge just left of the profile (once there is one).
function drawBestBadge() {
  if (best <= 0) return;
  const lead = "Best: ",
    rest = `${best} pages`;
  ctx.font = "bold 14px Georgia, serif";
  const leadW = ctx.measureText(lead).width,
    w = leadW + ctx.measureText(rest).width + 24,
    x = PROFILE.x - 8 - w,
    y = PROFILE.y;
  ctx.fillStyle = "rgba(20, 14, 10, 0.65)";
  roundRect(x, y, w, PROFILE.h, 8);
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.fillText(lead, x + 12, y + PROFILE.h / 2 + 5);
  ctx.fillStyle = PAPER;
  ctx.fillText(rest, x + 12 + leadW, y + PROFILE.h / 2 + 5);
}

function drawAvatar(cx, cy, r) {
  const ch = CHARACTERS[charIndex];
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#e9dfca";
  ctx.fill();
  ctx.clip();
  // head-and-shoulders: the top of the book with room for a hat or crown
  const zoom = 0.6;
  ctx.translate(cx - 21 * zoom, cy - 10 * zoom);
  ctx.scale(zoom, zoom);
  drawCharacter(ch, 0, 0, 40, 44, { wear: LIVES - lives });
  ctx.restore();
  // the ring
  const hurt = hurtTime > 0 && Math.floor(hurtTime / 100) % 2 === 0;
  ctx.strokeStyle = hurt ? "#ff6b5b" : healTime > 0 ? "#fff3b0" : GOLD;
  ctx.lineWidth = hurt || healTime > 0 ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

// The hearts: full ones in red, lost ones as empty outlines. `panel` draws their own background.
function drawHearts(x, y, panel = true) {
  const gap = 24,
    w = LIVES * gap + 10;
  if (panel) {
    ctx.fillStyle = "rgba(20, 14, 10, 0.65)";
    roundRect(x, y, w, 32, 8);
  }
  for (let i = 0; i < LIVES; i++) {
    const cx = x + 17 + i * gap,
      cy = y + 17;
    heartPath(cx, cy, 8);
    if (i < lives) {
      ctx.fillStyle = RIBBON_RED;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      oval(cx - 3, cy - 3, 1.6, 1.6, "rgba(255, 255, 255, 0.7)"); // shine
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fill();
      ctx.strokeStyle = "#9a8f7c";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  // a heart won back pops in: big and bright, settling into place
  if (heartGain) {
    const t = 1 - heartGain.life / 600;
    const cx = x + 17 + heartGain.index * gap,
      cy = y + 17;
    ctx.globalAlpha = 1 - t;
    heartPath(cx, cy, 8 * (1 + (1 - t) * 0.8));
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // the heart(s) just lost swell and fade away (a smash into furniture takes them all at once)
  if (heartPop) {
    const t = 1 - heartPop.life / 500;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = RIBBON_RED;
    for (let i = 0; i < (heartPop.count || 1); i++) {
      heartPath(x + 17 + (heartPop.index + i) * gap, y + 17, 8 * (1 + t * 0.9));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// Speaker icon with sound waves, or a cross when muted. (x, y) is the left-middle.
function drawSpeaker(x, y, off) {
  const c = off ? "#9a8f7c" : PAPER;
  poly(
    c,
    x,
    y - 4,
    x + 5,
    y - 4,
    x + 11,
    y - 9,
    x + 11,
    y + 9,
    x + 5,
    y + 4,
    x,
    y + 4,
  );
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
    ctx.moveTo(
      x + 12 + 9 * Math.cos(-Math.PI / 3),
      y + 9 * Math.sin(-Math.PI / 3),
    );
    ctx.arc(x + 12, y, 9, -Math.PI / 3, Math.PI / 3);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
}

// The hard stop: squashed against the furniture, tipping over backwards onto its back (legs in
// the air, seeing stars), then popping back up. After a final smash it just stays down.
function drawSmash() {
  const sm = smash,
    t = sm.t,
    c = CHARACTERS[charIndex];
  const pw = 40,
    ph = 44,
    gy = sm.groundY;
  const restX = sm.faceX - pw + 2; // pressed against the furniture
  const HIT = 140,
    FALL = 560,
    LIE = 880;
  let x = restX,
    lift = 0,
    ang = 0,
    sx = 1,
    sy = 1,
    step = 0;
  if (t < HIT) {
    const k = Math.sin((t / HIT) * Math.PI); // squash flat against it, then spring back
    sx = 1 - 0.3 * k;
    sy = 1 + 0.15 * k;
  } else if (t < FALL || sm.final) {
    const k = Math.min(1, (t - HIT) / (FALL - HIT)),
      e = 1 - (1 - k) * (1 - k); // eases out
    ang = (-Math.PI / 2) * e; // over onto its back
    x = restX - 22 * e; // bounced back a little
    lift = Math.sin(k * Math.PI) * 10; // a small hop as it goes over
    if (k >= 1) step = Math.sin(t * 0.03) * 4; // legs wiggling in the air
  } else if (t < LIE) {
    ang = -Math.PI / 2;
    x = restX - 22;
    step = Math.sin(t * 0.03) * 4;
  } else {
    const k = Math.min(1, (t - LIE) / (SMASH_MS - LIE)),
      e = k * k * (3 - 2 * k);
    ang = (-Math.PI / 2) * (1 - e); // back up onto its feet
    x = restX - 22 + (player.x - (restX - 22)) * e; // and back to its spot
  }
  ctx.save();
  ctx.translate(x, gy - lift);
  ctx.rotate(ang);
  ctx.translate(pw, 0);
  ctx.scale(sx, sy); // squash against the furniture (its right edge stays put)
  ctx.translate(-pw, 0);
  drawCharacter(c, 0, -(ph + 6), pw, ph, { step, wear: LIVES - lives });
  ctx.restore();
  // stars circling while it's down
  const down = t > FALL - 120 && (sm.final || t < LIE + 120);
  if (down) {
    const hx = x - 26,
      hy = gy - 26;
    for (let i = 0; i < 3; i++) {
      const a = t * 0.008 + (i * Math.PI * 2) / 3;
      sparkle(hx + Math.cos(a) * 14, hy + Math.sin(a) * 5, 4, i === 1 ? "#fff6c8" : "#ffe27a");
    }
  }
}

// The wipeout (see wipeOut): legs kicking, flipping over backwards through the air, slammed flat
// on its back, then lying there with a halo of stars forming around its head.
function drawWipeout() {
  const t = wipeout.t,
    c = CHARACTERS[charIndex];
  const { cx, cy, ang, sx, sy } = wipeoutPose(t);
  const after = t - WIPEOUT.flipMs; // ms since the slam (negative: still in the air)
  // its shadow on the floor, shrinking as it goes up
  const height = Math.max(0, wipeout.groundY - 25 - cy);
  oval(cx, FLOOR - 1, Math.max(8, 24 - height * 0.12), 4, "rgba(0, 0, 0, 0.22)");
  // the halo: a ring of stars round its head (on the left, lying on its back), popping in one by
  // one. The ring is tipped toward us, so stars on the far side go behind the book.
  const halo = [];
  if (after > 0) {
    const hx = cx - 14, // above its head end (it's 20 tall, lying down)
      hy = cy - 30;
    for (let i = 0; i < WIPEOUT.stars; i++) {
      const p = Math.min(1, (after - WIPEOUT.starsAt - i * WIPEOUT.starEvery) / 160);
      if (p <= 0) break;
      const pop = 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2; // overshoots a little, then settles
      const a = after * 0.004 + (i * Math.PI * 2) / WIPEOUT.stars;
      const depth = Math.sin(a); // -1 far side … 1 near side
      halo.push({
        x: hx + Math.cos(a) * 22,
        y: hy + depth * 7,
        r: (5.5 + 1.5 * depth) * pop,
        color: i % 2 ? "#fff6c8" : "#ffe27a",
        behind: depth < 0,
      });
    }
  }
  for (const s of halo) if (s.behind) sparkle(s.x, s.y, s.r, s.color);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.scale(sx, sy);
  const look = { wear: LIVES - lives };
  if (after < 0) look.flail = [Math.sin(t * 0.045) * 1.1 - 0.5, Math.sin(t * 0.045 + 2.2) * 1.1 - 0.5]; // kicking
  else if (after > 350) look.step = Math.sin(t * 0.03) * 4; // legs wiggling in the air
  drawCharacter(c, -20, -25, 40, 44, look); // (centered: the body, and its legs below)
  ctx.restore();
  for (const s of halo) if (!s.behind) sparkle(s.x, s.y, s.r, s.color);
}

// ---------- Furniture ----------
function drawPlatform(o) {
  const { x, y, w, h } = o;
  oval(x + w / 2, FLOOR - 1, w * 0.48, 4, "rgba(0, 0, 0, 0.25)"); // shadow
  if (o.kind === "cart") drawCart(o);
  else if (o.kind === "bench") drawBench(o);
  else if (o.kind === "chair") drawReadingChair(o);
  else drawReadingTable(o);
}

// A steel book cart (so it stands out from the wooden shelves behind): a flat top shelf to land on,
// books on the lower shelf, wheels.
function drawCart(o) {
  const { x, y, w, h } = o;
  const shelf = FLOOR - 24; // top of the lower shelf
  R(x + 6, y + 9, w - 12, shelf - y - 9, "#353c46"); // a solid steel back, so the shelves behind don't show through
  R(x + 6, y + 9, w - 12, 3, "rgba(0, 0, 0, 0.3)"); // shadow under the top shelf
  R(x + 6, y, 8, FLOOR - 14 - y, "#4f5966"); // uprights
  R(x + w - 14, y, 8, FLOOR - 14 - y, "#4f5966");
  R(x + 8, y, 2, FLOOR - 14 - y, "rgba(255, 255, 255, 0.25)");
  R(x + w - 12, y, 2, FLOOR - 14 - y, "rgba(255, 255, 255, 0.25)");
  // books standing on the lower shelf
  for (let bx = x + 16, i = 0; bx < x + w - 22; i++) {
    const bw = 7 + (hash(i, o.seed) * 6) | 0,
      bh = 20 + hash(i + 3, o.seed) * 14;
    R(bx, shelf - bh, bw, bh, SPINES[(hash(i + 7, o.seed) * SPINES.length) | 0]);
    R(bx + 1, shelf - bh + 3, bw - 2, 1.5, "rgba(255, 255, 255, 0.35)");
    bx += bw + 1;
  }
  R(x + 4, shelf, w - 8, 7, "#7d8794"); // lower shelf
  R(x + 4, shelf + 7, w - 8, 2, "#3f4752");
  for (const wx of [x + 20, x + w - 20]) {
    oval(wx, FLOOR - 7, 7, 7, "#2b2b30"); // wheels
    oval(wx, FLOOR - 7, 2.5, 2.5, "#9aa0aa");
  }
  R(x, y, w, 9, "#9aa4b1"); // the top shelf (where you land)
  R(x, y + 9, w, 2, "#3f4752");
  R(x, y, w, 2, "rgba(255, 255, 255, 0.45)");
  R(x + w / 2 - 18, y + 2, 36, 6, "#f2c230"); // a little "RETURNS" label
  ctx.fillStyle = "#3a2a10";
  ctx.font = "bold 5px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("RETURNS", x + w / 2, y + 7);
}

// A long padded reading bench with button tufting, on wooden legs.
function drawBench(o) {
  const { x, y, w } = o;
  for (const lx of [x + 10, x + w / 2 - 3, x + w - 16]) R(lx, y + 18, 6, FLOOR - y - 18, "#6e4520"); // legs
  R(x + 4, y + 12, w - 8, 8, "#8a5a2b"); // frame
  ctx.fillStyle = "#3d4c8c"; // cushion
  roundRect(x, y, w, 14, 6);
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  roundRect(x + 4, y + 1, w - 8, 3, 2);
  for (let bx = x + 18; bx < x + w - 10; bx += 26) oval(bx, y + 8, 1.6, 1.6, "#2b3768"); // buttons
}

// A big comfy reading chair, seen from the front: a tall back behind, a deep seat to run along,
// and rolled arms at each end.
function drawReadingChair(o) {
  const { x, y, w, h } = o;
  ctx.fillStyle = "#8e2a31"; // the back (behind you)
  roundRect(x + 8, y - 40, w - 16, 48, 14);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  roundRect(x + 16, y - 34, w - 32, 6, 3);
  ctx.fillStyle = "#c95b8b"; // a cushion leaning on the back
  roundRect(x + w - 58, y - 22, 30, 22, 8);
  ctx.fillStyle = "#a8323a"; // the base
  roundRect(x + 2, y + 12, w - 4, FLOOR - 8 - y - 12, 6);
  ctx.fillStyle = "#b8434b"; // the seat cushion (where you run)
  roundRect(x + 10, y, w - 20, 16, 7);
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  roundRect(x + 16, y + 2, w - 32, 3, 2);
  for (const ax of [x - 4, x + w - 20]) {
    ctx.fillStyle = "#9a2d35"; // rolled arms
    roundRect(ax, y - 10, 24, FLOOR - 8 - (y - 10), 10);
    ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    roundRect(ax + 4, y - 8, 16, 4, 2);
  }
  for (const fx of [x + 14, x + w - 22]) R(fx, FLOOR - 8, 8, 8, "#4a2c17"); // little feet
}

// A low reading table with two chairs tucked in behind it, and an open book lying on top.
// It's open underneath (just legs at the ends, set back), so you can duck and slide under it.
function drawReadingTable(o) {
  const { x, y, w, h } = o;
  for (const cx of [x + 22, x + w - 56]) {
    // chair backs peeking up behind the table
    R(cx, y - 34, 5, 34, "#3d2614");
    R(cx + 29, y - 34, 5, 34, "#3d2614");
    R(cx, y - 34, 34, 6, "#5a381c");
    R(cx + 3, y - 22, 28, 4, "#5a381c");
  }
  R(x + 6, y + TABLE_SLAB, w - 12, FLOOR - y - TABLE_SLAB, "rgba(0, 0, 0, 0.16)"); // the shade underneath
  R(x + 8, y + TABLE_SLAB, 7, FLOOR - y - TABLE_SLAB, "#2a1a0d"); // legs, set back at the ends
  R(x + w - 15, y + TABLE_SLAB, 7, FLOOR - y - TABLE_SLAB, "#2a1a0d");
  R(x + 6, y + 8, w - 12, TABLE_SLAB - 8, "#4a2e18"); // the apron under the top
  R(x, y, w, 9, "#6b4423"); // the tabletop (where you run): dark walnut
  R(x, y, w, 2, "rgba(255, 255, 255, 0.3)");
  R(x, y + 9, w, 1.5, "#24160b"); // a crisp edge
  // an open book lying flat on the table
  const bx = x + w / 2 - 6;
  poly(PAPER, bx - 14, y, bx, y - 3, bx, y + 1, bx - 14, y + 2);
  poly("#f8f2e3", bx + 14, y, bx, y - 3, bx, y + 1, bx + 14, y + 2);
  R(bx - 15, y + 1, 30, 1.5, SPINES[3]);
}

// A book tunnel: a tall bookcase hanging from the ceiling, shelves packed with books, with a low
// gap at the floor to duck through. Posts at the ends stand back, out of the way.
function drawTunnel(o) {
  const { x, y, w } = o,
    bottom = o.y + o.h; // the underside you duck under
  R(x, bottom, w, FLOOR - bottom, "rgba(0, 0, 0, 0.22)"); // the shade inside
  R(x + 4, bottom, 7, FLOOR - bottom, "#2a1a0d"); // posts, set back
  R(x + w - 11, bottom, 7, FLOOR - bottom, "#2a1a0d");
  R(x, y, w, bottom - y, "#5a381c"); // the case
  R(x, y, 8, bottom - y, "#4a2e18"); // its sides
  R(x + w - 8, y, 8, bottom - y, "#4a2e18");
  // shelves of books
  const rowH = 36;
  for (let row = 0, ry = y + 6; ry + rowH < bottom - 8; row++, ry += rowH) {
    R(x + 8, ry, w - 16, rowH - 4, "#3a2412"); // the back of the shelf
    for (let bx = x + 10, i = 0; bx < x + w - 14; i++) {
      const bw = 6 + ((hash(i, row + o.seed) * 6) | 0),
        bh = 20 + hash(i + 5, row + o.seed) * 10;
      if (hash(i + 9, row + o.seed) < 0.08) {
        bx += bw + 4; // a gap where a book's been borrowed
        continue;
      }
      R(bx, ry + rowH - 4 - bh, bw, bh, SPINES[(hash(i + 2, row + o.seed) * SPINES.length) | 0]);
      R(bx + 1, ry + rowH - 4 - bh + 3, bw - 2, 1.5, "rgba(255, 255, 255, 0.3)");
      bx += bw + 1;
    }
    R(x + 8, ry + rowH - 4, w - 16, 4, "#6b4423"); // the shelf board
  }
  // the low beam along the bottom: what you duck under
  R(x, bottom - 10, w, 10, "#6b4423");
  R(x, bottom - 10, w, 2, "rgba(255, 255, 255, 0.3)");
  R(x, bottom - 1.5, w, 1.5, "#24160b");
  // a little brass plaque
  const px = x + w / 2;
  R(px - 30, bottom - 9, 60, 8, "#c9a24a");
  ctx.fillStyle = "#3a2a10";
  ctx.font = "bold 6px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("READING NOOK", px, bottom - 3);
}

// A yellow fold-out wet floor sign: a caution triangle with "!", and a wavy water line.
function drawWetSign(o) {
  const { x, y, w, h } = o;
  oval(x + w / 2, FLOOR - 1, w * 0.6, 3, "rgba(0, 0, 0, 0.25)"); // shadow
  poly("#b8901c", x + 6, y + 2, x + w - 2, FLOOR, x + w - 8, FLOOR); // back leg
  poly("#f2c230", x + w / 2, y, x + w - 4, FLOOR, x + 4, FLOOR); // front panel
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w - 4, FLOOR);
  ctx.lineTo(x + 4, FLOOR);
  ctx.closePath();
  ctx.stroke();
  R(x + w / 2 - 4, y - 3, 8, 4, "#1a1a1a"); // handle
  // caution triangle with "!"
  const cx = x + w / 2,
    ty = y + 14;
  poly("#1a1a1a", cx, ty, cx + 8, ty + 13, cx - 8, ty + 13);
  poly("#f2c230", cx, ty + 3, cx + 5, ty + 11, cx - 5, ty + 11);
  R(cx - 0.75, ty + 5, 1.5, 3.5, "#1a1a1a");
  R(cx - 0.75, ty + 9.3, 1.5, 1.2, "#1a1a1a");
  // a wavy water line near the bottom
  ctx.strokeStyle = "#3d7fb8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const wx = cx - 9 + i * 1.5,
      wy = y + h - 9 + Math.sin(i * 1.2) * 1.5;
    if (i === 0) ctx.moveTo(wx, wy);
    else ctx.lineTo(wx, wy);
  }
  ctx.stroke();
}

// A puddle on the floor: a bright blue pool with a white rim and a shimmer (it ripples once splashed).
function drawPuddle(o) {
  const mx = o.x + o.w / 2,
    my = FLOOR + 6; // on the walking surface
  const [water, light] = o.blue;
  // a wet, darker edge around every lobe, then the water over the top (so the lobes merge)
  for (const l of o.lobes) oval(mx + l.dx, my + l.dy + 1, l.rx + 2, l.ry + 1.5, "rgba(20, 40, 70, 0.35)");
  for (const l of o.lobes) oval(mx + l.dx, my + l.dy, l.rx, l.ry, water);
  // the main pool: a lighter middle, a rim catching the light, and a shimmer
  const m = o.lobes[0],
    cx = mx + m.dx,
    cy = my + m.dy,
    rx = m.rx,
    ry = m.ry;
  oval(cx - 3, cy - 1, rx * 0.72, ry * 0.6, light);
  for (const l of o.lobes.slice(1)) oval(mx + l.dx - 1, my + l.dy - 0.5, l.rx * 0.6, l.ry * 0.5, light);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.7); // rim catching the light
  ctx.stroke();
  const shimmer = Math.sin(runTime * 0.006 + o.phase) * rx * 0.18;
  R(cx - rx * 0.45 + shimmer, cy - 3, rx * 0.4, 2, "rgba(255, 255, 255, 0.85)");
  R(cx + rx * 0.2 - shimmer, cy + 1, rx * 0.22, 1.5, "rgba(255, 255, 255, 0.7)");
  if (o.soaked) {
    // ripples after a splash
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.78, ry * 0.65, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// A loose page: cream paper with a few lines of text and a folded corner. `tilt` in radians.
function drawPage(x, y, w, h, tilt = 0) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  const l = -w / 2,
    t = -h / 2,
    f = Math.min(w, h) * 0.3; // folded corner size
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)"; // shadow
  ctx.fillRect(l + 1.5, t + 1.5, w, h);
  poly("#fbf6ea", l, t, l + w - f, t, l + w, t + f, l + w, t + h, l, t + h);
  poly("#d9cdb3", l + w - f, t, l + w - f, t + f, l + w, t + f); // the fold
  ctx.fillStyle = "rgba(60, 45, 30, 0.35)"; // lines of text
  for (let ly = t + h * 0.3; ly < t + h - 3; ly += h * 0.16)
    ctx.fillRect(l + 3, ly, w - 6 - (ly > t + h * 0.7 ? w * 0.3 : 0), 1);
  ctx.strokeStyle = "rgba(90, 70, 45, 0.5)";
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(l, t);
  ctx.lineTo(l + w - f, t);
  ctx.lineTo(l + w, t + f);
  ctx.lineTo(l + w, t + h);
  ctx.lineTo(l, t + h);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
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
  for (let y = b.y + 4; y < b.y + b.h - 3; y += 2)
    ctx.fillRect(b.x + 3, y, b.w - 3, 1);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, 6, b.h);
  ctx.fillStyle = GOLD;
  ctx.fillRect(b.x + 2, b.y + 2, 2, b.h - 4);
}

// The hero: a little teal hardcover with reading glasses.
// A book flapping its covers like wings, with a shadow on the floor below.
// `trails`: the speed marks behind the moving kinds (left off in How to play's small pictures).
function drawFlyingBook(o, shadow = true, trails = true) {
  const cx = o.x + o.w / 2,
    bottom = o.y + o.h;
  if (shadow) {
    // the shadow grows and darkens as the book gets closer to the floor
    const near = Math.min(1, Math.max(0, 1 - (FLOOR - bottom) / 90));
    oval(
      cx,
      FLOOR - 1,
      10 + near * 10,
      2 + near * 2,
      `rgba(0, 0, 0, ${0.12 + near * 0.2})`,
    );
  }
  const ch = o.charge ? chargeState(o) : null,
    winding = ch && ch.winding,
    charging = ch && ch.charging;
  ctx.save();
  if (winding && !o.still) ctx.translate(Math.sin(runTime * 0.09) * 2.2, Math.sin(runTime * 0.13) * 1); // shaking, about to go
  if (trails && o.swoop) {
    // little speed marks above and below, so it reads as a book on the move
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx + 26, bottom - 20);
    ctx.lineTo(cx + 36, bottom - 20);
    ctx.moveTo(cx + 28, bottom - 6);
    ctx.lineTo(cx + 40, bottom - 6);
    ctx.stroke();
    ctx.lineCap = "butt";
  } else if (trails && (o.dart || o.flock || charging)) {
    // longer streaks trailing behind: it's really flying at you
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    const reach = charging ? 34 : 22;
    for (const [dy, k] of [[-22, 0], [-12, 1], [-3, 2]]) {
      const len = reach + Math.sin(runTime * 0.03 + k * 2 + o.phase) * 6 - k * 3;
      ctx.moveTo(cx + 24, bottom + dy);
      ctx.lineTo(cx + 24 + len, bottom + dy);
    }
    ctx.stroke();
    ctx.lineCap = "butt";
  }
  const flapRate = winding ? 0.08 : charging ? 0.06 : o.flock ? 0.05 : o.dart ? 0.045 : o.swoop ? 0.04 : 0.025;
  const flap = o.still ? 3 : Math.sin(runTime * flapRate + o.phase) * 7; // (`still`: How to play's pictures hold one pose)
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
  // angry little eyes on the spine so it reads as a creature (red when a charger is about to go)
  const eye = winding || charging ? "#d62b1f" : "#1a1a1a";
  R(sx - 5, sy - 9, 3, 3, eye);
  R(sx + 2, sy - 9, 3, 3, eye);
  if (winding) {
    // a "!" over its head: here it comes
    const by = tipY - 18;
    oval(cx, by, 8, 8, "#fff");
    ctx.strokeStyle = CHARGE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, by, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = CHARGE_COLOR;
    ctx.font = "bold 13px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("!", cx, by + 5);
  }
  ctx.restore();
}

// The run cycle, shared by everything that shows a character running. Two hops per stride:
// each hop hangs in the air for a moment with BOTH feet off the floor (that's what makes it a
// run, not a walk), then drops quickly onto the next foot.
// step: how far the legs swing · bob: how high the body is · lift: how far each foot is off the
// floor · land: 0…1 as a foot plants (squash) · air: 0…1 at the top of a hop (stretch) · flutter: page edges.
const RUN_CADENCE = 0.012; // how fast the legs cycle: a stride takes 2π / RUN_CADENCE ms (about 0.4 s)
const RUN_BOUNCE = 4; // px
const RUN_LEAN = 0.12; // radians (about 7°)
function runPose(t) {
  const th = t * RUN_CADENCE,
    s = Math.sin(th),
    c = Math.cos(th);
  const air = Math.pow(Math.abs(c), 0.6); // rounded at the top (hang time), sharp at the bottom (landing)
  const bob = air * RUN_BOUNCE;
  const tuck = bob * 0.75; // mid-hop, even the back foot leaves the floor
  // the legs swing either side of the middle (for a 40px-wide book): crossed mid-hop,
  // spread wide (one forward, one back) as a foot lands
  const mid = 15.5;
  return {
    step: s * 7,
    legs: [mid + s * 9, mid - s * 9],
    bob,
    lift: [Math.max(0, c) * 5 + tuck, Math.max(0, -c) * 5 + tuck],
    land: Math.max(0, Math.abs(s) - 0.75) / 0.25,
    air,
    flutter: Math.sin(th * 2) * 1.2,
  };
}
// Lean into the run, squash on landing, stretch a touch in the air. (fx, fy) is where the feet are.
function runTransform(pose, fx, fy) {
  ctx.translate(fx, fy);
  ctx.rotate(RUN_LEAN);
  ctx.scale(
    1 + 0.06 * pose.land - 0.02 * pose.air,
    1 - 0.1 * pose.land + 0.04 * pose.air,
  );
  ctx.translate(-fx, -fy);
}
// ---------- Power-up drawing ----------
// A power-up's picture on a navy disc, centered on (cx, cy), r the disc's radius.
function drawPowerIcon(type, cx, cy, r) {
  const s = r / 13; // drawn at r = 13, scaled to fit
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = POWERS[type].color;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (type === "magnet") {
    // a horseshoe magnet with silver tips
    ctx.strokeStyle = "#e0453f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-5.5, -5);
    ctx.lineTo(-5.5, 0);
    ctx.arc(0, 0, 5.5, Math.PI, 0, true);
    ctx.lineTo(5.5, -5);
    ctx.stroke();
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(-7.5, -8, 4, 3);
    ctx.fillRect(3.5, -8, 4, 3);
  } else if (type === "shield") {
    // a little blue hardcover with gold corners
    ctx.fillStyle = "#4b79d9";
    roundRect(-6, -8, 12, 16, 2);
    ctx.fillStyle = "#2f4f99";
    ctx.fillRect(-6, -8, 3, 16);
    ctx.fillStyle = GOLD;
    poly(GOLD, 6, -8, 6, -4, 2, -8);
    poly(GOLD, 6, 8, 6, 4, 2, 8);
    ctx.beginPath();
    ctx.arc(1.5, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // a lightning bolt
    poly("#f2c14e", 2, -9, -5, 1, -0.5, 1, -2, 9, 5, -1, 0.5, -1);
  }
  ctx.restore();
}
// A power-up waiting to be grabbed: its icon, glowing and gently pulsing.
function drawPowerUp(b, bob) {
  const cx = b.x + b.w / 2,
    cy = b.y + b.h / 2 + bob,
    pulse = 0.5 + 0.5 * Math.sin(runTime * 0.008 + b.phase);
  const glow = ctx.createRadialGradient(cx, cy, 6, cx, cy, 26 + pulse * 6);
  glow.addColorStop(0, "rgba(255, 240, 180, 0.65)");
  glow.addColorStop(1, "rgba(255, 240, 180, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 34, cy - 34, 68, 68);
  drawPowerIcon(b.type, cx, cy, 13 + pulse);
}
// Around the book while a power-up is in use. It flickers in the last 1.5 seconds.
function drawPowerAura() {
  if (!power) return;
  if (power.time < 1500 && Math.floor(power.time / 120) % 2) return;
  const b = playerBox(),
    cx = b.x + b.w / 2,
    cy = b.y + b.h / 2;
  ctx.save();
  if (power.type === "magnet") {
    // rings pulsing outward, like a magnet's pull
    for (let k = 0; k < 2; k++) {
      const t = ((runTime / 900 + k / 2) % 1);
      ctx.strokeStyle = `rgba(224, 69, 63, ${0.8 * (1 - t)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 26 + t * 40, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (power.type === "shield") {
    // a see-through blue cover around the book
    const pad = 9;
    ctx.fillStyle = "rgba(75, 121, 217, 0.18)";
    roundRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, 12);
    ctx.strokeStyle = `rgba(127, 176, 255, ${0.6 + 0.3 * Math.sin(runTime * 0.01)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = GOLD; // gold corners, like a hardcover's
    const x0 = b.x - pad,
      y0 = b.y - pad,
      x1 = b.x + b.w + pad,
      y1 = b.y + b.h + pad;
    poly(GOLD, x1, y0, x1, y0 + 8, x1 - 8, y0);
    poly(GOLD, x0, y1, x0, y1 - 8, x0 + 8, y1);
  } else {
    // golden streaks trailing behind
    ctx.strokeStyle = "rgba(242, 193, 78, 0.8)";
    ctx.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const yy = b.y + 6 + k * (b.h - 12) / 3,
        len = 30 + Math.sin(runTime * 0.03 + k * 1.7) * 12 + k * 4;
      ctx.lineWidth = 3 - k * 0.4;
      ctx.beginPath();
      ctx.moveTo(b.x - 4, yy);
      ctx.lineTo(b.x - 4 - len, yy);
      ctx.stroke();
    }
  }
  ctx.restore();
}
// The power-up in use, in the top bar: its icon, name, and how long it has left.
function drawPowerHUD() {
  if (!power) return;
  const def = POWERS[power.type],
    w = 150,
    h = 26,
    x = tall() ? W / 2 - w / 2 : MUTE_BTN.x + MUTE_BTN.w + 8,
    y = tall() ? SCORE.y + 40 : 50;
  ctx.fillStyle = "rgba(20, 14, 10, 0.65)";
  roundRect(x, y, w, h, 8);
  drawPowerIcon(power.type, x + 14, y + h / 2, 9);
  ctx.textAlign = "left";
  ctx.fillStyle = PAPER;
  ctx.font = "bold 12px Georgia, serif";
  ctx.fillText(def.name, x + 28, y + 12);
  // the time left, as a bar that runs down
  const bw = w - 38,
    left = Math.max(0, power.time / def.ms);
  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  ctx.fillRect(x + 28, y + 16, bw, 4);
  ctx.fillStyle = def.color;
  ctx.fillRect(x + 28, y + 16, bw * left, 4);
}

// A couple of faint speed lines trailing behind a running book.
function speedLines(px, py, ph, t) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [k, yy] of [
    [0, 0.3],
    [1, 0.62],
  ]) {
    const len = 10 + Math.sin(t * 0.02 + k * 2) * 4;
    ctx.moveTo(px - 6, py + ph * yy);
    ctx.lineTo(px - 6 - len, py + ph * yy);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawPlayer() {
  const duck = player.ducking;
  const { x, y, w, h } = duck
    ? { x: player.x, y: player.y + player.h - DUCK_H, w: DUCK_W, h: DUCK_H }
    : player;
  // squash & stretch based on vertical velocity
  const stretch = player.onGround
    ? 1
    : 1 + Math.min(Math.abs(player.vy) * 0.15, 0.12);
  const pw = w / stretch,
    ph = h * stretch;
  const px = x + (w - pw) / 2,
    py = duck ? player.y + player.h - ph - 2 : y + h - ph - 6; // standing: lift the body so the legs reach the ground
  const wear = LIVES - lives; // 0 = like new, 1 = dog-eared, 2+ = patched up
  // legs: a quick shuffle while ducking, a run cycle (with a bounce) on the ground
  const moving = state === "running" || onStartScreen(); // runs on the spot behind the start screen
  const running = !duck && player.onGround && moving;
  const pose = running ? runPose(runTime) : null;
  const step = duck ? Math.sin(runTime * 0.04) * 3 : pose ? pose.step : 0;
  const by = pose ? py - pose.bob : py; // the body bounces up mid-stride
  const look = pose
    ? {
        duck,
        step,
        wear,
        bob: pose.bob,
        lift: pose.lift,
        flutter: pose.flutter,
        legs: pose.legs,
      }
    : { duck, step, wear };
  look.accessory = accLift; // hats float up and glasses slide onto the head while jumping

  // just bumped: blink (fade in and out) until it's safe again
  if (hurtTime > 0) ctx.globalAlpha = Math.floor(hurtTime / 100) % 2 ? 0.3 : 1;
  const fx = px + pw / 2,
    fy = py + ph + 6; // the feet: running leans and squashes around this point
  ctx.save();
  const slipping = slipTime > 0;
  if (pose && !slipping) {
    if (state === "running") speedLines(px, by, ph, runTime);
    runTransform(pose, fx, fy); // lean, squash on landing, stretch in the air
  }
  if (slipping) {
    // slipping after a puddle: tipped back with its feet kicking out in front, wobbling as it
    // fights to keep its balance (calming down as it dries off), sliding along with drips falling
    const k = slipTime / SLIP_MS, // 1 → 0 over the slip
      t = runTime;
    const tilt = -(0.2 + 0.25 * k) + Math.sin(t * 0.022) * (0.05 + 0.08 * k);
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(tilt);
    ctx.translate(-fx, -fy);
    const kick = 0.45 + 0.55 * k; // how wildly the legs go
    const flailLook = duck
      ? look
      : {
          ...look,
          legs: null,
          flail: [
            -0.9 + Math.sin(t * 0.047) * 1.0 * kick,
            -0.7 + Math.sin(t * 0.061 + 2.3) * 1.0 * kick,
          ],
        };
    drawCharacter(CHARACTERS[charIndex], px, py - 3, pw, ph, flailLook);
    ctx.restore();
    ctx.restore(); // (the outer save)
    // spray streaking out behind the sliding feet
    const floorY = player.y + player.h + 4;
    ctx.strokeStyle = `rgba(127, 184, 224, ${0.5 + 0.4 * k})`;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const len = 10 + 8 * k + Math.sin(t * 0.03 + i * 2) * 4;
      ctx.moveTo(px + 2 - i * 5, floorY - i * 3);
      ctx.lineTo(px + 2 - i * 5 - len, floorY - i * 3 - 1);
    }
    ctx.stroke();
    ctx.lineCap = "butt";
    // a few droplets kicked up by the feet
    for (let i = 0; i < 3; i++) {
      const p = ((t / 380 + i / 3) % 1),
        dx = px + pw * 0.6 + p * 14 - i * 6,
        dy = floorY - 4 - Math.sin(p * Math.PI) * 12;
      oval(dx, dy, 1.6, 1.6, `rgba(127, 184, 224, ${0.9 * (1 - p)})`);
    }
    const drip = (runTime % 600) / 600; // drips keep falling for the whole slip
    oval(
      px + 6,
      py + ph * 0.5 + drip * 14,
      1.8,
      2.6,
      `rgba(127, 184, 224, ${0.9 * (1 - drip)})`,
    );
    oval(
      px + pw - 6,
      py + ph * 0.3 + ((drip + 0.5) % 1) * 14,
      1.6,
      2.3,
      `rgba(127, 184, 224, ${0.9 * (1 - ((drip + 0.5) % 1))})`,
    );
    // a little water bar on the floor under the book shows how long the slip has left
    // (under the feet, so the "Slippery!" / "Ouch!" popups above the book never cover it)
    const bw = 34,
      bx = px + pw / 2 - 2 - bw / 2,
      barY = player.y + player.h + 10;
    ctx.fillStyle = "rgba(20, 14, 10, 0.6)";
    roundRect(bx - 2, barY - 2, bw + 4, 8, 4);
    ctx.fillStyle = "#7fb8e0";
    roundRect(bx, barY, Math.max(3, bw * k), 4, 2);
  } else {
    drawCharacter(CHARACTERS[charIndex], px, by, pw, ph, look);
    ctx.restore(); // (the run lean / squash)
  }
  ctx.globalAlpha = 1;

  // just taped up: a strip of tape smooths across the cover, then fades, with a few sparkles
  if (healTime > 0) {
    const t = 1 - healTime / 700;
    const grow = Math.min(1, t * 2.5); // the strip pulls across quickly…
    ctx.globalAlpha = t < 0.6 ? 1 : (1 - t) / 0.4; // …then fades
    ctx.save();
    ctx.translate(px + 2, py + ph * 0.45);
    ctx.rotate(-0.12);
    ctx.fillStyle = "rgba(243, 220, 154, 0.85)";
    ctx.fillRect(0, -4, (pw - 4) * grow, 8);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(0, -4, (pw - 4) * grow, 2);
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + i * 2.1;
      sparkle(
        px + pw / 2 + Math.cos(a) * (pw * 0.7),
        py + ph / 2 + Math.sin(a) * (ph * 0.6),
        3.5 * (1 - t) + 1,
        "#fff6c8",
      );
    }
    ctx.globalAlpha = 1;
  }
}

// A roll of book tape centered on (cx, cy), with a little heart so it reads as health.
// `glow` adds a soft pulsing halo (on the course, so it's easy to spot).
function drawTape(cx, cy, glow = false) {
  if (glow) {
    const pulse = 1 + Math.sin(runTime * 0.008) * 0.15;
    ctx.fillStyle = "rgba(255, 236, 170, 0.3)";
    ctx.beginPath();
    ctx.arc(cx, cy, 17 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  // a strip of tape trailing off the roll
  ctx.fillStyle = "rgba(243, 220, 154, 0.9)";
  ctx.beginPath();
  ctx.moveTo(cx + 3, cy + 10);
  ctx.lineTo(cx + 15, cy + 13);
  ctx.lineTo(cx + 14, cy + 17);
  ctx.lineTo(cx + 1, cy + 11);
  ctx.closePath();
  ctx.fill();
  // the roll: tape, a cardboard core and the hole
  oval(cx, cy, 11, 11, "#e2c271");
  oval(cx, cy, 9.5, 9.5, "#f3dc9a");
  oval(cx, cy, 5, 5, "#a0773f");
  oval(cx, cy, 3.5, 3.5, "#3a2a1a");
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)"; // shine
  ctx.beginPath();
  ctx.arc(cx, cy, 8, Math.PI * 1.1, Math.PI * 1.45);
  ctx.arc(cx, cy, 6.5, Math.PI * 1.45, Math.PI * 1.1, true);
  ctx.fill();
  // a small heart badge
  heartPath(cx + 7, cy - 7, 4.5);
  ctx.fillStyle = RIBBON_RED;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// One of the book characters, body at (px, py) sized pw × ph.
// duck: crouched (legs tucked) · step: leg swing · wear: 0 like new, 1 dog-eared, 2+ patched up
function drawCharacter(
  c,
  px,
  py,
  pw,
  ph,
  {
    duck = false,
    step = 0,
    wear = 0,
    bob = 0,
    lift = [0, 0],
    flutter = 0,
    legs = null, // running: where each leg is, across from the left edge (they scissor past each other)
    accessory = 0, // hats and glasses lifted by a jump (see updateAccessories)
    flail = null, // slipping: each leg's angle from straight down (negative kicks it forward)
  } = {},
) {
  // legs. While running, the body bounces up by `bob`, so a planted leg stretches to keep its
  // foot on the floor, and a leg is lifted off it by `lift`.
  ctx.fillStyle = "#1e2b2c";
  if (duck) {
    ctx.fillRect(px + 8 + step, py + ph, 6, 2);
    ctx.fillRect(px + pw - 16 - step, py + ph, 6, 2);
  } else if (flail) {
    // kicking wildly from the hips
    flail.forEach((a, i) => {
      ctx.save();
      ctx.translate(px + (i ? pw - 11.5 : 10.5), py + ph - 2);
      ctx.rotate(a);
      ctx.fillRect(-2.5, 0, 5, 11);
      ctx.fillRect(-2.5, 9, 7, 3); // a foot, so the kicking reads
      ctx.restore();
    });
  } else {
    const [l1, l2] = legs || [8 + step, pw - 14 - step];
    ctx.fillRect(px + l1, py + ph - 2, 5, 8 + bob - lift[0]);
    ctx.fillRect(px + l2, py + ph - 2, 5, 8 + bob - lift[1]);
  }

  // well worn: a loose page works its way out of the top
  if (wear >= 2) {
    ctx.save();
    ctx.translate(px + pw * 0.55, py + 2);
    ctx.rotate(0.3 + Math.sin(runTime * 0.02) * 0.12);
    ctx.fillStyle = PAPER;
    ctx.fillRect(-5, -8, 10, 10);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(-3, -5, 6, 1);
    ctx.fillRect(-3, -3, 5, 1);
    ctx.restore();
  }

  // page edges peeking out on the right (they flutter a little with each step)
  ctx.fillStyle = PAPER;
  roundRect(px + 4 + flutter, py + 3, pw - 2, ph - 6, 3);
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  for (let ly = py + 6; ly < py + ph - 6; ly += 3)
    ctx.fillRect(
      px + pw - 2 + flutter * (((ly - py) / 3) % 2 ? 1 : 0.4),
      ly,
      2,
      1,
    );

  // cover, spine and the cover's decoration
  ctx.fillStyle = c.cover;
  roundRect(px, py, pw - 4, ph, 4);
  ctx.fillStyle = c.spine;
  ctx.fillRect(px, py, 7, ph);
  c.deco(px, py, pw, ph);

  if (wear >= 1) {
    // a folded-over (dog-eared) top corner, showing the pages underneath
    const cx = px + pw - 4,
      f = Math.min(9, ph * 0.25);
    poly(PAPER, cx - f, py, cx, py, cx, py + f);
    poly(c.fold, cx - f, py, cx - f, py + f, cx, py + f);
    // scuffs on the cover
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(px + 10, py + ph * 0.5, 7, 1.5);
    ctx.fillRect(px + 13, py + ph * 0.5 + 4, 4, 1.5);
  }
  if (wear >= 2) {
    // a sticking plaster across the cover
    ctx.save();
    ctx.translate(px + 12, py + ph - 9); // low, by the spine, clear of the face
    ctx.rotate(-0.4);
    ctx.fillStyle = "#e9c39b";
    roundRect(-8, -3.5, 16, 7, 3);
    ctx.fillStyle = "#d3a67c";
    ctx.fillRect(-2.5, -3.5, 5, 7);
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(-6, -1, 1, 1);
    ctx.fillRect(-4.5, 1, 1, 1);
    ctx.fillRect(4, -1, 1, 1);
    ctx.fillRect(5.5, 1, 1, 1);
    ctx.restore();
  }

  // face: (ex, ey) is the left eye, the right eye is 10px over. Glasses can be lifted off the
  // eyes by `accessory` (0 on the face … 1 pushed up on top of the head), never below the eyes.
  c.face(px + pw - 22, py + 15, wear, Math.max(0, accessory));
  // hats sit on top, a little smaller while ducking so they stay under the flying books.
  // When jumping they float up off the head and tip back a little (`accessory`, as above).
  if (c.hat) {
    const s = duck ? 0.7 : 1,
      a = Math.max(-0.2, accessory), // a touch below 0 = the hat plops down as it lands
      hx = px + pw / 2 - 2;
    ctx.save();
    ctx.translate(hx, py - HAT_LIFT * a);
    ctx.rotate(-0.18 * Math.max(0, a));
    ctx.translate(-hx, -py);
    c.hat(px, py, pw, s);
    ctx.restore();
  }
}

// Hats and glasses have a little weight: they float up when the book jumps and settle back
// on landing. `accLift` goes 0 → about 1 in the air and back to 0, on a soft spring.
const HAT_LIFT = 7; // px a hat or crown rises off the head
const GLASSES_LIFT = 19; // px the glasses slide up, from the eyes to the top of the head
const ACC_SPRING = 0.0002, // how strongly it's pulled toward where it should be (softer = floatier)…
  ACC_DAMP = 0.0126; // …and how quickly the wobble dies down (lower = a bit more bounce as it lands)
function updateAccessories(dt) {
  const target = player.onGround ? 0 : 1;
  accVel += (ACC_SPRING * (target - accLift) - ACC_DAMP * accVel) * dt;
  accLift += accVel * dt;
}

// ---------- Characters ----------
// Every character is a book the same size, so they all play exactly the same.
function eyeDots(ex, ey) {
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(ex - 1, ey - 1, 3, 4);
  ctx.fillRect(ex + 9, ey - 1, 3, 4);
}
function crackedLens(cx, cy) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 3.5, cy - 3.5);
  ctx.lineTo(cx - 0.5, cy - 0.5);
  ctx.lineTo(cx - 2.5, cy + 1.5);
  ctx.lineTo(cx + 1.5, cy + 4);
  ctx.stroke();
}
function titleBand(color) {
  return (px, py, pw, ph) => {
    ctx.fillStyle = color;
    ctx.fillRect(px + 10, py + ph - 12, pw - 18, 3);
  };
}
// A little four-pointed sparkle.
function sparkle(x, y, r, color) {
  poly(
    color,
    x,
    y - r,
    x + r * 0.3,
    y - r * 0.3,
    x + r,
    y,
    x + r * 0.3,
    y + r * 0.3,
    x,
    y + r,
    x - r * 0.3,
    y + r * 0.3,
    x - r,
    y,
    x - r * 0.3,
    y - r * 0.3,
  );
}

const CHARACTERS = [
  {
    id: "dash",
    name: "Dewey", // as in the Dewey Decimal System
    blurb: ["Always reading,", "always running"],
    cover: "#2f5d62",
    spine: "#234548",
    fold: "#1d3d40",
    deco: titleBand(GOLD),
    face(ex, ey, wear, lift = 0) {
      // round reading glasses (pushed up onto the head while jumping)
      eyeDots(ex, ey);
      const gy = ey - GLASSES_LIFT * lift;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ex, gy, 5, 0, Math.PI * 2);
      ctx.moveTo(ex + 15, gy);
      ctx.arc(ex + 10, gy, 5, 0, Math.PI * 2);
      ctx.stroke();
      if (wear >= 2) crackedLens(ex, gy);
    },
  },
  {
    id: "zap",
    name: "Zap",
    blurb: ["A comic book", "with super speed"],
    cover: "#e8b52a",
    spine: "#c92a2f",
    fold: "#b88a17",
    deco(px, py, pw, ph) {
      // a lightning bolt
      const bx = px + 13,
        by = py + ph * 0.42;
      poly(
        "#c92a2f",
        bx + 6,
        by,
        bx + 1,
        by + 9,
        bx + 5,
        by + 9,
        bx + 2,
        by + 17,
        bx + 11,
        by + 6,
        bx + 7,
        by + 6,
        bx + 10,
        by,
      );
    },
    face(ex, ey, wear) {
      // big cartoon eyes
      for (const x of [ex, ex + 10]) {
        oval(x, ey, 4.5, 5, "#fff");
        oval(x + 1.2, ey + 0.5, 2, 2.4, "#1a1a1a");
      }
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
      ctx.moveTo(ex + 14.5, ey);
      ctx.arc(ex + 10, ey, 4.5, 0, Math.PI * 2);
      ctx.stroke();
      if (wear >= 2) R(ex - 5, ey - 7, 9, 2, "#1a1a1a"); // a worried brow
    },
  },
  {
    id: "sleuth",
    name: "Sleuth",
    blurb: ["A mystery novel", "on the case"],
    cover: "#6b3e75",
    spine: "#4d2b55",
    fold: "#3e2245",
    deco(px, py, pw, ph) {
      titleBand(GOLD)(px, py, pw, ph);
      ctx.fillStyle = GOLD;
      ctx.font = "bold 11px Georgia, serif";
      ctx.textAlign = "left";
      ctx.fillText("?", px + 11, py + ph - 16);
    },
    face(ex, ey, wear, lift = 0) {
      // one eye behind a monocle on a chain. When jumping (`lift` 0 → 1) the monocle pops off
      // the eye and swings on its chain below where the chain is pinned, then swings back on landing.
      eyeDots(ex, ey);
      const ax = ex + 15,
        ay = ey + 12; // where the chain is pinned to the cover
      const a = Math.min(1, lift);
      const rest = Math.atan2(-12, -5) + Math.PI * 2; // the monocle's spot on the eye, seen from the pin (up and to the left)
      const swing = Math.PI / 2 + Math.sin(runTime * 0.0105) * 0.6; // hanging down, swinging side to side
      const angle = rest + (swing - rest) * a; // swings round the left side, never through the page edges
      const len = 13 + 3 * a; // the chain goes slack as it falls away
      const mx = ax + Math.cos(angle) * len,
        my = ay + Math.sin(angle) * len;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.stroke();
      // the chain: from the pin to the monocle's rim, sagging a little when slack
      const rimX = mx - Math.cos(angle) * 5,
        rimY = my - Math.sin(angle) * 5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + rimX) / 2 + 2 * a, (ay + rimY) / 2 + 3 * a, rimX, rimY);
      ctx.stroke();
      if (wear >= 2) crackedLens(mx, my);
    },
    hat(px, py, pw, s) {
      // a detective's hat
      const cx = px + pw / 2 - 2;
      ctx.fillStyle = "#2b2b30";
      roundRect(cx - 14 * s, py - 4 * s, 28 * s, 4 * s, 2); // brim
      roundRect(cx - 9 * s, py - 12 * s, 18 * s, 9 * s, 3); // crown
      R(cx - 9 * s, py - 6 * s, 18 * s, 2.5 * s, "#8c2f39"); // band
    },
  },
  {
    id: "tiara",
    name: "Tiara",
    blurb: ["A fairy tale", "fit for royalty"],
    cover: "#c95b8b",
    spine: "#9c3f69",
    fold: "#86345a",
    deco(px, py, pw, ph) {
      titleBand(GOLD)(px, py, pw, ph);
      sparkle(px + 14, py + ph * 0.5, 4, "#fff");
      sparkle(px + 20, py + ph * 0.5 + 7, 2.5, "#ffd9ec");
    },
    face(ex, ey, wear) {
      eyeDots(ex, ey);
      // shiny eyes, rosy cheeks and a little smile
      R(ex, ey - 1, 1, 1, "#fff");
      R(ex + 10, ey - 1, 1, 1, "#fff");
      oval(ex - 3, ey + 5, 2.5, 1.5, "rgba(255, 170, 200, 0.85)");
      oval(ex + 13, ey + 5, 2.5, 1.5, "rgba(255, 170, 200, 0.85)");
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (wear >= 2)
        ctx.arc(ex + 5, ey + 9, 2.5, Math.PI * 1.15, Math.PI * 1.85); // worn out: a little frown
      else ctx.arc(ex + 5, ey + 5, 2.5, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    },
    hat(px, py, pw, s) {
      // a gold crown with jewels
      const cx = px + pw / 2 - 2,
        w = 20 * s,
        h = 9 * s,
        l = cx - w / 2,
        b = py + 1;
      poly(
        GOLD,
        l,
        b,
        l,
        b - h * 0.6,
        l + w * 0.2,
        b - h * 0.35,
        l + w * 0.35,
        b - h,
        l + w * 0.5,
        b - h * 0.4,
        l + w * 0.65,
        b - h,
        l + w * 0.8,
        b - h * 0.35,
        l + w,
        b - h * 0.6,
        l + w,
        b,
      );
      oval(cx - w * 0.15, b - h * 0.25, 1.5 * s, 1.5 * s, "#c92a2f");
      oval(cx + w * 0.15, b - h * 0.25, 1.5 * s, 1.5 * s, "#3d4c8c");
    },
  },
];
let charIndex = Math.max(
  0,
  CHARACTERS.findIndex((c) => c.id === safeGet("runner-character")),
); // Dewey unless they picked another

function pickCharacter(i) {
  charIndex = (i + CHARACTERS.length) % CHARACTERS.length;
  safeSet("runner-character", CHARACTERS[charIndex].id);
  tone(660, 880, 0.07, "triangle", 0.08);
}

// The character cards on the Characters screen (shared by drawing and tapping).
// Wide: one row of four. Tall: a 2 × 2 grid.
const CARD = { w: 136, h: 160, gap: 12, y: 64 };
const CARD_TALL = { w: 180, h: 190, gap: 14, y: 82 };
function cardRect(i) {
  if (tall()) {
    const c = CARD_TALL,
      col = i % 2,
      row = Math.floor(i / 2);
    return {
      x: W / 2 - (2 * c.w + c.gap) / 2 + col * (c.w + c.gap),
      y: c.y + row * (c.h + c.gap),
      w: c.w,
      h: c.h,
    };
  }
  const total = CHARACTERS.length * CARD.w + (CHARACTERS.length - 1) * CARD.gap;
  return {
    x: W / 2 - total / 2 + i * (CARD.w + CARD.gap),
    y: CARD.y,
    w: CARD.w,
    h: CARD.h,
  };
}

function drawCharacters() {
  dimBehindCard();
  const pw = tall() ? 420 : 620,
    px = W / 2 - pw / 2,
    py = tall() ? 26 : 12,
    ph = tall() ? 562 : 296;
  drawCard(px, py, pw, ph);
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "bold 22px Georgia, serif";
  ctx.fillText("Choose your book", W / 2, py + 30);
  cardRules(px, py + 38, pw);

  CHARACTERS.forEach((c, i) => {
    const on = i === charIndex;
    const r = cardRect(i),
      lift = on ? -4 : 0;
    ctx.fillStyle = on ? "rgba(215, 163, 94, 0.3)" : "rgba(52, 64, 79, 0.06)";
    roundRect(r.x, r.y + lift, r.w, r.h, 10);
    ctx.strokeStyle = on ? CARD_RED : "rgba(122, 106, 85, 0.35)";
    ctx.lineWidth = on ? 2.5 : 1;
    ctx.stroke();
    // the character, jogging on a little shelf (the chosen one runs, the others wait)
    const floor = r.y + lift + (tall() ? 112 : 100),
      zoom = 1.35; // drawn a bit bigger than in the game
    R(r.x + 20, floor, r.w - 40, 4, "#8a5a2b");
    ctx.save();
    ctx.translate(r.x + r.w / 2 - 20 * zoom, floor - 50 * zoom);
    ctx.scale(zoom, zoom);
    if (on) {
      // the chosen one runs (with the same bounce, lean and squash as in the game)
      const pose = runPose(runTime);
      runTransform(pose, 20, 50);
      drawCharacter(c, 0, -pose.bob, 40, 44, {
        step: pose.step,
        bob: pose.bob,
        lift: pose.lift,
        flutter: pose.flutter,
        legs: pose.legs,
      });
    } else {
      drawCharacter(c, 0, 0, 40, 44);
    }
    ctx.restore();
    ctx.textAlign = "center";
    ctx.fillStyle = on ? CARD_RED : INK;
    ctx.font = "bold 17px Georgia, serif";
    const ty = r.y + lift + (tall() ? 140 : 124); // name, then the two blurb lines
    ctx.fillText(c.name, r.x + r.w / 2, ty);
    ctx.fillStyle = INK_SOFT;
    ctx.font = "12px Georgia, serif";
    ctx.fillText(c.blurb[0], r.x + r.w / 2, ty + 17);
    ctx.fillText(c.blurb[1], r.x + r.w / 2, ty + 31);
  });
  drawButtons();
  hint(
    tall()
      ? "Tap a book to pick it"
      : "← → or tap to pick · Enter, Space or Esc when you're done",
    py + ph - 10,
  );
}

// The title, "Dewey Dash": "DEWEY" on the spines of five library books standing on a little shelf
// (one leaning on its neighbour), then "Dash" in gold, speeding off with a motion trail. Dewey (the
// character) lives behind the D book, and every so often peeks out to say hello.
// (cx, shelfY): the middle of the title, and the top of the shelf the books stand on.
const TITLE_WORD = "DEWEY";
const TITLE_BOOKS = [
  { color: "#7a2e2a", h: 56, tilt: 0 },
  { color: "#2f4a6b", h: 50, tilt: 0 },
  { color: "#3d6b4a", h: 58, tilt: 0 },
  { color: "#b0812f", h: 52, tilt: 0 },
  { color: "#5b3a6b", h: 55, tilt: -0.1 }, // the Y, leaning on the E
];
// When the game first loads: the books fade in and hop in a wave, left to right, "Dash" zooms in
// from off the left of the screen (overshooting a touch and settling), then Dewey peeks out.
// After that, every 15–30 seconds on the start screen, the books wave or Dewey peeks (taking turns).
const TITLE_FADE_MS = 250, // the books fading in…
  TITLE_WAVE_START = TITLE_FADE_MS, // …then hopping
  TITLE_HOP_GAP = 90, // each book hops this long after the one before
  TITLE_HOP_MS = 320, // one hop
  DASH_START = TITLE_WAVE_START + (TITLE_BOOKS.length - 1) * TITLE_HOP_GAP + TITLE_HOP_MS - 80, // as the last book lands
  DASH_FLY_MS = 380;
let titleTime = 0; // ms the title has been animating (see frame)
const TITLE_DONE = DASH_START + DASH_FLY_MS; // "Dash" has landed
const PEEK_OUT_MS = 340; // Dewey sliding out from behind the D book (then it stays out)
const PEEK_MS = 1400; // one wiggle hello
const randomTitleGap = () => 15000 + Math.random() * 15000;
let waveTime = -TITLE_WAVE_START, // ms since the books' current wave began
  peekTime = -(TITLE_DONE + 250 + PEEK_OUT_MS), // ms since Dewey's current hello began (the first: once it's out)
  nextTitleAnim = randomTitleGap(), // ms until the next wave or peek (counted once the title has landed)
  nextIsPeek = false; // which one it'll be
function updateTitle(dt) {
  if (titleTime < DASH_START && titleTime + dt >= DASH_START) sfx.whoosh();
  titleTime += dt;
  if (state !== "ready") return; // (not while How to play or Characters is open)
  waveTime += dt;
  peekTime += dt;
  if (titleTime < TITLE_DONE) return;
  nextTitleAnim -= dt;
  if (nextTitleAnim <= 0) {
    if (nextIsPeek) peekTime = 0;
    else waveTime = 0;
    nextIsPeek = !nextIsPeek;
    nextTitleAnim = randomTitleGap();
  }
}

// The opening sequence, when the game first loads: on black, the logo drops in with a gold glow,
// then the title animates, then the library, buttons and badges fade up. A tap or key skips it.
const INTRO_LOGO_MS = 650, // the logo dropping in
  INTRO_TITLE_AT = 750, // when the title starts animating
  INTRO_UI_DELAY = 150, // after "Dash" lands, before the rest fades up
  INTRO_UI_MS = 700; // the rest fading up
let intro = true, // still playing?
  introTime = 0; // ms into it
// How faded-up the library, buttons and badges are: 0 hidden … 1 showing (always 1 after the intro).
function introUI() {
  if (!intro) return 1;
  return Math.min(1, Math.max(0, (titleTime - TITLE_DONE - INTRO_UI_DELAY) / INTRO_UI_MS));
}
function updateIntro(dt) {
  introTime += dt;
  if (introUI() >= 1) intro = false;
}
function skipIntro() {
  intro = false;
  titleTime = Math.max(titleTime, TITLE_DONE + 1000); // the title, landed (and its speed lines showing)
  peekTime = Math.max(peekTime, 10000); // no peek or wave left halfway
  waveTime = Math.max(waveTime, 10000);
}
// Dewey, beside the D book (x0: that book's left edge, on the shelf top). Once "Dash" has landed
// it slides out from behind the book and stays out, leaning out with a gentle sway; every so often
// (its turn of the title animations) it does a little wiggle hello. It's mirrored, so it faces you
// rather than the books, and while sliding out only the part past the book's edge shows.
function drawPeek(x0) {
  const t = titleTime - (TITLE_DONE + 250); // ms since it started coming out
  if (t <= 0) return;
  const ease = (v) => v * v * (3 - 2 * v);
  const out = ease(Math.min(1, t / PEEK_OUT_MS));
  const p = peekTime / PEEK_MS;
  const hello = p > 0 && p < 1 ? Math.sin(p * Math.PI * 4) * 0.1 * Math.sin(p * Math.PI) : 0; // two wiggles, easing in and out
  const sway = Math.sin(runTime * 0.002) * 0.03; // just standing there, leaning on the D
  const k = 0.95, // its size (a little shorter than the D book)
    bw = 40 * k;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 200, -200, 204, 210); // everything right of the book's edge is behind the book
  ctx.clip();
  ctx.translate(x0 + 4 + bw / 2 - out * (bw - 6), 0); // its feet on the shelf, sliding out from behind the D
  ctx.rotate(-0.18 * out + hello + sway * out);
  ctx.scale(-k, k);
  const dewey = CHARACTERS.find((c) => c.name === "Dewey") || CHARACTERS[0];
  drawCharacter(dewey, -20, -50, 40, 44);
  ctx.restore();
}
function drawTitle(cx, shelfY) {
  const bw = 34, // a spine's width
    gap = 3,
    booksW = TITLE_BOOKS.length * bw + (TITLE_BOOKS.length - 1) * gap,
    space = 26; // between the books and "Dash" (its speed lines go here)
  ctx.font = "bold italic 56px Georgia, serif";
  const dashW = ctx.measureText("Dash").width;
  const total = booksW + space + dashW;
  // On a phone, centre everything you see, Dewey's spot on the shelf to the left included.
  const deweyRoom = tall() ? 40 : 0;
  const s = Math.min(1, (W - 48) / (total + deweyRoom)); // shrink to fit a narrow screen
  ctx.save();
  ctx.translate(cx, shelfY);
  ctx.scale(s, s);
  const x0 = -(total + deweyRoom) / 2 + deweyRoom,
    by = -6; // "Dash"'s baseline, a little above the shelf

  // the shelf (with room on the left for Dewey to step out onto)
  ctx.fillStyle = "#5e3f24";
  roundRect(x0 - 40, 0, booksW + 48, 8, 2);
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(x0 - 40, 0, booksW + 48, 2);

  drawPeek(x0); // (behind the books)
  // the books, hopping in a wave when it's their turn
  TITLE_WORD.split("").forEach((letter, i) => {
    const b = TITLE_BOOKS[i],
      hp = (waveTime - i * TITLE_HOP_GAP) / TITLE_HOP_MS,
      hop = hp > 0 && hp < 1 ? Math.sin(Math.PI * hp) * 8 : 0;
    ctx.save();
    ctx.translate(x0 + i * (bw + gap) + bw / 2, -hop);
    ctx.rotate(b.tilt);
    ctx.fillStyle = b.color;
    roundRect(-bw / 2, -b.h, bw, b.h, 3);
    ctx.fillStyle = "rgba(255, 255, 255, 0.14)"; // rounded spine: light on the left…
    ctx.fillRect(-bw / 2 + 3, -b.h + 2, 4, b.h - 4);
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)"; // …shade on the right
    ctx.fillRect(bw / 2 - 6, -b.h + 2, 3, b.h - 4);
    ctx.fillStyle = GOLD; // gold bands
    ctx.fillRect(-bw / 2 + 3, -b.h + 6, bw - 6, 2);
    ctx.fillRect(-bw / 2 + 3, -9, bw - 6, 2);
    ctx.fillStyle = PAPER;
    ctx.font = "bold 26px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, 0, -b.h / 2 + 1);
    ctx.restore();
  });

  // "Dash": zooming in, then speed lines behind it, a dark outline, and gold shading
  const fp = (titleTime - DASH_START) / DASH_FLY_MS; // < 0 not yet, 0 → 1 flying, ≥ 1 landed
  if (fp < 0) return ctx.restore();
  const home = x0 + booksW + space; // just past the books
  let dx = home;
  if (fp < 1) {
    // from just off the left edge of the screen, overshooting a little before settling
    const start = -cx / s - dashW - 20,
      q = fp - 1,
      back = 1 + 2.7 * q * q * q + 1.7 * q * q;
    dx = start + (home - start) * back;
    // a streak behind it while it flies, shrinking as it slows
    const tail = (1 - fp) * 160;
    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(243, 234, 215, 0.55)";
    for (const y of [-38, -27, -16]) roundRect(dx - 6 - tail, y, tail, 3, 1.5);
    ctx.restore();
  } else {
    // landed: short speed lines in the gap, fading in
    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.globalAlpha = Math.min(1, (fp - 1) * 4);
    ctx.fillStyle = "rgba(243, 234, 215, 0.75)";
    for (const [y, len] of [[-38, 14], [-27, 20], [-16, 12]]) {
      const flick = Math.sin(runTime * 0.012 + y) * 2; // a little flicker, as if moving
      roundRect(dx - 4 - len + flick, y, len, 3, 1.5);
    }
    ctx.restore();
  }
  ctx.font = "bold italic 56px Georgia, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(20, 14, 10, 0.9)";
  ctx.strokeText("Dash", dx, by);
  const g = ctx.createLinearGradient(0, by - 42, 0, by + 4);
  g.addColorStop(0, "#fff2bf");
  g.addColorStop(0.5, GOLD);
  g.addColorStop(1, "#a8741f");
  ctx.fillStyle = g;
  ctx.fillText("Dash", dx, by);
  ctx.restore();
}

// The start screen: the title with Start and How to play buttons.
// The library keeps drifting by behind it, and the book jogs on the spot.
function drawStartScreen() {
  ctx.fillStyle = "rgba(26, 18, 12, 0.5)";
  fillScreen();
  const tx = W / 2,
    ty = tall() ? 160 : 0; // the tall layout drops the title down to sit just above the buttons
  // a little darker in the middle so the small text stays readable over the shelves
  const shade = ctx.createRadialGradient(W / 2, 150 + ty, 40, W / 2, 150 + ty, 300);
  shade.addColorStop(0, "rgba(26, 18, 12, 0.4)");
  shade.addColorStop(1, "rgba(26, 18, 12, 0)");
  ctx.fillStyle = shade;
  fillScreen();

  // the opening sequence: black over the library until it fades up
  const ui = introUI();
  if (ui < 1) {
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - ui})`;
    fillScreen();
  }

  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 6;
  if (intro) drawIntroLogo(tx, 30 + ty);
  else drawLogo(tx, 30 + ty, 30);
  // the title fades in just before its books start hopping
  ctx.globalAlpha = intro ? Math.min(1, titleTime / TITLE_FADE_MS) : 1;
  drawTitle(tx, 150 + ty);
  ctx.globalAlpha = 1;
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  ctx.globalAlpha = ui;
  drawButtons();

  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 6;
  ctx.textAlign = "center";
  // (who you're playing as is on the character card, and the best score is up by the profile)
  ctx.fillStyle = PAPER;
  ctx.font = "13px Georgia, serif";
  if (!tall()) ctx.fillText("← → to choose · Enter or Space to select", tx, 302); // (no room under the buttons on a phone)
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

// The opening sequence's logo: it drops in from above, lands with a little bounce, and a soft
// gold glow bursts out behind it. (x, top): where it ends up, as for drawLogo.
function drawIntroLogo(x, top) {
  const h = 30,
    plateH = h * 1.36, // the logo's white plate (see drawLogo)
    cy = top + plateH / 2;
  const p = Math.min(1, introTime / INTRO_LOGO_MS);
  if (p <= 0) return;
  // the glow, once it lands (at about 70% of the drop)
  const g = (introTime - INTRO_LOGO_MS * 0.7) / 900;
  if (g > 0 && g < 1) {
    const r = 30 + g * 90;
    const glow = ctx.createRadialGradient(x, cy, 0, x, cy, r);
    glow.addColorStop(0, `rgba(212, 166, 74, ${0.55 * (1 - g)})`);
    glow.addColorStop(1, "rgba(212, 166, 74, 0)");
    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = glow;
    ctx.fillRect(x - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
  // the drop: falls from above, lands at 70%, a small bounce after
  let dy;
  if (p < 0.7) {
    const q = p / 0.7;
    dy = -(1 - q * q) * (top + plateH + 20); // speeding up as it falls
  } else dy = -Math.sin(((p - 0.7) / 0.3) * Math.PI) * 8;
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 3);
  ctx.translate(0, dy);
  drawLogo(x, top, h);
  ctx.restore();
}

// Little pictures for the How to play screen, each centered on (x, y).
function iconStack(x, y) {
  drawLyingBook({ x: x - 14, y: y + 6, w: 28, h: 7, color: SPINES[0] });
  drawLyingBook({ x: x - 12, y: y - 1, w: 24, h: 7, color: SPINES[1] });
  drawLyingBook({ x: x - 13, y: y - 8, w: 26, h: 7, color: SPINES[2] });
  // a hop arrow over the top
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - 6, 15, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  poly(GOLD, x + 13, y - 18, x + 16, y - 10, x + 9, y - 13);
}
function iconFlyer(x, y) {
  drawFlyingBook(
    { x: x - 22, y: y - 14, w: 44, h: 22, color: SPINES[3], phase: 0, still: true },
    false,
  );
}
// The low reading table: a walnut top on legs, open underneath.
function iconTable(x, y) {
  R(x - 15, y - 5, 30, 5, "#6b4423");
  R(x - 15, y - 5, 30, 1.5, "rgba(255, 255, 255, 0.3)");
  R(x - 13, y, 3, 11, "#c9a77a");
  R(x + 10, y, 3, 11, "#c9a77a");
  R(x - 9, y + 4, 12, 7, SPINES[1]); // a book sliding underneath
  R(x - 9, y + 4, 3, 7, "#1e3d40");
}
// A book tunnel: the bookcase with its low beam, on posts.
function iconTunnel(x, y) {
  R(x - 13, y - 13, 26, 17, "#5a381c");
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 5; i++) R(x - 11 + i * 4.6, y - 11 + row * 7, 3.5, 6, SPINES[(i + row * 3) % SPINES.length]);
  R(x - 13, y + 2, 26, 3, "#a87a48");
  R(x - 13, y + 5, 2.5, 8, "#c9a77a");
  R(x + 10.5, y + 5, 2.5, 8, "#c9a77a");
}
// A stack of books sitting on top of a cart.
function iconTopStack(x, y) {
  R(x - 14, y + 4, 28, 4, "#9aa4b1");
  R(x - 12, y + 8, 2.5, 6, "#6f7986");
  R(x + 9.5, y + 8, 2.5, 6, "#6f7986");
  R(x - 6, y - 1, 13, 5, SPINES[0]);
  R(x - 5, y - 6, 11, 5, SPINES[2]);
  R(x - 6, y - 11, 12, 5, SPINES[4]);
}
// A bookmark floating over a piece of furniture.
function iconPerch(x, y) {
  R(x - 14, y + 8, 28, 4, "#9aa4b1");
  drawBookmark(x - 5, y - 13, 10, 18, RIBBON_RED);
}
// A murder of books: three dark little ones bunched together.
function iconFlock(x, y) {
  for (const [dx, dy, i] of [[-8, -7, 0], [9, -3, 1], [-1, 7, 2]]) {
    ctx.save();
    ctx.translate(x + dx, y + dy);
    ctx.scale(0.5, 0.5);
    drawFlyingBook({ x: -22, y: -8, w: 44, h: 22, phase: 0, still: true, color: FLOCK_COLORS[i] }, false, false);
    ctx.restore();
  }
}
// Each kind of flying book, for How to play's flying books page (the charger mid-wind-up, "!" and all).
const iconFlyerOf = (kind) => (x, y) =>
  drawFlyingBook(
    {
      x: x - 22,
      y: y - 14,
      w: 44,
      h: 22,
      phase: 0,
      still: true,
      color: { swoop: SWOOP_COLOR, dart: DART_COLOR, charge: CHARGE_COLOR }[kind] || SPINES[3],
      swoop: kind === "swoop",
      dart: kind === "dart",
      charge: kind === "charge" ? { t: 100, at: 0 } : undefined,
    },
    false,
    false,
  );
function iconPage(x, y) {
  drawPage(x - 9, y - 11, 18, 23, -0.12);
}
function iconCart(x, y) {
  R(x - 12, y - 6, 24, 10, "#353c46"); // steel back
  R(x - 14, y - 10, 28, 4, "#9aa4b1"); // top shelf
  R(x - 13, y - 10, 3, 16, "#4f5966");
  R(x + 10, y - 10, 3, 16, "#4f5966");
  R(x - 9, y - 4, 4, 8, SPINES[0]);
  R(x - 4, y - 6, 4, 10, SPINES[1]);
  R(x + 1, y - 3, 4, 7, SPINES[2]);
  R(x + 6, y - 5, 3, 9, SPINES[4]);
  R(x - 14, y + 4, 28, 3, "#7d8794"); // lower shelf
  oval(x - 9, y + 10, 3, 3, "#2b2b30");
  oval(x + 9, y + 10, 3, 3, "#2b2b30");
}
function iconBookmark(x, y) {
  drawBookmark(x - 7, y - 13, 14, 26, RIBBON_YELLOW);
}
function iconTape(x, y) {
  drawTape(x - 2, y, false);
}
function iconHeart(x, y) {
  heartPath(x, y + 1, 10);
  ctx.fillStyle = RIBBON_RED;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  oval(x - 4, y - 3, 2, 2, "rgba(255, 255, 255, 0.7)");
}

// ---------- Input ----------
document.addEventListener("keydown", (e) => {
  if (state === "book") return bookKey(e); // turning the pages of a Story Mode picture book
  // During the opening sequence, any key skips to the start screen.
  if (intro && state === "ready") {
    if (e.code === "Space" || e.code === "Enter" || e.code.startsWith("Arrow")) e.preventDefault();
    skipIntro();
    return;
  }
  // Menu screens: ← → pick a button, Enter / Space choose it, Esc goes back
  if (isMenu()) {
    const buttons = BUTTONS[state];
    const moveKeys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "KeyA",
      "KeyD",
      "KeyW",
      "KeyS",
      "Tab",
    ];
    const back =
      ["ArrowLeft", "ArrowUp", "KeyA", "KeyW"].includes(e.code) ||
      (e.code === "Tab" && e.shiftKey);
    if (state === "howto") {
      const k = e.code;
      if (topics.open) {
        e.preventDefault();
        const n = HOWTO_PAGES.length;
        if (k === "ArrowUp" || k === "KeyW" || (k === "Tab" && e.shiftKey)) topics.focus = (topics.focus + n - 1) % n;
        else if (k === "ArrowDown" || k === "KeyS" || k === "Tab") topics.focus = (topics.focus + 1) % n;
        else if ((k === "Enter" || k === "Space") && !e.repeat) pickTopic(topics.focus);
        else if (k === "Escape" || k === "KeyT") topics.open = false;
        else if (k === "KeyM") toggleMute();
        return;
      }
      if (k === "KeyT") return openTopics();
      if (k === "ArrowLeft" || k === "KeyA") {
        e.preventDefault();
        howtoPage = Math.max(0, howtoPage - 1);
        return;
      }
      if (k === "ArrowRight" || k === "KeyD") {
        e.preventDefault();
        howtoPage = Math.min(HOWTO_PAGES.length - 1, howtoPage + 1);
        return;
      }
      // (↑ ↓ and Tab move between Next and Close, below)
    }
    // on the Characters screen the arrows flip through the characters
    if (state === "chars" && moveKeys.includes(e.code)) {
      e.preventDefault();
      pickCharacter(charIndex + (back ? -1 : 1));
      return;
    }
    if (moveKeys.includes(e.code)) {
      e.preventDefault();
      keyNav = true;
      const step = back ? -1 : 1;
      selected[state] =
        (selected[state] + step + buttons.length) % buttons.length;
    } else if ((e.code === "Enter" || e.code === "Space") && !e.repeat) {
      e.preventDefault();
      choose(buttons[selected[state]].id);
    } else if (
      e.code === "Escape" ||
      (e.code === "KeyP" && state === "paused")
    ) {
      goBack();
    } else if (e.code === "KeyM") {
      toggleMute();
    }
    return;
  }
  // Counting down: wait for "Go!" (M still mutes)
  if (state === "countdown") {
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault(); // (don't scroll the page)
    if (e.code === "KeyM") toggleMute();
    return;
  }
  // Running
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    e.preventDefault();
    if (!e.repeat) jump();
  } else if (e.code === "ArrowDown" || e.code === "KeyS") {
    e.preventDefault();
    startDuck();
  } else if (e.code === "KeyM") {
    toggleMute();
  } else if (e.code === "KeyP" || e.code === "Escape") {
    pause();
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW")
    releaseJump();
  if (e.code === "ArrowDown" || e.code === "KeyS") duckHeld = false;
});
// Convert a pointer event to canvas coordinates (the canvas is scaled by CSS).
function toCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return [
    ((e.clientX - rect.left) / rect.width) * W,
    ((e.clientY - rect.top) / rect.height) * canvas.height - TOP, // (in the layout, which sits TOP down in full screen)
  ];
}
const inside = (x, y, b) =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

// Touch / mouse. On menus only the buttons respond, so a stray tap doesn't do anything.
// During a run, on a touch screen: tap to jump (hold for higher), swipe down and hold to duck.
// Every swipe starts as a touch, so a touch waits a moment (DECIDE_MS) to see which it is:
// if the finger moves down SWIPE_PX it's a duck, otherwise it's a jump when the wait ends or
// the finger lifts, whichever comes first. A mouse click just jumps straight away.
const DECIDE_MS = 70;
const SWIPE_PX = 15; // screen pixels
let gesture = null; // the finger currently on the game: { id, y0, t0, decided, timer, lag, jumpId }

function decide(kind) {
  const g = gesture;
  if (!g || g.decided) return;
  clearTimeout(g.timer);
  g.decided = kind;
  if (state !== "running") return;
  if (kind === "duck") return startDuck();
  g.lag = performance.now() - g.t0; // how late this jump started…
  jump();
  g.jumpId = jumpCount;
}

// The finger lifted: stand up, and end a held jump. The "let go" is delayed by the same
// amount the jump was, so taps and holds give exactly the same jumps as an instant jump would.
function endGesture(e) {
  const g = gesture;
  if (!g || e.pointerId !== g.id) return;
  if (!g.decided) decide("jump"); // a quick tap
  if (g.decided === "jump") {
    const id = g.jumpId;
    setTimeout(() => {
      if (jumpCount === id) releaseJump();
    }, g.lag);
  }
  duckHeld = false;
  gesture = null;
}

// Right-clicking the game does nothing: no browser menu…
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (e.pointerType === "mouse" && e.button !== 0) return; // …and only the left button plays
  if (intro && state === "ready") return skipIntro(); // a tap skips the opening sequence
  if (state === "book") return bookTap(e); // a tap turns the page
  const [cx, cy] = toCanvas(e);
  if (inside(cx, cy, MUTE_BTN)) return toggleMute();
  if (isMenu()) {
    keyNav = false;
    if (state === "ready" && inside(cx, cy, PROFILE)) return choose("chars"); // tap your profile to change it
    if (state === "howto") {
      if (topics.open) {
        const t = topics.items.findIndex((r) => inside(cx, cy, r));
        if (t >= 0) pickTopic(t);
        else topics.open = false; // a tap anywhere else just closes the list
        return;
      }
      if (topics.pill && inside(cx, cy, topics.pill)) return openTopics();
    }
    if (state === "chars") {
      const c = CHARACTERS.findIndex((_, i) => inside(cx, cy, cardRect(i)));
      if (c >= 0) return pickCharacter(c);
    }
    const i = BUTTONS[state].findIndex((b) => inside(cx, cy, b));
    if (i >= 0) {
      selected[state] = i;
      choose(BUTTONS[state][i].id);
    }
    return;
  }
  if (state !== "running") return;
  if (inside(cx, cy, PAUSE_BTN)) return pause();
  if (e.pointerType === "mouse") return jump();
  if (gesture) return; // already a finger down; ignore a second one
  gesture = {
    id: e.pointerId,
    y0: e.clientY,
    t0: performance.now(),
    decided: null,
    lag: 0,
    jumpId: 0,
  };
  gesture.timer = setTimeout(() => decide("jump"), DECIDE_MS);
  try {
    canvas.setPointerCapture(e.pointerId); // keep following the finger even if it slides off the game
  } catch {}
});
// Hovering a menu button selects it. During a run, a finger sliding down means duck.
canvas.addEventListener("pointermove", (e) => {
  const g = gesture;
  if (g && e.pointerId === g.id) {
    if (e.clientY - g.y0 > SWIPE_PX) {
      if (!g.decided) decide("duck");
      else if (state === "running") startDuck(); // swiping down after a jump: drop fast, then duck
    }
    return;
  }
  if (!isMenu()) return;
  keyNav = false;
  const [cx, cy] = toCanvas(e);
  if (state === "howto" && topics.open) {
    // hovering the Topics list highlights a topic
    const t = topics.items.findIndex((r) => inside(cx, cy, r));
    if (t >= 0) topics.focus = t;
    return;
  }
  const i = BUTTONS[state].findIndex((b) => inside(cx, cy, b));
  if (i >= 0) selected[state] = i;
  else if (state === "ready") selected.ready = 0; // off the buttons: back to Start
});
// The mouse leaving the game also hands the start screen's highlight back to Start.
canvas.addEventListener("pointerleave", () => {
  if (state === "ready" && !keyNav) selected.ready = 0;
});
function startDuck() {
  if (!duckHeld && state === "running") sfx.duck();
  duckHeld = true;
}
function pointerRelease(e) {
  if (gesture) return endGesture(e);
  if (e.pointerType === "mouse") releaseJump(); // a held mouse click jumps higher too
}
canvas.addEventListener("pointerup", pointerRelease);
canvas.addEventListener("pointercancel", pointerRelease);
canvas.addEventListener("pointerleave", (e) => {
  if (!gesture && e.pointerType === "mouse") releaseJump();
});

applyLayout(wantedLayout()); // pick the starting layout for this screen

// Auto-pause when the tab is hidden
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});

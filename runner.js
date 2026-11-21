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
const PAGES_LOST_ON_HIT = 3; // a bump knocks this many pages loose (not on the last heart)
// Book tape wins back a heart. It only shows up while you're missing one, never right away,
// and always at the top of a jump over a stack, so you have to go for it.
const REPAIR_FIRST_MS = 15000; // hurt for at least this long before the first roll appears…
const REPAIR_EVERY_MS = 30000; // …and this long between rolls after that
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
  table: { w: 180, h: 64 }, // a reading table with chairs tucked behind (you run along the top)
};
const SMASH_MS = 1150; // a smash from start to finish: hit, fall back, lie there, get up
const SLIP_MS = 1500; // no jumping for this long after a puddle (bumps still happen as normal)
const SLIP_JUMP_BUFFER_MS = 250; // a jump pressed this close to the end of a slip happens as it ends
const PUDDLE_W = 54;
const PUDDLE_GAP = 340; // from one puddle to the next (a slip lasts longer, so one splash usually means more)
const AFTER_WET_GAP = 380; // room after the last puddle before the next obstacle

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
const player = { x: 70, y: GROUND_Y, w: 40, h: 44, vy: 0, onGround: true };
let obstacles = [];
let pickups = []; // loose pages and the odd bookmark: { kind, x, y, w, h, color, phase }
let particles = [];
let popups = [];
let speed, pages, runDist, nextSpawn, state, runTime; // pages collected, px run this run
let distance = 0; // total scrolled distance, drives the background
let duckHeld = false; // is the duck key / touch held?
let lives = LIVES;
let hurtTime = 0; // ms left of blinking after a bump
let shake = 0; // ms left of screen shake
let heartPop = null; // { index, life }: the heart that was just lost, popping away
let shedTimer = 0; // on the last heart, the book drops a loose page now and then
let tumble = null; // after the last bump: { x, y, vx, vy, rot, shed } of the book flying off screen
let smash = null; // a hard stop into furniture: { t, final, faceX, groundY }
let standingOn = null; // the piece of furniture the book is standing on, if any
let lostPages = []; // pages knocked loose by a bump, flying off: { x, y, vx, vy, rot, spin, life }
let pageLoss = null; // { amount, life }: the page counter flashes red and shows "−3"
let repairWait = REPAIR_FIRST_MS; // ms of being hurt until the next roll of tape can appear
let healTime = 0; // ms left of the tape-sweeping-across-the-book animation
let heartGain = null; // { index, life }: the heart that was just won back, popping in
let slipTime = 0; // ms left of slipping after a puddle (no jumping)
let jumpQueued = false; // jump pressed while slipping: it happens as soon as the slip ends
let accLift = 0, // hats / glasses lifted by a jump: 0 in place … about 1 floating (see updateAccessories)
  accVel = 0;
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
  hurt: () => {
    tone(330, 160, 0.16, "triangle", 0.16);
    tone(160, 90, 0.12, "square", 0.06, 0.04);
  },
  crash: () => {
    tone(220, 40, 0.45, "sawtooth", 0.18);
    tone(90, 30, 0.3, "square", 0.12, 0.05);
    tone(520, 110, 0.6, "triangle", 0.07, 0.2); // a falling "wheee" as the book tumbles away
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
// game over. The Sound button turns it off with everything else.
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
    if (mode === "over") playMusicSting(now + 0.05);
    else if (musicMode === "over" || musicMode === "") {
      musicStep = 0; // a fresh start after game over (or the very first time)
      musicNext = now + 0.05;
    }
    m.filter.frequency.setTargetAtTime(mode === "paused" ? 650 : 18000, now, 0.1); // muffled when paused
    musicMode = mode;
  }
  const level = muted ? 0 : mode === "menu" ? MUSIC_VOLUME * 0.75 : mode === "paused" ? MUSIC_VOLUME * 0.6 : MUSIC_VOLUME;
  if (level !== musicLevel) {
    m.out.gain.setTargetAtTime(level, now, 0.08);
    musicLevel = level;
  }
  if (mode === "over" || muted) return; // (the sting plays out by itself)
  if (musicNext < now - 0.2) musicNext = now + 0.05; // fell behind (the tab was hidden): pick up from now
  while (musicNext < now + 0.15) {
    scheduleMusicStep(musicStep, musicNext, mode === "paused" ? "run" : mode);
    musicStep = (musicStep + 1) % 128;
    musicNext += MUSIC_STEP;
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
  player.y = GROUND_Y;
  player.vy = 0;
  player.onGround = true;
  player.ducking = false;
  duckHeld = false;
  obstacles = [];
  pickups = [];
  particles = [];
  popups = [];
  speed = START_SPEED;
  pages = 0;
  runDist = 0;
  runTime = 0;
  nextSpawn = 600;
  lives = LIVES;
  hurtTime = 0;
  shake = 0;
  heartPop = null;
  shedTimer = 0;
  tumble = null;
  smash = null;
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
state = "ready"; // ready | running | paused | over

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
  const count =
    runTime > DOUBLE_STACKS_START_MS && Math.random() < 0.35
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
  const swoop = runTime > SWOOP_START_MS && Math.random() < SWOOP_CHANCE;
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
  obstacles.push(o);
  return o;
}

function updateObstacles(dt) {
  const dx = speed * dt;
  for (const o of obstacles) {
    o.x -= dx;
    for (const b of o.books) b.x -= dx;
    if (o.type === "flyer")
      o.y = o.swoop
        ? swoopBottom(o) - o.h
        : FLYER_BOTTOM - o.h + Math.sin(runTime * 0.006 + o.phase) * 2;
  }
  obstacles = obstacles.filter((o) => o.x + o.w > -20);

  // Spawn based on distance so gaps stay jumpable as speed rises.
  nextSpawn -= dx;
  if (nextSpawn <= 0 && runTime > WET_START_MS && Math.random() < WET_CHANCE) {
    spawnWetFloor();
  } else if (nextSpawn <= 0 && runTime > PLATFORM_START_MS && Math.random() < PLATFORM_CHANCE) {
    spawnPlatform();
  } else if (nextSpawn <= 0) {
    const flyer = runTime > FLYER_START_MS && Math.random() < FLYER_CHANCE;
    const o = flyer ? spawnFlyer() : spawnObstacle();
    const airTime = (2 * -JUMP_VELOCITY) / GRAVITY; // ms spent in a full jump
    nextSpawn = speed * airTime * (1.1 + Math.random() * 1.4) + 60;
    spawnPickups(o, airTime);
  }
}

// A piece of furniture to jump onto, with a row of pages along the top for anyone who lands on it.
// Nothing else turns up until well after it.
function spawnPlatform() {
  const kinds = Object.keys(PLATFORMS);
  const kind = kinds[(Math.random() * kinds.length) | 0];
  const { w, h } = PLATFORMS[kind];
  const o = { type: "platform", kind, x: W + 10, y: FLOOR - h, w, h, books: [], seed: Math.random() * 1000 };
  obstacles.push(o);
  for (let cx = o.x + 30; cx < o.x + w - 20; cx += 45) addPickup(cx, o.y - 34);
  const airTime = (2 * -JUMP_VELOCITY) / GRAVITY;
  nextSpawn = w + speed * airTime * 1.3 + 80;
}

// A wet floor sign, then 1–3 puddles, each with an arc of pages over it (jump them to keep
// your pages dry). The next obstacle waits until well after the last puddle.
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
  let px = sign.x + 260;
  for (let i = 0; i < count; i++) {
    obstacles.push({
      type: "puddle",
      x: px,
      y: FLOOR - 3,
      w: PUDDLE_W,
      h: 8,
      books: [],
      soaked: false,
      phase: Math.random() * 6,
    });
    // pages in a jump arc over the puddle
    const cx = px + PUDDLE_W / 2,
      side = speed * airTime * 0.25;
    addPickup(cx - side, GROUND_Y - 100);
    addPickup(cx, GROUND_Y - 136);
    addPickup(cx + side, GROUND_Y - 100);
    px += PUDDLE_GAP;
  }
  nextSpawn = px - PUDDLE_GAP + PUDDLE_W - (W + 10) + AFTER_WET_GAP;
}

// Running (or ducking) through a puddle: splash, lose a soggy page, and slip for a moment.
function checkPuddles() {
  if (!player.onGround || standingOn || hurtTime > 0) return; // jumping over is safe, so is furniture, and so is the blink after a bump
  const p = playerBox();
  for (const o of obstacles) {
    if (o.type !== "puddle" || o.soaked) continue;
    if (p.x + 8 < o.x + o.w - 8 && p.x + p.w - 8 > o.x + 8) soak(o);
  }
}
function soak(o) {
  o.soaked = true;
  slipTime = SLIP_MS;
  sfx.splash();
  const b = playerBox();
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

function hits(o) {
  if (o.type === "puddle") return false; // puddles soak instead (see checkPuddles)
  const p = playerBox();
  // furniture only counts if you run into its side: standing on top is fine
  if (o.type === "platform" && p.y + p.h <= o.y + 6) return false;
  const pad = 6; // forgiving hitbox
  return (
    p.x + pad < o.x + o.w &&
    p.x + p.w - pad > o.x &&
    p.y + pad < o.y + o.h &&
    p.y + p.h > o.y + 2
  );
}

// ---------- Pages to collect (and the rare bookmark) ----------
// `cx` is the item's center, `y` the top of where a bookmark would hang.
function addPickup(cx, y) {
  if (Math.random() < BOOKMARK_CHANCE) {
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
    if (o.swoop) return; // nothing under a swooper, so nobody gets lured in as it dives
    // A pair tucked right under the flying book, a reward for ducking.
    if (r < 0.5)
      for (let k = 0; k < 2; k++) addPickup(o.x + 8 + k * 28, FLOOR - 28);
    return;
  }
  const tape =
    lives < LIVES &&
    repairWait <= 0 &&
    !pickups.some((b) => b.kind === "repair");
  if (tape || r < 0.4) {
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
    } else addPickup(cx, GROUND_Y - 136);
    addPickup(cx + side, GROUND_Y - 100);
  } else if (r < 0.7) {
    // A row on the floor, halfway between this stack and the next one.
    const mid = o.x + (o.w + nextSpawn) / 2;
    for (let k = -1; k <= 1; k++) addPickup(mid + k * 28, FLOOR - 34);
  }
}

function updatePickups(dt) {
  const dx = speed * dt;
  for (const b of pickups) b.x -= dx;
  const p = playerBox();
  pickups = pickups.filter((b) => {
    if (b.x + b.w < -10) return false;
    const touching =
      p.x < b.x + b.w && p.x + p.w > b.x && p.y < b.y + b.h && p.y + p.h > b.y;
    if (!touching) return true;
    if (b.kind === "page") {
      pages++;
      sfx.page();
      burst(b.x + b.w / 2, b.y + b.h / 2, 5, PAPER, 3);
    } else if (b.kind === "repair") {
      heal(b);
    } else {
      pages += BOOKMARK_PAGES;
      sfx.bookmark();
      burst(b.x + b.w / 2, b.y + b.h / 2, 14, b.color);
      popups.push({
        x: b.x + b.w / 2,
        y: b.y,
        text: `Bookmark! +${BOOKMARK_PAGES} pages`,
        life: 900,
      });
    }
    return false;
  });
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
  runTime += dt;
  speed = Math.min(MAX_SPEED, speed + SPEED_RAMP * dt);
  runDist += speed * dt;
  distance += speed * dt;

  updatePlayer(dt);
  updateObstacles(dt);
  updatePickups(dt);
  updateParticles(dt);

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
  if (hurtTime <= 0) {
    const hit = obstacles.find(hits);
    if (hit) hit.type === "platform" ? smashInto(hit) : takeHit();
  }
}

// Running into furniture: a hard stop, and the end of the run. The run freezes while the book
// smashes into it and falls over backwards, and it stays down (see drawSmash) as the game ends.
function smashInto(o) {
  // running into furniture takes every heart you have left: the run ends with the smash
  heartPop = { index: 0, count: lives, life: 500 };
  lives = 0;
  const b = playerBox();
  smash = { t: 0, final: true, faceX: o.x, groundY: player.y + player.h };
  player.ducking = false;
  duckHeld = false;
  shake = 260;
  sfx.thunk();
  for (let i = 0; i < 6; i++) {
    // little stars burst off the impact
    particles.push({ x: o.x, y: b.y + 10 + Math.random() * 20, vx: -0.05 - Math.random() * 0.15, vy: -0.15 - Math.random() * 0.2, life: 500 + Math.random() * 200, color: i % 2 ? "#ffe27a" : "#fff6c8", size: 4 });
  }
  popups.push({ x: b.x + b.w / 2, y: b.y - 8, text: "Thunk!", life: 900 });
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

function gameOver(fromSmash = false) {
  state = "over";
  const b = playerBox();
  if (fromSmash) {
    // smashed into furniture on the last heart: the book stays flat on its back (see drawSmash)
    burst(b.x + b.w / 2, b.y + b.h / 2, 10, PAPER, 6);
  } else {
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
const OVER_GRACE_MS = DEATH_MS + OVER_FADE_MS; // its buttons work once the panel is fully shown
let howtoFrom = "ready"; // the screen How to play goes back to: "ready" or "paused"
const selected = { ready: 0, paused: 0, howto: 0, over: 0, chars: 0 }; // highlighted button on each screen

// Keep the most pages collected in one run. Returns true if this run beat it.
function saveBest() {
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
// A column of buttons, centered (the tall layout, on phones held upright).
function buttonCol(y, ...items) {
  const w = 240,
    h = 46,
    gap = 12;
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
    ["start", "Start"],
    ["chars", "Characters"],
    ["howto", "How to play"],
  ],
  chars: [["done", "Done"]],
  paused: [
    ["resume", "Resume"],
    ["howto", "How to play"],
    ["quit", "Quit"],
  ],
  howto: [["back", "Back"]],
  over: [
    ["again", "Play again"],
    ["menu", "Main menu"],
  ],
};
// Where each screen's buttons go: a row in the wide layout, a column in the tall one.
const BUTTON_Y = {
  wide: { ready: 178, chars: 234, paused: 196, howto: 220, over: 196 },
  tall: { ready: 340, chars: 494, paused: 288, howto: 466, over: 288 },
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
}
const isMenu = () => state in BUTTONS;
// Is the start screen (or a screen opened from it) showing? Then there's no score bar.
const onStartScreen = () =>
  state === "ready" ||
  state === "chars" ||
  (state === "howto" && howtoFrom === "ready");

function startRun() {
  reset(); // a fresh run (the start screen's animation clock kept ticking)
  state = "running";
  sfx.start();
}

function pause() {
  if (state !== "running") return;
  state = "paused";
  selected.paused = 0;
}

function choose(id) {
  if (state === "over" && overTime < OVER_GRACE_MS) return; // let the crash and the fade finish
  if (id === "start" || id === "again") startRun();
  else if (id === "menu") {
    reset();
    state = "ready";
  } else if (id === "quit") {
    saveBest(); // pages collected before quitting still count toward the best
    reset();
    state = "ready"; // back to the start screen
  } else if (id === "resume") state = "running";
  else if (id === "howto") {
    howtoFrom = state;
    selected.howto = 0;
    state = "howto";
  } else if (id === "back") state = howtoFrom;
  else if (id === "chars") state = "chars";
  else if (id === "done") state = "ready";
}

// What Esc does on each menu screen.
function goBack() {
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
const tall = () => layout === "tall";
function wantedLayout() {
  return window.innerHeight > window.innerWidth && window.innerWidth <= 600
    ? "tall"
    : "wide";
}
function applyLayout(name) {
  layout = name;
  canvas.width = LAYOUTS[name].w;
  canvas.height = LAYOUTS[name].h;
  W = canvas.width;
  H = canvas.height;
  WORLD_Y = LAYOUTS[name].worldY;
  canvas.style.setProperty("--ratio", W / H); // lets the page shrink the game to fit the screen's height
  PROFILE = { x: W - 12 - 112, y: 12, w: 112, h: 32 }; // top-right corner either way
  // wide: the score bar sits beside the profile; tall: there isn't room, so it goes on the
  // ceiling, under the row of buttons
  SCORE = tall()
    ? { x: W / 2 - 179, y: 54 }
    : { x: PROFILE.x - 8 - 358, y: 12 };
  makeButtons();
}
function checkLayout() {
  if (state === "running") return; // locked during a run
  const want = wantedLayout();
  if (want !== layout) applyLayout(want);
}

let last = performance.now();
function frame(now) {
  checkLayout();
  updateMusic();
  const dt = Math.min(now - last, 50); // clamp so tab-switching doesn't teleport things
  last = now;
  if (state === "running") update(dt);
  else if (state === "over") {
    updateTumble(dt);
    if (smash) smash.t += dt; // a final smash keeps animating (the book lies there, seeing stars)
    updateParticles(dt);
    overTime += dt;
  } else if (onStartScreen()) {
    // start screen: the library drifts by slowly while the book jogs on the spot
    runTime += dt;
    distance += START_DRIFT * dt;
  }
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
  for (let tx = -((distance * 0.9) % 56); tx < W; tx += 56)
    R(tx, FLOOR, 1, 13, line);
  for (let tx = -((distance * 1.1 + 30) % 72); tx < W; tx += 72)
    R(tx, FLOOR + 14, 1, H - FLOOR, line);
}
function carpet(x, w, base, fleck) {
  R(x, FLOOR, w, H - FLOOR, base);
  for (let k = Math.floor(distance / 9); k * 9 - distance < W; k++) {
    R(k * 9 - distance, FLOOR + 3 + hash(k, 5) * (H - FLOOR - 6), 2, 1, fleck);
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
  // push the scenery back a touch so the obstacles and pages pop
  R(0, 0, W, FLOOR, "rgba(20, 14, 10, 0.12)");
  R(0, FLOOR, W, 2, "rgba(0, 0, 0, 0.3)");
}

// ---------- Drawing ----------
// In the tall layout the library strip sits in the middle of the screen. Above it: a dark
// ceiling (the buttons and score bar sit on it). Below it: the floor carries on.
function drawTallCeiling() {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_Y);
  g.addColorStop(0, "#1a1512");
  g.addColorStop(1, "#2e2724");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, WORLD_Y);
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
  const bottom = H - WORLD_Y; // the bottom of the screen, in room coordinates
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
    if (o.type === "flyer") drawFlyingBook(o);
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
    else drawBookmark(b.x, b.y + bob, b.w, b.h, b.color);
  }

  if (smash) drawSmash();
  else if (state !== "over") drawPlayer();
  else drawTumble();

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
  else if (!onStartScreen()) drawHearts(MUTE_BTN.x + MUTE_BTN.w + 8, 12);
  if (state === "running") drawPauseButton();

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
    if (state === "howto") drawHowTo();
    if (state === "chars") drawCharacters();
    return; // the start screen has no score bar
  }

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
  ctx.fillStyle = GOLD;
  ctx.fillText("BEST " + best, SCORE.x + 108, sy + 22);
  ctx.textAlign = "right";
  ctx.fillStyle = PAPER;
  ctx.fillText(
    "DISTANCE " + Math.floor(runDist * METERS_PER_PX) + " m",
    SCORE.x + 346,
    sy + 22,
  );

  // Overlays
  if (state === "paused") drawPause();
  if (state === "howto") drawHowTo();
  if (state === "over") drawGameOver();
}

// ---------- Menu drawing ----------
function drawPanel(x, y, w, h) {
  ctx.fillStyle = "rgba(26, 18, 12, 0.92)";
  roundRect(x, y, w, h, 12);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
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
  ctx.font = "bold 18px Georgia, serif";
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 6);
}

// The current screen's buttons. On the start screen the selected one gently pulses.
function drawButtons() {
  BUTTONS[state].forEach((b, i) => {
    const on = i === selected[state];
    drawButton(
      b,
      on,
      on && state === "ready" ? 1 + Math.sin(runTime * 0.005) * 0.04 : 1,
    );
  });
}

function hint(text, y) {
  ctx.textAlign = "center";
  ctx.fillStyle = "#c9bc9f";
  ctx.font = "12px Georgia, serif";
  ctx.fillText(text, W / 2, y);
}

// The pause button shown during a run (so touch screens can pause too), right of the hearts.
const PAUSE_BTN = {
  x: MUTE_BTN.x + MUTE_BTN.w + 8 + LIVES * 24 + 10 + 8,
  y: 12,
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
  ctx.fillStyle = "rgba(26, 18, 12, 0.45)";
  ctx.fillRect(0, 0, W, H);
  const pw = tall() ? 380 : 500, // wide enough for three buttons in a row
    py = tall() ? 120 : 34,
    ph = tall() ? 400 : 252;
  drawPanel(W / 2 - pw / 2, py, pw, ph);
  drawLogo(W / 2, py + 10, 26);
  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.font = "bold 34px Georgia, serif";
  ctx.fillText("Shh… paused", W / 2, py + 86);
  ctx.font = "16px Georgia, serif";
  ctx.fillText("Your run will wait right here.", W / 2, py + 114);
  ctx.fillStyle = GOLD;
  ctx.font = "bold 15px Georgia, serif";
  ctx.fillText("Press P or Esc to keep reading", W / 2, py + 138);
  drawButtons();
  hint(
    tall()
      ? "Quit goes back to the start screen"
      : "← → to choose · Enter or Space to select · Quit goes back to the start screen",
    py + ph - 14,
  );
}

// How to play: its own screen, opened from the start screen or the pause screen.
function drawHowTo() {
  ctx.fillStyle = "rgba(26, 18, 12, 0.55)";
  ctx.fillRect(0, 0, W, H);
  const pw = tall() ? 420 : 600,
    px = W / 2 - pw / 2,
    py = tall() ? 20 : 12,
    ph = tall() ? 600 : 284;
  drawPanel(px, py, pw, ph);
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "bold 24px Georgia, serif";
  ctx.fillText("How to play", W / 2, py + 34);

  // The goal: a gold "Goal:" followed by the rest, centered together (two lines when tall)
  const goalLead = "Goal: ",
    goalText = tall()
      ? "dash through the library and"
      : "dash through the library and collect as many pages as you can!";
  if (tall()) {
    ctx.textAlign = "center";
    ctx.fillStyle = PAPER;
    ctx.font = "14px Georgia, serif";
    ctx.fillText("collect as many pages as you can!", W / 2, py + 76);
  }
  ctx.font = "bold 14px Georgia, serif";
  const leadW = ctx.measureText(goalLead).width;
  ctx.font = "14px Georgia, serif";
  const goalX = W / 2 - (leadW + ctx.measureText(goalText).width) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.font = "bold 14px Georgia, serif";
  ctx.fillText(goalLead, goalX, py + 56);
  ctx.fillStyle = PAPER;
  ctx.font = "14px Georgia, serif";
  ctx.fillText(goalText, goalX + leadW, py + 56);

  const rows = [
    {
      title: "Jump stacks & wet floor signs",
      how: "Space, ↑ or tap. Puddles make you slip!",
      icon: iconStack,
    },
    {
      title: "Duck the flying books",
      how: "↓ or swipe down & hold. Orange ones swoop!",
      icon: iconFlyer,
    },
    {
      title: "Collect loose pages",
      how: `Rare bookmarks are worth ${BOOKMARK_PAGES} pages!`,
      icon: iconPage,
    },
    {
      title: "Hop onto carts & chairs",
      how: "Run into the side and it's game over!",
      icon: iconCart,
    },
    {
      title: `You have ${LIVES} hearts`,
      how: `Each bump costs a heart and ${PAGES_LOST_ON_HIT} pages!`,
      icon: iconHeart,
    },
    {
      title: "Grab book tape",
      how: "It shows up when you're hurt: +1 heart!",
      icon: iconTape,
    },
  ];
  rows.forEach((r, i) => {
    // wide: two columns of three · tall: one column of six
    const cx = tall() ? px + 24 : px + 36 + (i % 2) * 284,
      ry = tall() ? py + 96 + i * 58 : py + 70 + Math.floor(i / 2) * 46;
    r.icon(cx + 14, ry + 16);
    ctx.textAlign = "left";
    const room = tall() ? pw - 24 - 46 - 14 : 284 - 46 - 12; // leaves a little space before the next column / panel edge
    // titles at 15px and descriptions at 13px, each a touch smaller if too long for the column
    ctx.fillStyle = PAPER;
    ctx.font = "bold 15px Georgia, serif";
    const titleRoom = tall() ? room : room - 14; // clear of the next column's icon (the flying book's wings reach left)
    const titleFit = Math.max(
      12,
      Math.min(15, (15 * titleRoom) / ctx.measureText(r.title).width),
    );
    ctx.font = `bold ${titleFit}px Georgia, serif`;
    ctx.fillText(r.title, cx + 46, ry + 13);
    ctx.fillStyle = "#c9bc9f";
    ctx.font = "13px Georgia, serif";
    const fit = Math.max(
      11,
      Math.min(13, (13 * room) / ctx.measureText(r.how).width),
    );
    ctx.font = `${fit}px Georgia, serif`;
    ctx.fillText(r.how, cx + 46, ry + 31);
  });
  drawButtons();
  hint(
    tall()
      ? "Hold your tap to jump higher"
      : "Hold jump to go higher · P pauses · M sound on/off · Esc to go back",
    py + ph - 12,
  );
}

function drawGameOver() {
  // wait for the crash to finish, then fade in (rising slightly as it appears)
  const fade = Math.min(1, Math.max(0, (overTime - DEATH_MS) / OVER_FADE_MS));
  if (fade === 0) return;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(0, (1 - fade) * 12);

  ctx.fillStyle = "rgba(26, 18, 12, 0.45)";
  ctx.fillRect(0, 0, W, H);
  const pw = 380,
    px = W / 2 - pw / 2,
    py = tall() ? 120 : 34,
    ph = tall() ? 360 : 252;
  drawPanel(px, py, pw, ph);
  drawLogo(W / 2, py + 10, 26);

  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.font = "bold 34px Georgia, serif";
  ctx.fillText("Overdue!", W / 2, py + 86);
  ctx.font = "16px Georgia, serif";
  ctx.fillText(
    `${pages} page${pages === 1 ? "" : "s"} collected · ${Math.floor(runDist * METERS_PER_PX)} m run`,
    W / 2,
    py + 112,
  );
  ctx.fillStyle = GOLD;
  ctx.font = "bold 15px Georgia, serif";
  ctx.fillText(
    newBest && best > 0 ? "★ New best! ★" : `Best: ${best} pages`,
    W / 2,
    py + 136,
  );

  drawButtons();
  hint(
    tall()
      ? "Main menu goes back to the start screen"
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
  ctx.textAlign = "left";
  ctx.fillStyle = PAPER;
  ctx.font = "bold 15px Georgia, serif";
  ctx.fillText(CHARACTERS[charIndex].name, b.x + 12, b.y + 21);
  drawAvatar(b.x + b.w - 19, b.y + 16, 13);
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

// A reading table with two chairs tucked in behind it, and an open book lying on top.
function drawReadingTable(o) {
  const { x, y, w, h } = o;
  for (const cx of [x + 22, x + w - 56]) {
    // chair backs peeking up behind the table
    R(cx, y - 34, 5, 34, "#3d2614");
    R(cx + 29, y - 34, 5, 34, "#3d2614");
    R(cx, y - 34, 34, 6, "#5a381c");
    R(cx + 3, y - 22, 28, 4, "#5a381c");
  }
  R(x + 10, y + 14, 8, FLOOR - y - 14, "#3d2614"); // legs
  R(x + w - 18, y + 14, 8, FLOOR - y - 14, "#3d2614");
  R(x + 6, y + 8, w - 12, 6, "#4a2e18"); // the apron under the top
  R(x, y, w, 9, "#6b4423"); // the tabletop (where you run): dark walnut
  R(x, y, w, 2, "rgba(255, 255, 255, 0.3)");
  R(x, y + 9, w, 1.5, "#24160b"); // a crisp edge
  // an open book lying flat on the table
  const bx = x + w / 2 - 6;
  poly(PAPER, bx - 14, y, bx, y - 3, bx, y + 1, bx - 14, y + 2);
  poly("#f8f2e3", bx + 14, y, bx, y - 3, bx, y + 1, bx + 14, y + 2);
  R(bx - 15, y + 1, 30, 1.5, SPINES[3]);
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
  const cx = o.x + o.w / 2,
    cy = FLOOR + 6, // on the walking surface
    rx = o.w / 2,
    ry = 7;
  oval(cx, cy + 1, rx + 2, ry + 1.5, "rgba(20, 40, 70, 0.35)"); // a wet, darker edge
  oval(cx, cy, rx, ry, "#4f93cf");
  oval(cx - 3, cy - 1, rx - 7, ry - 2.5, "#9fd0f2");
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.7); // rim catching the light
  ctx.stroke();
  const shimmer = Math.sin(runTime * 0.006 + o.phase) * 5;
  R(cx - 12 + shimmer, cy - 3, 11, 2, "rgba(255, 255, 255, 0.85)");
  R(cx + 6 - shimmer, cy + 1, 6, 1.5, "rgba(255, 255, 255, 0.7)");
  if (o.soaked) {
    // ripples after a splash
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 6, ry - 2.5, 0, 0, Math.PI * 2);
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
function drawFlyingBook(o, shadow = true) {
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
  if (o.swoop) {
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
  }
  const flap = Math.sin(runTime * (o.swoop ? 0.04 : 0.025) + o.phase) * 7;
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
  if (pose) {
    if (state === "running") speedLines(px, by, ph, runTime);
    runTransform(pose, fx, fy); // lean, squash on landing, stretch in the air
  }
  if (slipTime > 0) {
    // slipping after a puddle: wobble on its feet (settling down as it dries), with drips falling
    const k = slipTime / SLIP_MS; // 1 → 0 over the slip
    ctx.save();
    ctx.translate(px + pw / 2, py + ph + 4);
    ctx.rotate(Math.sin(runTime * 0.05) * (0.06 + 0.12 * k));
    ctx.translate(-(px + pw / 2), -(py + ph + 4));
    drawCharacter(CHARACTERS[charIndex], px, by, pw, ph, look);
    ctx.restore();
    ctx.restore(); // (the run lean / squash)
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
  } = {},
) {
  // legs. While running, the body bounces up by `bob`, so a planted leg stretches to keep its
  // foot on the floor, and a leg is lifted off it by `lift`.
  ctx.fillStyle = "#1e2b2c";
  if (duck) {
    ctx.fillRect(px + 8 + step, py + ph, 6, 2);
    ctx.fillRect(px + pw - 16 - step, py + ph, 6, 2);
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
    name: "Dash",
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
); // Dash unless they picked another

function pickCharacter(i) {
  charIndex = (i + CHARACTERS.length) % CHARACTERS.length;
  safeSet("runner-character", CHARACTERS[charIndex].id);
  tone(660, 880, 0.07, "triangle", 0.08);
}

// The character cards on the Characters screen (shared by drawing and tapping).
// Wide: one row of four. Tall: a 2 × 2 grid.
const CARD = { w: 136, h: 160, gap: 12, y: 58 };
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
  ctx.fillStyle = "rgba(26, 18, 12, 0.55)";
  ctx.fillRect(0, 0, W, H);
  const pw = tall() ? 420 : 620,
    py = tall() ? 26 : 18,
    ph = tall() ? 562 : 284;
  drawPanel(W / 2 - pw / 2, py, pw, ph);
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "bold 24px Georgia, serif";
  ctx.fillText("Choose your book", W / 2, py + 34);

  CHARACTERS.forEach((c, i) => {
    const on = i === charIndex;
    const r = cardRect(i),
      lift = on ? -4 : 0;
    ctx.fillStyle = on
      ? "rgba(215, 163, 94, 0.22)"
      : "rgba(255, 255, 255, 0.05)";
    roundRect(r.x, r.y + lift, r.w, r.h, 10);
    ctx.strokeStyle = on ? MAPLE : "rgba(212, 166, 74, 0.45)";
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
    ctx.fillStyle = on ? GOLD : PAPER;
    ctx.font = "bold 17px Georgia, serif";
    const ty = r.y + lift + (tall() ? 140 : 124); // name, then the two blurb lines
    ctx.fillText(c.name, r.x + r.w / 2, ty);
    ctx.fillStyle = "#c9bc9f";
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

// The start screen: the title with Start and How to play buttons.
// The library keeps drifting by behind it, and the book jogs on the spot.
function drawStartScreen() {
  ctx.fillStyle = "rgba(26, 18, 12, 0.5)";
  ctx.fillRect(0, 0, W, H);
  const tx = W / 2,
    ty = tall() ? 90 : 0; // the tall layout drops the title, clear of the top bar and closer to the buttons
  // a little darker in the middle so the small text stays readable over the shelves
  const shade = ctx.createRadialGradient(W / 2, 150 + ty, 40, W / 2, 150 + ty, 300);
  shade.addColorStop(0, "rgba(26, 18, 12, 0.4)");
  shade.addColorStop(1, "rgba(26, 18, 12, 0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 6;
  drawLogo(tx, 30 + ty, 30);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)"; // drop shadow
  ctx.font = "bold 46px Georgia, serif";
  ctx.fillText("Stacks Dash", tx + 2, 121 + ty);
  ctx.fillStyle = PAPER;
  ctx.fillText("Stacks Dash", tx, 119 + ty);
  ctx.fillStyle = GOLD;
  ctx.font = "italic 16px Georgia, serif";
  ctx.fillText("Run, jump and duck through the library!", tx, 147 + ty);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  drawButtons();

  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 6;
  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.font = "13px Georgia, serif";
  ctx.fillText(
    tall()
      ? "Tap a button to choose"
      : "← → to choose · Enter or Space to select",
    tx,
    tall() ? 538 : 244,
  );
  ctx.fillStyle = GOLD;
  ctx.font = "bold 15px Georgia, serif";
  const who = "Playing as " + CHARACTERS[charIndex].name;
  ctx.fillText(
    best > 0 ? `${who} · Your best: ${best} pages` : who,
    tx,
    tall() ? 566 : 268,
  );
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
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
    { x: x - 22, y: y - 14, w: 44, h: 22, color: SPINES[3], phase: 0 },
    false,
  );
}
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
    // on the Characters screen the arrows flip through the characters
    if (state === "chars" && moveKeys.includes(e.code)) {
      e.preventDefault();
      pickCharacter(charIndex + (back ? -1 : 1));
      return;
    }
    if (moveKeys.includes(e.code)) {
      e.preventDefault();
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
    ((e.clientY - rect.top) / rect.height) * H,
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

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const [cx, cy] = toCanvas(e);
  if (inside(cx, cy, MUTE_BTN)) return toggleMute();
  if (isMenu()) {
    if (state === "ready" && inside(cx, cy, PROFILE)) return choose("chars"); // tap your profile to change it
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
  const [cx, cy] = toCanvas(e);
  const i = BUTTONS[state].findIndex((b) => inside(cx, cy, b));
  if (i >= 0) selected[state] = i;
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

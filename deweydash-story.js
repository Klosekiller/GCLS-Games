// Dewey Dash: Story Mode, "Dewey's Due Date".
//
// Loaded after deweydash.js (see data-scripts in game.html), and built on it: its drawing helpers,
// scenes, player and run. deweydash.js calls into this file through a few hooks (storyChoose,
// drawStoryBackground, storyFinishing and so on), only while a story level is being played
// (`story` is set) or on Story Mode's own screens: "levels" (the list of levels), "book" (a
// picture book between levels) and "cleared" (a level's results).
//
// The story: Dewey, an adult nonfiction book who lives upstairs at Hughes Main Library, is brought
// back a few days early. On his way home his tired binding gives way and his pages scatter, and some
// end up in the courier bins bound for every branch. He has until his due date (story only: nothing
// times the player) to get them all back. The story is told in chapters, one per library, each a
// few levels long: Chapter 1 is Hughes Main, downstairs and outside; each branch will be a chapter
// of its own.
//
// Only a library's public areas are ever shown. Staff windows and doors appear only closed and
// frosted. The places are drawn from photos of the real branches (kept in reference/, not part of
// the site), with made-up art in place of anyone else's artwork, branding or real people.

// ---------- Saved progress ----------
const STORY_KEY = "deweydash-story"; // { unlocked: the furthest level you can play, stars: { "1-A": 3, … } }
// (stars are kept under each level's id, which never changes, whatever the level is called on screen)
const progress = (() => {
  try {
    const p = JSON.parse(safeGet(STORY_KEY) || "{}");
    return {
      unlocked: Math.max(0, p.unlocked | 0),
      stars: p.stars && typeof p.stars === "object" ? p.stars : {},
    };
  } catch {
    return { unlocked: 0, stars: {} };
  }
})();
function saveProgress() {
  safeSet(STORY_KEY, JSON.stringify(progress));
}

// ---------- The levels ----------
// Each level is a run through a fixed series of scenes, start to finish ([draw, width] each; the
// scenery scrolls at BG_PARALLAX of the floor's speed, so 1000 px of scene is about 11 seconds).
// `features`: the hazards it has, and how many ms in each one starts (see FEATURES in deweydash.js).
// `chances`: how often some of them turn up, if not the usual. `goal`: what happens at the end,
// once the library stops scrolling and the book runs on to it: "stop" (stops there), "enter" (goes
// in through a door) or "hop" (jumps aboard). `intro` / `outro`: picture books (see BOOKS).
// `id`: the level's name inside the game (for saved stars: never change it). `chapter` and `num`:
// what players see, "Chapter 1, Level 2" (the levels are numbered within their chapter).
const GOAL_FROM_RIGHT = 190; // the goal's distance from the right edge of the screen at the end
const LEVELS = [
  {
    id: "1-A",
    chapter: 1,
    num: 1,
    name: "Down the Long Aisle",
    place: "Hughes Main Library",
    scenes: [
      [sceneAisleStacks, 1000],
      [sceneAisleWall, 900],
      [scenePictureBooks, 1000],
      [sceneKids, 1000],
      [sceneKidsDesk, 1000],
      [sceneKidsComputers, 1000],
      [scenePAL, 900],
    ],
    features: { double: 16000, flyer: 26000 }, // flying books once he reaches the children's wing
    chances: { flyer: 0.28 },
    goal: "stop",
    intro: "prologue",
  },
  {
    id: "1-B",
    chapter: 1,
    num: 2,
    name: "Chasing the Cart",
    place: "Hughes Main Library",
    scenes: [
      [sceneDesk, 1000],
      [sceneBookDrop, 900],
      [sceneFriendsShop, 1000],
      [sceneLobby, 900],
      [sceneGlobeDoor, 900],
    ],
    features: { double: 0, flyer: 0, wet: 10000, swoop: 18000, tunnel: 26000 },
    chances: { flyer: 0.3, wet: 0.14, tunnel: 0.14 },
    goal: "enter",
    intro: "chase",
  },
  {
    id: "1-C",
    chapter: 1,
    num: 3,
    name: "Out the Door",
    place: "Hughes Main Library",
    outdoor: true, // hedges, birds and sprinklers instead of books (see storyDrawObstacle)
    scenes: [
      [sceneOutsideDoor, 900],
      [sceneRotunda, 1200],
      [sceneSculpture, 900],
      [sceneDrive, 900],
      [sceneBookmobileStop, 900],
    ],
    features: { flyer: 0, double: 6000, wet: 9000, dart: 16000, swoop: 24000 },
    chances: { flyer: 0.35, wet: 0.18 },
    goal: "hop",
    intro: "outside",
    outro: "bookmobile",
  },
];
// What players see a level called: "Level 2", "Chapter 1, Level 2", or for tight spots "1-2".
const levelName = (lv) => `Level ${lv.num}`,
  chapterLevelName = (lv) => `Chapter ${lv.chapter}, Level ${lv.num}`,
  levelShortName = (lv) => `${lv.chapter}-${lv.num}`;
const DEWEY = Math.max(0, CHARACTERS.findIndex((c) => c.name === "Dewey")); // Story Mode's hero

// ---------- Playing a level ----------
let storyCharSaved = null; // the character picked for Endless Mode, while Story Mode plays as Dewey
function useDewey() {
  if (storyCharSaved !== null) return;
  storyCharSaved = charIndex;
  charIndex = DEWEY;
}
// Out of Story Mode (to the level list, the start screen or Endless Mode).
function leaveStory() {
  story = null;
  if (storyCharSaved === null) return;
  charIndex = storyCharSaved;
  storyCharSaved = null;
}

// Called with the screen black: set up level i and start its countdown.
function beginLevel(i) {
  book = null;
  reset();
  const level = LEVELS[i];
  const length = level.scenes.reduce((s, [, w]) => s + w, 0);
  story = {
    level,
    index: i,
    end: length - W, // the scenery's scroll when the last scene fills the screen (the end)
    pagesThere: 0, // pages put out to find (counted in addPickup), for the stars
    finishing: null, // the run on to the goal at the end: { t, hopped, arrivedAt }
    hidden: false, // gone in through the door / aboard the Bookmobile
    result: null,
  };
  useDewey();
  distance = 0; // (the scenery starts at the first scene)
  state = "countdown";
  countTime = 0;
  countShown = 0;
}
// How far through the level the book is, 0 … 1.
function storyProgress() {
  return story ? Math.min(1, (distance * BG_PARALLAX) / story.end) : 0;
}
// Close enough to the end that nothing new should come (so it's all gone by the time it stops).
function storyNearEnd() {
  return (story.end - distance * BG_PARALLAX) / BG_PARALLAX < W + 520;
}
// Reached the end: the library stops scrolling, and the book runs on to the goal by itself.
function storyCheckEnd() {
  if (story.finishing || distance * BG_PARALLAX < story.end) return;
  distance = story.end / BG_PARALLAX;
  story.finishing = { t: 0, hopped: false, arrivedAt: 0 };
  obstacles = obstacles.filter((o) => o.x + o.w < player.x); // (anything left ahead is cleared away)
  power = null;
  boost = 1;
  slipTime = 0;
}
const FINISH_RUN = 0.22; // px per ms: the book's pace running on to the goal
const ARRIVE_MS = 900; // at the goal for this long before the results (long enough for a hop to land)
function storyFinishing(dt) {
  const f = story.finishing;
  if (!f) return false;
  f.t += dt;
  runTime += dt; // (keeps the legs running)
  speed = 0;
  duckHeld = false;
  updatePlayer(dt);
  updatePickups(dt);
  updateParticles(dt);
  if (hurtTime > 0) hurtTime -= dt;
  const goal = W - GOAL_FROM_RIGHT,
    kind = story.level.goal;
  if (!f.arrivedAt) {
    player.x += FINISH_RUN * dt;
    if (kind === "hop" && !f.hopped && player.onGround && player.x + player.w / 2 > goal - 110) {
      f.hopped = true;
      jump(); // up into the Bookmobile's door
    }
    if (player.x + player.w / 2 >= goal) {
      f.arrivedAt = f.t;
      if (kind === "stop") jump(); // a happy little hop
      else {
        story.hidden = true;
        burst(goal, player.y + player.h / 2, 14, GOLD, 4);
      }
      sfx.bookmark();
    }
  } else if (f.t - f.arrivedAt > ARRIVE_MS) levelCleared();
  return true;
}

// ---------- A level's results ----------
let clearedTime = 0; // ms the results card has been up
const CLEARED_GRACE_MS = 900; // its buttons work after this (once the stars have popped in)
function levelCleared() {
  const id = story.level.id;
  const found = story.pagesThere ? Math.min(1, pages / story.pagesThere) : 1;
  const stars = 1 + (found >= 0.5) + (found >= 0.8); // finishing is a star; half the pages, two; most of them, three
  const before = progress.stars[id] || 0;
  story.result = { stars, found, newBest: stars > before };
  progress.stars[id] = Math.max(stars, before);
  progress.unlocked = Math.max(progress.unlocked, Math.min(story.index + 1, LEVELS.length - 1));
  saveProgress();
  state = "cleared";
  clearedTime = 0;
  selected.cleared = 0;
  [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, i === 4 ? 0.45 : 0.16, "triangle", 0.11, i * 0.11)); // ta-da
}
function updateCleared(dt) {
  clearedTime += dt;
  runTime += dt;
  updateParticles(dt);
  // a little shower of gold as each star lands
  if (story && story.result)
    for (let i = 0; i < story.result.stars; i++) {
      const at = 420 + i * 240;
      if (clearedTime >= at && clearedTime - dt < at) {
        tone(880 + i * 220, 1320 + i * 220, 0.1, "sine", 0.08);
      }
    }
}

// ---------- Choices (called from choose() in deweydash.js) ----------
function storyChoose(id) {
  if (id === "endless") {
    leaveStory();
    startRun();
    return true;
  }
  if (id === "story") {
    openLevels();
    return true;
  }
  if (state === "levels") {
    if (id === "home") {
      state = "ready";
      if (!keyNav) selected.ready = READY_PLAY;
      return true;
    }
    if (id.startsWith("level-")) {
      pickLevel(Number(id.slice(6)));
      return true;
    }
  }
  if (state === "cleared") {
    if (clearedTime < CLEARED_GRACE_MS) return true;
    if (id === "continue") continueStory();
    else if (id === "replay") playLevel(story.index, false);
    else if (id === "map") toLevels();
    return true;
  }
  if (story && id === "again") {
    playLevel(story.index, false); // Try again: straight back in, no picture book
    return true;
  }
  if (story && (id === "menu" || id === "quit")) {
    toLevels();
    return true;
  }
  return false;
}
// Esc on Story Mode's screens.
function storyGoBack() {
  if (state === "levels") {
    storyChoose("home");
    return true;
  }
  if (state === "cleared") {
    if (clearedTime >= CLEARED_GRACE_MS) toLevels();
    return true;
  }
  return false;
}
function openLevels() {
  state = "levels";
  selected.levels = Math.min(progress.unlocked, LEVELS.length - 1); // the furthest level you can play
}
// To the level list, through the iris.
function toLevels() {
  fadeTo(() => {
    leaveStory();
    reset();
    openLevels();
  });
}
let lockedShake = null; // { i, at }: a locked level's tile, shaking its head
function pickLevel(i) {
  if (i > progress.unlocked) {
    lockedShake = { i, at: runTime };
    tone(220, 150, 0.14, "square", 0.05);
    return;
  }
  playLevel(i, true);
}
// Play level i, with its picture book first if it has one (and withIntro).
function playLevel(i, withIntro) {
  const lv = LEVELS[i];
  if (withIntro && lv.intro) fadeTo(() => openBook([lv.intro], () => beginLevel(i)));
  else fadeTo(() => beginLevel(i));
}
// Continue from a level's results: its outro and the next level's intro, then the next level
// (or back to the list after the last one).
function continueStory() {
  const ni = story.index + 1,
    next = LEVELS[ni];
  const books = [story.level.outro, next && next.intro].filter(Boolean);
  const then = next
    ? () => beginLevel(ni)
    : () => {
        leaveStory();
        reset();
        openLevels();
      };
  fadeTo(books.length ? () => openBook(books, then, !!next) : then);
}

// ---------- The level list ----------
// One tile per level (added to the "levels" screen's buttons, before its Back button).
function storyButtons() {
  const tiles = LEVELS.map((lv, i) => ({ id: "level-" + i, label: chapterLevelName(lv), tile: i, ...levelTileRect(i) }));
  BUTTONS.levels = [...tiles, ...BUTTONS.levels];
}
function levelTileRect(i) {
  if (tall()) return { x: W / 2 - 150, y: 152 + i * 104, w: 300, h: 92 };
  const tw = 178,
    gap = 16,
    total = LEVELS.length * tw + (LEVELS.length - 1) * gap;
  return { x: W / 2 - total / 2 + i * (tw + gap), y: 108, w: tw, h: 122 };
}
function drawLevels() {
  dimBehindCard();
  const pw = tall() ? 420 : 640,
    ph = tall() ? 528 : 296,
    px = W / 2 - pw / 2,
    py = tall() ? 36 : 12;
  drawCard(px, py, pw, ph, "Dewey's Due Date");
  ctx.textAlign = "center";
  ctx.fillStyle = INK_SOFT;
  ctx.font = "italic 14px Georgia, serif";
  const lv = LEVELS[Math.min(selected.levels, LEVELS.length - 1)] || LEVELS[0]; // (the highlighted level's chapter)
  ctx.fillText(`Chapter ${lv.chapter} · ${lv.place}`, W / 2, py + (tall() ? 84 : 78));
  drawButtons();
  if (!tall()) hint("Tab or ← → to choose · Enter to play · Esc to go back", py + ph - 6);
}
// A five-pointed star centered on (cx, cy).
function starShape(cx, cy, r, color) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      rr = i % 2 ? r * 0.45 : r;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  poly(color, ...pts);
}
function starRow(cx, cy, r, n, on, off) {
  for (let i = 0; i < 3; i++) starShape(cx + (i - 1) * r * 2.3, cy, r, i < n ? on : off);
}
function padlock(cx, cy, s, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 * s;
  ctx.beginPath();
  ctx.arc(cx, cy - 3 * s, 5 * s, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = color;
  roundRect(cx - 8 * s, cy - 3 * s, 16 * s, 12 * s, 2.5 * s);
}
function drawLevelTile(b, on) {
  const i = b.tile,
    lv = LEVELS[i],
    locked = i > progress.unlocked,
    stars = progress.stars[lv.id] || 0;
  let x = b.x;
  if (lockedShake && lockedShake.i === i) {
    const t = runTime - lockedShake.at;
    if (t < 350) x += Math.sin(t * 0.09) * 5 * (1 - t / 350);
    else lockedShake = null;
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  roundRect(x + 2, b.y + 3, b.w, b.h, 12);
  ctx.fillStyle = locked ? "#857c6f" : on ? MAPLE : NAVY;
  roundRect(x, b.y, b.w, b.h, 12);
  ctx.strokeStyle = on ? PAPER : locked ? "#a59b8b" : GOLD;
  ctx.lineWidth = on ? 2 : 1.5;
  ctx.stroke();
  const ink = locked ? "#d8d0c2" : on ? "#fff" : PAPER;
  ctx.textAlign = "center";
  if (tall()) {
    // the level's number on the left (under a small "LEVEL"), name and stars on the right
    ctx.fillStyle = ink;
    ctx.font = "bold 11px Georgia, serif";
    ctx.fillText("LEVEL", x + 50, b.y + 30);
    ctx.font = "bold 36px Georgia, serif";
    ctx.fillText(String(lv.num), x + 50, b.y + 68);
    ctx.textAlign = "left";
    ctx.font = "bold 16px Georgia, serif";
    ctx.fillText(lv.name, x + 100, b.y + 38);
    if (locked) {
      padlock(x + 112, b.y + 62, 0.9, ink);
      ctx.font = "14px Georgia, serif";
      ctx.fillText("Locked", x + 128, b.y + 68);
    } else starRow(x + 128, b.y + 63, 10, stars, GOLD, "rgba(255, 255, 255, 0.22)");
    return;
  }
  ctx.fillStyle = ink;
  ctx.font = "bold 28px Georgia, serif";
  ctx.fillText(levelName(lv), x + b.w / 2, b.y + 40);
  ctx.font = "bold 14px Georgia, serif";
  ctx.fillText(lv.name, x + b.w / 2, b.y + 66);
  if (locked) {
    padlock(x + b.w / 2 - 26, b.y + 96, 0.9, ink);
    ctx.font = "14px Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillText("Locked", x + b.w / 2 - 12, b.y + 102);
  } else starRow(x + b.w / 2, b.y + 96, 11, stars, GOLD, "rgba(255, 255, 255, 0.22)");
}

// ---------- During a level ----------
// The score bar's right half: the level, and a bar for how far through it the book is.
function drawStoryProgress(x, sy) {
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.font = "bold 16px Georgia, serif";
  ctx.fillText(levelShortName(story.level), x + 100, sy + 22); // (chapter-level, as "1-2")
  const bx = x + 146,
    bw = 186,
    by = sy + 12;
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  roundRect(bx, by, bw, 8, 4);
  ctx.fillStyle = PAPER;
  roundRect(bx, by, Math.max(8, bw * storyProgress()), 8, 4);
  // a little flag at the finish
  R(bx + bw + 3, by - 5, 2, 15, PAPER);
  poly(RIBBON_RED, bx + bw + 5, by - 5, bx + bw + 15, by - 1, bx + bw + 5, by + 3);
}
// The level's title as it begins, and its results when it's cleared.
function drawStoryOverlay() {
  if (state === "countdown" || (state === "running" && runTime < 1400)) drawLevelBanner();
  if (state === "cleared") drawCleared();
}
function drawLevelBanner() {
  const a =
    state === "countdown"
      ? Math.min(1, Math.max(0, (countTime - COUNT_START_MS + 300) / 300))
      : 1 - runTime / 1400;
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const y = tall() ? WORLD_Y - 14 : WORLD_Y + 76; // (under the score bar, above the countdown's numbers)
  const top = `${chapterLevelName(story.level)} · ${story.level.place}`.toUpperCase();
  ctx.font = "bold 13px Georgia, serif";
  const bw = Math.min(W - 16, Math.max(340, ctx.measureText(top).width + 36)); // (wide enough for the longer chapter names)
  ctx.fillStyle = "rgba(20, 14, 10, 0.72)";
  roundRect(W / 2 - bw / 2, y - 22, bw, 52, 10);
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.fillText(top, W / 2, y - 3);
  ctx.fillStyle = PAPER;
  ctx.font = "bold 19px Georgia, serif";
  ctx.fillText(story.level.name, W / 2, y + 20);
  ctx.restore();
}
function drawCleared() {
  const r = story.result,
    k = Math.min(1, clearedTime / 300);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(0, (1 - k) * 12);
  dimBehindCard();
  const pw = tall() ? 400 : 520,
    ph = tall() ? 470 : 266,
    px = W / 2 - pw / 2,
    py = tall() ? 86 : 22;
  drawCard(px, py, pw, ph, `${levelName(story.level)} complete!`);
  ctx.textAlign = "center";
  ctx.fillStyle = INK_SOFT;
  ctx.font = "italic 14px Georgia, serif";
  ctx.fillText(`Chapter ${story.level.chapter} · ${story.level.name}`, W / 2, py + 72);
  // the stars land one at a time
  const sy = py + (tall() ? 118 : 108);
  for (let i = 0; i < 3; i++) {
    const t = clearedTime - 420 - i * 240,
      on = i < r.stars;
    const pop = !on || t <= 0 ? 1 : t < 200 ? 1 + Math.sin((t / 200) * Math.PI) * 0.35 : 1;
    starShape(W / 2 + (i - 1) * 58, sy, 22 * pop, on && t > 0 ? GOLD : "rgba(58, 42, 30, 0.14)");
  }
  ctx.fillStyle = INK;
  ctx.font = "bold 17px Georgia, serif";
  ctx.fillText(`Pages found: ${pages} of ${story.pagesThere}`, W / 2, sy + (tall() ? 58 : 48));
  ctx.fillStyle = r.newBest ? CARD_RED : INK_SOFT;
  ctx.font = "bold 14px Georgia, serif";
  ctx.fillText(
    r.newBest ? "★ New best! ★" : `Best: ${"★".repeat(progress.stars[story.level.id])}`,
    W / 2,
    sy + (tall() ? 82 : 70),
  );
  if (clearedTime >= CLEARED_GRACE_MS * 0.6) drawButtons();
  ctx.restore();
}

// ---------- The scenery ----------
// A level's scenes in a row, start to finish (like drawBackground, which loops them for Endless).
function drawStoryBackground() {
  const lv = story.level,
    off = Math.min(distance * BG_PARALLAX, story.end);
  let sx = -off;
  const seams = [];
  for (const [scene, w] of lv.scenes) {
    if (sx < W && sx + w > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, -TOP, w, H + 2 * TOP);
      ctx.clip();
      scene(sx, w);
      ctx.restore();
      if (sx > -off) seams.push(sx);
    }
    sx += w;
  }
  // indoors, a pale column hides each seam between scenes (outdoors they run straight on)
  if (!lv.outdoor)
    for (const s of seams) {
      R(s - 13, 0, 26, FLOOR, "#d3d8de");
      R(s + 7, 0, 6, FLOOR, "#b9bfc7");
    }
  R(0, 0, W, FLOOR, lv.outdoor ? "rgba(20, 14, 10, 0.06)" : "rgba(20, 14, 10, 0.12)");
  R(0, FLOOR, W, 2, "rgba(0, 0, 0, 0.3)");
}

// Outdoors, the hazards are what you'd find on a library lawn.
function storyDrawObstacle(o) {
  if (!story.level.outdoor) return false;
  if (o.type === "stack") drawHedge(o);
  else if (o.type === "flyer") drawBird(o);
  else if (o.type === "sign") drawSprinkler(o);
  else return false;
  return true;
}
// A clipped hedge, in place of a stack of books.
// (Its leaves spill a little past its edges, so it reads as a bush, not a box.)
function drawHedge(o) {
  const { x, y, w, h } = o;
  oval(x + w / 2, FLOOR - 1, w * 0.7, 3.5, "rgba(0, 0, 0, 0.25)");
  ctx.fillStyle = "#3b7531";
  roundRect(x - 4, y + 4, w + 8, h - 4, Math.min(12, (w + 8) / 2.5));
  const seed = h | 0;
  for (let i = 0; i * 8 < w + 4; i++) oval(x - 1 + i * 8, y + 6 + hash(i, seed) * 3, 7, 6.5, "#4a8a3c");
  for (const sx of [x - 3, x + w + 3]) for (let j = 0; j * 10 < h - 12; j++) oval(sx, y + 14 + j * 10, 4, 5, "#3b7531");
  for (let i = 0; i < w / 6; i++)
    oval(x + 3 + hash(i, seed + 3) * (w - 6), y + 8 + hash(seed, i) * (h - 12), 2, 1.5, i % 2 ? "#5d9f47" : "#2f6227");
}
// A bird flying at you, in place of a flying book: a pigeon, or (like the books) a swooping robin,
// a darting blue jay, or a crow that shakes, squawks "!" and charges.
function drawBird(o) {
  const cx = o.x + o.w / 2,
    cy = o.y + o.h / 2;
  let shake = 0;
  if (o.charge) {
    const cs = chargeState(o);
    if (cs.winding) {
      shake = Math.sin(runTime * 0.09) * 2;
      label("!", cx, o.y - 8, 18, "#c0392b", "Georgia, serif");
    }
  }
  const [body, wing, head] = o.charge
    ? ["#2a2a31", "#1c1c22", "#2a2a31"]
    : o.dart
      ? ["#3a7bd5", "#2c5ea8", "#5b93e0"]
      : o.swoop
        ? ["#6b4f3a", "#523b2a", "#4a3626"]
        : ["#8c929b", "#6f747d", "#7d838c"];
  oval(cx, FLOOR - 1, 13, 3, "rgba(0, 0, 0, 0.16)");
  const flap = Math.sin(runTime * 0.028 + o.phase);
  ctx.save();
  ctx.translate(cx + shake, cy);
  poly(wing, -2, -2, 8, -2, 3, -2 - 13 * flap); // the far wing
  poly(body, 10, -2, 21, -7, 21, 3); // tail
  oval(0, 0, 13, 7.5, body);
  if (o.swoop) oval(-5, 2, 7, 4.5, "#e07b39"); // a robin's red breast
  if (!o.charge && !o.dart && !o.swoop) oval(-9, -1, 4, 3, "#6fa58f"); // a pigeon's shimmery neck
  oval(-11, -4, 6, 5.5, head);
  poly("#e3a33a", -16, -5, -22, -3, -16, -2); // beak
  oval(-12, -5, 1.4, 1.4, "#111");
  poly(wing, -3, -1, 9, -1, 4, -1 - 15 * flap); // the near wing
  ctx.restore();
}
// A lawn sprinkler, in place of a wet floor sign (its puddles come after, as usual).
function drawSprinkler(o) {
  const { x, y, w } = o,
    cx = x + w / 2;
  ctx.fillStyle = "rgba(160, 210, 240, 0.28)";
  ctx.beginPath();
  ctx.moveTo(cx, FLOOR - 8);
  ctx.lineTo(x - 2, y + 6);
  ctx.quadraticCurveTo(cx, y - 8, x + w + 2, y + 6);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 14; i++) {
    const p = ((runTime * 0.0016 + i / 14) % 1) * 1, // 0 → 1 along its arc
      side = i % 2 ? 1 : -1,
      spread = 0.35 + (i % 7) * 0.1;
    const dx = side * spread * 26 * p,
      dy = -60 * p + 50 * p * p;
    oval(cx + dx, FLOOR - 10 + dy, 1.6, 2.2, "rgba(210, 236, 252, 0.9)");
  }
  R(cx - 3, FLOOR - 9, 6, 9, "#4f555c");
  oval(cx, FLOOR - 10, 4.5, 2, "#7b828a");
}

// ---------- Scenes: Hughes Main, downstairs ----------
// Long light strips across a bright ceiling.
function lightStrips(x, w, y) {
  for (let lx = x + 30; lx < x + w; lx += 190) {
    R(lx, y, 130, 6, "#fffef4");
    R(lx, y + 6, 130, 2, "#dcdad3");
  }
}
// The long main aisle, stacks side: maple end panels, each row's shelves full of books.
function sceneAisleStacks(x, w) {
  R(x, 0, w, CEIL, "#f3f2ee");
  lightStrips(x, w, 16);
  R(x, CEIL - 3, w, 3, "#dedcd5");
  R(x, CEIL, w, FLOOR - CEIL, "#e9e7e1");
  carpet(x, w, "#b8ac8e", "#a19575");
  const top = CEIL + 14;
  for (let k = 0, rx = x + 18; rx < x + w; k++, rx += 126) {
    // the row's shelves, seen past its end
    const sx = rx + 26,
      sw = 100;
    R(sx, top + 4, sw, FLOOR - top - 4, "#585c64");
    for (let r = 0; r < 4; r++) {
      const base = top + 50 + r * 46; // where this shelf's books stand
      let bx = sx + 3;
      for (let b = 0; bx < sx + sw - 8; b++) {
        const rnd = hash(k * 31 + r, b),
          bw = 4 + rnd * 5,
          bh = 24 + hash(b, k + r * 7) * 14;
        R(bx, base - bh, bw, bh, SPINES[(rnd * SPINES.length) | 0]);
        bx += bw + (rnd > 0.88 ? 5 : 1);
      }
      R(sx, base, sw, 3, "#9aa1aa");
    }
    R(sx, top + 4, sw, FLOOR - top - 4, "rgba(20, 16, 12, 0.16)");
    // the maple end panel, with its little range sign
    R(rx, top, 26, FLOOR - top, "#c98b4c");
    R(rx + 20, top, 6, FLOOR - top, "#a86f37");
    R(rx - 1, top - 3, 28, 4, "#ddaa6b");
    R(rx + 5, top + 52, 14, 11, "#eef1f3");
    R(rx + 7, top + 55, 10, 1.5, "#8a9097");
    R(rx + 7, top + 58, 7, 1.5, "#8a9097");
    // a catalog computer on a maple stand at some of the ends
    if (k % 3 === 1) {
      R(rx - 8, FLOOR - 56, 40, 56, MAPLE);
      R(rx - 10, FLOOR - 60, 44, 5, "#e3b06a");
      poly("#1d1d20", rx - 2, FLOOR - 62, rx + 26, FLOOR - 62, rx + 30, FLOOR - 84, rx + 2, FLOOR - 84);
      poly("#7fb3d9", rx + 1, FLOOR - 65, rx + 24, FLOOR - 65, rx + 27, FLOOR - 81, rx + 4, FLOOR - 81);
    }
  }
  drawShelvingCart(x + 600, FLOOR, 0.9);
  // a steel trash can
  const tg = ctx.createLinearGradient(x + 300, 0, x + 322, 0);
  tg.addColorStop(0, "#d7dbdf");
  tg.addColorStop(1, "#8f959b");
  ctx.fillStyle = tg;
  ctx.fillRect(x + 300, FLOOR - 40, 22, 40);
  R(x + 298, FLOOR - 42, 26, 4, "#a7adb3");
}
// A black two-shelf book cart (feet at floorY).
function drawShelvingCart(cx, floorY, s = 1) {
  const w = 60 * s,
    h = 70 * s,
    x = cx - w / 2,
    y = floorY - h;
  R(x, y, 4 * s, h - 6 * s, "#2a2a2e");
  R(x + w - 4 * s, y, 4 * s, h - 6 * s, "#2a2a2e");
  for (const sy of [y + 22 * s, y + h - 14 * s]) {
    R(x, sy, w, 4 * s, "#1f1f22");
    for (let i = 0; i < 6; i++) R(x + 6 * s + i * 8 * s, sy - 18 * s + (i % 2) * 3 * s, 6 * s, (18 - (i % 2) * 3) * s, SPINES[(i * 3 + 1) % SPINES.length]);
  }
  for (const wx of [x + 6 * s, x + w - 6 * s]) oval(wx, floorY - 4 * s, 4 * s, 4 * s, "#111");
}
// The long main aisle, wall side: the navy wall with the elevator and restrooms, maple study carrels.
function sceneAisleWall(x, w) {
  R(x, 0, w, CEIL, "#efede8");
  R(x, CEIL - 24, w, 24, "#dcd9d2");
  recessedLights(x, w, CEIL - 12, 100);
  R(x, CEIL, w, FLOOR - CEIL, "#3b4858");
  carpet(x, w, "#b8ac8e", "#a19575");
  // restrooms (doors closed)
  for (const dx of [x + 90, x + 200]) {
    R(dx, CEIL + 54, 74, FLOOR - CEIL - 54, "#232b35");
    R(dx + 6, CEIL + 60, 62, FLOOR - CEIL - 60, "#2e3946");
    R(dx + 54, FLOOR - 100, 4, 18, "#b9bec4");
    R(dx + 27, CEIL + 76, 20, 20, "#e6e9ec");
    oval(dx + 37, CEIL + 81, 2.5, 2.5, "#2e3946");
    R(dx + 35, CEIL + 84, 4, 9, "#2e3946");
  }
  // the elevator
  const ex = x + 430;
  R(ex - 6, CEIL + 16, 104, 22, "#c9ced3");
  label("ELEVATOR", ex + 46, CEIL + 31, 12, "#2a2f36");
  oval(ex + 46, CEIL + 8, 9, 9, "#c9ced3");
  oval(ex + 46, CEIL + 8, 6, 6, "#eef1f3");
  R(ex, CEIL + 46, 92, FLOOR - CEIL - 46, "#1c222a");
  R(ex + 6, CEIL + 52, 39, FLOOR - CEIL - 52, "#c3c9cf");
  R(ex + 47, CEIL + 52, 39, FLOOR - CEIL - 52, "#b6bcc2");
  R(ex + 45, CEIL + 52, 2, FLOOR - CEIL - 52, "#8e959c");
  R(ex + 102, FLOOR - 118, 10, 22, "#c9ced3");
  oval(ex + 107, FLOOR - 112, 2.5, 2.5, "#f4f4f4");
  oval(ex + 107, FLOOR - 102, 2.5, 2.5, "#f4f4f4");
  // maple study carrels
  for (const cx of [x + 620, x + 750]) {
    R(cx, FLOOR - 84, 110, 84, MAPLE);
    R(cx - 3, FLOOR - 88, 116, 5, "#e3b06a");
    R(cx + 8, FLOOR - 74, 94, 34, "#c99350");
    R(cx + 54, FLOOR - 74, 2, 74, "#b98340");
  }
  oval(x + 590, FLOOR - 14, 14, 4, "#d9a560"); // a round maple stool
  R(x + 576, FLOOR - 14, 28, 14, "#cf9a55");
}
// Where the long aisle opens into the children's wing: the giraffe, then the picture-book corner
// (armchairs around a book table, low red shelves, framed illustrations, big bright windows).
function scenePictureBooks(x, w) {
  R(x, 0, w, CEIL, "#f4f3ef");
  for (let i = 0; i * 64 < w; i++) R(x + i * 64, 0, 1, CEIL, "#e3e0d8");
  R(x, 32, w, 1, "#e3e0d8");
  R(x, CEIL, w, FLOOR - CEIL, "#e2e7ed");
  // big windows onto the trees
  for (const off of [590, 790]) {
    const wx = x + off;
    R(wx, CEIL + 10, 180, FLOOR - CEIL - 60, "#cfd6dc");
    R(wx + 6, CEIL + 16, 168, FLOOR - CEIL - 72, "#bfe0c9");
    // (seeded by the window's spot in the scene, not on the screen, so the trees hold still)
    for (let i = 0; i < 6; i++) oval(wx + 20 + i * 28, CEIL + 60 + hash(i, off) * 40, 26, 22, i % 2 ? "#7fb26a" : "#93c27c");
    R(wx + 88, CEIL + 16, 4, FLOOR - CEIL - 72, "#cfd6dc");
  }
  // a feature wall with three framed illustrations
  R(x + 300, CEIL, 250, FLOOR - CEIL, "#edf0f4");
  const pastel = [["#bfe1f2", "#7fb86a"], ["#f3d9b5", "#c98a6a"], ["#2d3d78", "#f2d36b"]];
  pastel.forEach(([sky, fg], i) => {
    const fx = x + 316 + i * 76;
    R(fx, CEIL + 46, 64, 80, "#f8f9fb");
    R(fx + 5, CEIL + 51, 54, 70, sky);
    oval(fx + 32, CEIL + 104, 22, 14, fg);
    oval(fx + 18 + i * 8, CEIL + 70, 6, 6, i === 2 ? "#f2d36b" : "#ffffff");
  });
  // disc pendant lights
  for (let lx = x + 140; lx < x + w; lx += 220) {
    R(lx - 1, 0, 2, 40, "#cfd3d6");
    oval(lx, 44, 30, 6, "#d6dadd");
    oval(lx, 45, 17, 3, "#fff6dc");
  }
  carpet(x, w, "#9c8a6c", "#84735a");
  drawGiraffe(x + 110, FLOOR);
  // low picture-book shelves, red at the ends, with books standing face-out on top
  // (each shelf's books are picked by its spot in the scene, off, not on the screen, which
  // changes every frame as the library scrolls: that made the books flicker)
  for (const [off, sw] of [[200, 110], [580, 150], [780, 160]]) {
    const sx = x + off;
    shelfUnit(sx, FLOOR - 66, sw, 66, 2, off);
    R(sx - 6, FLOOR - 70, 7, 70, "#c62a2f");
    R(sx + sw - 1, FLOOR - 70, 7, 70, "#c62a2f");
    for (let i = 0; 8 + i * 22 < sw; i++) R(sx + 6 + i * 22, FLOOR - 92, 16, 22, BRIGHT[(i * 3 + off) % BRIGHT.length]);
  }
  // blue armchairs around an octagonal maple book table
  for (const ax of [x + 330, x + 488]) {
    ctx.fillStyle = "#4d6d85";
    roundRect(ax, FLOOR - 60, 62, 36, 8);
    ctx.fillStyle = "#5b7d96";
    roundRect(ax - 4, FLOOR - 32, 70, 26, 7);
    R(ax + 4, FLOOR - 6, 3, 6, "#666");
    R(ax + 55, FLOOR - 6, 3, 6, "#666");
  }
  poly("#d29a55", x + 410, FLOOR - 58, x + 470, FLOOR - 58, x + 480, FLOOR - 44, x + 480, FLOOR, x + 400, FLOOR, x + 400, FLOOR - 44);
  R(x + 400, FLOOR - 44, 80, 3, "#b98340");
  for (let i = 0; i < 4; i++) R(x + 412 + i * 16, FLOOR - 72 + (i % 2) * 4, 11, 14 - (i % 2) * 4, BRIGHT[(i * 2 + 1) % BRIGHT.length]);
}
// The tall giraffe statue by the children's wing (feet at floorY).
function drawGiraffe(cx, floorY) {
  R(cx - 30, floorY - 12, 60, 12, "#b98340");
  R(cx - 32, floorY - 14, 64, 4, "#d29a55");
  const legTop = floorY - 112;
  for (const lx of [-22, -10, 10, 20]) {
    R(cx + lx, legTop, 7, 100, "#cdb88c");
    R(cx + lx, floorY - 22, 7, 8, "#3a2f28");
  }
  poly("#cdb88c", cx + 14, legTop - 14, cx + 26, legTop - 8, cx + 52, floorY - 200, cx + 40, floorY - 204);
  oval(cx, legTop - 6, 34, 20, "#cdb88c");
  poly("#cdb88c", cx - 32, legTop - 8, cx - 44, legTop + 16, cx - 41, legTop + 17); // tail
  ctx.save();
  ctx.translate(cx + 50, floorY - 206);
  ctx.rotate(0.35);
  oval(0, 0, 15, 8, "#cdb88c");
  oval(10, 2, 6, 5, "#bca57a");
  R(-6, -16, 3, 10, "#cdb88c");
  R(-1, -17, 3, 10, "#cdb88c");
  oval(-4.5, -16, 3, 3, "#3a2f28");
  oval(0.5, -17, 3, 3, "#3a2f28");
  oval(-12, -5, 6, 3, "#cdb88c");
  oval(2, -2, 2, 2, "#1b1512");
  ctx.restore();
  // its patches
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, legTop - 6, 33, 19, 0, 0, Math.PI * 2);
  ctx.moveTo(cx + 14, legTop - 14);
  ctx.lineTo(cx + 26, legTop - 8);
  ctx.lineTo(cx + 52, floorY - 200);
  ctx.lineTo(cx + 40, floorY - 204);
  ctx.closePath();
  ctx.clip();
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const px = i < 14 ? cx - 28 + hash(i, 4) * 56 : cx + 18 + (t - 0.5) * 60 + hash(i, 2) * 6,
      py = i < 14 ? legTop - 22 + hash(4, i) * 32 : legTop - 12 - (t - 0.54) * 190;
    oval(px, py, 5 + hash(i, 9) * 3, 4 + hash(9, i) * 2, "#6b4a33");
  }
  ctx.restore();
}
// The children's help desk, with the giant stuffed animals on the shelves under the ceiling waves.
// The dark ceiling over the children's wing, with its rows of light panels.
function kidsCeiling(x, w) {
  R(x, 0, w, CEIL, "#2b2b30");
  for (let i = 0; i * 120 < w; i++) {
    R(x + 20 + i * 120, 8, 64, 9, "#f1eee4");
    R(x + 80 + i * 120, 34, 50, 8, "#dedbd2");
  }
}
function sceneKidsDesk(x, w) {
  kidsCeiling(x, w);
  ribbon(x, w, 30, 10, 13, 1.0, RIBBON_YELLOW);
  ribbon(x, w, 18, 8, 26, 2.4, RIBBON_RED);
  R(x, CEIL, w, FLOOR - CEIL, "#bdc0c6");
  // red column
  R(x + 340, CEIL, 38, FLOOR - CEIL, "#c62a2f");
  R(x + 368, CEIL, 10, FLOOR - CEIL, "#a31f24");
  carpet(x, w, "#b3b0a8", "#9a978f");
  // shelves, red at the ends, and their stuffed animals
  for (const [sx, seed] of [[x + 24, 11], [x + 184, 12]]) {
    shelfUnit(sx, FLOOR - 92, 132, 92, 3, seed);
    R(sx - 6, FLOOR - 96, 8, 96, "#c62a2f");
    R(sx + 130, FLOOR - 96, 8, 96, "#c62a2f");
  }
  // a big white horse in a sailor hat
  const hx = x + 92,
    top = FLOOR - 96;
  oval(hx, top - 14, 30, 15, "#f4f1ea");
  oval(hx - 22, top - 4, 9, 5, "#5a4231");
  oval(hx + 14, top - 3, 9, 5, "#5a4231");
  R(hx - 14, top - 28, 26, 10, "#2f3c4f"); // its saddle blanket
  oval(hx + 30, top - 34, 11, 15, "#f4f1ea");
  oval(hx + 36, top - 24, 8, 7, "#efe9df");
  R(hx + 26, top - 30, 18, 2.5, "#222"); // the bridle
  oval(hx + 30, top - 50, 13, 5, "#ffffff"); // the hat's brim
  R(hx + 23, top - 58, 14, 9, "#ffffff");
  oval(hx + 33, top - 37, 1.8, 1.8, "#222");
  // a husky
  const dx = x + 250;
  oval(dx, top - 16, 18, 16, "#8b9097");
  oval(dx + 4, top - 10, 12, 11, "#f2f2f2");
  oval(dx + 8, top - 36, 13, 12, "#8b9097");
  oval(dx + 14, top - 32, 8, 7, "#f2f2f2");
  poly("#8b9097", dx, top - 44, dx + 3, top - 56, dx + 8, top - 45);
  poly("#8b9097", dx + 10, top - 46, dx + 15, top - 57, dx + 18, top - 45);
  oval(dx + 20, top - 32, 2.5, 2, "#222");
  oval(dx + 12, top - 38, 1.6, 1.6, "#222");
  R(dx - 4, top - 24, 20, 3, "#c0392b"); // collar
  // behind the desk: a clock, a TV, and the workroom's frosted, decorated windows
  oval(x + 455, CEIL + 30, 15, 15, "#e9eaec");
  oval(x + 455, CEIL + 30, 12, 12, "#ffffff");
  R(x + 454, CEIL + 21, 2, 10, "#222");
  R(x + 455, CEIL + 29, 7, 2, "#222");
  R(x + 640, CEIL + 10, 130, 70, "#121214");
  const tv = ctx.createLinearGradient(x + 644, 0, x + 766, 0);
  tv.addColorStop(0, "#f7f7fb");
  tv.addColorStop(1, "#e7e2f4");
  ctx.fillStyle = tv;
  ctx.fillRect(x + 644, CEIL + 14, 122, 62);
  oval(x + 735, CEIL + 46, 18, 22, "#e0488f");
  R(x + 654, CEIL + 26, 52, 6, "#5a4bd1");
  R(x + 654, CEIL + 38, 40, 4, "#9aa0b4");
  R(x + 520, CEIL + 96, 300, 66, "#8792a0");
  for (let k = 0; k < 4; k++) {
    const wx = x + 526 + k * 74;
    R(wx, CEIL + 102, 68, 54, "#e8ecf0");
    for (let p = 0; p < 2; p++) sparkle(wx + 18 + p * 30, CEIL + 120 + p * 12, 7, COLORFUL[(k * 2 + p) % COLORFUL.length]);
  }
  // the desk
  R(x + 470, FLOOR - 72, 380, 72, MAPLE);
  R(x + 466, FLOOR - 78, 388, 7, "#3a3d42");
  for (let px = x + 510; px < x + 850; px += 48) R(px, FLOOR - 66, 2, 60, "#c08f48");
  for (const cx of [x + 560, x + 730]) {
    ctx.fillStyle = "#c0392b";
    roundRect(cx, FLOOR - 104, 34, 30, 8);
  }
  R(x + 790, FLOOR - 112, 36, 28, "#1c1c1f");
  R(x + 793, FLOOR - 109, 30, 21, "#3f6fb0");
  R(x + 806, FLOOR - 84, 4, 6, "#1c1c1f");
}
// The children's computers, with the giant jigsaw puzzle on the wall.
function sceneKidsComputers(x, w) {
  kidsCeiling(x, w);
  R(x, 52, w, 1, "#777");
  for (let lx = x + 60; lx < x + w; lx += 140) poly("#e9e6dc", lx - 5, 62, lx + 5, 62, lx + 3, 53, lx - 3, 53);
  R(x, CEIL, 320, FLOOR - CEIL, "#e0b24f");
  R(x + 320, CEIL, 40, FLOOR - CEIL, "#c0263a");
  R(x + 350, CEIL, 10, FLOOR - CEIL, "#9e1c2e");
  R(x + 360, CEIL, w - 360, FLOOR - CEIL, "#d7d8de");
  // a banner on the yellow wall
  R(x + 40, CEIL + 16, 240, 40, "#f6d64e");
  R(x + 40, CEIL + 16, 240, 4, "#2f6db5");
  R(x + 40, CEIL + 52, 240, 4, "#2f6db5");
  label("One World, Many Stories", x + 160, CEIL + 42, 15, "#b8322a", "Georgia, serif");
  drawPuzzleMural(x + 410, CEIL + 10, 380, 92);
  carpet(x, w, "#b4aea3", "#9b958a");
  // the row of computers, each with blue headphones
  R(x + 40, FLOOR - 62, 900, 8, "#2d2f33");
  R(x + 40, FLOOR - 54, 900, 54, "#dcae68");
  for (let px = x + 40; px < x + 940; px += 100) R(px, FLOOR - 54, 3, 54, "#c08f48");
  for (let mx = x + 60; mx < x + 920; mx += 100) {
    R(mx + 14, FLOOR - 70, 6, 8, "#141416");
    R(mx, FLOOR - 104, 36, 34, "#141416");
    R(mx + 3, FLOOR - 101, 30, 26, "#6b3fc4");
    R(mx + 6, FLOOR - 97, 24, 4, "#9a7ae0");
    ctx.strokeStyle = "#2a4fd0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mx + 18, FLOOR - 104, 11, Math.PI, 0);
    ctx.stroke();
    oval(mx + 7, FLOOR - 103, 3, 4, "#2a4fd0");
    oval(mx + 29, FLOOR - 103, 3, 4, "#2a4fd0");
    // a chair back peeking over the desk, with its row of cut-out shapes
    ctx.fillStyle = "#c4452c";
    roundRect(mx + 50, FLOOR - 84, 30, 26, 6);
    for (let k = 0; k < 4; k++) oval(mx + 56 + k * 6, FLOOR - 77, 1.5, 1.5, "#e7d9c9");
  }
}
// A giant finished jigsaw puzzle: balloons and planets in the sky, animals, a lighthouse and
// sailboats along the shore, and a reef full of fish. (Made up, like a puzzle of our own.)
function drawPuzzleMural(mx, my, mw, mh) {
  R(mx - 5, my - 5, mw + 10, mh + 10, "#9a9ca1");
  const skyH = mh * 0.46;
  const sky = ctx.createLinearGradient(mx, 0, mx + mw, 0);
  sky.addColorStop(0, "#6db5e6");
  sky.addColorStop(0.6, "#8fc4ea");
  sky.addColorStop(0.75, "#3a2f6e");
  sky.addColorStop(1, "#5b2f6e");
  ctx.fillStyle = sky;
  ctx.fillRect(mx, my, mw, skyH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  // a rainbow
  ["#e74c3c", "#f39c12", "#f1c40f", "#2ecc71", "#3498db"].forEach((c, i) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(mx + mw * 0.42, my + skyH + 8, 50 - i * 3, Math.PI, Math.PI * 2);
    ctx.stroke();
  });
  for (let i = 0; i < 12; i++) {
    const bx = mx + 8 + hash(i, 1) * mw * 0.62,
      by = my + 6 + hash(i, 2) * skyH * 0.62;
    oval(bx, by, 4, 5, BRIGHT[i % BRIGHT.length]);
    R(bx - 1, by + 6, 2, 2, "#7a5a3a");
  }
  oval(mx + mw * 0.82, my + 16, 8, 8, "#e9b85b");
  oval(mx + mw * 0.93, my + 30, 6, 6, "#c95b8b");
  oval(mx + mw * 0.72, my + 12, 5, 5, "#f2efe6");
  for (let i = 0; i < 14; i++) R(mx + mw * 0.7 + hash(i, 5) * mw * 0.3, my + hash(5, i) * skyH, 1.5, 1.5, "#fff");
  // the shore: animals, a lighthouse, and sailboats on the water
  const shoreY = my + skyH;
  R(mx, shoreY, mw * 0.58, mh * 0.16, "#86b25e");
  const animals = ["#9a9a9e", "#e3c06a", "#f2f2f2", "#c98a4a", "#7d6b5a", "#e8743a", "#2d2d2d"];
  for (let i = 0; i < 14; i++) oval(mx + 8 + i * 13, shoreY + 4 + (i % 3) * 3, 6 + (i % 2) * 2, 5, animals[i % animals.length]);
  R(mx + mw * 0.5, shoreY - 22, 7, 26, "#f4f4f4");
  R(mx + mw * 0.5, shoreY - 14, 7, 4, "#d23a3a");
  R(mx + mw * 0.5, shoreY - 4, 7, 4, "#d23a3a");
  R(mx + mw * 0.5 - 1, shoreY - 27, 9, 5, "#3a3a3a");
  const sea = ctx.createLinearGradient(0, shoreY, 0, my + mh);
  sea.addColorStop(0, "#3d8ccc");
  sea.addColorStop(1, "#1f4f86");
  ctx.fillStyle = sea;
  ctx.fillRect(mx + mw * 0.58, shoreY, mw * 0.42, mh * 0.16);
  ctx.fillRect(mx, shoreY + mh * 0.16, mw, mh - skyH - mh * 0.16);
  for (let i = 0; i < 6; i++) {
    const sx = mx + mw * 0.62 + i * 22;
    poly(COLORFUL[i % COLORFUL.length], sx, shoreY + 12, sx + 8, shoreY - 8, sx + 12, shoreY + 12);
    R(sx - 2, shoreY + 12, 16, 3, "#f4f4f4");
  }
  // the reef
  for (let i = 0; i < 46; i++) {
    const fx = mx + hash(i, 7) * mw,
      fy = shoreY + mh * 0.2 + hash(7, i) * (mh - skyH - mh * 0.22);
    oval(fx, fy, 4, 2.5, BRIGHT[i % BRIGHT.length]);
  }
  for (let i = 0; i < 12; i++) oval(mx + i * (mw / 11), my + mh - 2, 12, 7, ["#e8743a", "#c95b8b", "#f2c14e"][i % 3]);
  ctx.restore();
}
// The Play and Literacy Center: yellow walls with the alphabet along the top, a play kitchen,
// a round table set with play food and baskets, and a bin of picture books. (Its doorway on the left.)
function scenePAL(x, w) {
  R(x, 0, w, CEIL, "#ecebe6");
  lightStrips(x, w, 18);
  R(x, CEIL, w, FLOOR - CEIL, "#f1dc8c");
  // the doorway in, with its sign
  R(x, CEIL, 150, FLOOR - CEIL, "#cfd2d8");
  R(x + 150, CEIL, 14, FLOOR - CEIL, "#c8964f");
  R(x + 30, CEIL + 10, 108, 46, "#2f6db5");
  label("PLAY &", x + 84, CEIL + 30, 13, "#fff");
  label("LITERACY", x + 84, CEIL + 47, 13, "#fff");
  // the alphabet along the top of the wall, with polka dots
  const abc = "abcdefghijklmnopqrstuvwxyz";
  for (let i = 0, lx = x + 186; lx < x + w - 10; i++, lx += 26)
    label(abc[i % 26], lx, CEIL + 34 + (i % 3) * 3, 22, COLORFUL[i % COLORFUL.length], "Georgia, serif");
  for (let i = 0; i < 18; i++) oval(x + 180 + hash(i, 3) * (w - 200), CEIL + 52 + hash(3, i) * 30, 5, 5, COLORFUL[(i + 2) % COLORFUL.length]);
  // posters and fruit decals
  for (const [px, c] of [[x + 230, "#4caa6a"], [x + 470, "#5b8de0"]]) {
    R(px, CEIL + 96, 46, 62, "#ffffff");
    R(px + 4, CEIL + 100, 38, 12, c);
    oval(px + 23, CEIL + 134, 12, 12, "#f2c14e");
  }
  oval(x + 330, CEIL + 108, 9, 10, "#d23a3a");
  R(x + 329, CEIL + 96, 2, 5, "#6b4a2a");
  oval(x + 380, CEIL + 122, 8, 8, "#f39c4a");
  // floor: dark speckled carpet, a black baseboard
  carpet(x, w, "#6c6a70", "#8b8790");
  R(x + 150, FLOOR - 6, w - 150, 6, "#1d1d1f");
  // the round table with baskets and play food, and its wooden chairs
  for (const cx of [x + 300, x + 420]) {
    oval(cx, FLOOR - 64, 15, 20, "#6b4a33");
    R(cx - 2, FLOOR - 46, 4, 46, "#222");
  }
  oval(x + 360, FLOOR - 52, 64, 9, "#c9332c");
  oval(x + 360, FLOOR - 54, 62, 8, "#a9abaf");
  R(x + 358, FLOOR - 46, 4, 46, "#222");
  for (const bx of [x + 330, x + 378]) {
    R(bx, FLOOR - 72, 26, 16, "#2f5fd0");
    R(bx + 4, FLOOR - 82, 18, 3, "#f2c14e");
  }
  oval(x + 316, FLOOR - 62, 6, 6, "#c0392b");
  oval(x + 410, FLOOR - 61, 6, 4, "#f39c4a");
  // the play kitchen
  const kx = x + w - 340;
  R(kx, FLOOR - 112, 100, 112, "#f6f6f4");
  R(kx + 6, FLOOR - 104, 50, 30, "#eef0f2");
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) R(kx + 8 + i * 12, FLOOR - 102 + j * 13, 10, 11, (i + j) % 2 ? "#2f5fd0" : "#fff");
  R(kx + 6, FLOOR - 70, 50, 10, "#2f5fd0");
  oval(kx + 16, FLOOR - 65, 3, 3, "#222");
  oval(kx + 28, FLOOR - 65, 3, 3, "#222");
  R(kx + 8, FLOOR - 54, 44, 40, "#dfe2e6");
  R(kx + 12, FLOOR - 50, 36, 26, "#ffffff");
  R(kx + 62, FLOOR - 112, 36, 112, "#f2f2f0");
  R(kx + 62, FLOOR - 70, 36, 2, "#d0d0d0");
  R(kx + 66, FLOOR - 96, 3, 16, "#c0c0c0");
  // a bin of picture books
  const bx = x + w - 140;
  R(bx, FLOOR - 70, 96, 70, "#e04a2f");
  R(bx + 6, FLOOR - 64, 84, 26, "#f6f4ee");
  for (let i = 0; i < 5; i++) R(bx + 10 + i * 16, FLOOR - 84 + (i % 2) * 4, 13, 22, BRIGHT[(i * 2) % BRIGHT.length]);
  R(bx + 8, FLOOR - 34, 38, 26, "#2f5fd0");
  R(bx + 50, FLOOR - 34, 38, 26, "#f2c14e");
}
// The Friends Shop: built-in maple shelves of gifts and books, a wire rack of activity kits, and
// the blue new-books carts by the big windows.
function sceneFriendsShop(x, w) {
  R(x, 0, w, CEIL, "#e6e4de");
  recessedLights(x, w, CEIL - 8, 110);
  R(x, CEIL, w, FLOOR - CEIL, "#4b5058");
  // the sign
  R(x + 200, CEIL + 8, 260, 30, "#f4efe6");
  label("THE FRIENDS SHOP", x + 345, CEIL + 29, 15, "#3a2a1e", "Georgia, serif");
  R(x + 212, CEIL + 14, 18, 16, "#d6498c");
  R(x + 219, CEIL + 14, 4, 16, "#f2c14e");
  R(x + 210, CEIL + 18, 22, 3, "#f2c14e");
  tiles(x, w, "#3e3633", "#2d2725");
  // built-in maple shelving
  for (let u = 0; u < 4; u++) {
    const sx = x + 120 + u * 118;
    R(sx, CEIL + 46, 112, FLOOR - CEIL - 46, "#c48b4a");
    for (let r = 0; r < 3; r++) {
      const sy = CEIL + 52 + r * 40,
        base = sy + 34;
      R(sx + 6, sy, 100, 34, "#a36f37");
      if ((u === 1 || u === 2) && r === 1) {
        for (let b = 0, bx = sx + 9; bx < sx + 100; b++) {
          const bw = 4 + hash(u, b) * 4;
          R(bx, base - 24 - hash(b, u) * 6, bw, 24 + hash(b, u) * 6, SPINES[b % SPINES.length]);
          bx += bw + 1;
        }
      } else
        for (let i = 0; i < 3; i++) {
          const ix = sx + 12 + i * 32,
            c = COLORFUL[(u * 3 + r * 2 + i) % COLORFUL.length];
          if ((i + r + u) % 2) {
            poly(c, ix, base, ix + 22, base, ix + 19, base - 22, ix + 3, base - 22); // a gift bag
            poly("#ffffff", ix + 6, base - 22, ix + 11, base - 32, ix + 16, base - 22);
          } else R(ix, base - 14, 24, 14, c); // a box
        }
      R(sx + 4, base, 104, 4, "#d9a061");
    }
    R(sx + 6, FLOOR - 56, 49, 54, "#d29a55");
    R(sx + 57, FLOOR - 56, 49, 54, "#d29a55");
    R(sx + 50, FLOOR - 36, 2, 10, "#888");
    R(sx + 60, FLOOR - 36, 2, 10, "#888");
  }
  // the wire rack of activity kits
  const rx = x + 28;
  R(rx, CEIL + 70, 74, FLOOR - CEIL - 70, "rgba(200, 205, 210, 0.25)");
  for (let gx = rx; gx <= rx + 74; gx += 10) R(gx, CEIL + 70, 1, FLOOR - CEIL - 70, "#b9bec4");
  for (let gy = CEIL + 70; gy < FLOOR; gy += 10) R(rx, gy, 74, 1, "#b9bec4");
  for (let i = 0; i < 6; i++) R(rx + 4 + (i % 2) * 36, CEIL + 78 + Math.floor(i / 2) * 50, 32, 42, BRIGHT[(i * 3 + 1) % BRIGHT.length]);
  // the big windows, and the blue new-books carts in front of them
  R(x + 610, CEIL + 8, 290, FLOOR - CEIL - 60, "#c9d0d6");
  R(x + 616, CEIL + 14, 278, FLOOR - CEIL - 72, "#dff0f4");
  for (let mx = x + 616; mx < x + 900; mx += 56) R(mx, CEIL + 14, 3, FLOOR - CEIL - 72, "#c9d0d6");
  for (let i = 0; i < 5; i++) oval(x + 640 + i * 56, CEIL + 110, 26, 18, i % 2 ? "#a8cf92" : "#bcdca8");
  for (const cx of [x + 640, x + 770]) drawBlueCart(cx, FLOOR);
}
// A blue rolling cart of new books standing face-out.
function drawBlueCart(x, floorY) {
  R(x, floorY - 96, 6, 88, "#2f62b8");
  R(x + 104, floorY - 96, 6, 88, "#2f62b8");
  for (const [sy, n] of [[floorY - 62, 5], [floorY - 22, 5]]) {
    R(x, sy, 110, 6, "#2f62b8");
    for (let i = 0; i < n; i++) R(x + 6 + i * 20, sy - 30 + (i % 2) * 4, 17, 30 - (i % 2) * 4, BRIGHT[(i * 2 + (sy | 0)) % BRIGHT.length]);
  }
  ctx.strokeStyle = "#2f62b8";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x + 55, floorY - 96, 52, Math.PI, Math.PI * 2);
  ctx.stroke();
  oval(x + 8, floorY - 4, 4, 4, "#111");
  oval(x + 102, floorY - 4, 4, 4, "#111");
}
// The far side of the globe: maple paneling, a drinking fountain, and the glass doors out to the lawn.
// (The doors are at the goal: GOAL_FROM_RIGHT from the scene's right edge.)
function sceneGlobeDoor(x, w) {
  R(x, 0, w, CEIL, "#ecebe7");
  recessedLights(x, w, CEIL - 7, 110);
  R(x, CEIL - 2, w, 2, "#d5d3cd");
  R(x, CEIL, w, FLOOR - CEIL, "#c8cdd4");
  R(x, CEIL + 16, 320, FLOOR - CEIL - 16, "#d49853");
  for (let k = 1; k < 4; k++) R(x + k * 80, CEIL + 16, 2, FLOOR - CEIL - 16, "#b07636");
  R(x + 360, FLOOR - 84, 44, 12, "#c1c6cb");
  R(x + 364, FLOOR - 72, 36, 30, "#a9afb5");
  oval(x + 382, FLOOR - 84, 16, 3, "#dfe3e6");
  tiles(x, w, "#3b3c43", "#2b2c31");
  drawGlassDoors(x + w - GOAL_FROM_RIGHT, false);
}
// A staff door, centered on cx: always shut, and with no window, so nothing behind it ever shows.
// swish: it has just swung closed (a few motion arcs beside it).
function drawStaffDoor(cx, top, swish) {
  const w = 66;
  R(cx - w / 2 - 5, top - 5, w + 10, FLOOR - top + 5, "#8a939d");
  R(cx - w / 2, top, w, FLOOR - top, "#5f6e7f");
  R(cx - w / 2 + 7, top + 8, w - 14, FLOOR - top - 16, "#6a798b");
  R(cx - 17, top + 20, 34, 13, "#eef1f3");
  label("STAFF", cx, top + 30, 9, "#3a3f46");
  R(cx + w / 2 - 13, FLOOR - 106, 5, 22, "#c9ced3");
  if (!swish) return;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(cx - w / 2, FLOOR - 60, w + 8 + i * 11, -0.5, 0.2); // (just past its swinging edge)
    ctx.stroke();
  }
}
// The glass doors to the outside, centered on cx: you can see the lawn and the sky through them.
function drawGlassDoors(cx, open) {
  const top = CEIL + 8,
    hw = 92;
  R(cx - 22, CEIL - 22, 44, 16, "#f2f2f2");
  label("EXIT", cx, CEIL - 10, 10, "#d22");
  R(cx - hw, top, hw * 2, FLOOR - top, "#9ba4ae");
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - hw + 6, top + 6, hw * 2 - 12, FLOOR - top - 6);
  ctx.clip();
  const g = ctx.createLinearGradient(0, top, 0, FLOOR);
  g.addColorStop(0, "#5c9be3");
  g.addColorStop(0.62, "#b6dcf4");
  g.addColorStop(0.62, "#6fae52");
  g.addColorStop(1, "#5a9442");
  ctx.fillStyle = g;
  ctx.fillRect(cx - hw, top, hw * 2, FLOOR - top);
  for (let i = 0; i < 4; i++) oval(cx - 70 + i * 46, top + 104 + hash(i, 8) * 10, 24, 20, i % 2 ? "#3f7d36" : "#4f8f3f");
  R(cx - hw, FLOOR - 40, hw * 2, 10, "#cfccc4");
  ctx.restore();
  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(cx - hw + 6, top + 6, hw * 2 - 12, FLOOR - top - 6);
  R(cx - hw, top + 40, hw * 2, 5, "#9ba4ae");
  R(cx - 3, top + 40, 6, FLOOR - top - 40, "#9ba4ae");
  if (open) {
    // the right-hand door swung wide: a bright gap
    R(cx + 3, top + 45, hw - 9, FLOOR - top - 45, "rgba(255, 250, 225, 0.5)");
  } else {
    R(cx - 70, FLOOR - 92, 58, 5, "#d4d8dc");
    R(cx + 12, FLOOR - 92, 58, 5, "#d4d8dc");
  }
  // sunlight spilling across the floor
  poly("rgba(255, 246, 210, 0.12)", cx - hw + 6, FLOOR, cx + hw - 6, FLOOR, cx + hw + 40, FLOOR + 40, cx - hw - 40, FLOOR + 40);
}

// ---------- Scenes: Hughes Main, outside ----------
function storySky(x, w) {
  const g = ctx.createLinearGradient(0, -TOP, 0, FLOOR);
  g.addColorStop(0, "#3a83de");
  g.addColorStop(1, "#aed6f3");
  ctx.fillStyle = g;
  ctx.fillRect(x, -TOP, w, FLOOR + TOP);
  for (let i = 0; i * 320 < w; i++) cloud(x + 90 + i * 320 + hash(i, w) * 140, 34 + hash(w, i) * 46, 0.8 + hash(i, 3) * 0.5);
}
function cloud(cx, cy, s) {
  for (const [dx, dy, r] of [[-22, 4, 14], [0, -4, 18], [22, 3, 14], [10, 8, 12], [-8, 9, 12]])
    oval(cx + dx * s, cy + dy * s, r * s * 1.3, r * s, "rgba(255, 255, 255, 0.92)");
}
// The lawn behind, the sidewalk you run along (it moves at full speed, like the floors indoors),
// and grass in front.
function lawnAndWalk(x, w) {
  R(x, FLOOR - 46, w, 46, "#69a64c");
  for (let i = 0; i * 64 < w; i++) R(x + i * 64, FLOOR - 46, 32, 46, "rgba(255, 255, 255, 0.05)");
  const fh = H + 2 * TOP - FLOOR;
  R(x, FLOOR, w, fh, "#5d9741");
  R(x, FLOOR, w, 16, "#cfccc4");
  R(x, FLOOR + 16, w, 2, "#a9a69e");
  for (let tx = -((distance * 0.9) % 64); tx < W; tx += 64) R(tx, FLOOR, 2, 16, "#b2afa7");
  for (let k = Math.floor(distance / 23); k * 23 - distance < W; k++)
    R(k * 23 - distance, FLOOR + 22 + hash(k, 3) * (fh - 26), 2, 3, "#4a8233");
}
function tree(cx, baseY, s) {
  R(cx - 5 * s, baseY - 64 * s, 10 * s, 64 * s, "#5b4331");
  for (const [dx, dy, r, c] of [[-26, -70, 30, "#3c7932"], [24, -74, 28, "#3c7932"], [0, -96, 34, "#4b8c3d"], [-14, -80, 26, "#5a9c46"], [16, -100, 22, "#5a9c46"]])
    oval(cx + dx * s, baseY + dy * s, r * s, r * s * 0.92, c);
}
function lampPost(cx) {
  R(cx - 2, FLOOR - 136, 4, 120, "#25272b");
  R(cx - 6, FLOOR - 22, 12, 6, "#25272b");
  oval(cx, FLOOR - 146, 9, 11, "#f3f1e6");
  R(cx - 6, FLOOR - 136, 12, 3, "#25272b");
  poly("#25272b", cx - 7, FLOOR - 155, cx + 7, FLOOR - 155, cx, FLOOR - 162);
}
function bush(cx, baseY, s) {
  oval(cx, baseY - 14 * s, 26 * s, 16 * s, "#3e7a34");
  oval(cx - 12 * s, baseY - 18 * s, 14 * s, 12 * s, "#4c8a3e");
  oval(cx + 10 * s, baseY - 20 * s, 12 * s, 10 * s, "#5a9a47");
}
// The library's long brick wing, from x to x + w (bottom on the lawn).
function brickWing(x, w) {
  const top = CEIL + 6,
    base = FLOOR - 46;
  R(x, top - 6, w, 6, "#d8dde0");
  R(x, top, w, 34, "#9fbccb");
  for (let mx = x; mx < x + w; mx += 22) R(mx, top, 2, 34, "#6f8a98");
  R(x, top + 34, w, base - top - 34, "#c98a5c");
  for (let y = top + 40; y < base; y += 8) R(x, y, w, 1, "rgba(120, 60, 30, 0.18)");
  for (let px = x + 18; px < x + w - 30; px += 66) {
    R(px, top + 50, 32, base - top - 58, "#3e5a64");
    R(px + 3, top + 54, 8, base - top - 66, "rgba(255, 255, 255, 0.16)");
  }
}
// Outside, by the glass doors Dewey just came through.
function sceneOutsideDoor(x, w) {
  storySky(x, w);
  brickWing(x, w);
  const dx = x + 180,
    top = CEIL + 46;
  R(dx - 64, top, 128, FLOOR - 46 - top, "#a9b3bc");
  R(dx - 58, top + 6, 116, FLOOR - 52 - top, "#56717d");
  R(dx - 2, top + 6, 4, FLOOR - 52 - top, "#a9b3bc");
  R(dx - 58, top + 40, 116, 4, "#a9b3bc");
  lawnAndWalk(x, w);
  poly("#7b7d84", dx - 64, FLOOR - 46, dx + 64, FLOOR - 46, dx + 96, FLOOR, dx - 96, FLOOR); // the slate walk out
  for (const bx of [x + 330, x + 400, x + 560, x + 630]) bush(bx, FLOOR - 40, 1);
  lampPost(x + 470);
  tree(x + 780, FLOOR - 40, 1.25);
}
// The round brick rotunda: a ring of glass on top, the big "Library" sign, and a colonnade of
// tall columns in front of the glass. (The long wing carries on at the left.)
function sceneRotunda(x, w) {
  storySky(x, w);
  brickWing(x, 330);
  const rx = x + 320,
    rw = 600,
    top = 30,
    base = FLOOR - 46;
  // the ring of glass on top
  R(rx + 70, top - 6, rw - 140, 6, "#d6dce0");
  R(rx + 70, top, rw - 140, 40, "#8db2c3");
  for (let mx = rx + 70; mx < rx + rw - 70; mx += 24) R(mx, top, 2, 40, "#5f7f8e");
  // the brick drum, shaded so it reads as round
  const g = ctx.createLinearGradient(rx, 0, rx + rw, 0);
  g.addColorStop(0, "#a5633e");
  g.addColorStop(0.35, "#d49c6c");
  g.addColorStop(0.72, "#c6875a");
  g.addColorStop(1, "#975836");
  ctx.fillStyle = g;
  ctx.fillRect(rx, top + 40, rw, base - top - 40);
  for (let y = top + 46, r = 0; y < base; y += 7, r++)
    for (let bx = rx + (r % 2) * 9; bx < rx + rw; bx += 18) R(bx, y, 9, 1.5, "rgba(255, 220, 190, 0.12)");
  R(rx, top + 40, rw, 4, "rgba(0, 0, 0, 0.12)");
  // the sign
  label("HUGHES MAIN", rx + rw / 2 + 74, top + 62, 11, "#ffffff");
  label("Library", rx + rw / 2, top + 100, 48, "#ffffff", "Georgia, serif");
  label("GREENVILLE COUNTY LIBRARY SYSTEM", rx + rw / 2 - 6, top + 114, 9, "#ffffff");
  // the glass, and the colonnade in front of it
  const gy = top + 128;
  R(rx + 40, gy - 8, rw - 80, 10, "#c48a62");
  R(rx + 56, gy, rw - 112, base - gy, "#2e5961");
  for (let mx = rx + 56; mx < rx + rw - 56; mx += 32) R(mx, gy, 2, base - gy, "#86a0a7");
  R(rx + 56, gy + 30, rw - 112, 2, "#86a0a7");
  R(rx + 56, gy + 62, rw - 112, 2, "#86a0a7");
  for (let i = 0; i < 7; i++) {
    const cx = rx + 70 + i * ((rw - 140) / 6);
    const cg = ctx.createLinearGradient(cx - 12, 0, cx + 12, 0);
    cg.addColorStop(0, "#efc9b2");
    cg.addColorStop(1, "#c39580");
    ctx.fillStyle = cg;
    ctx.fillRect(cx - 12, gy, 24, base - gy);
  }
  lawnAndWalk(x, w);
  bush(rx + rw - 20, FLOOR - 40, 1.2);
  tree(x + 120, FLOOR - 40, 1.2);
  tree(x + w - 80, FLOOR - 40, 1.4);
}
// The lawn, with its bronze sculpture on a round stone base, lamp posts and trees.
function sceneSculpture(x, w) {
  storySky(x, w);
  tree(x + 110, FLOOR - 46, 1.5);
  tree(x + 330, FLOOR - 46, 1.1);
  tree(x + 780, FLOOR - 46, 1.4);
  lawnAndWalk(x, w);
  R(x + 210, FLOOR - 34, 560, 7, "#cfccc4"); // a low concrete terrace edge across the lawn
  R(x + 210, FLOOR - 27, 560, 3, "#aaa79f");
  drawSculpture(x + 500, FLOOR - 22);
  lampPost(x + 70);
  lampPost(x + 860);
}
// The bronze sculpture: a trunk rising to two pairs of curving branches and a bud, on a stone base.
// (base: where the stone base sits.)
function drawSculpture(cx, base) {
  oval(cx, base, 46, 7, "rgba(0, 0, 0, 0.2)");
  R(cx - 40, base - 24, 80, 24, "#d6d4cf");
  oval(cx, base - 24, 40, 6, "#e5e3de");
  const bronze = "#4b3527",
    lit = "#6a4c38";
  poly(bronze, cx - 12, base - 26, cx - 6, base - 112, cx + 6, base - 112, cx + 12, base - 26);
  R(cx - 4, base - 100, 3, 70, lit);
  // the branches: two crescents on each side, curving up and out from the top of the trunk
  // (drawn for the left side, then mirrored for the right)
  const wing = (tipX, tipY, bulge, inner) => {
    for (const side of [-1, 1]) {
      const X = (dx) => cx + side * dx;
      ctx.fillStyle = bronze;
      ctx.beginPath();
      ctx.moveTo(X(3), base - 112);
      ctx.quadraticCurveTo(X(bulge), base - 118, X(tipX), base - tipY);
      ctx.quadraticCurveTo(X(inner), base - 136, X(3), base - 124);
      ctx.closePath();
      ctx.fill();
    }
  };
  wing(58, 194, 96, 24);
  wing(34, 180, 60, 12);
  // the bud and its leaves
  oval(cx - 12, base - 160, 10, 5, bronze);
  oval(cx + 12, base - 160, 10, 5, bronze);
  poly(bronze, cx - 7, base - 150, cx + 7, base - 150, cx + 9, base - 166, cx, base - 184, cx - 9, base - 166);
  poly(lit, cx - 2, base - 156, cx + 2, base - 156, cx, base - 178);
}
// The drive past the library, with lamp posts, trees and banners.
function driveway(x, w) {
  R(x, FLOOR - 44, w, 30, "#5c5e63");
  for (let mx = x + 20; mx < x + w; mx += 90) R(mx, FLOOR - 30, 44, 2, "#e8e4d4");
  R(x, FLOOR - 15, w, 4, "#d7d4cc");
}
function sceneDrive(x, w) {
  storySky(x, w);
  tree(x + 150, FLOOR - 46, 1.3);
  tree(x + 620, FLOOR - 46, 1.5);
  lawnAndWalk(x, w);
  driveway(x, w);
  for (const bx of [x + 330, x + 800]) {
    R(bx - 2, FLOOR - 150, 4, 106, "#25272b");
    R(bx + 2, FLOOR - 146, 16, 34, "#c0392b");
    R(bx + 2, FLOOR - 140, 16, 3, "#ffffff");
  }
  lampPost(x + 480);
  // the parking gate booth
  R(x + 900 - 120, FLOOR - 104, 50, 60, "#d5d1c8");
  poly("#3c4148", x + 900 - 126, FLOOR - 104, x + 900 - 64, FLOOR - 104, x + 900 - 95, FLOOR - 118);
  R(x + 900 - 112, FLOOR - 94, 34, 22, "#8fb3c4");
}
// The end of the drive, where the Bookmobile is parked: its door is the goal.
function sceneBookmobileStop(x, w) {
  storySky(x, w);
  tree(x + 120, FLOOR - 46, 1.4);
  tree(x + w - 60, FLOOR - 46, 1.2);
  lawnAndWalk(x, w);
  driveway(x, w);
  lampPost(x + 260);
  // a "Bookmobile" stop sign on a post
  R(x + 330, FLOOR - 110, 4, 70, "#25272b");
  R(x + 306, FLOOR - 128, 52, 26, "#2f7d84");
  label("BOOK", x + 332, FLOOR - 117, 10, "#fff");
  label("MOBILE", x + 332, FLOOR - 106, 10, "#fff");
  drawBookmobile(x + w - GOAL_FROM_RIGHT - BM_DOOR, FLOOR - 18, 0, {});
}

// ---------- The Bookmobile, the courier, and other props ----------
const BM_LEN = 330,
  BM_DOOR = 251; // the door's middle, from the Bookmobile's back end
// The Bookmobile, side on, facing right: back end at bx, wheels on groundY. opts: { moving, open, dewey }
function drawBookmobile(bx, groundY, t, opts) {
  const L = BM_LEN,
    bodyH = 118,
    top = groundY - 22 - bodyH;
  const bounce = opts.moving ? Math.sin(t * 0.02) * 1.5 : 0;
  oval(bx + L / 2, groundY, L * 0.48, 6, "rgba(0, 0, 0, 0.25)");
  ctx.save();
  ctx.translate(0, bounce);
  ctx.fillStyle = "#f6efdc";
  roundRect(bx, top, L - 64, bodyH, 10);
  roundRect(bx + L - 80, top + 24, 80, bodyH - 24, 16);
  poly("#9fd0ea", bx + L - 34, top + 32, bx + L - 6, top + 44, bx + L - 6, top + 70, bx + L - 34, top + 70); // windshield
  R(bx, top + bodyH - 36, L, 5, "#c92a2f");
  R(bx, top + bodyH - 31, L, 14, "#2f7d84");
  label("BOOKMOBILE", bx + 112, top + 26, 20, "#2f7d84", "Georgia, serif");
  // windows full of books
  // (the books' colours go by which window, not where it is on the screen, so they hold
  // still while the Bookmobile moves)
  for (const [n, wx] of [[0, bx + 18], [1, bx + 116]]) {
    R(wx, top + 36, 84, 40, "#2a1d14");
    for (let k = 0; k < 9; k++) R(wx + 3 + k * 9, top + 42 + (k % 3) * 3, 7, 32 - (k % 3) * 3, SPINES[(k + n * 4) % SPINES.length]);
  }
  // the door
  const dx = bx + BM_DOOR - 16;
  R(dx, top + 22, 32, bodyH - 22, "#ebe2c9");
  R(dx + 4, top + 28, 24, 30, opts.open ? "#2a1d14" : "#9fd0ea");
  R(dx + 24, top + 70, 4, 10, "#9aa0a6");
  R(dx - 4, groundY - 22, 40, 5, "#9aa0a6");
  if (opts.dewey) drawDewey(dx + 16, top + 64, 0.62, { wave: t }, 0);
  drawLogo(bx + 212, top + 38, 24);
  oval(bx + L - 4, top + bodyH - 40, 4, 5, "#ffe08a");
  ctx.restore();
  for (const wx of [bx + 62, bx + L - 54]) {
    oval(wx, groundY - 16, 17, 17, "#222");
    oval(wx, groundY - 16, 7, 7, "#aab0b6");
    if (opts.moving) {
      const a = t * 0.02;
      R(wx + Math.cos(a) * 11 - 1.5, groundY - 16 + Math.sin(a) * 11 - 1.5, 3, 3, "#555");
    }
  }
}
// The courier's hand truck with its stack of bins, pages poking out of every one.
function drawCourierCart(x, floorY, t) {
  R(x - 4, floorY - 120, 4, 114, "#3b3f46");
  R(x - 14, floorY - 124, 14, 4, "#3b3f46");
  R(x - 4, floorY - 8, 52, 4, "#3b3f46");
  for (let i = 0; i < 3; i++) {
    const by = floorY - 8 - (i + 1) * 34;
    R(x, by, 46, 32, "#6d8099");
    R(x - 2, by, 50, 4, "#56677e");
    for (let p = 0; p < 3; p++) {
      const tilt = Math.sin(t * 0.004 + i * 2 + p) * 0.15 + (p - 1) * 0.3;
      drawPage(x + 8 + p * 12, by - 12, 12, 16, tilt);
    }
  }
  oval(x + 4, floorY - 4, 6, 6, "#111");
}
// The library courier's van, side on, facing right (back at x).
function drawCourierVan(x, groundY, t) {
  oval(x + 90, groundY, 92, 5, "rgba(0, 0, 0, 0.22)");
  const bounce = Math.sin(t * 0.03) * 1.2;
  ctx.save();
  ctx.translate(0, bounce);
  ctx.fillStyle = "#f4f5f6";
  roundRect(x, groundY - 92, 140, 74, 8);
  roundRect(x + 128, groundY - 70, 52, 52, 10);
  poly("#9fd0ea", x + 150, groundY - 66, x + 176, groundY - 56, x + 176, groundY - 42, x + 150, groundY - 42);
  R(x, groundY - 40, 180, 6, "#2f6db5");
  drawLogo(x + 44, groundY - 84, 22);
  label("COURIER", x + 98, groundY - 58, 13, "#2f6db5");
  ctx.restore();
  for (const wx of [x + 34, x + 146]) {
    oval(wx, groundY - 14, 14, 14, "#222");
    oval(wx, groundY - 14, 5, 5, "#aab0b6");
  }
}
// Dewey, for the picture books: feet at (cx, feetY), s times his usual size. look: the usual
// drawCharacter options, plus run (a running pose at that time) and wave.
function drawDewey(cx, feetY, s = 1, look = {}, tilt = 0, flip = false) {
  const c = CHARACTERS[DEWEY];
  ctx.save();
  ctx.translate(cx, feetY);
  if (flip) ctx.scale(-1, 1);
  ctx.rotate(tilt);
  ctx.scale(s, s);
  let opts = { step: look.step || 0, wear: look.wear || 0, accessory: look.accessory || 0 };
  let bob = 0;
  if (look.run != null) {
    const pose = runPose(look.run);
    opts = { ...opts, step: pose.step, bob: pose.bob, lift: pose.lift, flutter: pose.flutter, legs: pose.legs };
    bob = pose.bob;
  }
  drawCharacter(c, -20, -50 - bob, 40, 44, opts);
  if (look.wave != null) {
    // a little hand waving
    const a = Math.sin(look.wave * 0.012) * 0.5;
    ctx.save();
    ctx.translate(18, -30);
    ctx.rotate(-0.8 + a);
    R(0, -2, 14, 4, "#1e2b2c");
    oval(15, 0, 4, 4, "#1e2b2c");
    ctx.restore();
  }
  ctx.restore();
}
// Loose pages fluttering around (cx, cy), drifting as t goes on.
function flutterPages(cx, cy, n, spread, t, seed = 1) {
  for (let i = 0; i < n; i++) {
    const a = hash(i, seed) * Math.PI * 2,
      r = spread * (0.35 + hash(seed, i) * 0.65);
    const px = cx + Math.cos(a) * r + Math.sin(t * 0.0015 + i) * 8,
      py = cy + Math.sin(a) * r * 0.6 + Math.cos(t * 0.002 + i * 1.7) * 6;
    drawPage(px - 7, py - 9, 14, 18, Math.sin(t * 0.003 + i) * 0.6);
  }
}
// A comic-book burst with a word in it ("BUMP!").
function comicBurst(cx, cy, r, word, color) {
  const pts = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2,
      rr = i % 2 ? r * 0.62 : r;
    pts.push(cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr);
  }
  poly("#fff2a8", ...pts);
  ctx.save();
  ctx.translate(cx, cy + 9);
  ctx.rotate(-0.12);
  ctx.font = `bold ${r * 0.62}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#3a2a1e";
  ctx.strokeText(word, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(word, 0, 0);
  ctx.restore();
}
// Speed lines streaming out behind something moving right (or left, with dir -1).
function speedStreaks(x, y, h, dir, t) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const yy = y + (i / 4) * h,
      len = 20 + ((i * 13 + t * 0.05) % 20);
    ctx.beginPath();
    ctx.moveTo(x - dir * 6, yy);
    ctx.lineTo(x - dir * (6 + len), yy);
    ctx.stroke();
  }
}
// The road the Bookmobile travels: rolling hills, trees going by, a dashed center line.
function roadScene(t, sunset) {
  const g = ctx.createLinearGradient(0, 0, 0, 230);
  if (sunset) {
    g.addColorStop(0, "#3d4f8f");
    g.addColorStop(0.55, "#e98a6b");
    g.addColorStop(1, "#f6cf8a");
  } else {
    g.addColorStop(0, "#3a83de");
    g.addColorStop(1, "#aed6f3");
  }
  ctx.fillStyle = g;
  ctx.fillRect(-200, -100, 1200, 420);
  if (sunset) oval(560, 196, 40, 40, "#ffd98a");
  else cloud(200, 60, 1.1), cloud(620, 46, 0.9);
  ctx.fillStyle = sunset ? "#6d6a8f" : "#7fae9a";
  ctx.beginPath();
  ctx.moveTo(-200, 230);
  for (let xx = -200; xx <= 1000; xx += 40) ctx.lineTo(xx, 200 - Math.sin(xx * 0.008) * 26 - Math.sin(xx * 0.02) * 8);
  ctx.lineTo(1000, 230);
  ctx.fill();
  R(-200, 220, 1200, 120, sunset ? "#5c7a44" : "#6aa84f");
  const scroll = (t * 0.12) % 300;
  for (let i = -1; i < 5; i++) tree(i * 300 - scroll + 60, 236, 0.8);
  R(-200, 250, 1200, 50, "#55575c");
  for (let xx = -200 - ((t * 0.4) % 80); xx < 1000; xx += 80) R(xx, 274, 40, 3, "#e8e4d4");
  R(-200, 300, 1200, 30, sunset ? "#56713f" : "#5d9741");
}
// The county, with a dot for each library (Hughes Main a star), and pages scattered among them.
function countyMap(t) {
  R(-200, -100, 1200, 520, "#efe4c8");
  for (let i = 0; i < 40; i++) R(-200 + hash(i, 1) * 1200, hash(1, i) * 320, 2, 2, "rgba(120, 90, 50, 0.15)");
  const mx = 400,
    my = 160;
  ctx.fillStyle = "#d9e7c2";
  ctx.strokeStyle = "#8a6f45";
  ctx.lineWidth = 3;
  ctx.beginPath();
  const outline = [[-70, -150], [10, -146], [70, -120], [110, -60], [130, 10], [120, 70], [96, 120], [60, 150], [10, 140], [-30, 100], [-70, 60], [-110, 10], [-120, -50], [-100, -110]];
  outline.forEach(([a, b], i) => (i ? ctx.lineTo(mx + a, my + b) : ctx.moveTo(mx + a, my + b)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // roads
  ctx.strokeStyle = "rgba(138, 111, 69, 0.45)";
  ctx.lineWidth = 2;
  for (const [a, b, c, d] of [[-90, -100, 100, 110], [-110, 20, 125, 0], [-40, -140, 40, 140]]) {
    ctx.beginPath();
    ctx.moveTo(mx + a, my + b);
    ctx.lineTo(mx + c, my + d);
    ctx.stroke();
  }
  // the libraries (roughly where they are)
  const branches = [[-22, -82], [26, -92], [70, -26], [30, -26], [-48, -8], [-6, 18], [-34, 14], [42, 6], [22, 40], [56, 40], [36, 78], [52, 122]];
  branches.forEach(([a, b], i) => {
    oval(mx + a, my + b, 6, 6, "#2f6db5");
    oval(mx + a, my + b, 3, 3, "#fff");
    if (i % 2 === 0) drawPage(mx + a + 6, my + b - 22 + Math.sin(t * 0.003 + i) * 2, 9, 12, Math.sin(t * 0.002 + i) * 0.3);
  });
  starShape(mx, my, 11, "#c92a2f");
  label("Hughes Main", mx, my + 26, 11, "#5a4630", "Georgia, serif");
}

// ---------- The picture books ----------
// Each page: its words, and its picture (drawn into an 800 × 320 world, like the game's, framed
// around x = `focus`, y = `focusY` (160 if not given), and `zoom`ed in that much from showing the
// world's whole height). The pictures move gently: t is ms since the page was turned to.
const BOOKS = {
  prologue: [
    {
      focus: 620,
      text: "This is Hughes Main Library, the biggest library in Greenville County. And this is the story of Dewey, a book who lives upstairs, in the nonfiction stacks.",
      art: () => {
        sceneRotunda(0, 1200);
        oval(860, 30, 60, 60, "rgba(255, 244, 200, 0.35)");
      },
    },
    {
      focus: 610, zoom: 1.3, focusY: 170,
      text: "Dewey had been out on loan. His reader loved him so much, they brought him back a few days early, right through the book drop!",
      art: (t) => {
        sceneBookDrop(0, 900);
        // Dewey sailing in a happy arc toward the slot
        const p = Math.min(1, (t % 2600) / 1600),
          x = 470 + p * 270,
          y = 120 + 90 * p * p - 70 * p;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(470, 120);
        ctx.quadraticCurveTo(605, 50, 740, 210);
        ctx.stroke();
        ctx.setLineDash([]);
        if (p < 1) drawDewey(x, y, 0.9, { wave: t }, p * 1.4);
        else sparkle(740, 206, 10, "#fff6c8");
      },
    },
    {
      focus: 470, zoom: 1.6, focusY: 205,
      text: "Dewey rode a book cart down the long aisle, on his way home to his shelf. Home at last!",
      art: (t) => {
        sceneAisleStacks(0, 1000);
        const cx = 470 + Math.sin(t * 0.002) * 3;
        drawShelvingCart(cx, FLOOR, 1.25);
        drawDewey(cx - 2, FLOOR - 58, 0.9, { step: Math.sin(t * 0.01) * 2 });
        label("♪", cx + 40, 150 - Math.sin(t * 0.004) * 6, 22, "#3a2a1e");
      },
    },
    {
      focus: 450, zoom: 1.25, focusY: 170,
      text: "BUMP! The cart hit a bump, and Dewey's tired old binding gave way. WHOOSH! His pages flew everywhere, down the long aisle and all the way into the children's wing!",
      art: (t) => {
        sceneAisleStacks(0, 1000);
        ctx.save();
        ctx.translate(430, FLOOR);
        ctx.rotate(0.12);
        drawShelvingCart(0, 0, 1.25);
        ctx.restore();
        flutterPages(520, 140, 16, 170 + Math.min(60, t * 0.04), t, 3);
        drawDewey(500, 150, 0.95, { wear: 1 }, -0.5 + Math.sin(t * 0.004) * 0.1);
        comicBurst(330, 120, 44, "BUMP!", "#c92a2f");
      },
    },
    {
      focus: 330,
      text: "His due date was only a few days away, and a book with missing pages can't go back on the shelf. So Dewey took a deep breath... and dashed!",
      art: (t) => {
        scenePictureBooks(0, 1000);
        for (let i = 0; i < 5; i++) drawPage(420 + i * 70, 190 - Math.sin(t * 0.003 + i) * 8 - i * 6, 14, 18, Math.sin(t * 0.002 + i) * 0.4);
        drawDewey(300, FLOOR, 2.1, { run: t, wear: 1 });
        speedStreaks(255, 210, 60, 1, t);
      },
    },
  ],
  // Dewey follows the courier cart through a staff door and comes out beside the main circulation
  // desk. The staff areas are only told, never shown: the doors are always shut.
  chase: [
    {
      focus: 610, zoom: 1.4, focusY: 200,
      text: "Dewey gathered up every page he could find in the children's wing. But when he counted them, some were still missing!",
      art: (t) => {
        scenePAL(0, 900);
        for (let i = 0; i < 5; i++) drawPage(642 - i * 2, FLOOR - 12 - i * 4, 22, 14, 0.05 * i);
        drawDewey(600, FLOOR, 1.5, { wear: 1, wave: t });
        label("?", 640, 170 + Math.sin(t * 0.005) * 3, 30, "#c92a2f", "Georgia, serif");
      },
    },
    {
      focus: 200, zoom: 1.3, focusY: 200,
      text: "Then he spotted it: the courier cart, its bins stuffed with pages (HIS pages!), rolling right out through the staff door.",
      art: (t) => {
        scenePAL(0, 900);
        drawStaffDoor(84, CEIL + 70, true);
        drawPage(104, FLOOR - 6, 16, 6, 0.1); // one caught under the door
        flutterPages(150, FLOOR - 40, 3, 30, t, 11);
        drawDewey(300, FLOOR, 1.3, { wear: 1 }, 0, true);
        label("!", 290, 186 + Math.sin(t * 0.01) * 2, 34, "#c92a2f", "Georgia, serif");
      },
    },
    {
      focus: 190, zoom: 1.3, focusY: 200,
      text: "The courier carries books to every branch in the county. If that cart left, his pages would go with it! So Dewey dashed through the door after it, around corners and down long back hallways...",
      art: (t) => {
        scenePAL(0, 900);
        drawStaffDoor(84, CEIL + 70, true);
        for (let i = 0; i < 6; i++) oval(130 + i * 18, FLOOR - 6 - (i % 2) * 5, 11 - i, 7 - i * 0.7, "rgba(205, 191, 163, 0.85)"); // his dust
        speedStreaks(150, FLOOR - 70, 50, -1, t);
        flutterPages(170, FLOOR - 60, 2, 24, t, 5);
        comicBurst(250, 150, 40, "WHOOSH!", "#2f6db5");
      },
    },
    {
      focus: 270, zoom: 1.1, focusY: 190,
      text: "...until he burst out right beside the main circulation desk! And there went the cart, rattling off toward the lobby. After it!",
      art: (t) => {
        // the navy wall just before the desk, with the staff door he came out of
        R(0, 0, 200, CEIL, "#d8d4cc");
        R(0, CEIL, 200, FLOOR - CEIL, "#344050");
        tiles(0, 200, "#3e3633", "#2d2725");
        sceneDesk(200, 1000);
        drawStaffDoor(100, CEIL + 50, true);
        const cx = 400 + ((t * 0.03) % 120);
        drawCourierCart(cx, FLOOR, t);
        speedStreaks(cx - 14, FLOOR - 100, 60, 1, t);
        for (let i = 0; i < 4; i++) oval(150 - i * 14, FLOOR - 5 - (i % 2) * 4, 9 - i, 6 - i, "rgba(205, 191, 163, 0.85)");
        drawDewey(190, FLOOR, 1.3, { run: t * 1.4, wear: 1 });
      },
    },
  ],
  outside: [
    {
      focus: 680, zoom: 1.3, focusY: 190,
      text: "Dewey zoomed past the globe and burst through the glass doors, out into the sunshine.",
      art: (t) => {
        sceneGlobeDoor(0, 900);
        drawGlassDoors(710, true);
        drawDewey(730, FLOOR, 1.4, { run: t * 1.4 });
        speedStreaks(700, 200, 70, 1, t);
      },
    },
    {
      focus: 450, zoom: 1.2, focusY: 200,
      text: "Too late! The courier van was already pulling away, taking its bins, and his pages, off to the branches.",
      art: (t) => {
        sceneDrive(0, 900);
        const vx = 430 + ((t * 0.05) % 300);
        drawCourierVan(vx, FLOOR - 18, t);
        flutterPages(vx - 10, FLOOR - 70, 5, 30, t, 7);
        drawDewey(300, FLOOR, 1.2, { wear: 1 });
      },
    },
    {
      focus: 560,
      text: "But wait! At the end of the walk sat the Bookmobile, getting ready to roll. If Dewey could catch it, he could follow his pages anywhere!",
      art: (t) => {
        sceneBookmobileStop(0, 900);
        drawDewey(330, FLOOR, 1.2, { wear: 1 });
        sparkle(640 + Math.sin(t * 0.004) * 4, 120, 10, "#fff6c8");
        sparkle(520, 150 + Math.cos(t * 0.004) * 4, 7, "#fff6c8");
      },
    },
  ],
  bookmobile: [
    {
      focus: 420, zoom: 1.1, focusY: 190,
      text: "Dewey made it! He hopped aboard the Bookmobile just as its engine rumbled to life.",
      art: (t) => {
        roadScene(t, false);
        drawBookmobile(250, 290, t, { moving: true, dewey: true });
      },
    },
    {
      focus: 400,
      text: "His pages were scattered across the county, at branches near and far. Somewhere out there, friends might help him find them.",
      art: (t) => countyMap(t),
    },
    {
      focus: 420,
      text: "His due date was coming fast. But for now, the Bookmobile rolled on, and the great page chase had only just begun... To be continued!",
      art: (t) => {
        roadScene(t, true);
        drawBookmobile(200 + Math.min(220, t * 0.03), 290, t, { moving: true });
      },
    },
  ],
};

// ---------- Reading a picture book ----------
let book = null; // the book being read: { pages, i, t, turnT, dir, then, intoLevel, closing }
const PAGE_TURN_MS = 380;
// names: the books to read, one after another. then: what happens after (with the screen black).
// intoLevel: a level starts after it (so the last page says "Go!").
function openBook(names, then, intoLevel = true) {
  book = { pages: names.flatMap((n) => BOOKS[n]), i: 0, t: 0, turnT: PAGE_TURN_MS, dir: 1, then, intoLevel, closing: false };
  state = "book";
}
function updateBook(dt) {
  if (!book) return;
  book.t += dt;
  book.turnT += dt;
  runTime += dt;
}
function turnPage(step) {
  if (!book || book.closing || fadeOut !== null) return;
  const n = book.i + step;
  if (n < 0) return;
  if (n >= book.pages.length) return closeBook();
  book.i = n;
  book.dir = step;
  book.t = 0;
  book.turnT = 0;
  tone(700, 420, 0.07, "triangle", 0.04); // a soft page turn
}
// Done (or skipped): on to whatever comes next, through the iris.
function closeBook() {
  if (!book || book.closing) return;
  book.closing = true;
  const then = book.then;
  fadeTo(() => {
    book = null;
    then();
  });
}
function bookKey(e) {
  const k = e.code;
  if (k === "Space" || k === "Enter" || k.startsWith("Arrow") || k === "Tab") e.preventDefault();
  if (e.repeat) return;
  if (k === "Space" || k === "Enter" || k === "ArrowRight" || k === "ArrowDown" || k === "KeyD") turnPage(1);
  else if (k === "ArrowLeft" || k === "ArrowUp" || k === "KeyA") turnPage(-1);
  else if (k === "Escape") closeBook();
  else if (k === "KeyM") toggleMute();
}
function bookTap(e) {
  e.preventDefault();
  if (!book || (e.pointerType === "mouse" && e.button !== 0)) return;
  const [cx, cy] = toCanvas(e),
    L = bookLayout();
  if (inside(cx, cy, L.skip)) return closeBook();
  if (book.i > 0 && inside(cx, cy, L.back)) return turnPage(-1);
  turnPage(1);
}
// Where everything goes: the page, its picture and words, and the buttons under it.
function bookLayout() {
  if (tall()) {
    const page = { x: 14, y: 34, w: W - 28, h: 554 };
    return {
      page,
      art: { x: page.x + 12, y: page.y + 12, w: page.w - 24, h: 270 },
      text: { x: page.x + 24, y: page.y + 296, w: page.w - 48, h: 222 },
      skip: { x: W - 106, y: 598, w: 92, h: 34 },
      back: { x: 14, y: 598, w: 92, h: 34 },
      dotsY: 615,
    };
  }
  const page = { x: 18, y: 10, w: W - 36, h: 266 };
  return {
    page,
    art: { x: page.x + 12, y: page.y + 12, w: 404, h: page.h - 24 },
    text: { x: page.x + 444, y: page.y + 16, w: page.w - 444 - 22, h: page.h - 32 },
    skip: { x: W - 104, y: 284, w: 86, h: 28 },
    back: { x: 18, y: 284, w: 86, h: 28 },
    dotsY: 298,
  };
}
function drawBook() {
  if (!book) return;
  const L = bookLayout(),
    p = L.page;
  // the table it's lying on
  const g = ctx.createLinearGradient(0, -TOP, 0, H + TOP);
  g.addColorStop(0, "#3b2b20");
  g.addColorStop(1, "#21160f");
  ctx.fillStyle = g;
  fillScreen();
  // the open book: a stack of page edges under it, then the page
  ctx.fillStyle = "#d9cdb0";
  roundRect(p.x + 3, p.y + 5, p.w, p.h, 8);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  const paper = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
  paper.addColorStop(0, "#fbf5e6");
  paper.addColorStop(1, "#efe5cc");
  ctx.fillStyle = paper;
  roundRect(p.x, p.y, p.w, p.h, 8);
  ctx.restore();
  if (!tall()) {
    // the fold down the middle of the spread
    const fx = L.art.x + L.art.w + 14;
    const fold = ctx.createLinearGradient(fx - 14, 0, fx + 14, 0);
    fold.addColorStop(0, "rgba(120, 90, 50, 0)");
    fold.addColorStop(0.5, "rgba(120, 90, 50, 0.22)");
    fold.addColorStop(1, "rgba(120, 90, 50, 0)");
    ctx.fillStyle = fold;
    ctx.fillRect(fx - 14, p.y, 28, p.h);
  }
  // this page, sliding in from the side it was turned toward
  const k = Math.min(1, book.turnT / PAGE_TURN_MS),
    e = 1 - (1 - k) * (1 - k) * (1 - k);
  ctx.save();
  ctx.globalAlpha = e;
  ctx.translate((1 - e) * 26 * book.dir, 0);
  drawBookPage(book.pages[book.i], L, book.t);
  ctx.restore();
  // a dot for each page
  const n = book.pages.length;
  for (let i = 0; i < n; i++) oval(W / 2 + (i - (n - 1) / 2) * 16, L.dotsY, 4, 4, i === book.i ? GOLD : "rgba(243, 234, 215, 0.3)");
  bookButton(L.skip, book.i < n - 1 ? "Skip ›" : book.intoLevel ? "Go! ›" : "Done ›");
  if (book.i > 0) bookButton(L.back, "‹ Back");
}
function bookButton(b, text) {
  ctx.fillStyle = "rgba(243, 234, 215, 0.14)";
  roundRect(b.x, b.y, b.w, b.h, b.h / 2);
  ctx.strokeStyle = "rgba(212, 166, 74, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.font = `bold ${tall() ? 16 : 14}px Georgia, serif`;
  ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + 5);
}
function drawBookPage(pg, L, t) {
  // the picture, in a frame
  const a = L.art;
  ctx.save();
  ctx.beginPath();
  ctx.rect(a.x, a.y, a.w, a.h);
  ctx.clip();
  const s = Math.max(a.w / 800, a.h / 320) * (pg.zoom || 1);
  ctx.translate(a.x + a.w / 2 - pg.focus * s, a.y + a.h / 2 - (pg.focusY || 160) * s);
  ctx.scale(s, s);
  const realW = W;
  W = 1400; // (scenes draw their floor patterns across the screen's width: make it reach the whole picture)
  try {
    pg.art(t);
  } finally {
    W = realW;
  }
  ctx.restore();
  ctx.strokeStyle = "#3a2a1e";
  ctx.lineWidth = 2;
  ctx.strokeRect(a.x, a.y, a.w, a.h);
  // the words, read aloud by a grown-up (or a big kid)
  const tx = L.text;
  const size = tall() ? 18 : 17,
    lineH = size * 1.45;
  ctx.font = `${size}px Georgia, serif`;
  const lines = wrapLines(pg.text, tx.w);
  let y = tx.y + Math.max(0, (tx.h - lines.length * lineH) / 2) + size;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  for (const line of lines) {
    ctx.fillText(line, tx.x, y);
    y += lineH;
  }
  ctx.textAlign = "center";
  ctx.fillStyle = INK_SOFT;
  ctx.font = "italic 12px Georgia, serif";
  const last = book.i === book.pages.length - 1,
    end = book.intoLevel ? "begin" : "finish";
  const hintText = touchUI
    ? last ? `Tap to ${end}` : "Tap to turn the page"
    : last ? `Enter to ${end}` : "Enter or → to turn the page · Esc to skip";
  ctx.fillText(hintText, tall() ? W / 2 : tx.x + tx.w / 2, L.page.y + L.page.h - 12);
}

// Story Mode is loaded: rebuild the buttons so its level list is in them.
makeButtons();

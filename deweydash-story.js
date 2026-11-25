// Dewey Dash: Story Mode. (The game's name is the story's: Dewey dashing to get his pages back.)
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
const STORY_KEY = "deweydash-story"; // { unlocked, stars: { "1-A": 3, … }, bookmarks: { "1-A": 2, … } }
// (stars are kept under each level's id, which never changes, whatever the level is called on screen)
const progress = (() => {
  try {
    const p = JSON.parse(safeGet(STORY_KEY) || "{}");
    return {
      unlocked: Math.max(0, p.unlocked | 0),
      stars: p.stars && typeof p.stars === "object" ? p.stars : {},
      bookmarks: p.bookmarks && typeof p.bookmarks === "object" ? p.bookmarks : {}, // the most found in each level
    };
  } catch {
    return { unlocked: 0, stars: {}, bookmarks: {} };
  }
})();
function saveProgress() {
  safeSet(STORY_KEY, JSON.stringify(progress));
}
// Settings' Reset progress: back to a fresh start (only the first level open, no stars or bookmarks)
function resetStoryProgress() {
  progress.unlocked = 0;
  progress.stars = {};
  progress.bookmarks = {};
  saveProgress();
}

// ---------- The levels ----------
// Each level is a run through a fixed series of scenes, start to finish ([draw, width] each; the
// scenery scrolls at BG_PARALLAX of the floor's speed, so 1000 px of scene is about 11 seconds).
// `features`: the hazards it has, and how many ms in each one starts (see FEATURES in deweydash.js).
// `chances`: how often some of them turn up, if not the usual. `powerUps: false`: none turn up along
// the way (a `powerFirst` one, set out at the start, still does). `powers`: which kinds it has.
// `powerFirst`: the level starts with its power-up, at running height, before anything else.
// `pages`: how many pages there are to find in the whole level, if it's a set number. `lastPage`: one
// of them is kept back for the very end: on the floor in the clear stretch before the goal, a freebie.
// `opening`: the first few things, in order (each a `kind` as pickNext names them), with the gap
// after each in jump lengths (`gapAfter`), before it goes on as usual (see storyOpening).
// `tips`: things to explain the first time they come up (see STORY_TIPS): the run stops for a pop-up
// about it, then counts down again so you can get ready. `briefing`: a pop-up going over the level's
// goals before its countdown (STORY_TIPS.goals).
// `bookmarks`: the bookmarks to find (collectables, not pages), each in some `scenes`, at a `spot`
// that's never easy: "high" (over a stack, only a full, well-timed jump reaches it), "couch" (the
// top of a couch bounce) or "hop" (high over the middle gap of a table hop: a full jump from a
// tabletop). See storyBookmark.
// `furniture`: which pieces turn up where (see storyFurniture): zones, each a run of `scenes` (by
// index), the `kinds` of furniture there, how often (`chance`), how many (`min`, `max`), and any
// pieces it must have (`need`: { kind: how many }) or can have at most (`limit`: { kind: how many }).
// `placed`: furniture set at its real spot in a scene, in order: `scene` (by index), `at` (the
// spot, in that scene's own px: the piece reaches the book just as the book passes it), `kind` (as
// PLATFORMS names them), its `look` if it has one, a `toy` sitting on it (see storyToyOn) and
// `clear`: the clear floor before it, in jump lengths (2.3 if not said). Nothing else comes out
// where it would be in the way (see storyPlaced).
// `toys`: the `scenes` where some of the book stacks are toys instead, and how often (see storyToy). `goal`: what happens at the end,
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
      [sceneAisleStacks, 2000], // (the stacks: twice as long as the other scenes, for getting the hang of jumping)
      [sceneAisleWall, 1800],
      [scenePictureBooks, 1000],
      [sceneKids, 1000],
      [sceneKidsDesk, 1000],
      [sceneKidsComputers, 1000],
      [scenePAL, 900],
    ],
    features: { double: 16000 }, // only book stacks to jump (single, then two or three wide)
    powerUps: false,
    pages: 10, // only ten pages to find in the whole level (see storyPageAllowance)
    lastPage: true, // …the last of them a freebie, on the floor in the clear stretch at the very end (see storyLastPage)
    tips: ["stack", "duck", "couch"], // pop-ups about the first book stack, the loaded table and the first couch, just before you meet them (see storyWatchTips)
    // how it starts (a tutorial): one book stack, then lots of room; then a table piled high with
    // books, to duck under; then room again, and on as usual (see storyOpening)
    opening: [
      { kind: "stack", gapAfter: 4 },
      { kind: "platform:loadedTable", gapAfter: 2.5 },
    ],
    briefing: true, // before the countdown, a pop-up going over the level's goals (STORY_TIPS.goals)
    // three bookmarks to find, none of them easy: high over a stack in the stacks, at the top of a
    // couch bounce in the children's wing, and high over a stack near the end
    bookmarks: [
      { scenes: [0, 1], spot: "high" },
      { scenes: [2, 3, 4, 5], spot: "couch" },
      { scenes: [4, 5], spot: "high" },
    ],
    // the stacks have a book cart or two; the children's wing has its reading chairs and couches
    furniture: [
      { scenes: [0, 1], kinds: ["cart", "table"], min: 2, max: 4, chance: 0.25, need: { cart: 1 }, limit: { cart: 2 } }, // (a cart or two, and reading tables)
      { scenes: [3, 4, 5], kinds: ["chair", "couch", "table"], chance: 0.25, need: { couch: 1 } }, // (another couch to bounce on, besides the first, below)
    ],
    // the picture-book room's own furniture, each where it stands in the room (its navy sofa doesn't
    // bounce: it has a teddy bear sitting on it), then the first couch to bounce on, just past the
    // giraffe, with plenty of clear floor before it (see storyPlaced)
    placed: [
      { scene: 2, at: 140, kind: "bench", look: "curved" },
      { scene: 2, at: 270, kind: "sofa", look: "navy", toy: "bear" },
      { scene: 2, at: 490, kind: "round", look: "kids" },
      { scene: 2, at: 610, kind: "bin" },
      { scene: 3, at: 220, kind: "couch", clear: 3.5 },
    ],
    toys: { scenes: [2, 3, 4, 5], chance: 0.45 }, // in the children's wing, some of the stacks are toys
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
      [sceneSeating, 900],
      [sceneFoyer, 700], // (the foyer outside the Meeting Rooms, just before the globe)
      [sceneLobby, 900],
      [sceneGlobeDoor, 900],
    ],
    // no flying books yet (they haven't turned up in the story so far) and no hanging bookshelves
    // (book tunnels): just book stacks, single and wide
    features: { double: 0 },
    pages: 10, // ten pages to find in the whole level (see storyPageAllowance)
    powers: ["shield"], // the only power-up so far: the hardcover…
    powerFirst: true, // …and it's the first thing you meet: at running height, before anything else…
    powerUps: false, // …and the only one in the level (no more turn up over the stacks later)
    tips: ["hardcover"], // a pop-up about it, just before you reach it (see storyWatchTips)
    // one wet floor by the book drop, with two or three puddles past its sign; the Friends Shop's
    // book sale carts in front of it; and in the seating area, the table hop: round tables to hop
    // across, with books and a backpack on the floor between them (see spawnTableHop)
    puddles: [2, 3],
    // three bookmarks: high over a stack by the desk or book drop, at the top of a full hop over the
    // table hop's middle gap (above the backpack), and high over a stack by the globe
    bookmarks: [
      { scenes: [0, 1], spot: "high" },
      { scenes: [3], spot: "hop" },
      { scenes: [5, 6], spot: "high" },
    ],
    furniture: [
      { scenes: [1], kinds: ["wet"], min: 1, max: 1, chance: 0.4 },
      { scenes: [2], kinds: ["saleCart"], min: 2, max: 2, chance: 0.5 },
      { scenes: [3], kinds: ["tableHop"], min: 1, max: 1, chance: 1 },
    ],
    // the steel café tables in the atrium, in front of the foyer before the globe (see storyPlaced)
    placed: [
      { scene: 4, at: 300, kind: "round", look: "steel" },
      { scene: 4, at: 540, kind: "round", look: "steel" },
    ],
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
    // hedges (single, then wide), the odd sprinkler, and the birds, which come in all the kinds the
    // flying books do (but the flocks and the charging crow): pigeons gliding in at head height from
    // early on, then blue jays that dart in faster than the walk moves, then swallows diving down out
    // of the sky (jump or duck: you can't tell which until they're close: see diveBottom), then
    // robins that rise and dive as they come (run under them at the top, duck through the middle,
    // jump them at the bottom)
    features: { double: 5000, flyer: 6000, wet: 16000, dart: 16000, dive: 20000, swoop: 26000 },
    chances: { flyer: 0.35, wet: 0.15 },
    pages: 10, // ten pages to find in the whole level (see storyPageAllowance)
    lastPage: true, // …the last of them a freebie, in the clear stretch before the Bookmobile
    powers: ["shield"], // the hardcover is the only power-up so far (over a hedge now and then)
    // three bookmarks: high over a hedge by the doors or the rotunda, high over another by the
    // rotunda or the drive, and high over the top of the terraces (only a jump from up there reaches it)
    bookmarks: [
      { scenes: [0, 1], spot: "high" },
      { scenes: [1, 3], spot: "high" },
      { scenes: [2], spot: "terrace" },
    ],
    // the level's own pieces: the stepped terraces on the sculpture's lawn; on the drive, a line of
    // parked vehicles (a car, a box truck, a car) to jump up onto and run across; and just past
    // them, the parking gate's arm by its booth, swinging up and down (see storySpawnPiece)
    placed: [
      { scene: 2, at: 260, kind: "terrace" },
      { scene: 3, at: 470, kind: "cars", clear: 3 },
      { scene: 3, at: 700, kind: "gate" },
    ],
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

// The pop-ups seen this visit, by level ("1-A:goals", "1-A:stack", …): trying a level again skips them.
const tipsSeen = new Set();
// Called with the screen black: set up level i and start its countdown. (again: trying it again,
// straight from its results or game over: the pop-ups already seen are skipped.)
function beginLevel(i, again = false) {
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
    // this run's furniture zones: how many pieces each should have (between min and max), and has so far
    furniture: (level.furniture || []).map((z) => ({
      ...z,
      target: z.max != null ? (z.min || 0) + Math.floor(Math.random() * (z.max - (z.min || 0) + 1)) : Infinity,
      count: 0,
      got: {}, // how many of each kind so far (for `need`)
    })),
    couchPages: 0, // pages put on couches' trails (a level with a set number of pages: see storyPageAllowance)
    bookmarksPlaced: (level.bookmarks || []).map(() => false), // which of its bookmarks are out (see storyBookmark)
    tipsShown: {}, // the level's tips shown so far (see storyWatchTips)
    openingOut: 0, // how many of the level's `opening` are out so far (see storyOpening)
    placedOut: 0, // how many of the level's `placed` pieces are out so far (see storyPlaced)
    resumed: false, // counting down again after a tip (so the level's title doesn't show again)
    bookmarksFound: 0,
    markFlights: [], // bookmarks just found, on their way up to their slots in the top bar (see storyBookmarkFlight)
  };
  useDewey();
  if (level.powerFirst)
    // its power-up is the very first thing: floating at running height (just run into it),
    // well before the first stack, with nothing before it
    pickups.push({
      kind: "power",
      type: level.powers ? level.powers[0] : "shield",
      x: W + 40,
      y: GROUND_Y + (player.h - 26) / 2,
      w: 26,
      h: 26,
      phase: Math.random() * Math.PI * 2,
    });
  distance = 0; // (the scenery starts at the first scene)
  state = "countdown";
  countTime = 0;
  countShown = 0;
  if (level.opening) upcoming = level.opening[0].kind; // (the first thing to come: see storyOpening)
  const seen = (name) => again && tipsSeen.has(level.id + ":" + name);
  for (const name of level.tips || []) if (seen(name)) story.tipsShown[name] = true;
  if (level.briefing && !seen("goals")) {
    // first a look at the scene (as the iris opens, and a moment more), then the level's goals
    // (Let's go! starts the countdown)
    state = "preview";
    previewT = 0;
  }
}
// The look at the scene before a level's goals (state "preview"): about a second once the iris is
// open, then the goals pop up. (Endless Mode does this too, with its own goals: see beginCountdown.)
const PREVIEW_MS = 1600; // (from when the level is set up: the iris takes the first ~0.6 s, then a second's look)
let previewT = 0; // ms into the preview
function updateStoryPreview(dt) {
  previewT += dt; // (the run's own clock doesn't start until after the countdown)
  if (previewT >= PREVIEW_MS) openStoryTip(story ? "goals" : "endless");
}
// A level's scripted opening (`opening`), asked by pickNext (in deweydash.js) as each thing goes
// out: the next thing in the opening, or null once it's all out. (The first is set up by beginLevel.)
function storyOpening() {
  const list = story.level.opening;
  if (!list || story.openingOut >= list.length) return null;
  story.openingGap = list[story.openingOut].gapAfter; // (the gap after the one that just went out)
  story.openingOut++;
  return story.openingOut < list.length ? list[story.openingOut].kind : null;
}
// The gap after the thing that just went out, if it was part of the opening (in jump lengths), or null.
function storyOpeningGap() {
  const g = story.openingGap;
  story.openingGap = null;
  return g ?? null;
}
// The level's next `placed` piece, with `due`: the distance it comes out at (on the right edge),
// so it reaches the book just as the scenery behind has its spot there. Or null, when all are out.
// (See updateObstacles, in deweydash.js, which also holds back anything that would be in its way.)
function storyPlaced() {
  const list = story.level.placed;
  if (!list || story.placedOut >= list.length) return null;
  const p = list[story.placedOut],
    start = story.level.scenes.slice(0, p.scene).reduce((s, [, w]) => s + w, 0);
  return { ...p, due: (start + p.at - PLAYER_X) / BG_PARALLAX - (W + 10 - PLAYER_X) };
}
// Which scene the next thing to come will be in (by the time it reaches the book), and how far into it.
function sceneAhead() {
  const at = (distance + W + 10 - PLAYER_X) * BG_PARALLAX + PLAYER_X;
  let x = 0;
  const scenes = story.level.scenes;
  for (let i = 0; i < scenes.length; i++) {
    const w = scenes[i][1];
    if (at < x + w) return { index: i, into: (at - x) / w };
    x += w;
  }
  return { index: scenes.length - 1, into: 1 };
}
// Story Mode's furniture (asked by pickNext, in deweydash.js): the piece to put next, if the scene
// coming up has a furniture zone that wants one, or null. A zone short of its minimum (or of a piece
// it needs) gets one for sure late in its last scene; until then, pieces it still needs come first.
function storyFurniture() {
  if (!story.furniture.length) return null;
  const s = sceneAhead(),
    z = story.furniture.find((f) => f.scenes.includes(s.index));
  if (!z || z.count >= z.target) return null;
  const late = s.index === z.scenes[z.scenes.length - 1] && s.into > 0.4,
    needs = Object.keys(z.need || {}).filter((k) => (z.got[k] || 0) < z.need[k]);
  if ((late && (z.count < (z.min || 0) || needs.length)) || Math.random() < z.chance) {
    z.count++;
    const open = z.kinds.filter((k) => !z.limit || z.limit[k] == null || (z.got[k] || 0) < z.limit[k]); // (any at its limit are out)
    if (!open.length) return null;
    const kind = needs.length && (late || Math.random() < 0.6) ? needs[0] : open[(Math.random() * open.length) | 0];
    z.got[kind] = (z.got[kind] || 0) + 1;
    return kind;
  }
  return null;
}
// A level with a set number of pages (`pages`) hands them out as it goes. The couches the level
// needs come first: each gets COUCH_TRAIL (a page at the top of its bounce), and that many are kept
// back for every one still to come. Everything else (extra couches too) shares the rest, spread over
// the level (never more, so far, than its share of the way through), so they aren't all gone in the
// first few seconds. Returns how many pages the thing being placed may have (Infinity in other levels).
const COUCH_TRAIL = 1; // (Story Mode places single pages, not sets: see withPageAllowance)
function storyPageAllowance(couch) {
  const cap = story.level.pages;
  story.neededCouch = false;
  if (cap == null) return Infinity;
  const zone = story.furniture.find((z) => z.need && z.need.couch),
    needed = zone ? zone.need.couch : 0,
    got = zone ? zone.got.couch || 0 : 0, // (couches so far, this one included: counted when it was picked)
    toCome = Math.max(0, needed - got), // (needed couches still to come, besides this one)
    free = cap - story.pagesThere - COUCH_TRAIL * toCome - (story.level.lastPage && !story.lastPageOut ? 1 : 0); // (and the last page, kept back)
  if (couch && got <= needed) {
    story.neededCouch = true; // (its trail comes out of the pages kept back for couches)
    return Math.max(0, Math.min(COUCH_TRAIL, free));
  }
  const s = sceneAhead(),
    widths = story.level.scenes.map(([, w]) => w),
    before = widths.slice(0, s.index).reduce((a, b) => a + b, 0),
    progress = (before + s.into * widths[s.index]) / widths.reduce((a, b) => a + b, 0),
    share = cap - COUCH_TRAIL * needed - (story.level.lastPage ? 1 : 0), // (everything else's pages)
    placed = story.pagesThere - story.couchPages,
    // spread evenly, from just inside the start to the last stretch where things still turn up
    // (nothing new comes near the very end): the next one's turn comes a fair share further each time
    nextAt = 0.05 + (placed * 0.73) / Math.max(1, share - 1);
  if (progress < nextAt) return 0;
  return Math.max(0, Math.min(free, 1, couch ? COUCH_TRAIL : Infinity));
}
// Should one of the level's bookmarks go at this spot ("high" or "couch")? If one of them is meant
// for this kind of spot in the scene coming up, and isn't out yet, yes (and now it is).
function storyBookmark(spot) {
  const list = story.level.bookmarks;
  if (!list) return false;
  const s = sceneAhead().index;
  const i = list.findIndex((b, k) => !story.bookmarksPlaced[k] && b.spot === spot && b.scenes.includes(s));
  if (i < 0) return false;
  story.bookmarksPlaced[i] = true;
  return true;
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
      // the big star is the book's: a shower of gold and a bright chime
      burst(goal, GOAL_STAR_Y, 18, GOLD, 5);
      sfx.bookmark();
      [1047, 1319, 1568].forEach((hz, i) => tone(hz, hz * 1.5, 0.18, "triangle", 0.09, 0.08 + i * 0.07));
    }
  } else if (f.t - f.arrivedAt > ARRIVE_MS) levelCleared();
  return true;
}
// The big gold star waiting at the end of every level, floating over the goal at head height:
// reach the end and it's yours (the first of the level's three stars, whatever pages you found).
// It glows and bobs as it comes into view, and swells and spins away when the book gets there.
const GOAL_STAR_R = 20,
  GOAL_STAR_Y = FLOOR - 62;
function drawGoalStar() {
  if (state === "cleared") return; // (it's on the results card by then)
  const off = Math.min(distance * BG_PARALLAX, story.end),
    x = story.end + W - GOAL_FROM_RIGHT - off; // (where the goal is in the scenery, on screen)
  if (x < -60 || x > W + 60) return;
  const f = story.finishing,
    got = f && f.arrivedAt ? f.t - f.arrivedAt : -1; // ms since the book got it
  if (got < 0) {
    const y = GOAL_STAR_Y + Math.sin(runTime * 0.004) * 4,
      r = GOAL_STAR_R * (1 + Math.sin(runTime * 0.006) * 0.06),
      glow = ctx.createRadialGradient(x, y, 4, x, y, r * 2.4);
    glow.addColorStop(0, "rgba(255, 230, 140, 0.6)");
    glow.addColorStop(1, "rgba(255, 230, 140, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    goalStar(x, y, r);
    for (let i = 0; i < 3; i++) {
      // little twinkles circling it
      const a = runTime * 0.0015 + i * 2.1;
      sparkle(x + Math.cos(a) * r * 1.7, y + Math.sin(a) * r * 1.3, 3 + Math.sin(runTime * 0.01 + i) * 1.5, "#fff6c8");
    }
    return;
  }
  const q = Math.min(1, got / 700);
  if (q >= 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - q;
  ctx.translate(x, GOAL_STAR_Y - q * 70);
  ctx.rotate(q * Math.PI);
  goalStar(0, 0, GOAL_STAR_R * (1 + q * 0.8));
  ctx.restore();
}
// The goal's star itself: gold with a darker edge underneath and a lighter middle, outlined in black.
function goalStar(x, y, r) {
  starShape(x, y + 2, r, "#a87a22"); // (its darker edge, underneath)
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 3;
  ctx.stroke();
  starShape(x, y - 1, r * 0.55, "#f7d77a");
}

// ---------- A level's results ----------
let clearedTime = 0; // ms the results card has been up
const CLEARED_GRACE_MS = 900; // its buttons work after this (once the stars have popped in)
function levelCleared() {
  const id = story.level.id;
  const found = story.pagesThere ? Math.min(1, pages / story.pagesThere) : 1;
  const stars = 1 + (found >= 0.5) + (found >= 1); // finishing is a star; half the pages, two; every page, three
  const before = progress.stars[id] || 0;
  story.result = { stars, found, newBest: stars > before, bookmarks: story.bookmarksFound };
  progress.stars[id] = Math.max(stars, before);
  progress.bookmarks[id] = Math.max(story.bookmarksFound, progress.bookmarks[id] || 0);
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
    startRun(true); // (with its goals first)
    return true;
  }
  if (id === "story") {
    if (storyLocked()) return true; // test mode: no Story Mode (see storyLocked, in deweydash.js)
    openLevels();
    return true;
  }
  if (state === "levels") {
    if (id === "home") {
      state = "ready";
      if (!keyNav) selected.ready = -1; // (nothing highlighted)
      return true;
    }
    if (id.startsWith("level-")) {
      pickLevel(Number(id.slice(6)));
      return true;
    }
    if (id.startsWith("chapter-")) {
      const c = Number(id.slice(8));
      if (c !== viewChapter) {
        showChapter(c);
        tone(700, 420, 0.07, "triangle", 0.04); // a page turn
      }
      return true;
    }
  }
  if (state === "tip" && id === "tipback" && STORY_TIPS[tipName].back) {
    openStoryTip(STORY_TIPS[tipName].back); // ‹ Back: the screen before (its cards deal in again)
    return true;
  }
  if (state === "tip" && id === "tipgo" && STORY_TIPS[tipName].next) {
    openStoryTip(STORY_TIPS[tipName].next); // Next: the tip's second screen (its cards deal in)
    return true;
  }
  if (state === "tip" && id === "tipgo") {
    // got it: count down again, so there's a moment to get ready
    state = "countdown";
    countTime = COUNT_START_MS - 250;
    countShown = 0;
    if (story) story.resumed = tipName !== "goals"; // (after the goals, it's the level's real start: its title shows)
    return true;
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
// The level list, open at chapter c (or, if not given, the chapter of the furthest level you can play).
function openLevels(c) {
  state = "levels";
  showChapter(c || LEVELS[Math.min(progress.unlocked, LEVELS.length - 1)].chapter);
}
// To the level list, through the iris.
function toLevels() {
  fadeTo(() => {
    leaveStory();
    reset();
    openLevels();
  });
}
let lockedShake = null; // { i, at }: a locked level's line in the contents, shaking its head
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
  else fadeTo(() => beginLevel(i, !withIntro)); // (straight back in: trying again, so no pop-ups seen already)
}
// Continue from a level's results: its outro and the next level's intro, then the next level.
// The end of a chapter: its outro, then the Bookmobile's drive on the route map to the next
// library, then that chapter's first level (or, if it isn't written yet, the level list open at it).
function continueStory() {
  const ni = story.index + 1,
    next = LEVELS[ni],
    here = story.level.chapter;
  if (next && next.chapter === here) {
    const books = [story.level.outro, next.intro].filter(Boolean);
    fadeTo(books.length ? () => openBook(books, () => beginLevel(ni)) : () => beginLevel(ni));
    return;
  }
  const after = next
    ? () => (next.intro ? openBook([next.intro], () => beginLevel(ni)) : beginLevel(ni))
    : () => {
        leaveStory();
        reset();
        openLevels(here + 1);
      };
  const drive = () => openRoute(here, here + 1, after);
  fadeTo(story.level.outro ? () => openBook([story.level.outro], drive, false) : drive);
}

// ---------- The chapters ----------
// One chapter per library: Hughes Main first, then the branches, then the finale back at Main.
// Only the chapters with levels are written so far; the rest are on the shelf as locked spines.
// A chapter: `place`, a `teaser` line, `at` (where the library is on the county map, from Hughes
// Main: see COUNTY_SPOTS) and `art` (its picture on the chapter's title page: a scene drawn into an
// 800 × 320 world, framed around `focus`, `focusY`, showing `span` of the world's height).
const CHAPTER_COUNT = 14; // Hughes Main, the 12 branches, and the finale back at Main
const CHAPTERS = {
  1: {
    place: "Hughes Main Library",
    teaser: "Where Dewey's pages went missing.",
    at: [0, 0],
    art: { focus: 620, focusY: 150, span: 270, draw: () => sceneRotunda(0, 1200) },
  },
};
const chapterLevels = (c) => LEVELS.map((lv, i) => ({ lv, i })).filter((e) => e.lv.chapter === c);
const chapterOpen = (c) => chapterLevels(c).some((e) => e.i <= progress.unlocked);
function chapterStars(c) {
  const ls = chapterLevels(c);
  return [ls.reduce((s, e) => s + (progress.stars[e.lv.id] || 0), 0), ls.length * 3];
}

// ---------- The level list: a chapter book ----------
// The story's book, lying open at a chapter: on the left page the chapter's title page (its
// library, a picture, how many stars you have), on the right its contents, one line per level.
// Under it, a shelf with a spine for every chapter: pull one out to open the book there. Locked
// chapters keep their library a secret until Dewey gets there.
// Keys: ← → flip chapters, ↑ ↓ pick a level (or the spine, or Back), Enter plays.
let viewChapter = 1; // the chapter the book is open at
// Where everything goes, in this layout.
function levelsLayout() {
  const back = { w: tall() ? 92 : 86, h: MUTE_BTN.h, y: MUTE_BTN.y };
  back.x = W - 12 - back.w;
  if (tall()) {
    const page = { x: 18, y: 92, w: W - 36, h: 452 };
    return {
      tall: true,
      back,
      titleY: 72,
      page,
      left: { x: page.x, y: page.y, w: page.w, h: 228 },
      right: { x: page.x, y: page.y + 228, w: page.w, h: page.h - 228 },
      rowsY: page.y + 274,
      rowH: 50,
      rowGap: 8,
      spineW: 24,
      spineH: 40,
      shelfY: 604,
    };
  }
  const page = { x: 100, y: 46, w: 600, h: 206 };
  return {
    tall: false,
    back,
    titleY: MUTE_BTN.y + MUTE_BTN.h / 2 + 7,
    page,
    left: { x: page.x, y: page.y, w: page.w / 2, h: page.h },
    right: { x: page.x + page.w / 2, y: page.y, w: page.w / 2, h: page.h },
    rowsY: page.y + 38,
    rowH: 42,
    rowGap: 6,
    spineW: 22,
    spineH: 30,
    shelfY: 294,
  };
}
// The screen's buttons: a line per level in the open chapter, a spine per chapter, and Back.
function levelButtons() {
  const L = levelsLayout(),
    r = L.right,
    pad = L.tall ? 16 : 14;
  const rows = chapterLevels(viewChapter).map((e, k) => ({
    id: "level-" + e.i,
    label: chapterLevelName(e.lv),
    row: e.i,
    x: r.x + pad,
    y: L.rowsY + k * (L.rowH + L.rowGap),
    w: r.w - pad * 2,
    h: L.rowH,
  }));
  const gap = 4,
    total = CHAPTER_COUNT * L.spineW + (CHAPTER_COUNT - 1) * gap;
  const spines = [];
  for (let c = 1; c <= CHAPTER_COUNT; c++)
    spines.push({ id: "chapter-" + c, label: "Chapter " + c, spine: c, x: W / 2 - total / 2 + (c - 1) * (L.spineW + gap), y: L.shelfY - L.spineH - 6, w: L.spineW, h: L.spineH + 6 });
  BUTTONS.levels = [...rows, ...spines, { id: "home", label: "Back", back: true, ...L.back }];
}
function storyButtons() {
  levelButtons();
  // The tips' buttons: just the one (from MENU.tip), or, on a tip's second screen, ‹ Back beside it
  // (on the left, as in How to play; the main button first, so Enter picks it)
  BUTTONS.tipOne = BUTTONS.tip;
  const y = BUTTON_Y[layout].tip;
  if (tall()) {
    const x = W / 2 - 181;
    BUTTONS.tipBack = [
      { id: "tipgo", label: "Let's go!", x: x + 162, y, w: 200, h: 54 },
      { id: "tipback", label: "‹ Back", x, y, w: 150, h: 54 },
    ];
  } else {
    const x = W / 2 - 148;
    BUTTONS.tipBack = [
      { id: "tipgo", label: "Let's go!", x: x + 136, y, w: 160, h: 42 },
      { id: "tipback", label: "‹ Back", x, y, w: 120, h: 42 },
    ];
  }
  if (state === "tip") useTipButtons(); // (a new layout mid-tip)
}
// Open the book at chapter c, with the furthest level you can play there picked (or its spine).
function showChapter(c) {
  viewChapter = Math.max(1, Math.min(CHAPTER_COUNT, c));
  levelButtons();
  const B = BUTTONS.levels;
  let pick = -1;
  B.forEach((b, i) => {
    if (b.row != null && b.row <= progress.unlocked) pick = i;
  });
  if (pick < 0) pick = B.findIndex((b) => b.spine === viewChapter);
  selected.levels = pick;
}
function flipChapter(step) {
  const c = Math.max(1, Math.min(CHAPTER_COUNT, viewChapter + step));
  if (c === viewChapter) return;
  showChapter(c);
  tone(700, 420, 0.07, "triangle", 0.04); // a page turn
}
// ← → flip chapters; ↑ ↓ go between Back, the levels and the open chapter's spine. (Tab, Enter
// and Esc work as on every menu.) True if it was one of those keys.
function storyLevelsKey(e) {
  const k = e.code;
  const horiz = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }[k],
    vert = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 }[k];
  if (!horiz && !vert) return false;
  e.preventDefault();
  keyNav = true;
  if (horiz) {
    flipChapter(horiz);
    return true;
  }
  const B = BUTTONS.levels,
    order = [B.findIndex((b) => b.back), ...B.flatMap((b, i) => (b.row != null ? [i] : [])), B.findIndex((b) => b.spine === viewChapter)];
  const at = Math.max(0, order.indexOf(selected.levels));
  highlight("levels", order[(at + vert + order.length) % order.length]);
  return true;
}

function drawLevels() {
  const L = levelsLayout(),
    B = BUTTONS.levels,
    focus = B[litIndex("levels")] || {};
  dimBehindCard();
  ctx.fillStyle = "rgba(10, 6, 4, 0.25)";
  fillScreen();
  // the story's name, and Back
  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.font = `bold italic ${L.tall ? 26 : 21}px Fraunces, Georgia, serif`;
  ctx.fillText("Dewey Dash", W / 2, L.titleY); // (the story's title, like the name on a book's cover)
  const bk = B[B.length - 1];
  drawRingButton(bk, false);
  if (focus.back) focusRing(bk.x, bk.y, bk.w, bk.h, bk.h / 2, PAPER);
  ctx.fillStyle = PAPER;
  ctx.font = `bold ${L.tall ? 16 : 14}px Fraunces, Georgia, serif`;
  ctx.fillText("‹ Back", bk.x + bk.w / 2, bk.y + bk.h / 2 + 5);

  // the book: its cover peeking out around the pages, then the pages
  const p = L.page;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#5e3f24";
  roundRect(p.x - 7, p.y + 3, p.w + 14, p.h + 5, 9);
  ctx.restore();
  ctx.fillStyle = "#d9cdb0"; // page edges
  roundRect(p.x - 2, p.y + 3, p.w + 4, p.h, 6);
  const paper = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
  if (L.tall) {
    paper.addColorStop(0, "#f7f0df");
    paper.addColorStop(1, "#f3ead7");
  } else {
    // shading toward the fold in the middle
    paper.addColorStop(0, "#f7f0df");
    paper.addColorStop(0.42, "#f3ead7");
    paper.addColorStop(0.5, "#d8caa9");
    paper.addColorStop(0.58, "#f3ead7");
    paper.addColorStop(1, "#f7f0df");
  }
  ctx.fillStyle = paper;
  roundRect(p.x, p.y, p.w, p.h, 5);
  drawRibbon(p.x + p.w - 40, p.y);

  drawChapterTitlePage(L.left, L.tall);
  if (L.tall) {
    ctx.fillStyle = "rgba(58, 42, 30, 0.18)";
    ctx.fillRect(p.x + 18, L.right.y, p.w - 36, 1);
  }
  drawChapterContents(L, B, focus);
  drawChapterShelf(L, B, focus);

  if (!L.tall) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#c9bc9f";
    ctx.font = "12px Fraunces, Georgia, serif";
    ctx.fillText(
      padUI()
        ? "◀ ▶ chapters · ▲ ▼ levels · A to play · B to go back"
        : touchUI()
          ? "Tap a level to play it · tap a spine to open its chapter"
          : "← → chapters · ↑ ↓ levels · Enter to play · Esc to go back",
      W / 2,
      H - 5,
    );
  }
}
// The left page (the top half, on a phone): CHAPTER n, the library, its picture, a line, the stars.
function drawChapterTitlePage(box, isTall) {
  const c = viewChapter,
    ch = CHAPTERS[c],
    open = ch && chapterOpen(c),
    cx = box.x + box.w / 2;
  let y = box.y + (isTall ? 30 : 24);
  ctx.textAlign = "center";
  ctx.fillStyle = CARD_RED;
  ctx.font = "bold 11px Fraunces, Georgia, serif";
  ctx.fillText(c === CHAPTER_COUNT ? "THE LAST CHAPTER" : `CHAPTER ${c}`, cx, y);
  y += isTall ? 27 : 24;
  ctx.fillStyle = open ? INK : INK_SOFT;
  ctx.font = `bold ${isTall ? 23 : 20}px Fraunces, Georgia, serif`;
  ctx.fillText(open ? ch.place : "???", cx, y);
  // two red rules, like a book's chapter heading
  y += 9;
  ctx.fillStyle = CARD_RED;
  ctx.fillRect(cx - 60, y, 120, 1.5);
  ctx.fillRect(cx - 60, y + 4, 120, 1.5);
  // the picture
  const fw = isTall ? 300 : 220,
    fh = isTall ? 92 : 84,
    frame = { x: cx - fw / 2, y: y + 12, w: fw, h: fh };
  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();
  if (open) {
    const a = ch.art,
      s = frame.h / a.span;
    ctx.translate(frame.x + frame.w / 2 - a.focus * s, frame.y + frame.h / 2 - a.focusY * s);
    ctx.scale(s, s);
    const realW = W;
    W = 1400; // (scenes draw their ground across the screen's width: make it reach the whole picture)
    try {
      a.draw();
    } finally {
      W = realW;
    }
  } else {
    // not there yet: a foggy map with a question mark on it
    ctx.fillStyle = "#ddd2b8";
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    ctx.strokeStyle = "rgba(122, 106, 85, 0.25)";
    ctx.lineWidth = 2;
    for (let gx = frame.x + 10; gx < frame.x + frame.w; gx += 28) {
      ctx.beginPath();
      ctx.moveTo(gx, frame.y);
      ctx.lineTo(gx - 12, frame.y + frame.h);
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(90, 70, 50, 0.55)";
    ctx.font = "bold 46px Fraunces, Georgia, serif";
    ctx.fillText("?", cx, frame.y + frame.h / 2 + 16);
  }
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
  y = frame.y + frame.h + (isTall ? 22 : 19);
  ctx.textAlign = "center";
  ctx.fillStyle = INK_SOFT;
  ctx.font = "italic 13px Fraunces, Georgia, serif";
  const teaser = open ? ch.teaser : ch ? `Finish Chapter ${c - 1} to get here.` : "Dewey hasn't found the way here yet.";
  ctx.fillText(teaser, cx, y);
  if (!open) return;
  // the chapter's stars
  const [got, of] = chapterStars(c),
    text = `${got} of ${of} stars`;
  ctx.font = "bold 13px Fraunces, Georgia, serif";
  const tw = ctx.measureText(text).width;
  y += isTall ? 22 : 0;
  const sy = isTall ? y : box.y + box.h - 14;
  starShape(cx - tw / 2 - 4, sy - 5, 7, GOLD);
  ctx.fillStyle = "#5c4a3a";
  ctx.fillText(text, cx + 8, sy);
}
// The right page (the bottom half, on a phone): CONTENTS, and a line for each level.
function drawChapterContents(L, B, focus) {
  const r = L.right,
    cx = r.x + r.w / 2;
  ctx.textAlign = "center";
  ctx.fillStyle = CARD_RED;
  ctx.font = "bold 11px Fraunces, Georgia, serif";
  ctx.fillText("CONTENTS", cx, r.y + (L.tall ? 30 : 24));
  const rows = B.filter((b) => b.row != null);
  if (!rows.length) {
    // a chapter that isn't written yet
    padlock(cx, r.y + r.h / 2 - 16, 1.3, "#a89c8c");
    ctx.textAlign = "center";
    ctx.fillStyle = INK_SOFT;
    ctx.font = "italic 14px Fraunces, Georgia, serif";
    ctx.fillText("This chapter is still being written.", cx, r.y + r.h / 2 + 22);
    ctx.fillText("Check back soon!", cx, r.y + r.h / 2 + 42);
    return;
  }
  for (const b of rows) drawContentsLine(b, b === focus);
}
function drawContentsLine(b, on) {
  const i = b.row,
    lv = LEVELS[i],
    locked = i > progress.unlocked,
    stars = progress.stars[lv.id] || 0,
    fresh = !locked && !stars;
  let x = b.x;
  if (lockedShake && lockedShake.i === i) {
    const t = runTime - lockedShake.at;
    if (t < 350) x += reduceMotion() ? 0 : Math.sin(t * 0.09) * 5 * (1 - t / 350);
    else lockedShake = null;
  }
  if (on) {
    ctx.fillStyle = "rgba(58, 42, 30, 0.2)";
    roundRect(x, b.y + 3, b.w, b.h, 8);
    ctx.fillStyle = locked ? "#e4dccb" : "#f0d9a8";
    roundRect(x, b.y, b.w, b.h, 8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    roundRectPath(x, b.y, b.w, b.h, 8);
    ctx.stroke();
  }
  const tx = x + 10,
    capY = b.y + b.h / 2 - 5,
    nameY = b.y + b.h / 2 + 12;
  ctx.textAlign = "left";
  ctx.font = "bold 10px Fraunces, Georgia, serif";
  ctx.fillStyle = fresh ? "#8a3a2a" : locked ? "#a89c8c" : INK_SOFT;
  const cap = `LEVEL ${lv.num}${fresh ? " · NEW" : ""}`;
  ctx.fillText(cap, tx, capY);
  ctx.font = "bold 15px Fraunces, Georgia, serif";
  ctx.fillStyle = locked ? "#a89c8c" : INK;
  ctx.fillText(lv.name, tx, nameY);
  const nameEnd = tx + ctx.measureText(lv.name).width;
  const right = x + b.w - 10;
  if (on && !locked) {
    // Play
    const pw = 62,
      ph = Math.min(28, b.h - 10),
      px = right - pw + 4,
      py = b.y + (b.h - ph) / 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    roundRect(px + 1, py + 2, pw, ph, 8);
    ctx.fillStyle = MAPLE;
    roundRect(px, py, pw, ph, 8);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    poly(ON_ORANGE, px + 14, py + ph / 2 - 6, px + 24, py + ph / 2, px + 14, py + ph / 2 + 6);
    ctx.fillStyle = ON_ORANGE;
    ctx.font = "bold 14px Fraunces, Georgia, serif";
    ctx.fillText("Play", px + 28, py + ph / 2 + 5);
    // (its stars move up beside the caption, then its bookmarks)
    ctx.font = "bold 10px Fraunces, Georgia, serif";
    let sx = tx + ctx.measureText(cap).width + 10;
    if (stars) {
      for (let k = 0; k < 3; k++) starShape(sx + k * 11, capY - 4, 4.5, k < stars ? "#c8962f" : "rgba(58, 42, 30, 0.2)");
      sx += 40;
    }
    if (lv.bookmarks) bookmarkMarks(sx - 2, capY - 9, progress.bookmarks[lv.id] || 0, lv.bookmarks.length);
    return;
  }
  // the bookmarks found here (the best run), after the caption
  if (lv.bookmarks && !locked) {
    ctx.font = "bold 10px Fraunces, Georgia, serif";
    bookmarkMarks(tx + ctx.measureText(cap).width + 8, capY - 9, progress.bookmarks[lv.id] || 0, lv.bookmarks.length);
  }
  // the dotted leader out to the stars (or the padlock), like a contents page
  const endX = locked ? right - 14 : right - 40;
  ctx.fillStyle = "rgba(58, 42, 30, 0.35)";
  for (let dx = nameEnd + 8; dx < endX - 6; dx += 5) ctx.fillRect(dx, nameY - 2, 2, 2);
  if (locked) padlock(right - 6, nameY - 6, 0.7, "#a89c8c");
  else for (let k = 0; k < 3; k++) starShape(right - 32 + k * 13, nameY - 5, 5.5, k < stars ? "#c8962f" : "rgba(58, 42, 30, 0.2)");
}
// The shelf of chapters: a spine for each. The open chapter's is pulled up; locked ones are grey
// with a padlock (the last chapter, the way home, has a gold star instead).
function drawChapterShelf(L, B, focus) {
  for (const b of B) {
    if (b.spine == null) continue;
    const c = b.spine,
      open = CHAPTERS[c] && chapterOpen(c),
      out = c === viewChapter,
      h = L.spineH + (out ? 6 : 0),
      y = L.shelfY - h,
      last = c === CHAPTER_COUNT;
    ctx.fillStyle = open ? SPINES[(c * 3) % SPINES.length] : last ? "#3d4f63" : "#4a4038";
    roundRect(b.x, y, b.w, h, 3);
    ctx.fillStyle = open ? GOLD : last ? GOLD : "#6b6055";
    ctx.fillRect(b.x + 2, y + 3, b.w - 4, 2);
    ctx.fillRect(b.x + 2, y + h - 6, b.w - 4, 2);
    if (open) {
      ctx.textAlign = "center";
      ctx.fillStyle = PAPER;
      ctx.font = `bold ${L.tall ? 15 : 13}px Fraunces, Georgia, serif`;
      ctx.fillText(String(c), b.x + b.w / 2, y + h / 2 + 5);
    } else if (last) starShape(b.x + b.w / 2, y + h / 2, 6, GOLD);
    else padlock(b.x + b.w / 2, y + h / 2 - 1, 0.55, "#a89c8c");
    if (b === focus) focusRing(b.x, y, b.w, h, 3, PAPER, 3); // (a tighter ring: the spines stand close together)
  }
  // the shelf itself
  const first = B.find((b) => b.spine === 1),
    lastB = B.find((b) => b.spine === CHAPTER_COUNT),
    sx = first.x - 14,
    sw = lastB.x + lastB.w + 14 - sx;
  ctx.fillStyle = "#5e3f24";
  roundRect(sx, L.shelfY, sw, 8, 2);
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(sx, L.shelfY, sw, 2);
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
// ---------- During a level ----------
// The score bar's right half: the level, and a bar for how far through it the book is. The bar
// is w wide; when that's narrow (beside the Controls button, with a keyboard), the level's name
// gives its room to the progress bar (it's on the pause card, and shown as the level starts).
function drawStoryProgress(x, sy, w) {
  const named = w >= 300;
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.font = "bold 16px Fraunces, Georgia, serif";
  if (named) ctx.fillText(levelShortName(story.level), x + 100, sy + 22); // (chapter-level, as "1-2")
  const marks = story.level.bookmarks ? story.level.bookmarks.length : 0,
    bx = x + (named ? 146 : 100),
    full = Math.max(40, w - (bx - x) - 26), // (the bar's length: what's left, less the flag at its end)
    bw = marks ? full - marks * 10 - 8 : full, // (room at the end for the bookmark slots)
    by = sy + 12;
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  roundRect(bx, by, bw, 8, 4);
  ctx.fillStyle = PAPER;
  roundRect(bx, by, Math.max(8, bw * storyProgress()), 8, 4);
  // a little flag at the finish
  R(bx + bw + 3, by - 5, 2, 15, PAPER);
  poly(RIBBON_RED, bx + bw + 5, by - 5, bx + bw + 15, by - 1, bx + bw + 5, by + 3);
  // the level's bookmarks: a slot for each, filled in as they're found (once each has flown up to it)
  if (marks) {
    const flying = story.markFlights.filter((f) => !f.landed).length;
    bookmarkMarks(bx + bw + 24, by - 6, story.bookmarksFound - flying, marks, 1.25, "rgba(243, 234, 215, 0.28)");
    drawMarkFlights(bx + bw + 24, by - 6);
  }
}
// A bookmark just found flies up to its slot in the top bar: it lifts off with a gold glow, arcs up
// across the screen shrinking and twirling, trailing sparkles, and lands in its slot with a burst of
// sparkles and a chime. (Timed by the clock, so it carries on whatever the game's doing.)
const MARK_FLIGHT_MS = 950;
function storyBookmarkFlight(b) {
  story.markFlights.push({
    x: b.x + b.w / 2,
    y: b.y + b.h / 2 + WORLD_Y + camY, // (where it was caught, on the screen)
    slot: story.bookmarksFound - 1,
    color: b.color,
    start: performance.now(),
    landed: false,
  });
}
// (sx, sy): the first slot's top left, as bookmarkMarks draws them (at size 1.25)
function drawMarkFlights(sx, sy) {
  const now = performance.now(),
    k = 1.25;
  story.markFlights = story.markFlights.filter((f) => now - f.start < MARK_FLIGHT_MS + 500);
  for (const f of story.markFlights) {
    const tx = sx + f.slot * 8 * k + 2.5 * k, // the slot's middle
      ty = sy + 5 * k,
      p = Math.min(1, (now - f.start) / MARK_FLIGHT_MS),
      e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p),
      cx = (f.x + tx) / 2,
      cy = Math.min(f.y, ty) - 70, // (an arc, up and over)
      at = (q) => {
        const r = 1 - q;
        return [r * r * f.x + 2 * r * q * cx + q * q * tx, r * r * f.y + 2 * r * q * cy + q * q * ty];
      };
    if (p < 1) {
      // the trail of sparkles behind it
      for (let i = 1; i <= 6; i++) {
        const q = e - i * 0.05;
        if (q <= 0) continue;
        const [qx, qy] = at(q),
          tw = Math.sin(now * 0.03 + i * 1.7) * 0.5 + 0.5;
        sparkle(qx, qy, (5 - i * 0.6) * (0.6 + tw * 0.4), i % 2 ? GOLD : "#fff6c8");
      }
      // the bookmark itself, glowing, shrinking to the slot's size and twirling a little
      const [x, y] = at(e),
        size = 1 - e * 0.55,
        glow = ctx.createRadialGradient(x, y, 0, x, y, 26 * size);
      glow.addColorStop(0, "rgba(255, 228, 140, 0.75)");
      glow.addColorStop(1, "rgba(255, 228, 140, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 26, y - 26, 52, 52);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(p * Math.PI * 2) * 0.35);
      ctx.scale(size, size);
      drawBookmark(-7, -13, 14, 26, f.color);
      ctx.restore();
      continue;
    }
    if (!f.landed) {
      f.landed = true;
      [1568, 2093, 2637].forEach((fr, i) => tone(fr, fr, 0.14, "sine", 0.06, i * 0.06)); // a bright little chime
    }
    // landed: a burst of sparkles around its slot, spreading and fading
    const q = Math.min(1, (now - f.start - MARK_FLIGHT_MS) / 500);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + q;
      sparkle(tx + Math.cos(a) * (4 + q * 14), ty + Math.sin(a) * (4 + q * 14), 3.5 * (1 - q), i % 2 ? GOLD : "#fff6c8");
    }
  }
}
// A row of little ribbon bookmarks, `found` of them in red and the rest faint, from (x, y), at size s.
function bookmarkMarks(x, y, found, total, s = 1, faint = "rgba(58, 42, 30, 0.2)") {
  for (let i = 0; i < total; i++) {
    const rx = x + i * 8 * s;
    poly(i < found ? RIBBON_RED : faint, rx, y, rx + 5 * s, y, rx + 5 * s, y + 10 * s, rx + 2.5 * s, y + 7 * s, rx, y + 10 * s);
  }
}
// The level's title as it begins, and its results when it's cleared.
function drawStoryOverlay() {
  if (!story.resumed && (state === "preview" || state === "countdown" || (state === "running" && runTime < 1400))) drawLevelBanner();
  if (state === "cleared") drawCleared();
  if (state === "tip") drawStoryTip();
}
function drawLevelBanner() {
  const a =
    state === "preview"
      ? Math.min(1, Math.max(0, (previewT - 700) / 300)) // (once the iris is open)
      : state === "countdown"
        ? Math.min(1, Math.max(0, (countTime - COUNT_START_MS + 300) / 300))
        : 1 - runTime / 1400;
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const y = tall() ? WORLD_Y - 14 : WORLD_Y + 76; // (under the score bar, above the countdown's numbers)
  const top = `${chapterLevelName(story.level)} · ${story.level.place}`.toUpperCase();
  ctx.font = "bold 13px Fraunces, Georgia, serif";
  const bw = Math.min(W - 16, Math.max(340, ctx.measureText(top).width + 36)); // (wide enough for the longer chapter names)
  ctx.fillStyle = "rgba(20, 14, 10, 0.72)";
  roundRect(W / 2 - bw / 2, y - 22, bw, 52, 10);
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.fillText(top, W / 2, y - 3);
  ctx.fillStyle = PAPER;
  ctx.font = "bold 19px Fraunces, Georgia, serif";
  ctx.fillText(story.level.name, W / 2, y + 20);
  ctx.restore();
}
// How faded-in the results card is (the run behind is dimmed to match: see draw in deweydash.js).
const clearedFade = () => Math.min(1, clearedTime / 300);
// Bits of text (and little rows of bookmarks) in one line, centred on cx, on the baseline y.
// parts: { text, font, color } or { marks: [found, total], s } (see bookmarkMarks).
function drawTextRun(cx, y, parts) {
  let total = 0;
  for (const p of parts) {
    if (p.marks) p.w = 8 * p.s * (p.marks[1] - 1) + 5 * p.s + 6;
    else {
      ctx.font = p.font;
      p.w = ctx.measureText(p.text).width;
    }
    total += p.w;
  }
  let x = cx - total / 2;
  ctx.textAlign = "left";
  for (const p of parts) {
    if (p.marks) bookmarkMarks(x, y - 10 * p.s, p.marks[0], p.marks[1], p.s);
    else {
      ctx.font = p.font;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
    }
    x += p.w;
  }
}
// A level's results. The heading says which level is done (a small red label), then its name
// big, then its chapter and library over the card's red rules. Under them the stars (landing one
// at a time) and the pages and bookmarks in one quiet line. Continue goes across the card, with
// Play again and Chapters under it (see BUTTONS.cleared in makeButtons). No best: in Story Mode
// that's the stars' job.
function drawCleared() {
  const r = story.result,
    lv = story.level,
    k = clearedFade(),
    big = tall(),
    L = CLEARED_CARD[layout];
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(0, (1 - k) * 12);
  // (the run behind was dimmed before the top bar was drawn)
  const c = clearedCard();
  drawCard(c.x, c.y, c.w, c.h, null);
  // the label: a red check and "LEVEL 2 COMPLETE", letter-spaced
  const label = `${levelName(lv)} complete`.toUpperCase();
  ctx.font = `bold ${big ? 13 : 12}px Fraunces, Georgia, serif`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  const lw = ctx.measureText(label).width,
    ck = big ? 11 : 10, // the check's size
    lx = W / 2 - (lw + ck + 6) / 2,
    ly = c.y + L.label;
  ctx.strokeStyle = CARD_RED;
  ctx.lineWidth = 2.4;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(lx, ly - ck * 0.45);
  ctx.lineTo(lx + ck * 0.38, ly - ck * 0.08);
  ctx.lineTo(lx + ck, ly - ck * 0.9);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = CARD_RED;
  ctx.fillText(label, lx + ck + 6, ly);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  // the level's name, then its chapter and library, over the red rules
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `bold ${big ? 30 : 26}px Fraunces, Georgia, serif`;
  ctx.fillText(lv.name, W / 2, c.y + L.title);
  cardSub(`Chapter ${lv.chapter} · ${lv.place}`, c.y + L.sub);
  cardRules(c.x, c.y + L.rules, c.w);
  // the stars land one at a time
  for (let i = 0; i < 3; i++) {
    const t = clearedTime - 420 - i * 240,
      on = i < r.stars;
    const pop = !on || t <= 0 ? 1 : t < 200 ? 1 + Math.sin((t / 200) * Math.PI) * 0.35 : 1;
    starShape(W / 2 + (i - 1) * L.starGap, c.y + L.stars, L.starR * pop, on && t > 0 ? GOLD : "rgba(58, 42, 30, 0.14)");
  }
  // the pages (and the bookmarks, if the level has any) in one line
  const marks = lv.bookmarks ? lv.bookmarks.length : 0,
    fs = big ? 16 : 14,
    bold = `bold ${fs}px Fraunces, Georgia, serif`,
    plain = `${fs}px Fraunces, Georgia, serif`;
  drawTextRun(W / 2, c.y + L.stats, [
    { text: `${pages} of ${story.pagesThere}`, font: bold, color: INK },
    { text: " pages", font: plain, color: INK_SOFT },
    ...(marks
      ? [
          { text: "   ·   ", font: plain, color: INK_SOFT },
          { marks: [story.bookmarksFound, marks], s: big ? 1.1 : 1 },
          { text: `${story.bookmarksFound} of ${marks}`, font: bold, color: INK },
          { text: " bookmarks", font: plain, color: INK_SOFT },
        ]
      : []),
  ]);
  if (clearedTime >= CLEARED_GRACE_MS * 0.6) drawButtons();
  hint(
    hintFor("Tab or ← → to choose · Enter to select · Esc for the chapters", "◀ ▶ to choose · A to select · B for the chapters", "Tap Continue for the next level"),
    c.y + c.h - (big ? 14 : 10),
  );
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

// ---------- Tips (a level explaining something new, just before you meet it) ----------
// Each is drawn just like a screen of How to play: a name and a line on the dark, then its tip
// card(s) (see drawHowtoCards), and the button below. `ahead`: how far in front of the book the
// thing is when the run stops; `is`: what to look for.
// (the keys for jumping, as keycaps on a card: a controller's A, or Space and ↑)
const jumpKeys = () => (padUI() ? ["A", "↑"] : ["Space", "↑"]);
const STORY_TIPS = {
  stack: {
    name: "Book stack ahead!",
    line: "Books piled up on the floor, right in your path.",
    cards: () => [
      {
        title: "Book stacks",
        how: hintFor("Press Space or ↑ to jump over them. Hold it to jump higher.", "Press A to jump over them. Hold it to jump higher.", "Tap to jump over them. Hold your tap to jump higher."),
        pic: "jump",
        over: "stack",
        keys: jumpKeys(),
      },
    ],
    ahead: 260,
    is: (o) => o.type === "stack" && !o.toy && o.y + o.h >= FLOOR - 1, // (a stack of books on the floor)
  },
  duck: {
    name: "Duck under it!",
    line: "A table piled high with books: too tall to jump over.",
    cards: () => [
      {
        title: "Duck",
        how: hintFor("Press ↓ or S and hold it to slide under the table.", "Pull ↓ or press B, and hold it to slide under the table.", "Swipe down and hold to slide under the table."),
        pic: "duck",
        around: "table",
        keys: padUI() ? ["B", "↓"] : ["↓", "S"],
      },
    ],
    ahead: 260,
    is: (o) => o.type === "platform" && o.loaded,
  },
  couch: {
    name: "Couch ahead!",
    line: "Springy cushions: bounce off them for a super-high jump.",
    cards: () => [
      {
        title: "Bounce!",
        how: hintFor("Land on it, then press Space again to bounce sky-high.", "Land on it, then press A again to bounce sky-high.", "Land on it, then tap again to bounce sky-high."),
        pic: "bounce",
        keys: jumpKeys(),
      },
    ],
    ahead: 260,
    is: (o) => o.type === "platform" && o.kind === "couch",
  },
  hardcover: {
    name: "Hardcover ahead!",
    line: "A glowing power-up, right in your path. Run into it to grab it!",
    cards: () => [
      {
        title: "Hardcover",
        how: `Run into it to grab it. A tough cover wraps around you for up to ${POWERS.shield.ms / 1000} seconds.`,
        pic: "power",
        power: "shield",
      },
      {
        title: "It takes the bump",
        how: "Your next bump breaks the cover instead of hurting you: no heart or pages lost.",
        pic: "shieldBreak",
      },
    ],
    ahead: 300,
    pickup: true, // (watching the pickups, not the obstacles)
    is: (p) => p.kind === "power",
  },
  // (not watched for: shown as a level with `briefing` starts, before its countdown)
  goals: {
    name: "Your goals",
    button: "Let's go!",
    line: () => storyLine(story.level),
    cards: () => {
      const lv = story.level,
        n = lv.pages,
        marks = lv.bookmarks ? lv.bookmarks.length : 0;
      return [
        {
          title: n != null ? `Find ${n} pages` : "Find Dewey's pages",
          how: n != null ? `Reach the end for ★, ${Math.ceil(n * 0.5)} pages for ★★, all ${n} for ★★★.` : "The more you find, the more stars you earn.",
          pic: "run",
          items: iconPage,
          count: 1,
        },
        marks && {
          title: `${marks} hidden bookmark${marks === 1 ? "" : "s"}`,
          how: "Tucked away in hard-to-reach spots. Can you find them all?",
          pic: "icon",
          icon: iconBookmarkPick,
        },
        {
          title: "Reach the end",
          how: `Each bump costs a heart. Lose all ${LIVES} and you'll try again.`,
          pic: "row",
          item: iconHeart,
          count: LIVES,
        },
      ].filter(Boolean);
    },
  },
  // (Endless Mode's goals, before an Endless run's countdown: the same cards as How to play's Goal screen)
  // (only three cards fit, so Next goes on to a second screen: jumping and ducking)
  endless: {
    name: "Your goals",
    line: ENDLESS_GOAL_LINE,
    cards: endlessGoalCards,
    next: "endlessControls",
  },
  // (How to play's Controls screen, just Jump and Duck: keys, controller or touch, whichever you have)
  endlessControls: {
    name: "Controls",
    line: () => HOWTO_PAGES.find((p) => p.name === "Controls").tip(),
    cards: () => HOWTO_PAGES.find((p) => p.name === "Controls").rows().slice(0, 2),
    button: "Let's go!",
    back: "endless", // (‹ Back, or Esc: the goals again)
  },
};
// The level's last page (`lastPage`): once nothing new is coming (the clear stretch before the goal),
// one page on the floor, just ahead, where running straight on collects it. Called every frame.
function storyLastPage() {
  if (!story.level.lastPage || story.lastPageOut || !storyNearEnd() || story.finishing) return;
  story.lastPageOut = true;
  addPickup(W + 60, FLOOR - 34);
}
// How far the run still has to go before it stops for a tip (the first time something the level
// explains comes up), or null if there's none coming. Each tip stops the run with its thing `ahead`
// px in front of the book. (tipNext: which tip that is.)
let tipNext = null;
function tipGap() {
  const tips = story.level.tips;
  if (!tips || state !== "running") return null;
  let gap = null;
  for (const name of tips) {
    if (story.tipsShown[name]) continue;
    const t = STORY_TIPS[name],
      watch = t.pickup ? pickups : obstacles, // (most tips are about an obstacle; some, a pickup)
      o = watch.find((ob) => t.is(ob) && ob.x > player.x + player.w);
    if (!o) continue;
    const g = o.x - (player.x + player.w) - t.ahead;
    if (gap == null || g < gap) {
      gap = g;
      tipNext = name;
    }
  }
  return gap;
}
// Slowing to a stop for a tip: once its stopping point is within TIP_BRAKE, the run eases down
// (steadily, like braking) to a standstill right there, and the tip opens. After it, the run picks
// up again over TIP_RAMP_MS. Returns how much of the run's usual speed to go at (asked every frame
// by update, in deweydash.js).
const TIP_BRAKE = 120, // px
  TIP_RAMP_MS = 700;
function storyTipBrake() {
  let k = story.rampFrom != null ? Math.min(1, (runTime - story.rampFrom) / TIP_RAMP_MS) : 1;
  const g = tipGap();
  if (g != null && g < TIP_BRAKE) k = Math.min(k, Math.sqrt(Math.max(0, g) / TIP_BRAKE)); // (v² falls in step with the distance left)
  return Math.max(0.03, k); // (a crawl at the very least, so it always gets there)
}
// Called every frame of a run: once the run has slowed to its stop for a tip, open it (the tip
// screen; Got it counts down again).
function storyWatchTips() {
  storyLastPage(); // (and the level's last page, once the end is near)
  const g = tipGap();
  if (g == null || g > 1) return;
  story.tipsShown[tipNext] = true;
  story.rampFrom = runTime; // (it picks up again afterwards)
  openStoryTip(tipNext);
  sfx.select();
}
let tipName = null, // the tip showing (a key of STORY_TIPS)
  tipAt = 0; // when it opened (its cards deal in)
function openStoryTip(name) {
  if (story) tipsSeen.add(story.level.id + ":" + name); // (trying again skips it)
  tipName = name;
  tipAt = performance.now();
  duckHeld = false;
  state = "tip";
  selected.tip = 0;
  useTipButtons();
}
// The tip's buttons: one, or with ‹ Back if it has a screen before it. The main one says Next
// (if it has a screen after), or the tip's own word, or Got it.
function useTipButtons() {
  const t = STORY_TIPS[tipName];
  BUTTONS.tip = t.back ? BUTTONS.tipBack : BUTTONS.tipOne;
  BUTTONS.tip[0].label = t.next ? "Next" : t.button || "Got it";
}
// A tip, drawn like a screen of How to play: its name and line, its card(s), the button, the hint.
function drawStoryTip() {
  const t = STORY_TIPS[tipName];
  dimBehindCard();
  ctx.fillStyle = "rgba(10, 6, 4, 0.6)"; // (as dark as How to play)
  fillScreen();
  drawHowtoHeading(t.name, typeof t.line === "function" ? t.line() : t.line);
  // more than one screen (`back` / `next`): How to play's progress bar, one segment per screen
  let at = 0,
    first = tipName;
  while (STORY_TIPS[first].back) {
    first = STORY_TIPS[first].back;
    at++;
  }
  let n = 1;
  for (let k = first; STORY_TIPS[k].next; k = STORY_TIPS[k].next) n++;
  if (n > 1) drawHowtoSegs(n, at);
  drawHowtoCards(t.cards(), tipAt, performance.now());
  drawButtons();
  if (!tall()) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#c9bc9f";
    ctx.font = "11px Fraunces, Georgia, serif";
    ctx.fillText(hintFor("Enter when you're ready", "A when you're ready", "Tap the button when you're ready"), W / 2, BUTTON_Y.wide.tip + 56);
  }
}

// ---------- Toys (the children's wing) ----------
// In a level's `toys` scenes, some of the book stacks are toys instead: a tower of building
// bricks (sometimes two side by side, like a double stack), a teddy bear or a stuffed bunny. They
// work just like stacks (a "stack" obstacle, jumped over, with pages over them); only the look is
// different (see drawToy). spawnObstacle, in deweydash.js, asks storyToy first.
const TOY_COLORS = ["#d94b4b", "#3f74d1", "#f2c14e", "#4caf50", "#f39c4a"];
const BRICK_W = 30,
  BRICK_H = 13;
// The toy to put in place of the next stack (if the scene coming up has toys), or null.
function storyToy() {
  const t = story.level.toys;
  if (!t || !t.scenes.includes(sceneAhead().index) || Math.random() >= t.chance) return null;
  return ["blocks", "blocks", "bear", "bunny"][(Math.random() * 4) | 0];
}
function spawnToy(kind) {
  const x = W + 10,
    color = TOY_COLORS[(Math.random() * TOY_COLORS.length) | 0];
  let o;
  if (kind === "blocks") {
    // one tower of 2–4 bricks, or two (the second a brick shorter), each brick a different colour
    const towers = has("double") && Math.random() < 0.35 ? 2 : 1,
      n = 2 + ((Math.random() * 3) | 0),
      bricks = [];
    let c = (Math.random() * TOY_COLORS.length) | 0;
    for (let t = 0; t < towers; t++)
      for (let i = 0; i < n - t; i++)
        bricks.push({ dx: t * (BRICK_W + 3) + (i % 2 ? 2 : 0), dy: (i + 1) * BRICK_H, color: TOY_COLORS[c++ % TOY_COLORS.length] });
    const h = n * BRICK_H + 3; // (+ the studs on top)
    o = { x, y: FLOOR - h, w: towers * BRICK_W + (towers - 1) * 3 + 2, h, bricks };
  } else if (kind === "bear") o = { x, y: FLOOR - 44, w: 42, h: 44 };
  else o = { x, y: FLOOR - 50, w: 34, h: 50 };
  Object.assign(o, { type: "stack", toy: kind, books: [], color, seed: Math.random() * 1000 });
  obstacles.push(o);
  return o;
}
// A toy sitting on top of a piece of furniture (o), past where you'd land on it: jump it from up
// there. (It's drawn sitting on whatever's under it: see drawToy.)
function storyToyOn(o, kind) {
  const t = spawnToy(kind);
  t.x = o.x + o.w * 0.6;
  t.y = o.y - t.h;
}
function drawToy(o) {
  const { x, w } = o,
    base = o.y + o.h; // (the floor, or the furniture it's sitting on)
  oval(x + w / 2, base - 1, w * 0.6, 3.5, "rgba(0, 0, 0, 0.25)"); // shadow
  if (o.toy === "blocks") {
    for (const b of o.bricks) {
      const bx = x + b.dx,
        by = base - b.dy;
      R(bx, by, BRICK_W, BRICK_H, b.color);
      R(bx, by, BRICK_W, 2, "rgba(255, 255, 255, 0.3)");
      R(bx, by + BRICK_H - 2, BRICK_W, 2, "rgba(0, 0, 0, 0.22)");
      R(bx + BRICK_W - 3, by, 3, BRICK_H, "rgba(0, 0, 0, 0.12)");
      // the studs on top
      for (let k = 0; k < 3; k++) {
        R(bx + 4 + k * 9, by - 3, 6, 3, b.color);
        R(bx + 4 + k * 9, by - 3, 6, 1, "rgba(255, 255, 255, 0.35)");
      }
    }
    return;
  }
  const by = base,
    cx = x + w / 2;
  if (o.toy === "bear") {
    // a teddy bear sitting on the floor: legs out front, round tummy, round head, a bow tie
    const fur = "#a8733f",
      light = "#d6a873";
    oval(cx - 12, by - 7, 9, 7, fur); // feet
    oval(cx + 12, by - 7, 9, 7, fur);
    oval(cx - 12, by - 7, 5, 4, light);
    oval(cx + 12, by - 7, 5, 4, light);
    oval(cx, by - 18, 15, 14, fur); // body
    oval(cx, by - 16, 9, 9, light); // tummy
    oval(cx - 15, by - 21, 5, 8, fur); // arms
    oval(cx + 15, by - 21, 5, 8, fur);
    oval(cx - 11, by - 41, 6, 6, fur); // ears
    oval(cx + 11, by - 41, 6, 6, fur);
    oval(cx - 11, by - 41, 3, 3, light);
    oval(cx + 11, by - 41, 3, 3, light);
    oval(cx, by - 33, 12, 11, fur); // head
    oval(cx, by - 30, 6, 4.5, light); // muzzle
    oval(cx, by - 32, 2.2, 1.6, "#2b1a10"); // nose
    oval(cx - 5, by - 36, 1.8, 1.8, "#1a1512"); // eyes
    oval(cx + 5, by - 36, 1.8, 1.8, "#1a1512");
    poly(o.color, cx - 7, by - 26, cx, by - 23.5, cx - 7, by - 21); // bow tie
    poly(o.color, cx + 7, by - 26, cx, by - 23.5, cx + 7, by - 21);
    oval(cx, by - 23.5, 1.8, 1.8, o.color);
    return;
  }
  // a stuffed bunny: tall floppy ears, a round body, a cotton tail peeking out
  const fur = "#eadfd3",
    pink = "#f2a7b8";
  oval(cx + 13, by - 12, 5, 5, "#ffffff"); // tail
  oval(cx - 9, by - 6, 8, 5, fur); // feet
  oval(cx + 9, by - 6, 8, 5, fur);
  oval(cx, by - 16, 13, 13, fur); // body
  oval(cx, by - 14, 7, 8, "#f7f1ea"); // tummy
  ctx.save(); // the ears, one standing, one flopped over
  ctx.translate(cx - 5, by - 38);
  ctx.rotate(-0.15);
  oval(0, -6, 4.5, 11, fur);
  oval(0, -6, 2.2, 8, pink);
  ctx.restore();
  ctx.save();
  ctx.translate(cx + 6, by - 37);
  ctx.rotate(0.9);
  oval(0, -6, 4.5, 11, fur);
  oval(0, -6, 2.2, 8, pink);
  ctx.restore();
  oval(cx, by - 32, 10, 9, fur); // head
  oval(cx - 4, by - 33, 1.6, 1.6, "#1a1512"); // eyes
  oval(cx + 4, by - 33, 1.6, 1.6, "#1a1512");
  oval(cx, by - 29.5, 1.8, 1.3, pink); // nose
  oval(cx - 6, by - 29, 2.2, 1.4, "rgba(242, 167, 184, 0.6)"); // cheeks
  oval(cx + 6, by - 29, 2.2, 1.4, "rgba(242, 167, 184, 0.6)");
  R(cx - 6, by - 24, 12, 3, o.color); // a ribbon round the neck
}

// ---------- Level 3's own pieces: the parking gate and the terraces ----------
// One of a level's `placed` pieces that isn't furniture (asked by updateObstacles, in deweydash.js).
// Returns { w, moves }: how far it reaches, and how you might be getting past it.
function storySpawnPiece(p) {
  if (p.kind === "gate") return spawnGate();
  if (p.kind === "cars") return spawnCars();
  return spawnTerrace();
}
// A line of parked vehicles on the drive, nose to tail: a car, a box truck (its tall box, then its
// lower cab), and another car. Each is something to land on and run along, like furniture: jump up
// onto the first car, jump again up onto the truck's box (run into its back and it's a smash), drop
// down onto the cab, run on across the last car, and hop off. While the book is up on them the
// view rises a little (their `lift`: see updatePlayer, in deweydash.js), so it can see what's
// ahead of it up there.
const CAR_COLORS = [
  { body: "#f1f1ee", shade: "#c9cbcc", trim: "#2b2d31" }, // white, with dark trim
  { body: "#9ea4ab", shade: "#7c8289", trim: "#2b2d31" }, // silver
  { body: "#2f4f7f", shade: "#22395c", trim: "#1c1e22" }, // dark blue
];
const VEHICLE_LIFT = 44; // px the view rises, up on the vehicles
function spawnCars() {
  const x0 = W + 10,
    gap = 14, // (narrow enough to run straight across: the book is always over one or the other)
    pick = (Math.random() * CAR_COLORS.length) | 0,
    pieces = [
      { vehicle: "car", w: 150, h: 50, color: CAR_COLORS[pick] },
      { vehicle: "box", w: 170, h: 92, gapBefore: gap },
      { vehicle: "cab", w: 62, h: 64 },
      { vehicle: "car", w: 150, h: 50, gapBefore: gap, color: CAR_COLORS[(pick + 1 + ((Math.random() * 2) | 0)) % CAR_COLORS.length] },
    ];
  let x = x0;
  for (const p of pieces) {
    x += p.gapBefore || 0;
    obstacles.push({ type: "platform", kind: "vehicle", vehicle: p.vehicle, color: p.color, x, y: FLOOR - p.h, w: p.w, h: p.h, books: [], lift: VEHICLE_LIFT, seed: Math.random() * 1000 });
    if (p.vehicle !== "cab") addPickup(x + p.w / 2, FLOOR - p.h - 34); // (a page on each roof, as the level's pacing allows)
    x += p.w;
  }
  return { w: x - x0, moves: ["high"] };
}
function drawVehicle(o) {
  if (o.vehicle === "car") drawParkedCar(o);
  else if (o.vehicle === "box") drawTruckBox(o);
  else drawTruckCab(o);
}
// A wheel: a dark tyre, a silver hub (cx, cy: its middle).
function wheel(cx, cy, r) {
  oval(cx, cy, r, r, "#1d1e21");
  oval(cx, cy, r * 0.55, r * 0.55, "#b9bec4");
  oval(cx, cy, r * 0.2, r * 0.2, "#5a5e64");
}
// A wagon parked facing right (the way the book runs): a long flat roof with rails (where you
// land), its windows, the hood and headlight at the front, a taillight at the back.
function drawParkedCar(o) {
  const { x, y, w } = o,
    c = o.color;
  oval(x + w / 2, FLOOR - 1, w * 0.5, 4, "rgba(0, 0, 0, 0.28)");
  // the body: the lower half, with the hood sloping down at the front
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.moveTo(x + 4, FLOOR - 14);
  ctx.lineTo(x + 2, y + 24);
  ctx.quadraticCurveTo(x + 4, y + 18, x + 16, y + 18);
  ctx.lineTo(x + w - 46, y + 18);
  ctx.quadraticCurveTo(x + w - 6, y + 22, x + w - 2, y + 30);
  ctx.lineTo(x + w, FLOOR - 14);
  ctx.closePath();
  ctx.fill();
  R(x + 2, FLOOR - 22, w - 2, 8, c.trim); // the dark cladding along the bottom
  // the cabin and its roof (flat across: it's what you run along)
  poly(c.body, x + 10, y + 19, x + 18, y + 2, x + w - 56, y + 2, x + w - 40, y + 19);
  R(x + 14, y - 1, w - 70, 4, "#3a3d42"); // the roof rails
  poly("#2d3a46", x + 17, y + 17, x + 22, y + 6, x + 56, y + 6, x + 56, y + 17); // the windows
  poly("#2d3a46", x + 60, y + 17, x + 60, y + 6, x + w - 60, y + 6, x + w - 46, y + 17);
  R(x + 30, y + 8, 4, 8, "rgba(255, 255, 255, 0.22)");
  R(x + 58, y + 19, 1.5, FLOOR - y - 40, c.shade); // the door seams
  R(x + w - 62, y + 19, 1.5, FLOOR - y - 40, c.shade);
  R(x + w - 8, y + 26, 7, 5, "#f4e7b0"); // headlight
  R(x + 2, y + 24, 5, 6, "#c0392b"); // taillight
  wheel(x + 30, FLOOR - 12, 12);
  wheel(x + w - 32, FLOOR - 12, 12);
}
// The box truck's box, its back facing you: tall, plain white, a roll-up door at the back, a
// colored stripe along the side, and two pairs of wheels underneath. Its flat top is where you run.
function drawTruckBox(o) {
  const { x, y, w } = o;
  oval(x + w / 2, FLOOR - 1, w * 0.5, 4, "rgba(0, 0, 0, 0.28)");
  R(x, FLOOR - 24, w + 4, 8, "#2b2d31"); // the frame
  R(x, y, w, FLOOR - 24 - y, "#f4f3ef");
  R(x, y, w, 4, "#dcdbd6");
  R(x + 14, y + 22, w - 20, 10, "#3f7dc0"); // the stripe
  R(x + 14, y + 34, w - 20, 3, "#e8b52a");
  R(x, y, 10, FLOOR - 24 - y, "#d8d7d2"); // the back, with its roll-up door's ribs
  for (let k = y + 8; k < FLOOR - 28; k += 8) R(x + 1, k, 8, 1, "#b9b8b3");
  R(x - 2, FLOOR - 26, 14, 4, "#3a3a3a"); // the bumper
  R(x + 2, FLOOR - 34, 4, 6, "#c0392b"); // tail light
  for (const wx of [x + 34, x + 62]) wheel(wx, FLOOR - 12, 12);
}
// The box truck's cab, facing right, lower than the box: drop down onto its roof from the box.
function drawTruckCab(o) {
  const { x, y, w } = o;
  oval(x + w / 2, FLOOR - 1, w * 0.5, 4, "rgba(0, 0, 0, 0.28)");
  ctx.fillStyle = "#f4f3ef";
  ctx.beginPath();
  ctx.moveTo(x, FLOOR - 16);
  ctx.lineTo(x, y);
  ctx.lineTo(x + w - 18, y);
  ctx.lineTo(x + w - 2, y + 26);
  ctx.lineTo(x + w, FLOOR - 16);
  ctx.closePath();
  ctx.fill();
  poly("#2d3a46", x + 10, y + 6, x + w - 20, y + 6, x + w - 8, y + 24, x + 10, y + 24); // its window
  R(x + 14, y + 8, 4, 12, "rgba(255, 255, 255, 0.22)");
  R(x + 6, y + 28, 1.5, FLOOR - y - 46, "#c9cbcc"); // the door
  R(x + 26, y + 34, 8, 3, "#3a3a3a"); // its handle
  R(x + w - 2, y + 18, 5, 3, "#2b2d31"); // the mirror
  R(x, FLOOR - 24, w + 2, 8, "#2b2d31");
  R(x + w - 6, y + 32, 6, 6, "#f4e7b0"); // headlight
  R(x + w - 4, FLOOR - 22, 8, 6, "#3a3a3a"); // the bumper
  wheel(x + w - 24, FLOOR - 12, 12);
}
// The parking garage's gate arm: a striped arm that swings down across the walk and back up, over
// and over, on a steady beat. Up, you run straight under it. Down, it's at head height: duck and
// slide under it, or jump over it. Caught as it swings, it's a bump (a heart, like a bird), not a
// smash. Its post stands on the curb beside the walk, so only the arm is in the way.
const GATE = { len: 104, pivotY: FLOOR - 40, cycle: 2600, down: 1000, swing: 350, up: 1.45 };
function spawnGate() {
  const o = { type: "gate", x: W + 10, y: GATE.pivotY - GATE.len, w: GATE.len + 16, h: FLOOR - (GATE.pivotY - GATE.len), books: [], phase: Math.random() * GATE.cycle };
  obstacles.push(o);
  addPickup(o.x + GATE.len * 0.45, FLOOR - 30); // a page under the arm, for whoever ducks under it (or times it)
  return { w: o.w, moves: ["jump", "duck"] };
}
// How far up the arm is (0 down, GATE.up up), from where it is in its beat.
function gateAngle(o) {
  const t = (runTime + o.phase) % GATE.cycle,
    ease = (p) => p * p * (3 - 2 * p),
    hold = (GATE.cycle - GATE.down - 2 * GATE.swing); // (how long it stays up)
  if (t < GATE.down) return 0;
  if (t < GATE.down + GATE.swing) return ease((t - GATE.down) / GATE.swing) * GATE.up;
  if (t < GATE.down + GATE.swing + hold) return GATE.up;
  return ease(1 - (t - GATE.down - GATE.swing - hold) / GATE.swing) * GATE.up;
}
const gatePivotX = (o) => o.x + o.w - 8;
// Is the arm in the book's way (p: its box)? Points along the arm, from a little out from the post
// (its root is over the curb, beside the walk) to the tip.
function gateHits(o, p) {
  const a = gateAngle(o),
    px = gatePivotX(o);
  for (let i = 2; i <= 12; i++) {
    const k = i / 12,
      ax = px - Math.cos(a) * GATE.len * k,
      ay = GATE.pivotY - Math.sin(a) * GATE.len * k;
    if (ax > p.x + 4 && ax < p.x + p.w - 4 && ay > p.y + 3 && ay < p.y + p.h) return true;
  }
  return false;
}
function drawGate(o) {
  const px = gatePivotX(o),
    a = gateAngle(o);
  // the curb island beside the walk, and the gate's yellow post on it (a step back, so the book
  // runs past in front of it)
  R(px - 26, FLOOR - 12, 52, 5, "#d7d4cc");
  R(px - 26, FLOOR - 8, 52, 3, "#e8b52a");
  R(px - 10, FLOOR - 50, 22, 40, "#e8b52a");
  R(px + 6, FLOOR - 50, 6, 40, "#c4931c");
  R(px - 10, FLOOR - 52, 22, 3, "#3a3a3a");
  R(px - 6, FLOOR - 32, 10, 6, "#2a2a2a"); // (its little card reader)
  // the arm: white with red stripes, a red reflector at its tip
  ctx.save();
  ctx.translate(px, GATE.pivotY);
  ctx.rotate(Math.PI + a);
  R(0, -3, GATE.len, 6, "#f6f6f2");
  ctx.fillStyle = "#d22a2f";
  for (let s = 8; s < GATE.len - 6; s += 18) {
    ctx.beginPath();
    ctx.moveTo(s, 3);
    ctx.lineTo(s + 8, -3);
    ctx.lineTo(s + 16, -3);
    ctx.lineTo(s + 8, 3);
    ctx.fill();
  }
  R(GATE.len - 5, -3.5, 5, 7, "#d22a2f");
  ctx.restore();
  oval(px, GATE.pivotY, 5, 5, "#3a3a3a"); // the hub
  oval(px, GATE.pivotY, 2, 2, "#9a9a9a");
}
// Heritage Green's terraces: wide concrete steps topped with grass, up three and back down. The
// book runs up and down them by itself (each step is low: see STEP_UP), so on top it's running
// higher than ever: a page waits up there, and maybe one of the level's bookmarks, so high above
// the top step that only a jump from up there reaches it.
const TERRACE = { rise: 16, run: 46, top: 160 };
function spawnTerrace() {
  const r = TERRACE.rise,
    u = TERRACE.run,
    steps = [];
  let at = 0;
  for (const [lv, len] of [[1, u], [2, u], [3, TERRACE.top], [2, u], [1, u]]) {
    steps.push([at, at + len, FLOOR - lv * r]);
    at += len;
  }
  const o = { type: "platform", kind: "terrace", x: W + 10, y: FLOOR - 3 * r, w: at, h: 3 * r, books: [], steps, seed: Math.random() * 1000 };
  obstacles.push(o);
  const mid = o.x + 2 * u + TERRACE.top / 2;
  addPickup(mid - 40, o.y - 34);
  if (storyBookmark("terrace")) addStoryBookmark(mid + 20, GROUND_Y - 194); // (out of reach from the ground: see the note above)
  return { w: o.w, moves: ["high"] };
}
function drawTerrace(o) {
  oval(o.x + o.w / 2, FLOOR - 1, o.w * 0.5, 4, "rgba(0, 0, 0, 0.22)");
  for (const [a, b, top] of o.steps) {
    const x = o.x + a,
      w = b - a;
    R(x, top, w, FLOOR - top, "#cfcac0"); // the concrete
    R(x, top, w, 5, "#c2b07c"); // its grass, gone gold for the winter
    R(x, top + 5, w, 2, "#a9a497");
    for (let k = 0; k * 9 < w; k++) R(x + k * 9 + hash(k, top | 0) * 4, top - 1, 2, 2, "#b19e68"); // (tufts)
  }
  // the risers' shading, so each step reads
  for (let i = 1; i < o.steps.length; i++) {
    const [a, , top] = o.steps[i],
      prev = o.steps[i - 1][2];
    if (top < prev) R(o.x + a, top + 7, 3, prev - top, "rgba(0, 0, 0, 0.12)");
    else R(o.x + a - 3, prev + 7, 3, top - prev, "rgba(255, 255, 255, 0.25)");
  }
}

// Outdoors, the hazards are what you'd find on a library lawn.
function storyDrawObstacle(o) {
  if (o.toy) {
    drawToy(o); // (the children's wing's toys, in place of book stacks)
    return true;
  }
  if (o.type === "gate") {
    drawGate(o);
    return true;
  }
  if (o.steps) {
    drawTerrace(o);
    return true;
  }
  if (o.vehicle) {
    drawVehicle(o);
    return true;
  }
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
// a darting blue jay, or a crow that shakes, squawks "!" and charges. A diving swallow has its own
// look (see drawSwallow).
function drawBird(o) {
  if (o.dive) return drawSwallow(o);
  const cx = o.x + o.w / 2,
    cy = o.y + o.h / 2;
  let shake = 0;
  if (o.charge) {
    const cs = chargeState(o);
    if (cs.winding) {
      shake = Math.sin(runTime * 0.09) * 2;
      label("!", cx, o.y - 8, 18, "#c0392b", "Fraunces, Georgia, serif");
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
// A barn swallow coming down out of the sky (a diver: see diveBottom, in deweydash.js): glossy navy
// back and long pointed wings, a rusty throat, a white belly and a deeply forked tail. It tips
// along its path, nose down as it dives, and pulls up or dips again when it commits. Its shadow
// on the walk grows as it comes down.
function drawSwallow(o) {
  const cx = o.x + o.w / 2,
    cy = o.y + o.h / 2,
    d = o.x - (player.x + player.w),
    tilt = -Math.atan2(diveBottom(o, d - 12) - diveBottom(o, d), 12) * 0.8, // (the way it's heading)
    near = Math.max(0, Math.min(1, 1 - (FLOOR - (o.y + o.h)) / 200));
  oval(cx, FLOOR - 1, 6 + 8 * near, 2 + 1.5 * near, `rgba(0, 0, 0, ${0.08 + 0.12 * near})`);
  const flap = Math.sin(runTime * 0.034 + o.phase),
    navy = "#22325c",
    wingNavy = "#1a2748";
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  poly(wingNavy, -2, -2, 10, -2, 6, -3 - 16 * flap); // the far wing
  poly(navy, 9, -2, 24, -8, 17, -1, 24, 4, 9, 2); // the forked tail
  oval(0, 0, 12, 6, navy);
  oval(1, 2.5, 9, 3.5, "#f4f1ea"); // white belly
  oval(-9, -1, 5.5, 5, navy); // head
  oval(-11, 1.5, 3.5, 2.8, "#c8642e"); // rusty throat
  poly("#2a2a2a", -14, -1.5, -19, 0, -14, 1);
  oval(-10.5, -2.5, 1.3, 1.3, "#111");
  poly(wingNavy, -4, -1, 12, -1, 3, -1 - 19 * flap); // the near wing
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
  stackRows(x + 18, x + w, 0);
  drawShelvingCart(x + 600, FLOOR, 0.9);
  // a steel trash can
  const tg = ctx.createLinearGradient(x + 300, 0, x + 322, 0);
  tg.addColorStop(0, "#d7dbdf");
  tg.addColorStop(1, "#8f959b");
  ctx.fillStyle = tg;
  ctx.fillRect(x + 300, FLOOR - 40, 22, 40);
  R(x + 298, FLOOR - 42, 26, 4, "#a7adb3");
}
// The long aisle's rows of stacks, seen end-on: one every 126 px from x0 until x1, each its maple
// end panel and the shelves past it, full of books (seed: which books), and now and then a catalog
// computer at the end.
function stackRows(x0, x1, seed) {
  const top = CEIL + 14;
  for (let k = seed, rx = x0; rx < x1; k++, rx += 126) {
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
}
// A short book truck (feet at floorY), in the background and the picture books: tan, like the
// ones in the aisle, unless given another of CART_COLORS. (Its top shelf is 48 tall at s = 1,
// with the handles standing up 22 more: where Dewey rides in the picture books.)
function drawShelvingCart(cx, floorY, s = 1, color = CART_COLORS[2]) {
  const w = 60 * s;
  drawBookTruck(cx - w / 2, floorY - 48 * s, w, floorY, color, 7, s, 22 * s);
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
  // past the carrels, a stretch of bare wall, then more rows of stacks up to the children's wing
  stackRows(x + 1330, x + w, 20);
}
// The picture-book room, where the long aisle opens into the children's wing, with the giraffe at
// its far end: a drop ceiling with disc pendant lights, pale blue-grey walls (a big lion painting,
// and a feature wall with three framed illustrations), tall grey picture-book shelves with red end
// panels, a navy sofa, a little round table with maple chairs, a maple browsing bin of face-out
// books, a curved navy bench, and big windows onto the trees.
// (Everything is placed by its spot in the scene, not on the screen, which changes every frame as
// the library scrolls: books picked by screen spot would flicker.)
const PB_SPINES = ["#e8d9c0", "#f2c14e", "#d94b4b", "#4b79d9", "#8fb7d9", "#f3a76b", "#e8e8e8", "#9bc27c", "#c9a3d9", "#3aa6a6", "#f0e0a8"];
const PB_RED = "#b3262c",
  PB_NAVY = "#2c3a68",
  PB_NAVY_LIGHT = "#3d4f88";
// A picture-book shelf, tops at `top`: grey metal, the books (thin, tall and every color) in rows
// with grey dividers, a sign or two on top, and (ends: true) red end panels.
function pictureBookShelf(sx, top, sw, rows, seed, ends = true) {
  const h = FLOOR - top,
    rowH = (h - 6) / rows;
  R(sx, top, sw, h, "#c3c8cd");
  R(sx - 2, top - 4, sw + 4, 5, "#dfe2e5"); // the top
  for (let r = 0; r < rows; r++) {
    const bottom = top + 3 + (r + 1) * rowH;
    R(sx + 2, bottom - rowH + 2, sw - 4, rowH - 2, "#e6e8ea");
    let bx = sx + 8;
    for (let k = 0; ; k++) {
      const rnd = hash(seed * 50 + r, k),
        bw = 2 + rnd * 4;
      if (bx + bw > sx + sw - 8) break;
      if (k % 11 === 10) {
        R(bx, bottom - rowH * 0.45 - 3, 3, rowH * 0.45, "#a9afb5"); // a divider
        bx += 5;
        continue;
      }
      const bh = rowH * (0.5 + hash(k + 7, seed + r) * 0.38);
      R(bx, bottom - bh - 3, bw, bh, PB_SPINES[(rnd * PB_SPINES.length) | 0]);
      bx += bw + 0.6;
    }
    R(sx + 2, bottom - 3, sw - 4, 3, "#a9afb5");
  }
  // signs standing on top
  for (let i = 0; 30 + i * 70 < sw; i++) {
    const gx = sx + 20 + i * 70 + hash(seed, i) * 20;
    R(gx, top - 18, 11, 14, "#2f5fb0");
    R(gx + 2, top - 15, 7, 5, "#e8eef8");
  }
  if (ends) {
    R(sx - 7, top - 6, 8, h + 6, PB_RED);
    R(sx + sw - 1, top - 6, 8, h + 6, PB_RED);
  }
}
// A curved navy bench on thin metal legs (cx: its middle).
function curvedBench(cx) {
  for (const lx of [-54, -20, 20, 52]) R(cx + lx, FLOOR - 16, 2.5, 16, "#a9aeb3");
  ctx.fillStyle = PB_NAVY;
  ctx.beginPath();
  ctx.moveTo(cx - 64, FLOOR - 36);
  ctx.quadraticCurveTo(cx, FLOOR - 46, cx + 64, FLOOR - 36);
  ctx.lineTo(cx + 64, FLOOR - 16);
  ctx.quadraticCurveTo(cx, FLOOR - 26, cx - 64, FLOOR - 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PB_NAVY_LIGHT; // (its top, catching the light)
  ctx.beginPath();
  ctx.moveTo(cx - 64, FLOOR - 36);
  ctx.quadraticCurveTo(cx, FLOOR - 46, cx + 64, FLOOR - 36);
  ctx.lineTo(cx + 64, FLOOR - 33);
  ctx.quadraticCurveTo(cx, FLOOR - 43, cx - 64, FLOOR - 33);
  ctx.closePath();
  ctx.fill();
}
// A maple browsing bin on casters: picture books standing face-out in two tiers (bx: its left).
function browsingBin(bx, seed) {
  R(bx, FLOOR - 62, 86, 56, "#d9b07a");
  for (let i = 0; i < 5; i++) R(bx + 5 + i * 16, FLOOR - 74 + (i % 2) * 3, 14, 20, BRIGHT[(i * 3 + seed) % BRIGHT.length]);
  R(bx + 4, FLOOR - 46, 78, 20, "#a37a48");
  for (let i = 0; i < 5; i++) R(bx + 7 + i * 15, FLOOR - 42 + (i % 2) * 2, 13, 16, BRIGHT[(i * 5 + seed + 2) % BRIGHT.length]);
  for (const ly of [FLOOR - 60, FLOOR - 26]) {
    R(bx, ly, 86, 9, "#e8c595"); // each tier's front, with its little drawer pulls
    for (let i = 0; i < 4; i++) R(bx + 11 + i * 19, ly + 3, 8, 3, "#3a2a1e");
  }
  oval(bx + 9, FLOOR - 3, 3, 3, "#333");
  oval(bx + 77, FLOOR - 3, 3, 3, "#333");
}
function scenePictureBooks(x, w) {
  // the drop ceiling
  R(x, 0, w, CEIL, "#eef0f2");
  for (let i = 0; i * 50 < w; i++) R(x + i * 50, 0, 1, CEIL, "#d7dbdf");
  R(x, 21, w, 1, "#d7dbdf");
  R(x, 42, w, 1, "#d7dbdf");
  for (const vx of [260, 760]) R(x + vx, 25, 44, 12, "#d7dbdf"); // air vents
  // the walls
  R(x, CEIL, w, FLOOR - CEIL, "#c8d2dc");
  R(x + 270, CEIL, 340, FLOOR - CEIL, "#d4dce4"); // the feature wall, standing forward
  // a big lion painting in a black frame
  const px = x + 70,
    py = CEIL + 8;
  R(px, py, 84, 104, "#1d1d1f");
  R(px + 4, py + 4, 76, 96, "#c98a3a");
  oval(px + 42, py + 50, 32, 40, "#b5702c"); // mane
  oval(px + 42, py + 56, 17, 24, "#dda55a"); // face
  oval(px + 35, py + 50, 2.5, 1.6, "#4a2c12");
  oval(px + 49, py + 50, 2.5, 1.6, "#4a2c12");
  poly("#6b3a1a", px + 38, py + 64, px + 46, py + 64, px + 42, py + 69); // nose
  // three framed illustrations, in clear mounts
  const art = [["#bfe1f2", "#7fb86a", "#c62a2f"], ["#f3e3c8", "#c98a6a", "#b3262c"], ["#2d3d78", "#f2d36b", "#ffffff"]];
  art.forEach(([sky, ground, accent], i) => {
    const fx = x + 330 + i * 82;
    R(fx - 5, CEIL + 34, 70, 92, "rgba(255, 255, 255, 0.45)");
    R(fx, CEIL + 39, 60, 82, "#f8f9fb");
    R(fx + 6, CEIL + 45, 48, 70, sky);
    oval(fx + 30, CEIL + 106, 22, 10, ground);
    R(fx + 22 + i * 4, CEIL + 70 + i * 4, 7, 18, accent); // (a figure, or a bird in the night sky)
    oval(fx + 25 + i * 4, CEIL + 67 + i * 4, 4, 4, i === 2 ? accent : "#e9c8a0");
  });
  // big windows onto the trees, and the exit sign
  const wx = x + 640;
  R(wx, CEIL + 8, 200, FLOOR - CEIL - 60, "#9aa6b2");
  R(wx + 5, CEIL + 13, 190, FLOOR - CEIL - 70, "#bfe0c9");
  for (let i = 0; i < 7; i++) oval(wx + 18 + i * 27, CEIL + 50 + hash(i, 640) * 40, 24, 22, i % 2 ? "#7fb26a" : "#93c27c");
  for (const mx of [70, 132]) R(wx + mx, CEIL + 13, 3, FLOOR - CEIL - 70, "#9aa6b2");
  R(x + 600, CEIL + 6, 26, 11, "#f4f4f4");
  label("EXIT", x + 613, CEIL + 15, 8, "#c62a2f");
  // disc pendant lights, each hanging on a pair of white rods
  for (let lx = x + 110; lx < x + w; lx += 200) {
    R(lx - 5, 0, 1.5, 40, "#e9ebee");
    R(lx + 3.5, 0, 1.5, 40, "#e9ebee");
    oval(lx, 43, 30, 6, "#b9bec4");
    oval(lx, 44, 16, 3, "#fff6dc");
  }
  carpet(x, w, "#8a8174", "#6f675b");
  // the shelves: tall ones either side, the low ones under the feature wall
  pictureBookShelf(x + 14, FLOOR - 108, 220, 4, 1);
  pictureBookShelf(x + 262, FLOOR - 82, 356, 3, 2, false);
  pictureBookShelf(x + 652, FLOOR - 108, 150, 4, 3);
  // (the room's furniture comes along as things to jump and bounce on: see the level's `placed`)
  drawGiraffe(x + 890, FLOOR);
}
// The picture-book room's furniture, drawn into the scene (for the picture books: in the level it
// comes along as things to jump and bounce on instead).
function pictureBookRoomFurniture(x) {
  // the navy sofa against the low shelves
  const sx = x + 300;
  R(sx, FLOOR - 60, 104, 28, "#26355f");
  R(sx - 4, FLOOR - 36, 112, 26, PB_NAVY);
  R(sx - 4, FLOOR - 36, 112, 3, PB_NAVY_LIGHT);
  R(sx + 2, FLOOR - 10, 3, 10, "#555");
  R(sx + 99, FLOOR - 10, 3, 10, "#555");
  // a little round table with a red top, and maple chairs
  const tx = x + 476;
  for (const [chx, back] of [[tx - 50, 0], [tx + 32, 15]]) {
    R(chx + back, FLOOR - 50, 3, 26, "#d29a55"); // its back
    R(chx, FLOOR - 26, 18, 4, "#d29a55"); // its seat
    R(chx + 1, FLOOR - 22, 2, 22, "#333");
    R(chx + 15, FLOOR - 22, 2, 22, "#333");
  }
  R(tx - 2, FLOOR - 36, 4, 34, "#555");
  oval(tx, FLOOR - 2, 14, 2, "#555");
  oval(tx, FLOOR - 38, 32, 5, "#c4473a");
  R(tx - 32, FLOOR - 38, 64, 3, "#8e2f27");
  // the browsing bin, and the curved bench in front
  browsingBin(x + 536, 4);
  curvedBench(x + 196);
}
// The giraffe statue by the children's wing (feet at floorY), as it really is: papier-mâché in
// rust-brown paper, mottled rather than spotted, with the strips' edges showing. Very long thin
// legs, a near-upright neck, a boxy head looking up, short horns and ears with dark tips, and a
// daisy at each ear (blue and red). It stands on green turf inside a clear case that comes up to
// its knees, with a "please do not touch" sign on the front.
const GIRAFFE_PAPER = "#b5733c",
  GIRAFFE_DARK = "#8a5129", // the far legs, the muzzle
  GIRAFFE_TIP = "#2a1f1a"; // the hooves and the tips of the horns and ears
// The body and neck, as one path (t: the top of the legs).
function giraffeBodyPath(cx, floorY, t) {
  ctx.beginPath();
  ctx.moveTo(cx - 32, t - 2); // rump
  ctx.quadraticCurveTo(cx - 30, t - 24, cx - 6, t - 24); // back
  ctx.lineTo(cx + 10, t - 28); // withers
  ctx.quadraticCurveTo(cx + 18, t - 60, cx + 25, floorY - 194); // up the back of the neck
  ctx.lineTo(cx + 38, floorY - 192); // (the head covers the top)
  ctx.quadraticCurveTo(cx + 38, t - 50, cx + 34, t - 10); // down the front of the neck
  ctx.quadraticCurveTo(cx + 34, t + 6, cx + 22, t + 8); // chest
  ctx.lineTo(cx - 22, t + 8); // belly
  ctx.quadraticCurveTo(cx - 34, t + 6, cx - 32, t - 2);
  ctx.closePath();
}
// One long thin leg, a little narrower below the knee, with its hoof (x: its middle).
function giraffeLeg(x, top, floorY, color) {
  const bottom = floorY - 12,
    knee = top + (bottom - top) * 0.55;
  poly(color, x - 4, top, x + 4, top, x + 3.2, knee, x + 2.6, bottom - 5, x - 2.6, bottom - 5, x - 3.2, knee);
  R(x - 0.5, top + 6, 1.4, bottom - top - 14, "rgba(240, 200, 150, 0.35)"); // (the light on its front)
  R(x - 3, bottom - 6, 6, 6, GIRAFFE_TIP);
}
// A fake daisy, of radius r.
function daisy(x, y, r, petal) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = petal;
  for (let k = 0; k < 14; k++) {
    ctx.rotate((Math.PI * 2) / 14);
    ctx.beginPath();
    ctx.ellipse(r * 0.55, 0, r * 0.5, r * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  oval(x, y, r * 0.3, r * 0.3, "#d8c23a");
}
function drawGiraffe(cx, floorY) {
  const t = floorY - 110; // the top of the legs
  // the base: a pale plinth with green turf on it
  R(cx - 44, floorY - 4, 88, 4, "#cfd4d8");
  R(cx - 42, floorY - 12, 84, 8, "#4c8a3a");
  for (let i = 0; i < 14; i++) R(cx - 40 + i * 6, floorY - 14 + hash(i, 7) * 2, 2, 3, "#5f9e48");
  // the far legs, then the tail
  giraffeLeg(cx - 14, t, floorY, GIRAFFE_DARK);
  giraffeLeg(cx + 25, t, floorY, GIRAFFE_DARK);
  ctx.strokeStyle = GIRAFFE_DARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 31, t - 6);
  ctx.quadraticCurveTo(cx - 38, t + 10, cx - 36, t + 34);
  ctx.stroke();
  oval(cx - 36, t + 36, 2.5, 4, GIRAFFE_TIP);
  // the body and neck, in mottled paper with the strips' edges showing
  giraffeBodyPath(cx, floorY, t);
  ctx.fillStyle = GIRAFFE_PAPER;
  ctx.fill();
  ctx.save();
  giraffeBodyPath(cx, floorY, t);
  ctx.clip();
  for (let i = 0; i < 30; i++) {
    const px = cx - 34 + hash(i, 3) * 74,
      py = floorY - 196 + hash(3, i) * 116;
    oval(px, py, 5 + hash(i, 5) * 7, 4 + hash(5, i) * 5, "rgba(92, 50, 24, 0.3)");
  }
  for (let i = 0; i < 14; i++) {
    const px = cx - 30 + hash(i, 11) * 68,
      py = floorY - 190 + hash(11, i) * 104;
    oval(px, py, 3 + hash(i, 13) * 5, 2 + hash(13, i) * 2, "rgba(236, 196, 140, 0.35)");
  }
  ctx.strokeStyle = "rgba(70, 38, 18, 0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const sy = floorY - 186 + i * 13, // (the seams wrap around the neck, then the body)
      sx = cx + (i < 6 ? 14 : -26 + hash(i, 17) * 30);
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 26, sy - 6 - hash(17, i) * 6);
  }
  ctx.stroke();
  ctx.restore();
  // the near legs
  giraffeLeg(cx - 24, t, floorY, GIRAFFE_PAPER);
  giraffeLeg(cx + 15, t, floorY, GIRAFFE_PAPER);
  // the head, tipped back a little to look up: boxy, with a blunt muzzle
  ctx.save();
  ctx.translate(cx + 33, floorY - 199);
  ctx.rotate(-0.35);
  daisy(-11, -11, 7, "#3f7fd0"); // (the blue daisy, on the far ear)
  poly(GIRAFFE_DARK, -7, -7, -18, -15, -14, -4); // far ear
  oval(-17, -14, 2, 1.6, GIRAFFE_TIP);
  R(-6, -17, 3.5, 10, GIRAFFE_PAPER); // the horns
  R(-1, -18, 3.5, 11, GIRAFFE_PAPER);
  R(-6, -18, 3.5, 3, GIRAFFE_TIP);
  R(-1, -19, 3.5, 3, GIRAFFE_TIP);
  ctx.fillStyle = GIRAFFE_PAPER;
  roundRect(-10, -8, 27, 15, 4);
  R(10, -6, 7, 12, GIRAFFE_DARK); // muzzle
  R(10, 3, 7, 1, GIRAFFE_TIP); // mouth
  R(-6, -7, 14, 2, "rgba(236, 196, 140, 0.4)"); // (the light along its brow)
  oval(3, -3, 2.4, 2.4, "#1b1512");
  oval(3.6, -3.7, 0.8, 0.8, "#ffffff");
  poly(GIRAFFE_PAPER, -8, -4, -20, -6, -13, 2); // near ear
  oval(-19, -5.5, 2, 1.6, GIRAFFE_TIP);
  daisy(-9, -1, 7, "#c2264b"); // (the red daisy, on the near ear)
  ctx.restore();
  // the clear case around its legs, up to the knees, with the sign on the front
  const caseTop = floorY - 64;
  R(cx - 42, caseTop, 84, floorY - 12 - caseTop, "rgba(225, 240, 250, 0.14)");
  R(cx - 42, caseTop, 84, 1, "rgba(255, 255, 255, 0.7)");
  R(cx - 38, caseTop - 4, 84, 1, "rgba(255, 255, 255, 0.45)"); // (its back edge, just above)
  R(cx - 42, caseTop, 1, floorY - 12 - caseTop, "rgba(255, 255, 255, 0.6)");
  R(cx + 41, caseTop, 1, floorY - 12 - caseTop, "rgba(255, 255, 255, 0.6)");
  poly("rgba(255, 255, 255, 0.16)", cx - 30, caseTop + 1, cx - 18, caseTop + 1, cx - 34, floorY - 12, cx - 41, floorY - 12); // glare
  R(cx - 8, floorY - 54, 16, 20, "#9fd5dc");
  for (let i = 0; i < 3; i++) R(cx - 5, floorY - 50 + i * 4, 10, 1.5, "#e07b39");
  R(cx + 2, floorY - 39, 2, 4, "#e0a040");
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
  label("One World, Many Stories", x + 160, CEIL + 42, 15, "#b8322a", "Fraunces, Georgia, serif");
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
    label(abc[i % 26], lx, CEIL + 34 + (i % 3) * 3, 22, COLORFUL[i % COLORFUL.length], "Fraunces, Georgia, serif");
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
  label("THE FRIENDS SHOP", x + 345, CEIL + 29, 15, "#3a2a1e", "Fraunces, Georgia, serif");
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
// The seating area between the Friends Shop and the globe (where the old café was, now just
// somewhere to sit; see reference/hughes-main/LAYOUT.md): a warm accent wall with made-up prints
// and a long bench, pendant lights over where the round tables stand (the table hop: see
// spawnTableHop), tall windows onto the lawn, and big potted plants.
function sceneSeating(x, w) {
  R(x, 0, w, CEIL, "#e6e4de");
  recessedLights(x, w, CEIL - 8, 110);
  R(x, CEIL, w, FLOOR - CEIL, "#4b5058");
  tiles(x, w, "#3e3633", "#2d2725");
  // the accent wall, with three framed prints (made-up art: a sun, hills, a wave)
  R(x + 30, CEIL, 400, FLOOR - CEIL, "#8a5a3c");
  for (let i = 0; i < 3; i++) {
    const fx = x + 66 + i * 122;
    R(fx, CEIL + 28, 92, 66, "#2a1d14");
    R(fx + 5, CEIL + 33, 82, 56, "#f4efe6");
    if (i === 0) {
      R(fx + 5, CEIL + 33, 82, 56, "#f2d48a");
      oval(fx + 46, CEIL + 64, 16, 16, "#e07b39");
    } else if (i === 1) {
      oval(fx + 30, CEIL + 89, 30, 22, "#669456");
      oval(fx + 60, CEIL + 89, 28, 30, "#4f7942");
    } else {
      R(fx + 5, CEIL + 64, 82, 25, "#4f93cf");
      oval(fx + 30, CEIL + 64, 20, 8, "#9fd0f2");
      oval(fx + 62, CEIL + 66, 16, 6, "#9fd0f2");
    }
  }
  // the long upholstered bench along the wall
  R(x + 50, FLOOR - 66, 360, 26, "#5e7a6b"); // the back cushion
  R(x + 50, FLOOR - 40, 360, 16, "#4c6758"); // the seat
  R(x + 50, FLOOR - 40, 360, 2, "rgba(255, 255, 255, 0.2)");
  for (const lx of [x + 58, x + 225, x + 396]) R(lx, FLOOR - 24, 6, 22, "#2a1d14");
  // the tall windows, and the lawn and trees outside
  R(x + 470, CEIL + 8, 400, FLOOR - CEIL - 20, "#c9d0d6");
  R(x + 476, CEIL + 14, 388, FLOOR - CEIL - 32, "#dff0f4");
  R(x + 476, FLOOR - 64, 388, 46, "#a8cf92");
  for (let i = 0; i < 4; i++) oval(x + 520 + i * 100, FLOOR - 82, 34, 28, i % 2 ? "#7fae6a" : "#8fbd78");
  for (let mx = x + 476; mx < x + 864; mx += 78) R(mx, CEIL + 14, 4, FLOOR - CEIL - 32, "#c9d0d6");
  // pendant lights hanging over the tables
  for (const px of [x + 300, x + 560, x + 760]) {
    R(px, CEIL, 2, 26, "#555");
    poly("#d4a64a", px - 16, CEIL + 40, px + 18, CEIL + 40, px + 9, CEIL + 26, px - 7, CEIL + 26);
    oval(px + 1, CEIL + 41, 10, 3, "#fff2bf");
  }
  // big potted plants at either end of the windows
  for (const px of [x + 448, x + 878]) {
    poly("#b5893b", px - 14, FLOOR - 36, px + 14, FLOOR - 36, px + 11, FLOOR - 4, px - 11, FLOOR - 4);
    oval(px, FLOOR - 58, 20, 24, "#4f7942");
    oval(px - 10, FLOOR - 74, 12, 16, "#669456");
    oval(px + 10, FLOOR - 70, 12, 16, "#5b8a4a");
  }
}
// Grey slate flagstones, in two rows of slabs of different sizes and shades, with pale grout. Like
// tiles (in deweydash.js), the pattern moves at ground speed so it reads as the floor you run on.
function slateFloor(x, w) {
  const fh = H + 2 * TOP - FLOOR,
    grout = "#6b6f77";
  R(x, FLOOR, w, fh, "#3a3d44");
  for (const [ty, th, sp, len] of [[0, 14, 0.9, 64], [15, fh - 15, 1.1, 92]]) {
    const off = distance * sp;
    for (let k = Math.floor(off / len) - 1; k * len - off < W; k++) {
      const sx = k * len - off,
        tone = hash(k, len);
      R(sx + 1, FLOOR + ty + 1, len - 1, th - 1, tone < 0.33 ? "#34373e" : tone < 0.66 ? "#3f424a" : "#474b53");
      R(sx, FLOOR + ty, 1, th, grout);
      if (hash(len, k) < 0.4) R(sx + len * (0.4 + hash(k, 3) * 0.2), FLOOR + ty, 1, th, grout); // (a slab split in two)
    }
    R(x, FLOOR + ty, w, 1, grout);
  }
}
// The foyer just before the globe, outside the Meeting Rooms: a white drop ceiling with round
// lights, blue-grey walls with tall maple-paneled walls either side (a door in the left one), a TV
// on the wall in the middle showing what's on at the library, square maple pillars, a big potted
// fig in a silver planter with a maple chair beside it, and a grey slate floor.
function sceneFoyer(x, w) {
  // the drop ceiling
  R(x, 0, w, CEIL, "#eeedea");
  for (let i = 0; i * 56 < w; i++) R(x + i * 56, 0, 1, CEIL, "#d9d8d3");
  R(x, 22, w, 1, "#d9d8d3");
  R(x, 44, w, 1, "#d9d8d3");
  for (const vx of [300, 470]) {
    R(x + vx, 26, 40, 14, "#dcdbd6"); // vents
    for (let k = 0; k < 4; k++) R(x + vx + 4, 29 + k * 3, 32, 1, "#c2c1bb");
  }
  for (let lx = x + 90; lx < x + w; lx += 130) {
    oval(lx, CEIL - 6, 9, 3, "#fffbe8"); // round recessed lights
    oval(lx, CEIL - 6, 5, 1.6, "#ffffff");
  }
  R(x, CEIL - 2, w, 2, "#d5d3cd");
  // the walls: blue-grey, with tall maple paneling at either side
  R(x, CEIL, w, FLOOR - CEIL, "#b7c0c9");
  const paneling = (px, pw, door) => {
    const pt = CEIL + 52;
    R(px - 3, pt - 6, pw + 6, 7, "#6b3f22"); // the dark wood cap
    R(px, pt, pw, FLOOR - pt, "#d49853");
    for (let k = 1; k * 48 < pw; k++) R(px + k * 48, pt, 2, FLOOR - pt, "#b07636");
    R(px, FLOOR - 64, pw, 3, "#b07636"); // the rail
    R(px, FLOOR - 8, pw, 8, "#2a2622"); // the base
    if (door) {
      R(px + door, pt + 6, 64, FLOOR - pt - 6, "#b07636"); // a door, flush with the paneling (shut)
      R(px + door + 4, pt + 10, 56, FLOOR - pt - 18, "#dba05c");
      R(px + door + 50, FLOOR - 92, 3, 20, "#d8d8d8");
    }
  };
  paneling(x + 10, 200, 110);
  paneling(x + 470, w - 470, 0);
  // light switches, and the TV in the middle of the bare wall, its cable hanging below
  R(x + 252, FLOOR - 108, 7, 11, "#eef0f2");
  R(x + 430, FLOOR - 108, 7, 11, "#eef0f2");
  const tx = x + 290,
    ty = CEIL + 58;
  R(tx, ty, 112, 66, "#111214");
  R(tx + 3, ty + 3, 106, 60, "#59c4ef"); // the screen: a made-up "what's on" slide
  R(tx + 8, ty + 10, 44, 7, "#e2384d");
  R(tx + 8, ty + 20, 36, 7, "#e2384d");
  for (let k = 0; k < 4; k++) R(tx + 8, ty + 34 + k * 5, 38 - (k % 2) * 8, 2, "#1d4f7a");
  R(tx + 58, ty + 6, 48, 54, "#f4f7fa");
  poly("#e2384d", tx + 64, ty + 58, tx + 78, ty + 22, tx + 100, ty + 30, tx + 96, ty + 58);
  oval(tx + 84, ty + 18, 9, 9, "#f2d2b8");
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx + 56, ty + 66);
  ctx.quadraticCurveTo(tx + 50, ty + 84, tx + 60, ty + 96);
  ctx.stroke();
  R(tx + 54, ty + 96, 10, 12, "#eef0f2"); // the outlet
  slateFloor(x, w);
  // a maple chair, then the big fig in its round silver planter
  const cx = x + 210;
  poly("#d29a55", cx, FLOOR - 66, cx + 14, FLOOR - 64, cx + 16, FLOOR - 38, cx + 4, FLOOR - 36); // the back
  R(cx, FLOOR - 36, 30, 5, "#d29a55"); // the seat
  for (const lx of [cx + 2, cx + 26]) R(lx, FLOOR - 31, 2, 31, "#3a3a3a");
  const fx = x + 120;
  ctx.strokeStyle = "#6b4a2c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(fx - 4, FLOOR - 44);
  ctx.quadraticCurveTo(fx - 16, FLOOR - 120, fx - 6, FLOOR - 190);
  ctx.moveTo(fx + 4, FLOOR - 44);
  ctx.quadraticCurveTo(fx + 14, FLOOR - 100, fx + 10, FLOOR - 160);
  ctx.stroke();
  for (let i = 0; i < 16; i++) {
    // its big fiddle leaves
    const ly = FLOOR - 200 + i * 9 + hash(i, 5) * 6,
      lx = fx + (i % 2 ? 1 : -1) * (8 + hash(5, i) * 26),
      a = (i % 2 ? 0.5 : -0.5) + (hash(i, 9) - 0.5) * 0.6;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(a);
    oval(0, 0, 13, 8, i % 3 ? "#3f7d36" : "#4f8f3f");
    R(-10, -0.5, 20, 1, "rgba(255, 255, 255, 0.18)");
    ctx.restore();
  }
  for (let i = 0; i < 7; i++) oval(fx - 30 + i * 10, FLOOR - 48 + (i % 2) * 4, 8, 5, "#4f8f3f"); // trailing ivy at its foot
  const pg = ctx.createLinearGradient(fx - 32, 0, fx + 32, 0);
  pg.addColorStop(0, "#9ea3a8");
  pg.addColorStop(0.45, "#e4e7ea");
  pg.addColorStop(1, "#8c9196");
  ctx.fillStyle = pg;
  ctx.fillRect(fx - 32, FLOOR - 46, 64, 44);
  oval(fx, FLOOR - 46, 32, 4, "#c3c7cb");
  // two square maple pillars, framing the TV wall
  for (const px of [x + 236, x + 452]) {
    R(px, 0, 22, FLOOR, "#c9a05e");
    R(px + 15, 0, 7, FLOOR, "#a8803f");
    R(px + 3, 0, 2, FLOOR, "rgba(255, 255, 255, 0.2)");
    R(px - 4, FLOOR - 10, 30, 10, "#1c1c1e"); // its black base
  }
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
  label("Library", rx + rw / 2, top + 100, 48, "#ffffff", "Fraunces, Georgia, serif");
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
  label("BOOKMOBILE", bx + 112, top + 26, 20, "#2f7d84", "Fraunces, Georgia, serif");
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
  ctx.font = `bold ${r * 0.62}px Fraunces, Georgia, serif`;
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
// Greenville County, roughly: its outline, and where each branch library is, from Hughes Main
// (in the middle, at 0, 0). Used by the picture books' county map and the Bookmobile's route map.
// (The spots are only roughly right: north is up, Travelers Rest at the top, Fountain Inn at the
// bottom. A chapter's library picks its spot in CHAPTERS.)
const COUNTY_OUTLINE = [[-70, -150], [10, -146], [70, -120], [110, -60], [130, 10], [120, 70], [96, 120], [60, 150], [10, 140], [-30, 100], [-70, 60], [-110, 10], [-120, -50], [-100, -110]];
const COUNTY_SPOTS = [[-22, -82], [26, -92], [70, -26], [30, -26], [-48, -8], [-6, 18], [-34, 14], [42, 6], [22, 40], [56, 40], [36, 78], [52, 122]];
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
  COUNTY_OUTLINE.forEach(([a, b], i) => (i ? ctx.lineTo(mx + a, my + b) : ctx.moveTo(mx + a, my + b)));
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
  COUNTY_SPOTS.forEach(([a, b], i) => {
    oval(mx + a, my + b, 6, 6, "#2f6db5");
    oval(mx + a, my + b, 3, 3, "#fff");
    if (i % 2 === 0) drawPage(mx + a + 6, my + b - 22 + Math.sin(t * 0.003 + i) * 2, 9, 12, Math.sin(t * 0.002 + i) * 0.3);
  });
  starShape(mx, my, 11, "#c92a2f");
  label("Hughes Main", mx, my + 26, 11, "#5a4630", "Fraunces, Georgia, serif");
}

// ---------- The Bookmobile's route map ----------
// Between chapters: the county map, and the Bookmobile driving from the library Dewey is leaving
// to the next one, a gold trail behind it. Libraries Dewey has been to are gold pins with their
// names; the rest are grey "?" pins, so the route stays a surprise. If the next chapter isn't
// written yet, the Bookmobile heads out of town to a signpost with a "?" on it.
// A tap or key skips to the end of the drive; once it's there, another goes on.
const ROUTE_DRIVE_AT = 1100, // ms in when the Bookmobile sets off (after a honk)
  ROUTE_DRIVE_MS = 3400, // the drive
  ROUTE_DONE_AT = ROUTE_DRIVE_AT + ROUTE_DRIVE_MS,
  ROUTE_READY_MS = 450, // after arriving, before a press goes on (so a skip doesn't also leave)
  ROUTE_UNKNOWN = [72, -74]; // where it heads when the next chapter isn't written yet
let route = null; // { from, to, t, then, leaving }
// Drive from chapter `from`'s library to chapter `to`'s, then `then` (with the screen black).
function openRoute(from, to, then) {
  book = null;
  route = { from, to, t: 0, then, leaving: false };
  state = "route";
}
function updateRoute(dt) {
  if (!route) return;
  const was = route.t;
  route.t += dt;
  runTime += dt;
  const passed = (ms) => was < ms && route.t >= ms;
  if (passed(ROUTE_DRIVE_AT - 450)) {
    tone(330, 330, 0.12, "square", 0.04); // beep beep!
    tone(392, 392, 0.16, "square", 0.04, 0.16);
  }
  if (passed(ROUTE_DONE_AT)) [784, 988, 1175].forEach((f, i) => tone(f, f, 0.18, "triangle", 0.09, i * 0.1)); // there!
}
function routeAdvance() {
  if (!route || route.leaving || fadeOut !== null) return;
  if (route.t < ROUTE_DONE_AT) {
    route.t = ROUTE_DONE_AT - 1; // skip to the end of the drive (the chime still plays)
    return;
  }
  if (route.t < ROUTE_DONE_AT + ROUTE_READY_MS) return;
  route.leaving = true;
  fadeTo(() => {
    const then = route.then;
    route = null;
    then();
  });
}
function routeKey(e) {
  const k = e.code;
  if (k === "Space" || k === "Enter" || k.startsWith("Arrow") || k === "Tab") e.preventDefault();
  if (e.repeat) return;
  if (k === "KeyM") return toggleMute();
  routeAdvance();
}
function routeTap(e) {
  e.preventDefault();
  if (e.pointerType === "mouse" && e.button !== 0) return;
  routeAdvance();
}
// Where a chapter's library is on the map (null if it isn't written yet).
const chapterSpot = (c) => (CHAPTERS[c] ? CHAPTERS[c].at : null);
// The road from a to b, bowed a little: the point u of the way along (0 … 1), and which way it's heading.
function routeAt(a, b, u) {
  const c = [(a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.35, (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.35],
    v = 1 - u;
  return {
    x: v * v * a[0] + 2 * v * u * c[0] + u * u * b[0],
    y: v * v * a[1] + 2 * v * u * c[1] + u * u * b[1],
    dx: 2 * v * (c[0] - a[0]) + 2 * u * (b[0] - c[0]),
  };
}
// The map's panel, how far it's zoomed in (it's centred on the drive), and the card.
function routeLayout() {
  if (tall()) return { panel: { x: 14, y: 14, w: W - 28, h: 378 }, k: 2.2, card: { x: 22, y: 404, w: W - 44, h: 226 } };
  return { panel: { x: 16, y: 16, w: 430, h: 288 }, k: 1.7, card: { x: 462, y: 40, w: 318, h: 238 } };
}
function drawRoute() {
  if (!route) return;
  const L = routeLayout(),
    t = route.t;
  // the same dark table the picture books lie on
  const g = ctx.createLinearGradient(0, -TOP, 0, H + TOP);
  g.addColorStop(0, "#3b2b20");
  g.addColorStop(1, "#21160f");
  ctx.fillStyle = g;
  fillScreen();
  // the map, printed on paper, zoomed in on the drive (centred halfway along it)
  const P = L.panel,
    a = chapterSpot(route.from) || [0, 0],
    b = chapterSpot(route.to) || ROUTE_UNKNOWN,
    mid = routeAt(a, b, 0.5);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#efe4c8";
  roundRect(P.x, P.y, P.w, P.h, 8);
  ctx.restore();
  ctx.save();
  roundRectPath(P.x, P.y, P.w, P.h, 8);
  ctx.clip();
  ctx.translate(P.x + P.w / 2, P.y + P.h / 2 - 6); // (a little high: Hughes Main's name tag hangs under it)
  ctx.scale(L.k, L.k);
  ctx.translate(-mid.x, -mid.y);
  drawRouteMap(t);
  ctx.restore();
  drawRouteCard(L.card, t);
}
// The map, in the county's own units (Hughes Main at 0, 0).
function drawRouteMap(t) {
  const from = chapterSpot(route.from) || [0, 0],
    toSpot = chapterSpot(route.to),
    to = toSpot || ROUTE_UNKNOWN,
    arrived = t >= ROUTE_DONE_AT,
    u = Math.min(1, Math.max(0, (t - ROUTE_DRIVE_AT) / ROUTE_DRIVE_MS)),
    e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u); // (easing out of the start and into the stop)
  // the county
  ctx.fillStyle = "#d9e7c2";
  ctx.strokeStyle = "#8a6f45";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  COUNTY_OUTLINE.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // the river, winding through downtown
  ctx.strokeStyle = "#9cc3d5";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-60, -130);
  ctx.bezierCurveTo(-40, -60, 20, -10, 0, 40);
  ctx.bezierCurveTo(-20, 90, 10, 110, -10, 138);
  ctx.stroke();
  // highways
  ctx.strokeStyle = "rgba(138, 111, 69, 0.4)";
  ctx.lineWidth = 2;
  for (const [a, b, c, d] of [[-90, -100, 100, 110], [-110, 20, 125, 0], [-40, -140, 40, 140]]) {
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.stroke();
  }
  // the libraries: where Dewey's been, gold with their names; the rest a mystery
  const been = Object.keys(CHAPTERS)
    .map(Number)
    .filter((c) => c !== 1 && (c < route.to || (c === route.to && arrived)));
  for (const [a, b] of COUNTY_SPOTS) {
    const c = been.find((n) => CHAPTERS[n].at[0] === a && CHAPTERS[n].at[1] === b);
    if (c) {
      oval(a, b, 6, 6, GOLD);
      oval(a, b, 2.5, 2.5, "#fff");
      label(CHAPTERS[c].place.replace(/ Library$/, ""), a, b + 15, 8, "#5a4630", "Fraunces, Georgia, serif");
    } else {
      oval(a, b, 5, 5, "#a39a88");
      label("?", a, b + 3, 7, "#fff", "Fraunces, Georgia, serif");
    }
  }
  starShape(0, 0, 9, CARD_RED); // Hughes Main, its name on a little paper tag
  ctx.fillStyle = "rgba(255, 250, 240, 0.92)";
  roundRect(-27, 11, 54, 12, 3);
  label("Hughes Main", 0, 20, 8, "#5a4630", "Fraunces, Georgia, serif");

  // the road ahead, dotted, and the way already driven, in gold
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = "rgba(90, 70, 48, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let s = 0; s <= 40; s++) {
    const p = routeAt(from, to, s / 40);
    s ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (e > 0) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let s = 0; s <= 40; s++) {
      const p = routeAt(from, to, (s / 40) * e);
      s ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  // where it's going: a pulsing ring (and, for a chapter still being written, a "?" signpost)
  const pulse = (t % 1200) / 1200;
  if (!arrived) {
    ctx.strokeStyle = `rgba(201, 42, 47, ${0.6 * (1 - pulse)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(to[0], to[1], 6 + pulse * 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (!toSpot) {
    const pop = arrived ? 0.85 + 0.15 * Math.min(1, (t - ROUTE_DONE_AT) / 250) : 0.85;
    ctx.save();
    ctx.translate(to[0] + 13, to[1]);
    ctx.scale(pop, pop);
    R(-1, -24, 2.5, 24, "#6b4a2c");
    ctx.fillStyle = "#fffaf0";
    roundRect(-9, -34, 20, 15, 3);
    ctx.strokeStyle = "#6b4a2c";
    ctx.lineWidth = 1.2;
    roundRectPath(-9, -34, 20, 15, 3);
    ctx.stroke();
    label("?", 1, -22.5, 11, CARD_RED, "Fraunces, Georgia, serif");
    ctx.restore();
  }
  if (arrived) {
    // a little burst where it stops
    const k = Math.min(1, (t - ROUTE_DONE_AT) / 500);
    if (k < 1)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        sparkle(to[0] + Math.cos(a) * (8 + k * 16), to[1] + Math.sin(a) * (8 + k * 16), 3 * (1 - k), GOLD);
      }
  }

  // the Bookmobile, small, sitting on the road (facing the way it's going)
  const p = routeAt(from, to, e),
    dir = (u > 0 ? p.dx : routeAt(from, to, 0.01).dx) < 0 ? -1 : 1,
    sc = 0.12;
  ctx.save();
  ctx.translate(p.x, p.y + 2);
  ctx.scale(dir * sc, sc);
  drawBookmobile(-BM_LEN / 2, 0, t, { moving: u > 0 && u < 1 });
  ctx.restore();
}
// The card beside the map (under it, on a phone), by the card standards: the chapter done (its
// heading and rule, the ribbon), the library it was, where Dewey's headed, Continue once it's
// there, and the hint (how to skip, then how to go on).
function drawRouteCard(c, t) {
  const arrived = t >= ROUTE_DONE_AT,
    next = CHAPTERS[route.to],
    here = CHAPTERS[route.from],
    big = tall(),
    cx = c.x + c.w / 2;
  drawCard(c.x, c.y, c.w, c.h);
  // the heading (a little smaller than other cards' so it clears the ribbon on this narrow card)
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "bold 21px Fraunces, Georgia, serif";
  ctx.fillText(`Chapter ${route.from} complete!`, cx - 14, c.y + 34);
  cardRules(c.x, c.y + 46, c.w);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `italic ${big ? 15 : 13}px Fraunces, Georgia, serif`;
  ctx.fillText(here ? here.place : "", cx, c.y + 66);
  const lines = arrived
    ? next
      ? [`Next stop: ${next.place}!`, `Chapter ${route.to} begins...`]
      : ["Where to next?", `Chapter ${route.to} is still being written.`, "Check back soon!"]
    : ["Dewey hops aboard the Bookmobile.", "Off to find more of his pages!"];
  ctx.fillStyle = INK;
  lines.forEach((line, i) => {
    ctx.font = i === 0 && arrived ? "bold 16px Fraunces, Georgia, serif" : "14px Fraunces, Georgia, serif";
    ctx.fillText(line, cx, c.y + 92 + i * 21);
  });
  // Continue, once it's there: the card's main action
  if (arrived) {
    const k = Math.min(1, (t - ROUTE_DONE_AT) / ROUTE_READY_MS),
      bw = 160,
      bh = 42,
      bx = cx - bw / 2,
      bty = c.y + c.h - 76;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    roundRect(bx + 2, bty + 3, bw, bh, 10);
    ctx.fillStyle = MAPLE;
    roundRect(bx, bty, bw, bh, 10);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = ON_ORANGE;
    ctx.font = "bold 18px Fraunces, Georgia, serif";
    ctx.fillText("Continue ›", cx, bty + bh / 2 + 6);
    ctx.restore();
  }
  // the hint, at the very bottom: how to skip the drive, then how to go on
  // (like hint, but centred on the card, which sits off to one side on a wide screen)
  ctx.textAlign = "center";
  ctx.fillStyle = INK_SOFT;
  ctx.font = "12px Fraunces, Georgia, serif";
  ctx.fillText(
    arrived ? hintFor("Enter to continue", "A to continue", "Tap to continue") : hintFor("Enter to skip", "A to skip", "Tap to skip"),
    cx,
    c.y + c.h - 12,
  );
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
        pictureBookRoomFurniture(0);
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
        label("?", 640, 170 + Math.sin(t * 0.005) * 3, 30, "#c92a2f", "Fraunces, Georgia, serif");
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
        label("!", 290, 186 + Math.sin(t * 0.01) * 2, 34, "#c92a2f", "Fraunces, Georgia, serif");
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
      skip: { x: W - 110, y: 592, w: 96, h: 44 },
      back: { x: 14, y: 592, w: 96, h: 44 },
      dotsY: 614,
    };
  }
  const page = { x: 18, y: 10, w: W - 36, h: 254 };
  return {
    page,
    art: { x: page.x + 12, y: page.y + 12, w: 404, h: page.h - 24 },
    text: { x: page.x + 444, y: page.y + 16, w: page.w - 444 - 22, h: page.h - 32 },
    skip: { x: W - 112, y: 270, w: 94, h: 44 },
    back: { x: 18, y: 270, w: 94, h: 44 },
    dotsY: 292,
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
// A picture book's Skip / Back: a pill, like every other button for getting around.
function bookButton(b, text) {
  ctx.fillStyle = "#211812";
  roundRect(b.x, b.y, b.w, b.h, b.h / 2);
  ctx.strokeStyle = PILL_EDGE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.font = `bold ${tall() ? 17 : 15}px Fraunces, Georgia, serif`;
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
  ctx.font = `${size}px Fraunces, Georgia, serif`;
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
  ctx.font = "italic 12px Fraunces, Georgia, serif";
  const last = book.i === book.pages.length - 1,
    end = book.intoLevel ? "begin" : "finish";
  const hintText = touchUI()
    ? last ? `Tap to ${end}` : "Tap to turn the page"
    : last ? `Enter to ${end}` : "Enter or → to turn the page · Esc to skip";
  ctx.fillText(hintText, tall() ? W / 2 : tx.x + tx.w / 2, L.page.y + L.page.h - 12);
}

// Story Mode is loaded: rebuild the buttons so its level list is in them.
makeButtons();

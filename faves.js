// Fave Finder: help patrons at the library window find their next favorite.
// Inspired by the library's Next Five Faves service. Every patron, title,
// creator and description in this game is made up.

// ---------- Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 960,
  H = 640;
let portrait = false;
let L; // layout boxes (see layout())

// ---------- Palette ----------
const PAPER = "#f3ead7";
const CREAM = "#fbf7ee";
const GOLD = "#d4a64a";
const MAPLE = "#d7a35e";
const NAVY = "#34404f";
const INK = "#2a1d12";
const RIGHT = "#2f9e44";
const PARTLY = "#c98a12";
const WRONG = "#c0392b";
const COVER_COLORS = ["#c92a2f", "#3d4c8c", "#e8b52a", "#2f7d84", "#6b3e75", "#4f7942", "#d9773a", "#8c2f39", "#2f5d62", "#b5893b", "#5466b0", "#de4a4e"];

// ---------- Tunables ----------
const SHIFTS = ["Morning", "Afternoon", "Evening"];
const SHIFT_SECONDS = 100;
const SPEED_BONUS = 10; // for a good pick while the patron still has over half their patience

// Difficulty grows every shift: d = (day - 1) * 3 + shift.
function params(d) {
  return {
    goal: Math.min(350, 120 + d * 25), // points needed to pass the shift
    patience: Math.max(22, 50 - d * 3), // seconds a patron will wait at the window
    gap: Math.max(7, 18 - d * 1.3), // seconds between new patrons
    queueMax: Math.min(4, 1 + Math.floor(d / 2)), // how long the line can get
    nonBook: Math.min(0.45, 0.2 + d * 0.03), // chance they want something other than a book
    vague: Math.min(0.85, d * 0.12), // chance each part of a request is said vaguely
    lovedP: Math.min(0.75, 0.25 + d * 0.07), // chance they mention a favorite
    dislikes: d < 1 ? (Math.random() < 0.4 ? 1 : 0) : d < 4 ? 1 : d < 7 ? 1 + (Math.random() < 0.5 ? 1 : 0) : 2,
  };
}

// ---------- What the library has ----------
const TYPES = {
  book: { label: "Book", tab: "Books", a: "a book", vague: "something good to read" },
  audio: { label: "Audiobook", tab: "Audio", a: "an audiobook", vague: "a story to listen to in the car" },
  graphic: { label: "Graphic novel", tab: "Graphic", a: "a graphic novel", vague: "a comic-style book with lots of pictures" },
  movie: { label: "Movie (DVD)", tab: "Movies", a: "a movie", vague: "something for family movie night" },
  music: { label: "Music CD", tab: "Music", a: "a music CD", vague: "some new music" },
  tv: { label: "TV show (DVD)", tab: "TV", a: "a TV show", vague: "a show we can watch a few episodes of" },
};
const TYPE_KEYS = Object.keys(TYPES);

const LEVELS = [
  { label: "Ages 3–6", short: "3–6" },
  { label: "Ages 6–8", short: "6–8" },
  { label: "Ages 8–12", short: "8–12" },
  { label: "Teens 13+", short: "13+" },
];

const GENRES = {
  adventure: { label: "Adventure", say: "adventure", vague: "big adventures" },
  mystery: { label: "Mystery", say: "mysteries", vague: "puzzles and detectives" },
  fantasy: { label: "Fantasy", say: "fantasy", vague: "magic and dragons" },
  space: { label: "Space", say: "space", vague: "rockets and aliens" },
  animals: { label: "Animals", say: "animals", vague: "critters of all kinds" },
  sports: { label: "Sports", say: "sports", vague: "games and teams" },
  friendship: { label: "Friendship", say: "stories about friends", vague: "stories about friends and school" },
  history: { label: "History", say: "history", vague: "the olden days" },
  fairytales: { label: "Fairy tales", say: "fairy tales", vague: "once-upon-a-time stories" },
  science: { label: "Science", say: "science and nature", vague: "how the world works" },
  howto: { label: "How-to", say: "how-to stuff", vague: "making things myself" },
  poetry: { label: "Poetry", say: "poetry", vague: "rhymes and short poems" },
  singalong: { label: "Sing-along", say: "sing-along songs", vague: "songs to dance to" },
  lullabies: { label: "Lullabies", say: "lullabies", vague: "bedtime songs" },
  classical: { label: "Classical", say: "classical music", vague: "orchestras" },
  rock: { label: "Rock", say: "rock music", vague: "loud guitars" },
  world: { label: "World", say: "world music", vague: "songs from other countries" },
  chill: { label: "Chill", say: "chill background music", vague: "quiet music for homework" },
};

const MOODS = {
  funny: { label: "funny", ask: "Something funny, please!", vague: "Something that'll make us laugh!" },
  cozy: { label: "cozy", ask: "Something cozy, please.", vague: "Something to snuggle up with under a blanket." },
  exciting: { label: "exciting", ask: "Something exciting!", vague: "Something you can't put down!" },
  spooky: { label: "a little spooky", ask: "Something a little spooky!", vague: "Something with a few shivers, but no nightmares." },
  heartwarming: { label: "heartwarming", ask: "Something heartwarming.", vague: "Something that makes you feel all warm inside." },
  thoughtful: { label: "thoughtful", ask: "Something that makes you think.", vague: "Something with big ideas." },
  calm: { label: "calm", ask: "Something calm and quiet.", vague: "Something peaceful for winding down." },
  upbeat: { label: "upbeat", ask: "Something happy and upbeat!", vague: "Something full of energy!" },
};

// Things patrons ask to avoid, and how to spot them on an item.
const DISLIKES = {
  scary: { ask: "Nothing too scary, please.", vague: "Scary stuff gives us nightmares.", test: (i) => i.moods.includes("spooky"), why: "It's spooky, and they said nothing scary.", note: "A little spooky" },
  sad: { ask: "No sad endings!", vague: "Sad endings make us cry, so no sad ones.", test: (i) => i.flags.S, why: "It has a sad ending.", note: "Sad ending" },
  kissing: { ask: "No kissing stuff!", vague: "No mushy romance stuff, please.", test: (i) => i.flags.K, why: "It has crushes and kissing.", note: "Crushes & kissing" },
  long: { ask: "Not a long one, please.", vague: "We don't have much time to finish it.", test: (i) => i.flags.L, why: "It's a long one.", note: "Long" },
  series: { ask: "Just one, not part of a series.", vague: "We don't want to wait for the next one!", test: (i) => i.flags.R, why: "It's part of a series.", note: "Series" },
  battles: { ask: "No fighting or battles.", vague: "Nothing with big fights, please.", test: (i) => i.flags.B, why: "It has battles in it.", note: "Battles" },
};
const DISLIKE_KEYS = Object.keys(DISLIKES);

// The shelves. Flags: S = sad ending, K = crushes & kissing, B = battles,
// L = long, R = part of a series.
const CATALOG = [];
function add(type, title, creator, level, genres, moods, flags, desc) {
  CATALOG.push({
    id: CATALOG.length,
    type, title, creator, level, genres, moods, desc,
    flags: { S: flags.includes("S"), K: flags.includes("K"), B: flags.includes("B"), L: flags.includes("L"), R: flags.includes("R") },
    color: COVER_COLORS[hash(title) % COVER_COLORS.length],
  });
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Books
add("book", "Moose on the Loose at the Library", "Hazel Pennywhistle", 0, ["animals"], ["funny", "upbeat"], "", "A very polite moose tries to return his library book, right through the front door!");
add("book", "Goodnight, Little Lighthouse", "Mira Seabright", 0, ["friendship"], ["calm", "cozy"], "", "A sleepy lighthouse says goodnight to every boat in the harbor.");
add("book", "Dinosaur Snack Attack", "Benny Cobble", 0, ["science"], ["funny", "exciting"], "", "Which dinosaurs munched leaves and which crunched bones? Silly snack-time facts.");
add("book", "The Rocket in Grandma's Garden", "Lulu Starling", 0, ["space", "friendship"], ["heartwarming", "exciting"], "", "Grandma and Nico build a cardboard rocket and blast off to the backyard moon.");
add("book", "Pumpkin's Not-So-Spooky Night", "Odette Fernwood", 0, ["friendship"], ["spooky", "funny"], "", "A little pumpkin is nervous about Halloween until the 'monsters' turn out to be friends.");
add("book", "Ten Tiny Turtles", "Rafi Brooks", 0, ["animals", "science"], ["calm", "cozy"], "", "Count baby sea turtles as they hatch and paddle off to the ocean.");
add("book", "The Dragon Who Lost Her Sneeze", "Willa Thistledown", 0, ["fairytales"], ["funny", "cozy"], "", "Dragon Dot can't sneeze fire anymore! Can the whole kingdom help her find it?");
add("book", "Bao's Big Kite Day", "Kiko Hartwell", 0, ["friendship"], ["upbeat", "heartwarming"], "", "Bao's kite won't fly, so the whole neighborhood lends a hand.");
add("book", "Detective Dash and the Missing Mitten", "Gus Pemberton", 1, ["mystery"], ["funny", "cozy"], "R", "Dash follows a trail of yarn to solve the case of the missing mitten. Book 1 of a series.");
add("book", "Robo-Pup Saves the Day", "Nina Sparkwell", 1, ["space", "animals"], ["exciting", "funny"], "R", "A robot puppy from the year 3000 has a nose for trouble.");
add("book", "Fairy Fern's First Day", "Clementine Dew", 1, ["fairytales", "friendship"], ["cozy", "heartwarming"], "R", "Fern is nervous about her first day at Fairy School. Will anyone sit with her?");
add("book", "The Soccer Sock Surprise", "Marco Velde", 1, ["sports"], ["funny", "upbeat"], "", "Jada's lucky socks go missing right before the big game!");
add("book", "The Ghost Who Was Afraid of the Dark", "Ivy Moonbeam", 1, ["friendship"], ["spooky", "heartwarming"], "", "Boo the ghost is scared of the dark, so a brave girl lends him her night-light.");
add("book", "All About Volcanoes", "Dr. Ada Ember", 1, ["science"], ["exciting", "thoughtful"], "", "Rumble, bubble, BOOM! Photos and facts about how volcanoes work.");
add("book", "Knight School Nap Time", "Percy Hollowell", 1, ["fantasy"], ["funny", "cozy"], "R", "Sir Snooze is the sleepiest knight in training. Book 1 of the Knight School series.");
add("book", "Max and the Mighty Moon Rock", "Tessa Orbit", 1, ["space", "adventure"], ["exciting", "upbeat"], "", "Max finds a glowing rock in the park that might be from the moon!");
add("book", "Silly Rhymes for Sunny Days", "Pippa Doodle", 1, ["poetry"], ["funny", "upbeat"], "", "Giggly rhymes about bubble baths, bumblebees and backwards days.");
add("book", "The Secret of Whistle Creek", "Eleanor Bramble", 2, ["mystery", "adventure"], ["exciting", "thoughtful"], "R", "Strange whistles echo from the creek every night. Three cousins set out to learn why.");
add("book", "Owlwatch Academy", "Felix Ravensworth", 2, ["fantasy", "friendship"], ["exciting", "cozy"], "RLB", "Wren can talk to owls, and that earns her a spot at a hidden school in the treetops.");
add("book", "My Dog Is Running for Mayor", "Jasper Quigley", 2, ["animals"], ["funny", "upbeat"], "", "Biscuit the beagle promises free belly rubs for everyone. Can he win the election?");
add("book", "The Last Summer at Cedar Lake", "June Willoughby", 2, ["friendship"], ["heartwarming", "thoughtful"], "S", "Two best friends spend one last summer together before one of them moves away.");
add("book", "Starship Lemonade", "Orion Pashley", 2, ["space"], ["funny", "exciting"], "R", "A kid's lemonade stand accidentally becomes the most popular snack spot in the galaxy.");
add("book", "The Clockwork Library Thief", "Wren Cogsworth", 2, ["mystery", "fantasy"], ["exciting", "thoughtful"], "", "Someone is stealing books from a magical library where the clocks run backward.");
add("book", "Benchwarmer to Buzzer-Beater", "Dante Rivers", 2, ["sports", "friendship"], ["upbeat", "heartwarming"], "", "Theo never gets to play, until the night the star player gets the flu.");
add("book", "Midnight at the Wax Museum", "Rory Gravesend", 2, ["mystery"], ["spooky", "exciting"], "R", "Are the wax figures moving at night? There's only one way to find out...");
add("book", "Builders of the Bridge", "Priya Lakewood", 2, ["history"], ["thoughtful", "upbeat"], "", "Long ago, a whole town worked together to build a bridge across a wild river.");
add("book", "The Wolf Who Wouldn't Howl", "Tomas Greyfield", 2, ["animals", "adventure"], ["heartwarming", "thoughtful"], "S", "A quiet young wolf must find her voice to lead her pack home.");
add("book", "Pirate Camp Is Canceled", "Bella Barnacle", 2, ["adventure"], ["funny", "exciting"], "", "When pirate camp is canceled, three kids launch their own (very leaky) ship.");
add("book", "How to Draw Absolutely Everything", "Sam Inkwell", 2, ["howto"], ["calm", "upbeat"], "", "Step-by-step drawings of animals, robots, castles and more.");
add("book", "The Ember Crown", "Nadia Ashgrove", 3, ["fantasy", "adventure"], ["exciting"], "RLBK", "A runaway princess, a dragon egg and a crown that burns anyone unworthy. Book 1 of an epic series.");
add("book", "Signal from Europa", "Kai Halloran", 3, ["space", "mystery"], ["exciting", "thoughtful"], "L", "A teen radio fan picks up a message from one of Jupiter's moons.");
add("book", "Notes from the Back Row", "Lena Ortiz-Bell", 3, ["friendship"], ["funny", "heartwarming"], "K", "Mia passes notes, writes songs, and maybe has a crush on the new kid.");
add("book", "The Hollow House on Fen Road", "Morgan Blackwood", 3, ["mystery"], ["spooky", "exciting"], "", "Everyone in town avoids the house on Fen Road. Jules is about to find out why.");
add("book", "Run Your Own Race", "Coach Tamsin Reed", 3, ["sports", "howto"], ["upbeat", "thoughtful"], "", "Tips for training, teamwork and believing in yourself, from a track coach.");
add("book", "Letters to the Lighthouse Keeper", "Ines Calloway", 3, ["history", "friendship"], ["thoughtful", "heartwarming"], "S", "Long ago, a girl writes to a lonely lighthouse keeper, and he writes back.");
add("book", "Glitch City", "Ravi Stonebridge", 3, ["space", "adventure"], ["exciting", "funny"], "RB", "Four gamers get pulled into a video-game city where the bugs bite back.");
add("book", "Poems for Rainy Afternoons", "Aster Vale", 3, ["poetry"], ["calm", "thoughtful"], "", "Short, quiet poems about puddles, windows and wondering.");
// Audiobooks
add("audio", "The Sneezy Sea Serpent", "Marina Kelp, read by Coral Fairweather", 0, ["fairytales"], ["funny", "cozy"], "", "A sea serpent's giant sneezes keep flipping the fishing boats. Listen along!");
add("audio", "Campfire Tales That Aren't Too Scary", "Hank Embers", 1, ["fairytales"], ["spooky", "funny"], "", "Six silly campfire stories with just a pinch of spooky.");
add("audio", "The Great Grocery Store Heist", "Lottie Pickering", 2, ["mystery"], ["funny", "exciting"], "", "Someone stole every banana in town! Twin detectives crack the case.");
add("audio", "Wings over Willowmere", "Fenna Holloway", 2, ["fantasy", "animals"], ["exciting", "heartwarming"], "RL", "A girl and her griffin chick fly across the kingdom. A long listen for road trips!");
add("audio", "Brave Like Bea: A Pilot's Story", "Clara Westwind", 2, ["history"], ["thoughtful", "upbeat"], "", "Long ago, a girl dreams of flying a plane, even when everyone says she can't.");
add("audio", "Lost on Lantern Island", "Silas Merrow", 3, ["adventure", "mystery"], ["exciting", "thoughtful"], "L", "Shipwrecked teens find the island's lighthouse is still lit. But by whom?");
add("audio", "Field Guide to the Night Sky", "Dr. Leo Brightman", 1, ["space", "science"], ["calm", "thoughtful"], "", "Learn to spot planets and star pictures with a calm, friendly guide.");
add("audio", "The Bakery on Button Street", "Rosie Ambrose", 3, ["friendship"], ["cozy", "heartwarming"], "K", "Nell runs her aunt's bakery for the summer, with a cute rival baker across the street.");
// Graphic novels
add("graphic", "Captain Waffles", "Tad Sprinkles", 1, ["adventure"], ["funny", "exciting"], "R", "A superhero waffle and his sidekick, Syrup, save breakfast every day.");
add("graphic", "Squid Squad", "Marina Inkley", 2, ["animals", "adventure"], ["funny", "exciting"], "R", "Eight-armed heroes patrol the coral reef.");
add("graphic", "The Library After Dark", "Oona Shadewell", 2, ["mystery"], ["spooky", "exciting"], "", "When the library closes, the books come out to play, and one has gone missing.");
add("graphic", "Sketchbook Summer", "Jun Park-Lee", 2, ["friendship"], ["heartwarming", "funny"], "", "Maya fills a sketchbook with comics about the best (and weirdest) summer ever.");
add("graphic", "Dragon Kitchen", "Basil Fernsby", 2, ["fantasy"], ["cozy", "funny"], "", "A young dragon dreams of becoming a chef, without burning the soup.");
add("graphic", "Comet Kids", "Stella Quasar", 1, ["space", "friendship"], ["upbeat", "exciting"], "R", "Three friends ride a comet around the solar system.");
add("graphic", "Shield of the Seventh Star", "Arlo Venn", 3, ["fantasy", "adventure"], ["exciting"], "BR", "A squire with a mysterious shield must defend her kingdom.");
add("graphic", "The Ballad of Pip Turner", "Hollis Grey", 3, ["history", "friendship"], ["thoughtful"], "S", "An ink-drawn story of a boy and his horse on the long trail west.");
// Movies
add("movie", "Penguin Parade", "Snowcap Studios", 0, ["animals"], ["funny", "upbeat"], "", "Waddling penguins put on a talent show at the South Pole.");
add("movie", "The Sock Puppet Rescue", "Button Box Films", 1, ["adventure", "friendship"], ["exciting", "heartwarming"], "", "When a sock puppet goes missing at the laundromat, the whole drawer mounts a rescue.");
add("movie", "Moonlight Pumpkin Patch", "Harvest Moon Pictures", 1, ["friendship"], ["spooky", "funny"], "", "Trick-or-treaters discover the pumpkin patch comes alive at midnight.");
add("movie", "Rocket Racers", "Blue Comet Films", 2, ["space", "sports"], ["exciting", "upbeat"], "R", "Kid pilots race rockets around the rings of Saturn.");
add("movie", "The Lion of Marrow Hill", "Wild Hill Pictures", 2, ["animals", "adventure"], ["heartwarming", "exciting"], "S", "A boy raises an orphaned lion cub and must one day let him go.");
add("movie", "Mystery at Maple Manor", "Maple Leaf Films", 2, ["mystery"], ["exciting", "funny"], "", "A family reunion turns into a whodunit when Grandpa's prize pie disappears.");
add("movie", "The Dragon Rider's Oath", "Ember Peak Studios", 3, ["fantasy", "adventure"], ["exciting"], "BL", "A teen dragon rider must choose between her squad and her dragon.");
add("movie", "Dinosaurs: Giants of the Past", "Fossil Trail Films", 1, ["science"], ["exciting", "thoughtful"], "", "A documentary about dinosaur fossils and the scientists who dig them up.");
// Music
add("music", "Wiggle Wiggle Jam", "The Jellybean Band", 0, ["singalong"], ["upbeat", "funny"], "", "Silly songs to dance, clap and wiggle to.");
add("music", "Sleepy Stars Lullabies", "Luna Rivers", 0, ["lullabies"], ["calm", "cozy"], "", "Soft bedtime songs with guitar and gentle humming.");
add("music", "Orchestra Animals", "Meadowbrook Youth Orchestra", 1, ["classical", "animals"], ["calm", "thoughtful"], "", "Each piece paints a picture of a different animal with violins, flutes and drums.");
add("music", "Garage Band Galaxy", "The Space Cadets", 2, ["rock", "space"], ["upbeat", "exciting"], "", "Loud, fun rock songs about rockets, robots and aliens.");
add("music", "Songs from Around the World", "Global Kids Choir", 2, ["world"], ["upbeat", "heartwarming"], "", "Happy songs in many languages from many places.");
add("music", "Study Beats", "Lofi Library", 3, ["chill"], ["calm", "thoughtful"], "", "Quiet, steady music to help you focus on homework.");
// TV shows
add("tv", "Science Squad: Season 1", "Curious Kid TV", 1, ["science"], ["funny", "exciting"], "R", "Four kids test wild science questions in every episode.");
add("tv", "Detective Duckling: Season 2", "Puddle Pictures", 0, ["mystery", "animals"], ["funny", "cozy"], "R", "A tiny duck solves tiny mysteries around the pond.");
add("tv", "Camp Wildwood", "Pine Cone Productions", 2, ["friendship", "adventure"], ["funny", "heartwarming"], "R", "Summer camp adventures with canoe races, campfires and new friends.");
add("tv", "Kitchen Kids", "Whisk TV", 2, ["howto"], ["upbeat", "funny"], "R", "Kid chefs cook easy recipes and make a big mess.");
add("tv", "The Starlight Academy", "North Star Television", 3, ["fantasy", "friendship"], ["exciting"], "RK", "Teens with secret powers try to survive their first year at a hidden academy.");
add("tv", "Animal Hospital Heroes", "Wild Paws Network", 1, ["animals", "science"], ["heartwarming"], "R", "Follow the vets who care for puppies, parrots and even a porcupine.");

// ---------- Helpers ----------
const pick = (a) => a[(Math.random() * a.length) | 0];
const share = (a, b) => a.some((x) => b.includes(x));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
function list(words, joiner = "and") {
  if (words.length <= 1) return words.join("");
  return words.slice(0, -1).join(", ") + " " + joiner + " " + words[words.length - 1];
}
const genreNames = (gs, j) => list(gs.map((g) => GENRES[g].say), j);
const moodNames = (ms, j) => list(ms.map((m) => MOODS[m].label), j);

// ---------- Patron requests ----------
// A request is built around one hidden "target" item, so there is always at
// least one perfect answer on the shelves. Then other clues are added.
function pickType(nonBook) {
  if (Math.random() >= nonBook) return "book";
  const r = Math.random();
  return r < 0.25 ? "audio" : r < 0.5 ? "graphic" : r < 0.7 ? "movie" : r < 0.85 ? "music" : "tv";
}

function makeRequest(d) {
  const P = params(d);
  const type = pickType(P.nonBook);
  const pool = CATALOG.filter((i) => i.type === type);
  const target = pick(pool);
  const level = target.level;
  const kind = level === 0 ? "parent" : level === 3 ? "teen" : Math.random() < (level === 1 ? 0.4 : 0.3) ? "parent" : "kid";

  // things to avoid: never ones the target breaks; prefer ones that matter here
  const possible = DISLIKE_KEYS.filter((k) => !DISLIKES[k].test(target));
  const meaningful = possible.filter((k) => CATALOG.some((i) => i !== target && Math.abs(i.level - level) <= 1 && DISLIKES[k].test(i)));
  const dislikes = [];
  for (let n = 0; n < P.dislikes; n++) {
    const from = (meaningful.length ? meaningful : possible).filter((k) => !dislikes.includes(k));
    if (from.length) dislikes.push(pick(from));
  }

  // a favorite they mention, which the target is a great read-alike for
  let loved = null;
  if (Math.random() < P.lovedP) {
    const cands = CATALOG.filter(
      (i) => i !== target && Math.abs(i.level - level) <= 1 && share(i.genres, target.genres) && share(i.moods, target.moods) && !dislikes.some((k) => DISLIKES[k].test(i))
    );
    if (cands.length) loved = pick(cands);
  }

  let genres = [];
  if (!loved || d < 3 || Math.random() < 0.6) {
    genres = [pick(target.genres)];
    if (Math.random() < 0.4) {
      const others = [...new Set(pool.flatMap((i) => i.genres))].filter((g) => !genres.includes(g));
      if (others.length) genres.push(pick(others));
    }
  }
  const moods = Math.random() < (loved ? 0.5 : 0.8) ? [pick(target.moods)] : [];

  const req = { type, level, kind, genres, moods, loved: loved ? loved.id : null, dislikes, target: target.id };
  req.text = requestText(req, P.vague);
  return req;
}

function requestText(req, vagueP) {
  const v = () => Math.random() < vagueP;
  const parent = req.kind === "parent";
  const media = v() ? TYPES[req.type].vague : TYPES[req.type].a;
  const parts = [pick(["Hi!", "Hello!", "Hi there!", "Excuse me!"])];
  const age = [3 + ((Math.random() * 3) | 0), 6 + ((Math.random() * 2) | 0), 8 + ((Math.random() * 5) | 0), 13 + ((Math.random() * 5) | 0)][req.level];
  const grade = [null, pick(["first grade", "second grade"]), pick(["third grade", "fourth grade", "fifth grade"]), pick(["eighth grade", "high school"])][req.level];
  if (parent) {
    const forWho = req.level === 0 ? (v() ? "my preschooler" : `my ${age}-year-old`) : v() ? `my ${pick(["kid", "child"])} in ${grade}` : `my ${age}-year-old`;
    parts.push(`I'm looking for ${media} for ${forWho}.`);
  } else {
    parts.push(v() ? `I'm in ${grade}.` : `I'm ${age}.`);
    parts.push(`Do you have ${media}?`);
  }
  if (req.genres.length) {
    const g = list(req.genres.map((k) => (v() ? GENRES[k].vague : GENRES[k].say)), "or");
    parts.push(parent ? `They love ${g}.` : `I'm into ${g}.`);
  }
  if (req.moods.length) parts.push(v() ? MOODS[req.moods[0]].vague : MOODS[req.moods[0]].ask);
  if (req.loved != null) {
    const t = `“${CATALOG[req.loved].title}”`;
    parts.push(parent ? pick([`They loved ${t}.`, `Their favorite is ${t}.`]) : pick([`I loved ${t}!`, `My favorite ever is ${t}.`, `I just finished ${t}. More like that, please!`]));
  }
  for (const k of req.dislikes) parts.push(v() ? DISLIKES[k].vague : DISLIKES[k].ask);
  return parts.join(" ");
}

// ---------- Scoring ----------
// Type 25 · age 20 · genre 25 · mood 15 · read-alike 15 = 100 for a perfect pick.
// Each thing they said they didn't want costs 40 and caps the pick at 30.
// The wrong kind of item (a movie when they asked for a book) caps at 15.
function scorePick(item, req) {
  const lines = [];
  const ok = (t) => lines.push({ k: "ok", t });
  const part = (t) => lines.push({ k: "part", t });
  const no = (t) => lines.push({ k: "no", t });
  const loved = req.loved != null ? CATALOG[req.loved] : null;
  if (loved && item.id === loved.id) {
    part(`They already loved “${loved.title}”! Find something new that's like it.`);
    return finish(10, lines);
  }
  let pts = 0;

  const typeOK = item.type === req.type;
  if (typeOK) {
    pts += 25;
    ok(`${cap(TYPES[item.type].a)}, just what they asked for.`);
  } else no(`They asked for ${TYPES[req.type].a}, not ${TYPES[item.type].a}.`);

  const gap = Math.abs(item.level - req.level);
  if (!gap) {
    pts += 20;
    ok(`Right age group (${LEVELS[item.level].label}).`);
  } else if (gap === 1) {
    pts += 8;
    part(`Close in age, but they need ${LEVELS[req.level].label}.`);
  } else no(`Wrong age group: they need ${LEVELS[req.level].label}.`);

  const wantG = req.genres.length ? req.genres : loved ? loved.genres : null;
  if (!wantG) pts += 25;
  else {
    const m = item.genres.filter((g) => wantG.includes(g));
    if (m.length) {
      pts += 25;
      ok(req.genres.length ? `It has ${genreNames(m)}, a kind they like.` : `Same kind of story as their favorite (${genreNames(m)}).`);
    } else no(req.genres.length ? `They wanted ${genreNames(wantG, "or")}.` : `Not the same kind of story as their favorite.`);
  }

  const wantM = req.moods.length ? req.moods : loved ? loved.moods : null;
  if (!wantM) pts += 15;
  else {
    const m = item.moods.filter((x) => wantM.includes(x));
    if (m.length) {
      pts += 15;
      ok(`It feels ${moodNames(m)}, like they hoped.`);
    } else no(`They were hoping for something ${moodNames(wantM, "or")}.`);
  }

  if (!loved) pts += 15;
  else {
    const sg = share(item.genres, loved.genres),
      sm = share(item.moods, loved.moods);
    if (sg && sm) {
      pts += 15;
      ok(`A great match for fans of “${loved.title}”.`);
    } else if (sg || sm) {
      pts += 7;
      part(`A little like “${loved.title}”.`);
    } else no(`Not much like “${loved.title}”.`);
  }

  let broken = 0;
  for (const k of req.dislikes)
    if (DISLIKES[k].test(item)) {
      pts -= 40;
      broken++;
      no(DISLIKES[k].why);
    }
  if (req.dislikes.length && !broken) ok("Nothing they said they didn't want.");
  if (broken) pts = Math.min(pts, 30); // a "no thanks" item is never better than "Not for me"
  if (!typeOK) pts = Math.min(pts, 15);
  return finish(clamp(pts, 0, 100), lines);
}

const TIERS = [
  { min: 100, name: "New fave!", color: RIGHT, face: "love" },
  { min: 75, name: "Great pick!", color: "#3d7fc4", face: "happy" },
  { min: 45, name: "Okay pick", color: PARTLY, face: "neutral" },
  { min: 0, name: "Not for me...", color: WRONG, face: "sad" },
];
function finish(points, lines) {
  return { points, lines, tier: TIERS.find((t) => points >= t.min) };
}

// ---------- Game state ----------
let state = "ready"; // ready | playing | result | shiftover | dayover | paused
let pausedFrom = null;
let day = 1,
  shift = 0,
  total = 0,
  shiftPoints = 0,
  clock = SHIFT_SECONDS;
let P = params(0);
let queue = [], // patrons at the window and in line (front first)
  leavers = []; // patrons walking away
let spawnTimer = 0;
let stats = { helped: 0, faves: 0, left: 0 };
let result = null;
let popups = [],
  particles = [];
let time = 0;
let best = loadBest();

// catalog browsing
const view = { tab: "all", age: null, genre: null, page: 0, selected: null };

function loadBest() {
  try {
    const b = JSON.parse(safeGet("faves-best") || "null");
    return b && typeof b.score === "number" ? b : { score: 0, day: 0 };
  } catch {
    return { score: 0, day: 0 };
  }
}

const difficulty = () => (day - 1) * 3 + shift;

function startGame() {
  day = 1;
  shift = 0;
  total = 0;
  startShift();
  sfx.start();
}

function startShift() {
  P = params(difficulty());
  clock = SHIFT_SECONDS;
  shiftPoints = 0;
  queue = [];
  leavers = [];
  spawnTimer = 1.2;
  stats = { helped: 0, faves: 0, left: 0 };
  result = null;
  view.selected = null;
  state = "playing";
}

function front() {
  return queue[0] || null;
}
function frontReady() {
  const f = front();
  return !!(f && f.arrived);
}

function spawnPatron() {
  const req = makeRequest(difficulty());
  queue.push({ req, look: randomLook(req), x: -70, patience: P.patience, max: P.patience, arrived: false, face: "neutral", bob: Math.random() * 6 });
}

function spotX(i) {
  const cx = L.win.x + L.win.w / 2 + (portrait ? 0 : 10);
  return i === 0 ? cx : cx - 70 - (i - 1) * 58;
}

function recommend() {
  if (state !== "playing" || view.selected == null) return;
  const f = front();
  if (!f || !f.arrived) {
    popup("Wait for a patron at the window!", L.win.x + L.win.w / 2, L.win.y + 30, PAPER);
    return;
  }
  const item = CATALOG[view.selected];
  const r = scorePick(item, f.req);
  const speedy = r.points >= 45 && f.patience / f.max > 0.5 ? SPEED_BONUS : 0;
  result = { ...r, item, req: f.req, speedy, gained: r.points + speedy };
  shiftPoints += result.gained;
  stats.helped++;
  if (r.points === 100) stats.faves++;
  f.face = r.tier.face;
  state = "result";
  const fx = spotX(0),
    fy = L.win.y + 40;
  popup("+" + result.gained, fx, fy, r.tier.color);
  if (r.points === 100) {
    confetti(fx, fy + 30);
    sfx.fave();
  } else if (r.points >= 75) sfx.great();
  else if (r.points >= 45) sfx.okay();
  else sfx.nope();
}

function nextPatron() {
  if (state !== "result") return;
  const f = queue.shift();
  if (f) leavers.push(f);
  result = null;
  view.selected = null;
  state = "playing";
  if (!queue.length) spawnTimer = Math.min(spawnTimer, 1.2);
}

function lookUpLoved() {
  const f = front();
  if (!f || !f.arrived || f.req.loved == null || state !== "playing") return;
  const item = CATALOG[f.req.loved];
  view.tab = item.type;
  view.age = null;
  view.genre = null;
  const items = filteredItems();
  view.page = Math.floor(items.indexOf(item) / perPage());
  view.selected = item.id;
  sfx.click();
}

function endShift() {
  for (const f of queue) leavers.push(f);
  queue = [];
  state = "shiftover";
  if (shiftPoints >= P.goal) sfx.pass();
  else sfx.retry();
}

function continueAfterShift() {
  if (shiftPoints >= P.goal) {
    total += shiftPoints;
    if (total > best.score || day > best.day) {
      best = { score: Math.max(best.score, total), day: Math.max(best.day, day) };
      safeSet("faves-best", JSON.stringify(best));
    }
    if (shift === SHIFTS.length - 1) {
      state = "dayover";
      sfx.pass();
      return;
    }
    shift++;
  }
  startShift(); // next shift, or try the same one again
}

function continueAfterDay() {
  day++;
  shift = 0;
  startShift();
}

// ---------- Update ----------
function update(dt) {
  time += dt;
  updateEffects(dt);
  // walking patrons keep walking even while a result is showing
  const walkSpeed = 170 * dt;
  queue.forEach((p, i) => {
    const tx = spotX(i);
    if (Math.abs(p.x - tx) > 1) p.x += Math.sign(tx - p.x) * Math.min(walkSpeed, Math.abs(tx - p.x));
    if (i === 0 && !p.arrived && Math.abs(p.x - tx) <= 1) {
      p.arrived = true;
      sfx.bell();
    }
  });
  for (const p of leavers) p.x += walkSpeed * 1.2;
  leavers = leavers.filter((p) => p.x < L.win.x + L.win.w + 80);

  if (state !== "playing") return;
  clock -= dt;
  if (clock <= 0) {
    clock = 0;
    return endShift();
  }

  spawnTimer -= dt;
  if (!queue.length && spawnTimer > 2) spawnTimer = 2;
  if (spawnTimer <= 0 && queue.length < P.queueMax) {
    spawnPatron();
    spawnTimer = P.gap;
  }

  // patience runs down (slower for people still in line)
  for (let i = queue.length - 1; i >= 0; i--) {
    const p = queue[i];
    if (!p.arrived && i === 0) continue;
    p.patience -= dt * (i === 0 ? 1 : 0.4);
    if (p.patience <= 0) {
      p.face = "sad";
      queue.splice(i, 1);
      leavers.push(p);
      stats.left++;
      popup("They had to go. Maybe next time!", L.win.x + L.win.w / 2, L.win.y + 30, PAPER);
      sfx.leave();
    }
  }
}

function updateEffects(dt) {
  for (const p of popups) {
    p.life -= dt;
    p.y -= dt * 22;
  }
  popups = popups.filter((p) => p.life > 0);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

function popup(text, x, y, color) {
  popups.push({ text, x, y, color, life: 1.6 });
}
function confetti(x, y) {
  const colors = ["#c92a2f", "#3d4c8c", "#e8b52a", "#ffffff", "#2f9e44"];
  for (let i = 0; i < 26; i++)
    particles.push({ x, y, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 260 - 60, life: 0.9 + Math.random() * 0.6, color: colors[i % colors.length] });
}

// ---------- Sound (Web Audio API, no files needed) ----------
let audio = null;
let muted = safeGet("faves-muted") === "1";
function tone(freqStart, freqEnd, duration, type = "sine", volume = 0.1, delay = 0) {
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
  bell: () => {
    tone(1318, 1318, 0.5, "sine", 0.08);
    tone(1975, 1975, 0.4, "sine", 0.04);
  },
  click: () => tone(700, 700, 0.03, "square", 0.03),
  fave: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, "triangle", 0.11, i * 0.09)),
  great: () => [523, 659, 784].forEach((f, i) => tone(f, f, 0.14, "sine", 0.11, i * 0.08)),
  okay: () => {
    tone(523, 523, 0.12, "sine", 0.1);
    tone(587, 587, 0.14, "sine", 0.1, 0.1);
  },
  nope: () => {
    tone(330, 300, 0.14, "triangle", 0.09);
    tone(262, 240, 0.2, "triangle", 0.09, 0.12);
  },
  leave: () => tone(440, 300, 0.3, "sine", 0.06),
  pass: () => [392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.14, "triangle", 0.11, i * 0.1)),
  retry: () => {
    tone(392, 392, 0.14, "sine", 0.09);
    tone(330, 330, 0.2, "sine", 0.09, 0.14);
  },
  start: () => {
    tone(523, 523, 0.08, "triangle", 0.1);
    tone(784, 784, 0.12, "triangle", 0.1, 0.08);
  },
};
const muteBtn = document.getElementById("mute");
function updateMuteLabel() {
  if (muteBtn) muteBtn.textContent = muted ? "Sound: off" : "Sound: on";
}
function toggleMute() {
  muted = !muted;
  safeSet("faves-muted", muted ? "1" : "0");
  updateMuteLabel();
  if (!muted) tone(660, 660, 0.08, "sine", 0.1);
}
updateMuteLabel();
if (muteBtn) muteBtn.addEventListener("click", toggleMute);

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

// ---------- Layout ----------
function layout() {
  portrait = window.innerWidth < 700;
  if (portrait) {
    W = 480;
    H = 906;
    L = {
      scene: { x: 0, y: 0, w: 480, h: 388 },
      hud: { x: 10, y: 6, w: 460, h: 46 },
      sign: null,
      win: { x: 20, y: 58, w: 440, h: 156 },
      counter: { x: 10, y: 214, w: 460, h: 30 },
      bubble: { x: 12, y: 252, w: 456, h: 130 },
      cat: { x: 10, y: 390, w: 460, h: 512 },
      inline: false,
      rows: 3,
      cols: 4,
    };
  } else {
    W = 960;
    H = 640;
    L = {
      scene: { x: 0, y: 0, w: 430, h: 640 },
      hud: { x: 12, y: 8, w: 406, h: 48 },
      sign: { x: 65, y: 64, w: 300, h: 42 },
      win: { x: 28, y: 114, w: 374, h: 222 },
      counter: { x: 14, y: 336, w: 402, h: 38 },
      bubble: { x: 16, y: 388, w: 398, h: 244 },
      cat: { x: 440, y: 8, w: 510, h: 624 },
      inline: true,
      rows: 2,
      cols: 5,
    };
  }
  canvas.width = W;
  canvas.height = H;
  canvas.style.maxWidth = W + "px";
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
  ctx.closePath();
  ctx.fill();
}
function circle(x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function text(str, x, y, font, color, align = "center") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
}
function ellipsize(str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str;
  while (str.length > 1 && ctx.measureText(str + "…").width > maxW) str = str.slice(0, -1);
  return str + "…";
}
function wrapLines(str, maxW, font) {
  ctx.font = font;
  const out = [];
  let line = "";
  for (const word of str.split(" ")) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = word;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}
// Draws wrapped text (at most maxLines lines); returns the y after the last line.
function wrap(str, x, y, maxW, lineH, font, color, maxLines = 99, align = "left") {
  let lines = wrapLines(str, maxW, font);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = ellipsize(lines[maxLines - 1] + " …", maxW);
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += lineH;
  }
  return y;
}

// ---------- Clickable areas (mouse, touch and keyboard) ----------
let targets = [];
let focusId = null;
let keyboardUsed = false;
function addTarget(id, r, fn, enabled = true) {
  targets.push({ id, x: r.x, y: r.y, w: r.w, h: r.h, fn, enabled });
}
function button(id, r, label, fn, opts = {}) {
  const enabled = opts.enabled !== false;
  ctx.fillStyle = !enabled ? "rgba(120,120,120,0.5)" : opts.active ? GOLD : opts.fill || NAVY;
  roundRect(r.x, r.y, r.w, r.h, opts.radius ?? 8);
  if (opts.border !== false) {
    ctx.strokeStyle = opts.active ? "#f0d590" : MAPLE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  const size = opts.size || 14;
  ctx.font = `bold ${size}px ${opts.family || "system-ui, sans-serif"}`;
  const t = ellipsize(label, r.w - 8);
  text(t, r.x + r.w / 2, r.y + r.h / 2 + size * 0.36, ctx.font, opts.active ? INK : opts.color || PAPER);
  addTarget(id, r, fn, enabled);
}

// ---------- Drawing: the window ----------
const SKIN = ["#f6d1b1", "#e8b48a", "#c98a5e", "#a0663f", "#7a4a2b", "#5a3520"];
const HAIR = ["#2a1d12", "#5a3a22", "#b5651d", "#e3c16f", "#1a1a1a", "#8a8a8a", "#a33b2a"];
const SHIRTS = ["#c92a2f", "#3d4c8c", "#e8b52a", "#2f7d84", "#6b3e75", "#4f7942", "#d9773a", "#de4a8a"];
function randomLook(req) {
  return {
    skin: pick(SKIN),
    hair: pick(HAIR),
    style: (Math.random() * 4) | 0,
    shirt: pick(SHIRTS),
    glasses: Math.random() < 0.25,
    kid: req.kind === "parent" ? { skin: pick(SKIN), hair: pick(HAIR), style: (Math.random() * 4) | 0, shirt: pick(SHIRTS) } : null,
    size: req.kind === "teen" ? 1 : req.kind === "parent" ? 1.08 : 0.86,
  };
}

function drawFace(x, y, r, face) {
  ctx.fillStyle = "#2a1d12";
  ctx.strokeStyle = "#2a1d12";
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  if (face === "love") {
    heart(x - r * 0.35, y - r * 0.12, r * 0.22, "#d94b6a");
    heart(x + r * 0.35, y - r * 0.12, r * 0.22, "#d94b6a");
  } else {
    circle(x - r * 0.35, y - r * 0.1, r * 0.1, "#2a1d12");
    circle(x + r * 0.35, y - r * 0.1, r * 0.1, "#2a1d12");
  }
  ctx.beginPath();
  if (face === "happy" || face === "love") ctx.arc(x, y + r * 0.2, r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (face === "sad") ctx.arc(x, y + r * 0.6, r * 0.3, 1.2 * Math.PI, 1.8 * Math.PI);
  else if (face === "worried") {
    ctx.moveTo(x - r * 0.25, y + r * 0.42);
    ctx.quadraticCurveTo(x, y + r * 0.3, x + r * 0.25, y + r * 0.42);
  } else {
    ctx.moveTo(x - r * 0.25, y + r * 0.35);
    ctx.lineTo(x + r * 0.25, y + r * 0.35);
  }
  ctx.stroke();
}

function heart(x, y, s, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.fill();
}

function drawPerson(x, footY, look, scale, face, glasses) {
  const s = scale;
  const headR = 20 * s,
    bodyW = 46 * s,
    bodyH = 70 * s;
  const headY = footY - bodyH - headR * 1.6;
  // body
  ctx.fillStyle = look.shirt;
  roundRect(x - bodyW / 2, footY - bodyH - 4 * s, bodyW, bodyH + 20, 14 * s);
  // neck and head
  R(x - 5 * s, headY + headR * 0.7, 10 * s, 10 * s, look.skin);
  circle(x, headY, headR, look.skin);
  // hair styles
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  if (look.style === 0) ctx.arc(x, headY - headR * 0.15, headR * 1.02, Math.PI, 0); // short
  else if (look.style === 1) {
    ctx.arc(x, headY - headR * 0.1, headR * 1.08, Math.PI * 0.95, Math.PI * 0.05); // long
    ctx.rect(x - headR * 1.08, headY - headR * 0.1, headR * 0.4, headR * 1.5);
    ctx.rect(x + headR * 0.68, headY - headR * 0.1, headR * 0.4, headR * 1.5);
  } else if (look.style === 2) {
    // curly puffs
    for (let a = 0; a < 7; a++) {
      const ang = Math.PI + (a / 6) * Math.PI;
      ctx.moveTo(x + Math.cos(ang) * headR, headY - headR * 0.1 + Math.sin(ang) * headR);
      ctx.arc(x + Math.cos(ang) * headR, headY - headR * 0.1 + Math.sin(ang) * headR, headR * 0.36, 0, Math.PI * 2);
    }
  } else {
    ctx.arc(x, headY - headR * 0.15, headR * 1.02, Math.PI, 0); // with bun
    ctx.moveTo(x + headR * 0.4, headY - headR * 1.2);
    ctx.arc(x, headY - headR * 1.25, headR * 0.42, 0, Math.PI * 2);
  }
  ctx.fill();
  drawFace(x, headY + headR * 0.1, headR, face);
  if (glasses) {
    ctx.strokeStyle = "#2a1d12";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x - headR * 0.35, headY, headR * 0.24, 0, Math.PI * 2);
    ctx.moveTo(x + headR * 0.59, headY);
    ctx.arc(x + headR * 0.35, headY, headR * 0.24, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPatron(p, x, footY, scale) {
  const bob = p.arrived ? 0 : Math.abs(Math.sin(time * 9 + p.bob)) * 3;
  let face = p.face;
  if (face === "neutral" && p.arrived && p.patience / p.max < 0.3) face = "worried";
  if (p.look.kid) drawPerson(x + 40 * scale, footY + 8 - bob, p.look.kid, scale * 0.62, face === "worried" ? "neutral" : face, false);
  drawPerson(x - (p.look.kid ? 8 * scale : 0), footY - bob, p.look, scale * p.look.size, face, p.look.glasses);
}

function drawWindow() {
  const s = L.scene,
    w = L.win;
  R(s.x, s.y, s.w, s.h, NAVY);
  // lobby seen through the window
  ctx.save();
  ctx.beginPath();
  ctx.rect(w.x, w.y, w.w, w.h);
  ctx.clip();
  R(w.x, w.y, w.w, w.h, "#e7e2d6");
  // back bookcases
  for (let k = 0; k < 3; k++) {
    const bx = w.x + 14 + k * (w.w / 3),
      by = w.y + w.h * 0.28,
      bw = w.w / 3 - 26,
      bh = w.h * 0.5;
    R(bx, by, bw, bh, "#cda46c");
    for (let row = 0; row < 2; row++) {
      const ry = by + 6 + row * (bh / 2);
      R(bx + 4, ry, bw - 8, bh / 2 - 8, "#efe6d4");
      for (let sx = bx + 6, n = 0; sx < bx + bw - 8; n++) {
        const sw = 4 + (hash("s" + k + row + n) % 5);
        const sh = (bh / 2 - 12) * (0.6 + (hash("h" + k + row + n) % 40) / 100);
        R(sx, ry + bh / 2 - 8 - sh, Math.min(sw, bx + bw - 8 - sx), sh, COVER_COLORS[hash("c" + k + row + n) % COVER_COLORS.length]);
        sx += sw + 1;
      }
    }
  }
  R(w.x, w.y + w.h - 26, w.w, 26, "#c3b493");
  // patrons: the line behind, then the front, then anyone leaving
  const footY = w.y + w.h + (portrait ? 34 : 44);
  const sc = portrait ? 0.78 : 1;
  for (let i = queue.length - 1; i >= 1; i--) drawPatron(queue[i], queue[i].x, footY - 26 * sc, sc * 0.72);
  if (queue[0]) drawPatron(queue[0], queue[0].x, footY, sc);
  for (const p of leavers) drawPatron(p, p.x, footY, sc);
  ctx.restore();
  // glass sheen and frame
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(w.x + w.w * 0.55, w.y);
  ctx.lineTo(w.x + w.w * 0.7, w.y);
  ctx.lineTo(w.x + w.w * 0.45, w.y + w.h);
  ctx.lineTo(w.x + w.w * 0.3, w.y + w.h);
  ctx.fill();
  ctx.strokeStyle = MAPLE;
  ctx.lineWidth = 10;
  ctx.strokeRect(w.x - 5, w.y - 5, w.w + 10, w.h + 10);
  // counter with a bell and a little stack of books
  const c = L.counter;
  R(c.x, c.y, c.w, c.h, MAPLE);
  R(c.x, c.y, c.w, 6, "#2b2d31");
  for (let x = c.x + 40; x < c.x + c.w; x += 60) R(x, c.y + 8, 2, c.h - 8, "#b9873f");
  circle(c.x + c.w - 40, c.y - 4, 9, "#d9b24a");
  R(c.x + c.w - 52, c.y - 2, 24, 3, "#9a7a2a");
  R(c.x + 20, c.y - 8, 34, 7, "#c92a2f");
  R(c.x + 23, c.y - 14, 30, 6, "#3d4c8c");
}

function drawSign() {
  const s = L.sign;
  if (!s) return;
  R(s.x, s.y, s.w, s.h, MAPLE);
  R(s.x, s.y + s.h - 4, s.w, 4, "#b07636");
  drawLogo(s.x + 22, s.y + 6, 24);
  text("Fave Finder", s.x + 44 + (s.w - 44) / 2, s.y + 20, "bold 20px Georgia, serif", "#3a2512");
  text("Ask us for your next favorite!", s.x + 44 + (s.w - 44) / 2, s.y + 36, "italic 12px Georgia, serif", "#5a3a1c");
}

function drawHud() {
  const h = L.hud;
  ctx.fillStyle = "rgba(20, 14, 10, 0.55)";
  roundRect(h.x, h.y, h.w, h.h, 8);
  const label = state === "ready" ? "Fave Finder" : `Day ${day} · ${SHIFTS[shift]} shift`;
  text(label, h.x + 12, h.y + 19, "bold 15px Georgia, serif", PAPER, "left");
  // pause button
  button("pause", { x: h.x + h.w - 40, y: h.y + 6, w: 32, h: 34 }, state === "paused" ? "▶" : "II", togglePause, { size: 14, enabled: state === "playing" || state === "paused" });
  // clock
  const secs = Math.ceil(clock);
  text(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, h.x + h.w - 50, h.y + 21, "bold 18px system-ui, sans-serif", secs <= 15 && state === "playing" ? "#ffb4a8" : PAPER, "right");
  // points toward the goal
  const bx = h.x + 12,
    by = h.y + 28,
    bw = h.w - 70,
    bh = 12;
  R(bx, by, bw, bh, "rgba(243,234,215,0.2)");
  R(bx, by, bw * clamp(shiftPoints / P.goal, 0, 1), bh, shiftPoints >= P.goal ? RIGHT : GOLD);
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(20, 14, 10, 0.85)";
  ctx.strokeText(`${shiftPoints} / ${P.goal} points`, bx + bw / 2, by + 10);
  text(`${shiftPoints} / ${P.goal} points`, bx + bw / 2, by + 10, ctx.font, PAPER);
}

function drawBubble() {
  const b = L.bubble;
  const f = front();
  // speech bubble with a tail up to the window
  ctx.fillStyle = CREAM;
  roundRect(b.x, b.y, b.w, b.h, 12);
  const tx = clamp(f ? f.x : b.x + b.w / 2, b.x + 30, b.x + b.w - 30);
  ctx.beginPath();
  ctx.moveTo(tx - 12, b.y + 1);
  ctx.lineTo(tx, b.y - 14);
  ctx.lineTo(tx + 12, b.y + 1);
  ctx.fill();
  const pad = 14;
  if (!f || !f.arrived) {
    const msg = state === "ready" ? "Patrons will come to this window asking for something new to read, watch or listen to." : f ? "Here comes someone!" : "The window is open! Waiting for the next patron...";
    wrap(msg, b.x + pad, b.y + 30, b.w - pad * 2, 20, "italic 15px Georgia, serif", "#5a4a3a");
    return;
  }
  // patience meter
  text("WHAT THEY'RE LOOKING FOR", b.x + pad, b.y + 20, "bold 11px system-ui, sans-serif", "#8a6a3a", "left");
  const frac = clamp(f.patience / f.max, 0, 1);
  const mw = portrait ? 120 : 110;
  R(b.x + b.w - pad - mw, b.y + 11, mw, 10, "#e2d9c6");
  R(b.x + b.w - pad - mw, b.y + 11, mw * frac, 10, frac > 0.5 ? RIGHT : frac > 0.25 ? PARTLY : WRONG);
  text("patience", b.x + b.w - pad - mw - 6, b.y + 20, "11px system-ui, sans-serif", "#8a6a3a", "right");
  // request text, shrinking the font a little if it's long
  const hasLook = f.req.loved != null;
  const avail = b.h - 34 - (hasLook ? 40 : 8);
  let size = portrait ? 15 : 16,
    lines;
  do {
    lines = wrapLines(f.req.text, b.w - pad * 2, `${size}px Georgia, serif`);
    if (lines.length * size * 1.25 <= avail || size <= 11) break;
    size--;
  } while (true);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  lines.forEach((l, i) => ctx.fillText(l, b.x + pad, b.y + 34 + size + i * size * 1.25));
  if (hasLook) {
    const t = CATALOG[f.req.loved].title;
    button("lookup", { x: b.x + pad, y: b.y + b.h - 38, w: Math.min(b.w - pad * 2, 330), h: 30 }, `🔎 Look up “${t}”`, lookUpLoved, { size: 13, enabled: state === "playing" });
  }
}

// ---------- Drawing: covers ----------
function drawIcon(key, cx, cy, s, color = "rgba(255,255,255,0.9)") {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, s * 0.12);
  ctx.beginPath();
  switch (key) {
    case "adventure": // mountains and a sun
      ctx.moveTo(cx - s, cy + s * 0.6);
      ctx.lineTo(cx - s * 0.3, cy - s * 0.5);
      ctx.lineTo(cx + s * 0.1, cy + s * 0.1);
      ctx.lineTo(cx + s * 0.45, cy - s * 0.25);
      ctx.lineTo(cx + s, cy + s * 0.6);
      ctx.fill();
      circle(cx + s * 0.55, cy - s * 0.7, s * 0.2, color);
      break;
    case "mystery": // magnifying glass
      ctx.arc(cx - s * 0.15, cy - s * 0.15, s * 0.45, 0, Math.PI * 2);
      ctx.moveTo(cx + s * 0.18, cy + s * 0.18);
      ctx.lineTo(cx + s * 0.7, cy + s * 0.7);
      ctx.stroke();
      break;
    case "fantasy": // star
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
          r = i % 2 ? s * 0.38 : s * 0.85;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.fill();
      break;
    case "space": // rocket
      ctx.moveTo(cx, cy - s);
      ctx.quadraticCurveTo(cx + s * 0.45, cy - s * 0.3, cx + s * 0.3, cy + s * 0.5);
      ctx.lineTo(cx - s * 0.3, cy + s * 0.5);
      ctx.quadraticCurveTo(cx - s * 0.45, cy - s * 0.3, cx, cy - s);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, cy + s * 0.2);
      ctx.lineTo(cx - s * 0.6, cy + s * 0.7);
      ctx.lineTo(cx - s * 0.25, cy + s * 0.5);
      ctx.moveTo(cx + s * 0.3, cy + s * 0.2);
      ctx.lineTo(cx + s * 0.6, cy + s * 0.7);
      ctx.lineTo(cx + s * 0.25, cy + s * 0.5);
      ctx.fill();
      break;
    case "animals": // paw
      circle(cx, cy + s * 0.25, s * 0.42, color);
      circle(cx - s * 0.5, cy - s * 0.2, s * 0.17, color);
      circle(cx - s * 0.18, cy - s * 0.5, s * 0.17, color);
      circle(cx + s * 0.18, cy - s * 0.5, s * 0.17, color);
      circle(cx + s * 0.5, cy - s * 0.2, s * 0.17, color);
      break;
    case "sports": // ball
      ctx.arc(cx, cy, s * 0.7, 0, Math.PI * 2);
      ctx.moveTo(cx - s * 0.7, cy);
      ctx.quadraticCurveTo(cx, cy - s * 0.4, cx + s * 0.7, cy);
      ctx.moveTo(cx - s * 0.7, cy);
      ctx.quadraticCurveTo(cx, cy + s * 0.4, cx + s * 0.7, cy);
      ctx.stroke();
      break;
    case "friendship":
      heart(cx, cy, s * 0.6, color);
      break;
    case "history": // column
      ctx.rect(cx - s * 0.6, cy - s * 0.75, s * 1.2, s * 0.2);
      ctx.rect(cx - s * 0.4, cy - s * 0.55, s * 0.8, s * 1.1);
      ctx.rect(cx - s * 0.6, cy + s * 0.55, s * 1.2, s * 0.2);
      ctx.fill();
      break;
    case "fairytales": // castle
      ctx.rect(cx - s * 0.7, cy - s * 0.1, s * 1.4, s * 0.8);
      ctx.rect(cx - s * 0.7, cy - s * 0.5, s * 0.35, s * 0.4);
      ctx.rect(cx + s * 0.35, cy - s * 0.5, s * 0.35, s * 0.4);
      ctx.rect(cx - s * 0.18, cy - s * 0.8, s * 0.36, s * 0.7);
      ctx.fill();
      break;
    case "science": // atom
      ctx.ellipse(cx, cy, s * 0.85, s * 0.3, 0, 0, Math.PI * 2);
      ctx.moveTo(cx + s * 0.42, cy + s * 0.74);
      ctx.ellipse(cx, cy, s * 0.85, s * 0.3, Math.PI / 3, 0, Math.PI * 2);
      ctx.moveTo(cx + s * 0.42, cy - s * 0.74);
      ctx.ellipse(cx, cy, s * 0.85, s * 0.3, -Math.PI / 3, 0, Math.PI * 2);
      ctx.stroke();
      circle(cx, cy, s * 0.15, color);
      break;
    case "howto": // pencil
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-s * 0.2, -s * 0.8, s * 0.4, s * 1.2);
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, s * 0.4);
      ctx.lineTo(0, s * 0.8);
      ctx.lineTo(s * 0.2, s * 0.4);
      ctx.fill();
      ctx.restore();
      break;
    case "poetry": // feather
      ctx.moveTo(cx - s * 0.6, cy + s * 0.8);
      ctx.quadraticCurveTo(cx - s * 0.6, cy - s * 0.6, cx + s * 0.6, cy - s * 0.8);
      ctx.quadraticCurveTo(cx + s * 0.3, cy + s * 0.3, cx - s * 0.6, cy + s * 0.8);
      ctx.fill();
      break;
    case "lullabies":
    case "chill": // moon
      ctx.arc(cx, cy, s * 0.7, 0.35 * Math.PI, 1.75 * Math.PI);
      ctx.quadraticCurveTo(cx - s * 0.05, cy - s * 0.1, cx + s * 0.25, cy + s * 0.65);
      ctx.fill();
      break;
    case "rock": // lightning bolt
      ctx.moveTo(cx + s * 0.2, cy - s * 0.9);
      ctx.lineTo(cx - s * 0.45, cy + s * 0.1);
      ctx.lineTo(cx - s * 0.02, cy + s * 0.1);
      ctx.lineTo(cx - s * 0.2, cy + s * 0.9);
      ctx.lineTo(cx + s * 0.45, cy - s * 0.15);
      ctx.lineTo(cx + s * 0.02, cy - s * 0.15);
      ctx.fill();
      break;
    case "world": // globe
      ctx.arc(cx, cy, s * 0.7, 0, Math.PI * 2);
      ctx.moveTo(cx - s * 0.7, cy);
      ctx.lineTo(cx + s * 0.7, cy);
      ctx.moveTo(cx, cy - s * 0.7);
      ctx.ellipse(cx, cy, s * 0.3, s * 0.7, 0, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      break;
    default: // music note
      circle(cx - s * 0.3, cy + s * 0.45, s * 0.28, color);
      ctx.fillRect(cx - s * 0.06, cy - s * 0.8, s * 0.12, s * 1.3);
      ctx.fillRect(cx - s * 0.06, cy - s * 0.8, s * 0.55, s * 0.18);
  }
}

function drawCover(item, x, y, w, h, big = false) {
  const t = item.type;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  roundRect(x + 2, y + 3, w, h, 4);
  if (t === "movie" || t === "tv") {
    // DVD case
    ctx.fillStyle = "#1d1d22";
    roundRect(x, y, w, h, 4);
    R(x + 4, y + 4, w - 8, h - 8, item.color);
    if (t === "movie") for (let k = y + 8; k < y + h - 6; k += 9) {
      R(x + 6, k, 3, 4, "rgba(0,0,0,0.45)");
      R(x + w - 9, k, 3, 4, "rgba(0,0,0,0.45)");
    }
  } else if (t === "music") {
    // CD case with the disc peeking out
    const sq = Math.min(w, h);
    const sy = y + (h - sq);
    circle(x + w * 0.62, sy + sq / 2, sq * 0.46, "#d9dde2");
    circle(x + w * 0.62, sy + sq / 2, sq * 0.1, "#9aa1a9");
    ctx.fillStyle = item.color;
    roundRect(x, sy, sq * 0.82, sq, 3);
    drawIcon(item.genres[0], x + sq * 0.41, sy + sq * 0.5, sq * 0.26);
    return coverExtras(item, x, sy, sq * 0.82, sq, big);
  } else {
    ctx.fillStyle = item.color;
    roundRect(x, y, w, h, 3);
    R(x, y, Math.max(4, w * 0.09), h, "rgba(0,0,0,0.2)"); // spine shadow
  }
  drawIcon(item.genres[0], x + w / 2, y + h * 0.42, Math.min(w, h) * 0.24);
  coverExtras(item, x, y, w, h, big);
}

function coverExtras(item, x, y, w, h, big) {
  const t = item.type;
  if (t === "audio") {
    // headphones badge
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + w - 12, y + h - 10, 7, Math.PI, 0);
    ctx.stroke();
    R(x + w - 21, y + h - 11, 4, 6, "#fff");
    R(x + w - 7, y + h - 11, 4, 6, "#fff");
  } else if (t === "graphic") {
    // POW burst
    ctx.fillStyle = "#ffe14d";
    ctx.beginPath();
    const bx = x + w - 13,
      by = y + 12;
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        r = i % 2 ? 6 : 11;
      ctx.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r);
    }
    ctx.fill();
  } else if (t === "tv") {
    ctx.fillStyle = "#fff";
    roundRect(x + w - 24, y + 7, 18, 12, 2);
    text("TV", x + w - 15, y + 16, "bold 8px system-ui, sans-serif", "#1d1d22");
  }
  if (big) {
    // title on big covers, with a library sticker
    const lines = wrapLines(item.title, w - 14, "bold 11px Georgia, serif").slice(0, 3);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    roundRect(x + 5, y + h - 12 - lines.length * 13, w - 10, lines.length * 13 + 6, 3);
    lines.forEach((l, i) => text(l, x + w / 2, y + h - 10 - (lines.length - 1 - i) * 13 - 2, "bold 11px Georgia, serif", INK));
    drawLogo(x + 12, y + 5, 10);
  }
}

// ---------- Drawing: the shelves (catalog) ----------
function filteredItems() {
  return CATALOG.filter((i) => (view.tab === "all" || i.type === view.tab) && (view.age == null || i.level === view.age) && (view.genre == null || i.genres.includes(view.genre))).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
}
const perPage = () => L.rows * L.cols;

function setTab(t) {
  view.tab = t;
  const present = new Set(filteredItemsFor(t).flatMap((i) => i.genres));
  if (view.genre && !present.has(view.genre)) view.genre = null;
  view.page = 0;
  sfx.click();
}
function filteredItemsFor(tab) {
  return CATALOG.filter((i) => tab === "all" || i.type === tab);
}

function drawCatalog() {
  const c = L.cat;
  ctx.fillStyle = "#2e2219";
  roundRect(c.x, c.y, c.w, c.h, 10);
  // media tabs
  const tabs = ["all", ...TYPE_KEYS];
  const tw = c.w / tabs.length;
  tabs.forEach((t, i) => {
    button("tab-" + t, { x: c.x + i * tw + 2, y: c.y + 2, w: tw - 4, h: 34 }, t === "all" ? "All" : TYPES[t].tab, () => setTab(t), { active: view.tab === t, size: portrait ? 12 : 13 });
  });
  // age chips
  const ages = [null, 0, 1, 2, 3];
  const aw = (c.w - 8) / ages.length;
  ages.forEach((a, i) => {
    button("age-" + a, { x: c.x + 4 + i * aw, y: c.y + 42, w: aw - 6, h: 26 }, a == null ? "All ages" : LEVELS[a].short, () => {
      view.age = a;
      view.page = 0;
      sfx.click();
    }, { active: view.age === a, size: 12, fill: "#3b3026", radius: 13 });
  });
  // genre chips for this tab, wrapped onto up to three rows
  const genres = [...new Set(filteredItemsFor(view.tab).flatMap((i) => i.genres))].sort((a, b) => GENRES[a].label.localeCompare(GENRES[b].label));
  const chips = [null, ...genres];
  let size = 12,
    rows;
  for (;;) {
    rows = layoutChips(chips, c.w - 8, size);
    if (rows <= 3 || size <= 10) break;
    size--;
  }
  layoutChips(chips, c.w - 8, size, c.x + 4, c.y + 76);

  // grid of covers
  const items = filteredItems();
  const pages = Math.max(1, Math.ceil(items.length / perPage()));
  view.page = clamp(view.page, 0, pages - 1);
  const shown = items.slice(view.page * perPage(), (view.page + 1) * perPage());
  const gy = c.y + 172,
    cw = c.w / L.cols,
    ch = 104;
  const loved = frontReady() ? front().req.loved : null;
  shown.forEach((item, k) => {
    const cx = c.x + (k % L.cols) * cw,
      cy = gy + Math.floor(k / L.cols) * ch;
    const covW = 60,
      covH = 76;
    const x = cx + (cw - covW) / 2,
      y = cy + 4;
    if (view.selected === item.id) {
      ctx.fillStyle = "rgba(212,166,74,0.35)";
      roundRect(cx + 4, cy, cw - 8, ch - 2, 8);
    }
    drawCover(item, x, y, covW, covH);
    if (item.id === loved) {
      ctx.fillStyle = "#c0392b";
      roundRect(x - 4, y + covH - 16, covW + 8, 14, 4);
      text("❤ their fave", x + covW / 2, y + covH - 6, "bold 9px system-ui, sans-serif", "#fff");
    }
    ctx.font = "bold 11px system-ui, sans-serif";
    text(ellipsize(item.title, cw - 10), cx + cw / 2, cy + covH + 18, ctx.font, PAPER);
    addTarget("item-" + item.id, { x: cx + 4, y: cy, w: cw - 8, h: ch - 2 }, () => {
      view.selected = item.id;
      sfx.click();
    });
  });
  if (!shown.length) text("Nothing matches those filters.", c.x + c.w / 2, gy + 60, "italic 14px Georgia, serif", PAPER);
  // pages
  const py = gy + L.rows * ch + 2;
  button("prev", { x: c.x + 8, y: py, w: 90, h: 24 }, "◀ Prev", () => {
    view.page--;
    sfx.click();
  }, { size: 12, enabled: view.page > 0 });
  text(`Page ${view.page + 1} of ${pages} · ${items.length} items`, c.x + c.w / 2, py + 16, "12px system-ui, sans-serif", PAPER);
  button("next", { x: c.x + c.w - 98, y: py, w: 90, h: 24 }, "Next ▶", () => {
    view.page++;
    sfx.click();
  }, { size: 12, enabled: view.page < pages - 1 });

  if (L.inline) drawDetail({ x: c.x + 6, y: py + 30, w: c.w - 12, h: c.y + c.h - (py + 30) - 6 });
  else if (view.selected != null) drawDetail({ x: c.x + 4, y: c.y + 40, w: c.w - 8, h: c.h - 44 }, true);
}

// Lays out (and, when x is given, draws) the genre chips. Returns the row count.
function layoutChips(chips, maxW, size, x0, y0) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  let x = 0,
    row = 0;
  for (const g of chips) {
    const label = g == null ? "All kinds" : GENRES[g].label;
    const w = ctx.measureText(label).width + size * 1.6;
    if (x + w > maxW && x > 0) {
      row++;
      x = 0;
    }
    if (x0 != null && row < 3)
      button("genre-" + g, { x: x0 + x, y: y0 + row * 30, w, h: 26 }, label, () => {
        view.genre = g;
        view.page = 0;
        sfx.click();
      }, { active: view.genre === g, size, fill: "#3b3026", radius: 13 });
    x += w + 5;
  }
  return row + 1;
}

function drawDetail(d, sheet = false) {
  ctx.fillStyle = CREAM;
  roundRect(d.x, d.y, d.w, d.h, 10);
  ctx.strokeStyle = MAPLE;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (view.selected == null) {
    wrap("Tap a cover to read about it here, then press Recommend!", d.x + d.w / 2, d.y + d.h / 2 - 8, d.w - 40, 22, "italic 15px Georgia, serif", "#5a4a3a", 3, "center");
    return;
  }
  const item = CATALOG[view.selected];
  const f = front();
  const isLoved = f && f.arrived && f.req.loved === item.id;
  const cw = sheet ? 120 : 84,
    chh = sheet ? 154 : 108;
  drawCover(item, d.x + 12, d.y + 12, cw, chh, true);
  if (sheet) button("close", { x: d.x + d.w - 44, y: d.y + 8, w: 36, h: 32 }, "✕", () => (view.selected = null), { size: 16 });
  const tx = d.x + 12 + cw + 14,
    tw = d.x + d.w - tx - (sheet ? 50 : 12);
  let y = d.y + 28;
  if (isLoved) {
    ctx.fillStyle = "#c0392b";
    roundRect(tx, d.y + 8, 190, 18, 9);
    text("❤ Their favorite! Find one like it.", tx + 95, d.y + 21, "bold 11px system-ui, sans-serif", "#fff");
    y += 14;
  }
  y = wrap(item.title, tx, y, tw, 20, "bold 17px Georgia, serif", INK, 2);
  ctx.font = "italic 12px Georgia, serif";
  text(ellipsize("by " + item.creator, tw), tx, y - 2, ctx.font, "#5a4a3a", "left");
  y += 15;
  // label + value; long values wrap so nothing important gets cut off
  const meta = (label, val, color = INK) => {
    ctx.font = "bold 12px system-ui, sans-serif";
    text(label, tx, y, ctx.font, "#8a6a3a", "left");
    const lw = ctx.measureText(label).width + 6;
    y = wrap(val, tx + lw, y, tw - lw, 15, "12px system-ui, sans-serif", color, 2) + 1;
  };
  meta("Type:", `${TYPES[item.type].label} · ${LEVELS[item.level].label}`);
  meta("Kind:", item.genres.map((g) => GENRES[g].label).join(", "));
  meta("Feels:", item.moods.map((m) => MOODS[m].label).join(", "));
  const notes = [item.flags.R ? "Part of a series" : "Standalone", item.flags.L ? "Long" : "Short"];
  const heads = [];
  if (item.flags.S) heads.push("Sad ending");
  if (item.flags.K) heads.push("Crushes & kissing");
  if (item.flags.B) heads.push("Battles");
  meta("Good to know:", [...notes, ...heads].join(" · "), heads.length ? "#b4521a" : INK);
  const btnH = 40,
    btnY = d.y + d.h - btnH - 10;
  const descTop = Math.max(y + 2, sheet ? d.y + 12 + chh + 20 : y + 2);
  const descX = sheet ? d.x + 14 : tx,
    descW = sheet ? d.w - 28 : tw;
  const maxLines = Math.max(1, Math.floor((btnY - 6 - descTop) / 16) + 1);
  wrap(item.desc, descX, descTop + (sheet ? 0 : 0), descW, 16, sheet ? "15px Georgia, serif" : "13px Georgia, serif", "#3a2a1a", maxLines);
  const can = state === "playing" && frontReady();
  button("recommend", { x: sheet ? d.x + 12 : tx, y: btnY, w: sheet ? d.w - 24 : tw, h: btnH }, can ? "Recommend this ✓" : "Wait for a patron...", recommend, { enabled: can, size: 16, family: "Georgia, serif", fill: "#2f7d4e" });
}

// ---------- Drawing: result card and screens ----------
function drawResult() {
  const r = result;
  const w = Math.min(W - 24, 560);
  const lineH = 22;
  const textW = w - 64;
  const wrapped = r.lines.map((l) => ({ ...l, rows: wrapLines(l.t, textW, "14px Georgia, serif") }));
  const bodyH = wrapped.reduce((s, l) => s + l.rows.length * 18 + 6, 0);
  const h = 150 + bodyH + (r.speedy ? lineH : 0) + 60;
  const x = (W - w) / 2,
    y = Math.max(8, (H - h) / 2);
  ctx.fillStyle = "rgba(20, 14, 10, 0.55)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(30, 22, 16, 0.97)";
  roundRect(x, y, w, h, 14);
  ctx.strokeStyle = r.tier.color;
  ctx.lineWidth = 3;
  ctx.stroke();
  text(r.tier.name, x + w / 2, y + 40, "bold 30px Georgia, serif", r.tier.color === WRONG ? "#ff8f80" : r.tier.color === RIGHT ? "#7ee08f" : r.tier.color === PARTLY ? "#f0c060" : "#8fc0f0");
  text(`+${r.points} points${r.speedy ? `  (+${r.speedy} speedy!)` : ""}`, x + w / 2, y + 64, "bold 15px system-ui, sans-serif", PAPER);
  // what was recommended
  drawCover(r.item, x + 20, y + 78, 40, 50);
  ctx.font = "bold 15px Georgia, serif";
  text(ellipsize(`You recommended “${r.item.title}”`, w - 90), x + 72, y + 100, ctx.font, PAPER, "left");
  text(`${TYPES[r.item.type].label} · ${LEVELS[r.item.level].label}`, x + 72, y + 120, "12px system-ui, sans-serif", "#cdbf9f", "left");
  // the checklist
  let ly = y + 152;
  for (const l of wrapped) {
    const c = l.k === "ok" ? "#4fc26a" : l.k === "part" ? "#e3b04a" : "#ef6a5a";
    circle(x + 30, ly - 5, 9, c);
    text(l.k === "ok" ? "✓" : l.k === "part" ? "~" : "✗", x + 30, ly, "bold 12px system-ui, sans-serif", "#1c140f");
    l.rows.forEach((row, i) => text(row, x + 48, ly + i * 18, "14px Georgia, serif", PAPER, "left"));
    ly += l.rows.length * 18 + 6;
  }
  button("next-patron", { x: x + w / 2 - 110, y: y + h - 52, w: 220, h: 40 }, "Next patron →", nextPatron, { active: true, size: 16, family: "Georgia, serif" });
}

function panel(title, lines, footer) {
  ctx.fillStyle = "rgba(26, 18, 12, 0.5)";
  ctx.fillRect(0, 0, W, H);
  const w = Math.min(W - 24, 460);
  const h = 130 + lines.length * 24 + 40;
  const x = (W - w) / 2,
    y = (H - h) / 2;
  ctx.fillStyle = "rgba(26, 18, 12, 0.95)";
  roundRect(x, y, w, h, 12);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawLogo(W / 2, y + 12, 28);
  text(title, W / 2, y + 82, "bold 30px Georgia, serif", PAPER);
  lines.forEach((l, i) => text(l.t ?? l, W / 2, y + 112 + i * 24, l.font || "16px Georgia, serif", l.color || PAPER));
  text(footer, W / 2, y + h - 18, "bold 15px Georgia, serif", GOLD);
}

function draw() {
  targets = [];
  R(0, 0, W, H, NAVY);
  drawWindow();
  drawSign();
  drawHud();
  drawBubble();
  drawCatalog();

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    R(p.x, p.y, 6, 4, p.color);
  }
  ctx.globalAlpha = 1;
  for (const p of popups) {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.font = "bold 16px Georgia, serif";
    const tw = ctx.measureText(p.text).width;
    ctx.fillStyle = "rgba(20, 14, 10, 0.85)";
    roundRect(p.x - tw / 2 - 10, p.y - 20, tw + 20, 28, 8);
    text(p.text, p.x, p.y, "bold 16px Georgia, serif", p.color);
  }
  ctx.globalAlpha = 1;

  // screens on top take over the clickable areas
  const full = { x: 0, y: 0, w: W, h: H };
  if (state === "result") {
    targets = [];
    drawResult();
  } else if (state === "ready") {
    targets = [];
    panel("Fave Finder", [
      "Patrons come to the window looking for",
      "something new. Recommend ONE great pick!",
      { t: "Inspired by the library's Next Five Faves service", font: "italic 13px Georgia, serif", color: "#cdbf9f" },
    ], "Press Enter or tap to open the window");
    addTarget("start", full, startGame);
  } else if (state === "paused") {
    targets = [];
    panel("Shh… paused", [`Day ${day} · ${SHIFTS[shift]} shift`], "Press P or tap to keep going");
    addTarget("resume", full, togglePause);
  } else if (state === "shiftover") {
    targets = [];
    const pass = shiftPoints >= P.goal;
    panel(pass ? `${SHIFTS[shift]} shift done!` : "So close!", [
      { t: `Points: ${shiftPoints} / ${P.goal}`, font: "bold 18px Georgia, serif", color: pass ? "#7ee08f" : "#f0c060" },
      `Patrons helped: ${stats.helped} · New faves: ${stats.faves}`,
      pass ? (shift < 2 ? `Next up: the ${SHIFTS[shift + 1]} shift.` : "That's the last shift of the day!") : "Let's try that shift again. You've got this!",
    ], pass ? "Press Enter or tap to continue" : "Press Enter or tap to try again");
    addTarget("continue", full, continueAfterShift);
  } else if (state === "dayover") {
    targets = [];
    panel(`Day ${day} complete!`, [
      { t: `Total points: ${total}`, font: "bold 18px Georgia, serif", color: "#7ee08f" },
      `Best ever: ${best.score} points · reached day ${best.day}`,
      "Tomorrow gets busier, with trickier requests!",
    ], "Press Enter or tap to start the next day");
    addTarget("nextday", full, continueAfterDay);
  }

  // keyboard focus ring
  const ft = keyboardUsed && targets.find((t) => t.id === focusId);
  if (ft) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.strokeRect(ft.x - 2, ft.y - 2, ft.w + 4, ft.h + 4);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ft.x - 2, ft.y - 2, ft.w + 4, ft.h + 4);
  }
}

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50) / 1000;
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- Input ----------
function togglePause() {
  if (state === "playing") {
    pausedFrom = "playing";
    state = "paused";
  } else if (state === "paused") state = pausedFrom || "playing";
}

function toCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  keyboardUsed = false;
  const p = toCanvas(e);
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    if (t.enabled && p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h) {
      focusId = t.id;
      return t.fn();
    }
  }
});

// Arrow keys move the focus to the nearest button in that direction.
function moveFocus(dx, dy) {
  const live = targets.filter((t) => t.enabled && t.w < W);
  if (!live.length) return;
  const cur = live.find((t) => t.id === focusId);
  if (!cur) {
    focusId = live[0].id;
    return;
  }
  const cx = cur.x + cur.w / 2,
    cy = cur.y + cur.h / 2;
  let bestT = null,
    bestD = Infinity;
  for (const t of live) {
    if (t === cur) continue;
    const tx = t.x + t.w / 2,
      ty = t.y + t.h / 2;
    const along = (tx - cx) * dx + (ty - cy) * dy;
    if (along <= 4) continue;
    const across = Math.abs((tx - cx) * dy) + Math.abs((ty - cy) * dx);
    const dist = along + across * 2.5;
    if (dist < bestD) {
      bestD = dist;
      bestT = t;
    }
  }
  if (bestT) focusId = bestT.id;
}

document.addEventListener("keydown", (e) => {
  const k = e.code;
  if (k === "KeyM") return toggleMute();
  if (k === "KeyP" || (k === "Escape" && !(view.selected != null && !L.inline))) return togglePause();
  if (k === "Escape") return (view.selected = null);
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Enter", "Space"].includes(k)) e.preventDefault();
  if (state === "ready" || state === "shiftover" || state === "dayover" || state === "paused") {
    if ((k === "Enter" || k === "Space") && !e.repeat) {
      const t = targets.find((t) => t.enabled);
      if (t) t.fn();
    }
    return;
  }
  if (state === "result") {
    if ((k === "Enter" || k === "Space") && !e.repeat) nextPatron();
    return;
  }
  keyboardUsed = true;
  if (k === "ArrowLeft") moveFocus(-1, 0);
  else if (k === "ArrowRight") moveFocus(1, 0);
  else if (k === "ArrowUp") moveFocus(0, -1);
  else if (k === "ArrowDown") moveFocus(0, 1);
  else if (k === "Tab") {
    const live = targets.filter((t) => t.enabled && t.w < W);
    const i = live.findIndex((t) => t.id === focusId);
    focusId = live[(i + (e.shiftKey ? -1 : 1) + live.length) % live.length]?.id ?? null;
  } else if ((k === "Enter" || k === "Space") && !e.repeat) {
    const t = targets.find((t) => t.id === focusId && t.enabled);
    if (t) t.fn();
  } else if (k === "KeyR") recommend();
  else if (k === "KeyL") lookUpLoved();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") togglePause();
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if ((window.innerWidth < 700) !== portrait) {
      layout();
      queue.forEach((p, i) => (p.x = spotX(i)));
    }
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
requestAnimationFrame(frame);

// Test links: test.html?g=<game>&t=<token>. A test link opens one game with no password, until
// it expires. The token holds the moment it expires (to the minute) and a check worked out from
// that and the game, so changing the time or the game in the link breaks it.
//
// To make a link: click "Get Test Link" at the top of index.html and pick how long it lasts.
// Or open index.html, open the browser console (F12) and run
//   makeTestLink("deweydash", "1h")
// The second part is one of the TEST_EXPIRY ids below (leave it out for "until midnight").
// Game names are the ?g= values on index.html.
//
// Note: like pass.js, this runs in the browser, so someone who reads the source could work
// out how to make a longer-lasting link. It stops old links working, not a determined person.

// How long a link can last. ms: from when it's made; "today": until midnight tonight.
const TEST_EXPIRY = [
  { id: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { id: "4h", label: "4 hours", ms: 4 * 60 * 60 * 1000 },
  { id: "today", label: "Until midnight tonight" },
  { id: "24h", label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
];

// When a link made now (or at `from`) with this expiry stops working, in ms.
function testExpiryTime(id, from = Date.now()) {
  const opt = TEST_EXPIRY.find((o) => o.id === id) || TEST_EXPIRY.find((o) => o.id === "today");
  if (opt.ms) return from + opt.ms;
  const midnight = new Date(from);
  midnight.setHours(24, 0, 0, 0); // (the start of tomorrow)
  return midnight.getTime();
}

// The check: an FNV-1a hash of the game and the expiry, as a short base-36 string
function testCheck(game, exp36) {
  const s = "gcls-test|" + game + "|" + exp36;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// A token for this game that expires at `expires` (ms): "<expiry in minutes>-<check>"
function testToken(game, expires) {
  const exp36 = Math.ceil(expires / 60000).toString(36);
  return exp36 + "-" + testCheck(game, exp36);
}

// When this game's token expires (ms), or null if it isn't a real token for this game.
function testTokenExpiry(game, token) {
  if (!game || !token) return null;
  const [exp36, check] = token.split("-");
  if (!exp36 || !check || testCheck(game, exp36) !== check) return null;
  const minutes = parseInt(exp36, 36);
  return Number.isFinite(minutes) ? minutes * 60000 : null;
}

function validTestToken(game, token) {
  const expires = testTokenExpiry(game, token);
  return expires !== null && Date.now() < expires;
}

// A link to send. `expiry`: one of the TEST_EXPIRY ids, or a time (ms) for it to stop working.
function makeTestLink(game, expiry = "today") {
  const expires = typeof expiry === "number" ? expiry : testExpiryTime(expiry);
  const url = new URL("test.html", location.href);
  url.searchParams.set("g", game);
  url.searchParams.set("t", testToken(game, expires));
  return url.href;
}

// "3:45 PM" if it's today, otherwise "Tue, Nov 24, 3:45 PM"
function formatTestExpiry(ms) {
  const d = new Date(ms),
    sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

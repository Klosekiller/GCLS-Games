// One-day test links: test.html?g=<game>&t=<token>
// The token is made from the game and today's date, so a link only works on the
// day it was made (by the clicker's clock, midnight to midnight).
//
// To make a link: click "Get Test Link" at the top of index.html.
// Or open index.html, open the browser console (F12) and run
//   makeTestLink("deweydash")
// It prints the link to send. Game names are the ?g= values on index.html.
//
// Note: like pass.js, this runs in the browser, so someone who reads the source
// could work out tomorrow's token. It stops old links working, not a determined person.

function testDay(date) {
  const d = date || new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function testToken(game, date) {
  // FNV-1a hash of game + day, as a short base-36 string
  const s = "gcls-test|" + game + "|" + testDay(date);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function validTestToken(game, token) {
  return !!game && !!token && token === testToken(game);
}

function makeTestLink(game) {
  const url = new URL("test.html", location.href);
  url.searchParams.set("g", game);
  url.searchParams.set("t", testToken(game));
  return url.href;
}

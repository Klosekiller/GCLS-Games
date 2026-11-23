// The password for playing the games. index.html asks for it before opening a
// game, and game.html sends anyone without it (?pass=) back to index.html.
// Change it here; both pages read it from this file.
//
// Note: this site is plain static files, so the password is visible to anyone
// who views the page source. It keeps casual visitors out, not determined ones.
const GAME_PASS = "library";

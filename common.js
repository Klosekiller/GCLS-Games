// Shared helpers for every game. game.html loads this before the game's own script.
//
// Plain scripts share one global scope, so a game uses these directly, and they
// draw on the game's own `ctx`. A game must not declare any of these names itself.
// Each game calls setupSound() once, where its sound code starts.

// ---------- Storage (guarded: can throw in private mode) ----------
function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

// ---------- Palette (from the library) ----------
const PAPER = "#f3ead7";
const GOLD = "#d4a64a";
const MAPLE = "#d7a35e";
const NAVY = "#34404f";

// ---------- Sound (Web Audio API, no files needed) ----------
let audio = null; // created on first use, which is always after a key press or tap
let muted = false;
const soundSettings = {
  key: "", // muted state is saved as "<key>-muted"
  type: "square", // default wave for tone()
  volume: 0.12, // default volume for tone()
  blip: 0.12, // volume of the blip played when sound is turned back on
  softStart: false, // fade each note in, so it doesn't click (gentler)
  onMute: null, // called with true/false whenever sound is muted or unmuted
  startMuted: false, // true: sound is always off when the game loads, until the player turns it on
};

// Load this game's saved mute setting, set its defaults and hook up its "Sound: on" button.
// Options are any of the soundSettings above, e.g. setupSound("garden", { type: "sine", volume: 0.1 }).
function setupSound(key, options = {}) {
  Object.assign(soundSettings, options, { key });
  muted = soundSettings.startMuted || safeGet(key + "-muted") === "1";
  updateMuteLabel();
  const btn = document.getElementById("mute");
  if (btn) btn.addEventListener("click", toggleMute);
}

function getAudio() {
  if (!audio) {
    // iPhone/iPad: play through the speaker even when the ringer switch is on silent
    // (the player turned sound on, so they want to hear it).
    try {
      if (navigator.audioSession) navigator.audioSession.type = "playback";
    } catch {}
    audio = new (window.AudioContext || window.webkitAudioContext)();
  }
  // "suspended" before the first tap, "interrupted" on iOS after a call or switching apps
  if (audio.state !== "running") audio.resume().catch(() => {});
  return audio;
}

// iOS only lets sound start from a finished tap (touchend / click), not from pointerdown,
// so wake the audio on those too, and play a silent blip, which is what actually unlocks it.
function unlockAudio() {
  if (muted) return;
  try {
    const a = getAudio();
    const src = a.createBufferSource();
    src.buffer = a.createBuffer(1, 1, 22050);
    src.connect(a.destination);
    src.start(0);
  } catch {}
}
for (const ev of ["touchend", "pointerup", "click", "keydown"]) {
  window.addEventListener(ev, unlockAudio);
}

// Play a short tone that slides from one pitch to another and fades out.
function tone(freqStart, freqEnd, duration, type = soundSettings.type, volume = soundSettings.volume, delay = 0) {
  if (muted) return;
  try {
    const a = getAudio();
    const t = a.currentTime + delay;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    let end = t + duration;
    if (soundSettings.softStart) {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      end += 0.02;
    } else {
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
    }
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(end);
  } catch {
    // no audio support: play silently
  }
}

function updateMuteLabel() {
  const btn = document.getElementById("mute");
  if (btn) btn.textContent = muted ? "Sound: off" : "Sound: on";
}
function toggleMute() {
  muted = !muted;
  safeSet(soundSettings.key + "-muted", muted ? "1" : "0");
  updateMuteLabel();
  if (soundSettings.onMute) soundSettings.onMute(muted);
  if (!muted) tone(660, 660, 0.08, "sine", soundSettings.blip); // a little blip so you know it's on
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
  ctx.closePath(); // so an outline stroked after this joins up neatly
  ctx.fill();
}
function text(str, x, y, font, color, align = "center") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
}

// ---------- Library logo ----------
// Drawn on a white badge so the brand colors stay true on any background.
const LOGO = new Image();
LOGO.src = "logo-icon.svg";
const LOGO_RATIO = 122 / 182; // width / height of the icon
function drawLogo(cx, top, h) {
  const w = h * LOGO_RATIO,
    pad = h * 0.18;
  ctx.fillStyle = "#ffffff";
  roundRect(cx - w / 2 - pad, top, w + pad * 2, h + pad * 2, Math.min(8, pad * 1.5));
  if (LOGO.complete && LOGO.naturalWidth) ctx.drawImage(LOGO, cx - w / 2, top + pad, w, h);
}

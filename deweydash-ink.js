// Dewey Dash: Cartoon mode (Settings › Cartoon mode). The whole game drawn in ink and watercolor,
// like style F on the design canvas's "Dewey art styles" page.
//
// How: while it's on, the game's canvas records each path as it's built, and every filled shape
// (fill and fillRect, so R, roundRect, poly, oval and the rest) is drawn as
// - a wash: the colour a touch paler and softer, laid a little off the line (watercolor never
//   quite meets the ink), with a darker rim where the pigment pools at its edge;
// - an ink line around it: the same outline, walked along and nudged by smooth noise so it
//   wobbles like a pen line, running on a little past where it began. The wobble changes a few
//   times a second, so the lines "boil" like hand-drawn animation (held still with Reduce motion).
// Shapes that shouldn't get a line are just washed: see-through ones (shadows, glows, veils),
// tiny details, very dark ones (the line wouldn't show) and anything filling most of the screen.
// Then paper (grain, fibres and faint blotches) goes over the finished frame.
// Dewey himself is drawn by hand (inkDewey), to match the mockup.

const CARTOON = {
  on: false, // drawing this frame in Cartoon mode
  paused: false, // (while drawing something by hand: fills go through untouched)
  boil: 0, // which drawing of the lines this is (0–2)
  cmds: [], // the path being built: name, arguments, name, arguments…
  paper: null, // the paper's patterns (made the first time they're needed)
  blots: null,
  fill: null, // the canvas's own fill and fillRect
  fillRect: null,
};
const INK_BOIL_MS = 150;
const INK_LINE = "rgba(42, 36, 32, 0.88)"; // the ink
const INK_TAU = Math.PI * 2;

// Called by frame() before and after drawing.
function inkBegin(on, now) {
  CARTOON.on = on;
  CARTOON.paused = false;
  CARTOON.cmds.length = 0;
  CARTOON.boil = reduceMotion() ? 0 : Math.floor(now / INK_BOIL_MS) % 3;
}
function inkEnd() {
  if (!CARTOON.on) return;
  CARTOON.on = false;
  if (!CARTOON.paper) inkPaperTextures();
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = CARTOON.blots;
  CARTOON.fillRect.call(ctx, 0, -TOP, W, H + 2 * TOP);
  ctx.fillStyle = CARTOON.paper;
  CARTOON.fillRect.call(ctx, 0, -TOP, W, H + 2 * TOP);
  ctx.restore();
}

// ---------- Hooking the canvas ----------
(function hookInk() {
  const P = CanvasRenderingContext2D.prototype;
  for (const name of ["moveTo", "lineTo", "closePath", "rect", "arc", "ellipse", "arcTo", "quadraticCurveTo", "bezierCurveTo"]) {
    const f = P[name];
    ctx[name] = function () {
      if (CARTOON.on) CARTOON.cmds.push(name, Array.prototype.slice.call(arguments));
      return f.apply(this, arguments);
    };
  }
  const beginPath = P.beginPath;
  ctx.beginPath = function () {
    CARTOON.cmds.length = 0;
    return beginPath.call(this);
  };
  CARTOON.fill = P.fill;
  CARTOON.fillRect = P.fillRect;
  ctx.fill = function (a) {
    if (!CARTOON.on || CARTOON.paused || a instanceof Path2D) return CARTOON.fill.apply(this, arguments);
    inkFill(a === "evenodd" ? "evenodd" : "nonzero");
  };
  ctx.fillRect = function (x, y, w, h) {
    if (!CARTOON.on || CARTOON.paused) return CARTOON.fillRect.call(this, x, y, w, h);
    inkFillRect(x, y, w, h);
  };
})();

// ---------- Noise ----------
function inkHash(n) {
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
// smooth noise along a line, in -0.5…0.5
function inkNoise(x) {
  const i = Math.floor(x),
    f = x - i,
    u = f * f * (3 - 2 * f);
  return inkHash(i) * (1 - u) + inkHash(i + 1) * u - 0.5;
}

// ---------- Colours ----------
const INK_COLORS = new Map();
// The wash for a fill colour (as the canvas reports it: "#rrggbb" or "rgba(r, g, b, a)").
function inkColor(s) {
  let c = INK_COLORS.get(s);
  if (c) return c;
  let r, g, b, a = 1;
  if (s[0] === "#") {
    r = parseInt(s.slice(1, 3), 16);
    g = parseInt(s.slice(3, 5), 16);
    b = parseInt(s.slice(5, 7), 16);
  } else {
    const m = s.match(/[\d.]+/g) || [0, 0, 0];
    [r, g, b] = m.map(Number);
    if (m.length > 3) a = +m[3];
  }
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  // a little less saturated, then a little of the paper through it
  const wash = (v, paper) => Math.round((v * 0.9 + L * 0.1) * 0.88 + paper * 0.12);
  const pr = wash(r, 246),
    pg = wash(g, 239),
    pb = wash(b, 223);
  c = {
    a,
    lum: L / 255,
    paint: a < 1 ? `rgba(${pr}, ${pg}, ${pb}, ${a})` : `rgb(${pr}, ${pg}, ${pb})`,
    rim: `rgba(${(r * 0.68) | 0}, ${(g * 0.68) | 0}, ${(b * 0.64) | 0}, 0.4)`,
  };
  if (INK_COLORS.size > 4000) INK_COLORS.clear();
  INK_COLORS.set(s, c);
  return c;
}

// ---------- Paths ----------
// Layout pixels per unit where we're drawing now (so lines keep their weight when scaled).
function inkScale() {
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) / RES || 1;
}
function inkSweep(a0, a1, ccw) {
  const s = a1 - a0;
  if (Math.abs(s) >= INK_TAU - 1e-6) return ccw ? -INK_TAU : INK_TAU;
  if (!ccw) return ((s % INK_TAU) + INK_TAU) % INK_TAU;
  return -((((-s) % INK_TAU) + INK_TAU) % INK_TAU);
}
// The recorded path as lists of points: [{ pts: [x, y, x, y, …], closed }].
function inkFlatten(c) {
  const subs = [];
  let cur = null,
    cx = 0,
    cy = 0,
    sx = 0,
    sy = 0;
  const start = (x, y) => {
    cur = { pts: [x, y], closed: false };
    subs.push(cur);
    sx = cx = x;
    sy = cy = y;
  };
  const to = (x, y) => {
    if (!cur) return start(x, y);
    cur.pts.push(x, y);
    cx = x;
    cy = y;
  };
  const arcPts = (ox, oy, rx, ry, rot, a0, sweep) => {
    const n = Math.max(4, Math.min(40, Math.ceil((Math.abs(sweep) * Math.max(rx, ry)) / 3))),
      cr = Math.cos(rot),
      sr = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n,
        ex = Math.cos(a) * rx,
        ey = Math.sin(a) * ry;
      to(ox + ex * cr - ey * sr, oy + ex * sr + ey * cr);
    }
  };
  for (let i = 0; i < c.length; i += 2) {
    const a = c[i + 1];
    switch (c[i]) {
      case "moveTo":
        start(a[0], a[1]);
        break;
      case "lineTo":
        to(a[0], a[1]);
        break;
      case "closePath":
        if (cur) {
          cur.closed = true;
          start(sx, sy);
        }
        break;
      case "rect": {
        const [x, y, w, h] = a;
        start(x, y);
        to(x + w, y);
        to(x + w, y + h);
        to(x, y + h);
        cur.closed = true;
        start(x, y);
        break;
      }
      case "arc":
        arcPts(a[0], a[1], a[2], a[2], 0, a[3], inkSweep(a[3], a[4], !!a[5]));
        break;
      case "ellipse":
        arcPts(a[0], a[1], a[2], a[3], a[4], a[5], inkSweep(a[5], a[6], !!a[7]));
        break;
      case "arcTo": {
        const [x1, y1, x2, y2, r] = a;
        if (!cur) {
          start(x1, y1);
          break;
        }
        const ax = cx - x1,
          ay = cy - y1,
          bx = x2 - x1,
          by = y2 - y1,
          la = Math.hypot(ax, ay),
          lb = Math.hypot(bx, by);
        if (!r || la < 1e-6 || lb < 1e-6 || Math.abs(ax * by - ay * bx) < 1e-6) {
          to(x1, y1);
          break;
        }
        const th = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))),
          t = r / Math.tan(th / 2),
          t1x = x1 + (ax / la) * t,
          t1y = y1 + (ay / la) * t,
          t2x = x1 + (bx / lb) * t,
          t2y = y1 + (by / lb) * t,
          ux = ax / la + bx / lb,
          uy = ay / la + by / lb,
          ul = Math.hypot(ux, uy),
          d = r / Math.sin(th / 2),
          ox = x1 + (ux / ul) * d,
          oy = y1 + (uy / ul) * d,
          a0 = Math.atan2(t1y - oy, t1x - ox);
        let sw = Math.atan2(t2y - oy, t2x - ox) - a0;
        while (sw > Math.PI) sw -= INK_TAU;
        while (sw < -Math.PI) sw += INK_TAU;
        to(t1x, t1y);
        arcPts(ox, oy, r, r, 0, a0, sw);
        break;
      }
      case "quadraticCurveTo": {
        const x0 = cx,
          y0 = cy;
        if (!cur) start(x0, y0);
        for (let j = 1; j <= 8; j++) {
          const t = j / 8,
            u = 1 - t;
          to(u * u * x0 + 2 * u * t * a[0] + t * t * a[2], u * u * y0 + 2 * u * t * a[1] + t * t * a[3]);
        }
        break;
      }
      case "bezierCurveTo": {
        const x0 = cx,
          y0 = cy;
        if (!cur) start(x0, y0);
        for (let j = 1; j <= 10; j++) {
          const t = j / 10,
            u = 1 - t;
          to(
            u * u * u * x0 + 3 * u * u * t * a[0] + 3 * u * t * t * a[2] + t * t * t * a[4],
            u * u * u * y0 + 3 * u * u * t * a[1] + 3 * u * t * t * a[3] + t * t * t * a[5],
          );
        }
        break;
      }
    }
  }
  return subs;
}
function inkBounds(subs) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const s of subs)
    for (let i = 0; i < s.pts.length; i += 2) {
      const x = s.pts[i],
        y = s.pts[i + 1];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return x0 === Infinity ? null : { w: x1 - x0, h: y1 - y0 };
}
// The recorded path again, as a Path2D (so we can draw with it without losing the canvas's own).
function inkPath2D(c) {
  const p = new Path2D();
  for (let i = 0; i < c.length; i += 2) p[c[i]].apply(p, c[i + 1]);
  return p;
}

// A wobbly pen line along the points, added to Path2D p. `k`: layout pixels per unit here; `amp`:
// how far it wanders (layout pixels). The wobble follows the distance along the line (not where
// the shape is), so a moving shape keeps its line; `seed` picks the wobble.
function inkWobble(p, pts, closed, k, seed, amp = 0.7) {
  const n = pts.length / 2;
  if (n < 2) return;
  const step = 5 / k,
    a = amp / k,
    f = k / 13;
  let first = true;
  const put = (x, y, s) => {
    const ox = inkNoise(s * f + seed) * 2 * a,
      oy = inkNoise(s * f + seed + 71.3) * 2 * a;
    if (first) p.moveTo(x + ox, y + oy);
    else p.lineTo(x + ox, y + oy);
    first = false;
  };
  let s = 0;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n,
      x0 = pts[2 * i],
      y0 = pts[2 * i + 1],
      x1 = pts[2 * j],
      y1 = pts[2 * j + 1],
      len = Math.hypot(x1 - x0, y1 - y0),
      m = Math.max(1, Math.ceil(len / step));
    for (let q = 0; q < m; q++) put(x0 + ((x1 - x0) * q) / m, y0 + ((y1 - y0) * q) / m, s + (len * q) / m);
    s += len;
  }
  if (closed) {
    // back to the start, and a little past it
    put(pts[0], pts[1], s);
    const len = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) || 1,
      t = Math.min(1, 3.5 / k / len);
    put(pts[0] + (pts[2] - pts[0]) * t, pts[1] + (pts[3] - pts[1]) * t, s + 3.5 / k);
  } else put(pts[2 * n - 2], pts[2 * n - 1], s);
}

// ---------- Washes and lines for the game's own shapes ----------
// What to do with a shape of this colour and size (layout pixels): null = just the wash.
function inkPlan(col, bw, bh) {
  if (bw >= W * 0.9 && bh >= H * 0.5) return null; // the walls and the sky
  if (Math.min(bw, bh) < 3) return null; // tiny details
  if (col && col.lum < 0.12) return null; // nearly black: a line wouldn't show
  return { rim: col && Math.min(bw, bh) >= 6, width: Math.min(bw, bh) < 10 ? 0.85 : 1.1 };
}
function inkFill(rule) {
  const cmds = CARTOON.cmds,
    style = ctx.fillStyle,
    col = typeof style === "string" ? inkColor(style) : null;
  if (col && col.a < 0.75) return CARTOON.fill.call(ctx, rule); // see-through: shadows, glows, veils
  const subs = inkFlatten(cmds),
    bb = inkBounds(subs);
  if (!bb) return CARTOON.fill.call(ctx, rule);
  const k = inkScale(),
    plan = inkPlan(col, bb.w * k, bb.h * k);
  if (col) ctx.fillStyle = col.paint;
  if (!plan) {
    CARTOON.fill.call(ctx, rule);
    ctx.fillStyle = style;
    return;
  }
  const path = inkPath2D(cmds),
    seed = ((Math.round(bb.w * k * 0.25) * 7 + Math.round(bb.h * k * 0.25) * 13 + cmds.length) % 997) + CARTOON.boil * 19.7;
  ctx.save();
  ctx.translate(0.8 / k, 0.55 / k); // the wash, a little off the line
  CARTOON.fill.call(ctx, path, rule);
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  if (plan.rim) {
    ctx.strokeStyle = col.rim;
    ctx.lineWidth = 1.5 / k;
    ctx.stroke(path);
  }
  ctx.restore();
  inkOutline(subs, k, seed, plan.width);
  ctx.fillStyle = style;
}
function inkFillRect(x, y, w, h) {
  if (w < 0) (x += w), (w = -w);
  if (h < 0) (y += h), (h = -h);
  const style = ctx.fillStyle,
    col = typeof style === "string" ? inkColor(style) : null;
  if (col && col.a < 0.75) return CARTOON.fillRect.call(ctx, x, y, w, h);
  const k = inkScale(),
    plan = inkPlan(col, w * k, h * k);
  if (col) ctx.fillStyle = col.paint;
  if (!plan) {
    CARTOON.fillRect.call(ctx, x, y, w, h);
    ctx.fillStyle = style;
    return;
  }
  const seed = ((Math.round(w * k * 0.25) * 7 + Math.round(h * k * 0.25) * 13) % 997) + CARTOON.boil * 19.7;
  ctx.save();
  ctx.translate(0.8 / k, 0.55 / k);
  CARTOON.fillRect.call(ctx, x, y, w, h);
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  if (plan.rim) {
    ctx.strokeStyle = col.rim;
    ctx.lineWidth = 1.5 / k;
    ctx.strokeRect(x, y, w, h); // (strokeRect leaves the canvas's own path alone)
  }
  ctx.restore();
  inkOutline([{ pts: [x, y, x + w, y, x + w, y + h, x, y + h], closed: true }], k, seed, plan.width);
  ctx.fillStyle = style;
}
function inkOutline(subs, k, seed, width) {
  const p = new Path2D();
  for (const s of subs) inkWobble(p, s.pts, s.closed, k, seed);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.strokeStyle = INK_LINE;
  ctx.globalAlpha *= 0.78 + 0.2 * inkHash(seed | 0); // some lines a touch lighter, as from a pen
  ctx.lineWidth = width / k;
  ctx.stroke(p);
  ctx.restore();
}

// ---------- The paper ----------
function inkPaperTextures() {
  // grain and fibres
  const g = document.createElement("canvas");
  g.width = g.height = 256;
  const x = g.getContext("2d");
  x.fillStyle = "#fbf6ea";
  x.fillRect(0, 0, 256, 256);
  const img = x.getImageData(0, 0, 256, 256),
    d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() - 0.5) * 16;
    d[i] += v;
    d[i + 1] += v;
    d[i + 2] += v;
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = "rgba(140, 110, 70, 0.1)";
  x.lineWidth = 0.6;
  for (let i = 0; i < 80; i++) {
    const px = Math.random() * 256,
      py = Math.random() * 256,
      a = Math.random() * Math.PI,
      l = 6 + Math.random() * 10;
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + 2, py + Math.sin(a) * l * 0.5 - 2, px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  // faint blotches, as where a wash dried unevenly (drawn wrapped, so the pattern tiles)
  const b = document.createElement("canvas");
  b.width = b.height = 512;
  const y = b.getContext("2d");
  y.fillStyle = "#fff";
  y.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 46; i++) {
    const cx = Math.random() * 512,
      cy = Math.random() * 512,
      r = 30 + Math.random() * 90,
      tint = `${(205 + Math.random() * 30) | 0}, ${(190 + Math.random() * 30) | 0}, ${(160 + Math.random() * 30) | 0}`;
    for (const ox of [-512, 0, 512])
      for (const oy of [-512, 0, 512]) {
        if (cx + ox + r < 0 || cx + ox - r > 512 || cy + oy + r < 0 || cy + oy - r > 512) continue;
        const gr = y.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
        gr.addColorStop(0, `rgba(${tint}, 0.16)`);
        gr.addColorStop(0.7, `rgba(${tint}, 0.08)`);
        gr.addColorStop(1, `rgba(${tint}, 0)`);
        y.fillStyle = gr;
        y.fillRect(cx + ox - r, cy + oy - r, 2 * r, 2 * r);
      }
  }
  CARTOON.paper = ctx.createPattern(g, "repeat");
  CARTOON.blots = ctx.createPattern(b, "repeat");
}

// ---------- Dewey, by hand ----------
// Called by drawCharacter for Dewey in Cartoon mode, with the same box and look. Like the mockup:
// ink legs with little feet, a cover washed in teal a little off its wobbly outline, cream pages
// with ticks along their edge, a gold band between two ink lines, gold-washed round glasses
// (pushed up onto his head while jumping), dot eyes, rosy cheeks and a small smile.
function inkDewey(px, py, pw, ph, o) {
  const { duck = false, step = 0, wear = 0, bob = 0, lift = [0, 0], flutter = 0, legs = null, accessory = 0, flail = null } = o;
  CARTOON.paused = true;
  const k = inkScale(),
    seed = CARTOON.boil * 19.7,
    lw = Math.max(1 / k, 0.85), // the ink's weight: about a layout pixel, a touch heavier on a big Dewey
    fl = flutter,
    x1 = px + pw - 4, // the cover's right edge
    y1 = py + ph,
    ex = px + pw - 22, // the left eye (the right is 10 over)
    ey = py + 15,
    gy = ey - 19 * Math.max(0, accessory), // the glasses, slid up while jumping
    by = py + ph - 12; // the gold band's top
  const circle = (cx, cy, r, n = 16) => {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(cx + Math.cos((i / n) * INK_TAU) * r, cy + Math.sin((i / n) * INK_TAU) * r);
    return pts;
  };
  const shape = (pts) => {
    const p = new Path2D();
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    p.closePath();
    return p;
  };
  const pagesPts = [px + 4 + fl, py + 3, px + pw + 2 + fl, py + 3.5, px + pw + 1.6 + fl, py + ph - 3, px + 4 + fl, py + ph - 3.2],
    coverPts = [px + 0.3, py + 0.6, x1, py, x1 + 0.6, y1, px - 0.4, y1 + 0.4];

  // the legs' lines: [hip, knee, foot, toe] for each
  const legLines = [];
  if (duck) {
    for (const lx of [px + 8 + step, px + pw - 16 - step]) legLines.push([lx, y1 - 1, lx + 1, y1 + 1.5, lx + 6, y1 + 1.5]);
  } else if (flail) {
    flail.forEach((a, i) => {
      const hx = px + (i ? pw - 11.5 : 10.5),
        hy = py + ph - 2,
        dx = -Math.sin(a),
        dy = Math.cos(a),
        fx = hx + dx * 11,
        fy = hy + dy * 11;
      legLines.push([hx, hy, hx + dx * 6 - dy * 1.2, hy + dy * 6 + dx * 1.2, fx, fy, fx + dy * 4, fy - dx * 4]);
    });
  } else {
    const [l1, l2] = legs || [8 + step, pw - 14 - step];
    [l1, l2].forEach((l, i) => {
      const lx = px + l + 2.5,
        hy = y1 - 1,
        fy = y1 + 6 + bob - lift[i],
        up = lift[i] > 1.5;
      legLines.push([lx, hy, lx - 1.4, hy + (fy - hy) * 0.55, lx, fy, lx + (up ? 3.6 : 4.4), fy - (up ? 1.4 : 0.2)]);
    });
  }

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.lineJoin = ctx.lineCap = "round";

  // --- the washes, a little off the lines
  ctx.save();
  ctx.translate(0.9 / k, 0.7 / k);
  ctx.fillStyle = "#fff8e8";
  ctx.fill(shape(pagesPts));
  const cover = shape(coverPts);
  ctx.fillStyle = "rgba(61, 125, 130, 0.9)";
  ctx.fill(cover);
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)"; // where the wash went on thinner
  ctx.beginPath();
  ctx.ellipse(px + pw * 0.48, py + ph * 0.34, pw * 0.26, ph * 0.22, -0.3, 0, INK_TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(35, 69, 72, 0.55)"; // the spine
  ctx.fill(shape([px + 0.3, py + 0.6, px + 7, py + 0.4, px + 7.3, y1 + 0.2, px - 0.4, y1 + 0.4]));
  ctx.strokeStyle = "rgba(28, 66, 70, 0.38)"; // the pigment pooling at the edge
  ctx.lineWidth = 1.4 / k;
  ctx.stroke(cover);
  ctx.fillStyle = "rgba(217, 169, 72, 0.88)"; // the band
  ctx.fillRect(px + 10, by - 0.3, pw - 18, 3.6);
  ctx.strokeStyle = "rgba(217, 169, 72, 0.82)"; // the glasses
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ex, gy, 5, 0, INK_TAU);
  ctx.moveTo(ex + 15, gy);
  ctx.arc(ex + 10, gy, 5, 0, INK_TAU);
  ctx.stroke();
  ctx.fillStyle = "rgba(231, 154, 138, 0.6)"; // rosy cheeks
  ctx.beginPath();
  ctx.ellipse(ex - 3.8, ey + 6.5, 2.4, 1.5, 0, 0, INK_TAU);
  ctx.ellipse(ex + 13.8, ey + 6.5, 2.4, 1.5, 0, 0, INK_TAU);
  ctx.fill();
  if (wear >= 1) {
    // the dog-eared corner, folded over
    const f = Math.min(9, ph * 0.25);
    ctx.fillStyle = "#fff8e8";
    ctx.fill(shape([x1 - f, py, x1, py, x1, py + f]));
    ctx.fillStyle = "rgba(29, 61, 64, 0.85)";
    ctx.fill(shape([x1 - f, py, x1 - f, py + f, x1, py + f]));
  }
  if (wear >= 2) {
    // a sticking plaster, low by the spine
    ctx.save();
    ctx.translate(px + 12, py + ph - 9);
    ctx.rotate(-0.4);
    ctx.fillStyle = "rgba(233, 195, 155, 0.92)";
    ctx.fillRect(-8, -3.5, 16, 7);
    ctx.fillStyle = "rgba(211, 166, 124, 0.9)";
    ctx.fillRect(-2.5, -3.5, 5, 7);
    ctx.restore();
  }
  ctx.restore();

  // --- the ink
  ctx.strokeStyle = INK_LINE;
  const ink = (width, add) => {
    const p = new Path2D();
    add(p);
    ctx.lineWidth = width;
    ctx.stroke(p);
  };
  ink(lw, (p) => {
    inkWobble(p, [x1, py + 3.2, px + pw + 2 + fl, py + 3.5, px + pw + 1.6 + fl, py + ph - 3, x1 + 0.4, py + ph - 3], false, k, seed + 3);
    inkWobble(p, coverPts, true, k, seed + 11);
    inkWobble(p, [px + 7, py + 0.6, px + 7.3, y1 + 0.2], false, k, seed + 23, 0.5);
    inkWobble(p, [px + 10, by - 0.3, px + pw - 8, by - 0.6], false, k, seed + 31, 0.4);
    inkWobble(p, [px + 10, by + 3.3, px + pw - 8, by + 3], false, k, seed + 37, 0.4);
    inkWobble(p, circle(ex, gy, 5.2), true, k, seed + 41, 0.35);
    inkWobble(p, circle(ex + 10, gy, 5.2), true, k, seed + 47, 0.35);
    // the bridge
    p.moveTo(ex + 4.9, gy - 0.2);
    p.quadraticCurveTo(ex + 5, gy - 1.6, ex + 5.1, gy - 0.2);
    // the smile
    p.moveTo(ex + 2.6, ey + 6.4);
    p.quadraticCurveTo(ex + 5, ey + 8.8, ex + 7.4, ey + 6.4);
    if (wear >= 1) {
      const f = Math.min(9, ph * 0.25);
      inkWobble(p, [x1 - f, py, x1 - f, py + f, x1, py + f], false, k, seed + 53, 0.3);
    }
    if (wear >= 2) {
      // the plaster's outline, and a crack across the left lens
      const c = Math.cos(-0.4),
        s = Math.sin(-0.4),
        at = (u, v) => [px + 12 + u * c - v * s, py + ph - 9 + u * s + v * c];
      inkWobble(p, [...at(-8, -3.5), ...at(8, -3.5), ...at(8, 3.5), ...at(-8, 3.5)], true, k, seed + 59, 0.3);
      p.moveTo(ex - 3.5, gy - 3.5);
      p.lineTo(ex - 0.5, gy - 0.5);
      p.lineTo(ex - 2.5, gy + 1.5);
      p.lineTo(ex + 1.5, gy + 4);
    }
  });
  // the page edges' ticks: finer
  ink(lw * 0.6, (p) => {
    for (let ly = py + 7; ly < py + ph - 5; ly += 4) {
      p.moveTo(x1 + 1.2 + fl * 0.5, ly);
      p.lineTo(px + pw + 0.6 + fl, ly + 0.2);
    }
  });
  // the legs: bolder
  ink(lw * 1.7, (p) => legLines.forEach((l, i) => inkWobble(p, l, false, k, seed + 61 + i * 7, 0.25)));
  // the eyes
  ctx.fillStyle = "#2a2420";
  ctx.beginPath();
  ctx.ellipse(ex + 0.5, ey + 1, 1.15, 1.7, 0, 0, INK_TAU);
  ctx.ellipse(ex + 10.5, ey + 1, 1.15, 1.7, 0, 0, INK_TAU);
  ctx.fill();
  ctx.restore();
  CARTOON.paused = false;
}

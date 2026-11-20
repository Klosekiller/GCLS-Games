// When a game is opened inside the Library Games player (index.html adds embed=1 to the address),
// shrink the instructions and scale the game to fill the player. Opened on its own,
// a game page is left exactly as is.
(function () {
  if (!new URLSearchParams(location.search).has("embed")) return;
  document.documentElement.classList.add("embed");

  const style = document.createElement("style");
  style.textContent = `
    html.embed body { min-height: 100vh; min-height: 100dvh; padding: 8px; gap: 8px; }
    html.embed .hint { padding: 6px 12px; line-height: 1.4; }
    html.embed .hint, html.embed .hint p { font-size: 12px; }
    html.embed canvas { max-width: none !important; }
  `;
  document.head.appendChild(style);

  // Make the canvas as big as possible while the instructions (and any touch
  // buttons) still fit underneath. Never scale up more than 2×.
  function fit() {
    const canvas = document.querySelector("canvas");
    if (!canvas || !document.body) return;
    const cs = getComputedStyle(document.body);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const gap = parseFloat(cs.rowGap) || 0;
    const others = [...document.body.children].filter(
      (el) => el !== canvas && el.tagName !== "SCRIPT" && getComputedStyle(el).display !== "none"
    );
    const otherH = others.reduce((sum, el) => sum + el.getBoundingClientRect().height + gap, 0);
    const availW = document.documentElement.clientWidth - padX;
    const availH = window.innerHeight - padY - otherH;
    const scale = Math.max(0.2, Math.min(availW / canvas.width, availH / canvas.height, 2));
    canvas.style.width = Math.floor(canvas.width * scale) + "px";
  }

  let queued = false;
  function queueFit() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fit();
    });
  }

  window.addEventListener("resize", queueFit);
  window.addEventListener("load", queueFit);
  document.addEventListener("DOMContentLoaded", () => {
    queueFit();
    // Some games change their canvas size (e.g. Globe Trotter's phone layout).
    const canvas = document.querySelector("canvas");
    if (canvas) new MutationObserver(queueFit).observe(canvas, { attributes: true, attributeFilter: ["width", "height"] });
    if (document.fonts) document.fonts.ready.then(queueFit);
  });
})();

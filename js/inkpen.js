/* ============================================================
   Presenter pen — draw on top of the page; the ink fades on its own.

   For explaining an answer to someone watching: turn the pen on from the
   highlighter palette and scribble over the code or text. The ink dissolves from
   the tail forward a few seconds behind the nib, so nothing accumulates on the
   page and a long stroke never vanishes in one blink. Nothing is saved and
   nothing is synced — this is a gesture, not an annotation. (Highlights, the
   other pen in that palette, are the permanent one.)

   Desktop only. A finger on a phone can't hover-and-draw over a scrolling page
   without hijacking the scroll, so the palette entry isn't offered there at all
   — see supported().

   The overlay sits at z-index 35: above the content (so it catches the drag and
   suppresses text selection while on), below the sticky header (z-index 40) and
   the palette (70), so the button you turn it OFF with stays clickable. A press
   that doesn't travel is replayed onto the element underneath (see clickThrough),
   so the page stays usable with the pen in hand.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};

  const INK = "#ef2b2b";        // the one pen color, deliberately theme-independent
  const WIDTH = 3.5;
  /* Per POINT, not per stroke: every point holds full color for HOLD_MS from the
     moment it was drawn, then fades over FADE_MS. So the ink decays from the tail
     forward — the old end is already dissolving while you're still drawing the new
     one, and a long stroke never blinks out all at once. */
  const HOLD_MS = 300;
  const FADE_MS = 600;
  const ALPHA_STEP = 0.02;      // quantize alpha so a stroke draws as runs, not N segments
  const MAX_STEP = 8;           // px — see resampling in onMove()
  const Z_LAYER = 35;

  /* Hover+fine pointer, not just width: a 1000px touch screen is still a finger. */
  const mq = window.matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)");

  let canvas = null, ctx = null, on = false;
  let strokes = [], current = null, raf = 0;
  const changeCbs = [];

  function supported() { return mq.matches; }
  function isOn() { return on; }
  function emit() { changeCbs.forEach(function (cb) { try { cb(on); } catch (e) { /* isolate */ } }); }

  /* ---------- canvas ---------- */
  function ensureCanvas() {
    if (canvas) return canvas;
    canvas = document.createElement("canvas");
    canvas.className = "ink-layer";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.zIndex = String(Z_LAYER);
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    sizeCanvas();
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return canvas;
  }

  /* Backing store in device pixels, drawing in CSS pixels — otherwise the ink is
     a blurry smear on a HiDPI screen, which is the one screen it gets projected from. */
  function sizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  /* ---------- drawing ---------- */
  function onDown(e) {
    if (!on || e.button !== 0) return;
    e.preventDefault();
    current = { pts: [pt(e)] };
    strokes.push(current);
    try { canvas.setPointerCapture(e.pointerId); } catch (ex) { /* not fatal */ }
    start();
  }
  /* Resample long moves into MAX_STEP-ish hops, interpolating the timestamp along
     the way. Alpha is per point and constant across the segment between two of
     them, so a fast drag — which can jump 60px between pointermoves — would fade
     in visible chunks that read as a block sliding down the line. Splitting the
     jump gives the ramp somewhere to actually be gradual, and lerping t is honest:
     the pointer really did cross that span during that interval. */
  function onMove(e) {
    if (!current) return;
    const pts = current.pts;
    const last = pts[pts.length - 1];
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    // Sub-pixel moves add nodes without adding shape; they just cost redraw time.
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const now = performance.now();
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_STEP) {
      const lx = last.x, ly = last.y, lt = last.t;
      const n = Math.min(Math.ceil(dist / MAX_STEP), 120);
      for (let i = 1; i < n; i++) {
        const f = i / n;
        pts.push({ x: lx + dx * f, y: ly + dy * f, t: lt + (now - lt) * f });
      }
    }
    pts.push({ x: e.clientX, y: e.clientY, t: now });
  }
  /* A drag draws; a click should still be a click. The overlay sits over the whole
     page, so without this every button, card toggle and link underneath goes dead
     the moment the pen is picked up — you'd have to put it down to touch anything.
     A press that never travels past CLICK_SLOP isn't ink, so drop the stroke and
     replay the click on whatever is actually under the cursor. */
  const CLICK_SLOP = 4;
  function onUp(e) {
    if (!current) return;
    const pts = current.pts;
    const a = pts[0], b = pts[pts.length - 1];
    const moved = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
    if (moved < CLICK_SLOP) {
      const i = strokes.indexOf(current);
      if (i !== -1) strokes.splice(i, 1);
      current = null;
      clickThrough(e);
      return;
    }
    current = null;
  }

  function clickThrough(e) {
    if (!e || e.clientX == null) return;          // pointercancel carries no useful point
    canvas.style.pointerEvents = "none";          // hide the overlay from the hit test
    const target = document.elementFromPoint(e.clientX, e.clientY);
    canvas.style.pointerEvents = "";
    if (!target) return;
    // Focus first: a real click would have moved it, and inputs/buttons rely on that.
    if (typeof target.focus === "function") { try { target.focus({ preventScroll: true }); } catch (ex) { /* not focusable */ } }
    ["mousedown", "mouseup", "click"].forEach(function (type) {
      target.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: e.clientX, clientY: e.clientY
      }));
    });
  }
  function pt(e) { return { x: e.clientX, y: e.clientY, t: performance.now() }; }

  /* Smoothstep rather than a linear ramp: a linear fade leaves a hard shoulder
     where the still-solid ink meets the fading ink, and that shoulder is what
     reads as an edge travelling along the stroke. Easing both ends of the ramp
     dissolves it instead. */
  function pointAlpha(p, now) {
    const age = now - p.t - HOLD_MS;
    if (age <= 0) return 1;
    const t = 1 - age / FADE_MS;
    if (t <= 0) return 0;
    return t * t * (3 - 2 * t);
  }
  function quantize(a) { return Math.round(a / ALPHA_STEP) * ALPHA_STEP; }

  /* Draw the stroke as runs of equal (quantized) alpha rather than segment by
     segment: each run is a single path, so its interior joins blend once. Stroking
     every segment on its own would double-composite the round cap they share and
     bead the line with darker dots as it fades. */
  function drawStroke(pts, now) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = WIDTH;
    const alphas = pts.map(function (p) { return quantize(pointAlpha(p, now)); });
    let i = 0;
    while (i < pts.length - 1) {
      const a = Math.min(alphas[i], alphas[i + 1]);
      let j = i + 1;
      while (j < pts.length - 1 && Math.min(alphas[j], alphas[j + 1]) === a) j++;
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        if (j - i === 1) {
          ctx.lineTo(pts[j].x, pts[j].y);
        } else {
          /* Quadratic through the midpoints: the raw pointer path is a polyline
             and reads as visibly faceted at this line width. */
          for (let k = i + 1; k < j; k++) {
            ctx.quadraticCurveTo(pts[k].x, pts[k].y, (pts[k].x + pts[k + 1].x) / 2, (pts[k].y + pts[k + 1].y) / 2);
          }
          ctx.lineTo(pts[j].x, pts[j].y);
        }
        ctx.stroke();
      }
      i = j;
    }
  }

  function frame() {
    raf = 0;
    if (!ctx) return;
    const now = performance.now();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const alive = [];
    strokes.forEach(function (s) {
      // Points expire oldest-first, so the tail is always at the front.
      while (s.pts.length && pointAlpha(s.pts[0], now) <= 0) s.pts.shift();
      if (s.pts.length > 1) drawStroke(s.pts, now);
      if (s.pts.length || s === current) alive.push(s);
    });
    strokes = alive;
    ctx.globalAlpha = 1;
    // Idle when there's nothing left to animate; a pointerdown restarts the loop.
    if (strokes.length) start();
  }
  function start() { if (!raf) raf = requestAnimationFrame(frame); }

  function clear() {
    strokes = [];
    current = null;
    if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  /* ---------- on / off ---------- */
  function setOn(next) {
    next = !!next && supported();
    if (next === on) return;
    on = next;
    if (on) {
      ensureCanvas();
      canvas.hidden = false;
      document.body.classList.add("ink-on");
    } else {
      clear();
      if (canvas) canvas.hidden = true;
      document.body.classList.remove("ink-on");
    }
    emit();
  }

  window.addEventListener("resize", function () {
    if (!canvas) return;
    // Resizing rescales the backing store, which wipes it — the old strokes point
    // at content that has since reflowed anyway.
    sizeCanvas();
    clear();
  });

  /* Ink is in viewport coordinates; once the page scrolls it points at whatever
     moved under it. Drop it rather than let it lie. */
  window.addEventListener("scroll", function () { if (on && strokes.length) clear(); }, true);

  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && on) setOn(false); });

  /* A phone that rotates to landscape, or a laptop unplugged from a projector,
     can cross the desktop threshold while the pen is on. */
  const onMq = function () { if (!supported()) setOn(false); };
  if (mq.addEventListener) mq.addEventListener("change", onMq);
  else if (mq.addListener) mq.addListener(onMq);

  IQB.inkPen = {
    supported: supported,
    isOn: isOn,
    on: function () { setOn(true); },
    off: function () { setOn(false); },
    toggle: function () { setOn(!on); },
    onChange: function (cb) { if (typeof cb === "function") changeCbs.push(cb); }
  };
})();

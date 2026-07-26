/* ============================================================
   Text Highlighting — "highlighter pen" over a question's answer / deep-dive.

   UX: pick a color once from the header highlighter button to turn the pen ON;
   then selecting any answer text highlights it instantly in that color (mark
   many with one drag each — no per-selection prompt). Clicking an existing
   highlight opens a small floating toolbar to recolor or delete just that one.

   This is the SECOND consumer of the generic per-question user-state layer
   (IQB.cloud, js/sync.js) — proof the architecture set up for Personal Notes
   extends with no refactor. One document per question at
     users/{uid}/highlights/{questionId}  →  { ranges: [...], updatedAt }
   where each range is { region, start, end, color }:
     • region — which highlightable root ("question" | "answer" | "deep" | "revise")
                 the span lives in, so offsets stay unambiguous across roots.
     • start/end — character offsets into that root's textContent.
     • color — a semantic key ("yellow"|"green"|"blue"|"pink") mapped to a
                 theme-aware shade in CSS, not a raw hex.

   Mirrored to localStorage (IQB.storage) so it works signed-out/offline and is
   merged last-write-wins on sign-in — identical lifecycle to js/notes.js. The
   pen preference itself (on/off + color) is device-local, not synced.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el, qs, toast } = IQB.utils;
  const store = IQB.storage;

  const FEATURE = "highlights";
  const COLORS = ["yellow", "green", "blue", "pink"];
  const STYLES = ["highlight", "underline"];

  /* shared by the palette entry and the header button, which wears it while the
     presentation pen (js/inkpen.js) is the active mode */
  const INK_PEN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>';

  const cloud = function () { return window.IQB.cloud || null; };
  const signedIn = function () { const c = cloud(); return !!(c && c.isSignedIn()); };

  /* live controllers by questionId (one per rendered card) */
  const controllers = new Map();

  /* undo stack for highlights */
  const undoStack = [];

  function pushUndo(questionId, previousRanges) {
    undoStack.push({
      questionId: questionId,
      ranges: previousRanges.map(function (rg) { return Object.assign({}, rg); })
    });
    if (undoStack.length > 50) undoStack.shift();
  }

  function undo() {
    if (undoStack.length === 0) {
      toast("Nothing to undo");
      return;
    }
    const action = undoStack.pop();
    const ctrl = controllers.get(action.questionId);
    if (ctrl) {
      ctrl.setRanges(action.ranges);
    } else {
      const hl = { ranges: action.ranges, updatedAt: Date.now() };
      if (action.ranges.length) store.setHL(action.questionId, hl); else store.deleteHL(action.questionId);
      if (signedIn()) {
        if (action.ranges.length) cloud().save(FEATURE, action.questionId, hl).catch(function () {});
        else cloud().remove(FEATURE, action.questionId).catch(function () {});
      }
    }
    toast("Highlight undone");
  }

  document.addEventListener("keydown", function (e) {
    if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
        return;
      }
      e.preventDefault();
      undo();
    }
  });

  /* global highlighter-pen state (device-local) */
  const pen = store.getHLPen() || { on: false, color: "yellow", style: "highlight" };
  if (COLORS.indexOf(pen.color) === -1) pen.color = "yellow";
  if (STYLES.indexOf(pen.style) === -1) pen.style = "highlight";

  /* ---- persistence (cloud-first when signed in, always mirror locally) ---- */
  async function fetchHL(questionId) {
    if (signedIn()) {
      try {
        const remote = await cloud().load(FEATURE, questionId);
        if (remote && Array.isArray(remote.ranges)) {
          store.setHL(questionId, remote);
          return { ranges: remote.ranges, updatedAt: remote.updatedAt || 0 };
        }
      } catch (e) { /* offline → local mirror */ }
    }
    return store.getHL(questionId);
  }

  async function saveHL(questionId, ranges) {
    const hl = { ranges: ranges, updatedAt: Date.now() };
    if (ranges.length) store.setHL(questionId, hl); else store.deleteHL(questionId);
    if (signedIn()) {
      try {
        if (ranges.length) await cloud().save(FEATURE, questionId, hl);
        else await cloud().remove(FEATURE, questionId);
      } catch (e) { console.warn("[highlights] cloud sync failed (kept locally):", e); }
    }
    return hl;
  }

  async function mergeOnSignIn() {
    if (!signedIn()) return;
    let remote = {};
    try { remote = await cloud().loadAll(FEATURE); }
    catch (e) { return; }
    const local = store.getHighlights();
    const ids = new Set(Object.keys(local).concat(Object.keys(remote)));
    for (const id of ids) {
      const l = store.getHL(id);
      const r = remote[id] && Array.isArray(remote[id].ranges)
        ? { ranges: remote[id].ranges, updatedAt: remote[id].updatedAt || 0 } : null;
      if (l && (!r || l.updatedAt > r.updatedAt)) {
        try { await cloud().save(FEATURE, id, l); } catch (e) { /* keep local */ }
      } else if (r && (!l || r.updatedAt > l.updatedAt)) {
        store.setHL(id, r);
      }
    }
    controllers.forEach(function (c) { c.reload(); });
  }

  if (window.IQB.cloud) {
    IQB.cloud.onChange(function (user) {
      if (user) mergeOnSignIn();
      else controllers.forEach(function (c) { c.reload(); });
    });
  }

  /* ========================================================
     Offset helpers — map a DOM selection to root-relative offsets and back
     ======================================================== */
  function offsetWithin(root, node, nodeOffset) {
    const r = document.createRange();
    r.selectNodeContents(root);
    try { r.setEnd(node, nodeOffset); } catch (e) { return null; }
    return r.toString().length;
  }

  // Intersect a selection with a root and return {start,end} offsets clamped to
  // that root. Lets a selection that spills outside the root (e.g. dragging over
  // the "1." question number, or past the end of the answer) still highlight the
  // portion that IS inside — instead of rejecting the whole selection.
  function clampSelectionToRoot(root, domRange) {
    const rootRange = document.createRange();
    rootRange.selectNodeContents(root);
    // no overlap at all?
    if (domRange.compareBoundaryPoints(Range.START_TO_END, rootRange) <= 0) return null; // sel ends before root
    if (domRange.compareBoundaryPoints(Range.END_TO_START, rootRange) >= 0) return null; // sel starts after root

    const start = (domRange.compareBoundaryPoints(Range.START_TO_START, rootRange) <= 0)
      ? 0
      : offsetWithin(root, domRange.startContainer, domRange.startOffset);
    const end = (domRange.compareBoundaryPoints(Range.END_TO_END, rootRange) >= 0)
      ? root.textContent.length
      : offsetWithin(root, domRange.endContainer, domRange.endOffset);
    if (start == null || end == null || end <= start) return null;
    return { start: start, end: end };
  }

  function clearMarks(root) {
    root.querySelectorAll("mark.hl").forEach(function (m) {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
    });
    root.normalize();
  }

  function markRange(root, start, end, id, style, color) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let pos = 0, node;
    const slices = [];
    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length;
      const nodeEnd = pos + len;
      if (nodeEnd > start && pos < end) {
        slices.push({ node: node, s: Math.max(start - pos, 0), e: Math.min(end - pos, len) });
      }
      pos = nodeEnd;
      if (pos >= end) break;
    }
    slices.forEach(function (sl) {
      if (sl.e <= sl.s) return;
      const range = document.createRange();
      range.setStart(sl.node, sl.s);
      range.setEnd(sl.node, sl.e);
      const mark = document.createElement("mark");
      mark.className = "hl hl-" + (color || "yellow");
      if (style === "underline") mark.classList.add("hl-underline");
      else mark.classList.add("hl-highlight");
      mark.dataset.hlId = String(id);
      try { range.surroundContents(mark); } catch (e) { /* skip un-wrappable slice */ }
    });
  }

  /* ========================================================
     Per-card controller
     ======================================================== */
  function makeController(questionId, card) {
    const roots = {};
    const qtext = card.querySelector(".qa-qtext");
    if (qtext) { qtext.dataset.hlRegion = "question"; roots.question = qtext; }
    const revise = card.querySelector(".qa-revise");
    if (revise) { revise.dataset.hlRegion = "revise"; roots.revise = revise; }
    const answer = card.querySelector(".answer");
    if (answer) { answer.dataset.hlRegion = "answer"; roots.answer = answer; }
    const deep = card.querySelector(".qa-deep");
    if (deep) { deep.dataset.hlRegion = "deep"; roots.deep = deep; }

    let loaded = false;
    // Seed from the local mirror so the always-visible question paints its
    // highlights immediately (collapsed cards never open the answer). The full
    // cloud-authoritative load still runs on card open (ensureLoaded).
    const seed = store.getHL(questionId);
    let ranges = seed && seed.ranges ? seed.ranges.slice() : [];

    function paintRegion(region) {
      const root = roots[region];
      if (!root) return;
      clearMarks(root);
      ranges.forEach(function (rg, i) {
        if (rg.region === region) markRange(root, rg.start, rg.end, i, rg.style || "highlight", rg.color || "yellow");
      });
    }
    function paintAll() { Object.keys(roots).forEach(paintRegion); }

    async function ensureLoaded() {
      if (loaded) { paintAll(); return; }
      loaded = true;
      const hl = await fetchHL(questionId);
      ranges = (hl && hl.ranges) ? hl.ranges.slice() : [];
      paintAll();
    }
    async function reload() {
      const hl = await fetchHL(questionId);
      ranges = (hl && hl.ranges) ? hl.ranges.slice() : [];
      paintAll();
    }

    // add a highlight, merging overlapping spans in the same region (new color wins)
    function addRange(region, start, end, color, style) {
      pushUndo(questionId, ranges);
      let ns = start, ne = end;
      const kept = [];
      ranges.forEach(function (rg) {
        if (rg.region === region && rg.start < ne && rg.end > ns) {
          ns = Math.min(ns, rg.start); ne = Math.max(ne, rg.end);
        } else { kept.push(rg); }
      });
      kept.push({ region: region, start: ns, end: ne, color: color, style: style || "highlight" });
      ranges = kept;
      paintRegion(region);
      saveHL(questionId, ranges);
    }
    function recolorAt(index, color) {
      if (index < 0 || index >= ranges.length) return;
      pushUndo(questionId, ranges);
      ranges[index].color = color;
      // if this range was an underline, convert it to a filled highlighter
      if (ranges[index].style === "underline") ranges[index].style = "highlight";
      paintRegion(ranges[index].region);
      saveHL(questionId, ranges);
    }
    function setStyleAt(index, style) {
      if (index < 0 || index >= ranges.length) return;
      pushUndo(questionId, ranges);
      ranges[index].style = style || "highlight";
      paintRegion(ranges[index].region);
      saveHL(questionId, ranges);
    }
    function removeAt(index) {
      if (index < 0 || index >= ranges.length) return;
      pushUndo(questionId, ranges);
      const region = ranges[index].region;
      ranges.splice(index, 1);
      paintRegion(region);
      saveHL(questionId, ranges);
    }
    function setRanges(newRanges) {
      ranges = newRanges.slice();
      paintAll();
      saveHL(questionId, ranges);
    }

    Object.values(roots).forEach(function (root) {
      // click a highlight → open the recolor/delete toolbar
      root.addEventListener("click", function (e) {
        const mark = e.target.closest && e.target.closest("mark.hl");
        if (!mark || !root.contains(mark)) return;
        e.stopPropagation();
        // compute the character offset of the clicked mark within the root
        let clickedOffset = null;
        try {
          const r = document.createRange();
          r.selectNodeContents(root);
          r.setEndBefore(mark);
          clickedOffset = r.toString().length;
        } catch (ex) { /* fallback to dataset id if computations fail */ }

        // find which ranges overlap the clickedOffset (or fallback to dataset id)
        const matched = new Set();
        if (clickedOffset != null) {
          ranges.forEach(function (rg, i) {
            if (rg.region === root.dataset.hlRegion && rg.start <= clickedOffset && rg.end > clickedOffset) matched.add(i);
          });
        }
        if (matched.size === 0) {
          const idx = parseInt(mark.dataset.hlId, 10);
          if (!isNaN(idx)) matched.add(idx);
        }

        // helpers that act on all matched indices
        const applyToMatched = function (fn) {
          Array.from(matched).sort(function(a,b){return a-b;}).forEach(function (i) { fn(i); });
        };

        MarkMenu.show(mark, {
          onColor: function (c) { applyToMatched(function(i) { recolorAt(i, c); }); },
          onStyle: function (s) { applyToMatched(function(i) { setStyleAt(i, s); }); },
          onDelete: function () { applyToMatched(function(i) { removeAt(i); }); }
        });
      });
      // release a selection while the pen is ON → highlight immediately
      const onRelease = function () { maybePaint(root); };
      root.addEventListener("mouseup", onRelease);
      root.addEventListener("touchend", onRelease);
    });

    function maybePaint(root) {
      if (!pen.on) return;
      setTimeout(function () {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const rng = sel.getRangeAt(0);
        if (!rng || !root.contains(rng.commonAncestorContainer)) return;
        const off = clampSelectionToRoot(root, rng);
        if (!off) return;
        addRange(root.dataset.hlRegion, off.start, off.end, pen.color, pen.style);
        sel.removeAllRanges();
      }, 0);
    }

    // paint always-visible roots now (question anytime; revise when open in Revise)
    if (roots.question) paintRegion("question");
    if (roots.revise) paintRegion("revise");

    const api = { ensureLoaded: ensureLoaded, reload: reload, setRanges: setRanges };
    controllers.set(questionId, api);
    return api;
  }

  /* ========================================================
     Header highlighter button + color palette (controls the pen)
     ======================================================== */
  function swatch(color, cls, onPick, extraAttrs) {
    const props = Object.assign({
      class: (cls || "hl-swatch") + " hl-" + color, type: "button",
      "data-color": color, "aria-label": "Highlight " + color, title: color,
      onmousedown: function (e) { e.preventDefault(); e.stopPropagation(); onPick(color); }
    }, extraAttrs || {});
    return el("button", props);
  }

  const HeaderPalette = (function () {
    let btn = null, panel = null;
    let btnIconOriginal = null;

    function syncButton() {
      if (!btn) return;
      const inkOn = !!(window.IQB.inkPen && IQB.inkPen.isOn());
      btn.classList.toggle("pen-on", pen.on);
      btn.style.setProperty("--pen", "var(--hlp-" + pen.color + ")");
      btn.setAttribute("aria-pressed", String(pen.on));
      document.body.classList.toggle("hl-pen", pen.on);
      btn.classList.toggle("ink-active", inkOn);
      /* While the presentation pen is on it IS the active mode, whatever the
         highlighter is set to — so the button wears its icon and nothing else. */
      if (inkOn) {
        btn.classList.remove("hl-btn-style-underline");
        btn.innerHTML = INK_PEN_SVG;
        return;
      }
      // if the pen is off, always show the original icon
      if (!pen.on) {
        btn.classList.remove("hl-btn-style-underline");
        if (btnIconOriginal) btn.innerHTML = btnIconOriginal;
      } else if (pen.style === "underline") {
        // show underline icon only when pen is ON and style is underline
        btn.classList.add("hl-btn-style-underline");
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="6" y1="20" x2="18" y2="20"/></svg>';
      } else {
        btn.classList.remove("hl-btn-style-underline");
        if (btnIconOriginal) btn.innerHTML = btnIconOriginal;
      }
    }
    function setPen(next) {
      /* The two pens are alternative modes on one button, so reaching for any
         highlighter tool — a color, underline, even "turn off" — puts the red pen
         down. Otherwise its overlay stays up and keeps swallowing the very text
         selection the highlighter you just picked needs, and the click reads as
         doing nothing at all. */
      if (window.IQB.inkPen && IQB.inkPen.isOn()) IQB.inkPen.off();
      Object.assign(pen, next);
      if (STYLES.indexOf(pen.style) === -1) pen.style = "highlight";
      store.setHLPen({ on: pen.on, color: pen.color, style: pen.style });
      syncButton();
      if (panel) renderPanel();
    }
    function buildPanel() {
      const p = el("div", { class: "hl-palette", hidden: "", role: "menu", "aria-label": "Highlighter" });
      document.body.appendChild(p);
      return p;
    }
    function renderPanel() {
      panel.innerHTML = "";
      panel.appendChild(el("div", { class: "hl-palette-title", text: "Highlighter" }));
      // swatches + inline style button (underline) in the same row
      const swatches = COLORS.map(function (c) {
        // picking a color from the palette should set the pen into HIGHLIGHT mode
        return swatch(c, "hl-swatch", function (color) { setPen({ on: true, color: color, style: 'highlight' }); close(); },
          c === pen.color && pen.on ? { "data-active": "true" } : {});
      });
      const styleBtn = el("button", {
        class: "hl-style-option" + (pen.style === "underline" ? " active" : ""),
        type: "button",
        title: "Underline",
        "aria-label": "Underline",
        onmousedown: function (e) { e.preventDefault(); e.stopPropagation(); setPen({ on: true, color: pen.color, style: "underline" }); close(); }
      }, [el("span", { class: "hl-style-line" })]);

      const tools = [styleBtn];
      const inkBtn = inkButton();
      if (inkBtn) tools.push(inkBtn);
      const row = el("div", { class: "hl-swatch-row hl-swatch-row--with-style" }, swatches.concat(tools));
      panel.appendChild(row);
      panel.appendChild(el("button", {
        class: "hl-off", type: "button",
        onmousedown: function (e) { e.preventDefault(); setPen({ on: false }); close(); }
      }, pen.on ? "Turn off Markup" : "Markup is off"));
    }
    /* The presenter pen (js/inkpen.js) sits in this row as one more pen to pick
       up — it just draws over the page instead of into the text, and its ink is
       throwaway. Absent on touch/small screens, where the module declines to run. */
    function inkButton() {
      const ink = window.IQB.inkPen;
      if (!ink || !ink.supported()) return null;
      const active = ink.isOn();
      const b = el("button", {
        class: "hl-ink-option" + (active ? " active" : ""),
        type: "button",
        "aria-pressed": String(active),
        "aria-label": "Presentation pen",
        title: active
          ? "Presentation pen — on. Click to turn off (or press Esc)"
          : "Presentation pen — draw over the page while explaining; the ink fades away",
        onmousedown: function (e) {
          e.preventDefault(); e.stopPropagation();
          ink.toggle();
          if (ink.isOn()) toast("Pen on — Esc to exit");
          close();
        }
      });
      b.innerHTML = INK_PEN_SVG;
      return b;
    }

    function open() {
      if (!panel) panel = buildPanel();
      renderPanel();
      panel.hidden = false;
      const r = btn.getBoundingClientRect();
      panel.style.top = Math.round(window.scrollY + r.bottom + 8) + "px";
      panel.style.right = Math.round(window.innerWidth - r.right) + "px";
      btn.setAttribute("aria-expanded", "true");
    }
    function close() { if (panel) panel.hidden = true; if (btn) btn.setAttribute("aria-expanded", "false"); }
    function isOpen() { return panel && !panel.hidden; }
    function shouldIgnoreClose(target) {
      if (!target || !target.closest) return false;
      const clickedInPanel = panel && panel.contains(target);
      const clickedInButton = btn && btn.contains(target);
      const clickedInContent = !!target.closest('.qa-qtext, .qa-revise, .answer, .qa-deep, .content, .qa-card');
      return clickedInPanel || clickedInButton || clickedInContent;
    }

    function init() {
      btn = qs("#hl-toggle");
      if (!btn) return;
      // remember the original inner content so we can restore it when switching styles
      btnIconOriginal = btn.innerHTML;
      // persist original on the DOM so other modules can restore it when needed
      try { btn.dataset.hlOriginal = btnIconOriginal; } catch (e) {}
      btn.addEventListener("click", function (e) { e.stopPropagation(); isOpen() ? close() : open(); });
      document.addEventListener("mousedown", function (e) {
        if (isOpen() && !shouldIgnoreClose(e.target)) close();
      });
      // Esc turns the presenter pen off from anywhere — keep the button in step.
      if (window.IQB.inkPen) IQB.inkPen.onChange(function () { syncButton(); if (isOpen()) renderPanel(); });
      syncButton();
    }
    return { init: init, close: close };
  })();

  /* ========================================================
     Per-highlight toolbar (recolor + delete) — the small popup on a mark
     ======================================================== */
  const MarkMenu = (function () {
    let elmt = null, handlers = null;

    function build() {
      const m = el("div", { class: "hl-menu", hidden: "", role: "menu", "aria-label": "Edit highlight" });
      document.body.appendChild(m);
      return m;
    }
    // Ring every <mark> that belongs to the same highlight so the user sees the
    // exact span the toolbar will act on. data-hl-id is only an index into the
    // owning card's ranges, so it repeats across cards ("0" is every card's first
    // highlight) — the query MUST stay inside the mark's own region root or it
    // rings the same-numbered highlight in every other question too. Matching on
    // [data-hl-region] covers every root makeController registers, so a new region
    // can't silently fall through to a document-wide scope again.
    function setActive(mark, on) {
      const root = mark.closest("[data-hl-region]");
      if (!root) { mark.classList.toggle("hl-editing", on); return; }
      root.querySelectorAll('mark.hl[data-hl-id="' + mark.dataset.hlId + '"]')
        .forEach(function (m) { m.classList.toggle("hl-editing", on); });
    }
    function clearActive() {
      document.querySelectorAll("mark.hl-editing").forEach(function (m) { m.classList.remove("hl-editing"); });
    }
    function show(mark, h) {
      if (!elmt) elmt = build();
      handlers = h;
      elmt.innerHTML = "";
      // mark's current color (e.g. 'yellow') so we can show active swatch
      let markColor = null;
      for (const cls of mark.classList) {
        if (cls.indexOf("hl-") === 0 && cls !== "hl-underline" && cls !== "hl-editing") { markColor = cls.replace("hl-",""); break; }
      }
      COLORS.forEach(function (c) {
        const extra = (c === markColor) ? { "data-active": "true" } : {};
        elmt.appendChild(swatch(c, "hl-menu-swatch", function (color) { if (handlers) handlers.onColor(color); hide(); }, extra));
      });
      const currentStyle = mark.classList.contains("hl-underline") ? "underline" : "highlight";
      elmt.appendChild(el("button", {
        class: "hl-menu-style" + (currentStyle === "underline" ? " active" : ""),
        type: "button",
        title: "Toggle underline",
        "aria-label": "Toggle underline",
        onmousedown: function (e) {
          e.preventDefault(); e.stopPropagation();
          const newStyle = currentStyle === "underline" ? "highlight" : "underline";
          if (handlers) handlers.onStyle(newStyle);
          // Do NOT change global pen.style or header icon here — only the clicked mark should change.
          hide();
        }
      }, [el("span", { class: "hl-style-line" })]));
      const del = el("button", {
        class: "hl-menu-del", type: "button", "aria-label": "Delete highlight", title: "Delete",
        onmousedown: function (e) { e.preventDefault(); e.stopPropagation(); if (handlers) handlers.onDelete(); hide(); }
      });
      del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
      elmt.appendChild(del);

      clearActive();
      setActive(mark, true);
      elmt.hidden = false;
      const rect = mark.getBoundingClientRect();
      const top = window.scrollY + rect.top - elmt.offsetHeight - 8;
      const left = window.scrollX + rect.left + (rect.width / 2) - (elmt.offsetWidth / 2);
      elmt.style.top = Math.max(window.scrollY + 4, top) + "px";
      elmt.style.left = Math.max(4, left) + "px";
    }
    function hide() { if (elmt) elmt.hidden = true; handlers = null; clearActive(); }
    function isOpen() { return elmt && !elmt.hidden; }
    return { show: show, hide: hide, isOpen: isOpen };
  })();

  // global dismissers
  document.addEventListener("mousedown", function (e) {
    if (MarkMenu.isOpen() && !(e.target.closest && e.target.closest(".hl-menu"))) MarkMenu.hide();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { MarkMenu.hide(); HeaderPalette.close(); } });
  window.addEventListener("scroll", function () { if (MarkMenu.isOpen()) MarkMenu.hide(); }, true);
  window.addEventListener("resize", function () { MarkMenu.hide(); });

  /* ========================================================
     Public API (used by app.js) + init
     ======================================================== */
  IQB.highlights = {
    register: function (questionId, card) { makeController(questionId, card); },
    onCardOpen: function (questionId) {
      const c = controllers.get(questionId);
      if (c) c.ensureLoaded();
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", HeaderPalette.init);
  else HeaderPalette.init();
})();

/* Read-aloud (IQB.speak) — speaks a card's prose with the browser's built-in
   SpeechSynthesis. No network, no cost, works offline with the PWA.

   Two rules shape the whole file:

   • Only prose is spoken. Code blocks and comparison tables are the two things
     audio genuinely cannot carry, so they are replaced by a short spoken marker
     ("Code example on screen") rather than dropped silently — a half-read answer
     with no explanation is more confusing than one that says what it skipped.
     INLINE <code> is deliberately NOT skipped: answers read "var — function
     scoped, hoisted to undefined", and stripping the inline code removes the
     subject of the sentence.

   • Nothing here may change the text content of .answer / .qa-deep.
     js/highlights.js stores saved highlights as character offsets into those
     roots' textContent (see its header), so inserting a per-sentence <span>
     would silently shift every highlight the reader has ever saved. The
     "currently reading" indicator is therefore a CLASS on the existing block
     element — attributes don't touch textContent — which also means the
     highlight granularity is per paragraph/bullet, not per sentence. */
(function () {
  window.IQB = window.IQB || {};
  const { el, qs, qsa, toast } = IQB.utils;

  const synth = window.speechSynthesis;
  const supported = !!synth && typeof window.SpeechSynthesisUtterance === "function";

  /* ========================================================
     PREFS
     ======================================================== */
  const PREF_KEY = "iqb:tts";
  const RATES = [0.9, 1, 1.25, 1.5, 1.75, 2];
  /* pos is the dragged position as a FRACTION of the viewport (0–1), not pixels:
     the reader parks the player on a desktop monitor and later opens the same
     note on a phone, and a remembered x of 1100px would put it off-screen.
     Fractions survive the move; clampPos() handles the rest. */
  let prefs = { rate: 1, voice: "", playAll: false, min: false, pos: null };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || "{}")); } catch (_) {}
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) {} };

  /* ========================================================
     VOICE
     ======================================================== */
  let voices = [];
  /* Quality ordering. Chrome's "Google …" and Edge's "… Natural" voices are
     neural and sound markedly better than the default formant ones; en-IN first
     because that's this app's primary audience. */
  const VOICE_RANK = [/google.*en[-_ ]?in/i, /natural.*english/i, /google.*en/i, /natural/i, /^microsoft/i];

  function pickVoice() {
    if (!voices.length) return null;
    if (prefs.voice) {
      const saved = voices.find((v) => v.voiceURI === prefs.voice);
      if (saved) return saved;
    }
    const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
    const pool = en.length ? en : voices;
    for (const re of VOICE_RANK) {
      const hit = pool.find((v) => re.test(v.name));
      if (hit) return hit;
    }
    return pool[0];
  }

  function loadVoices() { voices = synth.getVoices() || []; }
  if (supported) {
    loadVoices();
    // Chrome populates the list asynchronously — it is empty on first call.
    synth.addEventListener("voiceschanged", () => { loadVoices(); renderVoiceOptions(); });
  }

  /* ========================================================
     EXTRACTION — DOM → speakable chunks

     Each chunk is { node, text }: `node` is the existing block element to
     outline while it plays, `text` is its prose with skipped regions replaced
     by markers.
     ======================================================== */

  /* Replaced by a spoken marker (the reader is told they exist). */
  const MARK_SEL = ".code-block, pre, .table-scroll, table";
  /* Dropped in silence — chrome and controls.
     .pn-section is NOT muted here: the reader's own note is read as part of the
     card (see blocksForCard), which is the whole point of having written it.
     Only the section's furniture — its toggle, Edit/Delete/Save buttons — is
     skipped, and `button` already covers those. */
  const MUTE_SEL = ".qa-body-actions, .qa-act, .copy-btn, button, .rpt-wrap, .pn-actions";

  const BLOCK_SEL = "p, li, h1, h2, h3, h4, h5, h6, blockquote, dt, dd, figcaption";

  function markerFor(node) {
    if (node.matches(".table-scroll, table")) return "Comparison table on screen.";
    return "Code example on screen.";
  }

  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

  /* Text of one block, minus anything skipped inside it (a bullet can contain
     an inline code snippet AND a fenced block). */
  function textOf(node) {
    let out = "";
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      if (n.hasAttribute("hidden")) return;
      if (n.matches(MUTE_SEL)) return;
      if (n.matches(MARK_SEL)) { out += " " + markerFor(n) + " "; return; }
      out += textOf(n);
    });
    return out;
  }

  function walk(node, out) {
    if (!node || node.nodeType !== 1) return;
    if (node.hasAttribute("hidden")) return;      // collapsed deep dive
    if (node.matches(MUTE_SEL)) return;
    if (node.matches(MARK_SEL)) { out.push({ node, text: markerFor(node) }); return; }

    // A block with no block-level descendants is a leaf: speak it whole.
    if (!node.querySelector(BLOCK_SEL)) {
      const t = clean(textOf(node));
      if (t) out.push({ node, text: t });
      return;
    }
    // Otherwise recurse, but keep any loose text sitting directly in this
    // container (authored HTML often has a lead-in line before a <ul>).
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { const t = clean(n.nodeValue); if (t) out.push({ node, text: t }); }
      else walk(n, out);
    });
  }

  /* Long blocks are split into sentences before being queued. Two reasons:
     iOS Safari truncates utterances past roughly 15 seconds, and Chrome's
     pause() gets unreliable on long ones. */
  const MAX_CHUNK = 180;
  function sentences(text) {
    if (text.length <= MAX_CHUNK) return [text];
    const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
    const out = [];
    parts.forEach((p) => {
      const s = clean(p);
      if (!s) return;
      // Re-join fragments an abbreviation split ("e.g.", "vs.") and any other
      // stub too short to be a real sentence.
      const prev = out[out.length - 1];
      if (prev && (s.length < 40 || prev.length < 40) && prev.length + s.length <= MAX_CHUNK * 2) {
        out[out.length - 1] = prev + " " + s;
      } else out.push(s);
    });
    return out.length ? out : [text];
  }

  /* A question card is the one source with structure worth special-casing:
     the question is a heading, and the tip needs its label turned into its own
     sentence. Everything else (a tutor reply, a note, the deep dive on its own)
     is just prose roots and goes through walk() directly. */
  function blocksForCard(card) {
    const blocks = [];
    const qtext = qs(".qa-qtext", card);
    if (qtext) blocks.push({ node: qtext, text: clean(qtext.textContent) });

    const answer = qs(".answer", card);
    if (answer) walk(answer, blocks);

    /* The tip is authored as "<b>Tip</b> Default to const…", which runs
       together as "Tip Default to const" when spoken. Give the label its own
       sentence so the voice pauses after it. */
    const tip = qs(".qa-tip", card);
    if (tip) {
      const t = clean(textOf(tip)).replace(/^tip\s*[:.]?\s*/i, "");
      if (t) blocks.push({ node: tip, text: "Tip. " + t });
    }

    /* Deep dive, when the reader has it open. A collapsed one carries `hidden`
       and walk() skips it, so "expanded" is the switch — no extra check here. */
    const deep = qs(".qa-deep", card);
    if (deep) walk(deep, blocks);

    /* The reader's own note, last — it is their commentary on everything above,
       so it belongs after the answer rather than interleaved with it. Only the
       saved view (or the editor's surface, mid-edit) is read; the section's
       buttons are muted. Announced so it is not mistaken for the author's text.

       Collapsed sections are skipped, exactly as the deep dive is: what is on
       screen is what gets read. walk() checks `hidden` on the nodes it visits
       but not on their ancestors, and .pn-text sits INSIDE the hidden .pn-body,
       so the collapsed case has to be tested here. */
    const note = qs(".pn-text", card) || qs(".pn-input", card);
    const noteBody = note && note.closest(".pn-body");
    const noteVisible = note && (!noteBody || !noteBody.hasAttribute("hidden"));
    if (noteVisible && clean(textOf(note))) {
      blocks.push({ node: note, text: "Your note." });
      walk(note, blocks);
    }
    return blocks;
  }

  function chunksFor(src) {
    const blocks = src.card ? blocksForCard(src.card) : [];
    if (!src.card) (src.roots() || []).forEach((r) => { if (r) walk(r, blocks); });

    const out = [];
    blocks.forEach((b) => sentences(b.text).forEach((t) => out.push({ node: b.node, text: t })));
    return out;
  }

  /* ========================================================
     PLAYER
     ======================================================== */
  /* cur.src is the SOURCE being read — a question card, a tutor reply, a note,
     or a deep dive on its own. src.id is the element that identifies it, so any
     trigger button anywhere can ask "am I the one playing?". */
  let cur = null;        // { src, chunks, i, node, gen }
  let paused = false;
  let keepAlive = null;  // Chrome drops long queues without a periodic resume()

  /* Android routes speech to the platform TTS engine, where pause() is really a
     stop and resume() a no-op. Everything below that leans on pause/resume has
     to take a different path there — see startKeepAlive() and holdPause(). */
  const ANDROID = /Android/.test(navigator.userAgent);

  function startKeepAlive() {
    stopKeepAlive();
    /* The desktop watchdog this defeats does not exist on Android, and running
       it there would silently kill playback on the first tick. */
    if (ANDROID) return;
    keepAlive = setInterval(() => {
      if (!synth.speaking || paused) return;
      synth.pause(); synth.resume();
    }, 9000);
  }
  function stopKeepAlive() { if (keepAlive) { clearInterval(keepAlive); keepAlive = null; } }

  function clearMark() {
    qsa(".tts-reading").forEach((n) => n.classList.remove("tts-reading"));
  }

  function markNode(node) {
    if (!node || node === (cur && cur.node)) return;
    clearMark();
    node.classList.add("tts-reading");
    if (cur) cur.node = node;
    const r = node.getBoundingClientRect();
    /* Keep the block clear of the docked player. A parked bar is wherever the
       reader put it, so there is no fixed strip to avoid. */
    const barH = prefs.pos ? 24 : 96;
    if (r.top < 72 || r.bottom > window.innerHeight - barH) {
      node.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function speakAt(idx) {
    if (!cur) return;
    if (idx < 0) idx = 0;
    if (idx >= cur.chunks.length) { onSourceFinished(); return; }
    cur.i = idx;
    /* cancel() fires end/error on the utterance being replaced. Guarding on the
       index alone is not enough — re-queueing the SAME index (which cycleRate
       does, since Chrome ignores a rate change mid-utterance) would let the old
       one's onend advance past a chunk. Every speak() gets a generation token
       and only the current generation may advance. */
    const gen = ++cur.gen;
    synth.cancel();
    const chunk = cur.chunks[idx];
    const u = new SpeechSynthesisUtterance(chunk.text);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = prefs.rate;
    u.onstart = () => { if (cur && cur.gen === gen) { markNode(chunk.node); syncBar(); } };
    u.onend = () => { if (cur && cur.gen === gen && !paused) speakAt(idx + 1); };
    u.onerror = (e) => {
      // "interrupted"/"canceled" are our own cancel() calls, not failures.
      if (e.error === "interrupted" || e.error === "canceled") return;
      if (!cur || cur.gen !== gen) return;
      stop();
      toast("Read aloud failed — try again");
    };
    /* Chrome drops a speak() issued in the same tick as cancel(). */
    setTimeout(() => { if (cur && cur.gen === gen) synth.speak(u); }, 0);
  }

  /* Continuous play is a question-list idea — rolling from one card to the next
     is what makes this usable on a commute. It deliberately does NOT apply to a
     tutor reply or a note: there is no meaningful "next" for those. */
  function onSourceFinished() {
    const card = cur && cur.src.card;
    if (prefs.playAll && card) {
      const next = nextCard(card);
      if (next) { playCard(next); return; }
      toast("Reached the end of the list");
    }
    stop();
  }

  function nextCard(card) {
    let n = card.nextElementSibling;
    while (n && !n.classList.contains("qa-card")) n = n.nextElementSibling;
    return n || null;
  }
  function prevCard(card) {
    let n = card.previousElementSibling;
    while (n && !n.classList.contains("qa-card")) n = n.previousElementSibling;
    return n || null;
  }

  /* app.js sets this so we can expand a card (and reveal it in practice mode)
     before reading it — the reader should see what they are hearing. */
  function openCard(card) {
    if (typeof IQB.speak.openCard === "function") IQB.speak.openCard(card);
    else card.classList.add("open", "revealed");
  }

  /* src: { id, title, card?, roots?, scope? }
       id     — element identifying the source (what trigger buttons compare on)
       roots  — () => [el] to read, ignored when `card` is set
       scope  — element to flag with .tts-active (defaults to id) */
  function play(src) {
    if (!supported) { toast("Read aloud not supported"); return; }
    if (src.card) openCard(src.card);

    const chunks = chunksFor(src);
    if (!chunks.length) { toast("Nothing to read here"); return; }

    stop(true);
    cur = { src, chunks, i: 0, node: null, gen: 0 };
    paused = false;
    (src.scope || src.id).classList.add("tts-active");
    showBar();
    startKeepAlive();
    speakAt(0);
  }

  function playCard(card) {
    play({ id: card, card, scope: card, title: () => {
      const q = qs(".qa-qtext", card);
      return q ? q.textContent : "Question";
    } });
  }

  function stop(keepBar) {
    stopKeepAlive();
    paused = false;
    synth.cancel();
    clearMark();
    qsa(".tts-active").forEach((c) => c.classList.remove("tts-active"));
    cur = null;
    if (!keepBar) hideBar();
    syncButtons();
  }

  /* Pause/resume, split out because Android cannot do either. There the queue is
     cancelled outright and resuming re-speaks the current chunk from its start —
     chunks are MAX_CHUNK-sized, so at worst the reader hears one sentence twice,
     which beats a pause button that stops the audio for good. */
  function holdPause() {
    if (!cur || paused) return;
    paused = true;              // set first: it gates the onend that cancel() fires
    if (ANDROID) synth.cancel();
    else synth.pause();
    stopKeepAlive();
  }

  function releasePause() {
    if (!cur || !paused) return;
    paused = false;
    if (ANDROID) speakAt(cur.i);
    else synth.resume();
    startKeepAlive();
  }

  function toggle(src) {
    if (cur && cur.src.id === src.id) {
      if (paused) releasePause();
      else stop();
      syncBar(); syncButtons();
      return;
    }
    play(src);
  }

  function togglePause() {
    if (!cur) return;
    if (paused) releasePause();
    else holdPause();
    syncBar();
  }

  /* Chrome ignores rate changes on an utterance already speaking, so re-queue
     from the current chunk. */
  function cycleRate() {
    const i = RATES.indexOf(prefs.rate);
    prefs.rate = RATES[(i + 1) % RATES.length];
    savePrefs();
    syncBar();
    if (cur && !paused) speakAt(cur.i);
  }

  /* ========================================================
     ICONS
     ======================================================== */
  const svg = (paths, size = 15, fill = "none") =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0">${paths}</svg>`;

  const ICON = {
    speaker: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
    stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
    pause: svg('<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>', 16),
    play: svg('<polygon points="7 4 20 12 7 20 7 4"/>', 16, "currentColor"),
    prev: svg('<polygon points="18 5 8 12 18 19 18 5"/><line x1="5" y1="5" x2="5" y2="19"/>', 15, "currentColor"),
    next: svg('<polygon points="6 5 16 12 6 19 6 5"/><line x1="19" y1="5" x2="19" y2="19"/>', 15, "currentColor"),
    close: svg('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>', 14),
    /* Standard window-chrome glyphs, not chevrons: a bar collapses, a square
       restores. Chevrons read as "scroll/next" and were being misread. */
    min: svg('<line x1="6" y1="17" x2="18" y2="17"/>', 15),
    max: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>', 15),
    list: svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor"/>', 14)
  };

  /* ========================================================
     PER-CARD BUTTON
     ======================================================== */
  /* One trigger factory for every surface — question cards, the deep dive, a
     tutor reply, a note. `cls` lets each host pass its own button styling so
     the control looks native where it lands (.qa-speak, .tutor-act, …).

     The source is resolved lazily on click: a tutor reply streams in and a note
     is edited after the button is built, so the roots must be read at play time,
     never captured at build time. */
  function trigger(opts) {
    const label = opts.label || "";
    const paint = (on) => {
      btn.classList.toggle("on", on);
      btn.innerHTML = (on ? ICON.stop : ICON.speaker) +
        (label ? '<span>' + (on ? "Stop" : label) + "</span>" : "");
      btn.setAttribute("aria-label", on ? "Stop reading" : (opts.title || "Read aloud"));
    };

    const btn = el("button", {
      class: "tts-trigger " + (opts.cls || "qa-speak"),
      type: "button",
      title: opts.title || "Read aloud",
      onclick: (e) => { e.stopPropagation(); e.preventDefault(); toggle(opts.src()); }
    });
    btn._ttsId = () => opts.src().id;
    btn._ttsPaint = paint;
    paint(false);
    return btn;
  }

  function syncButtons() {
    qsa(".tts-trigger").forEach((b) => {
      if (!b._ttsPaint) return;
      let on = false;
      try { on = !!cur && b._ttsId() === cur.src.id; } catch (_) { on = false; }
      b._ttsPaint(on);
    });
  }

  /* Question card — the button that sits beside the star. */
  function build(card) {
    return trigger({
      cls: "qa-speak", title: "Read this answer aloud",
      src: () => ({
        id: card, card, scope: card,
        title: () => { const q = qs(".qa-qtext", card); return q ? q.textContent : "Question"; }
      })
    });
  }

  /* Any prose element — a deep dive, a tutor reply, a note body. */
  function buildFor(opts) {
    return trigger({
      cls: opts.cls, label: opts.label, title: opts.title,
      src: () => {
        const root = opts.root();
        return { id: root, scope: opts.scope ? opts.scope() : root, roots: () => [root], title: opts.name };
      }
    });
  }

  /* ========================================================
     FLOATING PLAYER BAR
     ======================================================== */
  let bar = null, barPlay = null, barRate = null, barAll = null, voiceSel = null, barMin = null;

  /* ---------- position ----------
     Docked (the default) is pure CSS: bottom-centre, sliding up on show. The
     moment the reader drags, the bar goes `.free` and is driven by inline
     left/top instead — `.free` cancels the docking transform so the two
     positioning models never fight. */
  const MARGIN = 8;

  /* clientWidth, not innerWidth: innerWidth counts the scrollbar, which would
     let the bar park underneath it. */
  const vpW = () => document.documentElement.clientWidth || window.innerWidth;
  const vpH = () => document.documentElement.clientHeight || window.innerHeight;

  function clampPos(px, py) {
    const r = bar.getBoundingClientRect();
    const maxX = Math.max(MARGIN, vpW() - r.width - MARGIN);
    const maxY = Math.max(MARGIN, vpH() - r.height - MARGIN);
    return { x: Math.min(Math.max(px, MARGIN), maxX), y: Math.min(Math.max(py, MARGIN), maxY) };
  }

  function applyPos() {
    if (!bar) return;
    if (!prefs.pos) { bar.classList.remove("free"); bar.style.left = bar.style.top = ""; return; }
    bar.classList.add("free");
    /* Measure before placing: a minimize/maximize changes the width, and a
       bar parked at the right edge must not end up half off-screen. */
    const p = clampPos(prefs.pos.x * vpW(), prefs.pos.y * vpH());
    bar.style.left = p.x + "px";
    bar.style.top = p.y + "px";
  }

  function storePos(x, y) {
    const p = clampPos(x, y);
    prefs.pos = { x: p.x / vpW(), y: p.y / vpH() };
    savePrefs();
    bar.style.left = p.x + "px";
    bar.style.top = p.y + "px";
    /* The docked bar reserves a strip at the bottom of the list; a free one
       does not, so release that padding the moment it is dragged away. */
    document.body.classList.remove("tts-on");
  }

  function wireDrag() {
    let dx = 0, dy = 0, dragging = false, moved = false;

    bar.addEventListener("pointerdown", (e) => {
      // controls keep their own behaviour; the bar's chrome is the drag handle
      if (e.target.closest("button, select, input, a")) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const r = bar.getBoundingClientRect();
      /* Switching from docked to free mid-gesture must not make the bar jump:
         freeze it at exactly where it is currently painted, then drag from there. */
      bar.classList.add("free");
      bar.style.left = r.left + "px";
      bar.style.top = r.top + "px";
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      dragging = true; moved = false;
      bar.classList.add("dragging");
      bar.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    bar.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      moved = true;
      const p = clampPos(e.clientX - dx, e.clientY - dy);
      bar.style.left = p.x + "px";
      bar.style.top = p.y + "px";
    });

    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove("dragging");
      try { bar.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moved) storePos(parseFloat(bar.style.left), parseFloat(bar.style.top));
      else {
        /* A click that never moved is not a drag. If the bar was docked, put it
           back — otherwise a stray tap would silently strand it in free mode. */
        if (!prefs.pos) { bar.classList.remove("free"); bar.style.left = bar.style.top = ""; }
      }
    };
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);

    // Double-click the chrome to collapse/expand — faster than aiming at the chevron.
    bar.addEventListener("dblclick", (e) => {
      if (e.target.closest("button, select, input, a")) return;
      setMin(!prefs.min);
    });
  }

  function setMin(on) {
    prefs.min = !!on;
    savePrefs();
    bar.classList.toggle("min", prefs.min);
    barMin.innerHTML = prefs.min ? ICON.max : ICON.min;
    const lbl = prefs.min ? "Expand player" : "Minimize player";
    barMin.setAttribute("aria-label", lbl);
    barMin.setAttribute("title", lbl);
    barMin.setAttribute("aria-expanded", String(!prefs.min));
    applyPos();   // width changed — re-clamp so it stays fully on screen
  }

  /* A resized window (or a rotated phone) can leave a parked bar off-screen. */
  window.addEventListener("resize", IQB.utils.debounce(() => { if (bar) applyPos(); }, 120));

  function buildBar() {
    const mk =(icon, label, fn, cls) => {
      const b = el("button", { class: "tts-btn" + (cls ? " " + cls : ""), "aria-label": label, title: label, onclick: fn });
      b.innerHTML = icon;
      return b;
    };

    barPlay = mk(ICON.pause, "Pause", togglePause, "tts-play");
    barRate = el("button", { class: "tts-btn tts-rate", "aria-label": "Playback speed", title: "Playback speed", onclick: cycleRate });
    barAll = mk(ICON.list, "Continue to next question", () => {
      prefs.playAll = !prefs.playAll; savePrefs(); syncBar();
      toast(prefs.playAll ? "Continuous play on" : "Continuous play off");
    }, "tts-all");

    voiceSel = el("select", {
      class: "tts-voice", "aria-label": "Voice",
      onchange: (e) => { prefs.voice = e.target.value; savePrefs(); if (cur && !paused) speakAt(cur.i); }
    });
    renderVoiceOptions();

    barMin = mk(ICON.min, "Minimize player", () => setMin(!prefs.min), "tts-min");

    /* Controls only. This used to show the title and a chunk counter, but what
       is being read is already obvious from the highlighted block on the page —
       restating it was noise in a thing meant to sit quietly over the content.
       The title now lives in the bar's aria-label instead (see syncBar), where
       it still serves screen-reader users who have no highlight to look at. */
    bar = el("div", { class: "tts-bar", role: "region", "aria-label": "Read aloud player" }, [
      el("div", { class: "tts-controls" }, [
        mk(ICON.prev, "Previous", () => { if (cur) speakAt(cur.i - 1); }, "tts-prev"),
        barPlay,
        mk(ICON.next, "Next", () => { if (cur) speakAt(cur.i + 1); }, "tts-next"),
        barRate, barAll, voiceSel, barMin,
        mk(ICON.close, "Stop reading", () => stop())
      ])
    ]);
    document.body.appendChild(bar);
    wireDrag();
    setMin(prefs.min);   // restore the collapsed/expanded choice
    applyPos();          // and where it was parked
  }

  /* Accent is the thing worth choosing between, and the raw voice names bury it
     — "Google UK English Female" says it, "Neerja Online (Natural)" does not.
     So each option is labelled with its region tag. */
  const REGION = {
    "en-in": "IN", "en-us": "US", "en-gb": "UK", "en-au": "AU",
    "en-ca": "CA", "en-ie": "IE", "en-nz": "NZ", "en-za": "ZA"
  };
  function regionOf(v) {
    return REGION[String(v.lang || "").toLowerCase().replace("_", "-")] || "";
  }

  function renderVoiceOptions() {
    if (!voiceSel) return;
    const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
    /* Indian English first — it exists on Android and Edge but not desktop
       Chrome, so when it IS present it's worth surfacing at the top rather than
       leaving the reader to hunt for it. */
    const pool = (en.length ? en : voices)
      .slice()
      .sort((a, b) => (regionOf(b) === "IN") - (regionOf(a) === "IN"))
      .slice(0, 24);

    voiceSel.innerHTML = "";
    pool.forEach((v) => {
      const name = v.name
        .replace(/^Microsoft\s+/, "")
        .replace(/\s*-\s*English \([^)]*\)$/i, "")   // region moves to the tag
        .replace(/\s*Online \(Natural\)/i, " ✦");     // neural voices, flagged
      const tag = regionOf(v);
      voiceSel.appendChild(el("option", {
        value: v.voiceURI,
        text: (tag ? tag + " · " : "") + name.trim()
      }));
    });
    const active = pickVoice();
    if (active) voiceSel.value = active.voiceURI;
  }

  function showBar() {
    if (!bar) buildBar();
    bar.classList.add("show");
    /* Only the docked bar reserves list padding — a free-floating one is the
       reader's own placement and must not push the page around. */
    document.body.classList.toggle("tts-on", !prefs.pos);
    applyPos();
    syncBar();
    syncButtons();
  }
  function hideBar() { if (bar) bar.classList.remove("show"); document.body.classList.remove("tts-on"); }

  function syncBar() {
    if (!bar || !cur) return;
    const t = cur.src.title;
    const name = (typeof t === "function" ? t() : t) || "Reading";
    /* Not rendered — the bar shows controls only. This keeps the player's
       accessible name meaningful, since a screen-reader user has no highlighted
       block to look at. */
    bar.setAttribute("aria-label",
      `Read aloud: ${name}, part ${cur.i + 1} of ${cur.chunks.length}`);
    barPlay.innerHTML = paused ? ICON.play : ICON.pause;
    barPlay.setAttribute("aria-label", paused ? "Resume" : "Pause");
    barRate.textContent = prefs.rate + "×";
    /* Continuous play only means something in the question list, so the control
       hides itself for a tutor reply or a note rather than sitting there dead. */
    barAll.hidden = !cur.src.card;
    barAll.classList.toggle("on", prefs.playAll);
    barAll.setAttribute("aria-pressed", String(prefs.playAll));
  }

  /* A queue left speaking across a reload keeps talking in some browsers. */
  window.addEventListener("pagehide", () => { try { synth.cancel(); } catch (_) {} });
  window.addEventListener("beforeunload", () => { try { synth.cancel(); } catch (_) {} });

  IQB.speak = {
    supported,
    build,        // question card (speaker beside the star)
    buildFor,     // any prose root — deep dive, tutor reply, note
    playCard,
    stop,
    openCard: null,   // set by app.js
    isPlaying: () => !!cur
  };
})();

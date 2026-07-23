/* ============================================================
   Quick Note — capture a note without leaving the question.

   Opened from the sticky header (or the N key), so it is reachable at any
   scroll depth. It is a floating, draggable window rather than a modal or a
   corner FAB for one concrete reason: the moment a note is most wanted is
   while the AI Tutor panel is open on the right, and anything anchored down
   there would be buried underneath it. This sits above (z-index 140) and the
   reader can shove it wherever the text isn't.

   It stores nothing of its own. Save hands the note to js/notebook.js, which
   owns persistence, sync and tagging — so a quick note is indistinguishable
   from one written in My Notes the moment it lands.

   Only two things are kept locally (js/storage.js): the in-progress draft, so
   closing the window mid-thought is never destructive, and the window's
   geometry, so it reopens where it was left.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el, qs, toast, debounce } = IQB.utils;
  const store = IQB.storage;

  const MOBILE = "(max-width: 640px)";
  const isMobile = function () { return window.matchMedia(MOBILE).matches; };

  /* Below these the toolbar has nowhere to wrap to and the footer buttons
     start colliding. Kept here because both applyBox() and resizeBy() clamp. */
  const MIN_W = 300;
  const MIN_H = 260;
  const EDGES = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

  const nb = function () { return window.IQB.notebook || null; };

  let panel = null;      // the window, built on first open
  let editor = null;     // richtext handle
  let toolbarRef = null; // shared formatting toolbar (js/richtext.js)
  let nameEl = null;
  let tagsEl = null;
  let tagPickerRef = null;
  let selectedTag = null;   // the note's single tag, or null
  let attachEl = null;
  let attachTextEl = null;
  let openBtn = null;
  let attachOn = true;   // reader's toggle; remembered for the session only
  let attachQ = null;    // { id, title } resolved at open time

  /* ========================================================
     Which question is the reader actually looking at?

     The open card nearest the middle of the viewport. Not the last-opened id
     from storage — that one goes stale the moment the reader scrolls past it,
     which would silently file the note under a question they left minutes ago.
     ======================================================== */
  function currentQuestion() {
    const cards = document.querySelectorAll(".qa-card.open[data-id]");
    if (!cards.length) return null;

    const mid = window.innerHeight / 2;
    let best = null;
    let bestDist = Infinity;

    cards.forEach(function (card) {
      const r = card.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;   // off screen
      const dist = Math.abs((r.top + r.bottom) / 2 - mid);
      if (dist < bestDist) { bestDist = dist; best = card; }
    });
    if (!best) return null;

    const q = qs(".qa-qtext", best) || qs(".qa-question", best);
    return {
      id: best.dataset.id,
      // The card's own category, not the view's: the reader may be browsing a
      // group ("frontend"), and tagging an Angular note "frontend" would file
      // it somewhere My Notes' tag filter never looks.
      category: best.dataset.category || "",
      title: (q ? q.textContent : "").trim().slice(0, 140) || "Note on a question"
    };
  }

  /* ========================================================
     Draft — survives close, reload and navigation
     ======================================================== */
  const saveDraft = debounce(function () {
    if (!editor) return;
    const html = editor.getHTML();
    const plain = editor.getPlain();
    const title = nameEl.value.trim();
    if (!plain.trim() && !title) { store.clearQuickNoteDraft(); markDraft(false); return; }
    store.setQuickNoteDraft({ title: title, html: html, tag: selectedTag, at: Date.now() });
    markDraft(true);
  }, 350);

  function markDraft(has) {
    if (openBtn) openBtn.classList.toggle("has-draft", !!has);
  }

  /* ========================================================
     Build
     ======================================================== */
  function build() {
    const bar = el("div", { class: "qn-bar" }, [
      el("span", {
        class: "qn-bar-title",
        html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>Quick Note'
      }),
      el("button", {
        class: "qn-bar-btn", type: "button", title: "Open in My Notes",
        "aria-label": "Open My Notes",
        onclick: function () {
          if (IQB.app && IQB.app.setCategory) IQB.app.setCategory("notes", true);
          close();
        },
        html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
      }),
      el("button", {
        class: "qn-bar-btn qn-collapse", type: "button", title: "Collapse",
        "aria-label": "Collapse",
        onclick: function () { panel.classList.toggle("is-collapsed"); },
        html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      }),
      el("button", {
        class: "qn-bar-btn", type: "button", title: "Close (Esc)", "aria-label": "Close quick note",
        onclick: close,
        html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      })
    ]);

    attachTextEl = el("span", { class: "qn-attach-text" });
    attachEl = el("button", {
      class: "qn-attach", type: "button", hidden: "", "aria-pressed": "true",
      onclick: function () { attachOn = !attachOn; paintAttach(); }
    }, [
      el("span", {
        class: "qn-attach-box",
        html: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>'
      }),
      attachTextEl
    ]);

    nameEl = el("input", {
      class: "qn-name", type: "text", placeholder: "Title (optional)",
      oninput: saveDraft
    });

    /* The tag sits on the title row, same as My Notes: the tag is what decides
       where the note lands in the list, so it belongs with the note's identity.
       manage:false — renaming or deleting a tag edits the whole app's
       vocabulary, which is not a thing to offer inside a capture popup. */
    tagsEl = el("div", { class: "nb-tags qn-tags" });
    tagPickerRef = IQB.tagpicker.attach({
      host: tagsEl,
      manage: false,
      getTag: function () { return selectedTag; },
      onPick: function (tag) { selectedTag = tag; saveDraft(); }
    });
    const titleRow = el("div", { class: "qn-titlerow" }, [nameEl, tagsEl]);

    const surface = el("div", {
      class: "qn-surface nb-body",
      "data-placeholder": "Write, paste a snippet, or drop the AI Helper's answer here…"
    });

    const foot = el("div", { class: "qn-foot" }, [
      el("span", { class: "qn-hint", html: '<kbd>Ctrl</kbd>+<kbd>Enter</kbd> to save' }),
      el("button", { class: "qn-btn", type: "button", onclick: discard }, "Discard"),
      el("button", { class: "qn-btn qn-primary", type: "button", onclick: save }, "Save")
    ]);

    // The same bar My Notes uses (built by js/richtext.js), so a note started
    // here can be formatted exactly like one written there — headings, code
    // blocks and checklists all survive the trip into the notebook.
    toolbarRef = IQB.richtext.toolbar({
      getEditor: function () { return editor; },
      onCommand: saveDraft,
      isActive: function () { return panel && !panel.hasAttribute("hidden"); }
    });

    const main = el("div", { class: "qn-main" }, [attachEl, titleRow, toolbarRef.el, surface, foot]);

    panel = el("div", {
      class: "qn-panel", id: "quicknote-panel", role: "dialog",
      "aria-label": "Quick note", hidden: ""
    }, [bar, main]);
    document.body.appendChild(panel);

    const handles = EDGES.map(function (dir) {
      const h = el("div", { class: "qn-edge qn-edge-" + dir, "aria-hidden": "true" });
      panel.appendChild(h);
      return { el: h, dir: dir };
    });

    editor = IQB.richtext.attach(surface, { onChange: saveDraft });
    surface.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); }
    });
    nameEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); editor.focus(); }
    });

    dragBy(bar, moveTo);
    handles.forEach(function (h) { resizeBy(h.el, h.dir); });
    applyBox(store.getQuickNoteBox());
  }

  function paintAttach() {
    if (!attachQ) { attachEl.setAttribute("hidden", ""); return; }
    attachEl.removeAttribute("hidden");
    attachEl.classList.toggle("is-on", attachOn);
    attachEl.setAttribute("aria-pressed", String(attachOn));
    attachTextEl.textContent = attachOn ? "Attach to: " + attachQ.title : "Save as a standalone note";
  }

  /* ========================================================
     Geometry
     ======================================================== */
  function applyBox(box) {
    if (isMobile()) return;                 // the sheet layout owns position
    const w = Math.max(MIN_W, Math.min((box && box.width) || 380, window.innerWidth - 16));
    const h = Math.max(MIN_H, Math.min((box && box.height) || 420, window.innerHeight - 16));
    panel.style.width = w + "px";
    panel.style.height = h + "px";
    // Default seat: clear of the tutor's launcher column on the right.
    const left = box && typeof box.left === "number" ? box.left : window.innerWidth - w - 88;
    const top = box && typeof box.top === "number" ? box.top : 96;
    moveTo(left, top);
  }

  /* Clamped so a window dragged to an edge — or left behind by a resized or
     rotated viewport — can never end up off screen with no way back. */
  function moveTo(left, top) {
    const w = panel.offsetWidth || 380;
    const h = panel.offsetHeight || 420;
    const x = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const y = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    panel.style.left = x + "px";
    panel.style.top = y + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  const rememberBox = debounce(function () {
    if (!panel || isMobile()) return;
    store.setQuickNoteBox({
      left: parseInt(panel.style.left, 10) || 0,
      top: parseInt(panel.style.top, 10) || 0,
      width: panel.offsetWidth,
      height: panel.offsetHeight
    });
  }, 250);

  /* Pointer events (not mouse) so a stylus or a touch-screen laptop drags too.
     Capture keeps the stream coming even when the pointer outruns the handle. */
  function dragBy(handle, onMove) {
    handle.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || isMobile()) return;
      if (e.target.closest(".qn-bar-btn")) return;     // buttons are not a handle

      const r = panel.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      // Capture keeps the stream coming when the pointer outruns the handle.
      // Guarded: a browser that refuses it should degrade, not kill the gesture.
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      startGesture("grabbing");

      function move(ev) { onMove(ev.clientX - dx, ev.clientY - dy); }
      function up() {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        endGesture();
        rememberBox();
      }
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  /* `dir` is any combination of n/s/e/w. Pulling a north or west edge has to
     move the panel as well as resize it, so the opposite edge stays put — that
     is the whole difference between a window resize and a stretch. */
  function resizeBy(handle, dir) {
    handle.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || isMobile()) return;
      e.preventDefault();
      e.stopPropagation();

      const r = panel.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY;
      // Capture keeps the stream coming when the pointer outruns the handle.
      // Guarded: a browser that refuses it should degrade, not kill the gesture.
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      startGesture(getComputedStyle(handle).cursor);

      function move(ev) {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        let left = r.left, top = r.top, w = r.width, h = r.height;

        if (dir.indexOf("e") !== -1) w = r.width + dx;
        if (dir.indexOf("s") !== -1) h = r.height + dy;
        if (dir.indexOf("w") !== -1) { w = r.width - dx; left = r.left + dx; }
        if (dir.indexOf("n") !== -1) { h = r.height - dy; top = r.top + dy; }

        // Below the minimum, the anchored edge is what must hold still, so a
        // west/north pull stops dead instead of dragging the panel along.
        if (w < MIN_W) { if (dir.indexOf("w") !== -1) left = r.right - MIN_W; w = MIN_W; }
        if (h < MIN_H) { if (dir.indexOf("n") !== -1) top = r.bottom - MIN_H; h = MIN_H; }

        // Never let a resize push the panel off screen.
        if (left < 8) { w += left - 8; left = 8; }
        if (top < 8) { h += top - 8; top = 8; }
        w = Math.min(w, window.innerWidth - left - 8);
        h = Math.min(h, window.innerHeight - top - 8);

        panel.style.left = left + "px";
        panel.style.top = top + "px";
        panel.style.width = Math.max(MIN_W, w) + "px";
        panel.style.height = Math.max(MIN_H, h) + "px";
      }
      function up() {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        endGesture();
        rememberBox();
      }
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  /* The cursor has to be forced onto every element for the duration, or it
     flickers back to a text caret the moment the pointer leaves the handle. */
  function startGesture(cursor) {
    document.documentElement.style.setProperty("--qn-cursor", cursor || "grabbing");
    document.documentElement.classList.add("qn-dragging");
  }
  function endGesture() {
    document.documentElement.classList.remove("qn-dragging");
    document.documentElement.style.removeProperty("--qn-cursor");
  }

  window.addEventListener("resize", function () {
    if (!panel || panel.hasAttribute("hidden") || isMobile()) return;
    moveTo(parseInt(panel.style.left, 10) || 0, parseInt(panel.style.top, 10) || 0);
  });

  /* ========================================================
     Open / close
     ======================================================== */
  function open() {
    if (!panel) build();
    if (!panel.hasAttribute("hidden")) { editor.focus(); return; }

    panel.classList.remove("is-collapsed");
    panel.removeAttribute("hidden");
    if (openBtn) openBtn.classList.add("is-active");
    applyBox(store.getQuickNoteBox());

    // Resolve the target question at open time, while the reader's position is
    // still what prompted them to hit the button.
    attachQ = currentQuestion();
    attachOn = !!attachQ;
    paintAttach();

    const draft = store.getQuickNoteDraft();
    nameEl.value = (draft && draft.title) || "";
    /* A resumed draft keeps whatever tag it was given — including none, which
       is why `tag` is read with a hasOwnProperty check rather than `||`.
       Otherwise the question's category would quietly reinstate a tag the
       reader had deliberately removed before closing the window. */
    if (draft && Object.prototype.hasOwnProperty.call(draft, "tag")) {
      selectedTag = draft.tag;
    } else {
      // Fresh capture: seed from the question's own category. This is the tag
      // the old build applied silently — now it is visible and changeable.
      selectedTag = attachQ && attachQ.category ? attachQ.category.toLowerCase() : null;
    }
    tagPickerRef.render();
    editor.setHTML((draft && draft.html) || "");
    editor.focus();
  }

  function close() {
    if (!panel || panel.hasAttribute("hidden")) return;
    // The pending debounced saveDraft() still fires after this — closing the
    // window does not cancel it, so the last keystrokes are never lost.
    if (tagPickerRef) tagPickerRef.close();   // else the dropdown outlives the panel
    panel.setAttribute("hidden", "");
    if (openBtn) { openBtn.classList.remove("is-active"); openBtn.focus(); }
  }

  function toggle() {
    if (panel && !panel.hasAttribute("hidden")) close(); else open();
  }

  function discard() {
    resetFields();
    store.clearQuickNoteDraft();
    markDraft(false);
    close();
  }

  function resetFields() {
    editor.setHTML("");
    nameEl.value = "";
    selectedTag = null;
    tagPickerRef.render();
  }

  /* ========================================================
     Save
     ======================================================== */
  async function save() {
    if (!editor || !nb()) return;
    const plain = editor.getPlain();
    if (!plain.trim()) { toast("Nothing to save"); editor.focus(); return; }

    const html = editor.getHTML();
    const title = nameEl.value.trim();
    await nb().ready;

    if (attachOn && attachQ) {
      const id = nb().qNoteId(attachQ.id);
      const existing = nb().byQuestion(attachQ.id);
      if (existing) {
        // Append, never replace. The reader came here to add a thought to the
        // question, and overwriting a note they wrote earlier in the card's
        // own Personal Note section would be silent data loss.
        await nb().update(existing.id, {
          html: (existing.html || "") + html,
          plain: ((existing.plain || "") + "\n" + plain).trim()
        });
        toast("Added to your note on this question");
      } else {
        await nb().create({
          id: id,
          questionId: attachQ.id,
          title: title || attachQ.title,
          html: html,
          plain: plain,
          tags: selectedTag ? [selectedTag] : []
        });
        toast("Note saved to this question");
      }
    } else {
      await nb().create({
        title: title || plain.trim().split("\n")[0].slice(0, 120),
        html: html,
        plain: plain,
        tags: selectedTag ? [selectedTag] : []
      });
      toast("Note saved to My Notes");
    }

    resetFields();
    store.clearQuickNoteDraft();
    markDraft(false);
    close();
  }

  /* ========================================================
     Wiring
     ======================================================== */
  function init() {
    openBtn = document.getElementById("quicknote-btn");
    if (openBtn) openBtn.addEventListener("click", toggle);

    // The tools-sheet twin (mobile). Closes the sheet on the way, or the
    // backdrop would sit on top of the panel it just opened.
    const mBtn = document.getElementById("quicknote-btn-m");
    if (mBtn) mBtn.addEventListener("click", function () {
      const close = document.getElementById("tools-close");
      if (close) close.click();
      open();
    });
    markDraft(!!store.getQuickNoteDraft());

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel && !panel.hasAttribute("hidden")) {
        e.preventDefault(); close(); return;
      }
      // "N" opens — but only when the reader is not typing into something.
      // Same guard shape the app uses for its other single-key shortcuts.
      if (e.key !== "n" && e.key !== "N") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      open();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  IQB.quicknote = { open: open, close: close, toggle: toggle };
})();

/* ============================================================
   Personal Notes — an optional, collapsible per-question note.

   Renders the "📝 Personal Note" section inside each question card (below the
   answer, next to "Study in depth"). Empty → an "Add Note" button; editing →
   a textarea with Save / Cancel; existing → the note text with Edit / Delete.

   Persistence is split in two, on purpose, so the feature is future-proof:

     • IQB.cloud  — the GENERIC per-question user-state layer (js/sync.js).
                    Notes live at users/{uid}/notes/{questionId}, one document
                    per question. A future Text Highlighting feature reuses the
                    exact same layer with feature name "highlights" — no schema
                    change and no refactor here.
     • IQB.storage — a local mirror (localStorage) so notes work signed-out and
                     offline; on sign-in the two are merged last-write-wins.

   The card is the owner of "when a question opens"; app.js calls
   IQB.notes.onCardOpen(questionId, card) to lazily load the note the first time
   a card is expanded (so we never fan out a Firestore read per rendered card).
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el, qs, toast } = IQB.utils;
  const store = IQB.storage;

  /* The subcollection / feature name. Future per-question features add their
     own constant and reuse IQB.cloud + a sibling module like this one. */
  const FEATURE = "notes";

  const cloud = function () { return window.IQB.cloud || null; }; // may be undefined if Firebase is unconfigured
  const signedIn = function () { const c = cloud(); return !!(c && c.isSignedIn()); };

  /* Registry of live sections by questionId so we can refresh them in place
     when auth state changes (sign-in merge, sign-out fallback). */
  const sections = new Map();

  /* ---- persistence (cloud-first when signed in, always mirror locally) ---- */

  // Resolve the best-known note for a question: cloud if signed in (falling
  // back to the local mirror when offline), else the local mirror.
  async function fetchNote(questionId) {
    if (signedIn()) {
      try {
        const remote = await cloud().load(FEATURE, questionId);
        if (remote && remote.text) {
          store.setNote(questionId, remote);       // keep the local mirror warm
          return { text: remote.text, updatedAt: remote.updatedAt || 0 };
        }
        // no cloud note → fall through to local (may be an unsynced draft)
      } catch (e) { /* offline → serve the local mirror */ }
    }
    return store.getNote(questionId);
  }

  async function saveNote(questionId, text) {
    const note = { text: text, updatedAt: Date.now() };
    store.setNote(questionId, note);                // local first (never lose a note)
    if (signedIn()) {
      try { await cloud().save(FEATURE, questionId, note); }
      catch (e) { console.warn("[notes] cloud save failed (kept locally):", e); }
    }
    return note;
  }

  async function deleteNote(questionId) {
    store.deleteNote(questionId);
    if (signedIn()) {
      try { await cloud().remove(FEATURE, questionId); }
      catch (e) { console.warn("[notes] cloud delete failed:", e); }
    }
  }

  /* ---- one-time merge when the user signs in ----
     Reconcile the local mirror with the cloud subcollection, last-write-wins by
     updatedAt, then refresh any open sections so the UI reflects the winner. */
  async function mergeOnSignIn() {
    if (!signedIn()) return;
    let remote = {};
    try { remote = await cloud().loadAll(FEATURE); }
    catch (e) { return; /* offline → leave local as-is, try again next sign-in */ }

    const local = store.getNotes();
    const ids = new Set(Object.keys(local).concat(Object.keys(remote)));

    for (const id of ids) {
      const l = store.getNote(id);                              // normalized {text,updatedAt}|null
      const r = remote[id] && remote[id].text
        ? { text: remote[id].text, updatedAt: remote[id].updatedAt || 0 } : null;

      if (l && (!r || l.updatedAt > r.updatedAt)) {
        try { await cloud().save(FEATURE, id, l); } catch (e) { /* keep local */ }
      } else if (r && (!l || r.updatedAt > l.updatedAt)) {
        store.setNote(id, r);
      }
    }
    sections.forEach(function (s) { s.reload(); });
  }

  // React to auth changes: merge up on sign-in; on sign-out just re-render open
  // sections against the local mirror.
  if (window.IQB.cloud) {
    IQB.cloud.onChange(function (user) {
      if (user) mergeOnSignIn();
      else sections.forEach(function (s) { s.reload(); });
    });
  }

  /* ========================================================
     UI — one collapsible section per card
     ======================================================== */
  function buildSection(questionId) {
    let note = null;         // { text, updatedAt } | null
    let loaded = false;      // has this section fetched at least once?
    let editing = false;

    const toggleBtn = el("button", {
      class: "qa-act pn-toggle", type: "button", "aria-expanded": "false",
      onclick: function (e) { e.stopPropagation(); toggleOpen(); }
    }, "📝 Personal Note");

    const body = el("div", { class: "pn-body", hidden: "" });

    const section = el("div", { class: "pn-section", "data-question-id": questionId }, [toggleBtn, body]);

    function isOpen() { return !body.hasAttribute("hidden"); }

    function toggleOpen() {
      if (isOpen()) {
        body.setAttribute("hidden", "");
        toggleBtn.setAttribute("aria-expanded", "false");
      } else {
        body.removeAttribute("hidden");
        toggleBtn.setAttribute("aria-expanded", "true");
        ensureLoaded(); // fetch on first expand if the card open didn't already
      }
    }

    // reflect "has a note" on the collapsed toggle without opening it
    function refreshIndicator() {
      const has = !!(note && note.text);
      toggleBtn.classList.toggle("has-note", has);
    }

    function renderEmpty() {
      body.innerHTML = "";
      body.appendChild(el("button", {
        class: "pn-add", type: "button",
        onclick: function () { startEdit(); }
      }, "Add Note"));
    }

    function renderView() {
      editing = false;
      body.innerHTML = "";
      body.appendChild(el("div", { class: "pn-text", text: note.text }));
      body.appendChild(el("div", { class: "pn-actions" }, [
        el("button", { class: "pn-btn", type: "button", onclick: function () { startEdit(); } }, "Edit"),
        el("button", { class: "pn-btn pn-danger", type: "button", onclick: function () { onDelete(); } }, "Delete")
      ]));
    }

    function startEdit() {
      editing = true;
      body.innerHTML = "";
      const ta = el("textarea", {
        class: "pn-input", rows: "4",
        placeholder: "Write a personal note for this question…",
        onkeydown: function (e) {
          // Ctrl/Cmd+Enter saves; Escape cancels
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onSave(ta.value); }
          else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
        }
      });
      ta.value = (note && note.text) || "";
      body.appendChild(ta);
      body.appendChild(el("div", { class: "pn-actions" }, [
        el("button", { class: "pn-btn pn-primary", type: "button", onclick: function () { onSave(ta.value); } }, "Save"),
        el("button", { class: "pn-btn", type: "button", onclick: function () { cancelEdit(); } }, "Cancel")
      ]));
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }

    function cancelEdit() {
      editing = false;
      (note && note.text) ? renderView() : renderEmpty();
    }

    async function onSave(value) {
      const text = (value || "").trim();
      if (!text) { onDelete(); return; }  // empty save == delete
      note = await saveNote(questionId, text);
      refreshIndicator();
      renderView();
      toast("Note saved");
    }

    async function onDelete() {
      await deleteNote(questionId);
      note = null;
      refreshIndicator();
      renderEmpty();
    }

    // render whatever state we currently hold (without refetching)
    function paint() {
      if (editing) return;             // don't clobber an in-progress edit
      (note && note.text) ? renderView() : renderEmpty();
      refreshIndicator();
    }

    // fetch the note once, then paint
    async function ensureLoaded() {
      if (loaded) { paint(); return; }
      loaded = true;
      note = await fetchNote(questionId);
      paint();
    }

    // re-fetch (used after auth changes); preserves an open editor
    async function reload() {
      if (editing) return;
      note = await fetchNote(questionId);
      refreshIndicator();
      if (isOpen()) paint();
    }

    // One section per questionId is live at a time; a re-render overwrites the
    // previous entry (the detached node is GC'd), keeping the registry bounded.
    const api = { el: section, ensureLoaded: ensureLoaded, reload: reload };
    sections.set(questionId, api);
    return api;
  }

  /* ========================================================
     Public API (used by app.js)
     ======================================================== */
  IQB.notes = {
    /* Build the notes section element for a question. Returns an HTMLElement to
       append inside the card body. */
    build: function (questionId) { return buildSection(questionId).el; },

    /* Called by the card when it opens — lazily loads the note the first time
       so an unopened card never triggers a Firestore read. */
    onCardOpen: function (questionId) {
      const s = sections.get(questionId);
      if (s) s.ensureLoaded();
    }
  };
})();

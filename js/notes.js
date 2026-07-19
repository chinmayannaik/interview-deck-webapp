/* ============================================================
   Personal Note — the per-question window onto My Notes.

   Renders the "Personal Note" section inside each question card. Since the
   notebook was unified this file owns NO storage of its own: a question's note
   is simply a notebook entry carrying that question's id, so anything written
   here shows up in the My Notes tab and vice versa.

   It uses the same rich-text editor as the notes tab (js/richtext.js). That is
   not just for consistency — a plain textarea here would flatten a note that
   was written with headings and code blocks in the notes tab, silently
   destroying formatting the moment the reader edited it from a card.

   Storage, sync and migration all live in js/notebook.js.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el, toast } = IQB.utils;

  const nb = function () { return window.IQB.notebook || null; };

  /* Live sections by questionId, so they can be refreshed in place when auth
     state changes (a sign-in merge can bring down a newer copy). */
  const sections = new Map();

  if (window.IQB.notebook) {
    IQB.notebook.onChange(function () {
      sections.forEach(function (s) { s.reload(); });
    });
  }

  /* ========================================================
     UI — one collapsible section per card
     ======================================================== */
  function buildSection(questionId) {
    let note = null;         // the notebook entry for this question, or null
    let loaded = false;
    let editing = false;
    let editor = null;

    const toggleBtn = el("button", {
      class: "qa-act pn-toggle", type: "button", "aria-expanded": "false",
      onclick: function (e) { e.stopPropagation(); toggleOpen(); }
    });
    toggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>Personal Note';

    const body = el("div", { class: "pn-body", hidden: "" });
    const section = el("div", { class: "pn-section", "data-question-id": questionId }, [toggleBtn, body]);

    /* Read the note aloud. Pinned top-right of the section, icon-only, to match
       the deep dive's speaker. Hidden until the note actually has content —
       there is nothing to read otherwise. Resolved on click, not captured, so
       it always reads the current text (the view is re-rendered on every save). */
    let speakBtn = null;
    if (window.IQB.speak && IQB.speak.supported) {
      speakBtn = IQB.speak.buildFor({
        cls: "pn-speak", title: "Read this note aloud",
        name: "Personal note",
        root: function () {
          return body.querySelector(".pn-text") || body.querySelector(".pn-input") || body;
        },
        scope: function () { return section; }
      });
      speakBtn.hidden = true;   // until refreshIndicator confirms there is a note
      section.appendChild(speakBtn);
    }

    function isOpen() { return !body.hasAttribute("hidden"); }

    function toggleOpen() {
      if (isOpen()) {
        closeEditor();
        body.setAttribute("hidden", "");
        toggleBtn.setAttribute("aria-expanded", "false");
        return;
      }
      body.removeAttribute("hidden");
      toggleBtn.setAttribute("aria-expanded", "true");
      ensureLoaded().then(function () {
        if (!note || !(note.plain || "").trim()) startEdit(); else renderView();
      });
    }

    function refreshIndicator() {
      const hasText = !!(note && (note.plain || "").trim());
      toggleBtn.classList.toggle("has-note", hasText);
      // nothing to read from an empty note — don't offer the control
      if (speakBtn) speakBtn.hidden = !hasText;
      section.classList.toggle("has-note", hasText);
    }

    /* Read-only render. Goes through the sanitiser on the way in — this HTML
       came back from Firestore, which is not a trusted source. */
    function renderView() {
      closeEditor();
      editing = false;
      body.innerHTML = "";
      const view = el("div", { class: "pn-text nb-body pn-rich" });
      view.innerHTML = IQB.richtext.sanitize(note.html || "");
      IQB.richtext.paintAll(view);
      body.appendChild(view);
      body.appendChild(el("div", { class: "pn-actions" }, [
        el("button", { class: "pn-btn", type: "button", onclick: startEdit }, "Edit"),
        el("button", { class: "pn-btn pn-danger", type: "button", onclick: onDelete }, "Delete"),
        el("button", {
          class: "pn-btn pn-open", type: "button",
          title: "Open in My Notes to add tags or Quick Revision",
          onclick: function () {
            if (IQB.app && IQB.app.setCategory) IQB.app.setCategory("notes", true);
            if (IQB.notebookUI) IQB.notebookUI.openForQuestion(questionId);
          }
        }, "Open in My Notes")
      ]));
    }

    function startEdit() {
      editing = true;
      closeEditor();
      body.innerHTML = "";

      const surface = el("div", { class: "pn-input nb-body pn-rich" });
      body.appendChild(surface);
      body.appendChild(el("div", { class: "pn-actions" }, [
        el("button", { class: "pn-btn pn-primary", type: "button", onclick: onSave }, "Save"),
        el("button", { class: "pn-btn", type: "button", onclick: cancelEdit }, "Cancel")
      ]));

      editor = IQB.richtext.attach(surface, { onChange: function () {} });
      editor.setHTML((note && note.html) || "");
      surface.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onSave(); }
        else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
      });
      editor.focus();
    }

    /* The editor registers a document-level selectionchange listener, so it has
       to be released whenever this section stops showing one. */
    function closeEditor() {
      if (editor && editor.destroy) editor.destroy();
      editor = null;
    }

    function cancelEdit() {
      editing = false;
      closeEditor();
      if (note && (note.plain || "").trim()) { renderView(); return; }
      body.innerHTML = "";
      body.setAttribute("hidden", "");
      toggleBtn.setAttribute("aria-expanded", "false");
    }

    async function onSave() {
      if (!editor || !nb()) return;
      const html = editor.getHTML();
      const plain = editor.getPlain();
      if (!plain.trim()) { await onDelete(); return; }   // empty save == delete

      if (note) {
        note = await nb().update(note.id, { html: html, plain: plain });
      } else {
        const q = findQuestion(questionId);
        note = await nb().create({
          id: nb().qNoteId(questionId),
          questionId: questionId,
          title: q && q.question ? String(q.question).slice(0, 120) : "Note on a question",
          html: html,
          plain: plain,
          tags: q && q.category ? [String(q.category).toLowerCase()] : []
        });
      }
      editing = false;
      refreshIndicator();
      renderView();
      toast("Note saved");
    }

    async function onDelete() {
      if (note && nb()) await nb().remove(note.id);
      note = null;
      editing = false;
      closeEditor();
      refreshIndicator();
      body.innerHTML = "";
      body.setAttribute("hidden", "");
      toggleBtn.setAttribute("aria-expanded", "false");
    }

    async function ensureLoaded() {
      if (loaded) return;
      loaded = true;
      if (nb()) { await nb().ready; note = nb().byQuestion(questionId); }
      refreshIndicator();
    }

    async function reload() {
      if (editing) return;             // never clobber an in-progress edit
      if (!nb()) return;
      note = nb().byQuestion(questionId);
      refreshIndicator();
      if (isOpen() && note && (note.plain || "").trim()) renderView();
    }

    const api = { el: section, ensureLoaded: ensureLoaded, reload: reload };
    sections.set(questionId, api);
    return api;
  }

  /* Locate a question in the loaded category data, for the note's title/tag.
     Absent data is tolerated — the questionId link is what actually matters. */
  function findQuestion(questionId) {
    const data = window.IQB.data || {};
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
      const list = data[keys[i]];
      if (!Array.isArray(list)) continue;
      const hit = list.find(function (q) { return q && q.id === questionId; });
      if (hit) return Object.assign({ category: keys[i] }, hit);
    }
    return null;
  }

  /* ========================================================
     Public API (unchanged — js/app.js calls these)
     ======================================================== */
  IQB.notes = {
    build: function (questionId) { return buildSection(questionId).el; },
    onCardOpen: function (questionId) {
      const s = sections.get(questionId);
      if (s) s.ensureLoaded();
    }
  };
})();

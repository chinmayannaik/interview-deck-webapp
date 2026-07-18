/* ============================================================
   My Notes — the view.

   A two-pane workspace that swaps into the content column the same way the
   Playground does (see body.nb-mode in css/notebook.css): the list on the left,
   one note's editor on the right. On narrow screens the two become pages, with
   the editor sliding over the list.

   Everything here is presentation over IQB.notebook (js/notebook.js), which
   owns storage, sync and migration; and IQB.richtext (js/richtext.js), which
   owns the contenteditable behaviour. This file deliberately holds no
   persistence logic of its own.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el, qs, toast } = IQB.utils;


  let rootEl = null, listEl = null, editorEl = null, searchEl = null, tagBarEl = null;
  let editor = null;                 // the richtext instance
  let titleEl = null, tagsEl = null, metaEl = null;
  let currentId = null;
  let built = false;
  let syncToolbarFn = null;   // the live selectionchange listener, so it can be removed
  let selectedTag = null;     // the single tag on the note currently open
  let saveStateEl = null, saveBtnEl = null;
  /* Whether the open note has unsaved edits. Without this, switching notes
     wrote the one being left even when untouched — which bumped its updatedAt,
     and since the list sorts by updatedAt, simply LOOKING at a note promoted it
     to the top and reshuffled the list under the reader's cursor. */
  let dirty = false;
  /* A draft is an editor with no note behind it yet: currentId stays null
     until the first successful save, so abandoning it leaves nothing behind. */
  let draftQuestionId = null;
  let tagMenuEl = null;       // the open tag dropdown, if any
  let renamingTag = null;     // tag being renamed inline in the dropdown

  /* Tags ARE the organisation here: the list is always grouped by tag, so there
     is no grouping toggle and no second axis to filter on. */
  /* One tag filter at a time: picking a second replaces the first, because a
     note only ever has one tag and an AND of two could never match anything. */
  const NO_TAG = Symbol("no-tag");  // sentinel for the "No tags" filter chip
  const state = {
    query: "",
    tag: null            // active tag filter, NO_TAG, or null for everything
  };

  const ICON = {
    plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    search: svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
    star: svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
    trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
    back: svg('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'),
    group: svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
    note: svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/>'),
    link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
    pencil: svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/>', 13),
    bin: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>', 13)
  };
  function bigNote() { return ICON.note.replace('width="15" height="15"', 'width="26" height="26"'); }
  function svg(inner, size) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (size || 15) + '" height="' + (size || 15) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0">' + inner + "</svg>";
  }

  /* ---------- toolbar spec ----------
     `cmd` entries go straight to execCommand — deprecated, but universally
     supported and the only thing that keeps native undo working. The rest are
     custom because execCommand has no equivalent (see js/richtext.js). */
  const TOOLS = [
    { cmd: "bold", label: "B", title: "Bold (Ctrl+B)", cls: "nb-t-b" },
    { cmd: "italic", label: "I", title: "Italic (Ctrl+I)", cls: "nb-t-i" },
    { cmd: "underline", label: "U", title: "Underline (Ctrl+U)", cls: "nb-t-u" },
    { cmd: "strikeThrough", label: "S", title: "Strikethrough", cls: "nb-t-s" },
    { sep: true },
    { cmd: "formatBlock", arg: "h2", label: "H1", title: "Heading" },
    { cmd: "formatBlock", arg: "h3", label: "H2", title: "Subheading" },
    { sep: true },
    { cmd: "insertUnorderedList", label: "•", title: "Bullet list" },
    { cmd: "insertOrderedList", label: "1.", title: "Numbered list" },
    { act: "check", label: "☑", title: "Checklist" },
    { sep: true },
    { act: "code", label: "&lt;/&gt;", title: "Code block (Ctrl+E)" },
    { cmd: "formatBlock", arg: "blockquote", label: "❝", title: "Quote" },
    { act: "link", label: "🔗", title: "Add link", html: ICON.link },
    { sep: true },
    { cmd: "removeFormat", label: "⌫", title: "Clear formatting" }
  ];

  /* ========================================================
     BUILD
     ======================================================== */
  function build() {
    if (built) return rootEl;
    built = true;

    rootEl = el("section", { class: "nb", id: "notebook", hidden: "" });

    /* ---- left: list pane ---- */
    const newBtn = el("button", { class: "nb-new", type: "button", onclick: onNew });
    newBtn.innerHTML = ICON.plus + "<span>New note</span>";

    searchEl = el("input", {
      class: "nb-search-input", type: "search", placeholder: "Search notes…",
      "aria-label": "Search notes",
      oninput: function (e) { state.query = e.target.value; renderList(); }
    });
    const searchWrap = el("div", { class: "nb-search" }, [searchEl]);
    searchWrap.insertAdjacentHTML("afterbegin", ICON.search);

    tagBarEl = el("div", { class: "nb-tagbar" });
    listEl = el("div", { class: "nb-list" });

    const listPane = el("div", { class: "nb-pane nb-pane-list" }, [
      el("div", { class: "nb-pane-head" }, [
        el("h2", { class: "nb-title", text: "My Notes" }),
        newBtn
      ]),
      searchWrap,
      tagBarEl,
      listEl
    ]);

    /* ---- right: editor pane ---- */
    editorEl = el("div", { class: "nb-pane nb-pane-editor" });
    rootEl.appendChild(listPane);
    rootEl.appendChild(buildSplitter());
    rootEl.appendChild(editorEl);

    renderEmptyEditor();
    IQB.notebook.onChange(function () { renderList(); refreshTagBar(); });
    IQB.notebook.ready.then(function () { renderList(); refreshTagBar(); });

    return rootEl;
  }

  /* ---------- draggable divider ----------
     The list/editor balance depends on what the reader is doing — skimming
     titles or writing — so let them set it. Stored per device (it is a viewport
     preference, not content) and clamped so neither pane can be dragged out of
     existence. */
  const SPLIT_KEY = "iqb:nbSplit";
  const MIN_LIST = 220, MIN_EDITOR = 360;

  function loadSplit() {
    try {
      const v = parseFloat(localStorage.getItem(SPLIT_KEY));
      return v > 0 ? v : 0;
    } catch (e) { return 0; }
  }
  function saveSplit(px) {
    try { localStorage.setItem(SPLIT_KEY, String(Math.round(px))); } catch (e) { /* ignore */ }
  }

  function applySplit(px) {
    if (!rootEl || !px) return 0;
    // clientWidth, not getBoundingClientRect: the latter includes the panel's
    // own borders, which are outside the grid's track space.
    const total = rootEl.clientWidth;
    // Below the responsive breakpoint the panes stack, so a stored width is
    // meaningless — leave the CSS default alone.
    if (total < 700) return 0;
    // The divider sits between the panes and eats width too — ignoring it let
    // the editor be squeezed a few px under its stated minimum.
    const bar = rootEl.querySelector(".nb-split");
    const gutter = bar ? bar.getBoundingClientRect().width : 0;
    const max = Math.max(MIN_LIST, total - MIN_EDITOR - gutter);
    const w = Math.max(MIN_LIST, Math.min(px, max));
    rootEl.style.setProperty("--nb-list-w", w + "px");
    return w;
  }

  function currentSplit() {
    const v = parseFloat(getComputedStyle(rootEl).getPropertyValue("--nb-list-w"));
    if (v) return v;
    const pane = rootEl.querySelector(".nb-pane-list");
    return pane ? pane.getBoundingClientRect().width : 0;
  }

  function buildSplitter() {
    const bar = el("div", {
      class: "nb-split", role: "separator", "aria-orientation": "vertical",
      tabindex: "0", "aria-label": "Resize the note list", title: "Drag to resize"
    });

    let dragging = false;
    bar.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      dragging = true;
      try { bar.setPointerCapture(e.pointerId); } catch (_) {}
      document.body.classList.add("nb-splitting");
    });
    bar.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      applySplit(e.clientX - rootEl.getBoundingClientRect().left);
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      try { bar.releasePointerCapture(e.pointerId); } catch (_) {}
      document.body.classList.remove("nb-splitting");
      const w = currentSplit();
      if (w) saveSplit(w);
    }
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);

    // A divider nobody can reach without a mouse is not a control.
    bar.addEventListener("keydown", function (e) {
      const step = e.shiftKey ? 40 : 12;
      let next;
      if (e.key === "ArrowLeft") next = currentSplit() - step;
      else if (e.key === "ArrowRight") next = currentSplit() + step;
      else return;
      e.preventDefault();
      const applied = applySplit(next);
      if (applied) saveSplit(applied);
    });

    return bar;
  }

  // Re-clamp on window resize so a wide split can't push the editor off screen.
  window.addEventListener("resize", function () {
    if (!rootEl || rootEl.hidden) return;
    const cur = parseFloat(getComputedStyle(rootEl).getPropertyValue("--nb-list-w"));
    if (cur) applySplit(cur);
  });

  /* ========================================================
     LIST
     ======================================================== */
  function matches(n) {
    if (state.tag === NO_TAG) { if (n.tags.length) return false; }
    else if (state.tag && n.tags[0] !== state.tag) return false;
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    return (n.title + " " + n.plain + " " + n.tags.join(" ")).toLowerCase().indexOf(q) !== -1;
  }

  function refreshTagBar() {
    if (!tagBarEl) return;
    const all = IQB.notebook.tags();
    const untagged = IQB.notebook.all().filter(function (n) { return !n.tags.length; }).length;
    tagBarEl.innerHTML = "";
    if (!all.length && !untagged) { tagBarEl.hidden = true; return; }
    tagBarEl.hidden = false;

    function chip(label, key, count) {
      const on = state.tag === key;
      return el("button", {
        class: "nb-tag" + (on ? " on" : "") + (key === NO_TAG ? " nb-tag-none" : ""),
        type: "button", "aria-pressed": String(on),
        onclick: function () {
          // Single-select: clicking the active chip clears the filter.
          state.tag = on ? null : key;
          refreshTagBar();
          renderList();
        }
      }, [
        document.createTextNode(label),
        el("span", { class: "nb-tag-n", text: String(count) })
      ]);
    }

    all.forEach(function (t) { tagBarEl.appendChild(chip(t.tag, t.tag, t.count)); });
    // Untagged notes get a chip of their own, so "show me what I haven't filed
    // yet" is one click rather than scrolling to the bottom group.
    if (untagged) tagBarEl.appendChild(chip("No tags", NO_TAG, untagged));
  }

  /* One note carries at most one tag, so it lands in exactly one group — no
     duplicates across headings, and "No tags" is a real bucket rather than a
     place notes disappear to. */
  function renderList() {
    if (!listEl) return;
    const notes = IQB.notebook.all().filter(matches);
    listEl.innerHTML = "";

    if (!notes.length) {
      listEl.appendChild(emptyList());
      return;
    }

    const byTag = new Map();
    const untagged = [];
    notes.forEach(function (n) {
      const tag = n.tags[0];
      if (!tag) { untagged.push(n); return; }
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(n);
    });

    Array.from(byTag.keys()).sort().forEach(function (tag) {
      listEl.appendChild(groupHead(tag, byTag.get(tag).length));
      byTag.get(tag).forEach(function (n) { listEl.appendChild(noteRow(n)); });
    });
    if (untagged.length) {
      listEl.appendChild(groupHead("No tags", untagged.length));
      untagged.forEach(function (n) { listEl.appendChild(noteRow(n)); });
    }
  }

  function groupHead(tag, n) {
    return el("div", { class: "nb-group" }, [
      el("span", { class: "nb-group-name", text: tag }),
      el("span", { class: "nb-group-n", text: String(n) })
    ]);
  }

  function emptyList() {
    const any = IQB.notebook.all().length;
    const wrap = el("div", { class: "nb-empty" });
    wrap.innerHTML =
      '<div class="nb-empty-ic">' + bigNote() + "</div>" +
      "<p class='nb-empty-t'>" + (any ? "No notes match" : "No notes yet") + "</p>" +
      "<p class='nb-empty-s'>" +
        (any
          ? "Try a different search, or clear the filters."
          : "Capture a solution, a gotcha, or anything you want to revise later.") +
      "</p>";
    if (!any) {
      wrap.appendChild(el("button", { class: "nb-new", type: "button", onclick: onNew }, "Create your first note"));
    }
    return wrap;
  }

  function noteRow(n) {
    /* A wrapper, not a bare button: the card and its delete control are two
       separate controls, and a button cannot legally contain another. */
    const wrap = el("div", { class: "nb-rowwrap" });

    const row = el("button", {
      class: "nb-row" + (n.id === currentId ? " active" : ""), type: "button",
      onclick: function () { openNote(n.id); }
    });
    const head = el("div", { class: "nb-row-head" }, [
      el("span", { class: "nb-row-title", text: n.title || "Untitled note" })
    ]);
    row.appendChild(head);

    const preview = (n.plain || "").replace(/\s+/g, " ").trim().slice(0, 110);
    if (preview) row.appendChild(el("div", { class: "nb-row-preview", text: preview }));

    const foot = el("div", { class: "nb-row-foot" });
    if (n.tags[0]) foot.appendChild(el("span", { class: "nb-row-tag", text: n.tags[0] }));
    if (n.questionId) {
      const q = el("span", { class: "nb-row-tag nb-row-linked", title: "Linked to a question" });
      q.innerHTML = ICON.link;
      foot.appendChild(q);
    }
    foot.appendChild(el("span", { class: "nb-row-when", text: when(n.updatedAt) }));
    row.appendChild(foot);

    const del = el("button", {
      class: "nb-rowdel", type: "button", title: "Delete note",
      "aria-label": "Delete " + (n.title || "this note"),
      onclick: async function (e) {
        e.stopPropagation();          // must not also open the note
        const name = n.title ? '"' + n.title + '"' : "this note";
        if (!window.confirm("Delete " + name + "? This cannot be undone.")) return;
        // Deleting the note that is currently open has to clear the editor too,
        // or it would keep editing a record that no longer exists.
        if (n.id === currentId) { dirty = false; renderEmptyEditor(); }
        await IQB.notebook.remove(n.id);
        renderList();
        refreshTagBar();
        toast("Note deleted");
      }
    });
    del.innerHTML = ICON.trash;

    wrap.appendChild(row);
    wrap.appendChild(del);
    return wrap;
  }

  function when(ts) {
    if (!ts) return "";
    const d = Date.now() - ts;
    if (d < 60e3) return "just now";
    if (d < 3600e3) return Math.floor(d / 60e3) + "m ago";
    if (d < 86400e3) return Math.floor(d / 3600e3) + "h ago";
    if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + "d ago";
    return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  /* ========================================================
     EDITOR
     ======================================================== */
  /* Both the richtext instance and the toolbar listener are document-level, so
     they have to be released explicitly — otherwise every note you open leaves
     another listener behind holding a detached editor. */
  function teardownEditor() {
    closeTagMenu();
    saveBtnEl = null; saveStateEl = null;
    if (editor && editor.destroy) editor.destroy();
    if (syncToolbarFn) document.removeEventListener("selectionchange", syncToolbarFn);
    syncToolbarFn = null;
    editor = null;
  }

  function renderEmptyEditor() {
    teardownEditor();
    currentId = null;
    dirty = false;
    editorEl.innerHTML =
      '<div class="nb-empty nb-empty-editor">' +
        '<div class="nb-empty-ic">' + bigNote() + "</div>" +
        "<p class='nb-empty-t'>Nothing open</p>" +
        "<p class='nb-empty-s'>Pick a note on the left, or start a new one.</p>" +
      "</div>";
    editor = null;
  }

  /* Opens an empty editor WITHOUT creating anything. The note is created by
     the first save, so clicking "New note" and walking away leaves no trace. */
  function onNew() {
    if (!confirmDiscard()) return;
    currentId = null;
    draftQuestionId = null;
    buildEditor({ title: "", html: "", tags: [] });
    renderList();
    document.body.classList.add("nb-editing");
    if (titleEl) titleEl.focus();
  }

  function openNote(id) {
    if (!confirmDiscard()) return;     // leaving would throw away unsaved edits
    const n = IQB.notebook.get(id);
    if (!n) { renderEmptyEditor(); renderList(); return; }
    currentId = id;
    buildEditor(n);
    renderList();
    document.body.classList.add("nb-editing");   // mobile: slide the editor over
  }

  function buildEditor(n) {
    teardownEditor();
    editorEl.innerHTML = "";

    const back = el("button", { class: "nb-back", type: "button", title: "Back to list",
      onclick: function () {
        if (!confirmDiscard()) return;
        document.body.classList.remove("nb-editing");
      } });
    back.innerHTML = ICON.back;

    titleEl = el("input", {
      class: "nb-title-input", type: "text", placeholder: "Note title",
      "aria-label": "Note title", oninput: markDirty
    });
    titleEl.value = n.title || "";

    const delBtn = el("button", {
      class: "nb-icon-btn nb-danger", type: "button", title: "Delete note",
      onclick: onDelete
    });
    delBtn.innerHTML = ICON.trash;

    /* A note carries at most ONE tag, and it sits beside the title because the
       tag is what decides where the note lives in the list — it belongs with
       the note's identity, not in a separate metadata strip below it.
       A note stored with several tags (an early migration could produce that)
       shows its first; changing it replaces the set. */
    selectedTag = (n.tags && n.tags[0]) || null;
    tagsEl = el("div", { class: "nb-tags" });
    renderTagField();

    // Autosave is invisible by design, so the state has to be legible:
    // "Saved" / "Saving…" / "Unsaved changes".
    saveStateEl = el("span", { class: "nb-savestate", "aria-live": "polite" });

    const head = el("div", { class: "nb-ed-head" }, [back, titleEl, tagsEl, saveStateEl, delBtn]);

    /* Toolbar */
    const bar = el("div", { class: "nb-toolbar", role: "toolbar", "aria-label": "Formatting" });
    TOOLS.forEach(function (t) {
      if (t.sep) { bar.appendChild(el("span", { class: "nb-t-sep" })); return; }
      const b = el("button", {
        class: "nb-t" + (t.cls ? " " + t.cls : ""), type: "button", title: t.title,
        "aria-label": t.title,
        // mousedown, not click: the caret must not leave the editor before the
        // command runs, or execCommand has no selection to act on.
        onmousedown: function (e) {
          e.preventDefault();
          if (!editor) return;
          if (t.cmd) editor.exec(t.cmd, t.arg);
          else if (t.act === "code") editor.toggleCode();
          else if (t.act === "check") editor.toggleChecklist();
          else if (t.act === "link") addLink();
          markDirty();
          syncToolbar();
        }
      });
      b.innerHTML = t.html || t.label;
      bar.appendChild(b);
    });

    // Language picker — only meaningful while the caret sits in a code block.
    const langSel = el("select", {
      class: "nb-lang", "aria-label": "Code language", hidden: "",
      onchange: function (e) { if (editor) editor.setLang(e.target.value); markDirty(); }
    });
    IQB.highlight.LANGS.forEach(function (l) {
      langSel.appendChild(el("option", { value: l.id, text: l.label }));
    });
    bar.appendChild(langSel);

    const body = el("div", { class: "nb-body", id: "nb-body" });
    metaEl = el("div", { class: "nb-meta" });

    saveBtnEl = el("button", {
      class: "nb-savebtn", type: "button",
      onclick: function () { saveNow(true); }
    }, "Save");
    const foot = el("div", { class: "nb-foot" }, [metaEl, saveBtnEl]);

    editorEl.appendChild(head);
    editorEl.appendChild(bar);
    editorEl.appendChild(body);
    editorEl.appendChild(foot);

    editor = IQB.richtext.attach(body, { onChange: markDirty });
    editor.setHTML(n.html || "");
    paintMeta(n);
    dirty = false;
    setSaveState("saved");   // setHTML fires no change; nothing is dirty yet

    syncToolbarFn = syncToolbar;
    document.addEventListener("selectionchange", syncToolbar);
    function syncToolbar() {
      if (!editor || !body.isConnected) return;
      const inCode = editor.inCode();
      langSel.hidden = !inCode;
      if (inCode) langSel.value = editor.currentLang() || "auto";
      ["bold", "italic", "underline", "strikeThrough"].forEach(function (c, i) {
        const btn = bar.children[i];
        try { btn.classList.toggle("on", document.queryCommandState(c)); } catch (e) { /* ignore */ }
      });
    }
  }

  /* ---------- tag picker ----------
     The note's tags as removable chips, plus an "Add tag" button that opens a
     dropdown of every tag the app knows about. Typing in the dropdown filters
     the list and, if nothing matches, offers to create the tag — so picking an
     existing tag and inventing a new one are the same gesture, and the reader
     can't accidentally fork "leetcode" and "LeetCode" by retyping it. */
  function renderTagField() {
    if (!tagsEl) return;
    let field = tagsEl.querySelector(".nb-tagfield");
    if (!field) {
      field = el("div", { class: "nb-tagfield" });
      tagsEl.insertBefore(field, tagsEl.firstChild);
    }
    field.innerHTML = "";

    if (selectedTag) {
      const chip = el("span", { class: "nb-tagchip" }, [document.createTextNode(selectedTag)]);
      chip.appendChild(el("button", {
        class: "nb-tagchip-x", type: "button", "aria-label": "Remove tag " + selectedTag,
        onclick: function (e) {
          e.stopPropagation();
          selectedTag = null;
          renderTagField();
          markDirty();
        }
      }, "×"));
      // Clicking the chip itself re-opens the picker, so swapping the tag is
      // one click rather than remove-then-add.
      chip.addEventListener("click", function (e) { e.stopPropagation(); toggleTagMenu(); });
      field.appendChild(chip);
      return;
    }

    field.appendChild(el("button", {
      class: "nb-tagadd", type: "button", "aria-haspopup": "listbox",
      onclick: function (e) { e.stopPropagation(); toggleTagMenu(); }
    }, "+ Tag"));
  }

  function closeTagMenu() {
    renamingTag = null;
    if (tagMenuEl) { tagMenuEl.remove(); tagMenuEl = null; }
    document.removeEventListener("click", closeTagMenu);
  }

  function toggleTagMenu() {
    if (tagMenuEl) { closeTagMenu(); return; }

    tagMenuEl = el("div", { class: "nb-tagmenu", role: "listbox" });
    const filter = el("input", {
      class: "nb-tagmenu-input", type: "text", placeholder: "Find or create a tag…",
      "aria-label": "Find or create a tag",
      oninput: function () { paintOptions(filter.value); },
      onkeydown: function (e) {
        if (e.key === "Escape") { e.preventDefault(); closeTagMenu(); }
        if (e.key === "Enter") {
          e.preventDefault();
          const typed = filter.value.trim().toLowerCase();
          if (!typed) return;
          const first = tagMenuEl.querySelector(".nb-tagopt");
          if (first && first.dataset.tag && first.dataset.tag === typed) pick(typed);
          else create(typed);
        }
      }
    });
    const list = el("div", { class: "nb-tagmenu-list" });
    tagMenuEl.appendChild(filter);
    tagMenuEl.appendChild(list);
    tagsEl.appendChild(tagMenuEl);

    /* Single-select: picking a tag replaces whatever was there, picking the
       current one clears it. */
    async function pick(tag) {
      selectedTag = selectedTag === tag ? null : tag;
      renderTagField();
      markDirty();
      closeTagMenu();
    }

    async function create(name) {
      const t = String(name).trim().toLowerCase();
      if (!t) return;
      await IQB.notebook.addTag(t);
      selectedTag = t;
      renderTagField();
      refreshTagBar();
      markDirty();
      closeTagMenu();
      toast('Tag "' + t + '" created');
    }

    /* Renames the tag everywhere: the vocabulary and every note carrying it
       (IQB.notebook.renameTag does both). The open note's chip follows. */
    async function commitRename(from, to) {
      const target = String(to || "").trim().toLowerCase();
      renamingTag = null;
      if (!target || target === from) { paintOptions(filter.value); return; }
      const clash = IQB.notebook.tags().some(function (t) { return t.tag === target; });
      if (clash && !window.confirm('"' + target + '" already exists. Merge "' + from + '" into it?')) {
        paintOptions(filter.value);
        return;
      }
      await IQB.notebook.renameTag(from, target);
      if (selectedTag === from) { selectedTag = target; renderTagField(); }
      refreshTagBar();
      renderList();
      paintOptions(filter.value);
      toast(clash ? "Tags merged" : 'Renamed to "' + target + '"');
    }

    /* Deleting a tag detaches it from every note that carries it — the notes
       survive, they just become untagged. Say how many, because "8 notes" is
       the difference between a harmless tidy-up and a regret. */
    async function destroy(tag, count) {
      const msg = count
        ? 'Delete the tag "' + tag + '"? It will be removed from ' + count +
          " note" + (count === 1 ? "" : "s") + ", but the notes themselves are kept."
        : 'Delete the tag "' + tag + '"?';
      if (!window.confirm(msg)) return;
      await IQB.notebook.removeTag(tag);
      if (selectedTag === tag) { selectedTag = null; renderTagField(); }
      if (state.tag === tag) state.tag = null;
      refreshTagBar();
      renderList();
      paintOptions(filter.value);
      toast("Tag deleted");
    }

    function paintOptions(q) {
      const query = String(q || "").trim().toLowerCase();
      const known = IQB.notebook.tags();
      const shown = known.filter(function (t) { return !query || t.tag.indexOf(query) !== -1; });
      list.innerHTML = "";

      shown.forEach(function (t) {
        const on = selectedTag === t.tag;

        // Inline rename: the name cell becomes an input in place, so the reader
        // can see the other tags while retyping this one.
        if (renamingTag === t.tag) {
          const inp = el("input", {
            class: "nb-tagrename", type: "text", value: t.tag, "aria-label": "Rename tag",
            onkeydown: function (e) {
              e.stopPropagation();
              // `done` stops the blur that follows Enter/Escape from committing
              // a second time — the first commit already re-rendered the row.
              if (e.key === "Enter") { e.preventDefault(); inp.dataset.done = "1"; commitRename(t.tag, inp.value); }
              if (e.key === "Escape") {
                e.preventDefault(); inp.dataset.done = "1";
                renamingTag = null; paintOptions(filter.value);
              }
            },
            onblur: function () {
              if (inp.dataset.done === "1") return;
              commitRename(t.tag, inp.value);
            }
          });
          const row = el("div", { class: "nb-tagrow nb-tagrow-editing" }, [inp]);
          list.appendChild(row);
          setTimeout(function () { inp.focus(); inp.select(); }, 0);
          return;
        }

        /* A row, not a single button: the pick target and the two actions are
           separate controls, and nesting buttons inside a button is invalid. */
        const pickBtn = el("button", {
          class: "nb-tagopt" + (on ? " on" : ""), type: "button", role: "option",
          "aria-selected": String(on), dataset: { tag: t.tag },
          onclick: function (e) { e.stopPropagation(); pick(t.tag); }
        }, [
          el("span", { class: "nb-tagopt-box" }),
          el("span", { class: "nb-tagopt-name", text: t.tag }),
          el("span", { class: "nb-tagopt-n", text: String(t.count) })
        ]);

        const editBtn = el("button", {
          class: "nb-tagact", type: "button", title: "Rename tag",
          "aria-label": "Rename tag " + t.tag,
          onclick: function (e) { e.stopPropagation(); renamingTag = t.tag; paintOptions(filter.value); }
        });
        editBtn.innerHTML = ICON.pencil;

        const delBtn = el("button", {
          class: "nb-tagact nb-tagact-danger", type: "button", title: "Delete tag",
          "aria-label": "Delete tag " + t.tag,
          onclick: function (e) { e.stopPropagation(); destroy(t.tag, t.count); }
        });
        delBtn.innerHTML = ICON.bin;

        list.appendChild(el("div", { class: "nb-tagrow" }, [pickBtn, editBtn, delBtn]));
      });

      // Offer creation only when the typed text isn't already a tag.
      const exact = known.some(function (t) { return t.tag === query; });
      if (query && !exact) {
        list.appendChild(el("button", {
          class: "nb-tagopt nb-tagnew", type: "button",
          onclick: function (e) { e.stopPropagation(); create(query); }
        }, 'Create "' + query + '"'));
      }
      if (!shown.length && !query) {
        list.appendChild(el("div", { class: "nb-tagmenu-empty", text: "No tags yet — type to create one." }));
      }
    }

    paintOptions("");
    tagMenuEl.addEventListener("click", function (e) { e.stopPropagation(); });
    // Any click outside dismisses; registered async so this very click doesn't.
    setTimeout(function () { document.addEventListener("click", closeTagMenu); }, 0);
    filter.focus();
  }

  function addLink() {
    const url = window.prompt("Link URL");
    if (!url) return;
    // sanitize() refuses anything that isn't http(s)/mailto, so a bad scheme is
    // dropped on save; rejecting it here just gives faster feedback.
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) { toast("Links must start with http:// or https://"); return; }
    editor.exec("createLink", url.trim());
  }

  function paintMeta(n) {
    if (!metaEl) return;
    // A draft has no updatedAt because it does not exist yet — say so plainly
    // rather than rendering "Updated " with nothing after it.
    const bits = [n.updatedAt ? "Updated " + when(n.updatedAt) : "Not saved yet"];
    if (n.questionId || draftQuestionId) bits.push("linked to a question");
    metaEl.textContent = bits.join(" · ");
  }

  /* ---------- saving ---------- */
  function setSaveState(kind) {
    if (saveStateEl) {
      saveStateEl.className = "nb-savestate nb-save-" + kind;
      saveStateEl.textContent =
        kind === "saving" ? "Saving…" : kind === "dirty" ? "Unsaved changes" : "Saved";
    }
    // Nothing to save once everything is written — an always-active Save button
    // invites a click that does nothing.
    if (saveBtnEl) {
      const idle = kind !== "dirty";
      saveBtnEl.disabled = idle;
      saveBtnEl.textContent = kind === "saving" ? "Saving…" : idle ? "Saved" : "Save";
    }
  }

  /* Marks the note as changed. Nothing is written until the reader presses
     Save — there is no autosave, so this only drives the indicator. */
  function markDirty() {
    dirty = true;
    setSaveState("dirty");
  }

  /* `announce` is set only by the explicit Save button — autosave should never
     interrupt with a toast. */
  /* The only thing that writes. `announce` is set by the Save button so an
     explicit save can confirm itself. */
  async function saveNow(announce) {
    if (!editor || !titleEl) return;

    const title = titleEl.value.trim();
    const plain = editor.getPlain().trim();
    const isEmpty = !title && !plain;

    // A brand-new note with nothing in it never becomes a note. Creating an
    // empty record just to have it clutter the list (and sync) is worse than
    // doing nothing.
    if (!currentId && isEmpty) {
      if (announce) toast("Nothing to save yet");
      return;
    }
    if (!dirty) { setSaveState("saved"); if (announce) toast("Already saved"); return; }

    setSaveState("saving");
    const fields = {
      title: title,
      html: editor.getHTML(),
      plain: editor.getPlain(),
      tags: selectedTag ? [selectedTag] : []
    };

    let saved;
    if (currentId) {
      saved = await IQB.notebook.update(currentId, fields);
    } else {
      // First save of a draft — this is where the note actually comes into
      // existence, id and all.
      if (draftQuestionId) {
        fields.id = IQB.notebook.qNoteId(draftQuestionId);
        fields.questionId = draftQuestionId;
      }
      saved = await IQB.notebook.create(fields);
      currentId = saved.id;
      draftQuestionId = null;
    }

    dirty = false;
    setSaveState("saved");
    if (saved) { paintMeta(saved); renderList(); refreshTagBar(); }
    if (announce) toast("Note saved");
  }

  /* Guards a navigation that would throw away unsaved work. Returns false when
     the reader chooses to stay put. */
  function confirmDiscard() {
    if (!dirty) return true;
    const ok = window.confirm("This note has unsaved changes. Discard them?");
    if (ok) { dirty = false; setSaveState("saved"); }
    return ok;
  }

  async function onDelete() {
    if (!currentId) {                  // an unsaved draft — just close it
      dirty = false;
      renderEmptyEditor();
      document.body.classList.remove("nb-editing");
      return;
    }
    const n = IQB.notebook.get(currentId);
    if (!n) return;
    const name = n.title ? '"' + n.title + '"' : "this note";
    if (!window.confirm("Delete " + name + "? This cannot be undone.")) return;
    await IQB.notebook.remove(currentId);
    renderEmptyEditor();
    renderList();
    refreshTagBar();
    document.body.classList.remove("nb-editing");
    toast("Note deleted");
  }

  /* ========================================================
     Public API (used by js/app.js)
     ======================================================== */
  IQB.notebookUI = {
    build: build,
    onShow: function () {
      // Not in build(): the panel is not in the document yet there, so its
      // width is 0 and the stored split would be thrown away.
      applySplit(loadSplit());
      renderList();
      refreshTagBar();
    },
    /* The pane is hidden, not destroyed, so an unsaved edit is still sitting
       there when the reader comes back. Saving for them would be a write they
       did not ask for. */
    onHide: function () {},
    /* Opens (creating if needed) the note attached to a question — the "open in
       My Notes" path from a question card. */
    openForQuestion: function (questionId, seedTitle) {
      const existing = IQB.notebook.byQuestion(questionId);
      if (existing) { openNote(existing.id); return; }
      // No note yet — open a draft bound to this question. It only becomes a
      // real note if the reader actually writes something and saves.
      if (!confirmDiscard()) return;
      currentId = null;
      draftQuestionId = questionId;
      buildEditor({ title: seedTitle || "", html: "", tags: [] });
      renderList();
      document.body.classList.add("nb-editing");
      if (titleEl) titleEl.focus();
    }
  };

  /* With no autosave, a refresh would silently bin unsaved work — so let the
     browser do what it is for and warn. */
  window.addEventListener("beforeunload", function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
})();

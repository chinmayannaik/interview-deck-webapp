/* ============================================================
   Rich-text engine for My Notes.

   Two halves:
     1. sanitize(html) — an allowlist rewriter. EVERYTHING that reaches the
        store or the screen goes through it: on paste, on save, and again on
        load. Notes sync through Firestore, so a note read back from the cloud
        is treated as untrusted input exactly like a paste is.
     2. attach(el)   — the contenteditable behaviours execCommand can't do:
        code blocks, checklists, paste cleanup, and Enter inside <pre>.

   CODE BLOCKS — the reason this file exists rather than a one-liner over
   execCommand. Highlighting a block while the caret is inside it destroys the
   caret on every keystroke, which is the classic contenteditable trap. So a
   block is PLAIN TEXT while focused and re-highlighted on blur. The highlight
   spans are purely presentational: sanitize() unwraps <span>, so what gets
   stored is always the raw code, and the colouring is regenerated on load.
   That makes the two states self-healing rather than something to keep in sync.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};

  /* ---------- allowlist ----------
     Kept deliberately small. Anything not named here is either unwrapped (its
     text survives, its markup does not) or dropped entirely. No `style`
     attribute at all — pasted styling is the main source of notes that look
     broken in the other theme. */
  const KEEP = {
    p: [], br: [], h2: [], h3: [], h4: [],
    strong: [], em: [], u: [], s: [],
    ul: ["class"], ol: [], li: ["data-checked"],
    blockquote: [], pre: ["data-lang"], code: [],
    a: ["href", "target", "rel"],
    table: [], thead: [], tbody: [], tr: [], th: [], td: []
  };

  /* Dropped with their contents — there is no version of these worth keeping
     in a note, and several are script vectors. */
  const DROP = new Set([
    "script", "style", "iframe", "object", "embed", "link", "meta", "noscript",
    "svg", "math", "form", "input", "textarea", "button", "select", "option",
    "img", "video", "audio", "canvas", "source", "track"
  ]);

  /* Normalised to their semantic equivalents so the stored markup has one
     spelling for each concept. */
  const RENAME = { b: "strong", i: "em", strike: "s", del: "s", ins: "u", h1: "h2", h5: "h4", h6: "h4" };

  function safeHref(v) {
    const s = String(v || "").trim();
    // Anything that isn't plainly http(s)/mailto is refused — javascript: and
    // data: URIs are the whole reason this check exists.
    return /^(https?:\/\/|mailto:)/i.test(s) ? s : null;
  }

  function sanitize(html) {
    const doc = document.implementation.createHTMLDocument("s");
    doc.body.innerHTML = String(html == null ? "" : html);
    normalizeTutor(doc);
    walk(doc.body, doc);
    stitchOrderedLists(doc.body);
    return doc.body.innerHTML;
  }

  /* Markdown from the AI Helper turns "1. … / - sub-bullet / 2. … / - sub-bullet"
     into a SEPARATE <ol> per numbered item (each broken off by the bullets
     between them). Every <ol> then restarts at 1, so a saved note reads
     "1. / 1. / 1." instead of "1. / 2. / 3.". Here we stitch such a run back
     into one list: following <ul> sub-bullets nest into the item they belong to,
     and following <ol> items append — giving correct numbering in every view.
     Runs separated by a paragraph or heading are left alone (genuinely distinct
     lists). Applied on every sanitize, so existing notes heal on next render. */
  function stitchOrderedLists(body) {
    var ols = Array.prototype.slice.call(body.querySelectorAll("ol"));
    ols.forEach(function (ol) {
      if (!ol.parentNode) return;              // already absorbed by an earlier run
      var cursor = ol.nextElementSibling;
      while (cursor && (cursor.tagName === "UL" || cursor.tagName === "OL")) {
        var next = cursor.nextElementSibling;
        if (cursor.tagName === "UL") {
          var lastLi = ol.querySelector(":scope > li:last-child");
          if (!lastLi) break;
          lastLi.appendChild(cursor);          // sub-bullets belong to this item
        } else {                                // a broken-off continuation of the list
          while (cursor.firstElementChild) ol.appendChild(cursor.firstElementChild);
          cursor.remove();
        }
        cursor = next;
      }
    });
  }

  /* A paste from the AI Helper carries its chrome: each code block is a
     .tutor-code wrapper whose header holds the language label and a Copy
     button. Generic unwrapping would keep the label's TEXT ("java", "Copy")
     as stray words above the code. So before the walk, known tutor markup is
     rewritten to what the note actually wants: a bare <pre data-lang="…">,
     with the language carried over so highlighting survives the trip. */
  function normalizeTutor(doc) {
    doc.body.querySelectorAll(".tutor-code").forEach(function (wrap) {
      const pre = wrap.querySelector("pre");
      if (!pre) { wrap.remove(); return; }
      const langEl = wrap.querySelector(".tutor-code-lang");
      const label = langEl ? langEl.textContent.trim().toLowerCase() : "";
      const known = (IQB.highlight && IQB.highlight.LANGS || [])
        .some(function (l) { return l.id === label; });
      pre.setAttribute("data-lang", known ? label : "auto");
      wrap.replaceWith(pre);
    });
    // Any straggler copy buttons (a hand-made selection can catch one).
    doc.body.querySelectorAll(".tutor-copy").forEach(function (b) { b.remove(); });
  }

  function walk(root, doc) {
    // Snapshot first: the loop rewrites the tree it is walking.
    const kids = Array.prototype.slice.call(root.childNodes);
    kids.forEach(function (node) {
      if (node.nodeType === 3) return;                    // text — always fine
      if (node.nodeType !== 1) { node.remove(); return; }  // comments etc.

      let tag = node.tagName.toLowerCase();
      if (DROP.has(tag)) { node.remove(); return; }

      if (RENAME[tag]) {
        const swap = doc.createElement(RENAME[tag]);
        while (node.firstChild) swap.appendChild(node.firstChild);
        node.replaceWith(swap);
        node = swap;
        tag = RENAME[tag];
      }

      if (!Object.prototype.hasOwnProperty.call(KEEP, tag)) {
        // Unknown container (div, span, font, section…): keep the words, drop
        // the wrapper. This is what strips highlight spans back to raw code.
        walk(node, doc);
        const frag = doc.createDocumentFragment();
        while (node.firstChild) frag.appendChild(node.firstChild);
        node.replaceWith(frag);
        return;
      }

      const allowed = KEEP[tag];
      Array.prototype.slice.call(node.attributes).forEach(function (attr) {
        const name = attr.name.toLowerCase();
        if (allowed.indexOf(name) === -1) { node.removeAttribute(attr.name); return; }
        if (name === "href") {
          const href = safeHref(attr.value);
          if (!href) node.removeAttribute("href");
          else {
            node.setAttribute("href", href);
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
          }
        }
        if (name === "class") {
          // The only class that carries meaning is the checklist marker.
          if (node.classList.contains("nb-check")) node.setAttribute("class", "nb-check");
          else node.removeAttribute("class");
        }
        if (name === "data-checked") {
          node.setAttribute("data-checked", attr.value === "true" ? "true" : "false");
        }
      });

      walk(node, doc);
    });
  }

  /* Plain-text projection, used for search and for note previews. Block-level
     elements become line breaks so words from adjacent blocks don't run
     together and produce false search hits. */
  function toPlain(html) {
    const doc = document.implementation.createHTMLDocument("p");
    doc.body.innerHTML = sanitize(html);
    doc.body.querySelectorAll("p,h2,h3,h4,li,tr,pre,blockquote").forEach(function (b) {
      b.appendChild(doc.createTextNode("\n"));
    });
    return (doc.body.textContent || "").replace(/\n{2,}/g, "\n").trim();
  }

  /* ---------- code-block highlighting (presentational only) ---------- */
  function paintBlock(pre) {
    if (!pre || pre.dataset.painted === "1") return;
    const code = pre.querySelector("code") || pre;
    const lang = pre.getAttribute("data-lang") || "auto";
    const raw = code.textContent;
    code.innerHTML = IQB.highlight.code(raw, lang === "auto" ? "" : lang);
    pre.dataset.painted = "1";
  }

  function stripBlock(pre) {
    if (!pre) return;
    const code = pre.querySelector("code") || pre;
    code.textContent = code.textContent; // collapse spans back to raw text
    pre.dataset.painted = "";
  }

  function paintAll(root) {
    root.querySelectorAll("pre").forEach(paintBlock);
  }

  /* ---------- selection helpers ---------- */
  function currentBlock(el, selector) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let n = sel.getRangeAt(0).startContainer;
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n !== el) {
      if (n.matches && n.matches(selector)) return n;
      n = n.parentNode;
    }
    return null;
  }

  function placeCaret(node, atEnd) {
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(!atEnd);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  /* ---------- editor ---------- */
  function attach(el, opts) {
    opts = opts || {};
    const onChange = opts.onChange || function () {};
    let painting = false;

    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "true");

    function changed() { if (!painting) onChange(); }

    /* Paste: take the HTML flavour, strip it to the allowlist, and insert.
       Without this, a paste from an editor or a docs page brings a wall of
       inline styles and nested spans that fight the theme. Shift bypasses to
       plain text. */
    el.addEventListener("paste", function (e) {
      e.preventDefault();
      const dt = e.clipboardData;
      if (!dt) return;
      const asPlain = e.shiftKey;
      const html = asPlain ? "" : dt.getData("text/html");
      const text = dt.getData("text/plain");

      // Inside a code block a paste is always literal text — pasted markup
      // would otherwise become real elements inside the <pre>.
      if (currentBlock(el, "pre")) {
        document.execCommand("insertText", false, text);
        changed();
        return;
      }
      if (html) {
        document.execCommand("insertHTML", false, sanitize(html));
      } else {
        document.execCommand("insertText", false, text);
      }
      changed();
    });

    el.addEventListener("keydown", function (e) {
      const pre = currentBlock(el, "pre");

      if (pre) {
        // Enter inside a code block is a newline, not a new paragraph.
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          document.execCommand("insertText", false, "\n");
          changed();
          return;
        }
        // Tab indents rather than escaping to the next focusable element.
        if (e.key === "Tab") {
          e.preventDefault();
          document.execCommand("insertText", false, "  ");
          changed();
          return;
        }
        // A way out of a block that is the last thing in the note.
        if ((e.key === "ArrowDown" || e.key === "Enter") && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          const p = document.createElement("p");
          p.innerHTML = "<br>";
          pre.after(p);
          placeCaret(p, false);
          changed();
          return;
        }
      }

      // Ctrl/Cmd+E toggles a code block — matches the shortcut most editors use.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        toggleCode();
      }
    });

    /* Highlight-on-blur, per block. focusin/focusout bubble (unlike focus), so
       one listener covers every code block including ones added later. */
    el.addEventListener("focusin", function () {
      const pre = currentBlock(el, "pre");
      if (pre) { painting = true; stripBlock(pre); painting = false; }
    });

    /* selectionchange only fires on document, so this listener is global and
       MUST be removable — the notes UI re-attaches an editor on every note
       open, and without destroy() each one would leave a live listener holding
       a detached editor behind. */
    function onSelectionChange() {
      if (!el.isConnected) return;
      if (!el.contains(document.activeElement) && document.activeElement !== el) return;
      const active = currentBlock(el, "pre");
      painting = true;
      el.querySelectorAll("pre").forEach(function (pre) {
        if (pre === active) stripBlock(pre);
        else paintBlock(pre);
      });
      painting = false;
    }
    document.addEventListener("selectionchange", onSelectionChange);
    el.addEventListener("focusout", function () {
      painting = true;
      paintAll(el);
      painting = false;
    });

    /* Checklist ticking. The box is a ::before pseudo-element, so there is no
       nested editable node to fight — a click in the left gutter toggles. */
    el.addEventListener("click", function (e) {
      const li = e.target.closest && e.target.closest("li");
      if (!li || !li.parentElement || !li.parentElement.classList.contains("nb-check")) return;
      if (e.offsetX > 22) return; // only the checkbox gutter, not the text
      li.setAttribute("data-checked", li.getAttribute("data-checked") === "true" ? "false" : "true");
      changed();
    });

    el.addEventListener("input", changed);

    /* ---------- commands ---------- */
    function exec(cmd, val) {
      el.focus();
      document.execCommand(cmd, false, val || null);
      changed();
    }

    function toggleCode() {
      el.focus();
      const pre = currentBlock(el, "pre");
      if (pre) {
        // Unwrap back to a paragraph, keeping the code as text.
        const p = document.createElement("p");
        p.textContent = (pre.querySelector("code") || pre).textContent;
        pre.replaceWith(p);
        placeCaret(p, true);
      } else {
        const sel = window.getSelection();
        const text = sel && sel.rangeCount ? sel.toString() : "";
        const block = document.createElement("pre");
        block.setAttribute("data-lang", "auto");
        const code = document.createElement("code");
        code.textContent = text || "";
        block.appendChild(code);
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0);
          r.deleteContents();
          r.insertNode(block);
        } else {
          el.appendChild(block);
        }
        placeCaret(code, true);
      }
      changed();
    }

    function toggleChecklist() {
      el.focus();
      const li = currentBlock(el, "li");
      if (li && li.parentElement.classList.contains("nb-check")) {
        li.parentElement.classList.remove("nb-check");
        li.parentElement.querySelectorAll("li").forEach(function (x) { x.removeAttribute("data-checked"); });
      } else if (li) {
        li.parentElement.classList.add("nb-check");
        li.parentElement.querySelectorAll("li").forEach(function (x) { x.setAttribute("data-checked", "false"); });
      } else {
        document.execCommand("insertUnorderedList");
        const made = currentBlock(el, "li");
        if (made && made.parentElement) {
          made.parentElement.classList.add("nb-check");
          made.setAttribute("data-checked", "false");
        }
      }
      changed();
    }

    function setLang(lang) {
      const pre = currentBlock(el, "pre");
      if (!pre) return;
      pre.setAttribute("data-lang", lang);
      painting = true; stripBlock(pre); paintBlock(pre); painting = false;
      changed();
    }

    function setHTML(html) {
      painting = true;
      el.innerHTML = sanitize(html || "");
      if (!el.innerHTML.trim()) el.innerHTML = "<p><br></p>";
      paintAll(el);
      painting = false;
    }

    /* Always re-sanitised on the way out: what the DOM holds includes the
       presentational highlight spans, and those must never be stored. */
    function getHTML() { return sanitize(el.innerHTML); }

    return {
      el: el,
      exec: exec,
      toggleCode: toggleCode,
      toggleChecklist: toggleChecklist,
      setLang: setLang,
      currentLang: function () {
        const pre = currentBlock(el, "pre");
        return pre ? pre.getAttribute("data-lang") || "auto" : null;
      },
      inCode: function () { return !!currentBlock(el, "pre"); },
      setHTML: setHTML,
      getHTML: getHTML,
      getPlain: function () { return toPlain(el.innerHTML); },
      focus: function () { el.focus(); },
      destroy: function () { document.removeEventListener("selectionchange", onSelectionChange); }
    };
  }

  /* ========================================================
     Formatting toolbar

     Lives here rather than in js/notebook-ui.js because there is now more than
     one editing surface (My Notes and the Quick Note window) and a toolbar that
     was defined next to one of them would drift from the other: a button added
     for the notebook would silently be missing from quick capture.

     Emits the same `nb-*` class names it always did, so css/notebook.css styles
     every instance without change.
     ======================================================== */

  /* `cmd` entries go straight to execCommand — deprecated, but universally
     supported and the only thing that keeps native undo working. The rest are
     custom because execCommand has no equivalent. */
  /* the commands whose buttons light up when the caret sits inside them */
  const STATE_CMDS = ["bold", "italic", "underline", "strikeThrough"];

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
    {
      act: "link", title: "Add link",
      label: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
    },
    { sep: true },
    { cmd: "removeFormat", label: "⌫", title: "Clear formatting" }
  ];

  /* createLink acts on the live selection, and window.prompt() was the only
     dialog that left it alone — focusing our own input collapses the caret into
     that input and the command would have nothing to wrap. So the range is
     cloned before the dialog opens and put back before the command runs. */
  async function addLink(editor) {
    const sel = window.getSelection();
    const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;

    const url = await IQB.ui.prompt({
      title: "Add link",
      message: "Paste the address this text should point to.",
      placeholder: "https://example.com",
      confirmLabel: "Add link",
      // sanitize() drops anything that isn't http(s)/mailto on the way into
      // storage; validating here just says so before the note is written.
      validate: function (v) {
        const t = String(v || "").trim();
        if (!t) return "Enter a URL.";
        if (!/^(https?:\/\/|mailto:)/i.test(t)) return "Links must start with http://, https:// or mailto:";
        return null;
      }
    });
    if (url === null) return;                 // cancelled

    editor.focus();
    if (saved && sel) { sel.removeAllRanges(); sel.addRange(saved); }
    editor.exec("createLink", url.trim());
  }

  /* opts.getEditor  — () => editor|null. A getter, not the editor itself: the
                       notebook swaps editors as the reader moves between notes.
     opts.onCommand  — called after any command runs (mark dirty, autosave, …).
     opts.isActive   — () => bool. Skip selection syncing while closed.

     Returns { el, sync, destroy }. destroy() is not optional — sync is bound to
     a document-level selectionchange listener, so a toolbar that is dropped
     without it keeps a detached editor alive. */
  function toolbar(opts) {
    opts = opts || {};
    const getEditor = opts.getEditor || function () { return null; };
    const onCommand = opts.onCommand || function () {};
    const isActive = opts.isActive || function () { return true; };

    const bar = document.createElement("div");
    bar.className = "nb-toolbar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Formatting");

    const cmdButtons = [];   // index-aligned with the first four TOOLS entries

    TOOLS.forEach(function (t) {
      if (t.sep) {
        const s = document.createElement("span");
        s.className = "nb-t-sep";
        bar.appendChild(s);
        return;
      }
      const b = document.createElement("button");
      b.className = "nb-t" + (t.cls ? " " + t.cls : "");
      b.type = "button";
      b.title = t.title;
      b.setAttribute("aria-label", t.title);
      b.innerHTML = t.label;
      // mousedown, not click: the caret must not leave the editor before the
      // command runs, or execCommand has no selection to act on.
      b.addEventListener("mousedown", function (e) {
        e.preventDefault();
        const editor = getEditor();
        if (!editor) return;
        // The link flow is async (it opens a dialog), so its dirty-marking and
        // toolbar sync have to wait for the command to actually land.
        if (t.act === "link") {
          addLink(editor).then(function () { onCommand(); sync(); });
          return;
        }
        if (t.cmd) editor.exec(t.cmd, t.arg);
        else if (t.act === "code") editor.toggleCode();
        else if (t.act === "check") editor.toggleChecklist();
        onCommand();
        sync();
      });
      bar.appendChild(b);
      if (t.cmd && STATE_CMDS.indexOf(t.cmd) !== -1) cmdButtons.push({ cmd: t.cmd, btn: b });
    });

    // Language picker — only meaningful while the caret sits in a code block.
    const langSel = document.createElement("select");
    langSel.className = "nb-lang";
    langSel.setAttribute("aria-label", "Code language");
    langSel.hidden = true;
    if (IQB.highlight && IQB.highlight.LANGS) {
      IQB.highlight.LANGS.forEach(function (l) {
        const o = document.createElement("option");
        o.value = l.id; o.textContent = l.label;
        langSel.appendChild(o);
      });
    }
    langSel.addEventListener("change", function (e) {
      const editor = getEditor();
      if (!editor) return;
      editor.setLang(e.target.value);
      onCommand();
    });
    bar.appendChild(langSel);

    function sync() {
      // selectionchange is document-wide and fires for every drag over the page,
      // including while this toolbar is closed. isActive lets an owner that keeps
      // its editor in the DOM (the Quick Note window hides rather than destroys)
      // opt out instead of recomputing command state nobody can see.
      if (!isActive()) return;
      const editor = getEditor();
      if (!editor || !editor.el.isConnected) return;
      const inCode = editor.inCode();
      langSel.hidden = !inCode;
      if (inCode) langSel.value = editor.currentLang() || "auto";
      cmdButtons.forEach(function (c) {
        try { c.btn.classList.toggle("on", document.queryCommandState(c.cmd)); }
        catch (e) { /* ignore */ }
      });
    }

    document.addEventListener("selectionchange", sync);

    return {
      el: bar,
      sync: sync,
      destroy: function () { document.removeEventListener("selectionchange", sync); }
    };
  }

  IQB.richtext = {
    sanitize: sanitize, toPlain: toPlain, attach: attach,
    paintAll: paintAll, toolbar: toolbar
  };
})();

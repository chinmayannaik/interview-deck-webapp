/* ============================================================
   JS Playground — a full-height scratch editor that runs the user's own code.

   Everything runs client-side in a Web Worker built from a Blob URL: no
   backend, no CDN, no new dependency, and it works offline exactly like the
   rest of the PWA.

   A Worker — not eval(), not an iframe — is the whole point. On a practice
   site `while (true) {}` is a matter of when, not if, and terminate() is the
   only reliable way to kill a runaway loop. A worker also has no DOM, so code
   that spins can't lock the page while we wait to kill it.

   The editor is a transparent <textarea> layered over a highlighted <pre>,
   scroll-synced, with a line-number gutter — the same trick CodeJar uses. It
   keeps the native caret, native undo, native IME and native accessibility for
   the price of a ~90 line tokenizer, where CodeMirror would cost ~200KB and
   Monaco several MB. Highlighting is One Dark, fixed in both app themes: an
   editor theme is a thing in its own right, not a tint of the page.

   Scope is deliberately v1: plain JS. No modules, no npm, no DOM.
   stdin is emulated — see readline() below.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el, qs, qsa, toast, debounce } = IQB.utils;
  const store = IQB.storage;

  /* Long enough for any interview answer, short enough that a hung loop feels
     like a mistake rather than a broken app. */
  const TIMEOUT_MS = 2000;
  const MAX_LINES = 500; // a log flood shouldn't take the page down with it

  const STARTER = [
    "// JavaScript Playground — runs in your browser, nothing is uploaded.",
    "// Ctrl/Cmd + Enter to run.",
    "",
    "function greet(name) {",
    "  return `Hello, ${name}!`;",
    "}",
    "",
    "console.log(greet(\"World\"));",
    "",
    "const numbers = [1, 2, 3, 4, 5];",
    "console.log(\"Squared:\", numbers.map((x) => x ** 2));",
    "",
    "// Anything typed in the Input tab is readable line by line:",
    "// const name = readline();",
    ""
  ].join("\n");

  /* ============================================================
     TOKENIZER
     ============================================================ */
  const KEYWORD = /^(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|delete|void|throw|try|catch|finally|async|await|yield|import|export|from|as|default|static|get|set|with|debugger)$/;
  const LITERAL = /^(?:true|false|null|undefined|NaN|Infinity)$/;
  const BUILTIN = /^(?:console|Math|JSON|Object|Array|String|Number|Boolean|Promise|Map|Set|WeakMap|WeakSet|Symbol|Date|RegExp|Error|TypeError|RangeError|SyntaxError|parseInt|parseFloat|isNaN|isFinite|setTimeout|clearTimeout|setInterval|clearInterval|globalThis|readline|readLine|input)$/;

  /* Regex literals are deliberately absent: telling `/re/` from division needs
     real parser state, and guessing wrong miscolours the rest of the file. */
  const TOKEN_RE = new RegExp([
    "(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)",
    "(`(?:\\\\[\\s\\S]|[^\\\\`])*`|\"(?:\\\\[\\s\\S]|[^\\\\\"\\n])*\"|'(?:\\\\[\\s\\S]|[^\\\\'\\n])*')",
    "(\\b0[xXbBoO][0-9a-fA-F_]+n?\\b|\\b\\d[\\d_]*(?:\\.[\\d_]*)?(?:[eE][+-]?\\d+)?n?\\b)",
    "([A-Za-z_$][\\w$]*)"
  ].join("|"), "g");

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  const esc = (s) => s.replace(/[&<>]/g, (c) => ESC[c]);
  const span = (cls, text) => '<span class="t-' + cls + '">' + esc(text) + "</span>";

  function highlight(src) {
    let out = "", last = 0, m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(src)) !== null) {
      out += esc(src.slice(last, m.index));
      const text = m[0];
      if (m[1]) out += span("c", text);
      else if (m[2]) out += span("s", text);
      else if (m[3]) out += span("n", text);
      else {
        const id = m[4];
        if (KEYWORD.test(id)) out += span("k", text);
        else if (LITERAL.test(id)) out += span("l", text);
        else if (BUILTIN.test(id)) out += span("b", text);
        else if (/^\s*\(/.test(src.slice(m.index + text.length))) out += span("f", text);
        else if (/^[A-Z]/.test(id)) out += span("y", text);
        else out += esc(text); // plain identifiers keep the default foreground
      }
      last = m.index + text.length;
    }
    out += esc(src.slice(last));
    return out + "\n"; // <pre> eats a trailing newline; keep the last line tall
  }

  /* ============================================================
     SANDBOX
     Written as a function so it stays readable and lintable in place; it is
     stringified into a Blob below and never called in this scope.
     ============================================================ */
  function workerBody() {
    var pending = 0;                       // user timers still owed a callback
    var nativeSetTimeout = self.setTimeout;

    /* Node-ish formatting, because `console.log("Squared:", [1, 4, 9])` reading
       as "Squared: 1,4,9" is exactly the confusion a playground exists to
       remove. */
    function fmt(v, depth, seen) {
      var t = typeof v;
      if (v === null) return "null";
      if (t === "undefined") return "undefined";
      if (t === "string") return depth ? JSON.stringify(v) : v;
      if (t === "number" || t === "boolean") return String(v);
      if (t === "bigint") return String(v) + "n";
      if (t === "symbol") return v.toString();
      if (t === "function") return "[Function: " + (v.name || "anonymous") + "]";
      if (v instanceof Error) return v.stack || v.name + ": " + v.message;
      if (v instanceof RegExp || v instanceof Date) return String(v);
      if (seen.indexOf(v) !== -1) return "[Circular]";
      if (depth > 4) return Array.isArray(v) ? "[Array]" : "[Object]";

      var next = seen.concat([v]);
      var body;
      if (Array.isArray(v)) {
        if (!v.length) return "[]";
        body = v.map(function (x) { return fmt(x, depth + 1, next); });
        return "[ " + body.join(", ") + " ]";
      }
      if (typeof Map !== "undefined" && v instanceof Map) {
        if (!v.size) return "Map(0) {}";
        body = [];
        v.forEach(function (val, k) { body.push(fmt(k, depth + 1, next) + " => " + fmt(val, depth + 1, next)); });
        return "Map(" + v.size + ") { " + body.join(", ") + " }";
      }
      if (typeof Set !== "undefined" && v instanceof Set) {
        if (!v.size) return "Set(0) {}";
        body = [];
        v.forEach(function (val) { body.push(fmt(val, depth + 1, next)); });
        return "Set(" + v.size + ") { " + body.join(", ") + " }";
      }
      var keys = Object.keys(v);
      if (!keys.length) return "{}";
      body = keys.map(function (k) { return k + ": " + fmt(v[k], depth + 1, next); });
      return "{ " + body.join(", ") + " }";
    }

    function emit(level, args) {
      var parts = [];
      for (var i = 0; i < args.length; i++) parts.push(fmt(args[i], 0, []));
      self.postMessage({ type: "log", level: level, text: parts.join(" ") });
    }

    /* A thrown/unhandled error, as opposed to the user simply calling
       console.error — which is ordinary output and must not fail the run. */
    function fatal(err) {
      self.postMessage({ type: "log", level: "error", fatal: true, text: fmt(err, 0, []) });
    }

    self.console = {
      log: function () { emit("log", arguments); },
      info: function () { emit("info", arguments); },
      debug: function () { emit("log", arguments); },
      dir: function () { emit("log", arguments); },
      table: function () { emit("log", arguments); },
      trace: function () { emit("log", arguments); },
      group: function () { emit("log", arguments); },
      groupEnd: function () {},
      warn: function () { emit("warn", arguments); },
      error: function () { emit("error", arguments); },
      time: function () {},
      timeEnd: function () {},
      assert: function () {}
    };

    /* Count outstanding user timers. Without this we'd report "done" while
       `fetchData().then(console.log)` and every setTimeout callback were still
       queued, and their output would never be printed. */
    self.setTimeout = function (fn, ms) {
      var rest = Array.prototype.slice.call(arguments, 2);
      pending++;
      return nativeSetTimeout(function () {
        try { if (typeof fn === "function") fn.apply(null, rest); }
        catch (err) { fatal(err); }
        finally { pending--; }
      }, ms);
    };

    /* Async failures would otherwise die silently inside the worker. */
    self.onerror = function (msg) { fatal(msg); };
    self.onunhandledrejection = function (e) { fatal(e.reason); };

    /* Poll until the microtask queue and every pending timer have drained, then
       report. A single macrotask hop is already enough to flush promises. The
       parent's hard timeout is what stops setInterval and infinite loops — this
       only has to handle code that genuinely finishes. */
    function settle() {
      nativeSetTimeout(function () {
        if (pending > 0) return settle();
        self.postMessage({ type: "done" });
      }, 0);
    }

    self.onmessage = function (e) {
      /* stdin is emulated: there is no process.stdin in a worker, so the Input
         pane is handed over as a string and readline() walks it. Synchronous,
         which is what interview-style "read N then N lines" code expects. */
      var stdin = e.data.stdin || "";
      var lines = stdin.length ? stdin.replace(/\n$/, "").split("\n") : [];
      var cursor = 0;

      self.input = stdin;
      self.readline = function () { return cursor < lines.length ? lines[cursor++] : ""; };
      self.readLine = self.readline;
      self.prompt = self.readline;

      try {
        (0, eval)(e.data.code); // indirect eval → runs in the worker's global scope
      } catch (err) {
        fatal(err);
        self.postMessage({ type: "done", failed: true });
        return;
      }
      settle();
    };
  }

  const WORKER_SRC = "(" + workerBody.toString() + ")();";

  /* ============================================================
     STATE
     ============================================================ */
  let root = null, editor = null, hlEl = null, gutterEl = null, layersEl = null;
  let outEl = null, stdinEl = null, statusEl = null, runBtn = null, gridEl = null;
  let worker = null, workerUrl = null, timer = null, startedAt = 0;
  let running = false, lines = 0, failed = false;

  /* ---------- output ---------- */
  function clearOut() { outEl.innerHTML = ""; lines = 0; failed = false; }
  function print(level, text) {
    if (lines >= MAX_LINES) return;
    lines++;
    if (lines === MAX_LINES) {
      outEl.appendChild(el("div", { class: "pg-line warn", text: "… output truncated at " + MAX_LINES + " lines" }));
      return;
    }
    outEl.appendChild(el("div", { class: "pg-line " + level, text: text }));
  }
  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "pg-status" + (kind ? " " + kind : "");
  }
  /* The tab buttons are keyed on data-tab and the panels on data-panel, on
     purpose: a single shared attribute means the "hide the other panel" query
     also matches the other tab's button and hides the control itself. */
  function showPanel(name) {
    qsa(".pg-tab", root).forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    qsa(".pg-panel", root).forEach((p) => { p.hidden = p.dataset.panel !== name; });
  }

  /* ============================================================
     RUN / STOP
     ============================================================ */
  function teardown() {
    if (worker) { worker.terminate(); worker = null; }
    if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl = null; }
    if (timer) { clearTimeout(timer); timer = null; }
    running = false;
    root.classList.remove("running");
    runBtn.innerHTML = playIcon + "Run";
  }
  function finish(text, kind) { teardown(); setStatus(text, kind); }
  function stop() {
    if (!running) return;
    print("warn", "Stopped.");
    finish("Stopped", "warn");
  }

  function run() {
    if (running) { stop(); return; }

    const code = editor.value;
    store.setPlaygroundCode(code);
    store.setPlaygroundInput(stdinEl.value);
    clearOut();
    showPanel("output");

    try {
      workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      worker = new Worker(workerUrl);
    } catch (err) {
      print("error", "Couldn't start the sandbox: " + err.message);
      finish("Failed", "err");
      return;
    }

    running = true;
    startedAt = performance.now();
    root.classList.add("running");
    runBtn.innerHTML = stopIcon + "Stop";
    setStatus("Running…", "");

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "log") {
        if (msg.fatal) failed = true;
        print(msg.level, msg.text);
        return;
      }
      if (msg.type === "done") {
        const ms = Math.round(performance.now() - startedAt);
        if (!lines) print("muted", "(no output — nothing was logged)");
        const bad = failed || msg.failed;
        finish((bad ? "Error · " : "Done · ") + ms + " ms", bad ? "err" : "ok");
      }
    };
    worker.onerror = (e) => {
      failed = true;
      print("error", e.message || "Worker error");
      finish("Error", "err");
    };

    /* The reason this whole thing is a Worker. */
    timer = setTimeout(() => {
      print("error", "Timed out after " + TIMEOUT_MS / 1000 + "s — an infinite loop, or a timer that outlives the run.");
      finish("Timed out", "err");
    }, TIMEOUT_MS);

    worker.postMessage({ code: code, stdin: stdinEl.value });
  }

  /* ============================================================
     EDITOR
     ============================================================ */
  function paint() {
    const src = editor.value;
    hlEl.innerHTML = highlight(src);
    const n = src.split("\n").length;
    if (gutterEl.childElementCount !== n) {
      gutterEl.innerHTML = "";
      const frag = document.createDocumentFragment();
      for (let i = 1; i <= n; i++) frag.appendChild(el("div", { class: "pg-ln", text: String(i) }));
      gutterEl.appendChild(frag);
    }
    syncScroll();
  }
  function syncScroll() {
    hlEl.scrollTop = editor.scrollTop;
    hlEl.scrollLeft = editor.scrollLeft;
    gutterEl.style.transform = "translateY(" + -editor.scrollTop + "px)";
  }

  function onEditorKey(e) {
    /* Tab must indent, not tab away — it's a code editor. */
    if (e.key === "Tab") {
      e.preventDefault();
      insert("  ");
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); return; }
    /* Keep the caret's indentation on a new line; without it every block has to
       be re-indented by hand, which is the fastest way to make an editor feel
       cheap. */
    if (e.key === "Enter") {
      const upto = editor.value.slice(0, editor.selectionStart);
      const line = upto.slice(upto.lastIndexOf("\n") + 1);
      const indent = (line.match(/^[ \t]*/) || [""])[0];
      const extra = /[{[(]$/.test(line.trim()) ? "  " : "";
      if (indent || extra) { e.preventDefault(); insert("\n" + indent + extra); }
    }
  }
  /* execCommand keeps the browser's native undo stack intact, which setting
     .value directly would blow away on every edit. */
  function insert(text) {
    editor.focus();
    if (!document.execCommand("insertText", false, text)) {
      const s = editor.selectionStart, e2 = editor.selectionEnd;
      editor.value = editor.value.slice(0, s) + text + editor.value.slice(e2);
      editor.selectionStart = editor.selectionEnd = s + text.length;
    }
    paint();
  }

  /* ============================================================
     SPLITTER
     ============================================================ */
  function initSplit(splitEl) {
    let dragging = false;
    const apply = (pct, save) => {
      pct = Math.min(80, Math.max(20, pct));
      gridEl.style.setProperty("--pg-split", pct + "%");
      splitEl.setAttribute("aria-valuenow", String(Math.round(pct)));
      if (save) store.setPlaygroundSplit(pct);
    };
    const current = () => parseFloat(gridEl.style.getPropertyValue("--pg-split")) || 50;

    splitEl.addEventListener("pointerdown", (e) => {
      dragging = true;
      splitEl.setPointerCapture(e.pointerId);
      document.body.classList.add("pg-dragging");
    });
    splitEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const r = gridEl.getBoundingClientRect();
      apply(((e.clientX - r.left) / r.width) * 100, false);
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      try { splitEl.releasePointerCapture(e.pointerId); } catch (_) { /* already gone */ }
      document.body.classList.remove("pg-dragging");
      store.setPlaygroundSplit(current());
    };
    splitEl.addEventListener("pointerup", end);
    splitEl.addEventListener("pointercancel", end);
    splitEl.addEventListener("dblclick", () => apply(50, true));
    splitEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); apply(current() - 2, true); }
      if (e.key === "ArrowRight") { e.preventDefault(); apply(current() + 2, true); }
      if (e.key === "Home") { e.preventDefault(); apply(50, true); }
    });
    apply(store.getPlaygroundSplit() || 50, false);
  }

  const playIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  const stopIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>';

  /* ============================================================
     BUILD
     ============================================================ */
  function build() {
    editor = el("textarea", {
      class: "pg-editor", spellcheck: "false", autocomplete: "off",
      autocapitalize: "off", autocorrect: "off", wrap: "off",
      "aria-label": "JavaScript code",
      onkeydown: onEditorKey,
      oninput: () => { paint(); saveCode(); },
      onscroll: syncScroll
    });
    editor.value = store.getPlaygroundCode() || STARTER;

    hlEl = el("pre", { class: "pg-hl", "aria-hidden": "true" });
    gutterEl = el("div", { class: "pg-gutter-inner" });
    layersEl = el("div", { class: "pg-layers" }, [hlEl, editor]);

    runBtn = el("button", { class: "pg-run", type: "button", onclick: run });
    runBtn.innerHTML = playIcon + "Run";

    outEl = el("div", { class: "pg-out pg-panel", dataset: { panel: "output" }, "aria-live": "polite" });
    statusEl = el("span", { class: "pg-status" });

    stdinEl = el("textarea", {
      class: "pg-stdin", spellcheck: "false",
      placeholder: "Enter input here…\nEach line is one readline() call.",
      "aria-label": "Program input",
      oninput: debounce(() => store.setPlaygroundInput(stdinEl.value), 400)
    });
    stdinEl.value = store.getPlaygroundInput() || "";

    const split = el("div", {
      class: "pg-split", role: "separator", tabindex: "0",
      "aria-orientation": "vertical", "aria-label": "Resize editor and output",
      "aria-valuemin": "20", "aria-valuemax": "80"
    });

    gridEl = el("div", { class: "pg-grid" }, [
      el("div", { class: "pg-pane" }, [
        el("div", { class: "pg-pane-head" }, [
          el("span", { class: "pg-pane-name", text: "index.js" }),
          el("span", { class: "pg-hint", text: "Ctrl/⌘ + Enter" }),
          runBtn
        ]),
        el("div", { class: "pg-body" }, [
          el("div", { class: "pg-gutter" }, [gutterEl]),
          layersEl
        ])
      ]),
      split,
      el("div", { class: "pg-pane" }, [
        el("div", { class: "pg-pane-head" }, [
          el("div", { class: "pg-tabs", role: "tablist" }, [
            el("button", {
              class: "pg-tab active", type: "button", role: "tab",
              dataset: { tab: "output" }, "aria-selected": "true",
              onclick: () => showPanel("output")
            }, "Output"),
            el("button", {
              class: "pg-tab", type: "button", role: "tab",
              dataset: { tab: "input" }, "aria-selected": "false",
              onclick: () => showPanel("input")
            }, "Input")
          ]),
          statusEl,
          el("button", {
            class: "pg-clear", type: "button", title: "Clear output",
            onclick: () => { clearOut(); setStatus(""); showPanel("output"); }
          }, "Clear")
        ]),
        outEl,
        el("div", { class: "pg-stdin-wrap pg-panel", dataset: { panel: "input" }, hidden: "" }, [
          el("p", { class: "pg-stdin-note", text: "Read these with readline(), or the whole thing as the input string." }),
          stdinEl
        ])
      ])
    ]);

    root = el("section", { class: "playground", id: "playground", hidden: "" }, [
      el("div", { class: "pg-bar" }, [
        el("h2", { class: "pg-title" }, [
          el("span", { class: "pg-lang", text: "JS" }),
          document.createTextNode("Playground")
        ]),
        el("p", { class: "pg-sub", text: "Runs in your browser — nothing is sent anywhere." }),
        el("div", { class: "pg-bar-actions" }, [
          el("button", {
            class: "tool", type: "button", title: "Restore the starter snippet",
            onclick: () => {
              editor.value = STARTER;
              store.setPlaygroundCode(STARTER);
              paint(); clearOut(); setStatus(""); showPanel("output");
              toast("Playground reset");
            }
          }, "Reset"),
          el("button", {
            class: "tool", type: "button", title: "Copy the code",
            onclick: (e) => IQB.app.copyText(editor.value, e.currentTarget)
          }, "Copy")
        ])
      ]),
      gridEl
    ]);

    initSplit(split);
    paint();
    return root;
  }

  const saveCode = debounce(() => store.setPlaygroundCode(editor.value), 400);

  IQB.playground = {
    build,
    /* leaving the tab must not leave a runaway worker spinning in the background */
    onHide() { if (running) finish("Stopped", "warn"); },
    onShow() { paint(); if (editor) editor.focus(); }
  };
})();

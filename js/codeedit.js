/* ============================================================
   codeedit — the shared JavaScript editor and sandbox.

   Two consumers: the JS Playground tab (js/playground.js) and the Solve IDE
   that coding questions open (js/coding.js). Both need the same three things,
   so they live here exactly once:

     • highlight()     — the ~90 line One Dark tokenizer
     • attach()        — the editor surface (textarea over a highlighted <pre>,
                         scroll-synced, with a line-number gutter)
     • createRunner()  — the Web Worker sandbox, in run or judge mode

   A Worker — not eval(), not an iframe — is the whole point. On a practice
   site `while (true) {}` is a matter of when, not if, and terminate() is the
   only reliable way to kill a runaway loop. A worker also has no DOM, so code
   that spins can't lock the page while we wait to kill it.

   The editor keeps the native caret, native undo, native IME and native
   accessibility, where CodeMirror would cost ~200KB and Monaco several MB.

   Scope is deliberately v1: plain JS. No modules, no npm, no DOM.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el } = IQB.utils;

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

  /* Brackets aren't tokens — they fall in the plain text BETWEEN matches — so
     the bracket-match markers have to be applied while emitting that text. */
  function plain(text, base, marks) {
    if (!marks || !marks.size) return esc(text);
    let out = "", buf = "";
    for (let i = 0; i < text.length; i++) {
      if (marks.has(base + i)) {
        out += esc(buf) + span("m", text[i]);
        buf = "";
      } else buf += text[i];
    }
    return out + esc(buf);
  }

  /* marks: optional Set of character offsets to render as matched brackets. */
  function highlight(src, marks) {
    let out = "", last = 0, m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(src)) !== null) {
      out += plain(src.slice(last, m.index), last, marks);
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
    out += plain(src.slice(last), last, marks);
    return out + "\n"; // <pre> eats a trailing newline; keep the last line tall
  }

  /* ============================================================
     BRACKET MATCHING

     Cheap structural help, and the safe half of what code folding would give
     you: put the caret on a brace and its partner lights up, so you can see
     where a block ends without hiding anything.
     ============================================================ */
  const OPENERS = "([{", CLOSERS = ")]}";
  const PARTNER = { "(": ")", "[": "]", "{": "}", ")": "(", "]": "[", "}": "{" };

  /* Positions inside a string or comment, so a brace in "]" or // ) can't be
     mistaken for structure. Cached — the caret moves far more often than the
     text changes. */
  let maskSrc = null, maskArr = null;
  function mask(src) {
    if (maskSrc === src) return maskArr;
    const arr = new Uint8Array(src.length);
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(src)) !== null) {
      if (m[1] || m[2]) arr.fill(1, m.index, m.index + m[0].length);
    }
    maskSrc = src;
    maskArr = arr;
    return arr;
  }

  /* The bracket the caret is touching — after it first, like every editor. */
  function bracketAt(src, caret) {
    const skip = mask(src);
    const before = caret - 1;
    if (before >= 0 && !skip[before] && PARTNER[src[before]]) return before;
    if (caret < src.length && !skip[caret] && PARTNER[src[caret]]) return caret;
    return -1;
  }

  function matchBracket(src, at) {
    const skip = mask(src);
    const ch = src[at];
    const open = OPENERS.indexOf(ch) !== -1;
    if (!open && CLOSERS.indexOf(ch) === -1) return -1;
    const want = PARTNER[ch];
    const step = open ? 1 : -1;
    let depth = 0;
    for (let i = at; i >= 0 && i < src.length; i += step) {
      if (skip[i]) continue;
      if (src[i] === ch) depth++;
      else if (src[i] === want) { depth--; if (!depth) return i; }
    }
    return -1;
  }

  /* ============================================================
     EDITOR SURFACE

     Emits the .pg-* class names both consumers style from css/styles.css —
     the editor is one component and should look identical wherever it opens.
     ============================================================ */
  function attach(opts) {
    opts = opts || {};

    let markA = -1, markB = -1, activeLine = -1;   // bracket pair + caret line

    const hlEl = el("pre", { class: "pg-hl", "aria-hidden": "true" });
    const gutterEl = el("div", { class: "pg-gutter-inner" });

    const editor = el("textarea", {
      class: "pg-editor", spellcheck: "false", autocomplete: "off",
      autocapitalize: "off", autocorrect: "off", wrap: "off",
      "aria-label": opts.ariaLabel || "JavaScript code",
      onkeydown: onKey,
      oninput: () => { paint(); if (opts.onChange) opts.onChange(editor.value); },
      onscroll: syncScroll,
      /* The caret moves without the text changing — keyup covers arrows and
         Home/End, click covers pointer moves. Both are cheap: syncCaret()
         repaints only when the matched pair or the active line actually
         changes. */
      onkeyup: syncCaret,
      onclick: syncCaret,
      onfocus: syncCaret,
      onblur: () => { markA = markB = activeLine = -1; paint(); }
    });
    editor.value = opts.value || "";

    const body = el("div", { class: "pg-body" }, [
      el("div", { class: "pg-gutter" }, [gutterEl]),
      el("div", { class: "pg-layers" }, [hlEl, editor])
    ]);

    function paint() {
      const src = editor.value;
      const marks = markA >= 0 && markB >= 0 ? new Set([markA, markB]) : null;
      hlEl.innerHTML = highlight(src, marks);
      const n = src.split("\n").length;
      if (gutterEl.childElementCount !== n) {
        gutterEl.innerHTML = "";
        const frag = document.createDocumentFragment();
        for (let i = 1; i <= n; i++) frag.appendChild(el("div", { class: "pg-ln", text: String(i) }));
        gutterEl.appendChild(frag);
      }
      paintActiveLine();
      syncScroll();
    }

    function paintActiveLine() {
      const kids = gutterEl.children;
      for (let i = 0; i < kids.length; i++) kids[i].classList.toggle("on", i === activeLine);
    }

    /* Recompute the matched bracket pair and the caret's line. Repaints only
       on an actual change, so holding an arrow key doesn't rebuild the whole
       highlighted layer on every repeat. */
    function syncCaret() {
      const src = editor.value;
      const caret = editor.selectionStart;
      let a = -1, b = -1;
      if (caret === editor.selectionEnd) {
        const at = bracketAt(src, caret);
        if (at >= 0) {
          const other = matchBracket(src, at);
          if (other >= 0) { a = at; b = other; }
        }
      }
      const line = src.slice(0, caret).split("\n").length - 1;
      if (a === markA && b === markB && line === activeLine) return;
      const lineOnly = a === markA && b === markB;
      markA = a; markB = b; activeLine = line;
      if (lineOnly) paintActiveLine(); else paint();
    }
    function syncScroll() {
      hlEl.scrollTop = editor.scrollTop;
      hlEl.scrollLeft = editor.scrollLeft;
      gutterEl.style.transform = "translateY(" + -editor.scrollTop + "px)";
    }

    function onKey(e) {
      /* Tab must indent, not tab away — it's a code editor. */
      if (e.key === "Tab") { e.preventDefault(); insert("  "); return; }
      /* Comment toggle. Ctrl+/ is the VS Code binding and Alt+/ is what some
         JetBrains layouts send; both are accepted so neither habit is wrong.
         e.code is checked too because on several non-US layouts "/" is a
         shifted key and e.key comes through as something else entirely. */
      if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === "/" || e.code === "Slash")) {
        e.preventDefault();
        toggleComment();
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // the event goes through so a consumer can tell Ctrl+Enter from
        // Ctrl+Shift+Enter and bind them to different actions
        if (opts.onRun) opts.onRun(e);
        return;
      }
      /* ---- auto-closing pairs ----
         Only when the caret is not mid-word: typing `(` right before `x` in
         `fx` should not produce `f()x`. */
      const CLOSE_FOR = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
      const src = editor.value;
      const at = editor.selectionStart;
      const selEmpty = at === editor.selectionEnd;

      if (CLOSE_FOR[e.key] && selEmpty) {
        const after = src[at] || "";
        if (!/[\w$]/.test(after)) {
          e.preventDefault();
          insert(e.key + CLOSE_FOR[e.key]);
          editor.setSelectionRange(at + 1, at + 1);
          syncCaret();
          return;
        }
      }
      /* Typing the closing half of a pair you just opened steps over it
         instead of doubling it. */
      if (selEmpty && ")]}\"'`".indexOf(e.key) !== -1 && src[at] === e.key) {
        e.preventDefault();
        editor.setSelectionRange(at + 1, at + 1);
        syncCaret();
        return;
      }
      /* Backspace inside an empty pair takes both halves. */
      if (e.key === "Backspace" && selEmpty && at > 0 && CLOSE_FOR[src[at - 1]] === src[at]) {
        e.preventDefault();
        editor.setSelectionRange(at - 1, at + 1);
        if (!document.execCommand("delete")) {
          editor.value = src.slice(0, at - 1) + src.slice(at + 1);
          editor.setSelectionRange(at - 1, at - 1);
        }
        paint();
        if (opts.onChange) opts.onChange(editor.value);
        return;
      }

      /* Keep the caret's indentation on a new line; without it every block has
         to be re-indented by hand, which is the fastest way to make an editor
         feel cheap. */
      if (e.key === "Enter") {
        const upto = src.slice(0, at);
        const line = upto.slice(upto.lastIndexOf("\n") + 1);
        const indent = (line.match(/^[ \t]*/) || [""])[0];
        const opens = /[{[(]$/.test(line.trim());
        /* Enter between the two halves of a pair opens the block out properly:
           the closing brace drops to its own line at the parent indent. */
        if (opens && selEmpty && CLOSE_FOR[src[at - 1]] === src[at]) {
          e.preventDefault();
          insert("\n" + indent + "  \n" + indent);
          const caret = at + 1 + indent.length + 2;
          editor.setSelectionRange(caret, caret);
          syncCaret();
          return;
        }
        const extra = opens ? "  " : "";
        if (indent || extra) { e.preventDefault(); insert("\n" + indent + extra); }
      }
    }

    /* ---- comment toggle (Ctrl+/ , Cmd+/ , Alt+/) ----
       Line comments only. Block comments would have to reason about strings,
       regexes and nesting to be correct, and getting that subtly wrong
       silently changes what the reader's code means. */
    function toggleComment() {
      const value = editor.value;
      const selStart = editor.selectionStart;
      let selEnd = editor.selectionEnd;
      const caret = selStart === selEnd;

      /* A selection that ends exactly at a line break shouldn't drag the
         following line in — dragging down to a line start selects the newline,
         not the next line. */
      if (!caret && selEnd > selStart && value[selEnd - 1] === "\n") selEnd--;

      const from = value.lastIndexOf("\n", selStart - 1) + 1;
      let to = value.indexOf("\n", selEnd);
      if (to === -1) to = value.length;

      const lines = value.slice(from, to).split("\n");
      const code = lines.filter((l) => l.trim() !== "");
      if (!code.length) return;                       // nothing but blank lines

      const commented = code.every((l) => /^\s*\/\//.test(l));
      let caretShift = 0;
      const caretLine = value.slice(from, selStart).split("\n").length - 1;

      let out;
      if (commented) {
        out = lines.map((l, i) => {
          const next = l.replace(/^(\s*)\/\/ ?/, "$1");
          if (i === caretLine) caretShift = next.length - l.length;
          return next;
        });
      } else {
        /* Comment from the shallowest indent, not each line's own — otherwise
           the markers zig-zag down the block and the shape of the code is
           lost. */
        const indent = Math.min.apply(null, code.map((l) => l.match(/^\s*/)[0].length));
        out = lines.map((l, i) => {
          if (l.trim() === "") return l;              // blank lines stay blank
          const next = l.slice(0, indent) + "// " + l.slice(indent);
          if (i === caretLine) caretShift = 3;
          return next;
        });
      }

      const replacement = out.join("\n");
      editor.focus();
      editor.setSelectionRange(from, to);
      if (!document.execCommand("insertText", false, replacement)) {
        editor.value = value.slice(0, from) + replacement + value.slice(to);
      }

      if (caret) {
        const at = Math.max(from, selStart + caretShift);
        editor.setSelectionRange(at, at);
      } else {
        editor.setSelectionRange(from, from + replacement.length);
      }
      paint();
      if (opts.onChange) opts.onChange(editor.value);
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
      if (opts.onChange) opts.onChange(editor.value);
    }

    paint();

    return {
      el: body,
      textarea: editor,
      getValue: () => editor.value,
      setValue: (v) => { editor.value = v == null ? "" : v; paint(); },
      focus: () => editor.focus(),
      paint: paint
    };
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
       remove. Also how a judged result is shown back to the reader. */
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

    /* ---- judging ----
       Same comparators as build-manifest.mjs, which runs every question's
       reference solution against these cases before the content can ship. */
    function sameAnswer(got, expected, mode) {
      if (mode === "float") return typeof got === "number" && Math.abs(got - expected) < 1e-5;
      if (mode === "unordered") {
        if (!Array.isArray(got) || !Array.isArray(expected) || got.length !== expected.length) return false;
        var a = got.map(function (v) { return JSON.stringify(v); }).sort();
        var b = expected.map(function (v) { return JSON.stringify(v); }).sort();
        return a.every(function (v, i) { return v === b[i]; });
      }
      return JSON.stringify(got) === JSON.stringify(expected);
    }

    function judge(code, fnName, tests) {
      var fn;
      /* One indirect eval for the program AND the trailing lookup: a `const`
         declaration at global scope is a lexical binding and never becomes a
         property of self, so reading self[fnName] afterwards would find nothing
         for `const twoSum = ...`. Evaluating the name as the completion value
         works for const, let, var and function alike. */
      try {
        fn = (0, eval)(code + '\n;(typeof ' + fnName + ' === "function" ? ' + fnName + " : undefined);");
      } catch (err) {
        self.postMessage({
          type: "verdict", cases: [], passed: 0, total: tests.length,
          error: "Your code didn't run: " + fmt(err, 0, [])
        });
        return;
      }
      if (typeof fn !== "function") {
        self.postMessage({
          type: "verdict", cases: [], passed: 0, total: tests.length,
          error: 'No function named "' + fnName + '" was found. Keep the name from the starter code — that is what gets called.'
        });
        return;
      }

      var cases = [], passed = 0;
      for (var i = 0; i < tests.length; i++) {
        var t = tests[i], got, error = null;
        var startedAt = Date.now();
        try {
          // deep-copied per case, so a solution that mutates its input (merge)
          // can't corrupt a later case's arguments
          got = fn.apply(null, JSON.parse(JSON.stringify(t.args)));
        } catch (err) {
          /* Name + message only. fmt() would print err.stack, whose frames are
             all `blob:…/judge` internals — noise that tells a learner nothing
             about the line they got wrong. */
          error = (err && err.message) ? ((err.name || "Error") + ": " + err.message) : fmt(err, 1, []);
        }
        var ok = !error && sameAnswer(got, t.expected, t.compare);
        if (ok) passed++;
        /* gotText, not got: the return value may be a Map, a Set or hold a
           function, none of which survive structured cloning — and the reader
           needs it printed, not reconstructed. */
        cases.push({
          index: i, ok: ok, error: error,
          gotText: error ? null : fmt(got, 1, []),
          ms: Date.now() - startedAt
        });
      }
      self.postMessage({ type: "verdict", cases: cases, passed: passed, total: tests.length });
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

      if (e.data.tests) { judge(e.data.code, e.data.fn, e.data.tests); return; }

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
     RUNNER — one sandboxed execution at a time
     ============================================================ */
  function createRunner() {
    let worker = null, workerUrl = null, timer = null, running = false;
    let handlers = {};

    function teardown() {
      if (worker) { worker.terminate(); worker = null; }
      if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl = null; }
      if (timer) { clearTimeout(timer); timer = null; }
      running = false;
    }

    /* Every exit funnels through here so a run can never end twice — a verdict
       arriving in the same tick the timeout fires would otherwise report both. */
    function settle(fn, arg) {
      if (!running) return;
      const h = handlers;
      teardown();
      if (h[fn]) h[fn](arg);
    }

    function stop() {
      if (!running) return;
      settle("onStopped");
    }

    /* opts:
         code      — the program to run
         stdin     — Input pane contents (run mode)
         tests, fn — judge mode: run `fn` against these cases instead
         timeoutMs — hard kill, defaults to 2s (run) / 5s (judge)
         onLog({level,text,fatal}) onDone({failed}) onVerdict(v)
         onTimeout() onStopped() onError(message)                      */
    function run(opts) {
      if (running) stop();
      handlers = opts;
      const judging = !!opts.tests;

      try {
        workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
        worker = new Worker(workerUrl);
      } catch (err) {
        teardown();
        if (opts.onError) opts.onError("Couldn't start the sandbox: " + err.message);
        return;
      }

      running = true;

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "log") { if (opts.onLog) opts.onLog(msg); return; }
        if (msg.type === "verdict") { settle("onVerdict", msg); return; }
        if (msg.type === "done") { settle("onDone", msg); }
      };
      worker.onerror = (e) => { settle("onError", e.message || "Worker error"); };

      /* The reason this whole thing is a Worker. */
      const ms = opts.timeoutMs || (judging ? 5000 : 2000);
      timer = setTimeout(() => { settle("onTimeout", ms); }, ms);

      worker.postMessage({
        code: opts.code,
        stdin: opts.stdin || "",
        tests: opts.tests || null,
        fn: opts.fn || null
      });
    }

    return { run: run, stop: stop, isRunning: () => running };
  }

  /* ============================================================
     SPLITTER — a draggable divider between two panes.

     Writes a percentage into a CSS custom property on the container; the
     layout decides what that percentage means (a column width, a pane
     height). The value is always the size of the FIRST pane, measured from
     the container's top-left, so dragging feels the same on both axes.

     Pointer capture rather than document-level listeners: the pointer leaving
     the handle mid-drag is the normal case, not the exception.
     ============================================================ */
  function split(opts) {
    const handle = opts.handle;
    const container = opts.container;
    const vertical = opts.axis === "y";
    const varName = opts.varName;
    const min = opts.min == null ? 15 : opts.min;
    const max = opts.max == null ? 85 : opts.max;
    const initial = opts.initial == null ? 50 : opts.initial;
    let dragging = false;

    const current = () => parseFloat(container.style.getPropertyValue(varName)) || initial;

    function apply(pct, save) {
      pct = Math.min(max, Math.max(min, pct));
      container.style.setProperty(varName, pct + "%");
      handle.setAttribute("aria-valuenow", String(Math.round(pct)));
      if (save && opts.onChange) opts.onChange(pct);
    }

    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add(vertical ? "pg-dragging-y" : "pg-dragging");
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const r = container.getBoundingClientRect();
      apply(vertical
        ? ((e.clientY - r.top) / r.height) * 100
        : ((e.clientX - r.left) / r.width) * 100, false);
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (_) { /* already gone */ }
      document.body.classList.remove("pg-dragging", "pg-dragging-y");
      apply(current(), true);
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    /* Double-click restores the default — the cheapest way back from a drag
       that went somewhere silly. */
    handle.addEventListener("dblclick", () => apply(initial, true));
    handle.addEventListener("keydown", (e) => {
      const back = vertical ? "ArrowUp" : "ArrowLeft";
      const fwd = vertical ? "ArrowDown" : "ArrowRight";
      if (e.key === back) { e.preventDefault(); apply(current() - 2, true); }
      if (e.key === fwd) { e.preventDefault(); apply(current() + 2, true); }
      if (e.key === "Home") { e.preventDefault(); apply(initial, true); }
    });

    apply(opts.value || initial, false);
    return { apply: apply, current: current };
  }

  /* The handle element itself, so every splitter is the same control. */
  function splitHandle(axis, label) {
    return el("div", {
      class: "ce-split ce-split-" + axis, role: "separator", tabindex: "0",
      "aria-orientation": axis === "y" ? "horizontal" : "vertical",
      "aria-label": label, "aria-valuemin": "15", "aria-valuemax": "85"
    });
  }

  IQB.codeedit = {
    highlight: highlight,
    attach: attach,
    createRunner: createRunner,
    split: split,
    splitHandle: splitHandle
  };
})();

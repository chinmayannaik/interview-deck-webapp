/* ============================================================
   JS Playground — a full-height scratch editor that runs the user's own code.

   Everything runs client-side in a Web Worker: no backend, no CDN, no new
   dependency, and it works offline exactly like the rest of the PWA. The
   editor surface, the tokenizer and the sandbox all live in js/codeedit.js —
   this file is the Playground tab's chrome around them (panes, tabs, splitter,
   status line) and nothing else.

   Scope is deliberately v1: plain JS. No modules, no npm, no DOM.
   stdin is emulated — see the Input pane.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el, qsa, toast, debounce } = IQB.utils;
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
     STATE
     ============================================================ */
  let root = null, editor = null, outEl = null, stdinEl = null;
  let statusEl = null, runBtn = null, gridEl = null;
  let runner = null, startedAt = 0;
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
  function finish(text, kind) {
    running = false;
    root.classList.remove("running");
    runBtn.innerHTML = playIcon + "Run";
    setStatus(text, kind);
  }
  function stop() {
    if (!running) return;
    runner.stop();
  }

  function run() {
    if (running) { stop(); return; }

    const code = editor.getValue();
    store.setPlaygroundCode(code);
    store.setPlaygroundInput(stdinEl.value);
    clearOut();
    showPanel("output");

    running = true;
    startedAt = performance.now();
    root.classList.add("running");
    runBtn.innerHTML = stopIcon + "Stop";
    setStatus("Running…", "");

    runner.run({
      code: code,
      stdin: stdinEl.value,
      timeoutMs: TIMEOUT_MS,
      onLog: (msg) => { if (msg.fatal) failed = true; print(msg.level, msg.text); },
      onDone: (msg) => {
        const ms = Math.round(performance.now() - startedAt);
        if (!lines) print("muted", "(no output — nothing was logged)");
        const bad = failed || (msg && msg.failed);
        finish((bad ? "Error · " : "Done · ") + ms + " ms", bad ? "err" : "ok");
      },
      onTimeout: (ms) => {
        print("error", "Timed out after " + ms / 1000 + "s — an infinite loop, or a timer that outlives the run.");
        finish("Timed out", "err");
      },
      onStopped: () => { print("warn", "Stopped."); finish("Stopped", "warn"); },
      onError: (message) => { print("error", message); finish("Error", "err"); }
    });
  }

  const playIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  const stopIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>';

  /* ============================================================
     BUILD
     ============================================================ */
  function build() {
    runner = IQB.codeedit.createRunner();

    editor = IQB.codeedit.attach({
      value: store.getPlaygroundCode() || STARTER,
      ariaLabel: "JavaScript code",
      onChange: () => saveCode(),
      onRun: () => run()
    });

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

    const split = IQB.codeedit.splitHandle("x", "Resize editor and output");

    gridEl = el("div", { class: "pg-grid" }, [
      el("div", { class: "pg-pane" }, [
        el("div", { class: "pg-pane-head" }, [
          el("span", { class: "pg-pane-name", text: "index.js" }),
          el("span", { class: "pg-hint", text: "Ctrl/⌘ + Enter" }),
          runBtn
        ]),
        editor.el
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
        /* Mobile-only exit. The header #playground-btn (which toggles back to the
           last questions category) is display:none on phones and the Section
           dropdown is hidden by body.pg-mode, so without this the playground is a
           dead-end on mobile. Reuses that button's existing toggle logic. */
        el("button", {
          class: "tool pg-back", type: "button", title: "Back to questions",
          "aria-label": "Back to questions",
          onclick: () => { const b = document.getElementById("playground-btn"); if (b) b.click(); }
        }, [
          el("span", { class: "pg-back-ic", html: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' }),
          document.createTextNode("Back")
        ]),
        el("h2", { class: "pg-title" }, [
          el("span", { class: "pg-lang", text: "JS" }),
          document.createTextNode("Playground")
        ]),
        el("div", { class: "pg-bar-actions" }, [
          el("button", {
            class: "tool", type: "button", title: "Restore the starter snippet",
            onclick: () => {
              editor.setValue(STARTER);
              store.setPlaygroundCode(STARTER);
              clearOut(); setStatus(""); showPanel("output");
              toast("Playground reset");
            }
          }, "Reset"),
          el("button", {
            class: "tool", type: "button", title: "Copy the code",
            onclick: (e) => IQB.app.copyText(editor.getValue(), e.currentTarget)
          }, "Copy")
        ])
      ]),
      gridEl
    ]);

    IQB.codeedit.split({
      handle: split, container: gridEl, axis: "x", varName: "--pg-split",
      initial: 50, min: 20, max: 80,
      value: store.getPlaygroundSplit() || 50,
      onChange: (pct) => store.setPlaygroundSplit(pct)
    });
    return root;
  }

  const saveCode = debounce(() => store.setPlaygroundCode(editor.getValue()), 400);

  IQB.playground = {
    build,
    /* leaving the tab must not leave a runaway worker spinning in the background
       (runner.stop() fires onStopped, which is what resets the UI) */
    onHide() { if (running) runner.stop(); },
    onShow() { if (editor) { editor.paint(); editor.focus(); } }
  };
})();

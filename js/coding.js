/* ============================================================
   Coding questions — the problem view and the Solve IDE.

   A category opts in from the content manifest (`"mode": "coding"`), so
   turning this on for JS Coding, Angular Coding or Flutter Coding later is a
   data change in the questions repo, not a code change here. Such a question
   carries a machine-readable contract alongside its prose:

     problem / examples / constraints  — the statement, on its own
     fn / starter.js                   — the entry function and its stub
     tests[]                           — what the judge runs
     solution.js                       — the JavaScript reference answer

   Two surfaces are built from that:

     1. The card. A coding card shows ONLY the problem when expanded — the
        approach, the code and the deep dive move behind a "Show Solution"
        gate, because seeing the answer while reading the question is the one
        thing a practice site must not do.
     2. The Solve overlay. Full-screen, problem left, editor and console right
        (tabs on a phone). Run executes the worked examples; Submit runs every
        case and records the verdict through js/solutions.js.

   Execution is js/codeedit.js — the same Web Worker sandbox as the Playground.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el, qs, qsa, toast, debounce } = IQB.utils;

  /* Resolved lazily, not at load: this file is a static <script> tag, while
     IQB.manifest only exists once data-loader.js has fetched it (app.js is
     injected afterwards, which is why app.js can read it directly). */
  let MODES = null;
  function modes() {
    if (MODES) return MODES;
    const cats = (window.IQB.manifest && IQB.manifest.categories) || [];
    if (!cats.length) return {};           // not loaded yet — don't cache the empty
    MODES = {};
    cats.forEach((c) => { if (c.mode) MODES[c.id] = c.mode; });
    return MODES;
  }

  const isCoding = (categoryId) => modes()[categoryId] === "coding";
  /* A category can be flagged before its questions have been rewritten, so the
     card path checks the question too rather than trusting the flag alone. */
  const solvable = (q) => !!(q && isCoding(q.category) && q.fn && q.starter && q.starter.js && q.tests && q.tests.length);

  const SOLVE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  const PLAY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  const STOP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>';
  const SEND_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>';
  const LOCK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  /* Test values are printed, never parsed back — JSON is the honest rendering
     of the array/string/number arguments these questions take. */
  const show = (v) => JSON.stringify(v);
  const argList = (args) => args.map(show).join(", ");

  /* The first examples.length cases mirror the worked examples (enforced by
     build-manifest.mjs) and are the ones Run executes. */
  const sampleCount = (q) => Math.min((q.examples || []).length || 1, q.tests.length);

  /* ============================================================
     PROBLEM VIEW — shared by the card and the overlay's left pane
     ============================================================ */
  function buildProblem(q) {
    const wrap = el("div", { class: "cq-problem" });

    wrap.appendChild(el("div", { class: "cq-statement", html: q.problem || q.answer || "" }));

    (q.examples || []).forEach((ex, i) => {
      const box = el("div", { class: "cq-example" }, [
        el("div", { class: "cq-example-h", text: "Example " + (i + 1) })
      ]);
      const dl = el("dl", { class: "cq-io" });
      dl.appendChild(el("dt", { text: "Input" }));
      dl.appendChild(el("dd", { text: ex.input }));
      dl.appendChild(el("dt", { text: "Output" }));
      dl.appendChild(el("dd", { text: ex.output }));
      if (ex.explanation) {
        dl.appendChild(el("dt", { text: "Explanation" }));
        dl.appendChild(el("dd", { class: "cq-why", text: ex.explanation }));
      }
      box.appendChild(dl);
      wrap.appendChild(box);
    });

    if ((q.constraints || []).length) {
      wrap.appendChild(el("div", { class: "cq-constraints" }, [
        el("h4", { text: "Constraints" }),
        el("ul", {}, q.constraints.map((c) => el("li", { text: c })))
      ]));
    }
    return wrap;
  }

  /* ============================================================
     CARD PIECES
     ============================================================ */

  /* The Solve button. Wears the question's own status, so the list doubles as
     a progress board. */
  function solveButton(q, opts) {
    const btn = el("button", {
      class: "qa-act cq-solve" + ((opts && opts.big) ? " cq-solve-big" : ""),
      type: "button", "aria-label": "Solve " + q.question + " in the code editor",
      onclick: (e) => { e.stopPropagation(); open(q); }
    });
    btn.innerHTML = SOLVE_ICON + '<span class="qa-act-label">Solve</span>';
    paintStatus(btn, q.id);
    if (window.IQB.solutions) IQB.solutions.onChange((id) => { if (!id || id === q.id) paintStatus(btn, q.id); });
    return btn;
  }

  function paintStatus(btn, questionId) {
    const status = window.IQB.solutions ? IQB.solutions.statusOf(questionId) : null;
    btn.classList.toggle("is-solved", status === "solved");
    btn.classList.toggle("is-attempted", status === "attempted");
    const label = qs(".qa-act-label", btn);
    if (label) label.textContent = status === "solved" ? "Solved" : (status === "attempted" ? "Resume" : "Solve");
  }

  /* The gate. Everything a reader must not see while thinking — approach,
     complexity, reference code, tip, deep dive — is handed over as a single
     node and revealed only on request. */
  function buildSolutionGate(contents) {
    const panel = el("div", { class: "cq-solution", hidden: "" }, contents);
    const btn = el("button", {
      class: "qa-act cq-reveal", type: "button", "aria-expanded": "false",
      onclick: (e) => {
        e.stopPropagation();
        const hidden = panel.hasAttribute("hidden");
        if (hidden) panel.removeAttribute("hidden"); else panel.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", hidden ? "true" : "false");
        btn.innerHTML = LOCK_ICON + (hidden ? "Hide Solution" : "Show Solution");
      }
    });
    btn.innerHTML = LOCK_ICON + "Show Solution";
    return { button: btn, panel: panel };
  }

  /* ============================================================
     SOLVE OVERLAY
     ============================================================ */
  let root = null, editor = null, runner = null;
  let current = null;                       // the question being solved
  let problemPane = null, titleEl = null, statusEl = null, verdictEl = null;
  let resultEl = null, consoleEl = null, consoleTab = null;
  let runBtn = null, submitBtn = null, activeBtn = null;
  let running = false, consoleLines = 0, lastFocus = null;

  const MAX_LINES = 300;

  function ensureBuilt() {
    if (root) return;
    runner = IQB.codeedit.createRunner();

    editor = IQB.codeedit.attach({
      ariaLabel: "Your JavaScript solution",
      onChange: () => saveDraft(),
      /* Ctrl+Enter is the iterating action (the examples); Shift adds the
         commitment. Submitting on a plain Ctrl+Enter would burn an attempt
         every time someone reached for "check my work". */
      onRun: (e) => { if (e && e.shiftKey) submit(); else runTests(); }
    });

    problemPane = el("section", { class: "solve-pane solve-problem", dataset: { pane: "problem" } });
    titleEl = el("h2", { class: "solve-title" });
    statusEl = el("span", { class: "solve-status pg-status" });

    /* Two actions:
         Run     — worked examples (same as Ctrl/⌘+Enter)
         Submit  — every case, and record the verdict */
    runBtn = el("button", { class: "solve-btn solve-run", type: "button", onclick: () => runTests() });
    runBtn.innerHTML = PLAY_ICON + "Run";
    submitBtn = el("button", { class: "solve-btn solve-submit", type: "button", onclick: () => submit() });
    submitBtn.innerHTML = SEND_ICON + "Submit";

    verdictEl = el("div", { class: "solve-verdict", hidden: "" });
    resultEl = el("div", { class: "solve-cases solve-panel", dataset: { panel: "result" } });
    consoleEl = el("div", { class: "pg-out solve-panel", dataset: { panel: "console" }, hidden: "", "aria-live": "polite" });

    consoleTab = panelTab("console", "Console", false);
    const tabs = el("div", { class: "pg-tabs", role: "tablist" }, [
      panelTab("result", "Test Result", true),
      consoleTab
    ]);

    /* Both dividers drag, and both remember where you left them. */
    const saved = IQB.storage.getSolveSplit() || {};
    const splitY = IQB.codeedit.splitHandle("y", "Resize editor and test results");
    const splitX = IQB.codeedit.splitHandle("x", "Resize problem and editor");

    const codePane = el("section", { class: "solve-pane solve-code", dataset: { pane: "code" } }, [
      el("div", { class: "pg-pane-head" }, [
        el("span", { class: "pg-pane-name", text: "solution.js" }),
        el("span", { class: "pg-hint", text: "Ctrl/⌘ + Enter" }),
        runBtn,
        submitBtn
      ]),
      /* The editor, its divider and the console share a wrapper so the drag
         percentage and the pointer are measured from the same origin — with
         the toolbar inside the container the handle drifts below the cursor
         by exactly the toolbar's height. */
      el("div", { class: "solve-code-body" }, [
        editor.el,
        splitY,
        el("div", { class: "solve-console" }, [
          el("div", { class: "pg-pane-head" }, [tabs, statusEl]),
          verdictEl,
          resultEl,
          consoleEl
        ])
      ])
    ]);

    const backBtn = el("button", { class: "solve-back", type: "button", onclick: close, "aria-label": "Back to questions" });
    backBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg><span>Back</span>';

    root = el("div", {
      class: "solve", id: "solve", hidden: "",
      role: "dialog", "aria-modal": "true", "aria-label": "Solve this question"
    }, [
      el("div", { class: "solve-head" }, [
        backBtn,
        titleEl,
        el("div", { class: "solve-head-actions" }, [
          /* Only shown on a phone, where the two panes stack into tabs. */
          el("div", { class: "solve-panes", role: "tablist" }, [
            paneTab("problem", "Problem", true),
            paneTab("code", "Code", false)
          ]),
          el("button", {
            class: "tool", type: "button", title: "Restore the starter code",
            onclick: resetToStarter
          }, "Reset")
        ])
      ]),
      el("div", { class: "solve-grid" }, [problemPane, splitX, codePane])
    ]);

    document.body.appendChild(root);

    const grid = qs(".solve-grid", root);
    /* Persisted together so one write covers both handles. */
    const remember = (key) => (pct) => {
      const now = IQB.storage.getSolveSplit() || {};
      now[key] = pct;
      IQB.storage.setSolveSplit(now);
    };
    IQB.codeedit.split({
      handle: splitX, container: grid, axis: "x", varName: "--solve-x",
      initial: 42, min: 20, max: 75, value: saved.x, onChange: remember("x")
    });
    IQB.codeedit.split({
      handle: splitY, container: qs(".solve-code-body", root), axis: "y", varName: "--solve-y",
      initial: 58, min: 25, max: 85, value: saved.y, onChange: remember("y")
    });

    document.addEventListener("keydown", onKeydown);
  }

  function panelTab(name, label, active) {
    return el("button", {
      class: "pg-tab" + (active ? " active" : ""), type: "button", role: "tab",
      dataset: { tab: name }, "aria-selected": active ? "true" : "false",
      onclick: () => showPanel(name)
    }, label);
  }
  function showPanel(name) {
    qsa(".solve-console .pg-tab", root).forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    qsa(".solve-panel", root).forEach((p) => { p.hidden = p.dataset.panel !== name; });
    updateConsoleBadge();
  }

  function paneTab(name, label, active) {
    return el("button", {
      class: "solve-pane-tab" + (active ? " active" : ""), type: "button", role: "tab",
      dataset: { pane: name }, "aria-selected": active ? "true" : "false",
      onclick: () => showPane(name)
    }, label);
  }
  function showPane(name) {
    qsa(".solve-pane-tab", root).forEach((t) => {
      const on = t.dataset.pane === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    root.dataset.pane = name;
    if (name === "code" && editor) editor.paint();
  }

  function onKeydown(e) {
    if (!root || root.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  /* ---------- open / close ---------- */
  async function open(q) {
    if (!solvable(q)) { toast("Not solvable in the editor yet"); return; }
    ensureBuilt();
    current = q;
    lastFocus = document.activeElement;

    titleEl.textContent = q.question;
    problemPane.innerHTML = "";
    problemPane.appendChild(buildProblem(q));
    problemPane.appendChild(buildOverlaySolution(q));

    clearConsole();
    resultEl.innerHTML = "";
    verdictEl.hidden = true;
    setStatus("", "");
    renderCases(null);
    showPanel("result");
    showPane("problem");

    /* Starter first, so a slow cloud read can never leave an empty editor. */
    editor.setValue(q.starter.js);
    root.hidden = false;
    document.body.classList.add("solve-open");

    const saved = window.IQB.solutions ? await IQB.solutions.load(q.id) : null;
    // guard against a second question having been opened while that awaited
    if (current === q && saved && saved.code) {
      editor.setValue(saved.code);
      setStatus(saved.status === "solved"
        ? "Solved earlier · " + saved.passed + "/" + saved.total + " tests"
        : "Draft restored", saved.status === "solved" ? "ok" : "");
    }
    editor.focus();
  }

  function close() {
    if (!root || root.hidden) return;
    if (running) runner.stop();
    flushDraft();
    root.hidden = true;
    document.body.classList.remove("solve-open");
    current = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* The reference answer, available inside the IDE too — after a real attempt
     the comparison is the most useful thing on the page. */
  function buildOverlaySolution(q) {
    const contents = [];
    if (q.answer) contents.push(el("div", { class: "answer", html: q.answer }));
    if (q.solution && q.solution.js) contents.push(codeBlock(q.solution.js, "JavaScript"));
    if (q.code) contents.push(codeBlock(q.code, langLabel(q.lang)));
    if (q.tip) contents.push(el("div", { class: "qa-tip", html: "<b>Tip</b> " + q.tip }));

    const gate = buildSolutionGate(contents);
    return el("div", { class: "cq-gate" }, [gate.button, gate.panel]);
  }

  function langLabel(lang) {
    const names = { java: "Java", js: "JavaScript", python: "Python", cpp: "C++", c: "C", dart: "Dart", swift: "Swift" };
    return names[lang] || (lang ? String(lang) : "Reference");
  }

  function codeBlock(code, label) {
    const copy = el("button", {
      class: "copy-btn", type: "button",
      onclick: (e) => { e.stopPropagation(); IQB.app.copyText(code, e.currentTarget); }
    }, "Copy");
    return el("div", { class: "code-block cq-code" }, [
      label ? el("span", { class: "cq-code-lang", text: label }) : null,
      copy,
      el("pre", {}, [el("code", { text: code })])
    ]);
  }

  /* ---------- drafts ----------
     Saving is silent and automatic — there is deliberately no "save" button.
     Typing persists the draft, submitting records the verdict, and reopening
     the question restores exactly what you left. Solutions live in their own
     store (js/solutions.js), NOT in the notebook: a half-finished attempt
     auto-written into My Notes would clutter a space the reader owns, and
     restoring a draft would then have to overwrite their own writing. */
  const saveDraft = debounce(() => flushDraft(), 1200);

  function flushDraft() {
    if (!current || !window.IQB.solutions) return;
    const code = editor.getValue();
    const prev = IQB.solutions.peek(current.id);
    if (code === current.starter.js && !prev) return;   // untouched stub isn't work
    if (prev && prev.code === code) return;
    /* Keep the verdict fields: editing after a pass shouldn't silently demote
       a solved question back to attempted. */
    IQB.solutions.save(current.id, {
      code: code, lang: "js",
      status: prev ? prev.status : "attempted",
      passed: prev ? prev.passed : 0,
      total: prev ? prev.total : 0,
      attempts: prev ? prev.attempts : 0
    });
  }

  function resetToStarter() {
    if (!current) return;
    editor.setValue(current.starter.js);
    flushDraft();
    editor.focus();
    toast("Starter code restored");
  }

  /* ---------- console ---------- */
  function clearConsole() { consoleEl.innerHTML = ""; consoleLines = 0; updateConsoleBadge(); }
  function print(level, text) {
    if (consoleLines >= MAX_LINES) return;
    consoleLines++;
    if (consoleLines === MAX_LINES) {
      consoleEl.appendChild(el("div", { class: "pg-line warn", text: "… output truncated at " + MAX_LINES + " lines" }));
      return;
    }
    consoleEl.appendChild(el("div", { class: "pg-line " + level, text: text }));
    updateConsoleBadge();
  }

  /* A console.log inside the solution still fires while test cases run, but
     the reader is looking at Test Result and never learns it printed. The tab
     carries the count until they look. */
  function updateConsoleBadge() {
    if (!consoleTab) return;
    const showing = consoleEl && !consoleEl.hidden;
    consoleTab.textContent = (consoleLines && !showing) ? "Console · " + consoleLines : "Console";
  }
  function setStatus(text, kind) {
    statusEl.textContent = text;
    // .solve-status must survive: assigning className wholesale is what dropped
    // it the first time round, and the element then can't be found again.
    statusEl.className = "solve-status pg-status" + (kind ? " " + kind : "");
  }

  /* ---------- run / submit ---------- */

  /* Only the button that started the run turns into Stop; the other two are
     disabled for the duration, which is the one time a dulled button here is
     telling the truth. */
  function startRun(btn, label) {
    running = true;
    activeBtn = btn;
    root.classList.add("running");
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = STOP_ICON + "Stop";
    btn.classList.add("is-stop");
    [runBtn, submitBtn].forEach((b) => { if (b !== btn) b.disabled = true; });
    setStatus(label, "");
    clearConsole();
    verdictEl.hidden = true;
  }
  function endRun() {
    running = false;
    root.classList.remove("running");
    if (activeBtn) {
      activeBtn.innerHTML = activeBtn.dataset.label;
      activeBtn.classList.remove("is-stop");
      activeBtn = null;
    }
    [runBtn, submitBtn].forEach((b) => { b.disabled = false; });
  }

  function runTests() {
    if (running) { runner.stop(); return; }
    if (!current) return;
    execute(runBtn, current.tests.slice(0, sampleCount(current)), false);
  }
  function submit() {
    if (running) { runner.stop(); return; }
    if (!current) return;
    execute(submitBtn, current.tests, true);
  }

  function execute(btn, tests, isSubmission) {
    if (!current) return;
    const q = current;
    flushDraft();
    startRun(btn, isSubmission ? "Judging…" : "Running examples…");
    showPanel("result");
    resultEl.innerHTML = "";

    runner.run({
      code: editor.getValue(),
      fn: q.fn,
      tests: tests,
      onLog: (msg) => print(msg.level, msg.text),
      onVerdict: (v) => {
        endRun();
        if (v.error) {
          setStatus("Error", "err");
          showVerdict(false, "Error", v.error);
          return;
        }
        renderCases(tests, v.cases);
        const allPassed = v.passed === v.total;
        setStatus(v.passed + " / " + v.total + " passed", allPassed ? "ok" : "err");
        showVerdict(
          allPassed,
          allPassed ? (isSubmission ? "Accepted" : "All examples passed") : "Wrong Answer",
          allPassed
            ? (isSubmission ? "All " + v.total + " test cases passed." : "Now press Submit to run the hidden cases too.")
            : v.passed + " of " + v.total + " test cases passed."
        );
        if (isSubmission) record(q, v, allPassed);
      },
      onTimeout: (ms) => {
        endRun();
        setStatus("Timed out", "err");
        showVerdict(false, "Time Limit Exceeded",
          "Your code ran longer than " + ms / 1000 + "s — usually an infinite loop, or a while-loop whose pointer never moves.");
      },
      onStopped: () => { endRun(); setStatus("Stopped", "warn"); },
      onError: (message) => { endRun(); setStatus("Error", "err"); showVerdict(false, "Error", message); }
    });
  }

  function record(q, v, allPassed) {
    if (!window.IQB.solutions) return;
    const prev = IQB.solutions.peek(q.id);
    IQB.solutions.save(q.id, {
      code: editor.getValue(),
      lang: "js",
      // a pass is permanent: editing afterwards must not un-solve the question
      status: allPassed || (prev && prev.status === "solved") ? "solved" : "attempted",
      passed: v.passed,
      total: v.total,
      attempts: (prev ? prev.attempts : 0) + 1
    });
    /* Solving it IS completing it — tick the same progress the rest of the app
       counts, so the sidebar and profile stay honest. */
    if (allPassed && IQB.app && IQB.app.markComplete) IQB.app.markComplete(q.id);
  }

  function showVerdict(ok, headline, detail) {
    verdictEl.hidden = false;
    verdictEl.className = "solve-verdict " + (ok ? "ok" : "bad");
    verdictEl.innerHTML = "";
    verdictEl.appendChild(el("strong", { text: headline }));
    if (detail) verdictEl.appendChild(el("span", { class: "solve-verdict-detail", text: detail }));
  }

  /* The case list doubles as the "Testcases" view before anything has run:
     called with no results it just lists the examples that Run will execute. */
  function renderCases(tests, cases) {
    resultEl.innerHTML = "";
    if (!tests) {
      if (!current) return;
      tests = current.tests.slice(0, sampleCount(current));
      resultEl.appendChild(el("p", { class: "solve-hint", text: "Run checks the examples below. Submit runs all " + current.tests.length + " cases." }));
    }
    tests.forEach((t, i) => {
      const c = cases ? cases[i] : null;
      const box = el("div", { class: "solve-case" + (c ? (c.ok ? " pass" : " fail") : "") });
      const head = el("div", { class: "solve-case-h" }, [
        el("span", { class: "solve-case-n", text: "Case " + (i + 1) })
      ]);
      if (c) head.appendChild(el("span", { class: "solve-case-tag", text: c.ok ? "Passed" : "Failed" }));
      box.appendChild(head);

      const dl = el("dl", { class: "cq-io" });
      dl.appendChild(el("dt", { text: "Input" }));
      dl.appendChild(el("dd", { text: argList(t.args) }));
      dl.appendChild(el("dt", { text: "Expected" }));
      dl.appendChild(el("dd", { text: show(t.expected) }));
      if (c && !c.ok) {
        dl.appendChild(el("dt", { text: c.error ? "Threw" : "Your output" }));
        dl.appendChild(el("dd", { class: "solve-got", text: c.error || c.gotText }));
      }
      box.appendChild(dl);
      resultEl.appendChild(box);
    });
  }

  IQB.coding = {
    isCoding: isCoding,
    solvable: solvable,
    buildProblem: buildProblem,
    buildSolutionGate: buildSolutionGate,
    solveButton: solveButton,
    open: open,
    close: close
  };
})();

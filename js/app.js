/* ============================================================
   Interview Questions Bank — application controller.
   Reads question data from the global IQB.data.* registry (each
   data/<category>.js file populates it), then renders and wires
   every feature: search, tabs, sidebar, dark mode, bookmarks,
   progress, random, copy, deep-linking, keyboard shortcuts,
   practice mode, export/import, print.
   ============================================================ */
(function () {
  const { qs, qsa, el, debounce, strip, toast, download } = IQB.utils;
  const store = IQB.storage;

  /* ---- category config (order + labels) ---- */
  const CATEGORIES = [
    { key: "all", label: "All" },
    { key: "angular", label: "Angular" },
    { key: "ngcoding", label: "Angular Coding" },
    { key: "javascript", label: "JavaScript" },
    { key: "typescript", label: "TypeScript" },
    { key: "html", label: "HTML" },
    { key: "css", label: "CSS" },
    { key: "coding", label: "JS Coding" },
    { key: "rxjs", label: "RxJS" },
    { key: "ngrx", label: "NgRx" },
    { key: "testing", label: "Testing" },
    { key: "java", label: "Java" },
    { key: "springboot", label: "Spring Boot" },
    { key: "sql", label: "SQL" },
    { key: "git", label: "Git" },
    { key: "general", label: "General" },
    { key: "behavioral", label: "Behavioral" }
  ];
  const labelOf = (k) => (CATEGORIES.find((c) => c.key === k) || { label: k }).label;

  /* ---- flatten all questions into one searchable index ---- */
  const ALL = [];
  CATEGORIES.forEach((c) => {
    if (c.key === "all") return;
    (IQB.data[c.key] || []).forEach((q) => {
      ALL.push({
        ...q,
        category: q.category || c.key,
        _search: [
          q.question || "",
          strip(q.answer),
          (q.tags || []).join(" "),
          q.tip || "",
          q.category || c.key
        ].join(" ").toLowerCase()
      });
    });
  });

  /* ---- state ---- */
  const state = {
    category: "all",
    query: "",
    difficulty: "all",
    bookmarkedOnly: false,
    practice: false
  };
  let bookmarks = store.getBookmarks();
  let progress = store.getProgress();

  /* ---- element refs (created/queried in init) ---- */
  let listEl, titleEl, tabsEl, sideEl, diffEl, searchEls = [], progFill, progLabel;
  let renderState = { items: [], shown: 0, CHUNK: 30, observer: null };

  /* ========================================================
     THEME
     ======================================================== */
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    const btn = qs("#theme-toggle");
    if (btn) {
      const dark = currentThemeIsDark();
      btn.textContent = dark ? "☀" : "☾";
      btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    }
  }
  function currentThemeIsDark() {
    const forced = document.documentElement.getAttribute("data-theme");
    if (forced) return forced === "dark";
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function toggleTheme() {
    const next = currentThemeIsDark() ? "light" : "dark";
    store.setTheme(next);
    applyTheme(next);
  }

  /* ========================================================
     BUILD STATIC UI (tabs, sidebar, difficulty filter)
     ======================================================== */
  function counts() {
    const map = { all: ALL.length };
    ALL.forEach((q) => { map[q.category] = (map[q.category] || 0) + 1; });
    return map;
  }

  function buildTabs() {
    const c = counts();
    tabsEl.innerHTML = "";
    CATEGORIES.forEach((cat) => {
      const n = c[cat.key] || 0;
      if (cat.key !== "all" && n === 0) return;
      const tab = el("button", {
        class: "tab", role: "tab", "data-cat": cat.key,
        style: cat.key === "all" ? "" : `--tab-c: var(--cat-${cat.key})`,
        onclick: () => setCategory(cat.key, true)
      }, [
        el("span", { class: "dot" }),
        document.createTextNode(cat.label),
        el("span", { class: "tab-n", text: String(n) })
      ]);
      tabsEl.appendChild(tab);
    });
  }

  function buildSidebar() {
    const c = counts();
    sideEl.innerHTML = "";
    sideEl.appendChild(el("p", { class: "sidebar-title", text: "Categories" }));

    // progress box
    const box = el("div", { class: "progress-box" }, [
      el("div", { class: "pl" }, [
        el("span", { text: "Progress" }),
        el("span", { id: "progress-label", text: "0 / " + ALL.length })
      ]),
      el("div", { class: "progress-track" }, [el("div", { class: "progress-fill", id: "progress-fill" })])
    ]);
    sideEl.appendChild(box);
    sideEl.appendChild(el("div", { class: "side-sep" }));

    CATEGORIES.forEach((cat) => {
      const n = c[cat.key] || 0;
      if (cat.key !== "all" && n === 0) return;
      const link = el("button", {
        class: "side-link", "data-cat": cat.key,
        style: cat.key === "all" ? "" : `--side-c: var(--cat-${cat.key})`,
        onclick: () => setCategory(cat.key, true)
      }, [
        el("span", { text: cat.label }),
        el("span", { class: "s-count", text: String(n) })
      ]);
      sideEl.appendChild(link);
    });
    progFill = qs("#progress-fill");
    progLabel = qs("#progress-label");
    updateProgressBar();
  }

  function buildDifficultyFilter() {
    diffEl.innerHTML = "";
    const opts = [
      { k: "all", label: "All levels" },
      { k: "beginner", label: "Beginner" },
      { k: "intermediate", label: "Intermediate" },
      { k: "advanced", label: "Advanced" }
    ];
    opts.forEach((o) => {
      diffEl.appendChild(el("button", {
        class: "chip-filter" + (state.difficulty === o.k ? " active" : ""),
        "data-diff": o.k,
        onclick: () => { state.difficulty = o.k; syncFilterChips(); render(); }
      }, o.label));
    });
  }
  function syncFilterChips() {
    qsa("[data-diff]", diffEl).forEach((b) =>
      b.classList.toggle("active", b.dataset.diff === state.difficulty));
  }

  /* ========================================================
     ACTIVE STATE SYNC
     ======================================================== */
  function setCategory(key, updateHash) {
    state.category = key;
    store.setLastTab(key);
    qsa(".tab", tabsEl).forEach((t) => t.classList.toggle("active", t.dataset.cat === key));
    qsa(".side-link", sideEl).forEach((s) => s.classList.toggle("active", s.dataset.cat === key));
    if (updateHash) history.replaceState(null, "", "#" + key);
    // scroll active tab into view
    const activeTab = qs(".tab.active", tabsEl);
    if (activeTab) activeTab.scrollIntoView({ inline: "center", block: "nearest" });
    render();
  }

  /* ========================================================
     FILTER + RENDER (chunked / lazy)
     ======================================================== */
  function filtered() {
    const q = state.query.trim().toLowerCase();
    return ALL.filter((item) => {
      if (state.category !== "all" && item.category !== state.category) return false;
      if (state.difficulty !== "all" && item.difficulty !== state.difficulty) return false;
      if (state.bookmarkedOnly && !bookmarks.has(item.id)) return false;
      if (q && !item._search.includes(q)) return false;
      return true;
    });
  }

  function render() {
    const items = filtered();
    renderState.items = items;
    renderState.shown = 0;

    titleEl.innerHTML = "";
    titleEl.appendChild(document.createTextNode(state.category === "all" ? "All Questions" : labelOf(state.category)));
    titleEl.appendChild(el("small", { text: items.length + (items.length === 1 ? " question" : " questions") }));

    listEl.innerHTML = "";
    if (renderState.observer) { renderState.observer.disconnect(); renderState.observer = null; }

    if (!items.length) {
      listEl.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "big", text: "🔍" }),
        el("h3", { text: "No questions found" }),
        el("p", { text: "Try a different search term, category, or difficulty." })
      ]));
      return;
    }
    renderChunk();

    // lazy-load sentinel
    if (renderState.shown < items.length) {
      const sentinel = el("div", { id: "load-sentinel", style: "height:1px" });
      listEl.appendChild(sentinel);
      renderState.observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          sentinel.remove();
          renderChunk();
          if (renderState.shown < renderState.items.length) {
            listEl.appendChild(sentinel);
          } else {
            renderState.observer.disconnect();
          }
        }
      }, { rootMargin: "300px" });
      renderState.observer.observe(sentinel);
    }
  }

  function renderChunk() {
    const { items, shown, CHUNK } = renderState;
    const next = items.slice(shown, shown + CHUNK);
    const frag = document.createDocumentFragment();
    next.forEach((q) => frag.appendChild(buildCard(q)));
    const sentinel = qs("#load-sentinel", listEl);
    if (sentinel) listEl.insertBefore(frag, sentinel);
    else listEl.appendChild(frag);
    renderState.shown += next.length;
  }

  function buildCard(q) {
    const card = el("article", {
      class: "qa-card" + (progress.has(q.id) ? " done" : ""),
      "data-id": q.id, "data-category": q.category, "data-difficulty": q.difficulty || "",
      style: `--cat: var(--cat-${q.category})`
    });

    // header (div with button semantics so we can nest the star button)
    const star = el("button", {
      class: "qa-star" + (bookmarks.has(q.id) ? " on" : ""),
      "aria-label": "Bookmark this question", title: "Bookmark",
      onclick: (e) => { e.stopPropagation(); toggleBookmark(q.id, star); }
    }, bookmarks.has(q.id) ? "★" : "☆");

    const top = el("div", { class: "qa-top" }, [
      el("span", { class: "badge cat", text: labelOf(q.category) }),
      q.difficulty ? el("span", { class: "badge diff-" + q.difficulty, text: cap(q.difficulty) }) : null,
      star
    ]);

    const question = el("div", { class: "qa-question", html: q.question });

    const tags = el("div", { class: "qa-tags" },
      (q.tags || []).slice(0, 5).map((t) => el("span", { class: "qa-tag", text: t })));
    const foot = el("div", { class: "qa-foot" }, [tags, el("span", { class: "qa-toggle", text: "+" })]);

    const head = el("div", {
      class: "qa-head", role: "button", tabindex: "0", "aria-expanded": "false",
      onclick: () => toggleCard(card),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCard(card); } }
    }, [top, question, foot]);

    // reveal button (practice mode)
    const reveal = el("button", {
      class: "reveal-btn",
      onclick: () => { card.classList.add("open", "revealed"); head.setAttribute("aria-expanded", "true"); markOpened(q.id); }
    }, "🙈 Show answer");

    // body
    const inner = el("div", { class: "qa-body-inner" });
    inner.appendChild(el("div", { class: "answer", html: q.answer || "" }));

    if (q.code) {
      const pre = el("pre", {}, [el("code", { text: q.code })]);
      const copy = el("button", {
        class: "copy-btn",
        onclick: (e) => { e.stopPropagation(); copyText(q.code, e.currentTarget); }
      }, "Copy");
      inner.appendChild(el("div", { class: "code-block" }, [copy, pre]));
    }
    if (q.tip) {
      inner.appendChild(el("div", { class: "qa-tip", html: "<b>Tip</b>" + escapeText(q.tip) }));
    }

    const doneBtn = el("button", {
      class: "qa-act" + (progress.has(q.id) ? " on" : ""),
      onclick: (e) => { e.stopPropagation(); toggleDone(q.id, doneBtn, card); }
    }, progress.has(q.id) ? "✓ Completed" : "○ Mark as done");

    const linkBtn = el("button", {
      class: "qa-act",
      onclick: (e) => { e.stopPropagation(); copyText(location.origin + location.pathname + "#q=" + q.id, e.currentTarget, "Link copied"); }
    }, "🔗 Copy link");

    inner.appendChild(el("div", { class: "qa-body-actions" }, [doneBtn, linkBtn]));

    const body = el("div", { class: "qa-body" }, [inner]);

    card.append(head, reveal, body);
    return card;
  }

  function toggleCard(card) {
    const open = card.classList.toggle("open");
    const head = qs(".qa-head", card);
    if (head) head.setAttribute("aria-expanded", String(open));
    if (open) {
      card.classList.add("revealed"); // header click reveals in practice mode too
      markOpened(card.dataset.id);
    }
  }

  /* ========================================================
     BOOKMARKS / PROGRESS / NOTES
     ======================================================== */
  function toggleBookmark(id, btn) {
    if (bookmarks.has(id)) { bookmarks.delete(id); btn.classList.remove("on"); btn.textContent = "☆"; }
    else { bookmarks.add(id); btn.classList.add("on"); btn.textContent = "★"; }
    store.saveBookmarks(bookmarks);
    if (state.bookmarkedOnly) render();
  }
  function toggleDone(id, btn, card) {
    if (progress.has(id)) { progress.delete(id); btn.classList.remove("on"); btn.textContent = "○ Mark as done"; card.classList.remove("done"); }
    else { progress.add(id); btn.classList.add("on"); btn.textContent = "✓ Completed"; card.classList.add("done"); }
    store.saveProgress(progress);
    updateProgressBar();
  }
  function markOpened(id) { store.setLastOpened(id); }
  function updateProgressBar() {
    if (!progFill) return;
    const pct = ALL.length ? Math.round((progress.size / ALL.length) * 100) : 0;
    progFill.style.width = pct + "%";
    if (progLabel) progLabel.textContent = progress.size + " / " + ALL.length;
  }

  /* ========================================================
     ACTIONS: random, expand/collapse, copy, export/import
     ======================================================== */
  function randomQuestion() {
    const pool = filtered();
    if (!pool.length) { toast("No questions to pick from"); return; }
    const q = pool[Math.floor(Math.random() * pool.length)];
    openQuestion(q.id, true);
  }
  function openQuestion(id, scroll) {
    const item = ALL.find((x) => x.id === id);
    if (!item) return;
    if (state.category !== "all" && state.category !== item.category) setCategory(item.category, true);
    state.query = ""; searchEls.forEach((s) => (s.value = ""));
    render();
    // ensure it is rendered (may be beyond first chunk)
    let guard = 0;
    (function ensure() {
      let card = qs(`.qa-card[data-id="${cssEscape(id)}"]`, listEl);
      if (!card && renderState.shown < renderState.items.length && guard++ < 40) {
        renderChunk(); return ensure();
      }
      if (card) {
        card.classList.add("open", "revealed");
        const head = qs(".qa-head", card); if (head) head.setAttribute("aria-expanded", "true");
        markOpened(id);
        if (scroll) card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    })();
  }
  function expandAll() { qsa(".qa-card", listEl).forEach((c) => { c.classList.add("open", "revealed"); }); }
  function collapseAll() { qsa(".qa-card", listEl).forEach((c) => { c.classList.remove("open", "revealed"); }); }

  function copyText(text, btn, msg) {
    const done = () => {
      toast(msg || "Copied to clipboard");
      if (btn && btn.classList.contains("copy-btn")) {
        const old = btn.textContent; btn.textContent = "Copied ✓"; btn.classList.add("done");
        setTimeout(() => { btn.textContent = old; btn.classList.remove("done"); }, 1400);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, cb) {
    const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = text;
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); cb(); } catch (e) {} ta.remove();
  }

  function exportData() {
    download("interview-bank-progress.json", store.exportAll());
    toast("Exported bookmarks + progress");
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importAll(reader.result);
        bookmarks = store.getBookmarks();
        progress = store.getProgress();
        updateProgressBar();
        render();
        toast("Imported successfully");
      } catch (e) { toast("Import failed — invalid file"); }
    };
    reader.readAsText(file);
  }

  /* ========================================================
     SEARCH + ROUTER + KEYBOARD
     ======================================================== */
  const doSearch = debounce(() => render(), 160);
  function onSearchInput(val) {
    state.query = val;
    searchEls.forEach((s) => { if (s.value !== val) s.value = val; });
    doSearch();
  }

  function parseHash() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!h) return;
    if (h.startsWith("q=")) { openQuestion(h.slice(2), true); return; }
    if (CATEGORIES.some((c) => c.key === h)) setCategory(h, false);
  }

  function onKeydown(e) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.key === "/" || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) ) {
      e.preventDefault(); focusSearch(); return;
    }
    if (e.key === "Escape") {
      if (state.query) { onSearchInput(""); }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      return;
    }
    if (typing) return;
    if (e.key.toLowerCase() === "r") { randomQuestion(); }
  }
  function focusSearch() {
    const visible = searchEls.find((s) => s.offsetParent !== null) || searchEls[0];
    if (visible) { visible.focus(); visible.select(); }
  }

  /* ========================================================
     HELPERS
     ======================================================== */
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function escapeText(s) { const d = document.createElement("span"); d.textContent = " " + s; return d.innerHTML; }
  function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }

  /* ========================================================
     INIT
     ======================================================== */
  function init() {
    // theme (before paint handled by inline script in <head>; re-sync button)
    applyTheme(store.getTheme());

    listEl = qs("#q-list");
    titleEl = qs("#content-title");
    tabsEl = qs("#tabs");
    sideEl = qs("#sidebar-nav");
    diffEl = qs("#difficulty-filter");
    searchEls = qsa(".js-search");

    buildTabs();
    buildSidebar();
    buildDifficultyFilter();

    // wire search inputs
    searchEls.forEach((s) => s.addEventListener("input", (e) => onSearchInput(e.target.value)));

    // wire toolbar
    on("#theme-toggle", "click", toggleTheme);
    on("#expand-all", "click", expandAll);
    on("#collapse-all", "click", collapseAll);
    on("#random-btn", "click", randomQuestion);
    on("#print-btn", "click", () => window.print());
    on("#export-btn", "click", exportData);
    on("#bookmark-filter", "click", (e) => {
      state.bookmarkedOnly = !state.bookmarkedOnly;
      e.currentTarget.classList.toggle("on", state.bookmarkedOnly);
      render();
    });
    on("#practice-toggle", "click", (e) => {
      state.practice = !state.practice;
      listEl.classList.toggle("practice", state.practice);
      e.currentTarget.classList.toggle("on", state.practice);
      toast(state.practice ? "Practice mode on — answers hidden" : "Practice mode off");
    });
    const importInput = qs("#import-file");
    on("#import-btn", "click", () => importInput && importInput.click());
    if (importInput) importInput.addEventListener("change", (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; });

    // hero pills
    qsa("[data-hero-cat]").forEach((p) => p.addEventListener("click", () => {
      setCategory(p.dataset.heroCat, true);
      qs(".tabs-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    // keyboard + hash routing
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("hashchange", parseHash);

    // initial state: hash > last tab
    const startTab = store.getLastTab();
    setCategory(CATEGORIES.some((c) => c.key === startTab) ? startTab : "all", false);
    parseHash();

    // register service worker (PWA) — only over http(s)
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }
  function on(sel, ev, fn) { const n = qs(sel); if (n) n.addEventListener(ev, fn); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

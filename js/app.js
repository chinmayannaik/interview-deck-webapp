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

  /* ---- category + group config, derived ENTIRELY from the content manifest ----
     Adding a new main field (group) or a new section (category) is a git-only
     change: edit manifest.json (+ the category's JSON file) and push. No website
     or app redeploy — both clients read groups, categories, order and colors
     straight from the manifest. */
  const MANIFEST = (window.IQB && IQB.manifest) || { groups: [], categories: [] };
  const CAT_META = MANIFEST.categories || [];

  const CATEGORIES = CAT_META.map((c) => ({ key: c.id, label: c.label }));

  /* per-category accent colors (from the manifest); future categories with no
     color fall back to a rotating palette so they still render sensibly. */
  const COLORS = {};
  CAT_META.forEach((c) => { if (c.color) COLORS[c.id] = c.color; });
  const FALLBACK_COLORS = ["#C3002F", "#B4820A", "#2F6FB0", "#7A4FD6", "#0B7285", "#1E8E57", "#9A5B34", "#A83294"];
  let _fbIdx = 0;
  const colorOf = (key) => COLORS[key] || (COLORS[key] = FALLBACK_COLORS[_fbIdx++ % FALLBACK_COLORS.length]);

  const GROUPS = (MANIFEST.groups || []).map((g) => ({
    key: g.id,
    label: g.label,
    color: g.color || colorOf((CAT_META.find((c) => c.group === g.id) || {}).id),
    cats: CAT_META.filter((c) => c.group === g.id).map((c) => c.id)
  }));
  const groupOf = (catKey) => GROUPS.find((g) => g.cats.includes(catKey)) || null;
  const isGroup = (key) => GROUPS.some((g) => g.key === key);
  const catsFor = (key) => {
    if (key === "all") return null; // no restriction
    if (isGroup(key)) return GROUPS.find((g) => g.key === key).cats;
    return [key]; // a single category
  };
  const labelOf = (k) =>
    (CATEGORIES.find((c) => c.key === k) || GROUPS.find((g) => g.key === k) || { label: k }).label;

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
  let listEl, titleEl, tabsEl, sideEl, subnavEl, diffEl, searchEls = [], progFill, progLabel;
  let mCatEl, mTopicEl, mDiffEl; // mobile dropdowns (section / topic / level)
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
    GROUPS.forEach((g) => { map[g.key] = g.cats.reduce((n, c) => n + (map[c] || 0), 0); });
    return map;
  }

  function buildTabs() {
    const c = counts();
    tabsEl.innerHTML = "";
    GROUPS.forEach((t) => {
      const n = c[t.key] || 0;
      if (n === 0) return;
      const tab = el("button", {
        class: "tab", role: "tab", "data-cat": t.key,
        style: `--tab-c: ${t.color}`,
        onclick: () => setCategory(t.key, true)
      }, [
        el("span", { class: "dot" }),
        document.createTextNode(t.label),
        el("span", { class: "tab-n", text: String(n) })
      ]);
      tabsEl.appendChild(tab);
    });
  }

  /* progress within a given set of categories */
  function progressFor(cats) {
    let total = 0, done = 0;
    ALL.forEach((q) => {
      if (cats.includes(q.category)) { total++; if (progress.has(q.id)) done++; }
    });
    return { done, total };
  }

  /* the sidebar is contextual: it shows ONLY the active group's categories,
     plus a progress tracker scoped to the current selection */
  function renderSidebar(key) {
    const c = counts();
    const groupKey = isGroup(key) ? key : (groupOf(key) ? groupOf(key).key : GROUPS[0].key);
    const group = GROUPS.find((g) => g.key === groupKey);
    sideEl.innerHTML = "";

    // progress tracker for the current selection (a category, or the whole group)
    const selCats = catsFor(key) || group.cats;
    const { done, total } = progressFor(selCats);
    const pct = total ? Math.round((done / total) * 100) : 0;
    sideEl.appendChild(el("div", { class: "progress-box", style: `--side-c: ${group.color}` }, [
      el("div", { class: "pl" }, [
        el("span", { text: labelOf(key) + " progress" }),
        el("span", { class: "prog-num", id: "progress-label", text: done + " / " + total })
      ]),
      el("div", { class: "progress-track" }, [
        el("div", { class: "progress-fill", id: "progress-fill", style: "width:" + pct + "%" })
      ])
    ]));

    // group header + "all of this group" link
    sideEl.appendChild(el("p", { class: "sidebar-title", text: group.label }));
    sideEl.appendChild(el("button", {
      class: "side-link" + (key === group.key ? " active" : ""),
      "data-cat": group.key, style: `--side-c: ${group.color}`,
      onclick: () => setCategory(group.key, true)
    }, [el("span", { text: "All " + group.label }), el("span", { class: "s-count", text: String(c[group.key]) })]));

    // only this group's categories
    group.cats.forEach((catKey) => {
      const n = c[catKey] || 0;
      if (n === 0) return;
      sideEl.appendChild(el("button", {
        class: "side-link side-sub" + (key === catKey ? " active" : ""),
        "data-cat": catKey, style: `--side-c: ${colorOf(catKey)}`,
        onclick: () => setCategory(catKey, true)
      }, [el("span", { text: labelOf(catKey) }), el("span", { class: "s-count", text: String(n) })]));
    });
  }

  /* mobile/tablet topic selector — a scrollable chip row of the active
     group's categories (the sidebar is hidden on small screens) */
  function renderSubnav(key) {
    if (!subnavEl) return;
    const c = counts();
    const groupKey = isGroup(key) ? key : (groupOf(key) ? groupOf(key).key : GROUPS[0].key);
    const group = GROUPS.find((g) => g.key === groupKey);
    subnavEl.innerHTML = "";

    subnavEl.appendChild(el("button", {
      class: "subchip" + (key === group.key ? " active" : ""),
      "data-cat": group.key,
      onclick: () => setCategory(group.key, true)
    }, [document.createTextNode("All " + group.label)]));

    group.cats.forEach((catKey) => {
      const n = c[catKey] || 0;
      if (n === 0) return;
      subnavEl.appendChild(el("button", {
        class: "subchip" + (key === catKey ? " active" : ""),
        "data-cat": catKey, style: `--sc: ${colorOf(catKey)}`,
        onclick: () => setCategory(catKey, true)
      }, [document.createTextNode(labelOf(catKey)), el("span", { class: "subchip-n", text: String(n) })]));
    });

    const active = qs(".subchip.active", subnavEl);
    if (active) active.scrollIntoView({ inline: "center", block: "nearest" });
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
        onclick: () => setDifficulty(o.k)
      }, o.label));
    });
  }
  function syncFilterChips() {
    qsa("[data-diff]", diffEl).forEach((b) =>
      b.classList.toggle("active", b.dataset.diff === state.difficulty));
    if (mDiffEl) mDiffEl.value = state.difficulty;
  }
  function setDifficulty(k) { state.difficulty = k; syncFilterChips(); render(); }

  /* ---- mobile dropdowns: native <select>s that replace the tab / topic /
     level chip rows on small screens (built once; kept in sync on change) ---- */
  function buildMobileControls() {
    if (!mCatEl) return;
    const c = counts();

    // section (top-level groups)
    mCatEl.innerHTML = "";
    GROUPS.forEach((g) => {
      const n = c[g.key] || 0;
      if (n === 0) return;
      mCatEl.appendChild(el("option", { value: g.key, text: g.label + " (" + n + ")" }));
    });
    mCatEl.addEventListener("change", () => setCategory(mCatEl.value, true));

    // level
    mDiffEl.innerHTML = "";
    [["all", "All Levels"], ["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]]
      .forEach(([k, label]) => mDiffEl.appendChild(el("option", { value: k, text: label })));
    mDiffEl.addEventListener("change", () => setDifficulty(mDiffEl.value));

    // topic (options rebuilt per active group in renderMobileTopic)
    mTopicEl.addEventListener("change", () => setCategory(mTopicEl.value, true));
  }

  function renderMobileTopic(key) {
    if (!mTopicEl) return;
    const c = counts();
    const groupKey = isGroup(key) ? key : (groupOf(key) ? groupOf(key).key : GROUPS[0].key);
    const group = GROUPS.find((g) => g.key === groupKey);
    mTopicEl.innerHTML = "";
    mTopicEl.appendChild(el("option", { value: group.key, text: "All " + group.label }));
    group.cats.forEach((catKey) => {
      const n = c[catKey] || 0;
      if (n === 0) return;
      mTopicEl.appendChild(el("option", { value: catKey, text: labelOf(catKey) + " (" + n + ")" }));
    });
    mTopicEl.value = isGroup(key) ? group.key : key;
  }

  /* ========================================================
     ACTIVE STATE SYNC
     ======================================================== */
  function setCategory(key, updateHash) {
    state.category = key;
    store.setLastTab(key);

    // light up the parent group tab (a category belongs to one group)
    const parentGroup = isGroup(key) ? key : (groupOf(key) ? groupOf(key).key : GROUPS[0].key);
    qsa(".tab", tabsEl).forEach((t) => t.classList.toggle("active", t.dataset.cat === parentGroup));

    // rebuild the sidebar (desktop) and the mobile topic row for this group
    renderSidebar(key);
    renderSubnav(key);

    // keep the mobile dropdowns in sync
    if (mCatEl) mCatEl.value = parentGroup;
    renderMobileTopic(key);

    if (updateHash) history.replaceState(null, "", "#" + key);
    const activeTab = qs(".tab.active", tabsEl);
    if (activeTab) activeTab.scrollIntoView({ inline: "center", block: "nearest" });
    render();
  }

  /* ========================================================
     FILTER + RENDER (chunked / lazy)
     ======================================================== */
  function filtered() {
    const q = state.query.trim().toLowerCase();
    const allowed = catsFor(state.category); // null = no category restriction
    return ALL.filter((item) => {
      if (allowed && !allowed.includes(item.category)) return false;
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
      style: `--cat: ${colorOf(q.category)}`
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

    // question is plain text — use text (not html) so literal tags like
    // "<!DOCTYPE html>" or "<router-outlet>" render instead of being parsed away
    const question = el("div", { class: "qa-question", text: q.question });

    const tags = el("div", { class: "qa-tags" },
      (q.tags || []).slice(0, 5).map((t) =>
        el("span", { class: "qa-tag" + (/^v\.?imp$/i.test(t) ? " vimp" : ""), text: t })));
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

    // optional in-depth study section
    if (q.deep) {
      const deepContent = el("div", { class: "qa-deep", hidden: "", html: q.deep });
      const deepBtn = el("button", {
        class: "qa-act deep-btn",
        onclick: (e) => {
          e.stopPropagation();
          const hidden = deepContent.hasAttribute("hidden");
          if (hidden) { deepContent.removeAttribute("hidden"); e.currentTarget.textContent = "📖 Hide deep dive"; markOpened(q.id); }
          else { deepContent.setAttribute("hidden", ""); e.currentTarget.textContent = "📖 Study in depth"; }
        }
      }, "📖 Study in depth");
      inner.appendChild(deepBtn);
      inner.appendChild(deepContent);
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
    syncPush();
    if (state.bookmarkedOnly) render();
  }
  function toggleDone(id, btn, card) {
    if (progress.has(id)) { progress.delete(id); btn.classList.remove("on"); btn.textContent = "○ Mark as done"; card.classList.remove("done"); }
    else { progress.add(id); btn.classList.add("on"); btn.textContent = "✓ Completed"; card.classList.add("done"); }
    store.saveProgress(progress);
    syncPush();
    updateProgressBar();
  }
  function markOpened(id) { store.setLastOpened(id); }

  /* ---- bridge for the optional cloud-sync module (js/sync.js) ---- */
  function syncPush() { if (window.IQB.sync) window.IQB.sync.pushSoon(); }
  function getSyncData() {
    return { progress: Array.from(progress), bookmarks: Array.from(bookmarks) };
  }
  function setSyncData(data) {
    if (data && Array.isArray(data.progress)) { progress = new Set(data.progress); store.saveProgress(progress); }
    if (data && Array.isArray(data.bookmarks)) { bookmarks = new Set(data.bookmarks); store.saveBookmarks(bookmarks); }
    render();
    updateProgressBar();
  }
  function getProgressSummary() {
    const groups = GROUPS.map((g) => {
      const p = progressFor(g.cats);
      return { key: g.key, label: g.label, color: g.color, done: p.done, total: p.total };
    });
    return { totalCompleted: progress.size, totalQuestions: ALL.length, groups: groups };
  }
  IQB.app = { getData: getSyncData, setData: setSyncData, getProgressSummary: getProgressSummary };
  function updateProgressBar() {
    const fill = qs("#progress-fill", sideEl);
    const label = qs("#progress-label", sideEl);
    if (!fill) return;
    const selCats = catsFor(state.category) || GROUPS[0].cats;
    const { done, total } = progressFor(selCats);
    fill.style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
    if (label) label.textContent = done + " / " + total;
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
    if (isGroup(h) || CATEGORIES.some((c) => c.key === h)) setCategory(h, false);
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
    subnavEl = qs("#subnav");
    diffEl = qs("#difficulty-filter");
    mCatEl = qs("#m-category");
    mTopicEl = qs("#m-topic");
    mDiffEl = qs("#m-difficulty");
    searchEls = qsa(".js-search");

    buildTabs();
    buildDifficultyFilter();
    buildMobileControls();

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
    const validStart = isGroup(startTab) || CATEGORIES.some((c) => c.key === startTab);
    setCategory(validStart ? startTab : GROUPS[0].key, false);
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

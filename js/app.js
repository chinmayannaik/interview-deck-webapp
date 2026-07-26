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

  const starOnSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  const starOffSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  /* The card's action row runs out of width on a phone (three labelled buttons
     need ~336px of a 313px row), so each label carries a short form for narrow
     screens — .qa-act-long/.qa-act-short swap, .qa-act-word simply drops. Only
     one of the pair is ever rendered, so screen readers still read one label.

     .qa-act is inline-flex, so every child is a flex item and picks up the 6px
     gap: a bare "Copy" + <span> link</span> renders as "Copy  link". Any label
     split across elements must therefore sit inside ONE .qa-act-label wrapper.
     The long/short pair is exempt — display:none removes the loser entirely. */
  const doneOffHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/></svg><span class="qa-act-long">Mark as done</span><span class="qa-act-short">Done</span>';
  const doneOnHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>Completed';

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

  /* The manifest's colours are authored for the light theme — dark, saturated inks
     meant for white paper. Injecting them inline as literal hexes pinned them to
     that lightness in BOTH themes, so on dark a category badge sat at 3.4:1, the
     Tip label at 2.8:1 and a deep-dive heading at 3.4:1 (all AA failures), while
     the per-category tokens each theme carefully defines went unread by anything
     at all. Emit a reference to the token instead, with the manifest hex
     as the CSS fallback: known categories now follow the theme, and a brand-new
     one added to manifest.json alone still renders on its manifest colour with no
     code change — which is the point of the manifest being the source of truth. */
  const catColor = (key) => `var(--cat-${key}, ${colorOf(key)})`;
  const groupColor = (g) => `var(--group-${g.key}, ${g.color})`;

  const GROUPS = (MANIFEST.groups || []).map((g) => ({
    key: g.id,
    label: g.label,
    color: g.color || colorOf((CAT_META.find((c) => c.group === g.id) || {}).id),
    cats: CAT_META.filter((c) => c.group === g.id).map((c) => c.id)
  }));
  const groupOf = (catKey) => GROUPS.find((g) => g.cats.includes(catKey)) || null;
  const isGroup = (key) => GROUPS.some((g) => g.key === key);

  /* A pseudo-tab: it sits in the group tab row but holds no questions, so it
     never reaches the filter/render path — setCategory() forks before that. */
  const PLAYGROUND = "playground";
  /* Same idea as PLAYGROUND: a tab that holds no questions, so setCategory
     forks before the filter/render path ever sees it. */
  const NOTEBOOK = "notes";
  /* Where to return when Playground (or My Notes) is toggled off — the last
     real question view, not the pseudo-tabs themselves. */
  let lastQuestionsCategory = GROUPS[0] ? GROUPS[0].key : "all";
  const catsFor = (key) => {
    if (key === "all") return null; // no restriction
    if (isGroup(key)) return GROUPS.find((g) => g.key === key).cats;
    return [key]; // a single category
  };
  const labelOf = (k) =>
    (CATEGORIES.find((c) => c.key === k) || GROUPS.find((g) => g.key === k) || { label: k }).label;

  /* Tech mark for a category, tinted with that category's manifest colour.
     Groups ("Frontend", "Backend") and "all" get none — they're not a technology,
     and a logo per group would just be decoration. Unknown ids still render:
     IQB.icons falls back to a default mark, so a category added to the manifest
     later needs no change here. */
  const catIcon = (key) => {
    if (key === "all" || isGroup(key) || !window.IQB.icons) return null;
    // --ic rather than `color` directly: an active subchip paints that same accent
    // as its background, and a plain custom property lets the CSS there re-tint the
    // mark without having to out-specify an inline style.
    return el("span", {
      class: "cat-ic", html: IQB.icons.svg(key), style: `--ic: ${catColor(key)}`
    });
  };

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

  // Sort questions: beginner (Basics) -> intermediate -> advanced
  const DIFF_WEIGHT = { "beginner": 1, "intermediate": 2, "advanced": 3 };
  ALL.sort((a, b) => {
    const wA = DIFF_WEIGHT[a.difficulty] || 1;
    const wB = DIFF_WEIGHT[b.difficulty] || 1;
    return wA - wB;
  });

  /* ---- state ---- */
  const state = {
    category: "all",
    query: "",
    difficulty: "all",
    bookmarkedOnly: false,
    completedOnly: false,
    uncompletedOnly: false,
    hasNoteOnly: false,
    hasVideoOnly: false,
    /* Revise Mode (persisted): when on, an opened card shows only its crisp
       `revise` recap plus a per-card Learn/Revise toggle. Off = Learn Mode (the
       full answer/code/tip/deep). Purely a display concern — the CSS
       (body.revise-mode) does the hiding; this flag drives the header switch. */
    revise: store.getReviseMode(),
    /* AI Tutor "important questions" curation: aiSuggestedIds is the set of
       question ids the tutor's keywords matched in the current category, and
       aiOnly is the toggle that narrows the list to just those. Both are wiped
       when the reader navigates to another category (see setCategory). */
    aiOnly: false,
    aiSuggestedIds: null,
    aiSuggestedKeywords: null
  };

  /* True once the reader has expressed an explicit choice this session — opened
     a link carrying a hash, or picked a tab/category themselves. The cloud view
     restore (js/sync.js) checks this: signing in must never yank someone out of
     the view they are already reading. Boot's own setCategory doesn't pin. */
  let viewPinned = false;
  let bookmarks = store.getBookmarks();
  let progress = store.getProgress();

  /* ---- focus pack: a role-based subset of the whole bank ----
     A pack (from the content repo's packs/*.json, loaded into IQB.packs by
     data-loader.js) names whole categories plus cherry-picked question ids.
     When one is active every count, list and progress figure narrows to the
     pack's questions — the rest of the app needs no awareness beyond inPack():
     tabs, sidebar, dropdowns and empty-category hiding all derive from
     counts(), which already skips zero-count entries. */
  let activePack = null;   // the pack object, or null = off
  let packSet = null;      // Set of question ids, or null = off
  function resolvePackSet(pack) {
    const set = new Set(pack.questionIds || []);
    (pack.categories || []).forEach((cat) => {
      (IQB.data[cat] || []).forEach((q) => set.add(q.id));
    });
    return set;
  }
  const inPack = (q) => !packSet || packSet.has(q.id);
  (function restoreFocusPack() {
    const saved = store.getFocusPack();
    if (saved && window.IQB.packs && IQB.packs[saved]) {
      activePack = IQB.packs[saved];
      packSet = resolvePackSet(activePack);
    } else if (saved) {
      store.setFocusPack(null); // stale pack id from an older content version
    }
  })();

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
    const dark = currentThemeIsDark();
    const icon = dark
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    const label = dark ? "Switch to light mode" : "Switch to dark mode";

    /* Two triggers, one state: the moon in the desktop header and the labelled
       row inside the mobile tools sheet (the header has no room for it on a
       phone). Both are updated here so neither can fall out of step. */
    const btn = qs("#theme-toggle");
    if (btn) {
      btn.innerHTML = icon;
      btn.setAttribute("aria-label", label);
    }
    const mBtn = qs("#theme-toggle-m");
    if (mBtn) {
      mBtn.innerHTML = icon + (dark ? "Light mode" : "Dark mode");
      mBtn.setAttribute("aria-label", label);
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
    const map = { all: 0 };
    ALL.forEach((q) => {
      if (!inPack(q)) return;
      map.all++;
      map[q.category] = (map[q.category] || 0) + 1;
    });
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
        style: `--tab-c: ${groupColor(t)}`,
        onclick: () => setCategory(t.key, true)
      }, [
        el("span", { class: "dot" }),
        document.createTextNode(t.label),
        el("span", { class: "tab-n", text: String(n) })
      ]);
      tabsEl.appendChild(tab);
    });

    /* Playground and My Notes live in the header (and the phone section
       dropdown), not the category strip — they aren't question groups. */
  }

  /* progress within a given set of categories */
  function progressFor(cats) {
    let total = 0, done = 0;
    ALL.forEach((q) => {
      if (!inPack(q)) return;
      if (cats.includes(q.category)) { total++; if (progress.has(q.id)) done++; }
    });
    return { done, total };
  }

  /* A category the reader has actually engaged with: >=1 question completed or
     bookmarked. Derived from data that already syncs, so it costs nothing to
     store and can never go stale — this, not the group, is the unit progress is
     reported in. An Angular reader who never opens React should never see React
     in a denominator. */
  function isStarted(cat) {
    return ALL.some((q) => inPack(q) && q.category === cat && (progress.has(q.id) || bookmarks.has(q.id)));
  }

  /* What the sidebar tracker reports for the current selection. A single
     category speaks for itself. A group is scoped to the reader's STARTED
     categories only — "finish all of Frontend" was never anyone's goal, so
     the group bar answers "how far into MY frontend topics am I?" instead.
     Returns null when nothing is started yet: the box is omitted entirely
     rather than opening with a demoralising 0 / 430. */
  function sidebarProgress(key) {
    if (!isGroup(key) && key !== "all") {
      return { label: labelOf(key) + " progress", ...progressFor([key]) };
    }
    const cats = (catsFor(key) || GROUPS[0].cats).filter(isStarted);
    if (!cats.length) return null;
    /* "Your progress", not "Your Frontend progress": the group is already named
       by the sidebar title directly beneath, and the longer label wrapped to a
       second line — so the box changed height between category and group views
       and the whole nav jumped on every switch. */
    return { label: "Your progress", ...progressFor(cats) };
  }

  /* the sidebar is contextual: it shows ONLY the active group's categories,
     plus a progress tracker scoped to the current selection */
  function renderSidebar(key) {
    const c = counts();
    const groupKey = isGroup(key) ? key : (groupOf(key) ? groupOf(key).key : GROUPS[0].key);
    const group = GROUPS.find((g) => g.key === groupKey);
    sideEl.innerHTML = "";

    // progress tracker for the current selection — a category, or (on a group
    // tab) the reader's started categories within it. Absent until something
    // is started: see sidebarProgress().
    const prog = sidebarProgress(key);
    if (prog) {
      const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
      sideEl.appendChild(el("div", { class: "progress-box", style: `--side-c: ${groupColor(group)}` }, [
        el("div", { class: "pl" }, [
          el("span", { text: prog.label }),
          el("span", { class: "prog-num", id: "progress-label", text: prog.done + " / " + prog.total })
        ]),
        el("div", { class: "progress-track" }, [
          el("div", { class: "progress-fill", id: "progress-fill", style: "width:" + pct + "%" })
        ])
      ]));
    }

    // group header + "all of this group" link
    sideEl.appendChild(el("p", { class: "sidebar-title", text: group.label }));
    /* Same shape as the category links below (icon + label + count) rather than
       a bare label: when the sidebar collapses to an icon rail beside the AI
       Helper, a link with no icon would collapse to an empty box. `title` is
       what names it in that state, where the label is not rendered. */
    const allIc = el("span", { class: "cat-ic", style: `--ic: ${groupColor(group)}` });
    allIc.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
    sideEl.appendChild(el("button", {
      class: "side-link" + (key === group.key ? " active" : ""),
      "data-cat": group.key, style: `--side-c: ${groupColor(group)}`,
      title: "All " + group.label,
      onclick: () => setCategory(group.key, true)
    }, [
      el("span", { class: "side-link-label" }, [allIc, el("span", { text: "All " + group.label })]),
      el("span", { class: "s-count", text: String(c[group.key] || 0) })
    ]));

    // only this group's categories
    group.cats.forEach((catKey) => {
      const n = c[catKey] || 0;
      if (n === 0) return;
      sideEl.appendChild(el("button", {
        class: "side-link side-sub" + (key === catKey ? " active" : ""),
        "data-cat": catKey, style: `--side-c: ${catColor(catKey)}`,
        title: labelOf(catKey) + " — " + n + " question" + (n === 1 ? "" : "s"),
        onclick: () => setCategory(catKey, true)
      }, [
        el("span", { class: "side-link-label" }, [catIcon(catKey), el("span", { text: labelOf(catKey) })]),
        el("span", { class: "s-count", text: String(n) })
      ]));
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
        "data-cat": catKey, style: `--sc: ${catColor(catKey)}`,
        onclick: () => setCategory(catKey, true)
      }, [catIcon(catKey), document.createTextNode(labelOf(catKey)), el("span", { class: "subchip-n", text: String(n) })]));
    });

    /* "nearest", never "center": centering scrolls the strip even when the
       chip is already fully visible, dragging the row out from under the
       pointer on every click. Nearest is a no-op unless the chip is actually
       cut off at an edge — and then it moves the minimum distance. */
    const active = qs(".subchip.active", subnavEl);
    if (active) active.scrollIntoView({ inline: "nearest", block: "nearest" });
  }

  /* Counts per difficulty in the current topic (pack + category), so the
     segment can show "Easy 20" style tallies without applying the level filter. */
  function difficultyCounts() {
    const allowed = catsFor(state.category);
    const map = { all: 0, beginner: 0, intermediate: 0, advanced: 0 };
    ALL.forEach((item) => {
      if (!inPack(item)) return;
      if (allowed && !allowed.includes(item.category)) return;
      map.all++;
      if (item.difficulty && map[item.difficulty] != null) map[item.difficulty]++;
    });
    return map;
  }

  function buildDifficultyFilter() {
    diffEl.innerHTML = "";
    const seg = el("div", {
      class: "diff-seg", role: "tablist", "aria-label": "Difficulty"
    });
    const opts = [
      { k: "all", label: "All levels" },
      { k: "beginner", label: "Beginner" },
      { k: "intermediate", label: "Intermediate" },
      { k: "advanced", label: "Advanced" }
    ];
    opts.forEach((o) => {
      const btn = el("button", {
        class: "diff-seg-opt" + (state.difficulty === o.k ? " active" : ""),
        type: "button", role: "tab",
        "data-diff": o.k, title: o.label,
        "aria-selected": state.difficulty === o.k ? "true" : "false",
        onclick: () => setDifficulty(o.k)
      }, [
        document.createTextNode(o.label),
        el("span", { class: "diff-seg-n", "data-diff-n": o.k, text: "0" })
      ]);
      seg.appendChild(btn);
    });
    diffEl.appendChild(seg);
    syncFilterChips();
  }
  function syncFilterChips() {
    if (!diffEl) return;
    const n = difficultyCounts();
    qsa("[data-diff]", diffEl).forEach((b) => {
      const on = b.dataset.diff === state.difficulty;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
      const badge = qs("[data-diff-n]", b);
      if (badge) {
        const c = n[b.dataset.diff] || 0;
        badge.textContent = String(c);
        /* "All" stays label-only when it would just repeat the title count */
        badge.hidden = b.dataset.diff === "all";
      }
    });
    if (mDiffEl) mDiffEl.value = state.difficulty;
    if (window.IQB.select) IQB.select.syncAll();
  }
  function setDifficulty(k) { state.difficulty = k; syncFilterChips(); render(); }

  /* ---- mobile dropdowns: native <select>s that replace the tab / topic /
     level chip rows on small screens (built once; kept in sync on change) ---- */
  /* Section (top-level group) options only — split out of buildMobileControls
     so a focus-pack toggle can rebuild the list (groups appear/vanish with
     their pack counts) without re-binding the change listeners. */
  function renderMobileSections() {
    if (!mCatEl) return;
    const c = counts();
    mCatEl.innerHTML = "";
    GROUPS.forEach((g) => {
      const n = c[g.key] || 0;
      if (n === 0) return;
      mCatEl.appendChild(el("option", { value: g.key, text: g.label + " (" + n + ")" }));
    });
    /* My Notes rides in the section dropdown on phones: the header button is
       hidden under 640px, and before this entry a phone had NO path to the
       notebook at all (the tab it used to live in sits in the desktop-only
       strip). */
    if (window.IQB.playground) mCatEl.appendChild(el("option", { value: PLAYGROUND, text: "Playground JS" }));
    if (window.IQB.notebookUI) mCatEl.appendChild(el("option", { value: NOTEBOOK, text: "My Notes" }));
  }

  function buildMobileControls() {
    if (!mCatEl) return;

    // section (top-level groups)
    renderMobileSections();
    mCatEl.addEventListener("change", () => setCategory(mCatEl.value, true));

    // level
    mDiffEl.innerHTML = "";
    [["all", "All Levels"], ["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]]
      .forEach(([k, label]) => mDiffEl.appendChild(el("option", { value: k, text: label })));
    mDiffEl.addEventListener("change", () => setDifficulty(mDiffEl.value));

    // topic (options rebuilt per active group in renderMobileTopic)
    mTopicEl.addEventListener("change", () => setCategory(mTopicEl.value, true));

    /* Swap the native <option> popups for the styled combobox (js/select.js).
       These selects stay the model; only the popup changes. Passing catIcon in
       means the topic list marks its categories and skips groups by the very
       same rule the sidebar uses. */
    if (window.IQB.select) {
      IQB.select.enhance(mCatEl);                    // sections are groups — no marks
      IQB.select.enhance(mTopicEl, { icon: catIcon });
      IQB.select.enhance(mDiffEl);
    }
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
  /* Swaps the whole content column for the playground. body.pg-mode does the
     hiding in CSS so the sidebar, tools, subnav and mobile dropdowns — none of
     which mean anything without questions — stay untouched in JS. */
  /* Swaps the content column for My Notes. Mirrors showPlayground: body.nb-mode
     does the hiding in CSS so the sidebar/subnav/toolbars stay untouched here. */
  function showNotebook(on) {
    if (on) {
      window.scrollTo(0, 0);
      const shell = qs("#header-shell");
      if (shell) shell.classList.remove("is-collapsed");
      document.documentElement.style.setProperty("--header-offset", "var(--header-shell-h)");
    }
    document.body.classList.toggle("nb-mode", on);
    if (!on) document.body.classList.remove("nb-editing");
    const nbEl = qs("#notebook");
    if (nbEl) nbEl.hidden = !on;
    if (!window.IQB.notebookUI) return;
    if (on) IQB.notebookUI.onShow();
    else IQB.notebookUI.onHide();
  }

  function showPlayground(on) {
    /* The playground fills the viewport below the header, so it can't inherit a
       collapsed header: the shell is sticky and the scroll handler leaves
       --header-offset wherever the last scroll left it. Reset both, then lock
       body scroll so the only scrollers are the editor and the output. */
    if (on) {
      window.scrollTo(0, 0);
      const shell = qs("#header-shell");
      if (shell) shell.classList.remove("is-collapsed");
      document.documentElement.style.setProperty("--header-offset", "var(--header-shell-h)");
    }
    document.body.classList.toggle("pg-mode", on);
    const pgEl = qs("#playground");
    if (pgEl) pgEl.hidden = !on;
    if (!window.IQB.playground) return;
    if (on) IQB.playground.onShow();
    else IQB.playground.onHide();
  }

  function setCategory(key, updateHash) {
    /* Leaving the view tears down the cards being read, so the player would be
       narrating a question that is no longer on screen. Every tab, sidebar and
       dropdown funnels through here, so one call covers them all. */
    if (window.IQB.speak && key !== state.category) IQB.speak.stop();

    if (key !== PLAYGROUND && key !== NOTEBOOK) lastQuestionsCategory = key;

    state.category = key;
    // A category change abandons any AI-suggested view — its ids belong to the
    // category the reader just left. applyAiSuggestion re-establishes it right
    // after, so a tutor-driven switch keeps working.
    state.aiOnly = false; state.aiSuggestedIds = null; state.aiSuggestedKeywords = null;
    store.setLastTab(key);          // device-local; survives signed-out too
    /* updateHash is only ever true when the reader themselves picked this view
       (a tab, a sidebar category, a dropdown) — boot and the cloud restore pass
       false. So it doubles as "this was a deliberate choice". */
    if (updateHash) viewPinned = true;
    // mirror the choice into the reader's cloud profile (no-op when signed out)
    if (window.IQB.sync && IQB.sync.pushSoon) IQB.sync.pushSoon();

    // header buttons carry the active state their old tabs used to
    const nbBtn = qs("#mynotes-btn");
    if (nbBtn) {
      nbBtn.classList.toggle("active", key === NOTEBOOK);
      nbBtn.setAttribute("aria-pressed", String(key === NOTEBOOK));
    }
    const pgBtn = qs("#playground-btn");
    if (pgBtn) {
      pgBtn.classList.toggle("active", key === PLAYGROUND);
      pgBtn.setAttribute("aria-pressed", String(key === PLAYGROUND));
    }

    if (key === NOTEBOOK) {
      qsa(".tab", tabsEl).forEach((t) => t.classList.remove("active"));
      showPlayground(false);
      showNotebook(true);
      if (mCatEl) mCatEl.value = NOTEBOOK;
      if (window.IQB.select) IQB.select.syncAll();
      if (updateHash) history.replaceState(null, "", "#" + key);
      return;
    }
    showNotebook(false);

    if (key === PLAYGROUND) {
      qsa(".tab", tabsEl).forEach((t) => t.classList.remove("active"));
      showPlayground(true);
      if (mCatEl) mCatEl.value = PLAYGROUND;
      if (window.IQB.select) IQB.select.syncAll();
      if (updateHash) history.replaceState(null, "", "#" + key);
      return;
    }
    showPlayground(false);

    // light up the parent group tab (a category belongs to one group)
    const parentGroup = isGroup(key) ? key : (groupOf(key) ? groupOf(key).key : GROUPS[0].key);
    qsa(".tab", tabsEl).forEach((t) => t.classList.toggle("active", t.dataset.cat === parentGroup));

    // rebuild the sidebar (desktop) and the mobile topic row for this group
    renderSidebar(key);
    renderSubnav(key);

    // keep the mobile dropdowns in sync
    if (mCatEl) mCatEl.value = parentGroup;
    renderMobileTopic(key);
    // assigning .value fires no event, so the styled buttons have to be told
    if (window.IQB.select) IQB.select.syncAll();

    if (updateHash) history.replaceState(null, "", "#" + key);
    // "nearest", never "center" — see renderSubnav for why
    const activeTab = qs(".tab.active", tabsEl);
    if (activeTab) activeTab.scrollIntoView({ inline: "nearest", block: "nearest" });
    render();
    // Let an open AI Coach retarget its welcome chips to this category.
    if (window.IQB.tutor && IQB.tutor.onCategoryChanged) IQB.tutor.onCategoryChanged();
  }

  /* ========================================================
     FILTER + RENDER (chunked / lazy)
     ======================================================== */
  function filtered() {
    const q = state.query.trim().toLowerCase();
    const allowed = catsFor(state.category); // null = no category restriction
    const items = ALL.filter((item) => {
      if (!inPack(item)) return false;
      if (allowed && !allowed.includes(item.category)) return false;
      if (state.aiOnly && state.aiSuggestedIds && !state.aiSuggestedIds.has(item.id)) return false;
      if (state.difficulty !== "all" && item.difficulty !== state.difficulty) return false;
      if (state.bookmarkedOnly && !bookmarks.has(item.id)) return false;
      if (state.completedOnly && !progress.has(item.id)) return false;
      if (state.uncompletedOnly && progress.has(item.id)) return false;
      if (state.hasNoteOnly) {
        // Reads the notebook, not the old per-question store: after the
        // migration in js/notebook.js that is where a question's note lives,
        // and a note written today never touches the legacy map at all.
        const note = window.IQB.notebook ? IQB.notebook.byQuestion(item.id) : null;
        if (!(note && (note.plain || "").trim())) return false;
      }
      if (state.hasVideoOnly && !(item.youtube && item.youtube.trim())) return false;
      if (q && !item._search.includes(q)) return false;
      return true;
    });
    /* Revise Mode: keep difficulty order (beginner → …), but float completed
       questions to the top within each band so a revision pass starts with
       what the reader already knows. */
    if (!state.revise) return items;
    return items.slice().sort((a, b) => {
      const wA = DIFF_WEIGHT[a.difficulty] || 1;
      const wB = DIFF_WEIGHT[b.difficulty] || 1;
      if (wA !== wB) return wA - wB;
      return (progress.has(a.id) ? 0 : 1) - (progress.has(b.id) ? 0 : 1);
    });
  }

  function render() {
    const items = filtered();
    renderState.items = items;
    renderState.shown = 0;
    syncFilterCount();
    syncFilterChips();
    syncAiChip();

    titleEl.innerHTML = "";
    const titleIc = catIcon(state.category);
    if (titleIc) titleEl.appendChild(titleIc);
    titleEl.appendChild(document.createTextNode(state.category === "all" ? "All Questions" : labelOf(state.category)));
    titleEl.appendChild(el("small", { text: items.length + (items.length === 1 ? " question" : " questions") }));

    listEl.innerHTML = "";
    if (renderState.observer) { renderState.observer.disconnect(); renderState.observer = null; }

    if (!items.length) {
      listEl.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "big", html: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: var(--muted);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' }),
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
    next.forEach((q, idx) => frag.appendChild(buildCard(q, shown + idx + 1)));
    const sentinel = qs("#load-sentinel", listEl);
    if (sentinel) listEl.insertBefore(frag, sentinel);
    else listEl.appendChild(frag);
    renderState.shown += next.length;
  }

  /* Plain-text answer for the AI Tutor's "Ask AI" context — case-preserving
     (unlike IQB.utils.strip, which lowercases for search indexing). */
  function stripToText(html) {
    const d = document.createElement("div");
    d.innerHTML = html || "";
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }

  /* The crisp line shown in Revise Mode. Prefers the authored `revise` field;
     falls back to `tip`, then to a truncated plain-text `answer`, so Revise Mode
     is never blank while `revise` is still being backfilled across the bank.
     Returns { text, fallback } — `fallback` lets the card hint (subtly) that the
     recap is auto-derived rather than hand-written. */
  function reviseText(q) {
    if (q.revise && String(q.revise).trim()) {
      return { text: String(q.revise).trim(), fallback: false };
    }
    const tip = stripToText(q.tip || "");
    if (tip) return { text: tip, fallback: true };
    const ans = stripToText(q.answer || "");
    return { text: ans.length > 180 ? ans.slice(0, 179).trimEnd() + "…" : ans, fallback: true };
  }

  /* Reflect state.revise onto the DOM: the body class the card CSS reads, and
     the header study-mode switch. Cards left in `.detail-open` from a previous
     Revise session are reset so leaving and re-entering Revise Mode starts
     every card back at its recap (and its "Deep Dive" label). */
  function paintDetailToggle(btn, open) {
    btn.textContent = open ? "Quick Recap" : "Deep Dive";
    btn.setAttribute("aria-pressed", String(open));
    btn.title = open ? "Back to the quick recap" : "Show the full deep dive answer";
  }

  function applyReviseMode() {
    document.body.classList.toggle("revise-mode", state.revise);
    const prep = qs("#mode-prep"), rev = qs("#mode-revise");
    if (prep) { prep.classList.toggle("is-active", !state.revise); prep.setAttribute("aria-pressed", String(!state.revise)); }
    if (rev) { rev.classList.toggle("is-active", state.revise); rev.setAttribute("aria-pressed", String(state.revise)); }
    if (state.revise) {
      qsa(".qa-card.detail-open").forEach((c) => c.classList.remove("detail-open"));
      qsa(".qa-detail-toggle").forEach((btn) => paintDetailToggle(btn, false));
    }
  }

  function setReviseMode(on, announce) {
    if (state.revise === on) return;
    state.revise = on;
    store.setReviseMode(on);
    /* Listen is hidden in Revise Mode — stop any in-flight read-aloud so the
       floating player isn't left speaking with no card control to halt it. */
    if (on && window.IQB.speak) IQB.speak.stop();
    applyReviseMode();
    render(); // re-order: completed floats to the top of each difficulty band
    if (announce) {
      toast(on ? "Revise mode" : "Learn mode");
    }
  }

  /* A bottom "collapse" affordance for long expandable regions (the card, the
     deep dive, a personal note), so the reader can close from where they
     finished reading instead of scrolling back up to the top control. It's
     labelled with an up-chevron — a bare icon at the foot of long content is
     hard to discover. Shared shape; each caller supplies what "collapse" means. */
  function collapseFoot(label, onClick) {
    const btn = el("button", {
      class: "collapse-foot", type: "button", "aria-label": label, title: label,
      onclick: (e) => { e.stopPropagation(); onClick(e); }
    });
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>' +
      '<span>' + label + '</span>';
    return btn;
  }

  function buildCard(q, index) {
    const card = el("article", {
      class: "qa-card" + (progress.has(q.id) ? " done" : ""),
      "data-id": q.id, "data-category": q.category, "data-difficulty": q.difficulty || "",
      style: `--cat: ${catColor(q.category)}`
    });

    /* Coding questions (manifest `"mode": "coding"`) get the Solve IDE and a
       card that shows the problem only — see the body section below. */
    const coding = !!(window.IQB.coding && IQB.coding.solvable(q));

    // header (div with button semantics so we can nest the star button)
    const star = el("button", {
      class: "qa-star" + (bookmarks.has(q.id) ? " on" : ""),
      "aria-label": "Bookmark this question", title: "Bookmark",
      onclick: (e) => { e.stopPropagation(); toggleBookmark(q.id, star); }
    });
    star.innerHTML = bookmarks.has(q.id) ? starOnSvg : starOffSvg;

    /* The one, unambiguous open/close control — an icon-only chevron button in
       the top action row (never the card body), so a stray tap on the answer
       can't collapse it. Down when closed, up when open (CSS rotates on
       .qa-card.open). */
    const toggleBtn = el("button", {
      class: "qa-toggle", type: "button", "aria-label": "Show answer", title: "Show answer",
      onclick: (e) => { e.stopPropagation(); toggleCard(card); }
    });
    toggleBtn.innerHTML =
      '<svg class="qa-toggle-chev" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

    /* A one-tap "mark complete" circle right in the header, so the reader can tick
       a question off without opening it. Empty ring when pending, filled green
       check when done — shares the same `progress` state as the footer button
       (toggleDone syncs both). */
    const doneToggle = el("button", {
      class: "qa-done" + (progress.has(q.id) ? " on" : ""), type: "button",
      "aria-label": progress.has(q.id) ? "Marked complete — tap to undo" : "Mark as complete",
      "aria-pressed": progress.has(q.id) ? "true" : "false", title: "Mark as complete",
      onclick: (e) => { e.stopPropagation(); toggleDone(q.id, card); }
    });
    doneToggle.innerHTML =
      '<svg class="qa-done-check" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

    /* Revise Mode chip lives in the header action cluster (top-right) so the
       recap body stays full-width — especially on phones where the old
       side-by-side squeezed the question. Hidden outside Revise via CSS. */
    let detailBtn = null;
    if (!coding) {
      detailBtn = el("button", {
        class: "qa-act qa-detail-toggle", type: "button", "aria-pressed": "false",
        title: "Show the full deep dive answer",
        onclick: (e) => {
          e.stopPropagation();
          const open = !card.classList.contains("detail-open");
          card.classList.toggle("detail-open", open);
          paintDetailToggle(detailBtn, open);
          if (open) {
            markOpened(q.id);
            if (window.IQB.notes) IQB.notes.onCardOpen(q.id);
            if (window.IQB.highlights) IQB.highlights.onCardOpen(q.id);
          }
        }
      }, "Deep Dive");
    }

    /* Icon cluster (speak / star / done / chevron). Deep Dive is a sibling so
       mobile can park it on its own row; it's hidden until the card is open. */
    const sideActions = el("div", { class: "qa-side-actions" }, [
      coding ? IQB.coding.solveButton(q) : null,
      window.IQB.speak && IQB.speak.supported ? IQB.speak.build(card) : null,
      star,
      doneToggle,
      toggleBtn
    ]);

    // meta line: category + difficulty badges only (no controls)
    const top = el("div", { class: "qa-top" }, [
      el("span", { class: "badge cat", text: labelOf(q.category) }),
      q.difficulty ? el("span", { class: "badge diff-" + q.difficulty, text: cap(q.difficulty) }) : null
    ]);

    // question is plain text — use text (not html) so literal tags like
    // "<!DOCTYPE html>" or "<router-outlet>" render instead of being parsed away.
    // The number is a sibling of .qa-question, not a child, so the highlightable
    // .qa-qtext holds ONLY the question text — keeps highlight offsets stable.
    const question = el("div", { class: "qa-question" });
    question.appendChild(el("span", { class: "qa-qtext", text: q.question }));

    const qnum = index
      ? el("span", { class: "qa-qnum", "aria-hidden": "true", text: String(index).padStart(2, "0") })
      : null;

    // Tags are internal metadata (they drive search, packs and V.Imp weighting)
    // — deliberately NOT rendered on the card; the list stays clean.

    // meta line + question as one tight block, so the number and the right-side
    // controls centre against it (flex align-items:center) instead of the number
    // floating between two full-height rows.
    const headMain = el("div", { class: "qa-headmain" }, [top, question]);

    const head = el("div", {
      class: "qa-head" + (qnum ? " numbered" : ""), role: "button", tabindex: "0", "aria-expanded": "false",
      /* Header (number, tags, question text, padding) toggles open/close.
         Side-action icons keep their own handlers. Skip if the user is
         selecting/highlighting text in the header. */
      onclick: (e) => {
        if (e.target.closest(".qa-side-actions")) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.anchorNode && head.contains(sel.anchorNode)) return;
        toggleCard(card);
      },
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault(); toggleCard(card);
        }
      }
    }, [qnum, headMain, sideActions, detailBtn]);

    // reveal button (practice mode)
    const reveal = el("button", {
      class: "reveal-btn",
      onclick: () => {
        card.classList.add("open", "revealed");
        head.setAttribute("aria-expanded", "true");
        toggleBtn.setAttribute("aria-label", "Hide answer");
        toggleBtn.setAttribute("title", "Hide answer");
        markOpened(q.id);
        if (window.IQB.notes) IQB.notes.onCardOpen(q.id);
        if (window.IQB.highlights) IQB.highlights.onCardOpen(q.id);
      }
    });
    reveal.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Show answer';

    // body
    const inner = el("div", { class: "qa-body-inner" });

    /* Coding questions (manifest `"mode": "coding"`) invert the card: the
       expanded body shows ONLY the problem, and everything that gives the
       answer away — approach, reference code, tip, deep dive — is collected
       into `gated` and hidden behind "Show Solution". Reading the question and
       seeing its answer in the same glance is the one thing a practice site
       must not do. Every other category is unaffected: `sink` is `inner`. */
    const gated = [];
    const sink = coding ? { appendChild: (n) => gated.push(n) } : inner;

    /* Revise Mode: crisp recap in the body; Deep Dive / Quick Recap chip sits
       in the header action cluster. Coding cards opt out. */
    if (!coding) {
      const rv = reviseText(q);
      inner.appendChild(el("div", { class: "qa-revise-row" }, [
        el("div", {
          class: "qa-revise" + (rv.fallback ? " is-fallback" : ""), text: rv.text
        })
      ]));
    }

    if (coding) inner.appendChild(IQB.coding.buildProblem(q));

    const answer = el("div", { class: "answer", html: q.answer || "" });
    wrapTables(answer);
    sink.appendChild(answer);

    if (coding && q.solution && q.solution.js) {
      const jsPre = el("pre", {}, [el("code", { text: q.solution.js })]);
      const jsCopy = el("button", {
        class: "copy-btn",
        onclick: (e) => { e.stopPropagation(); copyText(q.solution.js, e.currentTarget); }
      }, "Copy");
      sink.appendChild(el("div", { class: "code-block cq-code" }, [
        el("span", { class: "cq-code-lang", text: "JavaScript" }), jsCopy, jsPre
      ]));
    }
    if (q.code) {
      const pre = el("pre", {}, [el("code", { text: q.code })]);
      const copy = el("button", {
        class: "copy-btn",
        onclick: (e) => { e.stopPropagation(); copyText(q.code, e.currentTarget); }
      }, "Copy");
      sink.appendChild(el("div", { class: "code-block" + (coding ? " cq-code" : "") }, [
        coding ? el("span", { class: "cq-code-lang", text: q.lang === "java" ? "Java" : "Reference" }) : null,
        copy, pre
      ]));
    }
    if (q.tip) {
      // Tips are authored HTML in the same trusted JSON as q.answer/q.deep (which
      // are injected raw just above/below). Escaping this one field printed the
      // markup as literal text — "<strong>Promise = One value.</strong>".
      sink.appendChild(el("div", { class: "qa-tip", html: "<b>Tip</b> " + q.tip }));
    }

    /* Study extras: deep-dive button → deep panel → Personal Note → note body.
       On non-coding cards they share .qa-explore so CSS can sit the two buttons
       side-by-side when both panels are closed, then restore the stacked
       open order (button, its panel, then the sibling control). Coding cards
       gate the deep dive behind Show Solution, so notes stay on the outer body. */
    const explore = el("div", { class: "qa-explore" });
    let exploreMounted = false;
    const ensureExplore = () => {
      if (!exploreMounted) { sink.appendChild(explore); exploreMounted = true; }
      return explore;
    };

    // optional in-depth study section
    if (q.deep) {
      const deepContent = el("div", { class: "qa-deep", hidden: "", html: q.deep });
      wrapTables(deepContent);
      const bookSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 1-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
      const paintDeepBtn = (open) => {
        deepBtn.innerHTML = bookSvg + (open ? "Hide deep dive" : "Study in depth");
        deepBtn.setAttribute("aria-expanded", String(open));
        deepBtn.classList.toggle("is-open", open);
      };
      const deepBtn = el("button", {
        class: "qa-act deep-btn", type: "button", "aria-expanded": "false",
        onclick: (e) => {
          e.stopPropagation();
          const open = deepContent.hasAttribute("hidden");
          if (open) { deepContent.removeAttribute("hidden"); markOpened(q.id); }
          else deepContent.setAttribute("hidden", "");
          paintDeepBtn(open);
        }
      });
      paintDeepBtn(false);

      // Close the deep dive from its own foot, then bring its open/close button
      // back into view so the reader keeps their place in the card.
      const collapseDeep = () => {
        deepContent.setAttribute("hidden", "");
        paintDeepBtn(false);
        deepBtn.scrollIntoView({ block: "nearest" });
      };

      /* The deep dive's speaker sits INSIDE the panel, pinned top-right.
         It is deliberately icon-only: .qa-deep is a highlight root, and
         js/highlights.js maps saved highlights to character offsets into its
         textContent — an <svg> contributes no text, but a "Listen" label would
         shift every highlight the reader has saved in this section. */
      if (window.IQB.speak && IQB.speak.supported) {
        deepContent.classList.add("has-tts");
        deepContent.appendChild(IQB.speak.buildFor({
          cls: "qa-deep-speak", title: "Read the deep dive aloud",
          name: () => q.question,
          root: () => deepContent
        }));
      }
      deepContent.appendChild(collapseFoot("Hide deep dive", collapseDeep));

      if (coding) {
        sink.appendChild(deepBtn);
        sink.appendChild(deepContent);
      } else {
        ensureExplore().appendChild(deepBtn);
        ensureExplore().appendChild(deepContent);
      }
    }

    /* Solve first, then the way out of thinking for yourself. */
    if (coding) {
      inner.appendChild(el("div", { class: "cq-gate" }, [
        IQB.coding.solveButton(q, { big: true }),
        ...(function () {
          if (!gated.length) return [];
          const gate = IQB.coding.buildSolutionGate(gated);
          return [gate.button, gate.panel];
        })()
      ]));
    }

    // optional personal-note section (js/notes.js) — reuses the generic
    // per-question user-state layer (IQB.cloud). Loads lazily on card open.
    if (window.IQB.notes) {
      if (coding) inner.appendChild(IQB.notes.build(q.id));
      else ensureExplore().appendChild(IQB.notes.build(q.id));
    }

    const doneBtn = el("button", {
      class: "qa-act qa-act-done" + (progress.has(q.id) ? " on" : ""),
      /* explicit, so the accessible name stays whole where the visible label
         shortens to "Done" on a phone */
      "aria-label": progress.has(q.id) ? "Completed" : "Mark as done",
      onclick: (e) => { e.stopPropagation(); toggleDone(q.id, card); }
    });
    doneBtn.innerHTML = progress.has(q.id) ? doneOnHtml : doneOffHtml;

    const linkBtn = el("button", {
      class: "qa-act", "aria-label": "Copy link",
      onclick: (e) => { e.stopPropagation(); copyText(location.origin + location.pathname + "#q=" + q.id, e.currentTarget, "Link copied"); }
    });
    linkBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span class="qa-act-label">Copy<span class="qa-act-word">&nbsp;link</span></span>';

    /* Secondary actions live in a "⋮ More" overflow menu so the footer keeps just
       the primary control (Completed). Each menu item is the SAME button/handler
       as before — Copy link, Ask AI, Report Issue, Learn More — just relocated
       into the popover. */
    const menuActions = [linkBtn];

    if (window.IQB.tutor) {
      const askAiBtn = el("button", {
        class: "qa-act", "aria-label": "Ask AI about this question",
        onclick: (e) => {
          e.stopPropagation();
          IQB.tutor.askAbout({
            question: q.question,
            answer: stripToText(q.answer),
            code: q.code || "",
            tags: q.tags || [],
            category: q.category || "",
            difficulty: q.difficulty || "",
            hasDeep: !!q.deep
          });
        }
      });
      askAiBtn.innerHTML =
        IQB.tutor.icon(15, "", 2.2) +
        '<span class="qa-act-label">Ask AI</span>';
      menuActions.push(askAiBtn);
    }

    if (window.IQB.reports) menuActions.push(IQB.reports.build(card));
    if (q.youtube && q.youtube.trim()) {
      const ytBtn = el("a", {
        class: "qa-act",
        href: q.youtube,
        target: "_blank",
        rel: "noopener noreferrer",
        onclick: (e) => { e.stopPropagation(); }
      });
      ytBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#FF0000" style="flex-shrink: 0;"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837z"/><polygon points="9.545 8.568 9.545 15.432 15.545 12" fill="white"/></svg>Learn More`;
      menuActions.push(ytBtn);
    }

    /* The overflow menu itself — opens UPWARD (the button sits at the card foot,
       so downward would spill past a card that clips its corners). Closes on
       outside pointer, Escape, or after any item is chosen (capture listener runs
       before the item's own handler, so the action still fires). */
    const moreMenu = el("div", { class: "qa-more-menu", role: "menu", hidden: "" }, menuActions);
    const moreBtn = el("button", {
      class: "qa-act qa-more-btn", type: "button",
      "aria-haspopup": "true", "aria-expanded": "false", "aria-label": "More actions", title: "More actions",
      onclick: (e) => { e.stopPropagation(); toggleMenu(); }
    });
    moreBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>' +
      '<span class="qa-act-label">More</span>';
    const moreWrap = el("div", { class: "qa-more" }, [moreBtn, moreMenu]);

    let menuOpen = false;
    const onDocDown = (ev) => { if (!moreWrap.contains(ev.target)) closeMenu(); };
    const onKey = (ev) => { if (ev.key === "Escape") { closeMenu(); moreBtn.focus(); } };
    function openMenu() {
      menuOpen = true; moreMenu.removeAttribute("hidden"); moreBtn.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", onDocDown, true);
      document.addEventListener("keydown", onKey);
    }
    function closeMenu() {
      if (!menuOpen) return;
      menuOpen = false; moreMenu.setAttribute("hidden", ""); moreBtn.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKey);
    }
    function toggleMenu() { menuOpen ? closeMenu() : openMenu(); }
    moreMenu.addEventListener("click", () => closeMenu(), true);

    /* A second exit for long answers — an icon-only up-chevron pushed to the
       right of the action row, so the reader can collapse without scrolling back
       to the top chevron. Mirrors that chevron's look (see .qa-collapse-act). */
    const collapseAct = el("button", {
      class: "qa-collapse-act", type: "button", "aria-label": "Collapse", title: "Collapse",
      onclick: (e) => { e.stopPropagation(); toggleCard(card); }
    });
    collapseAct.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>';

    inner.appendChild(el("div", { class: "qa-body-actions" }, [doneBtn, moreWrap, collapseAct]));

    const body = el("div", { class: "qa-body" }, [inner]);

    card.append(head, reveal, body);

    /* Open-card body chrome: empty padding / footer gap collapses the answer.
       Answer content and controls stay put. Header open/close is handled above. */
    card.addEventListener("click", (e) => {
      if (!card.classList.contains("open")) return;
      if (e.target.closest(".qa-head")) return; // head has its own toggle
      if (clickShouldKeepCardOpen(e, card)) return;
      toggleCard(card);
    });

    // register highlightable roots (.answer / .qa-deep) + selection wiring.
    // Reuses the same per-question user-state layer as notes (IQB.cloud).
    if (window.IQB.highlights) IQB.highlights.register(q.id, card);

    return card;
  }

  /* True when a click landed on body content/controls that should NOT collapse
     an open card — answer, tip, notes, menus, form fields. */
  function clickShouldKeepCardOpen(e, card) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.anchorNode && card.contains(sel.anchorNode)) return true;

    const t = e.target;
    if (!(t instanceof Element)) return true;

    return !!t.closest([
      "button", "a", "input", "textarea", "select", "label", "summary",
      ".answer",
      ".qa-revise",
      ".qa-revise-row",
      ".code-block",
      ".qa-tip",
      ".qa-explore",
      ".pn-section",
      ".qa-more",
      ".cq-gate",
      ".playground",
      ".table-scroll",
      ".hl-toolbar",
      ".reveal-btn"
    ].join(","));
  }

  function toggleCard(card) {
    const open = card.classList.toggle("open");
    const head = qs(".qa-head", card);
    if (head) head.setAttribute("aria-expanded", String(open));
    const tog = qs(".qa-toggle", card);
    if (tog) {
      const lbl = open ? "Hide answer" : "Show answer";
      tog.setAttribute("aria-label", lbl);
      tog.setAttribute("title", lbl);
    }
    if (open) {
      card.classList.add("revealed"); // header click reveals in practice mode too
      markOpened(card.dataset.id);
      if (window.IQB.notes) IQB.notes.onCardOpen(card.dataset.id);
      if (window.IQB.highlights) IQB.highlights.onCardOpen(card.dataset.id);
    } else {
      // Closing drops the answer's height, so everything below it slides up while
      // the scroll offset stays put — the reader ends up staring at some unrelated
      // question further down the list. Pull the card we just closed back into view.
      // block:"nearest" is a no-op when it is already fully visible, and the easing
      // is left to html{scroll-behavior} so reduced-motion users still get a jump.
      card.scrollIntoView({ block: "nearest" });
    }
  }

  /* ========================================================
     BOOKMARKS / PROGRESS / NOTES
     ======================================================== */
  function toggleBookmark(id, btn) {
    if (bookmarks.has(id)) { bookmarks.delete(id); btn.classList.remove("on"); btn.innerHTML = starOffSvg; }
    else { bookmarks.add(id); btn.classList.add("on"); btn.innerHTML = starOnSvg; }
    store.saveBookmarks(bookmarks);
    syncPush();
    // a bookmark can start (or un-start) a category, which moves the group bar
    updateProgressBar();
    if (state.bookmarkedOnly) render();
  }
  /* Mark complete without a card to click — the Solve overlay (js/coding.js)
     calls this when a submission passes every test case. Deliberately NOT a
     toggle: solving an already-completed question must not un-complete it. */
  function markComplete(id) {
    if (progress.has(id)) return;
    const card = document.querySelector('.qa-card[data-id="' + CSS.escape(id) + '"]');
    if (card) { toggleDone(id, card); return; }   // card on screen → keep its UI in step
    progress.add(id);
    store.saveProgress(progress);
    syncPush();
    updateProgressBar();
    if (state.completedOnly || state.uncompletedOnly || state.revise) render();
  }

  function toggleDone(id, card) {
    const isCompleted = !progress.has(id);
    if (isCompleted) progress.add(id); else progress.delete(id);
    card.classList.toggle("done", isCompleted);
    // Keep both entry points in sync: the footer "Mark as done" button and the
    // header circle toggle share one `progress` state, so a tap on either
    // updates the other.
    const act = qs(".qa-act-done", card);
    if (act) {
      act.classList.toggle("on", isCompleted);
      act.innerHTML = isCompleted ? doneOnHtml : doneOffHtml;
      act.setAttribute("aria-label", isCompleted ? "Completed" : "Mark as done");
    }
    const circle = qs(".qa-done", card);
    if (circle) {
      circle.classList.toggle("on", isCompleted);
      circle.setAttribute("aria-pressed", String(isCompleted));
      circle.setAttribute("aria-label", isCompleted ? "Marked complete — tap to undo" : "Mark as complete");
    }
    store.saveProgress(progress);
    syncPush();
    updateProgressBar();
    if (isCompleted && card.classList.contains("open")) {
      toggleCard(card);
    }
    if (state.completedOnly || state.uncompletedOnly || state.revise) render();
  }
  /* Read-aloud expands a card before speaking it (and reveals it in practice
     mode) so the reader can see the block being highlighted. Same side effects
     as opening by hand — lazy notes/highlights still need to load. */
  if (window.IQB.speak) {
    IQB.speak.openCard = function (card) {
      if (card.classList.contains("open")) return;
      card.classList.add("open", "revealed");
      const head = qs(".qa-head", card);
      if (head) head.setAttribute("aria-expanded", "true");
      markOpened(card.dataset.id);
      if (window.IQB.notes) IQB.notes.onCardOpen(card.dataset.id);
      if (window.IQB.highlights) IQB.highlights.onCardOpen(card.dataset.id);
    };
  }

  function markOpened(id) { store.setLastOpened(id); }

  /* ---- bridge for the optional cloud-sync module (js/sync.js) ---- */
  function syncPush() { if (window.IQB.sync) window.IQB.sync.pushSoon(); }
  function getSyncData() {
    /* lastTab carries BOTH levels of the reader's selection: it holds either a
       group key ("frontend") or a category key ("angular"), and a category
       already implies its parent group (see the parentGroup lookup in
       setCategory) — so one field restores the tab and the category together. */
    return { progress: Array.from(progress), bookmarks: Array.from(bookmarks), lastTab: state.category };
  }

  /* Apply the view saved in the reader's cloud profile. js/sync.js calls this
     once, when sign-in resolves — never on later snapshots, or a change made on
     another device would rip this one out from under the reader mid-sentence.
     Declines when they've already chosen a view this session. */
  function restoreView(key) {
    if (viewPinned) return "declined: reader already chose a view";
    if (!key || key === state.category) return "no-op";
    const valid = isGroup(key) || key === PLAYGROUND || CATEGORIES.some((c) => c.key === key);
    if (!valid) return "declined: unknown view " + key;   // stale key from an older content version
    setCategory(key, false);
    return "restored " + key;
  }
  function setSyncData(data) {
    // Cloud sync pushes this several times during sign-in (initial merge, then
    // the onSnapshot echo). Only re-render when the data actually changed —
    // otherwise the list rebuilds needlessly and any open card visibly collapses.
    let changed = false;
    if (data && Array.isArray(data.progress)) {
      const next = new Set(data.progress);
      if (!sameSet(next, progress)) { progress = next; store.saveProgress(progress); changed = true; }
    }
    if (data && Array.isArray(data.bookmarks)) {
      const next = new Set(data.bookmarks);
      if (!sameSet(next, bookmarks)) { bookmarks = next; store.saveBookmarks(bookmarks); changed = true; }
    }
    if (changed) { render(); updateProgressBar(); }
  }
  function sameSet(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }
  /* Profile progress, one row per STARTED category (see isStarted), grouped
     under its main field so the popover can collapse a long list. The group
     line's numbers are scoped to the reader's started topics — never the raw
     "Frontend 430" syllabus: "Angular 57/57 ✓" is a goal a person can finish.
     Rows the reader dismissed (the ✕ in the profile menu) stay out until
     unhideProgress(); hiddenCount only counts hides that would otherwise
     render, so "Show n hidden" never advertises rows that couldn't come back. */
  function getProgressSummary() {
    const hidden = store.getHiddenProgress();
    const groups = [];
    let hiddenCount = 0;
    GROUPS.forEach((g) => {
      const cats = [];
      g.cats.forEach((key) => {
        if (!isStarted(key)) return;
        if (hidden.has(key)) { hiddenCount++; return; }
        const p = progressFor([key]);
        if (!p.total) return;
        cats.push({
          key: key, label: labelOf(key), color: catColor(key),
          done: p.done, total: p.total, complete: p.done === p.total
        });
      });
      if (!cats.length) return;
      cats.sort((a, b) => (b.done / b.total) - (a.done / a.total));
      groups.push({
        key: g.key, label: g.label, color: groupColor(g),
        done: cats.reduce((s, c) => s + c.done, 0),
        total: cats.reduce((s, c) => s + c.total, 0),
        cats: cats
      });
    });
    return { totalCompleted: progress.size, totalQuestions: ALL.length, groups: groups, hiddenCount: hiddenCount };
  }
  function hideProgressRow(key) {
    const h = store.getHiddenProgress(); h.add(key); store.saveHiddenProgress(h);
  }
  function unhideProgress() { store.saveHiddenProgress(new Set()); }

  /* ========================================================
     FOCUS PACK (role-based question subset)
     ======================================================== */
  /* Switch the active focus pack (a pack id, or null/"" = off) and rebuild
     everything whose contents derive from counts(): tabs, sidebar, subnav,
     mobile dropdowns. Falls back to the first non-empty group when the
     current view holds no pack questions. */
  function setFocusPack(id) {
    const pack = id ? (window.IQB.packs || {})[id] : null;
    if (id && !pack) { toast("Unknown focus pack"); return false; }
    activePack = pack;
    packSet = pack ? resolvePackSet(pack) : null;
    store.setFocusPack(pack ? pack.id : null);
    saveFocusPackCloud(pack ? pack.id : "");

    buildTabs();
    renderMobileSections();

    const c = counts();
    let key = state.category;
    if (key !== PLAYGROUND && key !== NOTEBOOK) {
      const n = key === "all" ? c.all : (c[key] || 0);
      if (!n) key = (GROUPS.find((g) => c[g.key] > 0) || GROUPS[0]).key;
    }
    setCategory(key, false);
    updatePackChip();
    toast(pack
      ? "Focus: " + pack.label + " (" + c.all + ")"
      : "Focus pack off");
    return true;
  }
  function getFocusPacks() {
    return Object.values(window.IQB.packs || {}).map((p) => ({
      id: p.id, label: p.label, description: p.description || "", count: p.count
    }));
  }

  /* ---- focus pack ⇄ account sync ----
     The device-local iqb:focusPack made the choice vanish on a new device or
     a cleared browser. The account is the durable copy: users/{uid}/prefs/
     focusPack {id} via the generic IQB.cloud layer. On sign-in the cloud
     value wins (that's what "log in and get my setup back" means); a cloud
     with no preference yet inherits whatever this device had selected while
     signed out. applyingRemotePack stops the sign-in apply from immediately
     echoing the same value back up. */
  let applyingRemotePack = false;

  function saveFocusPackCloud(id) {
    if (applyingRemotePack) return;
    if (!(window.IQB.cloud && IQB.cloud.isSignedIn && IQB.cloud.isSignedIn())) return;
    IQB.cloud.save("prefs", "focusPack", { id: id || "", updatedAt: Date.now() })
      .catch(() => { /* offline write — localStorage still has it */ });
  }

  if (window.IQB.cloud && IQB.cloud.onChange) {
    IQB.cloud.onChange(async (u) => {
      if (!u) return; // sign-out keeps the local choice — nothing to restore
      // Auth can settle before the manifest/packs arrive — wait for them so a
      // valid cloud id isn't mistaken for a stale one and skipped.
      for (let i = 0; i < 100 && !window.IQB.packs; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!window.IQB.packs) return;
      try {
        const doc = await IQB.cloud.load("prefs", "focusPack");
        const cur = activePack ? activePack.id : "";
        if (doc && typeof doc.id === "string") {
          const want = doc.id;
          // A cloud id from a newer content version this client hasn't seen
          // yet simply doesn't apply — don't clear the account's preference.
          if (want !== cur && (!want || (window.IQB.packs || {})[want])) {
            applyingRemotePack = true;
            try { setFocusPack(want || null); } finally { applyingRemotePack = false; }
          }
        } else if (cur) {
          saveFocusPackCloud(cur); // first sign-in on this device: seed the account
        }
      } catch (e) { /* Firestore unreachable — local behaviour unchanged */ }
    });
  }
  function getActiveFocusPack() {
    return activePack ? { id: activePack.id, label: activePack.label } : null;
  }

  /* A pinned chip above the list naming the active pack, with its own off
     switch — a narrowed list with no visible reason is exactly how a mode
     gets forgotten (same argument as syncFilterCount). */
  function updatePackChip() {
    let chip = qs("#pack-chip");
    if (!activePack) { if (chip) chip.remove(); return; }
    const head = qs(".content-head");
    if (!head) return;
    if (!chip) {
      chip = el("div", { class: "pack-chip", id: "pack-chip" });
      head.insertBefore(chip, qs(".tools-panel", head));
    }
    chip.innerHTML = "";
    chip.append(
      el("span", {
        class: "pack-chip-ic", "aria-hidden": "true",
        html: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'
      }),
      el("span", { class: "pack-chip-label", text: "Focus: " + activePack.label }),
      el("button", {
        class: "pack-chip-x", type: "button",
        title: "Turn off focus pack", "aria-label": "Turn off focus pack",
        onclick: () => setFocusPack(null)
      }, "×")
    );
  }
  /* The category the reader is currently viewing, as { key, label }. Used by the
     AI Tutor to tailor its welcome prompts ("Ask me a random {label} question").
     Returns the single category when one is selected; for a group tab ("frontend")
     it returns the group's own label ("Frontend"), which still reads naturally.
     "all"/playground have no single subject, so label comes back empty and the
     caller can fall back to a generic phrasing. */
  function currentCategory() {
    const key = state.category;
    if (!key || key === "all" || key === PLAYGROUND) return { key: key || "", label: "" };
    return { key: key, label: labelOf(key) };
  }

  /* The deduped tag vocabulary for a category (or group), lowercased. Fed to the
     AI Tutor's "curate" call so the keywords it picks are drawn from terms that
     actually appear on these questions — otherwise a keyword would match nothing.
     The "V.Imp" marker tag is dropped: it flags importance, it isn't a topic. */
  function categoryTags(catKey) {
    const cats = catsFor(catKey || state.category); // null = all categories
    const set = new Set();
    ALL.forEach((q) => {
      if (cats && !cats.includes(q.category)) return;
      (q.tags || []).forEach((t) => {
        const s = String(t).trim().toLowerCase();
        if (s && !/^v\.?imp$/i.test(s)) set.add(s);
      });
    });
    return Array.from(set);
  }

  /* Narrow the list to the questions the tutor's keywords match, within a
     category. A question matches when any keyword appears in one of its tags or
     in its title (substring, case-insensitive). Switches to catKey first if the
     suggestion is for a different category than the one on screen. Returns the
     number of questions matched so the caller can react to an empty result. */
  function applyAiSuggestion(keywords, catKey) {
    catKey = catKey || state.category;
    if (catKey && catKey !== state.category) setCategory(catKey, true);
    const kws = (keywords || [])
      .map((k) => String(k).toLowerCase().trim())
      .filter((k) => k.length >= 2);
    const cats = catsFor(state.category);
    const ids = [];
    ALL.forEach((q) => {
      if (cats && !cats.includes(q.category)) return;
      const tags = (q.tags || []).map((t) => String(t).toLowerCase());
      const title = String(q.question || "").toLowerCase();
      const hit = kws.some((k) => title.includes(k) || tags.some((t) => t.includes(k)));
      if (hit) ids.push(q.id);
    });
    state.aiSuggestedIds = ids.length ? new Set(ids) : null;
    state.aiSuggestedKeywords = kws;
    state.aiOnly = ids.length > 0;
    syncAiChip();
    render();
    return ids.length;
  }

  /* The "✨ AI Suggested (n)" chip sits beside the difficulty segment, and
     only while a suggestion is active. Clicking it toggles the curated view on
     and off without discarding the suggestion; navigating categories discards it
     (see setCategory), which removes the chip on the next render. */
  function syncAiChip() {
    if (!diffEl) return;
    let chip = qs("#ai-suggested-chip", diffEl);
    const count = state.aiSuggestedIds ? state.aiSuggestedIds.size : 0;
    if (!count) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = el("button", { id: "ai-suggested-chip", class: "chip-filter ai-suggested",
        title: "Questions the AI Helper picked as important" });
      chip.addEventListener("click", () => { state.aiOnly = !state.aiOnly; syncAiChip(); render(); });
      diffEl.appendChild(chip); // after .diff-seg
    }
    chip.classList.toggle("active", !!state.aiOnly);
    chip.innerHTML = "";
    chip.appendChild(document.createTextNode("✨ AI Suggested"));
    chip.appendChild(el("span", { class: "chip-n", text: String(count) }));
  }
  IQB.app = { getData: getSyncData, setData: setSyncData, getProgressSummary: getProgressSummary, hideProgressRow: hideProgressRow, unhideProgress: unhideProgress, setCategory: setCategory, restoreView: restoreView, copyText: copyText, currentCategory: currentCategory, categoryTags: categoryTags, applyAiSuggestion: applyAiSuggestion, setFocusPack: setFocusPack, getFocusPacks: getFocusPacks, getActiveFocusPack: getActiveFocusPack, markComplete: markComplete };
  function updateProgressBar() {
    const prog = sidebarProgress(state.category);
    const fill = qs("#progress-fill", sideEl);
    /* Completing the first question of a fresh group (or un-completing the
       last) is exactly when the box has to appear or go — a full sidebar
       rebuild is the cheapest correct answer there. */
    if (!!prog !== !!fill) { renderSidebar(state.category); return; }
    if (!prog || !fill) return;
    fill.style.width = (prog.total ? Math.round((prog.done / prog.total) * 100) : 0) + "%";
    const label = qs("#progress-label", sideEl);
    if (label) label.textContent = prog.done + " / " + prog.total;
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
    /* A shared link is the most explicit intent there is — it outranks whatever
       view the reader's profile last saved. */
    viewPinned = true;
    if (h === PLAYGROUND) { setCategory(PLAYGROUND, false); return; }
    if (h.startsWith("q=")) { openQuestion(h.slice(2), true); return; }
    if (isGroup(h) || CATEGORIES.some((c) => c.key === h)) setCategory(h, false);
  }

  function onKeydown(e) {
    /* isContentEditable matters as much as the tag test: the notebook, the
       per-question notes and the Quick Note window all type into a plain div,
       so without it a note containing the letter "r" jumps the reader to a
       random question mid-sentence. */
    const ae = document.activeElement || document.body;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable;
    // Ctrl/Cmd+K is unambiguous anywhere; bare "/" must not steal focus while
    // the user is typing — in the playground editor every comment starts with one.
    if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); focusSearch(); return;
    }
    if (e.key === "/" && !typing) { e.preventDefault(); focusSearch(); return; }
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
  function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }

  /* Authored answer/deep HTML contains comparison tables that want 411-896px.
     Styled `width: 100%` they never overflowed the page — they did something
     worse and quieter: auto-layout squeezed every column to min-content to obey
     the 100%, so on a phone a 542px table crammed into a 273px card at one word
     per line. Giving each table its own scroll port lets it keep its natural
     column widths and pan, while the card stays inside the viewport. Wrapping
     adds an element but no text, so highlight offsets (js/highlights.js) are
     unaffected. */
  function wrapTables(root) {
    qsa("table", root).forEach((t) => {
      if (t.parentElement && t.parentElement.classList.contains("table-scroll")) return;
      const scroller = el("div", { class: "table-scroll", role: "region", tabindex: "0", "aria-label": "Table, scrollable" });
      t.parentNode.insertBefore(scroller, t);
      scroller.appendChild(t);
    });
  }

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
    on("#theme-toggle-m", "click", toggleTheme);
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
    on("#completed-filter", "click", (e) => {
      state.completedOnly = !state.completedOnly;
      if (state.completedOnly) {
        state.uncompletedOnly = false;
        const pendingBtn = qs("#uncompleted-filter");
        if (pendingBtn) pendingBtn.classList.remove("on");
      }
      e.currentTarget.classList.toggle("on", state.completedOnly);
      render();
    });
    on("#uncompleted-filter", "click", (e) => {
      state.uncompletedOnly = !state.uncompletedOnly;
      if (state.uncompletedOnly) {
        state.completedOnly = false;
        const compBtn = qs("#completed-filter");
        if (compBtn) compBtn.classList.remove("on");
      }
      e.currentTarget.classList.toggle("on", state.uncompletedOnly);
      render();
    });
    on("#note-filter", "click", (e) => {
      state.hasNoteOnly = !state.hasNoteOnly;
      e.currentTarget.classList.toggle("on", state.hasNoteOnly);
      render();
    });
    on("#video-filter", "click", (e) => {
      state.hasVideoOnly = !state.hasVideoOnly;
      e.currentTarget.classList.toggle("on", state.hasVideoOnly);
      render();
    });
    /* Study-mode switch (Preparation <-> Revise). Segmented, persisted. Sets a
       body class the card CSS keys off; nothing needs re-rendering because every
       card already carries its recap + detail button. */
    on("#mode-prep", "click", () => setReviseMode(false, true));
    on("#mode-revise", "click", () => setReviseMode(true, true));
    applyReviseMode(); // reflect the persisted choice on boot
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

    // the playground lives in the content column, next to the question list
    if (window.IQB.notebookUI) {
      const mainNb = qs(".main") || qs("main");
      if (mainNb) mainNb.appendChild(IQB.notebookUI.build());
    }
    if (window.IQB.playground) {
      const main = qs(".main");
      if (main) main.appendChild(IQB.playground.build());
    }

    // initial state: hash > last tab
    const startTab = store.getLastTab();
    const validStart = isGroup(startTab) || startTab === PLAYGROUND
      || CATEGORIES.some((c) => c.key === startTab);
    let startKey = validStart ? startTab : GROUPS[0].key;
    /* an active focus pack may have emptied the remembered view — land on the
       first group that still has questions rather than an empty list */
    if (packSet && startKey !== PLAYGROUND && startKey !== NOTEBOOK) {
      const c0 = counts();
      const n0 = startKey === "all" ? c0.all : (c0[startKey] || 0);
      if (!n0) startKey = (GROUPS.find((g) => c0[g.key] > 0) || GROUPS[0]).key;
    }
    setCategory(startKey, false);
    updatePackChip();
    parseHash();

    /* SEO entry pages (/angular, /java, …) are static HTML that inject
       window.__ENTRY_CAT so the live app opens that category on load. A #hash
       is a more explicit intent and is already handled by parseHash above, so
       it wins; we only honour the entry category when there is no hash. */
    if (window.__ENTRY_CAT && !location.hash) {
      const ec = window.__ENTRY_CAT;
      if (isGroup(ec) || CATEGORIES.some((c) => c.key === ec)) setCategory(ec, false);
    }
    /* the pre-rendered block existed for crawlers and the no-JS first paint;
       the interactive app has now rendered the real list, so drop the static
       duplicate. Harmless (no-op) on pages that were never pre-rendered. */
    const seoBlock = document.getElementById("seo-prerender");
    if (seoBlock) seoBlock.remove();

    // register service worker (PWA) — only over http(s)
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }

    initScrollToTop();
    initCollapsibleHeader();
    initMobileSearch();
    initToolsSheet();
    initReadingMode();
    initSidebarToggle();
    initTabsScrollHint();
    // Playground + My Notes live in the header, not the tab strip — see buildTabs.
    // Click again while open → back to the last questions category.
    const pgBtn = qs("#playground-btn");
    if (pgBtn) {
      if (window.IQB.playground) {
        pgBtn.setAttribute("aria-pressed", "false");
        pgBtn.addEventListener("click", () => {
          if (state.category === PLAYGROUND) setCategory(lastQuestionsCategory, true);
          else setCategory(PLAYGROUND, true);
        });
      } else pgBtn.hidden = true;
    }
    const nbBtn = qs("#mynotes-btn");
    if (nbBtn) {
      if (window.IQB.notebookUI) {
        nbBtn.setAttribute("aria-pressed", "false");
        nbBtn.addEventListener("click", () => {
          if (state.category === NOTEBOOK) setCategory(lastQuestionsCategory, true);
          else setCategory(NOTEBOOK, true);
        });
      } else nbBtn.hidden = true;
    }
    if (window.IQB.tour && typeof window.IQB.tour.init === "function") {
      window.IQB.tour.init();
    }
  }

  /* The six "show only" toggles, paired with the button that drives each. Not
     the practice/expand/collapse/random tools: those are actions and modes, not
     filters, so they neither count toward the badge nor get cleared. */
  const FILTERS = {
    bookmarkedOnly: "#bookmark-filter",
    completedOnly: "#completed-filter",
    uncompletedOnly: "#uncompleted-filter",
    hasNoteOnly: "#note-filter",
    hasVideoOnly: "#video-filter"
  };

  /* Under 900px the tools live in a closed sheet, so the trigger is the only
     thing telling you a filter is on — and "3 questions" with no visible reason
     is exactly how a filter gets forgotten. Derived from state (not from
     counting .on classes) so it cannot drift, and called from render(), which
     every filter change already goes through. */
  function syncFilterCount() {
    const btn = qs("#filter-btn");
    const badge = qs("#filter-count");
    if (!btn || !badge) return;
    const n = Object.keys(FILTERS).filter((k) => state[k]).length;
    badge.textContent = String(n);
    badge.hidden = n === 0;
    btn.classList.toggle("has-active", n > 0);
    btn.setAttribute("aria-label", n ? `Filters and tools, ${n} active` : "Filters and tools");
  }

  function clearFilters() {
    Object.entries(FILTERS).forEach(([key, sel]) => {
      state[key] = false;
      const b = qs(sel);
      if (b) b.classList.remove("on");
    });
    render();
  }

  /* Mobile search: the header has room for four icon targets, not a text field,
     so search collapses to an icon that expands the real .header-search across
     the header row. The input is the SAME one the desktop header uses — no
     second field, so no second source of truth for the query. */
  function initMobileSearch() {
    const header = qs(".site-header");
    const toggle = qs("#search-toggle");
    const close = qs("#search-close");
    const input = qs(".site-header .js-search");
    if (!header || !toggle || !close || !input) return;

    const setOpen = (next) => {
      header.classList.toggle("search-open", next);
      toggle.setAttribute("aria-expanded", String(next));
      if (next) input.focus();
    };

    toggle.addEventListener("click", () => setOpen(true));
    /* X cancels: it clears the query as well as collapsing. Collapsing while a
       query stayed live would leave the list filtered with the reason hidden
       behind an icon — the same trap the filter sheet's badge exists to avoid. */
    close.addEventListener("click", () => {
      input.value = "";
      state.query = "";
      render();
      setOpen(false);
      toggle.focus();
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Escape") close.click(); });

    /* Resizing to desktop mid-search would stick .search-open on the header,
       hiding the brand and every control behind a bar that has no X on desktop. */
    const desktop = matchMedia("(min-width: 901px)");
    desktop.addEventListener("change", (e) => { if (e.matches) setOpen(false); });
  }

  function initToolsSheet() {
    const trigger = qs("#filter-btn");
    const panel = qs("#tools-panel");
    const backdrop = qs("#tools-backdrop");
    if (!trigger || !panel || !backdrop) return;

    const desktop = matchMedia("(min-width: 901px)");
    let open = false;
    let closeTimer = null;

    /* Hiding the closed sheet from keyboard and screen readers is CSS's job
       (visibility, in the <=900px block — see styles.css), not this function's.
       Doing it here with `inert` needed the matchMedia change event to fire to
       undo it on desktop, and when that was missed the whole desktop toolbar
       went dead. State lives here; breakpoint behaviour lives in the stylesheet. */
    const setOpen = (next) => {
      open = next;
      trigger.setAttribute("aria-expanded", String(next));
      document.body.classList.toggle("tools-open", next);
      clearTimeout(closeTimer);
      if (next) {
        panel.classList.remove("closing");
        panel.classList.add("show");
        backdrop.hidden = false;
        // one frame between display and opacity, or the fade has nothing to
        // transition from
        requestAnimationFrame(() => backdrop.classList.add("show"));
        qs("#tools-close").focus();
      } else {
        // .closing carries the slide-down; it comes off once the sheet is parked
        // so the idle state stays transition-free (see styles.css)
        panel.classList.add("closing");
        panel.classList.remove("show");
        backdrop.classList.remove("show");
        closeTimer = setTimeout(() => {
          if (open) return;
          panel.classList.remove("closing");
          backdrop.hidden = true;
        }, 300);
        trigger.focus();
      }
    };

    trigger.addEventListener("click", () => setOpen(!open));
    backdrop.addEventListener("click", () => setOpen(false));
    on("#tools-close", "click", () => setOpen(false));
    on("#tools-done", "click", () => setOpen(false));
    on("#tools-clear", "click", clearFilters);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });

    /* Random and the expand/collapse pair act on the list behind the sheet —
       staying open would just hide their result. The filters deliberately do
       not close it: picking several in a row is the whole point. */
    ["#random-btn", "#expand-all", "#collapse-all"].forEach((sel) =>
      on(sel, "click", () => { if (open) setOpen(false); }));

    /* Tidy-up only, deliberately not load-bearing: body.tools-open is itself
       scoped to the <=900px block, so even if this never fires, resizing to
       desktop cannot leave the page scroll-locked or the toolbar unusable. */
    desktop.addEventListener("change", (e) => { if (e.matches && open) setOpen(false); });
  }

  function initReadingMode() {
    const btn = qs("#reading-mode-toggle");
    if (!btn) return;

    /* Toggling the mode hides/restores the header shell and sidebar, which
       shifts the whole document under the scroll position. Anchor on the
       topmost visible card and put it back at the same viewport offset, so
       the reader stays exactly where they were in the list. */
    const toggle = (on) => {
      const list = qs("#q-list");
      const anchor = list && Array.from(list.children).find((c) => c.getBoundingClientRect().bottom > 0);
      const before = anchor ? anchor.getBoundingClientRect().top : 0;
      document.body.classList.toggle("reading-mode", on);
      btn.classList.toggle("on", on);
      /* "instant" overrides the page's scroll-behavior:smooth — this is a
         correction, not a scroll the user should see animate */
      if (anchor) window.scrollBy({ top: anchor.getBoundingClientRect().top - before, behavior: "instant" });
    };

    btn.addEventListener("click", () => toggle(!document.body.classList.contains("reading-mode")));
    // allow Esc to exit reading mode
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("reading-mode")) toggle(false); });
  }

  /* The tab strip scrolls with its scrollbar hidden, so a tab pushed past the
     edge (My Notes sits last) was invisible AND undiscoverable. Each arrow
     shows only while something is actually cut off on its side. Re-checked on
     scroll/resize and once the webfonts land — font swap changes tab widths. */
  function initTabsScrollHint() {
    const left = qs("#tabs-arrow-left"), right = qs("#tabs-arrow-right");
    if (!left || !right || !tabsEl) return;
    const sync = () => {
      const max = tabsEl.scrollWidth - tabsEl.clientWidth;
      left.hidden = tabsEl.scrollLeft <= 2;
      right.hidden = tabsEl.scrollLeft >= max - 2;
    };
    left.addEventListener("click", () => tabsEl.scrollBy({ left: -240, behavior: "smooth" }));
    right.addEventListener("click", () => tabsEl.scrollBy({ left: 240, behavior: "smooth" }));
    tabsEl.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
    sync();
  }

  /* Desktop sidebar collapse. body.sidebar-rail (see styles.css) squeezes the
     210px sidebar to a 56px icon rail. The AI Helper adds/removes the class on
     its own open/close (js/tutor.js); this button toggles it freely, so the
     reader can bring the full sidebar back while the chat is docked. The
     MutationObserver keeps the button's label truthful no matter who last
     flipped the class. */
  function initSidebarToggle() {
    const btn = qs("#sidebar-collapse");
    if (!btn) return;
    const sync = () => {
      const rail = document.body.classList.contains("sidebar-rail");
      btn.setAttribute("aria-expanded", String(!rail));
      const label = rail ? "Expand sidebar" : "Collapse sidebar";
      btn.setAttribute("aria-label", label);
      btn.title = label;
    };
    btn.addEventListener("click", () => { document.body.classList.toggle("sidebar-rail"); sync(); });
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    sync();
  }

  function initCollapsibleHeader() {
    const shell = qs("#header-shell");
    if (!shell) return;

    /* The shell is sticky but still in normal flow, so collapsing it pulls the
       whole page up by the height of the tabs strip (~57px). These two marks must
       therefore stay further apart than that strip is tall — otherwise the layout
       shift the collapse itself causes is enough to push the scroll position back
       over the other mark, and the header flip-flops. Releasing only near the very
       top also puts the re-expand where its shift reads as the tabs sliding back
       in, rather than as the page lurching under the reader. */
    const threshold = 140;
    const releaseThreshold = 24;
    let lastScrollY = window.scrollY;
    let ticking = false;
    let collapsed = false;

    const applyHeaderState = () => {
      const currentY = window.scrollY;
      const isMobile = window.innerWidth <= 900;
      const scrollingDown = currentY > lastScrollY + 2;
      const scrollingUp = currentY < lastScrollY - 2;

      if (isMobile) {
        shell.classList.remove("is-collapsed");
        document.documentElement.style.setProperty("--header-offset", "var(--header-shell-h)");
        lastScrollY = currentY;
        ticking = false;
        return;
      }

      if (scrollingDown && currentY > threshold && !collapsed) {
        collapsed = true;
        shell.classList.add("is-collapsed");
        document.documentElement.style.setProperty("--header-offset", "var(--header-shell-h-collapsed)");
      } else if ((scrollingUp && currentY < releaseThreshold) || currentY <= releaseThreshold) {
        collapsed = false;
        shell.classList.remove("is-collapsed");
        document.documentElement.style.setProperty("--header-offset", "var(--header-shell-h)");
      }

      lastScrollY = currentY;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(applyHeaderState);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("load", onScroll);
    onScroll();
  }

  function initScrollToTop() {
    const btn = qs("#scroll-to-top");
    if (!btn) return;
    window.addEventListener("scroll", () => {
      if (window.scrollY > 300) {
        btn.classList.add("show");
      } else {
        btn.classList.remove("show");
      }
    });
    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function on(sel, ev, fn) { const n = qs(sel); if (n) n.addEventListener(ev, fn); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

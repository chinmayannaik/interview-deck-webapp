/* LocalStorage wrapper — bookmarks, progress, notes, theme, last tab.
   Everything is namespaced under "iqb:" and fails safely if storage
   is unavailable (private mode, etc.). */
(function () {
  window.IQB = window.IQB || {};
  const PREFIX = "iqb:";

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  const S = {
    /* --- theme --- */
    getTheme() { return read("theme", "light"); },              // 'light' | 'dark'
    setTheme(v) { write("theme", v); },

    /* --- last tab --- */
    getLastTab() { return read("lastTab", "frontend"); },
    setLastTab(v) { write("lastTab", v); },

    /* --- playground scratchpad ---
       Local only, and deliberately not synced to Firestore: it's a scratchpad,
       not user content worth reconciling across devices. */
    getPlaygroundCode() { return read("playgroundCode", ""); },
    setPlaygroundCode(v) { write("playgroundCode", v); },
    getPlaygroundInput() { return read("playgroundInput", ""); },
    setPlaygroundInput(v) { write("playgroundInput", v); },
    getPlaygroundSplit() { return read("playgroundSplit", 0); },   // editor width %, 0 = default
    setPlaygroundSplit(v) { write("playgroundSplit", v); },

    /* --- Solve IDE pane sizes ({ x, y } percentages, or null = defaults) ---
       x = problem pane width, y = editor height inside the code pane. Device-
       local like the playground splitter: how you like your panes is a
       property of this screen, not of your account. */
    getSolveSplit() { return read("solveSplit", null); },
    setSolveSplit(v) { write("solveSplit", v); },

    /* --- focus pack (a pack id from the manifest, or null = off) ---
       Device-local like the theme: which role you're preparing for is a
       per-device study mode, not synced user content. */
    getFocusPack() { return read("focusPack", null); },
    setFocusPack(v) { write("focusPack", v || null); },

    /* --- revise mode (false = Preparation, true = Revise) ---
       Device-local study mode, like the theme: whether you're deep-learning or
       doing a fast pre-interview refresh is a property of this screen/session,
       not synced account content. */
    getReviseMode() { return read("reviseMode", false); },
    setReviseMode(v) { write("reviseMode", !!v); },

    /* --- bookmarks (array of ids) --- */
    getBookmarks() { return new Set(read("bookmarks", [])); },
    saveBookmarks(set) { write("bookmarks", Array.from(set)); },

    /* --- progress / completed (array of ids) --- */
    getProgress() { return new Set(read("progress", [])); },
    saveProgress(set) { write("progress", Array.from(set)); },

    /* --- notes (map id -> { text, updatedAt }) ---
       Local mirror of the per-question notes that also live in Firestore
       (users/{uid}/notes/{questionId}). Kept as objects so last-write-wins
       merges work across devices. Legacy values (plain strings) are tolerated
       on read. Prefer the per-note helpers below over the raw map. */
    getNotes() { return read("notes", {}); },
    saveNotes(obj) { write("notes", obj); },
    /* normalize a stored value (string legacy | object | null) to {text,updatedAt} | null */
    getNote(id) {
      const raw = read("notes", {})[id];
      if (raw == null) return null;
      if (typeof raw === "string") return raw ? { text: raw, updatedAt: 0 } : null;
      return raw.text ? { text: raw.text, updatedAt: raw.updatedAt || 0 } : null;
    },
    setNote(id, note) {
      const all = read("notes", {});
      all[id] = { text: note.text, updatedAt: note.updatedAt || Date.now() };
      write("notes", all);
    },
    deleteNote(id) {
      const all = read("notes", {});
      delete all[id];
      write("notes", all);
    },

    /* --- highlights (map id -> { ranges, updatedAt }) ---
       Local mirror of users/{uid}/highlights/{questionId}. `ranges` is an array
       of { region, start, end, color } text spans. Same last-write-wins model
       as notes; both ride the generic IQB.cloud per-question layer. */
    getHighlights() { return read("highlights", {}); },
    getHL(id) {
      const raw = read("highlights", {})[id];
      if (raw == null || !Array.isArray(raw.ranges) || !raw.ranges.length) return null;
      return { ranges: raw.ranges, updatedAt: raw.updatedAt || 0 };
    },
    setHL(id, hl) {
      const all = read("highlights", {});
      all[id] = { ranges: hl.ranges || [], updatedAt: hl.updatedAt || Date.now() };
      write("highlights", all);
    },
    deleteHL(id) {
      const all = read("highlights", {});
      delete all[id];
      write("highlights", all);
    },

    /* --- solutions (map id -> { code, lang, status, passed, total, attempts, updatedAt }) ---
       Local mirror of users/{uid}/solutions/{questionId} — the code the reader
       last had in the Solve editor for a coding question, plus how it scored.
       Unlike the playground scratchpad this IS worth reconciling across
       devices: it's the reader's own work on a specific problem, and picking a
       half-finished attempt back up on another machine is the whole point.
       Same last-write-wins model as notes and highlights. */
    getSolutions() { return read("solutions", {}); },
    getSolution(id) {
      const raw = read("solutions", {})[id];
      if (raw == null || typeof raw.code !== "string") return null;
      return {
        code: raw.code,
        lang: raw.lang || "js",
        status: raw.status || "attempted",
        passed: raw.passed || 0,
        total: raw.total || 0,
        attempts: raw.attempts || 0,
        updatedAt: raw.updatedAt || 0
      };
    },
    setSolution(id, sol) {
      const all = read("solutions", {});
      all[id] = {
        code: sol.code || "",
        lang: sol.lang || "js",
        status: sol.status || "attempted",
        passed: sol.passed || 0,
        total: sol.total || 0,
        attempts: sol.attempts || 0,
        updatedAt: sol.updatedAt || Date.now()
      };
      write("solutions", all);
    },
    deleteSolution(id) {
      const all = read("solutions", {});
      delete all[id];
      write("solutions", all);
    },

    /* --- highlighter pen preference (device-local, not synced) --- */
    getHLPen() { return read("hlPen", { on: false, color: "yellow" }); },
    setHLPen(v) { write("hlPen", v); },

    /* --- quick note (floating capture window) ---
       Device-local on purpose. The draft is unfinished writing, and the
       geometry describes this screen — syncing either would push a half
       sentence, or a window positioned for a 27" monitor, onto a laptop.
       A finished quick note is a notebook entry and syncs like any other. */
    getQuickNoteDraft() { return read("quickNoteDraft", null); },
    setQuickNoteDraft(v) { write("quickNoteDraft", v); },
    clearQuickNoteDraft() { try { localStorage.removeItem(PREFIX + "quickNoteDraft"); } catch (e) { /* ignore */ } },
    getQuickNoteBox() { return read("quickNoteBox", null); },   // { left, top, width, height }
    setQuickNoteBox(v) { write("quickNoteBox", v); },

    /* --- progress rows dismissed from the profile (array of category keys) ---
       Device-local on purpose: "stop showing me SQL" is a display preference
       for this screen, not user content worth reconciling across devices. */
    getHiddenProgress() { return new Set(read("hiddenProgress", [])); },
    saveHiddenProgress(set) { write("hiddenProgress", Array.from(set)); },

    /* --- last opened --- */
    setLastOpened(id) { write("lastOpened", id); },
    getLastOpened() { return read("lastOpened", null); },

    /* --- sign-out wipe ---
       Drops everything personal from this device so the next person to open the
       browser sees a clean slate. Device preferences (theme, last tab, pen) stay.
       Safe to call any time: the cloud copy is the source of truth and comes
       back on the next sign-in. */
    clearUserData() {
      // "notebook" MUST be in this list: it is the reader's own writing, and
      // leaving it behind would show the next person on a shared browser
      // everything the previous user wrote.
      // "quickNoteDraft" belongs here for the same reason as "notebook": an
      // unsaved draft is still the previous user's writing.
      // "hiddenProgress" rides along: it describes the previous user's
      // categories, so it would only confuse the next reader's profile.
      // "solutions" is the reader's own code — same reasoning as "notebook".
      ["bookmarks", "progress", "notes", "notebook", "highlights", "solutions", "lastOpened", "quickNoteDraft", "hiddenProgress"].forEach(function (k) {
        try { localStorage.removeItem(PREFIX + k); } catch (e) { /* ignore */ }
      });
    },

    /* --- export / import all user data --- */
    exportAll() {
      return JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        bookmarks: read("bookmarks", []),
        progress: read("progress", []),
        notes: read("notes", {}),
        notebook: read("notebook", {}),
        highlights: read("highlights", {}),
        solutions: read("solutions", {})
      }, null, 2);
    },
    importAll(json) {
      const data = JSON.parse(json);
      if (Array.isArray(data.bookmarks)) write("bookmarks", data.bookmarks);
      if (Array.isArray(data.progress)) write("progress", data.progress);
      if (data.notes && typeof data.notes === "object") write("notes", data.notes);
      if (data.notebook && typeof data.notebook === "object") write("notebook", data.notebook);
      if (data.highlights && typeof data.highlights === "object") write("highlights", data.highlights);
      if (data.solutions && typeof data.solutions === "object") write("solutions", data.solutions);
      return true;
    }
  };

  IQB.storage = S;
})();

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

    /* --- highlighter pen preference (device-local, not synced) --- */
    getHLPen() { return read("hlPen", { on: false, color: "yellow" }); },
    setHLPen(v) { write("hlPen", v); },

    /* --- last opened --- */
    setLastOpened(id) { write("lastOpened", id); },
    getLastOpened() { return read("lastOpened", null); },

    /* --- export / import all user data --- */
    exportAll() {
      return JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        bookmarks: read("bookmarks", []),
        progress: read("progress", []),
        notes: read("notes", {}),
        highlights: read("highlights", {})
      }, null, 2);
    },
    importAll(json) {
      const data = JSON.parse(json);
      if (Array.isArray(data.bookmarks)) write("bookmarks", data.bookmarks);
      if (Array.isArray(data.progress)) write("progress", data.progress);
      if (data.notes && typeof data.notes === "object") write("notes", data.notes);
      if (data.highlights && typeof data.highlights === "object") write("highlights", data.highlights);
      return true;
    }
  };

  IQB.storage = S;
})();

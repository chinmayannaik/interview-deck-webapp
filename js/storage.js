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
    getTheme() { return read("theme", null); },              // 'light' | 'dark' | null (system)
    setTheme(v) { write("theme", v); },

    /* --- last tab --- */
    getLastTab() { return read("lastTab", "all"); },
    setLastTab(v) { write("lastTab", v); },

    /* --- bookmarks (array of ids) --- */
    getBookmarks() { return new Set(read("bookmarks", [])); },
    saveBookmarks(set) { write("bookmarks", Array.from(set)); },

    /* --- progress / completed (array of ids) --- */
    getProgress() { return new Set(read("progress", [])); },
    saveProgress(set) { write("progress", Array.from(set)); },

    /* --- notes (map id -> text) --- */
    getNotes() { return read("notes", {}); },
    saveNotes(obj) { write("notes", obj); },

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
        notes: read("notes", {})
      }, null, 2);
    },
    importAll(json) {
      const data = JSON.parse(json);
      if (Array.isArray(data.bookmarks)) write("bookmarks", data.bookmarks);
      if (Array.isArray(data.progress)) write("progress", data.progress);
      if (data.notes && typeof data.notes === "object") write("notes", data.notes);
      return true;
    }
  };

  IQB.storage = S;
})();

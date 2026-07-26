/* ============================================================
   Solutions — the code a reader wrote for a coding question.

   One more consumer of the generic per-question user-state layer
   (IQB.cloud, js/sync.js): documents live at users/{uid}/solutions/{questionId}
   and are mirrored to localStorage so the Solve editor works signed-out and
   offline, merging last-write-wins on sign-in. Identical lifecycle to
   js/notes.js and js/highlights.js — no change to IQB.cloud was needed.

   A document is:
     code      — the JavaScript last in the editor (draft or accepted)
     lang      — "js" today; the field exists so a second language doesn't
                 need a migration
     status    — "solved" once every test case passed, else "attempted"
     passed/total — the last submission's score, for the card badge
     attempts  — how many times Submit has been pressed
     updatedAt — epoch ms, the merge key

   Reads are served synchronously from the local mirror so a card can paint its
   badge while rendering; the cloud copy is pulled in behind that.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const store = IQB.storage;

  const FEATURE = "solutions";

  const cloud = function () { return window.IQB.cloud || null; };
  const signedIn = function () { const c = cloud(); return !!(c && c.isSignedIn()); };

  const listeners = [];
  function emitChange(questionId) {
    listeners.forEach(function (cb) {
      try { cb(questionId); } catch (e) { /* isolate a bad listener */ }
    });
  }

  function normalize(raw) {
    if (!raw || typeof raw.code !== "string") return null;
    return {
      code: raw.code,
      lang: raw.lang || "js",
      status: raw.status === "solved" ? "solved" : "attempted",
      passed: raw.passed || 0,
      total: raw.total || 0,
      attempts: raw.attempts || 0,
      updatedAt: raw.updatedAt || 0
    };
  }

  /* ---- persistence (cloud-first when signed in, always mirror locally) ---- */

  /* Synchronous, from the mirror. Cards call this while building. */
  function peek(questionId) { return store.getSolution(questionId); }

  async function load(questionId) {
    if (signedIn()) {
      try {
        const remote = normalize(await cloud().load(FEATURE, questionId));
        if (remote) {
          const local = store.getSolution(questionId);
          /* A draft typed offline on this device must not be thrown away by a
             staler cloud copy — the reader would watch their work vanish. */
          if (!local || remote.updatedAt >= local.updatedAt) {
            store.setSolution(questionId, remote);
            return remote;
          }
          return local;
        }
      } catch (e) { /* offline → local mirror */ }
    }
    return store.getSolution(questionId);
  }

  async function save(questionId, data) {
    const sol = normalize(Object.assign({ code: "" }, data, { updatedAt: Date.now() }));
    store.setSolution(questionId, sol);
    emitChange(questionId);
    if (signedIn()) {
      try { await cloud().save(FEATURE, questionId, sol); }
      catch (e) { console.warn("[solutions] cloud sync failed (kept locally):", e); }
    }
    return sol;
  }

  async function remove(questionId) {
    store.deleteSolution(questionId);
    emitChange(questionId);
    if (signedIn()) {
      try { await cloud().remove(FEATURE, questionId); }
      catch (e) { console.warn("[solutions] cloud delete failed:", e); }
    }
  }

  async function mergeOnSignIn() {
    if (!signedIn()) return;
    let remote = {};
    try { remote = await cloud().loadAll(FEATURE); }
    catch (e) { return; }

    const local = store.getSolutions();
    const ids = new Set(Object.keys(local).concat(Object.keys(remote)));
    for (const id of ids) {
      const l = store.getSolution(id);
      const r = normalize(remote[id]);
      if (l && (!r || l.updatedAt > r.updatedAt)) {
        try { await cloud().save(FEATURE, id, l); } catch (e) { /* keep local */ }
      } else if (r && (!l || r.updatedAt > l.updatedAt)) {
        store.setSolution(id, r);
        emitChange(id);
      }
    }
    emitChange(null); // null = "several changed", repaint everything
  }

  if (window.IQB.cloud) {
    IQB.cloud.onChange(function (user) {
      if (user) mergeOnSignIn();
      else emitChange(null); // sign-out wiped the mirror; drop every badge
    });
  }

  IQB.solutions = {
    peek: peek,
    load: load,
    save: save,
    remove: remove,
    /* "solved" | "attempted" | null — what a card badge renders from. */
    statusOf: function (questionId) {
      const s = peek(questionId);
      return s ? s.status : null;
    },
    /* cb(questionId | null); returns an unsubscribe function. */
    onChange: function (cb) {
      listeners.push(cb);
      return function () {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    }
  };
})();

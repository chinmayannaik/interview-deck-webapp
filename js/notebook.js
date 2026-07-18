/* ============================================================
   My Notes — the notebook store.

   One collection holding every note the reader writes, whether it was started
   from the Notes tab or from a question card's "Personal Note" section. A note
   that belongs to a question simply carries `questionId`; that is the ONLY
   difference between the two, which is what makes "everything in one place"
   true rather than a slogan.

   Storage mirrors the pattern the rest of the app already uses:
     • IQB.cloud  — users/{uid}/notebook/{noteId} (the generic per-id layer in
                    js/sync.js; it needed no changes, its _ref takes any id).
     • IQB.storage — a localStorage mirror so notes work signed-out and offline.
   The two reconcile last-write-wins by updatedAt on sign-in.

   DELETES ARE TOMBSTONES, not removals. A plain last-write-wins merge over
   whatever documents happen to exist cannot represent "this was deleted": the
   device that still has a copy simply uploads it again, and the note comes back
   from the dead on the next sign-in. So a delete writes { deleted: true } with
   a fresh updatedAt and that record wins like any other. Tombstones are purged
   locally once they are older than PURGE_AFTER_MS.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};

  const FEATURE = "notebook";
  const STORE_KEY = "notebook";      // localStorage map: id -> note
  const META_ID = "_meta";           // reserved doc; never a user note
  const PURGE_AFTER_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

  const cloud = function () { return window.IQB.cloud || null; };
  const signedIn = function () { const c = cloud(); return !!(c && c.isSignedIn()); };

  const listeners = [];
  function emit() { listeners.forEach(function (cb) { try { cb(); } catch (e) { /* isolate */ } }); }

  /* ---------- local mirror ---------- */
  function readAll() {
    try { return JSON.parse(localStorage.getItem("iqb:" + STORE_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }

  /* localStorage is ~5MB and a notebook full of pasted code reaches that far
     sooner than bookmarks ever would. A silent quota exception would look like
     "my note didn't save", so surface it instead of swallowing it. */
  let quotaWarned = false;
  function writeAll(map) {
    try {
      localStorage.setItem("iqb:" + STORE_KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      if (!quotaWarned) {
        quotaWarned = true;
        console.error("[notebook] local save failed (storage full?):", e);
        try { IQB.utils.toast("Storage is full — this note may not survive a refresh."); }
        catch (_) { /* utils may not be loaded yet */ }
      }
      return false;
    }
  }

  function putLocal(note) {
    const all = readAll();
    all[note.id] = note;
    writeAll(all);
  }

  /* ---------- shape ---------- */
  function newId() {
    return "n-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  /* Every field is normalised on the way in, so a note read from the cloud, the
     mirror, or a migration is the same shape everywhere downstream. */
  function normalize(raw, id) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: id || raw.id,
      title: typeof raw.title === "string" ? raw.title : "",
      html: typeof raw.html === "string" ? raw.html : "",
      plain: typeof raw.plain === "string" ? raw.plain : "",
      tags: Array.isArray(raw.tags)
        ? raw.tags.map(function (t) { return String(t).trim().toLowerCase(); }).filter(Boolean)
        : [],
      quickRevision: raw.quickRevision === true,
      questionId: raw.questionId || null,
      createdAt: raw.createdAt || raw.updatedAt || Date.now(),
      updatedAt: raw.updatedAt || 0,
      deleted: raw.deleted === true
    };
  }

  function isUserNote(id, note) {
    return id !== META_ID && id.charAt(0) !== "_" && note && !note.deleted;
  }

  /* ---------- reads ---------- */
  function all() {
    const map = readAll();
    const out = [];
    Object.keys(map).forEach(function (id) {
      const n = normalize(map[id], id);
      if (isUserNote(id, n)) out.push(n);
    });
    out.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return out;
  }

  function get(id) {
    const n = normalize(readAll()[id], id);
    return isUserNote(id, n) ? n : null;
  }

  function byQuestion(questionId) {
    const map = readAll();
    const id = qNoteId(questionId);
    const direct = normalize(map[id], id);
    if (isUserNote(id, direct)) return direct;
    // A note may have been linked to this question without carrying the
    // deterministic id (created from the Notes tab, then linked).
    const hit = all().find(function (n) { return n.questionId === questionId; });
    return hit || null;
  }

  /* Deterministic id for a question's note. Deterministic because the migration
     must be safe to run on two devices: the same source note has to land on the
     same document id, or the reader ends up with duplicates. */
  function qNoteId(questionId) { return "q-" + questionId; }

  /* ---------- tag vocabulary ----------
     Tags are their own thing, not merely a side effect of being typed into a
     note. The reader can create "revision" once and then pick it from a list
     forever after, so the vocabulary has to outlive the notes that use it — a
     tag with zero notes must still exist and still be offered.

     It lives in a reserved document (_tags) inside the same collection, so it
     syncs across devices for free and isUserNote() already keeps it out of the
     note list. Kept separate from _meta so writing the migration marker can
     never clobber the vocabulary. */
  const TAGS_ID = "_tags";

  function readVocab() {
    const raw = readAll()[TAGS_ID];
    const list = raw && Array.isArray(raw.tags) ? raw.tags : [];
    return list.map(function (t) { return String(t).trim().toLowerCase(); }).filter(Boolean);
  }

  async function writeVocab(list) {
    const uniq = Array.from(new Set(list.map(function (t) {
      return String(t).trim().toLowerCase();
    }).filter(Boolean)));
    const doc = { tags: uniq, updatedAt: Date.now() };
    const map = readAll();
    map[TAGS_ID] = doc;
    writeAll(map);
    if (signedIn()) {
      try { await cloud().save(FEATURE, TAGS_ID, doc); }
      catch (e) { console.warn("[notebook] tag save failed (kept locally):", e); }
    }
    emit();
    return uniq;
  }

  async function addTag(name) {
    const t = String(name || "").trim().toLowerCase();
    if (!t) return readVocab();
    const v = readVocab();
    if (v.indexOf(t) !== -1) return v;
    return writeVocab(v.concat([t]));
  }

  /* Forgets the tag itself AND detaches it from every note carrying it —
     leaving notes tagged with something the picker no longer offers would make
     them unreachable through the group/filter UI. */
  async function removeTag(name) {
    const t = String(name || "").trim().toLowerCase();
    await writeVocab(readVocab().filter(function (x) { return x !== t; }));
    for (const n of all()) {
      if (n.tags.indexOf(t) === -1) continue;
      await update(n.id, { tags: n.tags.filter(function (x) { return x !== t; }) });
    }
    return readVocab();
  }

  async function renameTag(from, to) {
    const a = String(from || "").trim().toLowerCase();
    const b = String(to || "").trim().toLowerCase();
    if (!a || !b || a === b) return readVocab();
    await writeVocab(readVocab().map(function (x) { return x === a ? b : x; }));
    for (const n of all()) {
      if (n.tags.indexOf(a) === -1) continue;
      const next = n.tags.map(function (x) { return x === a ? b : x; });
      await update(n.id, { tags: Array.from(new Set(next)) });
    }
    return readVocab();
  }

  /* Every known tag with its note count — the union of the saved vocabulary and
     anything actually in use, so a tag created here and a tag inherited from a
     migrated question note both appear, and a brand-new tag shows with count 0
     rather than vanishing until its first note is saved. */
  function tags() {
    const counts = new Map();
    readVocab().forEach(function (t) { counts.set(t, 0); });
    all().forEach(function (n) {
      n.tags.forEach(function (t) { counts.set(t, (counts.get(t) || 0) + 1); });
    });
    return Array.from(counts, function (e) { return { tag: e[0], count: e[1] }; })
      .sort(function (a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
  }

  /* ---------- writes ---------- */
  async function push(note) {
    putLocal(note);
    if (signedIn()) {
      try { await cloud().save(FEATURE, note.id, note); }
      catch (e) { console.warn("[notebook] cloud save failed (kept locally):", e); }
    }
    // Any tag a note carries becomes part of the vocabulary, so tags that
    // arrived with a migrated question note are offered in the picker too —
    // the reader never has to retype a tag the app already knows about.
    if (!note.deleted && note.tags && note.tags.length) {
      const known = readVocab();
      const fresh = note.tags.filter(function (t) { return known.indexOf(t) === -1; });
      if (fresh.length) await writeVocab(known.concat(fresh));
    }
    emit();
    return note;
  }

  async function create(fields) {
    const now = Date.now();
    const note = normalize(Object.assign({
      createdAt: now, updatedAt: now
    }, fields || {}), (fields && fields.id) || newId());
    return push(note);
  }

  async function update(id, patch) {
    const cur = get(id);
    if (!cur) return null;
    const next = normalize(Object.assign({}, cur, patch, { updatedAt: Date.now() }), id);
    return push(next);
  }

  /* Tombstone, not a delete — see the header comment. The body is dropped so a
     deleted note stops costing storage while its marker lives on. */
  async function remove(id) {
    const cur = get(id);
    if (!cur) return;
    return push(normalize({
      id: id,
      questionId: cur.questionId,
      createdAt: cur.createdAt,
      updatedAt: Date.now(),
      deleted: true
    }, id));
  }

  /* ---------- sign-in merge ---------- */
  /* Reconciles the mirror with the cloud, last-write-wins by updatedAt, with
     tombstones competing on equal terms. Also purges tombstones that are old
     enough that no other device can still be carrying a stale live copy. */
  async function mergeOnSignIn() {
    if (!signedIn()) return;

    let remote = {};
    try { remote = await cloud().loadAll(FEATURE); }
    catch (e) { return; /* offline — try again next sign-in */ }

    const local = readAll();
    const ids = new Set(Object.keys(local).concat(Object.keys(remote)));
    const merged = {};
    const pushUps = [];
    const cutoff = Date.now() - PURGE_AFTER_MS;

    ids.forEach(function (id) {
      if (id === META_ID) { merged[id] = remote[id] || local[id]; return; }
      const l = normalize(local[id], id);
      const r = normalize(remote[id], id);

      let winner = null;
      if (l && r) winner = (l.updatedAt || 0) >= (r.updatedAt || 0) ? l : r;
      else winner = l || r;
      if (!winner) return;

      // Drop long-dead tombstones entirely rather than syncing them forever.
      if (winner.deleted && winner.updatedAt < cutoff) return;

      merged[id] = winner;
      // Only upload when the local copy actually won; otherwise we'd rewrite
      // every document on every sign-in.
      if (l && winner === l && (!r || (l.updatedAt || 0) > (r.updatedAt || 0))) pushUps.push(winner);
    });

    writeAll(merged);
    for (const n of pushUps) {
      try { await cloud().save(FEATURE, n.id, n); } catch (e) { /* keep local */ }
    }
    emit();
  }

  /* ---------- migration from the old per-question notes ----------
     The previous feature stored one plain-text note per question at
     users/{uid}/notes/{questionId}. Each becomes a notebook entry with the
     deterministic id q-<questionId>.

     The "already migrated" marker lives in the CLOUD (notebook/_meta), not in
     localStorage. A per-device flag would let a second device re-run the
     migration and resurrect notes the reader had already deleted here — the
     same class of bug tombstones exist to prevent. Signed-out readers migrate
     their local mirror under a local flag, and the deterministic ids mean the
     cloud pass later merges with it instead of duplicating it. */
  const LOCAL_MIGRATED = "iqb:notebookMigratedV1";

  async function alreadyMigrated() {
    if (signedIn()) {
      try {
        const meta = await cloud().load(FEATURE, META_ID);
        if (meta && meta.migratedV1) return true;
      } catch (e) { return true; /* can't tell → do NOT risk duplicating */ }
      return false;
    }
    try { return localStorage.getItem(LOCAL_MIGRATED) === "1"; } catch (e) { return true; }
  }

  async function markMigrated() {
    try { localStorage.setItem(LOCAL_MIGRATED, "1"); } catch (e) { /* ignore */ }
    if (signedIn()) {
      try { await cloud().save(FEATURE, META_ID, { migratedV1: true, at: Date.now() }); }
      catch (e) { /* retried next boot */ }
    }
  }

  /* Find a question by id across the loaded category data, for the note title.
     Absent data is fine — the note keeps its questionId link either way. */
  function findQuestion(questionId) {
    const data = window.IQB.data || {};
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
      const list = data[keys[i]];
      if (!Array.isArray(list)) continue;
      const hit = list.find(function (q) { return q && q.id === questionId; });
      if (hit) return { q: hit, category: keys[i] };
    }
    return null;
  }

  /* Old notes were plain text. Convert to paragraphs, escaping first so a note
     that happened to contain "<" doesn't become markup. */
  function textToHtml(text) {
    return String(text || "")
      .split(/\n{2,}/)
      .map(function (para) {
        const safe = para
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");
        return "<p>" + safe + "</p>";
      })
      .join("");
  }

  async function migrate() {
    if (await alreadyMigrated()) return { migrated: 0, skipped: true };

    // Gather the old notes from both sides; the cloud wins on conflict.
    const sources = {};
    const localOld = (IQB.storage && IQB.storage.getNotes && IQB.storage.getNotes()) || {};
    Object.keys(localOld).forEach(function (qid) {
      const raw = localOld[qid];
      const text = typeof raw === "string" ? raw : (raw && raw.text) || "";
      if (text) sources[qid] = { text: text, updatedAt: (raw && raw.updatedAt) || 0 };
    });
    if (signedIn()) {
      try {
        const remoteOld = await cloud().loadAll("notes");
        Object.keys(remoteOld).forEach(function (qid) {
          const r = remoteOld[qid];
          if (r && r.text) sources[qid] = { text: r.text, updatedAt: r.updatedAt || 0 };
        });
      } catch (e) { /* offline → migrate what we have; flag stays unset */ }
    }

    let count = 0;
    const existing = readAll();
    for (const qid of Object.keys(sources)) {
      const id = qNoteId(qid);
      if (existing[id]) continue;               // already carried over
      const src = sources[qid];
      const found = findQuestion(qid);
      const q = found && found.q;
      const note = normalize({
        id: id,
        title: q && q.question ? String(q.question).slice(0, 120) : "Note on a question",
        html: textToHtml(src.text),
        plain: String(src.text),
        // A note carries ONE tag, so a migrated note inherits its question's
        // category — the single label that actually says where it belongs.
        tags: found && found.category ? [String(found.category).trim().toLowerCase()] : [],
        questionId: qid,
        createdAt: src.updatedAt || Date.now(),
        updatedAt: src.updatedAt || Date.now()
      }, id);
      await push(note);
      count++;
    }

    await markMigrated();
    return { migrated: count, skipped: false };
  }

  /* ---------- boot ---------- */
  /* Resolves once the store is usable. Migration is attempted on load and again
     on sign-in, since a reader who signs in later brings a whole cloud history
     with them. The old users/{uid}/notes documents are deliberately left in
     place: this pass is safe to re-run, and keeping the originals means a bad
     migration is recoverable. */
  let readyResolve;
  const ready = new Promise(function (r) { readyResolve = r; });

  async function boot() {
    try { await migrate(); } catch (e) { console.warn("[notebook] migration failed:", e); }
    readyResolve();
  }

  if (window.IQB.cloud && IQB.cloud.onChange) {
    IQB.cloud.onChange(async function (user) {
      if (!user) { emit(); return; }
      await mergeOnSignIn();
      try { await migrate(); } catch (e) { /* logged above */ }
      emit();
    });
  }
  boot();

  IQB.notebook = {
    ready: ready,
    all: all,
    get: get,
    byQuestion: byQuestion,
    qNoteId: qNoteId,
    tags: tags,
    vocab: readVocab,
    addTag: addTag,
    removeTag: removeTag,
    renameTag: renameTag,
    create: create,
    update: update,
    remove: remove,
    migrate: migrate,
    onChange: function (cb) {
      listeners.push(cb);
      return function () {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    /* Testing/debug hook — not used by the UI. */
    _readAll: readAll
  };
})();

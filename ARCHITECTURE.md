# Interview Questions Bank — Architecture

A single **content source of truth** (JSON) feeds two clients — a responsive
**website** and a **Flutter Android app** — both fully offline-capable.
**Firebase** stores only per-user data, never questions.

```
                    ┌────────────────────────────────┐
                    │  interview-questions-data (repo) │   ← content only
                    │  shared-data/*.json + manifest   │
                    └───────────────┬────────────────┘
                        served via  │  jsDelivr CDN / GitHub raw
                 ┌──────────────────┴───────────────────┐
                 ▼                                       ▼
        ┌──────────────────┐                   ┌────────────────────┐
        │     Website      │                   │  Flutter Android   │
        │ fetch()+SW cache │                   │ download+file cache│
        └────────┬─────────┘                   └─────────┬──────────┘
                 │  user data (progress/bookmarks/notes) │
                 └──────────────────┬────────────────────┘
                                    ▼
                        ┌────────────────────────┐
                        │  Firebase (Auth + FS)  │   ← users only, no content
                        └────────────────────────┘
```

---

## 1. Repository topology

Split content from code so you can fix a typo without redeploying anything.

| Repo | Contains | Deploys to |
|------|----------|-----------|
| `interview-questions-bank` (this repo) | website (HTML/CSS/JS), service worker | Netlify |
| `interview-questions-data` (new repo) | `shared-data/` only (`*.json` + `manifest.json`) | GitHub → jsDelivr CDN |
| `interview_questions_app` (new repo) | Flutter app | Play Store |

**Why a separate content repo:** content changes ship by pushing to `main` of
`interview-questions-data`. No Netlify redeploy, no Play Store release. Both
clients pull the new content on their next online launch.

> **Simplest start (what this repo does today):** `shared-data/` lives *inside*
> the website repo and is served same-origin. This is fully working and offline-
> capable right now. When you're ready, move `shared-data/` to its own repo and
> flip `IQB.DATA_BASE` to the CDN URL (one line — see §5). You can keep them in
> sync with a git **submodule** or a CI copy step in the meantime.

---

## 2. Folder structure

**Content repo (`interview-questions-data`)**
```
shared-data/
  manifest.json
  angular.json  angular-coding.json  javascript.json  typescript.json
  html.json  css.json  coding.json  rxjs.json  ngrx.json  testing.json
  general.json  java.json  springboot.json  sql.json  git.json  behavioral.json
  README.md
```

**Website repo (this one)**
```
index.html
css/…
js/
  utils.js  storage.js
  data-loader.js   ← NEW: fetches shared-data, then boots app.js
  app.js  sync.js
shared-data/       ← source of truth (or a submodule of the content repo)
scripts/migrate-to-json.js   ← one-off JS→JSON migrator (reference)
sw.js              ← offline cache (now caches the JSON, not data/*.js)
data/*.js          ← LEGACY, unreferenced. Safe to delete once satisfied.
```

**Flutter repo (`interview_questions_app`)**
```
lib/
  main.dart
  models/question.dart  models/manifest.dart
  data/content_repository.dart   ← download / cache / version-check
  data/remote_config.dart        ← base URL + endpoints
  services/user_data_service.dart← Firebase + local mirror (progress/bookmarks)
  ui/…
```

---

## 3. JSON schema (unchanged from the original object shape)

```jsonc
// shared-data/<category>.json  →  Question[]
{
  "id": "git-merge-rebase",   // globally unique, STABLE (used as the sync key)
  "category": "git",          // equals the manifest category id
  "difficulty": "intermediate", // beginner | intermediate | advanced
  "tags": ["merge", "rebase"],  // string[]
  "question": "Merge vs rebase.", // plain text
  "answer": "<p>…</p>",        // trusted HTML
  "tip": "Don't rebase shared branches.", // optional
  "code": "git rebase main",  // optional ("" when none)
  "lang": "bash",             // optional ("" when none)
  "deep": "<p>…</p>"          // optional; omitted when absent
}
```

`id` is the contract between content and user data: Firebase progress/bookmarks
are just sets of these ids. **Never reuse or renumber ids.**

---

## 4. Manifest format

```jsonc
// shared-data/manifest.json
{
  "schemaVersion": 1,   // shape of the JSON files; bump only on a breaking field change
  "version": 5,         // CONTENT version — bump on EVERY content edit (drives updates)
  "updatedAt": "2026-07-13T07:41:02.259Z",
  "totalQuestions": 450,
  "categories": [
    { "id": "angular", "file": "angular.json", "label": "Angular",
      "group": "frontend", "count": 78 },
    { "id": "ngcoding", "file": "angular-coding.json", "label": "Angular Coding",
      "group": "frontend", "count": 21 }
    // …
  ]
}
```

Design notes:
- `id` (data key) is decoupled from `file` (filename). This cleanly solves the
  legacy quirk where `angular-coding.json` registers under the id `ngcoding`.
- `group` lets both clients build the same Frontend/Backend/DevOps/Behavioral
  navigation without hard-coding it in two places.
- **`version`** is the single integer both clients compare to decide "is my
  cache stale?" — see §7.

---

## 5. Website loading mechanism

`js/data-loader.js` runs before `app.js`:

1. `fetch(manifest.json)` → store as `IQB.manifest`.
2. `Promise.all` fetch every `category.file` in parallel → populate
   `IQB.data[category.id]` (the exact shape `data/*.js` used to produce).
3. Inject `js/app.js`, which builds its searchable index and renders as before.

`app.js`, `storage.js`, `sync.js` were **not** changed — they still read
`IQB.data.<id>`. All existing features (search, difficulty/category filter,
bookmarks, progress, practice mode, random, statistics, deep-links, export/
import) work unchanged.

**Switching to the CDN (no redeploy for content):** set the base URL before the
loader runs, in `index.html`:
```html
<script>window.IQB = { DATA_BASE:
  "https://cdn.jsdelivr.net/gh/USER/interview-questions-data@main/shared-data/" };
</script>
```
jsDelivr is CORS-enabled and globally cached. (If you go cross-origin, also add a
runtime cache rule for that host in `sw.js` — see §9.)

---

## 6. Flutter loading mechanism + local caching

### Recommended local store: **plain JSON files on disk** (with `path_provider`)

You are downloading files; store them **as-is** and parse into memory on launch.
For 450 read-only records this beats every database:

| Option | Verdict for this use case |
|--------|---------------------------|
| **File cache (raw JSON on disk)** | ✅ **Recommended.** Whole-file replace on update is trivial; zero schema/migrations; parse to `List<Question>` once at startup; in-memory search over 450 items is instant. |
| **Hive** | Good, but adds a dependency/adapters for no gain over files for *content*. **Do use Hive (or `shared_preferences`) for the tiny user-data mirror**, not for questions. |
| **Isar** | Overkill. Its strength (indexed queries over large datasets) is wasted on 450 items you already hold in RAM. Native binaries add build weight. |
| **SQLite (`sqflite`)** | Overkill + you'd hand-write a schema/upsert for data that's naturally document-shaped. |

**Rule of thumb:** content = files + in-memory list; user data = Hive/prefs +
Firebase. Reach for Isar/SQLite only if the bank grows to tens of thousands of
questions and you need on-disk indexed search.

### Reference implementation

```dart
// models/question.dart
class Question {
  final String id, category, question, answer;
  final String? difficulty, tip, code, lang, deep;
  final List<String> tags;
  Question.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        category = j['category'],
        question = j['question'] ?? '',
        answer = j['answer'] ?? '',
        difficulty = j['difficulty'],
        tip = j['tip'],
        code = j['code'],
        lang = j['lang'],
        deep = j['deep'],
        tags = (j['tags'] as List?)?.cast<String>() ?? const [];
}

// models/manifest.dart
class Manifest {
  final int version;
  final String updatedAt;
  final List<CategoryMeta> categories;
  Manifest(this.version, this.updatedAt, this.categories);
  factory Manifest.fromJson(Map<String, dynamic> j) => Manifest(
        j['version'], j['updatedAt'],
        (j['categories'] as List).map((c) => CategoryMeta.fromJson(c)).toList());
}
class CategoryMeta {
  final String id, file, label, group;
  final int count;
  CategoryMeta.fromJson(Map<String, dynamic> j)
      : id = j['id'], file = j['file'], label = j['label'],
        group = j['group'], count = j['count'] ?? 0;
}
```

```dart
// data/content_repository.dart
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

const _base =
    'https://cdn.jsdelivr.net/gh/USER/interview-questions-data@main/shared-data/';

class ContentRepository {
  Directory? _dir;
  Future<Directory> get _cacheDir async =>
      _dir ??= Directory('${(await getApplicationSupportDirectory()).path}/content')
        ..createSync(recursive: true);

  Future<File> _file(String name) async => File('${(await _cacheDir).path}/$name');

  /// Called once at startup. Returns questions, always offline-safe.
  Future<List<Question>> load() async {
    // 1. Ensure we have SOME cache (first run needs the network).
    final localManifestFile = await _file('manifest.json');
    if (!localManifestFile.existsSync()) {
      await _downloadAll();               // first launch (throws if truly offline+empty)
    } else {
      // 2. Non-blocking freshness check — never blocks the UI on the network.
      unawaited(_syncIfStale());
    }
    return _readFromCache();
  }

  Future<void> _syncIfStale() async {
    try {
      final remote = await _fetchJson('manifest.json');           // remote manifest
      final localManifest = jsonDecode(await (await _file('manifest.json')).readAsString());
      if (remote['version'] != localManifest['version']) {
        await _downloadChanged(localManifest, remote);            // delta update
      }
    } catch (_) {/* offline → keep serving cache silently */}
  }

  Future<void> _downloadAll() async {
    final m = await _fetchJson('manifest.json');
    await (await _file('manifest.json')).writeAsString(jsonEncode(m));
    for (final c in (m['categories'] as List)) {
      await _downloadCategory(c['file']);
    }
  }

  /// Only re-download categories whose count changed (or all, if you prefer
  /// simplicity — 450 questions is a few hundred KB gzipped).
  Future<void> _downloadChanged(Map local, Map remote) async {
    final localCounts = {
      for (final c in (local['categories'] as List)) c['file']: c['count']
    };
    for (final c in (remote['categories'] as List)) {
      if (localCounts[c['file']] != c['count'] || !(await _file(c['file'])).existsSync()) {
        await _downloadCategory(c['file']);
      }
    }
    await (await _file('manifest.json')).writeAsString(jsonEncode(remote)); // commit last
  }

  Future<void> _downloadCategory(String file) async {
    final res = await http.get(Uri.parse('$_base$file'));
    if (res.statusCode != 200) throw HttpException('$file ${res.statusCode}');
    await (await _file(file)).writeAsString(res.body);            // atomic-ish: file per category
  }

  Future<Map<String, dynamic>> _fetchJson(String file) async {
    final res = await http.get(Uri.parse('$_base$file'));
    if (res.statusCode != 200) throw HttpException('$file ${res.statusCode}');
    return jsonDecode(res.body);
  }

  Future<List<Question>> _readFromCache() async {
    final manifest = jsonDecode(await (await _file('manifest.json')).readAsString());
    final out = <Question>[];
    for (final c in (manifest['categories'] as List)) {
      final f = await _file(c['file']);
      if (!f.existsSync()) continue;
      for (final q in jsonDecode(await f.readAsString())) {
        out.add(Question.fromJson(q));
      }
    }
    return out;
  }
}
```

**First-launch resilience:** ship a **bundled copy** of `shared-data/` in the
app's `assets/` and seed the cache from it if the first-run download fails. Then
the app is usable offline even on a brand-new install with no connection, and the
network path only ever *upgrades* content.

---

## 7. Update flow & versioning

Both clients treat `manifest.version` as the cache-invalidation signal.

**Content author:** edit JSON → bump `version` + `updatedAt` → push.

**Website:** the service worker is *network-first*, so an online visitor gets the
newest JSON immediately; the cache is refreshed on every successful fetch and is
the fallback when offline. No version compare needed — but `version` is still
useful for a "content updated" toast.

**Flutter (offline-first, delta updates):**
```
launch → read local cache → render immediately
        └─(background)→ GET manifest.json
                         ├─ same version  → done
                         ├─ new version   → download only categories whose count
                         │                  changed → replace files → swap in memory
                         └─ offline/error → keep cache, try again next launch
```
Write the new `manifest.json` **last**, after all category files land, so a
mid-download kill never leaves a manifest pointing at data you don't have.

**Versioning policy**
- `version`: integer, +1 on every content change. Simple and total-ordered.
- `schemaVersion`: bump only when you change/remove a *field*. Clients refuse or
  migrate when they see a `schemaVersion` newer than they understand.
- (Optional) per-file `sha`/`hash` in the manifest for byte-exact change
  detection instead of the `count` heuristic.

---

## 8. GitHub hosting

1. Create `interview-questions-data`, put `shared-data/` at its root, push `main`.
2. Serve via **jsDelivr** (recommended): CDN-cached, CORS, no rate limits:
   `https://cdn.jsdelivr.net/gh/USER/interview-questions-data@main/shared-data/manifest.json`
   - `@main` = latest (jsDelivr caches ~12h; purge with `https://purge.jsdelivr.net/…`).
   - `@v1.4.0` = pin to a git tag for reproducible app releases.
3. Alternatives: **GitHub Pages** (enable Pages on the repo → clean URL, good
   CORS) or **raw.githubusercontent.com** (works, but no CDN + aggressive rate
   limits — avoid for production).

**Recommendation:** website tracks `@main` (always fresh); app tracks `@main` for
content but you *could* pin releases to a tag if you ever need lockstep.

---

## 9. Offline-first architecture

**Website (service worker, already in `sw.js`):** network-first for same-origin
GETs; every success refreshes the cache; offline falls back to cache. The JSON +
`data-loader.js` are precached in `CORE` (bumped to `iqb-v4`).

If you move data to the jsDelivr (cross-origin) URL, add a runtime rule so the SW
caches it too (the current handler ignores cross-origin):
```js
// sw.js — inside fetch handler, before the same-origin early return
const isContent = url.href.startsWith('https://cdn.jsdelivr.net/gh/USER/interview-questions-data');
if (isContent) {
  e.respondWith(
    caches.open(CACHE).then(async (c) =>
      fetch(req).then((res) => { c.put(req, res.clone()); return res; })
                .catch(() => c.match(req))));   // stale-while-… (cache fallback)
  return;
}
```

**Flutter:** the cache *is* the runtime store — the app always renders from disk
first and only reaches the network in the background to upgrade. A cold install
with no connection is covered by the bundled `assets/` seed (§6).

---

## 10. Firebase boundary (unchanged, and correct)

Firebase already does exactly the right thing in `js/sync.js`: it stores only
`{ progress: string[], bookmarks: string[], updatedAt }` per user under
`users/{uid}`. Keep it that way.

- **Store in Firebase:** auth identity, bookmarks, notes, completed ids, streaks,
  premium flag (future), cross-device sync.
- **Never store in Firebase:** question content. It lives only in `shared-data/`.
- Because user data is just *ids*, it stays valid as content grows, and syncs
  identically for web and Flutter (`cloud_firestore` + `google_sign_in`).

Suggested Firestore doc:
```jsonc
// users/{uid}
{ "progress": ["git-merge-rebase", …], "bookmarks": ["ng-signals", …],
  "streak": 5, "premium": false, "updatedAt": 1720860000000 }
```

### Last selected view (`lastTab`)

The reader's `users/{uid}` doc carries `lastTab` alongside `progress`/`bookmarks`,
so signing in on a new device lands them where they left off. **One field covers
both levels of the selection**: `state.category` holds *either* a group key
(`"frontend"`) or a category key (`"angular"`), and a category already implies
its parent group — `setCategory` derives the lit tab via `groupOf(key)`.

Unlike progress/bookmarks there is nothing to union: a view is a single choice,
so the **cloud copy wins** on sign-in — that IS the feature. Two rules keep it
from being obnoxious:

- **Restore fires once**, in `subscribe()`, never from the `onSnapshot` echo —
  otherwise switching tabs on a laptop would rip the phone away from whatever is
  being read on it.
- **`app.js` declines the restore** if the reader has already chosen a view this
  session (`viewPinned`: any `setCategory(key, /*updateHash*/ true)`, or a hash
  in the URL). A shared `#q=…` link is the most explicit intent there is and
  always outranks the saved view. An unknown key (a category deleted since the
  profile was written) is refused rather than rendering an empty list.

`iqb:lastTab` remains the device-local mirror, so the view also persists signed
out, and it is deliberately **not** wiped on sign-out (it's a device preference,
like theme and the pen — see `storage.clearUserData`).

### Per-question user state (notes + highlights)

Progress/bookmarks are small id-sets that fit in the single `users/{uid}` doc.
Per-question *content* (notes and text highlights) does **not** — it would bloat
one document and force full rewrites. Instead each such feature is a
**subcollection with one document per question**:

```
users/{uid}/notes/{questionId}       →  { "text": "revise DI", "updatedAt": 1720860000000 }
users/{uid}/highlights/{questionId}  →  { "ranges": [ { "region":"answer",
                                            "start":0, "end":7, "color":"green" } ],
                                          "updatedAt": 1720860000000 }
```

`js/sync.js` exposes a single feature-agnostic gateway, **`IQB.cloud`**
(`load / loadAll / save / remove / watch / onChange`), keyed by
`(feature, questionId)`. Two consumers ride it with **zero changes to the layer**:
`js/notes.js` (`feature="notes"`) and `js/highlights.js` (`feature="highlights"`)
— the proof that new per-question features drop in without a refactor. Both are
mirrored to `localStorage` (via `IQB.storage`) so they work signed-out/offline and
are merged last-write-wins (by `updatedAt`) on sign-in.

Highlight ranges are character offsets into a root's `textContent`. Three
highlightable regions per card, tagged with `data-hl-region`: `question`
(`.qa-qtext` — the question text only; the number lives in a separate `.qa-qnum`
span so offsets never shift with position), `answer` (`.answer`), and `deep`
(`.qa-deep`). A selection that spills outside a region (e.g. dragging across the
"1." number) is **clamped** to the region rather than rejected. On load, ranges
are re-wrapped in `<mark>` elements; the `question` region paints at card-build
time from the local mirror (it's visible while collapsed), the rest on card open.
The highlighter *pen* preference (on/off + color) is device-local (`iqb:hlPen`),
deliberately **not** synced.

**Security rules — subcollections do NOT inherit the parent's rule.** Add a
recursive wildcard so per-question docs are locked to their owner:
```
match /users/{uid} {
  allow read, write: if request.auth.uid == uid;
  match /{document=**} {                       // notes/, highlights/, …
    allow read, write: if request.auth.uid == uid;
  }
}
```

### Issue reports (`/reports`) — the one collection that is *not* per-user

Notes and highlights share one property: the author is the only reader, so
`users/{uid}/…` (and `IQB.cloud`) expresses them perfectly. An **issue report**
inverts it — a reader writes a document that only a *moderator* may read — so it
cannot live in the reporter's own subtree. It goes in a top-level `/reports`
collection, reached through a second, deliberately separate gateway:
**`IQB.shared`** (`js/sync.js`: `add` / `list` / `update` / `remove` / `now`).
`IQB.cloud` stays untouched and per-user; nothing about notes/highlights changed.

`js/reports.js` is the only consumer. One entry point: **"Report Issue"** in each
card's action row.

**Selection is captured passively** (`SelectionMemory`). If the reader had text
selected inside that card's `.qa-qtext` / `.answer` / `.qa-deep`, the dialog
quotes it so the admin sees the exact wrong sentence, and offers "✕ Report whole
question" to drop it. Nothing renders while they read: an earlier build floated a
"Report Selected Text" button over every selection, which put a button in the
reader's face every time they dragged across a line — reporting is rare, reading
is the product. Capture happens on pointer/key *release*, not at click time,
because pressing any button collapses the selection first. A drag spanning two
regions is ignored rather than half-stored.

Document shape (`/reports/{autoId}`):
```json
{ "questionId": "angular-data-binding", "questionText": "…", "category": "angular",
  "reason": "incorrect-answer", "selectedText": "Angular uses controllers.",
  "region": "answer", "comment": "This refers to AngularJS, not Angular.",
  "reportedBy": "userId", "reporterEmail": "…", "reporterName": "…",
  "status": "open", "createdAt": "<serverTimestamp>" }
```
`createdAt` is a **server** timestamp: a client clock must not decide report
ordering. There is **no local mirror** — unlike a note, a report is a message to
someone else, and queuing one offline would tell the reader it was filed when
nobody can see it. Submitting requires sign-in (the dialog offers the button
in place via `IQB.sync.signIn`).

Both panels are the same component (`Panel`, opened with a mode), reached from
the account dropdown:

- **"My reported issues"** — every signed-in reader. Their own reports only,
  read-only, with status, so a report doesn't vanish into a void: they can see it
  was received and whether it's been fixed. Queried with `listWhere("reportedBy",
  uid)` and sorted client-side — pairing an equality filter with `orderBy` on
  another field would make Firestore demand a composite index, i.e. a console
  step before the first reader could see anything.
- **"Issue reports"** — allowlisted accounts only. Every report, plus
  reporter identity, resolve/reopen and delete.

Both offer Open/Resolved/All filters and jump-to-question.

**Security rules — `ADMIN_EMAILS` in `js/sync.js` decides nothing.** It only
controls whether the UI *offers* the admin panel; anyone can edit their own JS.
The rule below is the actual gate, and its email list must be kept in step:
```
match /reports/{id} {
  function isAdmin() {
    return request.auth != null && request.auth.token.email in [
      'chinmayanaik920@gmail.com',
      'chinmayannaik@gmail.com'
    ];
  }
  // any signed-in reader may file one, but only as themselves
  allow create: if request.auth != null
                && request.resource.data.reportedBy == request.auth.uid;
  // a reader may read back their OWN reports ("My reported issues");
  // an admin may read every report
  allow read: if isAdmin()
              || (request.auth != null && resource.data.reportedBy == request.auth.uid);
  // triage is admin-only — a reader must not be able to close their own report
  allow update, delete: if isAdmin();
}
```

---

## 11. Production-readiness improvements

- **CI validation** (content repo): a GitHub Action that, on every PR, checks
  every JSON parses, `id`s are unique across all files, each `category` matches
  its manifest id, `difficulty ∈ {beginner,intermediate,advanced}`, `count`s are
  correct, and `version` was bumped. Reuse the field list in
  `scripts/migrate-to-json.js`. This is your safety net for hand-edited JSON.
- **Auto-bump on merge:** an Action that increments `version` + `updatedAt` so
  authors can't forget the step that triggers app updates.
- **Per-file hashes in the manifest** for exact delta detection (replace the
  `count` heuristic).
- **Split large categories** if any single file gets big — the manifest already
  supports arbitrary files, so you could shard `angular.json` into pages.
- **Analytics on failures:** log data-load failures (web `console`/Sentry;
  Flutter Crashlytics) so a bad deploy is visible.
- **Content authoring tooling:** even a tiny admin form that appends a validated
  object beats editing raw JSON by hand as the bank grows.
- **Delete the legacy `data/*.js`** once you've confirmed the site in production,
  to make "JSON is the only source" unambiguous.
- **Accessibility of trusted HTML:** answers are raw HTML — keep authored content
  trusted (you control the repo). On Flutter render with `flutter_html`.
```

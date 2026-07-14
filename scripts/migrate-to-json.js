/* ============================================================
   One-shot migration: data/<cat>.js  ->  shared-data/<cat>.json
   Runs each existing IIFE data file in a fake-browser shim so the
   EXACT in-memory question objects are what we serialise (no regex
   parsing, no structure drift), then writes one JSON file per
   category plus a manifest.json describing version + categories.

   Usage:  node scripts/migrate-to-json.js
   ============================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT_DIR = path.join(ROOT, "shared-data");

/* Top-level groups (the main fields) — ORDER here = display order in both
   clients. To add a new main field (e.g. "Mobile Development"), add an entry
   here (or straight into manifest.json), give some categories that group id,
   bump the version, and push. No app/website redeploy needed. */
const GROUPS = [
  { id: "frontend", label: "Frontend",   color: "#C3002F" },
  { id: "backend",  label: "Backend",    color: "#4E8B2C" },
  { id: "devops",   label: "DevOps",     color: "#D9491F" },
  { id: "hr",       label: "Behavioral", color: "#5C7A8F" }
];

/* canonical category order + display metadata.
   `id`    = the key each data file registers into IQB.data
   `file`  = source js basename -> becomes the json filename
   `group` = id of the parent group above
   `color` = accent (both clients read this; no CSS/theme edits needed for new ones)
   NOTE: angular-coding.js registers under the id "ngcoding". */
const CATEGORIES = [
  { id: "angular",    file: "angular",        label: "Angular",        group: "frontend", color: "#C3002F" },
  { id: "ngcoding",   file: "angular-coding", label: "Angular Coding", group: "frontend", color: "#B0335F" },
  { id: "javascript", file: "javascript",     label: "JavaScript",     group: "frontend", color: "#B4820A" },
  { id: "typescript", file: "typescript",     label: "TypeScript",     group: "frontend", color: "#2F6FB0" },
  { id: "html",       file: "html",           label: "HTML",           group: "frontend", color: "#D9531E" },
  { id: "css",        file: "css",            label: "CSS",            group: "frontend", color: "#7A4FD6" },
  { id: "coding",     file: "coding",         label: "JS Coding",      group: "frontend", color: "#0B7285" },
  { id: "rxjs",       file: "rxjs",           label: "RxJS",           group: "frontend", color: "#1E8E57" },
  { id: "ngrx",       file: "ngrx",           label: "NgRx",           group: "frontend", color: "#4B4ECB" },
  { id: "testing",    file: "testing",        label: "Testing",        group: "frontend", color: "#A83294" },
  { id: "general",    file: "general",        label: "General",        group: "frontend", color: "#667085" },
  { id: "java",       file: "java",           label: "Java",           group: "backend",  color: "#9A5B34" },
  { id: "springboot", file: "springboot",     label: "Spring Boot",    group: "backend",  color: "#4E8B2C" },
  { id: "sql",        file: "sql",            label: "SQL",            group: "backend",  color: "#0E7C93" },
  { id: "git",        file: "git",            label: "Git",            group: "devops",   color: "#D9491F" },
  { id: "behavioral", file: "behavioral",     label: "Behavioral",     group: "hr",       color: "#5C7A8F" }
];

/* ---- 1. run every data file in one shared fake-window sandbox ----
   In a browser `window` IS the global object, so `window.IQB = ...`
   creates a bare global `IQB`. Emulate that by making window self-refer. */
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".js"))) {
  const src = fs.readFileSync(path.join(DATA_DIR, f), "utf8");
  vm.runInContext(src, sandbox, { filename: f });
}
const IQBdata = (sandbox.window.IQB && sandbox.window.IQB.data) || {};

/* ---- 2. write one JSON file per category ---- */
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const FIELDS = ["id", "category", "difficulty", "tags", "question", "answer", "tip", "code", "lang", "deep"];
const manifestCats = [];
let grandTotal = 0;
const seenIds = new Set();

for (const c of CATEGORIES) {
  const rows = IQBdata[c.id];
  if (!Array.isArray(rows)) {
    console.warn(`!! no data registered for id="${c.id}" (file ${c.file}.js) — skipped`);
    continue;
  }
  // normalise: keep only known fields, force category to the canonical id,
  // drop empty optional fields so the JSON stays lean.
  const clean = rows.map((q) => {
    const out = {};
    for (const k of FIELDS) {
      if (k === "deep" && !q.deep) continue;      // omit when absent
      if (q[k] === undefined) continue;
      out[k] = q[k];
    }
    out.category = c.id;                            // canonical
    if (seenIds.has(out.id)) console.warn(`!! duplicate id "${out.id}" in ${c.file}.json`);
    seenIds.add(out.id);
    return out;
  });

  fs.writeFileSync(
    path.join(OUT_DIR, c.file + ".json"),
    JSON.stringify(clean, null, 2) + "\n",
    "utf8"
  );
  manifestCats.push({
    id: c.id,
    file: c.file + ".json",
    label: c.label,
    group: c.group,
    color: c.color,
    count: clean.length
  });
  grandTotal += clean.length;
  console.log(`  ${c.file}.json  (${clean.length})`);
}

/* ---- 3. write manifest.json ---- */
const manifest = {
  schemaVersion: 2,               // 2 = manifest now carries groups[] + category color
  version: 2,                     // CONTENT version — bump on every content change
  updatedAt: new Date().toISOString(),
  totalQuestions: grandTotal,
  groups: GROUPS,                 // top-level fields, in display order
  categories: manifestCats
};
fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`\n✔ migrated ${grandTotal} questions across ${manifestCats.length} categories -> shared-data/`);

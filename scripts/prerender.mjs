/* ============================================================
   Pre-render SEO topic pages.

   The site is a single-URL SPA: views normally lived behind hash
   fragments (#angular), which crawlers strip — so Google only ever saw
   ONE page, and refreshing a deep link 404'd. This script emits a real,
   crawlable static HTML page for every navigable path, so each one is
   both indexable AND directly loadable:

     • one page per CATEGORY  (angular.html, java.html …) — full Q&A dump,
     • one hub page per GROUP (frontend.html, backend.html …) — links to
       its categories; targets broad "<group> interview questions" queries,
     • a minimal noindex shell for the app-only views (playground, notes),
       so refreshing those paths boots the app instead of 404ing.

   It is driven ENTIRELY by the content manifest — the same source of
   truth the running app uses. Add a category/group to the manifest and
   the next run generates its page automatically. No per-view code to
   keep in sync; that is the whole point.

   Every generated page still boots the full interactive app: parsePath()
   (js/app.js) reads the URL path and opens the matching view, then the
   static #seo-prerender block is removed.

   Usage:
     node scripts/prerender.mjs                              # fetch live content (prod)
     IQB_DATA_BASE=<url-or-path> node scripts/prerender.mjs  # alternate source
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.interviewdeck.in";

/* Same default the browser uses (see index.html). Override with IQB_DATA_BASE
   to generate from a local mirror or a different branch. */
const DATA_BASE = (
  process.env.IQB_DATA_BASE ||
  "https://raw.githubusercontent.com/chinmayannaik/interview-deck-questions/main/"
).replace(/\/?$/, "/");

/* The app-only views: real navigable paths, but nothing to index. */
const APP_VIEWS = [
  { id: "playground", title: "Code Playground" },
  { id: "notes", title: "My Notes" },
];

async function getJSON(file) {
  const url = DATA_BASE + file;
  if (/^https?:/i.test(url)) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(await readFile(join(ROOT, DATA_BASE, file), "utf8"));
}

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* Answers are authored as HTML; for the JSON-LD FAQ answer we need plain text. */
const stripHtml = (s) =>
  String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const SEO_STYLE = `
      <style>
        #seo-prerender{max-width:820px;margin:0 auto;padding:2rem 1.25rem 4rem;
          font:400 1rem/1.6 var(--sans,system-ui,sans-serif);color:var(--ink,#1a1a1a)}
        #seo-prerender h1{font-size:1.9rem;line-height:1.2;margin:0 0 .75rem}
        #seo-prerender .seo-q{margin:1.75rem 0;padding-top:1.25rem;
          border-top:1px solid var(--line,#e5e2e0)}
        #seo-prerender .seo-q h2{font-size:1.15rem;margin:0 0 .5rem}
        #seo-prerender .seo-topics{list-style:none;padding:0;display:grid;gap:.6rem;margin:1.5rem 0}
        #seo-prerender .seo-topics a{font-weight:600}
        #seo-prerender pre{overflow-x:auto;background:var(--code-bg,#f4f2f0);
          padding:.75rem 1rem;border-radius:8px;font-size:.9rem}
      </style>`;

/* ---- head/meta ----------------------------------------------------------
   Replaces the homepage's per-page tags. Everything else in <head> (icons,
   fonts, theme colour, the site-level Organization schema) is inherited. */
function rewriteHead(html, { url, title, desc, noindex }) {
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[\s\S]*?"\s*\/>/,
      `<meta name="description" content="${esc(desc)}" />`)
    .replace(/<link rel="canonical" href="[\s\S]*?"\s*\/>/,
      `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:title" content="[\s\S]*?"\s*\/>/,
      `<meta property="og:title" content="${esc(title)}" />`)
    .replace(/<meta property="og:url" content="[\s\S]*?"\s*\/>/,
      `<meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:description" content="[\s\S]*?"\s*\/>/,
      `<meta property="og:description" content="${esc(desc)}" />`)
    .replace(/<meta name="twitter:title" content="[\s\S]*?"\s*\/>/,
      `<meta name="twitter:title" content="${esc(title)}" />`);
  if (noindex) {
    html = html.replace(/<\/title>/,
      `</title>\n  <meta name="robots" content="noindex, follow" />`);
  }
  return html;
}

/* Signal which view the app should open on load (belt-and-suspenders with
   parsePath, which reads the same value from the URL path). */
function injectEntry(html, id) {
  return html.replace(
    /<script src="js\/utils\.js"><\/script>/,
    `<script>window.__ENTRY_CAT=${JSON.stringify(id)};</script>\n  ` +
      `<script src="js/utils.js"></script>`
  );
}

function injectAfterMain(html, section) {
  return html.replace(/<\/main>/, "</main>\n" + section);
}

/* ---- category page (full Q&A) ------------------------------------------- */
function categorySection({ label }, questions) {
  const items = questions.map((q) => `
        <article class="seo-q">
          <h2>${esc(q.question)}</h2>
          <div class="seo-a">${q.answer || ""}</div>
          ${q.code ? `<pre><code>${esc(q.code)}</code></pre>` : ""}
        </article>`).join("");
  return `
    <section id="seo-prerender" aria-label="${esc(label)} interview questions">${SEO_STYLE}
      <h1>${esc(label)} Interview Questions and Answers</h1>
      <p>${questions.length} hand-picked ${esc(label)} interview questions with
         detailed answers. Open the interactive version above to search, filter
         by difficulty, run code, bookmark questions and track your progress.</p>
      ${items}
    </section>`;
}

function faqSchema(questions) {
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.slice(0, 20).map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: stripHtml(q.answer) },
    })),
  };
  return `\n  <script type="application/ld+json">\n  ${JSON.stringify(faq)}\n  </script>\n`;
}

function buildCategoryPage(template, cat, questions) {
  let html = rewriteHead(template, {
    url: `${SITE}/${cat.id}`,
    title: `${cat.label} Interview Questions & Answers — InterviewDeck`,
    desc: `${questions.length} ${cat.label} interview questions with clear, detailed` +
      ` answers — practice mode, code examples, bookmarks and progress tracking.` +
      ` Free and searchable on InterviewDeck.`,
  });
  html = injectEntry(html, cat.id);
  html = html.replace(/<\/head>/, faqSchema(questions) + "</head>");
  return injectAfterMain(html, categorySection(cat, questions));
}

/* ---- group hub page (links to its categories) --------------------------- */
function groupSection(group, members, total) {
  const links = members.map((c) =>
    `<li><a href="/${c.id}">${esc(c.label)} interview questions</a> — ${c.count}</li>`
  ).join("\n        ");
  return `
    <section id="seo-prerender" aria-label="${esc(group.label)} interview questions">${SEO_STYLE}
      <h1>${esc(group.label)} Interview Questions</h1>
      <p>${total} ${esc(group.label)} interview questions across ${members.length}
         topics, each with detailed answers, code examples and practice mode.
         Pick a topic:</p>
      <ul class="seo-topics">
        ${links}
      </ul>
    </section>`;
}

function buildGroupPage(template, group, members) {
  const total = members.reduce((n, c) => n + (c.count || 0), 0);
  const names = members.map((m) => m.label).slice(0, 6).join(", ");
  let html = rewriteHead(template, {
    url: `${SITE}/${group.id}`,
    title: `${group.label} Interview Questions & Answers — InterviewDeck`,
    desc: `${total} ${group.label} interview questions across ${members.length} topics` +
      ` (${names}${members.length > 6 ? " and more" : ""}), with detailed answers.` +
      ` Free and searchable on InterviewDeck.`,
  });
  html = injectEntry(html, group.id);
  return injectAfterMain(html, groupSection(group, members, total));
}

/* ---- app-only view (playground / notes): minimal, noindex --------------- */
function buildAppViewPage(template, view) {
  return rewriteHead(template, {
    url: `${SITE}/${view.id}`,
    title: `${view.title} — InterviewDeck`,
    desc: `InterviewDeck ${view.title}.`,
    noindex: true,
  });
  // no #seo-prerender block; parsePath() opens the view from the URL path.
}

/* ---- sitemap (categories + groups; app views are noindex, excluded) ----- */
function buildSitemap(entries, lastmod) {
  const urls = [
    { loc: `${SITE}/`, priority: "1.0", changefreq: "weekly" },
    ...entries,
    { loc: `${SITE}/privacy`, priority: "0.3", changefreq: "yearly" },
  ];
  const body = urls.map((u) =>
    `  <url>\n    <loc>${u.loc}</loc>\n` +
    (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
    `    <changefreq>${u.changefreq}</changefreq>\n` +
    `    <priority>${u.priority}</priority>\n  </url>`
  ).join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- Generated by scripts/prerender.mjs — one entry per page. Do not edit by hand. -->\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  );
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice("--only=".length).split(",") : null;

  console.log(`[prerender] content base: ${DATA_BASE}`);
  const manifest = await getJSON("manifest.json");
  let cats = manifest.categories || [];
  const groups = manifest.groups || [];
  if (only) cats = cats.filter((c) => only.includes(c.id));
  console.log(`[prerender] categories: ${cats.length}, groups: ${groups.length}`);

  const template = await readFile(join(ROOT, "index.html"), "utf8");
  const sitemap = [];

  // 1) category pages (full Q&A)
  const writtenCats = [];
  for (const cat of cats) {
    let questions;
    try {
      const data = await getJSON(cat.file);
      questions = Array.isArray(data) ? data : data.questions || [];
    } catch (e) {
      console.warn(`[prerender] skip ${cat.id}: ${e.message}`);
      continue;
    }
    const meta = { ...cat, count: questions.length };
    await writeFile(join(ROOT, `${cat.id}.html`), buildCategoryPage(template, meta, questions), "utf8");
    writtenCats.push(cat.id);
    sitemap.push({ loc: `${SITE}/${cat.id}`, priority: "0.8", changefreq: "weekly" });
    console.log(`[prerender]   ${cat.id}.html  (${questions.length} questions)`);
  }

  // 2) group hub pages (skip a group with no generated categories)
  for (const group of groups) {
    const members = cats.filter((c) => c.group === group.id && writtenCats.includes(c.id));
    if (!members.length) continue;
    await writeFile(join(ROOT, `${group.id}.html`), buildGroupPage(template, group, members), "utf8");
    sitemap.push({ loc: `${SITE}/${group.id}`, priority: "0.7", changefreq: "weekly" });
    console.log(`[prerender]   ${group.id}.html  (group of ${members.length} topics)`);
  }

  // 3) app-only views (noindex, not in sitemap)
  for (const view of APP_VIEWS) {
    await writeFile(join(ROOT, `${view.id}.html`), buildAppViewPage(template, view), "utf8");
    console.log(`[prerender]   ${view.id}.html  (app view, noindex)`);
  }

  await writeFile(join(ROOT, "sitemap.xml"), buildSitemap(sitemap, manifest.updatedAt), "utf8");
  console.log(`[prerender] wrote sitemap.xml (${sitemap.length} indexable pages)`);
  console.log(`[prerender] done`);
}

main().catch((e) => {
  console.error("[prerender] FAILED:", e);
  process.exit(1);
});

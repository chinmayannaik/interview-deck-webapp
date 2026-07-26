/* ============================================================
   Pre-render SEO topic pages.

   The site is a single-URL SPA: topics normally live behind hash
   fragments (#angular, #java), which crawlers strip — so Google only
   ever sees ONE page. This script emits one CRAWLABLE static HTML page
   per category (angular.html, java.html, …) plus a full sitemap, so
   each topic can rank for queries like "angular interview questions".

   It is driven ENTIRELY by the content manifest — the same source of
   truth the running app uses. Add a category to the manifest and the
   next run generates its page automatically. There is no per-category
   code here to keep in sync; that is the whole point.

   Each generated page:
     • carries topic-specific <title>, description, canonical + OG tags,
     • embeds the questions as real HTML (an #seo-prerender block) so a
       crawler sees the content without running JavaScript,
     • adds FAQPage structured data,
     • still boots the full interactive app, which opens that category
       (via window.__ENTRY_CAT) and removes the static block on load.

   Usage:
     node scripts/prerender.mjs                              # fetch live content (prod)
     IQB_DATA_BASE=<url-or-path> node scripts/prerender.mjs  # alternate source

   Content source resolves to (first set wins):
     IQB_DATA_BASE env  →  the production GitHub raw base (default).
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

/* Fetch JSON from the content base, transparently falling back to the local
   shared-data mirror if the remote host is unreachable (offline builds). */
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

/* Answers are authored as HTML; for the JSON-LD FAQ answer and the meta
   description we need clean, single-line plain text. */
const stripHtml = (s) =>
  String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* ---- per-topic head/meta -------------------------------------------------
   Replaces the homepage's tags with topic-specific ones. Everything else in
   <head> (icons, fonts, theme colour, the site-level Organization schema) is
   inherited unchanged. */
function rewriteHead(html, { id, label, count }) {
  const url = `${SITE}/${id}`;
  const title = `${label} Interview Questions & Answers — InterviewDeck`;
  const desc =
    `${count} ${label} interview questions with clear, detailed answers` +
    ` — practice mode, code examples, bookmarks and progress tracking. Free and searchable on InterviewDeck.`;

  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(
      /<meta name="description" content="[\s\S]*?"\s*\/>/,
      `<meta name="description" content="${esc(desc)}" />`
    )
    .replace(
      /<link rel="canonical" href="[\s\S]*?"\s*\/>/,
      `<link rel="canonical" href="${url}" />`
    )
    .replace(
      /<meta property="og:title" content="[\s\S]*?"\s*\/>/,
      `<meta property="og:title" content="${esc(title)}" />`
    )
    .replace(
      /<meta property="og:url" content="[\s\S]*?"\s*\/>/,
      `<meta property="og:url" content="${url}" />`
    )
    .replace(
      /<meta property="og:description" content="[\s\S]*?"\s*\/>/,
      `<meta property="og:description" content="${esc(desc)}" />`
    )
    .replace(
      /<meta name="twitter:title" content="[\s\S]*?"\s*\/>/,
      `<meta name="twitter:title" content="${esc(title)}" />`
    );
}

/* ---- crawlable content + FAQ schema ------------------------------------- */
function seoSection({ label }, questions) {
  const items = questions
    .map(
      (q) => `
        <article class="seo-q">
          <h2>${esc(q.question)}</h2>
          <div class="seo-a">${q.answer || ""}</div>
          ${q.code ? `<pre><code>${esc(q.code)}</code></pre>` : ""}
        </article>`
    )
    .join("");

  return `
    <section id="seo-prerender" aria-label="${esc(label)} interview questions">
      <style>
        #seo-prerender{max-width:820px;margin:0 auto;padding:2rem 1.25rem 4rem;
          font:400 1rem/1.6 var(--sans,system-ui,sans-serif);color:var(--ink,#1a1a1a)}
        #seo-prerender h1{font-size:1.9rem;line-height:1.2;margin:0 0 .75rem}
        #seo-prerender .seo-q{margin:1.75rem 0;padding-top:1.25rem;
          border-top:1px solid var(--line,#e5e2e0)}
        #seo-prerender .seo-q h2{font-size:1.15rem;margin:0 0 .5rem}
        #seo-prerender pre{overflow-x:auto;background:var(--code-bg,#f4f2f0);
          padding:.75rem 1rem;border-radius:8px;font-size:.9rem}
      </style>
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

/* ---- assemble one page --------------------------------------------------- */
function buildPage(template, cat, questions) {
  let html = rewriteHead(template, cat);

  // inject the entry-category signal just before the app's first script
  html = html.replace(
    /<script src="js\/utils\.js"><\/script>/,
    `<script>window.__ENTRY_CAT=${JSON.stringify(cat.id)};</script>\n  ` +
      `<script src="js/utils.js"></script>`
  );

  // inject FAQ structured data at the end of <head>
  html = html.replace(/<\/head>/, faqSchema(questions) + "</head>");

  // inject the crawlable content block right after </main>
  html = html.replace(
    /<\/main>/,
    "</main>\n" + seoSection(cat, questions)
  );

  return html;
}

function buildSitemap(cats, lastmod) {
  const urls = [
    { loc: `${SITE}/`, priority: "1.0", changefreq: "weekly" },
    ...cats.map((c) => ({
      loc: `${SITE}/${c.id}`,
      priority: "0.8",
      changefreq: "weekly",
    })),
    { loc: `${SITE}/privacy`, priority: "0.3", changefreq: "yearly" },
  ];
  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n` +
        (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
        `    <changefreq>${u.changefreq}</changefreq>\n` +
        `    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- Generated by scripts/prerender.mjs — one entry per topic page. Do not edit by hand. -->\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  );
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice("--only=".length).split(",") : null;

  console.log(`[prerender] content base: ${DATA_BASE}`);
  const manifest = await getJSON("manifest.json");
  let cats = manifest.categories || [];
  if (only) cats = cats.filter((c) => only.includes(c.id));
  console.log(`[prerender] categories: ${cats.length}`);

  const template = await readFile(join(ROOT, "index.html"), "utf8");

  const written = [];
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
    const html = buildPage(template, meta, questions);
    const out = join(ROOT, `${cat.id}.html`);
    await writeFile(out, html, "utf8");
    written.push(cat.id);
    console.log(`[prerender]   ${cat.id}.html  (${questions.length} questions)`);
  }

  // sitemap covers every category we actually generated
  const generated = cats.filter((c) => written.includes(c.id));
  await writeFile(
    join(ROOT, "sitemap.xml"),
    buildSitemap(generated, manifest.updatedAt),
    "utf8"
  );
  console.log(`[prerender] wrote sitemap.xml (${generated.length} topics)`);
  console.log(`[prerender] done — ${written.length} pages`);
}

main().catch((e) => {
  console.error("[prerender] FAILED:", e);
  process.exit(1);
});

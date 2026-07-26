/* ============================================================
   Data loader — the website's bridge to the shared-data JSON.
   Fetches shared-data/manifest.json, then every category file in
   parallel, populates window.IQB.data.<id> (exactly the shape the
   old data/*.js files produced), and only THEN loads js/app.js.

   Offline: the service worker (sw.js) serves these files network-first
   with a cache fallback, so once the site has been opened online the
   JSON is available with no connection.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  IQB.data = IQB.data || {};

  /* Where the content lives. index.html sets IQB.DATA_BASE to the standalone
     content repo (GitHub raw) BEFORE this script runs, so questions update
     WITHOUT redeploying the site. This literal is only a self-sufficiency
     fallback for the (never-hit) case where nothing set it first; keep it in
     sync with the base in index.html. The service worker caches whatever host
     is fetched, so offline works either way. */
  IQB.DATA_BASE = IQB.DATA_BASE ||
    "https://raw.githubusercontent.com/chinmayannaik/interview-deck-questions/main/";

  const url = (f) => IQB.DATA_BASE.replace(/\/?$/, "/") + f;

  /* js/splash.js may not be on the page (it removes itself once done, and the
     splash is optional markup) — never let a missing splash break the load. */
  const splash = () => (IQB.splash || { begin() {}, step() {}, done() {}, fail() {} });

  async function loadData() {
    const manifest = await fetch(url("manifest.json"), { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error("manifest HTTP " + r.status); return r.json(); });
    IQB.manifest = manifest;

    const cats = manifest.categories || [];
    splash().begin(cats.length);
    splash().step(); // the manifest itself

    await Promise.all(cats.map(async (c) => {
      try {
        const res = await fetch(url(c.file));
        if (!res.ok) throw new Error("HTTP " + res.status);
        IQB.data[c.id] = await res.json();
      } catch (e) {
        console.warn("[data] failed to load", c.file, e);
        IQB.data[c.id] = []; // degrade gracefully; other categories still work
      } finally {
        // a category that failed is still a category we are no longer waiting
        // on, so the bar has to advance for it too or it would stall short
        splash().step();
      }
    }));

    /* Focus packs (role-based collections of existing question ids).
       Optional and tiny — a pack that fails to load simply doesn't appear
       in the picker, it must never block the app from booting. */
    IQB.packs = {};
    await Promise.all((manifest.packs || []).map(async (p) => {
      try {
        const res = await fetch(url(p.file));
        if (!res.ok) throw new Error("HTTP " + res.status);
        const pack = await res.json();
        IQB.packs[p.id] = { ...pack, label: pack.label || p.label || p.id, count: p.count };
      } catch (e) {
        console.warn("[data] failed to load pack", p.file, e);
      }
    }));
    return manifest;
  }

  function boot() {
    const s = document.createElement("script");
    s.src = "js/app.js";
    // app.js calls init() as it executes, so by onload the questions are on the
    // page and the splash can come down over a rendered app rather than a shell
    s.onload = () => splash().done();
    s.onerror = () => fail(new Error("app.js failed to load"));
    document.body.appendChild(s);
  }

  function fail(err) {
    console.error("[data] load failed", err);
    // take the splash down first, or this error state renders behind it
    splash().fail();
    const list = document.getElementById("q-list");
    if (list) {
      list.innerHTML =
        '<div class="empty"><div class="big">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: var(--advanced);"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
        '</div>' +
        "<h3>Couldn’t load questions</h3>" +
        "<p>Check your connection and refresh the page.</p></div>";
    }
  }

  loadData().then(boot).catch(fail);
})();

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

  /* Where the shared-data lives. Default = same-origin folder (keeps the
     service worker's offline caching simple). To receive content updates
     WITHOUT redeploying the site, point this at the standalone content
     repo through a CDN, e.g. (set it BEFORE this script runs):
       window.IQB = { DATA_BASE: "https://cdn.jsdelivr.net/gh/USER/interview-questions-data@main/" };
     (if you do, also teach sw.js to cache that cross-origin host — see notes). */
  IQB.DATA_BASE = IQB.DATA_BASE || "shared-data/";

  const url = (f) => IQB.DATA_BASE.replace(/\/?$/, "/") + f;

  async function loadData() {
    const manifest = await fetch(url("manifest.json"), { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error("manifest HTTP " + r.status); return r.json(); });
    IQB.manifest = manifest;

    await Promise.all((manifest.categories || []).map(async (c) => {
      try {
        const res = await fetch(url(c.file));
        if (!res.ok) throw new Error("HTTP " + res.status);
        IQB.data[c.id] = await res.json();
      } catch (e) {
        console.warn("[data] failed to load", c.file, e);
        IQB.data[c.id] = []; // degrade gracefully; other categories still work
      }
    }));
    return manifest;
  }

  function boot() {
    const s = document.createElement("script");
    s.src = "js/app.js";
    s.onerror = () => fail(new Error("app.js failed to load"));
    document.body.appendChild(s);
  }

  function fail(err) {
    console.error("[data] load failed", err);
    const list = document.getElementById("q-list");
    if (list) {
      list.innerHTML =
        '<div class="empty"><div class="big">⚠️</div>' +
        "<h3>Couldn’t load questions</h3>" +
        "<p>Check your connection and refresh the page.</p></div>";
    }
  }

  loadData().then(boot).catch(fail);
})();

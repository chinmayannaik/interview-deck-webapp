/* Service worker — offline-first caching for the Interview Questions Bank.
   Bump CACHE version when you change core files to force an update. */
const CACHE = "iqb-v3";
const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/variables.css",
  "./css/reset.css",
  "./css/styles.css",
  "./css/dark-theme.css",
  "./js/utils.js",
  "./js/storage.js",
  "./js/app.js",
  "./data/angular.js",
  "./data/javascript.js",
  "./data/typescript.js",
  "./data/html.js",
  "./data/css.js",
  "./data/rxjs.js",
  "./data/ngrx.js",
  "./data/java.js",
  "./data/springboot.js",
  "./data/sql.js",
  "./data/git.js",
  "./data/general.js",
  "./data/coding.js",
  "./data/angular-coding.js",
  "./data/testing.js",
  "./data/behavioral.js",
  "./assets/favicon/favicon.svg",
  "./assets/favicon/icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* stale-while-revalidate for same-origin GET:
   serve cache instantly (offline-friendly) but always refresh it in the
   background, so updated CSS/JS propagate on the next load without a version bump. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

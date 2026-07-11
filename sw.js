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

/* network-first for same-origin GET:
   always try the network so readers get the LATEST deploy every time they're
   online (new questions show up immediately, no version bump needed), and fall
   back to the cached copy only when offline. Each successful fetch refreshes the
   cache so the offline fallback stays current. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});

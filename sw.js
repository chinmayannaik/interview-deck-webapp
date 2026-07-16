/* Service worker — offline-first caching for Interview Helper.
   Bump CACHE version when you change core files to force an update.

   Questions are served from the shared content repo via the jsDelivr CDN
   (cross-origin), so they're handled by a dedicated runtime rule below. */
const CACHE = "iqb-v14";

/* the git-hosted single source of truth (same repo the Flutter app reads) */
const CONTENT_HOST = "cdn.jsdelivr.net";
const CONTENT_PATH = "/gh/chinmayanaik123/interview-helper-question-bank@";

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
  "./js/data-loader.js",
  "./js/app.js",
  "./js/sync.js",
  "./js/notes.js",
  "./js/highlights.js",
  "./js/icons.js",
  "./js/select.js",
  "./js/tour.js",
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

/* network-first with a cache fallback — for BOTH same-origin app files and the
   cross-origin CDN content. Always try the network so online visitors get the
   latest content immediately; each success refreshes the cache so the offline
   fallback stays current. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  const isContent =
    url.hostname === CONTENT_HOST && url.pathname.includes(CONTENT_PATH);
  const isSameOrigin = url.origin === location.origin;
  if (!isContent && !isSameOrigin) return; // ignore other cross-origin (Firebase, fonts…)

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

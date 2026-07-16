/* ============================================================
   Splash screen controller.

   The markup lives in index.html so the splash paints on the very
   first frame, before any script runs — this file only advances the
   bar and takes the splash away.

   Progress is REAL: js/data-loader.js calls IQB.splash.step() as the
   manifest and each category file land, so the bar tracks the actual
   fetches (17 of them, from a remote content repo) rather than a timer
   that lies about what is happening.

   Loads BEFORE data-loader.js so the API exists when the first fetch
   resolves.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};

  const root = document.getElementById("splash");
  if (!root) { IQB.splash = { begin() {}, step() {}, done() {}, fail() {} }; return; }

  const bar = root.querySelector("#splash-bar");
  const track = root.querySelector("#splash-track");
  const status = root.querySelector("#splash-status");

  /* The splash must never be the reason someone stares at a frozen screen, so
     every exit path is time-boxed:
       MIN_MS  — a warm/service-worker load can finish in ~50ms, and a splash
                 that flashes for one frame reads as a glitch. Hold it briefly
                 so the reveal looks deliberate.
       MAX_MS  — if the data never resolves and nothing calls done() or fail()
                 (a hung connection rather than a rejected fetch), tear the
                 splash down anyway and let the app show its own empty/error
                 state. Being stuck behind a splash forever is strictly worse. */
  const MIN_MS = 700;
  const MAX_MS = 12000;

  const t0 = Date.now();
  let total = 1;     // manifest, until the loader tells us the category count
  let loaded = 0;
  let pct = 0;
  let finished = false;

  document.body.classList.add("splash-open");

  function paint(next, label) {
    // never travel backwards — a late fetch resolving must not rewind the bar
    pct = Math.max(pct, Math.min(100, next));
    if (bar) bar.style.width = pct + "%";
    if (track) track.setAttribute("aria-valuenow", String(Math.round(pct)));
    if (label && status) status.textContent = label;
  }

  const api = {
    /* the loader knows how many category files it is about to fetch */
    begin(count) {
      total = Math.max(1, count) + 1; // +1 for the manifest itself
      paint(8, "Loading your questions…");
    },
    /* one more file has landed */
    step() {
      loaded++;
      // hold the last 8% for app.js parsing + first render, so the bar never
      // sits at 100% while the screen is still blank
      paint(8 + (loaded / total) * 84);
    },
    /* data is in and app.js has rendered */
    done() {
      if (finished) return;
      finished = true;
      paint(100, "Ready");
      const wait = Math.max(0, MIN_MS - (Date.now() - t0));
      setTimeout(hide, wait + 180); // +180 lets the bar finish its glide to 100
    },
    /* the loader gave up — get out of the way so its error state is visible */
    fail() {
      if (finished) return;
      finished = true;
      hide();
    }
  };

  function hide() {
    root.classList.add("is-hiding");
    root.setAttribute("aria-busy", "false");
    document.body.classList.remove("splash-open");
    const finish = () => {
      root.setAttribute("hidden", "");
      root.remove(); // it is never shown again this session
    };
    root.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 600); // transitionend never fires under reduced-motion
  }

  setTimeout(() => api.fail(), MAX_MS);

  IQB.splash = api;
})();

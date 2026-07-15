/* ============================================================
   Optional cloud sync — Google sign-in + Firestore.

   Signed out: a small dismissible prompt offers sign-in (skippable —
   progress still saves locally). Signed in: the header avatar opens an
   account dropdown with a live progress summary, and completed/bookmarked
   questions sync across devices in real time.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};

  /* ---- Firebase web config (public identifiers — safe to commit) ---- */
  const firebaseConfig = {
    apiKey: "AIzaSyBXcWcfmOgL8gr3-zruz6l4E1WB_Qxf5a8",
    authDomain: "interview-questions-bank.firebaseapp.com",
    projectId: "interview-questions-bank",
    storageBucket: "interview-questions-bank.firebasestorage.app",
    messagingSenderId: "649714092269",
    appId: "1:649714092269:web:aadea4997b81be2047a4e4"
  };
  /* ------------------------------------------------------------------- */

  const SDK_VERSION = "10.12.2";
  const CONFIGURED = !!firebaseConfig.apiKey && firebaseConfig.apiKey.indexOf("PASTE") === -1;
  const PROMPT_KEY = "iqb:loginPromptDismissed";

  const btn = document.getElementById("auth-btn");
  if (!CONFIGURED) return; // dormant: app stays local-only

  let fb = null, user = null, unsub = null, pushTimer = null;
  let menuEl = null, promptEl = null;
  const userChangeCbs = [];
  function emitUserChange() {
    userChangeCbs.forEach(function (cb) { try { cb(user); } catch (e) { /* isolate */ } });
  }

  if (btn) {
    btn.hidden = false;
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    setButton("signed-out");
    btn.addEventListener("click", onButtonClick);
  }
  IQB.sync = { pushSoon: pushSoon };

  /* ============================================================
     IQB.cloud — generic per-question user-state layer.

     A single, feature-agnostic gateway to per-question user documents at
       users/{uid}/{feature}/{questionId}
     One document per question per feature. "notes" uses it today; a future
     "highlights" (or any per-question state) plugs in by passing its own
     feature name — no changes here, no schema migration, no refactor.

     Signed out or Firebase unconfigured, every method degrades to a no-op /
     null so callers can keep a local-only fallback (see js/notes.js).
     ============================================================ */
  IQB.cloud = {
    isSignedIn: function () { return !!user; },
    getUser: function () { return user; },

    /* Register cb(user|null); fires immediately with the current user when
       Firebase is already up, and again on every sign-in/sign-out. Returns an
       unsubscribe function. */
    onChange: function (cb) {
      userChangeCbs.push(cb);
      if (fb) { try { cb(user); } catch (e) { /* isolate */ } }
      return function () {
        const i = userChangeCbs.indexOf(cb);
        if (i >= 0) userChangeCbs.splice(i, 1);
      };
    },

    _ref: function (feature, questionId) {
      return fb.doc(fb.db, "users", user.uid, feature, String(questionId));
    },

    /* Load one question's document. Resolves null when signed out or absent. */
    load: async function (feature, questionId) {
      if (!user || !fb) return null;
      const snap = await fb.getDoc(this._ref(feature, questionId));
      return snap.exists() ? snap.data() : null;
    },

    /* Load every document in a feature's subcollection as { questionId: data }. */
    loadAll: async function (feature) {
      const out = {};
      if (!user || !fb) return out;
      const snap = await fb.getDocs(fb.collection(fb.db, "users", user.uid, feature));
      snap.forEach(function (d) { out[d.id] = d.data(); });
      return out;
    },

    /* Upsert (merge) one question's document. */
    save: async function (feature, questionId, data) {
      if (!user || !fb) return;
      await fb.setDoc(this._ref(feature, questionId), data, { merge: true });
    },

    /* Delete one question's document. */
    remove: async function (feature, questionId) {
      if (!user || !fb) return;
      await fb.deleteDoc(this._ref(feature, questionId));
    },

    /* Optional real-time subscription to one question's document.
       cb(data|null); returns an unsubscribe function. */
    watch: function (feature, questionId, cb) {
      if (!user || !fb) return function () {};
      return fb.onSnapshot(this._ref(feature, questionId), function (snap) {
        cb(snap.exists() ? snap.data() : null);
      });
    }
  };

  // close the account menu on outside click / Escape
  document.addEventListener("click", function (e) {
    if (menuEl && !menuEl.hidden && !menuEl.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  loadFirebase().then(startAuth).catch(function (e) { console.warn("[sync] disabled:", e); });

  /* ---------- Firebase ---------- */
  async function loadFirebase() {
    const base = "https://www.gstatic.com/firebasejs/" + SDK_VERSION + "/";
    const appMod = await import(base + "firebase-app.js");
    const authMod = await import(base + "firebase-auth.js");
    const fsMod = await import(base + "firebase-firestore.js");
    const appInst = appMod.initializeApp(firebaseConfig);
    fb = {
      auth: authMod.getAuth(appInst),
      provider: new authMod.GoogleAuthProvider(),
      signInWithPopup: authMod.signInWithPopup,
      signOut: authMod.signOut,
      onAuthStateChanged: authMod.onAuthStateChanged,
      db: fsMod.getFirestore(appInst),
      doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc, onSnapshot: fsMod.onSnapshot,
      collection: fsMod.collection, getDocs: fsMod.getDocs, deleteDoc: fsMod.deleteDoc
    };
  }

  function startAuth() {
    fb.onAuthStateChanged(fb.auth, function (u) {
      user = u || null;
      if (user) {
        setButton("signed-in", user);
        hidePrompt();
        subscribe(user);
      } else {
        setButton("signed-out");
        if (unsub) { unsub(); unsub = null; }
        maybeShowPrompt();
      }
      emitUserChange(); // notify per-question feature modules (notes, future highlights)
    });
  }

  function signIn() {
    if (!fb) return;
    fb.signInWithPopup(fb.auth, fb.provider).catch(function (e) {
      console.warn("[sync] sign-in failed:", e && e.code);
    });
  }

  /* ---------- header avatar button ---------- */
  function onButtonClick(e) {
    e.stopPropagation();
    if (user) toggleMenu();
    else signIn();
  }

  function setButton(state, u) {
    if (!btn) return;
    if (state === "signed-in" && u) {
      if (u.photoURL) {
        btn.innerHTML = '<img src="' + u.photoURL + '" alt="" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;">';
      } else {
        btn.textContent = initialOf(u);
      }
      btn.classList.add("signed-in");
      btn.setAttribute("aria-label", "Account — " + (u.email || initialOf(u)));
      btn.title = "Account & progress";
    } else {
      btn.innerHTML =
        '<span class="auth-btn-label">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>' +
          'Sign In' +
        '</span>' +
        '<span class="auth-btn-user" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-1a6 6 0 0 1 12 0v1"/></svg>' +
        '</span>';
      btn.classList.remove("signed-in");
      btn.setAttribute("aria-label", "Sign in with Google to sync across devices");
      btn.title = "Sign in to sync across devices";
      closeMenu();
    }
  }

  /* ---------- account dropdown ---------- */
  function toggleMenu() { (menuEl && !menuEl.hidden) ? closeMenu() : openMenu(); }

  function openMenu() {
    if (!user) return;
    if (!menuEl) menuEl = buildMenu();
    renderMenu();
    menuEl.hidden = false;
    positionMenu();
    btn.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    if (menuEl) menuEl.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }
  function positionMenu() {
    const r = btn.getBoundingClientRect();
    menuEl.style.top = Math.round(r.bottom + 8) + "px";
    menuEl.style.right = Math.round(window.innerWidth - r.right) + "px";
  }

  function buildMenu() {
    const m = document.createElement("div");
    m.className = "auth-menu";
    m.id = "auth-menu";
    m.hidden = true;
    m.setAttribute("role", "menu");
    m.innerHTML =
      '<div class="auth-head">' +
        '<div class="auth-avatar" id="auth-avatar"></div>' +
        '<div class="auth-id"><div class="auth-name" id="auth-name"></div>' +
        '<div class="auth-email" id="auth-email"></div></div>' +
      '</div>' +
      '<div class="auth-progress">' +
        '<div class="auth-progress-title">✓ Learning progress</div>' +
        '<div class="auth-total"><span>Total completed</span><strong id="auth-total-n">0</strong></div>' +
        '<div class="auth-rows" id="auth-rows"></div>' +
      '</div>' +
      '<button class="auth-signout" id="auth-signout" type="button">⏻ Sign out</button>';
    document.body.appendChild(m);
    m.querySelector("#auth-signout").addEventListener("click", function () {
      closeMenu();
      if (fb) fb.signOut(fb.auth);
    });
    return m;
  }

  function renderMenu() {
    if (!menuEl || !user) return;
    const avatar = menuEl.querySelector("#auth-avatar");
    if (user.photoURL) {
      avatar.innerHTML = '<img src="' + user.photoURL + '" alt="" referrerpolicy="no-referrer">';
      avatar.classList.add("has-img");
    } else {
      avatar.textContent = initialOf(user);
      avatar.classList.remove("has-img");
    }
    menuEl.querySelector("#auth-name").textContent = user.displayName || "Signed in";
    menuEl.querySelector("#auth-email").textContent = user.email || "";

    const sum = (IQB.app && IQB.app.getProgressSummary) ? IQB.app.getProgressSummary() : { totalCompleted: 0, groups: [] };
    menuEl.querySelector("#auth-total-n").textContent = String(sum.totalCompleted);
    const rows = menuEl.querySelector("#auth-rows");
    rows.innerHTML = "";
    sum.groups.forEach(function (g) {
      const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
      const row = document.createElement("div");
      row.className = "auth-row";
      row.innerHTML =
        '<div class="auth-row-top">' +
          '<span class="auth-dot" style="background:' + g.color + '"></span>' +
          '<span class="auth-row-label">' + g.label + '</span>' +
          '<span class="auth-row-n">' + g.done + " / " + g.total + '</span>' +
        '</div>' +
        '<div class="auth-bar"><div class="auth-bar-fill" style="width:' + pct + '%;background:' + g.color + '"></div></div>';
      rows.appendChild(row);
    });
  }

  /* ---------- sign-in prompt (dismissible, skippable) ---------- */
  function maybeShowPrompt() {
    if (localStorage.getItem(PROMPT_KEY) === "1") return;
    setTimeout(function () {
      if (user) return;                    // signed in meanwhile
      if (localStorage.getItem(PROMPT_KEY) === "1") return;
      showPrompt();
    }, 1400);
  }

  function showPrompt() {
    if (promptEl) { promptEl.hidden = false; requestAnimationFrame(function () { promptEl.classList.add("show"); }); return; }
    const p = document.createElement("div");
    p.className = "login-prompt";
    p.id = "login-prompt";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", "Sign in to save your progress");
    p.innerHTML =
      '<button class="lp-close" id="lp-close" type="button" aria-label="Dismiss">✕</button>' +
      '<div class="lp-title">Save your progress</div>' +
      '<div class="lp-text">Sign in with Google to sync your completed questions and bookmarks across all your devices. It’s optional — you can keep using the site without it.</div>' +
      '<div class="lp-actions">' +
        '<button class="lp-signin" id="lp-signin" type="button">Sign in with Google</button>' +
        '<button class="lp-later" id="lp-later" type="button">Not now</button>' +
      '</div>';
    document.body.appendChild(p);
    promptEl = p;
    p.querySelector("#lp-signin").addEventListener("click", function () { signIn(); });
    p.querySelector("#lp-later").addEventListener("click", dismissPrompt);
    p.querySelector("#lp-close").addEventListener("click", dismissPrompt);
    requestAnimationFrame(function () { p.classList.add("show"); });
  }

  function hidePrompt() { if (promptEl) { promptEl.classList.remove("show"); promptEl.hidden = true; } }
  function dismissPrompt() {
    try { localStorage.setItem(PROMPT_KEY, "1"); } catch (e) { /* ignore */ }
    hidePrompt();
  }

  /* ---------- Firestore sync ---------- */
  function docRef(uid) { return fb.doc(fb.db, "users", uid); }

  async function subscribe(u) {
    const ref = docRef(u.uid);
    try {
      const snap = await fb.getDoc(ref);
      const remote = snap.exists() ? snap.data() : {};
      const local = IQB.app.getData();
      const merged = {
        progress: union(local.progress, remote.progress),
        bookmarks: union(local.bookmarks, remote.bookmarks),
        updatedAt: Date.now()
      };
      IQB.app.setData(merged);
      await fb.setDoc(ref, merged, { merge: true });
    } catch (e) { console.warn("[sync] initial merge failed:", e); }

    unsub = fb.onSnapshot(ref, function (snap) {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const d = snap.data();
      IQB.app.setData({ progress: d.progress || [], bookmarks: d.bookmarks || [] });
      if (menuEl && !menuEl.hidden) renderMenu();
    });
  }

  function pushSoon() {
    if (!user || !fb) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 700);
    if (menuEl && !menuEl.hidden) renderMenu();
  }
  function push() {
    if (!user || !fb) return;
    const data = IQB.app.getData();
    fb.setDoc(docRef(user.uid), {
      progress: data.progress, bookmarks: data.bookmarks, updatedAt: Date.now()
    }, { merge: true }).catch(function (e) { console.warn("[sync] push failed:", e); });
  }

  /* ---------- helpers ---------- */
  function union(a, b) { return Array.from(new Set([].concat(a || [], b || []))); }
  function initialOf(u) { return (u.displayName || u.email || "U").trim().charAt(0).toUpperCase(); }
})();

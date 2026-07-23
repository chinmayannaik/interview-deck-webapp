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

  /* Accounts allowed into the admin Reports panel. This list only decides what
     the UI offers — the real gate is the Firestore rule on /reports, which must
     carry the same emails. Editing this alone grants nobody anything. */
  const ADMIN_EMAILS = ["chinmayanaik920@gmail.com", "chinmayannaik@gmail.com"];

  const btn = document.getElementById("auth-btn");
  if (!CONFIGURED) return; // dormant: app stays local-only

  let fb = null, user = null, unsub = null, pushTimer = null, wasSignedIn = false;
  let menuEl = null, promptEl = null, signingIn = false;
  /* which progress groups are expanded in the profile menu (session-only —
     a fresh visit starts compact). No entry = default: open when it is the
     only group, collapsed otherwise. */
  const openGroups = {};
  /* The whole Learning Progress block starts collapsed — the menu is mostly
     opened for the focus pack or sign-out, and the progress list made those
     scroll on short screens. In-memory only: each fresh visit collapses again. */
  let progressOpen = false;
  const userChangeCbs = [];
  function emitUserChange() {
    userChangeCbs.forEach(function (cb) { try { cb(user); } catch (e) { /* isolate */ } });
  }

  /* "Auth has settled" — resolves the first time Firebase reports a definitive
     signed-in/signed-out state (or when the SDK fails to load at all). Distinct
     from fbReady, which only means the modules downloaded: at that point
     onAuthStateChanged has not fired yet, so isSignedIn() still reads false for
     a user who IS signed in. Features that gate their whole UI on auth (the AI
     tutor) must await this or they'll flash a "please sign in" screen at a
     signed-in user on every load. */
  let settleAuth = null;
  const authSettled = new Promise(function (res) { settleAuth = res; });

  if (btn) {
    btn.hidden = false;
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    setButton("signed-out");
    btn.addEventListener("click", onButtonClick);
  }
  /* signIn is exposed so a feature that requires an account can offer the button
     in place (js/reports.js) instead of sending the reader up to the header. */
  IQB.sync = { pushSoon: pushSoon, maybeShowPrompt: maybeShowPrompt, signIn: signIn };

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

    /* Await this before reading isSignedIn()/getUser() to make a decision that
       is expensive to reverse (rendering a sign-in wall, say). Never rejects —
       a Firebase that failed to load settles as "signed out". */
    authReady: function () { return authSettled; },

    /* Is the signed-in account allowed to moderate (see js/reports.js)? UI-level
       only — Firestore rules are what actually protect the data. */
    isAdmin: function () {
      return !!(user && ADMIN_EMAILS.indexOf(String(user.email || "").toLowerCase()) !== -1);
    },

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

  /* ============================================================
     IQB.shared — top-level collections that are NOT scoped to one user.

     IQB.cloud above can only ever address users/{uid}/…, which is the right
     shape for notes and highlights: the author is the only reader. Issue
     reports invert that — a reader writes a document that only a moderator
     may read — so they need a collection outside the user's own subtree
     (/reports/{autoId}). Who may read or write which collection is decided by
     Firestore rules, never here; these methods just surface the failure.
     ============================================================ */
  IQB.shared = {
    isReady: function () { return !!fb; },
    ready: function () { return fbReady; },

    /* Append a document with a generated id. Returns the new id. */
    add: async function (name, data) {
      await fbReady;
      const ref = await fb.addDoc(fb.collection(fb.db, name), data);
      return ref.id;
    },

    /* Every document in a collection as [{ id, ...data }], newest field first
       when orderField is given. Rejects (permission-denied) for non-admins —
       callers surface that rather than silently showing an empty list. */
    list: async function (name, orderField) {
      await fbReady;
      const col = fb.collection(fb.db, name);
      const q = orderField ? fb.query(col, fb.orderBy(orderField, "desc")) : col;
      const snap = await fb.getDocs(q);
      const out = [];
      snap.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); });
      return out;
    },

    /* Every document in a collection whose `field` equals `value`, as
       [{ id, ...data }]. Sorting is left to the caller ON PURPOSE: pairing an
       equality filter with orderBy on a different field makes Firestore demand a
       composite index, which would mean a console step before the first reader
       could see their own reports. A single-field filter needs no setup, and the
       result set here is one person's reports — cheap to sort in memory. */
    listWhere: async function (name, field, value) {
      await fbReady;
      const snap = await fb.getDocs(fb.query(fb.collection(fb.db, name), fb.where(field, "==", value)));
      const out = [];
      snap.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); });
      return out;
    },

    update: async function (name, id, patch) {
      await fbReady;
      await fb.updateDoc(fb.doc(fb.db, name, id), patch);
    },

    remove: async function (name, id) {
      await fbReady;
      await fb.deleteDoc(fb.doc(fb.db, name, id));
    },

    /* Server-authoritative timestamp — a client clock must not decide report
       ordering, and reportedAt is shown to a moderator as fact. */
    now: function () { return fb ? fb.serverTimestamp() : new Date(); }
  };

  // close the account menu on outside click / Escape
  document.addEventListener("click", function (e) {
    if (menuEl && !menuEl.hidden && !menuEl.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
  /* The panel is fixed and positioned once at open, so a rotate or a resize
     would leave it clamped to the old viewport. */
  window.addEventListener("resize", function () { positionMenu(); });

  /* Kept as a promise, not just a flag: a sign-in click can land before the SDK
     modules finish downloading, and signIn() awaits this rather than dropping it. */
  const fbReady = loadFirebase().then(startAuth);
  fbReady.catch(function (e) {
    console.warn("[sync] disabled:", e);
    settleAuth(null); // no SDK => permanently signed out; unblock authReady()
  });

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
      collection: fsMod.collection, getDocs: fsMod.getDocs, deleteDoc: fsMod.deleteDoc,
      addDoc: fsMod.addDoc, updateDoc: fsMod.updateDoc,
      query: fsMod.query, orderBy: fsMod.orderBy, where: fsMod.where,
      serverTimestamp: fsMod.serverTimestamp
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
        // Only wipe on a real sign-out transition. This callback also fires with
        // null on first load for someone who never signed in — clearing there
        // would destroy a local-only user's progress.
        if (wasSignedIn) clearLocalUserData();
        maybeShowPrompt();
      }
      wasSignedIn = !!user;
      settleAuth(user); // first call settles authReady(); later calls are no-ops
      emitUserChange(); // notify per-question feature modules (notes, future highlights)
    });
  }

  /* Sign-out wipe: the signed-in user's questions, notes and highlights live in
     Firestore, so the local mirror is disposable. Drop it on the way out —
     otherwise the next person on this browser sees the previous user's
     completed questions and highlights. */
  function clearLocalUserData() {
    clearTimeout(pushTimer);              // a debounced push must not outlive the session
    pushTimer = null;
    try { IQB.storage.clearUserData(); } catch (e) { /* ignore */ }
    // Reset the in-memory sets and repaint the list / progress bar.
    if (IQB.app && IQB.app.setData) IQB.app.setData({ progress: [], bookmarks: [] });
    // notes.js / highlights.js reload from the (now empty) mirror via emitUserChange().
  }

  /* The Google popup can take a second or two to appear — the SDK may still be
     loading, and Google's own window is slow to paint. Without a busy state the
     button looks dead and gets clicked again. */
  async function signIn(sourceBtn) {
    if (signingIn) return;
    signingIn = true;
    setSigninBusy(sourceBtn, true);
    try {
      await fbReady;
      await fb.signInWithPopup(fb.auth, fb.provider);
    } catch (e) {
      console.warn("[sync] sign-in failed:", (e && e.code) || e);
    } finally {
      signingIn = false;
      setSigninBusy(sourceBtn, false);
    }
  }

  function setSigninBusy(el, busy) {
    if (!el) return;
    el.classList.toggle("is-busy", busy);
    el.disabled = busy;
    if (busy) {
      el.dataset.prevHtml = el.innerHTML;
      el.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Signing in…</span>';
      return;
    }
    /* The header button's markup depends on auth state, which may have flipped
       while we were busy — let setButton rebuild it instead of restoring. */
    if (el === btn) setButton(user ? "signed-in" : "signed-out", user);
    else if (el.dataset.prevHtml != null) el.innerHTML = el.dataset.prevHtml;
    delete el.dataset.prevHtml;
  }

  /* ---------- header avatar button ---------- */
  function onButtonClick(e) {
    e.stopPropagation();
    if (user) toggleMenu();
    else signIn(btn);
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
  /* Right-align the panel to the avatar, but never outside the viewport.
     Anchoring `right` to the button alone assumed the avatar sits hard against
     the right edge of the header — it no longer does on mobile, where the
     filter, highlighter and search icons follow it. That pushed the 320px
     panel's left edge off-screen (a menu with its name and half its content
     cut off). Clamping to the viewport makes it independent of where the
     trigger happens to sit. */
  function positionMenu() {
    if (!menuEl || menuEl.hidden) return;
    const r = btn.getBoundingClientRect();
    const M = 10; // keep this much clear of the viewport edges
    const w = menuEl.offsetWidth;

    let left = r.right - w; // preferred: the panel's right edge meets the button's
    left = Math.min(left, window.innerWidth - w - M);
    left = Math.max(M, left);
    menuEl.style.left = Math.round(left) + "px";
    menuEl.style.right = "auto";

    menuEl.style.top = Math.round(r.bottom + 8) + "px";
    /* The panel is as tall as the reader's progress list, so on a short screen
       it would otherwise run off the bottom with Sign out unreachable. */
    menuEl.style.maxHeight = Math.max(200, Math.round(window.innerHeight - r.bottom - 8 - M)) + "px";
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
      '<div class="auth-progress" id="auth-progress">' +
        '<button class="auth-progress-title" id="auth-progress-toggle" type="button" aria-expanded="false">' +
          '<span class="auth-group-chev auth-title-chev" aria-hidden="true">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</span>' +
          '<span class="auth-sec-ic auth-sec-ic--progress" aria-hidden="true">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
          '</span>' +
          '<span>Learning progress</span>' +
          '<span class="auth-progress-n" id="auth-progress-n"></span>' +
        '</button>' +
        '<div class="auth-progress-body" id="auth-progress-body" hidden>' +
          '<div class="auth-total"><span>Total completed</span><strong id="auth-total-n">0</strong></div>' +
          '<div class="auth-rows" id="auth-rows"></div>' +
        '</div>' +
      '</div>' +
      '<div class="auth-pack" id="auth-pack" hidden>' +
        '<div class="auth-pack-title">' +
          '<span class="auth-sec-ic auth-sec-ic--pack" aria-hidden="true">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' +
          '</span>' +
          '<span>Focus pack</span>' +
        '</div>' +
        '<p class="auth-pack-hint">Load role-specific questions</p>' +
        '<div class="auth-select-wrap">' +
          '<select class="auth-pack-select" id="auth-pack-select" aria-label="Focus pack"></select>' +
        '</div>' +
      '</div>' +
      '<div class="auth-actions">' +
        '<button class="auth-link" id="auth-myreports" type="button" hidden>' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>' +
          '<span>My reported issues</span>' +
        '</button>' +
        '<button class="auth-link auth-admin" id="auth-admin" type="button" hidden>' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>' +
          '<span>Issue reports</span>' +
        '</button>' +
        '<button class="auth-signout" id="auth-signout" type="button">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
          '<span>Sign out</span>' +
        '</button>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelector("#auth-progress-toggle").addEventListener("click", function (e) {
      e.stopPropagation();
      progressOpen = !progressOpen;
      renderMenu();
    });
    m.querySelector("#auth-signout").addEventListener("click", function () {
      closeMenu();
      if (fb) fb.signOut(fb.auth);
    });
    m.querySelector("#auth-pack-select").addEventListener("change", function (e) {
      if (window.IQB.app && IQB.app.setFocusPack) IQB.app.setFocusPack(e.target.value || null);
      renderMenu();
    });
    m.querySelector("#auth-myreports").addEventListener("click", function () {
      closeMenu();
      if (window.IQB.reports) IQB.reports.openMine();
    });
    m.querySelector("#auth-admin").addEventListener("click", function () {
      closeMenu();
      if (window.IQB.reports) IQB.reports.openAdmin();
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

    // Anyone signed in can track the reports they filed; only an allowlisted
    // account gets the moderation queue.
    const mineBtn = menuEl.querySelector("#auth-myreports");
    if (mineBtn) mineBtn.hidden = !window.IQB.reports;
    const adminBtn = menuEl.querySelector("#auth-admin");
    if (adminBtn) adminBtn.hidden = !(IQB.cloud.isAdmin() && window.IQB.reports);

    /* Focus pack picker — only rendered when the content actually ships packs
       (IQB.packs comes from the manifest via data-loader.js). */
    var packBox = menuEl.querySelector("#auth-pack");
    if (packBox) {
      var packs = (window.IQB.app && IQB.app.getFocusPacks) ? IQB.app.getFocusPacks() : [];
      packBox.hidden = !packs.length;
      if (packs.length) {
        var packSel = packBox.querySelector("#auth-pack-select");
        var activePk = (IQB.app.getActiveFocusPack && IQB.app.getActiveFocusPack()) || null;
        packSel.innerHTML = "";
        var off = document.createElement("option");
        off.value = "";
        off.textContent = "All questions";
        packSel.appendChild(off);
        packs.forEach(function (p) {
          var o = document.createElement("option");
          o.value = p.id;
          o.textContent = p.label + " (" + p.count + " questions)";
          if (p.description) o.title = p.description;
          packSel.appendChild(o);
        });
        packSel.value = activePk ? activePk.id : "";
        /* The native <select>'s open list is OS-drawn and ignores the theme —
           swap it for the site's own combobox (same component as the mobile
           filters). enhance() is a one-time upgrade; syncAll() re-reads the
           options we just rebuilt. */
        if (window.IQB.select) {
          IQB.select.enhance(packSel);
          IQB.select.syncAll();
        }
      }
    }

    /* Started categories only (app.js getProgressSummary), grouped under their
       main field as collapsible sections — an Angular reader sees Angular, not
       "Frontend 12/430" padded with frameworks they never opened, and a reader
       with many started topics gets one compact line per field instead of a
       screen-long list. Rows are dismissible (the ✕), with a single "show
       hidden" undo rather than per-row memory. */
    const sum = (IQB.app && IQB.app.getProgressSummary) ? IQB.app.getProgressSummary() : { totalCompleted: 0, groups: [], hiddenCount: 0 };
    menuEl.querySelector("#auth-total-n").textContent = String(sum.totalCompleted);

    /* Collapsed by default; the header still shows the completed count so the
       number the reader cares about survives the fold. */
    const progBox = menuEl.querySelector("#auth-progress");
    const progBody = menuEl.querySelector("#auth-progress-body");
    const progToggle = menuEl.querySelector("#auth-progress-toggle");
    progBox.classList.toggle("open", progressOpen);
    progBody.hidden = !progressOpen;
    progToggle.setAttribute("aria-expanded", String(progressOpen));
    menuEl.querySelector("#auth-progress-n").textContent = String(sum.totalCompleted);
    const rows = menuEl.querySelector("#auth-rows");
    rows.innerHTML = "";
    if (!sum.groups.length) {
      const empty = document.createElement("p");
      empty.className = "auth-empty";
      empty.textContent = sum.hiddenCount
        ? "All progress rows are hidden."
        : "Complete or bookmark a question and its topic will start tracking here.";
      rows.appendChild(empty);
    }
    sum.groups.forEach(function (g) {
      const open = (g.key in openGroups) ? openGroups[g.key] : sum.groups.length === 1;
      const sec = document.createElement("div");
      sec.className = "auth-group" + (open ? " open" : "");
      const head = document.createElement("button");
      head.type = "button";
      head.className = "auth-group-head";
      head.setAttribute("aria-expanded", String(open));
      head.innerHTML =
        '<span class="auth-group-chev" aria-hidden="true">▸</span>' +
        '<span class="auth-dot" style="background:' + g.color + '"></span>' +
        '<span class="auth-row-label">' + g.label + '</span>' +
        '<span class="auth-row-n">' + g.done + " / " + g.total + '</span>';
      head.addEventListener("click", function (e) {
        e.stopPropagation();   // renderMenu() detaches this button — see the ✕ note below
        openGroups[g.key] = !open;
        renderMenu();
      });
      sec.appendChild(head);
      if (open) {
        const body = document.createElement("div");
        body.className = "auth-group-body";
        g.cats.forEach(function (c) {
          const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
          const row = document.createElement("div");
          row.className = "auth-row" + (c.complete ? " is-done" : "");
          row.innerHTML =
            '<div class="auth-row-top">' +
              '<span class="auth-dot" style="background:' + c.color + '"></span>' +
              '<span class="auth-row-label">' + c.label + '</span>' +
              (c.complete ? '<span class="auth-row-check" title="Topic completed">✓</span>' : '') +
              '<span class="auth-row-n">' + c.done + " / " + c.total + '</span>' +
              '<button class="auth-row-x" type="button" title="Hide from profile" aria-label="Hide ' + c.label + ' progress">×</button>' +
            '</div>' +
            '<div class="auth-bar"><div class="auth-bar-fill" style="width:' + pct + '%;background:' + c.color + '"></div></div>';
          row.querySelector(".auth-row-x").addEventListener("click", function (e) {
            /* stopPropagation is load-bearing: renderMenu() detaches this button,
               so by the time the document's close-on-outside-click handler runs,
               menuEl.contains(e.target) is false and the menu would close. */
            e.stopPropagation();
            if (IQB.app && IQB.app.hideProgressRow) { IQB.app.hideProgressRow(c.key); renderMenu(); }
          });
          body.appendChild(row);
        });
        sec.appendChild(body);
      }
      rows.appendChild(sec);
    });
    if (sum.hiddenCount) {
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "auth-unhide";
      undo.textContent = "Show " + sum.hiddenCount + " hidden " + (sum.hiddenCount === 1 ? "topic" : "topics");
      undo.addEventListener("click", function (e) {
        e.stopPropagation();   // same detached-node trap as the ✕ above
        if (IQB.app && IQB.app.unhideProgress) { IQB.app.unhideProgress(); renderMenu(); }
      });
      rows.appendChild(undo);
    }
  }

  /* ---------- sign-in prompt (dismissible, skippable) ---------- */
  function maybeShowPrompt() {
    if (localStorage.getItem(PROMPT_KEY) === "1") return;
    if (localStorage.getItem("iqb_tour_completed") !== "true") return;
    setTimeout(function () {
      if (user) return;                    // signed in meanwhile
      if (localStorage.getItem(PROMPT_KEY) === "1") return;
      showPrompt();
    }, 1400);
  }

  function showPrompt() {
    if (promptEl) { promptEl.hidden = false; requestAnimationFrame(function () { promptEl.classList.add("show"); document.body.classList.add("login-prompt-open"); }); return; }
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
    p.querySelector("#lp-signin").addEventListener("click", function (ev) { signIn(ev.currentTarget); });
    p.querySelector("#lp-later").addEventListener("click", dismissPrompt);
    p.querySelector("#lp-close").addEventListener("click", dismissPrompt);
    requestAnimationFrame(function () { p.classList.add("show"); document.body.classList.add("login-prompt-open"); });
  }

  function hidePrompt() { if (promptEl) { promptEl.classList.remove("show"); promptEl.hidden = true; document.body.classList.remove("login-prompt-open"); } }
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
      /* The last selected view is a single choice, not a set — there is nothing
         to union. The cloud copy wins because that IS the feature: pick Angular
         on the laptop, sign in on the phone, land on Angular. Falls back to this
         device's view for a profile written before this field existed. */
      const view = remote.lastTab || local.lastTab;
      if (view) merged.lastTab = view;

      IQB.app.setData(merged);
      await fb.setDoc(ref, merged, { merge: true });

      /* Once, here — deliberately NOT in the onSnapshot below. Restoring on every
         snapshot would mean a tab switch on another device yanks this one away
         from whatever the reader is currently reading. app.js declines if they
         have already picked a view this session (see restoreView). */
      if (remote.lastTab && IQB.app.restoreView) IQB.app.restoreView(remote.lastTab);
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
    const payload = { progress: data.progress, bookmarks: data.bookmarks, updatedAt: Date.now() };
    // Firestore rejects an explicit undefined, so only send a view we actually have.
    if (data.lastTab) payload.lastTab = data.lastTab;
    fb.setDoc(docRef(user.uid), payload, { merge: true })
      .catch(function (e) { console.warn("[sync] push failed:", e); });
  }

  /* ---------- helpers ---------- */
  function union(a, b) { return Array.from(new Set([].concat(a || [], b || []))); }
  function initialOf(u) { return (u.displayName || u.email || "U").trim().charAt(0).toUpperCase(); }
})();

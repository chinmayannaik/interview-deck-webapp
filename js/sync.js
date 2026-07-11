/* ============================================================
   Optional cloud sync — Google sign-in + Firestore.

   Until you paste a real Firebase config below, sync stays OFF and the
   app behaves exactly as before (progress saved locally per device).
   Once configured: click the sign-in button, and your completed +
   bookmarked questions sync across every device you sign in on.

   Setup steps are in README / the message that shipped this file.
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

  const btn = document.getElementById("auth-btn");

  // Not configured yet → keep the button hidden and do nothing.
  if (!CONFIGURED) return;

  let fb = null;       // resolved Firebase fns/handles
  let user = null;     // current signed-in user
  let unsub = null;    // Firestore snapshot unsubscribe
  let pushTimer = null;

  if (btn) {
    btn.hidden = false;
    setButton("signed-out");
    btn.addEventListener("click", onButtonClick);
  }

  // expose the one method app.js calls after a local change
  IQB.sync = { pushSoon: pushSoon };

  loadFirebase().then(startAuth).catch((e) => console.warn("[sync] disabled:", e));

  /* ---- load the modular Firebase SDK straight from the CDN ---- */
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
      doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc, onSnapshot: fsMod.onSnapshot
    };
  }

  function startAuth() {
    fb.onAuthStateChanged(fb.auth, function (u) {
      user = u || null;
      if (user) { setButton("signed-in", user); subscribe(user); }
      else { setButton("signed-out"); if (unsub) { unsub(); unsub = null; } }
    });
  }

  function onButtonClick() {
    if (!fb) return;
    if (user) {
      if (confirm("Sign out of sync?\nYour progress stays saved on this device.")) fb.signOut(fb.auth);
    } else {
      fb.signInWithPopup(fb.auth, fb.provider).catch(function (e) {
        console.warn("[sync] sign-in failed:", e && e.code);
      });
    }
  }

  function docRef(uid) { return fb.doc(fb.db, "users", uid); }

  /* On sign-in: merge local + cloud once (union, so nothing is lost),
     write it back, then listen for live changes from other devices. */
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
      // ignore our own not-yet-committed writes to avoid echo loops
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const d = snap.data();
      IQB.app.setData({ progress: d.progress || [], bookmarks: d.bookmarks || [] });
    });
  }

  function pushSoon() {
    if (!user || !fb) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 700);
  }

  function push() {
    if (!user || !fb) return;
    const data = IQB.app.getData();
    fb.setDoc(docRef(user.uid), {
      progress: data.progress, bookmarks: data.bookmarks, updatedAt: Date.now()
    }, { merge: true }).catch(function (e) { console.warn("[sync] push failed:", e); });
  }

  function union(a, b) { return Array.from(new Set([].concat(a || [], b || []))); }

  function setButton(state, u) {
    if (!btn) return;
    if (state === "signed-in" && u) {
      const label = (u.displayName || u.email || "U").trim();
      btn.textContent = label.charAt(0).toUpperCase();
      btn.classList.add("signed-in");
      btn.setAttribute("aria-label", "Synced as " + (u.email || label) + " — click to sign out");
      btn.title = "Synced: " + (u.email || label);
    } else {
      btn.textContent = "⇆"; // ⇆
      btn.classList.remove("signed-in");
      btn.setAttribute("aria-label", "Sign in with Google to sync across devices");
      btn.title = "Sign in to sync across devices";
    }
  }
})();

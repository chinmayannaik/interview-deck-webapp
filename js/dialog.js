/* ============================================================
   Dialogs — the app's own confirm() and prompt().

   The native ones were doing real damage: a browser-chrome alert that says
   "localhost:3500 says" reads like a security warning rather than a considered
   question, it cannot show the note's title in the app's own type, and on a
   destructive action it puts OK under the cursor with no visual weight to say
   that OK deletes something. These are styled, focus-managed, and give the
   dangerous choice the colour it deserves.

   Both return a Promise, which is the one behavioural difference from the
   natives: window.confirm() blocks the thread and returns a boolean, so every
   caller had to become async. That is a feature — a blocking modal freezes
   rendering, and the notebook's autosave runs on timers.

   Escape and the backdrop always resolve to "no". For a destructive prompt the
   initial focus goes to Cancel, never to the confirm button: the reader should
   have to travel to do damage.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};

  let openDialog = null;   // only ever one at a time

  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function build(opts) {
    const o = opts || {};
    const isPrompt = o.kind === "prompt";

    const overlay = document.createElement("div");
    overlay.className = "dlg-overlay";

    const card = document.createElement("div");
    card.className = "dlg" + (o.danger ? " dlg-danger" : "");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");

    const titleId = "dlg-t-" + Date.now();
    const title = document.createElement("h2");
    title.className = "dlg-title";
    title.id = titleId;
    title.textContent = o.title || (isPrompt ? "Enter a value" : "Are you sure?");
    card.setAttribute("aria-labelledby", titleId);

    card.appendChild(title);

    if (o.message) {
      const msg = document.createElement("p");
      msg.className = "dlg-msg";
      // textContent, not innerHTML: these strings interpolate note titles and
      // tag names, which are reader-authored and must never become markup.
      msg.textContent = o.message;
      card.appendChild(msg);
    }

    let input = null;
    if (isPrompt) {
      input = document.createElement("input");
      input.className = "dlg-input";
      input.type = o.inputType || "text";
      input.value = o.value || "";
      if (o.placeholder) input.placeholder = o.placeholder;
      input.setAttribute("aria-label", o.title || "Value");
      card.appendChild(input);
    }

    const err = document.createElement("p");
    err.className = "dlg-err";
    err.hidden = true;
    card.appendChild(err);

    const foot = document.createElement("div");
    foot.className = "dlg-foot";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "dlg-btn";
    cancel.textContent = o.cancelLabel || "Cancel";

    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "dlg-btn dlg-primary" + (o.danger ? " dlg-btn-danger" : "");
    ok.textContent = o.confirmLabel || (o.danger ? "Delete" : "OK");

    foot.appendChild(cancel);
    foot.appendChild(ok);
    card.appendChild(foot);
    overlay.appendChild(card);

    return { overlay: overlay, card: card, input: input, ok: ok, cancel: cancel, err: err };
  }

  function show(opts) {
    const o = opts || {};

    // A second dialog while one is up would strand the first one's promise.
    if (openDialog) openDialog.dismiss(null);

    return new Promise(function (resolve) {
      const ui = build(o);
      const prevFocus = document.activeElement;
      let settled = false;

      function settle(value) {
        if (settled) return;
        settled = true;
        openDialog = null;
        document.removeEventListener("keydown", onKey, true);
        ui.overlay.classList.add("is-closing");
        const done = function () {
          ui.overlay.remove();
          document.documentElement.classList.remove("dlg-open");
          // Put the reader back where they were, so a cancelled delete does
          // not dump focus at the top of the document.
          if (prevFocus && prevFocus.focus && prevFocus.isConnected) {
            try { prevFocus.focus({ preventScroll: true }); } catch (e) { prevFocus.focus(); }
          }
          resolve(value);
        };
        // Wait out the fade, but never hang if the animation never fires.
        let fired = false;
        ui.overlay.addEventListener("transitionend", function () { if (!fired) { fired = true; done(); } }, { once: true });
        setTimeout(function () { if (!fired) { fired = true; done(); } }, 220);
      }

      function confirm() {
        if (!ui.input) { settle(true); return; }
        const value = ui.input.value;
        if (o.validate) {
          const problem = o.validate(value);
          if (problem) {
            ui.err.textContent = problem;
            ui.err.hidden = false;
            ui.input.focus();
            ui.input.select();
            return;
          }
        }
        settle(value);
      }

      function cancel() { settle(ui.input ? null : false); }

      ui.ok.addEventListener("click", confirm);
      ui.cancel.addEventListener("click", cancel);
      ui.overlay.addEventListener("mousedown", function (e) {
        if (e.target === ui.overlay) cancel();     // backdrop, not the card
      });

      /* Capture phase: the notebook, the tutor and the Quick Note window all
         listen for Escape on document, and any of them acting on the same
         keypress would close themselves out from under this dialog. */
      function onKey(e) {
        if (e.key === "Escape") {
          e.preventDefault(); e.stopPropagation();
          cancel();
          return;
        }
        if (e.key === "Enter" && (ui.input || document.activeElement !== ui.cancel)) {
          // Enter in a textarea-less dialog means "do it"; on Cancel it means
          // "cancel", which the button's own activation already handles.
          if (document.activeElement === ui.cancel) return;
          e.preventDefault(); e.stopPropagation();
          confirm();
          return;
        }
        if (e.key !== "Tab") return;
        // Focus trap.
        const items = Array.prototype.filter.call(
          ui.card.querySelectorAll(FOCUSABLE),
          function (n) { return n.offsetParent !== null || n === document.activeElement; }
        );
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      document.addEventListener("keydown", onKey, true);

      document.documentElement.classList.add("dlg-open");
      document.body.appendChild(ui.overlay);
      // Next frame, so the opening transition has a start state to move from.
      requestAnimationFrame(function () { ui.overlay.classList.add("is-open"); });

      if (ui.input) { ui.input.focus(); ui.input.select(); }
      else if (o.danger) ui.cancel.focus();
      else ui.ok.focus();

      openDialog = { dismiss: settle };
    });
  }

  IQB.ui = IQB.ui || {};

  /* -> Promise<boolean> */
  IQB.ui.confirm = function (opts) {
    return show(Object.assign({ kind: "confirm" }, typeof opts === "string" ? { message: opts } : opts));
  };

  /* -> Promise<string|null>. null means cancelled, which is distinct from ""
     (submitted empty) — callers that care can tell them apart. */
  IQB.ui.prompt = function (opts) {
    return show(Object.assign({ kind: "prompt" }, typeof opts === "string" ? { title: opts } : opts));
  };
})();

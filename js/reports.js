/* ============================================================
   Issue Reports — readers flag a wrong/broken question; an admin triages them.

   Entry point: "Report Issue" in a card's action row. If the reader had text
   selected in that card when they reached for it, the selection is quoted into
   the report so the admin sees the exact wrong sentence instead of re-reading
   the whole question — and they can drop the quote to report the question as a
   whole. The selection is captured PASSIVELY (SelectionMemory): an earlier
   version floated a "Report Selected Text" button over every selection, which
   put a button in the reader's face every time they dragged across a line while
   reading. Reporting is rare; reading is the whole product.

   Storage is deliberately NOT IQB.cloud (users/{uid}/…): a report is written by
   a reader but read by a moderator, so it lives in a top-level /reports
   collection via IQB.shared (js/sync.js). Firestore rules do the real gating —
   any signed-in user may create and read back their OWN reports, only an
   allowlisted admin may read all / update / delete. See ARCHITECTURE.md.

   Document shape:
     { questionId, questionText, category, reason, selectedText, region,
       comment, reportedBy, reporterEmail, reporterName, status, createdAt }

   There is no local mirror on purpose. A note is the reader's own data and must
   survive offline; a report is a message to someone else — queuing one locally
   would tell the reader it was filed when nobody can see it.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el, qs, toast } = IQB.utils;

  const COLLECTION = "reports";

  /* value → label. The value is what's stored; changing a label is cosmetic,
     changing a value orphans existing reports in the panels. */
  const REASONS = [
    { value: "incorrect-answer",   label: "Incorrect answer",   hint: "You can also select the incorrect part before reporting" },
    { value: "incorrect-question", label: "Incorrect question" },
    { value: "typo",               label: "Typo / Grammar" },
    { value: "formatting",         label: "Formatting issue" },
    { value: "code",               label: "Code doesn't work" },
    { value: "video",              label: "Video link broken" },
    { value: "other",              label: "Other" }
  ];
  const REASON_LABEL = REASONS.reduce(function (m, r) { m[r.value] = r.label; return m; }, {});

  /* The regions a selection may be quoted from — the same roots highlights.js
     marks with data-hl-region, so the two features agree on what is quotable. */
  const REGION_SELECTOR = ".qa-qtext, .answer, .qa-deep";
  const MAX_SELECTED = 1200;   // a runaway "select all" must not blow up the doc
  const MAX_COMMENT = 2000;

  const cloud = function () { return window.IQB.cloud || null; };
  const signedIn = function () { const c = cloud(); return !!(c && c.isSignedIn()); };

  /* highlights.js stamps data-hl-region, but it only runs when Firebase is
     configured — fall back to the class so the label is never blank. */
  function regionOf(root) {
    if (root.classList.contains("qa-qtext")) return "question";
    if (root.classList.contains("qa-deep")) return "deep";
    return "answer";
  }

  /* ========================================================
     SelectionMemory — remembers the reader's last selection, silently.

     Nothing is rendered while they read. The dialog asks, at open time, whether
     the card being reported is the one they last selected inside; if so it
     offers the quote (droppable). Capturing on release rather than at click
     time matters: pressing any button collapses the selection first.
     ======================================================== */
  const SelectionMemory = (function () {
    let last = null;   // { cardId, text, region }

    function capture() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const text = sel.toString().trim();
      if (text.length < 2) return;

      const node = sel.getRangeAt(0).commonAncestorContainer;
      const host = node.nodeType === 1 ? node : node.parentElement;
      if (!host || !host.closest) return;
      /* A drag running from the answer into the deep-dive has no single quotable
         span; leave the previous memory alone rather than store a half-truth. */
      const root = host.closest(REGION_SELECTOR);
      if (!root) return;
      const card = root.closest(".qa-card");
      if (!card || !card.dataset.id) return;

      last = {
        cardId: card.dataset.id,
        text: text.slice(0, MAX_SELECTED),
        region: root.dataset.hlRegion || regionOf(root)
      };
    }

    function forCard(card) {
      return (last && card && last.cardId === card.dataset.id) ? last : null;
    }
    function clear() { last = null; }

    function init() {
      document.addEventListener("mouseup", function () { setTimeout(capture, 0); });
      document.addEventListener("touchend", function () { setTimeout(capture, 0); });
      document.addEventListener("keyup", function (e) {
        if (e.shiftKey || e.key === "Shift") setTimeout(capture, 0);
      });
    }
    return { init: init, forCard: forCard, clear: clear };
  })();

  /* ========================================================
     Report dialog
     ======================================================== */
  const Dialog = (function () {
    let overlay = null, refs = null, onCloseFocus = null;

    function close() {
      if (overlay) overlay.hidden = true;
      document.body.classList.remove("rp-open");
      refs = null;
      if (onCloseFocus && onCloseFocus.focus) { try { onCloseFocus.focus(); } catch (e) { /* gone */ } }
      onCloseFocus = null;
    }
    function isOpen() { return !!(overlay && !overlay.hidden); }

    function build() {
      const o = el("div", {
        class: "rp-overlay", hidden: "",
        onmousedown: function (e) { if (e.target === o) close(); }
      });
      document.body.appendChild(o);
      return o;
    }

    /* ctx: { questionId, questionText, category, selectedText, region } */
    function open(ctx) {
      if (!overlay) overlay = build();
      onCloseFocus = document.activeElement;
      overlay.innerHTML = "";
      overlay.appendChild(panel(ctx));
      overlay.hidden = false;
      document.body.classList.add("rp-open");
      if (refs.firstRadio) refs.firstRadio.focus();
    }

    function panel(ctx) {
      const p = el("div", {
        class: "rp-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "rp-title"
      });

      p.appendChild(el("div", { class: "rp-head" }, [
        el("h2", { class: "rp-title", id: "rp-title", text: "Report an Issue" }),
        el("button", { class: "rp-x", type: "button", "aria-label": "Close", text: "✕", onclick: close })
      ]));

      // What's being reported: the question, plus the quoted span when one was
      // selected. The quote is droppable — a stale selection must never silently
      // narrow a report the reader meant to file against the whole question.
      const ctxBox = el("div", { class: "rp-context" }, [
        el("div", { class: "rp-ctx-q", text: ctx.questionText || ctx.questionId })
      ]);
      const selBox = el("div", { class: "rp-ctx-sel", hidden: ctx.selectedText ? null : "" }, [
        el("div", { class: "rp-ctx-selhead" }, [
          el("span", { class: "rp-ctx-label", text: "Reporting this text" }),
          el("button", {
            class: "rp-drop", type: "button", text: "✕ Report whole question",
            onclick: function () {
              ctx.selectedText = ""; ctx.region = "";
              selBox.hidden = true;
              SelectionMemory.clear();
            }
          })
        ]),
        el("blockquote", { class: "rp-quote", text: ctx.selectedText || "" })
      ]);
      ctxBox.appendChild(selBox);
      p.appendChild(ctxBox);

      // reasons
      const list = el("div", { class: "rp-reasons", role: "radiogroup", "aria-label": "Reason" });
      let firstRadio = null;
      REASONS.forEach(function (r, i) {
        const input = el("input", {
          type: "radio", name: "rp-reason", value: r.value, class: "rp-radio", id: "rp-r-" + r.value
        });
        if (i === 0) { input.checked = true; firstRadio = input; }
        list.appendChild(el("label", { class: "rp-reason", for: "rp-r-" + r.value }, [
          input,
          el("span", { class: "rp-reason-text" }, [
            el("span", { class: "rp-reason-label", text: r.label }),
            r.hint ? el("span", { class: "rp-reason-hint", text: r.hint }) : null
          ])
        ]));
      });
      p.appendChild(list);

      // optional details
      const ta = el("textarea", {
        class: "rp-input", id: "rp-comment", rows: "3", maxlength: String(MAX_COMMENT),
        placeholder: "What's wrong, and what should it say instead?"
      });
      p.appendChild(el("div", { class: "rp-field" }, [
        el("label", { class: "rp-label", for: "rp-comment", text: "Additional details (optional)" }),
        ta
      ]));

      // sign-in gate — one element, shown only while signed out
      const signinBtn = el("button", {
        class: "rp-btn rp-primary rp-signin", type: "button", text: "Sign in with Google",
        onclick: function (e) { if (IQB.sync && IQB.sync.signIn) IQB.sync.signIn(e.currentTarget); }
      });
      const note = el("div", { class: "rp-note", hidden: "" }, [
        el("span", { text: "Sign in to submit a report — it lets us follow up and keeps out spam." }),
        signinBtn
      ]);

      const submit = el("button", { class: "rp-btn rp-primary rp-submit", type: "button", text: "Submit" });
      submit.addEventListener("click", function () {
        const picked = p.querySelector('input[name="rp-reason"]:checked');
        doSubmit(ctx, picked ? picked.value : "other", ta.value, submit);
      });
      const cancel = el("button", { class: "rp-btn", type: "button", text: "Cancel", onclick: close });

      p.appendChild(note);
      p.appendChild(el("div", { class: "rp-actions" }, [cancel, submit]));

      /* Held as references rather than re-queried later: `.rp-primary` matches
         the sign-in button too, and it comes first in the DOM — a querySelector
         for the submit button silently returned the wrong one. */
      refs = { note: note, submit: submit, firstRadio: firstRadio };
      applyAuth();
      return p;
    }

    /* Single source of truth for the signed-in/out state of the open dialog, so
       a sign-in that happens INSIDE it lands correctly (IQB.cloud.onChange). */
    function applyAuth() {
      if (!refs) return;
      const ok = signedIn();
      refs.note.hidden = ok;
      refs.submit.disabled = !ok;
    }
    function refreshAuth() { if (isOpen()) applyAuth(); }

    async function doSubmit(ctx, reason, comment, btn) {
      if (!signedIn()) { toast("Sign in to submit a report"); return; }
      const user = cloud().getUser();
      btn.disabled = true;
      btn.textContent = "Submitting…";
      try {
        await IQB.shared.add(COLLECTION, {
          questionId: ctx.questionId,
          questionText: (ctx.questionText || "").slice(0, 300),
          category: ctx.category || "",
          reason: reason,
          selectedText: (ctx.selectedText || "").slice(0, MAX_SELECTED),
          region: ctx.region || "",
          comment: (comment || "").trim().slice(0, MAX_COMMENT),
          reportedBy: user.uid,
          reporterEmail: user.email || "",
          reporterName: user.displayName || "",
          status: "open",
          createdAt: IQB.shared.now()
        });
        SelectionMemory.clear();
        close();
        toast("Thanks — report submitted");
      } catch (e) {
        console.warn("[reports] submit failed:", e);
        btn.disabled = false;
        btn.textContent = "Submit";
        toast("Couldn't submit — check your connection and try again");
      }
    }

    return { open: open, close: close, isOpen: isOpen, refreshAuth: refreshAuth };
  })();

  /* ========================================================
     Context — read what's being reported out of the card DOM.

     The card is the only place that still holds the rendered question; app.js
     doesn't keep the source object per card, and re-looking-it-up in IQB.data
     would couple this module to the loader's shape.
     ======================================================== */
  function ctxFromCard(card) {
    const qtext = card.querySelector(".qa-qtext");
    const sel = SelectionMemory.forCard(card);
    return {
      questionId: card.dataset.id,
      questionText: qtext ? qtext.textContent.trim() : "",
      category: card.dataset.category || "",
      selectedText: sel ? sel.text : "",
      region: sel ? sel.region : ""
    };
  }

  /* ========================================================
     Reports panel — one component, two audiences.

       mode "admin" — every report, with triage controls.
       mode "mine"  — the reader's own reports, read-only, so they can see that
                      something was received and whether it's been dealt with.

     Same list, same rows; what differs is the query and which controls render.
     ======================================================== */
  const Panel = (function () {
    let overlay = null, listEl = null, countEl = null, titleEl = null, tabsEl = null;
    let reports = [], filter = "open", mode = "admin";

    const isAdmin = function () { return mode === "admin"; };

    function build() {
      const o = el("div", {
        class: "rp-admin-overlay", hidden: "",
        onmousedown: function (e) { if (e.target === o) close(); }
      });
      const panel = el("div", { class: "rp-admin", role: "dialog", "aria-modal": "true", "aria-label": "Reports" });

      titleEl = el("h2", { class: "rp-title" });
      countEl = el("span", { class: "rp-admin-count" });
      panel.appendChild(el("div", { class: "rp-admin-head" }, [
        titleEl, countEl,
        el("button", { class: "rp-refresh", type: "button", text: "Refresh", onclick: function () { load(); } }),
        el("button", { class: "rp-x", type: "button", "aria-label": "Close", text: "✕", onclick: close })
      ]));

      tabsEl = el("div", { class: "rp-admin-tabs" }, ["open", "resolved", "all"].map(function (f) {
        return el("button", {
          class: "rp-tab", type: "button", "data-filter": f,
          text: f.charAt(0).toUpperCase() + f.slice(1),
          onclick: function () { filter = f; syncTabs(); render(); }
        });
      }));
      panel.appendChild(tabsEl);

      listEl = el("div", { class: "rp-admin-list" });
      panel.appendChild(listEl);
      o.appendChild(panel);
      document.body.appendChild(o);
      return o;
    }

    function syncTabs() {
      tabsEl.querySelectorAll(".rp-tab").forEach(function (t) {
        t.classList.toggle("on", t.dataset.filter === filter);
      });
    }

    function open(nextMode) {
      if (!signedIn()) { toast("Sign in to see your reports"); return; }
      if (nextMode === "admin" && !cloud().isAdmin()) { toast("Admins only"); return; }
      mode = nextMode;
      filter = "open";
      if (!overlay) overlay = build();
      titleEl.textContent = isAdmin() ? "Issue Reports" : "My Reported Issues";
      syncTabs();
      overlay.hidden = false;
      document.body.classList.add("rp-open");
      load();
    }
    function close() {
      if (overlay) overlay.hidden = true;
      document.body.classList.remove("rp-open");
    }

    async function load() {
      listEl.innerHTML = "";
      listEl.appendChild(el("div", { class: "rp-empty", text: "Loading reports…" }));
      try {
        if (isAdmin()) {
          reports = await IQB.shared.list(COLLECTION, "createdAt");
        } else {
          // filtered server-side to this reader; sorted here (see listWhere)
          reports = await IQB.shared.listWhere(COLLECTION, "reportedBy", cloud().getUser().uid);
          reports.sort(function (a, b) { return ms(b.createdAt) - ms(a.createdAt); });
        }
        render();
      } catch (e) {
        console.warn("[reports] load failed:", e);
        listEl.innerHTML = "";
        listEl.appendChild(el("div", { class: "rp-empty" }, [
          el("div", { text: "Couldn't load reports." }),
          el("div", {
            class: "rp-empty-hint",
            text: (e && e.code === "permission-denied")
              ? "Firestore denied the read — check the /reports rule (see ARCHITECTURE.md)."
              : String((e && e.message) || e)
          })
        ]));
      }
    }

    function visible() {
      if (filter === "all") return reports;
      return reports.filter(function (r) { return (r.status || "open") === filter; });
    }

    function render() {
      const rows = visible();
      const openN = reports.filter(function (r) { return (r.status || "open") === "open"; }).length;
      countEl.textContent = openN + " open · " + reports.length + " total";

      listEl.innerHTML = "";
      if (!rows.length) {
        listEl.appendChild(el("div", { class: "rp-empty" }, [
          el("div", {
            text: reports.length
              ? "No " + filter + " reports."
              : (isAdmin() ? "No reports yet." : "You haven't reported anything yet.")
          }),
          (!isAdmin() && !reports.length)
            ? el("div", { class: "rp-empty-sub", text: "Spot a mistake in a question? Use “Report Issue” on any card." })
            : null
        ]));
        return;
      }
      rows.forEach(function (r) { listEl.appendChild(row(r)); });
    }

    function row(r) {
      const status = r.status || "open";
      const card = el("div", { class: "rp-item rp-" + status });

      card.appendChild(el("div", { class: "rp-item-top" }, [
        el("span", { class: "rp-badge", text: REASON_LABEL[r.reason] || r.reason || "Other" }),
        r.category ? el("span", { class: "rp-badge rp-badge-cat", text: r.category }) : null,
        el("span", { class: "rp-status rp-status-" + status, text: status }),
        el("span", { class: "rp-when", text: when(r.createdAt) })
      ]));

      card.appendChild(el("div", { class: "rp-item-q", text: r.questionText || r.questionId }));

      if (r.selectedText) {
        card.appendChild(el("blockquote", { class: "rp-quote" }, [
          el("span", { class: "rp-quote-region", text: (r.region || "text") + " · reported text" }),
          el("span", { text: r.selectedText })
        ]));
      }
      if (r.comment) card.appendChild(el("div", { class: "rp-item-comment", text: r.comment }));

      // Who filed it only matters to a moderator — the reader knows it was them.
      if (isAdmin()) {
        card.appendChild(el("div", { class: "rp-item-by", text: r.reporterEmail || r.reportedBy || "unknown" }));
      } else if (status === "resolved") {
        card.appendChild(el("div", { class: "rp-item-note", text: "Fixed — thanks for the report." }));
      }

      const actions = [el("button", {
        class: "rp-btn rp-sm", type: "button", text: "Go to question",
        onclick: function () { close(); location.hash = "#q=" + r.questionId; }
      })];
      if (isAdmin()) {
        actions.push(el("button", {
          class: "rp-btn rp-sm", type: "button",
          text: status === "open" ? "Mark resolved" : "Reopen",
          onclick: function (e) { setStatus(r, status === "open" ? "resolved" : "open", e.currentTarget); }
        }));
        actions.push(el("button", {
          class: "rp-btn rp-sm rp-danger", type: "button", text: "Delete",
          onclick: function (e) { del(r, e.currentTarget); }
        }));
      }
      card.appendChild(el("div", { class: "rp-item-actions" }, actions));
      return card;
    }

    async function setStatus(r, status, btn) {
      btn.disabled = true;
      try {
        await IQB.shared.update(COLLECTION, r.id, { status: status, resolvedAt: IQB.shared.now() });
        r.status = status;
        render();
      } catch (e) {
        console.warn("[reports] status update failed:", e);
        btn.disabled = false;
        toast("Couldn't update the report");
      }
    }

    async function del(r, btn) {
      const ok = await IQB.ui.confirm({
        title: "Delete this report?",
        message: "It will be removed permanently. This cannot be undone.",
        confirmLabel: "Delete report",
        danger: true
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        await IQB.shared.remove(COLLECTION, r.id);
        reports = reports.filter(function (x) { return x.id !== r.id; });
        render();
        toast("Report deleted");
      } catch (e) {
        console.warn("[reports] delete failed:", e);
        btn.disabled = false;
        toast("Couldn't delete the report");
      }
    }

    /* createdAt is a Firestore Timestamp once the server has written it, but a
       just-submitted doc read back from the local cache still has null there. */
    function ms(ts) {
      if (!ts) return Date.now();
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    }
    function when(ts) {
      if (!ts) return "just now";
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    }

    return { open: open, close: close };
  })();

  /* keep the dialog's Submit in step with a sign-in that happened inside it */
  if (window.IQB.cloud) IQB.cloud.onChange(function () { Dialog.refreshAuth(); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { Dialog.close(); Panel.close(); }
  });

  /* ========================================================
     Public API (used by app.js + the account menu in sync.js)
     ======================================================== */
  IQB.reports = {
    /* The card's "Report Issue" action button. */
    build: function (card) {
      const b = el("button", {
        class: "qa-act rp-act", type: "button",
        onclick: function (e) { e.stopPropagation(); Dialog.open(ctxFromCard(card)); }
      });
      /* "Issue" sits in a .qa-act-word span so the narrow-screen rule drops it to
         just "Report", and the whole label is wrapped in .qa-act-label so it
         stays a single flex item — see the label convention in app.js.
         aria-label keeps the accessible name whole once the word is gone. */
      b.setAttribute("aria-label", "Report Issue");
      b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg><span class="qa-act-label">Report<span class="qa-act-word">&nbsp;Issue</span></span>';
      return b;
    },
    openAdmin: function () { Panel.open("admin"); },
    openMine: function () { Panel.open("mine"); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", SelectionMemory.init);
  else SelectionMemory.init();
})();

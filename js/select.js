/* ============================================================
   Custom dropdown for the mobile filter controls.

   Why this exists: a native <option> popup is drawn by the browser,
   not the page — no CSS reaches it. So the mobile Section / Topic /
   Level filters dropped out of the design system the moment they were
   opened, and they could never show the category marks from js/icons.js.

   The native <select> stays the model. app.js still builds its <option>s
   and reads/writes .value; choosing here writes back and dispatches
   `change`, so none of the filtering logic knows this exists. The select
   is display:none, which also takes it out of the a11y tree, leaving the
   combobox below as the single accessible control (a visible select plus
   a listbox would expose the same choice twice).

   Follows the ARIA "select-only combobox" pattern: the button IS the
   combobox, options get real focus rather than aria-activedescendant.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el } = IQB.utils;

  const CARET =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="6 9 12 15 18 9"/></svg>';

  const instances = [];
  let openOne = null;
  let uid = 0;

  function closeAll(except) {
    instances.forEach((i) => { if (i !== except) i.close(); });
  }

  function enhance(sel, opts) {
    if (!sel || sel.dataset.selEnhanced) return null;
    opts = opts || {};
    sel.dataset.selEnhanced = "1";

    const host = sel.parentNode;
    host.classList.add("sel-host");

    const panelId = "sel-panel-" + (++uid);
    const label = el("span", { class: "sel-label" });
    const btn = el("button", {
      type: "button", class: "sel-btn",
      "aria-haspopup": "listbox", "aria-expanded": "false", "aria-controls": panelId
    }, [label, el("span", { class: "sel-caret", html: CARET })]);

    // the <select> carried the only label these controls have ("Section",
    // "Topic", "Level") — it's display:none now, so move it onto the button
    const ariaLabel = sel.getAttribute("aria-label");
    if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);

    const panel = el("div", { class: "sel-panel", role: "listbox", id: panelId, hidden: "" });
    if (ariaLabel) panel.setAttribute("aria-label", ariaLabel);

    host.append(btn, panel);

    const api = { sync: sync, close: close, open: open, el: sel };

    /* ---- render ---- */
    function optionNodes() { return Array.from(panel.querySelectorAll(".sel-opt")); }

    function sync() {
      const current = sel.options[sel.selectedIndex];
      label.textContent = current ? current.textContent : "";

      // the mark for the CURRENT value sits in the button too, so the closed
      // control still reads as "Angular" and not just as text
      const existing = btn.querySelector(".cat-ic");
      if (existing) existing.remove();
      if (opts.icon && current) {
        const ic = opts.icon(current.value);
        if (ic) btn.insertBefore(ic, label);
      }

      panel.innerHTML = "";
      Array.from(sel.options).forEach((o) => {
        const selected = o.value === sel.value;
        const row = el("div", {
          class: "sel-opt" + (selected ? " is-selected" : ""),
          role: "option", tabindex: "-1",
          "aria-selected": String(selected),
          "data-value": o.value,
          onclick: () => choose(o.value)
        });
        // opts.icon returns null for groups, so "All Frontend" stays mark-free
        // exactly as it is in the sidebar — no duplicated notion of what a
        // category is living in here.
        if (opts.icon) { const ic = opts.icon(o.value); if (ic) row.appendChild(ic); }
        row.appendChild(el("span", { class: "sel-opt-label", text: o.textContent }));
        if (selected) row.appendChild(el("span", { class: "sel-opt-check", html: checkSvg() }));
        panel.appendChild(row);
      });
    }

    function checkSvg() {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polyline points="20 6 9 17 4 12"/></svg>';
    }

    function choose(value) {
      if (sel.value !== value) {
        sel.value = value;
        // app.js listens for `change` — this is the whole contract with it
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      sync();
      close();
      btn.focus();
    }

    /* ---- open / close ---- */
    function open() {
      if (!panel.hidden) return;
      closeAll(api);
      sync();
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      host.classList.add("is-open");
      openOne = api;
      const active = panel.querySelector(".sel-opt.is-selected") || panel.querySelector(".sel-opt");
      if (active) { active.focus(); active.scrollIntoView({ block: "nearest" }); }
    }

    function close() {
      if (panel.hidden) return;
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      host.classList.remove("is-open");
      if (openOne === api) openOne = null;
    }

    /* ---- interaction ---- */
    btn.addEventListener("click", (e) => { e.stopPropagation(); panel.hidden ? open() : close(); });
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault(); open();
      }
    });

    function move(from, delta) {
      const rows = optionNodes();
      if (!rows.length) return;
      const i = rows.indexOf(from);
      const next = rows[Math.min(rows.length - 1, Math.max(0, i + delta))];
      if (next) { next.focus(); next.scrollIntoView({ block: "nearest" }); }
    }

    panel.addEventListener("keydown", (e) => {
      const rows = optionNodes();
      const cur = document.activeElement.closest(".sel-opt");
      switch (e.key) {
        case "ArrowDown": e.preventDefault(); move(cur, 1); break;
        case "ArrowUp": e.preventDefault(); move(cur, -1); break;
        case "Home": e.preventDefault(); rows[0] && rows[0].focus(); break;
        case "End": e.preventDefault(); rows[rows.length - 1] && rows[rows.length - 1].focus(); break;
        case "Enter":
        case " ": e.preventDefault(); if (cur) choose(cur.dataset.value); break;
        case "Escape": e.preventDefault(); close(); btn.focus(); break;
        case "Tab": close(); break;
        default:
          // type-ahead, the one native behaviour worth keeping
          if (e.key.length === 1 && /\S/.test(e.key)) {
            const k = e.key.toLowerCase();
            const start = rows.indexOf(cur) + 1;
            const order = rows.slice(start).concat(rows.slice(0, start));
            const hit = order.find((r) => r.textContent.trim().toLowerCase().startsWith(k));
            if (hit) { hit.focus(); hit.scrollIntoView({ block: "nearest" }); }
          }
      }
    });

    // a click anywhere else, or a real scroll of the page, dismisses it
    document.addEventListener("click", (e) => { if (!host.contains(e.target)) close(); });

    sync();
    instances.push(api);
    return api;
  }

  /* app.js assigns select.value directly (which fires no event) whenever the
     category or level changes elsewhere — the tabs, the sidebar, a deep link.
     It calls this afterwards so the buttons re-read their selects. */
  function syncAll() { instances.forEach((i) => i.sync()); }

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openOne) openOne.close(); });

  IQB.select = { enhance: enhance, syncAll: syncAll };
})();

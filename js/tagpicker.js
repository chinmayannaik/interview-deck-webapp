/* ============================================================
   Tag picker — the chip + dropdown used to tag a note.

   Extracted from js/notebook-ui.js when the Quick Note window needed the same
   control. Two copies would have drifted the first time a tag rule changed in
   one of them, and the failure would be silent: notes tagged from one surface
   quietly not matching the other's filter.

   Single-select by design. A note carries at most one tag, because the group
   filter ANDs nothing — two tags on a note could never both be active, so the
   second would just be dead weight the reader had to maintain.

   `manage: true` adds inline rename and delete to each row. Those edit the
   vocabulary for the WHOLE app, so they belong in My Notes where the reader is
   already thinking about organisation — not in a capture window opened to jot
   one line. Quick Note passes `manage: false` and gets pick-or-create only.

   Emits the same `nb-tag*` class names it always did, so css/notebook.css
   styles every instance without change.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};
  const { el, toast } = IQB.utils;

  const ICON = {
    pencil: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>',
    bin: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
  };

  /* opts.host          — element the chip/button renders into (position:relative)
     opts.getTag        — () => string|null, the note's current tag
     opts.onPick        — (tag|null) => void, the reader chose or cleared one
     opts.manage        — show rename/delete rows (default false)
     opts.onVocabChange — () => void, the tag vocabulary itself was edited

     Returns { render, close, destroy }. destroy() matters: an open menu holds a
     document-level click listener. */
  function attach(opts) {
    opts = opts || {};
    const host = opts.host;
    const getTag = opts.getTag || function () { return null; };
    const onPick = opts.onPick || function () {};
    const manage = !!opts.manage;
    const onVocabChange = opts.onVocabChange || function () {};

    let menuEl = null;
    let renaming = null;

    const nb = function () { return window.IQB.notebook; };

    /* ---------- the chip / "+ Tag" button ----------
       Kept in its own box so repainting it cannot take the open dropdown (a
       sibling) down with it. */
    function render() {
      if (!host) return;
      let field = host.querySelector(".nb-tagfield");
      if (!field) {
        field = el("div", { class: "nb-tagfield" });
        host.insertBefore(field, host.firstChild);
      }
      field.innerHTML = "";

      const tag = getTag();
      if (tag) {
        const chip = el("span", { class: "nb-tagchip" }, [document.createTextNode(tag)]);
        chip.appendChild(el("button", {
          class: "nb-tagchip-x", type: "button", "aria-label": "Remove tag " + tag,
          onclick: function (e) { e.stopPropagation(); onPick(null); render(); }
        }, "×"));
        // Clicking the chip itself re-opens the picker, so swapping the tag is
        // one click rather than remove-then-add.
        chip.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
        field.appendChild(chip);
        return;
      }

      field.appendChild(el("button", {
        class: "nb-tagadd", type: "button", "aria-haspopup": "listbox",
        onclick: function (e) { e.stopPropagation(); toggle(); }
      }, "+ Tag"));
    }

    function close() {
      renaming = null;
      if (menuEl) { menuEl.remove(); menuEl = null; }
      document.removeEventListener("click", close);
    }

    function toggle() {
      if (menuEl) { close(); return; }

      menuEl = el("div", { class: "nb-tagmenu", role: "listbox" });
      const filter = el("input", {
        class: "nb-tagmenu-input", type: "text", placeholder: "Find or create a tag…",
        "aria-label": "Find or create a tag",
        oninput: function () { paintOptions(filter.value); },
        onkeydown: function (e) {
          e.stopPropagation();   // never let Escape/keys reach the host's shortcuts
          if (e.key === "Escape") { e.preventDefault(); close(); }
          if (e.key === "Enter") {
            e.preventDefault();
            const typed = filter.value.trim().toLowerCase();
            if (!typed) return;
            const first = menuEl.querySelector(".nb-tagopt");
            if (first && first.dataset.tag && first.dataset.tag === typed) pick(typed);
            else create(typed);
          }
        }
      });
      const list = el("div", { class: "nb-tagmenu-list" });
      menuEl.appendChild(filter);
      menuEl.appendChild(list);
      host.appendChild(menuEl);

      /* Single-select: picking a tag replaces whatever was there, picking the
         current one clears it. */
      function pick(tag) {
        onPick(getTag() === tag ? null : tag);
        render();
        close();
      }

      async function create(name) {
        const t = String(name).trim().toLowerCase();
        if (!t) return;
        await nb().addTag(t);
        onPick(t);
        render();
        onVocabChange();
        close();
        toast('Tag "' + t + '" created');
      }

      /* Renames the tag everywhere: the vocabulary and every note carrying it
         (IQB.notebook.renameTag does both). The open note's chip follows. */
      async function commitRename(from, to) {
        const target = String(to || "").trim().toLowerCase();
        renaming = null;
        if (!target || target === from) { paintOptions(filter.value); return; }
        const clash = nb().tags().some(function (t) { return t.tag === target; });
        if (clash) {
          const merge = await IQB.ui.confirm({
            title: "Merge tags?",
            message: '"' + target + '" already exists. Every note tagged "' + from +
                     '" will move onto it, and "' + from + '" will be gone.',
            confirmLabel: "Merge"
          });
          if (!merge) { paintOptions(filter.value); return; }
        }
        await nb().renameTag(from, target);
        if (getTag() === from) { onPick(target); render(); }
        onVocabChange();
        paintOptions(filter.value);
        toast(clash ? "Tags merged" : 'Renamed to "' + target + '"');
      }

      /* Deleting a tag detaches it from every note that carries it — the notes
         survive, they just become untagged. Say how many, because "8 notes" is
         the difference between a harmless tidy-up and a regret. */
      async function destroy(tag, count) {
        const msg = count
          ? "It will be removed from " + count + " note" + (count === 1 ? "" : "s") +
            ", but the notes themselves are kept."
          : "No notes are using it yet.";
        const ok = await IQB.ui.confirm({
          title: 'Delete the tag "' + tag + '"?',
          message: msg,
          confirmLabel: "Delete tag",
          danger: true
        });
        if (!ok) return;
        await nb().removeTag(tag);
        if (getTag() === tag) { onPick(null); render(); }
        onVocabChange();
        paintOptions(filter.value);
        toast("Tag deleted");
      }

      function paintOptions(q) {
        const query = String(q || "").trim().toLowerCase();
        const known = nb().tags();
        const shown = known.filter(function (t) { return !query || t.tag.indexOf(query) !== -1; });
        list.innerHTML = "";

        shown.forEach(function (t) {
          const on = getTag() === t.tag;

          // Inline rename: the name cell becomes an input in place, so the
          // reader can see the other tags while retyping this one.
          if (manage && renaming === t.tag) {
            const inp = el("input", {
              class: "nb-tagrename", type: "text", value: t.tag, "aria-label": "Rename tag",
              onkeydown: function (e) {
                e.stopPropagation();
                // `done` stops the blur that follows Enter/Escape from
                // committing a second time — the first already re-rendered.
                if (e.key === "Enter") { e.preventDefault(); inp.dataset.done = "1"; commitRename(t.tag, inp.value); }
                if (e.key === "Escape") {
                  e.preventDefault(); inp.dataset.done = "1";
                  renaming = null; paintOptions(filter.value);
                }
              },
              onblur: function () {
                if (inp.dataset.done === "1") return;
                commitRename(t.tag, inp.value);
              }
            });
            list.appendChild(el("div", { class: "nb-tagrow nb-tagrow-editing" }, [inp]));
            setTimeout(function () { inp.focus(); inp.select(); }, 0);
            return;
          }

          /* A row, not a single button: the pick target and the two actions are
             separate controls, and nesting buttons inside a button is invalid. */
          const pickBtn = el("button", {
            class: "nb-tagopt" + (on ? " on" : ""), type: "button", role: "option",
            "aria-selected": String(on), dataset: { tag: t.tag },
            onclick: function (e) { e.stopPropagation(); pick(t.tag); }
          }, [
            el("span", { class: "nb-tagopt-box" }),
            el("span", { class: "nb-tagopt-name", text: t.tag }),
            el("span", { class: "nb-tagopt-n", text: String(t.count) })
          ]);

          if (!manage) { list.appendChild(el("div", { class: "nb-tagrow" }, [pickBtn])); return; }

          const editBtn = el("button", {
            class: "nb-tagact", type: "button", title: "Rename tag",
            "aria-label": "Rename tag " + t.tag,
            onclick: function (e) { e.stopPropagation(); renaming = t.tag; paintOptions(filter.value); }
          });
          editBtn.innerHTML = ICON.pencil;

          const delBtn = el("button", {
            class: "nb-tagact nb-tagact-danger", type: "button", title: "Delete tag",
            "aria-label": "Delete tag " + t.tag,
            onclick: function (e) { e.stopPropagation(); destroy(t.tag, t.count); }
          });
          delBtn.innerHTML = ICON.bin;

          list.appendChild(el("div", { class: "nb-tagrow" }, [pickBtn, editBtn, delBtn]));
        });

        // Offer creation only when the typed text isn't already a tag.
        const exact = known.some(function (t) { return t.tag === query; });
        if (query && !exact) {
          list.appendChild(el("button", {
            class: "nb-tagopt nb-tagnew", type: "button",
            onclick: function (e) { e.stopPropagation(); create(query); }
          }, 'Create "' + query + '"'));
        }
        if (!shown.length && !query) {
          list.appendChild(el("div", { class: "nb-tagmenu-empty", text: "No tags yet — type to create one." }));
        }
      }

      paintOptions("");
      menuEl.addEventListener("click", function (e) { e.stopPropagation(); });
      // Any click outside dismisses; registered async so this very click doesn't.
      setTimeout(function () { document.addEventListener("click", close); }, 0);
      filter.focus();
    }

    render();

    return { render: render, close: close, destroy: close };
  }

  IQB.tagpicker = { attach: attach };
})();

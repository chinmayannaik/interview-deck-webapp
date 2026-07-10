/* Small DOM + helper utilities. Attaches to the global IQB namespace. */
(function () {
  window.IQB = window.IQB || {};

  const U = {
    qs: (sel, root = document) => root.querySelector(sel),
    qsa: (sel, root = document) => Array.from(root.querySelectorAll(sel)),

    /* create an element with props + children */
    el(tag, props = {}, children = []) {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(props)) {
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
      }
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
      return node;
    },

    debounce(fn, ms = 200) {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    },

    /* strip HTML tags → plain text (for search indexing) */
    strip(html) {
      const d = document.createElement("div");
      d.innerHTML = html || "";
      return (d.textContent || "").toLowerCase();
    },

    /* simple slugify */
    slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); },

    toast(msg) {
      let t = U.qs("#toast");
      if (!t) { t = U.el("div", { id: "toast", class: "toast" }); document.body.appendChild(t); }
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(U._tt);
      U._tt = setTimeout(() => t.classList.remove("show"), 1900);
    },

    download(filename, text) {
      const a = U.el("a", {
        href: "data:application/json;charset=utf-8," + encodeURIComponent(text),
        download: filename
      });
      document.body.appendChild(a); a.click(); a.remove();
    }
  };

  IQB.utils = U;
})();

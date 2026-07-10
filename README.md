# Interview Questions Bank

**Master Angular, JavaScript, TypeScript and Frontend interviews.**

A fast, free, offline-ready single-page study app for technical interview prep. Search hundreds of questions and answers across Angular, JavaScript, TypeScript, RxJS, NgRx, HTML, CSS, Java, Spring Boot, SQL, Git and general web/CS topics — with a self-quiz *practice mode*, bookmarks and progress tracking that persist on your device.

Built with **plain HTML, CSS and vanilla JavaScript** — no framework, no build step, no dependencies. It runs by opening `index.html` and deploys to Netlify by dragging the folder in.

---

## ✨ Features

- 🔎 **Instant search** across question titles, answers, tags and categories
- 🗂️ **12 categories** with sticky tabs + desktop sidebar
- 🎚️ **Difficulty filter** — beginner / intermediate / advanced
- 🌙 **Dark mode** — follows your OS, with a manual toggle (remembered)
- ⭐ **Bookmarks** — save questions and filter to just those
- 📈 **Progress tracking** — mark questions done; a progress bar tracks completion
- 🎯 **Practice mode** — answers hidden until you reveal them (active recall)
- 🎲 **Random question** — quiz yourself from the current filter
- 📋 **Copy code** button on every code snippet
- 🔗 **Deep linking** — `#angular` opens a category, `#q=<id>` opens a question
- ⌨️ **Keyboard shortcuts** — `/` or `Ctrl/⌘+K` focus search, `Esc` clear, `R` random
- 📤 **Export / Import** bookmarks + progress as JSON
- 🖨️ **Print-friendly** view
- 📱 **PWA-ready** — installable, works offline (manifest + service worker)
- ♿ **Accessible** — semantic HTML, ARIA, keyboard support, visible focus
- 🔍 **SEO** — title, description, Open Graph, Twitter Card, canonical

Everything is stored in **LocalStorage** — no account, no server, nothing leaves your device.

---

## 📁 Folder structure

```
Interview-Questions-Bank/
├── index.html
├── manifest.json          # PWA manifest
├── sw.js                  # service worker (offline caching)
├── README.md
│
├── assets/
│   └── favicon/
│       ├── favicon.svg    # browser tab icon
│       └── icon.svg       # app / share icon
│
├── css/
│   ├── variables.css      # design tokens (light theme)
│   ├── reset.css          # modern CSS reset
│   ├── styles.css         # layout, header, hero, tabs, sidebar, cards, search, responsive, print
│   └── dark-theme.css     # dark theme (OS preference + manual toggle)
│
├── js/
│   ├── utils.js           # DOM + helper utilities
│   ├── storage.js         # LocalStorage wrapper (bookmarks, progress, notes, theme)
│   └── app.js             # application controller (render + all features)
│
└── data/                  # one file per category — this is what you edit to add questions
    ├── angular.js
    ├── javascript.js
    ├── typescript.js
    ├── html.js
    ├── css.js
    ├── rxjs.js
    ├── ngrx.js
    ├── java.js
    ├── springboot.js
    ├── sql.js
    ├── git.js
    └── general.js
```

> **Note on module style:** each `data/*.js` file registers its questions into a shared global
> object (`window.IQB.data.<category>`) and is loaded with a plain `<script>` tag. This is a
> deliberate choice: native ES-module `import` is blocked by browsers over the `file://` protocol,
> so a pure-module app shows a blank page when you double-click `index.html`. The registry pattern
> works **both** by opening the file directly **and** when served on Netlify — with zero build step.
> The JS logic is currently consolidated into `utils.js` / `storage.js` / `app.js`; it can be split
> into finer modules (`search.js`, `tabs.js`, `theme.js`, …) later without changing the data files.

---

## ➕ How to add questions

Open the relevant file in `data/` and add an object to its array. That's it — refresh the page.

```js
// data/angular.js
IQB.data.angular = [
  // ...existing questions...
  {
    id: "ng-my-new-question",          // unique, kebab-case (used for deep links)
    category: "angular",               // must match the file's category
    difficulty: "intermediate",        // "beginner" | "intermediate" | "advanced"
    tags: ["change-detection", "perf"],// shown as #tags, also searchable
    question: "Your question text? (HTML allowed for <code>inline code</code>)",
    answer: "<p>The answer. HTML allowed: <strong>bold</strong>, <ul><li>lists</li></ul>, " +
            "<code class=\"inline\">code</code>.</p>",
    tip: "A short one-line interview tip (plain text).",   // optional
    code: "const x = signal(0);",                          // optional code block
    lang: "ts"                                             // optional label
  }
];
```

### Adding a whole new category
1. Create `data/mytopic.js` following the same pattern (`IQB.data.mytopic = [...]`).
2. Add a `<script src="data/mytopic.js"></script>` line in `index.html` (with the other data files).
3. Add `{ key: "mytopic", label: "My Topic" }` to the `CATEGORIES` array in `js/app.js`.
4. Add a colour token `--cat-mytopic` in `css/variables.css` **and** `css/dark-theme.css`.
5. (Optional) add `data/mytopic.js` to the `CORE` list in `sw.js` so it's cached offline.

---

## 🚀 Deployment

### Netlify (drag & drop)
1. Go to <https://app.netlify.com/drop>.
2. Drag the whole **`Interview-Questions-Bank`** folder onto the page.
3. Done — you get a live URL. No build command, no settings needed.

To update later, drag the folder again (or connect the folder to a Git repo for auto-deploys).

### GitHub Pages
1. Push the folder to a GitHub repository.
2. Repo **Settings → Pages → Source: Deploy from a branch**, pick `main` / root.
3. Your site publishes at `https://<user>.github.io/<repo>/`.

---

## 💻 Local development

Because the service worker and a few browser features need HTTP, the best local experience is a tiny static server:

```bash
# Python 3
python -m http.server 5173
# then open http://localhost:5173
```

Or use the **VS Code “Live Server”** extension (right-click `index.html` → *Open with Live Server*).

Opening `index.html` directly (double-click, `file://`) also works for browsing questions — only the installable PWA / offline service worker needs to be served over HTTP.

---

## 🌐 Browser support

Works in all current evergreen browsers: **Chrome, Edge, Firefox, Safari** (desktop & mobile). Uses standard features — CSS custom properties, `IntersectionObserver`, `localStorage`, and the Clipboard API (with a fallback). The PWA/offline layer requires a browser with service-worker support served over HTTPS.

---

## 📄 License

Free to use and adapt for personal interview preparation.

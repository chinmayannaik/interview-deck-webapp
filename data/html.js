/* HTML question bank. */
(function () {
  window.IQB = window.IQB || {};
  IQB.data = IQB.data || {};

  IQB.data.html = [
    {
      id: "html-semantic",
      category: "html",
      difficulty: "beginner",
      tags: ["semantics", "accessibility", "seo"],
      question: "What is semantic HTML and why does it matter?",
      answer:
        "<p>Using elements that describe their meaning — <code class=\"inline\">&lt;header&gt;</code>, <code class=\"inline\">&lt;nav&gt;</code>, <code class=\"inline\">&lt;main&gt;</code>, <code class=\"inline\">&lt;article&gt;</code>, <code class=\"inline\">&lt;footer&gt;</code> — instead of generic <code class=\"inline\">&lt;div&gt;</code>s.</p>" +
        "<p>Benefits: better <strong>accessibility</strong> (screen readers understand structure), improved <strong>SEO</strong>, and more maintainable markup.</p>",
      tip: "Reach for a div only when no semantic element fits.",
      code: "",
      lang: ""
    },
    {
      id: "html-doctype",
      category: "html",
      difficulty: "beginner",
      tags: ["doctype", "basics"],
      question: "What does <!DOCTYPE html> do?",
      answer:
        "<p>It tells the browser to render in <strong>standards mode</strong> rather than legacy 'quirks mode'. Without it, older browsers emulate 1990s bugs and box models, breaking layouts.</p>",
      tip: "It's a mode switch, not an HTML tag or a version declaration.",
      code: "",
      lang: ""
    },
    {
      id: "html-block-inline",
      category: "html",
      difficulty: "beginner",
      tags: ["display", "block", "inline"],
      question: "Block vs inline vs inline-block elements.",
      answer:
        "<ul>" +
        "<li><strong>Block</strong> — starts on a new line, takes full width (<code class=\"inline\">div</code>, <code class=\"inline\">p</code>, <code class=\"inline\">section</code>).</li>" +
        "<li><strong>Inline</strong> — flows within text, ignores width/height (<code class=\"inline\">span</code>, <code class=\"inline\">a</code>).</li>" +
        "<li><strong>inline-block</strong> — flows inline but respects width/height/margins.</li>" +
        "</ul>",
      tip: "You can't set width/height on a pure inline element — switch to inline-block.",
      code: "",
      lang: ""
    },
    {
      id: "html-meta-viewport",
      category: "html",
      difficulty: "beginner",
      tags: ["meta", "responsive", "viewport"],
      question: "What does the viewport meta tag do?",
      answer:
        "<p>It controls how mobile browsers scale the page. Without it, phones render at desktop width and zoom out. <code class=\"inline\">width=device-width, initial-scale=1</code> makes the layout match the device's real width — essential for responsive design.</p>",
      tip: "Forget this tag and your media queries won't kick in on phones.",
      code: "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
      lang: "html"
    },
    {
      id: "html-data-attr",
      category: "html",
      difficulty: "beginner",
      tags: ["data-attributes", "dataset"],
      question: "What are data-* attributes?",
      answer:
        "<p>Custom attributes for storing app data on an element without polluting standard attributes. Read them in JS via the <code class=\"inline\">dataset</code> API.</p>",
      tip: "Great for event delegation — stash an id on the row and read e.target.dataset.id.",
      code: "<li data-id=\"42\">Item</li>\n// el.dataset.id → '42'",
      lang: "html"
    },
    {
      id: "html-local-session",
      category: "html",
      difficulty: "intermediate",
      tags: ["storage", "localstorage", "cookies"],
      question: "localStorage vs sessionStorage vs cookies.",
      answer:
        "<ul>" +
        "<li><strong>localStorage</strong> — ~5–10MB, persists until cleared, not sent to the server.</li>" +
        "<li><strong>sessionStorage</strong> — same API, cleared when the tab closes.</li>" +
        "<li><strong>cookies</strong> — small (~4KB), sent with every HTTP request; used for auth/session tokens.</li>" +
        "</ul>",
      tip: "Never store JWTs in localStorage if you can avoid it — httpOnly cookies resist XSS.",
      code: "localStorage.setItem('theme', 'dark');\nlocalStorage.getItem('theme');",
      lang: "js"
    },
    {
      id: "html-defer-async",
      category: "html",
      difficulty: "intermediate",
      tags: ["scripts", "defer", "async", "performance"],
      question: "script defer vs async.",
      answer:
        "<p>Both download the script without blocking HTML parsing.</p>" +
        "<ul>" +
        "<li><strong>async</strong> — runs as soon as it's downloaded, order not guaranteed. For independent scripts (analytics).</li>" +
        "<li><strong>defer</strong> — runs after parsing, in order. For app scripts that depend on the DOM or each other.</li>" +
        "</ul>",
      tip: "Use defer for your app bundle so it runs after the DOM is ready and in order.",
      code: "<script src=\"app.js\" defer></script>",
      lang: "html"
    },
    {
      id: "html-forms-validation",
      category: "html",
      difficulty: "beginner",
      tags: ["forms", "validation"],
      question: "What native form validation does HTML5 provide?",
      answer:
        "<p>Attributes like <code class=\"inline\">required</code>, <code class=\"inline\">type=\"email\"</code>, <code class=\"inline\">min</code>/<code class=\"inline\">max</code>, <code class=\"inline\">pattern</code>, and <code class=\"inline\">minlength</code> validate input before submit, with built-in error UI — no JS needed for basics.</p>",
      tip: "Always validate again on the server — client validation is a UX nicety, not security.",
      code: "<input type=\"email\" required pattern=\".+@company\\.com\">",
      lang: "html"
    },
    {
      id: "html-accessibility",
      category: "html",
      difficulty: "intermediate",
      tags: ["accessibility", "aria", "a11y"],
      question: "How do you make a page accessible?",
      answer:
        "<ul>" +
        "<li>Semantic elements + correct heading order.</li>" +
        "<li><code class=\"inline\">alt</code> text on images; labels tied to inputs.</li>" +
        "<li>Keyboard operability and visible focus states.</li>" +
        "<li>ARIA roles/attributes only when native elements can't express the semantics.</li>" +
        "<li>Sufficient colour contrast.</li>" +
        "</ul>",
      tip: "First rule of ARIA: don't use ARIA if a native element already does the job.",
      code: "",
      lang: ""
    },
    {
      id: "html-srcset",
      category: "html",
      difficulty: "intermediate",
      tags: ["images", "responsive", "performance"],
      question: "How do you serve responsive images?",
      answer:
        "<p>Use <code class=\"inline\">srcset</code> + <code class=\"inline\">sizes</code> so the browser picks the best resolution for the device, or <code class=\"inline\">&lt;picture&gt;</code> for art direction / modern formats (WebP/AVIF) with fallbacks. Add <code class=\"inline\">loading=\"lazy\"</code> for offscreen images.</p>",
      tip: "loading=\"lazy\" is a one-attribute performance win for image-heavy pages.",
      code: "<img src=\"s.jpg\" srcset=\"s.jpg 480w, l.jpg 1080w\" loading=\"lazy\" alt=\"...\">",
      lang: "html"
    },
    {
      id: "html-meta-seo",
      category: "html",
      difficulty: "intermediate",
      tags: ["seo", "meta", "open-graph"],
      question: "Which meta tags matter for SEO and sharing?",
      answer:
        "<p><code class=\"inline\">&lt;title&gt;</code> and <code class=\"inline\">&lt;meta name=\"description\"&gt;</code> for search results; <strong>Open Graph</strong> (<code class=\"inline\">og:title</code>, <code class=\"inline\">og:image</code>) and <strong>Twitter Card</strong> tags for rich link previews; <code class=\"inline\">canonical</code> to avoid duplicate-content penalties.</p>",
      tip: "og:image is what makes your link look good when shared on WhatsApp/LinkedIn.",
      code: "<meta property=\"og:title\" content=\"...\">\n<link rel=\"canonical\" href=\"https://site.com/page\">",
      lang: "html"
    },
    {
      id: "html-progressive",
      category: "html",
      difficulty: "advanced",
      tags: ["pwa", "manifest"],
      question: "What makes a site a PWA?",
      answer:
        "<p>Three ingredients: a <strong>web app manifest</strong> (name, icons, theme, display mode), a <strong>service worker</strong> (offline caching + install), and <strong>HTTPS</strong>. Together they let the site be installed to the home screen and work offline.</p>",
      tip: "A manifest + service worker + HTTPS is the minimum for the 'Install' prompt.",
      code: "<link rel=\"manifest\" href=\"manifest.json\">",
      lang: "html"
    },
    {
      id: "html-web-components",
      category: "html",
      difficulty: "advanced",
      tags: ["web-components", "custom-elements", "shadow-dom"],
      question: "What are Web Components?",
      answer:
        "<p>A set of browser standards for reusable, framework-agnostic UI: <strong>Custom Elements</strong> (define your own tags), <strong>Shadow DOM</strong> (encapsulated markup + styles), and <strong>HTML templates</strong> (<code class=\"inline\">&lt;template&gt;</code>/<code class=\"inline\">&lt;slot&gt;</code>). Angular can render as custom elements via Angular Elements.</p>",
      tip: "Shadow DOM gives true style encapsulation — the browser-native version of Angular's emulated encapsulation.",
      code: "class MyCard extends HTMLElement {\n  connectedCallback() { this.attachShadow({ mode: 'open' }).innerHTML = '<slot></slot>'; }\n}\ncustomElements.define('my-card', MyCard);",
      lang: "js"
    },
    {
      id: "html-input-types",
      category: "html",
      difficulty: "beginner",
      tags: ["forms", "inputs", "mobile"],
      question: "Why do input types matter (email, number, tel, date)?",
      answer:
        "<p>The right <code class=\"inline\">type</code> gives free validation, the correct <strong>mobile keyboard</strong> (numeric/email layout), native pickers (date/color), and better accessibility — improving UX with zero JS.</p>",
      tip: "type=\"email\" and type=\"tel\" change the phone keyboard — a quick mobile UX win.",
      code: "<input type=\"email\" inputmode=\"email\">\n<input type=\"number\" inputmode=\"numeric\">",
      lang: "html"
    },
    {
      id: "html-dialog",
      category: "html",
      difficulty: "intermediate",
      tags: ["dialog", "modal", "accessibility"],
      question: "What does the native <dialog> element give you?",
      answer:
        "<p>A built-in modal/popup with <code class=\"inline\">showModal()</code>/<code class=\"inline\">close()</code>, automatic focus trapping, backdrop (<code class=\"inline\">::backdrop</code>), and <code class=\"inline\">Esc</code>-to-close — accessibility that used to require a library.</p>",
      tip: "Use <dialog> before reaching for a modal library — it's accessible by default.",
      code: "<dialog id=\"m\"><form method=\"dialog\"><button>OK</button></form></dialog>\n<script>m.showModal();</script>",
      lang: "html"
    },
    {
      id: "html-details",
      category: "html",
      difficulty: "beginner",
      tags: ["details", "summary", "disclosure"],
      question: "What are <details> and <summary>?",
      answer:
        "<p>A native, zero-JS disclosure widget: <code class=\"inline\">&lt;summary&gt;</code> is the always-visible label and the rest of <code class=\"inline\">&lt;details&gt;</code> expands/collapses on click — accessible and keyboard-friendly out of the box (this app's cards use the same idea).</p>",
      tip: "Perfect for FAQs and accordions without any JavaScript.",
      code: "<details><summary>Show answer</summary><p>Hidden content</p></details>",
      lang: "html"
    },
    {
      id: "html-rel-noopener",
      category: "html",
      difficulty: "intermediate",
      tags: ["security", "links", "target-blank"],
      question: "Why add rel=\"noopener\" to target=\"_blank\" links?",
      answer:
        "<p>Without it, the newly opened page can access <code class=\"inline\">window.opener</code> and hijack the original tab (tabnabbing). <code class=\"inline\">rel=\"noopener\"</code> severs that reference; <code class=\"inline\">noreferrer</code> also hides the referrer. Modern browsers imply noopener, but set it explicitly.</p>",
      tip: "Always pair target=\"_blank\" with rel=\"noopener\" for external links.",
      code: "<a href=\"https://ext.com\" target=\"_blank\" rel=\"noopener noreferrer\">Link</a>",
      lang: "html"
    },
    {
      id: "html-preload-prefetch",
      category: "html",
      difficulty: "advanced",
      tags: ["performance", "preload", "prefetch"],
      question: "preload vs prefetch vs preconnect.",
      answer:
        "<ul>" +
        "<li><strong>preload</strong> — fetch a critical resource for the current page early (fonts, hero image).</li>" +
        "<li><strong>prefetch</strong> — low-priority fetch of a resource likely needed on the next navigation.</li>" +
        "<li><strong>preconnect</strong> — warm up the connection (DNS/TLS) to a third-party origin.</li>" +
        "</ul>",
      tip: "preload for 'need it now', prefetch for 'probably need it next'.",
      code: "<link rel=\"preload\" href=\"font.woff2\" as=\"font\" crossorigin>",
      lang: "html"
    },
    {
      id: "html-canvas-svg",
      category: "html",
      difficulty: "intermediate",
      tags: ["canvas", "svg", "graphics"],
      question: "Canvas vs SVG — when to use which?",
      answer:
        "<p><strong>SVG</strong> is vector, DOM-based, scalable, and stylable/accessible — good for icons, charts, and anything interactive or resolution-independent. <strong>Canvas</strong> is an immediate-mode pixel bitmap — better for lots of objects, games, and heavy pixel manipulation.</p>",
      tip: "Few interactive shapes → SVG; thousands of pixels/particles → Canvas.",
      code: "",
      lang: ""
    },
    {
      id: "html-tabindex",
      category: "html",
      difficulty: "intermediate",
      tags: ["accessibility", "focus", "keyboard"],
      question: "What does tabindex do?",
      answer:
        "<ul>" +
        "<li><code class=\"inline\">tabindex=\"0\"</code> — makes a non-focusable element focusable in normal order.</li>" +
        "<li><code class=\"inline\">tabindex=\"-1\"</code> — focusable via script only (not Tab), for managing focus.</li>" +
        "<li><code class=\"inline\">tabindex=\"1+\"</code> — avoid; it breaks natural tab order.</li>" +
        "</ul>",
      tip: "Prefer native interactive elements (button/a) over div + tabindex.",
      code: "<div role=\"button\" tabindex=\"0\">Custom button</div>",
      lang: "html"
    },
    {
      id: "html-crp",
      category: "html",
      difficulty: "advanced",
      tags: ["performance", "rendering", "critical-path"],
      question: "What is the Critical Rendering Path?",
      answer:
        "<p>The steps the browser takes to turn HTML/CSS/JS into pixels: build the <strong>DOM</strong> and <strong>CSSOM</strong>, combine into the render tree, then layout and paint. CSS is render-blocking and synchronous JS is parser-blocking — optimise by inlining critical CSS, deferring JS, and minimising above-the-fold work.</p>",
      tip: "Render-blocking CSS + parser-blocking JS are the two levers for faster first paint.",
      code: "",
      lang: ""
    },
    {
      id: "html-aria-live",
      category: "html",
      difficulty: "advanced",
      tags: ["accessibility", "aria", "screen-reader"],
      question: "What is an ARIA live region?",
      answer:
        "<p>An element with <code class=\"inline\">aria-live</code> that tells screen readers to announce dynamic content changes (toasts, validation errors, search-result counts) without moving focus. <code class=\"inline\">polite</code> waits for a pause; <code class=\"inline\">assertive</code> interrupts.</p>",
      tip: "Wrap a search-results count in aria-live=\"polite\" so it's announced as it updates.",
      code: "<div aria-live=\"polite\">12 results found</div>",
      lang: "html"
    }
  ];
})();

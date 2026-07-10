/* CSS question bank. */
(function () {
  window.IQB = window.IQB || {};
  IQB.data = IQB.data || {};

  IQB.data.css = [
    {
      id: "css-box-model",
      category: "css",
      difficulty: "beginner",
      tags: ["box-model", "layout"],
      question: "Explain the box model and box-sizing.",
      answer:
        "<p>Every element is a box: <strong>content → padding → border → margin</strong>. By default (<code class=\"inline\">content-box</code>) width applies to content only, so padding/border add to the total size.</p>" +
        "<p><code class=\"inline\">box-sizing: border-box</code> makes width include padding and border — far more predictable, which is why most resets set it globally.</p>",
      tip: "* { box-sizing: border-box } is the first line of almost every CSS reset.",
      code: "* { box-sizing: border-box; }",
      lang: "css"
    },
    {
      id: "css-flex-grid",
      category: "css",
      difficulty: "intermediate",
      tags: ["flexbox", "grid", "layout"],
      question: "Flexbox vs Grid — when to use which?",
      answer:
        "<p><strong>Flexbox</strong> is one-dimensional (a row or a column) — great for toolbars, nav bars, aligning items along one axis.</p>" +
        "<p><strong>Grid</strong> is two-dimensional (rows and columns together) — great for page layouts and card galleries.</p>",
      tip: "Flex for components in a line; Grid for the overall page structure.",
      code: ".cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }",
      lang: "css"
    },
    {
      id: "css-specificity",
      category: "css",
      difficulty: "intermediate",
      tags: ["specificity", "cascade"],
      question: "How does specificity work?",
      answer:
        "<p>The cascade picks the winning rule by specificity: <strong>inline styles &gt; IDs &gt; classes/attributes/pseudo-classes &gt; elements</strong>. Ties go to the later rule. <code class=\"inline\">!important</code> overrides all of it (avoid it).</p>",
      tip: "If a style won't apply, you're usually losing a specificity battle — inspect the computed styles.",
      code: "/* 0,1,1,0 vs 0,0,2,0 → the ID selector wins */",
      lang: "css"
    },
    {
      id: "css-position",
      category: "css",
      difficulty: "intermediate",
      tags: ["position"],
      question: "Explain position: relative / absolute / fixed / sticky.",
      answer:
        "<ul>" +
        "<li><strong>relative</strong> — offset from its normal spot; establishes a positioning context.</li>" +
        "<li><strong>absolute</strong> — removed from flow, positioned to the nearest positioned ancestor.</li>" +
        "<li><strong>fixed</strong> — positioned to the viewport, stays on scroll.</li>" +
        "<li><strong>sticky</strong> — relative until it hits a threshold, then sticks.</li>" +
        "</ul>",
      tip: "sticky needs a top/left value and a scrollable parent to work.",
      code: ".header { position: sticky; top: 0; }",
      lang: "css"
    },
    {
      id: "css-units",
      category: "css",
      difficulty: "beginner",
      tags: ["units", "responsive"],
      question: "px vs em vs rem vs %, vh/vw.",
      answer:
        "<ul>" +
        "<li><strong>px</strong> — absolute pixels.</li>" +
        "<li><strong>em</strong> — relative to the parent's font size (compounds).</li>" +
        "<li><strong>rem</strong> — relative to the root font size (predictable — use for spacing/typography).</li>" +
        "<li><strong>%</strong> — relative to the parent's size.</li>" +
        "<li><strong>vh/vw</strong> — 1% of viewport height/width.</li>" +
        "</ul>",
      tip: "Default to rem for scalable, accessible sizing.",
      code: "",
      lang: ""
    },
    {
      id: "css-center",
      category: "css",
      difficulty: "beginner",
      tags: ["centering", "flexbox"],
      question: "How do you center an element?",
      answer:
        "<p>Modern answer: flexbox or grid.</p>" +
        "<ul>" +
        "<li>Flex: <code class=\"inline\">display:flex; justify-content:center; align-items:center;</code></li>" +
        "<li>Grid: <code class=\"inline\">display:grid; place-items:center;</code></li>" +
        "<li>Absolute: <code class=\"inline\">top:50%; left:50%; transform:translate(-50%,-50%);</code></li>" +
        "</ul>",
      tip: "place-items: center is the shortest way to center in both axes.",
      code: ".box { display: grid; place-items: center; }",
      lang: "css"
    },
    {
      id: "css-pseudo",
      category: "css",
      difficulty: "beginner",
      tags: ["pseudo-class", "pseudo-element"],
      question: "Pseudo-class vs pseudo-element.",
      answer:
        "<p><strong>Pseudo-class</strong> (<code class=\"inline\">:hover</code>, <code class=\"inline\">:focus</code>, <code class=\"inline\">:nth-child</code>) targets a state of an element.</p>" +
        "<p><strong>Pseudo-element</strong> (<code class=\"inline\">::before</code>, <code class=\"inline\">::after</code>, <code class=\"inline\">::placeholder</code>) targets a generated/sub part of an element.</p>",
      tip: "One colon for pseudo-classes, two for pseudo-elements.",
      code: ".badge::after { content: '✓'; }",
      lang: "css"
    },
    {
      id: "css-variables",
      category: "css",
      difficulty: "intermediate",
      tags: ["custom-properties", "variables", "theming"],
      question: "What are CSS custom properties (variables)?",
      answer:
        "<p>Runtime variables defined with <code class=\"inline\">--name</code> and read with <code class=\"inline\">var(--name)</code>. They cascade and inherit, can be changed with JS, and are the standard way to implement theming (light/dark) without a preprocessor.</p>",
      tip: "Redefine the same variables under a [data-theme=\"dark\"] selector to switch themes instantly.",
      code: ":root { --accent: #c21836; }\n.btn { color: var(--accent); }",
      lang: "css"
    },
    {
      id: "css-responsive",
      category: "css",
      difficulty: "intermediate",
      tags: ["responsive", "media-queries"],
      question: "How do you build a responsive layout?",
      answer:
        "<p>Use fluid units (%, rem, fr), flexible layouts (flex/grid with <code class=\"inline\">minmax</code>/<code class=\"inline\">auto-fill</code>), the viewport meta tag, and <strong>media queries</strong> for breakpoints. Prefer a mobile-first approach: base styles for small screens, then <code class=\"inline\">min-width</code> queries to enhance.</p>",
      tip: "Modern grids with auto-fill + minmax often remove the need for media queries entirely.",
      code: "@media (min-width: 768px) { .sidebar { display: block; } }",
      lang: "css"
    },
    {
      id: "css-selectors",
      category: "css",
      difficulty: "intermediate",
      tags: ["selectors", "combinators"],
      question: "Explain the combinators: space, >, +, ~.",
      answer:
        "<ul>" +
        "<li><code class=\"inline\">A B</code> — descendant (any level).</li>" +
        "<li><code class=\"inline\">A &gt; B</code> — direct child.</li>" +
        "<li><code class=\"inline\">A + B</code> — immediate next sibling.</li>" +
        "<li><code class=\"inline\">A ~ B</code> — any following sibling.</li>" +
        "</ul>",
      tip: "Prefer > (direct child) to keep styles scoped and avoid leaking into nested components.",
      code: "",
      lang: ""
    },
    {
      id: "css-zindex",
      category: "css",
      difficulty: "advanced",
      tags: ["z-index", "stacking-context"],
      question: "Why doesn't my z-index work? (stacking context)",
      answer:
        "<p><code class=\"inline\">z-index</code> only compares elements within the <strong>same stacking context</strong>. Properties like <code class=\"inline\">transform</code>, <code class=\"inline\">opacity &lt; 1</code>, <code class=\"inline\">filter</code>, and <code class=\"inline\">position + z-index</code> create new contexts, trapping children's z-index inside them.</p>",
      tip: "A parent's transform can make a huge child z-index useless — check ancestors first.",
      code: "",
      lang: ""
    },
    {
      id: "css-transitions",
      category: "css",
      difficulty: "beginner",
      tags: ["animation", "transition", "performance"],
      question: "Which properties are cheap to animate?",
      answer:
        "<p>Animate <strong>transform</strong> and <strong>opacity</strong> — the browser can offload them to the GPU (the compositor) without reflow/repaint. Avoid animating <code class=\"inline\">width</code>, <code class=\"inline\">height</code>, <code class=\"inline\">top</code>, or <code class=\"inline\">left</code>, which trigger layout on every frame.</p>",
      tip: "'transform + opacity only' is the golden rule for smooth 60fps animation.",
      code: ".card { transition: transform .2s ease; }\n.card:hover { transform: translateY(-3px); }",
      lang: "css"
    },
    {
      id: "css-bem",
      category: "css",
      difficulty: "intermediate",
      tags: ["methodology", "bem", "architecture"],
      question: "What is BEM and why use a naming convention?",
      answer:
        "<p><strong>BEM</strong> (Block__Element--Modifier) is a class-naming convention that keeps CSS flat, predictable, and low-specificity, avoiding deep selector chains and accidental overrides — helpful on large teams.</p>",
      tip: "BEM keeps specificity flat so styles are easy to override intentionally.",
      code: ".card {} .card__title {} .card--featured {}",
      lang: "css"
    },
    {
      id: "css-flex-props",
      category: "css",
      difficulty: "intermediate",
      tags: ["flexbox", "flex-grow", "flex-basis"],
      question: "Explain flex-grow, flex-shrink, and flex-basis.",
      answer:
        "<p>The <code class=\"inline\">flex</code> shorthand controls how items share space:</p>" +
        "<ul>" +
        "<li><strong>flex-grow</strong> — how much an item grows to fill free space.</li>" +
        "<li><strong>flex-shrink</strong> — how much it shrinks when space is tight.</li>" +
        "<li><strong>flex-basis</strong> — the starting size before grow/shrink.</li>" +
        "</ul>" +
        "<p><code class=\"inline\">flex: 1</code> = <code class=\"inline\">1 1 0</code> (grow equally from zero).</p>",
      tip: "flex: 1 on children makes them share the row equally — the most-used flex value.",
      code: ".col { flex: 1 1 200px; } /* grow, shrink, basis */",
      lang: "css"
    },
    {
      id: "css-grid-areas",
      category: "css",
      difficulty: "intermediate",
      tags: ["grid", "template-areas", "layout"],
      question: "How do grid-template-areas work?",
      answer:
        "<p>Name regions of a grid with an ASCII-art map, then place children by area name. It makes complex page layouts readable and easy to rearrange responsively (just redefine the areas in a media query).</p>",
      tip: "Template areas make responsive layout re-flows a one-property change.",
      code: ".layout {\n  display: grid;\n  grid-template-areas: 'head head' 'side main';\n}\n.header { grid-area: head; }\n.sidebar { grid-area: side; }",
      lang: "css"
    },
    {
      id: "css-clamp",
      category: "css",
      difficulty: "intermediate",
      tags: ["responsive", "clamp", "fluid-typography"],
      question: "What does clamp() do (fluid typography)?",
      answer:
        "<p><code class=\"inline\">clamp(MIN, PREFERRED, MAX)</code> returns the preferred value bounded by a min and max — perfect for fluid type/spacing that scales with the viewport but never gets too small or too large, often removing media queries.</p>",
      tip: "clamp with a vw-based middle value gives smooth responsive headings.",
      code: "h1 { font-size: clamp(1.5rem, 4vw, 3rem); }",
      lang: "css"
    },
    {
      id: "css-aspect-ratio",
      category: "css",
      difficulty: "beginner",
      tags: ["aspect-ratio", "responsive"],
      question: "How do you keep an element's aspect ratio?",
      answer:
        "<p>The <code class=\"inline\">aspect-ratio</code> property reserves space in a fixed ratio (e.g. 16/9) so the box sizes correctly and avoids layout shift — replacing the old padding-top hack. Great for video/image placeholders.</p>",
      tip: "aspect-ratio prevents cumulative layout shift (CLS) for media before it loads.",
      code: ".video { aspect-ratio: 16 / 9; width: 100%; }",
      lang: "css"
    },
    {
      id: "css-object-fit",
      category: "css",
      difficulty: "beginner",
      tags: ["images", "object-fit"],
      question: "What does object-fit do?",
      answer:
        "<p>Controls how a replaced element (img/video) fills its box: <code class=\"inline\">cover</code> (fill, crop), <code class=\"inline\">contain</code> (fit, letterbox), <code class=\"inline\">fill</code> (stretch). Pair with <code class=\"inline\">object-position</code> to control the crop focus.</p>",
      tip: "object-fit: cover is the CSS way to crop images to a fixed box without distortion.",
      code: ".avatar { width: 64px; height: 64px; object-fit: cover; }",
      lang: "css"
    },
    {
      id: "css-container-queries",
      category: "css",
      difficulty: "advanced",
      tags: ["container-queries", "responsive", "components"],
      question: "What are container queries and how do they differ from media queries?",
      answer:
        "<p>Container queries style an element based on the size of its <strong>container</strong>, not the viewport — so a component can adapt wherever it's placed (sidebar vs main). Truly reusable, context-aware components.</p>",
      tip: "Container queries make a card component responsive regardless of where it's dropped.",
      code: ".wrap { container-type: inline-size; }\n@container (min-width: 400px) { .card { display: flex; } }",
      lang: "css"
    },
    {
      id: "css-has",
      category: "css",
      difficulty: "advanced",
      tags: ["selectors", "has", "parent-selector"],
      question: "What is the :has() selector?",
      answer:
        "<p>The long-awaited <strong>parent selector</strong>: style an element based on its descendants or following siblings. E.g. style a card that contains an image, or a label whose input is invalid — logic that previously required JavaScript.</p>",
      tip: ":has() finally lets you style a parent based on its children — no JS needed.",
      code: ".card:has(img) { padding: 0; }\nlabel:has(input:invalid) { color: red; }",
      lang: "css"
    },
    {
      id: "css-cascade-layers",
      category: "css",
      difficulty: "advanced",
      tags: ["cascade", "layers", "specificity"],
      question: "What are cascade layers (@layer)?",
      answer:
        "<p><code class=\"inline\">@layer</code> lets you group styles into ordered layers (e.g. reset, base, components, utilities). Layer order wins over specificity, so you can manage the cascade predictably and stop fighting <code class=\"inline\">!important</code> in large codebases.</p>",
      tip: "Layers let a low-specificity utility beat a high-specificity component rule intentionally.",
      code: "@layer reset, base, components;\n@layer components { .btn { color: red; } }",
      lang: "css"
    },
    {
      id: "css-logical-properties",
      category: "css",
      difficulty: "intermediate",
      tags: ["logical-properties", "i18n", "rtl"],
      question: "What are logical properties (margin-inline, inset)?",
      answer:
        "<p>Direction-aware properties that adapt to writing mode/text direction: <code class=\"inline\">margin-inline</code>/<code class=\"inline\">block</code>, <code class=\"inline\">padding-inline</code>, <code class=\"inline\">inset</code>. They make layouts work automatically in RTL languages without separate stylesheets.</p>",
      tip: "Use margin-inline instead of margin-left/right for RTL-ready layouts.",
      code: ".box { margin-inline: auto; padding-block: 1rem; }",
      lang: "css"
    },
    {
      id: "css-will-change",
      category: "css",
      difficulty: "advanced",
      tags: ["performance", "gpu", "compositing"],
      question: "What does will-change do, and when should you avoid it?",
      answer:
        "<p><code class=\"inline\">will-change</code> hints the browser to promote an element to its own GPU layer ahead of an animation, reducing jank. But overusing it wastes memory and can hurt performance — apply it sparingly, ideally just before animating, and remove it after.</p>",
      tip: "Don't slap will-change on everything — it's a targeted hint, not a global optimisation.",
      code: ".modal { will-change: transform, opacity; }",
      lang: "css"
    }
  ];
})();

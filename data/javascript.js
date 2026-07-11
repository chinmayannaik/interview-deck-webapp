/* JavaScript question bank. */
(function () {
  window.IQB = window.IQB || {};
  IQB.data = IQB.data || {};

  IQB.data.javascript = [
    {
      id: "js-closure",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["closure", "scope"],
      question: "What is a closure? Give a real use.",
      answer:
        "<p>A <strong>closure</strong> is a function that keeps access to variables from its outer (lexical) scope even after the outer function has returned. The inner function \"remembers\" the environment it was created in.</p>" +
        "<p>Uses: <strong>data privacy</strong> (private variables), function factories, and holding state in callbacks — e.g. a <code class=\"inline\">debounce</code> keeps its timer id in a closure.</p>",
      tip: "Closures are the answer to 'how do you make a private variable in JavaScript'.",
      code: "function counter() { let n = 0; return () => ++n; }\nconst next = counter();\nnext(); // 1  → n survives but stays private",
      lang: "js"
    },
    {
      id: "js-var-let-const",
      category: "javascript",
      difficulty: "beginner",
      tags: ["scope", "hoisting", "variables"],
      question: "var vs let vs const, and what is hoisting?",
      answer:
        "<ul>" +
        "<li><strong>var</strong> — function-scoped, hoisted and initialised to <code class=\"inline\">undefined</code>, re-declarable.</li>" +
        "<li><strong>let</strong> — block-scoped, hoisted but in the <strong>Temporal Dead Zone</strong> (error if used before declaration).</li>" +
        "<li><strong>const</strong> — block-scoped, assigned once. The <em>binding</em> is constant, not the object — you can still mutate a <code class=\"inline\">const</code> array/object.</li>" +
        "</ul>" +
        "<p><strong>Hoisting</strong>: declarations are moved to the top of their scope at compile time. <code class=\"inline\">var</code> and function declarations are usable early; <code class=\"inline\">let/const</code> are not.</p>",
      tip: "Default to const, use let when you must reassign, avoid var.",
      code: "",
      lang: ""
    },
    {
      id: "js-event-loop",
      category: "javascript",
      difficulty: "advanced",
      tags: ["event-loop", "async", "microtask"],
      question: "Explain the event loop, microtasks vs macrotasks.",
      answer:
        "<p>JS is single-threaded. The <strong>call stack</strong> runs synchronous code. Async callbacks wait in queues and the <strong>event loop</strong> pushes them onto the stack when it's empty.</p>" +
        "<ul>" +
        "<li><strong>Microtask queue</strong> — Promise <code class=\"inline\">.then</code>, <code class=\"inline\">queueMicrotask</code>, <code class=\"inline\">await</code> continuations. Fully drained after each task.</li>" +
        "<li><strong>Macrotask queue</strong> — <code class=\"inline\">setTimeout</code>, <code class=\"inline\">setInterval</code>, I/O, UI events.</li>" +
        "</ul>" +
        "<p>Microtasks always run before the next macrotask.</p>",
      tip: "Classic trick question: a resolved Promise's .then logs before a setTimeout(…, 0).",
      code: "console.log(1);\nsetTimeout(() => console.log(2), 0);\nPromise.resolve().then(() => console.log(3));\nconsole.log(4);\n// → 1, 4, 3, 2",
      lang: "js"
    },
    {
      id: "js-equality",
      category: "javascript",
      difficulty: "beginner",
      tags: ["operators", "coercion"],
      question: "== vs === ?",
      answer:
        "<p><strong>==</strong> compares after type coercion (<code class=\"inline\">0 == \"0\"</code> is <code class=\"inline\">true</code>). <strong>===</strong> checks value <em>and</em> type with no coercion.</p>" +
        "<p>Always use <code class=\"inline\">===</code> unless you deliberately want coercion (e.g. <code class=\"inline\">x == null</code> to catch both null and undefined).</p>",
      tip: "x == null is the one idiomatic use of == — it matches null and undefined.",
      code: "0 == '';    // true\n0 === '';   // false\nnull == undefined; // true",
      lang: "js"
    },
    {
      id: "js-this",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["this", "binding", "arrow"],
      question: "How does the this keyword work?",
      answer:
        "<p><code class=\"inline\">this</code> depends on <em>how a function is called</em>:</p>" +
        "<ul>" +
        "<li>Regular call → global object, or <code class=\"inline\">undefined</code> in strict mode.</li>" +
        "<li>Method call <code class=\"inline\">obj.fn()</code> → <code class=\"inline\">obj</code>.</li>" +
        "<li><strong>Arrow function</strong> → no own <code class=\"inline\">this</code>; inherits from the enclosing scope.</li>" +
        "<li><code class=\"inline\">call</code> / <code class=\"inline\">apply</code> / <code class=\"inline\">bind</code> → set <code class=\"inline\">this</code> explicitly.</li>" +
        "</ul>",
      tip: "Arrow functions are why callbacks 'just work' inside classes — they keep the outer this.",
      code: "const obj = {\n  name: 'A',\n  greet() { setTimeout(() => console.log(this.name), 0); }\n};\nobj.greet(); // 'A' — arrow keeps this",
      lang: "js"
    },
    {
      id: "js-promise-async",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["promise", "async-await", "error-handling"],
      question: "Promise vs async/await, and how do you handle errors?",
      answer:
        "<p>A <strong>Promise</strong> represents a future value (pending → fulfilled/rejected). <strong>async/await</strong> is syntactic sugar that lets asynchronous code read synchronously.</p>" +
        "<p>Errors: <code class=\"inline\">.catch()</code> on a chain, or <code class=\"inline\">try/catch</code> around <code class=\"inline\">await</code>. Use <code class=\"inline\">Promise.all</code> for parallel and <code class=\"inline\">Promise.allSettled</code> when you need every result regardless of failures.</p>",
      tip: "await inside a loop is sequential — use Promise.all to parallelise independent calls.",
      code: "async function load() {\n  try {\n    const res = await fetch('/api/user');\n    return await res.json();\n  } catch (e) { /* handle */ }\n}",
      lang: "js"
    },
    {
      id: "js-debounce-throttle",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["performance", "debounce", "throttle"],
      question: "Debounce vs throttle — what and when?",
      answer:
        "<p><strong>Debounce</strong> — wait until events <em>stop</em> for N ms, then fire once. Use for search-as-you-type.</p>" +
        "<p><strong>Throttle</strong> — fire at most once per N ms while events keep coming. Use for scroll/resize/mousemove.</p>",
      tip: "Debounce = 'wait for quiet'; throttle = 'rate limit'.",
      code: "function debounce(fn, ms) {\n  let t;\n  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };\n}",
      lang: "js"
    },
    {
      id: "js-array-methods",
      category: "javascript",
      difficulty: "beginner",
      tags: ["arrays", "map", "reduce"],
      question: "map vs forEach vs reduce.",
      answer:
        "<p><strong>map</strong> returns a new transformed array. <strong>forEach</strong> just iterates and returns nothing. <strong>reduce</strong> folds an array into a single value (sum, group-by, flatten, etc.).</p>",
      tip: "Use map when you need a result; forEach only for side effects.",
      code: "const nums = [1, 2, 3];\nnums.map(n => n * 2);           // [2, 4, 6]\nnums.reduce((a, b) => a + b, 0); // 6",
      lang: "js"
    },
    {
      id: "js-copy",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["objects", "copy", "reference"],
      question: "Shallow copy vs deep copy.",
      answer:
        "<p><strong>Shallow copy</strong> (<code class=\"inline\">{...obj}</code>, <code class=\"inline\">Object.assign</code>) copies the top level only — nested objects remain shared references.</p>" +
        "<p><strong>Deep copy</strong> clones everything: <code class=\"inline\">structuredClone(obj)</code> (modern) or the old <code class=\"inline\">JSON.parse(JSON.stringify(obj))</code> (loses functions, dates, undefined).</p>",
      tip: "structuredClone is the modern one-liner for deep copies.",
      code: "const shallow = { ...original };\nconst deep = structuredClone(original);",
      lang: "js"
    },
    {
      id: "js-prototype",
      category: "javascript",
      difficulty: "advanced",
      tags: ["prototype", "inheritance", "oop"],
      question: "Explain prototypal inheritance.",
      answer:
        "<p>Every object has a hidden link (<code class=\"inline\">[[Prototype]]</code>) to another object. When you access a property, JS walks up this <strong>prototype chain</strong> until it finds it or reaches <code class=\"inline\">null</code>.</p>" +
        "<p><code class=\"inline\">class</code> syntax is sugar over this — methods live on the prototype so all instances share one copy.</p>",
      tip: "class ... extends is prototype-based inheritance under the hood.",
      code: "class Animal { speak() { return 'sound'; } }\nclass Dog extends Animal { speak() { return 'woof'; } }",
      lang: "js"
    },
    {
      id: "js-hoisting-tdz",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["hoisting", "tdz"],
      question: "What is the Temporal Dead Zone (TDZ)?",
      answer:
        "<p>The span between entering a scope and the point where a <code class=\"inline\">let</code>/<code class=\"inline\">const</code> variable is declared. The binding is hoisted but not initialised, so accessing it in that window throws a <code class=\"inline\">ReferenceError</code>.</p>",
      tip: "TDZ is why let/const 'feel' un-hoisted even though they technically are hoisted.",
      code: "console.log(x); // ReferenceError (TDZ)\nlet x = 5;",
      lang: "js"
    },
    {
      id: "js-spread-rest",
      category: "javascript",
      difficulty: "beginner",
      tags: ["es6", "spread", "rest"],
      question: "Spread vs rest operator.",
      answer:
        "<p>Same <code class=\"inline\">...</code> syntax, opposite jobs. <strong>Spread</strong> expands an iterable into elements. <strong>Rest</strong> gathers remaining arguments/elements into an array.</p>",
      tip: "Spread 'spreads out'; rest 'collects the rest'.",
      code: "const merged = [...a, ...b];        // spread\nfunction sum(...nums) {}            // rest\nconst { id, ...others } = obj;      // rest in destructuring",
      lang: "js"
    },
    {
      id: "js-null-undefined",
      category: "javascript",
      difficulty: "beginner",
      tags: ["types", "null", "undefined"],
      question: "null vs undefined.",
      answer:
        "<p><strong>undefined</strong> — a variable declared but not assigned, or a missing property/return. Set by the engine.</p>" +
        "<p><strong>null</strong> — an intentional 'no value', set by the developer.</p>" +
        "<p>Quirk: <code class=\"inline\">typeof null</code> is <code class=\"inline\">'object'</code> (a historical bug).</p>",
      tip: "Use ?? (nullish coalescing) to default only on null/undefined, not on 0 or ''.",
      code: "const name = input ?? 'Guest'; // keeps 0 and '' but replaces null/undefined",
      lang: "js"
    },
    {
      id: "js-hof",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["functions", "higher-order"],
      question: "What is a higher-order function?",
      answer:
        "<p>A function that <strong>takes a function as an argument</strong> and/or <strong>returns a function</strong>. Examples: <code class=\"inline\">map</code>, <code class=\"inline\">filter</code>, <code class=\"inline\">setTimeout</code>, and any function factory.</p>",
      tip: "Debounce, throttle, and curry are all higher-order functions.",
      code: "const withLog = fn => (...args) => { console.log(args); return fn(...args); };",
      lang: "js"
    },
    {
      id: "js-currying",
      category: "javascript",
      difficulty: "advanced",
      tags: ["functions", "currying"],
      question: "What is currying?",
      answer:
        "<p>Transforming a function that takes multiple arguments into a chain of functions that each take one argument. Enables partial application and reusable specialised functions.</p>",
      tip: "Currying leans on closures to remember earlier arguments.",
      code: "const add = a => b => c => a + b + c;\nadd(1)(2)(3); // 6",
      lang: "js"
    },
    {
      id: "js-event-delegation",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["dom", "events", "delegation"],
      question: "What is event delegation?",
      answer:
        "<p>Attach a single listener to a common parent and use event <strong>bubbling</strong> to handle events from many children (checked via <code class=\"inline\">event.target</code>). Fewer listeners, and it works for dynamically added elements.</p>",
      tip: "Great answer for 'how would you handle clicks on a list of 1000 rows'.",
      code: "list.addEventListener('click', e => {\n  const row = e.target.closest('.row');\n  if (row) select(row.dataset.id);\n});",
      lang: "js"
    },
    {
      id: "js-bubbling-capturing",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["dom", "events"],
      question: "Event bubbling vs capturing.",
      answer:
        "<p>When an event fires, it travels <strong>capturing</strong> phase (top → target) then <strong>bubbling</strong> phase (target → top). Listeners run in the bubbling phase by default; pass <code class=\"inline\">{ capture: true }</code> for the capture phase.</p>" +
        "<p><code class=\"inline\">stopPropagation()</code> halts travel; <code class=\"inline\">preventDefault()</code> cancels the default action.</p>",
      tip: "stopPropagation and preventDefault do different things — don't confuse them.",
      code: "",
      lang: ""
    },
    {
      id: "js-callback-hell",
      category: "javascript",
      difficulty: "beginner",
      tags: ["async", "callbacks"],
      question: "What is callback hell and how do you avoid it?",
      answer:
        "<p>Deeply nested callbacks (the 'pyramid of doom') that are hard to read and error-handle. Avoid it with <strong>Promises</strong>, <strong>async/await</strong>, and by extracting named functions.</p>",
      tip: "async/await is the modern cure for callback hell.",
      code: "",
      lang: ""
    },
    {
      id: "js-immutability",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["immutability", "freeze"],
      question: "How do you make an object immutable?",
      answer:
        "<p><code class=\"inline\">Object.freeze(obj)</code> prevents adding, removing, or changing top-level properties (shallow). For deep immutability you must freeze nested objects recursively, or use a library.</p>",
      tip: "Immutability + OnPush is the pairing that makes Angular change detection fast.",
      code: "const cfg = Object.freeze({ mode: 'dark' });\ncfg.mode = 'light'; // silently ignored (throws in strict mode)",
      lang: "js"
    },
    {
      id: "js-set-map",
      category: "javascript",
      difficulty: "beginner",
      tags: ["es6", "set", "map"],
      question: "When would you use a Set or a Map?",
      answer:
        "<p><strong>Set</strong> — a collection of unique values (dedupe an array with <code class=\"inline\">[...new Set(arr)]</code>).</p>" +
        "<p><strong>Map</strong> — key/value pairs where keys can be <em>any</em> type (objects included) and insertion order is preserved. Better than a plain object for frequent add/delete.</p>",
      tip: "Use a Set for fast has() lookups instead of array.includes in loops.",
      code: "const unique = [...new Set([1, 1, 2, 3])]; // [1, 2, 3]",
      lang: "js"
    },
    {
      id: "js-optional-chaining",
      category: "javascript",
      difficulty: "beginner",
      tags: ["es2020", "optional-chaining"],
      question: "What do ?. and ?? do?",
      answer:
        "<p><strong>Optional chaining</strong> <code class=\"inline\">?.</code> short-circuits to <code class=\"inline\">undefined</code> instead of throwing when accessing a property on null/undefined.</p>" +
        "<p><strong>Nullish coalescing</strong> <code class=\"inline\">??</code> returns the right side only when the left is null/undefined (unlike <code class=\"inline\">||</code>, it keeps 0, '', and false).</p>",
      tip: "Combine them: user?.profile?.name ?? 'Guest'.",
      code: "const city = user?.address?.city ?? 'Unknown';",
      lang: "js"
    },
    {
      id: "js-func-types",
      category: "javascript",
      difficulty: "beginner",
      tags: ["functions", "arrow", "hoisting"],
      question: "Function declaration vs expression vs arrow function.",
      answer:
        "<ul>" +
        "<li><strong>Declaration</strong> — hoisted fully, has its own <code class=\"inline\">this</code>/<code class=\"inline\">arguments</code>.</li>" +
        "<li><strong>Expression</strong> — assigned to a variable, not hoisted (the variable is).</li>" +
        "<li><strong>Arrow</strong> — concise, no own <code class=\"inline\">this</code>/<code class=\"inline\">arguments</code>/<code class=\"inline\">prototype</code>; can't be a constructor.</li>" +
        "</ul>",
      tip: "Never use an arrow as an object method that needs `this`, or as a constructor.",
      code: "function decl() {}         // hoisted\nconst expr = function () {};// not hoisted\nconst arrow = () => {};     // lexical this",
      lang: "js"
    },
    {
      id: "js-iife-module",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["iife", "module-pattern", "closures"],
      question: "What is an IIFE and the module pattern?",
      answer:
        "<p>An <strong>IIFE</strong> (Immediately Invoked Function Expression) runs the moment it's defined, creating a private scope. The <strong>module pattern</strong> uses one to expose only a public API while keeping internals private via closures — the pre-ESM way to avoid globals.</p>",
      tip: "This app itself uses the IIFE pattern to register data without leaking globals.",
      code: "const counter = (function () {\n  let count = 0;               // private\n  return { inc: () => ++count, get: () => count };\n})();\ncounter.inc(); counter.get(); // 1",
      lang: "js"
    },
    {
      id: "js-destructuring",
      category: "javascript",
      difficulty: "beginner",
      tags: ["es6", "destructuring"],
      question: "Explain destructuring with defaults and renaming.",
      answer:
        "<p>Unpack arrays/objects into variables in one statement, with defaults for missing values and renaming for objects. Also enables clean swaps and nested extraction.</p>",
      tip: "Destructuring function params with defaults gives clean, self-documenting APIs.",
      code: "const { name = 'Guest', id: userId } = user;\nconst [first, , third] = list;\n[a, b] = [b, a]; // swap",
      lang: "js"
    },
    {
      id: "js-object-methods",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["objects", "es2017"],
      question: "Object.keys / values / entries / fromEntries.",
      answer:
        "<p><code class=\"inline\">Object.keys/values/entries</code> turn an object into arrays you can map/filter/reduce. <code class=\"inline\">Object.fromEntries</code> rebuilds an object from key/value pairs — perfect for transforming objects.</p>",
      tip: "entries → map → fromEntries is the idiomatic 'map over an object' pattern.",
      code: "const doubled = Object.fromEntries(\n  Object.entries({ a: 1, b: 2 }).map(([k, v]) => [k, v * 2])\n); // { a: 2, b: 4 }",
      lang: "js"
    },
    {
      id: "js-json",
      category: "javascript",
      difficulty: "beginner",
      tags: ["json", "serialization"],
      question: "JSON.stringify / parse — gotchas?",
      answer:
        "<p>Serialise/deserialise data. Gotchas: <code class=\"inline\">undefined</code>, functions, and symbols are dropped; <code class=\"inline\">Date</code> becomes a string; <code class=\"inline\">NaN</code>/<code class=\"inline\">Infinity</code> become <code class=\"inline\">null</code>; circular references throw. A <em>replacer</em>/<em>reviver</em> function can customise both.</p>",
      tip: "JSON.stringify(obj, null, 2) pretty-prints — handy for debugging and exports.",
      code: "JSON.stringify({ a: 1 }, null, 2);\nJSON.parse(str, (k, v) => k === 'date' ? new Date(v) : v);",
      lang: "js"
    },
    {
      id: "js-fetch",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["fetch", "async", "abortcontroller"],
      question: "How does fetch work, and how do you cancel a request?",
      answer:
        "<p><code class=\"inline\">fetch</code> returns a Promise of a <code class=\"inline\">Response</code>. Note it only rejects on network failure — a 404/500 still resolves, so check <code class=\"inline\">res.ok</code>. Cancel with an <code class=\"inline\">AbortController</code>'s signal.</p>",
      tip: "fetch doesn't throw on HTTP errors — always check res.ok yourself.",
      code: "const ctrl = new AbortController();\nfetch(url, { signal: ctrl.signal })\n  .then(res => { if (!res.ok) throw Error(res.status); return res.json(); });\nctrl.abort(); // cancel",
      lang: "js"
    },
    {
      id: "js-promise-combinators",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["promise", "async"],
      question: "Promise.all vs allSettled vs race vs any.",
      answer:
        "<ul>" +
        "<li><strong>all</strong> — resolves with all results, rejects on the first failure.</li>" +
        "<li><strong>allSettled</strong> — waits for all, returns status for each (never rejects).</li>" +
        "<li><strong>race</strong> — settles as soon as the first one settles (resolve or reject).</li>" +
        "<li><strong>any</strong> — resolves with the first success, rejects only if all fail.</li>" +
        "</ul>",
      tip: "Use allSettled when you want every result even if some calls fail.",
      code: "await Promise.allSettled([a(), b(), c()]);\n// [{status:'fulfilled',value},{status:'rejected',reason}, ...]",
      lang: "js"
    },
    {
      id: "js-generators",
      category: "javascript",
      difficulty: "advanced",
      tags: ["generators", "iterators"],
      question: "What are generators and iterators?",
      answer:
        "<p>A <strong>generator</strong> (<code class=\"inline\">function*</code>) can pause with <code class=\"inline\">yield</code> and resume, producing values lazily. It returns an <strong>iterator</strong> (has <code class=\"inline\">.next()</code>). Great for infinite/lazy sequences and custom iteration.</p>",
      tip: "Any object with a [Symbol.iterator] method works in for...of and spread.",
      code: "function* ids() { let i = 1; while (true) yield i++; }\nconst gen = ids();\ngen.next().value; // 1\ngen.next().value; // 2",
      lang: "js"
    },
    {
      id: "js-symbol",
      category: "javascript",
      difficulty: "advanced",
      tags: ["symbol", "es6"],
      question: "What is a Symbol and where is it used?",
      answer:
        "<p>A <strong>Symbol</strong> is a unique, immutable primitive often used as a non-colliding object key. <em>Well-known symbols</em> like <code class=\"inline\">Symbol.iterator</code> let you hook into language behaviour (making an object iterable).</p>",
      tip: "Symbols create 'hidden' keys that won't clash with string keys or show in for...in.",
      code: "const id = Symbol('id');\nobj[id] = 123; // unique, non-enumerable-ish key",
      lang: "js"
    },
    {
      id: "js-weakmap",
      category: "javascript",
      difficulty: "advanced",
      tags: ["weakmap", "memory", "gc"],
      question: "WeakMap / WeakSet — when and why?",
      answer:
        "<p>They hold <strong>object keys weakly</strong> — if nothing else references the key, it can be garbage-collected, preventing leaks. Keys must be objects; they're not iterable. Use them for private per-object metadata or caches tied to an object's lifetime.</p>",
      tip: "A WeakMap cache won't keep DOM nodes alive after they're removed — no leak.",
      code: "const cache = new WeakMap();\ncache.set(domNode, computed); // freed when domNode is",
      lang: "js"
    },
    {
      id: "js-loop-closure",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["closures", "scope", "classic"],
      question: "Why does a for-loop with var log the wrong value in setTimeout?",
      answer:
        "<p><code class=\"inline\">var</code> is function-scoped, so every callback shares the <em>same</em> variable, which by the time the timers fire equals the final value. <code class=\"inline\">let</code> is block-scoped — each iteration gets a fresh binding, so it logs correctly.</p>",
      tip: "The classic fix is just changing var to let — each iteration captures its own i.",
      code: "for (let i = 0; i < 3; i++) setTimeout(() => console.log(i));\n// 0, 1, 2   (with var → 3, 3, 3)",
      lang: "js"
    },
    {
      id: "js-typeof-instanceof",
      category: "javascript",
      difficulty: "beginner",
      tags: ["types", "typeof", "instanceof"],
      question: "typeof vs instanceof.",
      answer:
        "<p><code class=\"inline\">typeof</code> returns a string for primitives (<code class=\"inline\">'string'</code>, <code class=\"inline\">'number'</code>, <code class=\"inline\">'function'</code>…). <code class=\"inline\">instanceof</code> checks the prototype chain for objects/classes. Note <code class=\"inline\">typeof null === 'object'</code> and arrays are <code class=\"inline\">'object'</code> — use <code class=\"inline\">Array.isArray</code>.</p>",
      tip: "Use Array.isArray(x), not typeof, to detect arrays.",
      code: "typeof []; // 'object'\nArray.isArray([]); // true\n[] instanceof Array; // true",
      lang: "js"
    },
    {
      id: "js-nan",
      category: "javascript",
      difficulty: "beginner",
      tags: ["numbers", "nan"],
      question: "How do you check for NaN correctly?",
      answer:
        "<p><code class=\"inline\">NaN</code> is the only value not equal to itself, so <code class=\"inline\">NaN === NaN</code> is false. Use <code class=\"inline\">Number.isNaN(x)</code> (strict — no coercion) rather than the global <code class=\"inline\">isNaN()</code>, which coerces (<code class=\"inline\">isNaN('foo')</code> is true).</p>",
      tip: "Prefer Number.isNaN over the global isNaN to avoid coercion surprises.",
      code: "Number.isNaN(NaN);    // true\nNumber.isNaN('foo');  // false\nisNaN('foo');         // true (coerced!)",
      lang: "js"
    },
    {
      id: "js-dom-perf",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["dom", "performance", "reflow"],
      question: "How do you update the DOM efficiently?",
      answer:
        "<p>Minimise reflows/repaints: batch DOM writes, build nodes in a <code class=\"inline\">DocumentFragment</code> and append once, avoid reading layout (<code class=\"inline\">offsetWidth</code>) between writes (layout thrashing), and prefer <code class=\"inline\">class</code> toggles over inline style loops. Use <code class=\"inline\">requestAnimationFrame</code> for visual updates.</p>",
      tip: "Appending 100 nodes one-by-one triggers 100 reflows; a DocumentFragment triggers one.",
      code: "const frag = document.createDocumentFragment();\nitems.forEach(i => frag.appendChild(render(i)));\nlist.appendChild(frag); // single reflow",
      lang: "js"
    },
    {
      id: "js-pure-function",
      category: "javascript",
      difficulty: "beginner",
      tags: ["functional", "pure", "side-effects"],
      question: "What is a pure function and why prefer it?",
      answer:
        "<p>A <strong>pure function</strong> always returns the same output for the same input and has <strong>no side effects</strong> (no mutation, I/O, or external state). Pure functions are predictable, testable, cacheable, and safe to parallelise — the basis of reducers and OnPush change detection.</p>",
      tip: "Reducers in Redux/NgRx must be pure — that's what enables time-travel debugging.",
      code: "const add = (a, b) => a + b;            // pure\nlet total = 0; const addTo = n => total += n; // impure",
      lang: "js"
    },
    {
      id: "js-data-types",
      category: "javascript",
      difficulty: "beginner",
      tags: ["types", "primitives"],
      question: "What are the data types in JavaScript?",
      answer:
        "<p><strong>Primitive</strong> (immutable, copied by value): <code class=\"inline\">string</code>, <code class=\"inline\">number</code>, <code class=\"inline\">boolean</code>, <code class=\"inline\">bigint</code>, <code class=\"inline\">symbol</code>, <code class=\"inline\">undefined</code>, <code class=\"inline\">null</code>.</p>" +
        "<p><strong>Non-primitive</strong> (reference type): <code class=\"inline\">object</code> — which includes arrays, functions, and dates.</p>",
      tip: "Primitives are compared/copied by value; objects by reference — a very common gotcha.",
      code: "typeof 'a';     // 'string'\ntypeof 10n;     // 'bigint'\ntypeof null;    // 'object' (historical bug)\ntypeof [];      // 'object'",
      lang: "js"
    },
    {
      id: "js-type-conversion",
      category: "javascript",
      difficulty: "beginner",
      tags: ["conversion", "numbers", "strings"],
      question: "How do you convert between strings and numbers?",
      answer:
        "<p><strong>Number → string</strong>: <code class=\"inline\">String(n)</code>, <code class=\"inline\">n.toString()</code>, or a template literal <code class=\"inline\">`${n}`</code>.</p>" +
        "<p><strong>String → number</strong>: <code class=\"inline\">Number(s)</code>, <code class=\"inline\">parseInt(s)</code> (integer), <code class=\"inline\">parseFloat(s)</code> (decimal), or the unary <code class=\"inline\">+s</code>.</p>",
      tip: "parseInt('123px') = 123 (stops at non-digits); Number('123px') = NaN (strict).",
      code: "Number('123');      // 123\nparseInt('123.45');  // 123\nparseFloat('123.45');// 123.45\n+'123';              // 123\n(123).toString();    // '123'",
      lang: "js"
    },
    {
      id: "js-sync-async",
      category: "javascript",
      difficulty: "beginner",
      tags: ["async", "concurrency"],
      question: "Synchronous vs asynchronous programming.",
      answer:
        "<p><strong>Synchronous</strong> code runs line by line — each task blocks the next until it finishes. <strong>Asynchronous</strong> code lets long-running work (network, timers, I/O) happen in the background and continue later via callbacks/promises/async-await, keeping the single UI thread responsive.</p>",
      tip: "JS is single-threaded, so async is how it stays responsive during I/O.",
      code: "",
      lang: ""
    },
    {
      id: "js-single-threaded",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["event-loop", "concurrency", "threads"],
      question: "Is JavaScript single-threaded or multi-threaded?",
      answer:
        "<p>JavaScript is <strong>single-threaded</strong> — one call stack, one thing at a time. It <em>feels</em> concurrent because of the <strong>event loop</strong>: async work is offloaded to the browser/Node APIs and their callbacks are queued back onto the stack when it's free. (Web Workers add real parallel threads, but they don't share the main thread.)</p>",
      tip: "One thread + event loop = the mental model for all async behaviour in JS.",
      code: "",
      lang: ""
    },
    {
      id: "js-event-listener",
      category: "javascript",
      difficulty: "beginner",
      tags: ["dom", "events"],
      question: "What is an event listener?",
      answer:
        "<p>A function registered to run when a specific event (click, input, mouseover, …) fires on a DOM element, via <code class=\"inline\">addEventListener</code>. Remove it with <code class=\"inline\">removeEventListener</code> to avoid leaks.</p>",
      tip: "Use addEventListener (not onclick=) so you can attach multiple handlers and remove them.",
      code: "const btn = document.getElementById('save');\nbtn.addEventListener('click', () => console.log('clicked'));",
      lang: "js"
    },
    {
      id: "js-slice-splice",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["arrays", "methods"],
      question: "slice() vs splice().",
      answer:
        "<p><strong>slice(start, end)</strong> returns a <em>copy</em> of a portion — it does <strong>not</strong> mutate the original. <strong>splice(start, count, …items)</strong> <em>mutates</em> the array, removing and/or inserting elements, and returns the removed ones.</p>",
      tip: "slice = safe copy; splice = in-place edit. Easy to mix up — remember 'p' for 'mutate in place'.",
      code: "const a = ['a', 'b', 'c', 'd'];\na.slice(1, 3);      // ['b','c']  (a unchanged)\na.splice(1, 2);     // removes ['b','c']  (a is now ['a','d'])",
      lang: "js"
    },
    {
      id: "js-call-apply-bind",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["this", "functions", "binding"],
      question: "call() vs apply() vs bind().",
      answer:
        "<p>All set <code class=\"inline\">this</code> explicitly. <strong>call</strong> invokes immediately with arguments listed individually; <strong>apply</strong> invokes immediately with arguments as an array; <strong>bind</strong> returns a <em>new</em> function with <code class=\"inline\">this</code> permanently bound (call it later).</p>",
      tip: "call/apply invoke now; bind returns a function to invoke later. apply takes an Array.",
      code: "greet.call(obj, 'hi', '!');\ngreet.apply(obj, ['hi', '!']);\nconst bound = greet.bind(obj); bound('hi', '!');",
      lang: "js"
    },
    {
      id: "js-template-literals",
      category: "javascript",
      difficulty: "beginner",
      tags: ["es6", "strings"],
      question: "What are template literals?",
      answer:
        "<p>Strings written in backticks that support <strong>interpolation</strong> (<code class=\"inline\">${expr}</code>) and multi-line text without concatenation. <em>Tagged</em> template literals let a function process the parts (used for i18n, styled-components, safe HTML).</p>",
      tip: "Backticks + ${} replace clunky string concatenation and allow multi-line strings.",
      code: "const name = 'Chi';\nconst msg = `Hello ${name}, ${1 + 1} new alerts`;",
      lang: "js"
    },
    {
      id: "js-garbage-collection",
      category: "javascript",
      difficulty: "advanced",
      tags: ["memory", "gc"],
      question: "How does garbage collection work in JavaScript?",
      answer:
        "<p>The engine automatically frees memory for objects that are no longer <strong>reachable</strong> from a root (global, current call stack). The main algorithm is <strong>mark-and-sweep</strong>. Leaks still happen via lingering references — forgotten timers, detached DOM nodes, or global variables.</p>",
      tip: "You can't force GC; you prevent leaks by clearing references, timers, and listeners.",
      code: "",
      lang: ""
    },
    {
      id: "js-add-props",
      category: "javascript",
      difficulty: "beginner",
      tags: ["objects"],
      question: "How do you add or access properties dynamically on an object?",
      answer:
        "<p>Use <strong>bracket notation</strong> when the key is dynamic or not a valid identifier: <code class=\"inline\">obj[key] = value</code>. Dot notation (<code class=\"inline\">obj.key</code>) only works for fixed, valid names.</p>",
      tip: "Bracket notation is how you set a property whose name is in a variable.",
      code: "const student = { name: 'A' };\nconst field = 'rollNumber';\nstudent[field] = 42;   // { name: 'A', rollNumber: 42 }",
      lang: "js"
    },
    {
      id: "js-for-of-in",
      category: "javascript",
      difficulty: "beginner",
      tags: ["loops", "iteration"],
      question: "for...of vs for...in.",
      answer:
        "<p><strong>for…of</strong> iterates the <em>values</em> of an iterable (arrays, strings, Maps, Sets). <strong>for…in</strong> iterates the <em>keys</em> (property names) of an object — and can pick up inherited enumerable keys, so it's not ideal for arrays.</p>",
      tip: "for…of for arrays/values, for…in for object keys. Don't loop arrays with for…in.",
      code: "for (const v of ['a', 'b']) {}        // 'a', 'b'\nfor (const k in { x: 1, y: 2 }) {}     // 'x', 'y'",
      lang: "js"
    },
    {
      id: "js-settimeout-interval",
      category: "javascript",
      difficulty: "beginner",
      tags: ["timers", "async"],
      question: "setTimeout() vs setInterval().",
      answer:
        "<p><strong>setTimeout</strong> runs a callback <em>once</em> after a delay. <strong>setInterval</strong> runs it <em>repeatedly</em> at a fixed interval. Both return an id you clear with <code class=\"inline\">clearTimeout</code>/<code class=\"inline\">clearInterval</code>.</p>",
      tip: "Always clear intervals (e.g. in cleanup) or they run forever and leak.",
      code: "const t = setTimeout(fn, 1000);   clearTimeout(t);\nconst i = setInterval(fn, 1000);  clearInterval(i);",
      lang: "js"
    },
    {
      id: "js-shadowing",
      category: "javascript",
      difficulty: "intermediate",
      tags: ["scope", "shadowing"],
      question: "What is variable shadowing?",
      answer:
        "<p>When a variable declared in an inner scope has the <strong>same name</strong> as one in an outer scope, the inner one <em>shadows</em> (hides) the outer within that block. Common with function parameters and block-scoped <code class=\"inline\">let</code>/<code class=\"inline\">const</code>.</p>",
      tip: "Illegal shadowing: you can't shadow a let with a var in the same scope.",
      code: "let x = 1;\nfunction f() { let x = 2; return x; } // inner x shadows outer\nf(); // 2, outer x still 1",
      lang: "js"
    },
    {
      id: "js-generator-vs-normal",
      category: "javascript",
      difficulty: "advanced",
      tags: ["generators", "functions"],
      question: "Generator function vs normal function.",
      answer:
        "<p>A <strong>normal function</strong> runs to completion and returns once. A <strong>generator</strong> (<code class=\"inline\">function*</code>) can <strong>pause</strong> at each <code class=\"inline\">yield</code> and resume later, returning an <em>iterator</em>. It's lazy — values are produced on demand, enabling infinite sequences and custom iteration.</p>",
      tip: "Generators return an iterator you drive with .next(); normal functions just return a value.",
      code: "function* gen() { yield 1; yield 2; }\nconst it = gen();\nit.next(); // { value: 1, done: false }",
      lang: "js"
    },
    {
      id: "js-mutable-immutable",
      category: "javascript",
      difficulty: "beginner",
      tags: ["immutability", "types"],
      question: "Mutable vs immutable in JavaScript.",
      answer:
        "<p><strong>Primitives</strong> (string, number, boolean…) are <strong>immutable</strong> — operations produce new values, never change the original. <strong>Objects and arrays</strong> are <strong>mutable</strong> — their contents can change in place. Freeze an object with <code class=\"inline\">Object.freeze</code> to prevent top-level mutation.</p>",
      tip: "String methods return NEW strings — the original never changes.",
      code: "let s = 'abc'; s.toUpperCase(); // 'ABC' but s is still 'abc'\nconst a = [1]; a.push(2);       // a mutated to [1, 2]",
      lang: "js"
    }
  ];
})();

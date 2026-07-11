/* JavaScript coding-challenge bank. Each entry poses a problem and
   gives a worked solution in the `code` field. */
(function () {
  window.IQB = window.IQB || {};
  IQB.data = IQB.data || {};

  IQB.data.coding = [
    {
      id: "code-reverse-string",
      category: "coding",
      difficulty: "beginner",
      tags: ["string", "basics"],
      question: "Reverse a string without using .reverse().",
      answer:
        "<p>Walk the string from the end to the start and build a new one, or convert to an array and back. Time O(n), space O(n).</p>",
      tip: "The one-liner [...str].reverse().join('') is fine too — but interviewers often want the manual loop.",
      code: "function reverse(str) {\n  let out = '';\n  for (let i = str.length - 1; i >= 0; i--) out += str[i];\n  return out;\n}\nreverse('hello'); // 'olleh'",
      lang: "js"
    },
    {
      id: "code-palindrome",
      category: "coding",
      difficulty: "beginner",
      tags: ["string", "two-pointer"],
      question: "Check whether a string is a palindrome.",
      answer:
        "<p>Use two pointers from both ends moving inward, comparing characters. Normalise case and strip non-alphanumerics first if needed. O(n) time, O(1) space.</p>",
      tip: "Two-pointer beats reversing the whole string — no extra allocation.",
      code: "function isPalindrome(s) {\n  s = s.toLowerCase().replace(/[^a-z0-9]/g, '');\n  let i = 0, j = s.length - 1;\n  while (i < j) if (s[i++] !== s[j--]) return false;\n  return true;\n}\nisPalindrome('A man, a plan, a canal: Panama'); // true",
      lang: "js"
    },
    {
      id: "code-fizzbuzz",
      category: "coding",
      difficulty: "beginner",
      tags: ["logic", "classic"],
      question: "Implement FizzBuzz (1..n).",
      answer:
        "<p>For each number print 'Fizz' if divisible by 3, 'Buzz' if by 5, 'FizzBuzz' if both, else the number. Build the word by concatenation to avoid nested ifs.</p>",
      tip: "Concatenating 'Fizz'+'Buzz' avoids the divisible-by-15 special case.",
      code: "function fizzBuzz(n) {\n  for (let i = 1; i <= n; i++) {\n    let s = (i % 3 ? '' : 'Fizz') + (i % 5 ? '' : 'Buzz');\n    console.log(s || i);\n  }\n}",
      lang: "js"
    },
    {
      id: "code-two-sum",
      category: "coding",
      difficulty: "intermediate",
      tags: ["array", "hashmap"],
      question: "Two Sum — return indices of two numbers adding up to a target.",
      answer:
        "<p>Store each seen value's index in a Map. For each number, check if <code class=\"inline\">target - num</code> was already seen. One pass, O(n) time instead of the O(n²) nested loop.</p>",
      tip: "Turning a nested loop into a single pass with a Map is the most common optimisation interviewers look for.",
      code: "function twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need), i];\n    seen.set(nums[i], i);\n  }\n}\ntwoSum([2, 7, 11, 15], 9); // [0, 1]",
      lang: "js"
    },
    {
      id: "code-dedupe",
      category: "coding",
      difficulty: "beginner",
      tags: ["array", "set"],
      question: "Remove duplicates from an array.",
      answer:
        "<p>Wrap it in a <code class=\"inline\">Set</code> (which keeps unique values) and spread back to an array. For objects by a key, use a Map keyed on that field.</p>",
      tip: "[...new Set(arr)] is the idiomatic dedupe; use a Map for de-duping objects by id.",
      code: "const unique = arr => [...new Set(arr)];\nunique([1, 1, 2, 3, 3]); // [1, 2, 3]\n\n// by key:\nconst byId = arr => [...new Map(arr.map(o => [o.id, o])).values()];",
      lang: "js"
    },
    {
      id: "code-flatten-array",
      category: "coding",
      difficulty: "intermediate",
      tags: ["array", "recursion"],
      question: "Flatten a deeply nested array (without .flat(Infinity)).",
      answer:
        "<p>Reduce over the array; if an element is itself an array, recurse and concat the result, otherwise include it. Or use an explicit stack to avoid recursion.</p>",
      tip: "Recursion reads cleanly; mention a stack-based version if asked about very deep nesting.",
      code: "function flatten(arr) {\n  return arr.reduce((acc, v) =>\n    acc.concat(Array.isArray(v) ? flatten(v) : v), []);\n}\nflatten([1, [2, [3, [4]]]]); // [1, 2, 3, 4]",
      lang: "js"
    },
    {
      id: "code-debounce",
      category: "coding",
      difficulty: "intermediate",
      tags: ["closures", "timing", "debounce"],
      question: "Implement a debounce function.",
      answer:
        "<p>Return a function that clears a pending timer and sets a new one on each call, so the wrapped function only runs after calls stop for <code class=\"inline\">ms</code>. The timer id lives in a closure.</p>",
      tip: "Preserve `this` and args with apply so it works as a method or event handler.",
      code: "function debounce(fn, ms) {\n  let t;\n  return function (...args) {\n    clearTimeout(t);\n    t = setTimeout(() => fn.apply(this, args), ms);\n  };\n}",
      lang: "js"
    },
    {
      id: "code-throttle",
      category: "coding",
      difficulty: "intermediate",
      tags: ["closures", "timing", "throttle"],
      question: "Implement a throttle function.",
      answer:
        "<p>Track the last run time; only invoke the wrapped function if at least <code class=\"inline\">ms</code> has elapsed since the previous call. Guarantees a maximum call rate.</p>",
      tip: "Debounce waits for quiet; throttle enforces a steady rate — know both.",
      code: "function throttle(fn, ms) {\n  let last = 0;\n  return function (...args) {\n    const now = Date.now();\n    if (now - last >= ms) { last = now; fn.apply(this, args); }\n  };\n}",
      lang: "js"
    },
    {
      id: "code-deep-clone",
      category: "coding",
      difficulty: "intermediate",
      tags: ["objects", "recursion", "clone"],
      question: "Deep clone an object (without structuredClone).",
      answer:
        "<p>Recurse: return primitives as-is, map arrays, and rebuild objects key by key cloning each value. Handle <code class=\"inline\">Date</code>/arrays explicitly. (In real code prefer <code class=\"inline\">structuredClone</code>.)</p>",
      tip: "Mention structuredClone as the modern built-in, but be able to hand-roll it.",
      code: "function deepClone(v) {\n  if (v === null || typeof v !== 'object') return v;\n  if (v instanceof Date) return new Date(v);\n  if (Array.isArray(v)) return v.map(deepClone);\n  return Object.fromEntries(\n    Object.entries(v).map(([k, val]) => [k, deepClone(val)])\n  );\n}",
      lang: "js"
    },
    {
      id: "code-memoize",
      category: "coding",
      difficulty: "intermediate",
      tags: ["closures", "cache", "memoization"],
      question: "Write a generic memoize higher-order function.",
      answer:
        "<p>Cache results in a Map keyed by the serialized arguments; return the cached value on repeat calls. Great for expensive pure functions.</p>",
      tip: "Keying by JSON.stringify(args) is simple but breaks on functions/circular refs — fine for primitives.",
      code: "function memoize(fn) {\n  const cache = new Map();\n  return function (...args) {\n    const key = JSON.stringify(args);\n    if (cache.has(key)) return cache.get(key);\n    const result = fn.apply(this, args);\n    cache.set(key, result);\n    return result;\n  };\n}",
      lang: "js"
    },
    {
      id: "code-curry",
      category: "coding",
      difficulty: "advanced",
      tags: ["closures", "functional", "currying"],
      question: "Implement curry — curry(fn)(a)(b)(c) === fn(a,b,c).",
      answer:
        "<p>Collect arguments across calls; once you have at least <code class=\"inline\">fn.length</code> of them, invoke. Otherwise return a function that keeps gathering. Uses closures + recursion.</p>",
      tip: "fn.length gives the expected arity — that's how you know when to call.",
      code: "function curry(fn) {\n  return function curried(...args) {\n    return args.length >= fn.length\n      ? fn.apply(this, args)\n      : (...next) => curried.apply(this, args.concat(next));\n  };\n}\nconst add = (a, b, c) => a + b + c;\ncurry(add)(1)(2)(3); // 6",
      lang: "js"
    },
    {
      id: "code-promise-all",
      category: "coding",
      difficulty: "advanced",
      tags: ["promise", "async"],
      question: "Implement Promise.all.",
      answer:
        "<p>Return a new Promise. Track a results array and a completion counter; resolve when every input settles, preserving order by index; reject on the first failure.</p>",
      tip: "Preserve order by writing to results[i], not by push — inputs resolve out of order.",
      code: "function promiseAll(promises) {\n  return new Promise((resolve, reject) => {\n    const results = []; let done = 0;\n    if (!promises.length) return resolve(results);\n    promises.forEach((p, i) => {\n      Promise.resolve(p).then(v => {\n        results[i] = v;\n        if (++done === promises.length) resolve(results);\n      }, reject);\n    });\n  });\n}",
      lang: "js"
    },
    {
      id: "code-event-emitter",
      category: "coding",
      difficulty: "advanced",
      tags: ["oop", "pub-sub", "events"],
      question: "Build a simple EventEmitter (on / off / emit).",
      answer:
        "<p>Keep a map of event name → array of listeners. <code class=\"inline\">on</code> pushes, <code class=\"inline\">off</code> filters out, <code class=\"inline\">emit</code> calls each listener with the payload. This is the pub/sub pattern behind RxJS Subjects and Node's EventEmitter.</p>",
      tip: "This is the pattern behind cross-component communication via a shared service.",
      code: "class EventEmitter {\n  constructor() { this.map = {}; }\n  on(e, fn) { (this.map[e] ||= []).push(fn); return () => this.off(e, fn); }\n  off(e, fn) { this.map[e] = (this.map[e] || []).filter(f => f !== fn); }\n  emit(e, ...args) { (this.map[e] || []).forEach(fn => fn(...args)); }\n}",
      lang: "js"
    },
    {
      id: "code-group-by",
      category: "coding",
      difficulty: "intermediate",
      tags: ["array", "reduce", "objects"],
      question: "Group an array of objects by a property.",
      answer:
        "<p>Reduce into an object whose keys are the group values and whose values are arrays. Modern JS also has <code class=\"inline\">Object.groupBy</code>.</p>",
      tip: "reduce with an accumulator object is the canonical group-by pattern.",
      code: "const groupBy = (arr, key) =>\n  arr.reduce((acc, item) => {\n    (acc[item[key]] ||= []).push(item);\n    return acc;\n  }, {});\ngroupBy([{ t: 'a', v: 1 }, { t: 'b', v: 2 }, { t: 'a', v: 3 }], 't');",
      lang: "js"
    },
    {
      id: "code-flatten-object",
      category: "coding",
      difficulty: "advanced",
      tags: ["objects", "recursion"],
      question: "Flatten a nested object to dot-notation keys.",
      answer:
        "<p>Recurse over entries; for nested objects, prefix the parent key with a dot and keep descending; for leaves, assign the flattened key.</p>",
      tip: "Handy for turning nested config into a flat lookup or query params.",
      code: "function flatten(obj, prefix = '', out = {}) {\n  for (const [k, v] of Object.entries(obj)) {\n    const key = prefix ? `${prefix}.${k}` : k;\n    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);\n    else out[key] = v;\n  }\n  return out;\n}\nflatten({ a: { b: { c: 1 } } }); // { 'a.b.c': 1 }",
      lang: "js"
    },
    {
      id: "code-word-frequency",
      category: "coding",
      difficulty: "beginner",
      tags: ["string", "hashmap"],
      question: "Count word frequency in a sentence.",
      answer:
        "<p>Lowercase, split into words, and tally each in a Map/object. Sort by count if you need the most frequent.</p>",
      tip: "A frequency map is a building block for anagrams, top-K, and dedupe problems.",
      code: "function wordFreq(str) {\n  const map = {};\n  for (const w of str.toLowerCase().match(/\\w+/g) || [])\n    map[w] = (map[w] || 0) + 1;\n  return map;\n}",
      lang: "js"
    },
    {
      id: "code-sleep",
      category: "coding",
      difficulty: "beginner",
      tags: ["promise", "async"],
      question: "Write an async sleep(ms) helper.",
      answer:
        "<p>Return a Promise that resolves via <code class=\"inline\">setTimeout</code>. You can then <code class=\"inline\">await sleep(1000)</code> to pause inside an async function.</p>",
      tip: "There's no built-in sleep in JS — this Promise wrapper is the idiom.",
      code: "const sleep = ms => new Promise(res => setTimeout(res, ms));\n\nasync function run() {\n  console.log('start');\n  await sleep(1000);\n  console.log('1s later');\n}",
      lang: "js"
    },
    {
      id: "code-map-polyfill",
      category: "coding",
      difficulty: "advanced",
      tags: ["array", "prototype", "polyfill"],
      question: "Polyfill Array.prototype.map.",
      answer:
        "<p>Add a method to the prototype that loops the array, calls the callback with <code class=\"inline\">(value, index, array)</code>, and pushes each result into a new array — never mutating the original.</p>",
      tip: "Writing a polyfill proves you understand what the built-in actually does.",
      code: "Array.prototype.myMap = function (cb) {\n  const out = [];\n  for (let i = 0; i < this.length; i++) out.push(cb(this[i], i, this));\n  return out;\n};\n[1, 2, 3].myMap(x => x * 2); // [2, 4, 6]",
      lang: "js"
    },
    {
      id: "code-anagram",
      category: "coding",
      difficulty: "beginner",
      tags: ["string", "sorting"],
      question: "Check whether two strings are anagrams.",
      answer:
        "<p>Normalise (lowercase, strip non-word chars), then compare sorted characters — or compare character-frequency maps for O(n) instead of O(n log n).</p>",
      tip: "Frequency-map comparison is O(n); sorting is O(n log n) — mention the tradeoff.",
      code: "const norm = s => s.toLowerCase().replace(/\\W/g, '').split('').sort().join('');\nconst isAnagram = (a, b) => norm(a) === norm(b);\nisAnagram('listen', 'silent'); // true",
      lang: "js"
    },
    {
      id: "code-max-subarray",
      category: "coding",
      difficulty: "intermediate",
      tags: ["array", "kadane", "dynamic-programming"],
      question: "Find the maximum sum of a contiguous subarray (Kadane's).",
      answer:
        "<p>Track the best sum ending at the current index (<code class=\"inline\">cur</code>) and the global best. Extend or restart at each element. O(n) time, O(1) space.</p>",
      tip: "Kadane's algorithm is the classic O(n) DP — restart when the running sum goes negative.",
      code: "function maxSubArray(nums) {\n  let cur = nums[0], best = nums[0];\n  for (let i = 1; i < nums.length; i++) {\n    cur = Math.max(nums[i], cur + nums[i]);\n    best = Math.max(best, cur);\n  }\n  return best;\n}\nmaxSubArray([-2, 1, -3, 4, -1, 2, 1, -5, 4]); // 6",
      lang: "js"
    },

    {
      id: "code-output-order-basic",
      category: "coding",
      difficulty: "intermediate",
      tags: ["V.Imp", "output", "event-loop", "async"],
      question: "Predict the output: sync vs setTimeout vs Promise.",
      answer:
        "<p><strong>Output: 1, 4, 3, 2.</strong></p>" +
        "<p>Synchronous code runs first (<code class=\"inline\">1</code>, then <code class=\"inline\">4</code>). When the stack is empty, the engine drains the <strong>microtask</strong> queue (the Promise <code class=\"inline\">.then</code> → <code class=\"inline\">3</code>) before any <strong>macrotask</strong>. The <code class=\"inline\">setTimeout</code> callback is a macrotask, so <code class=\"inline\">2</code> runs last — even with a <code class=\"inline\">0ms</code> delay.</p>",
      tip: "Microtasks (Promises) always run before macrotasks (setTimeout), no matter the delay.",
      code: "console.log(1);\nsetTimeout(() => console.log(2), 0);\nPromise.resolve().then(() => console.log(3));\nconsole.log(4);\n\n// Output:\n// 1\n// 4\n// 3\n// 2",
      lang: "js",
      deep:
        "<h4>Step-by-step trace</h4>" +
        "<ol>" +
        "<li><code class=\"inline\">console.log(1)</code> runs synchronously → <strong>1</strong>.</li>" +
        "<li><code class=\"inline\">setTimeout(..., 0)</code> hands its callback to the timer API; when ready it's queued as a <strong>macrotask</strong>.</li>" +
        "<li><code class=\"inline\">Promise.resolve().then(...)</code> queues its callback as a <strong>microtask</strong>.</li>" +
        "<li><code class=\"inline\">console.log(4)</code> runs synchronously → <strong>4</strong>.</li>" +
        "<li>Stack is now empty. The event loop <em>fully drains microtasks first</em> → <strong>3</strong>.</li>" +
        "<li>Only then does it take one macrotask → <strong>2</strong>.</li>" +
        "</ol>" +
        "<h4>The rule to memorise</h4>" +
        "<p>After the synchronous code (and after every macrotask), the engine empties the <em>entire</em> microtask queue before running the next macrotask. So Promise callbacks beat <code class=\"inline\">setTimeout</code> every time.</p>"
    },

    {
      id: "code-output-async-await",
      category: "coding",
      difficulty: "advanced",
      tags: ["V.Imp", "output", "async-await", "event-loop"],
      question: "Predict the output: async/await ordering.",
      answer:
        "<p><strong>Output: start, async1 start, async2, end, async1 end, promise, timeout.</strong></p>" +
        "<p>Everything up to the first <code class=\"inline\">await</code> runs synchronously. <code class=\"inline\">await async2()</code> runs <code class=\"inline\">async2</code>'s body now, then schedules the <em>rest</em> of <code class=\"inline\">async1</code> as a microtask. The synchronous script finishes (<code class=\"inline\">end</code>) before any microtask. Microtasks (the <code class=\"inline\">await</code> continuation and the <code class=\"inline\">.then</code>) drain before the <code class=\"inline\">setTimeout</code> macrotask.</p>",
      tip: "Code after an await is a microtask — the surrounding synchronous code always runs first.",
      code: "async function async1() {\n  console.log('async1 start');\n  await async2();\n  console.log('async1 end');\n}\nasync function async2() {\n  console.log('async2');\n}\n\nconsole.log('start');\nsetTimeout(() => console.log('timeout'), 0);\nasync1();\nPromise.resolve().then(() => console.log('promise'));\nconsole.log('end');\n\n// Output:\n// start\n// async1 start\n// async2\n// end\n// async1 end\n// promise\n// timeout",
      lang: "js",
      deep:
        "<h4>Why this order</h4>" +
        "<ol>" +
        "<li><code class=\"inline\">'start'</code> — sync.</li>" +
        "<li><code class=\"inline\">setTimeout</code> — its callback becomes a <strong>macrotask</strong> (parked).</li>" +
        "<li><code class=\"inline\">async1()</code> is called: <code class=\"inline\">'async1 start'</code> runs, then <code class=\"inline\">await async2()</code> executes <code class=\"inline\">async2</code>'s body → <code class=\"inline\">'async2'</code>. The <code class=\"inline\">await</code> now <em>suspends</em> async1 and schedules <code class=\"inline\">'async1 end'</code> as a <strong>microtask</strong>.</li>" +
        "<li>Back in the main script: <code class=\"inline\">Promise.resolve().then</code> queues <code class=\"inline\">'promise'</code> as a microtask, then <code class=\"inline\">'end'</code> runs — sync.</li>" +
        "<li>Stack empties. Microtasks drain in FIFO order: <code class=\"inline\">'async1 end'</code> (queued first), then <code class=\"inline\">'promise'</code>.</li>" +
        "<li>Finally the macrotask: <code class=\"inline\">'timeout'</code>.</li>" +
        "</ol>" +
        "<p><strong>Key idea:</strong> <code class=\"inline\">await x</code> ≈ <code class=\"inline\">x.then(rest)</code>. The line before <code class=\"inline\">await</code> is synchronous; everything after it is a microtask.</p>"
    },

    {
      id: "code-output-loop-settimeout",
      category: "coding",
      difficulty: "intermediate",
      tags: ["V.Imp", "output", "closure", "hoisting"],
      question: "Predict the output: setTimeout inside a for-loop (var vs let).",
      answer:
        "<p>With <code class=\"inline\">var</code> → <strong>3, 3, 3</strong>. With <code class=\"inline\">let</code> → <strong>0, 1, 2</strong>.</p>" +
        "<p><code class=\"inline\">var</code> is function-scoped, so all three callbacks close over the <em>same</em> <code class=\"inline\">i</code>. The loop finishes (i = 3) before any timeout fires, so all log 3. <code class=\"inline\">let</code> is block-scoped and creates a <em>fresh binding each iteration</em>, so each callback captures its own value.</p>",
      tip: "This is the #1 closure gotcha — the fix is simply let (a new binding per iteration).",
      code: "for (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 0);\n}\n// 3, 3, 3\n\nfor (let j = 0; j < 3; j++) {\n  setTimeout(() => console.log(j), 0);\n}\n// 0, 1, 2",
      lang: "js",
      deep:
        "<h4>Why var logs 3, 3, 3</h4>" +
        "<p>There is only one <code class=\"inline\">i</code> for the whole loop. The three <code class=\"inline\">setTimeout</code> callbacks are macrotasks that run <em>after</em> the synchronous loop completes — by then <code class=\"inline\">i === 3</code>. All three read that same final value.</p>" +
        "<h4>Why let logs 0, 1, 2</h4>" +
        "<p>A <code class=\"inline\">let</code> in the loop head is re-bound on every iteration, so each callback closes over a distinct <code class=\"inline\">j</code> holding the value at that iteration.</p>" +
        "<h4>The pre-let fix (IIFE)</h4>" +
        "<pre><code>for (var i = 0; i &lt; 3; i++) {\n  (function (k) {\n    setTimeout(() =&gt; console.log(k), 0);\n  })(i); // capture current i as k → 0, 1, 2\n}</code></pre>"
    },

    {
      id: "code-output-promise-then-timeout",
      category: "coding",
      difficulty: "advanced",
      tags: ["V.Imp", "output", "promise", "event-loop"],
      question: "Predict the output: interleaved Promise chain and setTimeout.",
      answer:
        "<p><strong>Output: script start, script end, promise1, promise2, setTimeout.</strong></p>" +
        "<p>Both <code class=\"inline\">console.log</code>s in the main body are synchronous. The Promise chain runs as microtasks (<code class=\"inline\">promise1</code> then <code class=\"inline\">promise2</code>), and the whole microtask queue drains before the single <code class=\"inline\">setTimeout</code> macrotask.</p>",
      tip: "Each .then in a chain is a separate microtask, but they all still run before any setTimeout.",
      code: "console.log('script start');\n\nsetTimeout(() => console.log('setTimeout'), 0);\n\nPromise.resolve()\n  .then(() => console.log('promise1'))\n  .then(() => console.log('promise2'));\n\nconsole.log('script end');\n\n// Output:\n// script start\n// script end\n// promise1\n// promise2\n// setTimeout",
      lang: "js",
      deep:
        "<h4>Trace</h4>" +
        "<ol>" +
        "<li><code class=\"inline\">'script start'</code> — sync.</li>" +
        "<li><code class=\"inline\">setTimeout</code> callback parked as a macrotask.</li>" +
        "<li>First <code class=\"inline\">.then</code> queued as a microtask.</li>" +
        "<li><code class=\"inline\">'script end'</code> — sync. Stack empty.</li>" +
        "<li>Microtask runs → <code class=\"inline\">'promise1'</code>; its return schedules the next <code class=\"inline\">.then</code> as a <em>new</em> microtask → <code class=\"inline\">'promise2'</code>. The loop keeps draining microtasks until none remain.</li>" +
        "<li>Now a macrotask runs → <code class=\"inline\">'setTimeout'</code>.</li>" +
        "</ol>" +
        "<p>Even though the chain adds microtasks one at a time, the event loop won't touch the timer until the microtask queue is completely empty.</p>"
    },

    {
      id: "code-output-nested-timeout-promise",
      category: "coding",
      difficulty: "advanced",
      tags: ["output", "event-loop", "microtask", "macrotask"],
      question: "Predict the output: microtask queued inside a macrotask.",
      answer:
        "<p><strong>Output: 1, 5, 3, 2, 4.</strong></p>" +
        "<p>Sync first: <code class=\"inline\">1</code>, <code class=\"inline\">5</code>. The stack empties, so the microtask <code class=\"inline\">3</code> runs. Then the timeout macrotask runs <code class=\"inline\">2</code> and, inside it, queues a new microtask. Because the microtask queue is drained again <em>right after</em> that macrotask finishes, <code class=\"inline\">4</code> runs next — before any further macrotask.</p>",
      tip: "After EACH macrotask the microtask queue is drained again — not just once at the start.",
      code: "console.log(1);\n\nsetTimeout(() => {\n  console.log(2);\n  Promise.resolve().then(() => console.log(4));\n}, 0);\n\nPromise.resolve().then(() => console.log(3));\n\nconsole.log(5);\n\n// Output:\n// 1\n// 5\n// 3\n// 2\n// 4",
      lang: "js",
      deep:
        "<h4>Why 4 comes right after 2</h4>" +
        "<p>The critical rule: the microtask queue is drained <strong>after every single macrotask</strong>, not only once. So:</p>" +
        "<ol>" +
        "<li>Sync → <code class=\"inline\">1</code>, <code class=\"inline\">5</code>.</li>" +
        "<li>Drain microtasks → <code class=\"inline\">3</code>.</li>" +
        "<li>Run one macrotask (the timeout) → <code class=\"inline\">2</code>, which <em>queues a new microtask</em> for <code class=\"inline\">4</code>.</li>" +
        "<li>That macrotask finishes; before taking any further work the loop drains microtasks again → <code class=\"inline\">4</code>.</li>" +
        "</ol>" +
        "<p>If there were a second <code class=\"inline\">setTimeout</code>, its callback would only run after <code class=\"inline\">4</code>, because the microtask from the first timeout jumps ahead of the next macrotask.</p>"
    },

    {
      id: "code-output-async-return-then",
      category: "coding",
      difficulty: "advanced",
      tags: ["output", "async-await", "promise"],
      question: "Predict the output: what does an async function return, and when?",
      answer:
        "<p><strong>Output: A, C, B.</strong></p>" +
        "<p>An <code class=\"inline\">async</code> function returns a Promise immediately. Calling <code class=\"inline\">f()</code> runs its body synchronously up to the return (<code class=\"inline\">A</code>), but the <code class=\"inline\">.then</code> attached to the returned Promise (<code class=\"inline\">B</code>) is a microtask. So the synchronous <code class=\"inline\">C</code> after the call runs before <code class=\"inline\">B</code>.</p>",
      tip: "Calling an async function is synchronous up to its first await/return; the .then runs later as a microtask.",
      code: "async function f() {\n  console.log('A');\n  return 'done';\n}\n\nf().then((v) => console.log('B', v));\nconsole.log('C');\n\n// Output:\n// A\n// C\n// B done",
      lang: "js",
      deep:
        "<h4>Key points</h4>" +
        "<ul>" +
        "<li>An <code class=\"inline\">async</code> function <strong>always</strong> returns a Promise; a plain <code class=\"inline\">return x</code> resolves it with <code class=\"inline\">x</code>.</li>" +
        "<li>The body runs synchronously until the first <code class=\"inline\">await</code> or the <code class=\"inline\">return</code> — that's why <code class=\"inline\">A</code> prints during the <code class=\"inline\">f()</code> call.</li>" +
        "<li>The <code class=\"inline\">.then</code> callback is scheduled as a microtask, so it runs after the current synchronous code (<code class=\"inline\">C</code>).</li>" +
        "</ul>" +
        "<p>Corollary: <code class=\"inline\">throw</code> inside an async function rejects its returned Promise — catch it with <code class=\"inline\">.catch()</code> or <code class=\"inline\">try/catch</code> around the <code class=\"inline\">await</code>.</p>"
    }
  ];
})();

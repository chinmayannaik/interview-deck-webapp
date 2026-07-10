/* NgRx / state management question bank. */
(function () {
  window.IQB = window.IQB || {};
  IQB.data = IQB.data || {};

  IQB.data.ngrx = [
    {
      id: "ngrx-flow",
      category: "ngrx",
      difficulty: "intermediate",
      tags: ["store", "action", "reducer", "selector", "effect"],
      question: "Explain the NgRx flow: store, action, reducer, selector, effect.",
      answer:
        "<p>A Redux pattern with <strong>one-way data flow</strong>:</p>" +
        "<ul>" +
        "<li><strong>Store</strong> — single immutable source of truth.</li>" +
        "<li><strong>Action</strong> — a plain event describing what happened.</li>" +
        "<li><strong>Reducer</strong> — pure function <code class=\"inline\">(state, action) → new state</code>, no side effects.</li>" +
        "<li><strong>Selector</strong> — memoised query to read a slice of state.</li>" +
        "<li><strong>Effect</strong> — handles side effects (API calls); listens for an action, does async work, dispatches success/failure.</li>" +
        "</ul>" +
        "<p>Component dispatches → effect calls API → dispatches success → reducer updates store → selector pushes the new value to the component.</p>",
      tip: "Draw the loop on the whiteboard — dispatch → effect → reducer → selector.",
      code: "",
      lang: ""
    },
    {
      id: "ngrx-when-not",
      category: "ngrx",
      difficulty: "intermediate",
      tags: ["architecture", "tradeoffs"],
      question: "When would you NOT use NgRx?",
      answer:
        "<p>NgRx adds boilerplate. Skip it for small apps or local state — a simple <strong>service with a BehaviorSubject</strong> (or Signals) is enough. Reach for NgRx when state is <strong>large, shared across many features, and needs traceability / undo / debugging</strong>.</p>",
      tip: "The senior answer is 'right tool for the size of the app', not 'always use NgRx'.",
      code: "",
      lang: ""
    },
    {
      id: "ngrx-reducer-pure",
      category: "ngrx",
      difficulty: "intermediate",
      tags: ["reducer", "immutability", "pure"],
      question: "Why must reducers be pure and immutable?",
      answer:
        "<p>Purity (same input → same output, no side effects) makes state <strong>predictable, testable, and time-travel debuggable</strong>. Immutability (return a new object, never mutate) lets the store and OnPush components detect changes by reference, keeping change detection fast.</p>",
      tip: "Use the spread operator or an entity adapter — never push/splice existing state.",
      code: "on(loadSuccess, (state, { items }) => ({ ...state, items, loading: false }))",
      lang: "ts"
    },
    {
      id: "ngrx-selectors",
      category: "ngrx",
      difficulty: "intermediate",
      tags: ["selector", "memoization"],
      question: "What are selectors and why are they memoised?",
      answer:
        "<p>Selectors are pure functions that read and derive data from the store. <code class=\"inline\">createSelector</code> <strong>memoises</strong> the result — it recomputes only when its inputs change, avoiding needless recalculation and re-renders.</p>",
      tip: "Compose selectors from smaller ones for reuse and better memoization.",
      code: "export const selectActiveUsers = createSelector(\n  selectUsers,\n  users => users.filter(u => u.active)\n);",
      lang: "ts"
    },
    {
      id: "ngrx-effects",
      category: "ngrx",
      difficulty: "advanced",
      tags: ["effects", "side-effects"],
      question: "What are Effects and why not call APIs in reducers?",
      answer:
        "<p><strong>Effects</strong> isolate side effects (HTTP, routing, storage) from reducers. An effect listens to an action stream, runs async work, and maps it to a new action. Reducers must stay pure, so any I/O belongs in effects.</p>",
      tip: "Use switchMap in effects for cancel-on-new (loads) and concatMap for ordered writes.",
      code: "load$ = createEffect(() => this.actions$.pipe(\n  ofType(load),\n  switchMap(() => this.api.get().pipe(\n    map(items => loadSuccess({ items })),\n    catchError(err => of(loadFailure({ err })))\n  ))\n));",
      lang: "ts"
    },
    {
      id: "ngrx-vs-service",
      category: "ngrx",
      difficulty: "intermediate",
      tags: ["service", "behaviorsubject", "comparison"],
      question: "NgRx store vs a service with BehaviorSubject.",
      answer:
        "<p>A <strong>service + BehaviorSubject</strong> is simple shared state — great for small/medium apps. <strong>NgRx</strong> adds structure: strict unidirectional flow, DevTools time-travel, effects, and clear conventions that scale to large teams — at the cost of boilerplate.</p>",
      tip: "Signals-based stores (NgRx SignalStore, or a plain signal service) are the modern lightweight middle ground.",
      code: "",
      lang: ""
    },
    {
      id: "ngrx-entity",
      category: "ngrx",
      difficulty: "advanced",
      tags: ["entity", "adapter"],
      question: "What is @ngrx/entity?",
      answer:
        "<p>A helper that stores collections in a normalised <code class=\"inline\">{ ids: [], entities: {} }</code> shape and provides an <strong>adapter</strong> with CRUD helpers (<code class=\"inline\">addOne</code>, <code class=\"inline\">updateOne</code>, <code class=\"inline\">removeOne</code>) plus ready-made selectors — removing hand-written immutable array logic.</p>",
      tip: "Normalising by id makes lookups O(1) and updates immutable-friendly.",
      code: "const adapter = createEntityAdapter<User>();\nconst initialState = adapter.getInitialState();",
      lang: "ts"
    },
    {
      id: "ngrx-devtools",
      category: "ngrx",
      difficulty: "beginner",
      tags: ["devtools", "debugging"],
      question: "What do the Redux DevTools give you with NgRx?",
      answer:
        "<p>A visual log of every action, the state before/after, and <strong>time-travel debugging</strong> — you can replay actions and jump to any past state. This traceability is a core reason to adopt NgRx on large apps.</p>",
      tip: "Mention time-travel debugging — it's the standout benefit interviewers look for.",
      code: "StoreDevtoolsModule.instrument({ maxAge: 25 })",
      lang: "ts"
    },
    {
      id: "ngrx-action-hygiene",
      category: "ngrx",
      difficulty: "intermediate",
      tags: ["actions", "best-practices"],
      question: "What's a good convention for naming actions?",
      answer:
        "<p>Use the pattern <code class=\"inline\">[Source] Event</code> — describe <em>what happened</em>, not what to do. Group by feature and event (e.g. <code class=\"inline\">[Auth API] Login Success</code>). Prefer many specific, descriptive actions over a few generic setters.</p>",
      tip: "Actions are events, not commands — name them in the past tense.",
      code: "export const loginSuccess = createAction(\n  '[Auth API] Login Success',\n  props<{ user: User }>()\n);",
      lang: "ts"
    }
  ];
})();

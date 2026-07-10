/* Angular machine-coding challenges — "build this component" round. */
(function () {
  window.IQB = window.IQB || {};
  IQB.data = IQB.data || {};

  IQB.data.ngcoding = [
    {
      id: "ngc-debounced-search",
      category: "ngcoding",
      difficulty: "intermediate",
      tags: ["rxjs", "search", "forms"],
      question: "Build a debounced type-ahead search box.",
      answer:
        "<p>Bind an input to a <code class=\"inline\">FormControl</code>, listen to <code class=\"inline\">valueChanges</code>, then <code class=\"inline\">debounceTime</code> + <code class=\"inline\">distinctUntilChanged</code> + <code class=\"inline\">switchMap</code> to the API so stale requests are cancelled. Render results with the <code class=\"inline\">async</code> pipe.</p>",
      tip: "switchMap is the key — it cancels the in-flight request when the user keeps typing.",
      code: "search = new FormControl('');\nresults$ = this.search.valueChanges.pipe(\n  debounceTime(300),\n  distinctUntilChanged(),\n  switchMap(term => this.api.search(term ?? ''))\n);\n// template: <input [formControl]=\"search\">\n//           <li *ngFor=\"let r of results$ | async\">{{ r.name }}</li>",
      lang: "ts"
    },
    {
      id: "ngc-pagination",
      category: "ngcoding",
      difficulty: "intermediate",
      tags: ["pagination", "list"],
      question: "Build a client-side pagination component.",
      answer:
        "<p>Keep <code class=\"inline\">page</code> and <code class=\"inline\">pageSize</code> in state; derive the current slice with a getter (or computed signal). Render page buttons from <code class=\"inline\">Math.ceil(total / pageSize)</code> and guard prev/next at the bounds.</p>",
      tip: "Derive the visible slice — never mutate the source array when paginating.",
      code: "page = 1; size = 10;\nget paged() {\n  const start = (this.page - 1) * this.size;\n  return this.items.slice(start, start + this.size);\n}\nget pages() { return Math.ceil(this.items.length / this.size); }",
      lang: "ts"
    },
    {
      id: "ngc-infinite-scroll",
      category: "ngcoding",
      difficulty: "advanced",
      tags: ["infinite-scroll", "intersectionobserver"],
      question: "Implement infinite scroll.",
      answer:
        "<p>Place a sentinel element at the list's end and observe it with <code class=\"inline\">IntersectionObserver</code> (or the CDK scrolling module). When it enters the viewport, load and append the next page. Clean up the observer in <code class=\"inline\">ngOnDestroy</code>.</p>",
      tip: "IntersectionObserver beats a scroll-event listener — no throttling needed, less jank.",
      code: "ngAfterViewInit() {\n  this.io = new IntersectionObserver(([e]) => {\n    if (e.isIntersecting) this.loadMore();\n  });\n  this.io.observe(this.sentinel.nativeElement);\n}\nngOnDestroy() { this.io.disconnect(); }",
      lang: "ts"
    },
    {
      id: "ngc-star-rating",
      category: "ngcoding",
      difficulty: "intermediate",
      tags: ["component", "input", "output", "cva"],
      question: "Build a reusable star-rating component.",
      answer:
        "<p>Render N stars from an array; fill up to <code class=\"inline\">value</code>, track a <code class=\"inline\">hover</code> index for preview, and emit the chosen value. For form integration, implement <code class=\"inline\">ControlValueAccessor</code> so it works with <code class=\"inline\">[(ngModel)]</code>/reactive forms.</p>",
      tip: "Implementing ControlValueAccessor turns any widget into a first-class form control.",
      code: "@Input() value = 0;\n@Output() valueChange = new EventEmitter<number>();\nstars = [1, 2, 3, 4, 5];\nset(n: number) { this.value = n; this.valueChange.emit(n); }\n// template: <span *ngFor=\"let s of stars\" (click)=\"set(s)\"\n//             [class.filled]=\"s <= value\">★</span>",
      lang: "ts"
    },
    {
      id: "ngc-modal",
      category: "ngcoding",
      difficulty: "intermediate",
      tags: ["modal", "content-projection"],
      question: "Build a reusable modal/dialog component.",
      answer:
        "<p>Use <code class=\"inline\">*ngIf</code> (or the native <code class=\"inline\">&lt;dialog&gt;</code>) with <code class=\"inline\">ng-content</code> to project arbitrary content. Emit a close event, close on backdrop click and <code class=\"inline\">Esc</code> (<code class=\"inline\">@HostListener</code>), and trap focus for accessibility.</p>",
      tip: "Bonus points for focus trapping and Esc-to-close — that's the accessibility part interviewers watch for.",
      code: "@Input() open = false;\n@Output() closed = new EventEmitter<void>();\n@HostListener('document:keydown.escape') onEsc() { this.close(); }\nclose() { this.open = false; this.closed.emit(); }\n// template: <div class=\"backdrop\" *ngIf=\"open\" (click)=\"close()\">\n//             <div class=\"panel\" (click)=\"$event.stopPropagation()\"><ng-content/></div></div>",
      lang: "ts"
    },
    {
      id: "ngc-todo",
      category: "ngcoding",
      difficulty: "beginner",
      tags: ["crud", "list", "state"],
      question: "Build a todo list (add / toggle / delete / filter).",
      answer:
        "<p>Hold an array of <code class=\"inline\">{ id, text, done }</code>. Add with an incrementing id, toggle by mapping immutably, delete by filtering, and derive the filtered view (all/active/done) with a getter. Keep updates immutable for OnPush.</p>",
      tip: "Update immutably (map/filter returning new arrays) so it plays well with OnPush.",
      code: "add(text: string) { this.todos = [...this.todos, { id: ++this.seq, text, done: false }]; }\ntoggle(id: number) { this.todos = this.todos.map(t => t.id === id ? { ...t, done: !t.done } : t); }\nremove(id: number) { this.todos = this.todos.filter(t => t.id !== id); }",
      lang: "ts"
    },
    {
      id: "ngc-data-table",
      category: "ngcoding",
      difficulty: "advanced",
      tags: ["table", "sorting", "generics"],
      question: "Build a reusable sortable data table.",
      answer:
        "<p>Accept <code class=\"inline\">columns</code> and <code class=\"inline\">rows</code> as inputs; use <code class=\"inline\">ng-template</code> with <code class=\"inline\">ngTemplateOutlet</code> for custom cell rendering. Sort by a clicked column, toggling asc/desc, on an immutable copy. Add <code class=\"inline\">trackBy</code> for performance.</p>",
      tip: "Generic inputs + a template for cells is what makes a table truly reusable.",
      code: "sort(col: string) {\n  this.dir = this.sortKey === col && this.dir === 'asc' ? 'desc' : 'asc';\n  this.sortKey = col;\n  this.rows = [...this.rows].sort((a, b) =>\n    (a[col] > b[col] ? 1 : -1) * (this.dir === 'asc' ? 1 : -1));\n}",
      lang: "ts"
    },
    {
      id: "ngc-tabs",
      category: "ngcoding",
      difficulty: "intermediate",
      tags: ["tabs", "content-projection", "contentchildren"],
      question: "Build a tabs component with content projection.",
      answer:
        "<p>Create a <code class=\"inline\">TabComponent</code> (with a title input and a projected body) and a <code class=\"inline\">TabsComponent</code> that collects them via <code class=\"inline\">@ContentChildren</code>. Render the tab headers, track the active one, and show only its content.</p>",
      tip: "@ContentChildren(TabComponent) is the pattern that powers Material tabs.",
      code: "@ContentChildren(TabComponent) tabs!: QueryList<TabComponent>;\nngAfterContentInit() { this.select(this.tabs.first); }\nselect(tab: TabComponent) { this.tabs.forEach(t => (t.active = t === tab)); }",
      lang: "ts"
    },
    {
      id: "ngc-countdown",
      category: "ngcoding",
      difficulty: "intermediate",
      tags: ["rxjs", "timer"],
      question: "Build a countdown timer.",
      answer:
        "<p>Use RxJS <code class=\"inline\">timer(0, 1000)</code> to tick each second, map to the remaining time, <code class=\"inline\">takeWhile</code> until zero, and render via the <code class=\"inline\">async</code> pipe (auto-unsubscribes). Avoids manual <code class=\"inline\">setInterval</code> cleanup.</p>",
      tip: "The async pipe + takeWhile means zero manual subscription management.",
      code: "remaining$ = timer(0, 1000).pipe(\n  map(i => this.duration - i),\n  takeWhile(v => v >= 0)\n);\n// template: {{ remaining$ | async }}s",
      lang: "ts"
    },
    {
      id: "ngc-dynamic-form",
      category: "ngcoding",
      difficulty: "advanced",
      tags: ["forms", "formarray", "dynamic"],
      question: "Build a form with a dynamic list of fields.",
      answer:
        "<p>Use a <code class=\"inline\">FormArray</code> of controls/groups. Provide <code class=\"inline\">add()</code> (push a new control) and <code class=\"inline\">remove(i)</code> (<code class=\"inline\">removeAt</code>), and iterate <code class=\"inline\">controls</code> in the template with the array's <code class=\"inline\">formArrayName</code>.</p>",
      tip: "FormArray is the canonical answer to 'add/remove fields at runtime'.",
      code: "form = this.fb.group({ items: this.fb.array([]) });\nget items() { return this.form.get('items') as FormArray; }\nadd() { this.items.push(this.fb.control('', Validators.required)); }\nremove(i: number) { this.items.removeAt(i); }",
      lang: "ts"
    }
  ];
})();

/* Angular question bank. Registers into the global IQB namespace so the app
   works both when opened directly (file://) and when served on Netlify. */
(function () {
  window.IQB = window.IQB || {};
  IQB.data = IQB.data || {};

  IQB.data.angular = [
    {
      id: "ng-what-is",
      category: "angular",
      difficulty: "beginner",
      tags: ["basics", "spa", "framework"],
      question: "What is Angular and how is it different from AngularJS?",
      answer:
        "<p><strong>Angular</strong> (v2+) is a TypeScript-based, component-driven SPA framework by Google. It ships a full platform: components, dependency injection, routing, forms, HTTP, and RxJS.</p>" +
        "<p><strong>AngularJS</strong> (v1.x) was JavaScript-based and used controllers, scopes, and two-way digest-cycle binding. Angular is a complete rewrite: component architecture, a hierarchical injector, AOT compilation, and far better performance.</p>",
      tip: "Say \"Angular\" for 2+ and \"AngularJS\" only for 1.x — interviewers notice the distinction.",
      code: "",
      lang: ""
    },
    {
      id: "ng-lifecycle",
      category: "angular",
      difficulty: "intermediate",
      tags: ["lifecycle", "hooks", "ngOnInit"],
      question: "Lifecycle hooks — order and what each is for.",
      answer:
        "<p>Order: <code class=\"inline\">constructor</code> → <code class=\"inline\">ngOnChanges</code> → <code class=\"inline\">ngOnInit</code> → <code class=\"inline\">ngDoCheck</code> → <code class=\"inline\">ngAfterContentInit</code> → <code class=\"inline\">ngAfterContentChecked</code> → <code class=\"inline\">ngAfterViewInit</code> → <code class=\"inline\">ngAfterViewChecked</code> → <code class=\"inline\">ngOnDestroy</code>.</p>" +
        "<ul>" +
        "<li><strong>ngOnChanges</strong> — runs when an <code class=\"inline\">@Input</code> changes (receives <code class=\"inline\">SimpleChanges</code>).</li>" +
        "<li><strong>ngOnInit</strong> — one-time init; fetch data here, not in the constructor.</li>" +
        "<li><strong>ngAfterViewInit</strong> — view and <code class=\"inline\">@ViewChild</code> refs are ready.</li>" +
        "<li><strong>ngOnDestroy</strong> — cleanup: unsubscribe, clear timers.</li>" +
        "</ul>",
      tip: "The constructor is for dependency injection only; the DOM and inputs aren't ready yet — do real work in ngOnInit.",
      code: "",
      lang: ""
    },
    {
      id: "ng-binding",
      category: "angular",
      difficulty: "beginner",
      tags: ["data-binding", "template"],
      question: "What are the types of data binding?",
      answer:
        "<ul>" +
        "<li><strong>Interpolation</strong> — <code class=\"inline\">{{ value }}</code> (component → view).</li>" +
        "<li><strong>Property binding</strong> — <code class=\"inline\">[src]=\"url\"</code> (component → view).</li>" +
        "<li><strong>Event binding</strong> — <code class=\"inline\">(click)=\"fn()\"</code> (view → component).</li>" +
        "<li><strong>Two-way binding</strong> — <code class=\"inline\">[(ngModel)]=\"name\"</code> (both directions; the \"banana in a box\").</li>" +
        "</ul>",
      tip: "Two-way binding is just property + event binding combined under the hood.",
      code: "",
      lang: ""
    },
    {
      id: "ng-directives",
      category: "angular",
      difficulty: "beginner",
      tags: ["directives", "structural", "attribute"],
      question: "What are the types of directives?",
      answer:
        "<ul>" +
        "<li><strong>Component</strong> — a directive with a template (the most common).</li>" +
        "<li><strong>Structural</strong> — change DOM layout: <code class=\"inline\">*ngIf</code>, <code class=\"inline\">*ngFor</code>, <code class=\"inline\">*ngSwitch</code> (v17+: <code class=\"inline\">@if</code>, <code class=\"inline\">@for</code>).</li>" +
        "<li><strong>Attribute</strong> — change appearance/behaviour: <code class=\"inline\">ngClass</code>, <code class=\"inline\">ngStyle</code>, or your own.</li>" +
        "</ul>",
      tip: "The leading * on structural directives is sugar for an <ng-template> wrapper.",
      code: "",
      lang: ""
    },
    {
      id: "ng-component-comm",
      category: "angular",
      difficulty: "intermediate",
      tags: ["input", "output", "communication"],
      question: "How do components communicate with each other?",
      answer:
        "<ul>" +
        "<li><strong>Parent → child</strong>: <code class=\"inline\">@Input()</code>.</li>" +
        "<li><strong>Child → parent</strong>: <code class=\"inline\">@Output()</code> with an <code class=\"inline\">EventEmitter</code>.</li>" +
        "<li><strong>Unrelated components</strong>: a shared service with a <code class=\"inline\">BehaviorSubject</code> (or a signal / NgRx store).</li>" +
        "<li><strong>Parent accessing child</strong>: <code class=\"inline\">@ViewChild</code>.</li>" +
        "</ul>",
      tip: "For siblings/unrelated components, prefer a shared service over chaining inputs and outputs.",
      code: "@Output() saved = new EventEmitter<Item>();\nonSave() { this.saved.emit(this.item); }",
      lang: "ts"
    },
    {
      id: "ng-di",
      category: "angular",
      difficulty: "intermediate",
      tags: ["dependency-injection", "services", "providedIn"],
      question: "Explain Dependency Injection and providedIn:'root'.",
      answer:
        "<p>Angular has a hierarchical <strong>injector</strong>. You declare a dependency in a constructor and Angular supplies the instance. A <strong>service</strong> is a class holding shared logic/state, injected wherever needed.</p>" +
        "<p><code class=\"inline\">@Injectable({ providedIn: 'root' })</code> registers the service once as an app-wide <strong>singleton</strong> and makes it tree-shakable. Providing it at component level instead gives each component its own instance.</p>",
      tip: "Tree-shakable providers (providedIn) are preferred over listing services in NgModule providers.",
      code: "@Injectable({ providedIn: 'root' })\nexport class UserService {}",
      lang: "ts"
    },
    {
      id: "ng-forms",
      category: "angular",
      difficulty: "intermediate",
      tags: ["forms", "reactive", "template-driven"],
      question: "Template-driven vs Reactive forms — which and why?",
      answer:
        "<p><strong>Template-driven</strong> — logic lives in the template via <code class=\"inline\">ngModel</code>; quick, good for simple forms.</p>" +
        "<p><strong>Reactive</strong> — the form model is defined in the TS class (<code class=\"inline\">FormGroup</code>, <code class=\"inline\">FormControl</code>, <code class=\"inline\">FormBuilder</code>); explicit, testable, and better for complex or dynamic validation.</p>",
      tip: "For anything non-trivial, reach for Reactive forms — they're easier to unit test.",
      code: "form = this.fb.group({\n  email: ['', [Validators.required, Validators.email]],\n});",
      lang: "ts"
    },
    {
      id: "ng-routing",
      category: "angular",
      difficulty: "intermediate",
      tags: ["routing", "lazy-loading", "guards", "resolver"],
      question: "Explain routing: lazy loading, guards, and resolvers.",
      answer:
        "<ul>" +
        "<li><strong>Lazy loading</strong> — load a feature only when visited via <code class=\"inline\">loadChildren</code> / <code class=\"inline\">loadComponent</code>. Smaller initial bundle, faster first paint.</li>" +
        "<li><strong>Guards</strong> — <code class=\"inline\">CanActivate</code> (auth), <code class=\"inline\">CanDeactivate</code> (unsaved-changes prompt), <code class=\"inline\">CanMatch</code>.</li>" +
        "<li><strong>Resolver</strong> — pre-fetch data before the route activates so the component opens with data ready.</li>" +
        "</ul>",
      tip: "Lazy loading is the single biggest lever for initial load performance in large apps.",
      code: "{ path: 'admin', loadComponent: () =>\n  import('./admin.component').then(m => m.AdminComponent) }",
      lang: "ts"
    },
    {
      id: "ng-interceptor",
      category: "angular",
      difficulty: "intermediate",
      tags: ["http", "interceptor", "jwt"],
      question: "What are HTTP interceptors used for?",
      answer:
        "<p>Middleware for every HTTP request/response. Common uses: <strong>attach the JWT auth token</strong>, add headers, show a global loader, log requests, and <strong>handle errors / 401 refresh</strong> centrally.</p>" +
        "<p>Implement <code class=\"inline\">HttpInterceptor</code>, or a functional interceptor in modern Angular.</p>",
      tip: "Interceptors run in the order they're provided — put auth before logging.",
      code: "intercept(req, next) {\n  const cloned = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });\n  return next.handle(cloned);\n}",
      lang: "ts"
    },
    {
      id: "ng-content",
      category: "angular",
      difficulty: "intermediate",
      tags: ["content-projection", "viewchild", "ng-content"],
      question: "Explain content projection (ng-content) and ViewChild/ContentChild.",
      answer:
        "<p><strong>ng-content</strong> projects markup that a parent passes into a child (like slots) — key for reusable UI such as cards and modals.</p>" +
        "<p><strong>@ViewChild</strong> references an element/component in <em>this</em> template; <strong>@ContentChild</strong> references projected content. They're ready in <code class=\"inline\">ngAfterViewInit</code> and <code class=\"inline\">ngAfterContentInit</code> respectively.</p>",
      tip: "Use multi-slot projection with select: <ng-content select=\"[header]\">.",
      code: "",
      lang: ""
    },
    {
      id: "ng-cd",
      category: "angular",
      difficulty: "advanced",
      tags: ["change-detection", "onpush", "zone"],
      question: "How does change detection work? Default vs OnPush.",
      answer:
        "<p><code class=\"inline\">zone.js</code> patches async APIs and tells Angular to re-check the component tree after events. The <strong>Default</strong> strategy checks every component each cycle.</p>" +
        "<p><strong>OnPush</strong> only re-checks a component when: an <code class=\"inline\">@Input</code> reference changes, an event fires inside it, or an <code class=\"inline\">async</code> pipe emits. Combined with <strong>immutable data</strong> it drastically cuts re-renders. (Signals push toward zone-less change detection.)</p>",
      tip: "OnPush + immutable data is the highest-impact perf change you can describe in an interview.",
      code: "@Component({ changeDetection: ChangeDetectionStrategy.OnPush })",
      lang: "ts"
    },
    {
      id: "ng-perf",
      category: "angular",
      difficulty: "advanced",
      tags: ["performance", "trackBy", "lazy-loading"],
      question: "List concrete performance optimisations in Angular.",
      answer:
        "<ul>" +
        "<li><code class=\"inline\">ChangeDetectionStrategy.OnPush</code> + immutable data.</li>" +
        "<li><code class=\"inline\">trackBy</code> in <code class=\"inline\">*ngFor</code> (or <code class=\"inline\">track</code> in <code class=\"inline\">@for</code>) to reuse DOM nodes.</li>" +
        "<li><strong>Lazy load</strong> feature routes; add a preloading strategy for the rest.</li>" +
        "<li><strong>Pure pipes</strong> instead of method calls in templates.</li>" +
        "<li><strong>Virtual scrolling</strong> (<code class=\"inline\">cdk-virtual-scroll</code>) for long lists.</li>" +
        "<li><strong>async pipe</strong> to avoid manual-subscription leaks.</li>" +
        "</ul>",
      tip: "Never call a method in a template binding — it runs on every change-detection cycle.",
      code: "",
      lang: ""
    },
    {
      id: "ng-pipes",
      category: "angular",
      difficulty: "intermediate",
      tags: ["pipes", "pure", "impure"],
      question: "Pure vs impure pipes — and what is a pipe?",
      answer:
        "<p>A <strong>pipe</strong> transforms a value in the template (<code class=\"inline\">{{ date | date:'short' }}</code>).</p>" +
        "<p><strong>Pure</strong> (default) — recomputes only when the input reference changes; cheap. <strong>Impure</strong> — runs every change-detection cycle (e.g. <code class=\"inline\">async</code>, or a filter over a mutating array); powerful but costly, use sparingly.</p>",
      tip: "The async pipe is impure by necessity — it must react to new emissions.",
      code: "@Pipe({ name: 'myFilter', pure: false })",
      lang: "ts"
    },
    {
      id: "ng-signals",
      category: "angular",
      difficulty: "advanced",
      tags: ["signals", "reactivity", "modern"],
      question: "What are Signals? How do they differ from RxJS?",
      answer:
        "<p><strong>Signals</strong> (v16+) are a fine-grained reactivity primitive: a wrapper around a value that notifies consumers when it changes, enabling precise, zone-less change detection.</p>" +
        "<p><strong>vs RxJS:</strong> signals are synchronous, always hold a current value, and are ideal for <em>local component state</em>. RxJS is for <em>streams / async events over time</em>. They interoperate via <code class=\"inline\">toSignal</code> / <code class=\"inline\">toObservable</code>.</p>",
      tip: "Mention Signals even for older-Angular roles — it signals you keep up with the framework.",
      code: "count = signal(0);\ndouble = computed(() => this.count() * 2);\neffect(() => console.log(this.count()));\nthis.count.set(1); // or .update(v => v + 1)",
      lang: "ts"
    },
    {
      id: "ng-standalone",
      category: "angular",
      difficulty: "intermediate",
      tags: ["standalone", "control-flow", "modern"],
      question: "What are standalone components and the new control flow?",
      answer:
        "<p><strong>Standalone components</strong> (v14+, default in v17) drop <code class=\"inline\">NgModule</code> — a component declares its own <code class=\"inline\">imports</code>. Simpler, less boilerplate.</p>" +
        "<p><strong>Built-in control flow</strong> (v17): <code class=\"inline\">@if</code>, <code class=\"inline\">@for</code> (requires <code class=\"inline\">track</code>), and <code class=\"inline\">@switch</code> — replaces <code class=\"inline\">*ngIf</code>/<code class=\"inline\">*ngFor</code>, and is faster.</p>",
      tip: "@for requires a track expression — it's not optional like trackBy was.",
      code: "@for (item of items; track item.id) {\n  <li>{{ item.name }}</li>\n} @empty {\n  <li>No items</li>\n}",
      lang: "html"
    },
    {
      id: "ng-view-encapsulation",
      category: "angular",
      difficulty: "intermediate",
      tags: ["styles", "encapsulation", "shadow-dom"],
      question: "What is View Encapsulation?",
      answer:
        "<p>Controls how a component's styles are scoped:</p>" +
        "<ul>" +
        "<li><strong>Emulated</strong> (default) — Angular adds attribute selectors so styles don't leak; no real Shadow DOM.</li>" +
        "<li><strong>ShadowDom</strong> — uses native Shadow DOM for true isolation.</li>" +
        "<li><strong>None</strong> — styles are global.</li>" +
        "</ul>",
      tip: "Use ::ng-deep sparingly to pierce encapsulation — it's deprecated and leaks globally.",
      code: "@Component({ encapsulation: ViewEncapsulation.Emulated })",
      lang: "ts"
    },
    {
      id: "ng-aot",
      category: "angular",
      difficulty: "intermediate",
      tags: ["compilation", "aot", "jit"],
      question: "AOT vs JIT compilation.",
      answer:
        "<p><strong>AOT</strong> (Ahead-of-Time) compiles templates at <em>build</em> time — smaller bundles, faster rendering, template errors caught early, safer. It's the default for production.</p>" +
        "<p><strong>JIT</strong> (Just-in-Time) compiles in the browser at runtime — historically used in development.</p>",
      tip: "Modern Angular (Ivy) uses AOT everywhere by default.",
      code: "",
      lang: ""
    },
    {
      id: "ng-viewchild-static",
      category: "angular",
      difficulty: "advanced",
      tags: ["viewchild", "timing"],
      question: "What does the static flag on @ViewChild do?",
      answer:
        "<p><code class=\"inline\">@ViewChild(ref, { static: true })</code> resolves the query <strong>before</strong> change detection, so it's available in <code class=\"inline\">ngOnInit</code> — use only for elements that are always present.</p>" +
        "<p><code class=\"inline\">static: false</code> (default) resolves after the view initialises, available in <code class=\"inline\">ngAfterViewInit</code> — required if the element is inside an <code class=\"inline\">*ngIf</code>/<code class=\"inline\">*ngFor</code>.</p>",
      tip: "If a ViewChild is undefined, it's almost always a static/timing issue.",
      code: "@ViewChild('chart', { static: false }) chart!: ElementRef;",
      lang: "ts"
    },
    {
      id: "ng-hostlistener",
      category: "angular",
      difficulty: "intermediate",
      tags: ["directives", "hostlistener", "hostbinding"],
      question: "What are @HostListener and @HostBinding?",
      answer:
        "<p>Used in directives to interact with the host element without touching the DOM directly.</p>" +
        "<ul>" +
        "<li><strong>@HostListener</strong> — subscribe to a host event (<code class=\"inline\">@HostListener('click')</code>).</li>" +
        "<li><strong>@HostBinding</strong> — bind a host property/class/style (<code class=\"inline\">@HostBinding('class.active')</code>).</li>" +
        "</ul>",
      tip: "Prefer these over Renderer2 for simple host interactions — they're declarative.",
      code: "@HostBinding('class.open') isOpen = false;\n@HostListener('click') toggle() { this.isOpen = !this.isOpen; }",
      lang: "ts"
    },
    {
      id: "ng-template-container",
      category: "angular",
      difficulty: "intermediate",
      tags: ["ng-template", "ng-container"],
      question: "Difference between ng-template, ng-container, and ng-content?",
      answer:
        "<ul>" +
        "<li><strong>ng-template</strong> — a template block that is <em>not</em> rendered until referenced (e.g. by a structural directive or <code class=\"inline\">ngTemplateOutlet</code>).</li>" +
        "<li><strong>ng-container</strong> — a logical grouping wrapper that adds <em>no</em> element to the DOM (great for applying <code class=\"inline\">*ngIf</code> without an extra div).</li>" +
        "<li><strong>ng-content</strong> — a projection slot for parent-supplied markup.</li>" +
        "</ul>",
      tip: "Use ng-container to combine structural directives without wrapper divs.",
      code: "",
      lang: ""
    },
    {
      id: "ng-async-pipe",
      category: "angular",
      difficulty: "intermediate",
      tags: ["async-pipe", "rxjs", "subscription"],
      question: "Why is the async pipe preferred over manual subscription?",
      answer:
        "<p>The <code class=\"inline\">async</code> pipe subscribes to an Observable/Promise, renders the latest value, and <strong>automatically unsubscribes</strong> when the component is destroyed — eliminating a whole class of memory leaks.</p>" +
        "<p>It also plays well with <code class=\"inline\">OnPush</code>: an emission marks the component for check.</p>",
      tip: "Use a single async pipe with *ngIf ... as to avoid multiple subscriptions to the same stream.",
      code: "<div *ngIf=\"user$ | async as user\">{{ user.name }}</div>",
      lang: "html"
    },
    {
      id: "ng-renderer",
      category: "angular",
      difficulty: "advanced",
      tags: ["dom", "renderer2", "security"],
      question: "Why use Renderer2 instead of direct DOM access?",
      answer:
        "<p><code class=\"inline\">Renderer2</code> abstracts DOM manipulation so your code works in environments without a real DOM (server-side rendering, web workers) and keeps Angular's security model intact.</p>" +
        "<p>Avoid <code class=\"inline\">document</code> / <code class=\"inline\">nativeElement.innerHTML</code> directly — they break SSR and open XSS risks.</p>",
      tip: "Mention SSR (Angular Universal) as the main reason to avoid direct DOM access.",
      code: "constructor(private r: Renderer2, private el: ElementRef) {}\nngOnInit() { this.r.addClass(this.el.nativeElement, 'active'); }",
      lang: "ts"
    },
    {
      id: "ng-module",
      category: "angular",
      difficulty: "beginner",
      tags: ["ngmodule", "architecture"],
      question: "What is an NgModule and what are its main metadata fields?",
      answer:
        "<p>An <code class=\"inline\">@NgModule</code> groups related code into a cohesive block. Key fields:</p>" +
        "<ul>" +
        "<li><strong>declarations</strong> — components, directives, pipes owned by this module.</li>" +
        "<li><strong>imports</strong> — other modules whose exports this module needs.</li>" +
        "<li><strong>exports</strong> — what this module makes available to importers.</li>" +
        "<li><strong>providers</strong> — services (module-level DI).</li>" +
        "<li><strong>bootstrap</strong> — the root component (AppModule only).</li>" +
        "</ul>",
      tip: "Modern Angular is moving to standalone components — mention NgModules are no longer required in v17+.",
      code: "",
      lang: ""
    },
    {
      id: "ng-cdref",
      category: "angular",
      difficulty: "advanced",
      tags: ["change-detection", "changedetectorref", "onpush"],
      question: "What does ChangeDetectorRef do (markForCheck, detectChanges, detach)?",
      answer:
        "<p><code class=\"inline\">ChangeDetectorRef</code> gives you manual control over change detection, mainly with OnPush:</p>" +
        "<ul>" +
        "<li><strong>markForCheck()</strong> — marks this component and ancestors to be checked in the next cycle (async data updated outside Angular).</li>" +
        "<li><strong>detectChanges()</strong> — runs change detection on this component subtree immediately.</li>" +
        "<li><strong>detach() / reattach()</strong> — remove/add the component from the CD tree for extreme perf tuning.</li>" +
        "</ul>",
      tip: "With OnPush, if a value changes but the view doesn't update, you usually need markForCheck().",
      code: "constructor(private cdr: ChangeDetectorRef) {}\nupdate() { this.data = next; this.cdr.markForCheck(); }",
      lang: "ts"
    },
    {
      id: "ng-injection-token",
      category: "angular",
      difficulty: "advanced",
      tags: ["dependency-injection", "injectiontoken"],
      question: "What is an InjectionToken and why use one?",
      answer:
        "<p>Interfaces and primitives disappear at runtime, so they can't be DI keys. An <code class=\"inline\">InjectionToken</code> is a unique, type-safe token used to inject non-class values — config objects, feature flags, strings, or interface-typed values.</p>",
      tip: "Use InjectionToken for app config so it's mockable in tests and typed.",
      code: "export const API_URL = new InjectionToken<string>('API_URL');\n// provide: { provide: API_URL, useValue: 'https://api...' }\n// inject: constructor(@Inject(API_URL) private url: string) {}",
      lang: "ts"
    },
    {
      id: "ng-provider-recipes",
      category: "angular",
      difficulty: "advanced",
      tags: ["dependency-injection", "providers"],
      question: "Explain useClass, useValue, useExisting, useFactory.",
      answer:
        "<ul>" +
        "<li><strong>useClass</strong> — provide a class (can swap the implementation, e.g. a mock).</li>" +
        "<li><strong>useValue</strong> — provide a ready value/object.</li>" +
        "<li><strong>useExisting</strong> — alias one token to another (share a single instance).</li>" +
        "<li><strong>useFactory</strong> — build the value with a function (with <code class=\"inline\">deps</code>) for conditional logic.</li>" +
        "</ul>" +
        "<p>Add <code class=\"inline\">multi: true</code> to contribute several values under one token (e.g. HTTP interceptors).</p>",
      tip: "useClass is how you swap a real service for a mock in tests.",
      code: "{ provide: Logger, useClass: ConsoleLogger }\n{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }",
      lang: "ts"
    },
    {
      id: "ng-custom-pipe",
      category: "angular",
      difficulty: "intermediate",
      tags: ["pipes", "custom-pipe"],
      question: "How do you create a custom pipe?",
      answer:
        "<p>Implement <code class=\"inline\">PipeTransform</code> and decorate with <code class=\"inline\">@Pipe</code>. The <code class=\"inline\">transform</code> method receives the value plus any arguments and returns the transformed result. Keep pipes pure and side-effect free.</p>",
      tip: "Prefer a pure pipe over a component method for template transforms — it only recomputes when inputs change.",
      code: "@Pipe({ name: 'truncate', standalone: true })\nexport class TruncatePipe implements PipeTransform {\n  transform(v: string, max = 20) { return v.length > max ? v.slice(0, max) + '…' : v; }\n}",
      lang: "ts"
    },
    {
      id: "ng-custom-attr-directive",
      category: "angular",
      difficulty: "intermediate",
      tags: ["directives", "custom-directive"],
      question: "How do you build a custom attribute directive?",
      answer:
        "<p>Decorate a class with <code class=\"inline\">@Directive</code>, inject <code class=\"inline\">ElementRef</code> (and optionally <code class=\"inline\">Renderer2</code>), and react to inputs/host events. Attribute directives change appearance or behaviour without a template.</p>",
      tip: "Use @HostListener/@HostBinding inside directives instead of touching the DOM directly.",
      code: "@Directive({ selector: '[appHighlight]', standalone: true })\nexport class HighlightDirective {\n  @HostBinding('style.background') bg = '';\n  @HostListener('mouseenter') on() { this.bg = 'yellow'; }\n  @HostListener('mouseleave') off() { this.bg = ''; }\n}",
      lang: "ts"
    },
    {
      id: "ng-custom-structural-directive",
      category: "angular",
      difficulty: "advanced",
      tags: ["directives", "structural", "templateref"],
      question: "How do custom structural directives work (TemplateRef + ViewContainerRef)?",
      answer:
        "<p>A structural directive (the <code class=\"inline\">*</code> syntax) injects <code class=\"inline\">TemplateRef</code> (the template to render) and <code class=\"inline\">ViewContainerRef</code> (where to render it). You conditionally create or clear the embedded view — exactly how <code class=\"inline\">*ngIf</code> works internally.</p>",
      tip: "The leading * desugars to an <ng-template> wrapper the directive controls.",
      code: "@Directive({ selector: '[appIf]', standalone: true })\nexport class IfDirective {\n  constructor(private tpl: TemplateRef<any>, private vcr: ViewContainerRef) {}\n  @Input() set appIf(cond: boolean) {\n    this.vcr.clear();\n    if (cond) this.vcr.createEmbeddedView(this.tpl);\n  }\n}",
      lang: "ts"
    },
    {
      id: "ng-input-setter",
      category: "angular",
      difficulty: "intermediate",
      tags: ["input", "setter", "ngonchanges"],
      question: "Input setter vs ngOnChanges — when to react to input changes?",
      answer:
        "<p>Both let you react when an <code class=\"inline\">@Input</code> updates. A <strong>setter</strong> is concise and per-property (transform/validate one input). <strong>ngOnChanges</strong> receives all changed inputs together in one <code class=\"inline\">SimpleChanges</code> object — better when logic depends on several inputs at once.</p>",
      tip: "Use a setter for one input, ngOnChanges when multiple inputs must be considered together.",
      code: "private _id = 0;\n@Input() set id(v: number) { this._id = v; this.reload(v); }\nget id() { return this._id; }",
      lang: "ts"
    },
    {
      id: "ng-two-way-custom",
      category: "angular",
      difficulty: "advanced",
      tags: ["two-way-binding", "input", "output"],
      question: "How do you make a custom two-way bindable property?",
      answer:
        "<p>Two-way binding <code class=\"inline\">[(x)]</code> is sugar for an <code class=\"inline\">@Input() x</code> plus an <code class=\"inline\">@Output() xChange</code> that follows the <code class=\"inline\">&lt;prop&gt;Change</code> naming convention. In v17.2+ a single <code class=\"inline\">model()</code> signal does both.</p>",
      tip: "The naming convention (valueChange) is what enables the banana-in-a-box on your own component.",
      code: "@Input() value = 0;\n@Output() valueChange = new EventEmitter<number>();\nupdate(v: number) { this.value = v; this.valueChange.emit(v); }",
      lang: "ts"
    },
    {
      id: "ng-formarray",
      category: "angular",
      difficulty: "advanced",
      tags: ["forms", "formarray", "dynamic-forms"],
      question: "What is a FormArray and when do you use it?",
      answer:
        "<p><code class=\"inline\">FormArray</code> manages a dynamic, indexed list of controls/groups — add/remove fields at runtime (e.g. a variable list of phone numbers or line items). Iterate <code class=\"inline\">controls</code> in the template and push/removeAt in code.</p>",
      tip: "FormArray is the answer to 'how would you build a form with a dynamic number of fields'.",
      code: "phones = this.fb.array([this.fb.control('')]);\naddPhone() { this.phones.push(this.fb.control('')); }",
      lang: "ts"
    },
    {
      id: "ng-custom-validator",
      category: "angular",
      difficulty: "advanced",
      tags: ["forms", "validators"],
      question: "How do you write sync and async custom validators?",
      answer:
        "<p>A <strong>sync validator</strong> is a function <code class=\"inline\">(control) =&gt; ValidationErrors | null</code>. An <strong>async validator</strong> returns an Observable/Promise of the same — used for server checks like 'is this username taken?'. Attach them when building the control.</p>",
      tip: "Async validators debounce well with the updateOn: 'blur' option to avoid hammering the server.",
      code: "function noSpaces(c: AbstractControl) {\n  return /\\s/.test(c.value) ? { spaces: true } : null;\n}\nnew FormControl('', [Validators.required, noSpaces]);",
      lang: "ts"
    },
    {
      id: "ng-route-params",
      category: "angular",
      difficulty: "intermediate",
      tags: ["routing", "activatedroute", "params"],
      question: "How do you read route params — snapshot vs observable?",
      answer:
        "<p>Inject <code class=\"inline\">ActivatedRoute</code>. Use <code class=\"inline\">snapshot.paramMap</code> for a one-time read. Subscribe to <code class=\"inline\">paramMap</code> (Observable) when the same component instance is reused across param changes (e.g. navigating /user/1 → /user/2) so it reacts to the new id.</p>",
      tip: "If your detail page doesn't refresh when the id changes, you used snapshot where you needed the observable.",
      code: "this.route.paramMap.subscribe(p => this.load(p.get('id')));\n// query params: this.route.queryParamMap",
      lang: "ts"
    },
    {
      id: "ng-guard-functional",
      category: "angular",
      difficulty: "intermediate",
      tags: ["routing", "guards", "functional"],
      question: "What does a modern functional route guard look like?",
      answer:
        "<p>Since v14+, guards are plain functions (<code class=\"inline\">CanActivateFn</code>) that use <code class=\"inline\">inject()</code> — no class needed. They return <code class=\"inline\">true</code>, <code class=\"inline\">false</code>, or a <code class=\"inline\">UrlTree</code> to redirect.</p>",
      tip: "Returning a UrlTree from a guard is the clean way to redirect (e.g. to /login).",
      code: "export const authGuard: CanActivateFn = () => {\n  const auth = inject(AuthService); const router = inject(Router);\n  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);\n};",
      lang: "ts"
    },
    {
      id: "ng-http-error",
      category: "angular",
      difficulty: "intermediate",
      tags: ["http", "error-handling", "retry"],
      question: "How do you handle HttpClient errors and retries?",
      answer:
        "<p>Pipe the request through <code class=\"inline\">retry(n)</code> for transient failures and <code class=\"inline\">catchError</code> to map/handle the error (log, show a message, return a fallback). Centralise cross-cutting handling in an HTTP interceptor.</p>",
      tip: "retry then catchError is the standard resilience pattern for flaky endpoints.",
      code: "this.http.get<User>(url).pipe(\n  retry(2),\n  catchError(err => { this.notify(err); return of(null); })\n)",
      lang: "ts"
    },
    {
      id: "ng-preloading",
      category: "angular",
      difficulty: "advanced",
      tags: ["routing", "lazy-loading", "preloading"],
      question: "What are route preloading strategies?",
      answer:
        "<p>Lazy routes load on demand. A <strong>preloading strategy</strong> fetches some lazy bundles in the background after the app boots, so navigation feels instant. Built-in <code class=\"inline\">PreloadAllModules</code>, or a custom strategy that preloads only routes flagged in their <code class=\"inline\">data</code>.</p>",
      tip: "PreloadAllModules gives lazy-loading's small initial bundle plus fast later navigation.",
      code: "provideRouter(routes, withPreloading(PreloadAllModules))",
      lang: "ts"
    },
    {
      id: "ng-viewchildren",
      category: "angular",
      difficulty: "intermediate",
      tags: ["viewchildren", "querylist"],
      question: "ViewChild vs ViewChildren (and QueryList).",
      answer:
        "<p><code class=\"inline\">@ViewChild</code> returns a single reference; <code class=\"inline\">@ViewChildren</code> returns a <code class=\"inline\">QueryList</code> of all matches, which is <strong>live</strong> — subscribe to <code class=\"inline\">changes</code> to react when items are added/removed. <code class=\"inline\">@ContentChildren</code> is the projected-content equivalent.</p>",
      tip: "QueryList.changes lets you respond to dynamically added children.",
      code: "@ViewChildren(ItemComponent) items!: QueryList<ItemComponent>;\nngAfterViewInit() { this.items.changes.subscribe(() => {}); }",
      lang: "ts"
    },
    {
      id: "ng-dynamic-component",
      category: "angular",
      difficulty: "advanced",
      tags: ["dynamic-components", "viewcontainerref"],
      question: "How do you load a component dynamically?",
      answer:
        "<p>Use <code class=\"inline\">ViewContainerRef.createComponent()</code> to instantiate a component at runtime (modals, widget dashboards, plugin systems). Modern Angular takes the component class directly — the old <code class=\"inline\">ComponentFactoryResolver</code> is deprecated.</p>",
      tip: "Set inputs via componentRef.setInput() and clean up with componentRef.destroy().",
      code: "const ref = this.vcr.createComponent(MyWidgetComponent);\nref.setInput('title', 'Hello');",
      lang: "ts"
    },
    {
      id: "ng-animations",
      category: "angular",
      difficulty: "intermediate",
      tags: ["animations"],
      question: "How does Angular's animation system work?",
      answer:
        "<p>From <code class=\"inline\">@angular/animations</code>: define a <code class=\"inline\">trigger</code> with <code class=\"inline\">state</code>s and <code class=\"inline\">transition</code>s (using <code class=\"inline\">style</code> + <code class=\"inline\">animate</code>), then bind it in the template with <code class=\"inline\">[@triggerName]</code>. Handy built-ins: <code class=\"inline\">:enter</code> / <code class=\"inline\">:leave</code> for add/remove.</p>",
      tip: "For simple hover/fade effects, plain CSS transitions are lighter than the animations package.",
      code: "trigger('fade', [\n  transition(':enter', [style({ opacity: 0 }), animate('200ms', style({ opacity: 1 }))])\n])",
      lang: "ts"
    },
    {
      id: "ng-ssr",
      category: "angular",
      difficulty: "advanced",
      tags: ["ssr", "universal", "hydration", "seo"],
      question: "What is SSR / Angular Universal, and hydration?",
      answer:
        "<p><strong>SSR</strong> renders the app to HTML on the server per request — better SEO and faster first contentful paint. <strong>Hydration</strong> (v16+, non-destructive) reuses that server-rendered DOM on the client instead of re-rendering, avoiding a flicker.</p>",
      tip: "SSR is why you must avoid direct document/window access — use Renderer2 and isPlatformBrowser.",
      code: "// enable non-destructive hydration:\nprovideClientHydration()",
      lang: "ts"
    },
    {
      id: "ng-defer",
      category: "angular",
      difficulty: "advanced",
      tags: ["defer", "performance", "modern"],
      question: "What are deferrable views (@defer)?",
      answer:
        "<p>(v17+) <code class=\"inline\">@defer</code> lazily loads a block of template and its dependencies based on triggers — <code class=\"inline\">on viewport</code>, <code class=\"inline\">on idle</code>, <code class=\"inline\">on interaction</code>, <code class=\"inline\">on hover</code>, etc. It shrinks the initial bundle with a declarative, template-level API and supports <code class=\"inline\">@placeholder</code>/<code class=\"inline\">@loading</code>/<code class=\"inline\">@error</code>.</p>",
      tip: "@defer is the modern, template-level way to code-split heavy widgets like charts.",
      code: "@defer (on viewport) {\n  <heavy-chart />\n} @placeholder {\n  <div>Scroll to load…</div>\n}",
      lang: "html"
    },
    {
      id: "ng-signal-inputs",
      category: "angular",
      difficulty: "advanced",
      tags: ["signals", "input", "modern"],
      question: "What are signal inputs, model(), and signal queries?",
      answer:
        "<p>(v17.1+) The signal-based reactivity APIs: <code class=\"inline\">input()</code> replaces <code class=\"inline\">@Input</code> (with <code class=\"inline\">input.required()</code> and transforms), <code class=\"inline\">model()</code> creates a two-way bindable signal, and <code class=\"inline\">viewChild()</code>/<code class=\"inline\">contentChild()</code> return signal queries. They compose cleanly with <code class=\"inline\">computed</code> and <code class=\"inline\">effect</code>.</p>",
      tip: "Signal inputs remove the ngOnChanges dance — derive with computed() instead.",
      code: "id = input.required<number>();\nname = model('');           // two-way bindable\nrow = viewChild<ElementRef>('row');",
      lang: "ts"
    },
    {
      id: "ng-sanitization",
      category: "angular",
      difficulty: "advanced",
      tags: ["security", "xss", "sanitization"],
      question: "How does Angular protect against XSS?",
      answer:
        "<p>Angular treats all binding values as untrusted and <strong>sanitizes</strong> them by context (HTML, style, URL). Interpolation escapes HTML automatically. To render trusted HTML you must explicitly opt in via <code class=\"inline\">DomSanitizer.bypassSecurityTrust…</code> — use it sparingly and only on values you control.</p>",
      tip: "If you're reaching for bypassSecurityTrustHtml, double-check the source is truly trusted.",
      code: "// safe by default — Angular sanitizes bound HTML:\n<div [innerHTML]=\"userHtml\"></div>",
      lang: "html"
    },
    {
      id: "ng-smart-dumb",
      category: "angular",
      difficulty: "intermediate",
      tags: ["architecture", "components", "best-practices"],
      question: "Smart (container) vs dumb (presentational) components.",
      answer:
        "<p><strong>Smart/container</strong> components fetch data, hold state, and talk to services/the store. <strong>Dumb/presentational</strong> components just take <code class=\"inline\">@Input</code>s and emit <code class=\"inline\">@Output</code>s — no dependencies, easy to test and reuse. This separation keeps UI reusable and logic centralised.</p>",
      tip: "Presentational components pair perfectly with OnPush since they're pure input → view.",
      code: "",
      lang: ""
    },
    {
      id: "ng-cva",
      category: "angular",
      difficulty: "advanced",
      tags: ["forms", "controlvalueaccessor", "custom-form-control"],
      question: "What is ControlValueAccessor and when do you implement it?",
      answer:
        "<p><code class=\"inline\">ControlValueAccessor</code> is the bridge that lets a <strong>custom component</strong> act as a native form control — usable with <code class=\"inline\">[(ngModel)]</code>, <code class=\"inline\">formControlName</code>, and validation. You implement four methods:</p>" +
        "<ul>" +
        "<li><strong>writeValue(v)</strong> — model → view (Angular sets the value).</li>" +
        "<li><strong>registerOnChange(fn)</strong> — view → model (call fn when the user changes it).</li>" +
        "<li><strong>registerOnTouched(fn)</strong> — mark as touched (on blur).</li>" +
        "<li><strong>setDisabledState()</strong> — react to disabling.</li>" +
        "</ul>" +
        "<p>Register it with the <code class=\"inline\">NG_VALUE_ACCESSOR</code> multi-provider.</p>",
      tip: "This is THE classic advanced-forms question — a custom rating/toggle/date-picker uses it.",
      code: "@Component({\n  selector: 'app-rating',\n  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: RatingComponent, multi: true }]\n})\nexport class RatingComponent implements ControlValueAccessor {\n  value = 0; onChange = (_: number) => {}; onTouched = () => {};\n  writeValue(v: number) { this.value = v; }\n  registerOnChange(fn: any) { this.onChange = fn; }\n  registerOnTouched(fn: any) { this.onTouched = fn; }\n  set(n: number) { this.value = n; this.onChange(n); this.onTouched(); }\n}",
      lang: "ts"
    },
    {
      id: "ng-cross-field-validator",
      category: "angular",
      difficulty: "advanced",
      tags: ["forms", "validators", "cross-field"],
      question: "How do you validate across multiple fields (e.g. password match)?",
      answer:
        "<p>Put a <strong>group-level validator</strong> on the <code class=\"inline\">FormGroup</code> instead of a single control, so it can compare siblings. Return an error on the group (or set it on a specific control) when the rule fails.</p>",
      tip: "Cross-field rules like password-confirm belong on the FormGroup, not one control.",
      code: "function matchPasswords(g: AbstractControl) {\n  return g.get('pwd')?.value === g.get('confirm')?.value\n    ? null : { mismatch: true };\n}\nthis.fb.group({ pwd: [''], confirm: [''] }, { validators: matchPasswords });",
      lang: "ts"
    },
    {
      id: "ng-typed-forms",
      category: "angular",
      difficulty: "intermediate",
      tags: ["forms", "typed-forms", "modern"],
      question: "What are typed reactive forms (v14+)?",
      answer:
        "<p>Since v14, reactive forms are <strong>strictly typed</strong>: <code class=\"inline\">FormGroup</code>/<code class=\"inline\">FormControl</code> infer value types, so <code class=\"inline\">form.value</code> and <code class=\"inline\">.get()</code> are type-safe and autocompleted. Use <code class=\"inline\">FormControl&lt;string&gt;</code> and <code class=\"inline\">nonNullable</code> to avoid <code class=\"inline\">null</code> in the type.</p>",
      tip: "nonNullable: true keeps the control's type as string instead of string | null.",
      code: "email = new FormControl('', { nonNullable: true, validators: [Validators.email] });\n// email.value is string, not string | null",
      lang: "ts"
    },
    {
      id: "ng-valuechanges",
      category: "angular",
      difficulty: "intermediate",
      tags: ["forms", "valuechanges", "rxjs"],
      question: "How do you react to form changes reactively?",
      answer:
        "<p>Every control/group exposes <code class=\"inline\">valueChanges</code> and <code class=\"inline\">statusChanges</code> as Observables. Pipe them (e.g. <code class=\"inline\">debounceTime</code> + <code class=\"inline\">switchMap</code>) for autosave, dependent fields, or live search. Set <code class=\"inline\">updateOn: 'blur'</code> to reduce noise.</p>",
      tip: "valueChanges + debounceTime is the clean autosave / dependent-field pattern.",
      code: "this.form.get('country')!.valueChanges.pipe(\n  switchMap(c => this.api.getCities(c))\n).subscribe(cities => this.cities = cities);",
      lang: "ts"
    },
    {
      id: "ng-form-updateon",
      category: "angular",
      difficulty: "intermediate",
      tags: ["forms", "updateon", "performance"],
      question: "What does updateOn: 'blur' | 'submit' do?",
      answer:
        "<p>Controls the moment validation and <code class=\"inline\">valueChanges</code> fire. Default is <code class=\"inline\">'change'</code> (every keystroke). <code class=\"inline\">'blur'</code> validates when the field loses focus, and <code class=\"inline\">'submit'</code> only on submit — reducing churn and improving UX for expensive/async validators.</p>",
      tip: "updateOn: 'blur' is a simple way to stop async validators firing on every keystroke.",
      code: "new FormControl('', { updateOn: 'blur', validators: [Validators.required] });",
      lang: "ts"
    }
  ];
})();

/* ============================================================
   AI Tutor — floating chat assistant.

   A self-contained widget (launcher FAB + slide-in panel) that talks to the
   /api/chat serverless proxy. It reuses the site's existing Firebase layer
   (IQB.cloud / IQB.sync from js/sync.js) for auth — it never initialises
   Firebase itself.

   Access is decided BEFORE any chat UI is rendered (see resolveAccess), so a
   visitor never sees a composer they aren't allowed to use:
     - signed out            -> a sign-in wall, nothing else
     - signed in, whitelisted-> the chat, on the site's master key
     - signed in, not on the list -> a "add your own Groq API key" wall; the key
       is stored in localStorage and sent per-request in the x-groq-key header
   Whitelist membership is only knowable server-side, so the panel shows a
   loader while  POST /api/chat {mode:"access"}  answers.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};

  const API_URL = "/api/chat";
  const KEY_STORE = "iqb:tutorGroqKey";
  const MAX_HISTORY = 12; // turns kept client-side and sent for context

  let panel = null, launcher = null, listEl = null, formEl = null, inputEl = null;
  let gateEl = null, statusEl = null, contextEl = null, resizeEl = null;
  let open = false, sending = false;
  // Set true only once the SERVER has confirmed this account is on the free
  // list — either by the access probe or by a reply coming back tier==="free".
  // Being signed in is never proof of it.
  let verifiedFree = false;

  // Which wall (if any) the panel is currently showing. Nothing but "ready"
  // renders the message list or the composer — see applyGate().
  //   "loading" | "signin" | "key" | "ready"
  let gate = "loading";
  let gateSeq = 0;      // guards against a stale access check painting over a newer one
  let accessMemo = null; // { uid, free } — avoids re-probing on every panel open
  const history = []; // [{ role: 'user' | 'model', text }]

  // Set by askAbout() when opened from a question card's "Ask AI" button.
  // { question, answer, code } — kept out of the visible chat history and
  // folded into just the NEXT outgoing message (see onSubmit), so the model
  // gets full context without the user seeing a giant pasted block.
  let currentContext = null;
  let contextPending = false;

  // Persisted panel size (drag-to-resize from the top-left corner).
  const SIZE_STORE = "iqb:tutorSize";
  const POS_STORE = "iqb:tutorPos";
  const MIN_W = 320, MIN_H = 360;

  /* Line-icon set for the welcome action chips — same visual language as the
     question cards' .qa-act buttons (16px, currentColor, rounded strokes) so the
     coach feels like part of the same premium UI rather than an emoji menu. */
  const svgTag = 'xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const ICON = {
    random: '<svg ' + svgTag + '><polyline points="16 3 21 3 21 8"/><path d="M4 20 21 3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
    code: '<svg ' + svgTag + '><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    star: '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    mic: '<svg ' + svgTag + '><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
  };

  /* Larger glyphs for the access walls (28px, centred in a soft circle). */
  const gateSvgTag = 'xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const GATE_ICON = {
    user: '<svg ' + gateSvgTag + '><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    key: '<svg ' + gateSvgTag + '><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3"/></svg>'
  };

  /* The robot mascot, shared by the launcher FAB and the panel header so the
     thing you tap and the thing you're now talking to are visibly the same
     character. The two eyes carry .tutor-eye and blink on a loop; the antenna,
     ears and rounded head read as a friendly bot (see css/tutor.css). */
  function botIcon(size, extraClass, strokeWidth) {
    return '<svg class="tutor-bot-icon' + (extraClass ? " " + extraClass : "") + '" ' +
      'xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" ' +
      'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (strokeWidth || 1.7) + '" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0">' +
        /* The drawing spans y 0.75–18, so on its own it sits high in a 24-tall
           viewBox with ~6px of dead space underneath — it reads as floating up
           and away from adjacent text. Shifting by 2.63 puts its centre on y=12,
           which is what makes it optically centred everywhere it's used. Do not
           re-centre it again with per-callsite margins; fix it here. */
        '<g transform="translate(0 2.63)">' +
          '<line x1="12" y1="2.4" x2="12" y2="5"/>' +
          '<circle cx="12" cy="1.9" r="1.15" fill="currentColor" stroke="none"/>' +
          '<rect x="4" y="5" width="16" height="13" rx="4"/>' +
          '<line x1="2" y1="10" x2="2" y2="13"/>' +
          '<line x1="22" y1="10" x2="22" y2="13"/>' +
          '<circle class="tutor-eye" cx="9" cy="11.4" r="1.75" fill="currentColor" stroke="none"/>' +
          '<circle class="tutor-eye" cx="15" cy="11.4" r="1.75" fill="currentColor" stroke="none"/>' +
          '<line x1="9.5" y1="15.2" x2="14.5" y2="15.2"/>' +
        '</g>' +
      '</svg>';
  }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    buildLauncher();
    // Sign-in / sign-out changes who this is, so the whitelist answer we cached
    // is worthless — re-probe and repaint the wall (or drop it).
    if (IQB.cloud && IQB.cloud.onChange) IQB.cloud.onChange(function () {
      accessMemo = null;
      verifiedFree = false;
      if (panel) resolveAccess();
    });
  }

  /* ---------- launcher FAB ---------- */
  function buildLauncher() {
    launcher = document.createElement("button");
    launcher.className = "tutor-fab";
    launcher.id = "tutor-fab";
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Open AI Helper");
    launcher.innerHTML = botIcon(26);
    launcher.addEventListener("click", openPanel);
    document.body.appendChild(launcher);
  }

  /* ---------- panel (built lazily on first open) ---------- */
  function buildPanel() {
    panel = document.createElement("section");
    panel.className = "tutor-panel";
    panel.id = "tutor-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "AI  Helper");
    panel.hidden = true;
    panel.innerHTML =
      // Three grab targets, all anchoring the bottom-right corner: the top edge
      // (height only), the left edge (width only), and the corner (both). The
      // corner's icon is a double-headed diagonal arrow so it reads as "drags
      // both ways" rather than the old single ↖ that suggested one direction.
      // No title= on any of them: the native tooltip renders right on top of
      // the "AI Helper" header text. The cursor plus aria-label carry it.
      '<div class="tutor-edge tutor-edge-t" id="tutor-edge-top" aria-label="Resize panel height" role="separator" aria-orientation="horizontal" tabindex="0"></div>' +
      '<div class="tutor-edge tutor-edge-l" id="tutor-edge-left" aria-label="Resize panel width" role="separator" aria-orientation="vertical" tabindex="0"></div>' +
      '<div class="tutor-resize" id="tutor-resize" aria-label="Resize panel" role="separator" aria-orientation="horizontal" tabindex="0">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="4 10 4 4 10 4"/><line x1="4" y1="4" x2="20" y2="20"/><polyline points="20 14 20 20 14 20"/>' +
        '</svg>' +
      '</div>' +
      '<header class="tutor-head">' +
        '<div class="tutor-title">' + botIcon(20, "tutor-title-bot") + ' AI Helper</div>' +
        '<div class="tutor-actions">' +
          '<button class="tutor-x" id="tutor-restart" type="button" title="Restart conversation" aria-label="Restart conversation">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' +
          '</button>' +
          '<button class="tutor-x" id="tutor-close" type="button" aria-label="Close">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
      '</header>' +
      '<div class="tutor-context" id="tutor-context" hidden></div>' +
      '<div class="tutor-gate" id="tutor-gate" hidden></div>' +
      '<div class="tutor-body" id="tutor-body"></div>' +
      '<div class="tutor-status" id="tutor-status" hidden></div>' +
      '<form class="tutor-form" id="tutor-form">' +
        '<textarea class="tutor-input" id="tutor-input" rows="1" placeholder="Ask a question" ' +
          'autocomplete="off"></textarea>' +
        '<button class="tutor-send" id="tutor-send" type="submit" aria-label="Send">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
      '</form>';
    document.body.appendChild(panel);

    listEl = panel.querySelector("#tutor-body");
    formEl = panel.querySelector("#tutor-form");
    inputEl = panel.querySelector("#tutor-input");
    gateEl = panel.querySelector("#tutor-gate");
    statusEl = panel.querySelector("#tutor-status");
    contextEl = panel.querySelector("#tutor-context");
    resizeEl = panel.querySelector("#tutor-resize");

    formEl.addEventListener("submit", onSubmit);
    panel.querySelector("#tutor-close").addEventListener("click", closePanel);
    panel.querySelector("#tutor-restart").addEventListener("click", function (e) {
      // Spin the icon once so a refresh reads as a deliberate, visible action.
      const b = e.currentTarget;
      b.classList.remove("spin"); void b.offsetWidth; b.classList.add("spin");
      clearThread();
    });
    initDrag(panel.querySelector(".tutor-head"));
    initResize(resizeEl, "both");
    initResize(panel.querySelector("#tutor-edge-top"), "y");
    initResize(panel.querySelector("#tutor-edge-left"), "x");
    applySize(loadSize()); // restore the size the user last dragged to
    // NOT applyPos here: the panel is still hidden at this point, so it
    // measures 0x0 and the stored position would clamp to zero. openPanel
    // restores it once the panel is actually on screen.
    // Escape closes the panel from anywhere inside it.
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); closePanel(); } });

    // Auto-grow textarea; Enter sends, Shift+Enter newlines.
    inputEl.addEventListener("input", autosize);
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); formEl.requestSubmit(); }
    });

    // No greeting yet — the welcome and composer only appear once resolveAccess
    // has confirmed this visitor is allowed to chat.
    applyGate("loading");
    resolveAccess();
  }

  function greet() {
    if (gate !== "ready") return; // never render chat content behind a wall
    if (listEl.childElementCount) return;
    if (currentContext) {
      addBubble("model",
        "What would you like to know about **" + truncate(currentContext.question, 70) +
        "**? Pick one below, or just type your own question.");
      renderPinnedChips();
    } else {
      addBubble("model",
        "#### Welcome to your AI Interview Deck\n\nChoose how you'd like to prepare today.");
      renderWelcomeChips();
    }
  }

  /* ---------- welcome action chips (FAB open, no pinned question) ----------
     Four ways to start a session, tailored to the category the reader is
     currently viewing (JavaScript, Angular, …). Unlike the model-generated
     suggestion chips, these are fixed actions: the visible label is short, but
     each carries a fuller instruction that's what actually gets sent to the
     model when tapped. */
  function currentCategoryLabel() {
    // Prefer the app's live state (works even when the URL hash is empty).
    try {
      if (IQB.app && typeof IQB.app.currentCategory === "function") {
        const c = IQB.app.currentCategory();
        if (c && c.label) return c.label;
      }
    } catch (e) { /* fall through to hash parsing */ }
    // Fallback: read the category straight from the URL hash (#javascript → JavaScript).
    try {
      const h = decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
      if (h && h !== "playground" && !h.startsWith("q=")) {
        const man = IQB.manifest || {};
        const hit = (man.categories || []).find((c) => c.id === h) ||
                    (man.groups || []).find((g) => g.id === h);
        if (hit && hit.label) return hit.label;
      }
    } catch (e) { /* ignore */ }
    return "";
  }

  function renderWelcomeChips() {
    const cat = currentCategoryLabel();      // "" when on All/Playground/a shared question
    const c = cat ? cat + " " : "";          // spacing for the visible label
    const subject = cat || "software engineering"; // phrasing for the sent prompt
    const items = [
      {
        icon: ICON.random,
        label: "Ask Me a Random " + c + "Question",
        prompt: "Ask me one random " + subject + " interview question so I can practice. " +
          "Ask exactly one question, then stop and wait for my answer before revealing anything."
      },
      {
        icon: ICON.code,
        label: "Give Me a " + c + "Coding Challenge",
        prompt: "Give me one " + subject + " coding challenge suitable for an interview. " +
          "State the problem clearly with a sample input and expected output, then wait for my " +
          "solution before showing the ideal answer."
      },
      {
        icon: ICON.star,
        label: "List Important " + c + "Interview Questions",
        // Not a chat message: this curates the on-screen question bank into an
        // "AI Suggested" list rather than dumping questions into the chat.
        action: curateImportant
      },
      {
        icon: ICON.mic,
        label: "Start a " + c + "Mock Interview",
        prompt: "Start a " + subject + " mock interview. Act as the interviewer: ask one question " +
          "at a time, wait for my answer, then give constructive feedback and the ideal answer " +
          "before moving to the next. Begin now with your first question."
      }
    ];
    renderActionChips(items);
  }

  /* Like renderSuggestionChips, but each chip's visible label differs from the
     message it sends (see renderWelcomeChips). Reuses the #tutor-suggestions
     container so removeSuggestionChips() clears it once the user acts. */
  function renderActionChips(items) {
    removeSuggestionChips();
    if (!items || !items.length) return;
    const wrap = document.createElement("div");
    wrap.className = "tutor-suggestions tutor-welcome-chips";
    wrap.id = "tutor-suggestions";
    items.forEach(function (it) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tutor-chip";
      if (it.icon) {
        const ic = document.createElement("span");
        ic.className = "tutor-chip-ic";
        ic.innerHTML = it.icon;   // trusted, code-defined SVG (never user input)
        chip.appendChild(ic);
      }
      const lbl = document.createElement("span");
      lbl.className = "tutor-chip-label";
      lbl.textContent = it.label;
      chip.appendChild(lbl);
      chip.addEventListener("click", function () {
        if (typeof it.action === "function") it.action(it.label);
        else sendMessage(it.prompt, it.label); // send the instruction, show the label
      });
      wrap.appendChild(chip);
    });
    listEl.appendChild(wrap);
    scrollDown();
  }

  /* ---------- pinned-question study chips ----------
     Fixed, deterministic chips for the greet under a pinned question — replaces
     the old model-generated suggestions there, which came back as vague
     tangents ("How is Queue used in real projects") instead of the study
     actions readers actually want. Two sets: conceptual questions get
     detail/examples/revision/V.Imp; coding questions get problem/solution/
     dry-run/complexity. Short label on the chip, fuller instruction sent to
     the model (same pattern as the welcome chips); the pinned Q&A context is
     folded into the outgoing message by sendMessage(). Model-generated chips
     still power the post-reply follow-ups (requestFollowups). */
  const CODING_CATEGORIES = ["coding", "leetcode", "ngcoding", "fluttercoding"];

  function isCodingContext(ctx) {
    if (!ctx) return false;
    if (ctx.category && CODING_CATEGORIES.indexOf(ctx.category) !== -1) return true;
    // Fallback for contexts pinned without a category: treat as coding only
    // when it walks and quacks like an exercise (has code AND task-style tags).
    const t = ctx.tags || [];
    return !!ctx.code && t.some(function (x) {
      return /^(coding|algorithm|dsa|classic|two-pointer|sliding-window|recursion)$/.test(x);
    });
  }

  function renderPinnedChips() {
    const ctx = currentContext;
    if (!ctx) return;
    const items = isCodingContext(ctx) ? [
      {
        label: "Explain the Problem Simply",
        prompt: "Explain this problem in simple words, as if to a beginner: what exactly is " +
          "being asked, with one small sample input and its expected output. Don't reveal " +
          "the solution yet."
      },
      {
        label: "Solution Step by Step",
        prompt: "Give a detailed step-by-step explanation of the solution: the approach and " +
          "the intuition behind it, then walk through the code line by line, and end with " +
          "time and space complexity."
      },
      {
        label: "Dry Run an Example",
        prompt: "Do a dry run of the solution on a small example input: show how the " +
          "variables change at each step in a simple trace, so I can follow exactly how " +
          "the code reaches the answer."
      },
      {
        label: "Mistakes & Complexity",
        prompt: "List the common mistakes and edge cases candidates get wrong on this " +
          "problem in an interview, and explain its time and space complexity — including " +
          "what a naive solution would cost and why this one is better."
      }
    ] : [
      {
        label: "Explain in Detail",
        prompt: "Explain this question in detail: how it works internally, why it matters " +
          "in real projects, and a concrete example — go deeper than the official answer " +
          "shown on the card."
      },
      {
        label: "Give More Examples",
        prompt: "Give me more examples for this concept — different real-world scenarios " +
          "and short code samples beyond the one in the official answer, so I can " +
          "recognise it in any form the interviewer asks."
      },
      {
        label: "Quick Revision Points",
        prompt: "Give me quick revision points for this question: a crisp bullet list I " +
          "can revise in 30 seconds before an interview — definitions, key differences, " +
          "and the one-line answer I should lead with."
      },
      {
        label: "V.Imp — Must Remember",
        prompt: "What are the MOST important things to remember about this question for an " +
          "interview? The traps, the follow-up questions interviewers ask, and the exact " +
          "points that separate a strong answer from an average one."
      }
    ];
    renderActionChips(items);
  }

  /* ---------- "important questions" curation ----------
     Instead of the model listing questions into the chat, it returns a few
     keywords for the current category; the app filters its own question bank by
     those and shows the matches as an "AI Suggested" list. The chat just points
     the reader there. Falls back to a normal chat message when there's no single
     category to curate (All/Playground) or the app API isn't available. */
  async function curateImportant(label) {
    if (sending) return;
    const cat = (IQB.app && IQB.app.currentCategory) ? IQB.app.currentCategory() : { key: "", label: "" };

    // No single subject to curate, or the app hooks aren't present — degrade to
    // the plain "list them in chat" behaviour so the chip is never a dead end.
    if (!cat.label || !IQB.app.applyAiSuggestion || !IQB.app.categoryTags) {
      const subject = cat.label || "software engineering";
      return sendMessage("List the most important " + subject + " interview questions I should " +
        "master, grouped by topic, each with a one-line note on why it matters.");
    }

    removeSuggestionChips();
    addBubble("user", label || ("List Important " + cat.label + " Interview Questions"));

    sending = true;
    setBusy(true);
    const typing = addTyping();
    try {
      const tags = IQB.app.categoryTags(cat.key);
      const data = await fetchCurate(cat.label, tags);
      typing.remove();

      if (data && data.keyFailure) {
        handleKeyFailure(data.keyFailure, data.error);
        return;
      }
      const keywords = data && Array.isArray(data.keywords) ? data.keywords : null;
      if (!keywords || !keywords.length) {
        addBubble("model", "⚠️ I couldn't pick out topics just now. Please try again.");
        return;
      }
      if (data.tier === "free") verifiedFree = true;

      const count = IQB.app.applyAiSuggestion(keywords, cat.key);
      if (!count) {
        addBubble("model",
          "I looked for the key **" + cat.label + "** topics but couldn't match them to " +
          "questions here. Try asking me about a specific topic instead.");
        return;
      }
      addBubble("model",
        "✨ I've picked the **" + count + " most important " + cat.label + "** question" +
        (count === 1 ? "" : "s") + " for you — they're now showing under the **AI Suggested** " +
        "filter in the list. Go through those to focus your prep.");
    } catch (e) {
      typing.remove();
      addBubble("model", "⚠️ Network error — check your connection and try again.");
    } finally {
      sending = false;
      setBusy(false);
    }
  }

  async function fetchCurate(category, tags) {
    const headers = { "Content-Type": "application/json" };
    const token = await getIdToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    const key = getKey();
    if (key) headers["x-groq-key"] = key;

    const resp = await fetch(API_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ mode: "curate", category: category, tags: tags })
    });
    const data = await resp.json().catch(function () { return {}; });
    const kf = keyFailure(resp, data);
    if (kf) return { keyFailure: kf, error: data.error };
    if (!resp.ok) return null;
    return data;
  }

  /* ---------- suggestion chips ----------
     Generated by the model itself (never hardcoded/randomly picked) — a tiny,
     fast Groq call given the pinned question + answer, asked for exactly 3
     short quick-reply prompts. contextGen guards against a stale response
     landing after the user has already moved to a different question. */
  let contextGen = 0;

  function requestSuggestions() {
    if (!currentContext) return;
    const gen = ++contextGen;
    renderLoadingChips();
    fetchSuggestions(currentContext).then(function (list) {
      if (gen !== contextGen) return; // a newer question/restart superseded this
      if (list && list.length) renderSuggestionChips(list);
      else removeSuggestionChips();
    });
  }

  /* Keeps the coaching going after every reply — same generation, same server
     call as requestSuggestions(), just fed the latest exchange (the user's
     message + the tutor's own reply) instead of the pinned question, so the
     next-step chips ("go deeper", "quiz me", "compare with X"...) track where
     the conversation actually is. Works with or without a pinned question. */
  function requestFollowups(lastUserText, lastReplyText) {
    const gen = ++contextGen;
    renderLoadingChips();
    fetchSuggestions({ question: lastUserText, answer: lastReplyText, code: "" }).then(function (list) {
      if (gen !== contextGen) return; // user already sent something else
      if (list && list.length) renderSuggestionChips(list);
      else removeSuggestionChips();
    });
  }

  async function fetchSuggestions(ctx) {
    try {
      const headers = { "Content-Type": "application/json" };
      const token = await getIdToken();
      if (token) headers["Authorization"] = "Bearer " + token;
      const key = getKey();
      if (key) headers["x-groq-key"] = key;

      const resp = await fetch(API_URL, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          mode: "suggest",
          question: ctx.question,
          answer: ctx.answer,
          code: ctx.code
        })
      });
      const data = await resp.json().catch(function () { return {}; });

      const kf = keyFailure(resp, data);
      if (kf) { handleKeyFailure(kf, data.error); return null; }
      if (!resp.ok || !Array.isArray(data.suggestions)) return null;
      if (data.tier === "free") verifiedFree = true;
      return data.suggestions
        .filter(function (s) { return typeof s === "string" && s.trim(); })
        .map(function (s) { return truncate(s.trim(), 48); })
        .slice(0, 3);
    } catch (e) {
      return null;
    }
  }

  function renderLoadingChips() {
    removeSuggestionChips();
    const wrap = document.createElement("div");
    wrap.className = "tutor-suggestions";
    wrap.id = "tutor-suggestions";
    wrap.innerHTML = '<span class="tutor-chip-loading">Thinking of quick prompts…</span>';
    listEl.appendChild(wrap);
    scrollDown();
  }

  function renderSuggestionChips(list) {
    removeSuggestionChips();
    if (!list || !list.length) return;
    const wrap = document.createElement("div");
    wrap.className = "tutor-suggestions";
    wrap.id = "tutor-suggestions";
    list.forEach(function (label) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tutor-chip";
      chip.textContent = label;
      chip.addEventListener("click", function () { sendMessage(label); });
      wrap.appendChild(chip);
    });
    listEl.appendChild(wrap);
    scrollDown();
  }

  function removeSuggestionChips() {
    const el = panel && panel.querySelector("#tutor-suggestions");
    if (el) el.remove();
  }

  /* ---------- open / close ----------
     Deliberately NOT a toggle. The robot FAB is wired to openPanel and is hidden
     (pointer-events:none) whenever the panel is open, so it can only ever open;
     the header X is wired straight to closePanel, so it can only ever close.
     Neither one branches on a remembered `open` flag — that flag drifting out of
     sync with the DOM is exactly what used to make the X "do nothing". Both
     functions are idempotent: calling them in the wrong state is harmless. */
  function openPanel() {
    if (!panel) buildPanel();
    panel.hidden = false;
    cbBox = null;   // it could not be measured while hidden
    applyPos(loadPos());
    syncDock();
    open = true;
    launcher.classList.add("is-open");
    // Docks the main content aside on wide screens (see css/tutor.css); a no-op
    // overlay on narrow ones. Also hides the site's reading-mode/scroll-to-top
    // FABs, which otherwise sit in the same bottom-right corner as this panel.
    document.body.classList.add("tutor-open");
    // Collapse the sidebar to its icon rail to make room for the docked panel.
    // Just a default, not a lock: #sidebar-collapse (app.js) can re-expand it
    // while the chat stays open.
    document.body.classList.add("sidebar-rail");
    // A first-time visitor's onboarding tour overlay sits above every other
    // element (z-index 1000) and swallows clicks meant for this panel — dismiss
    // it rather than let it fight the tutor. Best-effort: never let a quirk here
    // block the panel from opening.
    try {
      if (window.IQB.tour && typeof IQB.tour.end === "function") IQB.tour.end();
      // Re-check only while still walled off (e.g. they signed in elsewhere on
      // the page since last time). Re-running it once ready would flash the
      // loader over a live conversation for no new information.
      if (gate !== "ready") resolveAccess();
    } catch (e) { console.warn("[tutor] open-time extras failed:", e); }
    if (gate === "ready") setTimeout(function () { inputEl && inputEl.focus(); }, 50);
  }

  function closePanel() {
    if (!panel) return;
    panel.hidden = true;
    open = false;
    // If focus is still inside the panel when it hides, some browsers keep the
    // (now invisible) element focused; move focus back to the robot so keyboard
    // users aren't stranded and the FAB is ready to reopen.
    try { if (panel.contains(document.activeElement)) launcher.focus(); } catch (e) { /* ignore */ }
    launcher.classList.remove("is-open");
    document.body.classList.remove("tutor-open");
    // the full sidebar is the desktop default, so closing the chat restores it
    document.body.classList.remove("sidebar-rail");
    document.documentElement.style.removeProperty("--tutor-dock");
  }

  /* ---------- drag-to-resize (top-left corner) ----------
     The panel is anchored to the bottom-right (see css/tutor.css), so growing it
     from the top-left corner is the natural gesture: dragging up-and-left makes
     it bigger, down-and-right smaller, while the bottom-right stays put. The
     chosen size is remembered across sessions in localStorage. */
  function loadSize() {
    try {
      const s = JSON.parse(localStorage.getItem(SIZE_STORE) || "null");
      if (s && s.w > 0 && s.h > 0) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function saveSize(w, h) {
    try { localStorage.setItem(SIZE_STORE, JSON.stringify({ w: Math.round(w), h: Math.round(h) })); }
    catch (e) { /* ignore */ }
  }

  /* Apply a size (or a null to leave the CSS default), clamped so the panel can
     never be smaller than usable or spill past the viewport's top-left. */
  function applySize(size) {
    if (!panel) return;
    if (!size) { panel.style.width = ""; panel.style.height = ""; return; }
    const maxW = Math.max(MIN_W, window.innerWidth - 32);
    const maxH = Math.max(MIN_H, window.innerHeight - 32);
    const w = Math.max(MIN_W, Math.min(size.w, maxW));
    const h = Math.max(MIN_H, Math.min(size.h, maxH));
    panel.style.width = w + "px";
    panel.style.height = h + "px";
    syncDock();
    return { w: w, h: h };
  }

  /* ---------- drag-to-move (by the header) ----------
     The panel stays ANCHORED TO THE BOTTOM-RIGHT — dragging changes its right/
     bottom offsets rather than switching to left/top. That matters because the
     resize handles all grow the panel from the top-left with the bottom-right
     corner pinned; re-anchoring on move would invert their maths. Moving left
     simply means a larger `right`.

     Position is per device (a viewport preference, like the size) and clamped
     so the panel can never be parked off screen where it can't be grabbed back. */
  function loadPos() {
    try {
      const p = JSON.parse(localStorage.getItem(POS_STORE) || "null");
      if (p && isFinite(p.right) && isFinite(p.bottom)) return p;
    } catch (e) { /* ignore */ }
    return null;
  }
  function savePos(right, bottom) {
    try { localStorage.setItem(POS_STORE, JSON.stringify({ right: Math.round(right), bottom: Math.round(bottom) })); }
    catch (e) { /* ignore */ }
  }

  /* The box `position: fixed` resolves against is NOT reliably any of
     window.innerHeight, documentElement.clientHeight, or visualViewport — in an
     embedded/zoomed viewport they disagree, and clamping against the wrong one
     parks the panel off screen. So measure it: pin the panel to 0,0 for one
     frame and read where its edges actually land. Cached, and invalidated on
     resize, so this costs one extra layout per resize rather than per pointer
     move. */
  let cbBox = null;
  function containingBox() {
    if (cbBox) return cbBox;
    if (!panel) return { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight };
    const prevR = panel.style.right, prevB = panel.style.bottom;
    panel.style.right = "0px";
    panel.style.bottom = "0px";
    const r = panel.getBoundingClientRect();
    panel.style.right = prevR;
    panel.style.bottom = prevB;
    cbBox = { w: r.right, h: r.bottom };
    return cbBox;
  }
  function vw() { return containingBox().w; }
  /* Asks the SAME question the stylesheet asks, rather than comparing a
     measured pixel value against a magic number that could drift from the
     media query in css/tutor.css. */
  function isNarrow() { return window.matchMedia("(max-width: 480px)").matches; }
  function vh() { return containingBox().h; }

  function applyPos(pos) {
    if (!panel || !pos) return null;
    // Below 480px the panel is full-width by design, so a stored offset would
    // only push it off screen — see the responsive block in css/tutor.css.
    if (isNarrow()) { panel.style.right = ""; panel.style.bottom = ""; return null; }
    const r = panel.getBoundingClientRect();
    const maxRight = Math.max(0, vw() - r.width);
    const maxBottom = Math.max(0, vh() - r.height);
    const right = Math.max(0, Math.min(pos.right, maxRight));
    const bottom = Math.max(0, Math.min(pos.bottom, maxBottom));
    panel.style.right = right + "px";
    panel.style.bottom = bottom + "px";
    syncDock();
    return { right: right, bottom: bottom };
  }

  /* ---------- keep the page's dock in step with the panel ----------
     The content column used to be pushed aside by a FIXED min(416px, 32vw),
     which is why dragging the panel's edge appeared to do nothing: the panel
     got wider, the seam did not move. Now the margin follows the panel's real
     left edge, so that seam behaves like a splitter between page and chat.

     Only while the panel is parked against the right edge. Once it has been
     dragged out into the open it is a floating window, and shoving the content
     sideways for something that is no longer beside it makes no sense. */
  const DOCK_SNAP = 24;   // px of slack still counted as "against the edge"

  function syncDock() {
    const root = document.documentElement;
    if (!panel || panel.hidden || isNarrow()) {
      root.style.removeProperty("--tutor-dock");
      return;
    }
    const box = containingBox();
    const r = panel.getBoundingClientRect();
    const parkedRight = (box.w - r.right) <= DOCK_SNAP;
    // 0, not "remove": removing falls back to the literal in the stylesheet and
    // would keep shoving the content aside for a panel that is no longer beside
    // it. A floating panel overlays the content at full width.
    if (!parkedRight) { root.style.setProperty("--tutor-dock", "0px"); return; }
    root.style.setProperty("--tutor-dock", Math.max(0, Math.round(box.w - r.left)) + "px");
  }

  function initDrag(handle) {
    if (!handle) return;
    let startX = 0, startY = 0, startR = 0, startB = 0, dragging = false;

    handle.addEventListener("pointerdown", function (e) {
      // The header also carries the restart/close buttons — a click on those is
      // not a drag. Same for the resize strip that overlays its top edge.
      if (e.target.closest(".tutor-x, .tutor-actions, .tutor-edge, .tutor-resize")) return;
      if (isNarrow()) return;                 // full-width panel: nowhere to go
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startR = vw() - r.right;
      startB = vh() - r.bottom;
      dragging = true;
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      document.body.classList.add("tutor-dragging");
    });

    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      // Right/bottom grow as the pointer moves left/up, hence the inversion.
      applyPos({ right: startR - (e.clientX - startX), bottom: startB - (e.clientY - startY) });
    });

    function end(e) {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      document.body.classList.remove("tutor-dragging");
      const r = panel.getBoundingClientRect();
      savePos(vw() - r.right, vh() - r.bottom);
    }
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);

    // Double-click the header to send it back to its default corner — the way
    // out if it ends up somewhere awkward.
    handle.addEventListener("dblclick", function (e) {
      if (e.target.closest(".tutor-x, .tutor-actions")) return;
      panel.style.right = ""; panel.style.bottom = "";
      try { localStorage.removeItem(POS_STORE); } catch (_) {}
      syncDock();
    });

    // Keyboard nudge, so the panel is movable without a pointer.
    handle.setAttribute("tabindex", "0");
    handle.addEventListener("keydown", function (e) {
      const step = e.shiftKey ? 40 : 12;
      const r = panel.getBoundingClientRect();
      let right = vw() - r.right, bottom = vh() - r.bottom, hit = true;
      switch (e.key) {
        case "ArrowLeft": right += step; break;
        case "ArrowRight": right -= step; break;
        case "ArrowUp": bottom += step; break;
        case "ArrowDown": bottom -= step; break;
        default: hit = false;
      }
      if (!hit) return;
      e.preventDefault();
      const applied = applyPos({ right: right, bottom: bottom });
      if (applied) savePos(applied.right, applied.bottom);
    });
  }

  /* axis: "x" (left edge, width only), "y" (top edge, height only) or "both"
     (the corner grip). Each handle keeps the axes it doesn't own pinned to their
     starting value, so dragging the top edge can't drift the width and vice
     versa — the whole point of having separate edges rather than one corner. */
  function initResize(handle, axis) {
    if (!handle) return;
    const movesX = axis !== "y", movesY = axis !== "x";
    let startX = 0, startY = 0, startW = 0, startH = 0, dragging = false;

    handle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      dragging = true;
      const r = panel.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startW = r.width; startH = r.height;
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      document.body.classList.add("tutor-resizing");
      document.body.classList.add("tutor-resizing-" + (axis || "both"));
    });

    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      // Up / left is positive → larger; the bottom-right corner is anchored.
      applySize({
        w: movesX ? startW + (startX - e.clientX) : startW,
        h: movesY ? startH + (startY - e.clientY) : startH
      });
    });

    function end(e) {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      document.body.classList.remove("tutor-resizing");
      document.body.classList.remove("tutor-resizing-" + (axis || "both"));
      const r = panel.getBoundingClientRect();
      saveSize(r.width, r.height);
    }
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);

    // Keyboard resize for accessibility: arrows nudge, with a larger step on
    // Shift. Each handle only answers to the arrows on the axis it owns.
    handle.addEventListener("keydown", function (e) {
      const step = e.shiftKey ? 40 : 16;
      const r = panel.getBoundingClientRect();
      let w = r.width, h = r.height, hit = true;
      switch (e.key) {
        case "ArrowLeft": if (movesX) w += step; else hit = false; break;   // grow width
        case "ArrowRight": if (movesX) w -= step; else hit = false; break;
        case "ArrowUp": if (movesY) h += step; else hit = false; break;      // grow height
        case "ArrowDown": if (movesY) h -= step; else hit = false; break;
        default: hit = false;
      }
      if (!hit) return;
      e.preventDefault();
      const applied = applySize({ w: w, h: h });
      if (applied) saveSize(applied.w, applied.h);
    });
  }

  // If the viewport shrinks below the saved size/position, re-clamp so the
  // panel stays reachable. Registered once for the panel, not once per handle.
  window.addEventListener("resize", function () {
    cbBox = null;                       // the measured box is viewport-specific
    if (!panel || panel.hidden) return;
    if (panel.style.width) applySize({ w: parseFloat(panel.style.width), h: parseFloat(panel.style.height) });
    const pos = loadPos();
    if (pos) applyPos(pos);
  });

  /* ---------- per-question context (Ask AI button on a question card) ---------- */
  /* opts: { question, answer, code, tags, difficulty, hasDeep }. question/
     answer/code are plain text — the caller (js/app.js) strips any HTML
     before calling this so it can be sent straight to the model. tags/
     difficulty/hasDeep only drive the suggestion chips (see pickSuggestions). */
  function askAbout(opts) {
    opts = opts || {};
    currentContext = {
      question: opts.question || "",
      answer: opts.answer || "",
      code: opts.code || "",
      tags: opts.tags || [],
      category: opts.category || "",
      difficulty: opts.difficulty || "",
      hasDeep: !!opts.hasDeep
    };
    contextPending = true;
    history.length = 0;
    openPanel(); // idempotent — ensures the panel is visible without relying on the `open` flag
    if (listEl) listEl.innerHTML = "";
    renderContext();
    greet();
  }

  function clearContext() {
    currentContext = null;
    contextPending = false;
    renderContext();
  }

  function renderContext() {
    if (!contextEl) return;
    // The generic subtitle ("Ask about any interview topic") is redundant once
    // a question is pinned here, and on a narrow panel the two together wrap
    // to a cramped multi-line header — drop the subtitle instead of fighting
    // it for space.
    if (panel) panel.classList.toggle("has-context", !!currentContext);
    if (!currentContext) { contextEl.hidden = true; contextEl.innerHTML = ""; return; }
    contextEl.hidden = false;
    contextEl.innerHTML =
      '<span class="tutor-context-label" title="' + esc(currentContext.question) + '">📌 ' +
        esc(truncate(currentContext.question, 70)) +
      '</span>' +
      '<button class="tutor-context-clear" id="tutor-context-clear" type="button" aria-label="Clear question context" title="Clear question context">Clear</button>';
    contextEl.querySelector("#tutor-context-clear").addEventListener("click", clearContext);
  }

  function truncate(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  /* ---------- tier / key handling ---------- */
  /* The one place that decides whether a failed response is the KEY's fault.
     Returns "need" (none supplied), "bad" (Groq rejected it) or null (some
     other failure, which must never be reported as a key problem). */
  function keyFailure(resp, data) {
    if (resp.status !== 401) return null;
    if (data.code === "BAD_KEY") return "bad";
    if (data.code === "NEED_KEY") return "need";
    return null;
  }

  /* Shared reaction to the two key failures: a bad key is discarded (keeping it
     would let resolveAccess wave the user through to a chat that can't work),
     and only a bad key is described as "rejected". */
  function handleKeyFailure(kind, message) {
    if (kind === "bad") {
      clearKey();
      applyGate("key", { rejected: true });
      setStatus(message || "That key was rejected.", "warn");
    } else {
      applyGate("key", {});
      setStatus("Add a Groq API key to continue.", "warn");
    }
  }

  function hasKey() { try { return !!localStorage.getItem(KEY_STORE); } catch (e) { return false; } }
  function getKey() { try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } }

  /* ---------- access gate ----------
     Decides, once per panel, which of three things the user may see. Order
     matters: signed-out is a hard stop (no key box, no chat), because "who are
     you" has to be answered before "what may you use". Only when the SERVER
     confirms free access — or the user has supplied their own key — does any
     chat UI get built. */
  async function resolveAccess() {
    if (!panel) return;
    const seq = ++gateSeq;
    applyGate("loading");

    // isSignedIn() reads false until Firebase's first auth callback lands, so
    // deciding before that would flash the sign-in wall at a signed-in user.
    try {
      if (IQB.cloud && IQB.cloud.authReady) await IQB.cloud.authReady();
    } catch (e) { /* treat as signed out */ }
    if (seq !== gateSeq) return;

    if (!(IQB.cloud && IQB.cloud.isSignedIn && IQB.cloud.isSignedIn())) {
      verifiedFree = false;
      return applyGate("signin");
    }

    const res = await checkFreeAccess();
    if (seq !== gateSeq) return;
    verifiedFree = !!res.free;
    // `checked === false` means the server couldn't run the lookup at all — the
    // gate is the same (fail closed), but the copy must not assert a fact we
    // never established. See renderKeyGate.
    applyGate(res.free || hasKey() ? "ready" : "key", { unknown: !res.checked });
  }

  /* Asks the server whether this account may use the master key. Returns
     { free, checked } — `checked:false` means the server couldn't answer at all
     (misconfigured credentials, network failure), which is NOT the same as a
     definite "no" and is worded differently in the UI. Memoised per uid: the
     answer can't change mid-session, and the panel re-checks on every open. */
  async function checkFreeAccess() {
    const u = IQB.cloud && IQB.cloud.getUser && IQB.cloud.getUser();
    const uid = (u && u.uid) || "";
    if (accessMemo && accessMemo.uid === uid) return accessMemo;

    let free = false, checked = false;
    try {
      const token = await getIdToken();
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      // Deliberately no x-groq-key: this asks "is this ACCOUNT whitelisted",
      // and a locally stored key must not colour that answer.
      const resp = await fetch(API_URL, {
        method: "POST", headers: headers, body: JSON.stringify({ mode: "access" })
      });
      const data = await resp.json().catch(function () { return {}; });
      free = !!(resp.ok && data.tier === "free");
      // An older deployment that predates mode:"access" answers 400 — treat
      // that as "couldn't check" too, not as a denial.
      checked = !!(resp.ok && data.checked !== false);
    } catch (e) {
      free = false; checked = false;
    }
    accessMemo = { uid: uid, free: free, checked: checked };
    return accessMemo;
  }

  /* Paints one of the walls (or clears them). Everything chat-related is hidden
     by .is-gated in css/tutor.css, so a walled-off user cannot see the thread,
     the pinned question, or the composer — not even briefly. */
  function applyGate(state, opts) {
    gate = state;
    if (!panel || !gateEl) return;
    panel.classList.toggle("is-gated", state !== "ready");

    if (state === "ready") {
      gateEl.hidden = true;
      gateEl.innerHTML = "";
      greet(); // first time through this is what actually starts the conversation
      return;
    }

    gateEl.hidden = false;
    if (state === "loading") { renderLoadingGate(); return; }
    if (state === "signin") { renderSigninGate(); return; }
    renderKeyGate(opts || {});
  }

  function renderLoadingGate() {
    gateEl.innerHTML =
      '<div class="tutor-gate-inner">' +
        '<div class="tutor-spinner" role="status" aria-label="Checking access"></div>' +
        '<p class="tutor-gate-sub">Checking your access…</p>' +
      '</div>';
  }

  function renderSigninGate() {
    gateEl.innerHTML =
      '<div class="tutor-gate-inner">' +
        '<div class="tutor-gate-ic">' + GATE_ICON.user + '</div>' +
        '<h3 class="tutor-gate-title">Sign In Required</h3>' +
        '<p class="tutor-gate-sub">Please sign in to use the AI Helper</p>' +
        '<button class="tutor-gate-btn" id="tutor-gate-signin" type="button">Sign In</button>' +
      '</div>';
    const b = gateEl.querySelector("#tutor-gate-signin");
    b.addEventListener("click", function () {
      if (IQB.sync && IQB.sync.signIn) IQB.sync.signIn(b);
    });
  }

  /* opts: { rejected, unknown }. The three messages are deliberately different
     claims: a rejected key is a fact, "not on the list" is a fact, and
     `unknown` is the honest admission that the check never ran — never dress
     that last one up as a verdict about the user's account. */
  function renderKeyGate(opts) {
    let msg;
    if (opts.rejected) msg = "That key was rejected. Add a valid Groq API key to continue.";
    else if (opts.unknown) msg = "We couldn't verify your access just now. Add your own Groq API key to continue, or try again later.";
    else msg = "Your account isn't on the free list yet. Add your own Groq API key to start chatting.";

    gateEl.innerHTML =
      '<div class="tutor-gate-inner">' +
        '<div class="tutor-gate-ic">' + GATE_ICON.key + '</div>' +
        '<h3 class="tutor-gate-title">Add an API Key</h3>' +
        '<p class="tutor-gate-sub">' + msg + '</p>' +
        '<div class="tutor-key-row">' +
          '<input class="tutor-key-input" id="tutor-key-input" type="password" ' +
            'placeholder="Paste your Groq API key" autocomplete="off" spellcheck="false">' +
          '<button class="tutor-key-save" id="tutor-key-save" type="button">Save</button>' +
        '</div>' +
        '<p class="tutor-key-err" id="tutor-key-err" role="alert" hidden></p>' +
        '<a class="tutor-key-help" href="https://console.groq.com/keys" target="_blank" rel="noopener">Get a free Groq key →</a>' +
      '</div>';
    gateEl.querySelector("#tutor-key-save").addEventListener("click", saveKey);
    const inp = gateEl.querySelector("#tutor-key-input");
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") saveKey(); });
    // Typing again clears the previous complaint — the old error refers to the
    // old key and would otherwise sit there contradicting what's in the box.
    inp.addEventListener("input", function () { showKeyError(""); });
    setTimeout(function () { inp.focus(); }, 50);
  }

  function showKeyError(msg) {
    const el = gateEl && gateEl.querySelector("#tutor-key-err");
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
  }

  function setKeyBusy(busy) {
    const btn = gateEl && gateEl.querySelector("#tutor-key-save");
    const inp = gateEl && gateEl.querySelector("#tutor-key-input");
    if (btn) { btn.disabled = busy; btn.textContent = busy ? "Checking…" : "Save"; }
    if (inp) inp.disabled = busy;
  }

  /* Spends one real (1-token) completion on the candidate key before storing
     it. Storing first and finding out later is what produced the old dead end:
     the key looked accepted, the chat opened, and the first message failed with
     an error the user then had to interpret. Proving it up front means a stored
     key is always a working key. */
  async function validateKey(candidate) {
    try {
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-groq-key": candidate },
        body: JSON.stringify({ mode: "validate" })
      });
      const data = await resp.json().catch(function () { return {}; });
      if (resp.ok && data.ok) return { ok: true };
      // An older deployment without mode:"validate" answers 400 "Message is
      // required". Don't read that as a bad key — let it through and let the
      // first real message be the test, as it used to be.
      if (resp.status === 400 && !data.code && /message is required/i.test(data.error || "")) {
        return { ok: true, unverified: true };
      }
      return { ok: false, error: data.error || "That key didn't work. Check it and try again." };
    } catch (e) {
      return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
  }

  async function saveKey() {
    const inp = gateEl.querySelector("#tutor-key-input");
    const val = (inp && inp.value || "").trim();
    if (!val) { inp && inp.focus(); return; }

    showKeyError("");
    setKeyBusy(true);
    const result = await validateKey(val);
    setKeyBusy(false);

    if (!result.ok) {
      // Stay on the wall with the key still in the box, so the user can compare
      // it against the console and correct it in place.
      showKeyError(result.error);
      if (inp) { inp.focus(); inp.select(); }
      return;
    }

    try { localStorage.setItem(KEY_STORE, val); } catch (e) { /* ignore */ }
    applyGate("ready");
    setStatus(result.unverified
      ? "Key saved on this device."
      : "Key verified and saved on this device.", "ok");
    inputEl && inputEl.focus();
  }

  function clearKey() {
    try { localStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ }
  }

  /* ---------- sending ---------- */
  async function onSubmit(e) {
    e.preventDefault();
    if (sending) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    autosize();
    await sendMessage(text);
  }

  /* Shared by the composer (onSubmit) and a chip click — a chip is just a
     pre-written message, not a separate code path.

     `displayText` lets the two diverge: the welcome chips send the model a long
     instruction ("...ask exactly one question, then stop and wait...") but the
     user only ever chose a short label, so that label is what belongs in their
     bubble. The model still receives, and remembers, the full instruction —
     only the transcript is written in the user's own terms. */
  async function sendMessage(text, displayText) {
    if (sending || !text) return;
    removeSuggestionChips(); // one-time offer; once the user acts, the chips are stale
    addBubble("user", displayText || text);
    // History keeps the FULL text: it's what the model actually received, and
    // replaying the short label instead would quietly rewrite the conversation.
    pushHistory("user", text);

    sending = true;
    setBusy(true);
    const typing = addTyping();

    // Fold the pinned question/answer into just the NEXT outgoing message —
    // the visible bubble and client history stay as the plain text the user
    // typed; only what's actually sent to the model carries the context.
    let outgoing = text;
    if (currentContext && contextPending) {
      outgoing =
        "CONTEXT — the user is viewing this interview question and its official answer on the site:\n" +
        "Question: " + currentContext.question + "\n" +
        "Answer: " + currentContext.answer +
        (currentContext.code ? "\nCode:\n" + currentContext.code : "") +
        "\n\nUser's message: " + text;
      contextPending = false;
    }

    try {
      const headers = { "Content-Type": "application/json" };
      // Attach the Firebase ID token when signed in — the server decides free tier.
      const token = await getIdToken();
      if (token) headers["Authorization"] = "Bearer " + token;
      const key = getKey();
      if (key) headers["x-groq-key"] = key;

      const resp = await fetch(API_URL, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ message: outgoing, history: history.slice(0, -1) })
      });
      const data = await resp.json().catch(function () { return {}; });
      typing.remove();

      // Only these two are actually about the key: NEED_KEY (none supplied) and
      // BAD_KEY (Groq rejected the one supplied). Everything else is a fault
      // with the request or the service and must NOT accuse the user's key.
      if (resp.status === 401 && (data.code === "NEED_KEY" || data.code === "BAD_KEY")) {
        // Roll the turn back out of history so it isn't sent twice.
        history.pop();
        if (currentContext) contextPending = true; // this send never reached the model
        handleKeyFailure(data.code === "BAD_KEY" ? "bad" : "need", data.error);
        return;
      }
      if (!resp.ok) {
        if (currentContext) contextPending = true; // this send never reached the model
        // Stay in the thread: the message below is the only diagnostic the user
        // gets, and gating here would wipe it off screen the instant it appears.
        addBubble("model", "⚠️ " + (data.error || "Something went wrong. Please try again."));
        return;
      }

      if (data.tier === "free") verifiedFree = true;
      addBubble("model", data.reply);
      pushHistory("model", data.reply);
      requestFollowups(text, data.reply); // keep the coaching going — see below
    } catch (err) {
      if (currentContext) contextPending = true; // network failure — context never reached the model
      typing.remove();
      addBubble("model", "⚠️ Network error — check your connection and try again.");
    } finally {
      sending = false;
      setBusy(false);
      inputEl.focus();
    }
  }

  async function getIdToken() {
    try {
      const u = IQB.cloud && IQB.cloud.getUser && IQB.cloud.getUser();
      if (u && typeof u.getIdToken === "function") return await u.getIdToken();
    } catch (e) { /* ignore */ }
    return null;
  }

  function pushHistory(role, text) {
    history.push({ role: role, text: text });
    while (history.length > MAX_HISTORY) history.shift();
  }

  /* ---------- rendering ---------- */
  function addBubble(role, text) {
    const wrap = document.createElement("div");
    wrap.className = "tutor-msg tutor-" + (role === "user" ? "user" : "bot");
    const b = document.createElement("div");
    b.className = "tutor-bubble";
    if (role === "user") b.textContent = text;
    else b.innerHTML = renderMarkdown(text);
    wrap.appendChild(b);
    listEl.appendChild(wrap);
    if (role !== "user") {
      wireCopyButtons(b);
      /* A whole-answer copy, on top of the per-code-block buttons wired above:
         those take the snippet, this takes the reply. Skipped for the one-line
         "⚠️ …" notices, where a Copy affordance is just noise. */
      if (!isNotice(text)) {
        wrap.classList.add("tutor-has-acts");
        wrap.appendChild(buildMsgActions(b, text));
      }
    }
    scrollDown();
    return wrap;
  }

  function isNotice(text) { return /^\s*⚠️/.test(String(text || "")); }

  function buildMsgActions(bubble, raw) {
    const acts = document.createElement("div");
    acts.className = "tutor-acts";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tutor-act";
    btn.title = "Copy this answer";
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="9" y="9" width="12" height="12" rx="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>';
    btn.addEventListener("click", function () { copyAnswer(bubble, raw, btn); });

    acts.appendChild(btn);

    /* Read aloud, beside Copy. The bubble's own code blocks are skipped by the
       extractor and announced instead — see js/speak.js. The root is resolved
       on click rather than captured here, because a streamed reply is still
       filling in when this row is built. */
    if (window.IQB.speak && IQB.speak.supported) {
      acts.appendChild(IQB.speak.buildFor({
        cls: "tutor-act", label: "Listen", title: "Read this answer aloud",
        name: "AI Helper",
        root: function () { return bubble; }
      }));
    }

    return acts;
  }

  /* Two flavours on the clipboard at once:

     text/html  — the rendered answer, so pasting into My Notes or the Quick
                  Note window keeps the headings, lists and code blocks.
     text/plain — the original markdown, NOT the bubble's textContent. Reading
                  text out of the DOM would run the headings and paragraphs
                  together (textContent inserts no line breaks at block
                  boundaries) and would also pick up the word "Copy" from each
                  code block's own button. The source markdown is already the
                  readable, correctly-broken version of exactly this answer. */
  function copyAnswer(bubble, raw, btn) {
    const clone = bubble.cloneNode(true);
    clone.querySelectorAll(".tutor-copy").forEach(function (n) { n.remove(); });
    const html = clone.innerHTML;
    const plain = String(raw || "").trim();

    function flash(ok) {
      const label = btn.querySelector("span");
      if (!label) return;
      label.textContent = ok ? "Copied" : "Copy failed";
      btn.classList.toggle("is-done", ok);
      setTimeout(function () { label.textContent = "Copy"; btn.classList.remove("is-done"); }, 1600);
    }

    function plainOnly() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(plain).then(function () { flash(true); },
          function () { flash(legacyCopy(plain)); });
        return;
      }
      flash(legacyCopy(plain));
    }

    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" })
      })]).then(function () { flash(true); }, plainOnly);   // Firefox refuses write() — fall back
      return;
    }
    plainOnly();
  }

  /* Last resort for browsers without the async clipboard (and for insecure
     origins, where it is unavailable regardless of support). */
  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function addTyping() {
    const wrap = document.createElement("div");
    wrap.className = "tutor-msg tutor-bot";
    wrap.innerHTML = '<div class="tutor-bubble tutor-typing"><span></span><span></span><span></span></div>';
    listEl.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function setBusy(busy) {
    const send = panel.querySelector("#tutor-send");
    if (send) send.disabled = busy;
    inputEl.disabled = busy;
  }

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.className = "tutor-status tutor-status-" + (kind || "");
    statusEl.textContent = msg;
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(function () { statusEl.hidden = true; }, 4000);
  }

  function clearThread() {
    history.length = 0;
    // Re-arm the context so it's resent — the model's memory of it was just wiped.
    if (currentContext) contextPending = true;
    if (listEl) listEl.innerHTML = "";
    greet();
  }

  /* Re-render the greeting from scratch (used by the refresh button and by a
     live category change). Clearing first defeats greet()'s "already has
     content" guard, so the welcome + chips always come back fresh. */
  function refreshWelcome() {
    if (!listEl) return;
    listEl.innerHTML = "";
    greet();
  }

  /* Called by js/app.js whenever the reader switches category. Keeps the welcome
     chips in step with the category on screen — but only while the panel is open
     and the thread is still untouched, so it never wipes a real conversation. */
  function onCategoryChanged() {
    if (!panel || panel.hidden) return;
    if (currentContext || history.length) return;
    refreshWelcome();
  }

  function scrollDown() { if (listEl) listEl.scrollTop = listEl.scrollHeight; }
  function autosize() {
    if (!inputEl) return;
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
  }

  /* ---------- minimal, safe markdown ----------
     Escapes first, then re-introduces a small, known-safe subset: fenced code
     (syntax-highlighted), inline code, bold, links, headings, bullet + numbered
     lists, and pipe tables. No raw HTML from the model is ever inserted (every
     dynamic value passes through esc()), so this can't be an XSS vector. */
  function renderMarkdown(src) {
    const blocks = [];
    // Pull fenced code out first so its contents aren't touched by block/inline
    // rules below. "@@CB@@N@@CB@@" is a placeholder that can't collide with
    // real model text (unlike a plain space-padded number).
    let s = String(src).replace(/```(\w+)?\n?([\s\S]*?)```/g, function (_, lang, code) {
      const i = blocks.length;
      const clean = code.replace(/\n$/, "");
      const label = (lang || "code").toLowerCase();
      blocks.push(
        '<div class="tutor-code">' +
          '<div class="tutor-code-head">' +
            '<span class="tutor-code-lang">' + esc(label) + '</span>' +
            '<button class="tutor-copy" type="button">Copy</button>' +
          '</div>' +
          '<pre><code>' + highlightCode(clean, label) + '</code></pre>' +
        '</div>'
      );
      return "@@CB@@" + i + "@@CB@@";
    });

    const lines = s.split("\n");
    const html = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // ATX heading: #, ##, ### … (capped at h4 so it stays panel-sized)
      const atx = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (atx) {
        const level = Math.min(atx[1].length + 1, 4); // # -> h2, ## -> h3, ### -> h4
        html.push("<h" + level + ' class="tutor-h">' + inlineFormat(atx[2].replace(/\s*#+\s*$/, "")) + "</h" + level + ">");
        i++;
        continue;
      }

      // Setext heading: a text line underlined by === or --- (the prompt asks
      // the model not to, but real models still emit it — handle it so it never
      // shows as a literal row of = or -).
      const next = lines[i + 1] !== undefined ? lines[i + 1].trim() : "";
      if (trimmed && /^={2,}$/.test(next)) {
        html.push('<h3 class="tutor-h">' + inlineFormat(trimmed) + "</h3>");
        i += 2;
        continue;
      }
      if (trimmed && /^-{3,}$/.test(next) && !/^[-•]\s+/.test(trimmed)) {
        html.push('<h4 class="tutor-h">' + inlineFormat(trimmed) + "</h4>");
        i += 2;
        continue;
      }

      // Horizontal rule (a bare --- / *** on its own line)
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { html.push('<hr class="tutor-hr">'); i++; continue; }

      // Table
      if (isTableRow(line) && lines[i + 1] !== undefined && isTableSeparator(lines[i + 1])) {
        const headerCells = splitRow(line);
        const bodyRows = [];
        let j = i + 2;
        while (j < lines.length && isTableRow(lines[j])) { bodyRows.push(splitRow(lines[j])); j++; }
        html.push(renderTable(headerCells, bodyRows));
        i = j;
        continue;
      }

      // Unordered list
      if (/^[-*•]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*•]\s+/, ""));
          i++;
        }
        html.push("<ul>" + items.map(function (it) { return "<li>" + inlineFormat(it) + "</li>"; }).join("") + "</ul>");
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
          i++;
        }
        html.push("<ol>" + items.map(function (it) { return "<li>" + inlineFormat(it) + "</li>"; }).join("") + "</ol>");
        continue;
      }

      if (trimmed === "") { i++; continue; }

      html.push("<p>" + inlineFormat(line) + "</p>");
      i++;
    }

    let out = html.join("");
    out = out.replace(/@@CB@@(\d+)@@CB@@/g, function (_, idx) { return blocks[Number(idx)]; });
    return out;
  }

  function inlineFormat(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code class="tutor-inline">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function isTableRow(line) { return /^\s*\|.*\|\s*$/.test(line); }
  function isTableSeparator(line) { return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line); }
  function splitRow(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
  }

  function renderTable(headers, rows) {
    let out = '<div class="tutor-table-wrap"><table><thead><tr>';
    headers.forEach(function (h) { out += "<th>" + inlineFormat(h) + "</th>"; });
    out += "</tr></thead><tbody>";
    rows.forEach(function (r) {
      out += "<tr>";
      r.forEach(function (c) { out += "<td>" + inlineFormat(c) + "</td>"; });
      out += "</tr>";
    });
    out += "</tbody></table></div>";
    return out;
  }

  /* ---------- syntax highlighting ----------
     Delegates to js/highlight.js, which is the same tokenizer this file used to
     carry inline. It moved out so My Notes' code blocks highlight identically —
     two copies would drift apart. */
  function highlightCode(code, lang) {
    return IQB.highlight.code(code, lang);
  }

  function wireCopyButtons(root) {
    root.querySelectorAll(".tutor-copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const code = btn.closest(".tutor-code").querySelector("code");
        const text = code ? code.textContent : "";
        navigator.clipboard && navigator.clipboard.writeText(text).then(function () {
          btn.textContent = "Copied";
          setTimeout(function () { btn.textContent = "Copy"; }, 1500);
        });
      });
    });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Expose a tiny API so other modules (or a "clear key" menu item) can reach it.
  IQB.tutor = {
    open: openPanel,
    clearKey: clearKey,
    /* Called by a question card's "Ask AI" button (js/app.js). question/answer/
       code must already be plain text — this resets the thread to a fresh,
       focused conversation scoped to that one question. */
    askAbout: askAbout,
    /* The robot mascot as markup, so callers outside this module (the question
       cards' "Ask AI" button in js/app.js) show the same character rather than
       drawing their own. Args: (size, extraClass, strokeWidth). */
    icon: botIcon,
    /* Called by js/app.js on category change so the open welcome view can retarget
       its chips to the new category (no-op mid-conversation). */
    onCategoryChanged: onCategoryChanged
  };
})();

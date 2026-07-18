/* ============================================================
   /api/chat  —  Vercel Serverless Function (Node runtime)

   Secure proxy to the Groq API (OpenAI-compatible chat completions) for the
   Interview Helper "AI Tutor". It NEVER exposes the master key to the browser.

   Dual-mode authentication:
     1. Internal / free tier: a signed-in Firebase user whose Firestore
        doc  users/{uid}.hasFreeAccess === true  is served with MY
        master key (process.env.GROQ_MASTER_API_KEY).
     2. Public / BYO-key tier: everyone else must send their own Groq
        key in the  x-groq-key  header; the request is billed to them
        (against Groq's free tier, or their own paid usage).

   IMPORTANT: this file must run on the NODE runtime, not Edge. The
   Firebase Admin SDK needs Node crypto. A plain function under /api on a
   static Vercel project already defaults to Node — do not add
   `export const config = { runtime: 'edge' }`.
   ============================================================ */

import admin from "firebase-admin";

/* ---------- Firebase Admin (initialised once per warm instance) ---------- */
/* Store the whole service-account JSON in one env var, FIREBASE_SERVICE_ACCOUNT.
   In the Vercel dashboard paste the JSON as a single line (or base64 it and set
   FIREBASE_SERVICE_ACCOUNT_B64 instead — handled below). Mark it "Sensitive". */
function initAdmin() {
  if (admin.apps.length) return admin.app();

  let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw && process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8");
  }
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");

  const creds = JSON.parse(raw);
  // JSON in an env var keeps \n as a literal backslash-n; restore real newlines.
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, "\n");

  return admin.initializeApp({ credential: admin.credential.cert(creds) });
}

/* ---------- best-effort rate limit for the MASTER key -------------------
   Protects your quota from a single whitelisted account (or a leaked token)
   hammering the endpoint. This is per-warm-instance memory, so it is a soft
   ceiling, not a hard guarantee — Vercel may run several instances. For a hard
   limit put Upstash Redis behind this (see README notes). Users on their OWN
   key are not limited here; their own Google quota governs them. */
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 15; // master-key requests per uid per minute
const hits = new Map(); // uid -> { count, resetAt }

function rateLimited(uid) {
  const now = Date.now();
  const rec = hits.get(uid);
  if (!rec || now > rec.resetAt) {
    hits.set(uid, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_PER_WINDOW;
}

/* ---------- Groq call ------------------------------------------------------
   Groq exposes an OpenAI-compatible /chat/completions endpoint: auth via
   Authorization: Bearer <key> (never a query param, unlike Gemini), and
   messages use {role: "system"|"user"|"assistant", content}. */
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const SYSTEM_PROMPT =
  "You are a senior software engineer acting as a personal interview coach inside " +
  "Interview Helper, mentoring a candidate preparing for software-engineering interviews " +
  "(Angular, JavaScript/TypeScript, Java, Spring Boot, SQL, RxJS, system design, DSA, " +
  "and behavioural rounds).\n\n" +

  "CRITICAL — you are a companion to the question bank, not a copy of it. Messages may " +
  "include a CONTEXT block with a specific question and its OFFICIAL answer, which the " +
  "user has ALREADY READ on screen. Never rephrase, restate, or summarize that official " +
  "answer back to them. Add what the card doesn't have: a sharper explanation, a better " +
  "analogy, a realistic project scenario, edge cases, how it works internally, common " +
  "interview traps, comparisons with related concepts, or best practices — whichever the " +
  "user's actual question calls for.\n\n" +

  "STRUCTURE — produce a rich, well-organised mini-tutorial, never one big paragraph. " +
  "Open with a one- or two-line title as a level-2 heading (## Title). Break the body into " +
  "clear, descriptive sections with level-3 headings (### What is X?, ### How it works, " +
  "### Practical Example, ### Common Mistakes, ### Interview Insight, ### Best Practices, " +
  "### Key Takeaways — whichever fit). Under each heading use short paragraphs, bullet or " +
  "numbered lists, and code where it helps. Only include sections that genuinely add value; " +
  "a short follow-up may need just one or two.\n\n" +

  "DEPTH — this is a premium interview coach, so be genuinely thorough and specific: real " +
  "internals, edge cases, concrete project scenarios, gotchas, and interview follow-ups. " +
  "Prefer substance over length, but do not be shallow — a strong answer typically has " +
  "several sections and at least one runnable code example.\n\n" +

  "CODE — realistic, as in a real project, in a fenced block with an accurate language tag " +
  "(```ts, ```js, ```java, ```python, ```html, ```sql, ```bash). Keep each snippet focused; " +
  "comment only the parts that need explaining. Show more than one snippet when it clarifies.\n\n" +

  "COMPARISONS — use a markdown table when comparing two or more concepts side by side; " +
  "use bullet or numbered lists otherwise.\n\n" +

  "INTERVIEW FOCUS — weave in what interviewers actually ask: likely follow-up questions, " +
  "how to phrase a confident answer, common misconceptions, and best practices.\n\n" +

  "QUIZ / INTERVIEW MODE — if asked to quiz, test, or interview the user: ask exactly ONE " +
  "question, then stop and wait — never reveal the ideal answer first. Once they answer, " +
  "evaluate it, give constructive feedback, show the ideal interview-ready answer, then " +
  "offer another question.\n\n" +

  "TONE — a senior engineer mentoring someone: clear, practical, precise, encouraging. No " +
  "filler, no hedging, no restating the user's question back. Do not end with a generic " +
  "meta-question like \"would you like to know more?\" — the interface already offers " +
  "next-step suggestions.\n\n" +

  "FORMATTING — Markdown only: ## and ### headings, **bold** for key terms, `inline code` " +
  "for identifiers, fenced code blocks, bullet/numbered lists, and tables. Do NOT use " +
  "setext underline headers (a line of === or --- under text). Keep it clean and readable.";

/* Turns a failed Groq response into an Error the handler can classify.

   The distinction that matters: Groq answers 401/403 when the KEY is bad, and
   400 when the REQUEST is bad (a decommissioned model, malformed body, a
   too-long prompt). Collapsing both into one status — as this used to — makes
   the UI blame the user's key for faults that have nothing to do with it, and
   the only clue (the real message) gets thrown away. Anything key-related is
   tagged BAD_KEY; everything else keeps its own message and is NOT a key
   problem. */
function groqError(resp, data) {
  const msg = (data && data.error && data.error.message) || "Groq request failed";
  const err = new Error(msg);
  if (resp.status === 401 || resp.status === 403) {
    err.status = 401;
    err.code = "BAD_KEY";
  } else if (resp.status === 429) {
    // Groq's own quota, not ours. Pass it through so the user is told to wait
    // rather than being shown a vague failure (or blamed for a bad key).
    err.status = 429;
  } else {
    err.status = resp.status === 400 ? 400 : 502;
  }
  return err;
}

async function callGroq(apiKey, history, message) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  // Client sends prior turns as [{ role: 'user' | 'model', text }] (kept
  // provider-agnostic in the UI) — map to OpenAI's user/assistant + content.
  // Cap the window so a long thread can't blow up token cost.
  const history_msgs = (Array.isArray(history) ? history.slice(-12) : [])
    .filter((t) => t && (t.role === "user" || t.role === "model") && typeof t.text === "string")
    .map((t) => ({ role: t.role === "model" ? "assistant" : "user", content: t.text.slice(0, 8000) }));

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history_msgs,
    { role: "user", content: message }
  ];

  const body = {
    model: GROQ_MODEL,
    messages,
    temperature: 0.4,
    max_tokens: 2048 // structured multi-section coaching replies run longer than a plain definition
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey
    },
    body: JSON.stringify(body)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw groqError(resp, data);

  const reply = data?.choices?.[0]?.message?.content || "";
  if (!reply) {
    throw Object.assign(new Error("Empty response"), { status: 502 });
  }
  return reply;
}

/* ---------- key validation --------------------------------------------------
   Sends the smallest possible real completion so the client can prove a key
   works BEFORE storing it. Deliberately uses GROQ_MODEL — the same model the
   chat uses — because "is this key valid" is not the question the user cares
   about; "will the chat actually answer me" is. A key that is fine but paired
   with a decommissioned model must fail here too, or we'd store it and let the
   user discover the problem on their first message. */
async function callGroqPing(apiKey) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw groqError(resp, data);
  return true;
}

/* ---------- suggestion-chip generation -------------------------------------
   Powers the 3 quick-reply chips shown when a user opens the AI Tutor from a
   question's "Ask AI" button. The model picks these itself (never a hardcoded
   or randomly-chosen list) — it's just asked to keep them short and to return
   exactly 3, as plain JSON so the client can render them without any parsing
   of prose. A separate, smaller/faster model keeps this snappy since it's a
   quick classification task, not the actual answer. */
const SUGGEST_MODEL = process.env.GROQ_SUGGEST_MODEL || "llama-3.1-8b-instant";
const SUGGEST_SYSTEM_PROMPT =
  "You generate quick-reply suggestion chips for a technical interview-prep chatbot.\n" +
  "Given ONE interview question and its official answer, propose exactly 3 distinct, " +
  "short follow-up prompts a learner could tap to continue the conversation — things " +
  "like asking for a simpler explanation, a code example, common mistakes, a deep dive, " +
  "or a comparison, whichever fit this specific question best. You are not limited to " +
  "any fixed list — write whatever 3 short prompts genuinely fit this topic.\n" +
  "Rules: each suggestion must be under 6 words, phrased as something the learner would " +
  "send (an instruction or question), no numbering, no leading emoji or quotes.\n" +
  "Respond with ONLY a JSON array of exactly 3 strings — no markdown, no code fences, no other text.";

async function callGroqSuggest(apiKey, question, answer, code) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const userContent =
    "Question: " + question +
    (answer ? "\nAnswer: " + String(answer).slice(0, 2000) : "") +
    (code ? "\nCode:\n" + String(code).slice(0, 500) : "");

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model: SUGGEST_MODEL,
      messages: [
        { role: "system", content: SUGGEST_SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ],
      temperature: 0.5,
      max_tokens: 120
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw groqError(resp, data);

  const raw = data?.choices?.[0]?.message?.content || "";
  const list = parseSuggestionList(raw);
  if (!list.length) throw Object.assign(new Error("Empty response"), { status: 502 });
  return list.slice(0, 3);
}

/* ---------- "important questions" curation ---------------------------------
   Powers the AI Tutor's "List Important {Category} Questions" action. The client
   does NOT want prose back — it wants a handful of KEYWORDS it can use to filter
   the on-device question bank down to a curated study list. So the model is given
   the category and its actual tag vocabulary, and asked to return the keywords of
   the most interview-critical topics, drawn from (or closely matching) those tags
   so every keyword lands on real questions. Same small/fast model as suggestions. */
const CURATE_SYSTEM_PROMPT =
  "You help a candidate focus their interview prep. You are given a technical CATEGORY " +
  "and the TAGS that exist across that category's question bank. Choose the keywords of " +
  "the most important, interview-critical topics a candidate must master in that category.\n" +
  "Rules: pick 5 to 10 keywords. Prefer keywords that appear in (or closely match) the " +
  "provided tags, so they map onto real questions — do not invent unrelated terms. Each " +
  "keyword is one or two lowercase words, no numbering, no emoji, no quotes.\n" +
  "Respond with ONLY a JSON array of keyword strings — no markdown, no code fences, no other text.";

async function callGroqCurate(apiKey, category, tags) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const tagList = (Array.isArray(tags) ? tags : [])
    .map((t) => String(t).trim()).filter(Boolean).slice(0, 200).join(", ");
  const userContent =
    "Category: " + String(category).slice(0, 80) +
    "\nAvailable tags: " + (tagList || "(none provided)");

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model: SUGGEST_MODEL,
      messages: [
        { role: "system", content: CURATE_SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ],
      temperature: 0.3,
      max_tokens: 160
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw groqError(resp, data);

  const raw = data?.choices?.[0]?.message?.content || "";
  const list = parseSuggestionList(raw); // same lenient JSON-array recovery
  if (!list.length) throw Object.assign(new Error("Empty response"), { status: 502 });
  return list.slice(0, 10);
}

/* The model is asked for pure JSON but may still wrap it in a code fence or
   add a stray sentence — recover a JSON array from whatever comes back
   instead of failing the whole request over formatting. */
function parseSuggestionList(raw) {
  const cleaned = String(raw).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const tryParse = (s) => {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr)
        ? arr.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim())
        : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const match = cleaned.match(/\[[\s\S]*\]/);
  return (match && tryParse(match[0])) || [];
}

/* ---------- who may spend the master key ------------------------------------
   A comma-separated allowlist of email addresses, e.g.
       FREE_ACCESS_EMAILS="me@example.com, friend@example.com"
   Set it in the Vercel dashboard (Project → Settings → Environment Variables)
   and redeploy; that is the ONLY place membership is configured.

   Deliberately NOT a Firestore flag on users/{uid}: the browser writes that
   document itself (see js/sync.js — it syncs progress and bookmarks there), so
   a field living in it is a permission the user can grant themselves from the
   devtools console. An env var is not reachable from the client at all, so this
   cannot be self-granted no matter what the Firestore rules say. */
function freeAccessEmails() {
  return String(process.env.FREE_ACCESS_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/* Resolves a request's identity and whether it is on the allowlist.
     { signedIn, free, uid, checked }
   `checked` is false ONLY when the lookup itself could not be performed — no
   service-account credentials, Firebase unreachable, etc. That is a different
   thing from "this person is not on the list", and the UI must not report the
   two the same way: telling someone they aren't whitelisted when the truth is
   "I couldn't tell" sends them hunting for a problem that doesn't exist.
   Access still fails closed in both cases; only the wording differs. */
async function identify(userToken) {
  if (!userToken) return { signedIn: false, free: false, uid: null, checked: true };

  let decoded;
  try {
    decoded = await initAdmin().auth().verifyIdToken(userToken);
  } catch (e) {
    // Distinguish a bad token (a real answer: not signed in) from a server that
    // is unable to verify anything (no answer at all).
    const misconfigured = /service account|credential|FIREBASE_SERVICE_ACCOUNT/i.test(e.message || "");
    console.warn("[chat] token verify failed:", e.message);
    return { signedIn: false, free: false, uid: null, checked: !misconfigured };
  }

  // Only a provider-verified email can be trusted to identify someone. Google
  // sign-in always sets this; without the check, an unverified address on some
  // other provider could impersonate an allowlisted one.
  const email = String(decoded.email || "").toLowerCase();
  const free = !!email && decoded.email_verified === true &&
    freeAccessEmails().indexOf(email) !== -1;

  return { signedIn: true, free: free, uid: decoded.uid, checked: true };
}

/* ---------- shared auth / key resolution -----------------------------------
   Used by both chat replies and suggestion generation — an allowlisted signed-
   in user gets the master key either way; everyone else needs their own. */
async function resolveApiKey(req) {
  const authHeader = req.headers.authorization || "";
  const userToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const customKey = (req.headers["x-groq-key"] || "").toString().trim() || null;

  const who = await identify(userToken);
  if (who.free) {
    if (rateLimited(who.uid)) return { rateLimited: true };
    return { apiKey: process.env.GROQ_MASTER_API_KEY || null, tier: "free" };
  }

  if (customKey) return { apiKey: customKey, tier: "byok" };
  return { apiKey: null, tier: null };
}

/* ---------- access probe ----------------------------------------------------
   Answers one question for the client: may THIS account use the master key? The
   tutor UI needs that before it shows anything, so it can render a sign-in wall
   / key prompt / the chat itself instead of guessing and letting a user type
   into a box that will only reject them.

   Deliberately narrower than resolveApiKey(): it ignores any x-groq-key header
   (a stored key must not make a stranger look allowlisted) and never touches the
   rate limiter, since no Groq call happens and the client calls this on open. */
async function verifyFreeAccess(req) {
  const authHeader = req.headers.authorization || "";
  const userToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return identify(userToken);
}

/* ---------- handler ------------------------------------------------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Vercel parses JSON bodies automatically, but guard for safety.
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
  const mode = body.mode === "suggest" ? "suggest"
    : body.mode === "curate" ? "curate"
    : body.mode === "access" ? "access"
    : body.mode === "validate" ? "validate"
    : "chat";

  // Tries the supplied key for real, so the client never stores one that can't
  // hold a conversation. Never touches the master key: a validation request is
  // always billed to the key being tested.
  if (mode === "validate") {
    const candidate = (req.headers["x-groq-key"] || "").toString().trim();
    if (!candidate) return res.status(400).json({ ok: false, error: "No key supplied" });
    try {
      await callGroqPing(candidate);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.warn("[chat] key validation failed:", e.message);
      return res.status(e.status || 500).json({ ok: false, error: e.message, code: e.code });
    }
  }

  // Pure lookup, no model call — always 200 so the client can tell "not
  // whitelisted" apart from a network/server failure.
  if (mode === "access") {
    const a = await verifyFreeAccess(req);
    return res.status(200).json({
      signedIn: a.signedIn,
      tier: a.free ? "free" : null,
      checked: a.checked // false => "couldn't determine", not "not allowed"
    });
  }

  let message, history;
  if (mode === "chat") {
    message = typeof body.message === "string" ? body.message.trim() : "";
    history = body.history;
    if (!message) return res.status(400).json({ error: "Message is required" });
    if (message.length > 8000) return res.status(413).json({ error: "Message too long" });
  } else if (mode === "suggest") {
    if (typeof body.question !== "string" || !body.question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }
  } else { // curate
    if (typeof body.category !== "string" || !body.category.trim()) {
      return res.status(400).json({ error: "Category is required" });
    }
  }

  const resolved = await resolveApiKey(req);
  if (resolved.rateLimited) {
    return res.status(429).json({ error: "Rate limit reached, please wait a minute." });
  }
  if (!resolved.apiKey) {
    return res.status(401).json({ error: "API key required", code: "NEED_KEY" });
  }

  try {
    if (mode === "suggest") {
      const suggestions = await callGroqSuggest(resolved.apiKey, body.question, body.answer || "", body.code || "");
      return res.status(200).json({ suggestions, tier: resolved.tier });
    }
    if (mode === "curate") {
      const keywords = await callGroqCurate(resolved.apiKey, body.category, body.tags || []);
      return res.status(200).json({ keywords, tier: resolved.tier });
    }
    const reply = await callGroq(resolved.apiKey, history, message);
    return res.status(200).json({ reply, tier: resolved.tier });
  } catch (e) {
    console.error("[chat] groq error:", e.message);
    // e.code is "BAD_KEY" only when Groq itself rejected the credentials. The
    // client keys the "your key was rejected" wall off this, so a model or
    // request fault never gets blamed on the user's key.
    return res.status(e.status || 500).json({
      error: e.message || "Server error",
      code: e.code
    });
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

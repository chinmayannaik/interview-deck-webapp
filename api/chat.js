/* ============================================================
   /api/chat  —  Vercel Serverless Function (Node runtime)

   Secure proxy to the Groq API (OpenAI-compatible chat completions) for the
   Interview Deck "AI He". It NEVER exposes the master key to the browser.

   Dual-mode authentication:
     1. Internal / free tier: a signed-in Google account that clears
        isFreeTier() below is served with MY master key. There can be up to
        THREE master keys (GROQ_MASTER_API_KEY, _2, _3) from separate Groq
        accounts; withMasterRotation() cycles to the next one when a key hits
        Groq's daily token cap (429), so the free tier's effective daily quota
        is the sum of all three. See masterKeys() / withMasterRotation().
     2. Public / BYO-key tier: everyone else must send their own Groq
        key in the  x-groq-key  header; the request is billed to them
        (against Groq's free tier, or their own paid usage).

   Who counts as tier 1 is decided ONLY by env vars — see isFreeTier(). It is
   deliberately not a Firestore flag; the reason is documented there.

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
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const SYSTEM_PROMPT =
  "You are a senior software engineer acting as a personal interview coach inside " +
  "Interview Deck, mentoring candidates preparing for software-engineering interviews " +
  "(Angular, JavaScript/TypeScript, Java, Spring Boot, SQL, RxJS, System Design, DSA, and behavioural rounds).\n\n" +
  "PRIMARY GOAL — Make every topic easy to understand. Teach like a senior engineer mentoring a junior developer. " +
  "Prefer clarity over complexity. Explain why something exists, how it works, when to use it, and common mistakes whenever helpful.\n\n" +
  "CRITICAL — You are a companion to the question bank, not a copy of it. Messages may include a CONTEXT block containing a question and its OFFICIAL answer, which the user has already read. Treat it as prior knowledge. Do not simply repeat or paraphrase the official answer. Instead, add what the card doesn't have: simpler explanations, practical examples, real project scenarios, internal working, edge cases, interview traps, comparisons, or best practices—whichever best answers the user's request. If the user explicitly asks for a simpler explanation, briefly restate the core idea before expanding.\n\n" +
  "STRUCTURE — Produce a well-organized mini tutorial, never one large paragraph. Start with a level-2 heading (## Title). Use level-3 headings only when they genuinely improve readability. Include only the sections that add value; do not force sections such as Best Practices or Interview Insight into every response. Keep paragraphs short and easy to scan.\n\n" +
  "DEPTH — Be thorough but practical. Prefer understanding over length. Explain concepts from simple to advanced. Use realistic project scenarios whenever possible. Include code only when it genuinely improves understanding; skip code for purely conceptual topics.\n\n" +
  "CODE — Use fenced code blocks with the correct language tag (ts, js, java, html, css, sql, bash, etc.). Keep snippets focused, realistic, and easy to understand. Comment only the important lines.\n\n" +
  "COMPARISONS — When comparing concepts, prefer a markdown table. Otherwise use concise bullet or numbered lists.\n\n" +
  "INTERVIEW FOCUS — Naturally include common interview follow-up questions, misconceptions, best practices, and how to explain the concept confidently in an interview whenever relevant. Do not force interview tips into every response.\n\n" +
  "QUIZ MODE — If asked to quiz, test, or conduct a mock interview, ask exactly ONE interview question and stop. Wait for the user's answer before evaluating it. Then provide constructive feedback, the ideal interview answer, and ask the next question.\n\n" +
  "TONE — Be clear, practical, friendly, and encouraging. Avoid textbook introductions, history lessons, unnecessary jargon, repetition, and filler. Do not end with generic questions like 'Would you like to know more?' because the interface already provides follow-up suggestions.\n\n" +
  "FORMATTING — Use Markdown only: ## and ### headings, **bold**, `inline code`, fenced code blocks, bullet lists, numbered lists, and markdown tables. Do not use setext-style headings (=== or ---).";

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
    // gpt-oss is a REASONING model: it emits reasoning tokens before the answer
    // and both draw on this same budget, so the cap must cover thinking + reply.
    // "medium" keeps coaching answers well-reasoned without stalling the UI.
    reasoning_effort: "medium",
    max_completion_tokens: 4096 // structured multi-section coaching replies run longer than a plain definition
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
      reasoning_effort: "low",
      max_completion_tokens: 16
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
const SUGGEST_MODEL = process.env.GROQ_SUGGEST_MODEL || "openai/gpt-oss-20b";
const SUGGEST_SYSTEM_PROMPT =
  "You generate quick-reply suggestion chips for a technical interview-prep chatbot.\n" +
  "Given ONE interview question and its official answer, generate exactly 3 follow-up prompts.\n\n" +
  "The FIRST suggestion MUST always be either 'Explain in simple words' or 'Explain in depth', choosing whichever best fits the topic.\n\n" +
  "The remaining TWO suggestions should be the MOST natural follow-up questions a learner would ask after reading the answer. Prefer topics like:\n" +
  "- practical example\n" +
  "- comparison with a closely related concept\n" +
  "- how it works internally\n" +
  "- common mistakes\n" +
  "- real project usage\n" +
  "- interview follow-up questions\n" +
  "- performance or best practices (only if highly relevant)\n\n" +
  "Do NOT invent niche or unrelated follow-ups.\n\n" +
  "Rules:\n" +
  "- Exactly 3 suggestions.\n" +
  "- Under 6 words each.\n" +
  "- Phrase as something the learner would send.\n" +
  "- No numbering, emojis, or quotes.\n" +
  "- Avoid repeating the same idea.\n\n" +
  "Respond ONLY with a JSON array of exactly 3 strings.";

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
      // Low effort, and a budget covering reasoning AND the JSON. A reasoning
      // model spends tokens thinking before it writes, so the old 120-token
      // cap came back with empty content and tripped the "Empty response" 502.
      reasoning_effort: "low",
      max_completion_tokens: 512
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
      reasoning_effort: "low", // as in callGroqSuggest: budget covers reasoning + JSON
      max_completion_tokens: 512
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

/* ---------- open enrolment (early-days switch) ------------------------------
   OPEN_ACCESS_ALL_SIGNED_IN="true" serves the master key to ANY signed-in
   Google account, ignoring the allowlist. Intended for the early period where
   the audience is small and hand-inviting people is friction that costs more
   than the quota does.

   Understand what it actually opens: Google sign-in has no invite step, so
   this is "anyone who finds the URL", not "my ~20 users". The allowlist stays
   the default precisely so that opening up is a deliberate act — an env var
   someone had to type "true" into — rather than something that could drift in
   by accident.

   Flip it back by setting it to anything else (or deleting it) and redeploying;
   the allowlist logic below is untouched and resumes immediately. */
function openAccessEnabled() {
  return String(process.env.OPEN_ACCESS_ALL_SIGNED_IN || "").trim().toLowerCase() === "true";
}

/* The single place that decides "may this identity spend my master key?".
   Both the access probe and the real key resolution route through identify(),
   which routes through here — so the two can never disagree about who is in. */
function isFreeTier(decoded) {
  // A provider-verified email is required in BOTH modes. Without it, an
  // unverified address on some other provider could impersonate an
  // allowlisted one — and under open access it is the only thing standing
  // between the master key and a throwaway identity.
  if (decoded.email_verified !== true) return false;

  const email = String(decoded.email || "").toLowerCase();
  if (!email) return false;

  if (openAccessEnabled()) return true;
  return freeAccessEmails().indexOf(email) !== -1;
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

  return { signedIn: true, free: isFreeTier(decoded), uid: decoded.uid, checked: true };
}

/* ---------- master-key rotation --------------------------------------------
   Groq's free tier caps tokens-per-DAY per account, and a busy day exhausts a
   single key well before midnight. To multiply that ceiling, the free tier can
   be backed by up to three keys from three separate Groq accounts, set as
   GROQ_MASTER_API_KEY, GROQ_MASTER_API_KEY_2, GROQ_MASTER_API_KEY_3. Order is
   the priority order; only the first is required. */
function masterKeys() {
  return [
    process.env.GROQ_MASTER_API_KEY,
    process.env.GROQ_MASTER_API_KEY_2,
    process.env.GROQ_MASTER_API_KEY_3
  ]
    .map((k) => (k || "").trim())
    .filter(Boolean);
}

/* Which master key to start from. Remembered per warm instance so that once a
   key is spent we don't re-hit it on every request — the NEXT request (any
   user's) starts straight at the key that last worked. Best-effort only:
   Vercel may run several instances, each with its own cursor, so in the worst
   case each instance wastes one failed call per key per day discovering the
   exhausted keys. Same soft-state caveat as the rate limiter above. */
let masterKeyCursor = 0;

/* Runs fn(apiKey) against the master keys, starting at the remembered cursor
   and walking the ring. A 429 means THAT key hit Groq's quota, so we advance
   and retry the SAME request on the next key — the user still gets their
   answer. The cursor sticks on whichever key resolves. Any non-429 error is a
   real fault (bad request, decommissioned model, revoked key) that rotating
   can't fix, so it's rethrown at once instead of burning the other keys. When
   every key is rate-limited, the last 429 propagates and the user is asked to
   wait — exactly as with a single key today. */
async function withMasterRotation(fn) {
  const keys = masterKeys();
  if (!keys.length) {
    throw Object.assign(new Error("No master key configured"), { status: 500 });
  }

  let lastErr;
  for (let i = 0; i < keys.length; i++) {
    const idx = (masterKeyCursor + i) % keys.length;
    try {
      const out = await fn(keys[idx]);
      masterKeyCursor = idx; // this key worked — begin here next time
      return out;
    } catch (e) {
      if (e.status !== 429) throw e; // not a quota problem — rotation won't help
      lastErr = e;
      masterKeyCursor = (idx + 1) % keys.length; // skip the spent key next time
    }
  }
  throw lastErr; // all keys exhausted for the day
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
    // useMaster => the call is run through withMasterRotation() rather than
    // bound to one key. Fall through to NEED_KEY only if no master key exists
    // at all (misconfigured server), preserving the prior behaviour.
    if (masterKeys().length) return { useMaster: true, tier: "free" };
    return { apiKey: null, tier: null };
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
  if (!resolved.apiKey && !resolved.useMaster) {
    return res.status(401).json({ error: "API key required", code: "NEED_KEY" });
  }

  // Free tier runs through the key-rotation ring; BYO-key users are bound to
  // their single key. Both expose the same "give me a key, I'll make the call"
  // shape so the mode branches below don't care which tier they're on.
  const run = resolved.useMaster
    ? (fn) => withMasterRotation(fn)
    : (fn) => fn(resolved.apiKey);

  try {
    if (mode === "suggest") {
      const suggestions = await run((key) => callGroqSuggest(key, body.question, body.answer || "", body.code || ""));
      return res.status(200).json({ suggestions, tier: resolved.tier });
    }
    if (mode === "curate") {
      const keywords = await run((key) => callGroqCurate(key, body.category, body.tags || []));
      return res.status(200).json({ keywords, tier: resolved.tier });
    }
    const reply = await run((key) => callGroq(key, history, message));
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

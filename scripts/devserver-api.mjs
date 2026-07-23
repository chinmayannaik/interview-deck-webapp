/* ============================================================
   Local dev server for the Interview Deck webapp.

   Unlike scripts/devserver.py (static only), this one ALSO runs the
   /api/chat serverless function locally, so the AI Tutor chatbot works
   end-to-end on one origin — exactly like `vercel dev`, but with no CLI,
   login, or project linking.

   It:
     - serves every static file from the project root with no-store caching
       (so an edit + reload always shows what's on disk), and
     - routes  POST /api/chat  into the real api/chat.js handler, adapting
       Node's raw req/res into the Vercel-style { body, status(), json() }
       shape the handler expects.

   Auth / keys:
     - BYO-key tier needs NOTHING here — the browser sends the user's Groq
       key in the x-groq-key header; just paste a key in the widget.
     - Master-key tier reads GROQ_MASTER_API_KEY + FIREBASE_SERVICE_ACCOUNT
       from the environment (optional; only if you want to test that path).

   Usage:
       node scripts/devserver-api.mjs [port]      # default 3500

       Run this to test chatbot locally
       node scripts/devserver-api.mjs 3500
   ============================================================ */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = Number(process.argv[2]) || 3500;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json",
};

const noStore = (res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
};

// Lazily import the real handler so a syntax error there surfaces per-request
// instead of crashing the whole server on boot.
let chatHandler = null;
async function getChatHandler() {
  if (!chatHandler) {
    const mod = await import(new URL("../api/chat.js", import.meta.url));
    chatHandler = mod.default;
  }
  return chatHandler;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

// Adapt Node's ServerResponse into the tiny Vercel-style surface the handler
// uses: res.status(n).json(obj) and res.setHeader(...).
function wrapRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

async function handleApiChat(req, res) {
  const raw = await readBody(req);
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = raw; // handler tolerates a string body via its own safeJson()
  }
  req.body = body;
  wrapRes(res);
  try {
    const handler = await getChatHandler();
    await handler(req, res);
  } catch (e) {
    console.error("[devserver] /api/chat threw:", e);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: e.message || "Server error" }));
    }
  }
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // Resolve within ROOT and block path traversal.
  let rel = normalize(urlPath).replace(/^([/\\])+/, "");
  let base = ROOT;
  /* /questions-data/* serves the sibling content repo, so unpushed question or
     pack edits can be previewed: in the browser console run
       localStorage.setItem("iqb:devDataBase", "questions-data/")
     and reload (remove the key to go back to the production CDN content). */
  if (rel.startsWith("questions-data")) {
    base = join(ROOT, "..", "interview-deck-questions");
    rel = rel.slice("questions-data".length).replace(/^([/\\])+/, "");
  }
  let filePath = join(base, rel);
  if (!filePath.startsWith(base)) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }
  try {
    let s = await stat(filePath);
    if (s.isDirectory()) {
      filePath = join(filePath, "index.html");
      s = await stat(filePath);
    }
    const buf = await readFile(filePath);
    noStore(res);
    res.setHeader("Content-Type", MIME[extname(filePath).toLowerCase()] || "application/octet-stream");
    res.statusCode = 200;
    res.end(buf);
  } catch {
    // SPA-ish fallback: unknown non-file path -> index.html
    if (!extname(urlPath)) {
      try {
        const buf = await readFile(join(ROOT, "index.html"));
        noStore(res);
        res.setHeader("Content-Type", MIME[".html"]);
        res.statusCode = 200;
        return res.end(buf);
      } catch {}
    }
    res.statusCode = 404;
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/api/chat") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      return res.end("Method not allowed");
    }
    return handleApiChat(req, res);
  }
  return serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Interview Deck dev server: http://localhost:${PORT}`);
  console.log(`  static  -> ${ROOT}`);
  console.log(`  api     -> POST /api/chat (BYO Groq key via the widget; no env needed)`);
  if (!process.env.GROQ_MASTER_API_KEY) {
    console.log(`  note    -> GROQ_MASTER_API_KEY not set; master-key tier disabled, BYO-key works.`);
  }
});

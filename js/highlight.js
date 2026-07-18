/* ============================================================
   Shared syntax highlighter.

   Lifted verbatim out of js/tutor.js so the AI Coach's code blocks and My
   Notes' code blocks are highlighted by the same tokenizer — two copies would
   drift, and the notes feature needs exactly what the chat already does.

   A small self-contained scanner (no external library, CSP-safe): one ordered
   master regex per language family emits <span class="tok-*"> per token with
   esc()'d text, and esc()'d text for the gaps between — so nothing unescaped
   ever reaches innerHTML. Good enough to read like a real editor; not a parser.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};

  const KW = {
    js: "abstract arguments await break case catch class const continue debugger default delete do else export extends false finally for from function if implements import in instanceof interface let new null of return static super switch this throw true try typeof var void while yield async get set",
    ts: "abstract any as asserts async await boolean break case catch class const continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let namespace never new null number object of private protected public readonly return set static string super switch symbol this throw true try type typeof undefined unknown var void while yield",
    py: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self print",
    java: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record sealed",
    sql: "select from where insert into values update set delete create table alter drop truncate join inner left right outer full on group by order having limit offset distinct as and or not null is in between like exists union all primary key foreign references index view default cast count sum avg min max case when then else end asc desc"
  };

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function keywordsFor(lang) {
    if (/^(ts|typescript|tsx)$/.test(lang)) return KW.ts;
    if (/^(js|javascript|jsx|node|mjs)$/.test(lang)) return KW.js;
    if (/^(py|python)$/.test(lang)) return KW.py;
    if (/^(java|kotlin)$/.test(lang)) return KW.java;
    if (/^(sql|mysql|postgres|postgresql|sqlite|plsql)$/.test(lang)) return KW.sql;
    return KW.ts; // superset default
  }

  function highlightMarkup(code) {
    const re = /(<!--[\s\S]*?-->)|("[^"]*"|'[^']*')|(<\/?)([A-Za-z][\w-]*)|(\/?>)/g;
    let out = "", last = 0, m;
    while ((m = re.exec(code)) !== null) {
      if (m.index > last) out += esc(code.slice(last, m.index));
      if (m[1]) out += '<span class="tok-comment">' + esc(m[1]) + "</span>";
      else if (m[2]) out += '<span class="tok-string">' + esc(m[2]) + "</span>";
      else if (m[4]) out += '<span class="tok-punct">' + esc(m[3]) + '</span><span class="tok-tag">' + esc(m[4]) + "</span>";
      else if (m[5]) out += '<span class="tok-punct">' + esc(m[5]) + "</span>";
      last = m.index + m[0].length;
    }
    out += esc(code.slice(last));
    return out;
  }

  function highlightCode(code, lang) {
    lang = String(lang || "").toLowerCase();
    if (/^(html|xml|svg|markup|vue|jsx|tsx)$/.test(lang)) return highlightMarkup(code);

    const isSql = /^(sql|mysql|postgres|postgresql|sqlite|plsql)$/.test(lang);
    const hashComment = /^(py|python|rb|ruby|bash|sh|shell|zsh|yaml|yml|toml|ini|makefile|dockerfile|r|perl|php)$/.test(lang);
    const commentAlt = hashComment
      ? "#[^\\n]*|/\\*[\\s\\S]*?\\*/"
      : "//[^\\n]*|/\\*[\\s\\S]*?\\*/";
    const kw = keywordsFor(lang).trim().split(/\s+/).join("|");

    const re = new RegExp(
      "(" + commentAlt + ")" +                                             // 1 comment
      "|(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|`(?:\\\\.|[^`\\\\])*`)" + // 2 string
      "|\\b(" + kw + ")\\b" +                                              // 3 keyword
      "|(\\b\\d[\\w.]*\\b)" +                                              // 4 number
      "|([A-Za-z_$][\\w$]*)(?=\\s*\\()",                                   // 5 function call
      isSql ? "gi" : "g"
    );

    let out = "", last = 0, m;
    while ((m = re.exec(code)) !== null) {
      if (m.index > last) out += esc(code.slice(last, m.index));
      const cls = m[1] ? "tok-comment" : m[2] ? "tok-string" : m[3] ? "tok-keyword" : m[4] ? "tok-number" : "tok-fn";
      out += '<span class="' + cls + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    out += esc(code.slice(last));
    return out;
  }

  /* The languages offered in the notes editor's code-block picker. "auto" maps
     to the TypeScript superset, which reads acceptably for most C-family code. */
  const LANGS = [
    { id: "auto", label: "Auto" },
    { id: "js", label: "JavaScript" },
    { id: "ts", label: "TypeScript" },
    { id: "java", label: "Java" },
    { id: "python", label: "Python" },
    { id: "sql", label: "SQL" },
    { id: "html", label: "HTML" },
    { id: "bash", label: "Shell" }
  ];

  IQB.highlight = { code: highlightCode, markup: highlightMarkup, esc: esc, LANGS: LANGS };
})();

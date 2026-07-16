import * as si from 'simple-icons';
import { writeFileSync } from 'node:fs';

/* category id -> simple-icons export. Notes on the non-obvious picks:
   - java: Simple Icons dropped the Java mark (trademark), openjdk is the coffee cup.
   - rxjs: there is no rxjs mark; RxJS ships under the ReactiveX brand.
   - coding / ngcoding are JS / Angular topics, so they reuse that tech's mark. */
const BRAND = {
  angular:    'siAngular',
  ngcoding:   'siAngular',
  javascript: 'siJavascript',
  coding:     'siJavascript',
  typescript: 'siTypescript',
  html:       'siHtml5',
  css:        'siCss',
  rxjs:       'siReactivex',
  ngrx:       'siNgrx',
  java:       'siOpenjdk',
  springboot: 'siSpringboot',
  git:        'siGit',
  flutter:      'siFlutter',
  fluttercoding:'siFlutter',
  dart:         'siDart',
  swift:        'siSwift',
  leetcode:     'siLeetcode'
};

/* Categories that are concepts, not products, so there is no logo to be faithful
   to. Material Symbols paths (Apache-2.0), same 24x24 grid + solid weight as the
   brand marks so a sidebar row doesn't mix icon languages. */
const GENERIC = {
  sql:        'M12 2C7.58 2 4 3.79 4 6s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4zm8 6.5c-1.5 1.4-4.5 2.3-8 2.3s-6.5-.9-8-2.3V12c0 2.21 3.58 4 8 4s8-1.79 8-4V8.5zm0 6c-1.5 1.4-4.5 2.3-8 2.3s-6.5-.9-8-2.3V18c0 2.21 3.58 4 8 4s8-1.79 8-4v-3.5z',
  testing:    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.29 14.71l-4.24-4.24 1.41-1.41 2.83 2.83 5.66-5.66 1.41 1.41-7.07 7.07z',
  general:    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  behavioral: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  // fallback for any category added to the manifest later (a mortarboard: these
  // are courses). Keyed _default so it can never collide with a real category id.
  _default:   'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z'
};

const entries = [];
for (const [cat, key] of Object.entries(BRAND)) {
  const ic = si[key];
  if (!ic) throw new Error('missing simple-icon: ' + key);
  entries.push([cat, ic.path, `${ic.title} — brand #${ic.hex}`]);
}
for (const [cat, path] of Object.entries(GENERIC)) entries.push([cat, path, null]);

const body = entries
  .map(([cat, path, note]) => `    ${JSON.stringify(cat).padEnd(14)}${note ? `/* ${note} */\n      ` : ''}: ${JSON.stringify(path)}`)
  .join(',\n');

const out = `/* ============================================================
   Category icons — website only.

   Deliberately NOT in shared-data/manifest.json: that file is the
   contract with the Flutter app, and these are website presentation.
   A category needs no entry here to work — unknown ids fall back to
   DEFAULT, so a category added to the manifest later still renders.

   Brand marks are the official Simple Icons paths (CC0-1.0,
   simpleicons.org); concept categories use Material Symbols
   (Apache-2.0). All are single-path, solid, on a 24x24 grid.

   GENERATED — do not hand-edit the paths. Regenerate with:
     npm i simple-icons && node gen-icons.mjs

   Colour is intentionally NOT the brand hex. It comes from the
   category's manifest colour via currentColor, because the real brand
   colours don't survive both themes: Angular (#0F0F11) and Java
   (#000000) drop to ~1.1:1 on the dark theme and JavaScript (#F7DF1E)
   to 1.35:1 on the light one. Each brand's official hex is noted
   beside its path if that ever needs revisiting.
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};

  const PATHS = {
${body}
  };

  const DEFAULT = "_default";

  /* An inline <svg> string for a category id. Fills with currentColor so the
     caller sets the colour (we pass the manifest's per-category accent). */
  function svg(categoryId) {
    const d = PATHS[categoryId] || PATHS[DEFAULT];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" ' +
      'aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  }

  function has(categoryId) { return Object.prototype.hasOwnProperty.call(PATHS, categoryId); }

  IQB.icons = { svg: svg, has: has };
})();
`;

writeFileSync(process.argv[2], out);
console.log('wrote', process.argv[2], '\nbrand:', Object.keys(BRAND).length, ' generic:', Object.keys(GENERIC).length - 1, ' +default');

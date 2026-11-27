#!/usr/bin/env node
// Builds the new Wind into app/dist/public (static files, served by Cloudflare) and app/src/worker/manifest.js.
//
//   node app/build.mjs
//
// The page, its styles and its script are separate, cached files now (the live Worker inlines all of them):
//   index.html                 the page, with its two tiny start-up scripts inline
//   assets/app-<hash>.css      every style
//   assets/app-<hash>.js       the app: reply renderer, chat, Wisp, chess, tabs
//   sw.js                      keeps the app and its files for offline use
// plus the icons, the Bengali font, the chess pieces, Stockfish and Wisp's lighting worker, at the same paths the
// live app uses, so pages and service workers from before the switch keep working.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const APP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(APP, "..");
const PAGE = path.join(APP, "src/page");
const LEGACY = path.join(ROOT, "legacy/src");
const OUT = path.join(APP, "dist/public");
export const ORIGIN = process.env.WIND_ORIGIN || "https://assistant-api.assistant-service.workers.dev";

// the page's script: one function around these modules, in this order
const MODULES = ["_begin.js", "markdown.js", "app.js", "comeback.js", "chess-rules.js", "chess-ui.js", "chess-bot.js", "wisp.js", "tabs.js", "_end.js"];
// the page's styles: today's stylesheet, then the Quiet Sky layer over it (when present)
const STYLES = ["styles.css", "quiet-sky.css"];

const read = (p, enc = "utf8") => fs.readFileSync(p, enc);
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 10);
function put(text, marker, value) {
  const parts = text.split(marker);
  if (parts.length !== 2) throw new Error(`expected ${marker} exactly once, found ${parts.length - 1}`);
  return parts[0] + value + parts[1];
}
function write(rel, data) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}

export function build() {
  fs.rmSync(OUT, { recursive: true, force: true });

  // ---- styles and script, named by their content so browsers can keep them for a year
  const css = STYLES.filter((f) => fs.existsSync(path.join(PAGE, f))).map((f) => read(path.join(PAGE, f))).join("\n");
  const js = MODULES.map((f) => read(path.join(PAGE, "js", f))).join("");
  const cssName = `assets/app-${hash(css)}.css`, jsName = `assets/app-${hash(js)}.js`;
  write(cssName, css);
  write(jsName, js);

  // ---- the page
  let html = read(path.join(PAGE, "index.html"));
  html = put(html, "<style>/*@embed styles.css*/</style>", `<link rel="stylesheet" href="/${cssName}">`);
  html = put(html, "/*@embed boot-theme.js*/", read(path.join(PAGE, "boot-theme.js")));
  html = put(html, "/*@embed boot-sidebar.js*/", read(path.join(PAGE, "boot-sidebar.js")));
  html = put(html, "<script>/*@embed app*/</script>", `<script src="/${jsName}"></script>`);
  html = html.split("__ORIGIN__").join(ORIGIN);
  write("index.html", html);

  // ---- offline: the app shell and its files, refreshed whenever any of them changes
  const version = hash(html + css + js);
  write("sw.js", `// Wind's service worker: the app (and the chats saved in this browser) still opens when the phone is offline.
// The page always comes from the network when it can; the saved copy is only a fallback. /api/ is never touched.
const SHELL = "wind-shell-${version}";
const FILES = ["/", "/${cssName}", "/${jsName}", "/fonts/noto-sans-bengali-3011.woff2", "/favicon.ico", "/icon-192.png"];
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).catch(() => {})); });
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url); if (u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (r.mode === "navigate" && u.pathname === "/") {
    e.respondWith(fetch(r).then((res) => { if (res.ok) { const c = res.clone(); e.waitUntil(caches.open(SHELL).then((s) => s.put("/", c))); } return res; })
      .catch(async () => (await caches.match("/")) || Response.error()));
    return;
  }
  if (/^\\/(assets|fonts)\\/|^\\/(favicon|apple-touch-icon|icon-)/.test(u.pathname))
    e.respondWith(caches.open(SHELL).then(async (s) => { const hit = await s.match(r); if (hit) return hit; const res = await fetch(r); if (res.ok) e.waitUntil(s.put(r, res.clone())); return res; }));
});
`);

  // ---- the files the live app serves, at the same paths
  for (const { key, file, encoding } of JSON.parse(read(path.join(LEGACY, "icons/index.json")))) {
    write(key.replace(/^\//, ""), read(path.join(LEGACY, "icons", file), encoding === "text" ? "utf8" : null));
  }
  write("fonts/noto-sans-bengali-3011.woff2", read(path.join(LEGACY, "fonts/noto-sans-bengali-3011.woff2"), null));
  for (const { key, file } of JSON.parse(read(path.join(LEGACY, "chess/pieces/index.json")))) {
    const svg = read(path.join(LEGACY, "chess/pieces", file));
    write(`chess/v2/${key}.svg`, svg);
    write(`chess/v1/${key}.svg`, svg); // the old set's path, for pages cached before the switch
  }
  const SF = "chess/engine/19.0.1/";
  write(SF + "stockfish-19-lite-single.js", `/* Stockfish.js 19.0.1, GPLv3. Source: https://github.com/nmrugg/stockfish.js/tree/v19.0.1 · licence: /${SF}Copying.txt */\n` + read(path.join(LEGACY, "chess/engine/stockfish-19-lite-single.js")));
  write(SF + "stockfish-19-lite-single.wasm", read(path.join(LEGACY, "chess/engine/stockfish-19-lite-single.wasm"), null));
  write(SF + "Copying.txt", read(path.join(LEGACY, "chess/engine/Copying.txt")));
  write("wisp-shade.js", read(path.join(LEGACY, "wisp-shade.js")));

  // ---- headers: the page keeps the live app's security policy; named files are kept for a year
  const PAGE_HEADERS = [
    "Cache-Control: no-cache",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "X-Frame-Options: DENY",
    "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  ].map((l) => "  " + l).join("\n");
  write("_headers", [
    "/\n" + PAGE_HEADERS,
    "/index.html\n" + PAGE_HEADERS,
    "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff",
    "/fonts/*\n  Cache-Control: public, max-age=31536000, immutable",
    "/chess/*\n  Cache-Control: public, max-age=31536000, immutable",
    "/sw.js\n  Cache-Control: no-cache",
  ].join("\n") + "\n");

  // ---- the Worker's copy of the manifest (it serves a themed version of it)
  fs.writeFileSync(path.join(APP, "src/worker/manifest.js"), "// Generated by app/build.mjs from legacy/src/manifest.webmanifest.\nexport default " + JSON.stringify(read(path.join(LEGACY, "manifest.webmanifest"))) + ";\n");

  const gz = (rel) => zlib.gzipSync(fs.readFileSync(path.join(OUT, rel)), { level: 9 }).length;
  return { out: OUT, html: Buffer.byteLength(html), css: { name: cssName, bytes: Buffer.byteLength(css), gzip: gz(cssName) }, js: { name: jsName, bytes: Buffer.byteLength(js), gzip: gz(jsName) } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = build();
  const kb = (n) => (n / 1024).toFixed(1) + " KB";
  console.log(`app/dist/public  page ${kb(r.html)} · ${r.css.name} ${kb(r.css.bytes)} (gzip ${kb(r.css.gzip)}) · ${r.js.name} ${kb(r.js.bytes)} (gzip ${kb(r.js.gzip)})`);
}

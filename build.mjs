#!/usr/bin/env node
// Builds the Wind Worker from src/ into dist/, ready for `wrangler deploy`:
//   dist/worker.js                      the Worker: its code, with the page and every file it serves inside
//   dist/stockfish-19-lite-single.bin   the chess engine, a data module
//
//   node build.mjs
//
// How the pieces fit together:
// - The Worker's code is src/worker/shell.js (serves the page and its files) followed by src/worker/api.js (the API).
// - Large values appear in that code as __embed("NAME"). Each is replaced by its value from EMBEDS, as a JSON literal.
// - The page, src/page/index.html, marks where its stylesheet and scripts go with /*@embed NAME*/. Its main script
//   ("app") is page/js/_begin.js, the APP_MODULES in order, then page/js/_end.js: one function around all of them.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "src");
const DIST = path.join(HERE, "dist");

const WORKER_PARTS = ["worker/shell.js", "worker/api.js"];
const EMBEDS = [
  { name: "PAGE_HTML", kind: "page" },
  { name: "ICONS", kind: "files", dir: "icons" },
  { name: "MANIFEST", kind: "text", file: "manifest.webmanifest" },
  { name: "FONT_B64", kind: "base64", file: "fonts/noto-sans-bengali-3011.woff2" },
  { name: "CHESS_PIECES", kind: "files", dir: "chess/pieces" },
  { name: "SF_JS", kind: "text", file: "chess/engine/stockfish-19-lite-single.js" },
  { name: "SF_COPYING", kind: "text", file: "chess/engine/Copying.txt" },
  { name: "WISP_SHADE_JS", kind: "text", file: "wisp-shade.js" },
];
const PAGE_STYLE = "styles.css";
const PAGE_SCRIPTS = ["boot-theme.js", "boot-sidebar.js", "app"];
const APP_MODULES = ["markdown.js", "app.js", "comeback.js", "chess-rules.js", "chess-ui.js", "chess-bot.js", "wisp.js", "tabs.js"];
const MAIN_MODULE = "worker.js";
const DATA_MODULE = { name: "stockfish-19-lite-single.bin", file: "chess/engine/stockfish-19-lite-single.wasm" };

const read = (rel, enc = "utf8") => fs.readFileSync(path.join(SRC, rel), enc);

// Replace the one occurrence of `marker` in `text` with `value` (taken literally: no $-patterns).
function put(text, marker, value, where) {
  const parts = text.split(marker);
  if (parts.length !== 2) throw new Error(`${where}: expected ${marker} exactly once, found ${parts.length - 1}`);
  return parts[0] + value + parts[1];
}

function buildPage() {
  let html = read("page/index.html");
  html = put(html, `/*@embed ${PAGE_STYLE}*/`, read("page/" + PAGE_STYLE), "page");
  for (const name of PAGE_SCRIPTS) {
    const js = name === "app"
      ? ["_begin.js", ...APP_MODULES, "_end.js"].map((f) => read("page/js/" + f)).join("")
      : read("page/" + name);
    html = put(html, `/*@embed ${name}*/`, js, "page");
  }
  return html;
}

function embedValue(e) {
  switch (e.kind) {
    case "page": return buildPage();
    case "text": return read(e.file);
    case "base64": return read(e.file, null).toString("base64");
    case "files": { // a folder whose index.json lists each file's key, name and encoding, in order
      const obj = {};
      for (const { key, file, encoding } of JSON.parse(read(`${e.dir}/index.json`))) {
        obj[key] = encoding === "text" ? read(`${e.dir}/${file}`) : read(`${e.dir}/${file}`, null).toString("base64");
      }
      return obj;
    }
    default: throw new Error("unknown kind " + e.kind);
  }
}

export function build() {
  let code = WORKER_PARTS.map((f) => read(f)).join("");
  for (const e of EMBEDS) code = put(code, `__embed("${e.name}")`, JSON.stringify(embedValue(e)), "worker");
  const files = { [MAIN_MODULE]: Buffer.from(code, "utf8"), [DATA_MODULE.name]: read(DATA_MODULE.file, null) };
  // Start from an empty dist/: wrangler.jsonc uploads every module-like file in it (base_dir "dist",
  // find_additional_modules), so anything left over from an earlier run would be deployed too.
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  for (const [name, buf] of Object.entries(files)) fs.writeFileSync(path.join(DIST, name), buf);
  return { dist: DIST, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [name, buf] of Object.entries(build().files)) {
    console.log(`dist/${name}  ${buf.length} bytes  sha256 ${crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16)}…`);
  }
}

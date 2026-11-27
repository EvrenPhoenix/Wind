#!/usr/bin/env node
// Builds the live Wind Worker from legacy/src into legacy/dist, and checks it against legacy/reference.json.
//
//   node legacy/build.mjs          build, and report whether the output matches the live bundle
//   node legacy/build.mjs --check  the same, but exit with an error when it doesn't match
//
// legacy/dist/worker.js is the Worker's main module and legacy/dist/stockfish-19-lite-single.bin its one data
// module, exactly as Cloudflare runs them.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { EMBEDS, APP_MODULES, PAGE_INLINE, WORKER_SPLIT, MAIN_MODULE, DATA_MODULE, embedCall, pageMarker } from "./layout.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "src");
const DIST = path.join(HERE, "dist");

const read = (rel, enc = "utf8") => fs.readFileSync(path.join(SRC, rel), enc);
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Replace the one occurrence of `marker` in `text` with `value` (taken literally: no $-patterns).
function put(text, marker, value, where) {
  const parts = text.split(marker);
  if (parts.length !== 2) throw new Error(`${where}: expected ${marker} exactly once, found ${parts.length - 1}`);
  return parts[0] + value + parts[1];
}

function buildPage() {
  let html = read("page/index.html");
  html = put(html, pageMarker(PAGE_INLINE.style), read("page/" + PAGE_INLINE.style), "page");
  for (const name of PAGE_INLINE.scripts) {
    const js = name === "app"
      ? ["_begin.js", ...APP_MODULES.map((m) => m.file), "_end.js"].map((f) => read("page/js/" + f)).join("")
      : read("page/" + name);
    html = put(html, pageMarker(name), js, "page");
  }
  return html;
}

function embedValue(e) {
  switch (e.kind) {
    case "page": return buildPage();
    case "text": return read(e.file);
    case "base64": return read(e.file, null).toString("base64");
    case "icons":
    case "pieces": {
      const list = JSON.parse(read(`${e.dir}/index.json`));
      const obj = {};
      for (const { key, file, encoding } of list) {
        obj[key] = encoding === "text" ? read(`${e.dir}/${file}`) : read(`${e.dir}/${file}`, null).toString("base64");
      }
      return obj;
    }
    default: throw new Error("unknown kind " + e.kind);
  }
}

export function build() {
  let code = read(WORKER_SPLIT.shell) + read(WORKER_SPLIT.api);
  for (const e of EMBEDS) code = put(code, embedCall(e.name), JSON.stringify(embedValue(e)), "worker");
  const main = Buffer.from(code, "utf8");
  const data = read(DATA_MODULE.file, null);
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, MAIN_MODULE), main);
  fs.writeFileSync(path.join(DIST, DATA_MODULE.name), data);

  const ref = JSON.parse(fs.readFileSync(path.join(HERE, "reference.json"), "utf8")).modules;
  const result = {
    [MAIN_MODULE]: { bytes: main.length, sha256: sha256(main) },
    [DATA_MODULE.name]: { bytes: data.length, sha256: sha256(data) },
  };
  const matches = Object.entries(result).every(([n, r]) => ref[n] && ref[n].sha256 === r.sha256);
  return { dist: DIST, result, matches };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { result, matches } = build();
  for (const [n, r] of Object.entries(result)) console.log(`${n}  ${r.bytes} bytes  sha256 ${r.sha256.slice(0, 16)}…`);
  console.log(matches ? "identical to the live bundle" : "DIFFERENT from the live bundle (see legacy/reference.json)");
  if (!matches && process.argv.includes("--check")) process.exit(1);
}

#!/usr/bin/env node
// Recovers Wind's source files from the live Worker bundle.
//
// Wind's original sources were lost. The only complete copy is the bundle running on Cloudflare (Worker
// "assistant-api"). This tool splits that bundle back into ordinary files under legacy/src and records the bundle's
// checksums in legacy/reference.json. legacy/build.mjs puts the files back together; when its output matches those
// checksums byte for byte, nothing was lost.
//
// Usage:
//   node tools/recover.mjs <bundle-file>
//
// <bundle-file> is the multipart download of the live script, for example:
//   curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/assistant-api/content/v2" \
//        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -o assistant-api.bundle
//
// Pass --version=<id> to note which deployed version the bundle came from.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as acorn from "acorn";
import { EMBEDS, APP_MODULES, PAGE_INLINE, WORKER_SPLIT, MAIN_MODULE, DATA_MODULE, embedCall, pageMarker } from "../legacy/layout.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "legacy", "src");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const fail = (msg) => { console.error("recover: " + msg); process.exit(1); };

// ---------------------------------------------------------------------------- read the multipart bundle
function readBundle(file) {
  const buf = fs.readFileSync(file);
  const firstLine = buf.subarray(0, buf.indexOf("\r\n")).toString("latin1");
  if (!firstLine.startsWith("--")) fail("not a multipart bundle: " + file);
  const delim = Buffer.from("\r\n" + firstLine);
  const parts = {};
  let pos = firstLine.length; // just after the first delimiter
  for (;;) {
    if (buf.subarray(pos, pos + 2).toString("latin1") === "--") break; // closing delimiter
    const headEnd = buf.indexOf("\r\n\r\n", pos);
    const head = buf.subarray(pos + 2, headEnd).toString("utf8");
    const next = buf.indexOf(delim, headEnd + 4);
    if (headEnd < 0 || next < 0) fail("malformed bundle");
    const name = (/name="([^"]+)"/.exec(head) || [])[1];
    const type = (/Content-Type:\s*([^\r\n]+)/i.exec(head) || [])[1] || "";
    parts[name] = { type: type.trim(), body: buf.subarray(headEnd + 4, next) };
    pos = next + delim.length;
  }
  return parts;
}

// ---------------------------------------------------------------------------- helpers
const out = (rel, data) => { const p = path.join(SRC, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
const once = (hay, needle, what) => {
  const i = hay.indexOf(needle);
  if (i < 0 || hay.indexOf(needle, i + 1) >= 0) fail(`expected exactly one ${what}`);
  return i;
};
const roundTrips = (value, text, what) => { if (JSON.stringify(value) !== text) fail(`${what} does not serialise back to the same text`); };
const b64RoundTrips = (b64, what) => {
  const bytes = Buffer.from(b64, "base64");
  if (bytes.toString("base64") !== b64) fail(`${what} is not plain base64`);
  return bytes;
};

// ---------------------------------------------------------------------------- the page
function splitPage(html) {
  let page = html;
  const style = /<style>([\s\S]*?)<\/style>/g;
  const styles = [...html.matchAll(style)];
  if (styles.length !== 1) fail("expected one <style> in the page");
  out("page/" + PAGE_INLINE.style, styles[0][1]);
  page = page.replace(styles[0][0], () => `<style>${pageMarker(PAGE_INLINE.style)}</style>`);

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== PAGE_INLINE.scripts.length) fail(`expected ${PAGE_INLINE.scripts.length} inline scripts`);
  scripts.forEach((m, i) => {
    const name = PAGE_INLINE.scripts[i];
    page = page.replace(m[0], () => `<script>${pageMarker(name)}</script>`);
    if (name === "app") splitApp(m[1]); else out("page/" + name, m[1]);
  });
  out("page/index.html", page);
}

function splitApp(js) {
  const starts = APP_MODULES.map((m) => {
    const h = once(js, "\n" + m.header, `header "${m.header}"`);
    const rule = js.lastIndexOf("\n// ====", h - 1);
    if (rule < 0 || js.slice(rule + 1, h).includes("\n// ") ) fail(`no rule line right before "${m.header}"`);
    return rule + 1;
  });
  for (let i = 1; i < starts.length; i++) if (starts[i] <= starts[i - 1]) fail("app modules are out of order");
  const end = js.lastIndexOf("})();");
  if (end < starts[starts.length - 1]) fail("app wrapper end not found");
  out("page/js/_begin.js", js.slice(0, starts[0]));
  APP_MODULES.forEach((m, i) => out("page/js/" + m.file, js.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : end)));
  out("page/js/_end.js", js.slice(end));
}

// ---------------------------------------------------------------------------- the worker
function recover(bundleFile) {
  const parts = readBundle(bundleFile);
  const main = parts[MAIN_MODULE], data = parts[DATA_MODULE.name];
  if (!main || !data) fail(`bundle must contain ${MAIN_MODULE} and ${DATA_MODULE.name}; found ${Object.keys(parts).join(", ")}`);
  const code = main.body.toString("utf8");
  if (Buffer.compare(Buffer.from(code, "utf8"), main.body) !== 0) fail("worker.js is not valid UTF-8");
  for (const e of EMBEDS) if (code.includes(embedCall(e.name))) fail("marker text already present in the code");

  fs.rmSync(SRC, { recursive: true, force: true });
  const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module" });
  const inits = {};
  for (const node of ast.body) {
    if (node.type !== "VariableDeclaration") continue;
    for (const d of node.declarations) if (d.id.type === "Identifier" && d.init) inits[d.id.name] = d.init;
  }

  // replace each embedded literal by __embed("NAME"), from the end so earlier offsets stay valid
  const found = EMBEDS.map((e) => {
    const init = inits[e.name];
    if (!init || (init.type !== "Literal" && init.type !== "ObjectExpression")) fail(`${e.name} is not a literal`);
    const text = code.slice(init.start, init.end);
    const value = JSON.parse(text); // the literals are plain JSON
    roundTrips(value, text, e.name);
    return { e, init, value };
  }).sort((a, b) => b.init.start - a.init.start);

  let template = code;
  for (const { e, init, value } of found) {
    template = template.slice(0, init.start) + embedCall(e.name) + template.slice(init.end);
    if (e.kind === "page") splitPage(value);
    else if (e.kind === "text") out(e.file, value);
    else if (e.kind === "base64") out(e.file, b64RoundTrips(value, e.name));
    else if (e.kind === "icons" || e.kind === "pieces") {
      const list = Object.entries(value).map(([key, v]) => {
        const svg = typeof v === "string" && v.trimStart().startsWith("<svg");
        const file = e.kind === "icons" ? key.replace(/^\//, "") : key + ".svg";
        if (!/^[\w.-]+$/.test(file)) fail(`unexpected ${e.name} key ${key}`);
        out(`${e.dir}/${file}`, svg ? v : b64RoundTrips(v, `${e.name}[${key}]`));
        return { key, file, encoding: svg ? "text" : "base64" };
      });
      out(`${e.dir}/index.json`, JSON.stringify(list, null, 2) + "\n");
    } else fail("unknown kind " + e.kind);
  }

  const cut = once(template, "\n" + WORKER_SPLIT.at, "worker split point") + 1;
  out(WORKER_SPLIT.shell, template.slice(0, cut));
  out(WORKER_SPLIT.api, template.slice(cut));
  out(DATA_MODULE.file, data.body);

  const reference = {
    script: "assistant-api",
    version: VERSION || undefined,
    recovered: new Date().toISOString(),
    note: "Checksums of the live bundle these sources were recovered from. legacy/build.mjs must reproduce them.",
    modules: {
      [MAIN_MODULE]: { type: main.type, bytes: main.body.length, sha256: sha256(main.body) },
      [DATA_MODULE.name]: { type: data.type, bytes: data.body.length, sha256: sha256(data.body) },
    },
  };
  fs.writeFileSync(path.join(ROOT, "legacy", "reference.json"), JSON.stringify(reference, null, 2) + "\n");
  console.log(`recovered ${Object.keys(parts).length} modules into legacy/src`);
  for (const [n, m] of Object.entries(reference.modules)) console.log(`  ${n}  ${m.bytes} bytes  sha256 ${m.sha256.slice(0, 16)}…`);
}

const args = process.argv.slice(2);
const VERSION = (args.find((a) => a.startsWith("--version=")) || "").slice("--version=".length);
const bundle = args.find((a) => !a.startsWith("--"));
if (!bundle) fail("usage: node tools/recover.mjs <bundle-file> [--version=<id>]");
recover(bundle);

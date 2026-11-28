// Golden tests for Wind's reply renderer (src/page/js/markdown.js).
//
// golden/renderer.json records what today's renderer produces for every sample, both finished (renderMarkdown, as
// a saved reply is drawn) and while streaming (mdBlocks(streamSafe(prefix)), as a reply is drawn while it arrives).
// To record new golden output deliberately:
//   UPDATE_GOLDEN=1 node --test test/renderer.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { SAMPLES, STREAM_CUTS, STREAM_PREFIXES } from "./samples.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, "golden", "renderer.json");

// The renderer is one module of the page's script. It exports its functions for Node when `module` exists.
export function loadRenderer(file = path.join(HERE, "..", "src", "page", "js", "markdown.js")) {
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext('"use strict";\n' + fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  return sandbox.module.exports;
}

// Cut points never split a UTF-16 surrogate pair, so every prefix is text a stream could really deliver.
const cutAt = (text, n) => (n > 0 && /[\uDC00-\uDFFF]/.test(text[n]) ? n - 1 : n);

export function renderAll(md) {
  const out = {};
  for (const s of SAMPLES) {
    const stream = {};
    for (const f of STREAM_CUTS) {
      const n = cutAt(s.text, Math.round(s.text.length * f));
      stream[String(n)] = md.mdBlocks(md.streamSafe(s.text.slice(0, n)));
    }
    out[s.id] = { final: md.renderMarkdown(s.text), stream };
  }
  out["@prefixes"] = Object.fromEntries(STREAM_PREFIXES.map((p) => [p, md.mdBlocks(md.streamSafe(p))]));
  // the renderer runs in its own context, so its arrays have another Array prototype: compare plain data
  return JSON.parse(JSON.stringify(out));
}

test("renderer output matches the golden file", () => {
  const actual = renderAll(loadRenderer());
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(GOLDEN)) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
  }
  const expected = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  for (const id of Object.keys(expected)) assert.deepEqual(actual[id], expected[id], `sample "${id}" renders differently`);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), "the set of samples changed");
});

test("the renderer never lets markup or script URLs through", () => {
  const md = loadRenderer();
  const html = md.renderMarkdown("<script>alert(1)</script> <img src=x onerror=alert(2)> [x](javascript:alert(3)) [y](data:text/html,1)");
  // the tags may appear as escaped text (&lt;script&gt;), never as markup
  assert.doesNotMatch(html, /<script|<img|href="javascript:|href="data:/i);
});

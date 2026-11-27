// The Worker, built from src/ and run locally with Miniflare: it must serve the page and its files, and answer the
// API's checks the way the live Worker does. No request here reaches an AI provider.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { build } from "../build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "src");
const ORIGIN = "http://wind.test";

// Plain settings of the live Worker (secrets are left out on purpose).
const VARS = {
  GROQ_MODEL: "openai/gpt-oss-120b",
  GROQ_VISION_MODEL: "qwen/qwen3.8-27b",
  OPENROUTER_MODEL: "google/gemma-4-31b-it:free,nvidia/nemotron-3.5-super-vl:free,openrouter/free",
  OPENROUTER_VISION_MODELS: "google/gemma-4-31b-it:free,nvidia/nemotron-3.5-super-vl:free,google/gemma-4-26b-a4b-it:free",
};

let dist, bare, keyed;
const worker = (bindings) => new Miniflare({
  modulesRoot: dist,
  modules: [
    { type: "ESModule", path: path.join(dist, "worker.js") },
    { type: "Data", path: path.join(dist, "stockfish-19-lite-single.bin") },
  ],
  compatibilityDate: "2026-07-01",
  d1Databases: ["DAILY_USAGE"],
  bindings: { ...VARS, ...bindings },
});

before(async () => {
  dist = build().dist;
  bare = worker({});
  keyed = worker({ NVIDIA_API_KEY: "test-key-not-real" });
  await Promise.all([bare.ready, keyed.ready]);
});
after(async () => { await Promise.all([bare?.dispose(), keyed?.dispose()]); });

const get = (mf, p, init) => mf.dispatchFetch(ORIGIN + p, init);
const postJson = (mf, p, body, headers = {}) =>
  get(mf, p, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers }, body: JSON.stringify(body) });

test("serves the chat page with this origin filled in", async () => {
  const r = await get(bare, "/");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/html/);
  const html = await r.text();
  assert.match(html, /<title>Wind — Personal AI<\/title>/);
  assert.ok(!html.includes("__ORIGIN__"), "origin placeholder left in the page");
  assert.ok(html.includes(ORIGIN), "origin not filled in");
  const again = await get(bare, "/", { headers: { "If-None-Match": r.headers.get("etag") } });
  assert.equal(again.status, 304);
});

test("serves the manifest, icons, font, chess files and service worker", async () => {
  const m = await get(bare, "/manifest.webmanifest");
  assert.equal(m.status, 200);
  assert.equal((await m.json()).short_name, "Wind");
  for (const p of ["/favicon.ico", "/icon-192.png", "/apple-touch-icon.png"]) {
    const r = await get(bare, p);
    assert.equal(r.status, 200, p);
    await r.arrayBuffer();
  }
  const font = await get(bare, "/fonts/noto-sans-bengali-3011.woff2");
  assert.equal(font.headers.get("content-type"), "font/woff2");
  assert.deepEqual(Buffer.from(await font.arrayBuffer()), fs.readFileSync(path.join(SRC, "fonts/noto-sans-bengali-3011.woff2")));
  const piece = await get(bare, "/chess/v2/wK.svg");
  assert.equal(piece.status, 200);
  assert.match(await piece.text(), /^<svg/);
  const wasm = await get(bare, "/chess/engine/19.0.1/stockfish-19-lite-single.wasm");
  assert.equal(wasm.headers.get("content-type"), "application/wasm");
  assert.equal((await wasm.arrayBuffer()).byteLength, fs.statSync(path.join(SRC, "chess/engine/stockfish-19-lite-single.wasm")).size);
  const sw = await get(bare, "/sw.js");
  assert.equal(sw.status, 200);
  assert.match(await sw.text(), /wind-shell-v1/);
});

test("health reports whether Wind has its key", async () => {
  assert.equal((await (await get(bare, "/api/health")).json()).configured, false);
  assert.equal((await (await get(keyed, "/api/health")).json()).configured, true);
});

test("chat without a key explains that Wind isn't set up", async () => {
  const r = await postJson(bare, "/api/chat", { message: "hi" });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /not set up/);
});

test("chat rejects bad requests before calling any AI", async () => {
  const cases = [
    [{ message: "" }, 400, /1–10,000 characters/],
    [{ message: "x".repeat(10001) }, 400, /1–10,000 characters/],
    [{ message: "hi", history: "nope" }, 400, /history/],
    [{ message: "hi", images: [{ mime: "image/svg+xml", data: "AAAA" }] }, 400, /Images/],
  ];
  for (const [body, status, msg] of cases) {
    const r = await postJson(keyed, "/api/chat", body);
    assert.equal(r.status, status, JSON.stringify(body).slice(0, 60));
    assert.match((await r.json()).error, msg);
  }
  const wrongMethod = await get(keyed, "/api/chat");
  assert.equal(wrongMethod.status, 405);
});

test("other sites can't call the API", async () => {
  const r = await postJson(keyed, "/api/chat", { message: "hi" }, { Origin: "https://evil.example" });
  assert.equal(r.status, 403);
});

test("unknown paths are 404", async () => {
  const r = await get(bare, "/api/nope");
  assert.equal(r.status, 404);
});

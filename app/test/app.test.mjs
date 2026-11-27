// The new Wind, run locally with Miniflare: the page and its files come from the static assets, the API from the
// Worker. The API must answer exactly like the live Worker for everything that doesn't reach an AI provider.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { build, ORIGIN } from "../build.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "http://wind.test";
let mf, built;

before(async () => {
  built = build();
  mf = new Miniflare({
    scriptPath: path.join(APP, "src/worker/index.js"),
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }], // as Wrangler treats them
    compatibilityDate: "2026-07-01",
    assets: { directory: built.out, binding: "ASSETS", routerConfig: { has_user_worker: true } },
    d1Databases: ["DAILY_USAGE"],
    bindings: { NVIDIA_API_KEY: "test-key-not-real" },
  });
  await mf.ready;
});
after(async () => { await mf?.dispose(); });

const get = (p, init) => mf.dispatchFetch(HOST + p, init);
const post = (p, body, origin = HOST) =>
  get(p, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });

test("the page loads its styles and script as separate files", async () => {
  const r = await get("/");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/html/);
  const html = await r.text();
  assert.match(html, /<title>Wind — Personal AI<\/title>/);
  assert.ok(html.includes(`href="/${built.css.name}"`) && html.includes(`src="/${built.js.name}"`));
  assert.ok(!html.includes("__ORIGIN__") && html.includes(`content="${ORIGIN}/"`));
  for (const name of [built.css.name, built.js.name]) {
    const a = await get("/" + name);
    assert.equal(a.status, 200, name);
    assert.equal((await a.text()).length > 1000, true);
  }
});

test("the live app's files are still at their old paths", async () => {
  for (const p of ["/sw.js", "/favicon.ico", "/icon-192.png", "/apple-touch-icon.png", "/og.jpg", "/fonts/noto-sans-bengali-3011.woff2",
    "/chess/v2/wK.svg", "/chess/v1/bQ.svg", "/chess/engine/19.0.1/stockfish-19-lite-single.js", "/chess/engine/19.0.1/stockfish-19-lite-single.wasm",
    "/chess/engine/19.0.1/Copying.txt", "/wisp-shade.js"]) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    await r.arrayBuffer();
  }
  assert.match(await (await get("/sw.js")).text(), /wind-shell-/);
});

test("the Worker serves the themed manifest", async () => {
  const m = await (await get("/manifest.webmanifest?t=dark")).json();
  assert.equal(m.short_name, "Wind");
  assert.equal(m.theme_color, "#08090c");
});

test("the API answers like the live Worker", async () => {
  assert.equal((await (await get("/api/health")).json()).configured, true);
  for (const [body, status, msg] of [
    [{ message: "" }, 400, /1–10,000 characters/],
    [{ message: "hi", history: "nope" }, 400, /history/],
    [{ message: "hi", images: [{ mime: "image/svg+xml", data: "AAAA" }] }, 400, /Images/],
  ]) {
    const r = await post("/api/chat", body);
    assert.equal(r.status, status);
    assert.match((await r.json()).error, msg);
  }
  assert.equal((await get("/api/chat")).status, 405);
  assert.equal((await post("/api/chat", { message: "hi" }, "https://evil.example")).status, 403);
  assert.equal((await get("/api/nope")).status, 404);
});

test("unknown pages are 404", async () => {
  assert.equal((await get("/no-such-page")).status, 404);
});

test("the Worker no longer carries the page or its files", () => {
  const size = fs.statSync(path.join(APP, "src/worker/index.js")).size;
  assert.ok(size < 150 * 1024, `the Worker is ${size} bytes`);
});

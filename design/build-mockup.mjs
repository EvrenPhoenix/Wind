#!/usr/bin/env node
// Builds the clickable mockup (design/mockup/index.src.html) into one self-contained page: design/dist/wind-mockup.html.
// It inlines Wind's real reply renderer and reply styles, today's chess (with Wind Bot), and the chess pieces, all from legacy/src.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// the styles taken from today's app are regenerated first, so they always match legacy/src
await import("./extract-legacy-css.mjs");
const read = (rel, enc = "utf8") => fs.readFileSync(path.join(ROOT, rel), enc);
const put = (text, marker, value) => {
  const parts = text.split(marker);
  if (parts.length !== 2) throw new Error(`expected ${marker} exactly once`);
  return parts[0] + value + parts[1];
};

const pieces = {};
for (const { key, file } of JSON.parse(read("legacy/src/chess/pieces/index.json"))) {
  pieces[key] = "data:image/svg+xml;base64," + read("legacy/src/chess/pieces/" + file, null).toString("base64");
}
let html = read("design/mockup/index.src.html");
html = put(html, "/*@embed answer.css*/", read("design/mockup/legacy-answer.css"));
html = put(html, "/*@embed markdown.js*/", read("legacy/src/page/js/markdown.js").replace(/<\/script/gi, "<\\/script"));
html = put(html, "/*@embed pieces*/{}", JSON.stringify(pieces));
html = put(html, "/*@embed bot.css*/", read("design/mockup/legacy-bot.css"));
html = put(html, "/*@embed chess.css*/", read("design/mockup/legacy-chess.css") + read("design/mockup/chess-skin.css"));
// Today's chess, unchanged: rules, board and Wind Bot. Only the piece image paths change, to the embedded pieces.
let chess = ["chess-rules.js", "chess-ui.js", "chess-bot.js"].map((f) => read("legacy/src/page/js/" + f)).join("\n");
const swap = (re, to, n) => { const found = chess.match(re) || []; if (found.length !== n) throw new Error(`expected ${n} piece paths for ${re}, found ${found.length}`); chess = chess.replace(re, to); };
swap(/"url\(\/chess\/v2\/" \+ (.+?) \+ "\.svg\)"/g, '"url(" + PIECE_SRC($1) + ")"', 2);
swap(/url\(\/chess\/v2\/' \+ (.+?) \+ '\.svg\)/g, "url(' + PIECE_SRC($1) + ')", 2);
swap(/"\/chess\/v2\/" \+ (.+?) \+ "\.svg"/g, "PIECE_SRC($1)", 1);
if (chess.includes("/chess/v2/")) throw new Error("a piece path was left unchanged");
html = put(html, "/*@embed chess.js*/", chess.replace(/<\/script/gi, "<\\/script"));
fs.mkdirSync(path.join(ROOT, "design/dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "design/dist/wind-mockup.html"), html);
console.log(`design/dist/wind-mockup.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);

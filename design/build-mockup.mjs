#!/usr/bin/env node
// Builds the clickable mockup (design/mockup/index.src.html) into one self-contained page: design/dist/wind-mockup.html.
// It inlines Wind's real reply renderer and reply styles, Wind Bot's face, and the chess pieces, all from legacy/src.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
html = put(html, "/*@embed answer.css*/", read("design/mockup/answer.css"));
html = put(html, "/*@embed markdown.js*/", read("legacy/src/page/js/markdown.js").replace(/<\/script/gi, "<\\/script"));
html = put(html, "/*@embed pieces*/{}", JSON.stringify(pieces));
html = put(html, "/*@embed bot.css*/", read("design/mockup/bot.css"));
// Wind Bot's face (its 14 expressions, gaze and blinking), taken unchanged from the live chess page
const bot = read("legacy/src/page/js/chess-bot.js");
const from = bot.indexOf("// how each expression shapes the eyes"), to = bot.indexOf("// ---- the bot's state");
if (from < 0 || to < from) throw new Error("Wind Bot's face code not found in chess-bot.js");
html = put(html, "/*@embed botface.js*/", bot.slice(from, to).replace(/<\/script/gi, "<\\/script"));
fs.mkdirSync(path.join(ROOT, "design/dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "design/dist/wind-mockup.html"), html);
console.log(`design/dist/wind-mockup.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);

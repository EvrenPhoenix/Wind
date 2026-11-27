// Where each part of the live Worker bundle lives as a source file.
// Shared by tools/recover.mjs (bundle -> files) and legacy/build.mjs (files -> bundle).

// Large values the Worker embeds as literals. In src/worker/*.js each one is written as __embed("NAME"); the build
// swaps that call for the value, serialised with JSON.stringify exactly as the original build did.
export const EMBEDS = [
  { name: "PAGE_HTML", kind: "page" },
  { name: "ICONS", kind: "icons", dir: "icons" },
  { name: "MANIFEST", kind: "text", file: "manifest.webmanifest" },
  { name: "FONT_B64", kind: "base64", file: "fonts/noto-sans-bengali-3011.woff2" },
  { name: "CHESS_PIECES", kind: "pieces", dir: "chess/pieces" },
  { name: "SF_JS", kind: "text", file: "chess/engine/stockfish-19-lite-single.js" },
  { name: "SF_COPYING", kind: "text", file: "chess/engine/Copying.txt" },
  { name: "WISP_SHADE_JS", kind: "text", file: "wisp-shade.js" },
];

// The page's one big script is a single function wrapping these modules, in this order. Each module begins with a
// "// ====" rule followed by the header line given here.
export const APP_MODULES = [
  { file: "markdown.js", header: "// Wind markdown — a small, safe renderer tuned for AI replies." },
  { file: "app.js", header: "// Wind — the chat page." },
  { file: "comeback.js", header: "// Wind, better to come back to:" },
  { file: "chess-rules.js", header: "// Chess rules and a small engine, for Wind's chess game." },
  { file: "chess-ui.js", header: "// Chess: you against Wind." },
  { file: "chess-bot.js", header: "// Wind's bot: a face and a voice for the chess page." },
  { file: "wisp.js", header: "// Wisp, the puffy mascot of the Wisp tab." },
  { file: "tabs.js", header: "// Tabs: Chat, Wisp, Games." },
];

// The page's small inline scripts and its stylesheet, in the order they appear in the page.
export const PAGE_INLINE = {
  style: "styles.css",
  scripts: ["boot-theme.js", "boot-sidebar.js", "app"],
};

// The Worker's code is kept as two files: the part that serves the page and its files, and the API.
export const WORKER_SPLIT = { at: "const DEFAULT_NVIDIA_MODELS", shell: "worker/shell.js", api: "worker/api.js" };

export const MAIN_MODULE = "worker.js";
export const DATA_MODULE = { name: "stockfish-19-lite-single.bin", file: "chess/engine/stockfish-19-lite-single.wasm" };

export const embedCall = (name) => `__embed("${name}")`;
export const pageMarker = (name) => `/*@embed ${name}*/`;

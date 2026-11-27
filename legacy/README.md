# Wind, as it runs today

This folder is the source of the live Wind Worker (`assistant-api`), recovered on 27 November 2026 from the bundle on
Cloudflare. The original source files were lost, and the bundle was the only complete copy.

## How it was recovered

1. `tools/recover.mjs` split the downloaded bundle back into ordinary files: the page, its eight script modules and
   stylesheet, the Worker's code, and every embedded file (icons, the Bengali font, chess pieces, Stockfish).
2. `legacy/build.mjs` puts the files back together. For the downloaded bundle (version 241), the rebuilt `worker.js`
   and Stockfish module were identical byte for byte. That is the first commit in this repository.
3. Version 241 was rolled back four minutes after it went out, and visitors get version 240. Cloudflare can't
   download a single version, so 240 was reconstructed by undoing 241's one change, a small name label above the
   home-screen logo. That is the second commit.
4. The reconstructed page is byte for byte the page the live site serves. Run side by side with the live site, the
   rebuilt Worker also gave identical answers to all 22 requests that don't reach an AI: every file, the health check
   and every API error.

`reference.json` records the checksums behind both steps.

## Files

| Path under `src/` | What it is |
|---|---|
| `worker/shell.js` | Serves the page and its files (icons, manifest, font, chess pieces, Stockfish, service worker). Large embedded files appear as `__embed("NAME")`, and the build fills them in. |
| `worker/api.js` | The API: `/api/chat` (NVIDIA models, web research, weather), `/api/followups`, `/api/wisp/*`, `/api/chess/*`, `/api/health`. |
| `page/index.html` | The page markup. `/*@embed …*/` marks where the stylesheet and scripts go. |
| `page/styles.css` | All of the page's styles. |
| `page/boot-theme.js`, `page/boot-sidebar.js` | Two tiny scripts that run before the page draws (theme, sidebar). |
| `page/js/markdown.js` | The reply renderer: Markdown, maths, chemistry, code highlighting, citations, and the Bengali digit and letter rules. |
| `page/js/app.js` | The chat: storage, streaming playback, sending, sources, weather card, read aloud, history. |
| `page/js/comeback.js` | Follow-up questions, Share, Wisp's "has something to say" dot, and the chess record. |
| `page/js/chess-rules.js`, `chess-ui.js`, `chess-bot.js` | Chess rules and a fallback engine, the board (Stockfish runs in a Web Worker), and the talking bot. |
| `page/js/wisp.js` | Wisp the mascot: 32 feelings, its chat, and its memory. |
| `page/js/tabs.js` | The Chat, Wisp and Games tabs. |
| `page/js/_begin.js`, `_end.js` | The wrapper that turns the modules into one script. |
| `wisp-shade.js` | Wisp's clay lighting, run in a Web Worker. |
| `icons/`, `fonts/`, `chess/`, `manifest.webmanifest` | Embedded files. `index.json` files keep their order and encoding. |

## Tests (`npm test`)

- **Build**: the page the Worker serves matches the live page byte for byte, and the Stockfish module is identical.
- **Worker**: runs locally under Miniflare and serves the page, manifest, icons, font, chess files and service worker.
  It answers the health check and rejects bad chat requests, wrong methods and other sites' calls. No request reaches
  an AI provider.
- **Renderer**: 45 sample replies, each finished and cut at five points mid-stream, plus 11 tricky half-written
  prefixes. The output must match `test/golden/renderer.json`. The rebuilt app's renderer must pass this same file.
  To record new golden output on purpose: `UPDATE_GOLDEN=1 node --test legacy/test/renderer.test.mjs`.

## If the live Worker changes before the rebuild ships

Download the bundle again and re-run the recovery, then review the diff:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/assistant-api/content/v2" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -o assistant-api.bundle
```

```bash
node tools/recover.mjs assistant-api.bundle --version=<deployed version id>
```

Cloudflare's download returns the newest *upload*, which isn't always the deployed version. Check the deployments
list before trusting it.

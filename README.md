# Wind

Wind is a friendly AI assistant: fast answers with live web sources, Wisp the companion, and chess against Wind Bot.
It runs on Cloudflare Workers as the Worker `assistant-api`:
https://assistant-api.assistant-service.workers.dev

**This repository is the live site.** A push to `main` that passes the tests is deployed to it automatically
(see [Deploying](#deploying)).

## Working on it

```bash
npm install
```

```bash
npm test
```

```bash
npm run build
```

1. Change files under `src/`.
2. Run `npm test`.
3. Push to `main`. GitHub tests the change again and deploys it to the live site.

`npm run build` writes the Worker to `dist/`: `worker.js`, with the page and every file it serves inside, and the
chess engine.

## Files

| Path | What it is |
|---|---|
| `src/worker/shell.js` | Serves the page and its files (icons, manifest, font, chess pieces, Stockfish, service worker). Large embedded files appear as `__embed("NAME")`, and the build fills them in. |
| `src/worker/api.js` | The API: `/api/chat` (NVIDIA models, web research, weather), `/api/followups`, `/api/wisp/*`, `/api/chess/*`, `/api/health`. |
| `src/page/index.html` | The page markup. `/*@embed …*/` marks where the stylesheet and scripts go. |
| `src/page/styles.css` | All of the page's styles. |
| `src/page/boot-theme.js`, `boot-sidebar.js` | Two tiny scripts that run before the page draws (theme, sidebar). |
| `src/page/js/markdown.js` | The reply renderer: Markdown, maths, chemistry, code highlighting, citations, and the Bengali digit and letter rules. |
| `src/page/js/app.js` | The chat: storage, streaming playback, sending, sources, weather card, read aloud, history. |
| `src/page/js/comeback.js` | Follow-up questions, Share, Wisp's "has something to say" dot, and the chess record. |
| `src/page/js/chess-rules.js`, `chess-ui.js`, `chess-bot.js` | Chess rules and a fallback engine, the board (Stockfish runs in a Web Worker), and the talking bot. |
| `src/page/js/wisp.js` | Wisp the mascot: 32 feelings, its chat, and its memory. |
| `src/page/js/tabs.js` | The Chat, Wisp and Games tabs. |
| `src/page/js/_begin.js`, `_end.js` | The wrapper that turns the modules into one script. |
| `src/wisp-shade.js` | Wisp's clay lighting, run in a Web Worker. |
| `src/icons/`, `src/fonts/`, `src/chess/`, `src/manifest.webmanifest` | Embedded files. `index.json` files keep their order and encoding. |
| `build.mjs` | The build: puts `src/` together into `dist/worker.js` and `dist/stockfish-19-lite-single.bin`. |
| `wrangler.jsonc` | The live Worker's Cloudflare settings. Changing one here changes it on the live site at the next deploy. |
| `test/` | The tests (below). |

## Tests

`npm test` runs two sets. Neither reaches an AI provider.

- **Worker**: the Worker runs locally under Miniflare. It serves the page, manifest, icons, font, chess files and
  service worker. It answers the health check and rejects bad chat requests, wrong methods and other sites' calls.
- **Renderer**: 45 sample replies, each finished and cut at five points mid-stream, plus 11 tricky half-written
  prefixes, must render exactly as in `test/golden/renderer.json`. To record new output on purpose after changing
  the renderer: `UPDATE_GOLDEN=1 node --test test/renderer.test.mjs`.

## Deploying

`.github/workflows/ci.yml` tests every push and pull request. On `main`, it then runs `npm run build` and
`wrangler deploy`. Deploying needs one repository secret, `CLOUDFLARE_API_TOKEN`: a Cloudflare API token made from
the "Edit Cloudflare Workers" template. Until it is added, the deploy job skips itself with a notice.

- `npm run deploy` deploys by hand. It needs `CLOUDFLARE_API_TOKEN` in the environment.
- Secrets (`NVIDIA_API_KEY`, `NVIDIA_FACE_KEY`, `NVIDIA_TALK_KEY`, `GROQ_API_KEY`, `LANGSEARCH_API_KEY`,
  `TAVILY_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`) live on Cloudflare only. Every deploy keeps them.
- Preview links (Version URLs) are off on purpose (`"preview_urls": false` in `wrangler.jsonc`).
- To undo a bad deploy, put the previous version back: `npx wrangler rollback` (or choose a version in the
  Cloudflare dashboard, Workers & Pages > assistant-api > Deployments). Then revert the commit on `main`, so the next
  push doesn't deploy it again.

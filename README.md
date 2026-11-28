# Wind

**Live site:** https://assistant-api.assistant-service.workers.dev (Cloudflare Worker `assistant-api`)

Wind — Personal AI is your personal AI assistant for stories, code, plans and ideas: fast answers with live web
sources, Wisp the companion, and chess against Wind Bot.

**This repository is the live site's source.** Building `main` reproduces the deployed Worker byte for byte. Deploys
are made by hand with `npm run deploy` (see [Deploying](#deploying)); CI tests every change but never deploys.

## Working on it

Use Node.js 22.12 or newer (`.nvmrc` names 22, the version CI uses).

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
3. Push to `main` (CI runs the tests again; it never deploys), then run `npm run deploy` to put the change on the
   live site.

`npm run build` writes the Worker to `dist/`: `worker.js`, with the page and every file it serves inside, and the
chess engine.

## Running it locally

```bash
npm run build
cp .dev.vars.example .dev.vars   # fill in the keys you need; never commit .dev.vars
npx wrangler dev
```

`.dev.vars` holds the secrets for local runs only. Without `NVIDIA_API_KEY`, the page still loads and chat answers
that Wind isn't set up. `npm run dev` runs `wrangler dev` too, and Wrangler builds `dist/` first.

## Files

| Path | What it is |
|---|---|
| `src/worker/shell.js` | Serves the page and its files (icons, manifest, font, chess pieces, Stockfish, Wisp's shading script, service worker). Large embedded files appear as `__embed("NAME")`, and the build fills them in. |
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
| `src/icons/`, `src/fonts/`, `src/chess/`, `src/manifest.webmanifest` | Embedded files. `index.json` files keep their order and encoding. The licence notes `src/fonts/OFL.txt` and `src/chess/engine/README.md` are not embedded. |
| `build.mjs` | The build: empties `dist/`, then puts `src/` together into `dist/worker.js` and `dist/stockfish-19-lite-single.bin`. |
| `wrangler.jsonc` | The live Worker's Cloudflare settings. Changing one here changes it on the live site at the next deploy. |
| `test/` | The tests (below). |
| `LICENSE`, `THIRD_PARTY_NOTICES.md`, `SECURITY.md` | The MIT licence for Wind's own code, the licences of the third-party parts, and how to report a security problem. |
| `.dev.vars.example` | The secret names `npx wrangler dev` reads. Copy it to `.dev.vars`, which is never committed. |
| `.github/`, `.editorconfig`, `.gitattributes`, `.npmrc`, `.nvmrc` | CI and Dependabot, editor and line-ending settings, exact npm versions, and the Node version. |

## Tests

`npm test` runs two sets. Neither reaches an AI provider.

- **Worker**: the Worker runs locally under Miniflare. It serves the page, manifest, icons, font, chess files and
  service worker. It answers the health check and rejects bad chat requests, wrong methods and other sites' calls.
- **Renderer**: 45 sample replies, each finished and cut at five points mid-stream, plus 11 tricky half-written
  prefixes, must render exactly as in `test/golden/renderer.json`. To record new output on purpose after changing
  the renderer: `UPDATE_GOLDEN=1 node --test test/renderer.test.mjs`.

## Deploying

Deploys are made by hand: `npm run deploy` builds the Worker and runs `wrangler deploy`. Wrangler uses
`CLOUDFLARE_API_TOKEN` from the environment, or a `npx wrangler login` session.

- `.github/workflows/ci.yml` tests every push to `main` and every pull request, builds the Worker and checks the
  bundle with `wrangler deploy --dry-run`. It never deploys, so pushing never changes the live site.
- Secrets live on Cloudflare only; every deploy keeps them. The code reads `NVIDIA_API_KEY`, `NVIDIA_FACE_KEY`,
  `NVIDIA_TALK_KEY`, `GROQ_API_KEY` (last-resort web search), `LANGSEARCH_API_KEY` and `TAVILY_API_KEY`.
  `GEMINI_API_KEY` and `OPENROUTER_API_KEY` are also set on the live Worker but nothing reads them, and neither do
  the four `GROQ_*`/`OPENROUTER_*` variables in `wrangler.jsonc`.
- Preview links (Version URLs) are off on purpose (`"preview_urls": false` in `wrangler.jsonc`).
- To undo a bad deploy, put the previous version back: `npx wrangler rollback` (or choose a version in the
  Cloudflare dashboard, Workers & Pages > assistant-api > Deployments). Then revert the commit on `main`, so the next
  deploy doesn't bring it back.

## Licence

Wind's own code is under the MIT licence (see [LICENSE](LICENSE)). The third-party parts keep their own licences,
listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): the Stockfish.js chess engine (GPL-3.0), the chess
pieces (CC BY-NC-SA 4.0, non-commercial use only) and the Noto Sans Bengali font (OFL-1.1).

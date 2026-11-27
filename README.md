# Wind

Wind is a friendly AI assistant: fast answers with live web sources and weather, Wisp the companion, and chess.
It runs on Cloudflare Workers as the Worker `assistant-api`:
https://assistant-api.assistant-service.workers.dev

The rebuild plan (private): https://claude.ai/artifact/71jfYzrxKywDnmdkzkDBFS

## What's here

| Path | What it is |
|---|---|
| `legacy/` | Wind as it runs today, recovered from the live Worker on 27 November 2026, because the original source was lost. See [legacy/README.md](legacy/README.md). |
| `tools/recover.mjs` | Splits a downloaded Worker bundle back into the files under `legacy/src`. |
| `design/mockup/` | The clickable phase 1 mockup ("Quiet Sky"). `npm run build:mockup` builds it into one page, `design/dist/wind-mockup.html`. It runs today's reply renderer and today's chess (rules, board, sounds and Wind Bot) unchanged; `chess-skin.css` only recolours them. |
| `design/extract-legacy-css.mjs` | Regenerates `design/mockup/legacy-*.css`, the styles kept from today's app (replies, Wind Bot, chess), from `legacy/src/page/styles.css`. |

The rebuilt app will live next to `legacy/` and reuse its tested parts (the reply renderer, streaming, Wisp, chess).

## Everyday commands

```bash
npm install
```

```bash
npm test
```

```bash
npm run preview:legacy
```

- `npm test` runs three checks. The build has to match the deployed version. The Worker has to run locally under Miniflare and serve the page, its files and the API checks. The reply renderer has to reproduce its golden output.
- `npm run build:legacy` builds `legacy/dist` and reports whether it matches the deployed version.
- `npm run preview:legacy` uploads `legacy/dist` as a new **preview version** with its own link. Live traffic does not move.

Sending a version to live traffic is a separate, deliberate step: `npx wrangler versions deploy`.
Rolling back works the same way: deploy the previous version again.

## Credentials

Wrangler needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the environment.
The Worker's secrets stay on Cloudflare and are never in this repository. Every upload keeps them:
`NVIDIA_API_KEY`, `NVIDIA_FACE_KEY`, `NVIDIA_TALK_KEY`, `GROQ_API_KEY`, `LANGSEARCH_API_KEY`, `TAVILY_API_KEY`,
`GEMINI_API_KEY`, `OPENROUTER_API_KEY`.

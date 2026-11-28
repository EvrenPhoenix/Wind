# Wind: notes for Claude

This repository is the source of the live site: the Cloudflare Worker `assistant-api`, at
https://assistant-api.assistant-service.workers.dev. Building `main` reproduces the live Worker byte for byte.
Deploys are made by hand (`npm run deploy`): `.github/workflows/ci.yml` deploys only once a `CLOUDFLARE_API_TOKEN`
repository secret exists, and none does. Treat a deploy as a release. Push only changes the owner asked for, with
`npm test` passing.

## Commands

- `npm test`: Worker tests (Miniflare) and the reply renderer's golden tests. Nothing calls an AI provider.
- `npm run build`: builds `src/` into `dist/` (the Worker, with the page and its files inside).
- `npm run deploy`: builds and deploys by hand (Wrangler uses `CLOUDFLARE_API_TOKEN` or a `npx wrangler login`
  session). Pushing to `main` does not deploy.

See README.md for the file map, and build.mjs for how the page and files are embedded in the Worker
(`__embed("NAME")`, `/*@embed …*/`). The source was recovered from the live Worker (version 240) on 27 November 2026,
which is why the page is one HTML file with everything inlined. The same content is live as version 250, deployed by
hand from commit d150536.

## Rules

- **Secrets** (API keys) live only on Cloudflare. Never put them in the repository, in `wrangler.jsonc` or in logs.
  Deploys keep them.
- **No preview versions.** Preview links are off (`"preview_urls": false`). Don't run `wrangler versions upload`
  or turn preview links back on unless the owner asks.
- **`wrangler.jsonc` is the live configuration.** Its bindings, variables, compatibility date and observability
  mirror the live Worker; a change there changes the live site.
- **Language:** the interface and Wind's default language are English. Wind speaks Bengali only when the user
  asks for it.
- **Place:** the owner is in India, not Bangladesh. Never use Bangladesh or Dhaka as a default, a sample or an
  assumption.
- **Wind Bot** (the chess opponent) must stay exactly as expressive as it is: its face, moods and talk.
- After changing the reply renderer on purpose, update the golden file
  (`UPDATE_GOLDEN=1 node --test test/renderer.test.mjs`) and review the diff.

## Undoing a bad deploy

Roll back to the previous version (`npx wrangler rollback`, or Workers & Pages > assistant-api > Deployments in the
Cloudflare dashboard), then revert the commit on `main` so the next deploy doesn't bring it back.

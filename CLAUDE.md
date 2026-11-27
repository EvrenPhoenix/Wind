# Wind: notes for Claude

This repository **is** the live site: the Cloudflare Worker `assistant-api`, at
https://assistant-api.assistant-service.workers.dev. Every push to `main` that passes the tests is deployed to it
by `.github/workflows/ci.yml`. Treat a push to `main` as a release. Push only changes the owner asked for, with
`npm test` passing.

## Commands

- `npm test`: Worker tests (Miniflare) and the reply renderer's golden tests. Nothing calls an AI provider.
- `npm run build`: builds `src/` into `dist/` and says whether the output is still the original recovered site.
- `npm run deploy`: deploys by hand (needs `CLOUDFLARE_API_TOKEN`). Normally pushing to `main` does this.

See README.md for the file map, how the build embeds files (`__embed("NAME")`, `/*@embed …*/`), and how the source
was recovered.

## Rules

- **Secrets** (API keys) live only on Cloudflare. Never put them in the repository, in `wrangler.jsonc` or in logs.
  Deploys keep them.
- **No preview versions.** Preview links are off (`"preview_urls": false`); the owner had the old ones removed.
  Don't run `wrangler versions upload` or turn preview links back on unless the owner asks.
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
Cloudflare dashboard), then revert the commit on `main` so the next push doesn't deploy it again.

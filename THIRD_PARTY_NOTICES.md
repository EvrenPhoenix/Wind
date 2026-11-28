# Third-party notices

Wind's own code is under the MIT licence (see [LICENSE](LICENSE)). The parts below were made by others. They are
committed in this repository, the live Worker serves them, and each keeps its own licence.

The Worker bundles no npm packages. `package.json` has no runtime dependencies: `miniflare` and `wrangler` are
development tools (tests, build checks and deploys), and nothing from `node_modules` ends up in `dist/worker.js`.

## Stockfish.js 19.0.1 (chess engine)

- **Version:** 19.0.1 (Stockfish 19, lite single-threaded build).
- **Licence:** GPL-3.0-only. The engine's header says "License: GPLv3", and `Copying.txt` beside it is the GNU
  General Public License, version 3.
- **In this repository:** `src/chess/engine/` (`stockfish-19-lite-single.js`, `stockfish-19-lite-single.wasm`,
  `Copying.txt`; see its [README](src/chess/engine/README.md)). Served at `/chess/engine/19.0.1/`.
- **Upstream:** https://github.com/nmrugg/stockfish.js/tree/v19.0.1 (the corresponding source), based on
  https://github.com/official-stockfish/Stockfish.
- **Copyright:** "Stockfish.js 19 (c) 2026, Chess.com, LLC". "Based on Stockfish (c) T. Romstad, M. Costalba,
  J. Kiiski, G. Linscott and other contributors." Nets by Chris Bao (sscg13).
- The engine runs in the visitor's browser, in a Web Worker of its own. Wind's page sends it UCI text commands and
  reads its replies.

## Chess pieces (sadsnake1's "Tatiana" and "Staunty" sets, adapted)

- **Version:** no upstream version. Kings, queens, rooks, knights and pawns come from the "Tatiana" set. Bishops come
  from the "Staunty" set, recoloured to Tatiana's fill, ink and line weight so the set reads as one.
- **Licence:** CC-BY-NC-SA-4.0, Creative Commons Attribution-NonCommercial-ShareAlike 4.0
  (https://creativecommons.org/licenses/by-nc-sa/4.0/). This adapted set is shared under the same licence.
  **Non-commercial use only:** if Wind is ever sold or carries ads, these pieces must be swapped out.
- **In this repository:** `src/chess/pieces/` (12 SVG files; `index.json` lists their keys, file names, encoding and order). Served at
  `/chess/v2/<piece>.svg`, and at `/chess/v1/` for pages cached before the switch.
- **Upstream:** both sets are by sadsnake1, as used by Lichess:
  https://github.com/lichess-org/lila/tree/master/public/piece
- **Copyright:** sadsnake1. No separate copyright line comes with the sets; this credit is the one given in
  `src/worker/shell.js`.

## Noto Sans Bengali 3.011 (font)

- **Version:** 3.011 (the font's name table says "Version 3.011"). Bengali letters only, weights 400 to 700.
- **Licence:** OFL-1.1, the SIL Open Font License, Version 1.1. The full text is in
  [`src/fonts/OFL.txt`](src/fonts/OFL.txt), copied from upstream.
- **In this repository:** `src/fonts/noto-sans-bengali-3011.woff2`. Served at `/fonts/noto-sans-bengali-3011.woff2`.
- **Upstream:** https://github.com/notofonts/bengali
- **Copyright:** "Copyright 2022 The Noto Project Authors (https://github.com/notofonts/bengali)" (upstream
  `OFL.txt`). The font's own name table says "Copyright 2025 The Noto Project Authors
  (https://github.com/notofonts/bengali)".

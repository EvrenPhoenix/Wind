# Stockfish.js 19.0.1

The chess engine behind Wind Bot: Stockfish.js 19.0.1 (Stockfish 19, lite single-threaded build), from
https://github.com/nmrugg/stockfish.js/tree/v19.0.1. It runs in the visitor's browser, in a Web Worker.

| File | What it is | sha256 |
|---|---|---|
| `stockfish-19-lite-single.js` | The engine's JavaScript, which loads the WebAssembly. | `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a` |
| `stockfish-19-lite-single.wasm` | The engine, compiled to WebAssembly. The build copies it to `dist/stockfish-19-lite-single.bin`, a data module of the Worker. | `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de` |
| `Copying.txt` | The GNU General Public License, version 3. It is committed with CRLF line endings, and `.gitattributes` keeps those bytes. | `0b383d5a63da644f628d99c33976ea6487ed89aaa59f0b3257992deac1171e6b` |

`src/worker/shell.js` serves all three at `/chess/engine/19.0.1/`. The served JavaScript gets a one-line header in
front that names the source and the licence.

## Licence and source

Stockfish.js is licensed under the GNU GPL, version 3 (see `Copying.txt`). Its corresponding source, including the
build scripts, is the `v19.0.1` tag of https://github.com/nmrugg/stockfish.js. It is based on Stockfish:
https://github.com/official-stockfish/Stockfish.

## Editing

Don't edit these files. `build.mjs` embeds them in the live Worker byte for byte, so any change would change the live
site. The build reads only the three files above, so this README is not part of the Worker. (`src/worker/shell.js`
calls this file `src/engine/README.md`, an older path: that comment is part of the live Worker too, so it stays as
it is.)

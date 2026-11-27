// ============================================================================
// Chess rules and a small engine, for Wind's chess game.
// Rules: legal moves (castling, en passant, promotion), check, checkmate, stalemate, the 50-move rule, threefold
// repetition and insufficient material; FEN in and out; SAN for every move. The engine (material + piece-square
// tables, alpha-beta with quiescence) scans the position for the AI team and settles a disagreement between them.
// Squares: index 0 = a8 ... 7 = h8, 56 = a1 ... 63 = h1 (row = index >> 3, 0 is rank 8; file = index & 7).
// ============================================================================
const Chess = (() => {
  const FILES = "abcdefgh";
  const sqName = i => FILES[i & 7] + (8 - (i >> 3));
  const sqIndex = s => (8 - Number(s[1])) * 8 + FILES.indexOf(s[0]);
  const colorOf = p => (p === p.toUpperCase() ? "w" : "b");
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const ROOK = [[-1, 0], [1, 0], [0, -1], [0, 1]], BISHOP = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  // castling rights as bits: K=1 Q=2 k=4 q=8; a move touching one of these squares removes the matching rights
  const CASTLE_MASK = { 0: 8, 4: 12, 7: 4, 56: 2, 60: 3, 63: 1 };

  function parse(fen) {
    const [pos, turn, cast, ep, half, full] = String(fen || START).trim().split(/\s+/);
    const b = new Array(64).fill(null); let i = 0;
    for (const ch of pos) { if (ch === "/") continue; if (/\d/.test(ch)) i += Number(ch); else b[i++] = ch; }
    let c = 0; for (const ch of cast || "-") c |= { K: 1, Q: 2, k: 4, q: 8 }[ch] || 0;
    const st = { b, turn: turn === "b" ? "b" : "w", cast: c, ep: ep && ep !== "-" ? sqIndex(ep) : -1, half: Number(half) || 0, full: Number(full) || 1, kw: b.indexOf("K"), kb: b.indexOf("k") };
    return st;
  }
  function fen(st) {
    let s = "";
    for (let r = 0; r < 8; r++) { let e = 0; for (let f = 0; f < 8; f++) { const p = st.b[r * 8 + f]; if (!p) e++; else { if (e) { s += e; e = 0; } s += p; } } if (e) s += e; if (r < 7) s += "/"; }
    const c = (st.cast & 1 ? "K" : "") + (st.cast & 2 ? "Q" : "") + (st.cast & 4 ? "k" : "") + (st.cast & 8 ? "q" : "") || "-";
    return s + " " + st.turn + " " + c + " " + (st.ep >= 0 ? sqName(st.ep) : "-") + " " + st.half + " " + st.full;
  }
  const posKey = st => fen(st).split(" ").slice(0, 4).join(" ");   // what counts for repetition
  const clone = st => ({ ...st, b: st.b.slice() });

  // is square sq attacked by side `by`?
  function attacked(b, sq, by) {
    const r = sq >> 3, f = sq & 7, up = by === "w" ? 1 : -1;   // white pawns attack from the row below (higher index)
    const pr = r + up, P = by === "w" ? "P" : "p";
    if (pr >= 0 && pr < 8) { if (f > 0 && b[pr * 8 + f - 1] === P) return true; if (f < 7 && b[pr * 8 + f + 1] === P) return true; }
    const N = by === "w" ? "N" : "n", K = by === "w" ? "K" : "k";
    for (const [dr, df] of KNIGHT) { const rr = r + dr, ff = f + df; if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && b[rr * 8 + ff] === N) return true; }
    for (const [dr, df] of KING) { const rr = r + dr, ff = f + df; if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && b[rr * 8 + ff] === K) return true; }
    const R = by === "w" ? "R" : "r", B = by === "w" ? "B" : "b", Q = by === "w" ? "Q" : "q";
    for (const [dr, df] of ROOK) { let rr = r + dr, ff = f + df; while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const p = b[rr * 8 + ff]; if (p) { if (p === R || p === Q) return true; break; } rr += dr; ff += df; } }
    for (const [dr, df] of BISHOP) { let rr = r + dr, ff = f + df; while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const p = b[rr * 8 + ff]; if (p) { if (p === B || p === Q) return true; break; } rr += dr; ff += df; } }
    return false;
  }
  const inCheck = (st, side = st.turn) => attacked(st.b, side === "w" ? st.kw : st.kb, side === "w" ? "b" : "w");

  // pseudo-legal moves: { from, to, p (piece), x (captured piece or null), promo, flag: "" | "ep" | "2" | "K" | "Q" }
  function pseudo(st, capturesOnly) {
    const b = st.b, me = st.turn, out = [], own = p => p && colorOf(p) === me, foe = p => p && colorOf(p) !== me;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p || colorOf(p) !== me) continue;
      const t = p.toLowerCase(), r = i >> 3, f = i & 7;
      if (t === "p") {
        const dir = me === "w" ? -1 : 1, start = me === "w" ? 6 : 1, last = me === "w" ? 0 : 7, r1 = r + dir;
        const push = (to, x, flag) => { if ((to >> 3) === last) for (const q of "qrbn") out.push({ from: i, to, p, x, promo: me === "w" ? q.toUpperCase() : q, flag: flag || "" }); else out.push({ from: i, to, p, x, promo: null, flag: flag || "" }); };
        if (r1 >= 0 && r1 < 8) {
          if (!b[r1 * 8 + f] && (!capturesOnly || r1 === last)) { push(r1 * 8 + f, null); if (r === start && !b[(r + 2 * dir) * 8 + f] && !capturesOnly) out.push({ from: i, to: (r + 2 * dir) * 8 + f, p, x: null, promo: null, flag: "2" }); }
          for (const df of [-1, 1]) { const ff = f + df; if (ff < 0 || ff > 7) continue; const to = r1 * 8 + ff;
            if (foe(b[to])) push(to, b[to]); else if (to === st.ep) out.push({ from: i, to, p, x: me === "w" ? "p" : "P", promo: null, flag: "ep" }); }
        }
        continue;
      }
      if (t === "n" || t === "k") {
        for (const [dr, df] of t === "n" ? KNIGHT : KING) { const rr = r + dr, ff = f + df; if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue; const to = rr * 8 + ff;
          if (own(b[to])) continue; if (capturesOnly && !b[to]) continue; out.push({ from: i, to, p, x: b[to], promo: null, flag: "" }); }
        if (t === "k" && !capturesOnly) {   // castling: rights, empty path, and the king may not be in, pass through or land in check
          const opp = me === "w" ? "b" : "w", home = me === "w" ? 60 : 4, ks = me === "w" ? 1 : 4, qs = me === "w" ? 2 : 8, R = me === "w" ? "R" : "r";
          if (i === home && !attacked(b, home, opp)) {
            if (st.cast & ks && b[home + 3] === R && !b[home + 1] && !b[home + 2] && !attacked(b, home + 1, opp) && !attacked(b, home + 2, opp)) out.push({ from: i, to: home + 2, p, x: null, promo: null, flag: "K" });
            if (st.cast & qs && b[home - 4] === R && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home - 1, opp) && !attacked(b, home - 2, opp)) out.push({ from: i, to: home - 2, p, x: null, promo: null, flag: "Q" });
          }
        }
        continue;
      }
      const dirs = t === "r" ? ROOK : t === "b" ? BISHOP : ROOK.concat(BISHOP);
      for (const [dr, df] of dirs) { let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const to = rr * 8 + ff, q = b[to]; if (own(q)) break; if (!capturesOnly || q) out.push({ from: i, to, p, x: q, promo: null, flag: "" }); if (q) break; rr += dr; ff += df; } }
    }
    return out;
  }
  // play a move on a state in place; returns what is needed to take it back
  function make(st, m) {
    const b = st.b, u = { m, cast: st.cast, ep: st.ep, half: st.half, full: st.full, kw: st.kw, kb: st.kb };
    b[m.to] = m.promo || m.p; b[m.from] = null;
    if (m.flag === "ep") b[m.to + (st.turn === "w" ? 8 : -8)] = null;
    if (m.flag === "K") { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
    if (m.flag === "Q") { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
    if (m.p === "K") st.kw = m.to; else if (m.p === "k") st.kb = m.to;
    st.cast &= ~((CASTLE_MASK[m.from] || 0) | (CASTLE_MASK[m.to] || 0));
    st.ep = m.flag === "2" ? (m.from + m.to) >> 1 : -1;
    st.half = m.x || m.p === "P" || m.p === "p" ? 0 : st.half + 1;
    if (st.turn === "b") st.full++;
    st.turn = st.turn === "w" ? "b" : "w";
    return u;
  }
  function unmake(st, u) {
    const b = st.b, m = u.m;
    st.turn = st.turn === "w" ? "b" : "w";
    b[m.from] = m.p; b[m.to] = m.flag === "ep" ? null : m.x;
    if (m.flag === "ep") b[m.to + (st.turn === "w" ? 8 : -8)] = m.x;
    if (m.flag === "K") { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = null; }
    if (m.flag === "Q") { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = null; }
    st.cast = u.cast; st.ep = u.ep; st.half = u.half; st.full = u.full; st.kw = u.kw; st.kb = u.kb;
  }
  function legal(st, capturesOnly) {
    const me = st.turn, out = [];
    for (const m of pseudo(st, capturesOnly)) { const u = make(st, m); if (!inCheck(st, me)) out.push(m); unmake(st, u); }
    return out;
  }
  const uci = m => sqName(m.from) + sqName(m.to) + (m.promo ? m.promo.toLowerCase() : "");

  // Standard Algebraic Notation, with the + or # it earns
  function san(st, m, moves) {
    let s;
    if (m.flag === "K") s = "O-O"; else if (m.flag === "Q") s = "O-O-O";
    else {
      const t = m.p.toUpperCase();
      if (t === "P") s = (m.x ? FILES[m.from & 7] + "x" : "") + sqName(m.to) + (m.promo ? "=" + m.promo.toUpperCase() : "");
      else {
        const rivals = (moves || legal(st)).filter(o => o.p === m.p && o.to === m.to && o.from !== m.from);
        let d = "";
        if (rivals.length) { const sameFile = rivals.some(o => (o.from & 7) === (m.from & 7)), sameRank = rivals.some(o => (o.from >> 3) === (m.from >> 3));
          d = !sameFile ? FILES[m.from & 7] : !sameRank ? String(8 - (m.from >> 3)) : sqName(m.from); }
        s = t + d + (m.x ? "x" : "") + sqName(m.to);
      }
    }
    const u = make(st, m), chk = inCheck(st), mate = chk && legal(st).length === 0; unmake(st, u);
    return s + (mate ? "#" : chk ? "+" : "");
  }
  // why the game is over (or null): needs the list of position keys seen so far for repetition
  function outcome(st, seen) {
    const moves = legal(st);
    if (!moves.length) return inCheck(st) ? { result: st.turn === "w" ? "0-1" : "1-0", reason: "checkmate" } : { result: "1/2-1/2", reason: "stalemate" };
    if (st.half >= 100) return { result: "1/2-1/2", reason: "fifty-move rule" };
    const k = posKey(st); if (seen && seen.filter(x => x === k).length >= 3) return { result: "1/2-1/2", reason: "threefold repetition" };
    const rest = st.b.filter(p => p && p.toLowerCase() !== "k");
    if (!rest.length || (rest.length === 1 && /[nbNB]/.test(rest[0]))) return { result: "1/2-1/2", reason: "insufficient material" };
    if (rest.length === 2 && rest.every(p => /[bB]/.test(p))) { const sq = st.b.map((p, i) => p && /[bB]/.test(p) ? ((i >> 3) + (i & 7)) % 2 : -1).filter(x => x >= 0); if (sq[0] === sq[1] && rest[0] !== rest[1]) return { result: "1/2-1/2", reason: "insufficient material" }; }
    return null;
  }
  function perft(st, d) { if (!d) return 1; let n = 0; for (const m of legal(st)) { const u = make(st, m); n += perft(st, d - 1); unmake(st, u); } return n; }

  // ---------------------------------------------------------------- engine
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }, LOWER = { p: "p", n: "n", b: "b", r: "r", q: "q", k: "k", P: "p", N: "n", B: "b", R: "r", Q: "q", K: "k" };
  // piece-square tables (white's view, index 0 = a8), after Tomasz Michniewski's simplified evaluation
  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    e: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
  };
  const MATE = 100000;
  // score from the side to move's point of view
  function evaluate(st) {
    const b = st.b; let s = 0, heavy = 0;
    for (let i = 0; i < 64; i++) { const p = b[i]; if (p === "q" || p === "Q") heavy += 900; else if (p === "r" || p === "R") heavy += 500; }
    const endgame = heavy <= 1300;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p) continue; const t = LOWER[p], w = p !== t, idx = w ? i : (7 - (i >> 3)) * 8 + (i & 7);
      const v = VAL[t] + (t === "k" && endgame ? PST.e : PST[t])[idx]; s += w ? v : -v;
    }
    return st.turn === "w" ? s : -s;
  }
  const order = (moves, best) => moves.map(m => ({ m, k: (best && m.from === best.from && m.to === best.to && m.promo === best.promo ? 1e6 : 0) + (m.x ? 10 * VAL[m.x.toLowerCase()] - VAL[m.p.toLowerCase()] + 1000 : 0) + (m.promo ? 800 : 0) })).sort((a, b) => b.k - a.k).map(o => o.m);
  function search(st, depth, deadline) {
    let nodes = 0, out = false;
    const timeUp = () => { if ((++nodes & 1023) === 0 && Date.now() > deadline) out = true; return out; };
    function quiesce(alpha, beta, ply) {
      if (timeUp()) return 0;
      const stand = evaluate(st); if (stand >= beta) return beta; if (stand > alpha) alpha = stand;
      if (ply > 8) return alpha;
      for (const m of order(legal(st, true))) { const u = make(st, m), sc = -quiesce(-beta, -alpha, ply + 1); unmake(st, u); if (out) return 0; if (sc >= beta) return beta; if (sc > alpha) alpha = sc; }
      return alpha;
    }
    function nega(d, alpha, beta, ply) {
      if (timeUp()) return 0;
      const moves = legal(st);
      if (!moves.length) return inCheck(st) ? -MATE + ply : 0;
      if (st.half >= 100) return 0;
      if (d <= 0) return quiesce(alpha, beta, 0);
      for (const m of order(moves)) { const u = make(st, m), sc = -nega(d - 1, -beta, -alpha, ply + 1); unmake(st, u); if (out) return 0; if (sc >= beta) return beta; if (sc > alpha) alpha = sc; }
      return alpha;
    }
    return { nega, isOut: () => out, nodes: () => nodes };
  }
  // Every legal move scored by a full-window search (best first): what the AI team gets as its scan.
  // Then the best move is searched deeper while time allows.
  function analyse(fenStr, opts = {}) {
    const st = parse(fenStr), moves = legal(st), t0 = Date.now(), deadline = t0 + (opts.ms || 900);
    if (!moves.length) return { moves: [], best: null, depth: 0 };
    const scan = search(st, 0, deadline + 1e9);
    let scored = moves.map(m => { const u = make(st, m), sc = -scan.nega(1, -MATE - 1, MATE + 1, 1); unmake(st, u); return { m, score: sc }; }).sort((a, b) => b.score - a.score);
    let depth = 2, best = scored[0];
    for (let d = 3; d <= (opts.maxDepth || 5) && Date.now() < deadline; d++) {   // iterative deepening on the best few
      const s = search(st, d, deadline), top = scored.slice(0, Math.max(6, Math.ceil(scored.length / 3))).map(o => o.m);
      const res = []; let alpha = -MATE - 1;
      for (const m of order(top, best.m)) { const u = make(st, m), sc = -s.nega(d - 1, -MATE - 1, -alpha + 1e5, 1); unmake(st, u); if (s.isOut()) break; res.push({ m, score: sc }); }
      if (s.isOut() || res.length < top.length) break;
      res.sort((a, b) => b.score - a.score); best = res[0]; depth = d;
      const rest = scored.filter(o => !res.some(r => r.m === o.m)); scored = res.concat(rest.map(o => ({ m: o.m, score: Math.min(o.score, res[res.length - 1].score - 1) })));
    }
    return { moves: scored, best, depth, ms: Date.now() - t0 };
  }
  // the score of one move from the mover's view, searched to a fixed depth (used to settle a disagreement)
  function scoreMove(fenStr, m, depth = 3, ms = 1500) {
    const st = parse(fenStr), s = search(st, depth, Date.now() + ms), u = make(st, m), sc = -s.nega(depth - 1, -MATE - 1, MATE + 1, 1); unmake(st, u);
    return sc;
  }
  const mateIn = score => Math.abs(score) > MATE - 200 ? Math.sign(score) * Math.ceil((MATE - Math.abs(score)) / 2) : 0;

  return { START, parse, fen, posKey, clone, legal, make, unmake, inCheck, san, uci, sqName, sqIndex, outcome, perft, attacked, analyse, scoreMove, mateIn, colorOf, VAL, MATE };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Chess;


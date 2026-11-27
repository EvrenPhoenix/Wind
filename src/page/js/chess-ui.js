// ============================================================================
// Chess: you against Wind. Wind's moves are calculated by Stockfish 19 (lite) running in this browser in a Web Worker
// (served at /chess/engine/): it gets the exact position, plays at full strength in about a second, and predicts your
// reply. While you think, it is already working on its answer to that reply, so when you play it the answer comes at
// once. If the engine can't run, the small engine in chess.js moves instead. Wind's face and trash talk (chess-bot.js)
// only hear about what happens, through bot(), and never touch the game. The game is kept in this browser, so a reload
// resumes it.
// ============================================================================
const CHESS_KEY = "wind-chess", CHESS_SCORE = "wind-chess-score", CHESS_SOUND = "wind-chess-sound";
const PIECE_NAMES = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
let cg = null, cv = null, chessOn = false, chessBusy = false, chessSel = -1, chessDrag = null, chessPromo = null;
const pcs = new Map();   // square -> piece element on the board

function chessStore(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
function chessNew(color) {
  const st = Chess.parse(Chess.START);
  cg = { color, moves: [], sans: [], st, seen: [Chess.posKey(st)], over: null };
  chessSave();
}
function chessLoad() {
  const d = chessStore(CHESS_KEY); if (!d || !/^[wb]$/.test(d.color) || !Array.isArray(d.moves)) return null;
  const st = Chess.parse(Chess.START), g = { color: d.color, moves: [], sans: [], st, seen: [Chess.posKey(st)], over: null };
  for (const u of d.moves) { const ms = Chess.legal(st), m = ms.find(x => Chess.uci(x) === u); if (!m) return null; g.sans.push(Chess.san(st, m, ms)); Chess.make(st, m); g.moves.push(u); g.seen.push(Chess.posKey(st)); }
  g.over = d.resigned ? { result: d.color === "w" ? "0-1" : "1-0", reason: "resignation" } : Chess.outcome(st, g.seen);
  return g;
}
function chessSave() { if (cg) chessStore(CHESS_KEY, { color: cg.color, moves: cg.moves, resigned: cg.over && cg.over.reason === "resignation" }); }
const myTurn = () => cg && !cg.over && cg.st.turn === cg.color;

// ---- the view
function chessView() {
  if (cv) return cv;
  const root = $("chessView");
  root.innerHTML = `
  <div class="cv">
    <div class="cv-arena" aria-hidden="true"><i class="cv-glow a"></i><i class="cv-glow b"></i></div>
    <div class="cv-play">
      <div class="cv-bar top" id="cvWindBar">
        <span class="cv-face" id="cvFace">${botFaceHTML()}</span>
        <div class="cv-stage">
          <div class="cv-stage-row"><span class="cv-id"><b>Wind Bot<i class="cv-pulse"></i></b><small id="cvWindSide">Black</small></span><span class="cv-taken" id="cvTakenTop"></span></div>
          <p class="cv-speech" id="cvSpeech" data-state="idle" aria-hidden="true"><span class="cv-speech-win"><span class="cv-speech-txt"></span></span><span class="cv-speech-dots"><i></i><i></i><i></i></span></p>
        </div>
      </div>
      <div class="cv-board-wrap"><div class="cv-board" id="cvBoard" role="application" aria-label="Chess board. The arrow keys move around it; Enter picks up a piece and puts it down; Escape lets go." tabindex="0">
        <div class="cv-sqs"></div><div class="cv-hl" id="cvHl"></div><div class="cv-pcs" id="cvPcs"></div><div class="cv-coords" id="cvCoords" aria-hidden="true"></div>
        <div class="cv-promo" id="cvPromo" hidden></div>
        <div class="cv-card" id="cvCard" hidden></div>
      </div></div>
      <div class="cv-bar you" id="cvYouBar"><span class="cv-who"><span class="cv-av you" aria-hidden="true">You</span><span class="cv-id"><b>You<i class="cv-pulse"></i></b><small id="cvYouSide">White</small><small class="cv-you-status" id="cvYouStatus" aria-live="polite"></small></span></span><span class="cv-taken" id="cvTakenBottom"></span></div>
    </div>
    <aside class="cv-side">
      <div class="cv-head"><div class="cv-status" id="cvStatus" role="status" aria-live="polite"></div><div class="cv-score" id="cvScore"></div></div>
      <section class="cv-talk" id="cvTalk" aria-label="Live chat with Wind Bot">
        <button type="button" class="cv-talk-open" id="cvTalkOpen" aria-expanded="false" aria-controls="cvTalkBody"><span class="cv-live" aria-hidden="true"></span><span>View Live Chat</span><b class="cv-unread" id="cvUnread" hidden></b>${ic("chevron")}</button>
        <div class="cv-talk-body" id="cvTalkBody">
          <div class="cv-talk-top" id="cvTalkTop"><span class="cv-live" aria-hidden="true"></span><b>Live Chat</b><small id="cvTalkState">Watching You</small><button type="button" class="cv-talk-x" id="cvTalkX" aria-label="Hide the live chat">${ic("chevron")}</button></div>
          <div class="cv-log" id="cvLog" role="log" aria-live="polite"></div>
          <form class="cv-sayform" id="cvSayForm" autocomplete="off"><input id="cvSayIn" type="text" maxlength="200" placeholder="Talk back…" aria-label="Talk back to Wind Bot" enterkeyhint="send"><button type="submit" id="cvSend" aria-label="Send">${ic("up")}</button></form>
        </div>
      </section>
      <div class="cv-actions">
        <button type="button" class="cv-btn" id="cvNew" data-ask="New game?">New game</button>
        <button type="button" class="cv-btn" id="cvResign" data-ask="Resign?">Resign</button>
        <button type="button" class="cv-btn icon" id="cvFlip" aria-label="Flip board" title="Flip board">${ic("retry")}</button>
        <button type="button" class="cv-btn icon" id="cvSound" aria-label="Sound" title="Sound">${ic("speaker")}</button>
        <span class="cv-score-mini" id="cvScoreMini" title="You – Wind" role="img"></span>
      </div>
    </aside>
  </div>`;
  cv = { root, board: $("cvBoard"), hl: $("cvHl"), pcs: $("cvPcs"), coords: $("cvCoords"), promo: $("cvPromo"), card: $("cvCard"), status: $("cvStatus"), flip: false };
  addEventListener("resize", () => { if (cg) chessTakenFit(); }, { passive: true });
  // mid-game, New game and Resign ask once ("Resign?"), so a stray tap never throws a game away
  $("cvNew").onclick = () => { if (cg && cg.moves.length && !cg.over) chessAsk($("cvNew"), chessStartCard); else chessStartCard(); };
  $("cvResign").onclick = () => { if (!cg || cg.over || !cg.moves.length) return; chessAsk($("cvResign"), () => { if (!cg || cg.over) return; chessStopAi(); cg.over = { result: cg.color === "w" ? "0-1" : "1-0", reason: "resignation" }; chessScore(); chessSave(); chessRender(); chessSound("lose"); bot("over", { result: "lose", reason: "resignation" }); }); };
  // flip: the pieces get their own layers a frame before they move (so setting them up never lands mid-glide), then
  // all glide to their new squares together, and give the layers back afterwards
  $("cvFlip").onclick = () => {
    if (!cg) return; cv.flip = !cv.flip; cv.pcs.classList.add("lift"); cv.hl.classList.add("hide"); clearTimeout(cv.hlT); clearTimeout(cv.liftT);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const [i, el] of pcs) chessSlide(el, i, 420, "flip"); chessCoords();
      cv.hlT = setTimeout(() => { chessHighlights(); cv.hl.classList.remove("hide"); }, 380);
      cv.liftT = setTimeout(() => cv.pcs.classList.remove("lift"), 520);
    }));
  };
  $("cvSound").onclick = () => { chessStore(CHESS_SOUND, !chessSoundOn()); chessSyncSound(); chessSound("move"); };
  chessSyncSound();
  cv.imgs = []; for (const c of "wb") for (const t of "KQRBNP") { const im = new Image(); im.src = "/chess/v2/" + c + t + ".svg"; if (im.decode) im.decode().catch(() => {}); cv.imgs.push(im); }
  const b = cv.board;
  bot("mount");
  // a card over the board blurs the board under it (once, not on every frame like a backdrop blur would)
  new MutationObserver(() => b.classList.toggle("carded", !cv.card.hidden)).observe(cv.card, { attributes: true, attributeFilter: ["hidden"] });
  b.addEventListener("keydown", chessKey); b.addEventListener("focus", () => { if (chessKb >= 0) chessHighlights(); }); b.addEventListener("blur", () => { if (chessKb >= 0) chessHighlights(); });
  b.addEventListener("pointerdown", chessDown); b.addEventListener("pointermove", chessMove); b.addEventListener("pointerup", chessUp); b.addEventListener("pointercancel", () => chessCancelDrag());
  b.addEventListener("contextmenu", e => e.preventDefault());
  return cv;
}
function chessSoundOn() { return chessStore(CHESS_SOUND) !== false; }
function chessSyncSound() { const on = chessSoundOn(), btn = $("cvSound"); btn.innerHTML = ic(on ? "speaker" : "x"); btn.setAttribute("aria-pressed", String(on)); btn.title = on ? "Sound on" : "Sound off"; btn.classList.toggle("off", !on); }

function chessGlow(on) {}   // the glows stay still now (chess.css): their drift repainted the board every 0.4 s
// where a square is drawn: [column, row] from the top left, for the side at the bottom
function chessXY(i) { const flip = (cg && cg.color === "b") !== cv.flip; const r = i >> 3, f = i & 7; return flip ? [7 - f, 7 - r] : [f, r]; }
function chessSqAt(x, y) { const flip = (cg && cg.color === "b") !== cv.flip; const f = flip ? 7 - x : x, r = flip ? 7 - y : y; return r * 8 + f; }
function chessPlace(el, i) { const [x, y] = chessXY(i); el.style.transform = "translate(" + x * 100 + "%," + y * 100 + "%)"; }
function chessPieceEl(p, i) {
  const el = document.createElement("div"); el.className = "cv-pc"; el.dataset.p = p;
  el.style.backgroundImage = "url(/chess/v2/" + (p === p.toUpperCase() ? "w" : "b") + p.toUpperCase() + ".svg)";
  chessPlace(el, i); return el;
}
// move a piece element to a square: a timed glide, or at once (dur 0, e.g. dropped there by a drag)
function chessSlide(el, i, dur, kind) {
  clearTimeout(el._slide);
  if (!dur) { el.classList.add("now"); chessPlace(el, i); void el.offsetWidth; el.classList.remove("now"); return; }
  el.style.transitionDuration = dur + "ms"; el.style.transitionTimingFunction = kind === "flip" ? "cubic-bezier(.45,0,.25,1)" : "";
  if (kind !== "flip") el.classList.add("moving");
  chessPlace(el, i);
  el._slide = setTimeout(() => { el.classList.remove("moving"); el.style.transitionDuration = ""; el.style.transitionTimingFunction = ""; }, dur + 40);
}
// coordinates: files along the bottom row, ranks down the left column
function chessCoords() {
  let h = ""; for (let k = 0; k < 8; k++) { const fi = chessSqAt(k, 7) & 7, ri = 8 - (chessSqAt(0, k) >> 3), lf = (k + 7) % 2 === 0, lr = k % 2 === 0;
    h += '<span class="cf' + (lf ? " on-light" : "") + '" style="left:' + k * 12.5 + '%">' + "abcdefgh"[fi] + "</span>" + '<span class="cr' + (lr ? " on-light" : "") + '" style="top:' + k * 12.5 + '%">' + ri + "</span>"; }
  cv.coords.innerHTML = h;
}
// draw everything from the game state (full: rebuild the pieces too)
function chessRender(full) {
  chessView(); if (!cg) return;
  const st = cg.st;
  if (full || !pcs.size) {
    cv.pcs.textContent = ""; pcs.clear();
    st.b.forEach((p, i) => { if (p) { const el = chessPieceEl(p, i); cv.pcs.append(el); pcs.set(i, el); } });
    chessCoords();
  }
  chessHighlights();
  // side panel
  $("cvYouSide").textContent = cg.color === "w" ? "White" : "Black"; $("cvWindSide").textContent = cg.color === "w" ? "Black" : "White";
  chessTaken(); chessStatus(); chessScoreLine();
  if (cg.over) chessEndCard(); else if (!cv.card.dataset.start) cv.card.hidden = true;
  $("cvResign").disabled = !!cg.over || !cg.moves.length;
  if (cg.over || !cg.moves.length) { chessAskEnd($("cvNew")); chessAskEnd($("cvResign")); }
}
function chessHighlights() {
  const st = cg.st, sq = [];
  const add = (i, cls) => { const [x, y] = chessXY(i); sq.push('<i class="' + cls + '" style="transform:translate(' + x * 100 + "%," + y * 100 + '%)"></i>'); };
  if (cg.moves.length) { const u = cg.moves[cg.moves.length - 1]; add(Chess.sqIndex(u.slice(0, 2)), "last"); add(Chess.sqIndex(u.slice(2, 4)), "last"); }
  if (Chess.inCheck(st)) add(st.turn === "w" ? st.kw : st.kb, "check");
  if (chessKb >= 0 && cv.board.matches(":focus-visible")) add(chessKb, "kb");
  if (chessSel >= 0) {
    add(chessSel, "sel");
    for (const m of Chess.legal(st)) if (m.from === chessSel) add(m.to, m.x ? "cap" : "dot");
  }
  cv.hl.innerHTML = sq.join("");
}
function chessTaken() {
  const init = { p: 8, n: 2, b: 2, r: 2, q: 1 }, have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  let mat = 0;
  for (const p of cg.st.b) { if (!p || /k/i.test(p)) continue; const c = Chess.colorOf(p), t = p.toLowerCase(); have[c][t]++; mat += (c === "w" ? 1 : -1) * Chess.VAL[t]; }
  const lost = c => { let h = ""; for (const t of ["p", "n", "b", "r", "q"]) for (let k = have[c][t]; k < init[t]; k++) h += '<i' + (k > have[c][t] ? ' class="same"' : "") + ' style="background-image:url(/chess/v2/' + c + t.toUpperCase() + '.svg)"></i>'; return h; };
  const me = cg.color, them = me === "w" ? "b" : "w", lead = Math.round((me === "w" ? mat : -mat) / 100);
  $("cvTakenBottom").innerHTML = lost(them) + (lead > 0 ? "<em>+" + lead + "</em>" : "");   // what you have taken
  $("cvTakenTop").innerHTML = lost(me) + (lead < 0 ? "<em>+" + -lead + "</em>" : "");
  chessTakenFit();
}
// when the captured pieces don't all fit beside the name, the first ones (pawns) fade out at the edge. Measured in the
// next frame (not in the middle of a move), and only when something has been captured.
let chessFitQ = 0;
function chessTakenFit() {
  const els = [$("cvTakenTop"), $("cvTakenBottom")]; cancelAnimationFrame(chessFitQ);
  if (!els.some(el => el.firstElementChild)) { els.forEach(el => el.classList.remove("cut")); return; }
  chessFitQ = requestAnimationFrame(() => { for (const el of els) { const f = el.firstElementChild; el.classList.toggle("cut", !!f && f.getBoundingClientRect().left < el.getBoundingClientRect().left + 4); } });
}
function chessStatus() {
  let t;
  if (!cg.moves.length && cv.card.dataset.start) t = "Pick your side.";
  else if (cg.over) t = chessOverText().title;
  else if (chessBusy) t = "Wind is thinking…";
  else if (myTurn()) t = Chess.inCheck(cg.st) ? "Check!" : "Your move.";
  else t = "Wind's move.";
  cv.status.textContent = t; cv.status.classList.toggle("busy", chessBusy); $("cvYouStatus").textContent = t;
  const live = !cg.over && cv.card.hidden && !cv.card.dataset.start;
  $("cvWindBar").classList.toggle("turn", live && !myTurn()); $("cvYouBar").classList.toggle("turn", live && myTurn());
}
function chessScore() { const s = chessStore(CHESS_SCORE) || { you: 0, team: 0, draw: 0 }; const o = cg.over; if (!o) return; if (o.result === "1/2-1/2") s.draw++; else if ((o.result === "1-0") === (cg.color === "w")) s.you++; else s.team++; chessStore(CHESS_SCORE, s); }
function chessScoreLine() { const s = chessStore(CHESS_SCORE) || { you: 0, team: 0, draw: 0 }; $("cvScore").innerHTML = "<span>You <b>" + s.you + "</b></span><span>Wind <b>" + s.team + "</b></span>" + (s.draw ? "<span>Draws <b>" + s.draw + "</b></span>" : ""); const mini = $("cvScoreMini"); mini.innerHTML = "<b>" + s.you + "</b> – <b>" + s.team + "</b>"; mini.setAttribute("aria-label", "Score: you " + s.you + ", Wind " + s.team + (s.draw ? ", draws " + s.draw : "")); }
// the second tap does it; the question goes away by itself after 3 seconds, or when the other button asks
function chessAsk(btn, act) {
  if (btn.classList.contains("ask")) { chessAskEnd(btn); act(); return; }
  for (const id of ["cvNew", "cvResign"]) chessAskEnd($(id));
  btn.dataset.label = btn.textContent; btn.textContent = btn.dataset.ask; btn.classList.add("ask");
  btn._askT = setTimeout(() => chessAskEnd(btn), 3000);
}
function chessAskEnd(btn) { if (!btn.classList.contains("ask")) return; clearTimeout(btn._askT); btn.textContent = btn.dataset.label; btn.classList.remove("ask"); }
const CHESS_DRAW_WHY = { stalemate: "Stalemate: no legal move left.", "threefold repetition": "The same position, three times.", "fifty-move rule": "Fifty moves without a capture or a pawn move.", "insufficient material": "Not enough pieces left to checkmate." };
function chessOverText() {
  const o = cg.over, youWon = o.result !== "1/2-1/2" && (o.result === "1-0") === (cg.color === "w"), n = Math.ceil(cg.moves.length / 2);
  if (o.result === "1/2-1/2") return { title: "Draw", sub: CHESS_DRAW_WHY[o.reason] || "By " + o.reason + "." };
  if (o.reason === "resignation") return { title: "You resigned", sub: "Wind takes it." };
  return youWon ? { title: "You beat Wind!", sub: "Checkmate in " + n + " moves." } : { title: "Checkmate", sub: "Wind won in " + n + " moves." };
}
function chessEndCard() {
  const t = chessOverText(); delete cv.card.dataset.start;
  if (cv.card.dataset.end === String(cg.moves.length) && cv.card.querySelector(".bot")) { cv.card.hidden = false; return; }
  cv.card.dataset.end = String(cg.moves.length);
  cv.card.innerHTML = '<div class="cv-card-in"><div class="cv-card-face">' + botFaceHTML() + "</div><h2>" + esc(t.title) + "</h2><p>" + esc(t.sub) + '</p><button type="button" class="cv-go" id="cvAgain">Play again</button><button type="button" class="cv-link" id="cvSee">See the board</button></div>';
  cv.card.hidden = false; bot("card", { el: cv.card.querySelector(".bot") }); bot("refresh");
  $("cvAgain").onclick = () => chessStartCard();
  $("cvSee").onclick = () => { cv.card.hidden = true; };
}
function chessStartCard() {
  chessView(); chessStopAi(); chessSel = -1;
  if (!cg || cg.moves.length) chessNew(cg ? cg.color : "w");
  cv.card.dataset.start = "1"; delete cv.card.dataset.end;
  let pick = chessStore(CHESS_KEY + "-side") || "w";
  cv.card.innerHTML = '<div class="cv-card-in"><div class="cv-card-face">' + botFaceHTML() + '</div><h2>Beat Wind</h2><p>Wind calculates every move, and it talks trash the whole time.</p>' +
    '<div class="cv-side-pick" role="radiogroup" aria-label="Play as">' + [["w", "White"], ["r", "Random"], ["b", "Black"]].map(([v, l]) => '<button type="button" role="radio" data-v="' + v + '" aria-checked="' + (pick === v) + '"><span class="sw ' + v + '"></span>' + l + "</button>").join("") + "</div>" +
    '<button type="button" class="cv-go" id="cvStart">Start game</button></div>';
  cv.card.hidden = false; bot("card", { el: cv.card.querySelector(".bot"), mood: "smug" }); bot("menu");
  cv.card.querySelectorAll("[data-v]").forEach(b => b.onclick = () => { pick = b.dataset.v; cv.card.querySelectorAll("[data-v]").forEach(x => x.setAttribute("aria-checked", String(x === b))); });
  $("cvStart").onclick = () => {
    chessStore(CHESS_KEY + "-side", pick);
    const color = pick === "r" ? (Math.random() < .5 ? "w" : "b") : pick;
    chessNew(color); delete cv.card.dataset.start; cv.card.hidden = true; cv.flip = false;
    chessRender(true); chessSound("start"); bot("start", { color });
    if (!myTurn()) chessAiTurn();
  };
  chessRender(true);
}

// ---- moving
function chessCanMove(i) { const p = cg && cg.st.b[i]; return myTurn() && !chessBusy && p && Chess.colorOf(p) === cg.color; }
function chessPoint(e) { const r = cv.board.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * 8), y = Math.floor((e.clientY - r.top) / r.height * 8); return x < 0 || x > 7 || y < 0 || y > 7 ? -1 : chessSqAt(x, y); }
function chessDown(e) {
  if (chessSoundOn()) try { chessAudioCtx(); } catch (x) {}   // browsers only allow sound after a tap
  if (e.button !== 0 || !cg || chessPromo || e.target.closest(".cv-card, .cv-promo") || !cv.card.hidden) return;   // cards and the promotion picker take their own clicks
  const i = chessPoint(e); if (i < 0) return;
  if (chessCanMove(i)) { chessDrag = { from: i, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, el: pcs.get(i) }; try { cv.board.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); }
  else chessDrag = { from: -1, id: e.pointerId, target: i };
}
function chessMove(e) {
  const d = chessDrag; if (!d || d.from < 0 || e.pointerId !== d.id) return;
  if (!d.moved) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return; d.moved = true; chessSel = d.from; chessHighlights(); clearTimeout(d.el._slide); d.el.classList.remove("moving"); d.el.classList.add("drag"); d.r = cv.board.getBoundingClientRect(); }
  const r = d.r, s = r.width / 8;
  d.el.style.transform = "translate(" + (e.clientX - r.left - s / 2) + "px," + (e.clientY - r.top - s / 2) + "px) scale(1.12)";
}
function chessCancelDrag() { const d = chessDrag; chessDrag = null; if (d && d.el) { d.el.classList.remove("drag"); chessSlide(d.el, d.from, 160); } }
function chessUp(e) {
  const d = chessDrag; if (!d || e.pointerId !== d.id) return; chessDrag = null;
  const to = chessPoint(e);
  if (d.from >= 0 && d.moved) {   // a drag ends: drop on a legal square, or go back
    d.el.classList.remove("drag");
    if (to >= 0 && chessTry(d.from, to, true)) return;
    chessSlide(d.el, d.from, 160); chessSel = -1; chessHighlights(); return;
  }
  // a tap: pick up one of your pieces, move the picked-up piece there, or put it down
  const target = d.from >= 0 ? d.from : d.target;
  if (chessSel >= 0 && target !== chessSel && chessTry(chessSel, target, false)) return;
  chessSel = chessCanMove(target) && target !== chessSel ? target : -1; chessHighlights();
}
// keyboard play: the arrow keys move a cursor over the board as you see it, Enter or Space picks up a piece and puts it
// down (exactly like tapping), Escape lets go. A screen reader hears each square and what is on it.
let chessKb = -1;
function chessKey(e) {
  const k = e.key, arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (!cg || !cv.card.hidden || chessPromo || !(k in arrows || k === "Enter" || k === " " || k === "Escape")) return;
  e.preventDefault();
  if (chessKb < 0) chessKb = chessSel >= 0 ? chessSel : cg.color === "w" ? cg.st.kw : cg.st.kb;
  else if (arrows[k]) { const [x, y] = chessXY(chessKb), [dx, dy] = arrows[k]; chessKb = chessSqAt(Math.min(7, Math.max(0, x + dx)), Math.min(7, Math.max(0, y + dy))); }
  else if (k === "Escape") chessSel = -1;
  else if (chessSel >= 0 && chessKb !== chessSel && chessTry(chessSel, chessKb, false)) { if (chessPromo) { const b = cv.promo.querySelector("button"); if (b) b.focus(); } return; }
  else { if (chessSoundOn()) try { chessAudioCtx(); } catch (x) {} chessSel = chessCanMove(chessKb) && chessKb !== chessSel ? chessKb : -1; }
  chessHighlights(); chessKbSay();
}
function chessKbSay() {
  const i = chessKb, p = cg.st.b[i], mine = p && Chess.colorOf(p) === cg.color;
  let t = Chess.sqName(i) + ", " + (p ? (mine ? "your " : "Wind's ") + PIECE_NAMES[p.toLowerCase()] : "empty");
  if (i === chessSel) t += ", picked up";
  else if (chessSel >= 0 && Chess.legal(cg.st).some(m => m.from === chessSel && m.to === i)) t += ", you can move here";
  announce(t);
}
// try to play from -> to (asks for the piece when a pawn promotes); true if it was a legal move
function chessTry(from, to, dropped) {
  const ms = Chess.legal(cg.st).filter(m => m.from === from && m.to === to); if (!ms.length) return false;
  chessSel = -1;
  if (ms.length > 1) {   // promotion: pick the piece
    if (dropped) chessSlide(pcs.get(from), to, 0);
    const [x, y] = chessXY(to), white = cg.color === "w";
    chessPromo = { from, to, ms };
    cv.promo.innerHTML = '<div class="cv-promo-in" style="left:' + x * 12.5 + '%;' + (y > 3 ? "bottom:0" : "top:0") + '">' + ["q", "r", "b", "n"].map(t => '<button type="button" data-t="' + t + '" aria-label="' + PIECE_NAMES[t] + '" style="background-image:url(/chess/v2/' + (white ? "w" : "b") + t.toUpperCase() + '.svg)"></button>').join("") + "</div>";
    cv.promo.hidden = false;
    cv.promo.onkeydown = ev => { if (ev.key === "Escape") { ev.preventDefault(); cv.promo.onclick({ target: cv.promo }); } };   // Escape: no promotion, the pawn goes back
    cv.promo.onclick = ev => { const t = ev.target.closest("[data-t]"); const m = t ? ms.find(x => x.promo.toLowerCase() === t.dataset.t) : null, kb = cv.promo.contains(document.activeElement); cv.promo.hidden = true; if (kb) cv.board.focus(); chessPromo = null; if (m) chessPlay(m, true); else { chessSlide(pcs.get(from), from, dropped ? 160 : 0); chessHighlights(); } };
    return true;
  }
  chessPlay(ms[0], dropped);
  return true;
}
// play a move on the board (a glide, or at once when the piece was dropped there), then hand over to the other side.
// The sound comes as the piece lands, a captured piece goes as it is reached, and the side panel and the team's turn
// wait until the glide is over, so nothing competes with it.
function chessPlay(m, dropped) {
  const st = cg.st, moves = Chess.legal(st), san = Chess.san(st, m, moves), el = pcs.get(m.from), game = cg, mover = st.turn;
  const [fx, fy] = chessXY(m.from), [tx, ty] = chessXY(m.to), dist = Math.max(Math.abs(tx - fx), Math.abs(ty - fy));
  const dur = dropped ? 0 : Math.round(150 + 20 * dist), castle = m.flag === "K" || m.flag === "Q";
  const capSq = m.flag === "ep" ? m.to + (st.turn === "w" ? 8 : -8) : m.to, cap = m.x ? pcs.get(capSq) : null;
  if (cap) { pcs.delete(capSq); setTimeout(() => { cap.classList.add("gone"); setTimeout(() => cap.remove(), 180); }, Math.max(0, dur - 50)); }
  if (el) { pcs.delete(m.from); chessSlide(el, m.to, dur); pcs.set(m.to, el);
    if (m.promo) { el.dataset.p = m.promo; setTimeout(() => { el.style.backgroundImage = "url(/chess/v2/" + (m.promo === m.promo.toUpperCase() ? "w" : "b") + m.promo.toUpperCase() + ".svg)"; }, dur); } }
  if (castle) { const rf = m.flag === "K" ? m.to + 1 : m.to - 2, rt = m.flag === "K" ? m.to - 1 : m.to + 1, rk = pcs.get(rf); if (rk) { pcs.delete(rf); pcs.set(rt, rk); setTimeout(() => chessSlide(rk, rt, dropped ? 170 : dur), dropped ? 0 : 70); } }
  Chess.make(st, m); cg.moves.push(Chess.uci(m)); cg.sans.push(san); cg.seen.push(Chess.posKey(st));
  cg.over = Chess.outcome(st, cg.seen);
  chessSound(/\+|#/.test(san) ? "check" : castle ? "castle" : m.promo ? "promote" : m.x ? "capture" : "move", dur / 1000);
  if (cg.over) { chessScore(); chessSound(chessResult(), dur / 1000 + .32); }
  bot("move", { by: mover === cg.color ? "you" : "wind", cap: m.x || null, check: san.endsWith("+"), to: m.to });
  if (cg.over) bot("over", { result: chessResult(), reason: cg.over.reason });
  chessSave(); chessHighlights(); chessStatus();
  announce((st.turn === "w" ? "Black" : "White") + " played " + san);
  setTimeout(() => { if (game !== cg) return; if (!cg.over && !myTurn() && !chessBusy) chessAiTurn(); else chessRender(); }, dur + (castle && !dropped ? 90 : 20));   // the team's turn draws the panel itself
}
function chessResult() { const o = cg.over; return o.result === "1/2-1/2" ? "draw" : (o.result === "1-0") === (cg.color === "w") ? "win" : "lose"; }

// ---- Wind's move: Stockfish in a Web Worker, spoken to in UCI
// One search at a time. After each of its moves the engine looks ahead: for up to 3 s (SF_AHEAD_MS) it searches its
// answer to the reply it predicts, then rests, so it doesn't keep a core busy while you think. If you play that reply
// it answers at once (after at least the normal 1 s of search); otherwise it stops, and searches the real position.
const SF_PHONE = TOUCH.matches || (navigator.hardwareConcurrency || 8) <= 4, SF_SMALL = (navigator.deviceMemory || 8) <= 4;
const SF_URL = "/chess/engine/19.0.1/stockfish-19-lite-single.js", SF_MS = 1000, SF_AHEAD_MS = SF_PHONE ? 1500 : 3000;   // phones: a shorter look-ahead, so your taps and drags keep the CPU
let sf = null, chessTurnId = 0;
function sfStart() {
  if (sf) return sf;
  const me = sf = { w: null, dead: false, ready: false, job: null, info: null, ponder: null };
  me.readyP = new Promise(r => { me.onReady = r; });
  try { me.w = new Worker(SF_URL); } catch (e) { me.dead = true; me.onReady(); return me; }
  me.w.onmessage = e => { if (typeof e.data === "string" && sf === me) sfLine(e.data); };
  me.w.onerror = () => { me.dead = true; me.onReady(); const j = me.job; me.job = null; if (j) j.done(null); };
  for (const c of ["uci", "setoption name Hash value " + (SF_SMALL ? 16 : 32), "isready"]) sf.w.postMessage(c);
  return sf;
}
function sfLine(l) {
  if (l === "readyok") { sf.ready = true; sf.onReady(); }
  else if (l.startsWith("info ") && l.includes(" pv ")) {   // the deepest line so far: its score and the line it expects
    const mate = / score mate (-?\d+)/.exec(l), cp = / score cp (-?\d+)/.exec(l), pv = / pv (.+)$/.exec(l);
    sf.info = { mate: mate ? +mate[1] : null, cp: cp ? +cp[1] : null, pv: pv ? pv[1].split(" ") : [] };
  } else if (l.startsWith("bestmove")) {
    const [, best, , ponder] = l.split(" "), j = sf.job; sf.job = null;
    if (j) j.done(best && best !== "(none)" ? { best, ponder: ponder || (sf.info && sf.info.pv[1]) || null, info: sf.info } : null);
  }
}
// start a search: from `fen`, optionally after `moves`; "go" options in `go`. Resolves with the result (null if none).
function sfGo(fen, moves, go) {
  return new Promise(done => {
    if (!sf || sf.dead) return done(null);
    sf.job = { done }; sf.info = null;
    sf.w.postMessage("position fen " + fen + (moves ? " moves " + moves : ""));
    sf.w.postMessage("go " + go);
  });
}
// end any search in progress (its result is thrown away)
async function sfHalt() {
  if (!sf || sf.dead || !sf.job) { if (sf) sf.ponder = null; return; }
  const j = sf.job, waited = new Promise(r => { const d = j.done; j.done = x => { d(x); r(); }; });
  sf.ponder = null; sf.w.postMessage("stop"); await waited;
}
function chessStopAi() { chessTurnId++; chessBusy = false; sfHalt(); }
async function chessAiTurn() {
  if (!cg || cg.over || myTurn() || chessBusy) return;
  const game = cg, id = ++chessTurnId, fen = Chess.fen(game.st), t0 = performance.now();
  chessBusy = true; chessRender(); bot("think");
  const eng = sfStart();
  if (!eng.ready) await Promise.race([eng.readyP, new Promise(z => setTimeout(z, 12000))]);   // first move: let it load
  let r = null, job = null;
  if (eng.ready && !eng.dead) {
    if (eng.ponder && eng.ponder.fen === fen) {   // you played the reply it predicted: it has been working on its answer
      const pz = eng.ponder; eng.ponder = null; job = pz.result;
      if (!pz.done) { const left = SF_MS - (performance.now() - pz.t); if (left > 0) await new Promise(z => setTimeout(z, left)); if (!pz.done && sf === eng) eng.w.postMessage("stop"); }
    }
    else { await sfHalt(); job = sfGo(fen, "", "movetime " + SF_MS); }
    r = await Promise.race([job, new Promise(z => setTimeout(() => z("slow"), SF_MS + 4000))]);
    if (r === "slow") { if (sf === eng) { eng.w.terminate(); sf = null; } r = null; }   // a stuck engine is replaced next turn
  }
  if (id !== chessTurnId || game !== cg || cg.over || !chessOn) return;
  if (r && r.info) bot("eval", { cp: r.info.cp, mate: r.info.mate });   // Stockfish's verdict, from Wind's side
  const st = Chess.parse(fen), moves = Chess.legal(st);
  let m = r && moves.find(x => Chess.uci(x) === r.best);
  if (!m) m = Chess.analyse(fen, { ms: WIDE.matches ? 900 : 600 }).best.m;   // the engine couldn't run: the small one moves
  const wait = 260 - (performance.now() - t0); if (wait > 0) await new Promise(z => setTimeout(z, wait));   // never instant
  if (id !== chessTurnId || game !== cg || cg.over || !chessOn) return;
  chessBusy = false;
  chessPlay(m, false);
  // look ahead: work on the answer to the reply it expects, for a bounded time, while you think
  const reply = r && r.ponder, after = Chess.fen(cg.st), ms2 = Chess.legal(cg.st);
  if (reply && !cg.over && sf && !sf.dead && ms2.some(x => Chess.uci(x) === reply)) {
    const s2 = Chess.parse(after); Chess.make(s2, ms2.find(x => Chess.uci(x) === reply));
    const pz = { fen: Chess.fen(s2), t: performance.now(), done: false, result: sfGo(after, reply, "movetime " + SF_AHEAD_MS) };
    pz.result.then(() => { pz.done = true; }); sf.ponder = pz;
  }
}

// ---- sound: wood on wood, modelled from scratch (no files). A move is a felt-and-wood "thock": a soft click, the
// piece's own ring and the board's low body, each dying away at its own rate. A capture is a sharper clack of piece on
// piece, then the thock. Castling knocks twice, check adds a quiet marimba note, and the start and the end of a game
// are short marimba phrases. Each sound is computed once, in a few variants so repeated moves don't sound mechanical:
// the first time it is needed, and the common ones ahead of time in idle moments, so no game start waits for them.
let chessAudio = null, chessRecipes = null;
const chessBufs = {};
function chessAudioCtx() {
  if (!chessAudio) {
    const A = new (window.AudioContext || window.webkitAudioContext)(), comp = A.createDynamicsCompressor(), out = A.createGain();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = .002; comp.release.value = .12;
    out.gain.value = .9; comp.connect(out).connect(A.destination); chessAudio = { A, out: comp };
    chessWarmSounds(A);
  }
  if (chessAudio.A.state === "suspended") chessAudio.A.resume().catch(() => {});
  return chessAudio;
}
function chessBuf(A, kind) {   // the variants of one sound, computed when first needed
  chessRecipes = chessRecipes || chessMakeSounds(A);
  if (!chessBufs[kind] && chessRecipes[kind]) chessBufs[kind] = chessRecipes[kind]();
  return chessBufs[kind];
}
function chessWarmSounds(A) {   // the rest, one per idle moment
  const todo = ["move", "capture", "check", "castle", "chat", "promote", "win", "lose", "draw"], idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 2000 }) : f => setTimeout(f, 80);
  const next = () => { const k = todo.shift(); if (!k) return; try { chessBuf(A, k); } catch (e) {} idle(next); };
  idle(next);
}
function chessMakeSounds(A) {   // how to make each sound (nothing is computed until one is asked for)
  const sr = A.sampleRate;
  const buf = (dur, fill) => { const n = Math.ceil(sr * dur), b = A.createBuffer(1, n, sr), d = b.getChannelData(0); fill(d);
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
    // a 0.3 ms attack (no digital click), and a gentle fade over the last 120 ms so nothing is cut off
    const k = pk ? .9 / pk : 0, rise = Math.floor(sr * .0003), fade = Math.min(Math.floor(sr * .12), n >> 2);
    for (let i = 0; i < n; i++) { const r = Math.min(1, i / rise), f = i > n - fade ? .5 - .5 * Math.cos(Math.PI * (n - i) / fade) : 1; d[i] *= k * r * f; }
    return b; };
  // decaying sine modes [frequency, amplitude, time constant in seconds], starting at time `at`
  // (a damped resonator: each sample from the two before it, the same signal as a * dec^n * sin(w n) without a sine per sample)
  const modes = (d, at, list, pitch = 1) => { const s0 = Math.floor(at * sr);
    for (const [f, a, tau] of list) {
      const w = 2 * Math.PI * f * pitch / sr, dec = Math.exp(-1 / (tau * sr)), c = 2 * dec * Math.cos(w), d2 = dec * dec;
      const n = Math.min(d.length - s0, Math.ceil(Math.log(1e-4 / a) / Math.log(dec)));   // until it has died away
      let y1 = 0, y2 = a * dec * Math.sin(w);   // samples 0 and 1
      if (n > 1) d[s0 + 1] += y2;
      for (let i = 2; i < n; i++) { const y = c * y2 - d2 * y1; d[s0 + i] += y; y1 = y2; y2 = y; }
    } };
  // a very short burst of bright noise: the contact itself
  let seed = 22695477;
  const click = (d, at, a, tau) => { const s0 = Math.floor(at * sr), dec = Math.exp(-1 / (tau * sr)); let e = a, prev = 0;
    for (let i = s0; i < d.length && e > 1e-4; i++) { seed = (seed * 1103515245 + 12345) >>> 0; const r = seed / 2147483648 - 1; d[i] += e * (r - .85 * prev); prev = r; e *= dec; } };
  const thock = (d, at, p = 1, v = 1) => {
    click(d, at, .22 * v, .0011);
    modes(d, at, [[1060, .42 * v, .015], [2290, .2 * v, .0085], [3680, .1 * v, .005], [5150, .04 * v, .003]], p);   // the piece
    modes(d, at + .0006, [[198, .6 * v, .034], [415, .3 * v, .021], [672, .13 * v, .013]], p * .985); };                 // the board
  const clack = (d, at, p = 1) => { click(d, at, .26, .0012); modes(d, at, [[1720, .46, .011], [3120, .26, .0062], [4780, .12, .0038], [6950, .04, .0024]], p); };
  const bar = (d, at, f, v = 1, len = 1) => { click(d, at, .025 * v, .0008); modes(d, at, [[f, .5 * v, .2 * len], [f * 3.93, .11 * v, .05 * len], [f * 9.2, .035 * v, .016 * len]]); };   // a marimba bar
  const vary = (n, make) => Array.from({ length: n }, (_, k) => make(1 + (k - (n - 1) / 2) * .028));
  return {
    move: () => vary(3, p => buf(.26, d => thock(d, 0, p))),
    capture: () => vary(3, p => buf(.34, d => { clack(d, 0, p); thock(d, .042, p * .96, 1.1); })),
    castle: () => vary(2, p => buf(.42, d => { thock(d, 0, p); thock(d, .11, p * .93, .85); })),
    check: () => vary(2, p => buf(.85, d => { thock(d, 0, p); bar(d, .035, 1318.5, .55, .8); })),
    promote: () => vary(2, p => buf(.95, d => { thock(d, 0, p); bar(d, .05, 1046.5, .45, .7); bar(d, .14, 1568, .5, .8); })),
    start: () => [buf(1.1, d => { bar(d, 0, 523.25, .7); bar(d, .1, 783.99, .8); })],
    win: () => [buf(1.65, d => { bar(d, 0, 523.25, .7); bar(d, .09, 659.25, .7); bar(d, .18, 783.99, .75); bar(d, .3, 1046.5, .9, 1.4); })],
    lose: () => [buf(1.75, d => { bar(d, 0, 392, .75); bar(d, .13, 311.13, .7); bar(d, .28, 261.63, .8, 1.5); })],
    draw: () => [buf(1.35, d => { bar(d, 0, 523.25, .7); bar(d, .14, 392, .75, 1.2); })],
    chat: () => [buf(.6, d => { bar(d, 0, 1567.98, .55, .45); bar(d, .075, 2093, .45, .4); })],
  };
}
const CHESS_VOL = { move: .5, capture: .62, castle: .5, check: .58, promote: .55, start: .3, win: .36, lose: .32, draw: .32, chat: .16 };
function chessSound(kind, delay = 0) {
  if (!chessSoundOn()) return;
  try {
    const { A, out } = chessAudioCtx(), list = chessBuf(A, kind); if (!list) return;
    const src = A.createBufferSource(), g = A.createGain();
    src.buffer = list[Math.floor(Math.random() * list.length)]; g.gain.value = CHESS_VOL[kind];
    src.connect(g).connect(out); src.start(A.currentTime + Math.max(0, delay));
  } catch (e) {}
}

// ---- opening and closing the chess view
function openChess() {
  showTab("games", true);
  chessView(); cancelEdit(); if (speaking) stopSpeaking();
  chessOn = true; $("main").classList.add("chess-mode"); $("chessBtn").classList.add("active"); syncTabbar();
  try { if (location.hash !== "#chess") history.replaceState(null, "", location.pathname + location.search + "#chess"); } catch (e) {}
  document.title = "Chess · Wind";
  closeMobile(); sfStart(); chessGlow(true);   // the engine loads while you choose a side
  // the sound system starts in an idle moment if the page already had a tap (browsers allow it then), so the first
  // move or "Start game" doesn't wait for it; otherwise it starts on the first tap on the board
  const ua = navigator.userActivation;
  if (chessSoundOn() && !chessAudio && ua && ua.hasBeenActive) (window.requestIdleCallback || (f => setTimeout(f, 200)))(() => { try { if (chessOn && !chessAudio) chessAudioCtx(); } catch (e) {} });
  if (!cg) cg = chessLoad();
  if (!cg) { chessNew("w"); chessStartCard(); }
  else { chessRender(true); if (!cg.over && !myTurn()) chessAiTurn(); }
  bot("open");
}
function closeChess() {
  if (!chessOn) return;
  chessOn = false; chessStopAi(); chessCancelDrag(); chessSel = -1; bot("close"); chessGlow(false);
  $("main").classList.remove("chess-mode"); $("chessBtn").classList.remove("active");
  syncTitle(); syncTabbar();
}
$("chessBtn").onclick = () => chessOn ? closeMobile() : openChess();


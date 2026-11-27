// ============================================================================
// Wind's bot: a face and a voice for the chess page. Neither touches the game: Stockfish (chess-ui.js) plays every move,
// and the page only tells the bot what happened, through bot(type, data), which never throws.
// - The face is an original robot in the spirit of a simple-shapes, expressive-eyes agent avatar: a dark rounded head,
//   two glowing rounded-square eyes shaped by animated clip-paths, an antenna and a few accessories (sunglasses, sweat,
//   an anger mark, "!", zzz, sparkles). It lives on its own (blinks, glances, follows your pieces and pointer, scans
//   while Stockfish thinks) and reacts at once to captures, checks and the engine's verdict on your moves. On notable
//   moments a fast NVIDIA model reads the board and picks its expression (/api/chess/face).
// - The voice is NVIDIA too (/api/chess/talk): now and then it reads the board and trash-talks you in the chat, and it
//   answers whatever you type there, sarcastically. If a model is busy or down, the face keeps its own reaction and
//   the chat uses a short built-in line.
// ============================================================================
const BOT_CHAT_KEY = "wind-chess-chat";
// how each expression shapes the eyes: [top-left, top-right, bottom-right, bottom 80%, bottom middle, bottom-left],
// each the % of the eye hidden from that edge (a polygon clip, so every expression morphs smoothly into the next);
// s: eye scales, tilt: head turn in degrees, pose: where the eyes sit (% of the face)
const BOT_LOOKS = {
  calm: { l: [0, 0, 0, 0, 0, 0], r: [0, 0, 0, 0, 0, 0] },
  curious: { l: [10, 10, 0, 0, 0, 0], r: [0, 0, 0, 0, 0, 0], s: [.9, 1.12], tilt: 7, pose: [3, -3] },
  think: { l: [26, 20, 0, 0, 0, 0], r: [20, 26, 0, 0, 0, 0], s: [.95, .95], tilt: -4, pose: [9, -10] },
  smug: { l: [42, 36, 8, 8, 8, 8], r: [34, 38, 8, 8, 8, 8], s: [1.04, 1.04], tilt: -6, pose: [-6, 4] },
  happy: { l: [0, 0, 0, 30, 56, 0], r: [0, 0, 0, 30, 56, 0], s: [1.05, 1.05], pose: [0, -6] },
  laugh: { l: [0, 0, 0, 34, 60, 0], r: [0, 0, 0, 34, 60, 0], s: [1.08, 1.08], pose: [0, -8] },
  surprised: { l: [0, 0, 0, 0, 0, 0], r: [0, 0, 0, 0, 0, 0], s: [1.2, 1.2], pose: [0, -4] },
  annoyed: { l: [6, 46, 6, 6, 6, 6], r: [46, 6, 6, 6, 6, 6], pose: [0, 3] },
  worried: { l: [40, 8, 0, 0, 0, 0], r: [8, 40, 0, 0, 0, 0], s: [.94, .94], tilt: 4, pose: [0, 8] },
  bored: { l: [56, 56, 8, 8, 8, 8], r: [56, 56, 8, 8, 8, 8], pose: [-10, 6] },
  cool: { l: [50, 50, 50, 50, 50, 50], r: [50, 50, 50, 50, 50, 50], tilt: -5 },   // eyes hidden behind the sunglasses
  wink: { l: [0, 0, 0, 22, 40, 0], r: [44, 44, 44, 44, 44, 44], tilt: 7, pose: [0, -2] },
  dizzy: { l: [0, 0, 0, 0, 0, 0], r: [0, 0, 0, 0, 0, 0] },   // X eyes, drawn in CSS
  evil: { l: [4, 40, 2, 20, 32, 6], r: [40, 4, 6, 20, 32, 2], s: [1.06, 1.06], tilt: -4, pose: [0, -12] },   // the evil laugh: slanted tops, smiling bottoms, plus a grin, horns and "ha"s
};
const botPoly = v => "polygon(0% " + v[0] + "%,100% " + v[1] + "%,100% " + (100 - v[2]) + "%,80% " + (100 - v[3]) + "%,50% " + (100 - v[4]) + "%,20% " + (100 - v[3]) + "%,0% " + (100 - v[5]) + "%)";
function botFaceHTML() {
  const star = '<svg viewBox="0 0 20 20"><path d="M10 0c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z"/></svg>';
  return '<span class="bot" data-mood="calm" aria-hidden="true"><span class="bot-float"><span class="bot-fx"><span class="bot-head">' +
    '<i class="bot-ant"><b></b></i>' +
    '<span class="bot-screen"><span class="bot-gaze"><span class="bot-pose"><span class="bot-blink"><span class="bot-eye l"></span><span class="bot-eye r"></span></span></span></span>' +
    '<i class="bot-blush l"></i><i class="bot-blush r"></i>' +
    '<i class="bot-mouth"><svg viewBox="0 0 40 18"><path d="M3 3.5Q20 7 37 3.5 34.5 16.5 20 17 5.5 16.5 3 3.5z" fill="#ff5c8a"/><path d="M24.6 4.9 29.4 4.6 27.4 10.4z" fill="#fff"/></svg></i></span>' +
    '<i class="bot-acc glasses"><svg viewBox="0 0 100 30"><path d="M2 5h96v6c0 9-7 17-16 17H66c-8 0-13-6-15-12h-2c-2 6-7 12-15 12H18C9 28 2 20 2 11z" fill="#05050a"/><path d="M12 9h14M70 9h14" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/></svg></i>' +
    '<i class="bot-acc mark"><svg viewBox="0 0 12 30"><rect x="2" y="0" width="8" height="19" rx="4" fill="#ffd34d"/><circle cx="6" cy="26" r="4" fill="#ffd34d"/></svg></i>' +
    '<i class="bot-acc vein"><svg viewBox="0 0 24 24" fill="none" stroke="#ff5a5a" stroke-width="3.2" stroke-linecap="round"><path d="M9 3c0 4-2 6-6 6M15 3c0 4 2 6 6 6M9 21c0-4-2-6-6-6M15 21c0-4 2-6 6-6"/></svg></i>' +
    '<i class="bot-acc sweat"><svg viewBox="0 0 12 18"><path d="M6 0C4 5 0 8 0 12a6 6 0 0 0 12 0c0-4-4-7-6-12z" fill="#7cd3ff"/></svg></i>' +
    '<i class="bot-acc zzz"><b>z</b><b>z</b></i>' +
    '<i class="bot-acc horn l"><svg viewBox="0 0 20 26"><defs><linearGradient id="bh" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#c2185b"/><stop offset="1" stop-color="#ff5c8a"/></linearGradient></defs><path d="M3 26C3 15 9 6 18 1c-3 8-3 16 0 25z" fill="url(#bh) #ff3d6e"/></svg></i><i class="bot-acc horn r"><svg viewBox="0 0 20 26"><path d="M3 26C3 15 9 6 18 1c-3 8-3 16 0 25z" fill="url(#bh) #ff3d6e"/></svg></i>' +
    '<i class="bot-acc ha"><b>ha</b><b>ha</b><b>ha</b></i>' +
    '<i class="bot-acc spark a">' + star + '</i><i class="bot-acc spark b">' + star + "</i>" +
    "</span></span></span></span>";
}
// one face on the page (the one in Wind's bar, and the big one on the start and end cards)
class BotFace {
  constructor(root) {
    const q = s => root.querySelector(s);
    this.root = root; this.gazeEl = q(".bot-gaze"); this.poseEl = q(".bot-pose"); this.headEl = q(".bot-head"); this.fxEl = q(".bot-fx");
    this.eyes = [q(".bot-eye.l"), q(".bot-eye.r")];
    this.gx = 0; this.gy = 0; this.tx = 0; this.ty = 0; this.raf = 0; this.hold = 0; this.mood = ""; this.alive = true;
    this.set("calm"); this.life();
  }
  set(mood) {
    if (!BOT_LOOKS[mood] || mood === this.mood) return;
    const L = BOT_LOOKS[mood]; this.mood = mood; this.root.dataset.mood = mood;
    this.eyes.forEach((e, k) => { e.style.clipPath = botPoly(k ? L.r : L.l); e.style.transform = "scale(" + (L.s || [1, 1])[k] + ")"; });
    this.headEl.style.transform = "rotate(" + (L.tilt || 0) + "deg)";
    this.poseEl.style.transform = "translate(" + (L.pose ? L.pose[0] : 0) + "%," + (L.pose ? L.pose[1] : 0) + "%)";
  }
  // look in a direction (x, y from -1 to 1) for `ms`, with a soft follow
  look(x, y, ms) {
    this.tx = Math.max(-1, Math.min(1, x)); this.ty = Math.max(-1, Math.min(1, y)); this.hold = performance.now() + (ms || 1500);
    if (this.off()) { this.gx = this.tx; this.gy = this.ty; return; }   // nobody sees it: no need to animate
    if (!this.raf) this.raf = requestAnimationFrame(() => this.step());
  }
  off() { return this.root.classList.contains("off"); }
  lookAt(px, py, ms) {   // look at a point on the screen
    const r = this.root.getBoundingClientRect(); if (!r.width) return;
    const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2), d = Math.hypot(dx, dy);
    if (d < 4) return this.look(0, 0, ms);
    const k = Math.min(1, d / 220); this.look(dx / d * k, dy / d * k, ms);
  }
  step() {
    this.gx += (this.tx - this.gx) * .2; this.gy += (this.ty - this.gy) * .2;
    this.gazeEl.style.transform = "translate(" + (this.gx * 12).toFixed(2) + "%," + (this.gy * 11).toFixed(2) + "%)";
    this.raf = Math.abs(this.tx - this.gx) + Math.abs(this.ty - this.gy) > .004 ? requestAnimationFrame(() => this.step()) : 0;
  }
  play(fx, ms) {   // a one-off move: bounce, jump, shake, nod, pop
    const el = this.fxEl; el.className = "bot-fx"; void el.offsetWidth; el.classList.add("fx-" + fx);
    clearTimeout(this.fxT); this.fxT = setTimeout(() => { el.className = "bot-fx"; }, ms || 650);
  }
  flag(cls, ms) { this.root.classList.add(cls); clearTimeout(this["t" + cls]); this["t" + cls] = setTimeout(() => this.root.classList.remove(cls), ms); }
  blink() { this.flag("blink", 120); }
  // its own life: blinks every few seconds (sometimes twice), and glances around when nothing holds its look
  life() {
    const blink = () => { if (!this.ok()) return; if (!this.off()) { this.blink(); if (Math.random() < .22) setTimeout(() => this.blink(), 240); } this.bT = setTimeout(blink, 2200 + Math.random() * 3800); };
    const glance = () => {
      if (!this.ok()) return;
      if (!this.off() && performance.now() > this.hold) { if (Math.random() < .45) this.look(0, .3, 1300); else this.look((Math.random() * 2 - 1) * .85, (Math.random() * 2 - 1) * .55, 1400); }
      this.gT = setTimeout(glance, 1700 + Math.random() * 3000);
    };
    this.bT = setTimeout(blink, 900 + Math.random() * 1800); this.gT = setTimeout(glance, 1400);
  }
  ok() { if (this.alive && this.root.isConnected) return true; this.stop(); return false; }
  stop() { this.alive = false; clearTimeout(this.bT); clearTimeout(this.gT); clearTimeout(this.fxT); cancelAnimationFrame(this.raf); }
}

// ---- the bot's state: what it shows, what it knows about the game, the chat
const wb = { face: null, card: null, held: "", hold: 0, over: false, overMood: "cool", thinking: false, ev: null, epoch: 0,
  faceAt: -1e9, faceBusy: false, talkAt: -1e9, talkBusy: false, replyQ: false, pend: null, chat: [], chips: 0 };
function bot(type, d) { try { botOn(type, d || {}); } catch (e) { try { console.warn("bot:", e); } catch (x) {} } }   // never breaks the game
function botOn(type, d) {
  if (type === "mount") return botMount();
  if (!wb.face) return;
  if (type === "open") {
    requestAnimationFrame(botAria);   // the chess view is on screen now, so its width is real
    wb.thinking = !!chessBusy; wb.over = !!(cg && cg.over);
    if (wb.over) { const r = chessResult(); wb.overMood = r === "win" ? "dizzy" : r === "draw" ? "curious" : "evil"; }
    botRenderChat(); botApply(); botIdleArm();
  }
  else if (type === "close") { clearTimeout(wb.idleT); wb.thinking = false; botScan(false); }
  else if (type === "refresh") botApply();
  else if (type === "card") botCard(d.el, d.mood);
  else if (type === "menu") { wb.over = false; wb.thinking = false; wb.settled = null; botReset(); botHold("smug", 3000); }   // New game / Play again: a fresh chat
  else if (type === "start") {
    wb.over = false; wb.thinking = false; wb.ev = null; wb.evPrev = null; wb.settled = null;
    botReflex("smug", "bounce", 560); botTrigger("start", 9); botIdleArm();
  }
  else if (type === "think") { wb.thinking = true; botScan(true); botApply(); }
  else if (type === "eval") botEval(d);
  else if (type === "move") botMove(d);
  else if (type === "over") botOver(d);
}
function botFaces() { return [wb.face, wb.card].filter(f => f && f.ok()); }
function botFx(fx, ms) { for (const f of botFaces()) f.play(fx, ms); }
// what the face shows: a reaction (held for a while), else the end of the game, else thinking, else the mood NVIDIA
// settled on (while the game still stands as it did then), else a simple one from how the game goes
function botApply() {
  const now = performance.now();
  const m = now < wb.hold ? wb.held : wb.over ? wb.overMood : wb.thinking ? "think" : botRest();
  wb.shown = m; for (const f of botFaces()) f.set(m);
  clearTimeout(wb.applyT); if (now < wb.hold) wb.applyT = setTimeout(botApply, wb.hold - now + 30);
}
function botHold(m, ms) { if (!BOT_LOOKS[m]) return; wb.held = m; wb.hold = performance.now() + ms; botApply(); }
function botRest() { if (wb.settled && wb.settledBand === botBand()) return wb.settled; wb.settled = null; return botBase(); }
function botBand() { const s = botScore(wb.ev); return s == null ? 0 : s >= 300 ? 1 : s <= -200 ? -1 : 0; }
// the moment's motion plays at once; its expression is NVIDIA's pick when the answer comes. The reflex (a simple
// expression for the moment) shows only if NVIDIA isn't asked (too soon after the last time) or doesn't answer.
function botReflex(mood, fx, ms) { if (fx) botFx(fx, ms || 520); wb.reflex = { mood, at: performance.now() }; }
function botReflexShow() { const r = wb.reflex; wb.reflex = null; if (r && performance.now() - r.at < 6000) botHold(r.mood, 2200); }
function botBase() {   // between reactions: smug when Wind is clearly winning, worried when it is losing, else calm
  const e = wb.ev; if (!e) return "calm";
  if (e.mate != null) return e.mate > 0 ? "smug" : "worried";
  return e.cp >= 300 ? "smug" : e.cp <= -200 ? "worried" : "calm";
}
const botScore = e => !e ? null : e.mate != null ? (e.mate > 0 ? 10000 - e.mate * 10 : -10000 - e.mate * 10) : e.cp;
// Stockfish's verdict, from Wind's side, after each of your moves: a big jump means you blundered
function botEval(d) {
  const e = { cp: Number.isFinite(d.cp) ? Math.round(d.cp) : null, mate: Number.isFinite(d.mate) ? Math.round(d.mate) : null };
  if (e.cp == null && e.mate == null) return;
  const before = wb.ev, now = botScore(e), prev = botScore(before); wb.ev = e; wb.evPrev = before;
  if (prev == null || wb.over) return;
  if ((now - prev >= 150 && now >= 120) || (e.mate > 0 && !(before.mate > 0))) { botReflex("laugh", "shake", 600); botTrigger("blunder", 8); }
  else if (now - prev <= -130) { botReflex("surprised", "jump", 500); botTrigger("good", 6); }
}
function botMove(d) {
  const you = d.by === "you";
  wb.thinking = false; botScan(false);
  if (Number.isInteger(d.to)) setTimeout(() => botLookSquare(d.to, 1300), you ? 0 : 120);
  if (you) {
    clearTimeout(wb.idleT);
    if (d.cap) { botReflex("surprised", "jump", 500); botTrigger("you-capture", /q/i.test(d.cap) ? 7 : 5); }
    else if (d.check) { botReflex("surprised", "jump", 500); botTrigger("you-check", 6); }
    else { botApply(); botTrigger("you-move", 1); }
  } else {
    botFx("bounce", 560);
    if (d.cap) { botReflex("happy"); botTrigger("wind-capture", /[qr]/i.test(d.cap) ? 7 : 4); }
    else if (d.check) { botReflex("wink"); botTrigger("wind-check", 5); }
    else { botApply(); botTrigger("wind-move", 1); }
    botIdleArm();
  }
}
function botOver(d) {   // d.result is yours: win (Wind lost), lose (Wind won), draw
  const ev = d.result === "draw" ? "draw" : d.result === "win" ? "lose" : d.reason === "resignation" ? "resign" : "win";
  wb.over = true; wb.thinking = false; botScan(false); clearTimeout(wb.idleT);
  wb.overMood = { lose: "dizzy", draw: "curious", resign: "evil", win: "evil" }[ev];   // a win: the evil laugh (a test)
  wb.hold = 0; botApply(); botFx(ev === "lose" ? "jump" : ev === "draw" ? "nod" : "shake", 600);
  botTrigger(ev, 10);
}
// a nudge when you have been thinking for a while
function botIdleArm() {
  clearTimeout(wb.idleT);
  wb.idleT = setTimeout(() => { if (!chessOn || !cg || cg.over || !myTurn() || chessBusy) return; botReflex("bored"); botTrigger("idle", 3); }, 26000);
}
// while Stockfish thinks, the eyes scan the board
function botScan(on) {
  clearInterval(wb.scanT); if (!on || !wb.face) return;
  let k = 0; const go = () => { if (wb.face) wb.face.look(k++ % 2 ? -.15 : .55, -.55, 700); };
  go(); wb.scanT = setInterval(go, 480);
}
function botLookSquare(sq, ms) {
  if (!cv || !wb.face) return;
  const r = cv.board.getBoundingClientRect(), [x, y] = chessXY(sq);
  for (const f of botFaces()) f.lookAt(r.left + (x + .5) * r.width / 8, r.top + (y + .5) * r.height / 8, ms);
}
// the big face on the start and end cards
function botCard(el, mood) {
  if (wb.card) { wb.card.stop(); if (botIO) botIO.unobserve(wb.card.root); } wb.card = null; if (!el) return;
  wb.card = new BotFace(el); if (mood) wb.card.set(mood); wb.card.play("pop", 520); botWatch(el);
}

// ---- talking to the models: notable moments are gathered for a moment, and the biggest one is sent
function botTrigger(ev, prio) {
  if (!wb.pend || prio >= wb.pend.prio) wb.pend = { ev, prio };
  // after your move, wait for Stockfish's verdict (about a second): a capture may turn out to be a blunder
  clearTimeout(wb.pendT); wb.pendT = setTimeout(botFlush, ev === "start" ? 900 : ev.startsWith("you-") ? 1700 : 450);
}
function botFlush() {
  const p = wb.pend; wb.pend = null; if (!p || !cg) return;
  if (p.ev === "win" || p.ev === "resign") wb.reflex = null;   // after a win the face keeps its evil laugh
  else if (!botAskFace(p.ev)) botReflexShow();
  const since = performance.now() - wb.talkAt;
  if (p.prio >= 2 && (p.prio >= 10 || (p.prio >= 8 && since > 4000) || since > 14000)) botAskTalk(p.ev);   // big moments always get a line; others now and then (never a plain move)
}
function botBody(ev) {
  return { fen: Chess.fen(cg.st), side: cg.color === "w" ? "black" : "white", history: cg.sans.slice(-400), event: ev,
    eval: wb.ev, before: wb.evPrev || null, face: wb.shown || "calm", chat: wb.chat.filter(m => m.who !== "sys").slice(-10).map(m => ({ who: m.who, text: m.text })) };
}
async function botPost(path, body, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal }); return r.ok ? await r.json() : null; }
  catch (e) { return null; } finally { clearTimeout(t); }
}
// the face (NVIDIA): reads the moment and picks the expression for it, and the mood that lasts until the next one.
// At most one ask every 4.5 s (2 s for chat, 9 s for a plain move); false when it isn't asked
const BOT_LASTING = ["calm", "curious", "smug", "worried", "cool", "bored"];
function botAskFace(ev) {
  const now = performance.now(), gap = ev === "chat" ? 2000 : ev === "you-move" || ev === "wind-move" ? 9000 : 4500;
  if (!cg || wb.faceBusy || now - wb.faceAt < gap) return false;
  wb.faceBusy = true; wb.faceAt = now; botFaceAnswer(ev, now, cg); return true;
}
async function botFaceAnswer(ev, t0, game) {
  try {
    const r = await botPost("/api/chess/face", botBody(ev), 6000);
    if (!r || game !== cg || performance.now() - t0 > 6500) { botReflexShow(); return; }
    const now = BOT_LOOKS[r.mood] ? r.mood : null, then = BOT_LOOKS[r.then] ? r.then : null;
    wb.reflex = null;
    if (then && !wb.over) { wb.settled = then; wb.settledBand = botBand(); }
    if (!now) { botApply(); return; }
    if (wb.over && ["win", "lose", "draw", "resign"].includes(ev)) wb.overMood = now;
    botHold(now, BOT_LASTING.includes(now) ? 3500 : 5000);
    if (now === "laugh") botFx("shake", 600); else if (now === "surprised") botFx("jump", 500); else if (now === "happy" || now === "cool") botFx("bounce", 560);
  } finally { wb.faceBusy = false; }
}
// the voice (NVIDIA): a line about the game, or an answer to what you wrote
async function botAskTalk(ev) {
  if (!cg) return;
  if (wb.talkBusy) { if (ev === "chat") wb.replyQ = true; else if (["win", "lose", "draw", "resign"].includes(ev)) wb.overQ = ev; return; }
  wb.talkBusy = true; wb.talkAt = performance.now(); const game = cg, t0 = performance.now(), epoch = wb.epoch;
  botTyping(true);
  const r = await botPost("/api/chess/talk", botBody(ev), 12000);
  const text = (r && typeof r.text === "string" && r.text.trim()) || botCanned(ev);
  const wait = 650 - (performance.now() - t0); if (wait > 0) await new Promise(z => setTimeout(z, wait));   // a moment of "typing"
  if (epoch !== wb.epoch) return;   // the chat was cleared for a new game meanwhile: this line belonged to the old one
  botTyping(false); wb.talkBusy = false;
  if (text && (game === cg || ev === "chat")) botSay(text);
  if (wb.overQ) { const q = wb.overQ; wb.overQ = null; botAskTalk(q); }
  else if (wb.replyQ) { wb.replyQ = false; botAskTalk("chat"); }
}
// lines for when the voice can't be reached
const BOT_LINES = {
  start: ["Bold of you to show up.", "Let's make this quick.", "I've already seen how this ends."],
  blunder: ["Oh, a gift. You shouldn't have.", "Did your mouse slip?", "I'll pretend I didn't see that. No, I won't."],
  "wind-capture": ["Mine now.", "Thanks, I'll take that.", "One less thing for you to worry about."],
  "you-capture": ["Enjoy it. It won't last.", "Cute. Keep it as a souvenir.", "That was bait. Probably."],
  "wind-check": ["Knock knock.", "Your king looks nervous.", "Check. Get used to hearing it."],
  "you-check": ["A check? Adorable.", "Nice try. Next.", "Ooh, scary."],
  good: ["Hm. Not bad, for a human.", "Okay, that one was decent."],
  idle: ["Take your time. I'm only calculating millions of moves.", "Still there?", "Thinking hard won't save you."],
  win: ["Checkmate. Don't take it personally.", "That's game. Want another lesson?"],
  lose: ["Impossible. I demand a rematch.", "I let you win. Obviously."],
  draw: ["A draw. I'll allow it, this time.", "Fine. Call it even. For now."],
  resign: ["Smart choice.", "Giving up already? Understandable."],
  chat: ["Talk is cheap. Make a move.", "I'd answer, but I'm busy winning.", "Bold words for someone in your position."],
  "you-move": ["Interesting. Wrong, but interesting."], "wind-move": ["Your move. Try to keep up."],
};
function botCanned(ev) { const a = BOT_LINES[ev] || BOT_LINES.chat; return a[Math.floor(Math.random() * a.length)]; }

// ---- the chat
function botLoadChat() { const d = chessStore(BOT_CHAT_KEY); wb.chat = d && Array.isArray(d.items) ? d.items.filter(m => m && /^(you|wind|sys)$/.test(m.who) && typeof m.text === "string").slice(-60) : []; }
function botSaveChat() { wb.chat = wb.chat.slice(-60); chessStore(BOT_CHAT_KEY, { items: wb.chat }); }
function botMsgEl(m, fresh) {
  const el = document.createElement("div"); el.className = "cv-msg " + m.who + (fresh ? "" : " old"); el.textContent = m.text; setLang(el, m.text); return el;
}
function botRenderChat() {
  const log = $("cvLog"); log.textContent = "";
  if (!wb.chat.some(m => m.who !== "sys")) { const e = document.createElement("div"); e.className = "cv-msg sys hint"; e.textContent = "Wind talks while it plays. Talk back."; log.append(e); }
  for (const m of wb.chat) log.append(botMsgEl(m, false));
  botTail();
  const last = [...wb.chat].reverse().find(m => m.who === "wind");   // the stage shows Wind's latest line again
  botBubble(last ? "msg" : "idle", last && last.text, true);
}
// Wind's speech bubble on the stage at the top: "idle" (nothing said yet: faint dots), "typing" (dots that move) or
// "msg": the latest line, which stays until the next one. It has room for a few lines; a longer one scrolls up through
// them once, then back to its start.
function botBubble(state, text, quiet) {
  const sp = $("cvSpeech"), win = sp.querySelector(".cv-speech-win"), txt = win.firstElementChild;
  (wb.speechSteps || []).forEach(clearTimeout); wb.speechSteps = [];
  if (state !== "msg") { sp.dataset.state = state === "typing" ? "typing" : txt.textContent ? "msg" : "idle"; if (state === "idle") { txt.textContent = ""; sp.dataset.state = "idle"; } return; }
  txt.textContent = text; setLang(sp, text); txt.style.transform = ""; sp.dataset.state = "msg";
  if (!quiet) { sp.classList.remove("pop"); void sp.offsetWidth; sp.classList.add("pop"); }
  win.style.height = "";
  const lh = parseFloat(getComputedStyle(txt).lineHeight) || 20, room = win.clientHeight, n = Math.max(1, Math.floor(room / lh + .05));
  win.style.height = (n * lh).toFixed(1) + "px";
  const extra = txt.scrollHeight - n * lh, steps = extra > 2 ? Math.ceil(extra / lh) : 0;
  for (let k = 1; k <= steps; k++) wb.speechSteps.push(setTimeout(() => { txt.style.transform = "translateY(" + (-Math.min(extra, k * lh)).toFixed(1) + "px)"; }, 1800 + (k - 1) * 1600));
  if (steps) wb.speechSteps.push(setTimeout(() => { txt.style.transform = ""; }, 1800 + steps * 1600 + 2600));
}
function botAdd(m) {
  wb.chat.push(m); botSaveChat();
  const log = $("cvLog"), hint = log.querySelector(".hint"); if (hint && m.who !== "sys") hint.remove();
  const typing = log.querySelector(".typing"), el = botMsgEl(m, true), follow = m.who === "you" || botNearEnd();
  if (typing) log.insertBefore(el, typing); else log.append(el);
  if (follow) botTail();
}
// a new game starts with an empty chat: nothing from the old game (no queued or late lines, no speech bubble)
function botReset() {
  wb.epoch++; wb.chat = []; botSaveChat();
  wb.pend = null; clearTimeout(wb.pendT); wb.replyQ = false; wb.overQ = null; wb.talkBusy = false; wb.talkAt = -1e9;
  botRenderChat(); $("cvTalkState").textContent = "Watching You"; wb.unread = 0; botUnread();   // and the stage's bubble goes back to idle
}
function botTail() { const log = $("cvLog"); log.scrollTop = log.scrollHeight; wb.atEnd = true; }
// the chat follows the conversation unless you have scrolled up to read: then a new line doesn't pull you down.
// Where you are comes from the last scroll (yours or the chat's own), not from the lines' heights, which change
// when the typing dots go away.
function botNearEnd() { return wb.atEnd !== false; }
function botTyping(on) {
  const log = $("cvLog"), t = log.querySelector(".typing");
  if (on && !t) { const follow = botNearEnd(), el = document.createElement("div"); el.className = "cv-msg wind typing"; el.setAttribute("aria-label", "Wind is typing"); el.innerHTML = "<i></i><i></i><i></i>"; log.append(el); if (follow) botTail(); }
  else if (!on && t) t.remove();
  $("cvTalkState").textContent = on ? "Typing…" : "Watching You";
  botBubble(on ? "typing" : "back");
}
// Wind says something: in the chat, and on the stage at the top, from the face
function botSay(text) {
  botAdd({ who: "wind", text });
  if (botNarrow() && !$("cvTalk").classList.contains("open")) { wb.unread = (wb.unread || 0) + 1; botUnread(); const b = $("cvTalkOpen"); b.classList.remove("ping"); void b.offsetWidth; b.classList.add("ping"); }
  botBubble("msg", text);
  if (wb.face) { wb.face.flag("talk", 1300); wb.face.look(0, .35, 1600); }
  chessSound("chat");
}
// on phones and tablets the live chat folds away into a "View Live Chat" button (with a count of Wind's unread lines);
// Wind Bot keeps talking on the stage at the top either way
// a screen reader hears Wind's lines from the chat log; while the chat is folded away (phones), from the bubble instead
function botAria() { const sp = $("cvSpeech"), folded = botNarrow() && !$("cvTalk").classList.contains("open"); sp.setAttribute("aria-hidden", String(!folded)); if (folded) sp.setAttribute("aria-live", "polite"); else sp.removeAttribute("aria-live"); }
function botNarrow() { return !!cv && cv.root.clientWidth <= 1000; }   // the same width at which the CSS stacks the page
function botUnread() { const u = $("cvUnread"); u.hidden = !wb.unread; u.textContent = wb.unread > 9 ? "9+" : String(wb.unread || ""); }
function botChat(open) {
  const t = $("cvTalk"); t.classList.toggle("open", open); $("cvTalkOpen").setAttribute("aria-expanded", String(open)); botAria();
  if (open) { wb.unread = 0; botUnread(); requestAnimationFrame(() => { botTail(); t.scrollIntoView({ behavior: "smooth", block: "end" }); }); }
  else if (botNarrow()) cv.root.scrollTo({ top: 0, behavior: "smooth" });
}
function botSend(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 200); if (!text || !cg) return;
  botAdd({ who: "you", text });
  botHold("curious", 1400); const inp = $("cvSayIn"), r = inp.getBoundingClientRect(); if (wb.face) wb.face.lookAt(r.left + r.width / 2, r.top, 1600);
  botAskFace("chat"); botAskTalk("chat");   // the face reads your message, and the voice answers it, each on its own
}

// a face that is off screen (scrolled away, behind a closed view, on a hidden card) stops moving until it is back
let botIO = null;
function botWatch(el) {
  if (!("IntersectionObserver" in window)) return;
  botIO = botIO || new IntersectionObserver(es => { for (const e of es) e.target.classList.toggle("off", !e.isIntersecting); });
  botIO.observe(el);
}
// ---- set up once, when the chess view is built
function botMount() {
  if (wb.face) return;
  wb.face = new BotFace($("cvFace").querySelector(".bot")); botWatch(wb.face.root);
  botLoadChat();
  const form = $("cvSayForm"), inp = $("cvSayIn"), log = $("cvLog");
  log.addEventListener("scroll", () => { wb.atEnd = log.scrollHeight - log.clientHeight - log.scrollTop < 24; }, { passive: true });
  $("cvTalkOpen").onclick = () => botChat(true);
  $("cvTalkTop").onclick = () => { if (botNarrow()) botChat(false); };   // on phones, the header folds the chat away
  form.onsubmit = e => { e.preventDefault(); const t = inp.value; inp.value = ""; $("cvSend").disabled = true; botSend(t); };
  inp.addEventListener("input", () => { $("cvSend").disabled = !inp.value.trim(); });
  // while you type on a phone the board keeps its size (on Android the keyboard makes the page shorter, which would
  // shrink it); turning the phone round lets it size itself to the screen again
  const lay = () => cv.root.querySelector(".cv"), unlock = () => { lockW = 0; lay().style.removeProperty("--sz"); };
  let lockW = 0;
  inp.addEventListener("focus", () => { const r = inp.getBoundingClientRect(); if (wb.face) wb.face.lookAt(r.left + r.width / 2, r.top, 2500);
    if (botNarrow()) { lockW = cv.root.clientWidth; lay().style.setProperty("--sz", cv.board.getBoundingClientRect().width.toFixed(1) + "px"); } });
  inp.addEventListener("blur", unlock);
  addEventListener("resize", () => { if (lockW && cv.root.clientWidth !== lockW) unlock(); botAria(); }, { passive: true });
  botAria();
  $("cvSend").disabled = true;
  // the eyes follow your pointer and the pieces you drag (passive: the board's own handling is untouched)
  let pend = null;
  cv.root.addEventListener("pointermove", e => { if (!pend) requestAnimationFrame(() => { const p = pend; pend = null; if (p) for (const f of botFaces()) f.lookAt(p.x, p.y, 1100); }); pend = { x: e.clientX, y: e.clientY }; }, { passive: true });
  cv.board.addEventListener("pointerdown", e => { for (const f of botFaces()) f.lookAt(e.clientX, e.clientY, 1400); if (cg && myTurn()) botIdleArm(); }, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && wb.face) botApply(); });
}


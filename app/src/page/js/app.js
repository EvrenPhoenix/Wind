// ============================================================================
// Wind — the chat page.
// Chats live only in this browser (localStorage). Replies stream from /api/chat (worker-api.js).
// ============================================================================
const $ = id => document.getElementById(id);
const STORE = "my-creation-chat-ui-v1", THEME_KEY = "my-creation-theme", SIDEBAR_KEY = "lumi-sidebar";
let currentTab = location.hash === "#wisp" ? "wisp" : location.hash === "#games" || location.hash === "#chess" ? "games" : "chat";   // Chat, Wisp or Games (see showTab)
// keys left by earlier versions of this page: saved chats and theme move to the keys above (once); the chosen model,
// from when there were several, is simply dropped
try { for (const [old, now] of [["ge" + "mini-chat-ui-v1", STORE], ["ge" + "mini-theme", THEME_KEY], ["wind-model", null]]) { const v = localStorage.getItem(old); if (v === null) continue; if (now && localStorage.getItem(now) === null) localStorage.setItem(now, v); localStorage.removeItem(old); } } catch (e) {}
const MAXLEN = 10000, MAX_CHATS = 40, MAX_MSGS = 100, MAX_PINNED = 20;
// only the newest 40 chats are kept; pinned chats (up to 20) are kept on top of those
function keepChats(list) { let p = 0, u = 0; return list.filter(c => c.pinned ? p++ < MAX_PINNED : u++ < MAX_CHATS); }
// ---- cutting text without changing how it looks (titles, playback)
// A cut never separates a letter from its vowel signs or marks (Bengali ি ু ং ঁ…), an emoji from its modifiers, the two
// letters of a flag, or the parts of a conjunct: ক্ষ is ক + ্ + ষ, and nothing may come between a virama (্) and the
// letter after it.
const VIRAMA = /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D4D\u0DCA]/, CLING = /^[\p{M}\p{Emoji_Modifier}\u200C\u200D\u{E0020}-\u{E007F}]/u;
const FLAG_A = /^[\u{1F1E6}-\u{1F1FF}]/u, FLAG_Z = /[\u{1F1E6}-\u{1F1FF}]$/u;
function cutOk(s, i) {
  if (i <= 0 || i >= s.length) return true;
  const c = s.charCodeAt(i), p = s.charCodeAt(i - 1);
  if (c >= 0xDC00 && c <= 0xDFFF) return false;                                        // inside one character (a surrogate pair)
  if (p === 0x200D || CLING.test(s.slice(i, i + 2))) return false;                     // marks and joiners belong to what's before
  if (VIRAMA.test(s[i - 1]) || (p === 0x200C && VIRAMA.test(s[i - 2] || ""))) return false;   // ক্|ষ would split a conjunct
  return !(FLAG_A.test(s.slice(i, i + 2)) && FLAG_Z.test(s.slice(Math.max(0, i - 2), i)));
}
function clip(s, n) { s = String(s || ""); if (s.length <= n) return s; let i = n; while (i > 0 && !cutOk(s, i)) i--; return s.slice(0, i); }
function clipWords(s, n) { const c = clip(s, n); if (c.length === s.length) return c; const sp = c.lastIndexOf(" "); return (sp > n * .6 ? c.slice(0, sp) : c).trimEnd(); }   // a title ends on a whole word when it can
// A message that is mostly Bengali is marked lang="bn": screen readers then read it as Bengali, and the page gives it a
// little more room between lines.
const BN = /[\u0980-\u09FF]/;
function langOf(t) { const s = String(t || ""); if (!BN.test(s)) return ""; return (s.match(/[\u0980-\u09FF]/g) || []).length * 2 >= (s.match(/[A-Za-z]/g) || []).length ? "bn" : ""; }
function setLang(el, t) { const l = langOf(t); if (l) el.lang = l; else el.removeAttribute("lang"); }
// Bengali text uses Wind's own Bengali font, which a browser fetches the first time Bengali appears. It is fetched as
// soon as Bengali is typed or arrives, so a reply plays back in its final font instead of switching font halfway.
let bnLoading = null;
function bnFontReady() {
  const fs = document.fonts; if (!fs || !fs.load || !fs.check) return true;
  if (!bnLoading) bnLoading = fs.load('16px "Wind Bengali"', "\u0985").catch(() => {});
  try { return fs.check('16px "Wind Bengali"', "\u0985"); } catch (e) { return true; }
}
const RM = matchMedia("(prefers-reduced-motion: reduce)"), TOUCH = matchMedia("(hover: none) and (pointer: coarse)"), DARKQ = matchMedia("(prefers-color-scheme: dark)"), WIDE = matchMedia("(min-width: 821px)");
const IS_MAC = /Mac|iPhone|iPad|iPod/.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || "");
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const TPL = $("tpl");
const ic = (name, cls) => '<svg class="ic' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const markSvg = cls => '<svg class="mark' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#wind"/></svg>';
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|js|mjs|cjs|jsx|ts|tsx|py|rb|php|java|kt|c|h|cpp|hpp|cc|cs|go|rs|swift|sql|html?|css|scss|less|xml|svg|ya?ml|toml|ini|cfg|conf|env|log|sh|bash|zsh|bat|ps1|r|lua|dart|vue|svelte|tex)$/i;
// High: deep reasoning with every search tool. Instant (High off) is the fast default. Remembered in this browser.
const HIGH_KEY = "wind-high"; let high = false; try { high = localStorage.getItem(HIGH_KEY) === "1"; } catch (e) {}

// ---------------------------------------------------------------- state
let chats = [], activeId = null, theme = "dark", themePref = "system", forceScroll = true;
let gen = null;                       // the reply being written right now: { chatId, msgId, controller }
let attachment = null, images = [], editing = false, rec = null, listening = false, renaming = null;
const FULL = new Map();               // full-size images for this session (thumbnails are what gets stored)

function uid() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function current() { return chats.find(c => c.id === activeId) || null; }
function genChat() { return gen ? chats.find(c => c.id === gen.chatId) || null : null; }
function busyHere() { return !!gen && gen.chatId === activeId; }
function blankChat() { return { id: uid(), title: "New chat", messages: [], updatedAt: Date.now() }; }

// ---------------------------------------------------------------- sources
// A searched reply comes with the pages Wind read (a wind.sources event). They are shown as cards at the end of the reply
// and saved with it; everything is checked here, so a stored or odd value can't inject markup.
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
function cleanSources(list) {
  if (!Array.isArray(list)) return null;
  const out = [], seen = new Set();
  for (const s of list) {
    if (out.length >= 8) break;
    const url = s && typeof s.url === "string" ? s.url.trim() : "";
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 600 || seen.has(url) || !hostOf(url)) continue;
    seen.add(url); out.push({ url, title: typeof s.title === "string" ? clip(s.title.replace(/\s+/g, " ").trim(), 160) : "" });
  }
  return out.length ? out : null;
}

// ---------------------------------------------------------------- reply versions
// "Try again" keeps the replies it replaces (up to six), and ‹ 2 / 3 › under the newest reply switches between them.
// Once the chat moves on, only the reply that was showing is kept.
const MAX_VERSIONS = 6, VERSION_FIELDS = ["content", "mode", "weather", "sources", "notice"];
function snapshot(m) { const v = { content: String(m.content || "") }; if (m.mode === "high") v.mode = "high"; if (m.weather) v.weather = m.weather; if (m.sources) v.sources = m.sources; if (m.notice) v.notice = true; return v; }
function cleanVersion(v) { const o = { content: v.content }; if (v.mode === "high") o.mode = "high"; const w = cleanWeather(v.weather); if (w) o.weather = w; const s = cleanSources(v.sources); if (s) o.sources = s; if (v.notice === true) o.notice = true; return o; }
function goodVersion(v) { const t = String(v.content || "").trim(); return !!t && !v.notice && !/^\*\*Request failed:\*\*/.test(t) && t !== "Generation stopped." && t !== "The AI returned an empty response."; }
function showVersion(m, k) {
  if (gen || !m.versions || !m.versions[k] || k === m.vi) return;
  m.versions[m.vi] = snapshot(m);
  VERSION_FIELDS.forEach(f => { delete m[f]; });
  Object.assign(m, m.versions[k]); m.vi = k;
  if (speaking && speaking.id === m.id) stopSpeaking();
  save(); render(); announce("Reply " + (k + 1) + " of " + m.versions.length);
}
function versionSwitch(m) {
  const box = document.createElement("div"), n = m.versions.length, k = m.vi;
  box.className = "vers"; box.setAttribute("role", "group"); box.setAttribute("aria-label", "Reply versions");
  const prev = mkBtn("chevron", "Previous reply", () => showVersion(m, k - 1)), next = mkBtn("chevron", "Next reply", () => showVersion(m, k + 1));
  prev.classList.add("prev"); next.classList.add("next"); prev.disabled = k <= 0; next.disabled = k >= n - 1;
  const lab = document.createElement("span"); lab.className = "vn"; lab.textContent = (k + 1) + " / " + n;
  box.append(prev, lab, next);
  return box;
}

// ---------------------------------------------------------------- read aloud
// Replies can be read out by the browser's own speech (nothing is sent anywhere). Code blocks are skipped.
const TTS = "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
let speaking = null;   // { id } of the reply being read
function setSpeakBtn(b, on) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "Stop reading" : "Read aloud"); b.title = on ? "Stop reading" : "Read aloud"; }
function stopSpeaking() {
  const s = speaking; speaking = null;
  try { window.speechSynthesis.cancel(); } catch (e) {}
  if (s) document.querySelectorAll('.msg[data-id="' + s.id + '"] .speak').forEach(b => setSpeakBtn(b, false));
}
function speakable(m) {
  const el = document.createElement("div"); el.innerHTML = renderMarkdown(m.content || "");
  el.querySelectorAll(".codeblock").forEach(x => x.replaceWith(" (code) "));
  el.querySelectorAll(".sources, a.cite, .copy-code, .wrap-code").forEach(x => x.remove());
  el.querySelectorAll("td, th").forEach(x => x.append(", "));
  el.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, tr, blockquote, .math-block").forEach(x => x.append("\n"));
  return el.textContent.replace(/([.!?:;,])[ \t]*\n+/g, "$1 ").replace(/\s*\n+\s*/g, ". ").replace(/\s+/g, " ").trim();
}
// Natural, neural and online voices (Edge's Microsoft voices, Chrome's Google voices, Safari's enhanced ones) sound far
// better than the default, so they are chosen first when the browser has one for the reply's language.
function bestVoice(lang) {
  let list = []; try { list = window.speechSynthesis.getVoices() || []; } catch (e) {}
  const norm = s => String(s || "").toLowerCase().replace("_", "-"), want = norm(lang), base = want.split("-")[0];
  const same = list.filter(v => norm(v.lang).split("-")[0] === base); if (!same.length) return null;
  const exact = same.filter(v => norm(v.lang) === want), pool = exact.length ? exact : same;
  const score = v => (/natural|neural/i.test(v.name) ? 4 : 0) + (/premium|enhanced/i.test(v.name) ? 3 : 0) + (/google|online/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1) + (v.default ? .5 : 0);
  return pool.slice().sort((a, b) => score(b) - score(a))[0];
}
if (TTS) { try { window.speechSynthesis.getVoices(); window.speechSynthesis.addEventListener("voiceschanged", () => {}); } catch (e) {} }   // voices load in the background
function speak(m) {
  if (!TTS) return;
  if (speaking) { const same = speaking.id === m.id; stopSpeaking(); if (same) return; }
  const text = speakable(m); if (!text) return;
  const lang = /[\u0980-\u09FF]/.test(text) ? "bn-BD" : /[\u0900-\u097F]/.test(text) ? "hi-IN" : /[\u0600-\u06FF]/.test(text) ? "ar" : /[\u3040-\u30FF]/.test(text) ? "ja-JP" : /[\u4E00-\u9FFF]/.test(text) ? "zh-CN" : /[\uAC00-\uD7AF]/.test(text) ? "ko-KR" : /[\u0400-\u04FF]/.test(text) ? "ru-RU" : (navigator.language || "en-US");
  // read in sentence-sized pieces: some browsers stop one long utterance after about 15 seconds
  const chunks = []; let cur = "";
  for (const p of text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [text]) { if (cur && (cur + p).length > 220) { chunks.push(cur); cur = ""; } cur += p; }
  if (cur.trim()) chunks.push(cur);
  const me = { id: m.id }, voice = bestVoice(lang); speaking = me;
  document.querySelectorAll('.msg[data-id="' + m.id + '"] .speak').forEach(b => setSpeakBtn(b, true));
  try { if (window.speechSynthesis.speaking || window.speechSynthesis.pending) window.speechSynthesis.cancel(); } catch (e) {}
  chunks.forEach((t, i) => {
    const u = new SpeechSynthesisUtterance(t.trim()); u.lang = lang; if (voice) try { u.voice = voice; } catch (e) {}   // a voice the browser won't take just means its default voice
    u.onerror = e => { if (speaking !== me) return; stopSpeaking(); if (!e || !/interrupt|cancel/.test(e.error || "")) toast("Couldn't read this aloud here"); };
    if (i === chunks.length - 1) u.onend = () => { if (speaking === me) stopSpeaking(); };
    window.speechSynthesis.speak(u);
  });
}

// ---------------------------------------------------------------- weather card
// For a weather question the server sends the forecast it used (a wind.weather event); it is drawn as a small card above
// the reply and saved with the message. Everything is checked and rebuilt here, so a stored or odd value can't inject markup.
function cleanWeather(w) {
  if (!w || typeof w !== "object" || !Array.isArray(w.days)) return null;
  const str = (v, n) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "";
  const num = v => typeof v === "number" && isFinite(v) ? Math.round(v) : null;
  const days = w.days.slice(0, 7).filter(d => d && typeof d === "object" && /^\d{4}-\d\d-\d\d$/.test(d.date || "")).map(d => {
    const pop = num(d.pop);
    return { date: d.date, label: str(d.label, 12) || d.date.slice(5), code: num(d.code), text: str(d.text, 40), hi: num(d.hi), lo: num(d.lo), pop: pop === null ? null : Math.max(0, Math.min(100, pop)) };
  });
  if (!days.length) return null;
  const n = w.now && typeof w.now === "object" && num(w.now.t) !== null ? { t: num(w.now.t), feels: num(w.now.feels), code: num(w.now.code), text: str(w.now.text, 40), day: w.now.day !== false } : null;
  return { place: str(w.place, 90) || "Forecast", approx: w.approx === true, src: str(w.src, 24) || "Forecast", url: /^https:\/\/(open-meteo\.com|www\.met\.no)\/[\w\/-]*$/.test(w.url || "") ? w.url : "https://open-meteo.com/", unit: w.unit === "°F" ? "°F" : "°C", now: n, days };
}
function wxIcon(c, night) {
  if (c === null || c === undefined) return "wx-cloud";
  if (c <= 1) return night ? "moon" : "sun";
  if (c === 2) return night ? "wx-cloud" : "wx-partly";
  if (c === 3) return "wx-cloud";
  if (c === 45 || c === 48) return "wx-fog";
  if (c >= 95) return "wx-storm";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "wx-snow";
  return "wx-rain";
}
function weatherCard(w) {
  const deg = v => v === null ? "–" : v + "°", n = w.now, d0 = w.days[0], el = document.createElement("section");
  el.className = "wx"; el.setAttribute("aria-label", "Weather forecast for " + w.place);
  const cond = n ? [n.text, n.feels !== null && n.feels !== n.t ? "feels like " + deg(n.feels) : ""].filter(Boolean).join(" · ") : d0.text;
  let h = '<div class="wx-head"><svg class="ic wx-ic" aria-hidden="true"><use href="#i-' + wxIcon(n ? n.code : d0.code, n && !n.day) + '"/></svg>' +
    '<div class="wx-now"><span class="wx-temp">' + esc(deg(n ? n.t : d0.hi) + w.unit.slice(1)) + '</span><span class="wx-cond">' + esc(cond) + "</span></div>" +
    '<div class="wx-place"><span class="wx-name" title="' + esc(w.place) + '">' + esc(w.place) + '</span><span class="wx-sub">' + (w.approx ? "Near you · " : "") +
    '<a href="' + esc(w.url) + '" target="_blank" rel="noopener noreferrer">' + esc(w.src) + "</a></span></div></div>";
  h += '<ol class="wx-days" style="--n:' + w.days.length + '">' + w.days.map(d => {
    const said = d.label + ": " + (d.text ? d.text.toLowerCase() + ", " : "") + "high " + deg(d.hi) + ", low " + deg(d.lo) + (d.pop !== null ? ", " + d.pop + "% chance of rain" : "");
    return '<li class="wx-day" aria-label="' + esc(said) + '" title="' + esc(d.text || "") + '"><span class="wx-dl" aria-hidden="true">' + esc(d.label) + '</span><svg class="ic wx-ic" aria-hidden="true"><use href="#i-' + wxIcon(d.code) + '"/></svg>' +
      '<span class="wx-hl" aria-hidden="true"><b>' + esc(deg(d.hi)) + "</b><span>" + esc(deg(d.lo)) + '</span></span><span class="wx-pop" aria-hidden="true">' + (d.pop !== null && d.pop >= 10 ? d.pop + "%" : "") + "</span></li>";
  }).join("") + "</ol>";
  el.innerHTML = h;
  return el;
}
// the forecast arrived while the reply is still being written: add the card to the message on screen
function showWeather(a) {
  const row = document.querySelector('.msg[data-id="' + a.id + '"]'); if (!row || row.querySelector(".wx")) return;
  const stick = nearBottom(), ans = row.querySelector(".answer"), card = weatherCard(a.weather);
  card.classList.add("wx-in");   // only a newly arrived card rises in; redraws of the chat stay still
  if (ans) ans.before(card); else row.append(card);
  if (stick) $("scroll").scrollTop = $("scroll").scrollHeight;
}

// ---------------------------------------------------------------- storage
function dropOldestThumb() { for (let i = chats.length - 1; i >= 0; i--) for (const m of chats[i].messages) for (const im of (m.images || [])) if (im.thumb) { im.thumb = null; return true; } return false; }
function save() {
  const data = () => JSON.stringify(keepChats(chats.filter(c => c.messages.length && !c.temp)).map(c => ({ ...c, messages: c.messages.slice(-MAX_MSGS) })));
  for (let k = 0; k < 80; k++) { try { localStorage.setItem(STORE, data()); return; } catch (e) { if (!dropOldestThumb()) return; } }
}
function sanitize(list) {
  return (Array.isArray(list) ? list : []).filter(c => c && typeof c.id === "string" && Array.isArray(c.messages)).map(c => {
    if (typeof c.title !== "string" || !c.title.trim()) c.title = "New chat";
    if (c.pinned !== true) delete c.pinned;
    for (const k of ["model", "previousInteractionId", "geminiSynced", "prevBeforeLast", "syncBeforeLast"]) delete c[k];   // left from when there were several models
    c.messages = c.messages.filter(m => m && typeof m === "object" && (m.role === "user" || m.role === "assistant"));
    c.messages.forEach(m => {
      if (typeof m.id !== "string") m.id = uid();
      delete m.model;
      if (m.mode !== "high") delete m.mode;
      if (typeof m.content !== "string") m.content = m.content == null ? "" : String(m.content);
      if (m.images !== undefined) { if (Array.isArray(m.images)) m.images = m.images.filter(im => im && typeof im === "object" && typeof im.id === "string").map(im => ({ id: im.id, thumb: typeof im.thumb === "string" && /^data:image\//.test(im.thumb) ? im.thumb : null })); if (!Array.isArray(m.images) || !m.images.length) delete m.images; }
      if (m.file !== undefined && !(m.file && typeof m.file.name === "string" && typeof m.file.text === "string")) delete m.file;
      if (m.weather !== undefined) { m.weather = cleanWeather(m.weather); if (!m.weather) delete m.weather; }
      if (m.sources !== undefined) { m.sources = m.role === "assistant" ? cleanSources(m.sources) : null; if (!m.sources) delete m.sources; }
      if (m.versions !== undefined || m.vi !== undefined) {
        const vs = m.role === "assistant" && Array.isArray(m.versions) ? m.versions.filter(v => v && typeof v === "object" && typeof v.content === "string").slice(-MAX_VERSIONS).map(cleanVersion) : [];
        if (vs.length > 1) { m.versions = vs; m.vi = Number.isInteger(m.vi) ? Math.max(0, Math.min(vs.length - 1, m.vi)) : vs.length - 1; } else { delete m.versions; delete m.vi; }
      }
    });
    return c;
  });
}
try { chats = sanitize(JSON.parse(localStorage.getItem(STORE) || "[]")); chats = keepChats(chats); } catch (e) { chats = []; }
chats.forEach(c => c.messages.forEach(m => { if (m.pending) { m.pending = false; if (!m.content) m.content = "Generation stopped."; } }));
chats = chats.filter(c => c.messages.length);
// Another tab saved: adopt its new and newer chats so the two tabs do not overwrite each other's work.
window.addEventListener("storage", e => {
  if (e.key !== STORE || !e.newValue) return;
  let incoming; try { incoming = sanitize(JSON.parse(e.newValue)); } catch (x) { return; }
  const mine = new Map(chats.map(c => [c.id, c])); let changed = false;
  for (const o of incoming) {
    if (!o.messages.length || o.messages.some(m => m.pending)) continue;
    const c = mine.get(o.id);
    if (!c) { chats.push(o); changed = true; }
    else if ((o.updatedAt || 0) > (c.updatedAt || 0) && c.id !== activeId && !(gen && gen.chatId === c.id)) { Object.keys(c).forEach(k => { delete c[k]; }); Object.assign(c, o); changed = true; }
  }
  if (changed) { chats.sort((a, b) => (a.messages.length ? 1 : 0) - (b.messages.length ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0)); renderHistory(); }
});

// ---------------------------------------------------------------- theme
function resolveTheme(pref) { return pref === "system" ? (DARKQ.matches ? "dark" : "light") : pref; }
function applyTheme(t) { theme = t; document.documentElement.dataset.theme = t; const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === "dark" ? "#07080d" : "#f6f8fc"; }
function syncThemeSeg() { document.querySelectorAll("#themeSeg button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.themePref === themePref))); }
function setThemePref(pref, origin) {
  themePref = pref;
  try { if (pref === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, pref); } catch (e) {}
  syncThemeSeg(); syncManifest(pref);
  const next = resolveTheme(pref);
  if (next === theme) return;
  if (!document.startViewTransition || RM.matches) { applyTheme(next); return; }
  const r = origin && origin.getBoundingClientRect ? origin.getBoundingClientRect() : null, x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : innerHeight / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(() => applyTheme(next));
  vt.ready.then(() => { document.documentElement.animate({ clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + radius + "px at " + x + "px " + y + "px)"] }, { duration: 560, easing: "cubic-bezier(.4,0,.2,1)", pseudoElement: "::view-transition-new(root)" }); }).catch(() => {});
}
try { const st = localStorage.getItem(THEME_KEY); themePref = st === "dark" || st === "light" ? st : "system"; } catch (e) { themePref = "system"; }
applyTheme(resolveTheme(themePref)); syncThemeSeg();
if (DARKQ.addEventListener) DARKQ.addEventListener("change", () => { if (themePref === "system") applyTheme(resolveTheme("system")); });

// ---------------------------------------------------------------- small UI helpers
function keysLabel(spec) { return spec.split("+").map(k => k === "mod" ? (IS_MAC ? "⌘" : "Ctrl") : k === "shift" ? (IS_MAC ? "⇧" : "Shift") : k.length === 1 ? k.toUpperCase() : k); }
document.querySelectorAll(".kbd[data-keys]").forEach(k => { k.textContent = keysLabel(k.dataset.keys).join(IS_MAC ? "" : "+"); });
function focusPrompt() { if (!TOUCH.matches) $("prompt").focus({ preventScroll: true }); }
function announce(text) { const l = $("live"); l.textContent = ""; setTimeout(() => { l.textContent = text; }, 30); }

function toast(text, opts) {
  opts = opts || {};
  const box = $("toasts");
  while (box.children.length >= 2) box.firstElementChild.remove();
  const t = document.createElement("div"); t.className = "toast";
  const s = document.createElement("span"); s.textContent = text; t.append(s);
  let timer = 0;
  const close = () => { clearTimeout(timer); if (!t.isConnected || t.classList.contains("out")) return; t.classList.add("out"); setTimeout(() => t.remove(), 220); };
  if (opts.action) { const b = document.createElement("button"); b.type = "button"; b.textContent = opts.action; b.onclick = () => { close(); if (opts.onAction) opts.onAction(); }; t.append(b); }
  box.append(t);
  timer = setTimeout(close, opts.ms || (opts.action ? 6500 : 1800));
  return close;
}
function fallbackCopy(text) { try { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0"; document.body.append(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch (e) { return false; } }
function copy(text, btn) {
  const done = () => {
    if (btn && btn.classList.contains("copy-code")) { btn.classList.add("done"); btn.innerHTML = ic("check") + "<span>Copied</span>"; setTimeout(() => { if (btn.isConnected) { btn.classList.remove("done"); btn.innerHTML = ic("copy") + "<span>Copy</span>"; } }, 1500); return; }
    if (btn) { btn.innerHTML = ic("check"); setTimeout(() => { if (btn.isConnected) btn.innerHTML = ic("copy"); }, 1400); }
    toast("Copied");
  };
  const fail = () => { if (fallbackCopy(text)) done(); else toast("Couldn't copy"); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(fail); else fail();
}

// ---- popovers: one open at a time, placed next to the control that opened them
let openPop = null;
function placeMenu(el, anchor, o) {
  el.hidden = false; el.style.left = "0px"; el.style.top = "0px";
  const r = anchor.getBoundingClientRect(), mw = el.offsetWidth, mh = el.offsetHeight, gap = 8, pad = 8;
  const below = innerHeight - r.bottom - gap - pad, above = r.top - gap - pad;
  let side = o.side || "auto";
  if (side === "auto") side = below >= mh || below >= above ? "bottom" : "top";
  else if (side === "top" && above + pad - 2 < mh && below > above) side = "bottom";
  else if (side === "bottom" && below + pad - 2 < mh && above > below) side = "top";
  let top = side === "bottom" ? r.bottom + gap : r.top - gap - mh;
  let left = o.align === "end" ? r.right - mw : o.align === "center" ? r.left + r.width / 2 - mw / 2 : r.left;
  left = Math.max(pad, Math.min(left, innerWidth - mw - pad)); top = Math.max(pad, Math.min(top, innerHeight - mh - pad));
  el.style.left = Math.round(left) + "px"; el.style.top = Math.round(top) + "px";
  el.style.setProperty("--origin", (side === "bottom" ? "top " : "bottom ") + (o.align === "end" ? "right" : o.align === "center" ? "center" : "left"));
  el.style.setProperty("--from", side === "bottom" ? "-4px" : "4px");
}
function closePopover(restoreFocus) {
  const p = openPop; if (!p) return;
  openPop = null; p.el.hidden = true; p.anchor.setAttribute("aria-expanded", "false");
  if (p.o.onClose) p.o.onClose();
  if (p.o.temp) p.el.remove();
  if (restoreFocus && p.anchor.isConnected) p.anchor.focus({ preventScroll: true });
}
function openPopover(el, anchor, o) {
  o = o || {};
  const same = openPop && openPop.el === el && openPop.anchor === anchor;
  closePopover();
  if (same) return;
  placeMenu(el, anchor, o);
  anchor.setAttribute("aria-expanded", "true");
  openPop = { el, anchor, o };
  const first = el.querySelector('[aria-checked="true"]:not([hidden])') || el.querySelector("button:not([disabled]):not([hidden])");
  if (first && !TOUCH.matches) setTimeout(() => { if (openPop && openPop.el === el) first.focus({ preventScroll: true }); }, 40);
}
function actionMenu(anchor, items, o) {
  const el = document.createElement("div"); el.className = "menu"; el.setAttribute("role", "menu");
  for (const it of items) {
    const b = document.createElement("button"); b.type = "button"; b.className = "menu-item" + (it.danger ? " danger" : ""); b.setAttribute("role", "menuitem");
    if (it.checked !== undefined) { b.setAttribute("role", "menuitemcheckbox"); b.setAttribute("aria-checked", String(!!it.checked)); }
    b.innerHTML = ic(it.icon) + "<span></span>" + (it.checked ? ic("check", "ck") : ""); b.querySelector("span").textContent = it.label;
    if (it.sub) { const s = document.createElement("small"); s.textContent = it.sub; b.querySelector("span").append(s); }
    b.onclick = () => { closePopover(); it.run(); };
    el.append(b);
  }
  document.body.append(el);
  openPopover(el, anchor, Object.assign({ temp: true }, o));
}
document.addEventListener("pointerdown", e => { if (openPop && !openPop.el.contains(e.target) && !openPop.anchor.contains(e.target)) closePopover(); }, true);
document.addEventListener("keydown", e => {
  if (!openPop) return;
  const items = Array.from(openPop.el.querySelectorAll("button:not([disabled]):not([hidden])")), i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (items.length) items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); }
  else if (e.key === "Home" && items.length) { e.preventDefault(); items[0].focus(); }
  else if (e.key === "End" && items.length) { e.preventDefault(); items[items.length - 1].focus(); }
  else if (e.key === "Tab") closePopover();
}, true);
let lastW = innerWidth;
window.addEventListener("resize", () => { if (innerWidth !== lastW) { lastW = innerWidth; closePopover(); } });

// ---- dialogs
function openDialog(d) { closePopover(); if (typeof d.showModal === "function") { if (!d.open) d.showModal(); } else d.setAttribute("open", ""); }
function closeDialog(d) { if (typeof d.close === "function" && d.open) d.close(); else d.removeAttribute("open"); }
document.querySelectorAll("dialog").forEach(d => {
  d.addEventListener("click", e => { if (e.target !== d) return; const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(d); });
  d.querySelectorAll("[data-close]").forEach(b => { b.onclick = () => closeDialog(d); });
});
function confirmBox(o) {
  $("cfTitle").textContent = o.title; $("cfText").textContent = o.text;
  const b = $("cfOk"); b.textContent = o.ok || "Delete"; b.onclick = () => { closeDialog($("confirmDialog")); o.onOk(); };
  openDialog($("confirmDialog"));
}

// ---------------------------------------------------------------- sidebar + history
function sidebarIsOpen() { return WIDE.matches ? !$("app").classList.contains("sidebar-hidden") : $("sidebar").classList.contains("open"); }
function syncMenu() { $("menu").setAttribute("aria-expanded", String(sidebarIsOpen())); }
function setSidebar(open) {
  if (WIDE.matches) { $("app").classList.toggle("sidebar-hidden", !open); try { localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed"); } catch (e) {} }
  else { $("sidebar").classList.toggle("open", open); $("overlay").classList.toggle("show", open); }
  syncMenu();
}
function closeMobile() { if (!WIDE.matches && sidebarIsOpen()) setSidebar(false); }
function groupOf(t) {
  const n = new Date(), start = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  if (t >= start) return "Today"; if (t >= start - 864e5) return "Yesterday"; if (t >= start - 6 * 864e5) return "Previous 7 days"; if (t >= start - 29 * 864e5) return "Previous 30 days"; return "Older";
}
let lastPick = { id: null, t: 0 };
function chatMatches(c, q) { if (c.title.toLowerCase().indexOf(q) !== -1) return true; for (const m of c.messages) if (m.content && m.content.toLowerCase().indexOf(q) !== -1) return true; return false; }
function renderHistory() {
  if (renaming) return;
  const root = $("history"), q = $("search").value.trim().toLowerCase();
  root.textContent = "";
  const all = chats.filter(c => c.messages.length && !c.temp), list = all.filter(c => !q || chatMatches(c, q)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!list.length) {
    const d = document.createElement("div"); d.className = "empty";
    if (q) d.textContent = "No chats match “" + clip($("search").value.trim(), 40) + "”";
    else d.innerHTML = "<strong>No chats yet</strong>Your conversations will appear here.";
    root.append(d); return;
  }
  let last = "";
  for (const c of list) {
    const g = c.pinned ? "Pinned" : groupOf(c.updatedAt || 0);
    if (g !== last) { last = g; const h = document.createElement("div"); h.className = "group"; h.textContent = g; root.append(h); }
    const row = document.createElement("div"); row.className = "hitem" + (c.id === activeId ? " active" : ""); row.dataset.id = c.id;
    const open = document.createElement("button"); open.type = "button"; open.className = "hopen"; open.title = c.title;
    if (c.id === activeId) open.setAttribute("aria-current", "page");
    const t = document.createElement("span"); t.className = "t"; t.textContent = c.title; open.append(t);
    if (gen && gen.chatId === c.id) { const live = document.createElement("span"); live.innerHTML = markSvg("spin live"); live.title = "Wind is replying"; open.append(live.firstChild); }
    open.onclick = () => {
      const now = Date.now();
      if (lastPick.id === c.id && now - lastPick.t < 450) { lastPick = { id: null, t: 0 }; startRename(c.id); return; }
      lastPick = { id: c.id, t: now }; openChat(c.id);
    };
    const more = document.createElement("button"); more.type = "button"; more.className = "more"; more.innerHTML = ic("more"); more.setAttribute("aria-label", "Options for " + c.title); more.title = "Options"; more.setAttribute("aria-haspopup", "menu");
    more.onclick = e => { e.stopPropagation(); chatMenu(c.id, more, row); };
    row.append(open, more); root.append(row);
  }
}
function togglePin(id) {
  const c = chats.find(x => x.id === id); if (!c) return;
  if (!c.pinned && chats.filter(x => x.pinned).length >= MAX_PINNED) { toast("You can pin up to " + MAX_PINNED + " chats"); return; }
  if (c.pinned) delete c.pinned; else c.pinned = true;
  save(); renderHistory(); toast(c.pinned ? "Pinned to the top" : "Unpinned");
}
function chatMenu(id, anchor, row, here) {   // here: from the chat's own top bar
  if (row) row.classList.add("menu-open");
  const pinned = !!(chats.find(x => x.id === id) || {}).pinned;
  actionMenu(anchor, [
    { icon: "pin", label: pinned ? "Unpin" : "Pin", run: () => togglePin(id) },
    ...(here ? [] : [{ icon: "pencil", label: "Rename", run: () => startRename(id) }]),   // the chat's own top bar has no title to rename: rename from the sidebar
    { icon: "download", label: "Download", run: () => exportChat(id) },
    { icon: "trash", label: "Delete", danger: true, run: () => deleteChat(id) },
  ], { onClose: () => { if (row) row.classList.remove("menu-open"); } });
}
function startRename(id) {
  const c = chats.find(x => x.id === id); if (!c) return;
  if (!sidebarIsOpen()) setSidebar(true);
  let row = $("history").querySelector('.hitem[data-id="' + id + '"]');
  if (!row) { $("search").value = ""; renderHistory(); row = $("history").querySelector('.hitem[data-id="' + id + '"]'); if (!row) return; }
  renaming = id;
  const input = document.createElement("input"); input.className = "rename"; input.value = c.title; input.maxLength = 80; input.setAttribute("aria-label", "Chat name");
  row.textContent = ""; row.append(input);
  setTimeout(() => { input.focus(); input.select(); }, 20);
  let finished = false;
  const finish = commit => {
    if (finished) return; finished = true; renaming = null;
    const v = input.value.replace(/\s+/g, " ").trim();
    if (commit && v && v !== c.title) { c.title = clip(v, 80); save(); }
    renderHistory(); syncTitle();
  };
  input.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); finish(true); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); } };
  input.onblur = () => finish(true);
}
function syncTitle() {
  const c = current(), on = !!(c && c.messages.length);
  document.title = on ? c.title + " · Wind" : "Wind — Personal AI";
  const top = $("topChat"); if (top) top.textContent = on ? c.title : "";
}
function syncHash() { if (currentTab !== "chat") return; try { const c = current(), h = c && c.messages.length && !c.temp ? "#c=" + c.id : ""; if (location.hash !== h) history.replaceState(null, "", location.pathname + location.search + h); } catch (e) {} }
// A temporary chat lives only in this page: it is never saved or listed, and it is dropped when you leave it or reload.
function dropTemp(keepId) { chats = chats.filter(c => !c.temp || c.id === keepId || (gen && gen.chatId === c.id)); }
function toggleTemp() {
  const c = current();
  if (c && c.temp && c.messages.length) { newChat(); toast("Temporary chat deleted"); return; }   // leaving it ends it
  cancelEdit();
  let b = c && !c.messages.length ? c : chats.find(x => !x.messages.length);
  if (!b) { b = blankChat(); chats.unshift(b); }
  if (b.temp) delete b.temp; else b.temp = true;
  activeId = b.id; forceScroll = true; syncHash(); render(); focusPrompt(); announce(b.temp ? "Temporary chat on" : "Temporary chat off");
}
function newChat() {
  showTab("chat", true); closeChess(); cancelEdit(); if (speaking) stopSpeaking(); dropTemp(null);
  let c = chats.find(x => !x.messages.length);
  if (!c) { c = blankChat(); chats.unshift(c); }
  delete c.temp;
  activeId = c.id; forceScroll = true;
  syncHash(); render(); focusPrompt(); closeMobile();
}
function safeRender() {
  try { render(); return true; }
  catch (e) {
    try { console.error(e); } catch (x) {}
    let c = chats.find(x => !x.messages.length); if (!c) { c = blankChat(); chats.unshift(c); }
    activeId = c.id; seenChat = null;
    try { $("inner").textContent = ""; render(); } catch (x) {}
    toast("That chat couldn't be opened");
    return false;
  }
}
function openChat(id) {
  if (!chats.some(c => c.id === id)) return;
  showTab("chat", true);
  if (id === activeId && $("main").classList.contains("chatting") && !chessOn) { closeMobile(); focusPrompt(); return; }
  closeChess(); cancelEdit(); if (speaking) stopSpeaking(); dropTemp(id);
  activeId = id; forceScroll = true;
  safeRender(); syncHash(); closeMobile(); focusPrompt();
}
function deleteChat(id) {
  if (gen && gen.chatId === id) { toast("Wind is still replying in this chat"); return; }
  const idx = chats.findIndex(c => c.id === id); if (idx < 0) return;
  const removed = chats[idx], wasActive = id === activeId;
  if (wasActive) cancelEdit();
  chats.splice(idx, 1);
  if (wasActive) { let c = chats.find(x => !x.messages.length); if (!c) { c = blankChat(); chats.unshift(c); } activeId = c.id; forceScroll = true; }
  save(); syncHash(); render();
  toast("Chat deleted", { action: "Undo", onAction: () => { if (chats.some(c => c.id === removed.id)) return; chats.splice(Math.min(idx, chats.length), 0, removed); save(); renderHistory(); } });
}
function deleteAllChats() {
  const n = chats.filter(c => c.messages.length && !c.temp).length;
  if (!n) { toast("No chats to delete"); return; }
  confirmBox({
    title: "Delete all chats?", text: (n === 1 ? "This removes your 1 chat" : "This removes all " + n + " chats") + " from this browser. It can't be undone.", ok: "Delete all",
    onOk: () => {
      if (gen) { gen.controller.abort(); flowSnap(); }
      cancelEdit(); chats = [blankChat()]; activeId = chats[0].id; forceScroll = true;
      save(); syncHash(); render(); toast("All chats deleted");
    },
  });
}
function exportChat(id) {
  const c = id ? chats.find(x => x.id === id) : current(); if (!c || !c.messages.length) return;
  const md = "# " + c.title + "\n\n" + c.messages.map(m => "**" + (m.role === "user" ? "You" : "Wind") + ":** " + (m.role === "user" ? m.content || "" : fixDigitsMd(m.content)) + (m.file ? "\n\n_Attached: " + m.file.name + "_" : "") + (m.images && m.images.length ? "\n\n_Attached " + m.images.length + " image" + (m.images.length > 1 ? "s" : "") + "_" : "") + (m.sources ? "\n\nSources:\n" + m.sources.map(s => "- [" + (s.title || hostOf(s.url)).replace(/[\[\]]/g, "") + "](" + s.url + ")").join("\n") : "")).join("\n\n---\n\n") + "\n";
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
  a.download = (clip(c.title.replace(/[\\/:*?"<>|…]+/g, "").trim(), 48) || "wind-chat") + ".md";
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  toast("Downloaded");
}

// ---------------------------------------------------------------- welcome + starters
function greeting() { const h = new Date().getHours(); return h < 5 ? "Hello, night owl" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }
function welcome(root, temp) {
  const w = document.createElement("div"); w.className = "welcome"; w.dataset.temp = String(!!temp);
  w.innerHTML = '<div class="hero">' + (temp ? '<svg class="temp-mark" aria-hidden="true" viewBox="0 0 24 24"><use href="#i-temp"/></svg>' : '<div class="home-mark">' + markSvg() + '</div>') + '<h1 class="greet"></h1>' + (temp ? '<p class="temp-note">This chat won\'t be saved in this browser or listed in your chats. It\'s gone when you leave or reload.</p>' : '<p class="greet-sub"></p>' + HOME_BREEZE) + "</div>";
  w.querySelector(".greet").textContent = temp ? "Temporary chat" : greeting();
  if (!temp) w.querySelector(".greet-sub").textContent = greetSub(true);
  root.append(w);
  if (!temp) fillStarters();
}
// Starter cards on the chat home (under the box on wide screens, a swipeable row above it on phones). Four are picked
// fresh for each new chat; a card fills the box with an opening you finish yourself, so nothing is sent by surprise.
const STARTERS = [
  ["pencil", "blue", "Help me write", "an email, post or story", "Help me write "],
  ["spark", "violet", "Brainstorm ideas", "gifts, projects, names", "Give me 5 fresh ideas for "],
  ["bulb", "amber", "Explain simply", "any topic, made easy", "Explain this simply, like I'm new to it: "],
  ["compass", "cyan", "Plan a trip", "a day-by-day getaway", "Plan a weekend trip to "],
  ["code", "green", "Debug my code", "find and fix the bug", "Help me find the bug in this code:\n"],
  ["text", "blue", "Summarize", "long text, key points", "Summarize this in a few bullet points:\n"],
  ["bowl", "pink", "What to cook", "from what's in your fridge", "What can I cook tonight with "],
  ["list", "violet", "Make a plan", "step by step to a goal", "Make me a step-by-step plan to "],
];
function fillStarters() {
  const box = $("starters"); if (!box) return;
  const pool = STARTERS.slice(), pick = [];
  while (pick.length < 4 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  box.innerHTML = pick.map(([i, c, t, s, fill]) => '<button class="starter" type="button" data-c="' + c + '" data-text="' + esc(fill) + '"><span class="st-ic">' + ic(i) + '</span><span class="st-tx"><b>' + esc(t) + "</b><small>" + esc(s) + "</small></span></button>").join("");
  box.querySelectorAll(".starter").forEach(b => b.onclick = () => {
    const p = $("prompt"); p.value = b.dataset.text; resize(); p.focus(); p.setSelectionRange(p.value.length, p.value.length);
  });
}

// ---------------------------------------------------------------- messages
const seen = new Map(); let seenChat = null;
// Finished messages keep their drawn row while nothing about them changes, so redrawing a long chat (each time a message
// is sent or a reply lands) only builds what is new; rows already on screen are left in place.
const ROWS = new WeakMap();
function rowSig(m, c, lastA, lastU) {
  return [m.role, m.content, m.notice ? 1 : 0, m.mode || "", m.weather ? 1 : 0, m.versions ? m.versions.length + ":" + m.vi : "",
    m.images ? m.images.map(im => im.thumb ? 1 : 0).join("") : "", m.file ? m.file.name : "", m === lastA ? "A" : "", m === lastU ? "U" : "",
    m === lastU && gen && gen.chatId === c.id ? "g" : "", speaking && speaking.id === m.id ? "s" : "", m.sources ? m.sources.length : 0].join("\u0001");
}
function nearBottom() { const s = $("scroll"); return s.scrollHeight - s.scrollTop - s.clientHeight < 140; }
function updateToBottom() { const c = current(); $("toBottom").classList.toggle("show", !!(c && c.messages.length) && !nearBottom()); }
function mkBtn(icon, label, fn) { const b = document.createElement("button"); b.type = "button"; b.className = "icon-btn"; b.innerHTML = ic(icon); b.setAttribute("aria-label", label); b.title = label; b.onclick = () => fn(b); return b; }
function extOf(n) { const m = /\.([A-Za-z0-9]+)$/.exec(n || ""); return m ? m[1].slice(0, 4) : "txt"; }
function isFailure(m) { return !m.pending && /^\*\*Request failed:\*\*/.test(m.content || ""); }

// A reply is drawn block by block: only blocks whose markup changed are replaced, so long replies stay smooth while they stream.
function paintAnswer(el, text) {
  const htmls = mdBlocks(streamSafe(text)), fresh = [];
  for (let i = 0; i < htmls.length; i++) {
    const cur = el.children[i];
    if (cur && cur.__h === htmls[i]) continue;
    TPL.innerHTML = htmls[i];
    const node = TPL.content.firstElementChild;
    if (!node) continue;
    node.__h = htmls[i];
    if (cur) cur.replaceWith(node); else el.append(node);
    fresh.push(node);
  }
  while (el.children.length > htmls.length) el.lastElementChild.remove();
  return fresh;
}
function measure(el, fresh) { let total = 0; for (const k of el.children) { if (k.__len === undefined || fresh.indexOf(k) !== -1) k.__len = k.textContent.length; k.__off = total; total += k.__len; } return total; }
// The glowing dot that follows the newest text.
function placeCaret(el) {
  const old = el.querySelector(".caret");
  let n = el.lastElementChild;
  while (n) {
    const tag = n.tagName, k = n.lastElementChild;
    if ((tag === "UL" || tag === "OL" || tag === "LI" || tag === "BLOCKQUOTE") && k && /^(UL|OL|LI|P|BLOCKQUOTE|DIV|H[1-6])$/.test(k.tagName)) { n = k; continue; }
    if (tag === "DIV" && n.classList.contains("codeblock")) n = n.querySelector("pre code");
    break;
  }
  if (n && !/^(P|LI|H[1-6]|CODE|BLOCKQUOTE)$/.test(n.tagName)) n = null;
  if (old && old !== n) old.classList.remove("caret");
  if (n) n.classList.add("caret");
}
function render() { renderChat(); syncFollowups(); }   // the chat, then the follow-up questions under the newest reply
function renderChat() {
  const sc = $("scroll"), stick = forceScroll || nearBottom(); forceScroll = false;
  renderHistory(); syncTitle();
  const c = current(), chatting = !!(c && c.messages.length), root = $("inner");
  $("main").classList.toggle("chatting", chatting); syncTabbar();
  const temp = !!(c && c.temp); $("main").classList.toggle("temp", temp); $("tempBtn").setAttribute("aria-pressed", String(temp));
  $("tempBtn").setAttribute("aria-label", temp ? (chatting ? "End temporary chat" : "Turn off temporary chat") : "Temporary chat");
  if ((c ? c.id : null) !== seenChat) { seenChat = c ? c.id : null; seen.clear(); if (c) c.messages.forEach(m => seen.set(m.id, -1e9)); }
  if (!chatting) {
    const w = root.querySelector(".welcome");
    if (!w || w.dataset.temp !== String(temp)) { root.textContent = ""; welcome(root, temp); }
    else if (!temp) { const g = root.querySelector(".greet"), gs = root.querySelector(".greet-sub"); if (g && g.textContent !== greeting()) { g.textContent = greeting(); if (gs) gs.textContent = greetSub(); } }
    updateToBottom(); syncComposer(); return;
  }
  const rows = [], rev = c.messages.slice().reverse(), lastA = rev.find(m => m.role === "assistant"), lastU = rev.find(m => m.role === "user");
  for (const m of c.messages) {
    const now = performance.now();
    if (!seen.has(m.id)) seen.set(m.id, now);
    const age = now - seen.get(m.id), sig = m.pending ? null : rowSig(m, c, lastA, lastU), hit = sig && ROWS.get(m);
    if (hit && hit.sig === sig) {
      if (age >= 450 && hit.el.classList.contains("fresh")) { hit.el.classList.remove("fresh"); hit.el.style.removeProperty("--age"); }
      rows.push(hit.el); continue;
    }
    const row = document.createElement("article");
    if (sig) ROWS.set(m, { sig, el: row });
    row.className = "msg " + m.role + (age < 450 ? " fresh" : "") + (m.pending ? " pending" : "") + (m === lastA ? " last" : "");
    if (age < 450) row.style.setProperty("--age", -age + "ms");
    row.dataset.id = m.id;
    if (m.role === "user") {
      if (m.images && m.images.length) {
        const g = document.createElement("div"); g.className = "uimgs";
        m.images.forEach(im => {
          const bt = document.createElement("button"); bt.type = "button"; bt.className = "uimg" + (m.images.length === 1 ? " solo" : "");
          if (im.thumb) { bt.setAttribute("aria-label", "Open image"); const img = document.createElement("img"); img.alt = ""; img.src = im.thumb; bt.append(img); bt.onclick = () => openLightbox(im); }
          else { bt.innerHTML = ic("image"); bt.disabled = true; bt.title = "Image no longer stored on this device"; }
          g.append(bt);
        });
        row.append(g);
      }
      if (m.file) { const f = document.createElement("div"); f.className = "ufile"; f.title = m.file.name; f.innerHTML = '<span class="fi">' + esc(extOf(m.file.name)) + '</span><span class="nm"></span>'; f.querySelector(".nm").textContent = m.file.name; row.append(f); }
      if (m.content) {
        const b = document.createElement("div"); b.className = "bubble"; b.dir = "auto"; setLang(b, m.content); b.textContent = m.content; row.append(b);
        if (m.content.length > 1100 || m.content.split("\n").length > 14) {
          b.classList.add("long");
          const more = document.createElement("button"); more.type = "button"; more.className = "more-btn"; more.textContent = "Show more"; more.setAttribute("aria-expanded", "false");
          more.onclick = () => { const open = b.classList.toggle("long"); more.textContent = open ? "Show more" : "Show less"; more.setAttribute("aria-expanded", String(!open)); };
          row.append(more);
        }
      }
      const acts = document.createElement("div"); acts.className = "acts";
      if (m.content) acts.append(mkBtn("copy", "Copy message", b => copy(m.content, b)));
      if (m === lastU && !(gen && gen.chatId === c.id)) acts.append(mkBtn("pencil", "Edit message", startEdit));
      if (acts.children.length) row.append(acts);
      rows.push(row); continue;
    }
    const answer = document.createElement("div"); answer.dir = "auto"; setLang(answer, m.content);
    answer.className = "answer" + (m.notice ? " notice" : isFailure(m) ? " failed" : "");
    if (m.pending) {
      const text = flowText(m);
      if (text) {
        answer.classList.add("streaming"); answer.style.setProperty("--t", Math.round(performance.now() % 1400));
        const fresh = paintAnswer(answer, text); placeCaret(answer);
        if (flow && flow.a === m) { flow.len = measure(answer, fresh); flow.el = answer; flow.painted = text; flow.marks.length = 0; }
      } else {
        const th = document.createElement("div"); th.className = "thinking"; th.setAttribute("role", "status");
        th.innerHTML = markSvg("spin") + '<span class="shimmer"></span>'; th.querySelector(".shimmer").textContent = m.status || "Thinking"; row.append(th);
      }
      if (m.weather) row.append(weatherCard(m.weather));
      row.append(answer);
    } else {
      if (m.notice || isFailure(m)) answer.innerHTML = ic(m.notice ? "info" : "alert") + "<div>" + renderMarkdown(m.notice ? m.content : scrub(m.content)) + "</div>";
      else answer.innerHTML = renderMarkdown(m.content) + (m.sources ? sourcesHtml(m.sources) : "");
      if (m.weather) row.append(weatherCard(m.weather));
      row.append(answer);
      if (m.content) {
        const acts = document.createElement("div"); acts.className = "acts";
        if (m === lastA && m.versions && m.versions.length > 1) acts.append(versionSwitch(m));
        if (!m.notice) acts.append(mkBtn("copy", "Copy reply", b => copy(fixDigitsMd(m.content), b)));
        if (!m.notice && !isFailure(m)) acts.append(mkBtn("share", "Share reply", b => shareReply(m, b)));   // as shown: 6H₂O, not ৬H₂O
        if (TTS && !m.notice && !isFailure(m)) { const sb = mkBtn("speaker", "Read aloud", () => speak(m)); sb.classList.add("speak"); sb.insertAdjacentHTML("beforeend", '<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' + ic("stop", "stopi")); setSpeakBtn(sb, !!speaking && speaking.id === m.id); acts.append(sb); }
        if (m === lastA) acts.append(mkBtn("retry", "Try again", retry));
        if (m.mode === "high" && !m.notice) { const tag = document.createElement("span"); tag.className = "model-tag"; tag.title = "Answered in High mode"; tag.textContent = "High"; tag.insertAdjacentHTML("afterbegin", ic("gem")); acts.append(tag); }
        row.append(acts);
      }
    }
    rows.push(row);
  }
  let at = 0;
  for (const el of rows) { const cur = root.children[at]; if (cur !== el) root.insertBefore(el, cur || null); at++; }
  while (root.children.length > rows.length) root.lastElementChild.remove();
  if (stick) sc.scrollTop = sc.scrollHeight;
  updateToBottom(); syncComposer();
}
$("inner").addEventListener("click", e => {
  const w = e.target.closest && e.target.closest(".wrap-code");
  if (w) { const on = w.closest(".codeblock").classList.toggle("wrap"); w.setAttribute("aria-pressed", String(on)); return; }
  const b = e.target.closest && e.target.closest(".copy-code"); if (!b) return;
  const code = b.closest(".codeblock"), el = code && code.querySelector("pre code");
  if (el) copy(el.textContent, b);
});

// ---------------------------------------------------------------- composer
function compose(text, file) { if (!file) return text; return (text || "Please take a look at this file.") + "\n\nFile: " + file.name + "\n" + FENCE + extOf(file.name).toLowerCase() + "\n" + file.text + "\n" + FENCE; }
// The message box is a slim pill while the text fits on one line beside the buttons. The text is measured (not wrapped
// and then checked), so the box opens just before the words would need a second line.
const MEASURE = document.createElement("canvas").getContext("2d");
function pillFits(p) {
  const v = p.value; if (!v) return true; if (v.indexOf("\n") !== -1) return false;
  const f = $("form"), fs = getComputedStyle(f), cs = getComputedStyle(p), px = v => parseFloat(v) || 0;
  const room = f.clientWidth - px(fs.paddingLeft) - px(fs.paddingRight) - 2 * px(fs.columnGap) - $("barLeft").offsetWidth - $("barRight").offsetWidth - px(cs.paddingLeft) - px(cs.paddingRight) - 3;
  MEASURE.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  return MEASURE.measureText(v).width <= room;
}
function resize() {
  const p = $("prompt"); syncComposer();   // the send button first: it takes room from the text
  $("form").classList.toggle("tall", !!(attachment || images.length || editing) || !pillFits(p));
  const prev = p.style.height; p.style.height = "auto";
  const h = Math.min(p.scrollHeight, 220);
  if (prev && !RM.matches) { p.style.height = prev; void p.offsetHeight; }
  p.style.height = h + "px";
}
function syncComposer() {
  const p = $("prompt"), n = compose(p.value.trim(), attachment).length, cnt = $("count"), here = busyHere();
  cnt.textContent = n.toLocaleString() + " / " + MAXLEN.toLocaleString(); cnt.classList.toggle("show", n > MAXLEN * .8); cnt.classList.toggle("over", n > MAXLEN);
  const empty = !p.value.trim() && !attachment && !images.length, send = $("send");
  $("stop").hidden = !here; send.hidden = here || (empty && !!SR); $("form").classList.toggle("busy", here);   // send shows beside the voice button once there is something to send (always, where voice typing is unavailable)
  send.disabled = !!gen || empty || n > MAXLEN;
  send.title = gen && !here ? "Wind is replying in another chat" : n > MAXLEN ? "Too long to send" : "Send message";
  const g = gen && !here ? genChat() : null;
  $("genBar").hidden = !g; if (g) $("genText").textContent = "Wind is replying in “" + g.title + "”";
}
function renderChips() {
  const box = $("chips"); box.textContent = "";
  $("editBanner").hidden = !editing; $("form").classList.toggle("editing", editing);
  const xBtn = (label, fn) => { const x = document.createElement("button"); x.type = "button"; x.innerHTML = ic("x"); x.setAttribute("aria-label", label); x.title = label; x.onclick = fn; return x; };
  if (attachment) {
    const ch = document.createElement("div"); ch.className = "chip"; ch.title = attachment.name; ch.innerHTML = '<span class="fi">' + esc(extOf(attachment.name)) + '</span><span class="nm"></span>'; ch.querySelector(".nm").textContent = attachment.name;
    ch.append(xBtn("Remove file", () => { attachment = null; renderChips(); resize(); focusPrompt(); })); box.append(ch);
  }
  images.forEach((im, k) => {
    const ch = document.createElement("div"); ch.className = "chip img"; ch.title = "Image " + (k + 1);
    const img = document.createElement("img"); img.alt = ""; img.src = im.thumb; ch.append(img);
    ch.append(xBtn("Remove image", () => { images.splice(k, 1); renderChips(); resize(); focusPrompt(); })); box.append(ch);
  });
}
function lastUserIndex(c) { if (!c) return -1; for (let i = c.messages.length - 1; i >= 0; i--) if (c.messages[i].role === "user") return i; return -1; }
function startEdit() {
  const c = current(); if (gen || !c) { if (gen) toast("Wait for Wind to finish replying"); return; }
  const i = lastUserIndex(c); if (i < 0) return;
  const m = c.messages[i]; editing = true; attachment = m.file ? { name: m.file.name, text: m.file.text } : null; images = restoreImgs(m);
  const p = $("prompt"); p.value = m.content || ""; renderChips(); resize(); p.focus(); p.setSelectionRange(p.value.length, p.value.length);
}
function cancelEdit() { if (!editing) return; editing = false; attachment = null; images = []; $("prompt").value = ""; renderChips(); resize(); }

// ---------------------------------------------------------------- smooth streaming
// While the AI searches, the thinking line says what it is doing. The reply then plays back letter by letter from its final
// layout (see playSync below), block by block as each block is finished, so nothing reflows and the view glides along.
let flow = null; const FADE = 480, ease = x => x >= 1 ? 1 : 1 - Math.pow(1 - x, 2.2);
function flowText(m) { return flow && flow.a === m ? String(m.content || "").slice(0, flow.shown) : String(m.content || ""); }
function flowKick() { if (flow && !flow.raf && !document.hidden) flow.raf = requestAnimationFrame(flowStep); }
function flowStep(now) {
  const f = flow; if (!f) return; f.raf = 0;
  const total = f.a.content.length, dt = f.last ? Math.min(64, now - f.last) : 16; f.last = now;
  if (!RM.matches) {                                                // finished blocks play back while the rest is written
    if (playStep(f, now, dt)) { f.shown = total; if (f.resolve) { const r = f.resolve; f.resolve = null; r(); } return; }
    if (f.busy) f.raf = requestAnimationFrame(flowStep);
    return;
  }
  if (f.shown < total) { let s = Math.min(total, f.shown + Math.max(1, Math.round((total - f.shown) * (1 - Math.exp(-dt / 30))))); while (s < total && !cutOk(f.a.content, s)) s++; f.shown = s; }
  flowPaint(f, now);
  if (f.shown < total || f.marks.length > 0) f.raf = requestAnimationFrame(flowStep);
  else if (f.done && f.resolve && f.shown >= total) { const r = f.resolve; f.resolve = null; r(); }
}
// ---- playback
// Settled blocks are laid out once in their final form, every word already in place but hidden, then revealed word by
// word at an even pace (each word fades in) while the reply's box grows smoothly to the newest line. A block is settled
// once the next one has begun (the last block waits until the reply is complete), so lists, tables and code appear whole
// and nothing that is already on screen ever moves. Text is cut only between words (inside a very long word, such as a
// link, only between whole characters: see cutOk), and revealing a word only changes its visibility. The text itself
// never changes while it plays, so the browser never re-shapes it frame by frame and every script keeps its exact shapes.
const PLAY_CPS = 300, PLAY_MAX = 4500, LONG_WORD = 20;
const mdNorm = s => String(s || "").replace(/[     ]/g, " ").replace(/[‐‑]/g, "-");
function flowPlan(f) { return Math.min(PLAY_MAX, f.a.content.length / PLAY_CPS * 1000); }   // rough length, for the safety timer
function playBlocks(f) {
  const blocks = mdBlocks(mdNorm(f.a.content));
  if (f.done && f.a.sources && f.a.sources.length) blocks.push(sourcesHtml(f.a.sources));
  return blocks;
}
function playSync(f, el) {
  const blocks = playBlocks(f), ready = f.done ? blocks.length : 0;   // the whole reply first, then one smooth pass
  let r = f.rv;
  if (r && (r.el !== el || r.htmls.some((h, i) => blocks[i] !== h))) {   // redrawn (or a settled block changed): lay out again and catch up
    f.keep = { done: r.done, h: r.el === el ? r.h : 0, stick: r.stick }; f.rv = r = null;
  }
  if (!r) {
    if (ready <= 0) return;                                               // nothing settled yet: the thinking line stays
    const k = f.keep; f.keep = null;
    const stick = k ? k.stick : (forceScroll || nearBottom());            // read before anything is laid out
    // the reply's box takes the thinking line's place at the same height, so the swap doesn't nudge the page
    const th = el.parentElement && el.parentElement.querySelector(".thinking"), h0 = k ? k.h : th ? th.offsetHeight : 0; if (th) th.remove();
    el.classList.remove("streaming"); el.textContent = ""; el.style.overflow = "hidden"; el.style.height = h0 + "px"; setLang(el, f.a.content);
    r = f.rv = { el, items: [], total: 0, idx: 0, done: 0, h: h0, stick, last: null, htmls: [], all: false, budget: 0 };
    playAppend(r, blocks, ready);
    if (k) { playReveal(r, Math.min(r.total, k.done), false); r.budget = r.done; }
    return;
  }
  playAppend(r, blocks, ready);
}
// A text's reveal pieces, as [start, end) offsets: each word with the spaces after it, and a very long word (a link, a run
// of Chinese or Japanese) in runs of a few whole characters.
function playPieces(t) {
  const out = [], re = /\S+\s*/g; let m, start = 0;
  while ((m = re.exec(t))) {
    const end = m.index + m[0].length;
    if (m[0].trimEnd().length > LONG_WORD) for (let k = m.index + 6; k < end - 4; k++) if (k - start >= 6 && cutOk(t, k)) { out.push([start, k]); start = k; }
    out.push([start, end]); start = end;
  }
  if (!out.length) return [[0, t.length]];
  out[out.length - 1][1] = t.length; return out;
}
function playAppend(r, blocks, ready) {
  for (let i = r.htmls.length; i < ready; i++) {
    TPL.innerHTML = blocks[i]; const node = TPL.content.firstElementChild; r.htmls.push(blocks[i]);
    if (!node) continue;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), nodes = []; let n;
    while ((n = walker.nextNode())) if (n.data.trim()) nodes.push(n);
    for (const tn of nodes) {
      const t = tn.data, frag = document.createDocumentFragment();
      for (const [a, b] of playPieces(t)) { const w = document.createElement("span"); w.className = "rv-w"; w.textContent = t.slice(a, b); frag.append(w); r.items.push({ w, end: r.total + b }); }
      r.total += t.length; tn.replaceWith(frag);
    }
    r.el.append(node);
  }
  r.all = ready === blocks.length;
}
// Shows every piece that ends at or before `upto` (a count of characters).
function playReveal(r, upto, fade) {
  while (r.idx < r.items.length && r.items[r.idx].end <= upto) {
    const it = r.items[r.idx++]; it.w.className = fade ? "rv-w rv-on" : "rv-w rv-on rv-now"; r.last = it.w; r.done = it.end;
  }
}
// Returns true once the reply is complete, every letter is shown and the box has reached its full height.
function playStep(f, now, dt) {
  f.busy = false;
  const el = document.querySelector('.msg[data-id="' + f.a.id + '"] .answer');
  if (!el) return f.done;                                                 // the reply is in a chat that is not on screen
  if (!f.rv && BN.test(f.a.content) && !bnFontReady()) {                  // Bengali: a moment (at most) for its font to arrive
    if (!f.fontBy) f.fontBy = now + 1500;
    if (now < f.fontBy) { f.busy = true; return false; }
  }
  const nl = f.a.content.lastIndexOf("\n");                               // a block can only settle when a new line starts
  if ((f.rv && f.rv.el !== el) || (f.done ? !(f.rv && f.rv.all) : nl !== f.nl)) { f.nl = nl; playSync(f, el); }
  const r = f.rv;
  if (!r) return f.done && !f.a.content.trim();
  // an even pace, quicker when a lot is waiting, so the playback never trails far behind the writing
  const backlog = r.total - r.done, cps = f.done && r.all ? Math.max(PLAY_CPS, r.total / Math.min(3.5, Math.max(1.2, .9 + r.total / 1500))) : Math.max(PLAY_CPS, backlog / 1.4);
  r.budget = Math.min(r.total, Math.max(r.budget, r.done, r.done ? 0 : 1) + dt * cps / 1000);
  if (Math.floor(r.budget) > r.done) playReveal(r, Math.floor(r.budget), true);
  const sc = $("scroll"), top = el.getBoundingClientRect().top, full = r.all && r.done >= r.total, row = el.parentElement;
  let want = el.scrollHeight;
  if (!full && r.last) { const rects = r.last.getClientRects(); if (rects.length) want = Math.min(want, rects[rects.length - 1].bottom - top + 8); }
  r.h = Math.max(r.h, r.h + (want - r.h) * (1 - Math.exp(-dt / 55))); if (want - r.h < 1) r.h = want;
  const hpx = Math.ceil(r.h); if (hpx !== r.hpx) { r.hpx = hpx; el.style.height = hpx + "px"; }   // whole pixels, and only when it changes
  // keep following the newest line until the reader scrolls up themselves (the page shifting by itself doesn't count)
  if (r.stick && r.top !== undefined && sc.scrollTop < r.top - 4 && now - userScrollAt < 1200) r.stick = false;
  if (r.stick) { const gap = sc.scrollHeight - sc.clientHeight - sc.scrollTop; if (gap > 0) sc.scrollTop += gap > 600 ? gap : Math.max(1, gap * 0.28); r.top = sc.scrollTop; }
  updateToBottom();
  if (row) row.classList.toggle("writing", !f.done && r.done >= r.total);  // caught up: a soft dot says more is coming
  if (full && r.h >= el.scrollHeight - 0.5) { el.style.height = ""; el.style.overflow = ""; if (row) row.classList.remove("writing"); if (r.stick) forceScroll = true; return true; }
  f.busy = f.done || r.done < r.total || Math.abs(want - r.h) >= 0.5;
  return false;
}
function flowPaint(f, now) {
  const el = document.querySelector('.msg[data-id="' + f.a.id + '"] .answer');
  if (!el) { f.marks.length = 0; return; }             // the reply is being written in a chat that is not on screen
  const stick = nearBottom(), text = f.a.content.slice(0, f.shown);
  if (el !== f.el || text !== f.painted) {
    if (text && !el.classList.contains("streaming")) { el.classList.add("streaming"); const th = el.parentElement && el.parentElement.querySelector(".thinking"); if (th) th.remove(); }
    el.style.setProperty("--t", Math.round(performance.now() % 1400));
    const fresh = paintAnswer(el, text), len = measure(el, fresh);
    if (el === f.el && len > f.len) f.marks.push({ pos: f.len, end: len, t: now });
    f.len = len; f.el = el; f.painted = text;
    fadeApply(el, fresh, f, now); placeCaret(el);
  } else fadeApply(el, [], f, now);
  if (stick) { const sc = $("scroll"), gap = sc.scrollHeight - sc.clientHeight - sc.scrollTop; if (gap > 0) sc.scrollTop += RM.matches || gap > 400 ? gap : Math.max(1, gap * 0.16); }
  updateToBottom();
}
// New text fades in: the most recently revealed characters are wrapped in spans whose opacity follows their age.
function fadeApply(el, fresh, f, now) {
  while (f.marks.length && now - f.marks[0].t >= FADE) f.marks.shift();
  el.querySelectorAll(".fd").forEach(sp => { const o = ease((now - Number(sp.dataset.t)) / FADE); if (o >= 1) sp.replaceWith(...sp.childNodes); else sp.style.opacity = o; });
  if (!f.marks.length || RM.matches) { f.marks.length = 0; return; }
  const from = f.marks[0].pos;
  for (const node of fresh) {
    if (node.__off + node.__len <= from) continue;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), texts = []; let off = node.__off, n;
    while ((n = walker.nextNode())) { const L = n.data.length; if (off + L > from) texts.push([n, off]); off += L; }
    for (const pair of texts) {
      const tn = pair[0], base = pair[1], s = tn.data, frag = document.createDocumentFragment(); let i = 0;
      for (const mk of f.marks) {
        const a = Math.max(mk.pos - base, i), b = Math.min(mk.end - base, s.length); if (b <= a) continue;
        if (a > i) frag.append(s.slice(i, a));
        const span = document.createElement("span"); span.className = "fd"; span.dataset.t = mk.t; span.style.opacity = ease((now - mk.t) / FADE); span.textContent = s.slice(a, b); frag.append(span); i = b;
      }
      if (i === 0) continue;
      if (i < s.length) frag.append(s.slice(i));
      tn.replaceWith(frag);
    }
  }
}
// When the AI has finished sending, let the reveal catch up (quickly) before the reply is finalised.
function flowDrain() {
  const f = flow; if (!f) return Promise.resolve(); f.done = true;
  return new Promise(res => {
    f.resolve = res;
    if (document.hidden) { f.shown = f.a.content.length; f.resolve = null; res(); return; }
    const play = RM.matches ? 0 : flowPlan(f);
    flowKick();
    setTimeout(() => { if (f.resolve) { f.shown = f.a.content.length; const r = f.resolve; f.resolve = null; r(); } }, play + 2500);
  });
}
// When the reader last scrolled by hand (wheel, touch, scrollbar or keys): only that stops the reply following itself.
let userScrollAt = -1e9; const markUserScroll = () => { userScrollAt = performance.now(); };
["wheel", "touchstart", "touchmove", "pointerdown"].forEach(t => $("scroll").addEventListener(t, markUserScroll, { passive: true }));
document.addEventListener("keydown", e => { const t = e.target && e.target.tagName; if (!/^(INPUT|TEXTAREA|SELECT)$/.test(t || "") && /^(PageUp|PageDown|ArrowUp|ArrowDown|Home|End| )$/.test(e.key)) markUserScroll(); });
function flowSnap() { const f = flow; if (!f) return; f.shown = f.a.content.length; if (f.resolve) { const r = f.resolve; f.resolve = null; r(); } }
document.addEventListener("visibilitychange", () => { if (!document.hidden) flowKick(); });

// ---------------------------------------------------------------- sending
function parseEvent(raw, c, a) {
  let data = ""; for (const line of raw.split(/\r?\n/)) if (line.startsWith("data:")) data += line.slice(5).trim();
  if (!data || data === "[DONE]") return;
  let ev; try { ev = JSON.parse(data); } catch (e) { return; }
  if (ev.event_type === "wind.weather") return;   // no weather card in the new design; the answer itself uses the forecast
  if (ev.event_type === "wind.sources") {
    const s = cleanSources(ev.sources); if (!s) return;
    a.sources = s;
    const names = s.map(x => hostOf(x.url)).filter((h, i, l) => l.indexOf(h) === i);
    a.status = "Reading " + names.slice(0, 2).join(", ") + (names.length > 2 ? " and " + (names.length - 2) + " more" : "");
    const sh = document.querySelector(".msg.pending .thinking .shimmer"); if (sh) sh.textContent = a.status;
    announce(a.status); return;
  }
  if (ev.event_type === "wind.status" && typeof ev.text === "string") { a.status = clip(ev.text, 80); const sh = document.querySelector(".msg.pending .thinking .shimmer"); if (sh) sh.textContent = a.status; announce(a.status); return; }
  if (ev.event_type === "error" && ev.error && ev.error.notice && !a.content) throw Object.assign(new Error(ev.error.message || "Something went wrong. Please try again."), { notice: true });
  if (ev.event_type === "step.delta" && ev.delta && ev.delta.type === "text" && typeof ev.delta.text === "string") { a.content += ev.delta.text; if (!RM.matches) { const n = (a.content.match(/\S+/g) || []).length; a.status = "Writing · " + n + " word" + (n === 1 ? "" : "s"); const sh = document.querySelector(".msg.pending .thinking .shimmer"); if (sh) sh.textContent = a.status; } flowKick(); }
  if (ev.event_type === "error") throw new Error((ev.error && ev.error.message) || "The AI service returned an error");
}
// Whatever a provider says in an error, its own name, model ids, hostnames and keys never reach the screen:
// they are replaced by Wind's name.
function scrub(msg) {
  const name = "Wind", keep = m => name + (/[.:,]$/.test(m) ? m.slice(-1) : "");
  return String(msg || "")
    .replace(/AIza[0-9A-Za-z_-]{20,}|nvapi-[0-9A-Za-z_-]{20,}|gsk_[0-9A-Za-z]{20,}|sk-or-[0-9A-Za-z-]{20,}/g, "[redacted]")
    .replace(/[\w.-]*(?:googleapis\.com|groq\.com|openrouter\.ai|nvidia\.com)[\w.\/:-]*/gi, "the service")
    .replace(/\b(?:models\/)?(?:google|nvidia|openai|qwen|meta|meta-llama|mistralai|minimaxai|deepseek-ai|moonshotai|z-ai|stepfun-ai|openrouter|microsoft|ibm|writer|poolside|anthropic|x-ai|cohere)\/[\w.:-]+/gi, keep)
    .replace(/\b(?:models\/)?(?:gemini|gemma|gpt|llama|qwen|nemotron|mixtral|mistral|deepseek|kimi|minimax|claude|grok|glm)[-.:\w]*\d[-.:\w]*/gi, keep)
    .replace(/\b(?:Google AI Studio|Google Cloud|Vertex AI|Google|Gemini|GroqCloud|Groq|OpenRouter|NVIDIA NIM|NVIDIA|Nemotron|Gemma|OpenAI)\b/gi, name)
    .replace(new RegExp("\\b(" + name + ")(?:[ ,]+\\1\\b)+", "g"), "$1")
    .slice(0, 400);
}
function retry() {
  const c = current(); if (!c) return;
  if (gen) { toast("Wait for Wind to finish replying"); return; }
  const i = lastUserIndex(c); if (i < 0) return;
  const m = c.messages[i], old = c.messages[i + 1];
  const keep = old && old.role === "assistant" && !old.pending ? (old.versions ? (old.versions[old.vi] = snapshot(old), old.versions) : [snapshot(old)]).filter(goodVersion) : [];
  if (speaking && old && speaking.id === old.id) stopSpeaking();
  c.messages.splice(i);   // the question is asked again from the same point
  sendMessage(m.content, m.file, restoreImgs(m), keep);
}
function buildHistory(c, upto) {
  const out = [];
  for (let i = 0; i < upto; i++) {
    const m = c.messages[i]; if (!m || m.pending || m.notice) continue;
    const t = m.role === "user" ? (compose(m.content || "", m.file) + (m.images && m.images.length ? "\n\n[Shared " + m.images.length + " image" + (m.images.length > 1 ? "s" : "") + " here]" : "")).trim() : String(m.content || "").replace(/\n\n\*(?:Generation stopped\.|Reply interrupted: [^*]*)\*$/, "");
    if (!t.trim()) continue;
    if (m.role !== "user" && (/^\*\*Request failed:\*\*/.test(t) || t === "Generation stopped." || t === "The AI returned an empty response.")) continue;
    out.push({ role: m.role === "user" ? "user" : "assistant", content: t.slice(0, 12000) });
  }
  const keep = []; let total = 0;
  for (let i = out.length - 1; i >= 0 && keep.length < 30; i--) { total += out[i].content.length; if (total > 24000) break; keep.unshift(out[i]); }
  while (keep.length && keep[0].role !== "user") keep.shift();
  return keep;
}
async function sendMessage(text, file, imgs, keep) {
  imgs = imgs || []; text = String(text || "").trim();
  if (gen || (!text && !file && !imgs.length)) return false;
  let full = compose(text, file);
  if (!full && imgs.length) full = imgs.length > 1 ? "What do you see in these images?" : "What do you see in this image?";
  if (full.length > MAXLEN) { toast("Too long to send"); return false; }
  let c = current(); if (!c) { c = blankChat(); chats.unshift(c); activeId = c.id; }
  if (!c.messages.length) { const t = (text || (file && file.name) || (imgs.length ? "Image" : "New chat")).replace(/\s+/g, " "); c.title = t.length > 42 ? clipWords(t, 42) + "…" : t; }
  const hist = buildHistory(c, c.messages.length);
  c.messages.forEach(x => { if (x.versions) { delete x.versions; delete x.vi; } });   // the chat moves on: keep only the replies shown
  const um = { id: uid(), role: "user", content: text };
  if (file) um.file = { name: file.name, text: file.text };
  if (imgs.length) { um.images = imgs.map(x => ({ id: x.id, thumb: x.thumb })); imgs.forEach(x => FULL.set(x.id, { mime: x.mime, data: x.data })); }
  c.messages.push(um);
  const a = { id: uid(), role: "assistant", content: "", pending: true }; if (high) a.mode = "high"; c.messages.push(a); c.updatedAt = Date.now();
  // keep the newest chat first so the 40-chat limit drops the oldest
  const at = chats.indexOf(c); if (at > 0) { chats.splice(at, 1); chats.unshift(c); }
  const controller = new AbortController();
  gen = { chatId: c.id, msgId: a.id, controller };
  flow = { a, shown: 0, done: false, marks: [], len: 0, el: null, painted: null, raf: 0, last: 0, resolve: null };
  forceScroll = true; save(); syncHash(); render(); resize(); announce("Wind is thinking");
  const payload = { message: full, stream: true, ui: 2 }; if (a.mode === "high") payload.mode = "high";   // ui 2: this page draws the sources itself
  if (imgs.length) payload.images = imgs.map(x => ({ mime: x.mime, data: x.data }));
  if (hist.length) payload.history = hist;
  try {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
    if (!response.ok) {
      let data = {}; try { data = await response.json(); } catch (e) {}
      if (data.code === "busy") throw Object.assign(new Error("**Slow down a little.** " + (typeof data.error === "string" && data.error.length < 200 ? data.error.replace(/[*_<>]/g, "") : "Try again in a few seconds.")), { notice: true });
      throw new Error(data.providerMessage || data.error || "Request failed: " + response.status);
    }
    if (!response.body) throw new Error("Your browser cannot read streamed responses.");
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
    while (true) {
      const part = await reader.read(); if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true }); buffer = buffer.replace(/\r\n/g, "\n");
      let boundary; while ((boundary = buffer.indexOf("\n\n")) !== -1) { const raw = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); parseEvent(raw, c, a); }
    }
    buffer += decoder.decode(); if (buffer.trim()) parseEvent(buffer, c, a);
    await flowDrain();
    if (!a.content.trim()) a.content = "The AI returned an empty response.";
  } catch (e) {
    if (e.name === "AbortError") a.content = a.content ? a.content + "\n\n*Generation stopped.*" : "Generation stopped.";
    else if (e.notice) { a.notice = true; a.content = e.message; }
    else {
      const msg = e instanceof TypeError ? "Couldn't reach Wind. Check your connection and try again." : scrub(e.message || "Please try again.");
      if (a.content.trim()) a.content += "\n\n*Reply interrupted: " + msg.replace(/[*_]/g, "") + "*"; else a.content = "**Request failed:** " + msg;
    }
  } finally {
    if (flow) { if (flow.raf) cancelAnimationFrame(flow.raf); flow = null; }
    delete a.status; a.pending = false; gen = null; c.updatedAt = Date.now();
    if (keep && keep.length) { a.versions = keep.concat([snapshot(a)]).slice(-MAX_VERSIONS); a.vi = a.versions.length - 1; }
    save();
    const here = activeId === c.id, alive = chats.indexOf(c) !== -1;
    render();
    if (here) { focusPrompt(); announce("Wind replied"); }
    if (alive && !a.notice && !isFailure(a) && !/Generation stopped/.test(a.content)) getFollowups(c, a, text);
    else if (alive && !a.notice) toast("Wind replied in “" + c.title.slice(0, 28) + (c.title.length > 28 ? "…" : "") + "”", { action: "View", onAction: () => openChat(c.id) });
    resize();
  }
  return true;
}

// ---------------------------------------------------------------- Instant / High
const PICK = $("modePick");
// Think deeper: one switch in the message box (it was the Instant / High menu at the top). Same setting, same request.
function syncSlide() {
  PICK.classList.toggle("high", high); PICK.setAttribute("aria-pressed", String(high));
  PICK.setAttribute("aria-label", high ? "Think deeper: on" : "Think deeper: off");
}
PICK.onclick = () => { setHigh(!high); toast(high ? "Think deeper is on: slower, more careful answers" : "Think deeper is off"); focusPrompt(); };
PICK.oncontextmenu = null;
const OLD_MODE_MENU = () => {
  if (openPop && openPop.anchor === PICK) { closePopover(); return; }
  const el = document.createElement("div"); el.className = "menu mode-menu"; el.setAttribute("role", "menu"); el.setAttribute("aria-label", "Choose how Wind answers");
  for (const [mode, title, sub] of [["instant", "Instant", "Answers right away"], ["high", "High", "Thinks longer, digs deeper"]]) {
    const b = document.createElement("button"); b.type = "button"; b.className = "mm-opt " + mode; b.setAttribute("role", "menuitemradio"); b.setAttribute("aria-checked", String((mode === "high") === high));
    b.innerHTML = '<span class="mm-ic ' + mode + '" aria-hidden="true">' + ic(mode === "high" ? "gem" : "bolt") + '</span><span class="mm-text"><span class="mm-title">' + title + '</span><span class="mm-sub">' + sub + '</span></span><span class="mm-check" aria-hidden="true">' + ic("check") + '</span>';
    b.onclick = () => {   // the check moves first, then the menu closes
      const want = mode === "high";
      el.querySelectorAll(".mm-opt").forEach(x => x.setAttribute("aria-checked", String(x === b)));
      if (want !== high) { PICK.classList.remove("moved"); void PICK.offsetWidth; PICK.classList.add("moved"); setHigh(want); }
      setTimeout(() => { if (openPop && openPop.el === el) closePopover(); focusPrompt(); }, RM.matches ? 0 : 200);
    };
    el.append(b);
  }
  document.body.append(el);
  openPopover(el, PICK, { temp: true, align: "center", side: "bottom" });
};
function setHigh(on) { high = !!on; try { localStorage.setItem(HIGH_KEY, high ? "1" : "0"); } catch (e) {} syncSlide(); announce(high ? "High mode" : "Instant mode"); }

// ---------------------------------------------------------------- attachments + voice
function encodeImg(bmp, max, q) { const sc = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc)), cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h); return cv.toDataURL("image/jpeg", q).split(",")[1] || ""; }
async function addImage(f) {
  if (images.length >= 4) { toast("Up to 4 images per message"); return; }
  if (f.size > 30e6) { toast("Image is too large"); return; }
  let bmp; try { bmp = await createImageBitmap(f); } catch (e) { toast("Couldn't read that image"); return; }
  let data = ""; for (const pair of [[1280, .82], [1024, .78], [1024, .68], [896, .62], [768, .58]]) { data = encodeImg(bmp, pair[0], pair[1]); if (data.length <= 165000) break; }
  const thumb = "data:image/jpeg;base64," + encodeImg(bmp, 360, .72); if (bmp.close) bmp.close();
  if (images.length >= 4) { toast("Up to 4 images per message"); return; }
  images.push({ id: uid(), mime: "image/jpeg", data, thumb }); renderChips(); resize(); focusPrompt();
}
function restoreImgs(m) { return ((m && m.images) || []).map(im => { const f = FULL.get(im.id); if (f) return { id: im.id, mime: f.mime, data: f.data, thumb: im.thumb || ("data:" + f.mime + ";base64," + f.data) }; if (im.thumb) return { id: im.id, mime: "image/jpeg", data: im.thumb.split(",")[1], thumb: im.thumb }; return null; }).filter(Boolean); }
function openLightbox(im) { const f = FULL.get(im.id); $("lbImg").src = f ? "data:" + f.mime + ";base64," + f.data : im.thumb; $("lightbox").hidden = false; }
function closeLightbox() { $("lightbox").hidden = true; }
function takeFile(f) {
  if (!f) return;
  if (/^image\//.test(f.type || "") || /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(f.name || "")) { addImage(f); return; }
  if (!TEXT_EXT.test(f.name || "") && !/^text\//.test(f.type || "")) { toast("Text or code files only"); return; }
  if (f.size > 200000) { toast("File is too large"); return; }
  const r = new FileReader();
  r.onload = () => { const t = String(r.result || "").replace(/\r\n/g, "\n"); if (t.indexOf("\u0000") !== -1) { toast("Text or code files only"); return; } if (t.length > MAXLEN - 300) { toast("File is too large"); return; } attachment = { name: f.name || "file.txt", text: t }; renderChips(); resize(); focusPrompt(); };
  r.onerror = () => toast("Couldn't read file"); r.readAsText(f);
}
function hasFiles(e) { return Array.from((e.dataTransfer && e.dataTransfer.types) || []).indexOf("Files") !== -1; }
function toggleMic() {
  if (!SR) return;
  if (listening) { try { rec.stop(); } catch (e) {} return; }
  try { rec = new SR(); } catch (e) { toast("Voice input unavailable"); return; }
  const p = $("prompt"); let base = p.value; if (base && !/\s$/.test(base)) base += " ";
  rec.lang = navigator.language || "en-US"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  rec.onstart = () => { listening = true; $("form").classList.add("listening"); $("micBtn").setAttribute("aria-pressed", "true"); p.placeholder = "Listening…"; };
  rec.onresult = e => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; p.value = base + t; resize(); };
  rec.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Microphone is blocked"); else if (e.error === "no-speech") toast("Didn't catch that"); else if (e.error !== "aborted") toast("Voice input unavailable"); };
  rec.onend = () => { listening = false; $("form").classList.remove("listening"); $("micBtn").setAttribute("aria-pressed", "false"); p.placeholder = "Ask Wind"; resize(); focusPrompt(); };
  try { rec.start(); } catch (e) { toast("Voice input unavailable"); }
}

// ---------------------------------------------------------------- wiring
$("tempBtn").onclick = toggleTemp;
$("newChat").onclick = $("newChat2").onclick = $("brand").onclick = newChat;
$("menu").onclick = () => setSidebar(!sidebarIsOpen());
$("sideClose").onclick = () => setSidebar(false);
$("overlay").onclick = closeMobile;
if (WIDE.addEventListener) WIDE.addEventListener("change", () => { $("sidebar").classList.remove("open"); $("overlay").classList.remove("show"); syncMenu(); resize(); });
syncMenu();
$("search").oninput = renderHistory;
$("search").onkeydown = e => { if (e.key === "Escape") { e.stopPropagation(); $("search").value = ""; renderHistory(); focusPrompt(); } else if (e.key === "Enter") { const f = $("history").querySelector(".hopen"); if (f) f.click(); } };
$("chatMore").onclick = () => chatMenu(activeId, $("chatMore"), null, true);
$("genView").onclick = () => { if (gen) openChat(gen.chatId); };
$("settingsBtn").onclick = () => openPopover($("settingsMenu"), $("settingsBtn"), { side: "top", align: "start" });
document.querySelectorAll("#themeSeg button").forEach(b => { b.onclick = () => setThemePref(b.dataset.themePref, b); });
const SHORTCUTS = [["New chat", "mod+shift+o"], ["Search chats", "mod+k"], ["Show or hide the sidebar", "mod+shift+s"], ["Jump to the message box", "/"], ["Edit your last message", "↑"], ["Send", "Enter"], ["New line", "shift+Enter"], ["Show these shortcuts", "mod+/"]];
function openShortcuts() {
  const list = $("scList");
  if (!list.children.length) for (const s of SHORTCUTS) { const row = document.createElement("div"); row.className = "sc-row"; const l = document.createElement("span"); l.textContent = s[0]; const k = document.createElement("span"); k.className = "sc-keys"; keysLabel(s[1]).forEach(x => { const kb = document.createElement("kbd"); kb.textContent = x; k.append(kb); }); row.append(l, k); list.append(row); }
  openDialog($("shortcutsDialog"));
}
$("shortcutsBtn").onclick = openShortcuts;
if (TOUCH.matches) $("shortcutsBtn").hidden = true;
$("clearAllBtn").onclick = () => { closePopover(); deleteAllChats(); };
$("prompt").oninput = () => { resize(); if (BN.test($("prompt").value)) bnFontReady(); };
$("prompt").onkeydown = e => {
  const p = $("prompt");
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !TOUCH.matches) { e.preventDefault(); $("form").requestSubmit(); }
  else if (e.key === "Escape") { if (openPop) return; if (listening) { try { rec.stop(); } catch (x) {} } else if (editing) cancelEdit(); else p.blur(); }
  else if (e.key === "ArrowUp" && !p.value && !attachment && !images.length && !gen && !editing && lastUserIndex(current()) >= 0) { e.preventDefault(); startEdit(); }
};
$("prompt").addEventListener("paste", e => { const fs = Array.from((e.clipboardData && e.clipboardData.files) || []); if (fs.length) { e.preventDefault(); fs.forEach(takeFile); } });
$("form").onsubmit = e => {
  e.preventDefault();
  const p = $("prompt"), text = p.value;
  if (!text.trim() && !attachment && !images.length) return;
  if (gen) { toast(busyHere() ? "Wind is still replying" : "Wind is replying in another chat"); return; }
  if (compose(text.trim(), attachment).length > MAXLEN) { toast("Too long to send"); return; }
  if (listening && rec) { rec.onresult = null; try { rec.stop(); } catch (x) {} }
  if (editing) {
    const c = current(), i = lastUserIndex(c);
    if (c && i >= 0) c.messages.splice(i);
    editing = false;
  }
  const file = attachment, imgs = images; attachment = null; images = []; renderChips(); p.value = ""; resize();
  sendMessage(text, file, imgs);
};
$("editCancel").onclick = () => { cancelEdit(); focusPrompt(); };
$("stop").onclick = () => { if (gen) gen.controller.abort(); flowSnap(); };
$("attachBtn").onclick = () => $("fileIn").click();
$("fileIn").onchange = e => { Array.from(e.target.files || []).forEach(takeFile); e.target.value = ""; };
if (SR) $("micBtn").onclick = toggleMic; else $("micBtn").hidden = true;
let dragDepth = 0; const mainEl = $("main");
mainEl.addEventListener("dragenter", e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $("form").classList.add("drop"); });
mainEl.addEventListener("dragover", e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
mainEl.addEventListener("dragleave", e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("form").classList.remove("drop"); });
mainEl.addEventListener("drop", e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; $("form").classList.remove("drop"); Array.from(e.dataTransfer.files || []).forEach(takeFile); });
window.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("drop", e => { if (hasFiles(e)) e.preventDefault(); });
$("scroll").addEventListener("scroll", updateToBottom, { passive: true });
$("toBottom").onclick = () => $("scroll").scrollTo({ top: $("scroll").scrollHeight, behavior: RM.matches ? "auto" : "smooth" });
$("lightbox").onclick = closeLightbox;
document.addEventListener("keydown", e => {
  const el = document.activeElement, tag = (el && el.tagName) || "", typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || !!(el && el.isContentEditable), mod = e.ctrlKey || e.metaKey, k = (e.key || "").toLowerCase();
  if (e.key === "Escape") {
    if (openPop) { e.preventDefault(); closePopover(true); return; }
    if (!$("lightbox").hidden) { closeLightbox(); return; }
    if (document.querySelector("dialog[open]")) return;
    if (!WIDE.matches && sidebarIsOpen()) { setSidebar(false); return; }
    return;
  }
  if (document.querySelector("dialog[open]")) return;
  if (mod && e.shiftKey && k === "o") { e.preventDefault(); newChat(); }
  else if (mod && !e.shiftKey && !e.altKey && k === "k") { e.preventDefault(); if (!sidebarIsOpen()) setSidebar(true); setTimeout(() => { $("search").focus(); $("search").select(); }, WIDE.matches ? 0 : 60); }
  else if (mod && e.shiftKey && k === "s") { e.preventDefault(); setSidebar(!sidebarIsOpen()); }
  else if (mod && k === "/") { e.preventDefault(); openShortcuts(); }
  else if (k === "/" && !mod && !e.altKey && !typing) { e.preventDefault(); $("prompt").focus(); }
  else if (e.key === "?" && !mod && !typing) { e.preventDefault(); openShortcuts(); }
});
if (TOUCH.matches) $("prompt").setAttribute("enterkeyhint", "enter");

// a chat link, or #chess, typed or pasted into this tab's address bar opens it (the page itself only replaces the hash,
// which fires no event)
window.addEventListener("hashchange", () => {
  if (location.hash === "#chess") { if (!chessOn) openChess(); return; }
  const m = /^#c=([\w-]+)$/.exec(location.hash || "");
  if (m && chats.some(c => c.id === m[1])) openChat(m[1]);
});


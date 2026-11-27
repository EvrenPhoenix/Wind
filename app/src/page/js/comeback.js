// ============================================================================
// Wind, better to come back to: follow-up questions under each reply, a Share button, a dot on the Wisp tab when Wisp
// has something to say, and your chess record on the Games card.
// ============================================================================

// ---- follow-up questions under the newest reply
const FUP_CACHE = new WeakSet();
async function getFollowups(c, a, q) {
  return;   // no suggested follow-ups in the new design (and no extra AI call after every answer)
  if (!q || FUP_CACHE.has(a)) return; FUP_CACHE.add(a);
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch("/api/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, a: String(a.content || "").slice(0, 1800) }), signal: ctl.signal });
    clearTimeout(t); if (!r.ok) return;
    const j = await r.json(); if (!j || !Array.isArray(j.items) || !j.items.length) return;
    a.followups = j.items.filter(x => typeof x === "string").slice(0, 3); save(); syncFollowups();
  } catch (e) {}
}
function syncFollowups() {
  document.querySelectorAll(".fups").forEach(el => { if (!el.__keep) el.remove(); });
  const c = current(); if (!c || gen || currentTab !== "chat") return;
  const last = c.messages[c.messages.length - 1];
  if (!last || last.role !== "assistant" || !Array.isArray(last.followups) || !last.followups.length || last.notice) return;
  const row = document.querySelector('.msg[data-id="' + last.id + '"]'); if (!row) return;
  if (row.nextElementSibling && row.nextElementSibling.classList.contains("fups") && row.nextElementSibling.dataset.for === last.id) return;
  const box = document.createElement("div"); box.className = "fups"; box.dataset.for = last.id; box.setAttribute("role", "group"); box.setAttribute("aria-label", "Ask next");
  last.followups.forEach((t, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "fup"; b.style.animationDelay = (i * 70) + "ms";
    b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-reply"/></svg><span></span>'; b.lastChild.textContent = t;
    b.onclick = () => { if (gen) return; box.remove(); $("prompt").value = t; resize(); $("form").requestSubmit(); };
    box.append(b);
  });
  row.after(box);
  if (nearBottom()) { const sc = $("scroll"); requestAnimationFrame(() => sc.scrollTo({ top: sc.scrollHeight, behavior: RM.matches ? "auto" : "smooth" })); }
}

// ---- share a reply (the phone's share sheet, or a copy with a link back)
function shareText(m) {
  const t = String(m.content || "").replace(/```[\s\S]*?```/g, s => s.replace(/```\w*\n?/g, "")).replace(/[*_#>`]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return (t.length > 1400 ? t.slice(0, 1400).replace(/\s+\S*$/, "") + "…" : t) + "\n\n— from Wind, " + location.origin;
}
async function shareReply(m, b) {
  const text = shareText(m);
  if (navigator.share) { try { await navigator.share({ title: "From Wind", text }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  copy(text, b); toast("Copied, with a link to Wind. Paste it anywhere");
}

// ---- the Wisp tab says when Wisp has something to tell you (after a while away, Wisp texts first)
function syncWispNews() {
  const on = !!(window.WISP && WISP.hasNews && WISP.hasNews()) && currentTab !== "wisp";
  document.querySelectorAll('[data-tab="wisp"]').forEach(b => { b.classList.toggle("news", on); b.setAttribute("aria-label", on ? "Wisp, has something to tell you" : "Wisp"); });
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncWispNews(); });

// ---- your chess record on the Games card
function syncRecord() {
  const el = $("gmRecord"); if (!el) return;
  let s = null; try { s = JSON.parse(localStorage.getItem("wind-chess-score") || "null"); } catch (e) {}
  const you = s && +s.you || 0, bot = s && +s.team || 0;
  el.hidden = !(you || bot); el.innerHTML = "You <b>" + you + "</b> · Wind Bot <b>" + bot + "</b>";
}

// ============================================================================
// The chat home: the greeting (just the time of day) and one short line under it that suits the hour, picked fresh for
// each new chat. And "Delete all data": everything Wind keeps in this browser, gone, and the app starts like a first visit.
// ============================================================================
const GREET_SUBS = [
  ["Can't sleep? Let's talk.", "Up late? I'm here.", "Quiet hours are good for big ideas."],
  ["What's on your mind today?", "Let's make today a good one.", "Fresh start. What's first?"],
  ["What can I help with?", "How's your day going?", "What are we working on?"],
  ["How was your day?", "Winding down? Ask me anything.", "What's on your mind tonight?"],
];
let subPick = null;
function greetSub(fresh) {
  const h = new Date().getHours(), p = h < 5 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3, L = GREET_SUBS[p];
  if (fresh || !subPick || subPick.p !== p) subPick = { p, t: L[Math.floor(Math.random() * L.length)] };
  return subPick.t;
}
// faint streaks of wind drifting across the sky behind the greeting (only transform and opacity move: no repaints)
const HOME_BREEZE = '<div class="breeze" aria-hidden="true">' +
  '<svg class="gust g1" viewBox="0 0 600 60" preserveAspectRatio="none"><path d="M0 42C120 42 160 16 290 20S470 44 600 24"/><path d="M60 52C170 52 210 30 320 33S480 50 560 38"/></svg>' +
  '<svg class="gust g2" viewBox="0 0 600 60" preserveAspectRatio="none"><path d="M0 30C140 30 190 12 320 16S500 36 600 18"/></svg>' +
  '<svg class="gust g3" viewBox="0 0 600 60" preserveAspectRatio="none"><path d="M0 24C110 24 170 44 300 40S490 18 600 30"/><path d="M80 14C190 14 240 30 340 28S500 12 570 20"/></svg>' +
  "</div>";

// ---- Delete all data
function wipeAllData() {
  confirmBox({
    title: "Delete all data?",
    text: "This erases everything Wind has saved in this browser: all your chats, Wisp's memories and your chats with Wisp, your chess games and score, and your settings. Wind starts fresh, like your first visit. It can't be undone.",
    ok: "Delete everything",
    onOk: async () => {
      try { if (gen) gen.controller.abort(); } catch (e) {}
      try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
      try { localStorage.clear(); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}
      blockSaves();
      try { document.cookie.split(";").forEach(c => { const n = c.split("=")[0].trim(); if (n) document.cookie = n + "=; Max-Age=0; path=/"; }); } catch (e) {}
      const jobs = [];
      try { if (window.indexedDB && indexedDB.databases) jobs.push(indexedDB.databases().then(l => Promise.all(l.map(d => d.name && new Promise(r => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r; }))))); } catch (e) {}
      try { if (window.caches) jobs.push(caches.keys().then(k => Promise.all(k.map(n => caches.delete(n))))); } catch (e) {}
      try { if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(r => Promise.all(r.map(x => x.unregister())))); } catch (e) {}
      document.documentElement.classList.add("wiping");
      await Promise.race([Promise.allSettled(jobs), new Promise(r => setTimeout(r, 2500))]);
      location.replace(location.pathname + "?fresh=1");
    },
  });
}
// nothing still running on this page (Wisp, a reply, the chess clock) may save again before the reload
function blockSaves() { try { Storage.prototype.setItem = function () {}; } catch (e) {} }
// another open Wind tab deleted everything: this one lets go of what it holds too, instead of saving it back
window.addEventListener("storage", e => {
  if (e.key !== null || e.storageArea !== localStorage) return;
  blockSaves(); location.replace(location.pathname);
});
$("wipeBtn").onclick = () => { closePopover(); wipeAllData(); };
if (/[?&]fresh=1\b/.test(location.search)) {
  try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
  setTimeout(() => toast("All data deleted. Wind is fresh and new"), 600);
}

// ---- the installed app's Android navigation bar follows Wind's theme. Android takes that bar's colour only from the
// manifest (re-read when Chrome refreshes the installed app), so the page points to the manifest for its theme: Light
// or Dark get that colour; System gets none, and Android's own bar follows the phone, which is what System follows too.
function manifestUrl(pref) { return "/manifest.webmanifest?v=6" + (pref === "light" || pref === "dark" ? "&t=" + pref : ""); }
function syncManifest(pref) { const l = document.querySelector('link[rel="manifest"]'); if (l && l.getAttribute("href") !== manifestUrl(pref)) l.setAttribute("href", manifestUrl(pref)); }

// ---------------------------------------------------------------- start
(function start() {
  const m = /^#c=([\w-]+)$/.exec(location.hash || ""), wantChess = location.hash === "#chess";
  if (wantChess) setTimeout(openChess);   // after the chess code below has loaded
  if (m && chats.some(c => c.id === m[1])) activeId = m[1];
  else { const c = blankChat(); chats.unshift(c); activeId = c.id; }
  syncSlide();
  safeRender(); syncHash(); resize(); if (currentTab === "chat") focusPrompt();
  // the app shell is kept for offline use (your chats are already stored in this browser)
  if ("serviceWorker" in navigator && location.protocol === "https:") window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
})();


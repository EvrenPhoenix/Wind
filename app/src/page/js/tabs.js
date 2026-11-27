// ============================================================================
// Tabs: Chat, Wisp, Games. Phones get a floating tab bar (hidden inside a conversation, in a game and while typing);
// wide screens get the same three at the top of the sidebar. Each tab has its own link: #wisp, #games, #chess, and
// chats keep #c=… (currentTab is declared near the top of the script, so syncHash can leave the other tabs' links alone).
// ============================================================================
function syncTabbar() {   // always there on phones, in chats and while typing; only a chess game takes the whole screen
  const main = $("main"), tb = $("tabbar"); if (!tb) return;
  const hide = main.classList.contains("chess-mode");
  tb.classList.toggle("away", hide); main.classList.toggle("has-tabbar", !hide);
}
function syncGames() {
  let g = null; try { g = cg || chessLoad(); } catch (e) {}
  $("gmChessBadge").hidden = !(g && !g.over && g.moves && g.moves.length);
}
function showTab(tab, noHash) {
  currentTab = tab;
  const main = $("main");
  if (tab !== "games" && main.classList.contains("chess-mode")) closeChess();
  for (const t of ["chat", "wisp", "games"]) main.classList.toggle("tab-" + t, t === tab);
  document.querySelectorAll("[data-tab]").forEach(b => { if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (!noHash) {
    if (tab === "chat") syncHash();
    else { const h = "#" + tab; try { if (location.hash !== h) history.replaceState(null, "", location.pathname + location.search + h); } catch (e) {} }
  }
  if (tab === "chat") syncTitle();
  else if (tab === "wisp") document.title = "Wisp · Wind";
  else if (!main.classList.contains("chess-mode")) document.title = "Games · Wind";
  if (window.WISP) { if (tab === "wisp") WISP.enter(); else WISP.leave(); }
  if (tab === "games") { syncGames(); syncRecord(); }
  closeMobile(); syncTabbar(); syncWispNews(); syncFollowups();
}
document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
  const t = b.dataset.tab;
  if (t === currentTab) {
    if (t === "games" && chessOn) { closeChess(); showTab("games"); }
    else closeMobile();
    return;
  }
  showTab(t);
  if (t === "chat") { safeRender(); focusPrompt(); }
}));
$("gmChess").onclick = () => openChess();
$("backBtn").onclick = () => { closeChess(); showTab("games"); };
// The app is exactly as tall as the part of the screen you can see. On iPhones the keyboard covers the page instead of
// resizing it, and Safari scrolls the whole page up to show the box you type in: here the app shrinks to the visible
// part instead and the page stays put, so the message box and the tab bar sit right on top of the keyboard.
// --stable-h is the tallest the screen has been at this width: what sizes Wisp, so the keyboard never resizes him.
(function fitScreen() {
  const root = document.documentElement, vv = window.visualViewport;
  let w = innerWidth, tallest = 0;
  const fit = () => {
    const h = vv && vv.scale < 1.01 ? vv.height : innerHeight;
    if (innerWidth !== w) { w = innerWidth; tallest = 0; }
    tallest = Math.max(tallest, innerHeight, h);
    root.style.setProperty("--app-h", Math.round(h) + "px");
    root.style.setProperty("--stable-h", Math.round(tallest) + "px");
    root.classList.toggle("kb-open", tallest - h > 120);   // the keyboard is up: no home-bar gap under the tab bar
    root.classList.toggle("short", h < 560);   // typing on a phone, or a phone on its side: Wisp's compact layout
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  };
  fit();
  window.addEventListener("resize", fit);
  if (vv) { vv.addEventListener("resize", fit); vv.addEventListener("scroll", () => { if (window.scrollY) window.scrollTo(0, 0); }); }
})();
window.addEventListener("hashchange", () => {
  if (location.hash === "#wisp") showTab("wisp", true);
  else if (location.hash === "#games") showTab("games", true);
});
showTab(currentTab === "chat" ? "chat" : currentTab, true);

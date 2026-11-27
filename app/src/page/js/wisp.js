// ============================================================================
// Wisp, the puffy mascot of the Wisp tab. It morphs between 32 feelings (eyes are mask-cut shapes whose every number
// eases toward the next feeling's), blinks, glances around, follows the pointer, giggles when poked, gets grumpy when
// poked too much and naps when left alone. The loop only runs while the Wisp tab is open.
// window.WISP: enter() / leave() from the tabs, feel(key, line) for later (Wisp's chat picks feelings through it).
// ============================================================================
window.WISP = (function () {
  const q = id => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // body: a central puff and eight slightly uneven lobes, lit as one soft clay shape by an SVG lighting filter. The
  // filter is far too heavy to run every frame, so the body and the curl are drawn ONCE into canvases at the screen's
  // full pixel density (with headroom for squash and stretch); after that the GPU only moves them. They are drawn again
  // only when the theme changes their colour or Wisp grows a lot.
  const CX = 160, CY = 182;
  const LOBES = [[0,62,50],[4,64,47],[-3,63,52],[5,65,48],[0,60,53],[-5,65,48],[3,63,51],[-4,64,47]];
  const CIRCLES = [[CX, CY, 86]].concat(LOBES.map(([j, ring, r], i) => { const a = (-90 + i * 45 + j) * Math.PI / 180; return [CX + Math.cos(a) * ring, CY + Math.sin(a) * ring, r]; }))
    .map(([x, y, r]) => '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '"/>').join("");
  const BODY_BOX = [32, 54, 256, 256], TUFT_BOX = [140, 18, 92, 96];
  const TUFT_D = "M167 100 C 160 76, 165 50, 185 41 C 201 34, 214 47, 207 59 C 201 68, 188 66, 190 55";
  const LIGHT = (id, blur, height) => '<filter id="' + id + '" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="' + blur + '" result="b"/><feDiffuseLighting in="b" surfaceScale="' + height + '" diffuseConstant="1.24" lighting-color="#fff" result="d"><feDistantLight azimuth="255" elevation="50"/></feDiffuseLighting><feColorMatrix in="d" type="matrix" values="1.05 0 0 0 -.05  0 1.03 0 0 -.03  0 0 .99 0 .01  0 0 0 1 0" result="dt"/><feComposite in="dt" in2="SourceAlpha" operator="in" result="s"/><feBlend in="SourceGraphic" in2="s" mode="multiply"/></filter>';
  const bodySvg = (fill, px) => '<svg xmlns="http://www.w3.org/2000/svg"' + (px ? ' width="' + px + '" height="' + px + '"' : ' class="wp-body" id="wpBody" aria-hidden="true"') + ' viewBox="' + BODY_BOX.join(" ") + '"><defs>' + LIGHT("wpF1", 13, 7.5) + '</defs><g filter="url(#wpF1)" style="fill:' + fill + '">' + CIRCLES + '</g></svg>';
  const tuftSvg = (fill, px, cls) => '<svg xmlns="http://www.w3.org/2000/svg"' + (px ? ' width="' + px + '" height="' + Math.round(px * TUFT_BOX[3] / TUFT_BOX[2]) + '"' : ' class="' + cls + '" id="wpTuft" aria-hidden="true"') + ' viewBox="' + TUFT_BOX.join(" ") + '"><defs>' + LIGHT("wpF2", 4, 3.2) + '</defs><path d="' + TUFT_D + '" fill="none" style="stroke:' + fill + '" stroke-width="17" stroke-linecap="round" filter="url(#wpF2)"/></svg>';
  const dataUrl = svg => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  // the tint (blue when sad, pink when flustered…) is the body's silhouette, filled with a colour
  { const m = 'url("' + dataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + BODY_BOX.join(" ") + '">' + CIRCLES + '</svg>') + '")'; q("wpTint").style.webkitMaskImage = m; q("wpTint").style.maskImage = m; }
  let puffKey = "", vectorPuff = false, paintSeq = 0;
  async function decode(svg) { const img = new Image(); img.src = dataUrl(svg); await img.decode(); return img; }
  function drawInto(canvas, img, w, h) {
    canvas.width = w; canvas.height = h;   // resizing clears it; drawn in the same task, so nothing flickers
    const x = canvas.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, w, h);
    let blank = false; try { blank = !x.getImageData(w >> 1, h >> 1, 1, 1).data[3]; } catch (e) {}   // unreadable means drawn
    return blank;
  }
  // Wisp's own clay lighting runs in a worker (/wisp-shade.js): the same recipe as the SVG filter, in floating point
  // with exact edges and a touch of dither, so no 8-bit terracing shows on the curves and the page never stalls. If
  // workers aren't available, the browser's SVG filter draws it once instead; if even that fails, the live SVG.
  const DEPTH = 1.15;   // how strongly the curves read; 1 = the SVG filter's look at its reference size
  const CIRCLE_NUMS = [CX, CY, 86].concat(...LOBES.map(([j, ring, r], i) => { const a = (-90 + i * 45 + j) * Math.PI / 180; return [CX + Math.cos(a) * ring, CY + Math.sin(a) * ring, r]; }));
  const TUFT_PTS = (() => {   // the curl's three cubic curves as a fine polyline
    const c = [[167,100],[160,76],[165,50],[185,41],[201,34],[214,47],[207,59],[201,68],[188,66],[190,55]], out = [];
    for (let k = 0; k < 9; k += 3) for (let i = k ? 1 : 0; i <= 28; i++) { const t = i / 28, u = 1 - t, p0 = c[k], p1 = c[k + 1], p2 = c[k + 2], p3 = c[k + 3];
      out.push(u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]); }
    return out; })();
  let shader = null, shaderOk = typeof Worker === "function";
  function shadeInWorker(job) {
    return new Promise((res, rej) => {
      if (!shaderOk) return rej(new Error("no worker"));
      try { shader = shader || new Worker("/wisp-shade.js"); } catch (e) { shaderOk = false; return rej(e); }
      const id = Math.random(), t = setTimeout(() => { done(); rej(new Error("slow")); }, 8000);
      const on = e => { if (!e.data || e.data.id !== id) return; done(); e.data.error ? rej(new Error(e.data.error)) : res(e.data); };
      const bad = () => { done(); shaderOk = false; rej(new Error("worker failed")); };
      const done = () => { clearTimeout(t); shader.removeEventListener("message", on); shader.removeEventListener("error", bad); };
      shader.addEventListener("message", on); shader.addEventListener("error", bad); shader.postMessage({ id, ...job });
    });
  }
  function fillRgb(fill) { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d"); x.fillStyle = fill; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }
  function put(canvas, px, w, h) {
    if (typeof ImageBitmap !== "undefined" && px instanceof ImageBitmap) {   // handed over as is: no copy on this thread
      const r = canvas.getContext("bitmaprenderer"); if (r) { r.transferFromImageBitmap(px); return; }
      canvas.width = w; canvas.height = h; canvas.getContext("2d").drawImage(px, 0, 0); return;
    }
    canvas.width = w; canvas.height = h; canvas.getContext("2d").putImageData(new ImageData(px, w, h), 0, 0);
  }
  async function paintPuff() {
    if (vectorPuff) return;
    const vw = innerWidth, vh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--stable-h")) || innerHeight, css = q("wpStage").clientWidth || (step === 2 ? Math.min(vw * .48, 210, vh * .27) : Math.min(vw * .62, 290, vh * .38));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bodyPx = Math.min(1024, Math.ceil(css * .8 * dpr * 1.15 / 64) * 64), tuftPx = Math.min(384, Math.ceil(css * .2875 * dpr * 1.15 / 32) * 32);   // sizes in steps, so small changes don't redraw
    const fill = getComputedStyle(document.documentElement).getPropertyValue("--wp-puff").trim() || "#f6f7f9", key = fill + "|" + bodyPx;
    if (key === puffKey) return;
    puffKey = key; const my = ++paintSeq, tuftH = Math.round(tuftPx * TUFT_BOX[3] / TUFT_BOX[2]);
    try {
      const r = await shadeInWorker({ fill: fillRgb(fill), depth: DEPTH,
        body: { w: bodyPx, h: bodyPx, vb: BODY_BOX, circles: CIRCLE_NUMS, blur: 13, height: 7.5 },
        tuft: { w: tuftPx, h: tuftH, vb: TUFT_BOX, pts: TUFT_PTS, half: 8.5, blur: 4, height: 3.2 } });
      if (my !== paintSeq) return;   // a newer paint (theme or size) is on its way
      put(q("wpBody"), r.body, bodyPx, bodyPx); put(q("wpTuft"), r.tuft, tuftPx, tuftH); ready(); return;
    } catch (e) { if (my !== paintSeq) return; }
    try {   // no worker: the browser's own SVG filter draws it once instead
      const [bi, ti] = await Promise.all([decode(bodySvg(fill, bodyPx)), decode(tuftSvg(fill, tuftPx))]);
      if (my !== paintSeq) return;
      if (drawInto(q("wpBody"), bi, bodyPx, bodyPx)) throw new Error("blank");
      drawInto(q("wpTuft"), ti, tuftPx, tuftH); ready();
    } catch (e) {   // nothing works: the live SVG version (heavier, same look)
      if (vectorPuff) return;
      vectorPuff = true; const t = q("wpTuft");
      q("wpBody").outerHTML = bodySvg("var(--wp-puff)"); t.outerHTML = tuftSvg("var(--wp-puff)", 0, t.getAttribute("class")); ready();
    }
  }
  function ready() { q("wpStage").classList.add("ready"); }   // Wisp fades in once its body is drawn
  (window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 2500 }) : f => setTimeout(f, 800))(() => paintPuff());
  new MutationObserver(() => { puffKey = ""; paintPuff(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.ResizeObserver) { let rt = 0; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(paintPuff, 180); }).observe(q("wpStage")); }

  // eye glyphs
  function starPath(R, r) { let d = ""; for (let i = 0; i < 10; i++) { const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r : R; d += (i ? "L" : "M") + (Math.cos(a) * rr).toFixed(2) + " " + (Math.sin(a) * rr).toFixed(2); } return d + "Z"; }
  function spiralPath() { let d = "M0 0"; for (let t = .3; t <= 11.6; t += .3) d += "L" + (Math.cos(t) * t * 1.02).toFixed(2) + " " + (Math.sin(t) * t * 1.02).toFixed(2); return d; }
  const GLYPHS = {
    squeezeL: '<path class="wp-gs" d="M-8 -9 L6 0 L-8 9"/>',
    squeezeR: '<path class="wp-gs" d="M8 -9 L-6 0 L8 9"/>',
    heart: '<path class="wp-heart" d="M0 11 C -17 0, -15 -14, -6 -13.5 C -2.5 -13.2, 0 -10, 0 -7.5 C 0 -10, 2.5 -13.2, 6 -13.5 C 15 -14, 17 0, 0 11 Z"/><ellipse fill="#fff" opacity=".8" cx="-6" cy="-7" rx="2.6" ry="1.8" transform="rotate(-30 -6 -7)"/>',
    star: '<path class="wp-star" d="' + starPath(14, 6.2) + '"/>',
    spiral: '<g class="wp-spin"><path class="wp-gs" style="stroke-width:3.2" d="' + spiralPath() + '"/></g>',
    arcUp: '<path class="wp-gs" d="M-10 4 Q0 -11 10 4"/>',
    arcDown: '<path class="wp-gs" d="M-10 -3 Q0 10 10 -3"/>'
  };
  for (const side of ["L", "R"]) for (const name of ["squeeze", "heart", "star", "spiral", "arcUp", "arcDown"]) {
    const el = document.createElementNS(NS, "g"); el.setAttribute("class", "wp-glyph"); el.dataset.g = name;
    el.innerHTML = GLYPHS[name === "squeeze" ? "squeeze" + side : name]; q("wpG" + side).append(el);
  }

  // extras around Wisp
  const DROP = '<svg viewBox="0 0 20 28"><path class="wp-drop" d="M10 1 C 14 9, 18 14, 18 19 A 8 8 0 0 1 2 19 C 2 14, 6 9, 10 1Z"/><ellipse cx="7" cy="18" rx="2" ry="3" fill="#fff" opacity=".7"/></svg>';
  const SPARK = '<svg viewBox="-12 -12 24 24"><path d="M0 -12 C 1.2 -3, 3 -1.2, 12 0 C 3 1.2, 1.2 3, 0 12 C -1.2 3, -3 1.2, -12 0 C -3 -1.2, -1.2 -3, 0 -12Z"/></svg>';
  const HEART = '<svg viewBox="-18 -16 36 30"><path class="wp-heart" d="M0 11 C -17 0, -15 -14, -6 -13.5 C -2.5 -13.2, 0 -10, 0 -7.5 C 0 -10, 2.5 -13.2, 6 -13.5 C 15 -14, 17 0, 0 11 Z"/></svg>';
  const ANGER = '<svg viewBox="-20 -20 40 40"><g fill="none" stroke="#ff4d5e" stroke-width="5" stroke-linecap="round"><path d="M-14 -5 Q-5 -5 -5 -14"/><path d="M14 -5 Q5 -5 5 -14"/><path d="M-14 5 Q-5 5 -5 14"/><path d="M14 5 Q5 5 5 14"/></g></svg>';
  q("wpFx").innerHTML =
    '<i class="f-tear">' + DROP + '</i>' +
    ["L d1", "L d2", "L d3", "R d1", "R d2", "R d3"].map(c => '<i class="f-stream ' + c + '">' + DROP + '</i>').join("") +
    ["L", "L d2", "R", "R d2"].map(c => '<i class="f-joy ' + c + '">' + DROP + '</i>').join("") +
    '<i class="f-sweat a">' + DROP + '</i><i class="f-sweat b">' + DROP + '</i>' +
    '<i class="f-anger">' + ANGER + '</i><i class="f-tick">' + ANGER + '</i>' +
    '<i class="f-q wp-txt">?</i><i class="f-ex wp-txt">!</i><i class="f-ex2 wp-txt">!!</i>' +
    ["s1", "s2", "s3", "s4"].map(c => '<i class="f-spark ' + c + '">' + SPARK + '</i>').join("") +
    '<i class="f-twinkle">' + SPARK + '</i>' +
    ["h1", "h2", "h3"].map(c => '<i class="f-heart ' + c + '">' + HEART + '</i>').join("") +
    '<i class="f-z wp-txt">z</i><i class="f-z wp-txt z2">z</i><i class="f-z wp-txt z3">Z</i><i class="f-zs wp-txt">z</i>' +
    '<i class="f-rain"><svg viewBox="0 0 88 72"><path d="M20 38 C 8 38, 6 22, 18 20 C 20 8, 38 6, 42 16 C 48 8, 64 10, 64 22 C 76 22, 78 38, 66 38 Z" fill="#a9b6c8"/><path d="M24 34 C 16 34, 15 26, 22 25" fill="none" stroke="#c6d0dd" stroke-width="3" stroke-linecap="round"/><line class="rl" x1="28" y1="46" x2="25" y2="56"/><line class="rl" x1="42" y1="46" x2="39" y2="56"/><line class="rl" x1="56" y1="46" x2="53" y2="56"/></svg></i>' +
    [0, 1, 2].map(() => '<i class="f-orb">' + SPARK + '</i>').join("") +
    '<i class="f-th t1"></i><i class="f-th t2"></i><i class="f-th t3"></i>' +
    '<i class="f-note wp-txt n1">♪</i><i class="f-note wp-txt n2">♫</i>' +
    '<i class="f-waves"><svg viewBox="0 0 36 44"><path d="M30 14 Q24 22 30 30"/><path d="M21 8 Q11 22 21 36"/><path d="M12 2 Q-2 22 12 42"/></svg></i>' +
    '<i class="f-dot d1"></i><i class="f-dot d2"></i><i class="f-dot d3"></i>';
  const ORBS = Array.from(q("wpFx").querySelectorAll(".f-orb"));

  // feelings. eyes: rx/ry size, dx/dy nudge, top = upper lid (0 open, 1 shut), ang = lid tilt (+ angry, − worried),
  // curve = lid sag, bot = lower lid (happy crescent), shine = highlight. L / R override one eye.
  const TINTS = { sad: "#8db4ff", pale: "#9cc3ff", red: "#ff8a8a", pink: "#ff9fb8" };
  const E = {
    hi:          { motion: "float", tuft: "sway", say: ["Hey! I'm Wisp", "oh hi!! didn't see you there", "hiii :)"] },
    happy:       { eyes: { bot: .55, dy: -2 }, blush: .45, motion: "bounce", tuft: "wiggle", say: ["this is the best day", "hehe yay", "okay i'm in a really good mood rn"] },
    laughing:    { glyph: "squeeze", blush: .6, motion: "shake", fx: "joy", tuft: "wiggle", say: ["HAHAHA stoppp", "i can't breathe 😭", "okay that one got me"] },
    love:        { glyph: "heart", blush: .8, motion: "sway", fx: "hearts", tuft: "wiggle", say: ["aww i love that", "you're the best, you know that?", "my heart just went poof"] },
    excited:     { glyph: "star", blush: .45, motion: "hop", fx: "sparkles", tuft: "perk", say: ["WAIT REALLY??", "omg omg omg", "okay i'm SO excited"] },
    proud:       { eyes: { bot: .5, top: .2, dy: -3 }, blush: .3, look: [0, -.45], pose: "translateY(-6px) scale(1.05) rotate(-3deg)", motion: "float", fx: "sparkles", tuft: "perk", say: ["told you i could do it", "look at me go", "i'm kind of a big deal"] },
    wink:        { glyph: { L: "arcUp" }, R: { bot: .15 }, blush: .4, motion: "hopOnce", fx: "twinkle", tuft: "wiggle", say: ["your secret's safe with me", "hehe ;)", "trust me on this one"] },
    calm:        { glyph: "arcDown", blush: .3, motion: "floatSlow", fx: "notes", tuft: "sway", say: ["ahh, this is nice", "just floating", "deep breaths"] },
    relieved:    { glyph: "arcUp", blush: .2, motion: "exhale", fx: "sweat", tuft: "droopSoft", say: ["phew", "oh thank goodness", "okay, we're good"] },
    curious:     { L: { rx: 1.08, ry: 1.12 }, R: { ry: .92, top: .18 }, look: [.35, -.35], pose: "rotate(11deg)", motion: "float", tuft: "perk", say: ["ooh tell me more", "wait how does that work?", "hm? what's that?"] },
    thinking:    { L: { top: .34 }, look: [.75, -.85], pose: "rotate(-6deg)", motion: "swaySlow", fx: "thought", tuft: "sway", say: ["hmm let me think…", "okay okay give me a sec", "thinking…"] },
    confused:    { L: { rx: 1.22, ry: 1.2 }, R: { rx: .72, ry: .72, top: .15, ang: -12 }, pose: "rotate(10deg)", motion: "float", fx: "question", tuft: "squiggle", say: ["wait what?", "i'm lost lol", "huh??"] },
    listening:   { eyes: { rx: 1.05, ry: 1.05 }, look: [-.25, .15], pose: "rotate(-8deg)", motion: "nod", fx: "waves", tuft: "perk", say: ["mhm, i'm listening", "go on…", "i'm all ears (i don't have ears)"] },
    surprised:   { eyes: { rx: 1.15, ry: 1.22, shine: 1.2 }, motion: "jumpOnce", fx: "exclaim", tuft: "perk", say: ["oh!", "wait what", "no way!"] },
    shocked:     { eyes: { rx: .5, ry: .52, shine: 0 }, pose: "scale(1.06)", motion: "tremble", fx: "sweat2 exclaim2", tint: ["pale", .18], tuft: "stiff", say: ["WHAT", "i- i'm sorry WHAT", "excuse me??"] },
    sad:         { eyes: { top: .32, ang: -22, curve: .2 }, look: [0, .55], pose: "translateY(12px) scale(1.04,.93)", motion: "floatSlow", fx: "tear", tint: ["sad", .12], tuft: "droop", say: ["oh no…", "that makes me really sad", "i'm sorry 😢"] },
    crying:      { glyph: "arcDown", blush: .3, pose: "translateY(14px) scale(1.05,.92)", motion: "sob", fx: "streams", tint: ["sad", .16], tuft: "droop", say: ["😭😭😭", "i'm not crying you're crying", "that's so sad"] },
    sulking:     { eyes: { top: .36, ang: -16, ry: 1.05 }, look: [-.6, .3], pose: "translateY(10px) rotate(-7deg) scale(1.03,.95)", motion: "none", fx: "raincloud", tint: ["sad", .1], tuft: "droop", say: ["fine. whatever.", "i'm not upset. (i'm upset)", "hmph"] },
    pleading:    { eyes: { rx: 1.2, ry: 1.24, shine: 2, top: .08, ang: -14, dy: 2 }, look: [0, -.25], blush: .55, pose: "translateY(4px) scale(.94) rotate(7deg)", motion: "sway", tuft: "droopSoft", say: ["pleaseee?", "just one more? 🥺", "pretty please with a cloud on top"] },
    scared:      { eyes: { rx: .82, ry: .9, shine: 1.5, top: .1, ang: -20 }, look: [0, 0], pose: "translateY(6px) scale(.88)", motion: "tremble", fx: "sweat", tint: ["pale", .14], tuft: "droop", say: ["is that a vacuum cleaner", "i don't like this", "eep!"] },
    grumpy:      { eyes: { top: .42, ang: 26, bot: .1 }, pose: "scale(1.08)", motion: "huff", fx: "anger", tint: ["red", .14], tuft: "stiff", say: ["hmph!", "i'm SO mad right now", "not cool!!"] },
    annoyed:     { eyes: { top: .52, bot: .32 }, look: [.85, 0], motion: "tap", fx: "tick", tuft: "sway", say: ["really?", "…okay.", "i'm being patient. very patient."] },
    smug:        { eyes: { top: .48, bot: .12, ang: -4 }, look: [.8, 0], pose: "rotate(5deg) translateX(4px)", motion: "float", tuft: "sway", say: ["called it", "mhm. i know.", "not to brag, but…"] },
    mischievous: { eyes: { top: .42, ang: 16, bot: .18 }, look: [.65, .1], blush: .15, pose: "rotate(-4deg) scale(1.03)", motion: "creep", tuft: "sway", say: ["i have an idea…", "what if we just… didn't tell anyone", "heh heh heh"] },
    determined:  { eyes: { top: .3, ang: 15, bot: .22, dy: -2 }, pose: "translateY(-4px) scale(1.04) rotate(-3deg)", motion: "pump", tuft: "stiff", say: ["let's do this", "i got this. we got this.", "nothing can stop me now"] },
    shy:         { eyes: { top: .15, bot: .25, rx: .92, ry: .9 }, look: [-.7, .65], blush: 1, lines: 1, pose: "translateY(8px) scale(.93) rotate(-6deg)", motion: "fidget", tuft: "droopSoft", say: ["oh… um… thank you", "stoppp you're making me blush", "hehe… okay…"] },
    embarrassed: { glyph: "squeeze", blush: 1, lines: 1, tint: ["pink", .14], pose: "scale(.94)", motion: "fidget", fx: "sweat", tuft: "droopSoft", say: ["oh nooo", "pretend you didn't see that", "i want to disappear 🙈"] },
    awkward:     { eyes: { top: .2, bot: .22 }, look: [.85, -.25], blush: .25, motion: "shuffle", fx: "sweat", tuft: "sway", say: ["haha… yeah…", "sooo… anyway", "well this is awkward"] },
    dizzy:       { glyph: "spiral", motion: "wobble", fx: "orbit", tuft: "spin", say: ["whoaaa", "the room is spinning", "too much wind"] },
    bored:       { eyes: { top: .6, bot: .08 }, look: [-.5, .25], pose: "translateY(10px) scale(1.04,.94)", motion: "none", fx: "dots", tuft: "droopSoft", say: ["…", "is anything happening", "booored"] },
    sleepy:      { eyes: { top: .72, curve: .25, ang: -6 }, pose: "translateY(6px) scale(1.02,.97)", motion: "drowse", fx: "z1", tuft: "droopSoft", say: ["*yawn*", "five more minutes…", "so… sleepy…"] },
    asleep:      { glyph: "arcDown", blush: .25, pose: "translateY(10px) scale(1.05,.94)", motion: "snore", fx: "zzz", tuft: "droop", say: ["zzz…", "mmh… clouds…", "zzZ"] }
  };
  const HI_LINES = E.hi.say.slice();

  // face state: every number eases toward its target each frame
  const D = { rx: 1, ry: 1, dx: 0, dy: 0, top: 0, ang: 0, curve: 0, bot: 0, shine: 1, o: 1 };
  const EYE_X = { L: 146, R: 181 }, EYE_Y = 168;
  const T = { L: { ...D }, R: { ...D }, blush: 0, lines: 0, tint: 0 }, C = { L: { ...D }, R: { ...D }, blush: 0, lines: 0, tint: 0 };
  const els = {};
  for (const s of ["L", "R"]) {
    const g = q("wpEye" + s), sh = g.querySelectorAll(".wp-shine");
    els[s] = { eye: g.querySelector(".wp-eye"), sh1: sh[0], sh2: sh[1], tl: q("wpTl" + s), bl: q("wpBl" + s), gg: q("wpG" + s), glyph: null };
  }
  let current = "hi", selected = "hi", lastLine = "", restLine = null, busy = false;
  const glyphFor = (spec, s) => { const g = spec.glyph; return !g ? null : typeof g === "string" ? g : g[s] || null; };
  function show(key, line) {
    const spec = E[key]; if (!spec) return;
    current = key;
    for (const s of ["L", "R"]) {
      const gName = glyphFor(spec, s);
      Object.assign(T[s], D, spec.eyes || {}, spec[s] || {}, { o: gName ? 0 : 1 });
      if (els[s].glyph !== gName) { els[s].gg.querySelectorAll(".wp-glyph").forEach(el => el.classList.toggle("on", el.dataset.g === gName)); els[s].glyph = gName; }
    }
    T.blush = spec.blush || 0; T.lines = spec.lines || 0;
    if (spec.tint) { q("wpTint").style.backgroundColor = TINTS[spec.tint[0]]; T.tint = spec.tint[1]; } else T.tint = 0;
    const m = q("wpMotion"); m.className = "wp-l"; void m.offsetWidth; m.className = "wp-l wm-" + (spec.motion || "float");
    q("wpPose").style.transform = spec.pose || "";
    q("wpTuft").setAttribute("class", "wp-tuft wt-" + (spec.tuft || "sway"));
    q("wpFx").dataset.fx = spec.fx || "";
    if (line !== false) say(line || pickLine(spec));
  }
  function pickLine(spec) { let l = pick(spec.say); if (l === lastLine && spec.say.length > 1) l = spec.say[(spec.say.indexOf(l) + 1) % spec.say.length]; return l; }
  let sayTimer = 0;
  function typing(on) { clearTimeout(sayTimer); q("wpBubble").classList.toggle("is-typing", on); }
  function say(text, now) {
    lastLine = text; const b = q("wpBubble"); clearTimeout(sayTimer);
    if (RM.matches || now) { q("wpSay").textContent = text; b.classList.remove("is-typing"); if (!RM.matches) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } return; }
    b.classList.add("is-typing"); b.classList.remove("pop");
    sayTimer = setTimeout(() => { q("wpSay").textContent = text; b.classList.remove("is-typing"); void b.offsetWidth; b.classList.add("pop"); }, 260 + Math.min(700, text.length * 22));
  }

  // eyes: lids are mask shapes. Every write goes through set(), which skips values that haven't changed, so a still
  // face costs nothing and a moving one only touches what moves.
  const memo = new WeakMap();
  function set(el, k, v) { let m = memo.get(el); if (!m) memo.set(el, (m = {})); if (m[k] !== v) { m[k] = v; el.setAttribute(k, v); } }
  function css(el, k, v) { let m = memo.get(el); if (!m) memo.set(el, (m = {})); if (m["$" + k] !== v) { m["$" + k] = v; el.style[k] = v; } }
  const n2 = v => String(Math.round(v * 100) / 100), n3 = v => String(Math.round(v * 1000) / 1000);
  const NODES = { blush: q("wpBlush"), lines: q("wpLines"), tint: q("wpTint"), lean: q("wpLean"), fx: q("wpFx"), stage: q("wpStage"), eyes: q("wpEyes") };
  let look = { x: 0, y: 0 }, lookT = { x: 0, y: 0 };
  function drawEye(s, p, blink) {
    const e = els[s], dir = s === "L" ? 1 : -1;
    const cx = EYE_X[s] + p.dx, cy = EYE_Y + p.dy, rx = 10.5 * p.rx, ry = 15 * p.ry;   // where they look is the eye layer's own move (see frame)
    const t = clamp(p.top + (1 - p.top) * blink, 0, 1), b = clamp(p.bot + .12 * blink, 0, 1);
    set(e.eye, "cx", n2(cx)); set(e.eye, "cy", n2(cy)); set(e.eye, "rx", n2(rx)); set(e.eye, "ry", n2(ry)); set(e.eye, "opacity", n3(p.o));
    const sh = Math.max(0, p.shine), so = n3(Math.min(1, sh) * p.o);
    set(e.sh1, "cx", n2(cx - rx * .3)); set(e.sh1, "cy", n2(cy - ry * .42)); set(e.sh1, "rx", n2(2.5 * Math.min(sh, 1.7))); set(e.sh1, "ry", n2(3.4 * Math.min(sh, 1.7))); set(e.sh1, "opacity", so);
    set(e.sh2, "cx", n2(cx + rx * .32)); set(e.sh2, "cy", n2(cy + ry * .28)); set(e.sh2, "r", n2(Math.max(0, (sh - 1) * 1.8))); set(e.sh2, "opacity", so);
    // lids: each clip is a big square with the lid cut out of it (even-odd), so only geometry changes, no offscreen masks
    const y0 = cy - ry - 1.5 + (2 * ry + 3) * t, w = rx + 18, ang = dir * p.ang * Math.PI / 180, co = Math.cos(ang), si = Math.sin(ang);
    const rp = (x, y) => n2(cx + (x - cx) * co - (y - y0) * si) + " " + n2(y0 + (x - cx) * si + (y - y0) * co);
    set(e.tl, "d", "M-40 -40H360V360H-40Z M" + rp(cx - w, y0 - 60) + "L" + rp(cx + w, y0 - 60) + "L" + rp(cx + w, y0) + "Q" + rp(cx, y0 + p.curve * ry * 2) + " " + rp(cx - w, y0) + "Z");
    const R = rx * 2.3, by = cy + ry + 1.5 - (2 * ry + 3) * b + R;
    set(e.bl, "d", "M-40 -40H360V360H-40Z M" + n2(cx - R) + " " + n2(by) + "A" + n2(R) + " " + n2(R) + " 0 1 0 " + n2(cx + R) + " " + n2(by) + "A" + n2(R) + " " + n2(R) + " 0 1 0 " + n2(cx - R) + " " + n2(by) + "Z");
    set(e.gg, "transform", "translate(" + n2(cx) + " " + n2(cy) + ")");
  }

  // life: blinking, glancing, following the pointer. The pointer is read once per frame, not on every move.
  let active = false, raf = 0, lastT = 0;
  let pointer = null, pClient = null, lastPointer = -1e9, nextGlance = 0, glance = { x: 0, y: 0 }, blinkAt = 0, blinkT0 = -1e9;
  function frame(now) {
    if (!active) return;
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    if (pClient) { const r = NODES.stage.getBoundingClientRect(); pointer = { x: clamp((pClient[0] - (r.left + r.width / 2)) / (r.width * .8), -1, 1), y: clamp((pClient[1] - (r.top + r.height * .5)) / (r.height * .8), -1, 1) }; pClient = null; }
    const a = RM.matches ? 1 : 1 - Math.exp(-dt * 11), a2 = RM.matches ? 1 : 1 - Math.exp(-dt * 7);
    for (const s of ["L", "R"]) for (const k in D) C[s][k] += (T[s][k] - C[s][k]) * a;
    for (const k of ["blush", "lines", "tint"]) C[k] += (T[k] - C[k]) * a;
    const spec = E[current];
    if (spec.look) lookT = { x: spec.look[0], y: spec.look[1] };
    else if (pointer && now - lastPointer < 2600) lookT = pointer;
    else { if (now > nextGlance) { glance = Math.random() < .55 ? { x: 0, y: 0 } : { x: (Math.random() - .5) * 1.3, y: (Math.random() - .5) * .8 }; nextGlance = now + 1800 + Math.random() * 3200; } lookT = glance; }
    look.x += (lookT.x - look.x) * a2; look.y += (lookT.y - look.y) * a2;
    if (now > blinkAt) { blinkT0 = now; blinkAt = now + (Math.random() < .2 ? 260 : 2000 + Math.random() * 3600); }
    const bt = now - blinkT0, blink = bt < 150 ? Math.sin(Math.PI * bt / 150) : 0;
    drawEye("L", C.L, blink); drawEye("R", C.R, blink);
    set(NODES.blush, "opacity", n3(C.blush * .62));
    set(NODES.lines, "opacity", n3(C.lines));
    css(NODES.tint, "opacity", n3(C.tint));
    css(NODES.eyes, "transform", "translate(" + n2(look.x * 2.1875) + "%," + n2(look.y * 1.875) + "%)");   // 7 and 6 units of 320
    css(NODES.lean, "transform", "rotate(" + n2(look.x * 3) + "deg) translateX(" + n2(look.x * 3) + "px)");
    if (NODES.fx.dataset.fx.indexOf("orbit") > -1) {
      const u = NODES.stage.clientWidth / 320;
      ORBS.forEach((o, i) => {
        const ang = now * .0032 + i * 2.094, x = (160 + Math.cos(ang) * 78) * u, y = (66 + Math.sin(ang) * 16) * u, sc = .78 + .3 * Math.sin(ang);
        o.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) scale(" + sc.toFixed(2) + ")"; o.style.opacity = Math.sin(ang) > -.2 ? 1 : .45;
      });
    }
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener("pointermove", e => {
    if (!active) return;
    pClient = [e.clientX, e.clientY]; lastPointer = performance.now(); activity();
  }, { passive: true });

  // short reactions that return to the chosen feeling
  let tempTimer = null;
  function cancelTemp() { if (tempTimer) clearTimeout(tempTimer); tempTimer = null; }
  function temp(steps) {
    cancelTemp(); let i = 0;
    const next = () => { if (i >= steps.length) { tempTimer = null; show(selected, restLine || undefined); return; } const [k, line, ms] = steps[i++]; show(k, line); tempTimer = setTimeout(next, ms); };
    next();
  }

  // poking
  let pokes = [];
  // a poke you can see: a ripple where the finger lands, the body dents away from it and springs back with a wobble,
  // the eyes squeeze, and phones give a tiny tap. Only transforms and opacity: the GPU does all of it.
  function pokeFx(cx, cy) {
    const st = q("wpStage"), r = st.getBoundingClientRect();
    const x = cx == null ? .5 : (cx - r.left) / r.width, y = cy == null ? .42 : (cy - r.top) / r.height;
    let dx = x - .5, dy = y - .57; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    if (!RM.matches) {
      const ang = Math.atan2(dy, dx) * 180 / Math.PI, k = Math.min(1, len * 2.4) * .9 + .3;   // a poke near the middle is a gentler dent
      const at = (push, sx, sy) => "translate(" + (-dx * push * k).toFixed(2) + "px," + (-dy * push * k).toFixed(2) + "px) rotate(" + ang.toFixed(1) + "deg) scale(" + sx + "," + sy + ") rotate(" + (-ang).toFixed(1) + "deg)";
      const pk = q("wpPoke"); pk.style.transformOrigin = "50% 57%";
      pk.animate([{ transform: "none" }, { transform: at(9, .84, 1.07), offset: .16 }, { transform: at(-4, 1.07, .96), offset: .44 }, { transform: at(1.5, .98, 1.01), offset: .7 }, { transform: "none" }],
        { duration: 560, easing: "cubic-bezier(.3,.7,.4,1)" });
      const fx = document.createElement("div"); fx.className = "wp-pokefx"; fx.style.left = (x * 100).toFixed(1) + "%"; fx.style.top = (y * 100).toFixed(1) + "%";
      fx.innerHTML = "<i class=\"ring\"></i>" + [0, 1, 2, 3, 4].map(i => { const a = (ang + 180 + (i - 2) * 34 + (Math.random() - .5) * 16) * Math.PI / 180, d = 1.3 + Math.random() * .8; return "<b style=\"--x:" + (Math.cos(a) * d).toFixed(2) + "em;--y:" + (Math.sin(a) * d).toFixed(2) + "em;animation-delay:" + (i * 14) + "ms\"></b>"; }).join("");
      st.append(fx); setTimeout(() => fx.remove(), 700);
    }
    blinkT0 = performance.now();   // the eyes squeeze on impact
    try { if (navigator.vibrate) navigator.vibrate(9); } catch (e) {}
  }
  function poke(cx, cy) {
    if (idle) { activity(); return; }
    pokeFx(cx, cy);
    if (busy) return;
    // a poking streak (each poke within 2.5 s of the last) climbs a ladder: giggles, then fed up, dizzy, and finally a
    // record for the most persistent poker, so poking Wisp a lot is a game of its own
    const now = performance.now(); pokes = pokes.length && now - pokes[pokes.length - 1] < 2500 ? pokes.concat(now) : [now];
    const n = pokes.length;
    if (n >= 20) temp([["sleepy", pick(["i'm just gonna pretend to sleep now 😴", "zzz… (i can still feel that)", "wake me when you're done"]), 2200]]);
    else if (n > 12) temp([["mischievous", pick(["fine. you win. i'm still cuter 😌", "poke champion of the sky 🏆", "my turn next time 😏", "your finger must be tired by now"]), 2000]]);
    else if (n === 12) temp([["proud", "you poked a cloud 12 times. that's a record 🏆", 2800]]);
    else if (n >= 9) temp([["dizzy", pick(["the sky is spinning 🌀", "whoaaa… too many pokes", "everything is wobbly"]), 1800]]);
    else if (n >= 6) temp([["grumpy", pick(["STOP poking me 😤", "hey!! personal space!", "i'm gonna blow away!!"]), 1800]]);
    else if (n >= 4) temp([["annoyed", pick(["okay okay…", "you're poking a lot", "hmm."]), 1500]]);
    else temp([["laughing", pick(["hehe that tickles", "hey! hehe", "eep! hehe", "boop! 🫧"]), 1300]]);
  }
  q("wpStage").addEventListener("pointerdown", e => { e.preventDefault(); lastPointer = performance.now(); poke(e.clientX, e.clientY); });   // no focus grab: the keyboard stays up if you poke while typing
  q("wpStage").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); poke(); } });

  // napping when left alone
  let idle = null, lastAct = performance.now(), napTimer = 0;
  function activity() {
    lastAct = performance.now();
    if (idle) { idle = null; clearTimeout(napTimer); temp([["surprised", "oh! you're back", 1100], ["happy", name ? "i missed you, " + name + " :)" : "i missed you :)", 1900]]); }
  }
  ["keydown", "wheel", "touchstart"].forEach(t => window.addEventListener(t, () => { if (active) activity(); }, { passive: true }));
  setInterval(() => {
    if (!active || idle || tempTimer || busy || document.hidden) return;
    if (performance.now() - lastAct > (step === 2 ? 60000 : document.documentElement.dataset.theme === "dark" ? 16000 : 28000)) {
      idle = "sleepy"; show("sleepy", "*yawn*… gonna rest my eyes");
      napTimer = setTimeout(() => { if (idle) { idle = "asleep"; show("asleep"); } }, 6000);
    }
  }, 1000);

  // intro: meet Wisp, then tell it your name
  const NAME_KEY = "wind-wisp-name";
  let name = ""; try { name = localStorage.getItem(NAME_KEY) || ""; } catch (e) {}
  let step = name ? 2 : 0;
  function hiLines() { E.hi.say = name ? ["Hey " + name + "!", "hi " + name + " :)", "oh hey " + name + "!!"] : HI_LINES.slice(); }
  function caption(title, text) {
    q("wpTitle").textContent = title; q("wpText").textContent = text;
    const c = q("wpCaption"); c.classList.remove("swap"); void c.offsetWidth; c.classList.add("swap");
  }
  function renderStep() {
    const cta = q("wpCta");
    q("wpNameForm").hidden = step !== 1; cta.disabled = false;
    if (step === 0) { caption("Meet Wisp", "A tiny puff of wind who's always around to chat, cheer you on, and feel everything right along with you."); cta.textContent = "Continue"; }
    if (step === 1) { caption("What should Wisp call you?", "Wisp likes to know who it's talking to."); cta.textContent = "Continue"; cta.disabled = !q("wpNameIn").value.trim(); }
    const chatting = step === 2;
    q("wispView").classList.toggle("chatmode", chatting); q("wpChat").hidden = !chatting; q("main").classList.toggle("wisp-chatting", chatting);
    if (chatting) renderLog();
  }
  function saveName() {
    const v = q("wpNameIn").value.replace(/\s+/g, " ").trim().slice(0, 24); if (!v) return;
    name = v; try { localStorage.setItem(NAME_KEY, name); } catch (e) {}
    hiLines(); step = 2; renderStep(); q("wpNameIn").blur();
    deliver(["Hey " + name + "!! 🥹", "i'm so happy you're here", "so… how's your day going?"], ["excited", "love", "curious"], 0);
  }
  q("wpNameIn").addEventListener("input", () => { q("wpCta").disabled = !q("wpNameIn").value.trim(); });
  q("wpNameForm").addEventListener("submit", e => { e.preventDefault(); saveName(); });
  q("wpCta").onclick = () => {
    if (step === 0) { step = 1; renderStep(); selected = "curious"; cancelTemp(); show("curious", "what's your name?"); setTimeout(() => q("wpNameIn").focus({ preventScroll: true }), 60); }
    else if (step === 1) saveName();
    else poke();
  };

  // ---- chatting: what you write goes to Wisp's two calls (its face reacts first, then it texts back, 1 to 3 texts,
  // each with its own face, typed out at a human pace). The chat and what Wisp remembers stay in this browser.
  const CHAT_KEY = "wind-wisp-chat", MEM_KEY = "wind-wisp-memory";
  const load = k => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  let chat = load(CHAT_KEY).filter(m => m && (m.who === "you" || m.who === "wisp") && typeof m.text === "string" && m.text).slice(-200);
  let memory = load(MEM_KEY).filter(m => typeof m === "string" && m).slice(-24);
  const saveChat = () => { try { localStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-200))); } catch (e) {} };
  const saveMem = () => { try { localStorage.setItem(MEM_KEY, JSON.stringify(memory.slice(-24))); } catch (e) {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function dayOf(t) {
    const d = new Date(t || Date.now()), n = new Date(), start = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    return t >= start ? "Today" : t >= start - 864e5 ? "Yesterday" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  let logDay = "";
  function logAdd(m, still) {   // one text into the log (the newest Wisp text stays in the bubble instead)
    const log = q("wpLog"), day = dayOf(m.t);
    if (day !== logDay) { logDay = day; const d = document.createElement("div"); d.className = "wp-day"; d.textContent = day; log.append(d); }
    const el = document.createElement("div"); el.className = "wp-msg " + m.who; el.dir = "auto"; el.textContent = m.text;
    if (still) el.style.animation = "none";
    log.append(el); log.scrollTop = log.scrollHeight; pinned = true;
  }
  function renderLog() {
    q("wpLog").textContent = ""; logDay = "";
    const shown = chat.slice(-80);
    shown.forEach((m, i) => { if (!(i === shown.length - 1 && m.who === "wisp")) logAdd(m, true); });
  }
  function push(m) {
    const prev = chat[chat.length - 1]; chat.push(m); saveChat();
    if (prev && prev.who === "wisp") logAdd(prev);
    if (m.who === "you") logAdd(m);
  }
  function remember(list) {
    for (const f of list || []) { const v = String(f || "").trim().slice(0, 120); if (v && !memory.some(x => x.toLowerCase() === v.toLowerCase())) memory.push(v); }
    memory = memory.slice(-24); saveMem();
  }
  async function post(path, body, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal }); return r.ok ? await r.json() : null; }
    catch (e) { return null; } finally { clearTimeout(t); }
  }
  // texts arrive one by one, each after a typing pause that fits its length
  async function deliver(lines, faces, waited) {
    busy = true; syncSend();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], face = E[faces[i]] ? faces[i] : i ? current : "happy";
      typing(true);
      await sleep(Math.max(i ? 450 : 250, Math.min(2600, Math.max(700, 450 + line.length * 38)) - (i ? 0 : waited)));
      selected = face; restLine = line; cancelTemp(); show(face, false); say(line, true);
      push({ who: "wisp", text: line, t: Date.now() });
    }
    busy = false; syncSend();
  }
  function syncSend() { q("wpSend").disabled = busy || !q("wpInput").value.trim(); }
  async function send() {
    const text = q("wpInput").value.replace(/\s+/g, " ").trim().slice(0, 500); if (!text || busy) return;
    q("wpInput").value = ""; busy = true; syncSend(); cancelTemp(); lastAct = performance.now();
    if (idle) { idle = null; clearTimeout(napTimer); }
    const prev = chat[chat.length - 1], history = chat.slice(-16).map(m => ({ who: m.who, text: m.text }));
    push({ who: "you", text, t: Date.now() });
    const base = { message: text, history, name, memory, hour: new Date().getHours(), gap: prev ? Math.round((Date.now() - prev.t) / 60000) : null };
    const t0 = performance.now();
    selected = "listening"; show("listening", false);
    const dots = setTimeout(() => { if (busy) typing(true); }, 700);
    post("/api/wisp/face", { ...base, phase: "react", face: current }, 4500).then(r => { if (busy && r && E[r.face]) { selected = r.face; show(r.face, false); } });
    const r = await post("/api/wisp/talk", base, 15000);
    const lines = r && Array.isArray(r.replies) ? r.replies.filter(x => typeof x === "string" && x.trim()).slice(0, 3) : [];
    if (!lines.length) {
      clearTimeout(dots); busy = false; syncSend(); typing(false);
      selected = "awkward"; restLine = pick(["hmm, a gust blew my words away… say that again?", "oops, my brain got a little windy. try again?"]); show("awkward", restLine);
      return;
    }
    const f = await post("/api/wisp/face", { ...base, phase: "reply", replies: lines }, 5500);
    if (f && Array.isArray(f.remember)) remember(f.remember);
    clearTimeout(dots);
    await deliver(lines, f && Array.isArray(f.faces) ? f.faces : [], Math.max(0, performance.now() - t0 - 700));
  }
  // the log stays pinned to the newest text while the bubble or the keyboard changes its size, unless you scrolled up
  let pinned = true;
  q("wpLog").addEventListener("scroll", () => { const l = q("wpLog"); pinned = l.scrollHeight - l.scrollTop - l.clientHeight < 60; }, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(() => { if (pinned) q("wpLog").scrollTop = q("wpLog").scrollHeight; }).observe(q("wpLog"));
  q("wpInput").addEventListener("input", syncSend);
  q("wpSend").addEventListener("pointerdown", e => e.preventDefault());   // tapping send keeps the keyboard up, like any chat app
  q("wpForm").addEventListener("submit", e => { e.preventDefault(); send(); });
  // options: what Wisp remembers, a fresh chat, or forgetting you completely
  q("wpMore").onclick = () => actionMenu(q("wpMore"), [
    { icon: "bubble", label: "What Wisp remembers", run: () => {
      cancelTemp();
      if (!memory.length) { selected = "shy"; restLine = "i don't know much about you yet… tell me stuff!"; show("shy", restLine); return; }
      const facts = memory.slice(-4).map(m => m.charAt(0).toLowerCase() + m.slice(1)).join(" · ");
      selected = "proud"; restLine = "things i remember about you: " + facts + (memory.length > 4 ? " · and " + (memory.length - 4) + " more" : ""); show("proud", restLine);
    } },
    { icon: "pencil", label: "Start a fresh chat", run: () => {
      chat = []; saveChat(); renderLog(); cancelTemp(); selected = "calm"; restLine = "fresh start ✨ what's up?"; show("calm", restLine);
    } },
    { icon: "trash", label: "Make Wisp forget you", danger: true, run: () => confirmBox({
      title: "Make Wisp forget you?", text: "Wisp forgets your name, everything it remembers about you, and your chat with it. It can't be undone.", ok: "Forget me",
      onOk: () => {
        chat = []; memory = []; name = ""; saveChat(); saveMem(); try { localStorage.removeItem(NAME_KEY); } catch (e) {}
        q("wpNameIn").value = ""; hiLines(); step = 0; renderStep(); restLine = null; selected = "hi";
        temp([["crying", "okay… i'll miss you 🥲", 2200]]);
      } }) }
  ], { align: "end" });

  hiLines(); renderStep();   // after the chat code: a returning friend opens straight into the chat

  function enter() {
    if (active) return;
    active = true; lastAct = performance.now(); idle = null; clearTimeout(napTimer); cancelTemp();
    selected = step === 1 ? "curious" : "hi";
    const last = chat[chat.length - 1], fresh = last && last.who === "wisp" && Date.now() - last.t < 3 * 3600e3;
    restLine = step === 2 ? (fresh ? last.text : "Hey " + name + "!") : null;
    show(selected, step === 1 ? "what's your name?" : step === 2 ? restLine : "Hey! I'm Wisp");
    if (step === 2 && fresh) say(last.text, true);
    paintPuff(); lastT = performance.now(); blinkAt = lastT + 1200; raf = requestAnimationFrame(frame);
    if (hasNews()) setTimeout(opener, 900);
  }
  // after a while away (6 hours since you last talked, or since Wisp last said hi), Wisp texts first, like a friend
  const OPEN_KEY = "wind-wisp-opened";
  function hasNews() {
    if (step !== 2 || !chat.length || busy) return false;
    let opened = 0; try { opened = +localStorage.getItem(OPEN_KEY) || 0; } catch (e) {}
    return Date.now() - Math.max(chat[chat.length - 1].t || 0, opened) > 6 * 3600e3;
  }
  async function opener() {
    if (!active || !hasNews()) return;
    try { localStorage.setItem(OPEN_KEY, String(Date.now())); } catch (e) {}
    busy = true; syncSend(); typing(true);
    const prev = chat[chat.length - 1], t0 = performance.now();
    const r = await post("/api/wisp/talk", { opener: true, message: "", history: chat.slice(-12).map(m => ({ who: m.who, text: m.text })), name, memory, hour: new Date().getHours(), gap: prev ? Math.round((Date.now() - prev.t) / 60000) : null }, 15000);
    const lines = r && Array.isArray(r.replies) ? r.replies.filter(x => typeof x === "string" && x.trim()).slice(0, 2) : [];
    if (!lines.length) { busy = false; syncSend(); typing(false); say(restLine || "Hey " + name + "!", true); return; }
    await deliver(lines, ["excited", "curious"], Math.max(0, performance.now() - t0 - 400));
  }
  function leave() { active = false; cancelAnimationFrame(raf); cancelTemp(); clearTimeout(napTimer); clearTimeout(sayTimer); idle = null; }
  return { enter, leave, hasNews, feel: (k, line) => { if (E[k]) { selected = k; show(k, line); } }, feelings: Object.keys(E) };
})();


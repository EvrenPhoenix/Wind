// ============================================================================
// Wind markdown — a small, safe renderer tuned for AI replies.
// Everything is escaped first; only a fixed set of tags is ever produced.
// No regex lookbehind anywhere (older Safari cannot parse it).
// ============================================================================
const TICK = "`", FENCE = "```";
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s) { return String(s).replace(/[&<>"']/g, c => ESC_MAP[c]); }

// ---------------------------------------------------------------- languages
const LANG_NAMES = {
  js: "JavaScript", javascript: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", node: "JavaScript", jsx: "JSX",
  ts: "TypeScript", typescript: "TypeScript", tsx: "TSX", py: "Python", python: "Python", python3: "Python",
  rb: "Ruby", ruby: "Ruby", php: "PHP", java: "Java", kt: "Kotlin", kotlin: "Kotlin", swift: "Swift",
  c: "C", h: "C", cpp: "C++", "c++": "C++", cc: "C++", hpp: "C++", cs: "C#", csharp: "C#", "c#": "C#",
  go: "Go", golang: "Go", rs: "Rust", rust: "Rust", dart: "Dart", scala: "Scala", lua: "Lua", r: "R", perl: "Perl",
  sql: "SQL", mysql: "SQL", postgresql: "SQL", postgres: "SQL", sqlite: "SQL", plsql: "SQL",
  html: "HTML", htm: "HTML", xml: "XML", svg: "SVG", vue: "Vue", svelte: "Svelte",
  css: "CSS", scss: "SCSS", sass: "Sass", less: "Less",
  json: "JSON", jsonc: "JSON", json5: "JSON", jsonl: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", ini: "INI",
  sh: "Shell", bash: "Bash", zsh: "Shell", shell: "Shell", console: "Shell", terminal: "Shell", shellscript: "Shell",
  powershell: "PowerShell", ps1: "PowerShell", bat: "Batch", cmd: "Batch", dockerfile: "Dockerfile", docker: "Dockerfile",
  makefile: "Makefile", make: "Makefile", nginx: "Nginx", graphql: "GraphQL", gql: "GraphQL",
  md: "Markdown", markdown: "Markdown", diff: "Diff", patch: "Diff", tex: "LaTeX", latex: "LaTeX",
  text: "Text", txt: "Text", plaintext: "Text", plain: "Text", output: "Output", log: "Log", csv: "CSV",
  elixir: "Elixir", haskell: "Haskell", hs: "Haskell", objc: "Objective-C", "objective-c": "Objective-C",
  matlab: "MATLAB", julia: "Julia", zig: "Zig", solidity: "Solidity", sol: "Solidity", proto: "Protobuf", http: "HTTP",
};
function langName(l) { const k = String(l || "").toLowerCase(); return LANG_NAMES[k] || (k ? k.slice(0, 24) : "Code"); }

// ---------------------------------------------------------------- highlighter
const KW = {
  js: "as async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface let new of package private protected public return set static super switch throw try typeof var void while with yield type namespace declare readonly abstract keyof infer is satisfies",
  py: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case",
  c: "abstract alignas alignof auto break case catch class const constexpr continue default defer delete do else enum explicit export extends extern final finally fn for friend func fun go goto if impl implements import in inline instanceof interface internal is let loop match mod module mut namespace new noexcept operator out override package private protected pub public ref return sealed select sizeof static struct super switch template throw throws trait try type typedef typename union unsafe use using val var virtual volatile when where while yield chan range map async await dyn move crate guard protocol extension init deinit lazy weak inout some any actor",
  sql: "select from where insert into values update set delete create table alter drop index view join left right inner outer full cross on as and or not null is in between like limit offset order by group having distinct union all exists case when then else end primary key foreign references default unique constraint check add column database schema if begin commit rollback transaction with recursive returning asc desc truncate grant revoke trigger function procedure declare over partition window using replace",
  sh: "if then else elif fi for while until do done case esac in function select time return exit break continue local export readonly declare unset source alias set shift trap",
  rb: "alias and begin break case class def defined do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield require include extend attr_accessor attr_reader attr_writer private protected public raise lambda proc",
  php: "abstract and as break callable case catch class clone const continue declare default do echo else elseif enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface match namespace new or print private protected public readonly require require_once return static switch throw trait try use var while xor yield",
  lua: "and break do else elseif end for function goto if in local not or repeat return then until while",
};
const CONSTS = "true false null undefined NaN Infinity None True False nil this self super NULL nullptr TRUE FALSE";
const TYPES = "int float double char bool boolean string long short byte void unsigned signed size_t usize isize i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 str String number object any unknown never bigint symbol var let dict list tuple set Vec Option Result Self uint uint8 uint16 uint32 uint64 int8 int16 int32 int64 float32 float64 rune error decimal Any";
const toSet = s => { const o = Object.create(null); s.split(" ").forEach(w => { o[w] = 1; }); return o; };
const SETS = {};
function wordSet(key) { return SETS[key] || (SETS[key] = toSet(KW[key] || "")); }
const CONST_SET = toSet(CONSTS), TYPE_SET = toSet(TYPES);
const sp = (cls, text) => '<span class="' + cls + '">' + esc(text) + "</span>";

// Families: which comment / string styles a language uses.
const FAMILY = {};
"js javascript jsx mjs cjs node ts typescript tsx".split(" ").forEach(l => { FAMILY[l] = { kw: "js", line: "\\/\\/", block: true, tpl: true, regex: true }; });
"py python python3".split(" ").forEach(l => { FAMILY[l] = { kw: "py", line: "#", triple: true, deco: true }; });
"c h cpp c++ cc hpp cs csharp c# java kt kotlin swift go golang rs rust dart scala objc objective-c zig solidity sol proto".split(" ").forEach(l => { FAMILY[l] = { kw: "c", line: "\\/\\/", block: true, deco: true, tpl: l === "go" || l === "golang" || l === "kt" || l === "kotlin" }; });
"php".split(" ").forEach(l => { FAMILY[l] = { kw: "php", line: "(?:\\/\\/|#)", block: true, vars: true }; });
"rb ruby elixir".split(" ").forEach(l => { FAMILY[l] = { kw: "rb", line: "#", sym: true }; });
"lua".split(" ").forEach(l => { FAMILY[l] = { kw: "lua", line: "--" }; });
"sql mysql postgresql postgres sqlite plsql".split(" ").forEach(l => { FAMILY[l] = { kw: "sql", line: "--", block: true, ci: true }; });
"sh bash zsh shell console terminal shellscript dockerfile docker makefile make powershell ps1 nginx r perl julia".split(" ").forEach(l => { FAMILY[l] = { kw: "sh", line: "#", vars: true, sh: true }; });
const GENERIC = { kw: "c", line: "\\/\\/", block: true };
const RE_CACHE = {};

function genericRe(fam, key) {
  if (RE_CACHE[key]) return RE_CACHE[key];
  const cm = [];
  if (fam.block) cm.push("\\/\\*[\\s\\S]*?(?:\\*\\/|$)");
  if (fam.line) cm.push((fam.sh ? "(?:^|(?=\\s))" : "") + fam.line + "[^\\n]*");
  const st = [];
  if (fam.triple) st.push('"""[\\s\\S]*?(?:"""|$)', "'''[\\s\\S]*?(?:'''|$)");
  st.push('"(?:\\\\[\\s\\S]|[^"\\\\\\n])*"?', "'(?:\\\\[\\s\\S]|[^'\\\\\\n])*'?");
  if (fam.tpl) st.push("`(?:\\\\[\\s\\S]|[^`\\\\])*`?");
  const parts = [
    "(" + cm.join("|") + ")",                                             // 1 comment
    "(" + st.join("|") + ")",                                             // 2 string
    "\\b(0[xX][\\da-fA-F_]+|0[bB][01_]+|\\d[\\d_]*(?:\\.[\\d_]+)?(?:[eE][+-]?\\d+)?)\\b", // 3 number
    fam.deco ? "(@[A-Za-z_][\\w.]*)" : "(\\uFFFF\\uFFFF)",                 // 4 decorator
    fam.vars ? "(\\$\\{[^}\\n]*\\}|\\$[A-Za-z_][\\w]*|\\$[0-9@#?*!$-])" : "(\\uFFFF\\uFFFE)", // 5 variable
    "([A-Za-z_$][\\w$]*)(?=\\s*\\()",                                      // 6 call
    "([A-Za-z_$][\\w$]*)",                                                 // 7 word
  ];
  return (RE_CACHE[key] = new RegExp(parts.join("|"), "g"));
}
function hlGeneric(code, fam, key) {
  const re = genericRe(fam, key), kws = wordSet(fam.kw), ci = fam.ci;
  let out = "", last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(code))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    const t = m[0];
    if (m[1] !== undefined) {
      // a shell "#" must start a word; "//" inside a URL string is already consumed by the string rule
      out += sp("tc", t);
    } else if (m[2] !== undefined) out += sp("ts", t);
    else if (m[3] !== undefined) out += sp("tn", t);
    else if (m[4] !== undefined) out += sp("tt", t);
    else if (m[5] !== undefined) out += sp("tv", t);
    else {
      const w = ci ? t.toLowerCase() : t, call = m[6] !== undefined;
      if (kws[w]) out += sp("tk", t);
      else if (CONST_SET[t]) out += sp("tb", t);
      else if (call) out += sp("tf", t);
      else if (TYPE_SET[t] || (!fam.sh && !ci && /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(t))) out += sp("tt", t);
      else out += esc(t);
    }
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}
function hlJson(code) {
  const re = /("(?:\\[\s\S]|[^"\\\n])*"?)(\s*:)?|(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b/g;
  let out = "", last = 0, m;
  while ((m = re.exec(code))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    if (m[1] !== undefined) out += sp(m[2] ? "tp" : "ts", m[1]) + esc(m[2] || "");
    else if (m[3] !== undefined) out += sp("tc", m[3]);
    else if (m[4] !== undefined) out += sp("tn", m[4]);
    else out += sp("tb", m[5]);
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}
function hlYaml(code) {
  return code.split("\n").map(line => {
    const c = /^(\s*)(#.*)$/.exec(line); if (c) return esc(c[1]) + sp("tc", c[2]);
    const m = /^(\s*(?:-\s+)*)([A-Za-z0-9_."'\/ \-\[\]$@]+?)(\s*[:=])(\s|$)([\s\S]*)$/.exec(line);
    const val = v => {
      const cm = /^(.*?)(\s+#.*)$/.exec(v), body = cm ? cm[1] : v, tail = cm ? sp("tc", cm[2]) : "";
      const t = body.trim();
      if (!t) return esc(body) + tail;
      if (/^(['"]).*\1$/.test(t)) return esc(body.slice(0, body.indexOf(t))) + sp("ts", t) + tail;
      if (/^-?\d+(\.\d+)?$/.test(t)) return esc(body.slice(0, body.indexOf(t))) + sp("tn", t) + tail;
      if (/^(true|false|null|yes|no|on|off|~)$/i.test(t)) return esc(body.slice(0, body.indexOf(t))) + sp("tb", t) + tail;
      return esc(body) + tail;
    };
    if (m) return esc(m[1]) + sp("tp", m[2]) + esc(m[3] + m[4]) + val(m[5]);
    const li = /^(\s*-\s+)([\s\S]*)$/.exec(line); if (li) return esc(li[1]) + val(li[2]);
    const sec = /^(\s*)(\[[^\]]*\])\s*$/.exec(line); if (sec) return esc(sec[1]) + sp("tk", sec[2]);
    return esc(line);
  }).join("\n");
}
function hlMarkup(code) {
  const re = new RegExp("(<\\!--[\\s\\S]*?(?:--\\>|$))|(<\\/?)([A-Za-z][\\w:.-]*)((?:\"[^\"]*\"|'[^']*'|[^>\"'])*)(\\/?>)?|(&[#\\w]+;)", "g");
  let out = "", last = 0, m;
  while ((m = re.exec(code))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    if (m[1] !== undefined) out += sp("tc", m[1]);
    else if (m[6] !== undefined) out += sp("tb", m[6]);
    else {
      const attrs = (m[4] || "").replace(/([^\s=\/"']+)(\s*=\s*)?("[^"]*"?|'[^']*'?|[^\s"'>]+)?/g,
        (a, n, eq, v) => sp("ta", n) + esc(eq || "") + (v ? sp("ts", v) : ""));
      // the replace above works on raw text and already escapes each piece; whitespace stays as is
      out += esc(m[2]) + sp("tg", m[3]) + attrs + esc(m[5] || "");
      const tag = m[3].toLowerCase();
      if (m[2] === "<" && m[5] === ">" && (tag === "script" || tag === "style")) {
        const close = code.toLowerCase().indexOf("</" + tag, re.lastIndex), end = close < 0 ? code.length : close;
        out += highlight(code.slice(re.lastIndex, end), tag === "script" ? "js" : "css");
        re.lastIndex = end;
      }
    }
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}
function hlCss(code) {
  const re = /(\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*)|("(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?)|(@[\w-]+)|(#[\da-fA-F]{3,8}\b|-?\b\d*\.?\d+(?:%|[a-zA-Z]+)?\b)|(![a-z]+)|([{};])|((?:--|[$@])?[A-Za-z_-][\w-]*)(?=\s*:(?!:))|([.#&][A-Za-z_-][\w-]*|::?[a-z-]+)|([A-Za-z_-][\w-]*)(?=\()/g;
  let out = "", last = 0, m, depth = 0;
  while ((m = re.exec(code))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    const t = m[0];
    if (m[1] !== undefined) out += sp("tc", t);
    else if (m[2] !== undefined) out += sp("ts", t);
    else if (m[3] !== undefined) out += sp("tk", t);
    else if (m[4] !== undefined) out += depth > 0 || /^-?[\d.]/.test(t) ? sp("tn", t) : sp("tt", t);
    else if (m[5] !== undefined) out += sp("tk", t);
    else if (m[6] !== undefined) { if (t === "{") depth++; else if (t === "}") depth = Math.max(0, depth - 1); out += esc(t); }
    else if (m[7] !== undefined) out += depth > 0 ? sp("tp", t) : sp("tt", t);
    else if (m[8] !== undefined) out += depth > 0 && /^[.#]/.test(t) === false ? esc(t) : sp("tt", t);
    else out += sp("tf", t);
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}
function hlDiff(code) {
  return code.split("\n").map(l => {
    if (/^(\+\+\+|---|diff |index |similarity |rename |new file|deleted file)/.test(l)) return sp("tc", l);
    if (/^@@/.test(l)) return sp("tk", l);
    if (l[0] === "+") return sp("ti", l);
    if (l[0] === "-") return sp("td", l);
    return esc(l);
  }).join("\n");
}
const PLAIN = /^(text|txt|plaintext|plain|md|markdown|output|log|console-output|csv|tsv|ascii|mermaid|tex|latex|math|http|)$/;
const HL_CACHE = new Map();
function highlight(code, lang) {
  const l = String(lang || "").toLowerCase();
  if (PLAIN.test(l) || code.length > 60000) return esc(code);
  const ck = l + "\u0000" + code, hit = HL_CACHE.get(ck);
  if (hit !== undefined) return hit;
  let out;
  try {
    if (/^(json|jsonc|json5|jsonl)$/.test(l)) out = hlJson(code);
    else if (/^(ya?ml|toml|ini|conf|cfg|env|properties)$/.test(l)) out = hlYaml(code);
    else if (/^(html?|xml|svg|vue|svelte|xhtml|jsx-html|astro)$/.test(l)) out = hlMarkup(code);
    else if (/^(css|scss|sass|less)$/.test(l)) out = hlCss(code);
    else if (/^(diff|patch)$/.test(l)) out = hlDiff(code);
    else { const fam = FAMILY[l] || GENERIC; out = hlGeneric(code, fam, FAMILY[l] ? fam.kw + (fam.sh ? "s" : "") + (fam.tpl ? "t" : "") + (fam.triple ? "3" : "") + (fam.vars ? "v" : "") : "generic"); }
  } catch (e) { out = esc(code); }
  if (HL_CACHE.size > 80) HL_CACHE.clear();
  HL_CACHE.set(ck, out);
  return out;
}

// ---------------------------------------------------------------- math (light)
// A compact TeX-to-HTML pass for the everyday maths models write (fractions, powers, roots, Greek, sums).
// Anything it does not understand is shown as tidy source instead of broken markup.
const TEX_SYM = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς",
  tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆", circ: "∘", bullet: "•", oplus: "⊕", otimes: "⊗",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", equiv: "≡", sim: "∼", simeq: "≃", cong: "≅", propto: "∝",
  ll: "≪", gg: "≫", infty: "∞", partial: "∂", nabla: "∇", forall: "∀", exists: "∃", nexists: "∄", emptyset: "∅", varnothing: "∅",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖",
  land: "∧", wedge: "∧", lor: "∨", vee: "∨", neg: "¬", lnot: "¬", therefore: "∴", because: "∵",
  to: "→", rightarrow: "→", leftarrow: "←", gets: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔",
  implies: "⟹", iff: "⟺", mapsto: "↦", uparrow: "↑", downarrow: "↓", longrightarrow: "⟶", rightleftharpoons: "⇌", leftrightharpoons: "⇋", Longrightarrow: "⟹", hookrightarrow: "↪",
  sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", iiint: "∭", oint: "∮", bigcup: "⋃", bigcap: "⋂",
  ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", angle: "∠", perp: "⊥", parallel: "∥", mid: "∣", nmid: "∤",
  triangle: "△", square: "□", degree: "°", prime: "′", hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ", aleph: "ℵ",
  langle: "⟨", rangle: "⟩", lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋", lbrace: "{", rbrace: "}", vert: "|", Vert: "‖",
  quad: " ", qquad: "  ", colon: ":", checkmark: "✓", dagger: "†", top: "⊤", bot: "⊥", vdash: "⊢", models: "⊨",
};
const TEX_FN = toSet("sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp lim max min sup inf det dim gcd lcm deg arg ker mod Pr");
const TEX_BIG = toSet("sum prod coprod bigcup bigcap lim max min sup inf");
const TEX_INT = toSet("int iint iiint oint");
const TEX_REL = toSet("le leq ge geq ne neq approx equiv sim simeq cong propto ll gg to rightarrow leftarrow gets leftrightarrow Rightarrow Leftarrow Leftrightarrow implies iff mapsto longrightarrow in notin subset supset subseteq supseteq pm mp times div cdot cup cap land lor wedge vee setminus oplus otimes");
const TEX_ACCENT = { hat: "̂", widehat: "̂", bar: "̄", overline: null, vec: "⃗", dot: "̇", ddot: "̈", tilde: "̃", widetilde: "̃" };
const TEX_FONT = { mathbb: { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", P: "ℙ", E: "𝔼", H: "ℍ", F: "𝔽" } };
function texToHtml(src, display) {
  let i = 0, fail = false;
  const s = String(src).trim();
  const isLetter = c => /[A-Za-z]/.test(c);
  function group() { // one argument: {...} or a single token
    while (s[i] === " ") i++;
    if (s[i] === "{") { i++; const h = seq("}"); if (s[i] === "}") i++; else fail = true; return h; }
    return atom();
  }
  function rawGroup() { // literal text of {...}
    while (s[i] === " ") i++;
    if (s[i] !== "{") { const c = s[i] || ""; i++; return c; }
    let depth = 0, st = ++i;
    for (; i < s.length; i++) { if (s[i] === "\\") { i++; continue; } if (s[i] === "{") depth++; else if (s[i] === "}") { if (!depth) break; depth--; } }
    const t = s.slice(st, i); if (s[i] === "}") i++; else fail = true; return t;
  }
  function scripts(base, big) { // attach ^ and _ to what was just read
    let sup = "", sub = "";
    for (;;) {
      while (s[i] === " ") i++;
      if (s[i] === "^" && !sup) { i++; sup = group(); }
      else if (s[i] === "_" && !sub) { i++; sub = group(); }
      else if (s[i] === "'" ) { let p = ""; while (s[i] === "'") { p += "′"; i++; } base += p; }
      else break;
    }
    if (!sup && !sub) return base;
    if (big && display) return '<span class="mop"><span class="mlim">' + (sup || "") + "</span>" + base + '<span class="mlim">' + (sub || "") + "</span></span>";
    if (sup && sub) return base + '<span class="mss"><sup>' + sup + "</sup><sub>" + sub + "</sub></span>";
    return base + (sup ? "<sup>" + sup + "</sup>" : "<sub>" + sub + "</sub>");
  }
  function env(name) {
    const endTag = "\\end{" + name + "}", end = s.indexOf(endTag, i);
    if (end < 0) { fail = true; return ""; }
    const body = s.slice(i, end); i = end + endTag.length;
    const rows = body.split(/\\\\(?:\[[^\]]*\])?/).map(r => r.trim()).filter(r => r);
    const cells = rows.map(r => { const out = []; let d = 0, cur = ""; for (let k = 0; k < r.length; k++) { const ch = r[k]; if (ch === "\\") { cur += ch + (r[k + 1] || ""); k++; continue; } if (ch === "{") d++; else if (ch === "}") d--; if (ch === "&" && d === 0) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; });
    const sub = t => { const r = texToHtml(t, false); if (r === null) fail = true; return r || ""; };
    const matrix = /matrix$/.test(name), cases = name === "cases";
    const table = '<span class="mtable' + (matrix ? " mmatrix" : cases ? " mcases" : " malign") + '">' + cells.map(r => '<span class="mrow">' + r.map(c => '<span class="mcell">' + sub(c) + "</span>").join("") + "</span>").join("") + "</span>";
    const fence = { pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], cases: ["{", ""] }[name];
    return fence ? '<span class="mfenced"><span class="mfence">' + fence[0] + "</span>" + table + (fence[1] ? '<span class="mfence">' + fence[1] + "</span>" : "") + "</span>" : table;
  }
  function command() {
    let name = "";
    if (isLetter(s[i] || "")) { while (isLetter(s[i] || "")) name += s[i++]; if (s[i] === "*") i++; }
    else { const c = s[i++] || ""; // \, \; \! \{ \} \% \$ \\ etc.
      if (c === "," || c === ":" || c === ";" || c === " " || c === ">") return " ";
      if (c === "!") return "";
      if (c === "\\") return display ? "<br>" : " ";
      if (c === "|") return "‖";
      return esc(c); }
    if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "cfrac") { const a = group(), b = group(); return '<span class="mfrac"><span class="mnum">' + a + '</span><span class="mden">' + b + "</span></span>"; }
    if (name === "binom" || name === "dbinom" || name === "tbinom") { const a = group(), b = group(); return '<span class="mfenced"><span class="mfence">(</span><span class="mfrac mbinom"><span class="mnum">' + a + '</span><span class="mden">' + b + '</span></span><span class="mfence">)</span></span>'; }
    if (name === "sqrt") { let idx = ""; while (s[i] === " ") i++; if (s[i] === "[") { const e = s.indexOf("]", i); if (e > 0) { idx = "<sup class=\"mroot\">" + esc(s.slice(i + 1, e)) + "</sup>"; i = e + 1; } } return idx + '<span class="msqrt">√<span class="mrad">' + group() + "</span></span>"; }
    if (name === "text" || name === "textrm" || name === "mathrm" || name === "operatorname" || name === "textit" || name === "mathit" || name === "mbox" || name === "textnormal" || name === "mathsf" || name === "texttt" || name === "mathtt") { const t = rawGroup().replace(/\\([%$&#_{} ])/g, "$1"); return '<span class="' + (name === "textit" || name === "mathit" ? "mi" : "mt") + '">' + esc(t) + "</span>"; }
    // an arrow with a label over it (and optionally under it): 6CO₂ + 6H₂O \xrightarrow{\text{light}} C₆H₁₂O₆ + 6O₂
    if (/^x(?:right|left|leftright|Right|Left|Leftright)?(?:arrow|harpoons|rightleftharpoons)$/.test(name) || name === "xrightleftharpoons") {
      let below = ""; while (s[i] === " ") i++;
      if (s[i] === "[") { const e = s.indexOf("]", i); if (e > 0) { below = texToHtml(s.slice(i + 1, e), false) || esc(s.slice(i + 1, e)); i = e + 1; } }
      const above = group(), arrow = /harpoons/.test(name) ? "⇌" : /^xleftright/.test(name) ? "↔" : /^xleft/i.test(name) ? "←" : "⟶";
      return '<span class="mxarrow"><span class="mxlab">' + above + '</span><span class="mxarr">' + arrow + "</span>" + (below ? '<span class="mxlab">' + below + "</span>" : "") + "</span>";
    }
    if (name === "overset" || name === "stackrel" || name === "underset") { const a = group(), b = group(); return '<span class="mxarrow">' + (name === "underset" ? '<span class="mxarr">' + b + '</span><span class="mxlab">' + a + "</span>" : '<span class="mxlab">' + a + '</span><span class="mxarr">' + b + "</span>") + "</span>"; }
    // chemistry written with mhchem: \ce{6CO2 + 6H2O -> C6H12O6 + 6O2}
    if (name === "ce" || name === "pu") return '<span class="mchem">' + chemHtml(rawGroup()) + "</span>";
    if (name === "textbf" || name === "mathbf" || name === "boldsymbol" || name === "bm" || name === "bf") return "<b>" + group() + "</b>";
    if (name === "mathbb" || name === "mathcal" || name === "mathfrak" || name === "mathscr") { const t = rawGroup(), map = TEX_FONT.mathbb; return '<span class="mt">' + (name === "mathbb" && map[t] ? map[t] : esc(t)) + "</span>"; }
    if (name === "boxed" || name === "fbox") return '<span class="mbox">' + group() + "</span>";
    if (name === "overline") return '<span class="mover">' + group() + "</span>";
    if (name === "underline") return "<u>" + group() + "</u>";
    if (name === "cancel") return "<s>" + group() + "</s>";
    if (name in TEX_ACCENT) { const g = group(); return /^[A-Za-zα-ωΑ-Ω]$/.test(g) ? g + TEX_ACCENT[name] : '<span class="mover">' + g + "</span>"; }
    if (name === "left" || name === "right" || name === "big" || name === "Big" || name === "bigg" || name === "Bigg" || name === "bigl" || name === "bigr" || name === "Bigl" || name === "Bigr" || name === "middle") {
      while (s[i] === " ") i++;
      if (s[i] === ".") { i++; return ""; }
      if (s[i] === "\\") { i++; return command(); }
      const c = s[i++] || ""; return esc(c);
    }
    if (name === "begin") { const n = rawGroup(); if (/^(aligned|align|alignat|gathered|gather|split|equation|eqnarray|cases|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|array|smallmatrix)$/.test(n)) { if (n === "array") rawGroup(); return env(n); } fail = true; return ""; }
    if (name === "end") { fail = true; return ""; }
    if (name === "displaystyle" || name === "textstyle" || name === "limits" || name === "nolimits" || name === "scriptstyle" || name === "nonumber" || name === "notag" || name === "rm" || name === "it" || name === "mathstrut" || name === "strut") return "";
    if (name === "tag" || name === "label") { rawGroup(); return ""; }
    if (name === "pmod") return " (mod " + group() + ")";
    if (name === "bmod") return " mod ";
    if (name === "not") { const n = atom(); return n + "̸"; }
    if (name === "color" || name === "textcolor") { rawGroup(); return name === "textcolor" ? group() : ""; }
    if (name === "space" || name === "enspace" || name === "thinspace") return " ";
    if (TEX_FN[name]) { const h = scripts('<span class="mt">' + name + "</span>", !!TEX_BIG[name]); while (s[i] === " ") i++; return h + (s[i] === "(" || s[i] === "[" || s[i] === undefined || s[i] === "}" ? "" : "\u2009"); }
    if (TEX_SYM[name] !== undefined) {
      if (TEX_BIG[name]) return scripts('<span class="mbig">' + TEX_SYM[name] + "</span>", true) + "\u2009";
      if (TEX_INT[name]) return scripts('<span class="mbig mint">' + TEX_SYM[name] + "</span>", false) + "\u2009";
      return TEX_REL[name] ? "\u2009" + TEX_SYM[name] + "\u2009" : TEX_SYM[name];
    }
    fail = true; return "";
  }
  function atom() {
    while (s[i] === " ") i++;
    const c = s[i];
    if (c === undefined) return "";
    if (c === "\\") { i++; return command(); }
    if (c === "{") { i++; const h = seq("}"); if (s[i] === "}") i++; else fail = true; return h; }
    if (c === "}" ) { fail = true; i++; return ""; }
    i++;
    if (isLetter(c)) return '<span class="mi">' + c + "</span>";
    if (/\d/.test(c)) { let n = c; while (/[\d.,]/.test(s[i] || "") && /\d/.test(s[i + 1] || s[i])) n += s[i++]; while (/\d/.test(s[i] || "")) n += s[i++]; return n; }
    if (c === "-") return "−";
    if (c === "*") return "∗";
    if (c === "~") return " ";
    if (c === "&") return "";
    if (c === "=" || c === "+" || c === "<" || c === ">" || c === "−") return " " + esc(c) + " ";
    return esc(c);
  }
  function operatorAt(k) { // is the token starting here an operator / opener (so a following "-" is a sign, not a subtraction)?
    const c = s[k];
    if (c === "\\") { const m = /^\\([A-Za-z]+)/.exec(s.slice(k, k + 24)); return !!m && (!!TEX_REL[m[1]] || m[1] === "left" || m[1] === "quad" || m[1] === "qquad"); }
    return "+=<>*/,;:([{|&".indexOf(c) !== -1;
  }
  function seq(stop) {
    let out = "", operand = false;
    while (i < s.length && s[i] !== stop) {
      if (s[i] === " " || s[i] === "\n" || s[i] === "\t") { i++; continue; }
      if (s[i] === "^" || s[i] === "_") { out = scripts(out || "", false); operand = true; continue; }
      if (s[i] === "-") { i++; out += operand ? "\u2009−\u2009" : "−"; operand = false; continue; }
      const k = i;
      out += scripts(atom(), false);
      operand = !operatorAt(k);
      if (fail) return out;
    }
    return out;
  }
  let html;
  try { html = seq(undefined); } catch (e) { return null; }
  return fail || i < s.length ? null : html;
}
// A chemical formula or reaction (CO_2, C_6H_{12}O_6, 6CO_2 + 6H_2O \to ...) is set upright, as chemistry is, not in the
// slanted letters of algebra: once text, arrows, charges, numbers and signs are set aside, only element symbols remain.
function isChem(t) {
  if (/^\\(?:ce|pu)\s*\{[^{}]*\}$/.test(t)) return true;
  const core = t.replace(/\\x[A-Za-z]+\s*(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, " → ").replace(/\\(?:text|mathrm|textrm|mbox|rm)\s*\{([^{}]*)\}/g, (m, x) => /^\s*(?:[A-Z][a-z]?\d*)+\s*$/.test(x) ? x : " ").replace(/\\x?[A-Za-z]*(?:arrow|harpoons)s?\b(?:\[[^\]]*\])?/g, " ").replace(/\\(?:to|longrightarrow|rightleftharpoons|cdot|,|;|quad|qquad)\b/g, " ");
  if (/\\/.test(core)) return false;
  const letters = core.replace(/[_^]\{[^{}]*\}|[_^][+\-−]?\d*[+\-−]?|[\d\s+\-−=→⟶⇌()[\]{}.·*]/g, "");
  return /^(?:[A-Z][a-z]?)+$/.test(letters) && (/[_→⟶⇌]|\\x?(?:right|long)|\\to\b|->|\^\{?\d*[+\-−]/.test(t)) && (letters.length > 1 || /\d|\^/.test(core));
}
// mhchem-style text to HTML: digits after an element or ) are subscripts, ^ marks a charge, -> <=> are arrows.
function chemHtml(src) {
  return esc(String(src).trim())
    .replace(/&lt;=&gt;|&lt;-&gt;/g, " ⇌ ").replace(/-&gt;(?:\[([^\]]*)\])?/g, (m, a) => a ? ' <span class="mxarrow"><span class="mxlab">' + a + '</span><span class="mxarr">⟶</span></span> ' : " ⟶ ")
    .replace(/\^\{?([0-9]*[+\-−])\}?/g, "<sup>$1</sup>").replace(/([A-Za-z)\]])(\d+)/g, "$1<sub>$2</sub>");
}
// When the maths can't be laid out properly, show a readable plain version rather than its TeX source: commands become
// their symbols (or vanish), \text{…} becomes its words, _x and ^x become small subscripts and superscripts.
function texLoose(t) {
  let s = esc(t)
    .replace(/\\x[A-Za-z]+\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (m, a) => " ⟶<sup>" + a.replace(/\\[A-Za-z]+\s*\{([^{}]*)\}/g, "$1") + "</sup> ")
    .replace(/\\(?:text|mathrm|textrm|mbox|operatorname|mathbf|textbf|mathit|ce)\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)").replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)")
    .replace(/\\([A-Za-z]+)/g, (m, n) => TEX_SYM[n] !== undefined ? TEX_SYM[n] : "")
    .replace(/_\{([^{}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => "<sub>" + (a !== undefined ? a : b) + "</sub>")
    .replace(/\^\{([^{}]*)\}|\^([A-Za-z0-9+\-∘])/g, (m, a, b) => "<sup>" + (a !== undefined ? a : b) + "</sup>")
    .replace(/[{}]/g, "").replace(/\\[,;:! ]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}
function mathHtml(tex, display) {
  let t = enDigits(String(tex).trim());   // maths always uses English digits
  if (!t) return "";
  if (isChem(t)) t = t.replace(/0(?=_)/g, "O").replace(/(_\{?\d\}?)0(?![\d}])/g, "$1O");   // chemistry typed with zeros for O: H_20 → H₂O, 60_2 → 6O₂
  const h = t.length < 1500 ? texToHtml(t, display) : null;
  if (h === null) { const l = texLoose(t); return display ? '<div class="math-block"><span class="math">' + l + "</span></div>" : '<span class="math">' + l + "</span>"; }
  const cls = isChem(t) ? "math chem" : "math";
  return display ? '<div class="math-block"><span class="' + cls + '">' + h + "</span></div>" : '<span class="' + cls + '">' + h + "</span>";
}

// ---------------------------------------------------------------- inline
const PH_A = "", PH_B = "";
const INLINE_RE = new RegExp([
  "\\\\\\(([\\s\\S]+?)\\\\\\)",                                               // 1  \( math \)
  "\\\\\\[([\\s\\S]+?)\\\\\\]",                                               // 2  \[ math \]
  "\\$\\$([^$]+?)\\$\\$",                                                    // 3  $$ math $$
  "\\$(?![\\s$])((?:\\\\[\\s\\S]|[^$\\\\\\n])+?)\\$(?![\\d$])",                // 4  $ math $
  "\\\\([\\\\`*_{}\\[\\]()#+\\-.!~|>$&<])",                                    // 5  escaped char
  "(`+)(?!`)([\\s\\S]*?[^`])\\6(?!`)",                                        // 6,7 code span
  "(!?)\\[((?:[^\\[\\]\\\\]|\\\\[\\s\\S]|\\[[^\\[\\]]*\\])*)\\]\\(\\s*(<[^>\\n]*>|[^\\s()]*(?:\\([^\\s()]*\\)[^\\s()]*)*)(?:\\s+(?:\"([^\"]*)\"|'([^']*)'))?\\s*\\)", // 8 bang 9 label 10 url 11/12 title
  "<((?:https?:\\/\\/|mailto:)[^\\s<>]+)>",                                   // 13 autolink
  "(https?:\\/\\/[^\\s<>\"'`\\uE000\\uE001]+)",                                // 14 bare url
  "<br\\s*\\/?>",                                                            // (no group) line break
  "<(sub|sup|kbd|mark|u)>([^<>\\n]{1,200})<\\/\\15>",                        // 15,16 small safe tags
  " ?\\(\\[([\\w.-]+\\.[A-Za-z]{2,24})\\]\\((https?:\\/\\/[^\\s()<>]+)\\)\\)",         // 17,18 a citation: ([npr.org](https://…))
].join("|"), "g");
const SAFE_URL = /^(?:https?:\/\/|mailto:)[^\s]+$/i;
function trimUrl(u) {
  let tail = "";
  for (;;) {
    const m = /[.,;:!?'"*_~]+$/.exec(u);
    if (m) { tail = m[0] + tail; u = u.slice(0, -m[0].length); continue; }
    if (u[u.length - 1] === ")") { const o = (u.match(/\(/g) || []).length, c = (u.match(/\)/g) || []).length; if (c > o) { tail = ")" + tail; u = u.slice(0, -1); continue; } }
    break;
  }
  return [u, tail];
}
// a citation pill: a small rounded link showing the site, e.g. npr.org
function citePill(domain, url) { return '<a class="cite" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer nofollow" title="' + esc(url) + '">' + esc(String(domain).replace(/^www\./i, "")) + "</a>"; }
// a link whose text is its own site's domain ([formula1.com](https://www.formula1.com/…)) is a citation too
function siteLabel(label, url) { if (!/^(?:www\.)?[\w-]+(?:\.[\w-]+)+$/i.test(label)) return false; try { return new URL(url).hostname.replace(/^www\./i, "").toLowerCase() === label.replace(/^www\./i, "").toLowerCase(); } catch (e) { return false; } }
function anchor(url, inner, title) {
  return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer nofollow"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + inner + "</a>";
}
// ---------------------------------------------------------------- numbers in Bengali replies
// A Bengali reply may put Bengali digits inside things that are English by nature: ৬H₂O for 6H₂O, COVID-১৯, ৫০ km,
// iPhone ১৫, ৬:৩০ AM, ৩×১০⁸ m/s, x² + ৫x + ৬ = ০. Those numbers are shown in English digits. Numbers in ordinary Bengali
// sentences (২০২৬ সালে, ৫টি, ৳৫০০, ১০:৩০, ২ + ২ = ৪) keep their Bengali digits. Code and links are never changed, and
// maths always uses English digits. Swapping a digit never changes the text's length, so it is safe while a reply plays.
const BN_DIGIT = /[০-৯]/, BN_DIGITS = /[০-৯]/g, BN_SIGN = /[ঀ-৥ৰ-৿]/;
const enDigits = s => s.replace(BN_DIGITS, d => String.fromCharCode(d.charCodeAt(0) - 0x09B6));   // ০ (U+09E6) → 0 (U+0030)
// technical: Latin or Greek letters, superscript or subscript digits, maths signs, Western currency
const TECH = /[\p{Script=Latin}\p{Script=Greek}²³¹⁰-⁹₀-₉µ√∑∫∞$€£]/u;
const OPS = /^[=+\-−×÷*/^<>≤≥≈≠±·→←↔⇌⟶]+$/;
const NUMBER = /^[*_(\["'“‘]*[+\-−]?[০-৯\d]+(?:[.,:/][০-৯\d]+)*[*_%)\].,;:!?।॥"'”’]*$/;   // । and quotes may follow
const UNIT = /^[*_("'“‘]*[°µμ]?[A-Za-z]{1,5}(?:\/[A-Za-z]{1,3})?[²³]?[*_).,;:!?।॥"'”’]*$/;
function fixDigits(text) {
  if (!BN_DIGIT.test(text)) return text;
  const toks = [], re = /\S+/g; let m;
  while ((m = re.exec(text))) toks.push({ s: m[0], i: m.index, tech: TECH.test(m[0]), bn: BN_DIGIT.test(m[0]), op: OPS.test(m[0]), word: BN_SIGN.test(m[0]) });
  const fix = new Set();
  toks.forEach((t, k) => {
    if (!t.bn) return;
    if (t.tech) { fix.add(k); return; }                                                   // ৬H₂O, COVID-১৯, ৫G, B১২, ৩×১০⁸
    if (!NUMBER.test(t.s)) return;
    const prev = toks[k - 1], next = toks[k + 1];
    if (next && UNIT.test(next.s)) { fix.add(k); return; }                                // ৫০ km, ২৫ °C, ৬:৩০ AM
    if (prev && prev.tech && !prev.word && /[A-Z]/.test(prev.s) && !/[.,;:!?।॥]$/.test(prev.s) && t.s.replace(/[^০-৯\d]/g, "").length <= 3) fix.add(k);   // iPhone ১৫, Windows ১১, Python ৩.১২
  });
  // a formula is one thing: terms joined by operators (x² + ৫x + ৬ = ০). If any term is technical, all its numbers are English.
  for (let k = 0; k < toks.length; k++) {
    if (toks[k].op || toks[k].word) continue;
    let j = k; const span = [k];
    while (j + 2 < toks.length && toks[j + 1].op && !toks[j + 2].op && !toks[j + 2].word) { span.push(j + 1, j + 2); j += 2; }
    if (span.length > 1 && span.some(x => toks[x].tech)) for (const x of span) if (toks[x].bn) fix.add(x);
    k = j;
  }
  if (!fix.size) return text;
  let out = "", last = 0;
  for (const k of [...fix].sort((a, b) => a - b)) { const t = toks[k]; out += text.slice(last, t.i) + enDigits(t.s); last = t.i + t.s.length; }
  return out + text.slice(last);
}
// A Bengali vowel sign or mark written on its own (when the alphabet is explained: "কার: া ি ী", "ং ঃ ঁ") is drawn on a
// dotted circle, as such signs are printed. Adding the circle (◌) here means Wind's Bengali font draws both, instead of
// the browser borrowing whatever font it can find for the bare sign.
const LONE_SIGN = /(^|[^ঀ-৿‌‍◌])([ঁ-ঃ়া-ৄেৈো-্ৗৢৣ৾])/g;
// The AI sometimes slips a Hindi (Devanagari) letter or sign into a Bengali word: সैकড়, with ै (U+0948) for ৈ. The two
// scripts are laid out alike in Unicode, so inside a word that is otherwise Bengali such a character is shown as its
// Bengali counterpart. (The danda । ॥ is shared by both and stays as it is.)
const BN_OK = new RegExp("[\u0980\u0981\u0982\u0983\u0985\u0986\u0987\u0988\u0989\u098A\u098B\u098C\u098F\u0990\u0993\u0994\u0995\u0996\u0997\u0998\u0999\u099A\u099B\u099C\u099D\u099E\u099F\u09A0\u09A1\u09A2\u09A3\u09A4\u09A5\u09A6\u09A7\u09A8\u09AA\u09AB\u09AC\u09AD\u09AE\u09AF\u09B0\u09B2\u09B6\u09B7\u09B8\u09B9\u09BC\u09BD\u09BE\u09BF\u09C0\u09C1\u09C2\u09C3\u09C4\u09C7\u09C8\u09CB\u09CC\u09CD\u09CE\u09D7\u09DC\u09DD\u09DF\u09E0\u09E1\u09E2\u09E3\u09E6\u09E7\u09E8\u09E9\u09EA\u09EB\u09EC\u09ED\u09EE\u09EF\u09F0\u09F1\u09F2\u09F3\u09F4\u09F5\u09F6\u09F7\u09F8\u09F9\u09FA\u09FB\u09FC\u09FD\u09FE]");
function fixScript(text) {
  if (!/[ऀ-ॣ०-ॿ]/.test(text) || !/[ঀ-৿]/.test(text)) return text;
  return text.replace(/[ऀ-৿‌‍]+/g, w => /[ঀ-৿]/.test(w) ? w.replace(/[ऀ-ॣ०-ॿ]/g, d => { const b = String.fromCharCode(d.charCodeAt(0) + 0x80); return BN_OK.test(b) ? b : d; }) : w);
}
function markBase(text) { return BN_DIGIT.test(text) || /[ঁ-৾]/.test(text) ? text.replace(LONE_SIGN, "$1◌$2").replace(LONE_SIGN, "$1◌$2") : text; }
// The same for a reply's Markdown source (what Copy and Download give): code, links and URLs are left alone.
function fixDigitsMd(src) {
  src = String(src || ""); if (!BN_DIGIT.test(src)) return src;
  let fence = false;
  return src.split("\n").map(line => {
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) { fence = !fence; return line; }
    if (fence) return line;
    return line.split(/(`+[^`]*`+|\]\([^)]*\)|<https?:[^>]*>|https?:\/\/\S+|\$\$?[^$\n]+\$\$?)/).map((part, i) => i % 2 ? (part[0] === "$" ? enDigits(part) : part) : fixDigits(part)).join("");
  }).join("\n");
}
function emphasis(s) {
  return s
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/g, "<strong>$1</strong>")
    // a word character is any letter, mark or digit, so _ and * inside a Bengali (or any) word stay literal, as in English
    .replace(/(^|[^\p{L}\p{M}\p{N}_\\])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{M}\p{N}_])/gu, "$1<strong>$2</strong>")
    .replace(/(^|[^*\p{L}\p{M}\p{N}_\\])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\p{L}\p{M}\p{N}_])/gu, "$1<em>$2</em>")
    .replace(/(^|[^\p{L}\p{M}\p{N}_\\])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{M}\p{N}_])/gu, "$1<em>$2</em>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
}
function inline(src, depth) {
  if (!src) return "";
  const atoms = [], hold = h => PH_A + (atoms.push(h) - 1) + PH_B;
  let s = String(src).replace(/[]/g, "");
  s = s.replace(INLINE_RE, function (m, m1, m2, m3, m4, escCh, ticks, code, bang, label, url, t1, t2, auto, bare, tag, tagText, cd, cu, offset, whole) {
    if (m1 !== undefined) return hold(mathHtml(m1, false));
    if (m2 !== undefined) return hold(mathHtml(m2, false));
    if (m3 !== undefined) return hold(mathHtml(m3, false));
    if (m4 !== undefined) {
      // "$5 and $10" is money, not maths: need a TeX-ish body or a tight single token
      const texish = /[\\^_={}]/.test(m4), tiny = /^[A-Za-z0-9]{1,3}$/.test(m4);
      const simple = m4.length <= 24 && /^[A-Za-z0-9 ().,]*[+\-*/<>|][A-Za-z0-9+\-*/<>|(). ,]*$/.test(m4) && !/[A-Z]{3,}/.test(m4);
      if (/\s$/.test(m4) || !(texish || tiny || simple)) return m;
      return hold(mathHtml(m4, false));
    }
    if (escCh !== undefined) return hold(esc(escCh));
    if (ticks !== undefined) {
      let c = code;
      if (/^ [\s\S]* $/.test(c) && c.trim()) c = c.slice(1, -1);
      // TeX the model put in backticks (`6CO_2 \xrightarrow{\text{light}} ...`) is maths, not code: show it as maths
      if (/\\(?:x?rightarrow|to|text|frac|times|cdot|ce|longrightarrow|rightleftharpoons)\b/.test(c) && !/[;\n]|=>|==|\bfunction\b/.test(c)) return hold(mathHtml(c, false));
      return hold("<code>" + esc(c.replace(/\n/g, " ")) + "</code>");
    }
    if (label !== undefined) {
      let u = url || "";
      if (u[0] === "<" && u[u.length - 1] === ">") u = u.slice(1, -1);
      const text = (depth || 0) < 3 ? inline(label, (depth || 0) + 1) : esc(label);
      if (!SAFE_URL.test(u)) return hold(text || esc(u));
      if (!bang && siteLabel(label, u)) return hold(citePill(label, u));
      return hold(anchor(u, text || esc(u), t1 || t2));
    }
    if (auto !== undefined) return hold(anchor(auto, esc(auto.replace(/^mailto:/, ""))));
    if (bare !== undefined) {
      if (offset > 0 && /[\w@]/.test(whole[offset - 1])) return m;
      const p = trimUrl(bare);
      if (p[0].length < 11) return m;
      return hold(anchor(p[0], esc(p[0]))) + p[1];
    }
    if (tag !== undefined) return hold("<" + tag + ">" + esc(tagText) + "</" + tag + ">");
    if (cd !== undefined) { let h = ""; try { h = new URL(cu).hostname; } catch (e) {} return SAFE_URL.test(cu) && h ? (m[0] === " " ? " " : "") + hold(citePill(h, cu)) : m; }   // a pill always shows where it really leads
    return hold("<br>");
  });
  s = emphasis(esc(markBase(fixScript(fixDigits(s)))));
  // restore atoms (an atom can itself contain placeholders from nested emphasis text, so loop until stable)
  for (let k = 0; k < 4 && s.indexOf(PH_A) !== -1; k++) s = s.replace(/(\d+)/g, (_, n) => atoms[n] !== undefined ? atoms[n] : "");
  return s;
}

// ---------------------------------------------------------------- blocks
const RE_FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^`\n]*)$/;
const RE_HEAD = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const RE_HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const RE_QUOTE = /^ {0,3}>[ \t]?/;
const RE_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)]|[\u09E6-\u09EF]{1,9}[.)])(?:[ \t]+|$)/;   // Bengali digits number lists too: ১. ২. ৩.
const isOrd = mark => /[\d\u09E6-\u09EF]/.test(mark), asciiDigits = s => s.replace(/[\u09E6-\u09EF]/g, d => String(d.charCodeAt(0) - 0x09E6));
const RE_TSEP = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const RE_MATH_OPEN = /^ {0,3}(\$\$|\\\[)[ \t]*(.*)$/;
const indentOf = l => { let n = 0; for (let k = 0; k < l.length; k++) { if (l[k] === " ") n++; else if (l[k] === "\t") n += 4 - (n % 4); else break; } return n; };
const isBlank = l => !l || !l.trim();
function stripIndent(l, n) { let k = 0, w = 0; while (k < l.length && w < n) { if (l[k] === " ") w++; else if (l[k] === "\t") w += 4 - (w % 4); else break; k++; } return l.slice(k); }
function splitRow(line) {
  let s = line.trim();
  if (s[0] === "|") s = s.slice(1);
  if (s[s.length - 1] === "|" && s[s.length - 2] !== "\\") s = s.slice(0, -1);
  const cells = []; let cur = "", code = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "\\" && s[k + 1] === "|") { cur += "|"; k++; continue; }
    if (c === TICK) code = !code;
    if (c === "|" && !code) { cells.push(cur.trim()); cur = ""; } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}
function startsBlock(line, next) {
  return RE_FENCE.test(line) || RE_HEAD.test(line) || RE_HR.test(line) || RE_QUOTE.test(line) || RE_MATH_OPEN.test(line) ||
    (line.indexOf("|") !== -1 && next !== undefined && RE_TSEP.test(next) && next.indexOf("-") !== -1 && splitRow(line).length === splitRow(next).length);
}
// The "Sources:" line Wind adds under a searched answer is drawn as small source cards (title + site), not a run of links.
const RE_SOURCES = /^\*\*Sources:?\*\*:?\s*/;
// the site's own name decides the letter: en.wikipedia.org -> W, bbc.co.uk -> B
function siteLetter(host) { const p = host.split(".").slice(0, -1); if (p.length > 1 && /^(co|com|org|net|ac|gov|edu|go|or|ne)$/.test(p[p.length - 1])) p.pop(); return ((p[p.length - 1] || host)[0] || "?").toUpperCase(); }
function sourcesHtml(list) {
  const items = [];
  for (const s of list || []) {
    if (!s || !SAFE_URL.test(s.url || "")) continue;
    let host = ""; try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch (e) { continue; }
    const full = String(s.title || "").replace(/\s+/g, " ").trim() || host, short = full.replace(/\s+[|:–—-]\s+[^|:–—-]{2,40}$/, "").trim();
    items.push('<a class="src" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer nofollow" title="' + esc(full) + '"><span class="src-t">' + esc(short.length >= 8 ? short : full) +
      '</span><span class="src-d"><span class="src-ic" aria-hidden="true">' + esc(siteLetter(host)) + '</span><span class="src-h">' + esc(host) + "</span></span></a>");
  }
  return items.length ? '<div class="sources"><p class="src-head">Sources</p><div class="src-list">' + items.join("") + "</div></div>" : "";
}
function sourceCards(text) {
  if (!RE_SOURCES.test(text)) return null;
  const list = [];
  for (const part of text.replace(RE_SOURCES, "").split(/\s+·\s+/)) {
    const m = /^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/.exec(part.trim());
    if (!m || !SAFE_URL.test(m[2])) return null;
    list.push({ url: m[2], title: m[1] });
  }
  return sourcesHtml(list) || null;
}
function codeBlock(lang, code) {
  const l = String(lang || "").trim().split(/\s+/)[0].replace(/^\{?\.?/, "").replace(/\}$/, "").toLowerCase();
  return '<div class="codeblock"><div class="code-head"><span class="lang">' + esc(langName(l)) + '</span><button type="button" class="wrap-code" aria-label="Wrap long lines" aria-pressed="false" title="Wrap long lines"><svg class="ic" aria-hidden="true"><use href="#i-wrap"/></svg></button><button type="button" class="copy-code" aria-label="Copy code"><svg class="ic" aria-hidden="true"><use href="#i-copy"/></svg><span>Copy</span></button></div><pre><code>' + highlight(code, l) + "</code></pre></div>";
}
const CALLOUTS = { NOTE: "Note", TIP: "Tip", IMPORTANT: "Important", WARNING: "Warning", CAUTION: "Caution" };

function parseBlocks(lines, depth) {
  const out = [];
  let i = 0;
  const n = lines.length;
  depth = depth || 0;
  while (i < n) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    let m;
    // ---- fenced code
    if ((m = RE_FENCE.exec(line))) {
      const ind = m[1].length, ch = m[2][0], len = m[2].length, body = [];
      const close = new RegExp("^ {0,3}\\" + ch + "{" + len + ",}[ \\t]*$");
      i++;
      while (i < n && !close.test(lines[i])) { body.push(stripIndent(lines[i], ind)); i++; }
      i++; // closing fence (or end of text while streaming)
      out.push(codeBlock(m[3], body.join("\n")));
      continue;
    }
    // ---- display maths
    if ((m = RE_MATH_OPEN.exec(line))) {
      const open = m[1], closeTok = open === "$$" ? "$$" : "\\]";
      let rest = m[2], body = [], done = false;
      const ci = rest.indexOf(closeTok);
      if (ci !== -1 && !rest.slice(ci + closeTok.length).trim()) { body.push(rest.slice(0, ci)); done = true; i++; }
      else if (ci === -1) {
        body.push(rest); let j = i + 1;
        while (j < n) { const c2 = lines[j].indexOf(closeTok); if (c2 !== -1) { body.push(lines[j].slice(0, c2)); done = !lines[j].slice(c2 + closeTok.length).trim(); break; } body.push(lines[j]); j++; }
        if (done) i = j + 1;
      }
      if (done) { out.push(mathHtml(body.join("\n"), true)); continue; }
    }
    // ---- heading
    if ((m = RE_HEAD.exec(line))) { const lv = m[1].length; out.push("<h" + lv + ">" + inline(m[2]) + "</h" + lv + ">"); i++; continue; }
    // ---- rule
    if (RE_HR.test(line)) { out.push("<hr>"); i++; continue; }
    // ---- table
    if (line.indexOf("|") !== -1 && i + 1 < n && RE_TSEP.test(lines[i + 1]) && lines[i + 1].indexOf("-") !== -1) {
      const head = splitRow(line), sep = splitRow(lines[i + 1]);
      if (head.length === sep.length && head.length > 0 && (head.length > 1 || /\|/.test(line))) {
        const align = sep.map(c => /^:-+:$/.test(c) ? "c" : /-:$/.test(c) ? "r" : "");
        let j = i + 2; const rows = [];
        while (j < n && !isBlank(lines[j]) && lines[j].indexOf("|") !== -1 && !RE_FENCE.test(lines[j])) { rows.push(splitRow(lines[j])); j++; }
        // column shape from its longest cell: short values (names, dates, prices) stay on one line, long text keeps a readable width
        const cellLen = c => Math.max(0, ...String(c).replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`~]/g, "").split(/<br\s*\/?>/i).map(x => x.trim().length));
        const shape = head.map((_, k) => { const m = Math.max(0, ...rows.map(r => cellLen(r[k] || ""))); return m && m <= 18 ? "nw" : m > 60 ? "wide" : ""; });
        const cls = k => { const c = [align[k] ? "ta-" + align[k] : "", shape[k]].filter(Boolean).join(" "); return c ? ' class="' + c + '"' : ""; };
        out.push('<div class="table-wrap"><table><thead><tr>' + head.map((c, k) => "<th" + cls(k) + ">" + inline(c) + "</th>").join("") + "</tr></thead><tbody>" +
          rows.map(r => "<tr>" + head.map((_, k) => "<td" + cls(k) + ">" + inline(r[k] || "") + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>");
        i = j; continue;
      }
    }
    // ---- quote
    if (RE_QUOTE.test(line)) {
      const body = [];
      while (i < n && RE_QUOTE.test(lines[i])) { body.push(lines[i].replace(RE_QUOTE, "")); i++; }
      const call = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i.exec(body[0] || "");
      if (call) { const k = call[1].toUpperCase(); out.push('<blockquote class="callout ' + k.toLowerCase() + '"><p class="callout-title">' + CALLOUTS[k] + "</p>" + (depth < 6 ? parseBlocks(body.slice(1), depth + 1).join("") : esc(body.slice(1).join("\n"))) + "</blockquote>"); }
      else out.push("<blockquote>" + (depth < 6 ? parseBlocks(body, depth + 1).join("") : "<p>" + esc(body.join("\n")) + "</p>") + "</blockquote>");
      continue;
    }
    // ---- list
    if ((m = RE_ITEM.exec(line)) && !RE_HR.test(line)) {
      const base = indentOf(m[1]), ordered = isOrd(m[2]), bnList = /[\u09E6-\u09EF]/.test(m[2]), start = ordered ? parseInt(asciiDigits(m[2]), 10) : 1;
      const items = []; let loose = false;
      while (i < n) {
        const im = RE_ITEM.exec(lines[i]);
        if (!im || RE_HR.test(lines[i])) break;
        const ind = indentOf(im[1]);
        if (ind > base + 1 || ind < base - 1 || isOrd(im[2]) !== ordered) break;
        // content column: marker + following spaces (at most 4, otherwise it is indented code we ignore)
        const after = lines[i].slice(im[0].length), gap = im[0].length - im[1].length - im[2].length;
        const W = ind + im[2].length + (gap >= 1 && gap <= 4 ? gap : 1);
        const body = [after];
        let j = i + 1, sawBlank = false, itemLoose = false;
        while (j < n) {
          const l = lines[j];
          if (isBlank(l)) { sawBlank = true; body.push(""); j++; continue; }
          const li = indentOf(l), nm = RE_ITEM.exec(l);
          if (nm && li <= base + 1 && !RE_HR.test(l)) break;            // next sibling (or parent's sibling)
          if (li >= base + 2) { if (sawBlank) itemLoose = true; sawBlank = false; body.push(stripIndent(l, Math.min(li, W))); j++; continue; }
          if (sawBlank || startsBlock(l, lines[j + 1])) break;          // unindented text after a gap, or a new block: list is over
          body.push(l.trim()); j++;                                     // lazy continuation of the paragraph
        }
        while (body.length && isBlank(body[body.length - 1])) body.pop();
        const endedWithBlank = j < n && sawBlank && RE_ITEM.test(lines[j]) && indentOf(RE_ITEM.exec(lines[j])[1]) <= base + 1;
        if (endedWithBlank || itemLoose) loose = true;
        items.push(body);
        i = j;
      }
      const tag = ordered ? "ol" : "ul";
      let html = "<" + tag + (bnList ? ' class="bn"' : "") + (ordered && start !== 1 && start >= 0 ? ' start="' + start + '"' : "") + ">";
      for (const body of items) {
        let task = null, first = body[0] || "";
        const tm = /^\[([ xX])\][ \t]+/.exec(first);
        if (tm) { task = tm[1] !== " "; first = first.slice(tm[0].length); }
        const inner = depth < 8 ? parseBlocks([first].concat(body.slice(1)), depth + 1) : ["<p>" + esc(body.join("\n")) + "</p>"];
        if (!loose && inner.length && /^<p>/.test(inner[0])) inner[0] = inner[0].replace(/^<p>([\s\S]*)<\/p>$/, "$1");
        html += "<li" + (task !== null ? ' class="task"' : "") + ">" + (task !== null ? '<input type="checkbox" disabled' + (task ? " checked" : "") + ' aria-label="' + (task ? "Done" : "To do") + '">' : "") + inner.join("") + "</li>";
      }
      out.push(html + "</" + tag + ">");
      continue;
    }
    // ---- paragraph
    const para = [line.trim()];
    i++;
    while (i < n && !isBlank(lines[i])) {
      const l = lines[i], im = RE_ITEM.exec(l);
      if (startsBlock(l, lines[i + 1])) break;
      if (im && (!isOrd(im[2]) || /^[1\u09E7][.)]$/.test(im[2])) && l.slice(im[0].length).trim()) break;
      para.push(l.trim()); i++;
    }
    const cards = depth === 0 ? sourceCards(para.join(" ")) : null;
    if (cards) { out.push(cards); continue; }
    out.push("<p>" + inline(para.map(l => l.replace(/([^\\])\\$/, "$1")).join("\n")).replace(/\n/g, "<br>") + "</p>");
  }
  return out;
}
// Top-level blocks as separate HTML strings (each is exactly one element), so a streaming reply can be patched block by block.
function mdBlocks(source) {
  return parseBlocks(String(source || "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "").split("\n"), 0).filter(h => h);
}
function renderMarkdown(source) { return mdBlocks(String(source).replace(/[\u00A0\u2007\u2009\u200A\u202F]/g, " ").replace(/[\u2010\u2011]/g, "-")).join(""); }

// While a reply is still arriving, half-written markdown is held back or closed so raw symbols never flash.
function streamSafe(t) {
  t = String(t || "");
  t = t.replace(/(^|\n)[ \t]*(?:[-*+]|[\d\u09E6-\u09EF]+[.)]|#{1,6}|>)[ \t]*$/, "$1");
  if ((t.split(FENCE).length - 1) % 2) return t;                       // inside an open code block: show as is
  t = t.replace(/(^|\n)[ \t]*`{1,2}$/, "$1")                            // a fence being typed
    .replace(/\[[^\]\n]*(\]\([^)\s]*)?$/, "");                          // half a link
  const cut = t.lastIndexOf("\n\n"), headPart = cut < 0 ? "" : t.slice(0, cut + 2);
  let last = cut < 0 ? t : t.slice(cut + 2);
  // a table is held back until its first row starts; after that rows fill in cell by cell
  const tl = last.split("\n"), ti = tl.findIndex(l => /^\s*\|/.test(l));
  if (ti !== -1) {
    const sep = tl[ti + 1];
    const sepOk = sep !== undefined && RE_TSEP.test(sep) && sep.indexOf("-") !== -1 && splitRow(sep).length === splitRow(tl[ti]).length;
    if (!sepOk) last = tl.slice(0, ti).join("\n");   // the header shows as soon as its separator line is in
    else { const lr = tl[tl.length - 1]; if (/^\s*\|/.test(lr) && !/\|[ \t]*$/.test(lr)) {
      // a half-typed row shows the cells typed so far (closing any open bold or code span inside the cell)
      let row = lr.replace(/[ \t]+$/, "");
      if (!row.replace(/[|\s:-]/g, "")) last = tl.slice(0, -1).join("\n");
      else { if (((row.match(/\*\*/g) || []).length) % 2) row = /\*\*$/.test(row) ? row.slice(0, -2) : row + "**"; if ((row.replace(/\*\*/g, "").split(TICK).length - 1) % 2) row += TICK; last = tl.slice(0, -1).concat(row + " |").join("\n"); } } }
  }
  // unfinished maths
  const dd = last.split("$$").length - 1; if (dd % 2) last = last.slice(0, last.lastIndexOf("$$"));
  const ob = last.lastIndexOf("\\["), cb = last.lastIndexOf("\\]"); if (ob > cb) last = last.slice(0, ob);
  const op = last.lastIndexOf("\\("), cp = last.lastIndexOf("\\)"); if (op > cp) last = last.slice(0, op);
  // unfinished bold / code span
  const fi = last.lastIndexOf(FENCE), tail = fi < 0 ? last : last.slice(fi + FENCE.length);
  if (((tail.match(/\*\*/g) || []).length) % 2) last = /\*\*$/.test(last) ? last.slice(0, -2) : last + "**";
  if ((tail.replace(/\*\*/g, "").split(TICK).length - 1) % 2) last = last[last.length - 1] === TICK ? last.slice(0, -1) : last + TICK;
  return headPart + last;
}

if (typeof module !== "undefined" && module.exports) module.exports = { esc, inline, mdBlocks, renderMarkdown, streamSafe, fixDigits, fixDigitsMd, highlight, langName, texToHtml, mathHtml };


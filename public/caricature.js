// Procedural SVG caricature generator. A "look" is a small set of enumerated traits;
// the model designs one per tailored persona, and the rest are derived from the name.
const LOOK = {
  skin: ["#f6d3b8", "#e9b48f", "#c98d63", "#8d5a3b", "#5a3a28", "#f3c9a5"],
  hair: ["bald", "short", "spiky", "long", "curly", "sidepart", "mohawk", "bun", "afro"],
  hairColor: ["#2b1d14", "#5a3a1e", "#c68b3e", "#e8c872", "#9a9a9a", "#d9d9d9", "#a3322a", "#2d4a8a"],
  head: ["round", "long", "square", "pear"],
  brows: ["flat", "angry", "raised", "worried"],
  nose: ["small", "big", "pointy"],
  mouth: ["smile", "smirk", "flat", "frown", "grin"],
  facial: ["none", "beard", "mustache", "goatee", "stubble"],
  glasses: ["none", "round", "square", "monocle", "sunglasses"],
  hat: ["none", "tophat", "cap", "beanie", "headband", "witchhat", "goggles", "leaves", "bandana"],
};

function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function makeLook(raw, name) {
  raw = raw && typeof raw === "object" ? raw : {};
  let h = hashStr(name || "x");
  const look = {};
  for (const k of Object.keys(LOOK)) {
    const v = typeof raw[k] === "string" ? raw[k].toLowerCase() : "";
    const ok = LOOK[k].includes(v) || ((k === "skin" || k === "hairColor") && /^#[0-9a-f]{6}$/.test(v));
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    look[k] = ok ? v : LOOK[k][h % LOOK[k].length];
    // keep unprompted defaults tame: most people don't wear hats/monocles
    // accessories are only worn when a design asked for them, so faces never get random props
    if (!ok && (k === "hat" || k === "glasses" || k === "facial")) look[k] = "none";
  }
  return look;
}

function caricatureSVG(look, shirt) {
  const L = look, ink = "#4a2f22";
  const hair = L.hairColor, skin = L.skin;
  const hatted = L.hat !== "none";
  let hs = L.hair;
  if (hatted && ["spiky", "mohawk", "bun", "curly", "afro"].includes(hs)) hs = "short";

  const heads = {
    round: `<ellipse cx="50" cy="50" rx="34" ry="36"/>`,
    long: `<ellipse cx="50" cy="52" rx="29" ry="40"/>`,
    square: `<rect x="15" y="16" width="70" height="68" rx="24"/>`,
    pear: `<path d="M24 40 C24 18 76 18 76 40 C81 62 74 88 50 88 C26 88 19 62 24 40Z"/>`,
  };

  const back = {
    long: `<path d="M14 44 C10 10 90 10 86 44 L90 98 L70 98 L70 62 L30 62 L30 98 L10 98Z" fill="${hair}"/>`,
    afro: `<circle cx="50" cy="34" r="42" fill="${hair}"/>`,
  }[hs] || "";

  const topShort = `<path d="M16 46 C12 12 88 12 84 46 C78 30 62 25 50 25 C38 25 22 30 16 46Z" fill="${hair}"/>`;
  const front = {
    short: topShort,
    long: topShort,
    afro: `<path d="M18 44 C22 28 78 28 82 44 C70 34 30 34 18 44Z" fill="${hair}"/>`,
    spiky: `<path d="M16 42 L12 20 L28 28 L34 6 L45 24 L54 4 L62 24 L74 8 L76 28 L88 20 L84 42 C70 28 30 28 16 42Z" fill="${hair}"/>`,
    curly: [[26, 26], [38, 17], [50, 14], [62, 17], [74, 26], [18, 40], [82, 40]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="${hair}"/>`).join(""),
    sidepart: `<path d="M16 46 C10 8 82 6 85 40 C70 22 44 22 30 34 C24 38 19 42 16 46Z" fill="${hair}"/>`,
    mohawk: `<path d="M41 4 L59 4 L61 34 L39 34Z" fill="${hair}"/>`,
    bun: topShort + `<circle cx="50" cy="8" r="11" fill="${hair}"/>`,
    bald: "",
  }[hs];

  const brow = (d) => `<path d="${d}" stroke="${ink}" stroke-width="3.6" stroke-linecap="round" fill="none"/>`;
  const brows = {
    flat: brow("M28 37 L45 37") + brow("M55 37 L72 37"),
    angry: brow("M28 33 L45 41") + brow("M55 41 L72 33"),
    raised: brow("M28 37 Q37 27 46 35") + brow("M54 35 Q63 27 72 37"),
    worried: brow("M28 40 L45 34") + brow("M55 34 L72 40"),
  }[L.brows];

  const nose = {
    small: `<path d="M50 54 Q47 62 52 63" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    big: `<ellipse cx="50" cy="60" rx="8" ry="7" fill="#000" fill-opacity=".16"/><path d="M43 62 Q50 68 57 62" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    pointy: `<path d="M50 48 L43 65 L53 65" stroke="${ink}" stroke-width="2.4" fill="#000" fill-opacity=".1" stroke-linejoin="round"/>`,
  }[L.nose];

  const m = `stroke="#5a1f1f" stroke-width="3" fill="none" stroke-linecap="round"`;
  const mouth = {
    smile: `<path d="M37 72 Q50 85 63 72" ${m}/>`,
    smirk: `<path d="M38 75 Q52 77 63 69" ${m}/>`,
    flat: `<path d="M40 76 L60 76" ${m}/>`,
    frown: `<path d="M39 79 Q50 68 61 79" ${m}/>`,
    grin: `<path d="M34 70 Q50 90 66 70Z" fill="#fff" stroke="#5a1f1f" stroke-width="2.6" stroke-linejoin="round"/>`,
  }[L.mouth];

  const facial = {
    beard: `<path d="M16 56 C14 98 86 98 84 56 C78 78 64 82 50 82 C36 82 22 78 16 56Z" fill="${hair}"/>`,
    mustache: `<path d="M35 67 Q43 59 50 66 Q57 59 65 67 Q57 71 50 68 Q43 71 35 67Z" fill="${hair}"/>`,
    goatee: `<ellipse cx="50" cy="85" rx="9" ry="7" fill="${hair}"/>`,
    stubble: `<path d="M18 58 C16 96 84 96 82 58 C76 80 62 84 50 84 C38 84 24 80 18 58Z" fill="#000" fill-opacity=".16"/>`,
    none: "",
  }[L.facial];

  const frame = `stroke="#1d1d1d" stroke-width="2.6"`;
  const glasses = {
    none: "",
    round: `<circle cx="37" cy="48" r="11" ${frame} fill="#fff" fill-opacity=".25"/><circle cx="63" cy="48" r="11" ${frame} fill="#fff" fill-opacity=".25"/><path d="M48 47 Q50 44 52 47" ${frame} fill="none"/>`,
    square: `<rect x="25" y="39" width="22" height="17" rx="3" ${frame} fill="#fff" fill-opacity=".25"/><rect x="53" y="39" width="22" height="17" rx="3" ${frame} fill="#fff" fill-opacity=".25"/><path d="M47 46 H53" ${frame}/>`,
    monocle: `<circle cx="63" cy="48" r="12" ${frame} fill="#fff" fill-opacity=".25"/><path d="M71 57 Q80 76 74 98" stroke="#b8860b" stroke-width="1.8" fill="none"/>`,
    sunglasses: `<rect x="24" y="40" width="23" height="15" rx="6" fill="#111"/><rect x="53" y="40" width="23" height="15" rx="6" fill="#111"/><path d="M47 45 H53" stroke="#111" stroke-width="3"/><path d="M29 44 l6 0" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>`,
  }[L.glasses];

  const hide = L.glasses === "sunglasses";
  const eyes = hide ? "" : [37, 63].map(x => `<g class="eye"><circle cx="${x}" cy="48" r="8.2" fill="#fffdf6" stroke="${ink}" stroke-width="1.4"/><circle class="pupil" cx="${x}" cy="49.5" r="4.6" fill="#3a2418"/><circle cx="${x - 1.6}" cy="47.6" r="1.7" fill="#fff"/><circle cx="${x + 1.8}" cy="51" r=".9" fill="#fff"/></g>`).join("");

  const hat = {
    none: "",
    tophat: `<rect x="29" y="-4" width="42" height="32" rx="2" fill="#222"/><rect x="29" y="18" width="42" height="6" fill="${shirt}"/><rect x="14" y="26" width="72" height="7" rx="3.5" fill="#222"/>`,
    cap: `<path d="M17 36 C17 8 83 8 83 36Z" fill="${shirt}"/><path d="M58 34 Q86 30 96 40 L58 40Z" fill="${shirt}" stroke="#000" stroke-opacity=".25"/><circle cx="50" cy="10" r="3" fill="#000" fill-opacity=".3"/>`,
    beanie: `<path d="M16 38 C16 4 84 4 84 38Z" fill="${shirt}"/><rect x="15" y="31" width="70" height="9" rx="4" fill="#000" fill-opacity=".22"/><circle cx="50" cy="5" r="6" fill="${shirt}"/>`,
    headband: `<rect x="15" y="29" width="70" height="7" rx="3" fill="${shirt}"/>`,
    witchhat: `<ellipse cx="50" cy="30" rx="44" ry="8" fill="#2f2a4a"/><path d="M26 30 Q40 6 66 -14 Q60 10 74 30Z" fill="#3a3560"/><rect x="28" y="22" width="44" height="6" fill="${shirt}"/>`,
    goggles: `<path d="M15 30 Q50 18 85 30" stroke="#6b4a2a" stroke-width="5" fill="none"/><circle cx="36" cy="25" r="9" fill="#9fd8e8" stroke="#6b4a2a" stroke-width="3.2"/><circle cx="64" cy="25" r="9" fill="#9fd8e8" stroke="#6b4a2a" stroke-width="3.2"/><path d="M32 22 l5 -2" stroke="#fff" stroke-width="2"/>`,
    leaves: [[22,30,-50],[34,22,-25],[50,19,0],[66,22,25],[78,30,50]].map(([x,y,r]) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="11" transform="rotate(${r} ${x} ${y})" fill="#6fae5a" stroke="#3f7a38" stroke-width="1.2"/>`).join(""),
    bandana: `<path d="M15 36 C15 14 85 14 85 36 C70 28 30 28 15 36Z" fill="${shirt}"/><path d="M82 34 L96 30 L90 42Z" fill="${shirt}"/>`,
  }[L.hat];

  const cheeks = `<ellipse cx="29" cy="64" rx="6.5" ry="4" fill="#ff7b7b" fill-opacity=".32"/><ellipse cx="71" cy="64" rx="6.5" ry="4" fill="#ff7b7b" fill-opacity=".32"/>`;
  const ears = `<circle cx="16" cy="53" r="7" fill="${skin}" stroke="${ink}" stroke-width="1.6"/><circle cx="84" cy="53" r="7" fill="${skin}" stroke="${ink}" stroke-width="1.6"/>`;

  return `<svg class="cari" viewBox="0 -6 100 116" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M10 112 C10 94 30 90 50 92 C70 90 90 94 90 112Z" fill="${shirt}" stroke="${ink}" stroke-width="1.6"/>
    <rect x="41" y="80" width="18" height="16" fill="${skin}" stroke="${ink}" stroke-width="1.6"/>
    ${back}${ears}
    <g fill="${skin}" stroke="${ink}" stroke-width="2">${heads[L.head]}</g>
    ${cheeks}${eyes}${brows}${nose}
    <g class="mouthStatic">${mouth}</g>
    <ellipse class="mouthOpen" cx="50" cy="76" rx="8" ry="6.5" fill="#4a1414" stroke="#2a0a0a" stroke-width="1.5"/>
    ${facial}${glasses}${front}${hat}
  </svg>`;
}

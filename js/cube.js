// Facelet model of the 3x3x3 cube in Kociemba order (U R F D L B, each face
// read row by row as seen from outside). Moves are derived geometrically, so
// the 3D view and the solver agree on every sticker by construction.

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
export const SOLVED = FACES.map((f) => f.repeat(9)).join('');

// x = right, y = up, z = towards the viewer (front)
export const NORMAL = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
  D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
};

function stickerPos(face, r, c) {
  switch (face) {
    case 'U': return [c - 1, 1, r - 1];
    case 'R': return [1, 1 - r, 1 - c];
    case 'F': return [c - 1, 1 - r, 1];
    case 'D': return [c - 1, -1, 1 - r];
    case 'L': return [-1, 1 - r, c - 1];
    case 'B': return [1 - c, 1 - r, -1];
  }
}

export const STICKERS = FACES.flatMap((face) =>
  Array.from({ length: 9 }, (_, i) => ({
    face,
    pos: stickerPos(face, Math.floor(i / 3), i % 3),
    normal: NORMAL[face],
  })),
);

const key = (p, n) => `${p}|${n}`;
const INDEX = new Map(STICKERS.map((s, i) => [key(s.pos, s.normal), i]));
export const stickerAt = (pos, normal) => INDEX.get(key(pos, normal)) ?? -1;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Clockwise quarter turn as seen from the tip of axis a (Rodrigues, -90 deg).
function quarter(a, v) {
  const d = dot(a, v);
  return [
    a[0] * d - (a[1] * v[2] - a[2] * v[1]),
    a[1] * d - (a[2] * v[0] - a[0] * v[2]),
    a[2] * d - (a[0] * v[1] - a[1] * v[0]),
  ];
}

// PERM[move][i] = slot that the sticker in slot i moves to
const PERM = {};
for (const f of FACES) {
  const n = NORMAL[f];
  const q = STICKERS.map((s, i) =>
    dot(s.pos, n) === 1 ? INDEX.get(key(quarter(n, s.pos), quarter(n, s.normal))) : i,
  );
  PERM[f] = q;
  PERM[f + '2'] = q.map((d) => q[d]);
  PERM[f + "'"] = q.map((d) => q[q[d]]);
}

export const isMove = (m) => Object.hasOwn(PERM, m);

export function applyMove(state, move) {
  const q = PERM[move];
  if (!q) throw new Error(`Unbekannter Zug: ${move}`);
  const out = new Array(54);
  for (let i = 0; i < 54; i++) out[q[i]] = state[i];
  return typeof state === 'string' ? out.join('') : out;
}

export const parseMoves = (str) => str.trim().split(/\s+/).filter(Boolean);

export function applyMoves(state, moves) {
  for (const m of typeof moves === 'string' ? parseMoves(moves) : moves) state = applyMove(state, m);
  return state;
}

export function invertMove(m) {
  if (m.endsWith('2')) return m;
  return m.endsWith("'") ? m[0] : m + "'";
}

// --- validation (facelets -> cubies), after Kociemba's FaceCube ---

const idx = (s) => FACES.indexOf(s[0]) * 9 + Number(s[1]) - 1;
const CORNER_FACELETS = [
  ['U9', 'R1', 'F3'], ['U7', 'F1', 'L3'], ['U1', 'L1', 'B3'], ['U3', 'B1', 'R3'],
  ['D3', 'F9', 'R7'], ['D1', 'L9', 'F7'], ['D7', 'B9', 'L7'], ['D9', 'R9', 'B7'],
].map((c) => c.map(idx));
const CORNER_COLORS = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const EDGE_FACELETS = [
  ['U6', 'R2'], ['U8', 'F2'], ['U4', 'L2'], ['U2', 'B2'], ['D6', 'R8'], ['D2', 'F8'],
  ['D4', 'L8'], ['D8', 'B8'], ['F6', 'R4'], ['F4', 'L6'], ['B6', 'L4'], ['B4', 'R6'],
].map((e) => e.map(idx));
const EDGE_COLORS = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

function parity(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s++;
  return s % 2;
}

// Returns { ok: true } or { ok: false, reason, facelets?, counts?, colors? }.
export function validate(state) {
  if (state.length !== 54) return { ok: false, reason: 'length' };
  const missing = [...state].flatMap((c, i) => (FACES.includes(c) ? [] : [i]));
  if (missing.length) return { ok: false, reason: 'missing', facelets: missing };

  const counts = Object.fromEntries(FACES.map((f) => [f, 0]));
  for (const c of state) counts[c]++;
  if (FACES.some((f) => counts[f] !== 9)) return { ok: false, reason: 'count', counts };

  const cp = [], co = [];
  for (let i = 0; i < 8; i++) {
    const fl = CORNER_FACELETS[i];
    const ori = fl.findIndex((k) => state[k] === 'U' || state[k] === 'D');
    const c1 = state[fl[(ori + 1) % 3]], c2 = state[fl[(ori + 2) % 3]];
    const j = ori < 0 ? -1 : CORNER_COLORS.findIndex((cc) => cc[1] === c1 && cc[2] === c2);
    if (j < 0) return { ok: false, reason: 'corner', facelets: fl, colors: fl.map((k) => state[k]) };
    if (cp.includes(j)) {
      const other = CORNER_FACELETS[cp.indexOf(j)];
      return { ok: false, reason: 'corner-dup', facelets: [...other, ...fl], colors: fl.map((k) => state[k]) };
    }
    cp.push(j);
    co.push(ori);
  }

  const ep = [], eo = [];
  for (let i = 0; i < 12; i++) {
    const [a, b] = EDGE_FACELETS[i];
    let j = EDGE_COLORS.findIndex((ec) => ec[0] === state[a] && ec[1] === state[b]);
    let o = 0;
    if (j < 0) {
      j = EDGE_COLORS.findIndex((ec) => ec[1] === state[a] && ec[0] === state[b]);
      o = 1;
    }
    if (j < 0) return { ok: false, reason: 'edge', facelets: [a, b], colors: [state[a], state[b]] };
    if (ep.includes(j)) {
      const other = EDGE_FACELETS[ep.indexOf(j)];
      return { ok: false, reason: 'edge-dup', facelets: [...other, a, b], colors: [state[a], state[b]] };
    }
    ep.push(j);
    eo.push(o);
  }

  if (co.reduce((a, b) => a + b) % 3) return { ok: false, reason: 'twist' };
  if (eo.reduce((a, b) => a + b) % 2) return { ok: false, reason: 'flip' };
  if (parity(cp) !== parity(ep)) return { ok: false, reason: 'parity' };
  return { ok: true };
}

// Rotates one face's 3x3 block clockwise in the facelet string: the photo of
// that face was taken while the cube was held turned by 90 degrees.
export function rotateFace(state, face, turns = 1) {
  const a = [...state];
  const base = FACES.indexOf(face) * 9;
  for (let t = 0; t < turns; t++) {
    const old = a.slice(base, base + 9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) a[base + r * 3 + c] = old[(2 - c) * 3 + r];
  }
  return typeof state === 'string' ? a.join('') : a;
}

// Searches for the fewest faces (up to maxFaces) that, read rotated, make the
// cube valid. Returns { state, rotated: [{ face, turns }] } or null.
export function findRotationFix(state, maxFaces = 3) {
  const combos = (k, start = 0) =>
    k === 0 ? [[]] : FACES.slice(start).flatMap((f, i) => combos(k - 1, start + i + 1).map((rest) => [f, ...rest]));
  for (let k = 1; k <= maxFaces; k++) {
    for (const faces of combos(k)) {
      const n = 3 ** k;
      for (let code = 0; code < n; code++) {
        let s = state, c = code;
        const rotated = faces.map((face) => {
          const turns = (c % 3) + 1;
          c = Math.floor(c / 3);
          s = rotateFace(s, face, turns);
          return { face, turns };
        });
        if (validate(s).ok) return { state: s, rotated };
      }
    }
  }
  return null;
}

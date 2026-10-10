// Finds a cube photographed from a corner (three faces visible) without any
// guide: sticker blobs -> one lattice per face -> homography -> nine colour
// samples per face. assemble() then turns two such photos into 54 facelets.

import { FACES, NORMAL, stickerAt } from './cube.js';
import { COLORS, EXPECTED, rgbToLab, dist } from './color.js';

const EDGE_T = 64; // Sobel L1 magnitude that counts as a boundary
const MIN_CELL = 7; // px per sticker below which colours are guesswork

// --- pixels -> boundary mask ---

function blur(data, W, H) {
  const n = W * H;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  const tr = new Float32Array(n), tg = new Float32Array(n), tb = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, c = 0;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        const k = (y * W + xx) * 4;
        r += data[k]; g += data[k + 1]; b += data[k + 2]; c++;
      }
      const i = y * W + x;
      tr[i] = r / c; tg[i] = g / c; tb[i] = b / c;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        const k = yy * W + x;
        r += tr[k]; g += tg[k]; b += tb[k]; c++;
      }
      const i = y * W + x;
      R[i] = r / c; G[i] = g / c; B[i] = b / c;
    }
  }
  return { R, G, B };
}

const isDark = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx < 55 && mx - mn < 35;
};

function boundaries({ R, G, B }, W, H) {
  const edge = new Uint8Array(W * H).fill(1);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      let m = 0;
      for (const C of [R, G, B]) {
        const gx = C[i - W + 1] + 2 * C[i + 1] + C[i + W + 1] - C[i - W - 1] - 2 * C[i - 1] - C[i + W - 1];
        const gy = C[i + W - 1] + 2 * C[i + W] + C[i + W + 1] - C[i - W - 1] - 2 * C[i - W] - C[i - W + 1];
        m = Math.max(m, Math.abs(gx) + Math.abs(gy));
      }
      edge[i] = m > EDGE_T || isDark(R[i], G[i], B[i]) ? 1 : 0;
    }
  }
  return edge;
}

// --- boundary mask -> sticker-shaped blobs ---

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const area = (poly) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};

function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lo = [], up = [];
  for (const p of pts) {
    while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop();
    lo.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (up.length >= 2 && cross(up.at(-2), up.at(-1), p) <= 0) up.pop();
    up.push(p);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Drops the vertex that adds the least area until four remain.
function quad(poly) {
  const p = poly.slice();
  while (p.length > 4) {
    let best = 0, bestA = Infinity;
    for (let i = 0; i < p.length; i++) {
      const a = Math.abs(cross(p[(i + p.length - 1) % p.length], p[i], p[(i + 1) % p.length]));
      if (a < bestA) {
        bestA = a;
        best = i;
      }
    }
    p.splice(best, 1);
  }
  // greedy removal can cut corners on thin slanted shapes: slide each corner
  // along the hull while that grows the quad
  const at = p.map((v) => poly.indexOf(v));
  for (let changed = true, guard = 0; changed && guard < 20; guard++) {
    changed = false;
    for (let c = 0; c < 4; c++) {
      const prev = at[(c + 3) % 4], next = at[(c + 1) % 4];
      let bestI = at[c], bestA = area(at.map((i) => poly[i]));
      for (let i = (prev + 1) % poly.length; i !== next; i = (i + 1) % poly.length) {
        const trial = at.slice();
        trial[c] = i;
        const a = area(trial.map((j) => poly[j]));
        if (a > bestA + 1e-9) {
          bestA = a;
          bestI = i;
        }
      }
      if (bestI !== at[c]) {
        at[c] = bestI;
        changed = true;
      }
    }
  }
  return at.map((i) => poly[i]);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);

function blobs(edge, { R, G, B }, W, H) {
  const n = W * H;
  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const pix = new Int32Array(n);
  const minA = Math.max(40, n * 0.0002), maxA = n * 0.05;
  const out = [];
  let id = 0;
  for (let s = 0; s < n; s++) {
    if (edge[s] || label[s] >= 0) continue;
    let sp = 0, k = 0;
    stack[sp++] = s;
    label[s] = id;
    while (sp) {
      const p = stack[--sp];
      pix[k++] = p;
      const x = p % W;
      if (x > 0 && !edge[p - 1] && label[p - 1] < 0) { label[p - 1] = id; stack[sp++] = p - 1; }
      if (x < W - 1 && !edge[p + 1] && label[p + 1] < 0) { label[p + 1] = id; stack[sp++] = p + 1; }
      if (p >= W && !edge[p - W] && label[p - W] < 0) { label[p - W] = id; stack[sp++] = p - W; }
      if (p < n - W && !edge[p + W] && label[p + W] < 0) { label[p + W] = id; stack[sp++] = p + W; }
    }
    id++;
    if (k < minA || k > maxA) continue;

    let sx = 0, sy = 0, sr = 0, sg = 0, sb = 0, sr2 = 0, sg2 = 0, sb2 = 0, y0 = H, y1 = 0;
    for (let j = 0; j < k; j++) {
      const p = pix[j], y = (p / W) | 0;
      sx += p - y * W; sy += y;
      sr += R[p]; sg += G[p]; sb += B[p];
      sr2 += R[p] * R[p]; sg2 += G[p] * G[p]; sb2 += B[p] * B[p];
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const mr = sr / k, mg = sg / k, mb = sb / k;
    const sd = Math.sqrt(Math.max(0, (sr2 / k - mr * mr + sg2 / k - mg * mg + sb2 / k - mb * mb) / 3));
    if (sd > 24) continue;

    const rows = y1 - y0 + 1;
    const lo = new Int32Array(rows).fill(W), hi = new Int32Array(rows).fill(-1);
    for (let j = 0; j < k; j++) {
      const p = pix[j], y = (p / W) | 0, x = p - y * W, r = y - y0;
      if (x < lo[r]) lo[r] = x;
      if (x > hi[r]) hi[r] = x;
    }
    const pts = [];
    for (let r = 0; r < rows; r++) {
      if (hi[r] < 0) continue;
      const y = y0 + r;
      pts.push([lo[r], y], [hi[r] + 1, y], [lo[r], y + 1], [hi[r] + 1, y + 1]);
    }
    const h = hull(pts);
    const hullA = area(h);
    if (k / hullA < 0.8) continue;
    const q = quad(h);
    const qa = area(q);
    if (qa / hullA < 0.8) continue;
    const sides = q.map((p, i) => len(sub(q[(i + 1) % 4], p)));
    if (Math.min(...sides) < 6) continue;
    if (Math.min(sides[0], sides[2]) / Math.max(sides[0], sides[2]) < 0.55) continue;
    if (Math.min(sides[1], sides[3]) / Math.max(sides[1], sides[3]) < 0.55) continue;
    const e1 = mul(add(sub(q[1], q[0]), sub(q[2], q[3])), 0.5);
    const e2 = mul(add(sub(q[3], q[0]), sub(q[2], q[1])), 0.5);
    const ratio = len(e1) / len(e2);
    if (ratio < 0.3 || ratio > 3.3) continue;
    if (Math.abs(cross([0, 0], e1, e2)) / (len(e1) * len(e2)) < 0.3) continue;
    out.push({ c: [sx / k + 0.5, sy / k + 0.5], e: [e1, e2], area: k, rgb: [mr, mg, mb], quad: q });
  }
  return out;
}

// --- blobs -> faces ---

const cosOf = (a, b) => (a[0] * b[0] + a[1] * b[1]) / (len(a) * len(b));

// Orients blob axes B like the oriented axes A, or null if they differ.
function matchAxes(A, B) {
  let best = null;
  for (const [p, q] of [[B[0], B[1]], [B[1], B[0]]]) {
    const c1 = cosOf(A[0], p), c2 = cosOf(A[1], q);
    if (Math.abs(c1) < 0.94 || Math.abs(c2) < 0.94) continue;
    const r1 = len(p) / len(A[0]), r2 = len(q) / len(A[1]);
    if (r1 < 0.6 || r1 > 1.65 || r2 < 0.6 || r2 > 1.65) continue;
    const score = Math.abs(c1) + Math.abs(c2);
    if (!best || score > best.score) best = { score, axes: [c1 < 0 ? mul(p, -1) : p, c2 < 0 ? mul(q, -1) : q] };
  }
  return best?.axes ?? null;
}

function solve2(a, b, d) {
  const det = a[0] * b[1] - a[1] * b[0];
  return [(d[0] * b[1] - d[1] * b[0]) / det, (a[0] * d[1] - a[1] * d[0]) / det];
}

// Lattice step between two stickers, in sticker sizes (pitch is ~1.05-1.2).
function step(t) {
  const a = Math.abs(t);
  if (a < 0.4) return 0;
  if (a > 0.75 && a < 1.6) return Math.sign(t);
  if (a > 1.75 && a < 2.75) return 2 * Math.sign(t);
  return NaN;
}

function group(list) {
  const used = new Array(list.length).fill(false);
  const order = list.map((_, i) => i).sort((a, b) => list[b].area - list[a].area);
  const groups = [];
  for (const s of order) {
    if (used[s]) continue;
    used[s] = true;
    const members = [{ blob: list[s], u: 0, v: 0, axes: list[s].e }];
    const taken = new Set(['0,0']);
    for (let qi = 0; qi < members.length; qi++) {
      const m = members[qi];
      for (let j = 0; j < list.length; j++) {
        if (used[j]) continue;
        const axes = matchAxes(m.axes, list[j].e);
        if (!axes) continue;
        const U = mul(add(m.axes[0], axes[0]), 0.5), V = mul(add(m.axes[1], axes[1]), 0.5);
        const [u, v] = solve2(U, V, sub(list[j].c, m.blob.c));
        const su = step(u), sv = step(v);
        if (Number.isNaN(su) || Number.isNaN(sv) || (!su && !sv)) continue;
        const key = `${m.u + su},${m.v + sv}`;
        if (taken.has(key)) continue;
        taken.add(key);
        used[j] = true;
        members.push({ blob: list[j], u: m.u + su, v: m.v + sv, axes });
      }
    }
    if (members.length >= 3) groups.push(trim(members));
  }
  return groups.filter((g) => g.length >= 4);
}

// Keeps the 3x3 window holding most members.
function trim(members) {
  const us = members.map((m) => m.u), vs = members.map((m) => m.v);
  let best = members;
  if (Math.max(...us) - Math.min(...us) > 2 || Math.max(...vs) - Math.min(...vs) > 2) {
    best = [];
    for (let u0 = Math.min(...us); u0 <= Math.max(...us) - 2; u0++) {
      for (let v0 = Math.min(...vs); v0 <= Math.max(...vs) - 2; v0++) {
        const inside = members.filter((m) => m.u >= u0 && m.u <= u0 + 2 && m.v >= v0 && m.v <= v0 + 2);
        if (inside.length > best.length) best = inside;
      }
    }
  }
  const mu = Math.min(...best.map((m) => m.u)), mv = Math.min(...best.map((m) => m.v));
  return best.map((m) => ({ ...m, u: m.u - mu, v: m.v - mv }));
}

// --- lattice models ---

function gauss(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-12) return null;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}

function leastSquares(rows, rhs) {
  const n = rows[0].length;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  rows.forEach((r, k) => {
    for (let i = 0; i < n; i++) {
      b[i] += r[i] * rhs[k];
      for (let j = 0; j < n; j++) A[i][j] += r[i] * r[j];
    }
  });
  return gauss(A, b);
}

function fitHomography(src, dst) {
  const mx = dst.reduce((s, p) => s + p[0], 0) / dst.length, my = dst.reduce((s, p) => s + p[1], 0) / dst.length;
  const sc = Math.max(1, ...dst.map((p) => Math.hypot(p[0] - mx, p[1] - my)));
  const rows = [], rhs = [];
  src.forEach(([x, y], i) => {
    const X = (dst[i][0] - mx) / sc, Y = (dst[i][1] - my) / sc;
    rows.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); rhs.push(X);
    rows.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); rhs.push(Y);
  });
  const h = leastSquares(rows, rhs);
  if (!h) return null;
  return (x, y) => {
    const w = h[6] * x + h[7] * y + 1;
    return [((h[0] * x + h[1] * y + h[2]) / w) * sc + mx, ((h[3] * x + h[4] * y + h[5]) / w) * sc + my];
  };
}

function fitAffine(members) {
  const us = new Set(members.map((m) => m.u)), vs = new Set(members.map((m) => m.v));
  const meanAxis = (k) => mul(members.reduce((s, m) => add(s, m.axes[k]), [0, 0]), 1.1 / members.length);
  let Pu = meanAxis(0), Pv = meanAxis(1), O;
  const rows = members.map((m) => [m.u + 0.5, m.v + 0.5, 1]);
  const full = us.size > 1 && vs.size > 1 && [0, 1].map((d) => leastSquares(rows, members.map((m) => m.blob.c[d])));
  if (full && full[0] && full[1]) {
    Pu = [full[0][0], full[1][0]];
    Pv = [full[0][1], full[1][1]];
    O = [full[0][2], full[1][2]];
  } else {
    O = mul(members.reduce((s, m) => add(s, sub(m.blob.c, add(mul(Pu, m.u + 0.5), mul(Pv, m.v + 0.5)))), [0, 0]), 1 / members.length);
  }
  return (x, y) => add(O, add(mul(Pu, x), mul(Pv, y)));
}

function fitModel(members) {
  const affine = fitAffine(members);
  if (members.length < 5) return affine;
  const H = fitHomography(members.map((m) => [m.u + 0.5, m.v + 0.5]), members.map((m) => m.blob.c));
  if (!H) return affine;
  const pitch = len(sub(affine(1, 0), affine(0, 0))) + len(sub(affine(0, 1), affine(0, 0)));
  const resid = Math.max(...members.map((m) => len(sub(H(m.u + 0.5, m.v + 0.5), m.blob.c))));
  const corners = [[0, 0], [3, 0], [3, 3], [0, 3]];
  const drift = Math.max(...corners.map(([x, y]) => len(sub(H(x, y), affine(x, y)))));
  const hq = corners.map(([x, y]) => H(x, y)), aq = corners.map(([x, y]) => affine(x, y));
  const sameTurn = Math.sign(cross(hq[0], hq[1], hq[2])) === Math.sign(cross(aq[0], aq[1], aq[2]));
  return resid < pitch * 0.12 && drift < pitch * 0.6 && sameTurn ? H : affine;
}

function samplePatch({ R, G, B }, W, H, map, u, v) {
  const r = [], g = [], b = [];
  for (const du of [-0.22, -0.11, 0, 0.11, 0.22]) {
    for (const dv of [-0.22, -0.11, 0, 0.11, 0.22]) {
      const [x, y] = map(u + 0.5 + du, v + 0.5 + dv);
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null;
      const i = yi * W + xi;
      r.push(R[i]); g.push(G[i]); b.push(B[i]);
    }
  }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const rgb = [med(r), med(g), med(b)];
  const sd = Math.sqrt([r, g, b].reduce((s, a, k) => s + a.reduce((t, x) => t + (x - rgb[k]) ** 2, 0) / a.length, 0) / 3);
  return { rgb, sd };
}

// Every placement of the found stickers inside the 3x3 face that keeps all
// nine cells in the image. Which one is right is decided with the other faces.
function placements(members, img, W, H) {
  const spanU = Math.max(...members.map((m) => m.u)) + 1, spanV = Math.max(...members.map((m) => m.v)) + 1;
  const model = fitModel(members);
  const out = [];
  for (let ou = 0; ou <= 3 - spanU; ou++) {
    for (let ov = 0; ov <= 3 - spanV; ov++) {
      const map = (x, y) => model(x - ou, y - ov);
      let score = 0;
      const cells = [];
      for (let v = 0; v < 3; v++) {
        for (let u = 0; u < 3; u++) {
          const s = samplePatch(img, W, H, map, u, v);
          const found = members.some((m) => m.u + ou === u && m.v + ov === v);
          if (s && (found || (s.sd < 22 && !isDark(...s.rgb)))) score++;
          cells.push(s);
        }
      }
      if (cells.some((c) => !c) || score < 7) continue;
      const q = [[0, 0], [3, 0], [3, 3], [0, 3]].map(([x, y]) => map(x, y));
      const turns = q.map((p, i) => Math.sign(cross(p, q[(i + 1) % 4], q[(i + 2) % 4])));
      if (!turns.every((t) => t && t === turns[0])) continue;
      if (!fitsCells(map, members.map((m) => [[m.u + ou + 0.5, m.v + ov + 0.5], m.blob.c, m.blob.area]))) continue;
      out.push({
        map,
        score,
        found: members.length,
        axes: members[0].axes,
        center: map(1.5, 1.5),
        corners: [[0, 0], [3, 0], [3, 3], [0, 3]].map(([x, y]) => map(x, y)),
        cells: cells.map((c) => ({ rgb: c.rgb, lab: rgbToLab(c.rgb) })),
        stickers: members.map((m) => m.blob.quad),
        points: members.map((m) => [[m.u + ou + 0.5, m.v + ov + 0.5], m.blob.c, m.blob.area]),
      });
    }
  }
  return out;
}

// Each found sticker must cover a sensible share of its lattice cell.
function fitsCells(map, points) {
  return points.every(([[u, v], , a]) => {
    const cell = area([[u - 0.5, v - 0.5], [u + 0.5, v - 0.5], [u + 0.5, v + 0.5], [u - 0.5, v + 0.5]].map(([x, y]) => map(x, y)));
    return a / cell > 0.3 && a / cell < 1.3;
  });
}

// Far end of the edge that face f shares with face `other` (by index).
function edgeEnd(f, rel, other) {
  const { J, uWith } = rel;
  return uWith === other ? [3 - J[0], J[1]] : [J[0], 3 - J[1]];
}

// Weakly detected faces get the shared corner points of their neighbours as
// extra anchors for the homography, then are sampled again.
function refine(faces, rel, junction, img, W, H) {
  return faces.map((f, k) => {
    if (f.found >= 8) return f;
    const pts = f.points.slice();
    pts.push([rel[k].J, junction]);
    for (const other of [rel[k].uWith, rel[k].vWith]) {
      const g = faces[other];
      const mine = edgeEnd(f, rel[k], other), theirs = edgeEnd(g, rel[other], k);
      pts.push([mine, g.map(...theirs)]);
    }
    const map = fitHomography(pts.map((p) => p[0]), pts.map((p) => p[1]));
    if (!map || !fitsCells(map, f.points)) return { ...f, unsure: true };
    // every anchor must land where the lattice says, within a quarter cell
    const cellSize = (u, v) => Math.sqrt(area([[u - 0.5, v - 0.5], [u + 0.5, v - 0.5], [u + 0.5, v + 0.5], [u - 0.5, v + 0.5]].map(([x, y]) => map(x, y))));
    if (pts.some(([[u, v], p]) => len(sub(map(u, v), p)) > 0.25 * cellSize(Math.min(2.5, Math.max(0.5, u)), Math.min(2.5, Math.max(0.5, v))))) return { ...f, unsure: true };
    const cells = [];
    for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) cells.push(samplePatch(img, W, H, map, u, v));
    if (cells.some((c) => !c)) return f;
    return {
      ...f,
      map,
      center: map(1.5, 1.5),
      corners: [[0, 0], [3, 0], [3, 3], [0, 3]].map(([x, y]) => map(x, y)),
      cells: cells.map((c) => ({ rgb: c.rgb, lab: rgbToLab(c.rgb) })),
    };
  });
}

function inside(poly, p) {
  let sgn = 0;
  for (let i = 0; i < poly.length; i++) {
    const c = cross(poly[i], poly[(i + 1) % poly.length], p);
    if (sgn && Math.sign(c) !== sgn) return false;
    sgn = Math.sign(c) || sgn;
  }
  return true;
}

// --- three faces around one corner ---

// For each face: which lattice corner touches the other two faces, and which
// of its two edges there is shared with which neighbour.
function relate(faces) {
  const out = [];
  const pitch = faces.reduce((s, f) => s + len(sub(f.map(1, 0), f.map(0, 0))) + len(sub(f.map(0, 1), f.map(0, 0))), 0) / (faces.length * 2);
  const junctions = [];
  for (let x = 0; x < 3; x++) {
    const [y, z] = [0, 1, 2].filter((k) => k !== x);
    const f = faces[x], cy = faces[y].center, cz = faces[z].center;
    let J = null, bestD = Infinity;
    for (const [ju, jv] of [[0, 0], [3, 0], [0, 3], [3, 3]]) {
      const p = f.map(ju, jv);
      const d = len(sub(p, cy)) + len(sub(p, cz));
      if (d < bestD) {
        bestD = d;
        J = [ju, jv];
      }
    }
    junctions.push(f.map(...J));
    const mu = f.map((J[0] + (3 - J[0])) / 2, J[1]), mv = f.map(J[0], (J[1] + (3 - J[1])) / 2);
    const uWithY = len(sub(mu, cy)) + len(sub(mv, cz)) <= len(sub(mu, cz)) + len(sub(mv, cy));
    out.push({ J, uWith: uWithY ? y : z, vWith: uWithY ? z : y });
  }
  const mid = mul(junctions.reduce(add, [0, 0]), 1 / 3);
  const spread = Math.max(...junctions.map((p) => len(sub(p, mid))));
  return { rel: out, junction: mid, pitch, spread: spread / pitch, ok: spread < pitch * 0.9 };
}

// Main entry: img = { width, height, data } (RGBA).
export function detectCube(img) {
  const { width: W, height: H, data } = img;
  const pix = blur(data, W, H);
  const list = blobs(boundaries(pix, W, H), pix, W, H);
  const groups = group(list).sort((a, b) => b.length - a.length);
  const options = [];
  for (const g of groups) {
    if (options.some((o) => matchAxes(o[0].axes, g[0].axes))) continue;
    const p = placements(g, pix, W, H);
    if (p.length) options.push(p);
    if (options.length === 3) break;
  }
  if (options.length < 3) {
    const faces = options.map((o) => o.sort((a, b) => b.score - a.score)[0]);
    const n = faces.length;
    return { faces, blobs: list, width: W, height: H, ok: false, error: n ? `nur ${n} Seite${n > 1 ? 'n' : ''} erkannt` : 'kein Würfel erkannt' };
  }
  // pick the placements that fit together: no overlap, one shared corner
  let best = null;
  for (const a of options[0]) {
    for (const b of options[1]) {
      for (const c of options[2]) {
        const trio = [a, b, c];
        const r = relate(trio);
        let overlap = 0;
        trio.forEach((f, k) => {
          for (let v = 0; v < 3; v++) {
            for (let u = 0; u < 3; u++) {
              const p = f.map(u + 0.5, v + 0.5);
              overlap += trio.filter((g, j) => j !== k && inside(g.corners, p)).length;
            }
          }
        });
        // neighbouring faces must agree on where their shared edge ends
        let seam = 0;
        trio.forEach((f, k) => {
          for (const o of [r.rel[k].uWith, r.rel[k].vWith]) {
            seam += len(sub(f.map(...edgeEnd(f, r.rel[k], o)), trio[o].map(...edgeEnd(trio[o], r.rel[o], k)))) / r.pitch;
          }
        });
        const cost = trio.reduce((s, f) => s + 9 - f.score, 0) + 4 * overlap + 6 * r.spread + 1.5 * seam;
        if (!best || cost < best.cost) best = { cost, trio, r: { ...r, ok: r.ok && seam / 6 < 0.5 && !overlap } };
      }
    }
  }
  const { rel, junction, ok } = best.r;
  const faces = ok ? refine(best.trio, rel, junction, pix, W, H) : best.trio;
  const result = { faces, blobs: list, width: W, height: H };
  if (!ok) return { ...result, ok: false, error: 'keine Würfelecke erkannt' };
  if (faces.some((f) => f.unsure)) return { ...result, ok: false, error: 'eine Seite ist unsicher – etwas mehr von schräg oben fotografieren' };
  const minCell = Math.min(...faces.flatMap((f) => f.corners.map((p, i) => len(sub(f.corners[(i + 1) % 4], p)) / 3)));
  if (minCell < MIN_CELL) return { ...result, ok: false, small: true, error: 'eine Seite ist zu schmal – näher ran oder eine Ecke direkt zur Kamera drehen' };
  faces.forEach((f, k) => Object.assign(f, rel[k]));
  // clockwise order around the corner as seen in the image (y points down)
  const ang = faces.map((f) => Math.atan2(f.center[1] - junction[1], f.center[0] - junction[0]));
  result.clockwise = [0, 1, 2].sort((a, b) => ang[a] - ang[b]);
  return { ...result, ok: true, junction };
}

// Wraps RGBA pixels as a detectInSource() source: box-filtered crop + resize.
export function imageSource(img) {
  return {
    width: img.width,
    height: img.height,
    read(x, y, w, h, ow, oh) {
      const data = new Uint8ClampedArray(ow * oh * 4);
      const sx = w / ow, sy = h / oh;
      for (let j = 0; j < oh; j++) {
        for (let i = 0; i < ow; i++) {
          const acc = [0, 0, 0];
          let n = 0;
          for (let yy = Math.floor(y + j * sy); yy < Math.min(img.height, Math.ceil(y + (j + 1) * sy)); yy++) {
            for (let xx = Math.floor(x + i * sx); xx < Math.min(img.width, Math.ceil(x + (i + 1) * sx)); xx++) {
              const k = (yy * img.width + xx) * 4;
              acc[0] += img.data[k]; acc[1] += img.data[k + 1]; acc[2] += img.data[k + 2]; n++;
            }
          }
          const k = (j * ow + i) * 4;
          data[k] = acc[0] / n; data[k + 1] = acc[1] / n; data[k + 2] = acc[2] / n; data[k + 3] = 255;
        }
      }
      return { width: ow, height: oh, data };
    },
  };
}

// src: { width, height, read(x, y, w, h, outW, outH) -> RGBA image }.
// Looks at the whole picture first; if the cube is small in it, looks again at
// just the cube in full resolution. Face coordinates come back in src pixels.
export function detectInSource(src, maxSide = 640) {
  const run = (x, y, w, h) => {
    const k = Math.min(1, maxSide / Math.max(w, h));
    const ow = Math.round(w * k), oh = Math.round(h * k);
    const r = detectCube(src.read(x, y, w, h, ow, oh));
    const back = (p) => [x + p[0] / k, y + p[1] / k];
    for (const f of r.faces) {
      f.cellPts = [0, 1, 2].flatMap((v) => [0, 1, 2].map((u) => back(f.map(u + 0.5, v + 0.5))));
      f.corners = f.corners.map(back);
      f.center = back(f.center);
      f.stickers = f.stickers.map((q) => q.map(back));
    }
    r.blobs = r.blobs.map((b) => ({ ...b, quad: b.quad.map(back) }));
    if (r.junction) r.junction = back(r.junction);
    r.cell = Math.min(...r.faces.flatMap((f) => f.corners.map((p, i) => len(sub(f.corners[(i + 1) % 4], p)) / 3))) || 0;
    return r;
  };
  const first = run(0, 0, src.width, src.height);
  if (first.ok && first.cell >= 14) return first;
  if (!first.faces.length) return first;
  const pts = first.faces.flatMap((f) => f.corners);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const side = Math.min(Math.max(src.width, src.height), Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * (first.ok ? 1.3 : 2.4));
  const x = Math.max(0, Math.min(src.width - side, cx - side / 2)), y = Math.max(0, Math.min(src.height - side, cy - side / 2));
  const w = Math.min(side, src.width), h = Math.min(side, src.height);
  if (Math.max(w, h) < maxSide * 1.2 && !first.small) return first;
  const second = run(x, y, w, h);
  return second.ok || !first.ok && second.faces.length > first.faces.length ? second : first;
}

// --- two photos -> 54 facelets ---

const det3 = (a, b, c) =>
  a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
const OPP = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

// Ordered letter triples for the three faces of one photo, with a cost.
// topLetter: the face the user was asked to hold on top (U = white, D = yellow).
function triples(photo, labs, topLetter) {
  const prefer = topFace(photo);
  const out = [];
  const [a, b, c] = photo.clockwise;
  for (const x of FACES) {
    for (const y of FACES) {
      for (const z of FACES) {
        if (x === y || y === z || x === z || OPP[x] === y || OPP[y] === z || OPP[x] === z) continue;
        const letters = [];
        letters[a] = x; letters[b] = y; letters[c] = z;
        // seen from outside, clockwise faces have det = -1 (mirrored photos break this)
        const mirrored = det3(NORMAL[x], NORMAL[y], NORMAL[z]) > 0;
        let cost = mirrored ? 1500 : 0;
        if (topLetter && letters[prefer] !== topLetter) cost += 300;
        photo.faces.forEach((f, k) => (cost += dist(labs[k][4], COLORS[EXPECTED[letters[k]]].lab)));
        out.push({ letters, cost });
      }
    }
  }
  return out.sort((p, q) => p.cost - q.cost);
}

const topFace = (photo) => photo.faces.reduce((b, f, k) => (f.center[1] < photo.faces[b].center[1] ? k : b), 0);

const chroma = (rgb) => (Math.max(...rgb) - Math.min(...rgb)) / Math.max(1, Math.max(...rgb));

// Neutralises the colour cast with the white centre (top face of the first
// photo, or failing that the greyest centre) and applies it to both photos,
// which are taken under the same light.
function whiteBalance(photos, top) {
  const centres = photos.flatMap((p) => p.faces.map((f) => f.cells[4].rgb));
  let ref = photos[0].faces[top].cells[4].rgb;
  if (chroma(ref) > 0.25) ref = centres.reduce((a, b) => (chroma(b) < chroma(a) ? b : a));
  const ok = chroma(ref) < 0.3 && Math.max(...ref) > 50;
  const mean = (ref[0] + ref[1] + ref[2]) / 3;
  const gain = ok ? ref.map((c) => mean / Math.max(1, c)) : [1, 1, 1];
  return photos.map((p) => p.faces.map((f) => f.cells.map((c) => rgbToLab(c.rgb.map((v, d) => Math.min(255, v * gain[d]))))));
}

// Best guess which faces one photo shows (letters per face), for live hints.
export function identify(photo, topLetter) {
  return triples(photo, [photo.faces.map((f) => f.cells.map((c) => c.lab))][0], topLetter)[0].letters;
}

// Returns { labs } or { error }. Assumes the standard colour scheme to tell
// which face is which; the scan-by-face mode does not.
export function assemble(photos) {
  const top = topFace(photos[0]);
  const labs = whiteBalance(photos, top);
  const t1 = triples(photos[0], labs[0], 'U'), t2 = triples(photos[1], labs[1], 'D');
  let best = null;
  for (const a of t1.slice(0, 48)) {
    for (const b of t2.slice(0, 48)) {
      if (a.letters.some((l) => b.letters.includes(l))) continue;
      const cost = a.cost + b.cost;
      if (!best || cost < best.cost) best = { cost, sets: [a.letters, b.letters] };
    }
  }
  if (!best) return { error: 'same' };
  if (t1[0].letters.some((l) => t2[0].letters.includes(l)) && best.cost > t1[0].cost + t2[0].cost + 3000) return { error: 'same' };
  const out = new Array(54).fill(null);
  photos.forEach((photo, p) => {
    const letters = best.sets[p];
    photo.faces.forEach((f, k) => {
      const nX = NORMAL[letters[k]], nU = NORMAL[letters[f.uWith]], nV = NORMAL[letters[f.vWith]];
      for (let v = 0; v < 3; v++) {
        for (let u = 0; u < 3; u++) {
          // steps away from the corner along the edge shared with a neighbour
          const ku = f.J[0] === 0 ? u : 2 - u, kv = f.J[1] === 0 ? v : 2 - v;
          // walking along the u edge (shared with uWith) leaves vWith behind
          const pos = [0, 1, 2].map((d) => nX[d] + nV[d] * (1 - ku) + nU[d] * (1 - kv));
          out[stickerAt(pos, nX)] = labs[p][k][v * 3 + u];
        }
      }
    });
  });
  return { labs: out, letters: best.sets };
}

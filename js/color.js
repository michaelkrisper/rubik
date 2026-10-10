// Sticker colour sampling and classification. Stickers are grouped by the six
// centre colours; once all faces are known each group must hold exactly nine.

export const COLORS = {
  white: { name: 'Weiß', hex: '#f4f4f4', ref: [225, 228, 225] },
  yellow: { name: 'Gelb', hex: '#ffd500', ref: [235, 215, 30] },
  red: { name: 'Rot', hex: '#d0213b', ref: [185, 30, 40] },
  orange: { name: 'Orange', hex: '#ff6a00', ref: [245, 115, 25] },
  blue: { name: 'Blau', hex: '#1560d4', ref: [20, 80, 180] },
  green: { name: 'Grün', hex: '#00a05a', ref: [20, 160, 85] },
};

// Standard (Western) colour scheme, used for instructions and manual entry.
export const EXPECTED = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };

export function rgbToLab([r, g, b]) {
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

for (const c of Object.values(COLORS)) c.lab = rgbToLab(c.ref);

// Lightness varies with shadows and glare far more than hue does, so it
// counts for less.
export function dist(a, b) {
  const dl = (a[0] - b[0]) * 0.5, da = a[1] - b[1], db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

const median = (arr) => {
  arr.sort((a, b) => a - b);
  return arr[arr.length >> 1];
};

// Reads the nine cells of an n x n canvas that shows exactly one face.
// The median of each cell's middle keeps edges, gaps and glare spots out.
export function sampleCells(ctx, n) {
  const { data } = ctx.getImageData(0, 0, n, n);
  const cell = n / 3;
  const out = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const R = [], G = [], B = [];
      const y0 = Math.round(r * cell + cell * 0.28), y1 = Math.round(r * cell + cell * 0.72);
      const x0 = Math.round(c * cell + cell * 0.28), x1 = Math.round(c * cell + cell * 0.72);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const k = (y * n + x) * 4;
          R.push(data[k]); G.push(data[k + 1]); B.push(data[k + 2]);
        }
      }
      const rgb = [median(R), median(G), median(B)];
      out.push({ rgb, lab: rgbToLab(rgb) });
    }
  }
  return out;
}

export function nearest(lab, seeds) {
  let best = 0;
  for (let k = 1; k < seeds.length; k++) if (dist(lab, seeds[k]) < dist(lab, seeds[best])) best = k;
  return best;
}

// labs: 54 Lab values (null = not scanned), seeds: 6 Lab values (one per face),
// fixed: Map facelet -> face index that must not change.
// Returns 54 face indices (-1 = unknown).
export function classify(labs, seeds, fixed = new Map()) {
  if (labs.some((l) => !l)) {
    return labs.map((l, i) => (fixed.has(i) ? fixed.get(i) : l ? nearest(l, seeds) : -1));
  }
  let cents = seeds;
  let assign;
  for (let iter = 0; iter < 4; iter++) {
    assign = balanced(labs, cents, fixed);
    cents = cents.map((seed, k) => {
      const members = labs.filter((_, i) => assign[i] === k);
      if (!members.length) return seed;
      return [0, 1, 2].map((d) => members.reduce((s, m) => s + m[d], 0) / members.length);
    });
  }
  return assign;
}

// Greedy assignment with nine slots per colour, then pairwise swaps until no
// swap lowers the total distance.
function balanced(labs, cents, fixed) {
  const assign = new Array(54).fill(-1);
  const cap = new Array(6).fill(9);
  for (const [i, k] of fixed) {
    assign[i] = k;
    cap[k]--;
  }
  const pairs = [];
  for (let i = 0; i < 54; i++) {
    if (assign[i] >= 0) continue;
    for (let k = 0; k < 6; k++) pairs.push([dist(labs[i], cents[k]), i, k]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [, i, k] of pairs) {
    if (assign[i] < 0 && cap[k] > 0) {
      assign[i] = k;
      cap[k]--;
    }
  }
  for (let i = 0; i < 54; i++) if (assign[i] < 0) assign[i] = nearest(labs[i], cents);

  const free = [...Array(54).keys()].filter((i) => !fixed.has(i));
  for (let pass = 0, changed = true; changed && pass < 20; pass++) {
    changed = false;
    for (const i of free) {
      for (const j of free) {
        const a = assign[i], b = assign[j];
        if (a === b) continue;
        const delta = dist(labs[i], cents[b]) + dist(labs[j], cents[a]) - dist(labs[i], cents[a]) - dist(labs[j], cents[b]);
        if (delta < -1e-9) {
          assign[i] = b;
          assign[j] = a;
          changed = true;
        }
      }
    }
  }
  return assign;
}

// Gives each of the six seeds a distinct colour name (cheapest permutation).
export function nameSeeds(seeds) {
  const keys = Object.keys(COLORS);
  let best = null, bestCost = Infinity;
  const perm = (rest, chosen, cost) => {
    if (cost >= bestCost) return;
    if (!rest.length) {
      best = chosen;
      bestCost = cost;
      return;
    }
    const k = chosen.length;
    for (const key of rest) {
      perm(rest.filter((r) => r !== key), [...chosen, key], cost + dist(seeds[k], COLORS[key].lab));
    }
  };
  perm(keys, [], 0);
  return best;
}

// Swaps the colours of the two non-centre stickers whose exchange costs least
// and makes isValid(assign) true. Counts stay at 9 each. Returns the changed
// facelets or null.
export function repair(labs, assign, isValid) {
  const cents = [0, 1, 2, 3, 4, 5].map((k) => {
    const m = labs.filter((l, i) => l && assign[i] === k);
    return m.length ? [0, 1, 2].map((d) => m.reduce((s, l) => s + l[d], 0) / m.length) : null;
  });
  if (cents.some((c) => !c) || labs.some((l) => !l)) return null;
  let best = null;
  for (let i = 0; i < 54; i++) {
    if (i % 9 === 4) continue;
    for (let j = i + 1; j < 54; j++) {
      const a = assign[i], b = assign[j];
      if (j % 9 === 4 || a === b) continue;
      const cost = dist(labs[i], cents[b]) + dist(labs[j], cents[a]) - dist(labs[i], cents[a]) - dist(labs[j], cents[b]);
      if (best && cost >= best.cost) continue;
      const trial = assign.slice();
      trial[i] = b;
      trial[j] = a;
      if (isValid(trial)) best = { cost, assign: trial, changed: [i, j] };
    }
  }
  return best;
}

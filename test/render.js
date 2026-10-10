// Minimal rasteriser for tests: a cube in perspective on a cluttered
// background, with lighting, colour cast and noise.
import { STICKERS, SOLVED, FACES, applyMoves } from '../js/cube.js';
import { COLORS, EXPECTED } from '../js/color.js';

export function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x / 2 ** 32;
  };
}

const rotX = (a) => (p) => [
  p[0],
  p[1] * Math.cos(a) - p[2] * Math.sin(a),
  p[1] * Math.sin(a) + p[2] * Math.cos(a),
];
const rotY = (a) => (p) => [
  p[0] * Math.cos(a) + p[2] * Math.sin(a),
  p[1],
  -p[0] * Math.sin(a) + p[2] * Math.cos(a),
];
const rotZ = (a) => (p) => [
  p[0] * Math.cos(a) - p[1] * Math.sin(a),
  p[0] * Math.sin(a) + p[1] * Math.cos(a),
  p[2],
];

function fillPoly(img, W, H, poly, color) {
  const xs = poly.map((p) => p[0]),
    ys = poly.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))),
    x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))),
    y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  let sgn = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      c = poly[(i + 2) % poly.length];
    sgn += (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let inside = true;
      for (let i = 0; i < poly.length && inside; i++) {
        const a = poly[i],
          b = poly[(i + 1) % poly.length];
        const c = (b[0] - a[0]) * (y + 0.5 - a[1]) - (b[1] - a[1]) * (x + 0.5 - a[0]);
        if (c * sgn < 0) inside = false;
      }
      if (!inside) continue;
      const k = (y * W + x) * 4;
      img[k] = color[0];
      img[k + 1] = color[1];
      img[k + 2] = color[2];
    }
  }
}

// view: { yaw, pitch, roll } in degrees; the camera looks at the cube centre.
export function renderCube(
  state,
  {
    W = 640,
    H = 480,
    yaw = 35,
    pitch = 30,
    roll = 0,
    dist = 9,
    scale = 1,
    seed = 1,
    sticker = 0.88,
    cx = 0,
    cy = 0,
  } = {},
) {
  const rnd = rng(seed);
  const img = new Uint8ClampedArray(W * H * 4);
  // background: gradient plus colourful clutter
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4,
        t = (x + y) / (W + H);
      img[k] = 120 - 50 * t;
      img[k + 1] = 105 - 40 * t;
      img[k + 2] = 90 - 30 * t;
      img[k + 3] = 255;
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = rnd() * W,
      y = rnd() * H,
      s = 10 + rnd() * 60;
    fillPoly(
      img,
      W,
      H,
      [
        [x, y],
        [x + s, y + rnd() * 10],
        [x + s, y + s],
        [x, y + s * 0.8],
      ],
      [rnd() * 255, rnd() * 255, rnd() * 255],
    );
  }
  const R = (p) =>
    rotZ((roll * Math.PI) / 180)(rotX((pitch * Math.PI) / 180)(rotY((-yaw * Math.PI) / 180)(p)));
  const f = Math.min(W, H) * 1.6 * scale;
  const proj = (p) => {
    const q = R(p);
    return [W / 2 + cx + (f * q[0]) / (dist - q[2]), H / 2 + cy - (f * q[1]) / (dist - q[2])];
  };
  const corners = [-1.5, 1.5].flatMap((x) =>
    [-1.5, 1.5].flatMap((y) => [-1.5, 1.5].map((z) => proj([x, y, z]))),
  );
  const inFrame = corners.every(([x, y]) => x > 4 && y > 4 && x < W - 4 && y < H - 4);
  const light = [0.3, 0.8, 0.5];
  const cast = [1 + (rnd() - 0.5) * 0.12, 1, 1 + (rnd() - 0.5) * 0.16];
  for (const [i, s] of STICKERS.entries()) {
    const n = s.normal;
    const nr = R(n);
    const centre = s.pos.map((v, d) => v + n[d] * 0.5);
    const cr = R(centre);
    if (nr[0] * -cr[0] + nr[1] * -cr[1] + nr[2] * (dist - cr[2]) <= 0) continue;
    const t1 = n[0] ? [0, 1, 0] : [1, 0, 0];
    const t2 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
    const sq = (h) =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => proj(centre.map((v, d) => v + h * (a * t1[d] + b * t2[d]))));
    fillPoly(img, W, H, sq(0.5), [18, 18, 20]);
    const shade = 0.55 + 0.45 * Math.max(0, light[0] * n[0] + light[1] * n[1] + light[2] * n[2]);
    const ref = COLORS[EXPECTED[state[i]]].ref;
    fillPoly(
      img,
      W,
      H,
      sq(0.5 * sticker),
      ref.map((v, d) => v * shade * cast[d]),
    );
  }
  for (let k = 0; k < img.length; k += 4) {
    for (let d = 0; d < 3; d++) img[k + d] += (rnd() - 0.5) * 18;
  }
  return { width: W, height: H, data: img, inFrame };
}

const MOVES = FACES.flatMap((f) => [f, `${f}'`, `${f}2`]);

// A scrambled cube and two corner photos of it (U/F/R side, then D/B/L side).
export function scenario(t, { sticker = 0.88, scale = [0.6, 1.2], W = 640, H = 480 } = {}) {
  const r = rng(t * 7919 + 13);
  const state = applyMoves(
    SOLVED,
    Array.from({ length: 25 }, () => MOVES[Math.floor(r() * 18)]),
  );
  for (;;) {
    const sc = scale[0] + r() * (scale[1] - scale[0]);
    const common = { W, H, sticker, scale: sc };
    const views = [
      {
        ...common,
        yaw: 28 + r() * 34,
        pitch: 22 + r() * 23,
        roll: (r() - 0.5) * 50,
        seed: t * 2 + 1,
        cx: (r() - 0.5) * W * 0.2,
        cy: (r() - 0.5) * H * 0.15,
      },
      {
        ...common,
        yaw: 208 + r() * 34,
        pitch: -22 - r() * 23,
        roll: 180 + (r() - 0.5) * 50,
        seed: t * 2 + 2,
        cx: (r() - 0.5) * W * 0.2,
        cy: (r() - 0.5) * H * 0.15,
      },
    ];
    const imgs = views.map((v) => renderCube(state, v));
    if (imgs.every((i) => i.inFrame)) return { state, imgs };
  }
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCube, scenario } from './render.js';
import { assemble, detectInSource, identify, imageSource as source } from '../js/detect.js';
import { applyMoves, FACES, SOLVED } from '../js/cube.js';
import { classify } from '../js/color.js';

const SOLVED_SCRAMBLE = applyMoves(SOLVED, "R U2 F' L D B2 R' U F2 D' L2 B");

function recognise(imgs) {
  const photos = imgs.map((img) => detectInSource(source(img)));
  if (!photos.every((p) => p.ok)) return null;
  const a = assemble(photos);
  if (!a.labs) return null;
  const seeds = FACES.map((_, k) => a.labs[k * 9 + 4]);
  return classify(a.labs, seeds, new Map(FACES.map((_, k) => [k * 9 + 4, k])))
    .map((k) => FACES[k])
    .join('');
}

function run(n, opts) {
  let ok = 0,
    wrong = 0;
  for (let t = 0; t < n; t++) {
    const { state, imgs } = scenario(t, opts);
    const got = recognise(imgs);
    if (got === state) ok++;
    else if (got) wrong++;
  }
  return { ok, wrong };
}

test('two corner photos recognise the whole cube', () => {
  const r = run(25);
  assert.equal(r.wrong, 0);
  assert.ok(r.ok >= 24, JSON.stringify(r));
});

test('stickerless cubes with thin grooves', () => {
  const r = run(15, { sticker: 0.96 });
  assert.equal(r.wrong, 0);
  assert.ok(r.ok >= 14, JSON.stringify(r));
});

test('small cube in a high-resolution photo is found on the second pass', () => {
  const r = run(10, { scale: [0.35, 0.5], W: 1600, H: 1200 });
  assert.equal(r.wrong, 0);
  assert.ok(r.ok >= 8, JSON.stringify(r));
});

const blank = (W, H, rgb) => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([...rgb, 255], i * 4);
  return { width: W, height: H, data };
};

test('an empty picture is no cube', () => {
  const r = detectInSource(source(blank(320, 240, [120, 110, 100])));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'kein Würfel erkannt');
});

test('a face seen straight on is not enough', () => {
  const img = renderCube(SOLVED_SCRAMBLE, { yaw: 0, pitch: 0, scale: 0.8 });
  const r = detectInSource(source(img));
  assert.equal(r.ok, false);
  assert.match(r.error, /Seite/);
});

test('identify names the faces of each photo', () => {
  const { imgs } = scenario(7);
  const [p1, p2] = imgs.map((img) => detectInSource(source(img)));
  assert.deepEqual([...identify(p1, 'U')].sort(), ['F', 'R', 'U']);
  assert.deepEqual([...identify(p2, 'D')].sort(), ['B', 'D', 'L']);
});

test('the same corner twice is reported, not guessed', () => {
  const { imgs } = scenario(8);
  const p1 = detectInSource(source(imgs[0]));
  assert.deepEqual(assemble([p1, p1]), { error: 'same' });
});

test('imageSource crops and averages', () => {
  const img = blank(4, 4, [0, 0, 0]);
  img.data.set([200, 100, 50, 255], (1 * 4 + 1) * 4);
  const out = source(img).read(0, 0, 2, 2, 1, 1);
  // Uint8ClampedArray rounds half to even: 12.5 -> 12
  assert.deepEqual([...out.data], [50, 25, 12, 255]);
});

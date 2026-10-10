import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenario } from './render.js';
import { detectInSource, assemble, imageSource as source } from '../js/detect.js';
import { FACES } from '../js/cube.js';
import { classify } from '../js/color.js';


function recognise(imgs) {
  const photos = imgs.map((img) => detectInSource(source(img)));
  if (!photos.every((p) => p.ok)) return null;
  const a = assemble(photos);
  if (!a.labs) return null;
  const seeds = FACES.map((_, k) => a.labs[k * 9 + 4]);
  return classify(a.labs, seeds, new Map(FACES.map((_, k) => [k * 9 + 4, k]))).map((k) => FACES[k]).join('');
}

function run(n, opts) {
  let ok = 0, wrong = 0;
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

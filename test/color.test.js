import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, EXPECTED, rgbToLab, classify, nameSeeds } from '../js/color.js';
import { FACES, SOLVED, applyMoves } from '../js/cube.js';

function rng(seed) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

// Camera-like rendering: per-photo exposure and warm cast, per-sticker shading and noise.
function photograph(state, seed) {
  const rnd = rng(seed);
  const labs = [];
  for (let f = 0; f < 6; f++) {
    const exposure = 0.7 + rnd() * 0.4;
    const warm = [1 + rnd() * 0.08, 1, 1 - rnd() * 0.12];
    for (let i = 0; i < 9; i++) {
      const ref = COLORS[EXPECTED[state[f * 9 + i]]].ref;
      const shade = exposure * (0.85 + rnd() * 0.2);
      const rgb = ref.map((v, ch) => Math.max(0, Math.min(255, v * shade * warm[ch] + (rnd() - 0.5) * 30)));
      labs.push(rgbToLab(rgb));
    }
  }
  return labs;
}

const MOVES = FACES.flatMap((f) => [f, f + "'", f + '2']);

test('balanced classification recovers noisy photos', () => {
  let wrong = 0;
  for (let k = 0; k < 40; k++) {
    const rnd = rng(k + 1);
    const state = applyMoves(SOLVED, Array.from({ length: 25 }, () => MOVES[Math.floor(rnd() * 18)]));
    const labs = photograph(state, k + 77);
    const seeds = FACES.map((_, f) => labs[f * 9 + 4]);
    const fixed = new Map(FACES.map((_, f) => [f * 9 + 4, f]));
    const assign = classify(labs, seeds, fixed);
    wrong += assign.filter((a, i) => FACES[a] !== state[i]).length;
  }
  assert.equal(wrong, 0);
});

test('partial scans fall back to nearest seed', () => {
  const labs = new Array(54).fill(null);
  labs[22] = COLORS.green.lab;
  const seeds = FACES.map((f) => COLORS[EXPECTED[f]].lab);
  const assign = classify(labs, seeds);
  assert.equal(assign[22], FACES.indexOf('F'));
  assert.equal(assign[0], -1);
});

test('nameSeeds maps measured centres to colour names', () => {
  const seeds = FACES.map((f) => rgbToLab(COLORS[EXPECTED[f]].ref.map((v) => v * 0.8)));
  assert.deepEqual(nameSeeds(seeds), FACES.map((f) => EXPECTED[f]));
});

test('repair swaps back two stickers that broke the cube', async () => {
  const { validate } = await import('../js/cube.js');
  const { repair } = await import('../js/color.js');
  const rnd = rng(5);
  const state = applyMoves(SOLVED, Array.from({ length: 25 }, () => MOVES[Math.floor(rnd() * 18)]));
  const labs = photograph(state, 9);
  const truth = [...state].map((c) => FACES.indexOf(c));
  // two stickers of different colours read as each other's colour
  const i = truth.findIndex((k, n) => n % 9 !== 4 && k === 0);
  const j = truth.findIndex((k, n) => n % 9 !== 4 && k === 1);
  const wrong = truth.slice();
  [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  [labs[i], labs[j]] = [labs[i].map((v, d) => (v + labs[j][d]) / 2), labs[j].map((v, d) => (v + labs[i][d]) / 2)];
  const r = repair(labs, wrong, (a) => validate(a.map((k) => FACES[k]).join('')).ok);
  assert.deepEqual(r.assign, truth);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  SOLVED,
  FACES,
  applyMove,
  applyMoves,
  invertMove,
  isMove,
  parseMoves,
  validate,
  rotateFace,
  findRotationFix,
} from '../js/cube.js';

const require = createRequire(import.meta.url);
const Cube = require('../vendor/cubejs/cube.js');
require('../vendor/cubejs/solve.js');

const MOVES = FACES.flatMap((f) => [f, `${f}'`, `${f}2`]);
function scramble(n, seed) {
  let x = seed;
  const rnd = () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return x / 2 ** 31;
  };
  return Array.from({ length: n }, () => MOVES[Math.floor(rnd() * MOVES.length)]);
}

test('quarter turns have order 4', () => {
  for (const f of FACES) {
    let s = SOLVED;
    for (let i = 0; i < 4; i++) s = applyMove(s, f);
    assert.equal(s, SOLVED);
    assert.notEqual(applyMove(SOLVED, f), SOLVED);
  }
});

test('sexy move has order 6', () => {
  let s = SOLVED;
  for (let i = 0; i < 6; i++) s = applyMoves(s, "R U R' U'");
  assert.equal(s, SOLVED);
});

test('facelet moves match cubejs', () => {
  for (let k = 0; k < 30; k++) {
    const seq = scramble(25, k + 1);
    assert.equal(applyMoves(SOLVED, seq), new Cube().move(seq.join(' ')).asString(), seq.join(' '));
  }
});

test('scramble then inverse is solved', () => {
  const seq = scramble(40, 7);
  const s = applyMoves(SOLVED, seq);
  assert.equal(applyMoves(s, seq.reverse().map(invertMove)), SOLVED);
});

test('validate accepts reachable states and rejects broken ones', () => {
  for (let k = 0; k < 50; k++) assert.ok(validate(applyMoves(SOLVED, scramble(30, k + 100))).ok);
  const s = [...applyMoves(SOLVED, scramble(30, 3))];
  assert.equal(validate(s.map((c, i) => (i === 0 ? '?' : c)).join('')).reason, 'missing');
  const swapped = [...s];
  [swapped[1], swapped[3]] = [swapped[3], swapped[1]];
  assert.equal(validate(swapped.join('')).ok, false);
  // twist one corner in place: U9 R1 F3 -> F3 U9 R1
  const t = [...SOLVED];
  [t[8], t[9], t[20]] = [t[20], t[8], t[9]];
  assert.equal(validate(t.join('')).reason, 'twist');
  // flip one edge in place: U6 R2
  const e = [...SOLVED];
  [e[5], e[10]] = [e[10], e[5]];
  assert.equal(validate(e.join('')).reason, 'flip');
  // swap two edges (UR <-> UF) without anything else -> parity
  const p = [...SOLVED];
  for (const [a, b] of [
    [5, 7],
    [10, 19],
  ])
    [p[a], p[b]] = [p[b], p[a]];
  assert.equal(validate(p.join('')).ok, false);
});

test('findRotationFix undoes a face photographed sideways', () => {
  for (let k = 0; k < 20; k++) {
    const s = applyMoves(SOLVED, scramble(30, k + 500));
    const broken = rotateFace(rotateFace(s, 'U', 1), 'D', 2);
    if (validate(broken).ok) continue;
    const fix = findRotationFix(broken);
    assert.ok(fix);
    assert.ok(validate(fix.state).ok);
  }
});

test('cubejs solutions solve the facelet model', () => {
  Cube.initSolver();
  for (let k = 0; k < 15; k++) {
    const s = applyMoves(SOLVED, scramble(30, k + 900));
    const sol = Cube.fromString(s).solve();
    assert.ok(parseMoves(sol).length <= 22);
    assert.equal(applyMoves(s, sol), SOLVED);
  }
  assert.equal(applyMoves(SOLVED, Cube.fromString(SOLVED).solve()), SOLVED);
});

test('move helpers', () => {
  assert.deepEqual(parseMoves("  R U2  F' "), ['R', 'U2', "F'"]);
  assert.equal(invertMove('R'), "R'");
  assert.equal(invertMove("R'"), 'R');
  assert.equal(invertMove('R2'), 'R2');
  assert.ok(isMove("B'") && !isMove('X') && !isMove('R3'));
  assert.throws(() => applyMove(SOLVED, 'Q'));
});

test('validate names the broken piece', () => {
  assert.equal(validate('U'.repeat(53)).reason, 'length');
  const counts = validate(`D${SOLVED.slice(1)}`);
  assert.equal(counts.reason, 'count');
  assert.equal(counts.counts.U, 8);
  // two corners with the same colours: swap a whole corner's stickers onto another
  const dupCorner = [...SOLVED];
  [dupCorner[8], dupCorner[9], dupCorner[20]] = ['U', 'R', 'F'];
  [dupCorner[6], dupCorner[18], dupCorner[38]] = ['U', 'R', 'F'];
  const c = validate(dupCorner.join(''));
  assert.ok(['corner', 'corner-dup', 'count'].includes(c.reason));
  // an edge with two stickers of opposite faces cannot exist
  const badEdge = [...SOLVED];
  [badEdge[5], badEdge[10]] = ['U', 'D'];
  [badEdge[30], badEdge[34]] = ['R', 'D'];
  assert.equal(validate(badEdge.join('')).ok, false);
});

test('validate reports duplicate edges and corners with their facelets', () => {
  // UR reads as a second UF edge; FR takes the surplus F so the counts stay at 9
  const e = [...SOLVED];
  e[10] = 'F'; // R2 of the UR edge
  e[23] = 'R'; // F6 of the FR edge
  const edge = validate(e.join(''));
  assert.equal(edge.reason, 'edge-dup');
  assert.deepEqual(edge.colors, ['U', 'F']);
  assert.equal(edge.facelets.length, 4);
  // UFL reads as a second URF corner; an FR edge sticker evens out the counts
  const c = [...SOLVED];
  c[18] = 'R'; // F1
  c[38] = 'F'; // L3
  c[12] = 'L'; // R4
  const corner = validate(c.join(''));
  assert.equal(corner.reason, 'corner-dup');
  assert.equal(corner.facelets.length, 6);
});

test('rotateFace four times is the identity', () => {
  const s = applyMoves(SOLVED, scramble(20, 42));
  assert.equal(rotateFace(s, 'F', 4), s);
  assert.notEqual(rotateFace(s, 'F', 1), s);
  assert.deepEqual(rotateFace([...s], 'U', 2), [...rotateFace(s, 'U', 2)]);
});

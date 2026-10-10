// Kociemba two-phase solver (cubejs). Building the pruning tables takes a few
// seconds, so it happens here once, off the main thread.
importScripts('vendor/cubejs/cube.js', 'vendor/cubejs/solve.js');

onmessage = (e) => {
  const { id, facelets } = e.data;
  try {
    const moves = Cube.fromString(facelets).solve();
    postMessage({ type: 'solution', id, moves });
  } catch (err) {
    postMessage({ type: 'error', id, message: String(err) });
  }
};

Cube.initSolver();
postMessage({ type: 'ready' });

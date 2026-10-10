/**
 * End-to-end check in headless Chrome: scrambles a cube, renders a synthetic
 * photo of every face, feeds them through the photo picker, solves, and checks
 * that the solution really solves the scrambled state. Saves screenshots.
 *
 *   python3 -m http.server 8791 &   # from the repo root
 *   node scripts/e2e.mjs [http://localhost:8791/] [outdir]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:8791/';
const out = process.argv[3] ?? join(tmpdir(), 'rubik-shots');
mkdirSync(out, { recursive: true });
const port = 9334;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rubik-chrome-'))}`,
  '--window-size=412,915', 'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(out, `${name}.png`), Buffer.from(r.data, 'base64'));
}

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await wait(200);
    target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json()).catch(() => null);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result ?? m);
      pending.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value).join(' '));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: base });
  await wait(1500);
  await shot('1-home');

  // live camera (Chrome's fake device) must start and feed the preview
  await evaluate(`document.querySelector('[data-go=scan]').click()`);
  await wait(1500);
  const cam = await evaluate(`({ w: video.videoWidth, msg: document.getElementById('cam-msg').hidden, dot: getComputedStyle(document.querySelector('.cell')).getPropertyValue('--c') })`);
  console.log('camera', cam);
  await shot('2-scan-camera');

  const state = await evaluate(`(async () => {
    const { SOLVED, FACES, applyMoves } = await import('./js/cube.js');
    const { COLORS, EXPECTED } = await import('./js/color.js');
    const all = FACES.flatMap((f) => [f, f + "'", f + '2']);
    const seq = Array.from({ length: 30 }, () => all[Math.floor(Math.random() * 18)]);
    const state = applyMoves(SOLVED, seq);
    window.__state = state;
    window.__photo = async (face) => {
      const k = FACES.indexOf(face);
      const c = document.createElement('canvas');
      c.width = 800; c.height = 600;
      const g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, 800, 600);
      bg.addColorStop(0, '#7a6a58'); bg.addColorStop(1, '#4b3f33');
      g.fillStyle = bg; g.fillRect(0, 0, 800, 600);
      const side = 600 * 0.7 * (0.96 + Math.random() * 0.06), x0 = 400 - side / 2, y0 = 300 - side / 2;
      g.fillStyle = '#111'; g.fillRect(x0 - 6, y0 - 6, side + 12, side + 12);
      const exposure = 0.75 + Math.random() * 0.3;
      for (let i = 0; i < 9; i++) {
        const ref = COLORS[EXPECTED[state[k * 9 + i]]].ref;
        const sh = exposure * (0.85 + Math.random() * 0.2);
        const [r, gg, b] = ref.map((v, ch) => Math.min(255, v * sh * [1.05, 1, 0.92][ch] + (Math.random() - 0.5) * 20) | 0);
        g.fillStyle = 'rgb(' + r + ',' + gg + ',' + b + ')';
        const cs = side / 3, pad = cs * 0.06;
        g.fillRect(x0 + (i % 3) * cs + pad, y0 + Math.floor(i / 3) * cs + pad, cs - 2 * pad, cs - 2 * pad);
      }
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.ellipse(x0 + side * 0.7, y0 + side * 0.25, 18, 10, 0.5, 0, 7); g.fill();
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], face + '.jpg', { type: 'image/jpeg' }));
      const input = document.getElementById('file');
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
      for (let i = 0; i < 50 && photo.hidden; i++) await new Promise((r) => setTimeout(r, 100));
    };
    return state;
  })()`);
  console.log('scrambled', state);

  for (const [n, face] of ['F', 'R', 'B', 'L', 'U', 'D'].entries()) {
    await evaluate(`window.__photo('${face}')`);
    if (n === 0) await shot('3-scan-photo');
    await evaluate(`document.getElementById('shoot').click()`);
    await wait(900);
  }
  await shot('4-review');
  const review = await evaluate(`document.getElementById('review-msg').textContent`);
  console.log('review:', review);

  await evaluate(`document.getElementById('solve-btn').click()`);
  for (let i = 0; i < 60; i++) {
    await wait(500);
    if (await evaluate(`!document.getElementById('solve').hidden`)) break;
  }
  const result = await evaluate(`(async () => {
    const { applyMoves, SOLVED } = await import('./js/cube.js');
    const d = JSON.parse(localStorage.getItem('rubik-v1'));
    return { start: d.start, moves: d.moves.join(' '), matches: d.start === window.__state, solves: applyMoves(d.start, d.moves) === SOLVED };
  })()`);
  console.log('solution', result);
  await shot('5-solve');
  for (let i = 0; i < 3; i++) {
    await evaluate(`document.getElementById('next').click()`);
    await wait(700);
  }
  await shot('6-solve-step3');
  const view = await evaluate(`(async () => {
    const { applyMoves } = await import('./js/cube.js');
    const d = JSON.parse(localStorage.getItem('rubik-v1'));
    return d.idx;
  })()`);
  console.log('idx after 3 steps', view);

  // the layer animation must end exactly where the model puts every sticker
  const animBad = await evaluate(`(async () => {
    const { CubeView } = await import('./js/view3d.js');
    const { SOLVED, FACES, applyMove } = await import('./js/cube.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:400px';
    document.body.append(host);
    const v = new CubeView(host, {});
    v.setState(SOLVED);
    const center = (el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };
    const bad = [];
    for (const m of FACES.flatMap((f) => [f, f + "'", f + '2'])) {
      v.animate(m, 60000);
      const layer = host.querySelector('.layer');
      layer.style.transition = 'none';
      layer.getBoundingClientRect();
      const before = v.stickerEls.map(center);
      v.finish();
      const after = v.stickerEls.map(center);
      const src = applyMove([...Array(54).keys()], m);
      for (let j = 0; j < 54; j++) {
        const [a, b] = [before[src[j]], after[j]];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 2) { bad.push(m); break; }
      }
    }
    host.remove();
    return bad;
  })()`);
  console.log('animation mismatches', animBad);
  console.log('errors', errors);
  const ok = cam.w > 0 && result.matches && result.solves && !animBad.length && !errors.length;
  console.log(ok ? 'E2E OK' : 'E2E FAILED');
  process.exitCode = ok ? 0 : 1;
} finally {
  ws?.close();
  chrome.kill();
}

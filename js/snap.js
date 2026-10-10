// Two-photo mode: the camera looks for a cube corner live, takes the picture
// by itself once three faces are found steadily, and hands 54 colour samples
// to the caller after the second photo.

import { FACES, NORMAL } from './cube.js';
import { COLORS, EXPECTED, nearest } from './color.js';
import { identify, assemble } from './detect.js';

const $ = (id) => document.getElementById(id);
const LIVE_SIDE = 480,
  FULL_SIDE = 1024,
  STABLE = 3;
const REF = FACES.map((f) => COLORS[EXPECTED[f]].lab);
const hex = (letter) => COLORS[EXPECTED[letter]].hex;
const cname = (letter) => COLORS[EXPECTED[letter]].name;

const worker = new Worker('js/detect-worker.js', { type: 'module' });
let jobId = 0;
const jobs = new Map();
worker.onmessage = ({ data }) => {
  jobs.get(data.id)?.(data.result);
  jobs.delete(data.id);
};
const detect = (img, maxSide) =>
  new Promise((resolve) => {
    const id = ++jobId;
    jobs.set(id, resolve);
    worker.postMessage({ id, img, maxSide }, [img.data.buffer]);
  });

const video = $('snap-video'),
  still = $('snap-photo'),
  view = $('snap-view'),
  overlay = $('snap-overlay');
let photos = [null, null],
  step = 0,
  stream = null,
  camToken = 0,
  running = false,
  busy = false,
  capturing = false,
  stable = 0,
  source = 'video',
  onDone = null;

function frame(el, maxSide) {
  const w = el.videoWidth || el.naturalWidth || el.width,
    h = el.videoHeight || el.naturalHeight || el.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(el, 0, 0, c.width, c.height);
  return g.getImageData(0, 0, c.width, c.height);
}

// --- what to show the user ---

// The corner of the three faces not on photo 1, as [top, left, right].
function secondCorner() {
  const seen = photos[0]?.letters ?? ['U', 'R', 'F'];
  const rest = FACES.filter((f) => !seen.includes(f));
  const top = rest.includes('D') ? 'D' : rest[0];
  const [y, z] = rest.filter((f) => f !== top);
  const n = [NORMAL[top], NORMAL[y], NORMAL[z]];
  const det =
    n[0][0] * (n[1][1] * n[2][2] - n[1][2] * n[2][1]) -
    n[0][1] * (n[1][0] * n[2][2] - n[1][2] * n[2][0]) +
    n[0][2] * (n[1][0] * n[2][1] - n[1][1] * n[2][0]);
  // clockwise in the picture is top -> right -> left
  return det < 0 ? [top, z, y] : [top, y, z];
}

function isoSvg(top, left, right) {
  const faces = [
    [[50, 6], [94, 31], [6, 31], top],
    [[6, 31], [50, 56], [6, 81], left],
    [[50, 56], [94, 31], [50, 106], right],
  ];
  const at = (o, a, b, s, t) => [
    o[0] + (a[0] - o[0]) * s + (b[0] - o[0]) * t,
    o[1] + (a[1] - o[1]) * s + (b[1] - o[1]) * t,
  ];
  let svg = '<svg viewBox="0 0 100 112" aria-hidden="true">';
  for (const [o, a, b, letter] of faces) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const g = 0.06;
        const pts = [
          [i + g, j + g],
          [i + 1 - g, j + g],
          [i + 1 - g, j + 1 - g],
          [i + g, j + 1 - g],
        ].map(([s, t]) => at(o, a, b, s / 3, t / 3));
        const fill = i === 1 && j === 1 ? hex(letter) : '#3a3f48';
        svg += `<polygon points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${fill}"/>`;
      }
    }
  }
  return `${svg}</svg>`;
}

function render() {
  $('snap-title').textContent = `Foto ${step + 1} von 2`;
  if (step === 0) {
    $('snap-iso').innerHTML = isoSvg('U', 'F', 'R');
    $('snap-text').innerHTML =
      '<b>Weiß nach oben</b> und eine Ecke zur Kamera drehen, so dass du drei Seiten siehst. Die Aufnahme passiert automatisch.';
  } else {
    const [top, left, right] = secondCorner();
    $('snap-iso').innerHTML = isoSvg(top, left, right);
    $('snap-text').innerHTML =
      `Würfel umdrehen: <b>${cname(top)} nach oben</b>, ${cname(left)} links, ${cname(right)} rechts – also die drei Seiten, die auf Foto 1 fehlen.`;
  }
  $('snap-redo').hidden = step === 0;
  $('snap-thumbs').innerHTML = '';
  photos.forEach((p, i) => {
    const box = document.createElement('div');
    box.className = `thumb${p ? ' done' : i === step ? ' cur' : ''}`;
    if (p) box.append(p.thumb);
    box.append(Object.assign(document.createElement('span'), { textContent: `Foto ${i + 1}` }));
    $('snap-thumbs').append(box);
  });
  status('');
}

function status(text, kind = '') {
  const s = $('snap-status');
  s.textContent = text;
  s.className = `status ${kind}`;
  s.hidden = !text;
}

function message(html) {
  const m = $('snap-msg');
  m.hidden = !html;
  m.innerHTML = html || '';
}

// detection pixels -> viewport pixels (object-fit: cover)
function mapper(iw, ih, scale) {
  const VW = view.clientWidth,
    VH = view.clientHeight;
  const s = Math.max(VW / iw, VH / ih);
  const tx = (VW - iw * s) / 2,
    ty = (VH - ih * s) / 2;
  return ([x, y]) => [x * scale * s + tx, y * scale * s + ty];
}

function draw(r, map) {
  const dpr = window.devicePixelRatio || 1;
  overlay.width = view.clientWidth * dpr;
  overlay.height = view.clientHeight * dpr;
  const g = overlay.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, overlay.width, overlay.height);
  if (!r) return;
  for (const f of r.faces) {
    const q = f.corners.map(map);
    g.beginPath();
    g.moveTo(...q[0]);
    for (const p of q.slice(1)) g.lineTo(...p);
    g.closePath();
    g.lineWidth = 3;
    g.strokeStyle = r.ok ? '#fff' : '#ffb020';
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 4;
    g.stroke();
    g.shadowBlur = 0;
    const size = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) / 3;
    f.cellPts.forEach((pt, i) => {
      const [x, y] = map(pt);
      g.beginPath();
      g.arc(x, y, Math.max(3, size * 0.16), 0, 7);
      g.fillStyle = hex(FACES[nearest(f.cells[i].lab, REF)]);
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.stroke();
    });
  }
}

// --- camera loop ---

async function startCamera() {
  source = 'video';
  still.hidden = true;
  video.hidden = false;
  message(null);
  if (stream) return run();
  if (!navigator.mediaDevices?.getUserMedia) {
    message('Die Kamera ist hier nicht verfügbar. Wähle stattdessen Fotos aus.');
    return;
  }
  const token = ++camToken;
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    if (token !== camToken) {
      for (const t of s.getTracks()) t.stop();
      return;
    }
    stream = s;
    video.srcObject = s;
    await video.play().catch(() => {});
    run();
  } catch (err) {
    if (token === camToken)
      message(
        `Kein Kamerazugriff (${err.name}). Erlaube die Kamera in den Browser-Einstellungen oder wähle Fotos aus.`,
      );
  }
}

function stopCamera() {
  camToken++;
  running = false;
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = null;
  video.srcObject = null;
}

function run() {
  if (running) return;
  running = true;
  stable = 0;
  tick();
}

async function tick() {
  if (!running) return;
  if (!busy && !capturing && source === 'video' && video.readyState >= 2 && video.videoWidth) {
    busy = true;
    const img = frame(video, LIVE_SIDE);
    const scale = video.videoWidth / img.width;
    const r = await detect(img, LIVE_SIDE);
    busy = false;
    if (!running || capturing || source !== 'video') return setTimeout(tick, 80);
    draw(r, mapper(video.videoWidth, video.videoHeight, scale));
    const hint = judge(r);
    stable = hint.ok ? stable + 1 : 0;
    status(hint.text, hint.ok ? 'ok' : '');
    if (stable >= STABLE) capture();
  }
  setTimeout(tick, 60);
}

// Whether a detection is good enough to keep, with a hint for the user.
function judge(r) {
  if (!r.ok) return { ok: false, text: hintFor(r) };
  const letters = identify(r, step ? 'D' : 'U');
  if (step === 1 && photos[0] && letters.filter((l) => photos[0].letters.includes(l)).length >= 2) {
    return { ok: false, text: 'Das sind noch die Seiten von Foto 1 – Würfel umdrehen.' };
  }
  return { ok: true, text: 'Drei Seiten erkannt – still halten …' };
}

function hintFor(r) {
  if (!r.faces.length) return 'Suche Würfel … Ecke zur Kamera, Würfel gut ausgeleuchtet.';
  if (r.faces.length < 3)
    return `${r.faces.length} von 3 Seiten erkannt – eine Ecke direkt zur Kamera drehen.`;
  return `${r.error[0].toUpperCase() + r.error.slice(1)}.`;
}

async function capture() {
  capturing = true;
  status('Aufnahme …', 'ok');
  const thumb = thumbnail(video);
  const img = frame(video, 4096);
  const scale = video.videoWidth / img.width;
  const r = await detect(img, FULL_SIDE);
  if (r.ok && judge(r).ok) {
    draw(r, mapper(video.videoWidth, video.videoHeight, scale));
    accept(r, thumb, scale, video.videoWidth);
  } else {
    status(hintFor(r));
    stable = 0;
  }
  capturing = false;
}

function thumbnail(el) {
  const w = el.videoWidth || el.naturalWidth,
    h = el.videoHeight || el.naturalHeight;
  const c = document.createElement('canvas');
  const s = 160 / Math.max(w, h);
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
  return c;
}

// iw: intrinsic width of the picture the detection coordinates refer to
function accept(r, thumb, scale, iw) {
  const g = thumb.getContext('2d');
  const k = (thumb.width / iw) * scale;
  g.strokeStyle = '#fff';
  g.lineWidth = 1.5;
  for (const f of r.faces) {
    g.beginPath();
    g.moveTo(f.corners[0][0] * k, f.corners[0][1] * k);
    for (const [x, y] of f.corners.slice(1)) g.lineTo(x * k, y * k);
    g.closePath();
    g.stroke();
  }
  photos[step] = { ...r, thumb, letters: identify(r, step ? 'D' : 'U') };
  navigator.vibrate?.(40);
  view.classList.add('flash');
  setTimeout(() => view.classList.remove('flash'), 300);
  if (step === 0) {
    step = 1;
    stable = 0;
    setTimeout(() => {
      render();
      if (source === 'photo')
        message(
          'Jetzt das zweite Foto wählen – oder <button type="button" class="btn" id="snap-cam">Kamera verwenden</button>',
        );
    }, 700);
    return;
  }
  finish();
}

function finish() {
  const a = assemble(photos);
  if (a.error) {
    photos[1] = null;
    render();
    status('Foto 2 zeigt dieselben Seiten wie Foto 1 – bitte den Würfel umdrehen.');
    return;
  }
  stopCamera();
  onDone(a.labs);
}

// --- photo files ---

$('snap-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  stopCamera();
  source = 'photo';
  const url = URL.createObjectURL(file);
  still.src = url;
  await still.decode().catch(() => {});
  video.hidden = true;
  still.hidden = false;
  message(null);
  status('Erkenne …');
  const img = frame(still, 3000);
  const scale = still.naturalWidth / img.width;
  const r = await detect(img, FULL_SIDE);
  draw(r, mapper(still.naturalWidth, still.naturalHeight, scale));
  const hint = judge(r);
  if (hint.ok) {
    status('Drei Seiten erkannt.', 'ok');
    accept(r, thumbnail(still), scale, still.naturalWidth);
  } else status(`${hint.text} Anderes Foto wählen.`);
  URL.revokeObjectURL(url);
});

$('snap-msg').addEventListener('click', (e) => {
  if (e.target.id === 'snap-cam') startCamera();
});

$('snap-shoot').addEventListener('click', () => {
  if (source === 'video' && !capturing && video.videoWidth) capture();
  else if (source !== 'video') startCamera();
});

$('snap-redo').addEventListener('click', () => {
  photos = [null, null];
  step = 0;
  render();
  draw(null);
  if (source === 'video') startCamera();
});

export function enterSnap(done) {
  onDone = done;
  photos = [null, null];
  step = 0;
  render();
  draw(null);
  startCamera();
}

export function leaveSnap() {
  stopCamera();
}

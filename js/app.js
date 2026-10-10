import { FACES, SOLVED, validate, findRotationFix, rotateFace, parseMoves, applyMoves, invertMove } from './cube.js';
import { COLORS, EXPECTED, sampleCells, classify, nearest, nameSeeds, dist, repair } from './color.js';
import { CubeView } from './view3d.js';
import { enterSnap, leaveSnap } from './snap.js';

const $ = (id) => document.getElementById(id);

const FACE_NAME = { U: 'Oben', R: 'Rechts', F: 'Vorne', D: 'Unten', L: 'Links', B: 'Hinten' };
const SCAN_ORDER = ['F', 'R', 'B', 'L', 'U', 'D'];
const STEP_TEXT = {
  F: 'Weiße Mitte nach oben, grüne Mitte zur Kamera.',
  R: 'Würfel eine Vierteldrehung nach links drehen: Rot zur Kamera, Weiß bleibt oben.',
  B: 'Nochmal nach links drehen: Blau zur Kamera, Weiß bleibt oben.',
  L: 'Nochmal nach links drehen: Orange zur Kamera, Weiß bleibt oben.',
  U: 'Nochmal nach links (Grün wieder vorne), dann die Oberseite zu dir kippen: Weiß zur Kamera, Grün zeigt nach unten.',
  D: 'Würfel ganz umdrehen: Gelb zur Kamera, Grün zeigt nach oben.',
};
// neighbouring face that must be at this edge of the photo
const STEP_EDGE = { F: ['top', 'U'], R: ['top', 'U'], B: ['top', 'U'], L: ['top', 'U'], U: ['bottom', 'F'], D: ['top', 'F'] };

const SIDE = { U: 'obere', D: 'untere', F: 'vordere', B: 'hintere', R: 'rechte', L: 'linke' };
const FROM = { U: 'oben', D: 'unten', F: 'vorne', B: 'hinten', R: 'rechts', L: 'links' };
// what a clockwise turn looks like with the cube held normally
const MOTION = {
  U: ['vordere Reihe wandert nach links', 'nach rechts'],
  D: ['vordere Reihe wandert nach rechts', 'nach links'],
  R: ['vordere Spalte wandert nach oben', 'nach unten'],
  L: ['vordere Spalte wandert nach unten', 'nach oben'],
  F: ['obere Reihe wandert nach rechts', 'nach links'],
  B: ['obere Reihe wandert nach links', 'nach rechts'],
};
const VIEW_FOR = { U: 'front', F: 'front', R: 'front', L: 'left', B: 'back', D: 'down' };

const STORE = 'rubik-v1';
const S = {
  labs: new Array(54).fill(null),
  locked: new Array(54).fill(-1),
  assign: new Array(54).fill(-1),
  names: FACES.map((f) => EXPECTED[f]),
  step: 0,
  single: null,
  mode: 'snap',
  auto: [],
  brush: 0,
  start: null,
  moves: [],
  idx: 0,
};

const hexOf = (k) => (k < 0 ? null : COLORS[S.names[k]].hex);
const nameOf = (k) => COLORS[S.names[k]].name;
const letterColors = () => Object.fromEntries(FACES.map((f, k) => [f, hexOf(k)]));
const facelets = () => S.assign.map((k) => (k < 0 ? '?' : FACES[k])).join('');

function save() {
  const { labs, locked, assign, names, start, moves, idx } = S;
  try {
    localStorage.setItem(STORE, JSON.stringify({ labs, locked, assign, names, start, moves, idx }));
  } catch {}
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE));
    if (d?.assign?.length === 54) Object.assign(S, d);
  } catch {}
}

function seeds() {
  return FACES.map((f, k) => S.labs[k * 9 + 4] || COLORS[EXPECTED[f]].lab);
}

function recolor() {
  const sd = seeds();
  const fixed = new Map();
  S.locked.forEach((k, i) => k >= 0 && fixed.set(i, k));
  FACES.forEach((_, k) => fixed.set(k * 9 + 4, k));
  S.assign = classify(S.labs, sd, fixed);
  S.names = nameSeeds(sd);
}

// A misread sticker usually drags a second one with it (nine per colour), so
// an invalid cube is often one swap away from the real one.
function autoRepair() {
  S.auto = [];
  const v = validate(facelets());
  if (v.ok || ['missing', 'count', 'length'].includes(v.reason)) return;
  const toStr = (a) => a.map((k) => FACES[k]).join('');
  const r = repair(S.labs, S.assign, (a) => validate(toStr(a)).ok);
  if (!r) return;
  S.assign = r.assign;
  S.auto = r.changed;
  r.changed.forEach((i) => (S.locked[i] = S.assign[i]));
}

function resetCube() {
  S.labs = new Array(54).fill(null);
  S.locked = new Array(54).fill(-1);
  S.auto = [];
  S.step = 0;
  S.single = null;
  recolor();
}

// --- navigation ---

function show(id) {
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== id;
  if (id !== 'scan') stopCamera();
  if (id !== 'snap') leaveSnap();
  if (id !== 'solve') {
    stopPlay();
    releaseWakeLock();
  }
  if (id === 'home') $('resume').hidden = !S.moves.length && !S.start;
  if (id === 'scan') enterScan();
  if (id === 'snap') enterSnap(snapDone);
  if (id === 'review') renderReview();
  if (id === 'solve') {
    renderSolve();
    requestWakeLock();
  }
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  let go = e.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  if (go === 'again') go = S.mode;
  if (go === 'scan' || go === 'snap') {
    resetCube();
    photo.hidden = true;
    S.mode = go;
    show(go);
  } else if (go === 'manual') {
    S.mode = 'snap';
    resetCube();
    show('review');
  } else show(go);
});

function snapDone(labs) {
  S.labs = labs;
  S.locked = new Array(54).fill(-1);
  S.start = null;
  S.moves = [];
  recolor();
  autoRepair();
  save();
  show('review');
}

$('resume').addEventListener('click', () => show(S.start ? 'solve' : 'review'));

// --- camera and photo source ---

const video = $('video'), photo = $('photo'), viewport = $('viewport'), grid = $('grid');
const N = 96;
const canvas = document.createElement('canvas');
canvas.width = canvas.height = N;
const ctx = canvas.getContext('2d', { willReadFrequently: true });
let stream = null, camToken = 0, source = 'video', previewTimer = null;
const photoTf = { s: 1, tx: 0, ty: 0 };

for (let i = 0; i < 9; i++) grid.append(Object.assign(document.createElement('div'), { className: 'cell' }));

function camMessage(html) {
  const m = $('cam-msg');
  m.hidden = !html;
  m.innerHTML = html || '';
}

async function startCamera() {
  if (stream) return;
  source = 'video';
  photo.hidden = true;
  video.hidden = false;
  if (!navigator.mediaDevices?.getUserMedia) {
    camMessage('Die Kamera ist hier nicht verfügbar. Wähle ein Foto oder gib die Farben von Hand ein.');
    return;
  }
  const token = ++camToken;
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
    });
    if (token !== camToken) return s.getTracks().forEach((t) => t.stop());
    stream = s;
    video.srcObject = s;
    await video.play().catch(() => {});
    camMessage(null);
    previewTimer = setInterval(preview, 200);
  } catch (err) {
    if (token !== camToken) return;
    camMessage(`Kein Kamerazugriff (${err.name}). Erlaube die Kamera in den Browser-Einstellungen oder wähle ein Foto.`);
  }
}

function stopCamera() {
  camToken++;
  clearInterval(previewTimer);
  previewTimer = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}

// Maps viewport pixels to source pixels: source = (viewport - t) / s
function geometry() {
  const V = viewport.clientWidth;
  if (source === 'photo') {
    if (photo.hidden || !photo.naturalWidth) return null;
    return { el: photo, w: photo.naturalWidth, h: photo.naturalHeight, ...photoTf };
  }
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  const s = Math.max(V / w, V / h);
  return { el: video, w, h, s, tx: (V - w * s) / 2, ty: (V - h * s) / 2 };
}

function grab() {
  const g = geometry();
  if (!g) return null;
  const size = grid.offsetWidth / g.s;
  const sx = Math.max(0, Math.min(g.w - size, (grid.offsetLeft - g.tx) / g.s));
  const sy = Math.max(0, Math.min(g.h - size, (grid.offsetTop - g.ty) / g.s));
  ctx.drawImage(g.el, sx, sy, size, size, 0, 0, N, N);
  return sampleCells(ctx, N);
}

function preview() {
  const samples = grab();
  if (!samples) return;
  const sd = seeds();
  [...grid.children].forEach((cell, i) => {
    cell.style.setProperty('--c', COLORS[S.names[nearest(samples[i].lab, sd)]].hex);
  });
}

function layoutPhoto() {
  Object.assign(photo.style, {
    left: `${photoTf.tx}px`,
    top: `${photoTf.ty}px`,
    width: `${photo.naturalWidth * photoTf.s}px`,
    height: `${photo.naturalHeight * photoTf.s}px`,
  });
}

$('file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  stopCamera();
  source = 'photo';
  const url = URL.createObjectURL(file);
  photo.onload = () => {
    const V = viewport.clientWidth;
    photoTf.s = Math.max(V / photo.naturalWidth, V / photo.naturalHeight);
    photoTf.tx = (V - photo.naturalWidth * photoTf.s) / 2;
    photoTf.ty = (V - photo.naturalHeight * photoTf.s) / 2;
    layoutPhoto();
    video.hidden = true;
    photo.hidden = false;
    camMessage(null);
    URL.revokeObjectURL(url);
    preview();
  };
  photo.src = url;
});

// pan and pinch-zoom a chosen photo under the grid
const pointers = new Map();
const spread = (pts) => (pts.length < 2 ? 0 : Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]));
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

function zoomAt([px, py], f) {
  photoTf.tx = px - (px - photoTf.tx) * f;
  photoTf.ty = py - (py - photoTf.ty) * f;
  photoTf.s *= f;
}

viewport.addEventListener('pointerdown', (e) => {
  if (source !== 'photo' || photo.hidden) return;
  viewport.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
});
viewport.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const r = viewport.getBoundingClientRect();
  const before = [...pointers.values()];
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  const after = [...pointers.values()];
  const c0 = centroid(before), c1 = centroid(after);
  if (after.length >= 2 && spread(before) > 0) zoomAt([c1[0] - r.left, c1[1] - r.top], spread(after) / spread(before));
  photoTf.tx += c1[0] - c0[0];
  photoTf.ty += c1[1] - c0[1];
  layoutPhoto();
  preview();
});
for (const ev of ['pointerup', 'pointercancel']) viewport.addEventListener(ev, (e) => pointers.delete(e.pointerId));
viewport.addEventListener('wheel', (e) => {
  if (source !== 'photo' || photo.hidden) return;
  e.preventDefault();
  const r = viewport.getBoundingClientRect();
  zoomAt([e.clientX - r.left, e.clientY - r.top], Math.exp(-e.deltaY * 0.0015));
  layoutPhoto();
  preview();
}, { passive: false });

// --- scanning ---

const currentFace = () => S.single || SCAN_ORDER[S.step];

function enterScan() {
  renderStep();
  if (source === 'photo' && !photo.hidden) return;
  startCamera();
}

function renderStep() {
  const f = currentFace();
  $('scan-title').textContent = S.single ? `Seite neu: ${FACE_NAME[f]}` : `Seite ${S.step + 1} von 6`;
  $('scan-text').textContent = STEP_TEXT[f];
  $('scan-back').disabled = !!S.single || S.step === 0;
  $('scan-dots').innerHTML = SCAN_ORDER.map((g, i) => {
    const k = FACES.indexOf(g);
    const cls = g === f ? 'cur' : S.labs[k * 9 + 4] ? 'done' : '';
    return `<i class="${cls}" style="--c:${COLORS[EXPECTED[g]].hex}" title="${FACE_NAME[g]}"></i>`;
  }).join('');
  const [edge, nb] = STEP_EDGE[f];
  const mini = $('scan-mini');
  mini.innerHTML = '';
  mini.className = `mini edge-${edge}`;
  mini.style.setProperty('--edge', COLORS[EXPECTED[nb]].hex);
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('i');
    if (i === 4) c.style.background = COLORS[EXPECTED[f]].hex;
    mini.append(c);
  }
  for (const cell of grid.children) cell.style.removeProperty('--c');
}

$('shoot').addEventListener('click', () => {
  const samples = grab();
  if (!samples) return;
  const f = currentFace();
  const k = FACES.indexOf(f);
  const center = samples[4].lab;
  const dup = FACES.findIndex((g, j) => j !== k && S.labs[j * 9 + 4] && dist(S.labs[j * 9 + 4], center) < 120);
  if (dup >= 0 && !confirm(`Diese Mitte sieht aus wie die Seite „${FACE_NAME[FACES[dup]]}“, die schon aufgenommen ist. Trotzdem übernehmen?`)) return;
  samples.forEach((s, i) => {
    S.labs[k * 9 + i] = s.lab;
    S.locked[k * 9 + i] = -1;
  });
  recolor();
  save();
  [...grid.children].forEach((cell, i) => cell.style.setProperty('--c', hexOf(S.assign[k * 9 + i])));
  grid.classList.add('flash');
  navigator.vibrate?.(30);
  setTimeout(() => {
    grid.classList.remove('flash');
    if (S.single || S.step === 5) {
      S.single = null;
      if (S.labs.every(Boolean)) autoRepair();
      show('review');
      return;
    }
    S.step++;
    if (source === 'photo') {
      photo.hidden = true;
      camMessage('Foto für die nächste Seite wählen – oder <button class="btn" id="use-cam">Kamera verwenden</button>');
    }
    renderStep();
  }, 650);
});

$('cam-msg').addEventListener('click', (e) => {
  if (e.target.id === 'use-cam') startCamera();
});

$('scan-back').addEventListener('click', () => {
  if (S.step > 0) S.step--;
  renderStep();
});

// --- review ---

const NET_ORDER = ['U', 'L', 'F', 'R', 'B', 'D'];

function renderReview(highlight = []) {
  const net = $('net');
  net.innerHTML = '';
  for (const f of NET_ORDER) {
    const k = FACES.indexOf(f);
    const face = document.createElement('div');
    face.className = 'face';
    face.style.gridArea = f;
    for (let i = 0; i < 9; i++) {
      const idx = k * 9 + i;
      const b = document.createElement('button');
      b.className = 'st';
      b.dataset.i = idx;
      const hex = hexOf(S.assign[idx]);
      if (hex) b.style.background = hex;
      else b.classList.add('unknown');
      if (i === 4) b.classList.add('center');
      if (S.locked[idx] >= 0) b.classList.add('locked');
      if (highlight.includes(idx)) b.classList.add('bad');
      if (S.auto.includes(idx)) b.classList.add('auto');
      face.append(b);
    }
    const label = document.createElement('button');
    label.className = 'face-label';
    label.dataset.rescan = f;
    label.textContent = `${FACE_NAME[f]} ↻`;
    label.title = 'Diese Seite neu fotografieren';
    face.append(label);
    net.append(face);
  }
  renderPalette();
  const v = validate(facelets());
  const msg = $('review-msg');
  if (v.ok) {
    msg.hidden = false;
    msg.className = 'msg ok';
    msg.textContent = S.auto.length
      ? 'Zwei Felder (gestrichelt) wurden automatisch getauscht, damit der Würfel aufgeht – kurz mit deinem Würfel vergleichen.'
      : 'Alles stimmig – kurz mit deinem Würfel vergleichen, dann lösen.';
  } else if (v.reason === 'missing' && v.facelets.length === 48) {
    msg.hidden = true;
  } else {
    msg.hidden = false;
    msg.className = 'msg';
    msg.textContent = explain(v);
  }
}

function renderPalette() {
  const counts = FACES.map((_, k) => S.assign.filter((a) => a === k).length);
  $('palette').innerHTML = FACES.map((f, k) => `
    <button class="pal${k === S.brush ? ' sel' : ''}${counts[k] !== 9 ? ' off' : ''}" data-k="${k}" style="--c:${hexOf(k)}">
      <span>${nameOf(k)}</span><small>${counts[k]}/9</small>
    </button>`).join('');
}

$('palette').addEventListener('click', (e) => {
  const b = e.target.closest('.pal');
  if (!b) return;
  S.brush = Number(b.dataset.k);
  renderPalette();
});

$('net').addEventListener('click', (e) => {
  const rescan = e.target.closest('[data-rescan]')?.dataset.rescan;
  if (rescan) {
    S.single = rescan;
    show('scan');
    return;
  }
  const b = e.target.closest('.st');
  if (!b || b.classList.contains('center')) return;
  const i = Number(b.dataset.i);
  S.assign[i] = S.brush;
  S.locked[i] = S.brush;
  S.auto = S.auto.filter((a) => a !== i);
  S.start = null;
  S.moves = [];
  save();
  renderReview();
});

function explain(v) {
  const nm = (c) => nameOf(FACES.indexOf(c));
  switch (v.reason) {
    case 'missing': return `Noch ${v.facelets.length} Felder ohne Farbe.`;
    case 'count': {
      const parts = FACES.filter((f) => v.counts[f] !== 9).map((f) => `${nm(f)} ${v.counts[f]}×`);
      return `Jede Farbe muss genau 9× vorkommen: ${parts.join(', ')}.`;
    }
    case 'corner': return `Eine Ecke ${v.colors.map(nm).join('/')} gibt es nicht. Prüfe die markierten Felder.`;
    case 'corner-dup': return `Die Ecke ${v.colors.map(nm).join('/')} kommt doppelt vor. Prüfe die markierten Felder.`;
    case 'edge': return `Eine Kante ${v.colors.map(nm).join('/')} gibt es nicht. Prüfe die markierten Felder.`;
    case 'edge-dup': return `Die Kante ${v.colors.map(nm).join('/')} kommt doppelt vor. Prüfe die markierten Felder.`;
    case 'twist': return 'Eine Ecke ist verdreht – entweder falsch erkannt oder der Würfel wurde so zusammengesetzt.';
    case 'flip': return 'Eine Kante ist gekippt – entweder falsch erkannt oder der Würfel wurde so zusammengesetzt.';
    case 'parity': return 'Zwei Teile sind vertauscht – vermutlich wurden zwei Farben verwechselt.';
    default: return 'Ungültiger Würfel.';
  }
}

// --- solver ---

const worker = new Worker('worker.js');
let solverReady = false, jobId = 0;
const jobs = new Map();
worker.onmessage = ({ data }) => {
  if (data.type === 'ready') solverReady = true;
  const job = jobs.get(data.id);
  if (!job) return;
  jobs.delete(data.id);
  data.type === 'solution' ? job.resolve(data.moves) : job.reject(new Error(data.message));
};
const solve = (str) => new Promise((resolve, reject) => {
  const id = ++jobId;
  jobs.set(id, { resolve, reject });
  worker.postMessage({ id, facelets: str });
});

$('solve-btn').addEventListener('click', async () => {
  let v = validate(facelets());
  let note = '';
  if (!v.ok && !['missing', 'count', 'length'].includes(v.reason)) {
    const fix = findRotationFix(facelets());
    if (fix) {
      for (const { face, turns } of fix.rotated) {
        S.assign = rotateFace(S.assign, face, turns);
        S.labs = rotateFace(S.labs, face, turns);
        S.locked = rotateFace(S.locked, face, turns);
      }
      note = `Hinweis: ${fix.rotated.map((r) => FACE_NAME[r.face]).join(', ')} war wohl gedreht fotografiert und wurde automatisch korrigiert.`;
      v = validate(facelets());
    }
  }
  if (!v.ok) {
    renderReview(v.facelets || []);
    return;
  }
  const btn = $('solve-btn');
  btn.disabled = true;
  btn.textContent = solverReady ? 'Berechne …' : 'Löser wird vorbereitet …';
  try {
    const str = facelets();
    const moves = str === SOLVED ? [] : parseMoves(await solve(str));
    if (applyMoves(str, moves) !== SOLVED) throw new Error('Lösung prüft nicht');
    S.start = str;
    S.moves = moves;
    S.idx = 0;
    S.note = note;
    save();
    show('solve');
  } catch (err) {
    const msg = $('review-msg');
    msg.hidden = false;
    msg.className = 'msg';
    msg.textContent = `Fehler beim Lösen: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lösung berechnen';
  }
});

// --- solution playback ---

let view = null, playing = false;

function describe(m) {
  const f = m[0];
  const color = nameOf(FACES.indexOf(f));
  const [cw, ccw] = MOTION[f];
  if (m[1] === '2') return `Die ${SIDE[f]} Seite (${color}) halb herum drehen, 180° – egal in welche Richtung.`;
  if (m[1] === "'") return `Die ${SIDE[f]} Seite (${color}) eine Vierteldrehung gegen den Uhrzeigersinn, von ${FROM[f]} gesehen: ${cw.replace(/nach \w+$/, ccw)}.`;
  return `Die ${SIDE[f]} Seite (${color}) eine Vierteldrehung im Uhrzeigersinn, von ${FROM[f]} gesehen: ${cw}.`;
}

function renderSolve() {
  if (!view) view = new CubeView($('cube3d'), letterColors());
  view.colors = letterColors();
  view.setState(applyMoves(S.start, S.moves.slice(0, S.idx)));
  $('hold').innerHTML = `Halte den Würfel so: <b>${nameOf(0)}</b> oben, <b>${nameOf(2)}</b> vorne – und lass ihn so.` +
    (S.note ? `<br><small>${S.note}</small>` : '');
  $('moves').innerHTML = S.moves.map((m, i) => `<li><button data-k="${i}">${m}</button></li>`).join('');
  updateSolve();
}

function updateSolve() {
  const n = S.moves.length, i = S.idx;
  $('solve-title').textContent = n ? `Zug ${Math.min(i + 1, n)} von ${n}` : 'Lösung';
  [...$('moves').querySelectorAll('button')].forEach((b, k) => {
    b.className = k < i ? 'done' : k === i ? 'cur' : '';
  });
  $('moves').querySelector('.cur')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  const nm = $('now-move'), nd = $('now-desc');
  if (i >= n) {
    nm.textContent = 'Gelöst!';
    nd.textContent = n ? `Fertig nach ${n} Zügen.` : 'Der Würfel ist bereits gelöst.';
    view.setView('front');
  } else {
    nm.textContent = S.moves[i];
    nd.textContent = describe(S.moves[i]);
    view.setView(VIEW_FOR[S.moves[i][0]]);
  }
  $('next').disabled = i >= n;
  $('prev').disabled = i === 0;
  $('first').disabled = i === 0;
  $('play').disabled = i >= n && !playing;
  $('play').innerHTML = playing ? '&#x23F8;&#xFE0E;' : '&#x25B6;&#xFE0E;';
  save();
}

async function step(dir) {
  if (dir > 0 && S.idx < S.moves.length) {
    const m = S.moves[S.idx++];
    updateSolve();
    await view.animate(m);
  } else if (dir < 0 && S.idx > 0) {
    const m = invertMove(S.moves[--S.idx]);
    updateSolve();
    await view.animate(m);
  }
}

function jump(k) {
  stopPlay();
  view.finish?.();
  S.idx = k;
  view.setState(applyMoves(S.start, S.moves.slice(0, k)));
  updateSolve();
}

function stopPlay() {
  playing = false;
  if (view) updateSolve();
}

async function play() {
  playing = true;
  updateSolve();
  while (playing && S.idx < S.moves.length) {
    await step(1);
    await new Promise((r) => setTimeout(r, 350));
  }
  stopPlay();
}

$('next').addEventListener('click', () => {
  stopPlay();
  step(1);
});
$('prev').addEventListener('click', () => {
  stopPlay();
  step(-1);
});
$('first').addEventListener('click', () => jump(0));
$('play').addEventListener('click', () => (playing ? stopPlay() : play()));
$('moves').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (b) jump(Number(b.dataset.k));
});

// keep the screen on while the user is turning the cube
let wakeLock = null;
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {}
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('solve').hidden) requestWakeLock();
});

// --- boot ---

load();
if (S.assign[4] < 0) recolor();
show('home');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

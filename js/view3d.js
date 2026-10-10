// CSS-3D cube: 26 cubies whose outer faces show the stickers of a facelet
// state. A move swings the cubies of one layer in a wrapper element, then the
// new state is painted onto the cubies in their home positions.

import { STICKERS, NORMAL, applyMove } from './cube.js';

// world normal -> CSS transform of a cubie face (CSS y points down)
const SIDES = [
  { n: [0, 0, 1], t: 'translateZ(calc(var(--s) / 2))' },
  { n: [0, 0, -1], t: 'rotateY(180deg) translateZ(calc(var(--s) / 2))' },
  { n: [1, 0, 0], t: 'rotateY(90deg) translateZ(calc(var(--s) / 2))' },
  { n: [-1, 0, 0], t: 'rotateY(-90deg) translateZ(calc(var(--s) / 2))' },
  { n: [0, 1, 0], t: 'rotateX(90deg) translateZ(calc(var(--s) / 2))' },
  { n: [0, -1, 0], t: 'rotateX(-90deg) translateZ(calc(var(--s) / 2))' },
];

export const VIEWS = {
  front: [-28, -38],
  left: [-28, 38],
  back: [-28, 142],
  down: [30, -38],
};

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export class CubeView {
  constructor(el, colors) {
    this.colors = colors;
    this.el = el;
    el.classList.add('scene');
    this.cube = document.createElement('div');
    this.cube.className = 'cube';
    el.append(this.cube);
    this.stickerEls = new Array(54);
    this.cubies = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (!x && !y && !z) continue;
          const pos = [x, y, z];
          const cubie = document.createElement('div');
          cubie.className = 'cubie';
          cubie.style.transform = `translate3d(calc(var(--s) * ${x}), calc(var(--s) * ${-y}), calc(var(--s) * ${z}))`;
          for (const side of SIDES) {
            const face = document.createElement('div');
            face.className = 'cface';
            face.style.transform = side.t;
            const i = STICKERS.findIndex((s) => same(s.pos, pos) && same(s.normal, side.n));
            if (i >= 0) {
              face.classList.add('sticker');
              this.stickerEls[i] = face;
            }
            cubie.append(face);
          }
          this.cubies.push({ pos, el: cubie });
          this.cube.append(cubie);
        }
      }
    }
    this.view = [...VIEWS.front];
    this.applyView();
    this.enableDrag();
  }

  setState(state) {
    this.state = state;
    for (let i = 0; i < 54; i++) this.stickerEls[i].style.setProperty('--c', this.colors[state[i]] || '#555');
  }

  setView(name) {
    this.view = [...VIEWS[name]];
    this.applyView();
  }

  applyView() {
    this.cube.style.transform = `rotateX(${this.view[0]}deg) rotateY(${this.view[1]}deg)`;
  }

  // Resolves once the move is shown; state is updated either way.
  animate(move, ms = 420) {
    this.finish?.();
    const n = NORMAL[move[0]];
    const deg = move[1] === "'" ? -90 : move[1] === '2' ? 180 : 90;
    const layer = document.createElement('div');
    layer.className = 'layer';
    const members = this.cubies.filter((c) => dot(c.pos, n) === 1);
    this.cube.append(layer);
    for (const c of members) layer.append(c.el);
    layer.getBoundingClientRect();
    layer.style.transition = `transform ${move[1] === '2' ? ms * 1.4 : ms}ms ease-in-out`;
    layer.style.transform = `rotate3d(${n[0]}, ${-n[1]}, ${n[2]}, ${deg}deg)`;
    return new Promise((resolve) => {
      const done = () => {
        if (this.finish !== done) return;
        this.finish = null;
        clearTimeout(timer);
        for (const c of members) this.cube.append(c.el);
        layer.remove();
        this.setState(applyMove(this.state, move));
        resolve();
      };
      const timer = setTimeout(done, (move[1] === '2' ? ms * 1.4 : ms) + 80);
      layer.addEventListener('transitionend', done, { once: true });
      this.finish = done;
    });
  }

  enableDrag() {
    let last = null;
    this.el.addEventListener('pointerdown', (e) => {
      last = [e.clientX, e.clientY];
      this.el.setPointerCapture(e.pointerId);
      this.cube.style.transition = 'none';
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!last) return;
      this.view[1] += (e.clientX - last[0]) * 0.5;
      this.view[0] = Math.max(-80, Math.min(80, this.view[0] - (e.clientY - last[1]) * 0.5));
      last = [e.clientX, e.clientY];
      this.applyView();
    });
    const end = () => {
      last = null;
      this.cube.style.transition = '';
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }
}

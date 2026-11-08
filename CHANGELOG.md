# Changelog

Changes after 1.0.0 are listed in the
[GitHub releases](https://github.com/michaelkrisper/rubik/releases).

## 1.0.0 - 2026-10-10

- Detection from two angled photos: perspective, live camera with automatic
  capture, white balance from the white centre, repair of invalid cubes by
  swapping two uncertain stickers.
- Face-by-face scan with grid overlay and manual colour entry.
- Kociemba solver (cubejs) in a Web Worker, at most 22 moves.
- Guidance on an animated 3D cube with an explanation of every move.
- Installable and offline (service worker), no data leaves the device.
- Biome, unit tests with minimum coverage, browser test with fake camera, CI
  with deployment to GitHub Pages.

### Fixed

- Hidden buttons (`hidden`) were visible because `.btn` overrode `display`
  ("Von vorn" on photo 1, "Letzte Lösung fortsetzen").
- Face-by-face scan: red and orange were reported as "the same face twice" in
  warm light; the prompt now appears only for nearly identical colours.

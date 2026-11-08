# CLAUDE.md

Rubik's Cube solver as an installable web app: two angled photos of a scrambled
3x3x3 cube -> perspective detection -> Kociemba solution (at most 22 moves) ->
move-by-move guide on an animated 3D cube. Vanilla JS ES modules, no framework,
no bundler, no build step: the files in the repository are the app. Everything
runs in the browser; CI deploys `main` to GitHub Pages
(https://michaelkrisper.github.io/rubik/).

## Commands

```sh
npm ci                     # only dev dependency: Biome
npm run serve              # python3 -m http.server 8080 -> http://localhost:8080
npm run lint               # Biome format + lint check (npm run lint:fix applies fixes)
npm test                   # node:test unit tests (a few minutes: detection renders)
npm run test:coverage      # unit tests with minimum coverage (what CI runs)
npm run test:e2e           # headless Chrome end-to-end, serves the repo itself
npm run test:e2e -- '' out # same, screenshots to ./out (default: $TMPDIR/rubik-shots)
```

- CI (`.github/workflows/ci.yml`, job "Lint and tests"): `npx biome ci`,
  `npm run test:coverage`, `npm run test:e2e -- '' e2e-screenshots`.
- Coverage gate covers `js/cube.js`, `js/color.js`, `js/detect.js`: 90 % lines and
  functions, 80 % branches. New code in these files needs tests.
- E2E needs Google Chrome (`CHROME=chromium npm run test:e2e` for another binary). It
  uses a fixed DevTools port (9334): run only one instance at a time. It creates and
  deletes its own Chrome profile; an aborted run leaves `rubik-chrome-*` in `$TMPDIR`.
- The camera needs a secure context: `localhost` works, a phone on the LAN needs HTTPS.

## Architecture

Data flow: camera/photo -> `js/detect.js` (runs in `js/detect-worker.js`) finds the
three faces and samples colours -> `assemble()` merges two photos into 54 facelets ->
`js/color.js` `classify()` assigns colours (exactly nine per colour) -> `js/cube.js`
facelet string -> `worker.js` (cubejs) solves -> `js/view3d.js` animates.

- `js/cube.js`: facelet model in Kociemba order (U R F D L B, rows as seen from
  outside). Moves are derived geometrically, so 3D view and solver agree by
  construction. This string is the contract between all modules.
- `js/detect.js`: own perspective detection, no OpenCV: Sobel + gap mask -> sticker
  quads -> lattice per face -> homography. Photo 1 is taken white on top, photo 2
  yellow on top; the white centre doubles as white balance.
- `js/snap.js`: live camera UI with automatic capture; `js/app.js`: flow, face-by-face
  scan, review screen, solution view.
- `worker.js` + `vendor/cubejs/`: vendored cubejs (MIT), pruning tables are built once
  in the worker.
- `test/render.js`: software renderer for scrambled cubes in perspective (lighting,
  colour cast, noise, distractors). `scenario(seed, opts)` is the test-case generator
  for detection, unit tests and E2E.
- `sw.js`: network-first service worker; serves the `SHELL` list offline.

## Conventions

- Biome (`biome.json`): 2 spaces, single quotes, semicolons, trailing commas, line
  width 110. `vendor/` is excluded. Complexity warnings get a `biome-ignore` with a
  reason, not a rewrite for its own sake.
- UI text is German; code, comments, commit messages and docs are English. Comments
  explain the why.
- No runtime dependencies; the page loads nothing from other origins. cubejs stays
  vendored (Dependabot does not track it).

## Rules and pitfalls

- Detection must reject rather than guess: tests demand 0 wrong detections, "not
  detected" is allowed within limits. Check every detection change against many
  seeds via `scenario()`, never against a single image.
- Two photos are required: one photo shows at most three faces, which does not
  determine the cube. Do not build a single-photo mode.
- cubejs returns a meaningless identity sequence for a solved cube; `js/app.js`
  short-circuits `SOLVED` before solving. Keep that check.
- Every new app file must be added to `SHELL` in `sw.js` and to the `cp` line of the
  deploy job in `ci.yml`; only those files are published.
- Two-photo detection assumes the standard colour scheme (white/yellow, green/blue,
  red/orange opposite).
- No third-party photos in the repository.
- Synthetic renders are the only automated regression net; nothing in CI covers real
  cameras, artificial light or iOS home-screen mode.

## Workflow

- Every change starts with a GitHub issue. Branch `<issue>-<slug>` from `main`,
  open a PR with `Closes #<issue>`. Never push to `main` directly.
- PRs auto-merge (squash) once CI and the "Linked ticket" check pass; drafts are not merged.
- Versions exist only as git tags `vX.Y.Z`. Every merge to `main` tags the next patch;
  never edit version numbers in files. Minor/major releases: Actions -> Release.
- Merging to `main` deploys to GitHub Pages automatically.
- Details: CONTRIBUTING.md.

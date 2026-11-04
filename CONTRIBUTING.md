# Contributing

Bug reports, photos of misdetections and pull requests are welcome.

## Setup

Requirements: Node.js 24 or newer (CI: `.nvmrc`), Google Chrome (for the browser test).

```sh
npm ci
npm run serve        # http://localhost:8080
```

There is no build step; the files in the repository are the app. The camera
needs a secure context: `localhost` works, a phone on the local network needs
HTTPS.

## Before opening a pull request

```sh
npm run lint:fix        # Biome: format and lint
npm run test:coverage   # unit tests with minimum coverage
npm run test:e2e        # end-to-end in headless Chrome
```

CI runs the same steps.

## Notes

- Check changes to detection (`js/detect.js`) against many rendered cubes, not
  just one: `scenario()` in `test/render.js` produces any number of cases. A
  wrong detection is worse than "not detected"; when in doubt, reject.
- Add new app files to `SHELL` in `sw.js` and to the deploy step in CI.
- No photos by third parties in the repository.
- Code, comments and commit messages in English; the user interface stays
  German. Comments explain the why, not the what.

# Contributing

Bug reports, photos of misdetections and pull requests are welcome.

## Workflow

1. Every change starts with an issue: a bug report or a feature request.
2. Work on a branch named after the issue. `gh issue develop <issue> --checkout`
   creates `<issue>-<title>`.
3. Open a pull request against `main`. The _Tickets_ check links the issue
   (`Closes #<issue>`); a pull request without a ticket fails.
4. CI runs on every pull request. When all checks are green, _Auto-merge_
   squash-merges it. Open the pull request as a draft while it is not ready.
5. The merge closes the issue. `main` always holds the latest valid state
   (trunk-based development).

## Versions and releases

- Versions follow [Semantic Versioning](https://semver.org) and exist only as
  git tags (`vMAJOR.MINOR.PATCH`).
- CI tags every merge to `main` with the next patch version.
- A release bundles the changes since the previous one: run
  _Actions → Release → Run workflow_ and pick `minor` or `major`. It tags
  `main` and publishes a GitHub release listing the merged pull requests and
  closed tickets.

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

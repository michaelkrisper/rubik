# Mitarbeiten

Fehlerberichte, Fotos mit Fehlerkennungen und Pull Requests sind willkommen.

## Einrichten

Voraussetzungen: Node.js 24, Google Chrome (für den Browsertest).

```sh
npm ci
npm run serve        # http://localhost:8080
```

Es gibt keinen Build-Schritt; die Dateien im Repository sind die App. Die
Kamera braucht einen sicheren Kontext: `localhost` geht, für ein Handy im WLAN
braucht es HTTPS.

## Vor dem Pull Request

```sh
npm run lint:fix        # Biome: formatieren und linten
npm run test:coverage   # Unit-Tests mit Mindestabdeckung
npm run test:e2e        # Ende-zu-Ende im headless Chrome
```

Die CI führt dieselben Schritte aus.

## Hinweise

- Änderungen an der Erkennung (`js/detect.js`) an vielen gerenderten Würfeln
  prüfen, nicht nur an einem: `scenario()` in `test/render.js` liefert beliebig
  viele Fälle. Eine falsche Erkennung ist schlimmer als „nicht erkannt“;
  im Zweifel lieber verwerfen.
- Neue Dateien der App auch in `SHELL` in `sw.js` eintragen und im
  Deploy-Schritt der CI mitkopieren.
- Keine Fotos fremder Urheber ins Repo.
- Commit-Nachrichten auf Deutsch; Code und Kommentare auf Englisch, Kommentare
  erklären das Warum, nicht das Was.

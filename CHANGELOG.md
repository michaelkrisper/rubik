# Änderungen

## 1.0.0 – 2026-10-10

- Erkennung aus zwei Fotos von schräg: Perspektive, Live-Kamera mit
  automatischer Aufnahme, Weißabgleich über die weiße Mitte, Reparatur
  ungültiger Würfel durch Tausch zweier unsicherer Felder.
- Seite-für-Seite-Scan mit Raster und Farbeingabe von Hand.
- Kociemba-Löser (cubejs) im Web Worker, höchstens 22 Züge.
- Anleitung am animierten 3D-Würfel mit Erklärung jedes Zugs.
- Installierbar und offline (Service Worker), keine Daten verlassen das Gerät.
- Biome, Unit-Tests mit Mindestabdeckung, Browsertest mit Fake-Kamera, CI mit
  Deploy auf GitHub Pages.

### Behoben

- Ausgeblendete Knöpfe (`hidden`) waren sichtbar, weil `.btn` die Anzeige
  überschrieb („Von vorn“ bei Foto 1, „Letzte Lösung fortsetzen“).
- Seiten-Scan: Rot und Orange wurden bei warmem Licht als „dieselbe Seite
  doppelt“ gemeldet; die Rückfrage kommt jetzt nur noch bei fast gleicher Farbe.

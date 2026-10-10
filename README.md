# Würfel-Löser

Web-App zum Lösen eines 3×3×3 Rubik's Cube: alle sechs Seiten mit der
Handykamera fotografieren, Farben prüfen, dann Zug für Zug mit animiertem
3D-Würfel nachdrehen. Lösungen haben höchstens 22 Züge (meist 19–22).

**App: https://michaelkrisper.github.io/rubik/**

Läuft auf Android und iPhone im Browser, lässt sich zum Home-Bildschirm
hinzufügen und funktioniert danach auch offline. Alles passiert lokal auf dem
Gerät, es wird nichts hochgeladen.

## Bedienung

1. **Scannen** – die App sagt für jede Seite, wie der Würfel zu halten ist
   (Standardfarben: Weiß oben, Grün vorne; danach nach links weiterdrehen,
   zuletzt Oben- und Unterseite). Würfel so ins Raster halten, dass er es
   ausfüllt, dann *Aufnehmen*. Ohne Kamerazugriff geht es auch mit *Foto*
   (verschieben und zoomen per Finger) oder *Farben von Hand eingeben*.
2. **Prüfen** – erkannte Farben im Würfelnetz. Falsche Felder: Farbe unten
   wählen, Feld antippen. Jede Farbe muss genau 9× vorkommen; unmögliche Ecken
   oder Kanten werden rot markiert. Eine einzelne Seite lässt sich über ihr
   Label (↻) neu fotografieren.
3. **Lösen** – Würfel mit der angezeigten Ober- und Vorderfarbe halten und
   jeden Zug nachdrehen. *Zug machen* animiert den nächsten Zug, ◀ nimmt ihn
   zurück, ▶ spielt alles ab. Der Bildschirm bleibt dabei an.

## Technik

- Vanilla JS als ES-Module, kein Build-Schritt; GitHub Pages direkt aus `main`.
- `js/cube.js` – Facelet-Modell (Kociemba-Reihenfolge URFDLB). Züge werden
  geometrisch aus Drehungen im Raum abgeleitet, Prüfung auf gültige Würfel
  (Ecken/Kanten, Verdrehung, Kippung, Parität). Ist eine Seite um 90° gedreht
  fotografiert, findet `findRotationFix` die Korrektur selbst.
- `js/color.js` – Median-Abtastung der 9 Felder, Klassifikation in CIELAB:
  die sechs Mittelsteine sind die Startwerte, danach eine Zuordnung mit genau
  9 Feldern je Farbe plus Tausch-Verbesserung. Das trennt Rot/Orange und
  Weiß/Gelb deutlich robuster als feste Schwellwerte.
- `worker.js` – Kociemba-Zwei-Phasen-Löser aus
  [cubejs](https://github.com/ldez/cubejs) (MIT, in `vendor/`) im Web Worker;
  die Tabellen werden beim Start einmal aufgebaut (ein paar Sekunden).
- `js/view3d.js` – 3D-Würfel aus CSS-3D-Transforms, ohne WebGL.

## Tests

```sh
npm test                                  # Modell, Validierung, Farben, Löser
python3 -m http.server 8791 &
node scripts/e2e.mjs http://localhost:8791/   # headless Chrome, synthetische Fotos
```

Der E2E-Test verwürfelt einen Würfel, rendert jede Seite als Foto, schickt die
Bilder durch die App, löst und prüft, dass die Lösung den Würfel wirklich löst
– und dass die 3D-Animation jeden Zug in dieselbe Richtung dreht wie das Modell.

## Lizenz

MIT. cubejs: MIT, © Petri Lehtinen, Ludovic Fernandez.

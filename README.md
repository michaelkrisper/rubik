# Würfel-Löser

Web-App zum Lösen eines 3×3×3 Rubik's Cube: zwei Fotos von schräg (eine Ecke
zur Kamera, einmal Weiß oben, einmal umgedreht), die App erkennt den Würfel
in der Perspektive selbst, dann Zug für Zug mit animiertem 3D-Würfel
nachdrehen. Lösungen haben höchstens 22 Züge (meist 19–22).

Warum zwei Fotos? Auf einem Foto sind höchstens drei Seiten zu sehen. Eine Ecke
und drei Kanten sind dann komplett verdeckt, von neun weiteren Teilen sieht man
nur eine Farbe – dazu passen sehr viele verschiedene Würfel.

**App: https://michaelkrisper.github.io/rubik/**

Läuft auf Android und iPhone im Browser, lässt sich zum Home-Bildschirm
hinzufügen und funktioniert danach auch offline. Alles passiert lokal auf dem
Gerät, es wird nichts hochgeladen.

## Bedienung

1. **Fotografieren** – Weiß nach oben, eine Ecke zur Kamera. Die Live-Ansicht
   zeichnet die erkannten Seiten ein und löst automatisch aus, sobald drei
   Seiten stabil erkannt sind. Dann umdrehen (Gelb oben) für die anderen drei
   Seiten – die App sagt, welche Farben links und rechts sein sollen. Statt
   Live-Kamera gehen auch zwei Fotos aus der Galerie.
   Alternativen: *Seite für Seite scannen* (6 Fotos frontal, Raster-Overlay)
   oder *Farben von Hand eingeben*.
2. **Prüfen** – erkannte Farben im Würfelnetz. Falsche Felder: Farbe unten
   wählen, Feld antippen. Jede Farbe muss genau 9× vorkommen; unmögliche Ecken
   oder Kanten werden rot markiert. Geht der Würfel nicht auf, tauscht die App
   selbst die zwei unsichersten Felder, mit denen er aufgeht, und markiert sie
   gestrichelt. Eine einzelne Seite lässt sich über ihr Label (↻) frontal neu
   fotografieren.
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
- `js/detect.js` – Würfelerkennung ohne Bibliothek: Kanten → Sticker-Blobs
  (Viereck-Fit) → je Seite ein Gitter aus Nachbarschaften → Homographie →
  Farbproben je Feld. Die drei Seiten werden gemeinsam platziert (keine
  Überlappung, eine gemeinsame Ecke, passende Kanten); schwach erkannte Seiten
  bekommen die Eckpunkte der Nachbarseiten als Passpunkte. Unsichere Bilder
  werden verworfen statt geraten. Welche Seite welche ist, ergibt sich aus den
  Mittelfarben, der Händigkeit der Ecke und „Weiß/Gelb oben“; die weiße Mitte
  dient als Weißabgleich. Ist der Würfel klein im Bild, wird sein Ausschnitt
  in voller Auflösung ein zweites Mal ausgewertet. Läuft im Worker
  (`js/detect-worker.js`); `js/snap.js` ist die Kamera-Oberfläche dazu.
- `worker.js` – Kociemba-Zwei-Phasen-Löser aus
  [cubejs](https://github.com/ldez/cubejs) (MIT, in `vendor/`) im Web Worker;
  die Tabellen werden beim Start einmal aufgebaut (ein paar Sekunden).
- `js/view3d.js` – 3D-Würfel aus CSS-3D-Transforms, ohne WebGL.

## Tests

```sh
npm test                                  # Modell, Validierung, Farben, Löser, Erkennung
python3 -m http.server 8791 &
node scripts/e2e.mjs http://localhost:8791/   # headless Chrome, synthetische Fotos
```

`test/render.js` rendert verwürfelte Würfel perspektivisch (Licht, Farbstich,
Rauschen, Störobjekte, auch stickerlos mit schmalen Fugen); die Erkennung muss
daraus exakt den Zustand zurückliefern. Der E2E-Test speist so ein Bild als
Fake-Kamera in Chrome ein (die automatische Aufnahme muss auslösen), das zweite
über die Galerie-Auswahl, und prüft außerdem den Seiten-Scan, die Lösung und
dass die 3D-Animation jeden Zug in dieselbe Richtung dreht wie das Modell.

## Lizenz

MIT. cubejs: MIT, © Petri Lehtinen, Ludovic Fernandez.

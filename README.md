# Super Radio

Webspeler voor Super Radio: live stream, wat er nu speelt, de programmering en
muzieknieuws. Statische site, geen build, geen dependencies.

## Draaien

Modules en de service worker vereisen `http://`, niet `file://`:

```bash
python3 -m http.server 8000
```

Daarna http://localhost:8000 openen.

## Opbouw

```
index.html          Opmaak + de SVG-iconenset (sprite)
styles.css          Designsysteem en alle stijlen, licht en donker thema
sw.js               Service worker: offline shell, laat live data met rust
manifest.json       PWA-manifest
js/
  config.js         Endpoints, hoesjes, intervallen. Bevat geen geheimen.
  utils.js          Formatteren, veilige DOM-helpers, safeUrl()
  api.js            Alle netwerkverkeer, caching en deduplicatie
  player.js         Audio, volume, herverbinden, Media Session
  ambient.js        Kleuren uit de hoes, achtergrond, spectrum (vangnet)
  ui.js             Alle rendering
  main.js           Opstarten en de verversronde
  status.js         Herlaadknop voor de statuspagina's
  fx/               Effectenlaag, zie hieronder
images/             Iconen, hoesjes en de OG-kaart (gegenereerd)
```

## Effectenlaag (`js/fx/`)

Alles hierin is versiering. Valt het weg, dan werkt de site onveranderd door.

```
core.js       Eén rAF-lus voor alle effecten, plus lerp/damp en muispositie
gl.js         WebGL: vloeibare achtergrond + hoes met rimpelvervorming
cursor.js     Eigen cursor met magnetische aantrekking
reveal.js     Woord-voor-woord onthulling, tekst-scramble, tellers
scroll.js     Traagheidsscroll, parallax, hero die wegvalt
chrome.js     Oneindige ticker en 3D-tilt op kaarten
preloader.js  Intro met teller
index.js      Zet alles op en praat met main.js
```

Één rAF-lus in `core.js` voedt alles. Dat scheelt niet alleen frames, het houdt
de effecten ook synchroon: cursor, shader en scroll delen dezelfde tijdstap.
`damp()` maakt de interpolatie framerate-onafhankelijk, zodat het op 144 Hz niet
twee keer zo snel gaat als op 60 Hz.

### Wanneer wordt wat uitgezet

| Situatie | Gevolg |
|---|---|
| `prefers-reduced-motion` | Geen WebGL, geen cursor, geen traagheidsscroll, geen tilt, ticker staat stil, tekst verschijnt direct |
| Aanraakscherm (`hover: none`) | Geen cursor, geen tilt, gewone scroll |
| < 4 GB geheugen of < 4 cores | Geen WebGL; de geblurde CSS-achtergrond neemt het over |
| Geen WebGL of context verloren | Idem, en de hoes valt terug op de gewone `<img>` |

### Twee valkuilen om te onthouden

1. **`data-speed` is van de parallax in `scroll.js`.** Gebruik dat attribuut
   nergens anders voor. De ticker heeft daarom `data-marquee-speed`.
2. **`data-split` alleen op elementen met platte tekst.** De functie knipt de
   inhoud in woorden; zit er een icoon of link in, dan slaat hij het element
   over (en dat is met opzet).

### Waarom de visualisatie geen echte audio analyseert

De laut.fm-stream stuurt geen CORS-headers. Een `MediaElementSource` op zo'n
bron levert in de meeste browsers stilte op — de visualisatie zou de audio dus
slopen. Het spectrum en de shaders reageren daarom op de afspeelstatus, niet op
het werkelijke signaal.

## Databronnen

| Wat | Bron | Opmerking |
|---|---|---|
| Stream | `stream.laut.fm/super-radio` | |
| Nu speelt, recent, programma | `api.laut.fm` | `/schedule` wordt 10 min gecacht |
| Hoesjes | iTunes Search API | Publiek, geen sleutel, CORS |
| Nieuws | NU.nl via rss2json | Zie waarschuwing hieronder |

### Hoesjes

Er was ooit een Spotify-koppeling met een client secret in de browser. Dat is
onveilig, stond daarom uit, en dus verschenen er nooit hoesjes. De iTunes Search
API doet hetzelfde zonder sleutel en zonder backend. Verzoeken worden geknepen
op ongeveer vier per seconde en gecacht in `sessionStorage`.

Zenderjingles en programmablokken krijgen een eigen hoesje uit
`SHOW_IMAGES` in `js/config.js`; daar gaat nooit een externe zoekopdracht heen.

### Nieuws — let op

NU.nl stuurt geen CORS-header, dus de feed kan niet rechtstreeks uit de browser
worden opgehaald. Het loopt via gratis diensten van derden (`NEWS_SOURCES` in
`js/config.js`), en die vallen regelmatig uit. Werkt geen enkele bron, dan
verbergt de site de nieuwssectie in plaats van een lege kop te tonen.

Wil je dit robuust maken, dan is een eigen proxy nodig — bijvoorbeeld een
Cloudflare Worker van tien regels die de feed ophaalt en met een CORS-header
doorgeeft.

## Hosting

De site draait op GitHub Pages (`CNAME` → `superradio.live`). GitHub Pages leest
`.htaccess` niet; dat bestand staat er voor een eventuele verhuizing naar
Apache. Op Netlify of Cloudflare Pages heb je in plaats daarvan een
`_headers`-bestand nodig met dezelfde security- en cache-headers.

## Sneltoetsen

| Toets | Actie |
|---|---|
| `spatie` of `k` | Afspelen / pauzeren |
| `↑` / `↓` | Volume ±5 |
| `m` | Dempen |
| `esc` | Mobiel menu sluiten |

## Onderhoud

- Nieuw programma toegevoegd? Zet de naam en een hoesje in `SHOW_IMAGES`
  (`js/config.js`). De sleutel is kleine letters en mag een deel van de naam
  zijn, maar `showImage()` matcht op **woordgrenzen** — `night` pakt dus wel
  "Night Shift" maar niet "Robert Knight". Bij meerdere treffers wint de
  langste sleutel. Houd sleutels liever wat langer dan korter: een sleutel van
  drie letters gaat vroeg of laat ergens dwars doorheen matchen.
- Bestanden gewijzigd? Hoog `VERSION` op in `sw.js`, anders houden bezoekers de
  oude versie uit de cache.
- Afbeeldingen zijn gegenereerd, niet met de hand gemaakt. Het script staat niet
  in de repo; vervang ze gewoon door eigen bestanden met dezelfde namen.

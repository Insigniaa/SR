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
  extras.js         Installeerknop, slaaptimer, sneltoetsenvenster
  stage.js          Kijkmodus op volledig scherm
  sharecard.js      Tekent het nummer als deelbare afbeelding
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

### Kleur uit de hoes

De hoes van het nummer dat speelt kleurt de hele interface: play- en
LIVE-knop, voortgangsbalken, sectie-iconen, badges, focusrand, cursor,
selectie. Het logo en de intro blijven bewust merkrood als vast anker.

Twee soorten tokens, gezet door `applyPalette()` in `js/ambient.js`:

| Token | Waarvoor | Bewerking |
|---|---|---|
| `--dyn-1/2/3` | gloed, spectrum, achtergrond | ruwe kleur, ongewijzigd |
| `--accent`, `--accent-soft`, `--accent-deep`, `--accent-2` | alles met tekst erop | genormaliseerd |

Normaliseren is nodig omdat een ruwe hoeskleur zelden een bruikbare
UI-kleur is. De verzadiging krijgt een bodem van 50% zodat een grauwe hoes
geen grijze knoppen oplevert, en de helderheid wordt in een band geduwd die
past bij het thema: 55-70% op donker, 34-48% op licht. De tint blijft
ongemoeid, want die maakt het herkenbaar. Bij een themawissel wordt opnieuw
genormaliseerd.

Gemeten over alle veertien hoezen ligt het contrast met de achtergrond
tussen 3,6:1 en 10,8:1, dus overal boven de WCAG-drempel van 3:1 voor
UI-elementen.

De tokens staan als `<color>` geregistreerd met `@property`, waardoor de
kleurwissel bij een nieuw nummer over ruim een seconde overvloeit in plaats
van om te springen. Browsers zonder `@property` laten hem gewoon omspringen.

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

### Echte audioanalyse

Het spectrum, de shaders en de pulse op de hoes reageren op de werkelijke
muziek, niet op de afspeelstatus.

Dat kan dankzij twee stream-URL's in `js/config.js`:

| URL | Gedrag |
|---|---|
| `stream.laut.fm/super-radio` | 302 naar de uitzendhost, **zonder** CORS-header |
| `super-radio.stream.laut.fm/super-radio` | 200, kaatst de Origin terug in `Access-Control-Allow-Origin` |

Die 302 breekt CORS, want elke stap in de keten moet kloppen. De directe host
niet, dus die gaat voor. Mislukt hij — verhuisde zender bijvoorbeeld — dan valt
`player.js` terug op de gewone URL zonder analyse; luisteren gaat voor
visualiseren.

**Let op de volgorde in de audiograaf:**

```
element -> analyser -> gain -> speakers
```

Het volume moet ná de analyser. Regel je het op het `<audio>`-element zelf, dan
meet de analyser het verzwakte signaal en wordt de visualisatie vlak zodra
iemand zachter zet. Vandaar dat `audio.volume` op 1 staat zodra de graaf
bestaat en `#applyGain()` het werk doet.

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
| `s` | Slaaptimer openen |
| `f` | Kijkmodus (volledig scherm) |
| `?` | Overzicht van sneltoetsen |
| `esc` | Sluiten |

## Onderhoud

- Programmateksten staan in `SHOW_DESCRIPTIONS` (`js/config.js`). Ze zijn een
  terugval: vult iemand het beschrijvingsveld in laut.fm, dan wint dat. Pas ze
  gerust aan, het is gewoon websitetekst.
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

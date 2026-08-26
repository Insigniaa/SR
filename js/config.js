/**
 * Centrale configuratie voor Super Radio.
 * Bevat geen geheimen: alles hier is publiek en veilig in de repo.
 */

export const STATION = 'super-radio';
export const API_BASE = 'https://api.laut.fm';
export const STREAM_URL = `https://stream.laut.fm/${STATION}`;

/**
 * Dezelfde stream, maar rechtstreeks bij de uitzendserver.
 *
 * Waarom twee URL's: stream.laut.fm antwoordt met een 302 naar deze host, en
 * die 302 draagt geen CORS-header. Daardoor mislukt een aanvraag met
 * crossOrigin en kan de audio niet geanalyseerd worden. Deze host antwoordt
 * meteen met 200 en kaatst de Origin terug in Access-Control-Allow-Origin,
 * dus de analyse werkt op elk domein - ook op localhost.
 *
 * Let op: dit omzeilt de verdeling over servers die laut.fm met die 302 doet.
 * Verhuist de zender ooit, dan valt player.js automatisch terug op STREAM_URL;
 * de visualisatie werkt dan niet meer, het luisteren wel.
 */
export const STREAM_DIRECT = `https://${STATION}.stream.laut.fm/${STATION}`;
export const STATION_PAGE = `https://laut.fm/${STATION}`;

/* --- Artwork ---------------------------------------------------------------
 * De vorige opzet gebruikte Spotify met een client secret in de browser. Dat is
 * onveilig en stond daarom uit, waardoor er nooit hoesjes verschenen. De iTunes
 * Search API doet hetzelfde werk, is publiek, vereist geen sleutel en stuurt
 * CORS-headers. Geen backend nodig.
 */
export const ARTWORK_API = 'https://itunes.apple.com/search';
export const ARTWORK_SIZE = 600;
export const ARTWORK_MIN_GAP_MS = 260;   // throttle: iTunes staat ~20 req/min toe
export const ARTWORK_CACHE_KEY = 'sr.artwork.v1';
export const ARTWORK_CACHE_MAX = 300;

/* --- Media ---------------------------------------------------------------- */
export const DEFAULT_COVER = 'images/default-cover.jpg';

/**
 * Eigen hoesjes voor de programma's van de zender.
 *
 * De sleutels komen uit de werkelijke namen in api.laut.fm/.../schedule.
 * `showImage()` matcht kleine letters op woordgrenzen en laat bij meerdere
 * treffers de langste sleutel winnen, dus specifieke namen mogen naast
 * algemene staan.
 */
export const SHOW_IMAGES = {
    // Decennia
    "60's 70's and 80's": 'images/cover-retro.jpg',
    'the best of the 60s & 70s': 'images/cover-6070.jpg',
    'the 80s': 'images/cover-80s.jpg',
    'hits of the 80s': 'images/cover-80s.jpg',
    'de jaren 80 +': 'images/cover-80s.jpg',
    'de jaren 80': 'images/cover-80s.jpg',
    'the 90s': 'images/cover-90s.jpg',
    '90s': 'images/cover-90s.jpg',
    'the 00s': 'images/cover-00s.jpg',
    '00s': 'images/cover-00s.jpg',
    'the 10s': 'images/cover-10s.jpg',
    '10s': 'images/cover-10s.jpg',

    // Genres en vaste blokken
    'soul motown and dance classics': 'images/cover-soul.jpg',
    'dance classics': 'images/cover-soul.jpg',
    'rock classics': 'images/cover-rock.jpg',
    'love zone': 'images/cover-lovezone.jpg',
    'only the best': 'images/cover-otb.jpg',
    'greatest hits': 'images/cover-hits.jpg',
    'tophits': 'images/cover-hits.jpg',
    'top hits': 'images/cover-hits.jpg',
    'night shift': 'images/cover-night.jpg',
    'night': 'images/cover-night.jpg',
    'no talk - nonstop': 'images/cover-nonstop.jpg',
    'non-stop': 'images/cover-nonstop.jpg',
    'nonstop': 'images/cover-nonstop.jpg'
};

/**
 * Korte omschrijvingen per programma.
 *
 * laut.fm heeft hiervoor een veld, maar dat is bij deze zender voor alle 114
 * roosterslots leeg. Deze teksten zijn de terugval: staat er ooit wél iets in
 * laut.fm, dan wint dat altijd (zie getShows() in api.js).
 *
 * Zelfde matching als SHOW_IMAGES: kleine letters, op woordgrenzen, langste
 * sleutel wint.
 */
export const SHOW_DESCRIPTIONS = {
    "60's 70's and 80's": 'Van de jaren zestig tot en met de tachtig, achter elkaar door.',
    'the best of the 60s & 70s': 'Het beste uit de jaren zestig en zeventig. Motown, soul en de eerste grote rockplaten.',
    'the 80s': 'Alles uit de jaren tachtig, van new wave tot de grote ballads.',
    'hits of the 80s': 'De grootste hits uit de jaren tachtig.',
    'de jaren 80': 'Alles uit de jaren tachtig, van new wave tot de grote ballads.',
    'the 90s': 'De jaren negentig: dance, r&b, britpop en boybands.',
    '90s': 'De jaren negentig: dance, r&b, britpop en boybands.',
    'the 00s': 'De jaren nul. Popsterren, r&b en de eerste clubhits.',
    '00s': 'De jaren nul. Popsterren, r&b en de eerste clubhits.',
    'the 10s': 'De grote hits van 2010 tot 2020.',
    '10s': 'De grote hits van 2010 tot 2020.',

    'soul motown and dance classics': 'Motown, soul en de platen die de dansvloer vol kregen.',
    'dance classics': 'De klassiekers van de dansvloer. Disco, funk en vroege house.',
    'rock classics': 'Gitaren voorop. Stevige riffs en de ballads die iedereen meezingt.',
    'love zone': 'Een uur lang de mooiste liefdesliedjes.',
    'only the best': 'Het beste uit alle jaren, zonder vaste lijn.',
    'greatest hits': 'Alleen de allergrootste hits. Meezingen mag.',
    'tophits': 'De grootste hits van dit moment.',
    'top hits': 'De grootste hits van dit moment.',
    'night shift': 'Rustige muziek voor de kleine uurtjes.',
    'night': 'Rustige muziek voor de kleine uurtjes.',
    'no talk - nonstop': 'Geen gepraat, alleen muziek.',
    'non-stop': 'Geen gepraat, alleen muziek.',
    'nonstop': 'Geen gepraat, alleen muziek.'
};

/** Namen die duiden op een zenderjingle of programma, niet op een artiest. */
export const STATION_ALIASES = [
    'super-radio', 'super radio', 'superradio', 'super - radio', 'super -radio', 'super- radio',
    'soul motown and dance classics', 'soulmotownanddanceclassics', 'dance classics'
];

/* --- Nieuws --------------------------------------------------------------- */
export const NEWS_FEED = 'https://www.nu.nl/rss/muziek';

/**
 * nu.nl stuurt geen Access-Control-Allow-Origin, dus de feed kan niet direct
 * uit de browser gehaald worden. Deze bronnen worden op volgorde geprobeerd;
 * de eerste die antwoordt wint.
 *
 * rss2json staat vooraan: die geeft kant-en-klare JSON met CORS-headers, dus
 * geen XML-parsing en geen HTML-opschoning nodig. Gebruik geen `count`- of
 * `order_by`-parameter: die vereisen een betaalde sleutel en leveren anders 422.
 *
 * Dit blijft een zwakke plek: het zijn gratis diensten van derden die zonder
 * aankondiging kunnen uitvallen. Valt alles weg, dan verbergt ui.js de
 * nieuwssectie in plaats van een lege kop te tonen.
 */
export const NEWS_SOURCES = [
    {
        type: 'json',
        url: (feed) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}`
    },
    {
        type: 'xml',
        url: (feed) => `https://api.allorigins.win/raw?url=${encodeURIComponent(feed)}`
    },
    {
        type: 'xml',
        url: (feed) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(feed)}`
    }
];
export const NEWS_INITIAL = 6;

/* --- Verversintervallen (ms) ---------------------------------------------- */
export const POLL_TRACK = 20_000;      // huidig nummer + recent
export const POLL_SCHEDULE = 300_000;  // programmering verandert per uur
export const POLL_NEWS = 300_000;
export const SCHEDULE_TTL = 600_000;   // cache-duur voor /schedule

/* --- Speler --------------------------------------------------------------- */
export const DEFAULT_VOLUME = 80;
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
export const RECONNECT_MAX_TRIES = 8;

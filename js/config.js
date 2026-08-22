/**
 * Centrale configuratie voor Super Radio.
 * Bevat geen geheimen: alles hier is publiek en veilig in de repo.
 */

export const STATION = 'super-radio';
export const API_BASE = 'https://api.laut.fm';
export const STREAM_URL = `https://stream.laut.fm/${STATION}`;
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
export const STATION_LOGO = 'images/icon-512.png';

/** Eigen hoesjes voor de programma's van de zender. */
export const SHOW_IMAGES = {
    'only the best': 'images/cover-otb.jpg',
    'soul motown and dance classics': 'images/cover-soul.jpg',
    'dance classics': 'images/cover-soul.jpg',
    'soul motown': 'images/cover-soul.jpg',
    "60's 70's and 80's": 'images/cover-retro.jpg',
    'the best of the 60s & 70s': 'images/cover-retro.jpg',
    'the 60s & 70s': 'images/cover-retro.jpg',
    'night': 'images/cover-night.jpg',
    'night shift': 'images/cover-night.jpg',
    'tophits': 'images/cover-hits.jpg',
    'top hits': 'images/cover-hits.jpg',
    'greatest hits': 'images/cover-hits.jpg',
    'de jaren 80 +': 'images/cover-80s.jpg',
    'de jaren 80': 'images/cover-80s.jpg',
    'hits of the 80s': 'images/cover-80s.jpg',
    'love zone': 'images/cover-lovezone.jpg',
    '90s': 'images/cover-90s.jpg',
    'the 90s': 'images/cover-90s.jpg',
    'non-stop': 'images/cover-nonstop.jpg',
    'nonstop': 'images/cover-nonstop.jpg'
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

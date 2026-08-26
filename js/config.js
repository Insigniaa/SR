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
    "60's 70's and 80's": 'Drie decennia achter elkaar. Van de eerste soulklassiekers via disco naar de synths van de jaren tachtig.',
    'the best of the 60s & 70s': "De nummers die het begin van de popmuziek uitmaakten. Motown, rock-'n-roll, funk en de grote ballads.",
    'the 80s': 'Synthesizers, schoudervullingen en refreinen die blijven hangen. De jaren tachtig van begin tot eind.',
    'hits of the 80s': 'De grootste namen uit de jaren tachtig achter elkaar, zonder opvulling.',
    'de jaren 80': 'Synthesizers, schoudervullingen en refreinen die blijven hangen.',
    'the 90s': 'Eurodance, britpop, r&b en boybands. Alles waar de jaren negentig om bekendstonden.',
    '90s': 'Eurodance, britpop, r&b en boybands. Alles waar de jaren negentig om bekendstonden.',
    'the 00s': 'Het decennium van de eerste downloads. Popsterren, r&b en de eerste clubhits die iedereen kende.',
    '00s': 'Het decennium van de eerste downloads. Popsterren, r&b en de eerste clubhits die iedereen kende.',
    'the 10s': 'Van festivalhouse tot streaminghits. De nummers die het afgelopen decennium overal klonken.',
    '10s': 'Van festivalhouse tot streaminghits. De nummers die het afgelopen decennium overal klonken.',

    'soul motown and dance classics': 'Motown, Philly soul en de dansvloerklassiekers die daaruit voortkwamen. Warm, ritmisch en tijdloos.',
    'dance classics': 'De platen die de dansvloer maakten. Disco, funk en house die nog altijd werken.',
    'rock classics': 'Gitaren vooraan. Van stevige riffs tot de rockballads waar iedereen de tekst van kent.',
    'love zone': 'Rustiger uur met de mooiste liefdesliedjes. Soul, ballads en alles wat langzaam gaat.',
    'only the best': 'Een doorlopende selectie van de sterkste nummers uit alle jaren. Geen thema, alleen kwaliteit.',
    'greatest hits': 'De allergrootste hits achter elkaar. Meezingen aangeraden.',
    'tophits': 'De nummers die op dit moment het meest gedraaid worden, aangevuld met vaste favorieten.',
    'top hits': 'De nummers die op dit moment het meest gedraaid worden, aangevuld met vaste favorieten.',
    'night shift': "Zachtere muziek voor de late uren. Rustig doorlopend tot 's ochtends.",
    'night': "Zachtere muziek voor de late uren. Rustig doorlopend tot 's ochtends.",
    'no talk - nonstop': 'Muziek zonder onderbrekingen. Geen praat, alleen platen.',
    'non-stop': 'Muziek zonder onderbrekingen. Geen praat, alleen platen.',
    'nonstop': 'Muziek zonder onderbrekingen. Geen praat, alleen platen.'
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

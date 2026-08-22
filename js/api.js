/**
 * Alle netwerkcommunicatie. Elke functie geeft bruikbare data terug of gooit;
 * de aanroeper beslist wat er met een fout gebeurt.
 */

import {
    API_BASE, STATION, SCHEDULE_TTL,
    ARTWORK_API, ARTWORK_SIZE, ARTWORK_MIN_GAP_MS, ARTWORK_CACHE_KEY, ARTWORK_CACHE_MAX,
    SHOW_IMAGES, NEWS_FEED, NEWS_SOURCES, DEFAULT_COVER
} from './config.js';
import {
    normalizeTrack, textOf, isStationTrack, cleanForSearch,
    safeUrl, toDate, shortDay, sleep
} from './utils.js';

/* ========================================================== fetch-fundament */

const inflight = new Map();   // dedupe: gelijktijdige identieke verzoeken delen één belofte
const memo = new Map();       // { value, expires } per url

/**
 * JSON ophalen met time-out, deduplicatie van gelijktijdige verzoeken en
 * optionele TTL-cache.
 */
async function getJSON(url, { ttl = 0, timeout = 8_000 } = {}) {
    const now = Date.now();

    if (ttl > 0) {
        const hit = memo.get(url);
        if (hit && hit.expires > now) return hit.value;
    }

    if (inflight.has(url)) return inflight.get(url);

    const request = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText} bij ${url}`);
            }

            const value = await response.json();
            if (ttl > 0) memo.set(url, { value, expires: Date.now() + ttl });
            return value;
        } finally {
            clearTimeout(timer);
            inflight.delete(url);
        }
    })();

    inflight.set(url, request);
    return request;
}

const stationUrl = (path) => `${API_BASE}/station/${STATION}/${path}`;

/* ================================================================== tracks */

export async function getCurrentTrack() {
    return normalizeTrack(await getJSON(stationUrl('current_song')));
}

export async function getRecentTracks(limit = 8) {
    const raw = await getJSON(stationUrl('last_songs'));
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeTrack).filter(Boolean).slice(0, limit);
}

export async function getUpcomingArtists(limit = 4) {
    const raw = await getJSON(stationUrl('next_artists'));
    if (!Array.isArray(raw)) return [];

    return raw
        .map((entry) => ({
            name: textOf(entry?.artist ?? entry, ''),
            image: safeUrl(entry?.artist?.image || entry?.image)
        }))
        .filter((item) => item.name)
        .slice(0, limit);
}

/* ================================================================ schedule */

/**
 * Eén gedeelde, gecachete ophaalactie. Voorheen haalden `getCurrentShow` en
 * `getUpcomingShows` dit endpoint allebei apart op, elke 30 seconden.
 */
async function getSchedule() {
    const raw = await getJSON(stationUrl('schedule'), { ttl: SCHEDULE_TTL });
    if (!Array.isArray(raw)) return [];

    return raw
        .map((show) => ({
            name: textOf(show?.name, 'Programma'),
            day: String(show?.day || '').toLowerCase(),
            hour: Number(show?.hour) || 0,
            endHour: Number(show?.end_time ?? show?.hour) || 0,
            description: textOf(show?.description, '')
        }))
        .filter((show) => show.day);
}

/** Draait dit programma nu? Houdt rekening met blokken over middernacht. */
function isShowLive(show, now) {
    const today = shortDay(now);
    const hour = now.getHours();

    if (show.hour > show.endHour) {           // bv. 23:00 - 02:00
        if (show.day === today && hour >= show.hour) return true;

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return show.day === shortDay(yesterday) && hour < show.endHour;
    }

    return show.day === today && hour >= show.hour && hour < show.endHour;
}

/** Minuten vanaf nu tot de start van het programma (0 als het al loopt). */
function minutesUntil(show, now) {
    const order = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayDelta = (order.indexOf(show.day) - now.getDay() + 7) % 7;
    const start = dayDelta * 1440 + show.hour * 60;
    const current = now.getHours() * 60 + now.getMinutes();
    const delta = start - current;
    return delta <= 0 ? delta + 7 * 1440 : delta;
}

/**
 * Eén oproep levert zowel het lopende programma als wat erna komt, uit dezelfde
 * gecachete lijst.
 */
export async function getShows(upcomingLimit = 3) {
    const schedule = await getSchedule();
    const now = new Date();

    const current = schedule.find((show) => isShowLive(show, now)) || null;

    if (current) {
        const startMinutes = current.hour * 60;
        const endMinutes = (current.endHour > current.hour ? current.endHour : current.endHour + 24) * 60;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const elapsed = (nowMinutes < startMinutes ? nowMinutes + 1440 : nowMinutes) - startMinutes;
        current.progress = Math.min(100, Math.max(0, (elapsed / (endMinutes - startMinutes)) * 100));
        current.image = showImage(current.name);
    }

    const upcoming = schedule
        .filter((show) => show !== current)
        .map((show) => ({ ...show, inMinutes: minutesUntil(show, now) }))
        .sort((a, b) => a.inMinutes - b.inMinutes)
        .slice(0, upcomingLimit);

    return { current, upcoming };
}

/** Sleutels op lengte gesorteerd, met een voorgecompileerde woordgrens-regex. */
const SHOW_MATCHERS = Object.entries(SHOW_IMAGES)
    .map(([key, path]) => ({
        key,
        path,
        // Voor en achter de sleutel mag geen letter of cijfer staan, zodat
        // 'night' wel "night shift" pakt maar niet "knight", en '90s' wel
        // "the 90s" maar niet "1990s".
        pattern: new RegExp(
            `(?:^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`,
            'i'
        )
    }))
    .sort((a, b) => b.key.length - a.key.length);

/**
 * Zoekt een eigen hoesje bij een programma- of tracknaam.
 *
 * Twee dingen gaan hier makkelijk mis, en allebei zijn ze eerder misgegaan:
 *
 *  1. Een kale `includes()` matcht dwars door woorden heen. De sleutel 'night'
 *     zat zo in "Robert K-night" en zette de Night Shift-hoes op een
 *     Motown-blok. Daarom matchen we op woordgrenzen.
 *
 *  2. Bij meerdere treffers won de eerste in objectvolgorde, niet de meest
 *     specifieke. Daarom staan de sleutels op lengte gesorteerd: de langste,
 *     en dus preciezste, wint.
 *
 * @param {...(string|null|undefined)} names velden om in te zoeken (titel, artiest, …)
 * @returns {string|null}
 */
export function showImage(...names) {
    for (const matcher of SHOW_MATCHERS) {
        for (const name of names) {
            if (name && matcher.pattern.test(String(name))) return matcher.path;
        }
    }
    return null;
}

/* =================================================================== artwork */

/** In-memory + sessionStorage cache, zodat een herlaadbeurt niets opnieuw zoekt. */
const artworkCache = new Map(loadArtworkCache());
let artworkQueue = Promise.resolve();
let lastArtworkCall = 0;

function loadArtworkCache() {
    try {
        const raw = sessionStorage.getItem(ARTWORK_CACHE_KEY);
        return raw ? Object.entries(JSON.parse(raw)) : [];
    } catch {
        return [];
    }
}

function persistArtworkCache() {
    try {
        const entries = [...artworkCache.entries()].slice(-ARTWORK_CACHE_MAX);
        sessionStorage.setItem(ARTWORK_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* sessionStorage vol of geblokkeerd */ }
}

/**
 * Zoekt een hoesje bij titel + artiest.
 *
 * Volgorde: eigen programmahoesje -> cache -> iTunes Search API. Verzoeken gaan
 * één voor één met een kleine pauze ertussen, zodat we niet tegen de limiet van
 * iTunes aanlopen als er meerdere tracks tegelijk verwerkt worden.
 *
 * @returns {Promise<string|null>} URL van het hoesje, of null
 */
export async function getArtwork(title, artist) {
    if (!title || !artist) return null;

    // Zenderjingles en programma's: eigen hoesje, nooit een externe zoekopdracht.
    if (isStationTrack(artist) || isStationTrack(title)) {
        // Titel en artiest allebei aanbieden: laut.fm zet bij deze blokken de
        // programmanaam nu eens in het ene veld en dan weer in het andere.
        return showImage(title, artist);
    }

    const key = `${artist}|${title}`.toLowerCase();
    if (artworkCache.has(key)) return artworkCache.get(key);

    const result = await enqueueArtwork(() => lookupArtwork(title, artist));
    artworkCache.set(key, result);
    persistArtworkCache();
    return result;
}

/** Serialiseert de zoekopdrachten met een minimale tussenpauze. */
function enqueueArtwork(task) {
    const run = artworkQueue.then(async () => {
        const wait = ARTWORK_MIN_GAP_MS - (Date.now() - lastArtworkCall);
        if (wait > 0) await sleep(wait);
        lastArtworkCall = Date.now();
        return task();
    });

    artworkQueue = run.catch(() => { });
    return run;
}

async function lookupArtwork(title, artist) {
    const term = `${cleanForSearch(artist)} ${cleanForSearch(title)}`.trim();
    if (!term) return null;

    const url = `${ARTWORK_API}?term=${encodeURIComponent(term)}&media=music&entity=song&limit=1`;

    try {
        const data = await getJSON(url, { timeout: 6_000 });
        const art = data?.results?.[0]?.artworkUrl100;
        if (!art) return null;
        return safeUrl(art.replace(/\/\d+x\d+bb\./, `/${ARTWORK_SIZE}x${ARTWORK_SIZE}bb.`));
    } catch {
        return null;   // geen hoesje is geen fout die de pagina mag breken
    }
}

/* ====================================================================== nieuws */

/**
 * Muzieknieuws van NU.nl. Probeert de bronnen uit NEWS_SOURCES op volgorde en
 * stopt bij de eerste die bruikbare items oplevert.
 *
 * Alles wat hieruit komt is niet te vertrouwen: het gaat verderop uitsluitend
 * via textContent de pagina in, en elke URL loopt door safeUrl().
 */
export async function getNews() {
    for (const source of NEWS_SOURCES) {
        try {
            const items = source.type === 'json'
                ? await fetchNewsJson(source.url(NEWS_FEED))
                : await fetchNewsXml(source.url(NEWS_FEED));

            if (items.length) return items;
        } catch {
            // Deze bron doet het niet; door naar de volgende.
        }
    }

    console.warn('[super-radio] geen nieuwsbron bereikbaar');
    return [];
}

async function fetchNewsJson(url) {
    const data = await getJSON(url, { timeout: 9_000 });
    if (data?.status !== 'ok' || !Array.isArray(data.items)) return [];

    return data.items.map((item) => ({
        title: String(item.title || '').trim(),
        excerpt: cleanExcerpt(item.description || item.content || ''),
        image: safeUrl(item.thumbnail) || safeUrl(item.enclosure?.link) || DEFAULT_COVER,
        date: toDate(item.pubDate) || new Date(),
        url: safeUrl(item.link)
    })).filter((item) => item.title);
}

async function fetchNewsXml(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9_000);

    let text;
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/rss+xml, application/xml, text/xml' }
        });
        if (!response.ok) return [];
        text = await response.text();
    } finally {
        clearTimeout(timer);
    }

    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) return [];

    return [...doc.querySelectorAll('item')].map(parseRssItem).filter(Boolean);
}

function parseRssItem(item) {
    const pick = (selector) => item.querySelector(selector)?.textContent?.trim() || '';

    const title = pick('title');
    if (!title) return null;

    const description = pick('description');

    // Afbeelding: eerst enclosure, dan media:content, dan een <img> in de tekst.
    let image = safeUrl(item.querySelector('enclosure[type^="image"]')?.getAttribute('url'));

    if (!image) {
        const media = [...item.getElementsByTagName('*')].find(
            (node) => node.localName === 'content' && (node.getAttribute('type') || '').startsWith('image')
        );
        if (media) image = safeUrl(media.getAttribute('url'));
    }

    if (!image) {
        const match = description.match(/<img[^>]+src=["\']([^"\']+)["\']/i);
        if (match) image = safeUrl(match[1]);
    }

    return {
        title,
        excerpt: cleanExcerpt(description),
        image: image || DEFAULT_COVER,
        date: toDate(pick('pubDate')) || new Date(),
        url: safeUrl(pick('link'))
    };
}

/** Haalt opmaak, entities en de fotobijschriften van NU.nl uit de samenvatting. */
function cleanExcerpt(raw) {
    const text = String(raw)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/copyright photo:[^.]*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    return text || 'Geen samenvatting beschikbaar.';
}

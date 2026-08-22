/** Kleine, afhankelijkheidsvrije helpers. */

import { STATION_ALIASES } from './config.js';

/* ------------------------------------------------------------------- DOM -- */

/**
 * Maakt een element aan. Tekst gaat altijd via textContent, nooit via innerHTML,
 * zodat data uit de API of een RSS-feed nooit als HTML uitgevoerd kan worden.
 *
 * @param {string} tag
 * @param {Object} [attrs] - attributen; `class`, `text`, `html` en `on*` worden speciaal behandeld
 * @param {Array<Node|string>} [children]
 */
export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;

        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(value));
    }

    for (const child of [].concat(children)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }

    return node;
}

/** Maakt een <svg><use href="#id"> voor de sprite in index.html. */
export function icon(id, cls) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (cls) svg.setAttribute('class', cls);
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', `#${id}`);
    svg.append(use);
    return svg;
}

/** Vervangt de inhoud van een element in één keer. */
export function replaceChildren(parent, nodes) {
    parent.replaceChildren(...[].concat(nodes).filter(Boolean));
}

/**
 * Staat alleen http(s) toe. Blokkeert javascript:, data: en andere schema's die
 * via een RSS-feed binnen zouden kunnen komen.
 */
export function safeUrl(value, fallback = null) {
    if (!value || typeof value !== 'string') return fallback;
    try {
        const url = new URL(value, window.location.href);
        return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : fallback;
    } catch {
        return fallback;
    }
}

/* ------------------------------------------------------------ formatteren -- */

const TIME_FMT = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false });
const DATE_FMT = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });

/** Seconden -> "3:07". */
export function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/** Datum -> "14:32". */
export function formatClock(value) {
    const date = toDate(value);
    return date ? TIME_FMT.format(date) : '';
}

/** Datum -> "Zojuist" / "12 min geleden" / "14:32" / "3 mrt". */
export function formatRelative(value) {
    const date = toDate(value);
    if (!date) return '';

    const diff = Date.now() - date.getTime();
    if (diff < 0) return TIME_FMT.format(date);
    if (diff < 60_000) return 'Zojuist';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min geleden`;
    if (diff < 86_400_000) return TIME_FMT.format(date);
    return DATE_FMT.format(date);
}

/** Uren -> "14:00 – 16:00". */
export function formatShowTime(startHour, endHour) {
    const pad = (h) => `${String(Number(h) || 0).padStart(2, '0')}:00`;
    return `${pad(startHour)} – ${pad(endHour)}`;
}

export function toDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

const DAY_NAMES = {
    sun: 'Zondag', mon: 'Maandag', tue: 'Dinsdag', wed: 'Woensdag',
    thu: 'Donderdag', fri: 'Vrijdag', sat: 'Zaterdag'
};

export function dayLabel(short) {
    return DAY_NAMES[String(short).toLowerCase()] || short || '';
}

/** Korte Engelse dagnaam ('mon', 'tue', …) zoals laut.fm die gebruikt. */
export function shortDay(date) {
    return date.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
}

/* -------------------------------------------------------------- tracks ---- */

/**
 * laut.fm levert artiest en titel soms als string en soms als object.
 * Deze helper maakt er altijd een nette string van.
 */
export function textOf(value, fallback = '') {
    if (!value) return fallback;
    if (typeof value === 'string') return value.trim() || fallback;
    if (typeof value === 'object') return String(value.name || value.title || '').trim() || fallback;
    return String(value).trim() || fallback;
}

/** Normaliseert een ruwe track uit de API naar een vast vorm. */
export function normalizeTrack(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const title = textOf(raw.title ?? raw.name, 'Onbekend nummer');
    const artist = textOf(raw.artist, 'Onbekende artiest');

    return {
        title,
        artist,
        startedAt: toDate(raw.started_at),
        endsAt: toDate(raw.ends_at),
        duration: Number(raw.duration) || null,
        image: null,
        key: `${artist.toLowerCase()}|${title.toLowerCase()}`
    };
}

/** Herkent zenderjingles en programmanamen die geen echte artiest zijn. */
export function isStationTrack(name) {
    if (!name) return false;
    const normalized = String(name).toLowerCase().replace(/\s+/g, ' ').trim();
    return STATION_ALIASES.some((alias) => normalized.includes(alias));
}

/** Haalt ruis als "(Remastered 2011)" en trailing "+" weg voor een zoekopdracht. */
export function cleanForSearch(value) {
    return String(value || '')
        .replace(/\((?:[^)]*(?:remaster|version|edit|mix|mono|stereo|live)[^)]*)\)/gi, '')
        .replace(/\[(?:[^\]]*(?:remaster|version|edit|mix)[^\]]*)\]/gi, '')
        .replace(/\s*[-–]\s*(?:remaster(?:ed)?|single version|radio edit).*$/i, '')
        .replace(/\+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/* ------------------------------------------------------------------ misc -- */

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** localStorage die niet omvalt in private mode of bij een vol quotum. */
export const store = {
    get(key, fallback = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch { /* quotum vol of geblokkeerd: stil negeren */ }
    }
};

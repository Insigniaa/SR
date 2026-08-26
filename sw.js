/**
 * Service worker voor Super Radio.
 *
 * Strategie:
 *   - navigatie (HTML)   -> netwerk eerst, cache als vangnet, dan offline.html
 *   - eigen code (js/css)-> netwerk eerst, cache als vangnet
 *   - eigen media/fonts  -> stale-while-revalidate
 *   - stream en API      -> nooit aanraken (live data hoort niet in een cache)
 *
 * Code staat bewust op netwerk-eerst. Met stale-while-revalidate kreeg een
 * terugkerende bezoeker na een deploy eerst de oude main.js te zien en pas bij
 * de volgende paginaweergave de nieuwe; een half bijgewerkte site ziet eruit
 * als een kapotte site. De bestanden zijn klein, dus dat kost vrijwel niets, en
 * offline blijft werken via de cache.
 */

const VERSION = 'v23';
const SHELL_CACHE = `super-radio-shell-${VERSION}`;
const RUNTIME_CACHE = `super-radio-runtime-${VERSION}`;
const OFFLINE_URL = 'offline.html';

/** Alles hier bestaat ook echt; de vorige lijst bevatte /script.js, dat er niet was. */
const SHELL_ASSETS = [
    './',
    'index.html',
    'offline.html',
    'styles.css',
    'manifest.json',
    'js/main.js',
    'js/config.js',
    'js/utils.js',
    'js/api.js',
    'js/player.js',
    'js/ui.js',
    'js/ambient.js',
    'js/status.js',
    'js/extras.js',
    'js/stage.js',
    'js/sharecard.js',
    'js/memory.js',
    'js/ribbon.js',
    'js/favicon.js',
    'js/fx/index.js',
    'js/fx/core.js',
    'js/fx/gl.js',
    'js/fx/cursor.js',
    'js/fx/reveal.js',
    'js/fx/scroll.js',
    'js/fx/chrome.js',
    'js/fx/preloader.js',
    '404.html',
    'images/default-cover.jpg',
    'images/icon-192.png',
    'images/icon-512.png',
    'images/favicon.ico'
];

/** Hosts die live data leveren en dus altijd rechtstreeks naar het netwerk gaan. */
const BYPASS_HOSTS = [
    'stream.laut.fm',
    'api.laut.fm',
    'itunes.apple.com',
    'api.allorigins.win',
    'api.codetabs.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);

        // Per bestand toevoegen. cache.addAll() is atomisch: één 404 liet de
        // hele installatie mislukken, waardoor er nooit iets gecachet werd.
        await Promise.allSettled(
            SHELL_ASSETS.map((asset) => cache.add(new Request(asset, { cache: 'reload' })))
        );

        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((key) => key.startsWith('super-radio-') && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
                .map((key) => caches.delete(key))
        );

        if (self.registration.navigationPreload) {
            await self.registration.navigationPreload.enable();
        }

        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (BYPASS_HOSTS.some((host) => url.hostname.endsWith(host))) return;

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(event));
        return;
    }

    // Alleen eigen bestanden en lettertypen bewaren.
    const sameOrigin = url.origin === self.location.origin;
    const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');

    if (sameOrigin) {
        const isCode = /\.(?:js|css|json)$/.test(url.pathname);
        event.respondWith(isCode ? networkFirst(request) : staleWhileRevalidate(request));
        return;
    }

    if (isFont) {
        event.respondWith(staleWhileRevalidate(request));
    }
});

/**
 * Netwerk eerst, met een korte tijdslimiet zodat een trage verbinding niet
 * eindeloos blijft hangen; daarna alsnog de cache.
 */
async function networkFirst(request, timeout = 4_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(request, { signal: controller.signal });
        if (response.ok) void updateCache(RUNTIME_CACHE, request, response.clone());
        return response;
    } catch {
        return (await caches.match(request)) || offlineFallback();
    } finally {
        clearTimeout(timer);
    }
}

async function handleNavigation(event) {
    try {
        const preloaded = await event.preloadResponse;
        if (preloaded) {
            void updateCache(RUNTIME_CACHE, event.request, preloaded.clone());
            return preloaded;
        }

        const response = await fetch(event.request);
        void updateCache(RUNTIME_CACHE, event.request, response.clone());
        return response;
    } catch {
        const cached = await caches.match(event.request) || await caches.match('index.html');
        return cached || await caches.match(OFFLINE_URL) || offlineFallback();
    }
}

async function staleWhileRevalidate(request) {
    const cached = await caches.match(request);

    const network = fetch(request)
        .then((response) => {
            if (response.ok || response.type === 'opaque') {
                void updateCache(RUNTIME_CACHE, request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    return cached || await network || offlineFallback();
}

async function updateCache(cacheName, request, response) {
    try {
        const cache = await caches.open(cacheName);
        await cache.put(request, response);
    } catch { /* quotum vol of niet-cachebaar antwoord */ }
}

function offlineFallback() {
    return new Response('Offline — controleer je verbinding.', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}

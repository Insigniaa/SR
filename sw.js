const CACHE_NAME = 'super-radio-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/manifest.json'
];

// Install event - cache assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
            .catch(error => console.error('Error caching assets:', error))
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .catch(error => console.error('Error cleaning up old caches:', error))
    );
});

// Fetch event - serve from cache, falling back to network
self.addEventListener('fetch', event => {
    // Skip non-GET requests and streaming audio
    if (event.request.method !== 'GET' || 
        event.request.url.includes('stream.superradio.com') ||
        event.request.url.includes('placehold.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(event.request)
                    .then(response => {
                        // Cache successful responses
                        if (response.ok && 
                            !event.request.url.includes('stream.superradio.com') &&
                            !event.request.url.includes('placehold.co')) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, responseToCache))
                                .catch(error => console.error('Error caching response:', error));
                        }
                        return response;
                    })
                    .catch(error => {
                        console.error('Fetch error:', error);
                        // Return a custom offline page or fallback content
                        return new Response('Offline - Please check your connection', {
                            status: 503,
                            statusText: 'Service Unavailable',
                            headers: new Headers({
                                'Content-Type': 'text/plain'
                            })
                        });
                    });
            })
    );
}); 

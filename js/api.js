import {
    STATION_NAME,
    BASE_URL,
    SPOTIFY_CLIENT_ID,
    // SPOTIFY_CLIENT_SECRET, // Removed
    SPOTIFY_TOKEN_URL,
    SPOTIFY_API_URL,
    DEFAULT_TRACK_IMAGE,
    SHOW_IMAGES,
    BACKGROUND_IMAGES
} from './config.js';
import { isSuperRadioTrack, generateDefaultImage } from './utils.js';

// Cache objects
export const trackImageCache = new Map();
const superRadioBackgroundCache = new Map();

// Spotify Token State
let spotifyAccessToken = null;
let tokenExpirationTime = null;

// Listener History State
let listenerHistory = JSON.parse(localStorage.getItem('listenerHistory') || '[]');

export async function fetchCurrentTrack() {
    const timestamp = new Date().getTime();
    const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/current_song?t=${timestamp}`, {
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch current track');
    }

    return await response.json();
}

export async function fetchRecentTracks() {
    const timestamp = new Date().getTime();
    const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/last_songs?t=${timestamp}`, {
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error('Failed to fetch recent tracks');
    return await response.json();
}

export async function fetchUpcomingTracks() {
    const timestamp = new Date().getTime();
    const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/next_artists?t=${timestamp}`, {
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
    });

    // Note: The original code suppresses errors here and returns empty array/null if fails
    if (response.ok) {
        return await response.json();
    } else {
        console.error('Failed to fetch upcoming tracks:', response.status);
        return [];
    }
}

export async function getCurrentShow() {
    try {
        const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/schedule`);
        if (!response.ok) throw new Error('Failed to fetch schedule');

        const schedule = await response.json();
        const now = new Date();
        const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
        const hour = now.getHours();

        return schedule.find(show => {
            if (show.hour > show.end_time) {
                if (show.day === day) {
                    return hour >= show.hour || hour < show.end_time;
                } else {
                    const prevDay = new Date(now);
                    prevDay.setDate(prevDay.getDate() - 1);
                    const prevDayName = prevDay.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
                    if (show.day === prevDayName && hour < show.end_time) {
                        return true;
                    }
                }
            } else {
                return show.day === day && hour >= show.hour && hour < show.end_time;
            }
            return false;
        });
    } catch (error) {
        console.error('Error fetching current show:', error);
        return null;
    }
}

export async function getUpcomingShows() {
    try {
        const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/schedule`);
        if (!response.ok) throw new Error('Failed to fetch schedule');

        const schedule = await response.json();
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinutes;
        const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();

        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDay = tomorrow.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();

        const relevantShows = schedule.filter(show =>
            show.day === day || show.day === tomorrowDay
        );

        relevantShows.sort((a, b) => {
            const aTime = a.hour * 60;
            const bTime = b.hour * 60;
            let aAdjusted = aTime;
            let bAdjusted = bTime;

            if (a.day === day && aTime < currentTimeInMinutes) aAdjusted += 24 * 60;
            if (b.day === day && bTime < currentTimeInMinutes) bAdjusted += 24 * 60;
            if (a.day === tomorrowDay) aAdjusted += 24 * 60;
            if (b.day === tomorrowDay) bAdjusted += 24 * 60;

            return aAdjusted - bAdjusted;
        });

        const upcomingShows = relevantShows.filter(show => {
            const showStartMinutes = show.hour * 60;

            if (show.day === day) {
                if (show.hour > show.end_time) {
                    return currentHour < show.hour;
                } else {
                    return showStartMinutes > currentTimeInMinutes;
                }
            } else if (show.day === tomorrowDay) {
                return true;
            }
            return false;
        });

        return upcomingShows.slice(0, 3);

    } catch (error) {
        console.error('Error fetching upcoming shows:', error);
        return [];
    }
}

export async function getSpotifyAccessToken() {
    if (spotifyAccessToken && tokenExpirationTime && Date.now() < tokenExpirationTime) {
        return spotifyAccessToken;
    }

    // SECURITY: Client-side secret usage is unsafe. 
    // This function is disabled until a backend is provided.
    console.warn('Spotify integration requires a backend to secure usage of Client Secret.');
    return null;

    /* 
    // Legacy insecure implementation for reference:
    try {
        const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET)
            },
            body: 'grant_type=client_credentials'
        });
        // ...
    } */

}

export async function getTrackImage(title, artist) {
    if (!title || !artist || artist === 'Unknown Artist' || title === 'Unknown Track') {
        return null;
    }


    // Skip Spotify search for station jingles/shows to avoid incorrect matches
    // But check if we have a specific show image first
    if (isSuperRadioTrack(artist)) {
        // Check title for show name match
        for (const [showName, imagePath] of Object.entries(SHOW_IMAGES)) {
            if (title.toLowerCase().includes(showName.toLowerCase())) {
                return imagePath;
            }
            // Also check artist field just in case it's there (like Soul Motown case)
            if (artist.toLowerCase().includes(showName.toLowerCase())) {
                return imagePath;
            }
        }
        return null;
    }


    const cacheKey = `${title.toLowerCase()}-${artist.toLowerCase()}`;
    if (trackImageCache.has(cacheKey)) {
        return trackImageCache.get(cacheKey);
    }

    try {
        const token = await getSpotifyAccessToken();
        if (!token) return null;

        title = title.replace(/\+$/, '').trim();
        artist = artist.replace(/^super(-|\s)?radio$/i, '').trim();

        const searchResponse = await fetch(
            `${SPOTIFY_API_URL}/search?q=${encodeURIComponent(title + ' ' + artist)}&type=track&limit=1`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (!searchResponse.ok) throw new Error('Failed to search Spotify');

        const searchData = await searchResponse.json();
        const track = searchData.tracks?.items?.[0];

        if (track?.album?.images?.[0]?.url) {
            const imageUrl = track.album.images[0].url;
            trackImageCache.set(cacheKey, imageUrl);
            return imageUrl;
        }

        const artistSearchResponse = await fetch(
            `${SPOTIFY_API_URL}/search?q=${encodeURIComponent(artist)}&type=artist&limit=1`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (!artistSearchResponse.ok) throw new Error('Failed to search Spotify for artist');

        const artistData = await artistSearchResponse.json();
        const artistImages = artistData.artists?.items?.[0]?.images;

        if (artistImages?.[0]?.url) {
            const imageUrl = artistImages[0].url;
            trackImageCache.set(cacheKey, imageUrl);
            return imageUrl;
        }

        trackImageCache.set(cacheKey, null);
        return null;
    } catch (error) {
        console.error('Error fetching track image from Spotify:', error);
        trackImageCache.set(cacheKey, null);
        return null;
    }
}

// Listener Count Logic
function updateListenerHistory(count) {
    const now = Date.now();
    listenerHistory.push({ count, timestamp: now });
    if (listenerHistory.length > 10) {
        listenerHistory = listenerHistory.slice(-10);
    }
    localStorage.setItem('listenerHistory', JSON.stringify(listenerHistory));
}


// Enhanced Listener Count Logic
export async function getListenerCount() {
    try {
        const now = new Date();
        const timestamp = now.getTime();

        // 1. Fetch Real Count (with fallback)
        let realCount = 0;
        try {
            const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/listeners`);
            if (response.ok) {
                realCount = await response.json();
            }
        } catch (e) {
            console.warn('Listener fetch failed, using fallback logic');
        }

        // 2. Determine "Organic" Multiplier based on Time of Day (Amsterdam Time)
        // Convert current time to Amsterdam time object
        const amsterdamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));

        const hour = amsterdamTime.getHours();
        const day = amsterdamTime.getDay(); // 0 = Sun, 6 = Sat
        const minute = amsterdamTime.getMinutes();

        // Base curve: 
        // 06-09: Morning Rush (High)
        // 09-12: Work (Medium)
        // 12-14: Lunch (High)
        // 14-16: Afternoon (Medium-Low)
        // 16-19: Drive Time (Very High)
        // 19-23: Evening (Medium-High)
        // 23-06: Night (Low)

        let timeMultiplier = 1.0;

        if (hour >= 6 && hour < 9) timeMultiplier = 1.4;
        else if (hour >= 9 && hour < 12) timeMultiplier = 1.2;
        else if (hour >= 12 && hour < 14) timeMultiplier = 1.3;
        else if (hour >= 14 && hour < 16) timeMultiplier = 1.1;
        else if (hour >= 16 && hour < 19) timeMultiplier = 1.6; // Peak
        else if (hour >= 19 && hour < 23) timeMultiplier = 1.3;
        else timeMultiplier = 0.6; // Night

        // Weekend Boost
        if (day === 0 || day === 6) timeMultiplier *= 1.2;
        if (day === 5 && hour >= 16) timeMultiplier *= 1.3; // Friday Night

        // Random Noise Seed (Changes every 5 mins)
        const seed = Math.floor(timestamp / 300000);

        // Pseudo-random helper using seed (simple sine implementation)
        const seededRandom = (modifier) => {
            const x = Math.sin(seed + modifier) * 10000;
            return x - Math.floor(x);
        };

        // 3. Simulated Base Audience
        // Now stable across reloads within the 5-min window
        // Range: 5 + (0 to 5) = 5-10
        let baseFallback = 5 + Math.floor(seededRandom(1) * 5);
        let baseCount = Math.max(realCount, baseFallback);

        // 4. Show Popularity Factor
        // ...

        // 5. Calculate Target Count
        // Multiplier reduced to 0.15
        let simulatedAddon = Math.floor(baseCount * 0.15 * timeMultiplier);

        // Random Fluctuation (also seeded)
        const randomFactor = (seededRandom(2) * 0.5 + 0.5) * 0.2; // 0 to 0.2

        let targetCount = Math.floor(baseCount + simulatedAddon + (baseCount * randomFactor));

        // 6. Smoothing / Momentum
        // Instead of jumping instantly, we move towards the target
        const lastCountStr = localStorage.getItem('lastListenerCount');
        let currentDisplayCount = lastCountStr ? parseInt(lastCountStr) : targetCount;

        // Move 10% of the way there, or at least 1 unit
        if (currentDisplayCount !== targetCount) {
            const diff = targetCount - currentDisplayCount;
            const step = diff > 0 ? Math.ceil(diff * 0.2) : Math.floor(diff * 0.2);
            currentDisplayCount += step;
        }

        // Failsafe min
        if (currentDisplayCount < 3) currentDisplayCount = 3 + Math.floor(Math.random() * 3);

        localStorage.setItem('lastListenerCount', currentDisplayCount);
        updateListenerHistory(currentDisplayCount);

        return currentDisplayCount;

    } catch (error) {
        console.warn('Error calculating listeners:', error);
        return parseInt(localStorage.getItem('lastListenerCount') || '15');
    }
}


// News
function getFallbackNews() {
    return [
        {
            title: 'Nieuwe muziektrends in 2024',
            content: 'De muziekindustrie blijft zich ontwikkelen met nieuwe genres en artiesten die de hitlijsten bestormen. Van elektronische beats tot indie rock, er is voor ieder wat wils.',
            image: DEFAULT_TRACK_IMAGE,
            date: new Date(),
            source: 'Muziek Nieuws',
            url: '#'
        },
        {
            title: 'Streaming cijfers bereiken nieuwe hoogtes',
            content: 'Muziekstreaming blijft groeien met miljoenen nieuwe luisteraars wereldwijd. De populariteit van online radio en streaming diensten neemt alleen maar toe.',
            image: DEFAULT_TRACK_IMAGE,
            date: new Date(Date.now() - 3600000), // 1 hour ago
            source: 'Muziek Nieuws',
            url: '#'
        },
        {
            title: 'Festival seizoen kondigt zich aan',
            content: 'Met de komst van het warme weer bereiden festivals zich voor op een geweldig seizoen vol live muziek en onvergetelijke optredens.',
            image: DEFAULT_TRACK_IMAGE,
            date: new Date(Date.now() - 7200000), // 2 hours ago
            source: 'Muziek Nieuws',
            url: '#'
        }
    ];
}

export async function fetchNews() {
    try {
        const proxies = [
            'https://api.allorigins.win/raw?url=',
            'https://cors-anywhere.herokuapp.com/',
            'https://api.codetabs.com/v1/proxy?quest='
        ];

        let response = null;

        for (const proxy of proxies) {
            try {
                const url = proxy + encodeURIComponent('https://www.nu.nl/rss/muziek');
                response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' }
                });
                if (response.ok) break;
            } catch (error) {
                continue;
            }
        }

        if (!response || !response.ok) {
            console.warn('All news proxies failed, using fallback news data');
            return getFallbackNews();
        }

        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        const items = xmlDoc.querySelectorAll('item');

        return Array.from(items).map(item => {
            let imageUrl = DEFAULT_TRACK_IMAGE;
            const enclosure = item.querySelector('enclosure');
            if (enclosure && enclosure.getAttribute('type')?.startsWith('image/')) {
                imageUrl = enclosure.getAttribute('url');
            }

            if (imageUrl === DEFAULT_TRACK_IMAGE) {
                const mediaContent = item.querySelector('media\\:content, content');
                if (mediaContent && mediaContent.getAttribute('type')?.startsWith('image/')) {
                    imageUrl = mediaContent.getAttribute('url');
                }
            }

            // Clean up content
            const content = item.querySelector('description')?.textContent || '';

            // If still no image, try regex from description
            if (imageUrl === DEFAULT_TRACK_IMAGE) {
                const imgMatch = content.match(/src="([^"]+)"/);
                if (imgMatch) imageUrl = imgMatch[1];
                const copyrightMatch = content.match(/copyright photo: ([^<]+)/);
                if (copyrightMatch) imageUrl = copyrightMatch[1];
            }

            const cleanContent = content
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/copyright photo: [^<]+/g, '')
                .trim();

            return {
                title: item.querySelector('title')?.textContent || 'Geen titel',
                content: cleanContent || 'Geen beschrijving beschikbaar',
                image: imageUrl,
                date: new Date(item.querySelector('pubDate')?.textContent || new Date()),
                source: 'NU.nl Muziek',
                url: item.querySelector('link')?.textContent || '#'
            };
        });
    } catch (error) {
        console.warn('Error fetching NU.nl news, using fallback:', error);
        return getFallbackNews();
    }
}

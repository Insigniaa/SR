export const STATION_NAME = 'super-radio';
export const BASE_URL = 'https://api.laut.fm';
export const STREAM_URL = `https://stream.laut.fm/${STATION_NAME}`;

// Spotify API Configuration
// WARNING: Secrets removed for client-side security.
// Use a backend proxy or secure token service in production.
export const SPOTIFY_CLIENT_ID = 'fdeaefab6ddc48ed9f4a24f2e96b2ec7';
// export const SPOTIFY_CLIENT_SECRET = 'YOUR_SECRET_HERE'; // MOVED TO BACKEND
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

// Default Image Configuration
export const DEFAULT_COLORS = {
    primary: '#00F0FF',    // Electric Cyan
    secondary: '#FF00AA',  // Hot Pink
    accent: '#7000FF',     // Bright Purple
    dark: '#050510',       // Deep Navy/Black
};

export const DEFAULT_TRACK_IMAGE = 'images/default-cover-premium.png';

export const SHOW_IMAGES = {
    'Only The Best': 'images/cover-otb.png',
    'SOUL MOTOWN AND DANCE CLASSICS': 'images/cover-soul.png',
    "60's 70's And 80's": 'images/cover-retro.png',
    "The Best Of The 60s & 70s": 'images/cover-retro.png',
    'Night': 'images/cover-night.png',
    'Tophits': 'images/cover-hits.png',
    'Top Hits': 'images/cover-hits.png',
    'de jaren 80 +': 'images/cover-80s.png',
    'De jaren 80': 'images/cover-80s.png',
    'Greatest Hits': 'images/cover-hits.png',
    'Love Zone': 'images/cover-lovezone.png',
    '90s': 'images/cover-90s.png',
    'HITS OF THE 80s': 'images/cover-80s.png',
    'Dance Classics': 'images/cover-soul.png',
    'NON-STOP': 'images/cover-nonstop.png'
};

export const BACKGROUND_IMAGES = [
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop'
];

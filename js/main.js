import { DEFAULT_TRACK_IMAGE } from './config.js';
import { SuperAudioPlayer } from './player.js';
import {
    fetchCurrentTrack,
    fetchRecentTracks,
    fetchUpcomingTracks,
    fetchNews,
    getCurrentShow,
    getUpcomingShows,
    getListenerCount,
    getTrackImage
} from './api.js';
import {
    initializeUI,
    updateCurrentTrackUI,
    displayRecentTracks,
    displayUpcomingTracks,
    displayNews,
    displayScheduleInfo,
    updateListenerCount,
    hideLoadingScreen,
    showNotification
} from './ui.js';
import { initializeVisualizer } from './visualizer.js';

const UPDATE_INTERVAL = 30000; // 30 seconds
const NEWS_INTERVAL = 300000; // 5 minutes

async function updateEverything() {
    try {
        const [currentTrack, recent, upcoming, currentShow, upcomingShows, listeners] = await Promise.allSettled([
            fetchCurrentTrack(),
            fetchRecentTracks(),
            fetchUpcomingTracks(),
            getCurrentShow(),
            getUpcomingShows(),
            getListenerCount()
        ]);

        if (currentTrack.status === 'fulfilled') {
            // Enhance with Spotify Image if needed
            let track = currentTrack.value;

            // Normalize Artist and Title to ensure they are strings
            if (track.artist && typeof track.artist === 'object') {
                track.artist = track.artist.name || 'Unknown Artist';
            }
            if (track.title && typeof track.title === 'object') {
                track.title = track.title.name || 'Unknown Track';
            }

            // Try to fetch better image
            const image = await getTrackImage(track.title, track.artist);
            if (image) track.image = image;
            else track.image = track.cover || DEFAULT_TRACK_IMAGE; // Fallback to what API gave or default


            updateCurrentTrackUI(track);

            // Update Visualizer Theme
            if (window.colorThemeManager && track.image) {
                const colors = await window.colorThemeManager.extractColorsFromImage(track.image);
                window.colorThemeManager.applyColorTheme(colors);
            }
        } else {
            // Handle offline/error state
            console.warn('Current track fetch failed');
            updateCurrentTrackUI({
                title: 'Stream Offline',
                artist: 'Check Connection',
                image: null
            });
        }

        if (recent.status === 'fulfilled') {
            const recentTracks = recent.value;
            // Process images for recent tracks
            await Promise.all(recentTracks.map(async (track) => {
                // Normalize items
                const artist = track.artist.name || track.artist || 'Unknown Artist';
                const title = track.title || track.name || 'Unknown Track';

                const image = await getTrackImage(title, artist);
                if (image) {
                    track.image = image;
                }
            }));
            displayRecentTracks(recentTracks);
        }

        if (upcoming.status === 'fulfilled') displayUpcomingTracks(upcoming.value);

        if (currentShow.status === 'fulfilled' || upcomingShows.status === 'fulfilled') {
            displayScheduleInfo(
                currentShow.status === 'fulfilled' ? currentShow.value : null,
                upcomingShows.status === 'fulfilled' ? upcomingShows.value : []
            );
        }

        if (listeners.status === 'fulfilled') updateListenerCount(listeners.value);

    } catch (error) {
        console.error('Error updating data:', error);
        // showNotification('Error updating data'); // Optional: don't spam user
    }
}

async function init() {
    console.log('Super Radio Initializing...');

    // Initialize Player
    const player = new SuperAudioPlayer();

    // Initialize UI
    initializeUI(player);

    // Initialize Visualizer
    initializeVisualizer();

    // Initial Fetch
    await updateEverything();

    // Helper for News
    fetchNews().then(news => displayNews(news));

    // Hide Loading Screen
    setTimeout(hideLoadingScreen, 1000);

    // Start Loops
    setInterval(updateEverything, UPDATE_INTERVAL);
    setInterval(() => fetchNews().then(news => displayNews(news)), NEWS_INTERVAL);

    console.log('Super Radio Ready!');
}

// Start
document.addEventListener('DOMContentLoaded', init);

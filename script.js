// Constants
const STATION_NAME = 'super-radio';
const BASE_URL = 'https://api.laut.fm';
const STREAM_URL = `https://stream.laut.fm/${STATION_NAME}`;

// Spotify API Configuration
const SPOTIFY_CLIENT_ID = 'fdeaefab6ddc48ed9f4a24f2e96b2ec7'; // Add your Spotify Client ID here
const SPOTIFY_CLIENT_SECRET = 'ba498cbc6c64456998532179c18255dd'; // Add your Spotify Client Secret here
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
let spotifyAccessToken = null;
let tokenExpirationTime = null;

// Default Image Configuration
const DEFAULT_COLORS = {
    primary: '6C63FF',    // Rich Purple
    secondary: '00D1FF',  // Bright Cyan
    accent: 'FF3D71',     // Coral Pink
    dark: '0A1128',       // Deep Navy
};

const DEFAULT_TRACK_IMAGE = generateDefaultImage('Music');

function generateDefaultImage(text, type = 'track') {
    // Dynamic color selection based on content type
    let colors;
    switch (type) {
        case 'artist':
            colors = `${DEFAULT_COLORS.secondary}/${DEFAULT_COLORS.primary}`;
            break;
        case 'album':
            colors = `${DEFAULT_COLORS.accent}/${DEFAULT_COLORS.dark}`;
            break;
        default: // track
            colors = `${DEFAULT_COLORS.primary}/${DEFAULT_COLORS.dark}`;
    }
    
    // Add music note emoji and format text
    const formattedText = encodeURIComponent(`🎵\n${text}`);
    return `https://placehold.co/400x400/${colors}?text=${formattedText}&font=montserrat`;
}

const newsContainer = document.querySelector('.news-grid');
const scrollProgress = document.querySelector('.scroll-progress');

// DOM Elements
const currentTrackTitle = document.querySelector('.track-details h1');
const currentTrackArtist = document.querySelector('.track-details p');
const currentTrackImage = document.querySelector('.track-artwork img');
const playPauseBtn = document.querySelector('.play-pause-btn');
const volumeSlider = document.querySelector('.volume-slider');
const recentTracksContainer = document.querySelector('.tracks-grid');
const refreshBtn = document.querySelector('.refresh-btn');
const listenLiveBtn = document.querySelector('.listen-live-btn');
const upcomingContainer = document.querySelector('.upcoming-tracks .container');
const scheduleContainer = document.querySelector('.schedule .container');
const bgCanvas = document.getElementById('bg-canvas');

// Audio Player
const audioPlayer = new Audio(STREAM_URL);
let isPlaying = false;
let currentTrackData = null;
let recentTracks = [];
let isTransitioning = false;
let transitionTimeout = null;

// Animation variables
let particlesArray = [];
let animationId = null;
let ctx;

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing player...');
    initializePlayer();
    updateAllTracks();
    updateMusicNews();
    initializeAnimatedBackground();
    initializeViewControls();
    
    // Start periodic updates
    setInterval(updateAllTracks, 120000); // Update every 2 minutes
    setInterval(updateMusicNews, 300000); // Update news every 5 minutes
    
    // Load saved view mode on page load
    const savedViewMode = localStorage.getItem('trackViewMode') || 'grid';
    const correspondingButton = document.querySelector(`.view-btn[data-view="${savedViewMode}"]`);
    
    if (correspondingButton) {
        correspondingButton.click();
    }
    
    // Add refresh button event listener
    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefresh);
    }
});

playPauseBtn.addEventListener('click', togglePlayPause);
listenLiveBtn.addEventListener('click', togglePlayPause);
volumeSlider.addEventListener('input', updateVolume);

// Add scroll progress indicator
window.addEventListener('scroll', () => {
    const scrollProgress = document.querySelector('.scroll-progress');
    if (!scrollProgress) return;
    
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight - windowHeight;
    const scrolled = window.scrollY;
    const progress = (scrolled / documentHeight) * 100;
    scrollProgress.style.transform = `scaleX(${progress / 100})`;
});

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // Ignore if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    switch (e.key.toLowerCase()) {
        case ' ':  // Spacebar
            e.preventDefault();
            togglePlayPause();
            break;
        case 'g':
            document.querySelector('.view-btn[data-view="grid"]').click();
            break;
        case 'l':
            document.querySelector('.view-btn[data-view="list"]').click();
            break;
        case 'r':
            handleRefresh();
            break;
        case 'arrowup':
            e.preventDefault();
            const newVolume = Math.min(100, parseInt(volumeSlider.value) + 5);
            volumeSlider.value = newVolume;
            updateVolume();
            break;
        case 'arrowdown':
            e.preventDefault();
            const lowerVolume = Math.max(0, parseInt(volumeSlider.value) - 5);
            volumeSlider.value = lowerVolume;
            updateVolume();
            break;
        case 'm':
            volumeSlider.value = volumeSlider.value === '0' ? localStorage.getItem('lastVolume') || '80' : '0';
            if (volumeSlider.value !== '0') {
                localStorage.setItem('lastVolume', volumeSlider.value);
            }
            updateVolume();
            break;
    }
});

// Player Functions
function initializePlayer() {
    // Load saved volume or set default
    const savedVolume = localStorage.getItem('playerVolume') || '80';
    volumeSlider.value = savedVolume;
    audioPlayer.volume = savedVolume / 100;
    updatePlayPauseButton();
    
    // Add event listener for audio transitions
    audioPlayer.addEventListener('play', handleAudioTransition);
}

function togglePlayPause() {
    if (isPlaying) {
        audioPlayer.pause();
    } else {
        audioPlayer.play().catch(error => {
            console.error('Error playing stream:', error);
        });
    }
    isPlaying = !isPlaying;
    updatePlayPauseButton();
}

function updatePlayPauseButton() {
    // Update footer play button
    playPauseBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    playPauseBtn.classList.toggle('playing', isPlaying);
    
    // Update Listen Live button
    listenLiveBtn.innerHTML = isPlaying ? 
        '<i class="fas fa-pause"></i> Pause' : 
        '<i class="fas fa-broadcast-tower"></i> Listen Live';
    listenLiveBtn.classList.toggle('playing', isPlaying);
}

function updateVolume() {
    const volume = volumeSlider.value;
    audioPlayer.volume = volume / 100;
    localStorage.setItem('playerVolume', volume);
    
    // Update the volume slider tooltip
    const volumeControl = document.querySelector('.volume-control');
    let tooltip = volumeControl.querySelector('.volume-tooltip');
    
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'volume-tooltip';
        volumeControl.appendChild(tooltip);
    }
    
    tooltip.textContent = `Volume: ${volume}%`;
    
    // Update volume icon based on level
    const volumeIcon = document.querySelector('.volume-icon');
    if (volumeIcon) {
        volumeIcon.className = 'fas volume-icon ' + 
            (volume == 0 ? 'fa-volume-mute' :
             volume < 30 ? 'fa-volume-off' :
             volume < 70 ? 'fa-volume-down' :
             'fa-volume-up');
    }
}

// Track Management
async function updateAllTracks() {
    try {
        const timestamp = new Date().getTime();
        console.log('Fetching current song...', timestamp);
        
        // Direct API calls without CORS proxy
        const currentResponse = await fetch(`${BASE_URL}/station/${STATION_NAME}/current_song?t=${timestamp}`, {
            mode: 'cors',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!currentResponse.ok) {
            console.error('Current song response not OK:', currentResponse.status);
            throw new Error('Failed to fetch current track');
        }
        
        const currentTrack = await currentResponse.json();
        console.log('Current track data:', currentTrack);

        // Fetch recent tracks
        const recentResponse = await fetch(`${BASE_URL}/station/${STATION_NAME}/last_songs?t=${timestamp}`, {
            mode: 'cors', // Enable CORS
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!recentResponse.ok) throw new Error('Failed to fetch recent tracks');
        const recentTracks = await recentResponse.json();

        // Fetch upcoming tracks
        console.log('Fetching upcoming tracks...');
        const upcomingResponse = await fetch(`${BASE_URL}/station/${STATION_NAME}/next_artists?t=${timestamp}`, {
            mode: 'cors',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (upcomingResponse.ok) {
            const upcomingArtists = await upcomingResponse.json();
            console.log('Upcoming artists:', upcomingArtists);
            displayUpcomingTracks(upcomingArtists);
        } else {
            console.error('Failed to fetch upcoming tracks:', upcomingResponse.status);
            displayUpcomingTracks([]); // Show empty state
        }

        // Update current track display
        if (currentTrack) {
            const trackInfo = {
                title: currentTrack.title || 'Unknown Track',
                artist: currentTrack.artist?.name || currentTrack.artist || 'Unknown Artist',
                image: currentTrack.cover || null,
                started_at: currentTrack.started_at,
                ends_at: currentTrack.ends_at,
                length: currentTrack.length
            };
            updateCurrentTrack(trackInfo);
        }

        // Display recent tracks
        if (Array.isArray(recentTracks)) {
            displayRecentTracks(recentTracks.map(track => ({
                title: track.title || track.name || 'Unknown Track',
                artist: track.artist?.name || track.artist || 'Unknown Artist',
                image: track.cover || track.artist?.image || track.artist?.thumb || null,
                startedAt: track.started_at || track.startedAt
            })));
        }

        // Update document title
        if (currentTrack) {
            document.title = `${currentTrack.title || currentTrack.name || 'Unknown Track'} - ${currentTrack.artist?.name || currentTrack.artist || 'Unknown Artist'} | Super Radio`;
        }

        // Fetch schedule information
        const currentShow = await getCurrentShow();
        const upcomingShows = await getUpcomingShows();
        displayScheduleInfo(currentShow, upcomingShows);

        // Fetch listener count
        const listenerCount = await getListenerCount();
        if (listenerCount !== null) {
            updateListenerCount(listenerCount);
        }

    } catch (error) {
        console.error('Error updating tracks:', error);
        
        // Detailed error logging
        console.warn('Unable to fetch track information. Check network connection or API availability.');
        console.warn('Error details:', error.message);
        
        const fallbackTrack = {
            title: 'Live Stream',
            artist: 'Super Radio',
            image: DEFAULT_TRACK_IMAGE
        };
        updateCurrentTrack(fallbackTrack);
        displayRecentTracks([fallbackTrack]);
        displayUpcomingTracks([]); // Show empty state for upcoming tracks
    }
}

function updateTrackArtwork(imageElement, imageUrl) {
    if (!imageElement) return;

    const artworkContainer = imageElement.parentElement;
    if (!artworkContainer) return;

    // Add loading state
    artworkContainer.classList.add('loading');

    // Get or create default cover
    let defaultCover = artworkContainer.querySelector('.default-cover');
    if (!defaultCover) {
        defaultCover = document.createElement('div');
        defaultCover.className = 'default-cover';
        const musicWave = document.createElement('div');
        musicWave.className = 'music-wave';
        for (let i = 0; i < 5; i++) {
            musicWave.appendChild(document.createElement('span'));
        }
        defaultCover.appendChild(musicWave);
        artworkContainer.appendChild(defaultCover);
    }

    // Function to show default animated cover
    const showDefaultCover = () => {
        imageElement.style.display = 'none';
        imageElement.classList.remove('visible');
        defaultCover.style.display = 'flex';
        artworkContainer.classList.add('no-cover');
        artworkContainer.classList.remove('loading');
    };

    // Function to show actual image
    const showActualCover = (url) => {
        imageElement.src = url;
        imageElement.style.display = 'block';
        imageElement.classList.add('visible');
        defaultCover.style.display = 'none';
        artworkContainer.classList.remove('no-cover', 'loading');
    };

    // If no image URL or it's null/empty, show animated cover
    if (!imageUrl) {
        showDefaultCover();
        return;
    }

    // Test if the image URL is valid
    const testImage = new Image();
    testImage.onload = () => showActualCover(imageUrl);
    testImage.onerror = () => showDefaultCover();
    testImage.src = imageUrl;
}

let progressInterval;

function formatTime(seconds, isCountdown = false) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    if (isCountdown) {
        return `-${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function updateTrackProgress(track) {
    const progressBar = document.querySelector('.progress');
    const currentTimeSpan = document.querySelector('.current-time');
    const durationSpan = document.querySelector('.duration');
    
    if (!progressBar || !currentTimeSpan || !durationSpan || !track.started_at || !track.ends_at) {
        console.warn('Missing elements or track timing info');
        return;
    }
    
    // Clear any existing interval
    if (window.progressInterval) {
        clearInterval(window.progressInterval);
    }
    
    const startTime = new Date(track.started_at);
    const endTime = new Date(track.ends_at);
    const totalDuration = (endTime - startTime) / 1000; // Duration in seconds
    
    function updateProgress() {
        const now = new Date();
        const elapsed = Math.max(0, (now - startTime) / 1000);
        const remaining = Math.max(0, totalDuration - elapsed);
        
        // Update progress bar width
        const progress = Math.min(100, (elapsed / totalDuration) * 100);
        progressBar.style.width = `${progress}%`;
        
        // Update time displays
        currentTimeSpan.textContent = formatTime(remaining, true); // Countdown with minus sign
        durationSpan.textContent = formatTime(totalDuration); // Total duration
        
        // If track has ended, clear interval and refresh
        if (elapsed >= totalDuration) {
            clearInterval(window.progressInterval);
            setTimeout(updateAllTracks, 2000);
        }
    }
    
    // Update immediately and then every second
    updateProgress();
    window.progressInterval = setInterval(updateProgress, 1000);
}

async function updateCurrentTrack(track) {
    try {
        // Store current track
        currentTrackData = track;
        
        // Update main track display
        const mainTitle = document.querySelector('.hero .track-title');
        const mainArtist = document.querySelector('.hero .track-artist');
        const mainImage = document.querySelector('.hero .track-img');
        
        // Update player bar
        const playerTitle = document.querySelector('.player-bar .track-title');
        const playerArtist = document.querySelector('.player-bar .track-artist');
        const playerImage = document.querySelector('.player-bar .track-img');
        
        // Set titles and artists
        const title = track.title || 'Unknown Track';
        const artist = track.artist?.name || track.artist || 'Unknown Artist';
        
        if (mainTitle) mainTitle.textContent = title;
        if (mainArtist) mainArtist.textContent = artist;
        if (playerTitle) playerTitle.textContent = title;
        if (playerArtist) playerArtist.textContent = artist;

        // Try to get Spotify image
        let imageUrl = null;
        if (title !== 'Unknown Track' && artist !== 'Unknown Artist') {
            imageUrl = await getTrackImage(title, artist);
        }
        
        // Fallback to provided image or default
        imageUrl = imageUrl || track.cover || track.artist?.image || track.artist?.thumb || DEFAULT_TRACK_IMAGE;

        // Update images
        if (mainImage) updateTrackArtwork(mainImage, imageUrl);
        if (playerImage) updateTrackArtwork(playerImage, imageUrl);
        
        // Update progress bar with track timing information
        if (track.started_at && track.ends_at) {
            updateTrackProgress(track);
        }
        
        // Update document title
        document.title = `${title} - ${artist} | Super Radio`;

    } catch (error) {
        console.error('Error updating current track:', error);
        // Use fallback display in case of error
        const fallbackTrack = {
            title: track.title || 'Live Stream',
            artist: track.artist?.name || 'Super Radio',
            image: DEFAULT_TRACK_IMAGE
        };
        
        // Recursively call with fallback but without Spotify integration
        updateCurrentTrack(fallbackTrack);
    }
}

function getRelativeTimeString(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
        return 'Just now';
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    return date.toLocaleTimeString();
}

async function displayRecentTracks(tracks) {
    const container = document.querySelector('.tracks-grid');
    if (!container) return;
    
    // Fade out current tracks
    container.style.opacity = '0';
    
    try {
        // Limit to 8 tracks
        const recentTracks = tracks.slice(0, 10);
        
        // Create track elements with loading state
        const trackElements = await Promise.all(recentTracks.map(async track => {
            const trackElement = document.createElement('div');
            trackElement.className = 'track-item';
            
            const artwork = document.createElement('div');
            artwork.className = 'track-artwork';
            
            const img = document.createElement('img');
            img.className = 'track-img';
            img.alt = `${track.title} by ${track.artist}`;
            
            const defaultCover = document.createElement('div');
            defaultCover.className = 'default-cover';
            defaultCover.innerHTML = `
                <div class="music-wave">
                    <span></span><span></span><span></span>
                    <span></span><span></span>
                </div>
            `;
            
            artwork.appendChild(img);
            artwork.appendChild(defaultCover);
            
            const info = document.createElement('div');
            info.className = 'track-info';
            info.innerHTML = `
                <div class="track-title">${track.title}</div>
                <div class="track-artist">${track.artist}</div>
                <div class="track-time">${formatTimestamp(track.startedAt)}</div>
            `;
            
            trackElement.appendChild(artwork);
            trackElement.appendChild(info);
            
            // Try to get Spotify image
            try {
                const spotifyImage = await getTrackImage(track.title, track.artist);
                if (spotifyImage) {
                    img.src = spotifyImage;
                    img.onload = () => {
                        img.classList.add('visible');
                        defaultCover.style.display = 'none';
                    };
                } else {
                    // Fallback to provided image or default
                    const fallbackImage = track.cover || track.artist?.image || track.artist?.thumb || DEFAULT_TRACK_IMAGE;
                    updateTrackArtwork(img, fallbackImage);
                }
            } catch (error) {
                console.warn('Error getting Spotify image:', error);
                // Use fallback image
                const fallbackImage = track.cover || track.artist?.image || track.artist?.thumb || DEFAULT_TRACK_IMAGE;
                updateTrackArtwork(img, fallbackImage);
            }
            
            return trackElement;
        }));
        
        // Clear and update container
        container.innerHTML = '';
        trackElements.forEach(element => container.appendChild(element));
        
        // Fade in new tracks
        setTimeout(() => {
            container.style.opacity = '1';
        }, 300);
        
    } catch (error) {
        console.error('Error displaying recent tracks:', error);
        // Show error state or fallback
        container.innerHTML = '<div class="error-message">Could not load recent tracks</div>';
        container.style.opacity = '1';
    }
}

async function handleRefresh() {
    const btn = document.querySelector('.refresh-btn');
    
    if (btn) {
        // Add rotating animation
        btn.classList.add('rotating');
        
        // Update tracks
        await updateAllTracks();
        
        // Remove animation after 1 second
        setTimeout(() => {
            btn.classList.remove('rotating');
        }, 1000);
    }
}

// Error Handling
audioPlayer.addEventListener('error', (e) => {
    console.error('Audio player error:', e);
    isPlaying = false;
    updatePlayPauseButton();
});

// Handle network status changes
window.addEventListener('online', () => {
    console.log('Connection restored, attempting to resume playback...');
    if (isPlaying) {
        audioPlayer.play().catch(console.error);
    }
});

window.addEventListener('offline', () => {
    console.log('Connection lost, pausing playback...');
    audioPlayer.pause();
    isPlaying = false;
    updatePlayPauseButton();
});

async function updateMusicNews() {
    try {
        const newsItems = await fetchNuNLNews();
        displayNews(newsItems.slice(0, 6)); // Display exactly 5 news items
    } catch (error) {
        console.error('Error updating music news:', error);
    }
}

async function fetchNuNLNews() {
    try {
        // Use a CORS proxy to fetch the RSS feed
        const response = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.nu.nl/rss/muziek'));
        if (!response.ok) return [];
        
        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        const items = xmlDoc.querySelectorAll('item');
        
        return Array.from(items).map(item => {
            // Extract the image URL from the enclosure or media:content if available
            let imageUrl = DEFAULT_TRACK_IMAGE;
            
            // Try to get image from enclosure
            const enclosure = item.querySelector('enclosure');
            if (enclosure && enclosure.getAttribute('type')?.startsWith('image/')) {
                imageUrl = enclosure.getAttribute('url');
            }
            
            // If no enclosure, try to get from media:content
            if (imageUrl === DEFAULT_TRACK_IMAGE) {
                const mediaContent = item.querySelector('media\\:content, content');
                if (mediaContent && mediaContent.getAttribute('type')?.startsWith('image/')) {
                    imageUrl = mediaContent.getAttribute('url');
                }
            }
            
            // If still no image, try to get from description
            if (imageUrl === DEFAULT_TRACK_IMAGE) {
                const content = item.querySelector('description')?.textContent || '';
                const imgMatch = content.match(/src="([^"]+)"/);
                if (imgMatch) {
                    imageUrl = imgMatch[1];
                }
                
                // Check for copyright photo tag
                const copyrightMatch = content.match(/copyright photo: ([^<]+)/);
                if (copyrightMatch) {
                    imageUrl = copyrightMatch[1];
                }
            }

            // Clean up the content by removing HTML tags
            const content = item.querySelector('description')?.textContent || '';
            const cleanContent = content
                .replace(/<[^>]+>/g, '') // Remove HTML tags
                .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
                .replace(/copyright photo: [^<]+/g, '') // Remove copyright photo text
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
        console.error('Error fetching NU.nl news:', error);
        return [];
    }
}

function displayNews(newsItems) {
    const newsContainer = document.querySelector('.news-grid');
    if (!newsContainer) {
        console.warn('News container not found');
        return;
    }
    
    // Fade out current news
    newsContainer.style.opacity = '0';
    
    setTimeout(() => {
        const newsHTML = newsItems.map(news => {
            // Format the date in Dutch
            const formattedDate = news.date.toLocaleDateString('nl-NL', {
                day: 'numeric',
                month: 'short'
            }).toUpperCase();
            
            // Truncate content if it's too long
            const maxLength = 120;
            const truncatedContent = news.content.length > maxLength ? 
                news.content.substring(0, maxLength) + '...' : 
                news.content;
            
            return `
                <article class="news-item" onclick="window.open('${news.url}', '_blank')">
                    <img class="news-image" src="${news.image}" alt="${news.title}"
                         onerror="this.src='${DEFAULT_TRACK_IMAGE}'">
                    <div class="news-content">
                        <div class="news-date">${formattedDate}</div>
                        <h3 class="news-title">${news.title}</h3>
                        <p class="news-excerpt">${truncatedContent}</p>
                        <div class="news-source">
                            <i class="fas fa-arrow-right"></i>
                            <span>Lees artikel</span>
                        </div>
                    </div>
                </article>
            `;
        }).join('');
        
        newsContainer.innerHTML = newsHTML;
        
        // Fade in new news
        setTimeout(() => {
            newsContainer.style.opacity = '1';
        }, 50);
    }, 300);
}

// Track View Toggle
document.addEventListener('DOMContentLoaded', () => {
    const viewToggleButtons = document.querySelectorAll('.view-btn');
    const tracksContainer = document.querySelector('.tracks-container');
    
    // Set initial view mode
    const savedViewMode = localStorage.getItem('trackViewMode') || 'grid';
    if (tracksContainer) {
        tracksContainer.className = `tracks-container ${savedViewMode}-view`;
        // Set active button
        viewToggleButtons.forEach(btn => {
            if (btn.dataset.view === savedViewMode) {
                btn.classList.add('active');
            }
        });
    }
    
    // View toggle event listeners
    viewToggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const viewMode = button.dataset.view;
            
            // Remove active class from all buttons
            viewToggleButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            button.classList.add('active');
            
            // Update view with animation
            if (tracksContainer) {
                tracksContainer.style.opacity = '0';
                setTimeout(() => {
                    tracksContainer.className = `tracks-container ${viewMode}-view`;
                    tracksContainer.style.opacity = '1';
                }, 300);
            }
            
            // Save preference
            localStorage.setItem('trackViewMode', viewMode);
        });
    });
});

async function displayUpcomingTracks(upcomingArtists) {
    if (!upcomingContainer) return;
    
    console.log('Upcoming artists data:', upcomingArtists);
    
    // Clear existing content with fade
    upcomingContainer.style.opacity = '0';
    
    // Wait for fade out
    setTimeout(async () => {
        try {
            // Clear container
            upcomingContainer.innerHTML = '';
            
            // Create header
            const header = document.createElement('div');
            header.className = 'section-header';
            header.innerHTML = '<h2>Coming Up Next</h2>';
            upcomingContainer.appendChild(header);
            
            // Create tracks container
            const tracksContainer = document.createElement('div');
            tracksContainer.className = 'upcoming-tracks-container';
            
            if (Array.isArray(upcomingArtists) && upcomingArtists.length > 0) {
                // Process artists in parallel
                const artistElements = await Promise.all(upcomingArtists.map(async (item, index) => {
                    if (!item.artist || !item.artist.name) return null;
                    
                    const artistName = item.artist.name;
                    // Skip if it's the station name
                    if (artistName.toLowerCase().includes('super-radio')) return null;
                    
                    const trackElement = document.createElement('div');
                    trackElement.className = 'upcoming-track-item';
                    
                    // Try to get artist image from Spotify
                    let artistImage = null;
                    try {
                        const token = await getSpotifyAccessToken();
                        if (token) {
                            const response = await fetch(
                                `${SPOTIFY_API_URL}/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${token}`
                                    }
                                }
                            );
                            
                            if (response.ok) {
                                const data = await response.json();
                                if (data.artists?.items?.[0]?.images?.[0]?.url) {
                                    artistImage = data.artists.items[0].images[0].url;
                                }
                            }
                        }
                    } catch (error) {
                        console.warn('Failed to fetch artist image from Spotify:', error);
                    }
                    
                    // Fallback to provided image or default
                    artistImage = artistImage || item.artist.image || item.artist.thumb || DEFAULT_TRACK_IMAGE;
                    
                    trackElement.innerHTML = `
                        <div class="track-artwork">
                            <img src="${artistImage}" alt="${artistName}" onerror="this.style.display='none';this.parentElement.classList.add('no-cover')">
                            <div class="music-wave">
                                <span></span>
                                <span></span>
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                        <div class="track-item-info">
                            <div class="track-item-artist">${artistName}</div>
                            <div class="track-item-time">Coming up ${index === 0 ? 'next' : `#${index + 1}`}</div>
                        </div>
                    `;
                    
                    return trackElement;
                }));
                
                // Add valid elements to container
                artistElements
                    .filter(element => element !== null)
                    .forEach(element => tracksContainer.appendChild(element));
                
            } else {
                // Show message when no upcoming tracks
                const noTracksElement = document.createElement('div');
                noTracksElement.className = 'no-upcoming-tracks';
                noTracksElement.innerHTML = `
                    <div class="track-artwork no-cover">
                        <div class="music-wave">
                            <span></span>
                            <span></span>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                    <p>No upcoming tracks information available</p>
                `;
                tracksContainer.appendChild(noTracksElement);
            }
            
            upcomingContainer.appendChild(tracksContainer);
            
        } catch (error) {
            console.error('Error displaying upcoming tracks:', error);
            upcomingContainer.innerHTML = `
                <div class="section-header">
                    <h2>Coming Up Next</h2>
                </div>
                <div class="error-message">Could not load upcoming tracks</div>
            `;
        }
        
        // Fade back in
        setTimeout(() => {
            upcomingContainer.style.opacity = '1';
        }, 50);
    }, 300);
}

// Schedule Management
async function getCurrentShow() {
    try {
        const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/schedule`);
        if (!response.ok) throw new Error('Failed to fetch schedule');
        
        const schedule = await response.json();
        const now = new Date();
        const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
        const hour = now.getHours();
        const minutes = now.getMinutes();
        const currentTimeInMinutes = hour * 60 + minutes;

        // Find current show
        const currentShow = schedule.find(show => {
            const showStartMinutes = show.hour * 60;
            const showEndMinutes = show.end_time * 60;
            
            // Handle shows that span across midnight
            if (show.hour > show.end_time) {
                // Show runs past midnight
                if (show.day === day) {
                    // Current day's show that started before midnight
                    return hour >= show.hour || hour < show.end_time;
                } else {
                    // Previous day's show running into current day
                    const prevDay = new Date(now);
                    prevDay.setDate(prevDay.getDate() - 1);
                    const prevDayName = prevDay.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
                    
                    if (show.day === prevDayName && hour < show.end_time) {
                        return true;
                    }
                }
            } else {
                // Normal show within same day
                return show.day === day && hour >= show.hour && hour < show.end_time;
            }
            return false;
        });

        return currentShow;
    } catch (error) {
        console.error('Error fetching current show:', error);
        return null;
    }
}

async function getUpcomingShows() {
    try {
        const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/schedule`);
        if (!response.ok) throw new Error('Failed to fetch schedule');
        
        const schedule = await response.json();
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinutes;
        const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
        
        // Get shows for today and tomorrow
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDay = tomorrow.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
        
        const relevantShows = schedule.filter(show => 
            show.day === day || show.day === tomorrowDay
        );
        
        // Sort shows by time, handling midnight crossing
        relevantShows.sort((a, b) => {
            const aTime = a.hour * 60;
            const bTime = b.hour * 60;
            
            // Convert to comparable times
            let aAdjusted = aTime;
            let bAdjusted = bTime;
            
            // If show starts today but we're past its start time, add 24 hours
            if (a.day === day && aTime < currentTimeInMinutes) {
                aAdjusted += 24 * 60;
            }
            if (b.day === day && bTime < currentTimeInMinutes) {
                bAdjusted += 24 * 60;
            }
            
            // If show is tomorrow, add 24 hours
            if (a.day === tomorrowDay) {
                aAdjusted += 24 * 60;
            }
            if (b.day === tomorrowDay) {
                bAdjusted += 24 * 60;
            }
            
            return aAdjusted - bAdjusted;
        });
        
        // Filter to get only upcoming shows
        const upcomingShows = relevantShows.filter(show => {
            const showStartMinutes = show.hour * 60;
            
            if (show.day === day) {
                // Today's shows
                if (show.hour > show.end_time) {
                    // Show crosses midnight
                    return currentHour < show.hour;
                } else {
                    return showStartMinutes > currentTimeInMinutes;
                }
            } else if (show.day === tomorrowDay) {
                // Tomorrow's shows
                return true;
            }
            return false;
        });
        
        // Return next 3 upcoming shows
        return upcomingShows.slice(0, 3);
        
    } catch (error) {
        console.error('Error fetching upcoming shows:', error);
        return [];
    }
}

async function getShowPlaylists() {
    try {
        const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/playlists`);
        if (!response.ok) throw new Error('Failed to fetch playlists');
        return await response.json();
    } catch (error) {
        console.error('Error fetching playlists:', error);
        return [];
    }
}

function displayScheduleInfo(currentShow, upcomingShows) {
    if (!scheduleContainer) return;
    
    // Clear existing content with fade
    scheduleContainer.style.opacity = '0';
    
    setTimeout(async () => {
        // Clear container
        scheduleContainer.innerHTML = '';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = '<h2>Radio Programma</h2>';
        scheduleContainer.appendChild(header);
        
        // Create schedule container
        const scheduleContent = document.createElement('div');
        scheduleContent.className = 'schedule-container';
        
        // Add current show if available
        if (currentShow) {
            const currentShowElement = document.createElement('div');
            currentShowElement.className = 'current-show';
            currentShowElement.innerHTML = `
                <div class="show-badge">
                    <div class="pulse"></div>
                    On Air
                </div>
                <div class="show-info">
                    <h3>${currentShow.name}</h3>
                    <div class="show-time">
                        <i class="far fa-clock"></i>
                        ${formatShowTime(currentShow.hour, currentShow.end_time)}
                    </div>
                    <div class="show-details">
                        <div class="playlist-info">
                            <i class="fas fa-broadcast-tower"></i>
                            Live Radio Show
                        </div>
                    </div>
                </div>
                <div class="show-progress">
                    <div class="progress-bar" style="width: ${calculateShowProgress(currentShow)}%"></div>
                </div>
            `;
            scheduleContent.appendChild(currentShowElement);
        }
        
        // Add upcoming shows
        if (upcomingShows.length > 0) {
            const upcomingShowsContainer = document.createElement('div');
            upcomingShowsContainer.className = 'upcoming-shows';
            
            for (const show of upcomingShows) {
                const showElement = document.createElement('div');
                showElement.className = 'show-item';
                showElement.style.borderLeft = `4px solid ${show.color || '#6C63FF'}`;
                showElement.innerHTML = `
                    <div class="show-header">
                        <h4>${show.name}</h4>
                        <span class="show-time">
                            <i class="far fa-clock"></i>
                            ${formatShowTime(show.hour, show.end_time)}
                            <span class="time-until"></span>
                        </span>
                    </div>
                    <div class="show-details">
                        <div class="playlist-info">
                            <i class="fas fa-broadcast-tower"></i>
                            Live Radio Show
                        </div>
                    </div>
                `;
                upcomingShowsContainer.appendChild(showElement);
            }
            
            scheduleContent.appendChild(upcomingShowsContainer);
        }
        
        scheduleContainer.appendChild(scheduleContent);
        
        // Update time-until for all shows
        updateTimeUntil();
        
        // Fade back in
        setTimeout(() => {
            scheduleContainer.style.opacity = '1';
        }, 50);
    }, 300);
}

function formatShowTime(startHour, endHour) {
    const formatHour = (hour) => {
        return `${hour.toString().padStart(2, '0')}:00`;
    };
    
    return `${formatHour(startHour)} - ${formatHour(endHour)}`;
}

function capitalizeFirstLetter(string) {
    const days = {
        'sun': 'Zondag',
        'mon': 'Maandag',
        'tue': 'Dinsdag',
        'wed': 'Woensdag',
        'thu': 'Donderdag',
        'fri': 'Vrijdag',
        'sat': 'Zaterdag'
    };
    return days[string] || string;
}

async function getListenerCount() {
    try {
        const now = new Date();
        const timestamp = now.getTime();
        
        // Check if we have a recent cached total (less than 5 minutes old)
        const cachedCount = localStorage.getItem('lastListenerCount');
        const lastUpdate = localStorage.getItem('lastListenerUpdate');
        const weatherSeed = localStorage.getItem('weatherSeed');
        const lastWeatherUpdate = localStorage.getItem('lastWeatherUpdate');
        
        // If we have a recent cache (less than 5 minutes old), use it
        if (cachedCount && lastUpdate && (timestamp - parseInt(lastUpdate)) < 300000) {
            // Add tiny fluctuation (-1, 0, or +1) only every 30 seconds
            const halfMinuteBlock = Math.floor(timestamp / 30000);
            const lastHalfMinuteBlock = localStorage.getItem('lastFluctuationBlock');
            
            if (lastHalfMinuteBlock && halfMinuteBlock === parseInt(lastHalfMinuteBlock)) {
                return parseInt(cachedCount);
            }
            
            // Store current block
            localStorage.setItem('lastFluctuationBlock', halfMinuteBlock);
            
            // Consistent fluctuation based on timestamp
            const fluctuation = Math.round(Math.sin(halfMinuteBlock) * 1);
            return parseInt(cachedCount) + fluctuation;
        }
        
        // Try to get real listener count
        const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/listeners`);
        if (!response.ok) throw new Error('Failed to fetch listener count');
        const realCount = await response.json();
        
        // Get current date/time info
        const hour = now.getHours();
        const minute = now.getMinutes();
        const day = now.getDay();
        const month = now.getMonth();
        const date = now.getDate();
        
        // Base engagement (max 50 listeners)
        let baseEngagement = 3; // Lower base count from 5 to 3
        
        // Detailed time-based patterns (reduced numbers)
        const timePatterns = {
            nightOwl: hour >= 0 && hour < 5 ? 1 : 0,      // Night owls
            earlyBird: hour >= 5 && hour < 7 ? 1 : 0,     // Early birds reduced from 2
            morningRush: hour >= 7 && hour < 9 ? 3 : 0,   // Morning commute reduced from 4
            morningWork: hour >= 9 && hour < 12 ? 2 : 0,  // Morning work reduced from 3
            lunchBreak: hour >= 12 && hour < 14 ? 3 : 0,  // Lunch break peak reduced from 4
            afternoon: hour >= 14 && hour < 16 ? 2 : 0,   // Afternoon work reduced from 3
            eveningRush: hour >= 16 && hour < 19 ? 3 : 0, // Evening commute/dinner reduced from 5
            primeTime: hour >= 19 && hour < 23 ? 4 : 0,   // Prime time reduced from 6
            lateNight: hour >= 23 ? 1 : 0                 // Late night reduced from 2
        };
        
        // Apply the most relevant time pattern
        baseEngagement += Object.values(timePatterns).find(value => value > 0) || 0;
        
        // Minute-based micro-patterns (reduced adjustments)
        if (minute >= 55 || minute <= 5) {  // Hour transitions
            baseEngagement += 1;  // People checking new programs
        } else if (minute >= 25 && minute <= 35) {  // Mid-hour peaks
            baseEngagement += 1;
        }
        
        // Day of week factors (reduced multipliers)
        const dayFactors = {
            weekend: (day === 0 || day === 6) ? 1.15 : 1,    // 15% boost on weekends
            friday: day === 5 ? 1.1 : 1,                     // 10% boost on Fridays
            monday: day === 1 ? 0.95 : 1,                    // 5% reduction on Mondays
            wednesday: day === 3 ? 1.05 : 1                  // 5% boost on Wednesdays
        };
        
        // Apply day factors
        const dayMultiplier = Object.values(dayFactors).reduce((acc, val) => acc * val, 1);
        baseEngagement = Math.round(baseEngagement * dayMultiplier);
        
        // Seasonal patterns (reduced multipliers)
        const seasonalFactors = {
            winter: (month === 11 || month === 0 || month === 1) ? 1.1 : 1,    // 10% boost in winter
            summer: (month >= 6 && month <= 8) ? 0.9 : 1,                      // 10% reduction in summer
            spring: (month >= 2 && month <= 4) ? 1.05 : 1,                     // 5% boost in spring
            autumn: (month >= 9 && month <= 10) ? 1.1 : 1                      // 10% boost in autumn
        };
        
        // Apply seasonal factors
        const seasonMultiplier = Object.values(seasonalFactors).reduce((acc, val) => acc * val, 1);
        baseEngagement = Math.round(baseEngagement * seasonMultiplier);
        
        // Special events and holidays (reduced multipliers)
        const specialEvents = [
            // Dutch holidays
            { month: 11, day: 25, multiplier: 1.2, name: 'Christmas' },           // Christmas
            { month: 11, day: 26, multiplier: 1.15, name: 'Boxing Day' },         // Boxing Day
            { month: 11, day: 31, multiplier: 1.25, name: 'New Years Eve' },      // New Year's Eve
            { month: 3, day: 27, multiplier: 1.1, name: 'Easter' },               // Easter (approximate)
            { month: 4, day: 27, multiplier: 1.2, name: 'Kings Day' },            // King's Day
            { month: 11, day: 5, multiplier: 1.15, name: 'Sinterklaas' },         // Sinterklaas
            // Summer events
            { month: 6, day: 21, multiplier: 1.1, name: 'Summer Solstice' },      // Summer Solstice
            { month: 7, day: 15, multiplier: 1.05, name: 'Summer Vacation' },     // Mid-summer
            // Special music days
            { month: 5, day: 21, multiplier: 1.15, name: 'World Music Day' },     // World Music Day
            { month: 9, day: 13, multiplier: 1.1, name: 'Positive Music Day' }    // Positive Music Day
        ];
        
        // Check for special events (with date range support)
        const specialEventMultiplier = specialEvents.reduce((acc, event) => {
            // Check if current date matches event
            if (month === event.month && Math.abs(date - event.day) <= 1) { // Include day before/after
                const proximity = 1 - Math.abs(date - event.day) * 0.1; // Reduced effect on adjacent days
                return acc * (1 + (event.multiplier - 1) * proximity);
            }
            return acc;
        }, 1);
        
        baseEngagement = Math.round(baseEngagement * specialEventMultiplier);
        
        // Weather simulation (reduced effects, stable for 1 hour)
        const hourBlock = Math.floor(timestamp / 3600000); // Current hour block
        
        let currentWeatherEffect;
        if (weatherSeed && lastWeatherUpdate && hourBlock === parseInt(lastWeatherUpdate)) {
            // Use cached weather
            currentWeatherEffect = parseFloat(weatherSeed);
        } else {
            // Generate new weather (stable for this hour)
            const hourSeed = Math.sin(hourBlock) * 10000;
            const weatherRand = Math.abs((hourSeed - Math.floor(hourSeed)));
            
            if (weatherRand < 0.3) currentWeatherEffect = 1.05;      // 30% chance of "rainy" weather (5% boost)
            else if (weatherRand < 0.6) currentWeatherEffect = 0.95; // 30% chance of "sunny" weather (5% reduction)
            else currentWeatherEffect = 1;                           // 40% chance of "normal" weather
            
            // Cache weather
            localStorage.setItem('weatherSeed', currentWeatherEffect);
            localStorage.setItem('lastWeatherUpdate', hourBlock);
        }
        
        baseEngagement = Math.round(baseEngagement * currentWeatherEffect);
        
        // Ensure base engagement never exceeds 50
        baseEngagement = Math.min(baseEngagement, 50);
        
        // Combine real listeners with simulated engagement
        let totalEngagement = Math.max(
            realCount + baseEngagement,
            Math.ceil(baseEngagement * 0.7)  // Lower minimum to 70% of base (was 0.9)
        );
        
        // Final cap at 50 fake listeners
        if (totalEngagement > realCount + 50) {
            totalEngagement = realCount + 50;
        }
        
        // Cache the result
        localStorage.setItem('lastListenerCount', totalEngagement);
        localStorage.setItem('lastListenerUpdate', timestamp);
        
        // Log engagement factors for debugging
        if (process.env.NODE_ENV === 'development') {
            console.debug('Listener Engagement Factors:', {
                realCount,
                baseEngagement,
                timePattern: Object.entries(timePatterns).find(([_, value]) => value > 0)?.[0],
                dayFactors: Object.entries(dayFactors).filter(([_, value]) => value !== 1).map(([key]) => key),
                seasonalFactors: Object.entries(seasonalFactors).filter(([_, value]) => value !== 1).map(([key]) => key),
                specialEvents: specialEvents.filter(event => month === event.month && Math.abs(date - event.day) <= 1).map(e => e.name),
                weather: currentWeatherEffect,
                totalEngagement,
                fakeListeners: totalEngagement - realCount
            });
        }
        
        return totalEngagement;
        
    } catch (error) {
        console.warn('Error fetching listener count:', error);
        
        // Use cached value if available
        const cachedCount = localStorage.getItem('lastListenerCount');
        if (cachedCount) {
            return parseInt(cachedCount);
        }
        
        // Final fallback with stable number
        const hour = new Date().getHours();
        const isPeakTime = hour >= 7 && hour <= 22;
        const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18);
        
        return Math.min(50, 5 + 
               (isPeakTime ? 2 : 0) + 
               (isRushHour ? 1 : 0));
    }
}

function updateListenerCount(count) {
    const liveBadge = document.querySelector('.live-badge');
    if (!liveBadge) return;

    // Create or update listener count element
    let listenerElement = liveBadge.querySelector('.listener-count');
    if (!listenerElement) {
        listenerElement = document.createElement('span');
        listenerElement.className = 'listener-count';
        liveBadge.appendChild(listenerElement);
    }

    // Update the count with animation
    listenerElement.style.opacity = '0';
    setTimeout(() => {
        listenerElement.textContent = `${count} ${count === 1 ? 'luisteraar' : 'luisteraars'}`;
        listenerElement.style.opacity = '1';
    }, 300);
}

function calculateShowProgress(show) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    
    const totalShowMinutes = (show.end_time - show.hour) * 60;
    const elapsedMinutes = ((currentHour - show.hour) * 60) + currentMinutes;
    
    return Math.min(100, Math.max(0, (elapsedMinutes / totalShowMinutes) * 100));
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Zojuist';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m geleden`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}u geleden`;
    return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Update time until next shows
function updateTimeUntil() {
    const now = new Date();
    const timeUntilElements = document.querySelectorAll('.time-until');
    
    timeUntilElements.forEach((element) => {
        const showTimeText = element.closest('.show-time').textContent;
        const timeMatch = showTimeText.match(/(\d{2}):(\d{2})/);
        if (!timeMatch) return;
        
        const [hours, minutes] = timeMatch.slice(1).map(Number);
        
        let showDate = new Date();
        showDate.setHours(hours, minutes, 0);
        
        // Als de showtijd eerder is dan nu, is het voor morgen
        if (showDate < now) {
            showDate.setDate(showDate.getDate() + 1);
        }
        
        const timeDiff = showDate - now;
        const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutesUntil = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        
        // Nederlandse tijdweergave
        let timeText;
        if (hoursUntil === 0) {
            if (minutesUntil === 1) {
                timeText = `(begint over 1 minuut)`;
            } else {
                timeText = `(begint over ${minutesUntil} minuten)`;
            }
        } else if (hoursUntil === 1) {
            if (minutesUntil === 0) {
                timeText = `(begint over 1 uur)`;
            } else if (minutesUntil === 1) {
                timeText = `(begint over 1 uur en 1 minuut)`;
            } else {
                timeText = `(begint over 1 uur en ${minutesUntil} minuten)`;
            }
        } else {
            if (minutesUntil === 0) {
                timeText = `(begint over ${hoursUntil} uur)`;
            } else if (minutesUntil === 1) {
                timeText = `(begint over ${hoursUntil} uur en 1 minuut)`;
            } else {
                timeText = `(begint over ${hoursUntil} uur en ${minutesUntil} minuten)`;
            }
        }
        
        element.textContent = ` ${timeText}`;
    });
}

// Update tijden elke minuut
updateTimeUntil();
setInterval(updateTimeUntil, 60000);

// Spotify Authentication and Track Functions
async function getSpotifyAccessToken() {
    if (spotifyAccessToken && tokenExpirationTime && Date.now() < tokenExpirationTime) {
        return spotifyAccessToken;
    }

    try {
        const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET)
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            throw new Error('Failed to get Spotify access token');
        }

        const data = await response.json();
        spotifyAccessToken = data.access_token;
        tokenExpirationTime = Date.now() + (data.expires_in * 1000);
        return spotifyAccessToken;
    } catch (error) {
        console.error('Error getting Spotify access token:', error);
        return null;
    }
}

async function getTrackImage(title, artist) {
    if (!title || !artist || artist === 'Unknown Artist' || title === 'Unknown Track') {
        return null;
    }

    try {
        const token = await getSpotifyAccessToken();
        if (!token) return null;

        // Clean up the title and artist strings
        title = title.replace(/\+$/, '').trim();
        artist = artist.replace(/^super(-|\s)?radio$/i, '').trim();

        // Search for the track on Spotify
        const searchResponse = await fetch(
            `${SPOTIFY_API_URL}/search?q=${encodeURIComponent(title + ' ' + artist)}&type=track&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (!searchResponse.ok) {
            throw new Error('Failed to search Spotify');
        }

        const searchData = await searchResponse.json();
        const track = searchData.tracks?.items?.[0];

        if (track?.album?.images?.[0]?.url) {
            return track.album.images[0].url;
        }

        // If no track found, try searching for the artist
        const artistSearchResponse = await fetch(
            `${SPOTIFY_API_URL}/search?q=${encodeURIComponent(artist)}&type=artist&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (!artistSearchResponse.ok) {
            throw new Error('Failed to search Spotify for artist');
        }

        const artistData = await artistSearchResponse.json();
        const artistImages = artistData.artists?.items?.[0]?.images;

        if (artistImages?.[0]?.url) {
            return artistImages[0].url;
        }

        return null;
    } catch (error) {
        console.error('Error fetching track image from Spotify:', error);
        return null;
    }
}

// Mobile Menu Toggle
const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const mobileMenu = document.querySelector('.mobile-menu');

if (mobileMenuToggle && mobileMenu) {
    mobileMenuToggle.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!mobileMenu.contains(e.target) && e.target !== mobileMenuToggle) {
            mobileMenu.classList.remove('active');
        }
    });
}

// Day Selector
const dayButtons = document.querySelectorAll('.day-btn');
if (dayButtons.length) {
    dayButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            dayButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            
            // Here you would load schedule data for the selected day
            // For demonstration purposes, we'll just show a console log
            console.log(`Selected day: ${btn.textContent}`);
        });
    });
}

// Share Button
const shareBtn = document.querySelector('.share-btn');
if (shareBtn) {
    shareBtn.addEventListener('click', () => {
        // Get current track info
        const trackTitle = document.querySelector('.track-title').textContent;
        const trackArtist = document.querySelector('.track-artist').textContent;
        
        // Create share text
        const shareText = `Ik luister nu naar ${trackTitle} van ${trackArtist} op Super Radio!`;
        
        // Check if Web Share API is available
        if (navigator.share) {
            navigator.share({
                title: 'Super Radio',
                text: shareText,
                url: window.location.href
            })
            .then(() => showNotification('Gedeeld!'))
            .catch(err => console.error('Delen mislukt:', err));
        } else {
            // Fallback - copy to clipboard
            navigator.clipboard.writeText(shareText)
                .then(() => showNotification('Link gekopieerd naar klembord!'))
                .catch(err => console.error('Kopiëren mislukt:', err));
        }
    });
}

// Info Button
const infoBtn = document.querySelector('.info-btn');
if (infoBtn) {
    infoBtn.addEventListener('click', () => {
        // Here you would show track details, lyrics, etc.
        showNotification('Trackinformatie komt binnenkort!');
    });
}

// Simple notification system
function showNotification(message) {
    // Check if notification container exists, create if not
    let notificationContainer = document.querySelector('.notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.className = 'notification-container';
        document.body.appendChild(notificationContainer);
        
        // Add CSS for notifications
        const style = document.createElement('style');
        style.textContent = `
            .notification-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
            }
            
            .notification {
                background: rgba(24, 24, 24, 0.9);
                color: white;
                padding: 12px 20px;
                margin-bottom: 10px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                transform: translateX(100%);
                animation: slideIn 0.3s forwards, fadeOut 0.5s 2.5s forwards;
                backdrop-filter: blur(5px);
                border-left: 3px solid var(--primary);
                font-weight: 500;
            }
            
            @keyframes slideIn {
                to { transform: translateX(0); }
            }
            
            @keyframes fadeOut {
                to { opacity: 0; transform: translateX(100%); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Create and add notification
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notificationContainer.appendChild(notification);
    
    // Remove notification after animation
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Enhanced visual effects
document.addEventListener('DOMContentLoaded', () => {
    // Enhanced audio visualizer effect
    const trackArtwork = document.querySelector('.hero .track-artwork');
    const audioVisualizer = document.querySelector('.audio-visualizer');
    const glowRing = document.querySelector('.glow-ring');
    
    if (trackArtwork) {
        // Make bars visible but at a low opacity by default
        if (audioVisualizer) {
            audioVisualizer.style.opacity = '0.3';
            
            // Animate the bars dynamically
            const bars = audioVisualizer.querySelectorAll('.bar');
            bars.forEach((bar, index) => {
                // Random initial height between 20% and 60%
                bar.style.height = Math.floor(20 + Math.random() * 40) + '%';
            });
        }
        
        // Add 3D rotation effect on mouse move
        trackArtwork.addEventListener('mousemove', (e) => {
            const rect = trackArtwork.getBoundingClientRect();
            const x = e.clientX - rect.left; // x position within the element
            const y = e.clientY - rect.top;  // y position within the element
            
            // Calculate rotation based on mouse position
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateY = (x - centerX) / 15; // Adjust divisor for rotation intensity
            const rotateX = (centerY - y) / 15;
            
            // Apply the transform
            trackArtwork.style.transform = `perspective(1000px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(1.05)`;
            
            // Make visualizer more visible on hover
            if (audioVisualizer) {
                audioVisualizer.style.opacity = '1';
            }
            
            // Show glow ring
            if (glowRing) {
                glowRing.style.opacity = '1';
            }
            
            // Make the bars react to mouse position
            if (audioVisualizer) {
                const bars = audioVisualizer.querySelectorAll('.bar');
                const angle = Math.atan2(y - centerY, x - centerX);
                const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                const normalizedDistance = Math.min(1, distance / (rect.width / 2));
                
                bars.forEach((bar, index) => {
                    const barAngle = (index / bars.length) * Math.PI * 2;
                    const angleDiff = Math.abs(angle - barAngle) % (Math.PI * 2);
                    const effectiveAngleDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
                    const angleEffect = 1 - (effectiveAngleDiff / Math.PI);
                    
                    const height = 40 + (normalizedDistance * 40) + (angleEffect * 20);
                    bar.style.height = `${height}%`;
                    
                    // Add subtle color change based on position
                    const hue = (index * 5) % 30; // Subtle hue variation
                    bar.style.background = `linear-gradient(to top, hsl(${hue}, 100%, 50%), transparent)`;
                    
                    // Add glow intensity based on position
                    const glowIntensity = 5 + (angleEffect * 15);
                    bar.style.filter = `drop-shadow(0 0 ${glowIntensity}px var(--primary))`;
                });
            }
        });
        
        // Reset on mouse leave
        trackArtwork.addEventListener('mouseleave', () => {
            trackArtwork.style.transform = '';
            
            // Reduce visualizer opacity
            if (audioVisualizer) {
                audioVisualizer.style.opacity = '0.3';
                
                // Reset bars
                const bars = audioVisualizer.querySelectorAll('.bar');
                bars.forEach((bar) => {
                    bar.style.height = Math.floor(20 + Math.random() * 40) + '%';
                    bar.style.background = 'linear-gradient(to top, var(--primary), transparent)';
                    bar.style.filter = 'drop-shadow(0 0 8px var(--primary))';
                });
            }
            
            // Hide glow ring
            if (glowRing) {
                glowRing.style.opacity = '0';
            }
        });
    }
    
    // Add parallax effect to hero background
    const hero = document.querySelector('.hero');
    if (hero) {
        window.addEventListener('scroll', () => {
            const scrollPos = window.scrollY;
            const soundWaves = document.querySelector('.sound-waves');
            if (soundWaves) {
                soundWaves.style.transform = `translateY(${scrollPos * 0.2}px)`;
                soundWaves.style.opacity = Math.max(0.2 - (scrollPos * 0.001), 0);
            }
        });
    }
    
    // Add dynamic hover effect to track items
    const trackItems = document.querySelectorAll('.track-item');
    trackItems.forEach((item, index) => {
        item.addEventListener('mouseenter', () => {
            // Create an effect with slight delay based on index
            item.style.transitionDelay = `${index * 0.03}s`;
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.transitionDelay = '0s';
        });
    });
    
    // Simulate audio activity in the visualizer
    function simulateAudioActivity() {
        if (audioVisualizer && audioVisualizer.style.opacity < '0.5') {
            const bars = audioVisualizer.querySelectorAll('.bar');
            bars.forEach((bar) => {
                const height = 20 + Math.random() * 40;
                bar.style.height = `${height}%`;
            });
        }
        
        // Schedule next update
        setTimeout(simulateAudioActivity, 150 + Math.random() * 250);
    }
    
    // Start simulation
    simulateAudioActivity();
});

// Favorites Management
function toggleFavorite(trackData) {
    const trackId = `${trackData.title}-${trackData.artist}`;
    const existingIndex = favoriteTracks.findIndex(track => 
        `${track.title}-${track.artist}` === trackId
    );
    
    if (existingIndex > -1) {
        // Remove from favorites
        favoriteTracks.splice(existingIndex, 1);
        showNotification('Verwijderd uit favorieten');
    } else {
        // Add to favorites
        favoriteTracks.push(trackData);
        showNotification('Toegevoegd aan favorieten');
    }
    
    // Save to localStorage
    localStorage.setItem('favoriteTracks', JSON.stringify(favoriteTracks));
    
    // Update UI
    renderFavorites();
    updateTrackHeartIcons();
}

function renderFavorites() {
    if (!favoritesGrid) return;
    
    if (favoriteTracks.length === 0) {
        if (emptyFavorites) emptyFavorites.style.display = 'flex';
        favoritesGrid.innerHTML = '';
        return;
    }
    
    if (emptyFavorites) emptyFavorites.style.display = 'none';
    
    favoritesGrid.innerHTML = favoriteTracks.map(track => createTrackItem(track, true)).join('');
    
    // Add event listeners to the newly created favorite track items
    document.querySelectorAll('.favorites-grid .track-item').forEach(item => {
        const heartIcon = item.querySelector('.heart-icon');
        if (heartIcon) {
            heartIcon.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const trackData = JSON.parse(item.dataset.track);
                toggleFavorite(trackData);
            });
        }
    });
}

function updateTrackHeartIcons() {
    document.querySelectorAll('.track-item').forEach(item => {
        const trackData = JSON.parse(item.dataset.track);
        const trackId = `${trackData.title}-${trackData.artist}`;
        const heartIcon = item.querySelector('.heart-icon');
        
        const isFavorite = favoriteTracks.some(track => 
            `${track.title}-${track.artist}` === trackId
        );
        
        if (heartIcon) {
            heartIcon.className = isFavorite ? 
                'heart-icon fas fa-heart favorited' : 
                'heart-icon far fa-heart';
        }
    });
}

function toggleFavoritesVisibility() {
    const favoritesSection = document.querySelector('.favorites-section');
    if (!favoritesSection) return;
    
    favoritesSection.classList.toggle('hidden');
    favoritesToggleBtn.classList.toggle('active');
    
    // Save preference
    const isHidden = favoritesSection.classList.contains('hidden');
    localStorage.setItem('hideFavorites', isHidden);
}

// Smooth Transitions
function handleAudioTransition() {
    if (isTransitioning) return;
    
    isTransitioning = true;
    
    // Apply visual transition effect
    const trackArtwork = document.querySelector('.hero .track-artwork');
    const trackInfo = document.querySelector('.hero .track-info');
    
    if (trackArtwork) trackArtwork.classList.add('transitioning');
    if (trackInfo) trackInfo.classList.add('transitioning');
    
    // Trigger particles explosion
    triggerParticlesExplosion();
    
    // Remove transition class after animation completes
    clearTimeout(transitionTimeout);
    transitionTimeout = setTimeout(() => {
        if (trackArtwork) trackArtwork.classList.remove('transitioning');
        if (trackInfo) trackInfo.classList.remove('transitioning');
        isTransitioning = false;
    }, 1500);
}

// Animated Background
function initializeAnimatedBackground() {
    if (!bgCanvas) return;
    
    ctx = bgCanvas.getContext('2d');
    
    // Set canvas size
    resizeCanvas();
    
    // Handle window resize
    window.addEventListener('resize', resizeCanvas);
    
    // Initialize particles
    createParticles();
    
    // Start animation
    animate();
    
    // Add audio listener for reactive animations
    audioPlayer.addEventListener('play', enhanceParticles);
}

function resizeCanvas() {
    if (!bgCanvas) return;
    
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
}

function createParticles() {
    particlesArray = [];
    
    const numberOfParticles = Math.floor(window.innerWidth * window.innerHeight / 15000);
    
    for (let i = 0; i < numberOfParticles; i++) {
        const size = Math.random() * 5 + 1;
        const x = Math.random() * bgCanvas.width;
        const y = Math.random() * bgCanvas.height;
        const directionX = Math.random() * 1 - 0.5;
        const directionY = Math.random() * 1 - 0.5;
        const color = getRandomColor();
        
        particlesArray.push(new Particle(x, y, directionX, directionY, size, color));
    }
}

function getRandomColor() {
    const colors = [
        '#E6282B', // Primary
        '#CF322D', // Darker Primary
        '#FF5253', // Lighter Primary
        '#6C63FF', // Purple
        '#00D1FF', // Cyan
        '#FFFFFF'  // White (rarely)
    ];
    
    // Bias toward primary color
    if (Math.random() < 0.6) {
        return colors[0];
    }
    
    return colors[Math.floor(Math.random() * colors.length)];
}

function enhanceParticles() {
    // Add a burst of new particles when music plays
    for (let i = 0; i < 20; i++) {
        const size = Math.random() * 8 + 2;
        const x = Math.random() * bgCanvas.width;
        const y = Math.random() * bgCanvas.height;
        const directionX = Math.random() * 3 - 1.5;
        const directionY = Math.random() * 3 - 1.5;
        const color = getRandomColor();
        
        particlesArray.push(new Particle(x, y, directionX, directionY, size, color));
    }
    
    // After a while, return to normal
    setTimeout(() => {
        if (particlesArray.length > 100) {
            particlesArray = particlesArray.slice(0, 100);
        }
    }, 5000);
}

function triggerParticlesExplosion() {
    const centerX = bgCanvas.width / 2;
    const centerY = bgCanvas.height / 2;
    
    for (let i = 0; i < 50; i++) {
        const size = Math.random() * 6 + 2;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        const directionX = Math.cos(angle) * speed;
        const directionY = Math.sin(angle) * speed;
        const color = getRandomColor();
        
        particlesArray.push(new Particle(centerX, centerY, directionX, directionY, size, color));
    }
}

function animate() {
    if (!ctx || !bgCanvas) return;
    
    ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    
    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
        particlesArray[i].draw();
    }
    
    // Connect close particles with lines
    connectParticles();
    
    animationId = requestAnimationFrame(animate);
}

function connectParticles() {
    for (let a = 0; a < particlesArray.length; a++) {
        for (let b = a; b < particlesArray.length; b++) {
            const dx = particlesArray[a].x - particlesArray[b].x;
            const dy = particlesArray[a].y - particlesArray[b].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 100) {
                ctx.beginPath();
                ctx.strokeStyle = particlesArray[a].color;
                ctx.globalAlpha = 1 - (distance / 100);
                ctx.lineWidth = 0.5;
                ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
                ctx.stroke();
                ctx.closePath();
                ctx.globalAlpha = 1;
            }
        }
    }
}

// Particle Class
class Particle {
    constructor(x, y, directionX, directionY, size, color) {
        this.x = x;
        this.y = y;
        this.directionX = directionX;
        this.directionY = directionY;
        this.size = size;
        this.color = color;
    }
    
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }
    
    update() {
        // Bounce off edges
        if (this.x > bgCanvas.width || this.x < 0) {
            this.directionX = -this.directionX;
        }
        
        if (this.y > bgCanvas.height || this.y < 0) {
            this.directionY = -this.directionY;
        }
        
        // Add some random movement
        if (Math.random() < 0.01) {
            this.directionX += (Math.random() - 0.5) * 0.2;
            this.directionY += (Math.random() - 0.5) * 0.2;
        }
        
        // Move particle
        this.x += this.directionX;
        this.y += this.directionY;
        
        // Draw
        this.draw();
    }
}

// Update track item creation - remove favorites functionality
function createTrackItem(track, isFavoriteSection = false) {
    const { title, artist, image, timestamp, info, genre = "SOUL MOTOWN AND DANCE CLASSICS" } = track;
    
    // Format time
    const formattedTime = formatTimeAgo(timestamp);
    
    return `
    <div class="track-item" data-track='${JSON.stringify(track)}'>
        <div class="track-artwork">
            <img src="${image}" alt="${title} by ${artist}" loading="lazy">
            <div class="track-overlay">
                <div class="track-actions">
                    <button class="play-icon">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="info-icon">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="track-info">
            <div class="track-title-artist">
                <h3 class="track-title">${title}</h3>
                <p class="track-artist">${artist}</p>
            </div>
            <div class="track-genre">${genre}</div>
            <span class="track-time">${formattedTime}</span>
        </div>
    </div>
    `;
}

// Track Management
async function updateTracks() {
    try {
        const tracks = await fetchRecentTracks();
        if (!tracks || !tracks.length) return;
        
        // Update recent tracks list
        recentTracks = tracks;
        
        // Update tracks display
        if (recentTracksContainer) {
            recentTracksContainer.innerHTML = tracks.map(track => createTrackItem(track)).join('');
            
            // Track item click plays current stream
            document.querySelectorAll('.tracks-grid .track-item').forEach(item => {
                // Track item click plays current stream
                item.addEventListener('click', function() {
                    if (!isPlaying) {
                        togglePlayPause();
                    }
                    
                    // Transition effect
                    handleAudioTransition();
                });
            });
        }
    } catch (error) {
        console.error('Error updating tracks:', error);
    }
}

// View Controls
function initializeViewControls() {
    const viewButtons = document.querySelectorAll('.view-btn');
    const tracksGrid = document.querySelector('.tracks-grid');
    
    // Set event listeners for view toggles
    viewButtons.forEach(button => {
        button.addEventListener('click', () => {
            const viewMode = button.dataset.view;
            
            // Update active state
            viewButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Save preference
            localStorage.setItem('trackViewMode', viewMode);
            
            // Apply view mode
            if (viewMode === 'grid') {
                tracksGrid.classList.remove('list-view');
                tracksGrid.classList.add('grid-view');
            } else {
                tracksGrid.classList.remove('grid-view');
                tracksGrid.classList.add('list-view');
            }
        });
    });
}


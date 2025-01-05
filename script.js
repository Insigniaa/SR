// Constants
const STATION_NAME = 'super-radio';
const BASE_URL = 'https://api.laut.fm';
const STREAM_URL = `https://stream.laut.fm/${STATION_NAME}`;

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

const LASTFM_API_KEY = '6356e58cb76c89948047da715c61c707';
const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
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
const scheduleContainer = document.querySelector('.radio-schedule .container');

// Audio Player
const audioPlayer = new Audio(STREAM_URL);
let isPlaying = false;

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing player...');
    initializePlayer();
    updateAllTracks();
    updateMusicNews();
    
    // Start periodic updates
    setInterval(updateAllTracks, 120000); // Update every 2 minutes
    setInterval(updateMusicNews, 300000); // Update news every 5 minutes
    
    // Load saved view mode on page load
    const savedViewMode = localStorage.getItem('trackViewMode') || 'grid';
    const correspondingButton = document.querySelector(`.view-btn[data-view="${savedViewMode}"]`);
    
    if (correspondingButton) {
        correspondingButton.click();
    }
});

playPauseBtn.addEventListener('click', togglePlayPause);
listenLiveBtn.addEventListener('click', togglePlayPause);
volumeSlider.addEventListener('input', updateVolume);
refreshBtn.addEventListener('click', handleRefresh);

// Add scroll progress indicator
window.addEventListener('scroll', () => {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight - windowHeight;
    const scrolled = window.scrollY;
    const progress = (scrolled / documentHeight) * 100;
    scrollProgress.style.transform = `scaleX(${progress / 100})`;
});

// Player Functions
function initializePlayer() {
    // Load saved volume or set default
    const savedVolume = localStorage.getItem('playerVolume') || '80';
    volumeSlider.value = savedVolume;
    audioPlayer.volume = savedVolume / 100;
    updatePlayPauseButton();
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
    
    // Update the volume slider gradient
    volumeSlider.style.setProperty('--volume-percentage', `${volume}%`);
    
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
        const timestamp = new Date().getTime(); // Add timestamp for cache busting
        console.log('Fetching current song...', timestamp);
        
        // Direct API calls without CORS proxy
        const currentResponse = await fetch(`${BASE_URL}/station/${STATION_NAME}/current_song?t=${timestamp}`, {
            mode: 'cors', // Enable CORS
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
            console.log('Updating current track display...');
            // Extract track information more carefully
            const trackInfo = {
                title: currentTrack.title || currentTrack.name || 'Unknown Track',
                artist: currentTrack.artist?.name || currentTrack.artist || 'Unknown Artist',
                image: currentTrack.cover || currentTrack.artist?.image || currentTrack.artist?.thumb || null,
                startedAt: currentTrack.started_at || currentTrack.startedAt,
                endsAt: currentTrack.ends_at || currentTrack.endsAt
            };
            console.log('Track info:', trackInfo);
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

async function getTrackImage(title, artist) {
    if (!LASTFM_API_KEY) return null;
    
    // Clean up the title and artist strings
    title = title.replace(/\+$/, '').trim();
    artist = artist.replace(/^super(-|\s)?radio$/i, '').trim();
    
    // Handle special cases
    if (!artist || !title || artist === 'Unknown Artist' || title === 'Unknown Track') {
        return null;
    }
    
    try {
        // Try to get track info first
        const response = await fetch(
            `${LASTFM_BASE_URL}?method=track.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`
        );
        
        if (response.ok) {
            const data = await response.json();
            if (data.track?.album?.image) {
                const largeImage = data.track.album.image.find(img => img.size === 'extralarge');
                if (largeImage && largeImage['#text']) {
                    return largeImage['#text'];
                }
            }
        }
        
        // If no track image, try artist image
        const artistResponse = await fetch(
            `${LASTFM_BASE_URL}?method=artist.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&format=json`
        );
        
        if (artistResponse.ok) {
            const artistData = await artistResponse.json();
            if (artistData.artist?.image) {
                const largeImage = artistData.artist.image.find(img => img.size === 'extralarge');
                if (largeImage && largeImage['#text']) {
                    return largeImage['#text'];
                }
            }
        }
        
        // If no images found, return null to use default cover
        return null;
    } catch (error) {
        console.error('Error fetching track image:', error);
        return null;
    }
}

function updateTrackArtwork(imageElement, imageUrl) {
    if (!imageElement) return;

    const artworkContainer = imageElement.parentElement;
    if (!artworkContainer) return;

    // Create music wave elements if they don't exist
    if (!artworkContainer.querySelector('.music-wave')) {
        const musicWave = document.createElement('div');
        musicWave.className = 'music-wave';
        for (let i = 0; i < 5; i++) {
            musicWave.appendChild(document.createElement('span'));
        }
        artworkContainer.appendChild(musicWave);
    }

    // Function to show default animated cover
    const showDefaultCover = () => {
        imageElement.style.display = 'none';
        artworkContainer.classList.add('no-cover');
    };

    // Function to show actual image
    const showActualCover = (url) => {
        imageElement.src = url;
        imageElement.style.display = 'block';
        artworkContainer.classList.remove('no-cover');
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

function updateTrackProgress(track) {
    // Clear any existing interval
    if (progressInterval) {
        clearInterval(progressInterval);
    }

    const progressBar = document.querySelector('.track-progress-bar');
    const timeRemaining = document.querySelector('.time-remaining span');
    const duration = document.querySelector('.duration');
    
    if (!progressBar || !timeRemaining || !track.started_at || !track.ends_at) {
        console.warn('Missing required elements or track timing info for progress update');
        return;
    }

    const startTime = new Date(track.started_at).getTime();
    const endTime = new Date(track.ends_at).getTime();
    const totalDuration = (endTime - startTime) / 1000; // Total duration in seconds

    // Format and display total duration
    if (duration) {
        const minutes = Math.floor(totalDuration / 60);
        const seconds = Math.floor(totalDuration % 60);
        duration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    const updateProgress = () => {
        const now = new Date().getTime();
        const elapsed = Math.max(0, (now - startTime) / 1000); // Elapsed time in seconds
        const remaining = Math.max(0, (endTime - now) / 1000); // Remaining time in seconds
        
        // Calculate progress percentage
        const progress = Math.min(100, (elapsed / totalDuration) * 100);
        
        // Update progress bar with smooth animation
        progressBar.style.width = `${progress}%`;
        
        // Update time remaining with icon
        const remainingMinutes = Math.floor(remaining / 60);
        const remainingSeconds = Math.floor(remaining % 60);
        timeRemaining.textContent = `${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        
        // Update time remaining color based on time left
        const timeRemainingContainer = timeRemaining.parentElement;
        if (timeRemainingContainer) {
            if (remaining < 30) { // Less than 30 seconds
                timeRemainingContainer.style.color = 'var(--error-color)';
            } else if (remaining < 60) { // Less than 1 minute
                timeRemainingContainer.style.color = 'var(--warning-color)';
            } else {
                timeRemainingContainer.style.color = ''; // Reset to default
            }
        }
        
        // If track has ended, clear interval
        if (now >= endTime) {
            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            timeRemaining.textContent = '0:00';
            // Trigger a refresh after track ends
            setTimeout(handleRefresh, 2000);
        }
    };

    // Update immediately and then every second
    updateProgress();
    progressInterval = setInterval(updateProgress, 1000);
}

async function updateCurrentTrack(track) {
    console.log('Updating DOM with track:', track);
    
    try {
        // Get track image from Last.fm
        const trackImage = await getTrackImage(track.title, track.artist);
        
        // Update main track image
        if (currentTrackImage) {
            updateTrackArtwork(currentTrackImage, trackImage);
        }

        // Update player bar image
        const playerTrackImg = document.querySelector('.current-track-img');
        if (playerTrackImg) {
            updateTrackArtwork(playerTrackImg, trackImage);
        }

        // Update with fade transition
        const updateElement = (element, content, property = 'textContent') => {
            element.style.opacity = '0';
            setTimeout(() => {
                element[property] = content;
                element.style.opacity = '1';
            }, 300);
        };

        // Update main track info with fade
        if (currentTrackTitle) {
            updateElement(currentTrackTitle, track.title);
        }
        
        if (currentTrackArtist) {
            updateElement(currentTrackArtist, track.artist);
        }

        // Update hero background with blur transition
        const heroBackground = document.querySelector('.hero-background');
        if (heroBackground) {
            heroBackground.style.opacity = '0';
            heroBackground.style.transform = 'scale(1.1)';
            
            setTimeout(() => {
                heroBackground.style.backgroundImage = `url('${trackImage}')`;
                
                setTimeout(() => {
                    heroBackground.style.opacity = '1';
                    heroBackground.style.transform = 'scale(1.05)';
                }, 50);
            }, 300);
        }

        // Update player bar info with fade
        const playerTrackTitle = document.querySelector('.track-info .track-title');
        const playerTrackArtist = document.querySelector('.track-info .track-artist');

        if (playerTrackTitle) updateElement(playerTrackTitle, track.title);
        if (playerTrackArtist) updateElement(playerTrackArtist, track.artist);

        // Update progress tracking
        if (track.startedAt && track.endsAt) {
            const trackLength = Math.floor((new Date(track.endsAt) - new Date(track.startedAt)) / 1000);
            updateTrackProgress({
                started_at: track.startedAt,
                ends_at: track.endsAt,
                length: trackLength
            });
        } else {
            console.warn('Missing timing information for track:', track);
        }

    } catch (error) {
        console.error('Error updating track display:', error);
        // Show default cover in case of error
        if (currentTrackImage) {
            updateTrackArtwork(currentTrackImage, '');
        }
        if (progressInterval) {
            clearInterval(progressInterval);
        }
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
    if (!recentTracksContainer) return;
    
    // Clear existing tracks with fade
    recentTracksContainer.style.opacity = '0';
    
    // Wait for fade out
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Get current view mode
    const currentViewMode = localStorage.getItem('trackViewMode') || 'grid';
    recentTracksContainer.className = `tracks-container ${currentViewMode}-view`;
    
    // Clear container
    recentTracksContainer.innerHTML = '';
    
    // Create and append track elements
    for (const track of tracks.slice(0, 8)) {
        const startTime = track.startedAt ? getRelativeTimeString(new Date(track.startedAt)) : '';
        const trackImage = await getTrackImage(track.title, track.artist);
        
        const trackElement = document.createElement('div');
        trackElement.className = 'track-item';
        
        trackElement.innerHTML = `
            <div class="track-artwork no-cover">
                <img src="" alt="${track.title}" style="display: none;">
                <div class="music-wave">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
            <div class="track-item-info">
                <div class="track-item-title">${track.title}</div>
                <div class="track-item-artist">${track.artist}</div>
                ${startTime ? `<div class="track-item-time">${startTime}</div>` : ''}
            </div>
        `;
        
        // Append the track element first
        recentTracksContainer.appendChild(trackElement);
        
        // Then update its artwork
        const imgElement = trackElement.querySelector('.track-artwork img');
        if (imgElement && trackImage) {
            updateTrackArtwork(imgElement, trackImage);
        }
    }
    
    // Fade tracks back in
    setTimeout(() => {
        recentTracksContainer.style.opacity = '1';
    }, 50);
}

async function handleRefresh() {
    const btn = document.querySelector('.refresh-btn');
    btn.classList.add('rotating');
    await updateAllTracks();
    setTimeout(() => btn.classList.remove('rotating'), 1000);
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
        displayNews(newsItems.slice(0, 5)); // Display exactly 5 news items
    } catch (error) {
        console.error('Error updating music news:', error);
    }
}

async function fetchNuNLNews() {
    try {
        // Use a CORS proxy to fetch the RSS feed
        const response = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.nu.nl/rss/Achterklap'));
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
                source: 'NU.nl Achterklap',
                url: item.querySelector('link')?.textContent || '#'
            };
        });
    } catch (error) {
        console.error('Error fetching NU.nl news:', error);
        return [];
    }
}

function displayNews(newsItems) {
    if (!newsContainer) return;
    
    // Fade out current news
    newsContainer.style.opacity = '0';
    
    setTimeout(() => {
        const newsHTML = newsItems.map(news => `
            <article class="news-item" onclick="window.open('${news.url}', '_blank')">
                <img class="news-image" src="${news.image}" alt="${news.title}"
                     onerror="this.src='${DEFAULT_TRACK_IMAGE}'">
                <div class="news-content">
                    <div class="news-date">${news.date.toLocaleDateString('nl-NL', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })}</div>
                    <h3 class="news-title">${news.title}</h3>
                    <p class="news-excerpt">${news.content}</p>
                    <div class="news-source">
                        <i class="fas fa-external-link-alt"></i>
                        ${news.source}
                    </div>
                </div>
            </article>
        `).join('');
        
        newsContainer.innerHTML = newsHTML;
        
        // Fade in new news
        setTimeout(() => {
            newsContainer.style.opacity = '1';
        }, 50);
    }, 300);
}

// Track View Toggle
const tracksContainer = document.querySelector('.tracks-container');
const viewToggleButtons = document.querySelectorAll('.view-btn');

// Enhance view toggle transition
function updateViewMode(mode) {
    const container = document.querySelector('.tracks-container');
    if (!container) return;

    container.style.opacity = '0';
    setTimeout(() => {
        container.className = `tracks-container ${mode}-view`;
        container.style.opacity = '1';
    }, 300);
}

// Update view toggle event listeners
viewToggleButtons.forEach(button => {
    button.addEventListener('click', () => {
        viewToggleButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        const viewMode = button.dataset.view;
        updateViewMode(viewMode);
        localStorage.setItem('trackViewMode', viewMode);
    });
});

function displayUpcomingTracks(upcomingArtists) {
    if (!upcomingContainer) return;
    
    console.log('Upcoming artists data:', upcomingArtists);
    
    // Clear existing content with fade
    upcomingContainer.style.opacity = '0';
    
    // Wait for fade out
    setTimeout(() => {
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
            upcomingArtists.forEach(async (item, index) => {
                if (!item.artist || !item.artist.name) return;
                
                const artistName = item.artist.name;
                // Skip if it's the station name
                if (artistName.toLowerCase().includes('super-radio')) return;
                
                const trackElement = document.createElement('div');
                trackElement.className = 'upcoming-track-item';
                
                // Try to get artist image from Last.fm
                let artistImage = null;
                try {
                    const response = await fetch(
                        `${LASTFM_BASE_URL}?method=artist.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artistName)}&format=json`
                    );
                    if (response.ok) {
                        const data = await response.json();
                        if (data.artist && data.artist.image) {
                            const largeImage = data.artist.image.find(img => img.size === 'large');
                            if (largeImage && largeImage['#text']) {
                                artistImage = largeImage['#text'];
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Failed to fetch artist image:', error);
                }
                
                trackElement.innerHTML = `
                    <div class="track-artwork no-cover">
                        <img src="" alt="${artistName}" style="display: none;">
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
                
                tracksContainer.appendChild(trackElement);
                
                // Update artwork after element is added to DOM
                const imgElement = trackElement.querySelector('.track-artwork img');
                if (imgElement) {
                    updateTrackArtwork(imgElement, artistImage);
                }
            });
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
        
        // Fade back in
        setTimeout(() => {
            upcomingContainer.style.opacity = '1';
        }, 50);
    }, 300);
}

// Schedule Management
async function getCurrentShow() {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
    const hour = now.getHours();

    try {
        const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/schedule`);
        if (!response.ok) throw new Error('Failed to fetch schedule');
        
        const schedule = await response.json();
        
        // Find current show
        const currentShow = schedule.find(show => 
            show.day === day && 
            hour >= show.hour && 
            hour < show.end_time
        );

        return currentShow;
    } catch (error) {
        console.error('Error fetching schedule:', error);
        return null;
    }
}

async function getUpcomingShows() {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
    const hour = now.getHours();

    try {
        const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/schedule`);
        if (!response.ok) throw new Error('Failed to fetch schedule');
        
        const schedule = await response.json();
        
        // Get next 3 upcoming shows
        const upcomingShows = schedule
            .filter(show => {
                // If same day, check if it's later
                if (show.day === day) {
                    return show.hour > hour;
                }
                // For different days, we need to determine if it's in the next 7 days
                const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                const currentDayIndex = days.indexOf(day);
                const showDayIndex = days.indexOf(show.day);
                
                // Calculate days until show
                let daysUntil = showDayIndex - currentDayIndex;
                if (daysUntil <= 0) daysUntil += 7;
                
                return daysUntil < 7;
            })
            .sort((a, b) => {
                // Sort by day first
                const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                const currentDayIndex = days.indexOf(day);
                let aDayIndex = days.indexOf(a.day) - currentDayIndex;
                let bDayIndex = days.indexOf(b.day) - currentDayIndex;
                if (aDayIndex <= 0) aDayIndex += 7;
                if (bDayIndex <= 0) bDayIndex += 7;
                
                if (aDayIndex !== bDayIndex) return aDayIndex - bDayIndex;
                
                // If same day, sort by hour
                return a.hour - b.hour;
            })
            .slice(0, 3);

        return upcomingShows;
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
        header.innerHTML = '<h2>Radio Schedule</h2>';
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
                        ${currentShow.shuffled ? `
                            <div class="playlist-info">
                                <i class="fas fa-random"></i>
                                Shuffle Mode
                            </div>
                        ` : ''}
                        <div class="playlist-info">
                            <i class="fas fa-clock"></i>
                            ${Math.floor(currentShow.length / 60)} hours ${currentShow.length % 60} minutes
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
                showElement.style.borderLeft = `4px solid ${show.color}`;
                showElement.innerHTML = `
                    <div class="show-info">
                        <div class="show-header">
                            <h4>${show.name}</h4>
                            <span class="show-time">
                                <i class="far fa-clock"></i>
                                ${capitalizeFirstLetter(show.day)} ${formatShowTime(show.hour, show.end_time)}
                            </span>
                        </div>
                        <div class="show-details">
                            <div class="playlist-info">
                                <i class="fas fa-broadcast-tower"></i>
                                Live Radio Show
                            </div>
                            ${show.shuffled ? `
                                <div class="playlist-info">
                                    <i class="fas fa-random"></i>
                                    Shuffle Mode
                                </div>
                            ` : ''}
                            <div class="playlist-info">
                                <i class="fas fa-clock"></i>
                                ${Math.floor(show.length / 60)} hours ${show.length % 60} minutes
                            </div>
                        </div>
                    </div>
                `;
                upcomingShowsContainer.appendChild(showElement);
            }
            
            scheduleContent.appendChild(upcomingShowsContainer);
        }
        
        scheduleContainer.appendChild(scheduleContent);
        
        // Fade back in
        setTimeout(() => {
            scheduleContainer.style.opacity = '1';
        }, 50);
    }, 300);
}

function formatShowTime(startHour, endHour) {
    const formatHour = (hour) => {
        const period = hour >= 12 ? 'PM' : 'AM';
        const adjustedHour = hour % 12 || 12;
        return `${adjustedHour}:00 ${period}`;
    };
    
    return `${formatHour(startHour)} - ${formatHour(endHour)}`;
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

async function getListenerCount() {
    try {
        // Try to get real listener count
        const response = await fetch(`${BASE_URL}/station/${STATION_NAME}/listeners`);
        if (!response.ok) throw new Error('Failed to fetch listener count');
        const realCount = await response.json();
        
        // Get current date/time info
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay(); // 0 = Sunday, 6 = Saturday
        const month = now.getMonth();
        
        // Base engagement (much lower)
        let baseEngagement = 5; // Default base (2 + 3 extra)
        
        // Time-based patterns (much lower numbers)
        const timePatterns = {
            earlyMorning: hour >= 5 && hour < 7 ? 1 : 0,     // Early risers
            morningRush: hour >= 7 && hour < 9 ? 2 : 0,      // Morning commute
            workDay: hour >= 9 && hour < 16 ? 1 : 0,         // Work hours
            eveningRush: hour >= 16 && hour < 19 ? 2 : 0,    // Evening commute
            primeTime: hour >= 19 && hour < 23 ? 3 : 0,      // Prime time
            lateNight: hour >= 23 || hour < 5 ? 1 : 0        // Late night
        };
        
        // Apply the most relevant time pattern
        baseEngagement += Object.values(timePatterns).find(value => value > 0) || 0;
        
        // Day of week factors (smaller boosts)
        const dayFactors = {
            weekend: (day === 0 || day === 6) ? 1.2 : 1,     // 20% boost on weekends
            friday: day === 5 ? 1.1 : 1,                     // 10% boost on Fridays
            monday: day === 1 ? 0.9 : 1                      // 10% reduction on Mondays
        };
        
        // Apply day factors
        const dayMultiplier = Object.values(dayFactors).reduce((acc, val) => acc * val, 1);
        baseEngagement = Math.round(baseEngagement * dayMultiplier);
        
        // Seasonal patterns (reduced variations)
        const seasonalFactors = {
            winter: (month === 11 || month === 0 || month === 1) ? 1.1 : 1,   // 10% boost in winter
            summer: (month >= 6 && month <= 8) ? 0.9 : 1                      // 10% reduction in summer
        };
        
        // Apply seasonal factors
        const seasonMultiplier = Object.values(seasonalFactors).reduce((acc, val) => acc * val, 1);
        baseEngagement = Math.round(baseEngagement * seasonMultiplier);
        
        // Random fluctuation (smaller ranges)
        const fluctuation = () => {
            const rand = Math.random();
            if (rand < 0.7) {  // 70% chance of very small change
                return Math.floor(Math.random() * 3) - 1;     // -1 to +1
            } else if (rand < 0.9) {  // 20% chance of small change
                return Math.floor(Math.random() * 3) - 1;     // -1 to +1
            } else {  // 10% chance of medium change
                return Math.floor(Math.random() * 3) - 1;     // -1 to +1
            }
        };
        
        // Special events boost (reduced multipliers)
        const specialEvents = [
            { month: 11, day: 25, multiplier: 1.2 },  // Christmas
            { month: 11, day: 31, multiplier: 1.3 }   // New Year's Eve
        ];
        
        // Check for special events
        const specialEventMultiplier = specialEvents.reduce((acc, event) => {
            if (month === event.month && now.getDate() === event.day) {
                return acc * event.multiplier;
            }
            return acc;
        }, 1);
        
        baseEngagement = Math.round(baseEngagement * specialEventMultiplier);
        
        // Combine real listeners with simulated engagement (keeping stacking)
        const totalEngagement = Math.max(
            realCount + baseEngagement + fluctuation(),
            Math.ceil(baseEngagement * 0.8)  // Never drop below 80% of base
        );
        
        // Cache the result for rapid subsequent calls
        localStorage.setItem('lastListenerCount', totalEngagement);
        localStorage.setItem('lastListenerUpdate', now.getTime());
        
        return totalEngagement;
        
    } catch (error) {
        console.warn('Error fetching listener count:', error);
        
        // Try to use cached value first
        const cachedCount = localStorage.getItem('lastListenerCount');
        const lastUpdate = localStorage.getItem('lastListenerUpdate');
        
        if (cachedCount && lastUpdate && (Date.now() - parseInt(lastUpdate)) < 300000) {
            // Use cached value if less than 5 minutes old with smaller fluctuation
            return parseInt(cachedCount) + Math.floor(Math.random() * 3) - 1;
        }
        
        // Fallback to basic simulation if no cache or cache too old
        const baseCount = 5;  // Base count (2 + 3 extra)
        const hour = new Date().getHours();
        const isPeakTime = hour >= 7 && hour <= 22;
        return baseCount + (isPeakTime ? 2 : 0) + Math.floor(Math.random() * 3) - 1;
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
        listenerElement.textContent = `${count} ${count === 1 ? 'listener' : 'listeners'}`;
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


import { STREAM_URL } from './config.js';

export class SuperAudioPlayer {
    constructor() {
        this.audio = new Audio(STREAM_URL);
        this.isPlaying = false;
        this.volume = parseInt(localStorage.getItem('playerVolume') || '80');

        // Initialize volume
        this.audio.volume = this.volume / 100;

        // Event listeners
        this.audio.addEventListener('play', () => this.handlePlayState(true));
        this.audio.addEventListener('pause', () => this.handlePlayState(false));
        this.audio.addEventListener('error', (e) => this.handleError(e));

        // Network state listeners
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        // Media Session handlers
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.play());
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
            navigator.mediaSession.setActionHandler('stop', () => this.pause());
        }
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error('Error playing stream:', error);
                this.handlePlayState(false);
            });
        }
    }

    pause() {
        this.audio.pause();
    }

    setVolume(value) {
        this.volume = value;
        this.audio.volume = value / 100;
        localStorage.setItem('playerVolume', value);
    }

    handlePlayState(playing) {
        this.isPlaying = playing;
        // Dispatch custom event for UI updates
        window.dispatchEvent(new CustomEvent('playerStateChanged', {
            detail: { isPlaying: this.isPlaying }
        }));

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
        }
    }

    handleError(error) {
        console.error('Audio player error:', error);
        this.isPlaying = false;
        window.dispatchEvent(new CustomEvent('playerError', { detail: { error } }));
    }

    handleOnline() {
        console.log('Connection restored, attempting to resume playback...');
        if (this.isPlaying) {
            this.play();
        }
    }

    handleOffline() {
        console.log('Connection lost, pausing playback...');
        this.pause();
    }
}

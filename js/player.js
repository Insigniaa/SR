/**
 * De audiospeler. Houdt de *intentie* van de gebruiker apart van de feitelijke
 * toestand van het <audio>-element, zodat automatisch herverbinden werkt.
 */

import {
    STREAM_URL, DEFAULT_VOLUME,
    RECONNECT_BASE_MS, RECONNECT_MAX_MS, RECONNECT_MAX_TRIES
} from './config.js';
import { clamp, store } from './utils.js';

const VOLUME_KEY = 'sr.volume';
const MUTED_KEY = 'sr.muted';

export class RadioPlayer extends EventTarget {
    constructor() {
        super();

        /** Wil de gebruiker dat er geluid speelt? Blijft true tijdens herverbinden. */
        this.intent = false;
        this.isPlaying = false;
        this.retries = 0;
        this.retryTimer = null;

        this.volume = clamp(Number(store.get(VOLUME_KEY, DEFAULT_VOLUME)), 0, 100);
        this.muted = Boolean(store.get(MUTED_KEY, false));

        this.audio = new Audio();
        this.audio.preload = 'none';          // niet bufferen tot de gebruiker start
        this.audio.autoplay = false;
        this.audio.volume = this.volume / 100;
        this.audio.muted = this.muted;
        this.audio.src = STREAM_URL;

        this.#bindAudio();
        this.#bindNetwork();
        this.#bindMediaSession();
    }

    /* ----------------------------------------------------------- besturing */

    toggle() {
        if (this.intent) this.pause();
        else this.play();
    }

    play() {
        this.intent = true;
        this.#clearRetry();
        this.#emit('intentchange');

        const attempt = this.audio.play();
        if (attempt) {
            attempt.catch((error) => {
                // NotAllowedError = browser blokkeerde autoplay; dat is geen storing.
                if (error?.name === 'NotAllowedError') {
                    this.intent = false;
                    this.#emit('blocked');
                    this.#emit('intentchange');
                    return;
                }
                this.#scheduleReconnect();
            });
        }
    }

    pause() {
        this.intent = false;
        this.#clearRetry();
        this.audio.pause();
        this.#emit('intentchange');
    }

    /** @param {number} value 0-100 */
    setVolume(value) {
        this.volume = clamp(Math.round(Number(value) || 0), 0, 100);
        this.audio.volume = this.volume / 100;

        if (this.volume > 0 && this.muted) this.setMuted(false);

        store.set(VOLUME_KEY, this.volume);
        this.#emit('volumechange');
    }

    setMuted(value) {
        this.muted = Boolean(value);
        this.audio.muted = this.muted;
        store.set(MUTED_KEY, this.muted);
        this.#emit('volumechange');
    }

    toggleMute() {
        this.setMuted(!this.muted);
    }

    /** Effectief volume voor de UI: 0 als er gedempt is. */
    get effectiveVolume() {
        return this.muted ? 0 : this.volume;
    }

    /* ------------------------------------------------------ media session */

    /** Zet titel, artiest en hoes in de systeembediening en op het lockscreen. */
    setMetadata({ title, artist, image }) {
        if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;

        const artwork = [];
        if (image) {
            artwork.push({ src: image, sizes: '512x512' });   // type weglaten: kan jpeg of png zijn
        }
        artwork.push({ src: 'images/icon-512.png', sizes: '512x512', type: 'image/png' });

        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title || 'Super Radio',
                artist: artist || 'Live',
                album: 'Super Radio',
                artwork
            });
        } catch { /* sommige browsers struikelen over externe artwork-URL's */ }
    }

    /* --------------------------------------------------------------- intern */

    #bindAudio() {
        this.audio.addEventListener('playing', () => {
            this.retries = 0;
            this.#setPlaying(true);
        });

        this.audio.addEventListener('pause', () => this.#setPlaying(false));
        this.audio.addEventListener('waiting', () => this.#emit('buffering'));

        // Een livestream hoort nooit te eindigen: als dat toch gebeurt, is de
        // verbinding weggevallen.
        this.audio.addEventListener('ended', () => this.#scheduleReconnect());
        this.audio.addEventListener('stalled', () => this.#scheduleReconnect());
        this.audio.addEventListener('error', () => this.#scheduleReconnect());
    }

    #bindNetwork() {
        window.addEventListener('online', () => {
            // `intent` overleeft het verbroken netwerk, `isPlaying` niet. Daarom
            // kijken we naar de intentie en niet naar de afspeelstatus.
            if (this.intent) this.#reconnect();
        });

        window.addEventListener('offline', () => {
            this.audio.pause();
            this.#emit('offline');
        });
    }

    #bindMediaSession() {
        if (!('mediaSession' in navigator)) return;

        try {
            navigator.mediaSession.setActionHandler('play', () => this.play());
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
            navigator.mediaSession.setActionHandler('stop', () => this.pause());
        } catch { /* niet elke browser kent elke actie */ }
    }

    #setPlaying(playing) {
        if (this.isPlaying === playing) return;
        this.isPlaying = playing;

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
        }

        this.#emit('statechange');
    }

    /** Nieuwe verbinding opzetten. De cache-buster voorkomt een dode socket. */
    #reconnect() {
        this.#clearRetry();
        if (!this.intent) return;

        const separator = STREAM_URL.includes('?') ? '&' : '?';
        this.audio.src = `${STREAM_URL}${separator}_=${Date.now()}`;
        this.audio.load();

        const attempt = this.audio.play();
        if (attempt) attempt.catch(() => this.#scheduleReconnect());

        this.#emit('reconnecting');
    }

    /** Exponentiële backoff: 1s, 2s, 4s … tot maximaal 30s. */
    #scheduleReconnect() {
        if (!this.intent || this.retryTimer) return;

        if (this.retries >= RECONNECT_MAX_TRIES) {
            this.intent = false;
            this.#emit('failed');
            this.#emit('intentchange');
            return;
        }

        const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.retries, RECONNECT_MAX_MS);
        this.retries += 1;

        this.#emit('reconnecting', { attempt: this.retries, delay });

        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.#reconnect();
        }, delay);
    }

    #clearRetry() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    #emit(type, detail = {}) {
        this.dispatchEvent(new CustomEvent(type, {
            detail: { ...detail, isPlaying: this.isPlaying, intent: this.intent }
        }));
    }
}

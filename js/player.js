/**
 * De audiospeler. Houdt de *intentie* van de gebruiker apart van de feitelijke
 * toestand van het <audio>-element, zodat automatisch herverbinden werkt.
 */

import {
    STREAM_URL, STREAM_DIRECT, DEFAULT_VOLUME,
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

        /* --- audioanalyse ---------------------------------------------------
         * We proberen eerst de directe uitzendhost met crossOrigin: alleen dan
         * mag WebAudio de stream lezen en kan de visualisatie op de echte
         * muziek reageren. Lukt dat niet - ander domein, verhuisde zender -
         * dan valt hij terug op de gewone URL zonder analyse.
         */
        this.streamUrl = STREAM_DIRECT;
        this.corsMode = true;
        this.hasEverPlayed = false;
        this.canAnalyse = false;

        /** Niveaus per frequentieband, 0..1. Gevuld door sample(). */
        this.levels = { bass: 0, mid: 0, high: 0, overall: 0, beat: 0 };

        this.audio = new Audio();
        this.audio.preload = 'none';          // niet bufferen tot de gebruiker start
        this.audio.autoplay = false;
        this.audio.crossOrigin = 'anonymous';
        this.audio.volume = this.volume / 100;
        this.audio.muted = this.muted;
        this.audio.src = this.streamUrl;

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

        // Een lopende slaap-fade afbreken en het volume herstellen.
        if (this.fadeTimer) {
            clearTimeout(this.fadeTimer);
            clearInterval(this.fadeTimer);
            this.fadeTimer = null;
            this.#applyGain();
        }

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

        if (this.volume > 0 && this.muted) this.setMuted(false);
        else this.#applyGain();

        store.set(VOLUME_KEY, this.volume);
        this.#emit('volumechange');
    }

    setMuted(value) {
        this.muted = Boolean(value);
        this.#applyGain();
        store.set(MUTED_KEY, this.muted);
        this.#emit('volumechange');
    }

    /** Zet het volume op de juiste plek: de gain-node, of anders het element. */
    #applyGain() {
        const niveau = this.muted ? 0 : this.volume / 100;

        if (this.gain) {
            // Klein glijpad tegen klikken bij snelle schuifbewegingen.
            const nu = this.audioCtx.currentTime;
            this.gain.gain.cancelScheduledValues(nu);
            this.gain.gain.setTargetAtTime(niveau, nu, 0.02);
            return;
        }

        this.audio.volume = niveau;
        this.audio.muted = this.muted;
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

    /**
     * Zachtjes uitfaden en dan pauzeren. Voor de slaaptimer: abrupt stilvallen
     * is precies wat je niet wil als iemand ligt te doezelen.
     *
     * Het opgeslagen volume blijft ongemoeid; alleen het element wordt
     * geregeld, en na afloop weer teruggezet. Zo start de volgende keer
     * gewoon op het oude niveau.
     *
     * @param {number} seconden duur van de fade
     */
    fadeOutAndPause(seconden = 10) {
        return new Promise((resolve) => {
            if (!this.isPlaying) {
                this.pause();
                resolve();
                return;
            }

            // Met een audiograaf kan de fade in één keer worden ingepland.
            if (this.gain) {
                const nu = this.audioCtx.currentTime;
                this.gain.gain.cancelScheduledValues(nu);
                this.gain.gain.setValueAtTime(this.gain.gain.value, nu);
                this.gain.gain.linearRampToValueAtTime(0.0001, nu + seconden);

                this.fadeTimer = setTimeout(() => {
                    this.fadeTimer = null;
                    this.pause();
                    this.#applyGain();      // terug naar het ingestelde niveau
                    resolve();
                }, seconden * 1000);
                return;
            }

            const start = this.audio.volume;
            const stappen = Math.max(1, Math.round(seconden * 10));
            let stap = 0;

            clearInterval(this.fadeTimer);
            this.fadeTimer = setInterval(() => {
                stap += 1;
                this.audio.volume = Math.max(0, start * (1 - stap / stappen));

                if (stap >= stappen) {
                    clearInterval(this.fadeTimer);
                    this.fadeTimer = null;
                    this.pause();
                    this.audio.volume = this.volume / 100;
                    resolve();
                }
            }, 100);
        });
    }

    /**
     * Geeft de voortgang van het huidige nummer door aan het systeem, zodat
     * het vergrendelscherm en de mediatoetsen een balk laten zien.
     *
     * @param {number} duration totale lengte in seconden
     * @param {number} position verstreken tijd in seconden
     */
    setPosition(duration, position) {
        if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
        if (!Number.isFinite(duration) || duration <= 0) return;

        try {
            navigator.mediaSession.setPositionState({
                duration,
                position: clamp(position, 0, duration),
                playbackRate: 1
            });
        } catch {
            // Sommige browsers weigeren dit voor een livestream; dan gewoon niets.
        }
    }

    /* ------------------------------------------------------ audioanalyse -- */

    /**
     * Zet de WebAudio-keten op zodra er echt geluid is.
     *
     * Mag pas na een gebruikersgebaar en maar één keer per element:
     * createMediaElementSource is onomkeerbaar. Vandaar de vlaggen.
     */
    #setupAnalyser() {
        if (this.analyser || !this.corsMode) return;
        if (!window.AudioContext && !window.webkitAudioContext) return;

        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            const ctx = new Ctx();
            const source = ctx.createMediaElementSource(this.audio);
            const analyser = ctx.createAnalyser();

            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.75;

            const gain = ctx.createGain();

            // De volgorde is niet vrijblijvend: het volume moet ná de analyser
            // zitten. Regelen we het op het <audio>-element zelf, dan meet de
            // analyser het verzwakte signaal en wordt de visualisatie vlak
            // zodra iemand zachter zet.
            source.connect(analyser);
            analyser.connect(gain);
            gain.connect(ctx.destination);

            ctx.resume().catch(() => { });

            this.audioCtx = ctx;
            this.analyser = analyser;
            this.gain = gain;
            this.spectrum = new Uint8Array(analyser.frequencyBinCount);
            this.canAnalyse = true;

            // Vanaf nu regelt de gain het volume; het element gaat vol open.
            this.audio.volume = 1;
            this.audio.muted = false;
            this.#applyGain();

            this.#emit('analyserready');
        } catch {
            // Geen analyse; het element speelt gewoon zelf verder.
            this.canAnalyse = false;
        }
    }

    /**
     * Leest één frame audiodata uit en werkt `levels` bij.
     * Wordt elke frame aangeroepen door de effectenlaag.
     *
     * @returns {Uint8Array|null} het ruwe spectrum, of null zonder analyse
     */
    sample() {
        if (!this.analyser || !this.isPlaying) {
            // Rustig terugzakken als er niets speelt.
            for (const key of ['bass', 'mid', 'high', 'overall']) {
                this.levels[key] *= 0.92;
            }
            this.levels.beat *= 0.86;
            return null;
        }

        this.analyser.getByteFrequencyData(this.spectrum);

        const n = this.spectrum.length;
        const gemiddelde = (van, tot) => {
            let som = 0;
            for (let i = van; i < tot; i += 1) som += this.spectrum[i];
            return som / ((tot - van) * 255);
        };

        // Grofweg: laag tot ~250 Hz, midden tot ~4 kHz, daarboven hoog.
        const bass = gemiddelde(0, Math.max(2, Math.floor(n * 0.06)));
        const mid = gemiddelde(Math.floor(n * 0.06), Math.floor(n * 0.45));
        const high = gemiddelde(Math.floor(n * 0.45), n);

        this.levels.bass = bass;
        this.levels.mid = mid;
        this.levels.high = high;
        this.levels.overall = bass * 0.5 + mid * 0.35 + high * 0.15;

        this.#detectBeat(bass);
        return this.spectrum;
    }

    /**
     * Eenvoudige beatdetectie: springt de lage band flink boven zijn eigen
     * voortschrijdend gemiddelde uit, dan tellen we dat als een tik. Geen
     * tempo-analyse, wel genoeg om de beelden te laten meeademen.
     */
    #detectBeat(bass) {
        this.bassAvg = this.bassAvg === undefined ? bass : this.bassAvg * 0.94 + bass * 0.06;

        const nu = performance.now();
        const genoegTijd = nu - (this.lastBeat || 0) > 260;

        if (genoegTijd && bass > this.bassAvg * 1.35 && bass > 0.12) {
            this.lastBeat = nu;
            this.levels.beat = 1;
        } else {
            this.levels.beat *= 0.86;
        }
    }

    /** Terugvallen op de gewone stream zonder analyse. */
    #fallbackToPlainStream() {
        this.corsMode = false;
        this.canAnalyse = false;
        this.streamUrl = STREAM_URL;

        this.audio.removeAttribute('crossorigin');
        this.audio.src = STREAM_URL;
        this.audio.load();

        if (this.intent) {
            const attempt = this.audio.play();
            if (attempt) attempt.catch(() => this.#scheduleReconnect());
        }
    }

    /* --------------------------------------------------------------- intern */

    #bindAudio() {
        this.audio.addEventListener('playing', () => {
            this.retries = 0;
            this.hasEverPlayed = true;
            this.#setupAnalyser();
            this.#setPlaying(true);
        });

        this.audio.addEventListener('pause', () => this.#setPlaying(false));
        this.audio.addEventListener('waiting', () => this.#emit('buffering'));

        // Een livestream hoort nooit te eindigen: als dat toch gebeurt, is de
        // verbinding weggevallen.
        this.audio.addEventListener('ended', () => this.#scheduleReconnect());
        this.audio.addEventListener('stalled', () => this.#scheduleReconnect());

        this.audio.addEventListener('error', () => {
            // Mislukt de allereerste verbinding terwijl crossOrigin aanstaat,
            // dan is het vrijwel zeker de CORS-controle. Val terug op de
            // gewone stream; luisteren gaat voor visualiseren.
            if (this.corsMode && !this.hasEverPlayed) {
                this.#fallbackToPlainStream();
                return;
            }
            this.#scheduleReconnect();
        });
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

        const separator = this.streamUrl.includes('?') ? '&' : '?';
        this.audio.src = `${this.streamUrl}${separator}_=${Date.now()}`;
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

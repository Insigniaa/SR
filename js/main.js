/**
 * Startpunt: zet de speler, de UI en de sfeerlaag op, en houdt de data actueel.
 */

import { POLL_TRACK, POLL_SCHEDULE, POLL_NEWS, DEFAULT_COVER } from './config.js';
import { RadioPlayer } from './player.js';
import { Ambient, Spectrum } from './ambient.js';
import {
    getCurrentTrack, getRecentTracks, getUpcomingArtists,
    getShows, getArtwork, getNews
} from './api.js';
import {
    initUI, uiHooks, renderCurrentTrack, renderRecentTracks, renderUpcoming,
    renderSchedule, renderNews, renderShowLabel, toast
} from './ui.js';
import { initFx } from './fx/index.js';

let player;
let ambient;
let spectrum;
let fx;
let lastTrackKey = null;

/**
 * Interval dat stilstaat zolang het tabblad verborgen is, en direct bijwerkt
 * zodra de gebruiker terugkomt. De oude opzet bleef in de achtergrond elke
 * 30 seconden doorpollen.
 */
class Ticker {
    constructor(task, interval) {
        this.task = task;
        this.interval = interval;
        this.timer = null;
        this.lastRun = 0;
    }

    async run() {
        this.lastRun = Date.now();
        try {
            await this.task();
        } catch (error) {
            console.warn('[super-radio] verversen mislukt:', error);
        }
    }

    start() {
        this.stop();
        this.timer = setInterval(() => this.run(), this.interval);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** Haalt achterstand in als het tabblad lang verborgen was. */
    resume() {
        this.start();
        if (Date.now() - this.lastRun >= this.interval) this.run();
    }
}

const tickers = [];

/* ================================================================ ophalen */

async function refreshNowPlaying() {
    let track = null;

    try {
        track = await getCurrentTrack();
    } catch {
        track = null;
    }

    if (!track) {
        renderCurrentTrack({
            title: 'Stream niet bereikbaar',
            artist: 'We proberen het opnieuw',
            image: DEFAULT_COVER
        });
        return;
    }

    // Alleen werk doen als het nummer echt gewisseld is.
    if (track.key === lastTrackKey) return;
    lastTrackKey = track.key;

    track.image = (await getArtwork(track.title, track.artist, track.startedAt)) || DEFAULT_COVER;
    renderCurrentTrack(track);

    // De sfeerlaag in CSS is het vangnet; draait WebGL, dan neemt die het over.
    if (!fx?.hasGl) ambient?.apply(track.image);
    fx?.setArtwork(track.image);
}

async function refreshPlaylists() {
    const [recentResult, upcomingResult] = await Promise.allSettled([
        getRecentTracks(),
        getUpcomingArtists()
    ]);

    if (upcomingResult.status === 'fulfilled') renderUpcoming(upcomingResult.value);

    if (recentResult.status !== 'fulfilled') return;
    const tracks = recentResult.value;

    // Eerst tonen met de standaardhoes, daarna aanvullen. Na de eerste ronde
    // zit alles in de cache en is de tweede render meteen raak.
    renderRecentTracks(tracks);

    const enriched = await Promise.all(tracks.map(async (track) => ({
        ...track,
        image: (await getArtwork(track.title, track.artist, track.startedAt)) || DEFAULT_COVER
    })));

    renderRecentTracks(enriched);
}

async function refreshSchedule() {
    const shows = await getShows();
    renderSchedule(shows);
    renderShowLabel(shows.current);
}

async function refreshNews() {
    renderNews(await getNews());
}

/* ================================================================== start */

async function boot() {
    // De effectenlaag eerst: die neemt de intro over en meldt hoe ver we zijn.
    fx = initFx();
    const { preloader } = fx;

    uiHooks.text = (title, artist) => fx.setText(title, artist);
    uiHooks.rendered = (scope) => fx.refresh(scope);

    player = new RadioPlayer();
    initUI(player);
    preloader.set(0.2);

    ambient = new Ambient();
    spectrum = new Spectrum(document.getElementById('spectrum'));

    document.addEventListener('sr:playing', (event) => {
        spectrum?.setPlaying(event.detail.playing);
        fx.setPlaying(event.detail.playing);
    });

    // Lettertypes meetellen in de voortgang; zonder ze springt de titel later.
    document.fonts?.ready.then(() => preloader.set(0.45));

    const first = Promise.allSettled([refreshNowPlaying(), refreshSchedule()]);
    first.then(() => preloader.set(0.85));
    await first;

    await preloader.finish();

    refreshPlaylists();
    refreshNews();

    tickers.push(
        withInterval(refreshNowPlaying, POLL_TRACK),
        withInterval(refreshPlaylists, POLL_TRACK),
        withInterval(refreshSchedule, POLL_SCHEDULE),
        withInterval(refreshNews, POLL_NEWS)
    );

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) tickers.forEach((ticker) => ticker.stop());
        else tickers.forEach((ticker) => ticker.resume());
    });

    handleLaunchIntent();
    registerServiceWorker();
}

function withInterval(task, interval) {
    const ticker = new Ticker(task, interval);
    ticker.lastRun = Date.now();
    ticker.start();
    return ticker;
}

/** Snelkoppelingen uit het PWA-manifest: /?action=play en /?section=… */
function handleLaunchIntent() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('action') === 'play') {
        player.play();   // lukt dit niet, dan meldt de speler 'blocked'
    }

    const section = params.get('section');
    const target = section && document.getElementById(section === 'schedule' ? 'programma' : section);
    if (target) target.scrollIntoView({ block: 'start' });
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

    navigator.serviceWorker.register('sw.js').catch((error) => {
        console.warn('[super-radio] service worker registreren mislukt:', error);
    });
}

/* Modules zijn deferred, dus de DOM staat er al. Toch een vangnet voor het
   geval dit script ooit anders geladen wordt. */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}

function start() {
    boot().catch((error) => {
        console.error('[super-radio] opstarten mislukt:', error);

        // Wat er ook misgaat: de intro moet weg, anders zit de bezoeker vast.
        document.getElementById('intro')?.remove();
        document.body.classList.remove('is-booting');
        document.documentElement.classList.add('is-ready');
        toast('Er ging iets mis bij het laden. Ververs de pagina.');
    });
}

/**
 * Alles-aan-elkaar-knoper van de effectenlaag.
 *
 * main.js praat alleen met dit bestand. Faalt er iets — geen WebGL, oud
 * apparaat, prefers-reduced-motion — dan valt de site terug op de gewone
 * versie zonder dat er iets breekt.
 */

import { setEnergy, setAudio, onTick, canHover, reducedMotion, isCapable } from './core.js';
import { initCursor } from './cursor.js';
import { initReveals, Scrambler } from './reveal.js';
import { initSmoothScroll } from './scroll.js';
import { initMarquees, initTilt } from './chrome.js';
import { GLBackdrop, GLCover } from './gl.js';
import { initPreloader } from './preloader.js';

export function initFx() {
    const root = document.documentElement;
    const heavy = isCapable();

    root.classList.add('fx');
    root.classList.toggle('fx--reduced', reducedMotion.matches);
    root.classList.toggle('fx--touch', !canHover);

    const preloader = initPreloader();

    const reveals = initReveals();
    initSmoothScroll();
    const marquees = initMarquees();
    initTilt();
    if (canHover && !reducedMotion.matches) initCursor();

    /* --- WebGL, alleen als het apparaat het aankan --- */
    let backdrop = null;
    let cover = null;

    if (heavy) {
        backdrop = new GLBackdrop(document.getElementById('gl-backdrop'));
        cover = new GLCover(document.getElementById('gl-cover'), document.querySelector('.cover'));

        if (backdrop?.ok) root.classList.add('has-gl-backdrop');
        if (cover?.ok) root.classList.add('has-gl-cover');
    }

    // De shader krijgt een lichte stand mee, zodat het veld niet als donkere
    // vlek op een crèmekleurige pagina blijft liggen.
    const syncTheme = () => {
        const explicit = root.dataset.theme;
        const isLight = explicit
            ? explicit === 'light'
            : window.matchMedia('(prefers-color-scheme: light)').matches;
        backdrop?.setTheme?.(isLight);
    };

    syncTheme();
    document.addEventListener('sr:theme', syncTheme);
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', syncTheme);

    /* --- tekst --- */
    const titleScrambler = new Scrambler(document.getElementById('np-title'), { speed: 1.25 });
    const artistScrambler = new Scrambler(document.getElementById('np-artist'), { speed: 1.7 });

    return {
        preloader,

        /** Nieuwe titel/artiest: de tekst scramblet naar binnen. */
        setText(title, artist) {
            titleScrambler.to(title);
            artistScrambler.to(artist);

            const line = title && artist ? `${title} — ${artist}` : 'Super Radio — live';
            marquees.forEach((marquee) => marquee.setText(line));
        },

        /** Nieuwe hoes: beide shaders kruisen over naar de nieuwe textuur. */
        setArtwork(image) {
            if (!image) return;
            backdrop?.setImage(image);
            cover?.setImage(image);
        },

        setPlaying(playing) {
            setEnergy(playing ? 1 : 0);
        },

        /**
         * Koppelt de speler zodat de beelden op de echte muziek reageren.
         *
         * Lukt de analyse niet - ander domein, geen CORS - dan draait er een
         * rustig golfje mee, zodat het beeld nog steeds leeft.
         */
        attachPlayer(player) {
            const root = document.documentElement;
            let beatUit = 0;

            onTick(({ t, dt }) => {
                player.sample();

                if (player.canAnalyse) {
                    setAudio(player.levels.overall, player.levels.beat);
                    beatUit += (player.levels.beat - beatUit) * Math.min(dt * 14, 1);
                } else {
                    setAudio(0.42 + Math.sin(t * 1.3) * 0.1, 0);
                    beatUit *= 0.9;
                }

                root.style.setProperty('--beat', beatUit.toFixed(3));
            });

            player.addEventListener('analyserready', () => {
                root.classList.add('has-audio-analyse');
            });
        },

        /** Na het renderen van nieuwe blokken, zodat die ook onthuld worden. */
        refresh(scope) {
            reveals?.observe?.(scope || document);
        },

        hasGl: Boolean(backdrop?.ok || cover?.ok)
    };
}

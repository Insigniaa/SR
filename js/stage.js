/**
 * Kijkmodus: de site wordt een visualisatie op volledig scherm.
 *
 * Bedoeld voor als de radio ergens aan staat — op een tweede scherm, een tv of
 * een telefoon op een dock. Alleen de hoes, de titel en het spectrum.
 */

import { Spectrum } from './ambient.js';
import { currentTrack } from './ui.js';
import { DEFAULT_COVER } from './config.js';

export function initStage(player) {
    const stage = document.getElementById('stage');
    if (!stage) return;

    const art = document.getElementById('stage-art');
    const titel = document.getElementById('stage-title');
    const artiest = document.getElementById('stage-artist');
    const show = document.getElementById('stage-show');
    const openKnop = document.getElementById('stage-btn');
    const sluitKnop = document.getElementById('stage-close');

    let spectrum = null;
    let vorigeFocus = null;

    const vul = (track) => {
        if (!track?.title) return;
        titel.textContent = track.title;
        artiest.textContent = track.artist || '';
        if (track.image && art.src !== track.image) art.src = track.image || DEFAULT_COVER;
        show.textContent = document.getElementById('studio-show')?.textContent || '';
    };

    const open = async () => {
        vorigeFocus = document.activeElement;
        vul(currentTrack);
        stage.hidden = false;
        document.body.classList.add('stage-open');

        // Eigen spectrum, gevoed door dezelfde speler.
        if (!spectrum) {
            spectrum = new Spectrum(document.getElementById('stage-spectrum'));
            spectrum.setSource(player);
        }
        spectrum.setPlaying(player.isPlaying);
        spectrum.resize();
        spectrum.start();

        try {
            await stage.requestFullscreen?.();
        } catch {
            // Geen volledig scherm (bijvoorbeeld op iOS): de overlay vult
            // het venster dan gewoon zelf.
        }

        sluitKnop.focus();
    };

    const sluit = async () => {
        if (document.fullscreenElement) {
            try { await document.exitFullscreen(); } catch { /* al gesloten */ }
        }
        stage.hidden = true;
        document.body.classList.remove('stage-open');
        spectrum?.stop();
        vorigeFocus?.focus?.();
    };

    openKnop?.addEventListener('click', open);
    sluitKnop?.addEventListener('click', sluit);

    // Sluit de overlay als de gebruiker het volledige scherm zelf verlaat.
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && !stage.hidden) sluit();
    });

    document.addEventListener('keydown', (event) => {
        const tag = event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        if (event.key === 'Escape' && !stage.hidden) {
            event.preventDefault();
            sluit();
            return;
        }

        if ((event.key === 'f' || event.key === 'F') && !document.querySelector('dialog[open]')) {
            event.preventDefault();
            stage.hidden ? open() : sluit();
        }
    });

    // Meelopen met wat er speelt.
    document.addEventListener('sr:track', (event) => vul(event.detail));
    document.addEventListener('sr:playing', (event) => {
        if (!stage.hidden) spectrum?.setPlaying(event.detail.playing);
        stage.querySelector('.stage__play use')
            ?.setAttribute('href', event.detail.playing ? '#i-pause' : '#i-play');
    });
}

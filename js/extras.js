/**
 * Losse voorzieningen rond de speler: installeren als app, slaaptimer en het
 * overzicht met sneltoetsen.
 *
 * Staat apart van ui.js omdat het geen weergave van zenderdata is maar
 * gereedschap voor de luisteraar; ui.js was al groot genoeg.
 */

import { store } from './utils.js';
import { toast } from './ui.js';

const SLEEP_KEY = 'sr.sleep';

export function initExtras(player) {
    initInstall();
    const sleep = initSleepTimer(player);
    initShortcutsDialog(sleep);
}

/* ============================================================= installeren */

/**
 * Toont een installeerknop zodra de browser aangeeft dat het kan.
 *
 * Zonder dit moet een bezoeker zelf het browsermenu induiken; voor een
 * radiozender is een pictogram op het startscherm juist het punt.
 */
function initInstall() {
    const button = document.getElementById('install-btn');
    if (!button) return;

    let prompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
        // De eigen knop past beter in het ontwerp dan de balk van de browser.
        event.preventDefault();
        prompt = event;
        button.hidden = false;
    });

    button.addEventListener('click', async () => {
        if (!prompt) return;

        button.disabled = true;
        prompt.prompt();

        const { outcome } = await prompt.userChoice;
        prompt = null;
        button.hidden = true;
        button.disabled = false;

        if (outcome === 'accepted') toast('Super Radio staat nu op je startscherm.');
    });

    window.addEventListener('appinstalled', () => {
        button.hidden = true;
        toast('Super Radio is geïnstalleerd.');
    });
}

/* =============================================================== slaaptimer */

function initSleepTimer(player) {
    const button = document.getElementById('sleep-btn');
    const label = document.getElementById('sleep-label');
    const menu = document.getElementById('sleep-menu');
    if (!button || !menu) return null;

    let einde = 0;          // tijdstip waarop de muziek stopt
    let timer = null;       // aftellen naar dat tijdstip
    let ticker = null;      // bijwerken van het label

    const open = (staat) => {
        menu.hidden = !staat;
        button.setAttribute('aria-expanded', String(staat));
        if (staat) menu.querySelector('button')?.focus();
    };

    const teken = () => {
        if (!einde) {
            label.textContent = 'Slaaptimer';
            button.classList.remove('is-actief');
            return;
        }
        const over = Math.max(0, Math.round((einde - Date.now()) / 60_000));
        label.textContent = over >= 60
            ? `Nog ${Math.floor(over / 60)} u ${over % 60} m`
            : `Nog ${over} min`;
        button.classList.add('is-actief');
    };

    const stop = () => {
        clearTimeout(timer);
        clearInterval(ticker);
        timer = ticker = null;
        einde = 0;
        store.set(SLEEP_KEY, 0);
        teken();
    };

    const zet = (minuten) => {
        stop();
        if (!minuten) {
            toast('Slaaptimer uitgezet.');
            return;
        }

        einde = Date.now() + minuten * 60_000;
        store.set(SLEEP_KEY, einde);

        timer = setTimeout(async () => {
            await player.fadeOutAndPause(12);
            stop();
            toast('Slaaptimer afgelopen. Welterusten.');
        }, minuten * 60_000);

        ticker = setInterval(teken, 20_000);
        teken();
        toast(`De muziek stopt over ${minuten} minuten.`);
    };

    button.addEventListener('click', () => open(menu.hidden));

    menu.addEventListener('click', (event) => {
        const keuze = event.target.closest('[data-sleep]');
        if (!keuze) return;
        zet(Number(keuze.dataset.sleep));
        open(false);
        button.focus();
    });

    document.addEventListener('click', (event) => {
        if (menu.hidden) return;
        if (menu.contains(event.target) || button.contains(event.target)) return;
        open(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) {
            open(false);
            button.focus();
        }
    });

    // Een timer die nog liep bij het verversen weer oppakken.
    const bewaard = Number(store.get(SLEEP_KEY, 0));
    if (bewaard > Date.now()) zet(Math.round((bewaard - Date.now()) / 60_000));
    else if (bewaard) store.set(SLEEP_KEY, 0);

    return { toggle: () => open(menu.hidden) };
}

/* ============================================================= sneltoetsen */

function initShortcutsDialog(sleep) {
    const dialog = document.getElementById('keys-dialog');
    if (!dialog) return;

    const open = () => (dialog.showModal ? dialog.showModal() : (dialog.open = true));

    document.getElementById('keys-btn')?.addEventListener('click', open);
    document.getElementById('keys-close')?.addEventListener('click', () => dialog.close());

    // Klik op de achtergrond sluit het venster.
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });

    document.addEventListener('keydown', (event) => {
        const tag = event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        if (event.key === '?') {
            event.preventDefault();
            dialog.open ? dialog.close() : open();
        }

        if ((event.key === 's' || event.key === 'S') && !dialog.open) {
            event.preventDefault();
            sleep?.toggle();
        }
    });
}

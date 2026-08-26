/**
 * Alles wat de DOM aanraakt.
 *
 * Regel: data van buiten (laut.fm, iTunes, RSS) komt uitsluitend via
 * textContent of via safeUrl() in de pagina. Er wordt nergens een string met
 * externe inhoud aan innerHTML toegekend, en er staan geen inline handlers in
 * de opmaak.
 */

import { DEFAULT_COVER, NEWS_INITIAL, STATION_PAGE } from './config.js';
import {
    el, icon, replaceChildren, safeUrl,
    formatClock, formatRelative, formatDuration, formatShowTime, dayLabel,
    clamp, store, prefersReducedMotion
} from './utils.js';

const THEME_KEY = 'sr.theme';

/**
 * Aansluitpunten voor de effectenlaag. Blijven ze leeg, dan rendert de UI
 * gewoon rechtstreeks — de site werkt dus ook zonder js/fx.
 */
export const uiHooks = {
    /** (title, artist) => void — neemt het zetten van de tracktitel over */
    text: null,
    /** (scope) => void — na het renderen van nieuwe blokken */
    rendered: null
};

/** Eén keer opzoeken, hergebruiken. */
const dom = {};
let player = null;
let progressTimer = null;

export function initUI(radioPlayer) {
    player = radioPlayer;
    cacheDom();

    initTheme();
    initNavigation();
    initTransport();
    initKeyboard();
    initShare();
    initDock();

    dom.year.textContent = String(new Date().getFullYear());
    syncPlayState();
    syncVolume();
}

function cacheDom() {
    const id = (name) => document.getElementById(name);

    Object.assign(dom, {
        topbar: id('topbar'),
        navToggle: id('nav-toggle'),
        drawer: id('mobile-nav'),
        navLinks: [...document.querySelectorAll('.mainnav__link')],
        themeToggle: id('theme-toggle'),

        onair: document.querySelector('.onair'),
        showLabel: id('studio-show'),
        npTitle: id('np-title'),
        npArtist: id('np-artist'),
        npArt: id('np-art'),

        progress: id('track-progress'),
        progressFill: id('track-progress-fill'),
        elapsed: id('track-elapsed'),
        remaining: id('track-remaining'),

        playToggles: [...document.querySelectorAll('[data-play-toggle]')],
        volumeIcon: id('volume-icon'),
        muteToggle: id('mute-toggle'),
        volumeSliders: [...document.querySelectorAll('.volume__slider')],
        shareBtn: id('share-btn'),

        recent: id('recent-list'),
        upcoming: id('upcoming-list'),
        schedule: id('schedule'),
        news: id('news'),
        newsMore: id('news-more'),

        dock: id('dock'),
        dockArt: id('dock-art'),
        dockTitle: id('dock-title'),
        dockArtist: id('dock-artist'),
        dockProgress: id('dock-progress')?.firstElementChild,

        toasts: id('toasts'),
        year: id('year')
    });
}

/* ==================================================================== thema */

function initTheme() {
    const saved = store.get(THEME_KEY, null);
    if (saved === 'light' || saved === 'dark') {
        document.documentElement.dataset.theme = saved;
    }

    updateThemeLabel();

    dom.themeToggle?.addEventListener('click', () => {
        const isLight = resolvedTheme() === 'light';
        document.documentElement.dataset.theme = isLight ? 'dark' : 'light';
        store.set(THEME_KEY, isLight ? 'dark' : 'light');
        updateThemeLabel();
    });
}

function resolvedTheme() {
    const explicit = document.documentElement.dataset.theme;
    if (explicit) return explicit;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function updateThemeLabel() {
    const theme = resolvedTheme();
    dom.themeToggle?.setAttribute('aria-label',
        `Wissel naar ${theme === 'light' ? 'donker' : 'licht'} thema`);

    document.dispatchEvent(new CustomEvent('sr:theme', { detail: { theme } }));
}

/* =============================================================== navigatie */

function initNavigation() {
    // Sticky-stijl op de balk
    const onScroll = () => dom.topbar?.classList.toggle('is-stuck', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Mobiel menu — precies één keer gebonden
    dom.navToggle?.addEventListener('click', () => setDrawer(dom.drawer.hidden));

    document.addEventListener('click', (event) => {
        if (dom.drawer?.hidden) return;
        if (dom.drawer.contains(event.target) || dom.navToggle.contains(event.target)) return;
        setDrawer(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !dom.drawer?.hidden) {
            setDrawer(false);
            dom.navToggle?.focus();
        }
    });

    // Zacht scrollen. Werkt nu: eerder zat deze binding in een tweede
    // DOMContentLoaded-listener die nooit meer afvuurde.
    document.querySelectorAll('a[href^="#"]:not([href="#"])').forEach((link) => {
        link.addEventListener('click', (event) => {
            const target = document.querySelector(link.getAttribute('href'));
            if (!target) return;

            event.preventDefault();
            setDrawer(false);
            target.scrollIntoView({
                behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                block: 'start'
            });
            history.replaceState(null, '', link.getAttribute('href'));
        });
    });

    initScrollSpy();
}

function setDrawer(open) {
    if (!dom.drawer || !dom.navToggle) return;
    dom.drawer.hidden = !open;
    dom.navToggle.setAttribute('aria-expanded', String(open));
    dom.navToggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
}

function initScrollSpy() {
    const sections = ['speelt', 'programma', 'nieuws']
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    if (!sections.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            dom.navLinks.forEach((link) => {
                link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`);
            });
        });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach((section) => observer.observe(section));
}

/* ================================================================ bediening */

function initTransport() {
    // Alle knoppen met data-play-toggle in één keer, dus geen dubbele binding
    // meer op knoppen die twee klassen delen.
    dom.playToggles.forEach((btn) => btn.addEventListener('click', () => player.toggle()));

    dom.muteToggle?.addEventListener('click', () => player.toggleMute());

    dom.volumeSliders.forEach((slider) => {
        slider.addEventListener('input', (event) => {
            // Waarde is 0-100 en gaat ongewijzigd door. De oude sticky-speler
            // deelde hier nog een keer door 100.
            player.setVolume(event.target.value);
        });
    });

    player.addEventListener('statechange', syncPlayState);
    player.addEventListener('intentchange', syncPlayState);
    player.addEventListener('volumechange', syncVolume);

    player.addEventListener('blocked', () =>
        toast('Je browser blokkeerde het automatisch starten. Druk nog een keer op play.'));

    player.addEventListener('offline', () => {
        setOnAir('error');
        toast('Verbinding weg. We hervatten zodra je weer online bent.', 'i-wifi-off');
    });

    player.addEventListener('reconnecting', (event) => {
        setOnAir('error');
        if (event.detail?.attempt === 1) toast('Verbinding wordt hersteld…', 'i-wifi-off');
    });

    player.addEventListener('failed', () => {
        setOnAir('error');
        toast('De stream is niet bereikbaar. Probeer het later opnieuw.', 'i-wifi-off');
    });
}

function syncPlayState() {
    const playing = player.isPlaying;
    const label = player.intent ? 'Pauzeren' : 'Afspelen';

    dom.playToggles.forEach((btn) => {
        btn.setAttribute('aria-label', label);
        btn.classList.toggle('is-playing', playing);

        const use = btn.querySelector('use');
        if (use) use.setAttribute('href', playing ? '#i-pause' : '#i-play');
    });

    const liveLabel = document.querySelector('.live-btn__label');
    if (liveLabel) liveLabel.textContent = playing ? 'Pauze' : 'Live';

    setOnAir(playing ? 'live' : 'idle');
    document.dispatchEvent(new CustomEvent('sr:playing', { detail: { playing } }));
}

function syncVolume() {
    const value = player.effectiveVolume;

    dom.volumeSliders.forEach((slider) => {
        if (slider.value !== String(value)) slider.value = value;
        slider.style.setProperty('--vol', `${value}%`);
        slider.setAttribute('aria-valuetext', `${value} procent`);
    });

    const iconId = value === 0 ? 'i-vol-mute' : value < 45 ? 'i-vol-low' : 'i-vol-high';
    dom.volumeIcon?.querySelector('use')?.setAttribute('href', `#${iconId}`);
    dom.muteToggle?.setAttribute('aria-label', player.muted ? 'Geluid aan' : 'Dempen');

    document.querySelectorAll('.dock__volume > svg use').forEach((use) => {
        use.setAttribute('href', `#${iconId}`);
    });
}

function setOnAir(state) {
    dom.onair?.setAttribute('data-state', state);
    const text = dom.onair?.querySelector('.onair__text');
    if (!text) return;
    text.textContent = state === 'live' ? 'On air' : state === 'error' ? 'Verbinden' : 'Stand-by';
}

/* ============================================================== sneltoetsen */

function initKeyboard() {
    document.addEventListener('keydown', (event) => {
        const tag = event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        switch (event.key) {
            case ' ':
            case 'k':
            case 'K':
                event.preventDefault();
                player.toggle();
                break;
            case 'ArrowUp':
                event.preventDefault();
                player.setVolume(clamp(player.volume + 5, 0, 100));
                break;
            case 'ArrowDown':
                event.preventDefault();
                player.setVolume(clamp(player.volume - 5, 0, 100));
                break;
            case 'm':
            case 'M':
                player.toggleMute();
                break;
            default:
                break;
        }
    });
}

/* =================================================================== delen */

function initShare() {
    dom.shareBtn?.addEventListener('click', async () => {
        const title = dom.npTitle?.textContent?.trim() || '';
        const artist = dom.npArtist?.textContent?.trim() || '';
        const text = title && artist
            ? `Ik luister naar ${title} van ${artist} op Super Radio.`
            : 'Luister mee met Super Radio.';

        const payload = { title: 'Super Radio', text, url: window.location.origin || STATION_PAGE };

        if (navigator.share) {
            try {
                await navigator.share(payload);
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;   // gebruiker annuleerde
            }
        }

        try {
            await navigator.clipboard.writeText(`${text} ${payload.url}`);
            toast('Link gekopieerd naar het klembord.');
        } catch {
            toast('Kopiëren lukte niet. Kopieer de link uit de adresbalk.');
        }
    });
}

/* ============================================================== nu speelt */

export function renderCurrentTrack(track) {
    if (!track) return;

    const title = track.title || 'Onbekend nummer';
    const artist = track.artist || 'Onbekende artiest';
    const image = track.image || DEFAULT_COVER;

    // Zachte afbreekpunten na komma's en slashes, zodat een opsomming als
    // "Al Jarreau,Steely Dan,Lou Rawls" netjes afbreekt in plaats van
    // middenin een naam.
    dom.npTitle.closest('.np')?.setAttribute('data-len', lengthBucket(title));

    if (uiHooks.text) {
        uiHooks.text(softBreak(title), softBreak(artist));
    } else {
        dom.npTitle.textContent = softBreak(title);
        dom.npArtist.textContent = softBreak(artist);
    }
    dom.dockTitle.textContent = title;
    dom.dockArtist.textContent = artist;

    document.title = `${title} — ${artist} | Super Radio`;

    setCover(dom.npArt, image, `Hoes van ${title} van ${artist}`);
    setCover(dom.dockArt, image, '');

    player?.setMetadata({ title, artist, image });
    renderProgress(track);
}

/** Zero-width space na komma's en slashes: geeft de browser een afbreekpunt. */
function softBreak(text) {
    return String(text).replace(/([,/])(?=\S)/g, '$1\u200B');
}

/** Bepaalt hoe groot de titel mag worden. */
function lengthBucket(text) {
    const length = String(text).length;
    if (length <= 20) return 's';
    if (length <= 38) return 'l';
    return 'xl';
}

/** Wisselt een hoes met een korte fade en valt terug op de standaardhoes. */
function setCover(img, src, alt) {
    if (!img) return;
    if (alt !== undefined) img.alt = alt;
    if (img.dataset.src === src) return;

    img.dataset.src = src;
    img.classList.add('is-swapping');

    const loader = new Image();
    loader.onload = () => {
        img.src = src;
        img.classList.remove('is-swapping');
    };
    loader.onerror = () => {
        // Belangrijk: niet opnieuw dezelfde bron proberen. De oude code zette
        // hier de standaardhoes terug, die zelf ook ontbrak, wat een oneindige
        // foutlus opleverde.
        if (src !== DEFAULT_COVER) {
            img.src = DEFAULT_COVER;
            img.dataset.src = DEFAULT_COVER;
        }
        img.classList.remove('is-swapping');
    };
    loader.src = src;
}

function renderProgress(track) {
    clearInterval(progressTimer);

    const { startedAt, endsAt } = track;
    if (!startedAt || !endsAt || endsAt <= startedAt) {
        dom.progress.hidden = true;
        if (dom.dockProgress) dom.dockProgress.style.width = '0%';
        return;
    }

    const total = (endsAt - startedAt) / 1000;
    dom.progress.hidden = false;

    const update = () => {
        const elapsed = clamp((Date.now() - startedAt.getTime()) / 1000, 0, total);
        const percent = (elapsed / total) * 100;

        dom.progressFill.style.width = `${percent}%`;
        if (dom.dockProgress) dom.dockProgress.style.width = `${percent}%`;
        dom.elapsed.textContent = formatDuration(elapsed);
        dom.remaining.textContent = `-${formatDuration(total - elapsed)}`;

        if (elapsed >= total) clearInterval(progressTimer);
    };

    update();
    progressTimer = setInterval(update, 1000);
}

export function renderShowLabel(show) {
    if (!dom.showLabel) return;
    dom.showLabel.textContent = show?.name
        ? `${show.name} · ${formatShowTime(show.hour, show.endHour)}`
        : 'Non-stop muziek';
}

/* ============================================================ speellijsten */

export function renderRecentTracks(tracks) {
    if (!dom.recent) return;
    dom.recent.setAttribute('aria-busy', 'false');

    if (!tracks?.length) {
        replaceChildren(dom.recent, emptyState('Nog geen nummers gedraaid.'));
        return;
    }

    replaceChildren(dom.recent, tracks.map((track) => {
        const search = `https://www.google.com/search?q=${encodeURIComponent(`${track.artist} ${track.title}`)}`;

        return el('li', { class: 'track' }, [
            el('span', { class: 'track__time mono', text: formatClock(track.startedAt) }),
            el('img', {
                class: 'track__art',
                src: track.image || DEFAULT_COVER,
                alt: '',
                loading: 'lazy',
                decoding: 'async',
                width: 52,
                height: 52,
                onerror: (event) => { event.target.src = DEFAULT_COVER; }
            }),
            el('div', { class: 'track__body' }, [
                el('p', { class: 'track__title', text: track.title }),
                el('p', { class: 'track__artist', text: track.artist })
            ]),
            el('a', {
                class: 'track__action',
                href: search,
                target: '_blank',
                rel: 'noopener noreferrer',
                'aria-label': `Zoek ${track.title} van ${track.artist}`
            }, [icon('i-search')])
        ]);
    }));
}

export function renderUpcoming(artists) {
    if (!dom.upcoming) return;
    dom.upcoming.setAttribute('aria-busy', 'false');

    // Zonder echte artiesten heeft deze kolom niets te vertellen. Dan hem
    // verbergen en de speellijst de volle breedte geven, in plaats van een
    // kop met een excuus eronder.
    const column = dom.upcoming.closest('.playlist__col');
    const grid = dom.upcoming.closest('.playlist');
    const heeftInhoud = Boolean(artists?.length);

    if (column) column.hidden = !heeftInhoud;
    if (grid) grid.classList.toggle('is-single', !heeftInhoud);

    if (!heeftInhoud) {
        replaceChildren(dom.upcoming, []);
        return;
    }

    replaceChildren(dom.upcoming, artists.map((artist, index) =>
        el('li', { class: 'upnext__item' }, [
            el('span', { class: 'upnext__idx mono', text: String(index + 1) }),
            el('div', {}, [
                el('p', { class: 'upnext__name', text: artist.name }),
                el('p', { class: 'upnext__meta', text: index === 0 ? 'Hierna' : `Over ${index + 1} nummers` })
            ])
        ])
    ));
}

/* ================================================================ programma */

export function renderSchedule({ current, upcoming }) {
    if (!dom.schedule) return;
    dom.schedule.setAttribute('aria-busy', 'false');

    const nodes = [];

    if (current) {
        nodes.push(el('article', { class: 'now-show', 'data-tilt': '4' }, [
            current.image && el('img', {
                class: 'now-show__art',
                src: current.image,
                alt: '',
                loading: 'lazy',
                decoding: 'async',
                onerror: (event) => { event.target.remove(); }
            }),
            el('div', { class: 'now-show__body' }, [
                el('span', { class: 'now-show__badge' }, [el('span'), 'Nu op de zender']),
                el('h3', { class: 'now-show__name', text: current.name }),
                el('p', { class: 'now-show__time' }, [
                    icon('i-clock'),
                    formatShowTime(current.hour, current.endHour)
                ]),
                current.description && el('p', { class: 'band__sub', text: current.description }),
                el('div', {
                    class: 'now-show__bar',
                    role: 'progressbar',
                    'aria-label': 'Voortgang van het programma',
                    'aria-valuenow': Math.round(current.progress || 0),
                    'aria-valuemin': '0',
                    'aria-valuemax': '100'
                }, [el('span', { style: `width:${current.progress || 0}%` })])
            ])
        ]));
    }

    if (upcoming?.length) {
        nodes.push(el('div', { class: 'next-shows' }, upcoming.map((show) =>
            el('article', { class: 'next-show' }, [
                el('p', { class: 'next-show__when', text: whenLabel(show) }),
                el('h4', { class: 'next-show__name', text: show.name }),
                el('p', { class: 'next-show__time mono', text: formatShowTime(show.hour, show.endHour) })
            ])
        )));
    }

    replaceChildren(dom.schedule, nodes.length ? nodes : emptyState('Geen programmering beschikbaar.'));
    afterRender(dom.schedule);
}

function whenLabel(show) {
    const minutes = show.inMinutes ?? 0;
    if (minutes < 60) return `Over ${Math.max(1, Math.round(minutes))} min`;
    if (minutes < 1440) return `Over ${Math.round(minutes / 60)} uur`;
    return dayLabel(show.day);
}

/* =================================================================== nieuws */

export function renderNews(items) {
    if (!dom.news) return;
    dom.news.setAttribute('aria-busy', 'false');
    replaceChildren(dom.newsMore, []);

    // Geen bron bereikbaar? Dan de hele sectie weg, inclusief de menu-items die
    // ernaartoe wijzen. Een lege kop met een foutzin ziet er kapotter uit dan
    // een sectie die er gewoon niet is.
    setNewsVisible(Boolean(items?.length));
    if (!items?.length) return;

    const visible = items.slice(0, NEWS_INITIAL);
    replaceChildren(dom.news, visible.map((item, index) => newsCard(item, index === 0)));

    const rest = items.slice(NEWS_INITIAL);
    if (!rest.length) return;

    const button = el('button', {
        class: 'more-btn',
        type: 'button',
        text: `Meer nieuws (${rest.length})`
    });

    button.addEventListener('click', () => {
        rest.forEach((item) => dom.news.append(newsCard(item, false)));
        button.remove();
    }, { once: true });

    replaceChildren(dom.newsMore, button);
    afterRender(dom.news);
}

function setNewsVisible(visible) {
    const section = document.getElementById('nieuws');
    if (section) section.hidden = !visible;

    document.querySelectorAll('a[href="#nieuws"]').forEach((link) => {
        link.hidden = !visible;
    });
}

function newsCard(item, isLead) {
    const url = safeUrl(item.url);

    const media = el('div', { class: 'news__media' }, [
        el('img', {
            src: item.image || DEFAULT_COVER,
            alt: '',
            loading: 'lazy',
            decoding: 'async',
            onerror: (event) => { event.target.src = DEFAULT_COVER; }
        })
    ]);

    const body = el('div', { class: 'news__body' }, [
        el('p', { class: 'news__meta' }, [
            el('b', { text: 'NU.nl' }),
            '·',
            formatRelative(item.date)
        ]),
        el('h3', { class: 'news__title', text: item.title }),
        el('p', { class: 'news__excerpt', text: item.excerpt }),
        url && el('span', { class: 'news__cta' }, ['Lees artikel', icon('i-external')])
    ]);

    const classes = `news__item${isLead ? ' news__item--lead' : ''}`;
    const tilt = isLead ? { 'data-tilt': '3' } : {};

    // Een <a> om de hele kaart: toetsenbord- en screenreadervriendelijk, en
    // zonder de inline onclick met een niet-gecontroleerde URL van vroeger.
    return url
        ? el('a', { class: classes, href: url, target: '_blank', rel: 'noopener noreferrer', ...tilt }, [media, body])
        : el('article', { class: classes, ...tilt }, [media, body]);
}

/* ==================================================================== dock */

function initDock() {
    const anchor = document.querySelector('.studio');
    if (!dom.dock || !anchor || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(([entry]) => {
        dom.dock.hidden = entry.isIntersecting;
    }, { threshold: 0, rootMargin: '-120px 0px 0px 0px' });

    observer.observe(anchor);
}

/* ================================================================== meldingen */

export function toast(message, iconId = 'i-signal') {
    if (!dom.toasts) return;

    const node = el('div', { class: 'toast' }, [icon(iconId), el('span', { text: message })]);
    dom.toasts.append(node);

    setTimeout(() => {
        node.classList.add('is-leaving');
        node.addEventListener('animationend', () => node.remove(), { once: true });
    }, 4200);
}

/** Laat de effectenlaag weten dat er nieuwe knopen zijn. */
function afterRender(scope) {
    uiHooks.rendered?.(scope);
}

function emptyState(message) {
    return el('p', { class: 'band__sub', text: message });
}

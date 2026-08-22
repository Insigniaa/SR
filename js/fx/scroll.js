/**
 * Scrollmotor met traagheid.
 *
 * De echte scrollbalk blijft gewoon werken — toetsenbord, muiswiel, zoeken op
 * de pagina, alles. We laten de inhoud er alleen met vertraging achteraan
 * lopen: `#scroll-content` staat op position:fixed en wordt elk frame naar de
 * gedempte scrollpositie verplaatst, terwijl <body> de echte hoogte houdt.
 *
 * Op aanraakschermen en bij prefers-reduced-motion gebeurt hier niets; dan is
 * het gewoon normaal scrollen.
 */

import { onTick, damp, clamp, viewport, canHover, reducedMotion } from './core.js';

export const scrollState = { y: 0, target: 0, velocity: 0, progress: 0, active: false };

export function initSmoothScroll() {
    const content = document.getElementById('scroll-content');
    if (!content) return null;

    const enabled = canHover && !reducedMotion.matches;

    // Parallax en de hero-uitloop werken in beide modi; alleen het vertraagde
    // verschuiven zit achter `enabled`.
    const parallaxItems = [...document.querySelectorAll('[data-speed]')].map((el) => ({
        el,
        speed: Number(el.dataset.speed) || 0,
        y: 0
    }));

    const velocityItems = [...document.querySelectorAll('[data-velocity]')];
    const hero = document.querySelector('.studio');

    let contentHeight = 0;

    function measure() {
        contentHeight = content.scrollHeight;
        if (enabled) document.body.style.height = `${contentHeight}px`;
    }

    if (enabled) {
        content.classList.add('is-smooth');
        scrollState.active = true;
        measure();

        if ('ResizeObserver' in window) {
            new ResizeObserver(measure).observe(content);
        }
        window.addEventListener('resize', measure, { passive: true });
        window.addEventListener('load', measure);

        // Ankerlinks moeten naar de echte scrollpositie, niet naar de verschoven
        // weergave. Deze listener draait in de capture-fase en neemt het over
        // van de standaardafhandeling in ui.js.
        document.addEventListener('click', (event) => {
            const link = event.target.closest?.('a[href^="#"]:not([href="#"])');
            if (!link) return;

            const target = document.querySelector(link.getAttribute('href'));
            if (!target) return;

            event.preventDefault();
            event.stopImmediatePropagation();

            const offset = target.getBoundingClientRect().top - content.getBoundingClientRect().top;
            const header = Number.parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 68;

            window.scrollTo({ top: Math.max(0, offset - header - 24), behavior: 'smooth' });
            history.replaceState(null, '', link.getAttribute('href'));
        }, { capture: true });
    }

    scrollState.y = window.scrollY;
    scrollState.target = window.scrollY;

    onTick(({ dt }) => {
        scrollState.target = window.scrollY;

        const previous = scrollState.y;
        scrollState.y = enabled
            ? damp(scrollState.y, scrollState.target, 8.5, dt)
            : scrollState.target;

        // Genormaliseerde snelheid: ongeveer -1..1 bij stevig scrollen.
        const raw = (scrollState.y - previous) / Math.max(dt, 1e-3) / 2400;
        scrollState.velocity = damp(scrollState.velocity, clamp(raw, -1, 1), 9, dt);

        const max = Math.max(1, contentHeight - viewport.h);
        scrollState.progress = clamp(scrollState.y / max, 0, 1);

        if (enabled) {
            content.style.transform = `translate3d(0, ${(-scrollState.y).toFixed(2)}px, 0)`;
        }

        // Parallax: elementen lopen sneller of trager dan de rest.
        for (const item of parallaxItems) {
            const rect = item.el.getBoundingClientRect();
            const center = rect.top + rect.height / 2 - viewport.h / 2;
            item.y = damp(item.y, -center * item.speed, 12, dt);
            item.el.style.setProperty('--py', `${item.y.toFixed(2)}px`);
        }

        // Lichte uitrekking op scrollsnelheid.
        const stretch = Math.abs(scrollState.velocity);
        for (const el of velocityItems) {
            el.style.setProperty('--stretch', (1 + stretch * 0.06).toFixed(4));
        }

        document.documentElement.style.setProperty('--scroll-velocity', scrollState.velocity.toFixed(4));
        document.documentElement.style.setProperty('--scroll-progress', scrollState.progress.toFixed(4));

        // Hero die wegvalt: 0 boven aan de pagina, 1 als hij helemaal weg is.
        if (hero) {
            const heroExit = clamp(scrollState.y / Math.max(hero.offsetHeight * 0.85, 1), 0, 1);
            document.documentElement.style.setProperty('--hero-exit', heroExit.toFixed(4));
        }
    });

    return { measure };
}

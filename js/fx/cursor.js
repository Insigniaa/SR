/**
 * Eigen cursor: een kleine stip die de muis exact volgt en een ring die er met
 * vertraging achteraan komt. De ring staat in `difference`-blendmodus, dus hij
 * keert om boven alles waar hij overheen loopt.
 *
 * Elementen met [data-magnetic] trekken de ring aan én bewegen zelf een stukje
 * mee. Op aanraakschermen gebeurt er niets en blijft de systeemcursor staan.
 */

import { onTick, damp, lerp, clamp, pointer, canHover } from './core.js';

const MAGNET_RANGE = 90;     // px buiten het element waar de aantrekking begint
const MAGNET_PULL = 0.32;    // hoe ver het element zelf meebeweegt

export function initCursor() {
    if (!canHover) return null;

    const root = document.createElement('div');
    root.className = 'cursor';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
        <div class="cursor__ring"><span class="cursor__label"></span></div>
        <div class="cursor__dot"></div>`;
    document.body.append(root);

    const ring = root.querySelector('.cursor__ring');
    const dot = root.querySelector('.cursor__dot');
    const label = root.querySelector('.cursor__label');

    const state = {
        rx: pointer.x, ry: pointer.y,
        scale: 1, scaleTarget: 1,
        opacity: 0, opacityTarget: 0
    };

    let magnets = [];
    let activeMagnet = null;
    let labelText = '';

    /** Verzamelt de magnetische elementen en meet ze op. */
    function collect() {
        magnets = [...document.querySelectorAll('[data-magnetic]')].map((el) => ({
            el,
            strength: Number(el.dataset.magnetic) || 1,
            rect: null,
            ox: 0,
            oy: 0
        }));
        measure();
    }

    function measure() {
        for (const magnet of magnets) {
            // Meten zonder de eigen verplaatsing, anders loopt hij weg.
            magnet.el.style.transform = '';
            magnet.rect = magnet.el.getBoundingClientRect();
        }
    }

    collect();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('scroll', measure, { passive: true });

    // Nieuw ingeladen inhoud (tracks, nieuws) kan ook magnetisch zijn.
    const observer = new MutationObserver(() => {
        clearTimeout(observer._t);
        observer._t = setTimeout(collect, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    /* --- toestand per soort element --- */

    const INTERACTIVE = 'a, button, input, [role="button"], label';

    document.addEventListener('pointerover', (event) => {
        const target = event.target.closest?.(INTERACTIVE);
        const cover = event.target.closest?.('[data-cursor-label]');

        if (cover) {
            labelText = cover.dataset.cursorLabel || '';
            label.textContent = labelText;
            state.scaleTarget = 3.1;
            root.classList.add('has-label');
        } else if (target) {
            state.scaleTarget = 1.9;
            root.classList.remove('has-label');
            label.textContent = '';
        } else {
            state.scaleTarget = 1;
            root.classList.remove('has-label');
            label.textContent = '';
        }
    });

    document.addEventListener('pointerdown', () => { state.scaleTarget *= 0.78; });
    document.addEventListener('pointerup', () => {
        state.scaleTarget = root.classList.contains('has-label') ? 3.1 : state.scaleTarget / 0.78;
    });

    document.addEventListener('pointermove', () => { state.opacityTarget = 1; }, { once: true });
    document.addEventListener('mouseleave', () => { state.opacityTarget = 0; });
    document.addEventListener('mouseenter', () => { state.opacityTarget = 1; });

    onTick(({ dt }) => {
        // Dichtstbijzijnde magneet zoeken.
        activeMagnet = null;
        let best = Infinity;

        for (const magnet of magnets) {
            const rect = magnet.rect;
            if (!rect || !rect.width) continue;

            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = pointer.x - cx;
            const dy = pointer.y - cy;

            const withinX = Math.abs(dx) < rect.width / 2 + MAGNET_RANGE;
            const withinY = Math.abs(dy) < rect.height / 2 + MAGNET_RANGE;
            const distance = Math.hypot(dx, dy);

            if (withinX && withinY && distance < best) {
                best = distance;
                activeMagnet = { magnet, cx, cy, dx, dy, distance };
            }
        }

        // Elementen terugveren naar hun plek.
        for (const magnet of magnets) {
            const isActive = activeMagnet?.magnet === magnet;
            const targetX = isActive ? activeMagnet.dx * MAGNET_PULL * magnet.strength : 0;
            const targetY = isActive ? activeMagnet.dy * MAGNET_PULL * magnet.strength : 0;

            magnet.ox = damp(magnet.ox, targetX, 11, dt);
            magnet.oy = damp(magnet.oy, targetY, 11, dt);

            if (Math.abs(magnet.ox) > 0.05 || Math.abs(magnet.oy) > 0.05) {
                magnet.el.style.transform = `translate3d(${magnet.ox.toFixed(2)}px, ${magnet.oy.toFixed(2)}px, 0)`;
            } else if (magnet.el.style.transform) {
                magnet.el.style.transform = '';
            }
        }

        // De ring wordt naar het midden van de actieve magneet getrokken.
        let targetX = pointer.x;
        let targetY = pointer.y;

        if (activeMagnet) {
            const grip = clamp(1 - activeMagnet.distance / (MAGNET_RANGE * 2.4), 0, 1);
            targetX = lerp(pointer.x, activeMagnet.cx + activeMagnet.magnet.ox, grip * 0.75);
            targetY = lerp(pointer.y, activeMagnet.cy + activeMagnet.magnet.oy, grip * 0.75);
        }

        state.rx = damp(state.rx, targetX, 14, dt);
        state.ry = damp(state.ry, targetY, 14, dt);
        state.scale = damp(state.scale, state.scaleTarget, 12, dt);
        state.opacity = damp(state.opacity, state.opacityTarget, 10, dt);

        ring.style.transform =
            `translate3d(${state.rx.toFixed(2)}px, ${state.ry.toFixed(2)}px, 0) translate(-50%, -50%) scale(${state.scale.toFixed(3)})`;
        dot.style.transform =
            `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;
        root.style.opacity = state.opacity.toFixed(3);
    });

    document.documentElement.classList.add('has-custom-cursor');
    return { refresh: collect };
}

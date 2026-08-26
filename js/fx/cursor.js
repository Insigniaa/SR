/**
 * Eigen cursor: een kleine stip die de muis exact volgt en een ring die er met
 * vertraging achteraan komt. De ring staat in `difference`-blendmodus, dus hij
 * keert om boven alles waar hij overheen loopt.
 *
 * Er zat hier eerder een magnetisch effect op: knoppen bewogen naar de muis toe
 * en trokken de ring mee. Dat is eruit — een knop die wegschuift terwijl je hem
 * probeert te raken werkt tegen je, en bij knoppen die dicht op elkaar staan
 * (play naast dempen) schoven ze over elkaar heen.
 *
 * Op aanraakschermen gebeurt er niets en blijft de systeemcursor staan.
 */

import { onTick, damp, pointer, canHover } from './core.js';

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
        rx: pointer.x,
        ry: pointer.y,
        scale: 1,
        scaleTarget: 1,
        opacity: 0,
        opacityTarget: 0
    };

    const INTERACTIVE = 'a, button, input, [role="button"], label';

    document.addEventListener('pointerover', (event) => {
        const labelled = event.target.closest?.('[data-cursor-label]');
        const interactive = event.target.closest?.(INTERACTIVE);

        if (labelled) {
            label.textContent = labelled.dataset.cursorLabel || '';
            state.scaleTarget = 3.1;
            root.classList.add('has-label');
        } else {
            label.textContent = '';
            root.classList.remove('has-label');
            state.scaleTarget = interactive ? 1.9 : 1;
        }
    });

    document.addEventListener('pointerdown', () => { state.pressed = true; });
    document.addEventListener('pointerup', () => { state.pressed = false; });

    document.addEventListener('pointermove', () => { state.opacityTarget = 1; }, { once: true });
    document.addEventListener('mouseleave', () => { state.opacityTarget = 0; });
    document.addEventListener('mouseenter', () => { state.opacityTarget = 1; });

    onTick(({ dt }) => {
        state.rx = damp(state.rx, pointer.x, 14, dt);
        state.ry = damp(state.ry, pointer.y, 14, dt);

        const target = state.scaleTarget * (state.pressed ? 0.78 : 1);
        state.scale = damp(state.scale, target, 12, dt);
        state.opacity = damp(state.opacity, state.opacityTarget, 10, dt);

        ring.style.transform =
            `translate3d(${state.rx.toFixed(2)}px, ${state.ry.toFixed(2)}px, 0) `
            + `translate(-50%, -50%) scale(${state.scale.toFixed(3)})`;
        dot.style.transform =
            `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;
        root.style.opacity = state.opacity.toFixed(3);
    });

    document.documentElement.classList.add('has-custom-cursor');
}

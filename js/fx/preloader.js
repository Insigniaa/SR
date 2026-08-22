/**
 * Intro met teller.
 *
 * De teller loopt mee met de werkelijke voortgang (lettertypes, hoes, eerste
 * data) en gaat nooit terug. Als alles binnen is klapt het scherm open en
 * komt de hero gestaffeld in beeld.
 */

import { onTick, damp, clamp, ease, reducedMotion } from './core.js';

export function initPreloader() {
    const root = document.getElementById('intro');
    if (!root) return { set() { }, finish: () => Promise.resolve() };

    const number = root.querySelector('.intro__count');
    const bar = root.querySelector('.intro__bar span');

    let target = 0;
    let shown = 0;
    let finished = false;
    let stopTick = null;

    const paint = () => {
        const value = Math.round(shown * 100);
        if (number) number.textContent = String(value).padStart(3, '0');
        if (bar) bar.style.transform = `scaleX(${shown.toFixed(4)})`;
    };

    if (!reducedMotion.matches) {
        stopTick = onTick(({ dt }) => {
            shown = damp(shown, target, 3.4, dt);
            paint();
        });
    }

    return {
        /** @param {number} value 0..1 — loopt alleen vooruit */
        set(value) {
            target = clamp(Math.max(target, value), 0, 1);
            if (reducedMotion.matches) {
                shown = target;
                paint();
            }
        },

        finish() {
            if (finished) return Promise.resolve();
            finished = true;
            target = 1;

            return new Promise((resolve) => {
                const done = () => {
                    shown = 1;
                    paint();
                    stopTick?.();

                    root.classList.add('is-out');
                    document.body.classList.remove('is-booting');
                    document.documentElement.classList.add('is-ready');

                    const cleanup = () => {
                        root.remove();
                        resolve();
                    };

                    if (reducedMotion.matches) {
                        // Geen transitie, dus ook niet wachten op transitionend.
                        requestAnimationFrame(cleanup);
                        return;
                    }

                    root.addEventListener('transitionend', cleanup, { once: true });
                    setTimeout(cleanup, 1600);   // vangnet
                };

                if (reducedMotion.matches) {
                    done();
                    return;
                }

                // Even laten uitlopen zodat 100 ook echt gelezen wordt.
                const wait = () => {
                    if (shown > 0.985) {
                        setTimeout(done, 260);
                    } else {
                        requestAnimationFrame(wait);
                    }
                };
                wait();
            });
        }
    };
}

export { ease };

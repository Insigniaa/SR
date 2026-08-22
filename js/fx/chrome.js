/**
 * Losse sierstukken: de oneindige ticker en de 3D-tilt op kaarten.
 */

import { onTick, damp, clamp, viewport, canHover, reducedMotion } from './core.js';
import { scrollState } from './scroll.js';

/* ================================================================= ticker */

/**
 * Oneindig doorlopende tekstband. De inhoud wordt net zo vaak gedupliceerd tot
 * hij twee schermbreedtes vult, waarna hij precies één kopie opschuift en
 * terugspringt — zonder zichtbare naad.
 *
 * De snelheid reageert op de scroll: hard naar beneden scrollen versnelt hem,
 * omhoog draait hem om. Dat kost niets en verkoopt de hele pagina.
 */
export class Marquee {
    constructor(el, { speed = 55 } = {}) {
        this.el = el;
        this.track = el?.querySelector('.marquee__track');
        this.baseSpeed = speed;
        this.offset = 0;
        this.width = 0;
        this.direction = 1;

        if (!this.track) return;

        this.original = this.track.innerHTML;
        this.text = null;
        this.build();

        window.addEventListener('resize', () => this.build(), { passive: true });
        onTick((clock) => this.render(clock));
    }

    build() {
        this.track.innerHTML = this.original;
        this.paint();

        const single = this.track.firstElementChild;
        if (!single) return;

        const unit = single.getBoundingClientRect().width;
        if (!unit) return;

        const needed = Math.ceil((viewport.w * 2) / unit) + 1;
        for (let i = 1; i < needed; i += 1) {
            const clone = single.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            this.track.append(clone);
        }

        this.paint();
        this.width = unit;
    }

    /** Zet nieuwe tekst. De breedte verandert mee, dus opnieuw opbouwen. */
    setText(text) {
        if (!this.track || text === this.text) return;
        this.text = text;
        // Opbouwen zet de tekst zelf ook weer terug; zonder dat zou build()
        // de nieuwe tekst overschrijven met de oorspronkelijke opmaak.
        requestAnimationFrame(() => this.build());
    }

    paint() {
        if (!this.text) return;
        this.track.querySelectorAll('[data-marquee-text]').forEach((node) => {
            node.textContent = this.text;
        });
    }

    render({ dt }) {
        // Bij prefers-reduced-motion blijft de band staan; de tekst is dan nog
        // gewoon leesbaar, hij schuift alleen niet.
        if (!this.width || reducedMotion.matches) return;

        const boost = scrollState.velocity * 9;
        const speed = this.baseSpeed + Math.abs(boost) * this.baseSpeed * 0.6;
        this.direction = damp(this.direction, scrollState.velocity < -0.02 ? -1 : 1, 5, dt);

        this.offset -= speed * dt * this.direction;

        // Terugvouwen zodra we een hele kopie verschoven zijn.
        if (this.offset <= -this.width) this.offset += this.width;
        if (this.offset > 0) this.offset -= this.width;

        this.track.style.transform = `translate3d(${this.offset.toFixed(2)}px, 0, 0)`;
    }
}

export function initMarquees() {
    // Let op: `data-speed` is van de parallax in scroll.js. De ticker gebruikt
    // bewust een eigen attribuut, anders krijgt hij een verticale parallax van
    // vijftig keer de scrollafstand.
    return [...document.querySelectorAll('.marquee')].map((el) => new Marquee(el, {
        speed: Number(el.dataset.marqueeSpeed) || 55
    }));
}

/* =================================================================== tilt */

/**
 * Kaart die naar de muis toe kantelt, met een glans die meebeweegt.
 * Alleen op apparaten met een echte muisaanwijzer.
 */
export function initTilt() {
    if (!canHover || reducedMotion.matches) return;

    document.querySelectorAll('[data-tilt]').forEach((el) => setupTilt(el));

    // Ook kaarten die later gerenderd worden.
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches?.('[data-tilt]')) setupTilt(node);
                node.querySelectorAll?.('[data-tilt]').forEach((child) => setupTilt(child));
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function setupTilt(el) {
    if (el.dataset.tiltReady) return;
    el.dataset.tiltReady = '1';

    const max = Number(el.dataset.tilt) || 6;
    const state = { rx: 0, ry: 0, tx: 0, ty: 0, glare: 0, gx: 50, gy: 50, active: 0 };
    let stop = null;

    el.addEventListener('pointerenter', () => {
        state.active = 1;
        if (!stop) stop = onTick(({ dt }) => frame(dt));
    });

    el.addEventListener('pointermove', (event) => {
        const rect = el.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;

        state.ty = (px - 0.5) * 2 * max;
        state.rx = -(py - 0.5) * 2 * max;
        state.gx = px * 100;
        state.gy = py * 100;
    }, { passive: true });

    el.addEventListener('pointerleave', () => {
        state.active = 0;
        state.ty = 0;
        state.rx = 0;
    });

    function frame(dt) {
        state.tx = damp(state.tx, state.rx, 10, dt);
        state.ry = damp(state.ry, state.ty, 10, dt);
        state.glare = damp(state.glare, state.active, 8, dt);

        el.style.setProperty('--rx', `${state.tx.toFixed(2)}deg`);
        el.style.setProperty('--ry', `${state.ry.toFixed(2)}deg`);
        el.style.setProperty('--glare', state.glare.toFixed(3));
        el.style.setProperty('--gx', `${state.gx.toFixed(1)}%`);
        el.style.setProperty('--gy', `${state.gy.toFixed(1)}%`);

        if (!state.active && Math.abs(state.tx) < 0.02 && Math.abs(state.ry) < 0.02 && state.glare < 0.01) {
            el.style.removeProperty('--rx');
            el.style.removeProperty('--ry');
            stop?.();
            stop = null;
        }
    }
}

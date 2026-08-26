/**
 * De sessielijn: de vorm van je luistersessie, van het moment dat je
 * aanzette tot nu.
 *
 * Elk punt is een gemeten geluidsniveau, gekleurd naar het programma dat op dat
 * moment liep. Wissel je van Love Zone naar Night, dan zie je de kleur in de
 * lijn overgaan. Sla je de radio een half uur aan, dan staat daar een half uur
 * uitzending getekend die alleen jij hebt gehoord.
 */

import { onTick, viewport, damp, reducedMotion } from './fx/core.js';

export class SessionRibbon {
    constructor(canvas, memory) {
        this.canvas = canvas;
        this.memory = memory;
        this.ctx = canvas?.getContext('2d');
        this.zichtbaar = true;
        this.verschijning = 0;

        if (!this.ctx) return;

        this.resize = this.resize.bind(this);
        new ResizeObserver(this.resize).observe(canvas);
        this.resize();

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(([e]) => { this.zichtbaar = e.isIntersecting; })
                .observe(canvas);
        }

        // Twee keer per seconde is ruim genoeg: de lijn groeit langzaam.
        this.laatst = 0;
        onTick(({ t, dt }) => {
            this.verschijning = damp(this.verschijning, this.memory.heeftInhoud ? 1 : 0, 3, dt);
            if (!this.zichtbaar) return;
            if (t - this.laatst < 0.5) return;
            this.laatst = t;
            this.teken();
        });
    }

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const { width, height } = this.canvas.getBoundingClientRect();
        if (!width || !height) return;

        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.breedte = width;
        this.hoogte = height;
        this.teken();
    }

    teken() {
        const { ctx, breedte: w, hoogte: h } = this;
        if (!ctx || !w) return;

        ctx.clearRect(0, 0, w, h);

        const punten = this.memory.punten;
        if (punten.length < 2) return;

        ctx.globalAlpha = this.verschijning;

        const midden = h / 2;
        const stap = w / punten.length;
        const breed = Math.max(1, stap * 0.72);

        for (let i = 0; i < punten.length; i += 1) {
            const p = punten[i];
            const x = i * stap;

            // Symmetrisch om de middellijn: leest als een geluidsgolf, niet
            // als een staafdiagram.
            const hoog = Math.max(1, p.v ** 0.75 * h * 0.46);

            ctx.fillStyle = p.kleur;
            ctx.globalAlpha = this.verschijning * (0.35 + p.v * 0.65);
            ctx.beginPath();
            ctx.roundRect(x, midden - hoog, breed, hoog * 2, breed / 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }
}

/** "1 uur 12 min" — leesbare duur voor onder de lijn. */
export function formatDuur(seconden) {
    const m = Math.floor(seconden / 60);
    if (m < 1) return 'net begonnen';
    if (m < 60) return `${m} min`;
    const u = Math.floor(m / 60);
    return `${u} uur ${m % 60} min`;
}

export { reducedMotion };

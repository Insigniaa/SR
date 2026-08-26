/**
 * De sessielijn: de vorm van je luistersessie, van het moment dat je
 * aanzette tot nu.
 *
 * Elk punt is een gemeten geluidsniveau, gekleurd naar het programma dat op dat
 * moment liep. Wissel je van Love Zone naar Night, dan zie je de kleur in de
 * lijn overgaan. Sla je de radio een half uur aan, dan staat daar een half uur
 * uitzending getekend die alleen jij hebt gehoord.
 */

import { onTick, damp, reducedMotion } from './fx/core.js';
import { MAX_PUNTEN } from './memory.js';

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

        // Vaste steek: de lijn groeit van links naar rechts mee met de sessie
        // in plaats van uitgesmeerd te worden. Pas als de buffer vol zit
        // (MAX_PUNTEN) vult hij precies de breedte, en halveert het geheugen
        // zichzelf om ruimte te maken.
        const steek = w / MAX_PUNTEN;
        const breed = Math.max(1.5, steek * 0.62);

        // Radio is zwaar gecomprimeerd: het ruwe niveau schommelt maar weinig,
        // en zonder herschaling wordt elke golfvorm een massief blok. Daarom
        // rekken we het bereik van deze sessie open naar de volle hoogte.
        let laag = 1;
        let hoogst = 0;
        for (const p of punten) {
            if (p.v < laag) laag = p.v;
            if (p.v > hoogst) hoogst = p.v;
        }
        const spanwijdte = Math.max(0.04, hoogst - laag);

        for (let i = 0; i < punten.length; i += 1) {
            const p = punten[i];
            const genormaliseerd = (p.v - laag) / spanwijdte;
            const hoog = Math.max(1.5, (0.12 + genormaliseerd * 0.88) * h * 0.46);

            ctx.fillStyle = p.kleur;
            ctx.globalAlpha = this.verschijning * (0.4 + genormaliseerd * 0.6);
            ctx.beginPath();
            ctx.roundRect(i * steek, midden - hoog, breed, hoog * 2, breed / 2);
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

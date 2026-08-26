/**
 * Levende favicon.
 *
 * Het tabbladpictogram krijgt de kleur van de hoes die speelt en pulseert mee
 * op de beat. Zo zie je aan een tabblad op de achtergrond nog dat er muziek
 * loopt — en welke sfeer.
 */

import { onTick, energy, reducedMotion } from './fx/core.js';

const MAAT = 64;

export function initLiveFavicon() {
    if (reducedMotion.matches) return;

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    document.head.append(link);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = MAAT;
    const ctx = canvas.getContext('2d');

    let laatst = 0;
    let vorigeStaat = '';

    onTick(({ t }) => {
        // Vier keer per seconde is genoeg; vaker kost alleen maar werk.
        if (t - laatst < 0.25) return;
        laatst = t;

        const stijl = getComputedStyle(document.documentElement);
        const kleur = stijl.getPropertyValue('--accent').trim() || '#FF4230';
        const puls = energy.value * (0.25 + energy.level * 0.9 + energy.beat * 0.5);

        // Niets veranderd? Dan ook niet opnieuw tekenen.
        const staat = `${kleur}|${puls.toFixed(2)}`;
        if (staat === vorigeStaat) return;
        vorigeStaat = staat;

        ctx.clearRect(0, 0, MAAT, MAAT);

        // Afgeronde vierkante achtergrond in de kleur van het nummer.
        ctx.fillStyle = kleur;
        ctx.beginPath();
        ctx.roundRect(0, 0, MAAT, MAAT, MAAT * 0.28);
        ctx.fill();

        // Kern plus twee bogen: hetzelfde signaalmerk als in de kop.
        const cx = MAAT / 2;
        const cy = MAAT / 2;
        const r = MAAT * 0.13 * (1 + puls * 0.35);

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        for (let i = 1; i <= 2; i += 1) {
            const straal = MAAT * (0.13 + 0.11 * i) * (1 + puls * 0.22);
            ctx.lineWidth = MAAT * 0.075;
            ctx.globalAlpha = 1 - i * 0.22;
            ctx.beginPath();
            ctx.arc(cx, cy, straal, -0.9, 0.9);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, straal, Math.PI - 0.9, Math.PI + 0.9);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        link.href = canvas.toDataURL('image/png');
    });
}

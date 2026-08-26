/**
 * Deelkaart: tekent het nummer dat nu speelt als afbeelding.
 *
 * Op een telefoon gaat hij via het deelmenu rechtstreeks naar WhatsApp of
 * Instagram; op een desktop wordt hij gedownload. Zo kan iemand die iets moois
 * hoort dat in één handeling doorsturen — de sterkste gratis reclame die een
 * zender heeft.
 */

import { STATION_PAGE } from './config.js';

const MAAT = 1080;

/** Laadt een afbeelding zonder het canvas te vervuilen. */
function laadAfbeelding(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/** Breekt tekst af op woordgrenzen binnen een breedte. */
function breekAf(ctx, tekst, maxBreedte, maxRegels) {
    const woorden = String(tekst).replace(/​/g, '').split(/\s+/);
    const regels = [];
    let huidig = '';

    for (const woord of woorden) {
        const kandidaat = huidig ? `${huidig} ${woord}` : woord;
        if (ctx.measureText(kandidaat).width <= maxBreedte || !huidig) {
            huidig = kandidaat;
        } else {
            regels.push(huidig);
            huidig = woord;
            if (regels.length === maxRegels) break;
        }
    }
    if (huidig && regels.length < maxRegels) regels.push(huidig);

    // Laatste regel afkappen als er nog meer was.
    if (regels.length === maxRegels) {
        let laatste = regels[maxRegels - 1];
        while (ctx.measureText(`${laatste}…`).width > maxBreedte && laatste.length > 1) {
            laatste = laatste.slice(0, -1);
        }
        if (laatste !== regels[maxRegels - 1]) regels[maxRegels - 1] = `${laatste}…`;
    }
    return regels;
}

/** Leest een CSS-kleur uit de wortel, met terugval. */
function kleur(naam, terugval) {
    const waarde = getComputedStyle(document.documentElement).getPropertyValue(naam).trim();
    return waarde || terugval;
}

/**
 * Tekent de kaart.
 * @returns {Promise<Blob|null>}
 */
export async function tekenDeelkaart({ title, artist, image }) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = MAAT;
    const ctx = canvas.getContext('2d');

    const accent = kleur('--accent', '#FF4230');
    const accent2 = kleur('--accent-2', '#FFB020');

    // Achtergrond: verloop in de kleuren van de hoes.
    const verloop = ctx.createLinearGradient(0, 0, MAAT, MAAT);
    verloop.addColorStop(0, '#0B0A09');
    verloop.addColorStop(0.55, accent);
    verloop.addColorStop(1, accent2);
    ctx.fillStyle = verloop;
    ctx.fillRect(0, 0, MAAT, MAAT);

    // Donkere sluier zodat witte tekst overal leesbaar blijft.
    const sluier = ctx.createLinearGradient(0, MAAT * 0.35, 0, MAAT);
    sluier.addColorStop(0, 'rgba(6,5,5,0)');
    sluier.addColorStop(1, 'rgba(6,5,5,0.88)');
    ctx.fillStyle = sluier;
    ctx.fillRect(0, 0, MAAT, MAAT);

    // De hoes, met ronde hoeken en een schaduw.
    const hoes = await laadAfbeelding(image);
    if (hoes) {
        const m = MAAT * 0.135;
        const zijde = MAAT * 0.46;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 60;
        ctx.shadowOffsetY = 24;
        ctx.beginPath();
        ctx.roundRect(m, m, zijde, zijde, MAAT * 0.038);
        ctx.closePath();
        ctx.fill();
        ctx.clip();
        ctx.shadowColor = 'transparent';
        ctx.drawImage(hoes, m, m, zijde, zijde);
        ctx.restore();
    }

    const m = MAAT * 0.135;
    let y = MAAT * 0.70;

    // Kop boven de titel
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `500 ${Math.round(MAAT * 0.026)}px 'IBM Plex Mono', monospace`;
    ctx.letterSpacing = '4px';
    ctx.fillText('NU OP SUPER RADIO', m, y);
    ctx.letterSpacing = '0px';

    // Titel: schaalt mee met de lengte
    y += MAAT * 0.062;
    const titelGrootte = title.length > 42 ? 0.055 : title.length > 24 ? 0.068 : 0.082;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(MAAT * titelGrootte)}px Archivo, system-ui, sans-serif`;
    const regels = breekAf(ctx, title, MAAT - m * 2, 2);
    for (const regel of regels) {
        ctx.fillText(regel, m, y);
        y += MAAT * titelGrootte * 1.12;
    }

    // Artiest
    y += MAAT * 0.012;
    ctx.fillStyle = accent2;
    ctx.font = `600 ${Math.round(MAAT * 0.040)}px Archivo, system-ui, sans-serif`;
    ctx.fillText(breekAf(ctx, artist, MAAT - m * 2, 1)[0] || '', m, y);

    // Voet met het adres
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `500 ${Math.round(MAAT * 0.026)}px 'IBM Plex Mono', monospace`;
    ctx.fillText('superradio.live', m, MAAT - MAAT * 0.075);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

/**
 * Deelt de kaart, of downloadt hem als delen niet kan.
 * @returns {Promise<'gedeeld'|'gedownload'|'geannuleerd'|'mislukt'>}
 */
export async function deelKaart(track) {
    let blob;
    try {
        blob = await tekenDeelkaart(track);
    } catch {
        return 'mislukt';
    }
    if (!blob) return 'mislukt';

    const naam = `super-radio-${(track.title || 'nu').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'nu'}.jpg`;
    const bestand = new File([blob], naam, { type: 'image/jpeg' });

    if (navigator.canShare?.({ files: [bestand] })) {
        try {
            await navigator.share({
                files: [bestand],
                text: `${track.title} — ${track.artist}, nu op Super Radio.`
            });
            return 'gedeeld';
        } catch (error) {
            if (error?.name === 'AbortError') return 'geannuleerd';
        }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = naam;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'gedownload';
}

export { STATION_PAGE };

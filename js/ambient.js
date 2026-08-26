/**
 * Sfeerlaag: haalt kleuren uit de albumhoes, schildert daarmee de achtergrond
 * en tekent het spectrum onder de speler.
 *
 * Vervangt het oude visualizer.js. Belangrijkste verschillen: de kleuranalyse
 * gebeurt op een miniatuur in plaats van op de volledige afbeelding, het canvas
 * schaalt mee met devicePixelRatio, en alle animatie stopt zodra het tabblad
 * verborgen is of de gebruiker minder beweging wil.
 */

import { clamp, prefersReducedMotion } from './utils.js';

/* ============================================================ kleuranalyse */

const SAMPLE_SIZE = 48;   // 48x48 = 2304 pixels; genoeg voor een kleurindruk
const paletteCache = new Map();

/**
 * Haalt drie sfeerkleuren uit een afbeelding.
 * @returns {Promise<{primary:string, secondary:string, accent:string}|null>}
 */
export async function extractPalette(src) {
    if (!src) return null;
    if (paletteCache.has(src)) return paletteCache.get(src);

    const palette = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = SAMPLE_SIZE;

                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

                resolve(analyze(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)));
            } catch {
                // Afbeelding van een andere origin zonder CORS: canvas is tainted.
                resolve(null);
            }
        };

        img.onerror = () => resolve(null);
        img.src = src;
    });

    paletteCache.set(src, palette);
    return palette;
}

function analyze(imageData) {
    const { data } = imageData;
    const buckets = new Map();

    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const [h, s, l] = rgbToHsl(r, g, b);
        if (l < 0.12 || l > 0.94) continue;     // bijna zwart of bijna wit overslaan

        const key = `${Math.round(r / 24)}|${Math.round(g / 24)}|${Math.round(b / 24)}`;
        const entry = buckets.get(key);

        if (entry) {
            entry.count += 1;
        } else {
            buckets.set(key, { r, g, b, h, s, l, count: 1 });
        }
    }

    if (!buckets.size) return null;

    // Score = hoe vaak de kleur voorkomt x hoe levendig hij is.
    const ranked = [...buckets.values()]
        .map((c) => ({ ...c, score: Math.sqrt(c.count) * (0.35 + c.s) * (1 - Math.abs(c.l - 0.55)) }))
        .sort((a, b) => b.score - a.score);

    const primary = ranked[0];
    const secondary = ranked.find((c) => hueDistance(c.h, primary.h) > 0.08) || ranked[1] || primary;
    const accent = ranked.find((c) =>
        hueDistance(c.h, primary.h) > 0.14 && hueDistance(c.h, secondary.h) > 0.1) || secondary;

    const toCss = (c) => `rgb(${c.r} ${c.g} ${c.b})`;
    const toHsl = (c) => [c.h, c.s, c.l];

    return {
        primary: toCss(primary), secondary: toCss(secondary), accent: toCss(accent),
        primaryHsl: toHsl(primary), secondaryHsl: toHsl(secondary)
    };
}

function hueDistance(a, b) {
    const d = Math.abs(a - b);
    return Math.min(d, 1 - d);
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) return [0, 0, l];

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;

    return [h, s, l];
}

/* ============================================================ accentkleur */

const hslCss = (h, s, l) =>
    `hsl(${(h * 360).toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;

const isLightTheme = () => {
    const explicit = document.documentElement.dataset.theme;
    return explicit
        ? explicit === 'light'
        : window.matchMedia('(prefers-color-scheme: light)').matches;
};

/**
 * Zet de kleuren van de hoes om in bruikbare accenttokens.
 *
 * De ruwe kleur uit een hoes is vaak onbruikbaar als UI-kleur: te donker, te
 * grauw, of juist zo fel dat tekst erop wegvalt. Daarom wordt de verzadiging
 * opgetrokken tot een minimum en de helderheid in een band geduwd die op het
 * huidige thema leesbaar blijft - donkerder op een lichte pagina, lichter op
 * een donkere. De tint blijft ongemoeid, want die maakt het herkenbaar.
 */
function applyPalette(palette) {
    if (!palette) return;

    const root = document.documentElement;
    const light = isLightTheme();

    const [h, s, l] = palette.primaryHsl;
    const sat = clamp(Math.max(s, 0.5), 0, 0.95);
    const lum = light ? clamp(l, 0.34, 0.48) : clamp(l, 0.55, 0.70);

    root.style.setProperty('--accent', hslCss(h, sat, lum));
    root.style.setProperty('--accent-soft', hslCss(h, sat * 0.95, clamp(lum + 0.10, 0, 0.92)));
    root.style.setProperty('--accent-deep', hslCss(h, Math.min(sat * 1.05, 1), clamp(lum - 0.16, 0.10, 1)));

    // Tweede tint voor verlopen. Ligt de secundaire kleur te dicht bij de
    // eerste, dan schuiven we hem op zodat het verloop zichtbaar blijft.
    let [h2, s2, l2] = palette.secondaryHsl;
    if (Math.min(Math.abs(h2 - h), 1 - Math.abs(h2 - h)) < 0.05) h2 = (h + 0.09) % 1;

    root.style.setProperty('--accent-2', hslCss(
        h2,
        clamp(Math.max(s2, 0.45), 0, 0.95),
        light ? clamp(l2, 0.40, 0.56) : clamp(l2, 0.58, 0.74)
    ));

    // Ruwe kleuren blijven voor sfeer: gloed en spectrum mogen wel donker of
    // bleek zijn, daar staat geen tekst op.
    root.style.setProperty('--dyn-1', palette.primary);
    root.style.setProperty('--dyn-2', palette.secondary);
    root.style.setProperty('--dyn-3', palette.accent);
}

/* ========================================================= achtergrondlaag */

export class Ambient {
    constructor(root = document.querySelector('.ambient')) {
        this.layers = root ? [...root.querySelectorAll('.ambient__layer')] : [];
        this.active = 0;
        this.current = null;
        this.palette = null;

        // Alleen de geblurde afbeeldinglagen zijn overbodig als de shader
        // draait; de kleuren zijn dat nooit.
        this.useLayers = true;

        // Bij een themawissel moet de accentkleur opnieuw genormaliseerd
        // worden: wat leesbaar is op zwart is dat niet op crème.
        const repaint = () => applyPalette(this.palette);
        document.addEventListener('sr:theme', repaint);
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', repaint);
    }

    /** @param {boolean} enabled false zodra de WebGL-achtergrond het overneemt */
    setLayersEnabled(enabled) {
        this.useLayers = enabled;
    }

    /** Wisselt de achtergrond en de sfeerkleuren naar de nieuwe hoes. */
    async apply(src) {
        if (!src || src === this.current) return;
        this.current = src;

        if (this.useLayers && this.layers.length) {
            const next = this.layers[(this.active + 1) % this.layers.length];
            next.style.backgroundImage = `url("${src.replace(/["'\\()]/g, '')}")`;
            next.classList.add('is-on');
            this.layers[this.active]?.classList.remove('is-on');
            this.active = (this.active + 1) % this.layers.length;
        }

        this.palette = await extractPalette(src);
        applyPalette(this.palette);
    }
}

/* ================================================================ spectrum */

/**
 * Spectrum onder de speler.
 *
 * Tekent bij voorkeur het werkelijke frequentiebeeld van de stream. Dat kan
 * omdat de uitzendserver van laut.fm CORS toestaat voor superradio.live - zie
 * de toelichting bij STREAM_DIRECT in config.js. Staat de analyse niet ter
 * beschikking (ander domein, oudere browser), dan valt hij terug op een
 * geanimeerd patroon dat alleen de afspeelstatus weergeeft.
 */
export class Spectrum {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas?.getContext('2d');
        this.bars = 64;
        this.levels = new Array(this.bars).fill(0);
        this.targets = new Array(this.bars).fill(0);
        this.phase = 0;
        this.energy = 0;          // 0 = gepauzeerd, 1 = speelt
        this.targetEnergy = 0;
        this.raf = null;
        this.running = false;

        if (!this.ctx) return;

        this.resize = this.resize.bind(this);
        this.tick = this.tick.bind(this);

        this.observer = new ResizeObserver(this.resize);
        this.observer.observe(canvas);
        this.resize();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stop();
            else this.start();
        });

        this.start();
    }

    setPlaying(playing) {
        this.targetEnergy = playing ? 1 : 0;
        if (playing) this.start();
    }

    /** Koppelt de speler; vanaf dan tekent hij de echte frequenties. */
    setSource(player) {
        this.player = player;
    }

    resize() {
        if (!this.ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const { width, height } = this.canvas.getBoundingClientRect();
        if (!width || !height) return;

        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = width;
        this.height = height;
    }

    start() {
        if (this.running || !this.ctx || document.hidden) return;
        this.running = true;
        this.raf = requestAnimationFrame(this.tick);
    }

    stop() {
        this.running = false;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
    }

    tick() {
        if (!this.running) return;

        this.energy += (this.targetEnergy - this.energy) * 0.045;
        this.phase += prefersReducedMotion() ? 0 : 0.022;
        this.draw();

        // Volledig tot rust gekomen en niets te tonen: animatie stoppen.
        if (!this.player?.canAnalyse && this.energy < 0.004 && Math.max(...this.levels) < 0.004) {
            this.stop();
            return;
        }

        this.raf = requestAnimationFrame(this.tick);
    }

    draw() {
        const { ctx, width, height } = this;
        if (!ctx || !width) return;

        ctx.clearRect(0, 0, width, height);

        const styles = getComputedStyle(document.documentElement);
        const c1 = styles.getPropertyValue('--dyn-1').trim() || '#FF4230';
        const c2 = styles.getPropertyValue('--dyn-2').trim() || '#FFB020';

        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, c1);
        gradient.addColorStop(1, c2);
        ctx.fillStyle = gradient;

        const gap = 3;
        const barWidth = Math.max(2, (width - gap * (this.bars - 1)) / this.bars);
        const baseline = height;

        const fft = this.player?.canAnalyse ? this.player.spectrum : null;

        for (let i = 0; i < this.bars; i += 1) {
            const n = i / this.bars;

            if (fft) {
                // Logaritmisch verdelen: het gehoor werkt zo, en anders zit
                // alle beweging in de eerste paar balkjes.
                const van = Math.floor((fft.length - 1) * (n ** 1.7));
                const tot = Math.max(van + 1,
                    Math.floor((fft.length - 1) * (((i + 1) / this.bars) ** 1.7)));

                let som = 0;
                for (let k = van; k < tot; k += 1) som += fft[k];
                this.targets[i] = clamp((som / (tot - van)) / 255, 0, 1);
            } else {
                // Terugval: drie sinussen geven een onregelmatig patroon.
                const wave =
                    Math.sin(this.phase * 1.7 + i * 0.34) * 0.5 +
                    Math.sin(this.phase * 0.9 + i * 0.13) * 0.32 +
                    Math.sin(this.phase * 2.6 + i * 0.71) * 0.18;
                const envelope = 0.35 + 0.65 * Math.sin(Math.PI * n) ** 0.7;
                this.targets[i] = clamp((0.5 + wave * 0.5) * envelope * this.energy, 0, 1);
            }

            // Echte data mag sneller volgen dan het rustige terugvalpatroon.
            this.levels[i] += (this.targets[i] - this.levels[i]) * (fft ? 0.4 : 0.22);

            const barHeight = Math.max(2, this.levels[i] * height * 0.92);
            const x = i * (barWidth + gap);

            ctx.globalAlpha = 0.25 + this.levels[i] * 0.75;
            ctx.beginPath();
            ctx.roundRect(x, baseline - barHeight, barWidth, barHeight, barWidth / 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }
}

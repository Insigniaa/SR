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
    return { primary: toCss(primary), secondary: toCss(secondary), accent: toCss(accent) };
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

/* ========================================================= achtergrondlaag */

export class Ambient {
    constructor(root = document.querySelector('.ambient')) {
        this.layers = root ? [...root.querySelectorAll('.ambient__layer')] : [];
        this.active = 0;
        this.current = null;
    }

    /** Wisselt de achtergrond en de sfeerkleuren naar de nieuwe hoes. */
    async apply(src) {
        if (!src || src === this.current) return;
        this.current = src;

        if (this.layers.length) {
            const next = this.layers[(this.active + 1) % this.layers.length];
            next.style.backgroundImage = `url("${src.replace(/["'\\()]/g, '')}")`;
            next.classList.add('is-on');
            this.layers[this.active]?.classList.remove('is-on');
            this.active = (this.active + 1) % this.layers.length;
        }

        const palette = await extractPalette(src);
        if (!palette) return;

        const root = document.documentElement;
        root.style.setProperty('--dyn-1', palette.primary);
        root.style.setProperty('--dyn-2', palette.secondary);
        root.style.setProperty('--dyn-3', palette.accent);
    }
}

/* ================================================================ spectrum */

/**
 * Decoratief spectrum.
 *
 * Bewust géén WebAudio-analyser: de laut.fm-stream stuurt geen CORS-headers, en
 * een MediaElementSource op zo'n bron levert in de meeste browsers stilte op —
 * de visualisatie zou dan de audio slopen. Dit is dus een geanimeerde weergave
 * van de afspeelstatus, niet van het werkelijke signaal.
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
        if (this.energy < 0.004 && Math.max(...this.levels) < 0.004) {
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

        for (let i = 0; i < this.bars; i += 1) {
            // Drie sinussen met verschillende frequenties geven een onregelmatig,
            // organisch patroon in plaats van een zichtbare golf.
            const n = i / this.bars;
            const wave =
                Math.sin(this.phase * 1.7 + i * 0.34) * 0.5 +
                Math.sin(this.phase * 0.9 + i * 0.13) * 0.32 +
                Math.sin(this.phase * 2.6 + i * 0.71) * 0.18;

            // Naar het midden toe hoger, zoals een echt spectrum.
            const envelope = 0.35 + 0.65 * Math.sin(Math.PI * n) ** 0.7;
            this.targets[i] = clamp((0.5 + wave * 0.5) * envelope * this.energy, 0, 1);
            this.levels[i] += (this.targets[i] - this.levels[i]) * 0.22;

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

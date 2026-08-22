/**
 * Tekst- en beeldonthullingen, plus het scramble-effect op de tracktitel.
 */

import { onTick, clamp, reducedMotion } from './core.js';

/* ============================================================ tekst splitsen */

/**
 * Splitst een element op in woorden, elk in een venster met overflow:hidden,
 * zodat ze van onderaf omhoog kunnen schuiven.
 *
 * De opgeknipte structuur krijgt aria-hidden en het element zelf een
 * aria-label, anders lezen sommige schermlezers de tekst woord voor woord voor
 * alsof het losse zinnen zijn.
 */
export function splitWords(el) {
    if (!el || el.dataset.split === 'done') return;

    // Alleen platte tekst splitsen. Zat er opmaak in — een icoon, een link —
    // dan zou replaceChildren die weggooien, dus laten we het element met rust.
    if (el.firstElementChild) {
        el.dataset.split = 'done';
        return;
    }

    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;

    el.setAttribute('aria-label', text);

    const fragment = document.createDocumentFragment();
    const words = text.split(' ');

    words.forEach((word, index) => {
        const outer = document.createElement('span');
        outer.className = 'w';
        outer.setAttribute('aria-hidden', 'true');

        const inner = document.createElement('span');
        inner.className = 'w__i';
        inner.style.setProperty('--i', String(index));
        inner.textContent = word;

        outer.append(inner);
        fragment.append(outer);

        if (index < words.length - 1) fragment.append(document.createTextNode(' '));
    });

    el.replaceChildren(fragment);
    el.dataset.split = 'done';
}

/* ================================================================ observer */

/**
 * Zet `.is-in` op elementen zodra ze in beeld komen. Werkt met
 * IntersectionObserver; die houdt rekening met transforms, dus ook wanneer de
 * pagina door de smooth scroll verplaatst wordt.
 */
export function initReveals() {
    const headings = document.querySelectorAll('[data-split]');
    headings.forEach(splitWords);

    const targets = document.querySelectorAll('[data-reveal], [data-split]');
    if (!targets.length) return;

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
        targets.forEach((el) => el.classList.add('is-in'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
        }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

    targets.forEach((el) => observer.observe(el));

    // Nieuw gerenderde blokken ook meenemen.
    return {
        observe(root = document) {
            root.querySelectorAll?.('[data-split]').forEach(splitWords);
            root.querySelectorAll?.('[data-reveal], [data-split]').forEach((el) => {
                if (!el.classList.contains('is-in')) observer.observe(el);
            });
        }
    };
}

/* =============================================================== scramble */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789░▒▓#%&@*+=-<>/\\';

/**
 * Laat tekst "binnenvallen": elk teken rolt eerst door willekeurige glyphs en
 * klikt dan op zijn plek. Klassiek zenderscherm-effect, en precies wat je wil
 * op het moment dat er een nieuw nummer begint.
 */
export class Scrambler {
    constructor(el, { speed = 1, glyphs = GLYPHS } = {}) {
        this.el = el;
        this.speed = speed;
        this.glyphs = glyphs;
        this.queue = [];
        this.progress = 0;
        this.running = false;
        this.stop = null;
        this.current = el?.textContent || '';
    }

    /** @param {string} text nieuwe tekst */
    to(text) {
        if (!this.el || text === this.current) return;

        if (reducedMotion.matches) {
            this.el.textContent = text;
            this.current = text;
            return;
        }

        const from = this.current;
        const length = Math.max(from.length, text.length);
        this.queue = [];

        for (let i = 0; i < length; i += 1) {
            const start = Math.floor(Math.random() * 18);
            this.queue.push({
                from: from[i] || '',
                to: text[i] || '',
                start,
                end: start + 8 + Math.floor(Math.random() * 22),
                glyph: ''
            });
        }

        this.current = text;
        this.progress = 0;

        if (!this.running) {
            this.running = true;
            this.stop = onTick(() => this.frame());
        }
    }

    frame() {
        let done = 0;
        let output = '';

        for (const item of this.queue) {
            if (this.progress >= item.end) {
                done += 1;
                output += item.to;
            } else if (this.progress >= item.start) {
                // Spaties niet vervangen: anders valt het woordbeeld uit elkaar.
                if (item.to === ' ') {
                    output += ' ';
                } else {
                    if (!item.glyph || Math.random() < 0.3) {
                        item.glyph = this.glyphs[Math.floor(Math.random() * this.glyphs.length)];
                    }
                    output += item.glyph;
                }
            } else {
                output += item.from;
            }
        }

        this.el.textContent = output;
        this.progress += this.speed;

        if (done === this.queue.length) {
            this.el.textContent = this.current;
            this.running = false;
            this.stop?.();
            this.stop = null;
        }
    }
}

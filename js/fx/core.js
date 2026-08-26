/**
 * Kern van de effectenlaag: één rAF-lus, wat wiskunde en een paar
 * gedeelde toestanden (muis, viewport, energie).
 *
 * Alle effecten hangen aan deze ene lus. Dat scheelt niet alleen frames, het
 * zorgt er ook voor dat ze precies gelijk lopen: de cursor, de shader en de
 * scroll delen dezelfde tijdstap.
 */

/* ------------------------------------------------------------------ math -- */

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Framerate-onafhankelijke interpolatie. Met een gewone lerp beweegt alles op
 * een 144 Hz-scherm ruim twee keer zo snel als op 60 Hz; dit corrigeert dat.
 */
export const damp = (a, b, smoothing, dt) => lerp(a, b, 1 - Math.exp(-smoothing * dt));

export const ease = {
    outExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
    outQuint: (t) => 1 - (1 - t) ** 5,
    inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - ((-2 * t + 2) ** 4) / 2),
    outBack: (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2
};

/* --------------------------------------------------------------- ticker -- */

const tasks = new Set();
let running = false;
let lastTime = 0;

/** @type {{t:number, dt:number, frame:number}} */
export const clock = { t: 0, dt: 0, frame: 0 };

function loop(now) {
    if (!running) return;

    const seconds = now / 1000;
    // Eerste frame en na een tabwissel kan dt enorm zijn; begrenzen voorkomt
    // dat alles in één klap doorschiet.
    clock.dt = Math.min(seconds - lastTime, 1 / 20) || 1 / 60;
    lastTime = seconds;
    clock.t += clock.dt;
    clock.frame += 1;

    for (const task of tasks) {
        try {
            task(clock);
        } catch (error) {
            console.warn('[fx] taak faalde en is losgekoppeld:', error);
            tasks.delete(task);
        }
    }

    requestAnimationFrame(loop);
}

export function onTick(task) {
    tasks.add(task);
    startTicker();
    return () => tasks.delete(task);
}

function startTicker() {
    if (running || document.hidden || !tasks.size) return;
    running = true;
    lastTime = performance.now() / 1000;
    requestAnimationFrame(loop);
}

function stopTicker() {
    running = false;
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTicker();
    else startTicker();
});

/* ------------------------------------------------------- gedeelde staat -- */

export const viewport = { w: window.innerWidth, h: window.innerHeight, dpr: 1 };

/** Muis in pixels en genormaliseerd (-1..1), met een vertraagde variant. */
export const pointer = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    nx: 0,
    ny: 0,
    sx: window.innerWidth / 2,
    sy: window.innerHeight / 2,
    snx: 0,
    sny: 0,
    down: false,
    moved: false,
    speed: 0
};

/**
 * `value` is de omhullende: 0 als er niets speelt, 1 als er geluid is.
 * `level` en `beat` komen uit de werkelijke audioanalyse en geven de dynamiek.
 */
export const energy = { target: 0, value: 0, level: 0, beat: 0 };

export function setEnergy(value) {
    energy.target = clamp(value, 0, 1);
}

/** Gevoed door player.sample(), of door een golfje als analyse niet kan. */
export function setAudio(level, beat) {
    energy.level = clamp(level, 0, 1);
    energy.beat = clamp(beat, 0, 1);
}

function measureViewport() {
    viewport.w = window.innerWidth;
    viewport.h = window.innerHeight;
    viewport.dpr = Math.min(window.devicePixelRatio || 1, 2);
}

measureViewport();
window.addEventListener('resize', measureViewport, { passive: true });

window.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.nx = (event.clientX / viewport.w) * 2 - 1;
    pointer.ny = (event.clientY / viewport.h) * 2 - 1;
    pointer.moved = true;
}, { passive: true });

window.addEventListener('pointerdown', () => { pointer.down = true; });
window.addEventListener('pointerup', () => { pointer.down = false; });

// Vertraagde muispositie + snelheid, één keer per frame voor iedereen.
onTick(({ dt }) => {
    const px = pointer.sx;
    const py = pointer.sy;

    pointer.sx = damp(pointer.sx, pointer.x, 9, dt);
    pointer.sy = damp(pointer.sy, pointer.y, 9, dt);
    pointer.snx = damp(pointer.snx, pointer.nx, 9, dt);
    pointer.sny = damp(pointer.sny, pointer.ny, 9, dt);

    pointer.speed = damp(pointer.speed, Math.hypot(pointer.sx - px, pointer.sy - py) / Math.max(dt, 1e-3) / 1000, 6, dt);

    energy.value = damp(energy.value, energy.target, 2.2, dt);
});

/* ---------------------------------------------------------- omgevingscheck */

export const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Zware effecten alleen op apparaten die het aankunnen. */
export const isCapable = () => {
    if (reducedMotion.matches) return false;
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return false;
    return true;
};

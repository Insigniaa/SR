/**
 * WebGL-laag.
 *
 * Twee shaders, allebei gevoed door de albumhoes die op dat moment speelt:
 *
 *  1. Backdrop — de hoes wordt teruggebracht tot 32x32 en dan door een
 *     domain-warped fbm-veld gehaald. Je ziet dus geen generieke gradient maar
 *     de werkelijke kleuren van het nummer, traag vloeiend.
 *
 *  2. Cover — de hoes op ware resolutie, met een rimpel die van de muis
 *     uitgaat, een lichte ademhaling op het ritme van de speler en een
 *     RGB-splitsing die meeschaalt met de vervorming. Bij een nieuw nummer
 *     lopen oude en nieuwe hoes via een ruisveld in elkaar over.
 *
 * Alles is WebGL 1, zodat het overal draait. Zonder WebGL blijft de bestaande
 * CSS-achtergrond gewoon staan.
 */

import { onTick, clamp, damp, pointer, viewport, energy } from './core.js';

/* ============================================================ gl-gereedschap */

function createContext(canvas) {
    const attrs = {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false
    };
    return canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
}

function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('[fx/gl] shader:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
    const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('[fx/gl] link:', gl.getProgramInfoLog(program));
        return null;
    }

    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return program;
}

/** Eén driehoek die het hele scherm bedekt; goedkoper dan twee. */
function fullscreenTriangle(gl, program) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const location = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
}

function makeTexture(gl, source) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    if (source) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([20, 18, 17, 255]));
    }
    return texture;
}

/** Laadt een afbeelding met CORS, zodat hij als textuur mag dienen. */
function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/** Verkleint naar NxN. Bij lineair filteren is dat meteen een perfecte blur. */
function downscale(img, size) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    return canvas;
}

/* ================================================================ shaders */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** Gedeelde ruisfuncties. */
const NOISE = `
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}`;

const BACKDROP_FRAG = `
precision highp float;

varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;
uniform float uEnergy;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
uniform float uFade;
uniform float uLight;   // 1 = licht thema

${NOISE}

void main() {
    vec2 uv = vUv;
    float aspect = uRes.x / max(uRes.y, 1.0);
    vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

    float t = uTime * 0.06;

    // Domain warping: het veld verplaatst zichzelf twee keer. Dat geeft die
    // trage, olieachtige beweging die je met een gewone gradient niet krijgt.
    vec2 q = vec2(fbm(p * 1.6 + t),
                  fbm(p * 1.6 + vec2(5.2, 1.3) - t * 0.8));

    vec2 r = vec2(fbm(p * 1.9 + 3.4 * q + vec2(1.7, 9.2) + t * 1.4),
                  fbm(p * 1.9 + 3.4 * q + vec2(8.3, 2.8) - t * 1.1));

    // De muis duwt het veld opzij.
    vec2 toMouse = p - vec2((uMouse.x - 0.5) * aspect, (uMouse.y - 0.5));
    float mouseFall = exp(-dot(toMouse, toMouse) * 5.0);
    r += normalize(toMouse + 1e-5) * mouseFall * 0.22;

    float warp = 0.52 + uEnergy * 0.26;
    vec2 sampleUv = clamp(uv + (r - 0.5) * warp, 0.001, 0.999);

    vec3 colorA = texture2D(uTexA, sampleUv).rgb;
    vec3 colorB = texture2D(uTexB, sampleUv).rgb;
    vec3 color = mix(colorA, colorB, uMix);

    // Diepte in het veld: de wervelingen lichten op en vallen weg.
    float bands = fbm(p * 2.4 + r * 2.0 + t * 2.0);
    color += color * (bands - 0.5) * (0.85 + uEnergy * 0.45);

    // Verzadiging omhoog, anders wordt alles modderig zodra het vervormd is.
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(lum), color, 1.55);

    // Een heldere ader die door het veld loopt.
    float vein = smoothstep(0.62, 0.98, bands + length(r - 0.5) * 0.5);
    color += vein * color * (0.5 + uEnergy * 0.6);

    color *= 0.86 + mouseFall * 0.75;

    float vignette = smoothstep(1.35, 0.2, length(p * vec2(0.85, 1.05)));
    color *= mix(0.30, 1.12, vignette);

    // Licht thema: het veld naar wit tillen, anders ligt er een donkere vlek
    // op een crèmekleurige pagina.
    color = mix(color, 1.0 - (1.0 - clamp(color, 0.0, 1.0)) * 0.30, uLight);

    color += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.024;

    gl_FragColor = vec4(max(color, 0.0), uFade);
}`;

const COVER_FRAG = `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2  uMouse;      // 0..1 binnen het element
uniform float uHover;
uniform float uEnergy;
uniform float uRipple;     // 1 -> 0 na een muisbeweging
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;        // overgang naar het nieuwe nummer

${NOISE}

void main() {
    vec2 uv = vUv;
    vec2 centered = uv - 0.5;

    // Rimpel die vanaf de muis naar buiten loopt.
    vec2 toMouse = uv - uMouse;
    float dist = length(toMouse);
    float wave = sin(dist * 26.0 - uTime * 4.5) * exp(-dist * 5.5);
    vec2 ripple = normalize(toMouse + 1e-5) * wave * 0.035 * uRipple * uHover;

    // Rustige ademhaling, sterker als er geluid speelt.
    float breathe = fbm(uv * 3.0 + uTime * 0.12);
    vec2 drift = (vec2(breathe, fbm(uv * 3.0 - uTime * 0.1)) - 0.5)
                 * (0.008 + uEnergy * 0.016);

    // Overgang tussen twee hoezen: een ruisveld bepaalt welke pixel wanneer wisselt.
    float edge = fbm(uv * 4.0 + 11.0);
    float progress = smoothstep(edge * 0.45, edge * 0.45 + 0.55, uMix);
    vec2 push = (vec2(edge) - 0.5) * 0.16;

    vec2 uvA = uv + ripple + drift + push * progress;
    vec2 uvB = uv + ripple + drift - push * (1.0 - progress);

    // Chromatische aberratie, evenredig met hoe hard het beeld vervormd wordt.
    float shift = (length(ripple) * 1.6 + uEnergy * 0.0022 + length(centered) * 0.0035);

    vec3 a = vec3(
        texture2D(uTexA, uvA + vec2(shift, 0.0)).r,
        texture2D(uTexA, uvA).g,
        texture2D(uTexA, uvA - vec2(shift, 0.0)).b);

    vec3 b = vec3(
        texture2D(uTexB, uvB + vec2(shift, 0.0)).r,
        texture2D(uTexB, uvB).g,
        texture2D(uTexB, uvB - vec2(shift, 0.0)).b);

    vec3 color = mix(a, b, progress);

    // Glans die de muis volgt.
    float glare = exp(-dist * dist * 6.0) * uHover * 0.14;
    color += glare;

    gl_FragColor = vec4(color, 1.0);
}`;

/* ============================================================== backdrop */

export class GLBackdrop {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas && createContext(canvas);
        this.ok = false;
        this.mix = 0;
        this.fade = 0;
        this.pending = null;

        if (!this.gl) return;

        const gl = this.gl;
        this.program = createProgram(gl, VERT, BACKDROP_FRAG);
        if (!this.program) return;

        gl.useProgram(this.program);
        fullscreenTriangle(gl, this.program);

        this.u = {
            res: gl.getUniformLocation(this.program, 'uRes'),
            time: gl.getUniformLocation(this.program, 'uTime'),
            mouse: gl.getUniformLocation(this.program, 'uMouse'),
            energy: gl.getUniformLocation(this.program, 'uEnergy'),
            mix: gl.getUniformLocation(this.program, 'uMix'),
            fade: gl.getUniformLocation(this.program, 'uFade'),
            light: gl.getUniformLocation(this.program, 'uLight')
        };

        this.light = 0;
        this.lightTarget = 0;

        this.texA = makeTexture(gl, null);
        this.texB = makeTexture(gl, null);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uTexA'), 0);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uTexB'), 1);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        this.resize();
        window.addEventListener('resize', () => this.resize(), { passive: true });

        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            this.ok = false;
            // De geblurde CSS-achtergrond neemt het weer over.
            document.documentElement.classList.remove('has-gl-backdrop');
        });

        this.ok = true;
        this.stop = onTick((clock) => this.render(clock));
    }

    resize() {
        if (!this.gl) return;

        // Op halve resolutie: het beeld is toch één grote blur, en dit scheelt
        // ruwweg driekwart van het invulwerk.
        const scale = 0.5;
        const w = Math.max(1, Math.round(viewport.w * scale));
        const h = Math.max(1, Math.round(viewport.h * scale));

        if (this.canvas.width === w && this.canvas.height === h) return;
        this.canvas.width = w;
        this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
    }

    /** Zet een nieuwe hoes; kruist over vanaf de huidige. */
    async setImage(src) {
        if (!this.ok || !src || src === this.currentSrc) return;
        this.currentSrc = src;

        const img = await loadImage(src);
        if (!img || !this.ok) return;

        const gl = this.gl;
        const small = downscale(img, 32);

        // De nieuwe hoes komt altijd in B en schuift daarna door naar A.
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texB);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, small);

        this.mix = 0;
        this.pending = small;
    }

    render({ t, dt }) {
        if (!this.ok) return;
        const gl = this.gl;

        gl.useProgram(this.program);

        if (this.pending) {
            this.mix = damp(this.mix, 1, 1.1, dt);
            if (this.mix > 0.995) {
                // Overgang klaar: B wordt de nieuwe A.
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.texA);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.pending);
                this.pending = null;
                this.mix = 0;
            }
            this.fade = damp(this.fade, 1, 1.6, dt);
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texA);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texB);

        gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.u.time, t);
        gl.uniform2f(this.u.mouse, pointer.sx / viewport.w, 1 - pointer.sy / viewport.h);
        gl.uniform1f(this.u.energy, energy.value);
        gl.uniform1f(this.u.mix, this.mix);
        gl.uniform1f(this.u.fade, this.fade);

        this.light = damp(this.light, this.lightTarget, 3, dt);
        gl.uniform1f(this.u.light, this.light);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /** @param {boolean} isLight */
    setTheme(isLight) {
        this.lightTarget = isLight ? 1 : 0;
    }
}

/* ================================================================= cover */

export class GLCover {
    constructor(canvas, host) {
        this.canvas = canvas;
        this.host = host || canvas?.parentElement;
        this.gl = canvas && createContext(canvas);
        this.ok = false;

        this.hover = 0;
        this.hoverTarget = 0;
        this.ripple = 0;
        this.mouse = { x: 0.5, y: 0.5 };
        this.smoothMouse = { x: 0.5, y: 0.5 };
        this.mix = 0;
        this.pending = null;
        this.visible = true;

        if (!this.gl) return;

        const gl = this.gl;
        this.program = createProgram(gl, VERT, COVER_FRAG);
        if (!this.program) return;

        gl.useProgram(this.program);
        fullscreenTriangle(gl, this.program);

        this.u = {
            time: gl.getUniformLocation(this.program, 'uTime'),
            mouse: gl.getUniformLocation(this.program, 'uMouse'),
            hover: gl.getUniformLocation(this.program, 'uHover'),
            energy: gl.getUniformLocation(this.program, 'uEnergy'),
            ripple: gl.getUniformLocation(this.program, 'uRipple'),
            mix: gl.getUniformLocation(this.program, 'uMix')
        };

        this.texA = makeTexture(gl, null);
        this.texB = makeTexture(gl, null);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uTexA'), 0);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uTexB'), 1);

        this.resize();
        window.addEventListener('resize', () => this.resize(), { passive: true });
        this.bindPointer();

        // Niet renderen als de hoes buiten beeld is.
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; })
                .observe(this.host);
        }

        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            this.ok = false;
            // Terugvallen op de gewone <img>; die staat er nog steeds onder.
            this.host?.classList.remove('is-live');
            document.documentElement.classList.remove('has-gl-cover');
        });

        this.ok = true;
        this.stop = onTick((clock) => this.render(clock));
    }

    bindPointer() {
        const target = this.host;

        target.addEventListener('pointermove', (event) => {
            const rect = target.getBoundingClientRect();
            this.mouse.x = (event.clientX - rect.left) / rect.width;
            this.mouse.y = 1 - (event.clientY - rect.top) / rect.height;
            this.ripple = 1;
        }, { passive: true });

        target.addEventListener('pointerenter', () => { this.hoverTarget = 1; });
        target.addEventListener('pointerleave', () => { this.hoverTarget = 0; });
    }

    resize() {
        if (!this.gl || !this.host) return;

        const rect = this.host.getBoundingClientRect();
        const dpr = viewport.dpr;
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));

        if (this.canvas.width === w && this.canvas.height === h) return;
        this.canvas.width = w;
        this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
    }

    async setImage(src) {
        if (!this.ok || !src || src === this.currentSrc) return;
        this.currentSrc = src;

        const img = await loadImage(src);
        if (!img || !this.ok) return;

        const gl = this.gl;

        if (!this.hasFirst) {
            // Eerste hoes: meteen in beide slots, geen overgang.
            for (const [unit, tex] of [[gl.TEXTURE0, this.texA], [gl.TEXTURE1, this.texB]]) {
                gl.activeTexture(unit);
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            }
            this.hasFirst = true;
            this.host?.classList.add('is-live');
            return;
        }

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texB);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

        this.mix = 0;
        this.pending = img;
    }

    render({ t, dt }) {
        if (!this.ok || !this.visible) return;
        const gl = this.gl;

        this.hover = damp(this.hover, this.hoverTarget, 7, dt);
        this.ripple = damp(this.ripple, 0, 1.6, dt);
        this.smoothMouse.x = damp(this.smoothMouse.x, this.mouse.x, 10, dt);
        this.smoothMouse.y = damp(this.smoothMouse.y, this.mouse.y, 10, dt);

        gl.useProgram(this.program);

        if (this.pending) {
            this.mix = damp(this.mix, 1, 1.3, dt);
            if (this.mix > 0.995) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.texA);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.pending);
                this.pending = null;
                this.mix = 0;
            }
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texA);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texB);

        gl.uniform1f(this.u.time, t);
        gl.uniform2f(this.u.mouse, this.smoothMouse.x, this.smoothMouse.y);
        gl.uniform1f(this.u.hover, this.hover);
        gl.uniform1f(this.u.energy, energy.value);
        gl.uniform1f(this.u.ripple, clamp(this.ripple, 0, 1));
        gl.uniform1f(this.u.mix, this.mix);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}

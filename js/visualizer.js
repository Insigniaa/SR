export class ColorThemeManager {
    constructor() {
        this.currentColors = {
            primary: '#e6282b',
            secondary: '#ff1744',
            accent: '#ffd700'
        };
        this.hero = document.querySelector('.hero');
        this.particleSystem = null;
    }

    setParticleSystem(particleSystem) {
        this.particleSystem = particleSystem;
    }

    async extractColorsFromImage(imageUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;

                ctx.drawImage(img, 0, 0);

                try {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const colors = this.analyzeImageColors(imageData);
                    resolve(colors);
                } catch (error) {
                    console.log('Could not extract colors from image:', error);
                    resolve(this.currentColors);
                }
            };

            img.onerror = () => {
                resolve(this.currentColors);
            };

            img.src = imageUrl;
        });
    }

    analyzeImageColors(imageData) {
        const data = imageData.data;
        const colorCounts = {};
        const step = 4 * 10;

        for (let i = 0; i < data.length; i += step) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a < 128) continue;

            const key = `${Math.floor(r / 32) * 32},${Math.floor(g / 32) * 32},${Math.floor(b / 32) * 32}`;
            colorCounts[key] = (colorCounts[key] || 0) + 1;
        }

        const sortedColors = Object.entries(colorCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([color]) => color.split(',').map(Number));

        if (sortedColors.length === 0) {
            return this.currentColors;
        }

        const vibrantColors = sortedColors
            .map(([r, g, b]) => {
                const hsl = this.rgbToHsl(r, g, b);
                return { rgb: [r, g, b], hsl, vibrance: hsl[1] * hsl[2] };
            })
            .sort((a, b) => b.vibrance - a.vibrance);

        const primary = vibrantColors[0] || { rgb: [230, 40, 43] };
        const secondary = vibrantColors[1] || { rgb: [255, 23, 68] };
        const accent = vibrantColors[2] || { rgb: [255, 215, 0] };

        return {
            primary: `rgb(${primary.rgb.join(',')})`,
            secondary: `rgb(${secondary.rgb.join(',')})`,
            accent: `rgb(${accent.rgb.join(',')})`
        };
    }

    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return [h, s, l];
    }

    applyColorTheme(colors) {
        this.currentColors = colors;

        // Update hero if wrapper exists, otherwise recreate style
        const styleId = 'dynamic-theme';
        let style = document.getElementById(styleId);

        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
        }

        // Updated CSS for new Glassmorphism design
        style.textContent = `
            :root {
                --dynamic-primary: ${colors.primary};
                --dynamic-secondary: ${colors.secondary};
                --dynamic-accent: ${colors.accent};
            }
            
            .artwork-glow {
                background: radial-gradient(circle at center, ${colors.primary}, ${colors.secondary});
                opacity: 0.4;
                box-shadow: 0 0 60px ${colors.primary};
            }
            
            .glass-header {
                border-bottom-color: ${colors.primary}33 !important;
            }
            
            .nav-link.active::after {
                background: ${colors.primary} !important;
                box-shadow: 0 0 15px ${colors.primary} !important;
            }
            
            .orb-1 { background: ${colors.primary} !important; }
            .orb-2 { background: ${colors.secondary} !important; }
            .orb-3 { background: ${colors.accent} !important; }
        `;

        if (this.particleSystem) {
            this.particleSystem.updateColors(colors);
        }
    }
}

export class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.particleCount = 120; // Denser but finer
        this.colors = ['#00F0FF', '#FF00AA', '#7000FF'];

        this.resize();
        this.createParticles();
        this.bindEvents();
        this.animate();
    }

    resize() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    createParticles() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.8, // Slower, smoother movement
                vy: (Math.random() - 0.5) * 0.8,
                size: Math.random() * 3 + 1, // FINER: 1px to 4px
                opacity: Math.random() * 0.4 + 0.1, // More transparent (0.1 - 0.5)
                color: this.getRandomColor()
            });
        }
    }

    getRandomColor() {
        return this.colors[Math.floor(Math.random() * this.colors.length)];
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());
    }

    updateColors(colors) {
        this.colors = [colors.primary, colors.secondary, colors.accent];
        this.particles.forEach(particle => {
            particle.color = this.getRandomColor();
        });
    }

    updateParticles() {
        this.particles.forEach(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;

            if (particle.x < 0 || particle.x > this.canvas.width) particle.vx *= -1;
            if (particle.y < 0 || particle.y > this.canvas.height) particle.vy *= -1;

            particle.x = Math.max(0, Math.min(this.canvas.width, particle.x));
            particle.y = Math.max(0, Math.min(this.canvas.height, particle.y));
        });
    }

    drawParticles() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw connecting lines
        this.particles.forEach((particle, i) => {
            this.particles.slice(i + 1).forEach(other => {
                const dx = particle.x - other.x;
                const dy = particle.y - other.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 150) {
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = particle.color;
                    this.ctx.globalAlpha = 0.15 * (1 - dist / 150); // Very faint lines
                    this.ctx.lineWidth = 0.5; // Thinner lines
                    this.ctx.moveTo(particle.x, particle.y);
                    this.ctx.lineTo(other.x, other.y);
                    this.ctx.stroke();
                    this.ctx.globalAlpha = 1;
                }
            });
        });

        // Draw particles
        this.particles.forEach(particle => {
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fillStyle = particle.color;
            this.ctx.globalAlpha = particle.opacity;
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
        });
    }

    animate() {
        if (!document.hidden) {
            this.updateParticles();
            this.drawParticles();
        }
        requestAnimationFrame(() => this.animate());
    }
}

// Global visualizer setup
export function initializeVisualizer() {
    const colorThemeManager = new ColorThemeManager();
    window.colorThemeManager = colorThemeManager;

    const visualizerCanvas = document.getElementById('visualizer-canvas');
    let particleSystem = null;
    if (visualizerCanvas) {
        particleSystem = new ParticleSystem(visualizerCanvas);
        colorThemeManager.setParticleSystem(particleSystem);
    }
}

/**
 * Uitzendgeheugen.
 *
 * Zolang je luistert wordt de vorm van het geluid opgeslagen: een paar keer per
 * seconde het niveau, gekoppeld aan het nummer dat op dat moment speelde en de
 * kleur van de bijbehorende hoes.
 *
 * Daaruit tekent de site twee dingen die nergens anders bestaan:
 *
 *   1. Een doorlopende lijn van je hele luistersessie, in de kleuren van de
 *      programma's die voorbijkwamen.
 *   2. Per gedraaid nummer de werkelijke golfvorm van díé uitzending, niet een
 *      generiek plaatje.
 *
 * Het geheugen blijft in dit tabblad. Er gaat niets naar een server; er is ook
 * geen server om iets heen te sturen.
 */

const HZ = 4;                 // metingen per seconde
const MAX_PUNTEN = 1400;      // bovengrens; daarboven wordt de lijn gehalveerd
const PER_TRACK = 48;         // punten in een miniatuur-golfvorm
const OPSLAG = 'sr.sessie.v1';

export class BroadcastMemory {
    constructor() {
        /** @type {{v:number, kleur:string}[]} de sessielijn */
        this.punten = [];
        /** Hoeveel seconden één punt beslaat; verdubbelt als het te lang wordt. */
        this.secondenPerPunt = 1 / HZ;
        this.start = null;

        /** @type {Map<string, {punten:number[], titel:string, artiest:string}>} */
        this.perTrack = new Map();

        this.huidigeKey = null;
        this.huidigeKleur = '#FF4230';
        this.laatsteMeting = 0;

        this.#herstel();
    }

    /** Nieuw nummer: vanaf nu horen de metingen daarbij. */
    setTrack({ key, title, artist, kleur }) {
        if (!key) return;
        this.huidigeKey = key;
        if (kleur) this.huidigeKleur = kleur;

        if (!this.perTrack.has(key)) {
            this.perTrack.set(key, { punten: [], titel: title || '', artiest: artist || '' });
            // Niet oneindig laten groeien.
            if (this.perTrack.size > 40) {
                this.perTrack.delete(this.perTrack.keys().next().value);
            }
        }
    }

    /**
     * Eén meting toevoegen. Wordt elke frame aangeroepen maar slaat alleen op
     * met de ingestelde frequentie.
     *
     * @param {number} niveau 0..1
     */
    meet(niveau) {
        const nu = performance.now();
        if (nu - this.laatsteMeting < (this.secondenPerPunt * 1000)) return;
        this.laatsteMeting = nu;

        if (this.start === null) this.start = Date.now();

        this.punten.push({ v: niveau, kleur: this.huidigeKleur });

        // Buffer vol: elk tweede punt weggooien en de tijdschaal verdubbelen.
        // Zo past een sessie van willekeurige lengte altijd in beeld, met een
        // resolutie die geleidelijk grover wordt in plaats van af te kappen.
        if (this.punten.length > MAX_PUNTEN) {
            const gehalveerd = [];
            for (let i = 0; i < this.punten.length; i += 2) {
                const a = this.punten[i];
                const b = this.punten[i + 1];
                gehalveerd.push(b ? { v: Math.max(a.v, b.v), kleur: a.kleur } : a);
            }
            this.punten = gehalveerd;
            this.secondenPerPunt *= 2;
        }

        const track = this.huidigeKey && this.perTrack.get(this.huidigeKey);
        if (track && track.punten.length < PER_TRACK * 6) track.punten.push(niveau);
    }

    /** Duur van de sessie in seconden. */
    get duur() {
        return this.start ? (Date.now() - this.start) / 1000 : 0;
    }

    get heeftInhoud() {
        return this.punten.length > 4;
    }

    /**
     * Golfvorm van één nummer, teruggebracht tot PER_TRACK waarden.
     * @returns {number[]|null}
     */
    golfvorm(key) {
        const track = key && this.perTrack.get(key);
        if (!track || track.punten.length < 6) return null;

        const bron = track.punten;
        const uit = [];
        const stap = bron.length / PER_TRACK;

        for (let i = 0; i < PER_TRACK; i += 1) {
            const van = Math.floor(i * stap);
            const tot = Math.max(van + 1, Math.floor((i + 1) * stap));
            let piek = 0;
            for (let k = van; k < tot && k < bron.length; k += 1) piek = Math.max(piek, bron[k]);
            uit.push(piek);
        }
        return uit;
    }

    /* ------------------------------------------------------------- opslag -- */

    bewaar() {
        try {
            sessionStorage.setItem(OPSLAG, JSON.stringify({
                start: this.start,
                secondenPerPunt: this.secondenPerPunt,
                // Kleuren zijn de grootste post; per punt bewaren we er alleen
                // een verwijzing naar een korte lijst.
                punten: this.punten.map((p) => [Math.round(p.v * 255), p.kleur]),
                perTrack: [...this.perTrack].map(([k, t]) => [k, {
                    punten: t.punten.map((v) => Math.round(v * 255)),
                    titel: t.titel, artiest: t.artiest
                }])
            }));
        } catch {
            // sessionStorage vol: het geheugen blijft dan alleen in het tabblad.
        }
    }

    #herstel() {
        try {
            const ruw = sessionStorage.getItem(OPSLAG);
            if (!ruw) return;
            const d = JSON.parse(ruw);

            this.start = d.start ?? null;
            this.secondenPerPunt = d.secondenPerPunt || 1 / HZ;
            this.punten = (d.punten || []).map(([v, kleur]) => ({ v: v / 255, kleur }));
            this.perTrack = new Map((d.perTrack || []).map(([k, t]) => [k, {
                punten: (t.punten || []).map((v) => v / 255),
                titel: t.titel, artiest: t.artiest
            }]));
        } catch {
            // Onleesbaar: gewoon leeg beginnen.
        }
    }
}

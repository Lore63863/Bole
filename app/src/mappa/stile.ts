/**
 * Stile della mappa: base Protomaps (chiara) ritoccata per leggerla in bosco.
 *
 * Ordine dei livelli, dal basso:
 *   1. terra, boschi, acqua (dalla mappa base)
 *   2. indice di Bolé (semitrasparente)                 <- aggiunto dall'app
 *   3. strade, sentieri, ponti, confini (dalla mappa base)
 *   4. nomi di paesi, borgate e strade (sempre sopra a tutto)
 *
 * Ritocchi rispetto allo stile originale (strade e nomi ben leggibili anche al sole):
 *   - nomi dei luoghi più grandi del 25%, più scuri e con alone bianco largo;
 *   - nomi delle strade dallo zoom 14 (prima dal 15) e più scuri;
 *   - strade bianche con il bordo grigio scuro (nell'originale il bordo è quasi del colore
 *     dello sfondo) e più larghe; niente gialli o arancioni, che si confonderebbero con
 *     i colori dell'indice;
 *   - sentieri e mulattiere tratteggiati in marrone, visibili dallo zoom 12.
 */
import { type Flavor, layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { ZOOM_MASSIMO_BASE } from "./base";

export const SORGENTE_BASE = "base";
export const LIVELLO_INDICE = "indice";

const INCHIOSTRO = "#232323";
const INCHIOSTRO_STRADE = "#4a4245";
const ALONE = "#ffffff";
const SENTIERO = "#8a5a2b";

type Espressione = unknown[];

/** Tema chiaro di Protomaps con i bordi delle strade scuri (leggibili al sole). */
function tema(): Flavor {
  const bordo = { minore: "#8f8780", principale: "#6f6862", autostrada: "#57504a" };
  // boschi e parchi grigio-verdi chiari: sopra ci vanno i colori dell'indice
  const bosco = { a: "#dde5d8", b: "#d4ddce" };
  return {
    ...namedFlavor("light"),
    wood_a: bosco.a, wood_b: bosco.b, park_a: bosco.a, park_b: bosco.b, scrub_a: "#e1e6d9", scrub_b: "#dae0d1",
    minor_a: "#ffffff",
    minor_b: "#ffffff",
    minor_casing: bordo.minore,
    minor_service_casing: "#a39b94",
    link_casing: bordo.principale,
    major_casing_early: bordo.principale,
    major_casing_late: bordo.principale,
    highway_casing_early: bordo.autostrada,
    highway_casing_late: bordo.autostrada,
    bridges_minor_casing: bordo.minore,
    bridges_link_casing: bordo.principale,
    bridges_major_casing: bordo.principale,
    bridges_highway_casing: bordo.autostrada,
    bridges_other_casing: bordo.minore,
  };
}

/** Quanto allargare le strade, per tipo (moltiplica larghezza e spazio dentro il bordo). */
const ALLARGA: Record<string, number> = { minor: 1.5, link: 1.4, major: 1.4, highway: 1.3 };

/** Moltiplica le uscite di un "interpolate" sullo zoom (lo zoom deve restare in cima). */
function ingrandisci(valore: unknown, fattore: number): unknown {
  if (typeof valore === "number") return valore * fattore;
  const e = valore as Espressione;
  if (Array.isArray(e) && e[0] === "interpolate") {
    const nuovo = e.slice(0, 3);
    for (let i = 3; i < e.length; i += 2) nuovo.push(e[i], ["*", fattore, e[i + 1]]);
    return nuovo;
  }
  return valore;
}

function ritocca(l: LayerSpecification): LayerSpecification {
  const c = structuredClone(l) as LayerSpecification & { layout?: Record<string, unknown>; paint?: Record<string, unknown> };
  if (c.id === "places_locality" || c.id === "places_subplace") {
    c.layout = { ...c.layout, "text-size": ingrandisci(c.layout?.["text-size"], 1.25) };
    c.paint = { ...c.paint, "text-color": INCHIOSTRO, "text-halo-color": ALONE, "text-halo-width": 2, "text-halo-blur": 0.5 };
  }
  if (c.id === "roads_labels_minor" || c.id === "roads_labels_major") {
    if (c.id === "roads_labels_minor") c.minzoom = 14;
    c.layout = { ...c.layout, "text-size": 13 };
    c.paint = { ...c.paint, "text-color": INCHIOSTRO_STRADE, "text-halo-color": ALONE, "text-halo-width": 2 };
  }
  const tipo = Object.keys(ALLARGA).find((k) => c.id.startsWith(`roads_${k}`) || c.id.startsWith(`roads_bridges_${k}`));
  if (tipo && c.type === "line") {
    const f = ALLARGA[tipo];
    const p = { ...c.paint } as Record<string, unknown>;
    if (p["line-gap-width"] !== undefined) p["line-gap-width"] = ingrandisci(p["line-gap-width"], f);
    else p["line-width"] = ingrandisci(p["line-width"], f);
    c.paint = p;
  }
  if (c.id === "roads_other") {
    c.minzoom = 12;
    c.paint = {
      ...c.paint,
      "line-color": SENTIERO,
      "line-dasharray": [2, 1.5],
      "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 12, 0.6, 14, 1.3, 17, 2.6],
    };
  }
  return c;
}

/** Area coperta dai dati di Bolé (gradi): fuori non si chiedono tessere. */
export const LIMITI: [number, number, number, number] = [6.56, 43.73, 10.14, 46.51];

export function urlIndice(scelta: string, giorno: number) {
  return `boleindice://{z}/{x}/{y}?s=${encodeURIComponent(scelta)}&g=${giorno}`;
}

/** Rilievo ombreggiato, indice e curve di livello: vanno sopra la terra e sotto strade e nomi. */
function livelliBole(scelta: string, giorno: number) {
  const sorgenti: StyleSpecification["sources"] = {
    quota: { type: "raster-dem", tiles: ["bolequota://{z}/{x}/{y}"], encoding: "terrarium", tileSize: 256, minzoom: 6, maxzoom: 12, bounds: LIMITI },
    [LIVELLO_INDICE]: { type: "raster", tiles: [urlIndice(scelta, giorno)], tileSize: 256, minzoom: 6, maxzoom: 12, bounds: LIMITI,
      attribution: "Indice: Bolé (stima, vedi Guida)" },
    isoipse: { type: "raster", tiles: ["boleisoipse://{z}/{x}/{y}"], tileSize: 256, minzoom: 12, maxzoom: 16, bounds: LIMITI },
  };
  const rilievo: LayerSpecification = {
    id: "rilievo", type: "hillshade", source: "quota",
    paint: { "hillshade-exaggeration": 0.4, "hillshade-shadow-color": "#4b4a3f", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#4b4a3f" },
  };
  const indice: LayerSpecification = {
    id: LIVELLO_INDICE, type: "raster", source: LIVELLO_INDICE,
    paint: { "raster-resampling": "nearest", "raster-fade-duration": 0 },
  };
  const isoipse: LayerSpecification = {
    id: "isoipse", type: "raster", source: "isoipse", minzoom: 12, paint: { "raster-fade-duration": 0, "raster-opacity": 0.45 },
  };
  return { sorgenti, rilievo, sopra: [indice, isoipse] };
}

/** Stile completo della mappa per una specie (o "porcini") e un giorno (0 = oggi). */
export function stileMappa(scelta = "porcini", giorno = 0): StyleSpecification {
  const tutti = layers(SORGENTE_BASE, tema(), { lang: "it" }).map(ritocca);
  const eSopra = (l: LayerSpecification) =>
    l.type === "symbol" || l.id.startsWith("roads_") || l.id.startsWith("boundaries");
  const etichette: LayerSpecification[] = tutti.filter((l) => l.type === "symbol");
  const linee = tutti.filter((l) => l.type !== "symbol" && eSopra(l));
  const fondo = tutti.filter((l) => !eSopra(l));
  // il rilievo va sopra boschi e usi del suolo (altrimenti le campiture lo coprono) e sotto l'indice
  const fondoSotto = fondo, fondoSopra: LayerSpecification[] = [];
  const bole = livelliBole(scelta, giorno);
  // MapLibre vuole indirizzi completi; l'app può stare in una sottocartella (GitHub Pages).
  const cartella = new URL("mappa/", document.baseURI).href;
  return {
    version: 8,
    glyphs: `${cartella}fonts/{fontstack}/{range}.pbf`,
    sprite: `${cartella}sprites/light`,
    sources: {
      [SORGENTE_BASE]: {
        type: "vector",
        tiles: ["bolebase://{z}/{x}/{y}"],
        minzoom: 0,
        maxzoom: ZOOM_MASSIMO_BASE,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>',
      },
      ...bole.sorgenti,
    },
    layers: [...fondoSotto, bole.rilievo, ...fondoSopra, ...bole.sopra, ...linee, ...etichette],
  };
}

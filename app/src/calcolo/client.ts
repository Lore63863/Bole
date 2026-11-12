/**
 * Collegamento fra la mappa (thread principale) e il lavoratore che fa i conti.
 * Registra in MapLibre tre protocolli per le tessere che l'app calcola da sé:
 *   boleindice://z/x/y?s=<specie|porcini>&g=<giorno>   colori dell'indice
 *   boleisoipse://z/x/y                                curve di livello
 *   bolequota://z/x/y                                  quota (Terrarium) per il rilievo ombreggiato
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { addProtocol, type AddProtocolAction } from "maplibre-gl";
import { apriArchivio } from "../dati/archivi";
import { MINIMO_RITROVAMENTI_PRECISI, specieDi } from "../dati/catalogo";
import { GRIGLIA, campiDelGiorno, type Meteo } from "../dati/meteo";
import { classe, fattoreMeteo, giornoDellAnno, type ParametriSpecie } from "./formule";
import { impostaAree, impostaOrigine, tesseraSalvata, type Area } from "../dati/fuorilinea";
import Lavoratore from "./lavoratore.ts?worker";

export const cartellaStrati = new URL("dati/strati/", document.baseURI).href;

const lavoratore = new Lavoratore();
let prossimo = 1;
const inAttesa = new Map<number, (v: unknown) => void>();
lavoratore.onmessage = (e: MessageEvent) => {
  const { id, errore, ...resto } = e.data;
  const f = inAttesa.get(id);
  inAttesa.delete(id);
  if (errore) console.warn("lavoratore:", errore);
  f?.(errore ? null : (resto.png ?? resto.risultato ?? null));
};

function chiedi<T>(msg: Record<string, unknown>): Promise<T> {
  const id = prossimo++;
  return new Promise((ok) => {
    inAttesa.set(id, ok as (v: unknown) => void);
    lavoratore.postMessage({ ...msg, id });
  });
}

let parametri: Record<string, ParametriSpecie> = {};

export function specieCalcolo(scelta: string) {
  return specieDi(scelta).map((s) => ({
    id: s.id, insieme: s.insieme, canale: s.canale,
    poche: (parametri[s.id]?.ritrovamenti_precisi ?? 0) < MINIMO_RITROVAMENTI_PRECISI,
  }));
}

/** Griglia delle regioni (0 = fuori, 1 = Piemonte, 2 = Liguria), passo 0,01°, per scansione di righe. */
export function grigliaRegioni(geo: FeatureCollection) {
  const lon0 = 6.5, lat0 = 43.7, passo = 0.01, nLon = 370, nLat = 290;
  const grid = new Uint8Array(nLon * nLat);
  geo.features.forEach((f) => {
    const codice = f.properties?.regione === "Liguria" ? 2 : 1;
    const g = f.geometry as Polygon | MultiPolygon;
    const anelli = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
    for (let r = 0; r < nLat; r++) {
      const lat = lat0 + (r + 0.5) * passo;
      const incroci: number[] = [];
      for (const anello of anelli) {
        for (let i = 0, j = anello.length - 1; i < anello.length; j = i++) {
          const [x1, y1] = anello[i], [x2, y2] = anello[j];
          if ((y1 > lat) !== (y2 > lat)) incroci.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
      incroci.sort((a, b) => a - b);
      for (let k = 0; k + 1 < incroci.length; k += 2) {
        const c1 = Math.max(0, Math.ceil((incroci[k] - lon0) / passo - 0.5));
        const c2 = Math.min(nLon - 1, Math.floor((incroci[k + 1] - lon0) / passo - 0.5));
        for (let c = c1; c <= c2; c++) grid[r * nLon + c] = codice;
      }
    }
  });
  return { grid, lon0, lat0, passo, nLon, nLat };
}

export function inizia(modello: { specie: Record<string, ParametriSpecie> }, regioni: FeatureCollection) {
  parametri = modello.specie;
  lavoratore.postMessage({
    tipo: "inizio", parametri, griglia: GRIGLIA, baseStrati: cartellaStrati, regioni: grigliaRegioni(regioni),
  });
}

type Giorno = ReturnType<typeof campiDelGiorno> & { data: string; doy: number; affidabilita: "alta" | "media" | "bassa" };
let giorniCalcolati: Giorno[] = [];

/** Manda al lavoratore i campi di tutti i giorni (calcolati una volta) e li tiene anche qui. */
export function impostaMeteo(m: Meteo) {
  giorniCalcolati = m.oggi.giorni.map((data, d) => ({
    ...campiDelGiorno(m, d), data, doy: giornoDellAnno(data), affidabilita: m.oggi.affidabilita[d],
  }));
  lavoratore.postMessage({ tipo: "giorni", giorni: giorniCalcolati });
}

function bilineare(campo: Float32Array, lon: number, lat: number): number {
  const g = GRIGLIA;
  const x = Math.min(Math.max((lon - g.lon0) / g.dlon, 0), g.nLon - 1.000001);
  const y = Math.min(Math.max((lat - g.lat0) / g.dlat, 0), g.nLat - 1.000001);
  const c = Math.floor(x), r = Math.floor(y), dx = x - c, dy = y - r, i = r * g.nLon + c;
  return (campo[i] * (1 - dx) + campo[i + 1] * dx) * (1 - dy) + (campo[i + g.nLon] * (1 - dx) + campo[i + g.nLon + 1] * dx) * dy;
}

/**
 * Indice e classe in un punto, per ogni giorno: stesso calcolo del lavoratore (griglia meteo,
 * interpolazione bilineare, temperatura alla quota del punto), così il pannello dice
 * esattamente quello che colora la mappa.
 */
export function giorniNelPunto(lon: number, lat: number, quota: number, habitat: Record<string, number>, scelta: string) {
  return giorniCalcolati.map((g) => {
    const P = bilineare(g.P, lon, lat);
    const t = bilineare(g.T0, lon, lat) + g.G * quota;
    const tx = bilineare(g.TX0, lon, lat) + g.G * quota;
    const tn = bilineare(g.TN0, lon, lat) + g.G * quota;
    const secco = bilineare(g.secco, lon, lat) > 0.5;
    const neve = quota >= bilineare(g.quotaNeve, lon, lat) ? bilineare(g.neve, lon, lat) : 0;
    let migliore = { cl: 0, indice: 0, specie: "", poche: false };
    for (const s of specieCalcolo(scelta)) {
      const h = habitat[s.id] ?? 0;
      const p = parametri[s.id];
      if (!h || !p) continue;
      const indice = (h / 100) * fattoreMeteo(p, P, t, tx, tn, secco, neve) * p.stagione[g.doy - 1];
      const cl = classe(indice, p.soglie);
      if (cl > migliore.cl || (cl === migliore.cl && indice > migliore.indice)) migliore = { cl, indice, specie: s.id, poche: s.poche };
    }
    return {
      data: g.data, affidabilita: g.affidabilita, ...migliore,
      P, t, tx, tn, secco, neve,
      freni: { caldo: tx, gelo: tn },
    };
  });
}

export function punto(lon: number, lat: number) {
  return chiedi<{
    quota: number | null; pendenza: number | null; esposizione: number | null;
    categoria: number; castagneto: boolean; valori: Record<string, number[]>;
  }>({ tipo: "punto", lon, lat });
}

export function andamento(tessere: [number, number, number][], scelta: string, giorni: number[], limiti: number[]) {
  return chiedi<{ quote: number[]; massimi: number[] }>({ tipo: "andamento", tessere, specie: specieCalcolo(scelta), giorni, limiti });
}

export interface Zona {
  punteggio: number; classe: number; lon: number; lat: number; buone: number; poche: boolean;
  campioni: number; liguria: boolean; cellaKm: number; zoom: number;
}
/** Le zone migliori entro "raggio" km da un punto, nel giorno scelto (vedi lavoratore.ts, zone). */
export function zone(lon: number, lat: number, raggio: number, scelta: string, giorno: number) {
  return chiedi<Zona[]>({ tipo: "zone", lon, lat, raggio, specie: specieCalcolo(scelta), giorno });
}

/** Aree scaricate: le sanno sia la mappa sia il lavoratore. */
export function inviaAree(aree: Area[]) {
  impostaOrigine(location.origin);
  impostaAree(aree);
  lavoratore.postMessage({ tipo: "aree", aree, origine: location.origin });
}

/** Parametri della specie (dopo inizia()). */
export function parametriDi(id: string): ParametriSpecie | undefined {
  return parametri[id];
}

// --- protocolli per MapLibre ---------------------------------------------------------------------
// Tessere fatte qui: file PNG, non ImageBitmap (vedi inPNG in lavoratore.ts: colori sbagliati sugli iPhone veri).
async function png(img: ImageData): Promise<ArrayBuffer> {
  const tela = new OffscreenCanvas(img.width, img.height);
  tela.getContext("2d")!.putImageData(img, 0, 0);
  return await (await tela.convertToBlob({ type: "image/png" })).arrayBuffer();
}
let vuota: Promise<ArrayBuffer> | null = null;
function trasparente() {
  vuota ??= png(new ImageData(1, 1));
  return vuota.then((b) => b.slice(0));
}
let piana: Promise<ArrayBuffer> | null = null;
function quotaZero() {
  // tessera Terrarium a quota 0 (R=128, G=0, B=0): niente rilievo
  piana ??= (() => {
    const img = new ImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 128; img.data[i + 3] = 255; }
    return png(img);
  })();
  return piana.then((b) => b.slice(0));
}

function zxy(url: string, prefisso: string) {
  const [percorso, query] = url.replace(prefisso, "").split("?");
  const [z, x, y] = percorso.split("/").map(Number);
  return { z, x, y, q: new URLSearchParams(query ?? "") };
}

const protocolloIndice: AddProtocolAction = async (p) => {
  const { z, x, y, q } = zxy(p.url, "boleindice://");
  const bmp = await chiedi<ArrayBuffer | null>({
    tipo: "tessera", z, x, y, specie: specieCalcolo(q.get("s") ?? "porcini"), giorno: Number(q.get("g") ?? 0),
  });
  return { data: bmp ?? (await trasparente()) };
};

const protocolloIsoipse: AddProtocolAction = async (p) => {
  const { z, x, y } = zxy(p.url, "boleisoipse://");
  const bmp = await chiedi<ArrayBuffer | null>({ tipo: "isoipse", z, x, y });
  return { data: bmp ?? (await trasparente()) };
};

const archivioQuota = apriArchivio(`${cartellaStrati}quota.pmtiles`);
const protocolloQuota: AddProtocolAction = async (p, controllo) => {
  const { z, x, y } = zxy(p.url, "bolequota://");
  const salvata = await tesseraSalvata("quota", z, x, y);
  if (salvata !== undefined) return { data: salvata.byteLength ? salvata : await quotaZero() };
  const r = await archivioQuota.getZxy(z, x, y, controllo.signal);
  return { data: r?.data ?? (await quotaZero()) };
};

export function registraProtocolli() {
  addProtocol("boleindice", protocolloIndice);
  addProtocol("boleisoipse", protocolloIsoipse);
  addProtocol("bolequota", protocolloQuota);
}

/** Solo per i test: classi di una tessera. */
export function classiTessera(z: number, x: number, y: number, scelta: string, giorno: number) {
  return chiedi<{ conta: number[]; G: number; doy: number }>({ tipo: "classi", z, x, y, specie: specieCalcolo(scelta), giorno });
}

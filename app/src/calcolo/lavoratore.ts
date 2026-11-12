/// <reference lib="webworker" />
/**
 * Lavoratore (Web Worker): fa i conti pesanti lontano dallo schermo, così la mappa resta fluida.
 *
 *  - "tessera": l'indice di una specie (o dei porcini) in una tessera 256×256, colorato per classi
 *  - "isoipse": curve di livello di una tessera, dalle stesse tessere della quota
 *  - "punto":   habitat, quota, tipo di bosco e castagneto in un punto (per "Perché qui?")
 *  - "andamento": per i giorni da oggi a +14, quota di habitat in classe media o più nell'area vista
 *  - "zone":    le zone migliori entro una distanza (per "Vicino a me")
 *  - "aree":    le aree scaricate: le loro tessere si leggono dal telefono, non dalla rete
 *
 * Indice di un pixel (come pipeline/indice_mappa.py):
 *   T = T0 + G × quota        (T0 = temperatura a quota 0, interpolata dalla griglia meteo)
 *   indice = H/100 × M(pioggia, T, Tmax, Tmin, secco, neve) × S(giorno dell'anno)
 *   classe = soglie della specie; per i porcini la più alta delle quattro.
 */
import type { PMTiles } from "pmtiles";
import { apriArchivio } from "../dati/archivi";
import { classe, COLORI_CLASSI, fattoreMeteo, type ParametriSpecie } from "./formule";
import type { InsiemeHabitat } from "../dati/catalogo";
import { impostaAree, impostaOrigine, tesseraSalvata } from "../dati/fuorilinea";

const TESSERA = 256;
const ZOOM_DATI_MAX = 12;
const MASSIMO_IN_MEMORIA = 160;

interface Griglia { lon0: number; lat0: number; dlon: number; dlat: number; nLon: number; nLat: number }
interface CampiGiorno {
  giorno: number; data: string; doy: number; G: number;
  P: Float32Array; T0: Float32Array; TX0: Float32Array; TN0: Float32Array; secco: Float32Array; neve: Float32Array;
  quotaNeve: Float32Array;
  affidabilita: "alta" | "media" | "bassa";
}
interface SpecieCalcolo { id: string; insieme: InsiemeHabitat; canale: number; poche: boolean }

let parametri: Record<string, ParametriSpecie> = {};
let griglia: Griglia;
const giorni = new Map<number, CampiGiorno>();
let regioni: { grid: Uint8Array; lon0: number; lat0: number; passo: number; nLon: number; nLat: number } | null = null;

const archivi = new Map<string, PMTiles>();
function archivio(nome: string, base: string): PMTiles {
  let a = archivi.get(nome);
  if (!a) {
    a = apriArchivio(`${base}${nome}.pmtiles`);
    archivi.set(nome, a);
  }
  return a;
}
let baseStrati = "";

// --- tessere decodificate in memoria (le più recenti) -------------------------------------------
const memoria = new Map<string, Uint8Array | Float32Array | null>();
function ricorda(k: string, v: Uint8Array | Float32Array | null) {
  memoria.delete(k);
  memoria.set(k, v);
  if (memoria.size > MASSIMO_IN_MEMORIA) memoria.delete(memoria.keys().next().value!);
}

/** Una tessera di uno strato: dal telefono se l'area è scaricata, altrimenti dalla rete. */
async function leggi(nome: string, z: number, x: number, y: number): Promise<ArrayBuffer | undefined> {
  const salvata = await tesseraSalvata(nome, z, x, y);
  if (salvata !== undefined) return salvata.byteLength ? salvata : undefined;
  return (await archivio(nome, baseStrati).getZxy(z, x, y))?.data;
}

let tela: OffscreenCanvas | null = null;
async function decodificaPNG(dati: ArrayBuffer): Promise<Uint8ClampedArray> {
  // niente correzioni di colore né premoltiplicazione: i valori devono restare esatti
  const img = await createImageBitmap(new Blob([dati], { type: "image/png" }), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  tela ??= new OffscreenCanvas(TESSERA, TESSERA);
  const ctx = tela.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" })!;
  ctx.clearRect(0, 0, TESSERA, TESSERA);
  ctx.drawImage(img, 0, 0);
  img.close();
  return ctx.getImageData(0, 0, TESSERA, TESSERA).data;
}

/** Habitat (3 canali, 0-100) di un insieme, oppure null se la tessera non c'è (= tutto zero). */
async function tesseraHabitat(insieme: string, z: number, x: number, y: number): Promise<Uint8Array | null> {
  const k = `${insieme}/${z}/${x}/${y}`;
  if (memoria.has(k)) return memoria.get(k) as Uint8Array | null;
  const dati = await leggi(insieme, z, x, y);
  let out: Uint8Array | null = null;
  if (dati) {
    const rgba = await decodificaPNG(dati);
    out = new Uint8Array(TESSERA * TESSERA * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      out[j] = rgba[i]; out[j + 1] = rgba[i + 1]; out[j + 2] = rgba[i + 2];
    }
  }
  ricorda(k, out);
  return out;
}

/** Quota in metri (Terrarium), oppure null se la tessera non c'è. */
async function tesseraQuota(z: number, x: number, y: number): Promise<Float32Array | null> {
  const k = `quota/${z}/${x}/${y}`;
  if (memoria.has(k)) return memoria.get(k) as Float32Array | null;
  const dati = await leggi("quota", z, x, y);
  let out: Float32Array | null = null;
  if (dati) {
    const rgba = await decodificaPNG(dati);
    out = new Float32Array(TESSERA * TESSERA);
    for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = rgba[i] * 256 + rgba[i + 1] + rgba[i + 2] / 256 - 32768;
  }
  ricorda(k, out);
  return out;
}

// --- geometria ----------------------------------------------------------------------------------
function lonDiPixel(z: number, gx: number) { return ((gx + 0.5) / (TESSERA * 2 ** z)) * 360 - 180; }
function latDiPixel(z: number, gy: number) {
  const n = Math.PI * (1 - (2 * (gy + 0.5)) / (TESSERA * 2 ** z));
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** Interpolazione bilineare su un campo della griglia meteo (fuori griglia: bordo). */
function bilineare(campo: Float32Array, fx: number, fy: number): number {
  const g = griglia;
  const x = Math.min(Math.max(fx, 0), g.nLon - 1.000001), y = Math.min(Math.max(fy, 0), g.nLat - 1.000001);
  const c = Math.floor(x), r = Math.floor(y), dx = x - c, dy = y - r;
  const i = r * g.nLon + c;
  return (campo[i] * (1 - dx) + campo[i + 1] * dx) * (1 - dy) + (campo[i + g.nLon] * (1 - dx) + campo[i + g.nLon + 1] * dx) * dy;
}

function regioneDi(lon: number, lat: number): number {
  if (!regioni) return 0;
  const c = Math.floor((lon - regioni.lon0) / regioni.passo), r = Math.floor((lat - regioni.lat0) / regioni.passo);
  if (c < 0 || r < 0 || c >= regioni.nLon || r >= regioni.nLat) return 0;
  return regioni.grid[r * regioni.nLon + c];
}

const ORDINE_AFF = ["bassa", "media", "alta"] as const;
function scendi(a: "alta" | "media" | "bassa", passi: number) {
  return ORDINE_AFF[Math.max(0, ORDINE_AFF.indexOf(a) - passi)];
}

// --- colori -------------------------------------------------------------------------------------
const RGB = COLORI_CLASSI.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
/** Trasparenza per classe: le classi basse lasciano vedere la mappa sotto. */
const ALFA = [0, 115, 155, 190, 210, 225];
const TRATTEGGIO = [20, 33, 27];

// --- calcolo di una tessera ----------------------------------------------------------------------
interface RisultatoPixel { cl: number; poche: boolean; habitat?: boolean }

async function datiTessera(z: number, x: number, y: number, specie: SpecieCalcolo[]) {
  const insiemi = [...new Set(specie.map((s) => s.insieme))];
  const [quota, ...habs] = await Promise.all([tesseraQuota(z, x, y), ...insiemi.map((i) => tesseraHabitat(i, z, x, y))]);
  const hab = new Map(insiemi.map((i, k) => [i, habs[k]]));
  return { quota, hab };
}

/** Classe (e se la specie decisiva ha pochi dati) per ogni pixel; passo = 1 per tutti, >1 per un campione. */
function classiTessera(
  z: number, x: number, y: number, specie: SpecieCalcolo[], g: CampiGiorno,
  quota: Float32Array, hab: Map<string, Uint8Array | null>, passo = 1,
  visita: (i: number, r: RisultatoPixel) => void,
) {
  const doy = g.doy;
  const lati = new Float32Array(TESSERA), lonI = new Float32Array(TESSERA);
  for (let i = 0; i < TESSERA; i++) {
    lati[i] = latDiPixel(z, y * TESSERA + i);
    lonI[i] = lonDiPixel(z, x * TESSERA + i);
  }
  for (let r = 0; r < TESSERA; r += passo) {
    const fy = (lati[r] - griglia.lat0) / griglia.dlat;
    for (let c = 0; c < TESSERA; c += passo) {
      const i = r * TESSERA + c;
      let qualcosa = false;
      for (const s of specie) {
        const h = hab.get(s.insieme);
        if (h && h[i * 3 + s.canale] > 0) { qualcosa = true; break; }
      }
      if (!qualcosa) { visita(i, { cl: 0, poche: false, habitat: false }); continue; }
      const fx = (lonI[c] - griglia.lon0) / griglia.dlon;
      const zc = quota[i];
      const P = bilineare(g.P, fx, fy);
      const t = bilineare(g.T0, fx, fy) + g.G * zc;
      const tx = bilineare(g.TX0, fx, fy) + g.G * zc;
      const tn = bilineare(g.TN0, fx, fy) + g.G * zc;
      const secco = bilineare(g.secco, fx, fy) > 0.5;
      // la neve del modello vale solo sopra la sua quota (punti innevati vicini - 200 m)
      const neve = zc >= bilineare(g.quotaNeve, fx, fy) ? bilineare(g.neve, fx, fy) : 0;
      let migliore = 0, poche = false;
      for (const s of specie) {
        const h = hab.get(s.insieme);
        const hv = h ? h[i * 3 + s.canale] : 0;
        if (hv === 0) continue;
        const p = parametri[s.id];
        const indice = (hv / 100) * fattoreMeteo(p, P, t, tx, tn, secco, neve) * p.stagione[doy - 1];
        const cl = classe(indice, p.soglie);
        if (cl > migliore) { migliore = cl; poche = s.poche; }
      }
      visita(i, { cl: migliore, poche, habitat: true });
    }
  }
}

async function tesseraIndice(z: number, x: number, y: number, specie: SpecieCalcolo[], giorno: number) {
  const g = giorni.get(giorno);
  if (!g || z > ZOOM_DATI_MAX) return null;
  const { quota, hab } = await datiTessera(z, x, y, specie);
  if (!quota || [...hab.values()].every((h) => h === null)) return null;
  const img = new ImageData(TESSERA, TESSERA);
  const px = img.data;
  const latMezzo = latDiPixel(z, y * TESSERA + 128), lonMezzo = lonDiPixel(z, x * TESSERA + 128);
  const inLiguria = regioneDi(lonMezzo, latMezzo) === 2;
  classiTessera(z, x, y, specie, g, quota, hab, 1, (i, { cl, poche }) => {
    if (cl === 0) return;
    const [rr, gg, bb] = RGB[cl - 1];
    const o = i * 4;
    // affidabilità del pixel: giorni di anticipo, poi un gradino in meno per specie con pochi dati e per la Liguria
    const aff = scendi(g.affidabilita, (poche ? 1 : 0) + (inLiguria ? 1 : 0));
    const gx = x * TESSERA + (i % TESSERA), gy = y * TESSERA + Math.floor(i / TESSERA);
    if (aff === "bassa" && (gx + gy) % 9 < 1.5) {
      px[o] = TRATTEGGIO[0]; px[o + 1] = TRATTEGGIO[1]; px[o + 2] = TRATTEGGIO[2]; px[o + 3] = 150;
      return;
    }
    px[o] = rr; px[o + 1] = gg; px[o + 2] = bb; px[o + 3] = ALFA[cl];
  });
  // alfa "dritto": MapLibre non deve ricevere colori già moltiplicati per la trasparenza
  return await createImageBitmap(img, { premultiplyAlpha: "none" });
}

// --- curve di livello (quadrati in marcia sulla quota, ricampionata alla tessera richiesta) -------
function intervallo(z: number) { return z <= 12 ? 100 : z <= 14 ? 50 : 25; }

// Quadrati in marcia: angoli a (alto-sinistra, 8), b (alto-destra, 4), e (basso-destra, 2), d (basso-sinistra, 1).
// Lati: 0 sopra, 1 destra, 2 sotto, 3 sinistra. Per ogni caso, coppie di lati da unire.
const SEGMENTI: number[][] = [
  [], [3, 2], [2, 1], [3, 1], [0, 1], [3, 0, 2, 1], [0, 2], [3, 0],
  [3, 0], [0, 2], [3, 2, 0, 1], [0, 1], [3, 1], [2, 1], [3, 2], [],
];
const P1: [number, number] = [0, 0], P2: [number, number] = [0, 0];
function puntoSulLato(lato: number, a: number, b: number, d: number, e: number, liv: number, c: number, r: number, out: [number, number]) {
  if (lato === 0) { out[0] = c + (liv - a) / (b - a); out[1] = r; }
  else if (lato === 1) { out[0] = c + 1; out[1] = r + (liv - b) / (e - b); }
  else if (lato === 2) { out[0] = c + (liv - d) / (e - d); out[1] = r + 1; }
  else { out[0] = c; out[1] = r + (liv - a) / (d - a); }
}

async function tesseraIsoipse(z: number, x: number, y: number) {
  if (z < 12) return null;
  const s = 2 ** (z - ZOOM_DATI_MAX);
  const x12 = Math.floor(x / s), y12 = Math.floor(y / s);
  const q = await tesseraQuota(ZOOM_DATI_MAX, x12, y12);
  if (!q) return null;
  const ox = (x - x12 * s) * (TESSERA / s), oy = (y - y12 * s) * (TESSERA / s);
  const N = TESSERA + 1;
  const v = new Float32Array(N * N);
  // quota agli angoli dei pixel della tessera richiesta (bilineare sulla tessera dello zoom 12)
  for (let r = 0; r < N; r++) {
    const sy = Math.min(Math.max(oy + r / s - 0.5, 0), TESSERA - 1.0001);
    const y0 = Math.floor(sy), dy = sy - y0;
    for (let c = 0; c < N; c++) {
      const sx = Math.min(Math.max(ox + c / s - 0.5, 0), TESSERA - 1.0001);
      const x0 = Math.floor(sx), dx = sx - x0;
      const a = q[y0 * TESSERA + x0], b = q[y0 * TESSERA + x0 + 1], cc = q[(y0 + 1) * TESSERA + x0], d = q[(y0 + 1) * TESSERA + x0 + 1];
      v[r * N + c] = (a * (1 - dx) + b * dx) * (1 - dy) + (cc * (1 - dx) + d * dx) * dy;
    }
  }
  const passo = intervallo(z);
  let min = Infinity, max = -Infinity;
  for (const e of v) { if (e < min) min = e; if (e > max) max = e; }
  if (max - min < 1) return null;
  const canvas = new OffscreenCanvas(TESSERA, TESSERA);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.lineCap = "round";
  for (let livello = Math.ceil(Math.max(min, 1) / passo) * passo; livello <= max; livello += passo) {
    const maestra = livello % (passo * 5) === 0;
    ctx.beginPath();
    for (let r = 0; r < TESSERA; r++) {
      for (let c = 0; c < TESSERA; c++) {
        const a = v[r * N + c], b = v[r * N + c + 1], d = v[(r + 1) * N + c], e = v[(r + 1) * N + c + 1];
        const caso = (a >= livello ? 8 : 0) | (b >= livello ? 4 : 0) | (e >= livello ? 2 : 0) | (d >= livello ? 1 : 0);
        if (caso === 0 || caso === 15) continue;
        // celle che toccano il mare o l'esterno (quota 0 = nessun dato): niente curve finte sul bordo
        if (a <= 0.5 || b <= 0.5 || d <= 0.5 || e <= 0.5) continue;
        const lati = SEGMENTI[caso];
        for (let k = 0; k < lati.length; k += 2) {
          puntoSulLato(lati[k], a, b, d, e, livello, c, r, P1);
          puntoSulLato(lati[k + 1], a, b, d, e, livello, c, r, P2);
          ctx.moveTo(P1[0], P1[1]);
          ctx.lineTo(P2[0], P2[1]);
        }
      }
    }
    ctx.strokeStyle = maestra ? "rgb(96, 60, 30)" : "rgb(122, 86, 52)";
    ctx.lineWidth = maestra ? 1.6 : 1;
    ctx.stroke();
  }
  // Linee piene, senza bordi sfumati: i pixel quasi trasparenti diventano rumore chiaro sulla mappa.
  // La trasparenza la dà il livello (raster-opacity).
  const img = ctx.getImageData(0, 0, TESSERA, TESSERA);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 90 ? 255 : 0;
  return await createImageBitmap(img, { premultiplyAlpha: "none" });
}

// --- un punto -----------------------------------------------------------------------------------
async function punto(lon: number, lat: number) {
  const z = ZOOM_DATI_MAX, n = TESSERA * 2 ** z;
  const gx = ((lon + 180) / 360) * n;
  const gy = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const x = Math.floor(gx / TESSERA), y = Math.floor(gy / TESSERA);
  const i = Math.floor(gy % TESSERA) * TESSERA + Math.floor(gx % TESSERA);
  const quota = await tesseraQuota(z, x, y);
  const insiemi: InsiemeHabitat[] = ["habitat_a", "habitat_b", "habitat_c", "habitat_d", "habitat_e"];
  const hab = await Promise.all(insiemi.map((s) => tesseraHabitat(s, z, x, y)));
  const valori: Record<string, number[]> = {};
  insiemi.forEach((s, k) => { valori[s] = hab[k] ? [hab[k]![i * 3], hab[k]![i * 3 + 1], hab[k]![i * 3 + 2]] : [0, 0, 0]; });
  const bosco = valori.habitat_e[2];
  // pendenza ed esposizione dalla quota (differenze centrali, pixel di circa 27 m × coseno della latitudine)
  let pendenza: number | null = null, esposizione: number | null = null;
  if (quota) {
    const c = i % TESSERA, r = Math.floor(i / TESSERA);
    if (c > 0 && c < TESSERA - 1 && r > 0 && r < TESSERA - 1) {
      const lato = (40075016.7 / n) * Math.cos((lat * Math.PI) / 180);
      const dzdx = (quota[i + 1] - quota[i - 1]) / (2 * lato);
      const dzdy = (quota[i - TESSERA] - quota[i + TESSERA]) / (2 * lato);
      pendenza = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
      esposizione = ((Math.atan2(-dzdx, -dzdy) * 180) / Math.PI + 360) % 360; // 0 = nord, 90 = est
    }
  }
  return {
    quota: quota ? quota[i] : null, pendenza, esposizione,
    categoria: bosco & 127, castagneto: (bosco & 128) !== 0, valori,
  };
}

// --- andamento nell'area vista ----------------------------------------------------------------
/** Per ogni giorno: quota dell'habitat in vista in classe media o più, e classe più alta in vista. */
async function andamento(tessere: [number, number, number][], specie: SpecieCalcolo[], elenco: number[], limiti: number[]) {
  const dati = await Promise.all(tessere.map(([z, x, y]) => datiTessera(z, x, y, specie)));
  const quote: number[] = [], massimi: number[] = [];
  for (const d of elenco) {
    const g = giorni.get(d);
    let conHabitat = 0, buone = 0, massimo = 0;
    if (g) {
      tessere.forEach(([z, x, y], k) => {
        const { quota, hab } = dati[k];
        if (!quota) return;
        classiTessera(z, x, y, specie, g, quota, hab, 4, (i, { cl }) => {
          // solo i pixel dentro l'area vista
          const lon = lonDiPixel(z, x * TESSERA + (i % TESSERA)), lat = latDiPixel(z, y * TESSERA + Math.floor(i / TESSERA));
          if (lon < limiti[0] || lon > limiti[2] || lat < limiti[1] || lat > limiti[3]) return;
          if (cl > 0) { conHabitat++; if (cl >= 3) buone++; if (cl > massimo) massimo = cl; }
        });
      });
    }
    quote.push(conHabitat ? buone / conHabitat : 0);
    massimi.push(massimo);
  }
  return { quote, massimi };
}

// --- zone migliori vicino a un punto ("Vicino a me") ----------------------------------------------
/**
 * Divide l'area entro "raggio" km in quadrati (celle) e per ogni cella conta, su un campione di
 * pixel, l'habitat delle specie scelte e la sua classe nel giorno scelto.
 * Classe della zona = la più alta classe che copre almeno il 10% dell'habitat della cella
 * (così un pixel isolato non basta). Si tengono le celle migliori, lontane fra loro.
 */
async function zone(lon0: number, lat0: number, raggio: number, specie: SpecieCalcolo[], giorno: number) {
  const g = giorni.get(giorno);
  if (!g) return [];
  const z = raggio <= 15 ? 11 : raggio <= 60 ? 10 : 9;
  const cella = raggio <= 15 ? 1.5 : raggio <= 30 ? 2.5 : raggio <= 60 ? 4 : raggio <= 120 ? 6 : 8; // km
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.57;
  const lim = [lon0 - raggio / kx, lat0 - raggio / ky, lon0 + raggio / kx, lat0 + raggio / ky];
  const n = 2 ** z;
  const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const ty = (lat: number) => Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  const tessere: [number, number][] = [];
  for (let x = tx(Math.max(lim[0], 6.5)); x <= tx(Math.min(lim[2], 10.2)); x++)
    for (let y = ty(Math.min(lim[3], 46.6)); y <= ty(Math.max(lim[1], 43.6)); y++) tessere.push([x, y]);

  interface Cella { hab: number; conta: number[]; lon: number[]; lat: number[]; poche: number[] }
  const celle = new Map<number, Cella>();
  const passo = 2;
  // le tessere si leggono a gruppi, per non tenere in memoria tutto insieme
  for (let k = 0; k < tessere.length; k += 8) {
    const gruppo = tessere.slice(k, k + 8);
    const dati = await Promise.all(gruppo.map(([x, y]) => datiTessera(z, x, y, specie)));
    gruppo.forEach(([x, y], j) => {
      const { quota, hab } = dati[j];
      if (!quota || [...hab.values()].every((h) => h === null)) return;
      classiTessera(z, x, y, specie, g, quota, hab, passo, (i, r) => {
        if (!r.habitat) return;
        const lon = lonDiPixel(z, x * TESSERA + (i % TESSERA)), lat = latDiPixel(z, y * TESSERA + Math.floor(i / TESSERA));
        const dx = (lon - lon0) * kx, dy = (lat - lat0) * ky;
        if (dx * dx + dy * dy > raggio * raggio) return;
        const ch = Math.floor(dx / cella) * 4096 + Math.floor(dy / cella);
        let c = celle.get(ch);
        if (!c) { c = { hab: 0, conta: [0, 0, 0, 0, 0, 0], lon: [0, 0, 0, 0, 0, 0], lat: [0, 0, 0, 0, 0, 0], poche: [0, 0, 0, 0, 0, 0] }; celle.set(ch, c); }
        c.hab++;
        c.conta[r.cl]++; c.lon[r.cl] += lon; c.lat[r.cl] += lat;
        if (r.poche) c.poche[r.cl]++;
      });
    });
  }

  const candidate: { punteggio: number; classe: number; lon: number; lat: number; buone: number; poche: boolean; campioni: number }[] = [];
  for (const c of celle.values()) {
    if (c.hab < 4) continue;
    let classeZona = 0, sopra = 0;
    for (let cl = 5; cl >= 1; cl--) {
      let n = 0;
      for (let k = cl; k <= 5; k++) n += c.conta[k];
      if (n >= Math.max(2, 0.1 * c.hab)) { classeZona = cl; sopra = n; break; }
    }
    if (!classeZona) continue;
    let sl = 0, sa = 0, sp = 0;
    for (let k = classeZona; k <= 5; k++) { sl += c.lon[k]; sa += c.lat[k]; sp += c.poche[k]; }
    const buone = (c.conta[3] + c.conta[4] + c.conta[5]) / c.hab;
    candidate.push({
      punteggio: classeZona + 0.99 * (sopra / c.hab), classe: classeZona, lon: sl / sopra, lat: sa / sopra,
      buone, poche: sp * 2 > sopra, campioni: c.hab,
    });
  }
  candidate.sort((a, b) => b.punteggio - a.punteggio);
  const scelte: typeof candidate = [];
  const distanza = 2.5 * cella;
  for (const c of candidate) {
    if (scelte.some((s) => Math.hypot((s.lon - c.lon) * kx, (s.lat - c.lat) * ky) < distanza)) continue;
    scelte.push(c);
    if (scelte.length === 10) break;
  }
  return scelte.map((c) => ({ ...c, liguria: regioneDi(c.lon, c.lat) === 2, cellaKm: cella, zoom: z }));
}

// --- messaggi -----------------------------------------------------------------------------------
self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  try {
    switch (m.tipo) {
      case "inizio":
        parametri = m.parametri;
        griglia = m.griglia;
        baseStrati = m.baseStrati;
        regioni = m.regioni;
        break;
      case "giorni":
        giorni.clear();
        for (const g of m.giorni as CampiGiorno[]) giorni.set(g.giorno, g);
        break;
      case "tessera": {
        const bmp = await tesseraIndice(m.z, m.x, m.y, m.specie, m.giorno);
        (self as DedicatedWorkerGlobalScope).postMessage({ id: m.id, bitmap: bmp }, bmp ? [bmp] : []);
        break;
      }
      case "isoipse": {
        const bmp = await tesseraIsoipse(m.z, m.x, m.y);
        (self as DedicatedWorkerGlobalScope).postMessage({ id: m.id, bitmap: bmp }, bmp ? [bmp] : []);
        break;
      }
      case "punto":
        postMessage({ id: m.id, risultato: await punto(m.lon, m.lat) });
        break;
      case "classi": {
        // diagnosi: quante celle per classe in una tessera
        const g = giorni.get(m.giorno)!;
        const { quota, hab } = await datiTessera(m.z, m.x, m.y, m.specie);
        const conta = [0, 0, 0, 0, 0, 0];
        if (quota) classiTessera(m.z, m.x, m.y, m.specie, g, quota, hab, 1, (_i, r) => { conta[r.cl]++; });
        postMessage({ id: m.id, risultato: { conta, G: g.G, doy: g.doy } });
        break;
      }
      case "andamento":
        postMessage({ id: m.id, risultato: await andamento(m.tessere, m.specie, m.giorni, m.limiti) });
        break;
      case "zone":
        postMessage({ id: m.id, risultato: await zone(m.lon, m.lat, m.raggio, m.specie, m.giorno) });
        break;
      case "aree":
        impostaOrigine(m.origine);
        impostaAree(m.aree);
        memoria.clear(); // le tessere in memoria potrebbero essere quelle "vuote" lette senza rete
        break;
    }
  } catch (err) {
    postMessage({ id: m.id, errore: String(err) });
  }
};

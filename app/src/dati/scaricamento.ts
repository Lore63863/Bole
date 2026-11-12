/**
 * Scaricare (e togliere) un'area per l'uso senza rete: mappa base zoom 6-14, boschi e quota zoom 6-12.
 * Il meteo e i file dell'app li tiene il service worker (vedi vite.config.ts).
 */
import type { PMTiles } from "pmtiles";
import { apriArchivio } from "./archivi";
import { cartellaStrati, inviaAree } from "../calcolo/client";
import { tesseraBaseDallaRete } from "../mappa/base";
import { memoria } from "../ui/dom";
import {
  areeScaricate, coperta, salvaTessera, stimaArea, tessereDi, togliTessera, type Area, type Dimensioni,
} from "./fuorilinea";

/** Oltre questa dimensione l'area va rimpicciolita (obiettivo della Fase 4: meno di 150 MB per area). */
export const MASSIMO_BYTE = 150e6;
const PARALLELI = 6;

const url = (nome: string) => new URL(`dati/${nome}`, document.baseURI).href;
let dimensioni: Promise<Dimensioni> | null = null;
function caricaDimensioni() {
  dimensioni ??= fetch(url("dimensioni.json")).then((r) => r.json());
  return dimensioni;
}

export async function stima(limiti: [number, number, number, number]) {
  return stimaArea(limiti, await caricaDimensioni());
}

interface Lavoro { archivio: string; z: number; x: number; y: number }
async function lavoriDi(limiti: [number, number, number, number]) {
  const dim = await caricaDimensioni();
  const out: Lavoro[] = [];
  for (const [archivio, d] of Object.entries(dim))
    for (let z = Math.max(6, d.zoom[0]); z <= d.zoom[1]; z++)
      for (const [x, y] of tessereDi(limiti, z)) out.push({ archivio, z, x, y });
  return out;
}

export async function scarica(
  limiti: [number, number, number, number], nome: string,
  avanzamento: (fatte: number, totale: number, byte: number) => void, segnale: AbortSignal,
): Promise<Area> {
  const lavori = await lavoriDi(limiti);
  const totale = lavori.length;
  const archivi = new Map<string, PMTiles>();
  const archivio = (n: string) => {
    let a = archivi.get(n);
    if (!a) { a = apriArchivio(`${cartellaStrati}${n}.pmtiles`); archivi.set(n, a); }
    return a;
  };
  let fatte = 0, byte = 0;
  const coda = [...lavori];
  await Promise.all(Array.from({ length: PARALLELI }, async () => {
    for (let l = coda.pop(); l; l = coda.pop()) {
      if (segnale.aborted) throw new DOMException("Scaricamento annullato", "AbortError");
      const dati = l.archivio === "base"
        ? await tesseraBaseDallaRete(l.z, l.x, l.y, segnale)
        : (await archivio(l.archivio).getZxy(l.z, l.x, l.y, segnale))?.data;
      await salvaTessera(l.archivio, l.z, l.x, l.y, dati);
      fatte++;
      byte += dati?.byteLength ?? 0;
      avanzamento(fatte, totale, byte);
    }
  }));
  // il meteo del giorno: passandolo dal service worker resta in memoria per quando manca la rete
  await Promise.allSettled(["meteo/oggi.json", "meteo/punti.bin.gz"].map((f) => fetch(url(f))));
  const area: Area = {
    id: `${Date.now().toString(36)}`, nome, limiti, byte, tessere: totale, data: new Date().toLocaleDateString("sv-SE"),
  };
  const aree = [...areeScaricate(), area];
  memoria.scrivi("aree", aree);
  inviaAree(aree);
  return area;
}

/** Toglie un'area: cancella le sue tessere, tranne quelle che servono anche a un'altra area scaricata. */
export async function togli(area: Area) {
  const resto = areeScaricate().filter((a) => a.id !== area.id);
  memoria.scrivi("aree", resto);
  inviaAree(resto);
  for (const l of await lavoriDi(area.limiti)) {
    if (!coperta(l.z, l.x, l.y, resto)) await togliTessera(l.archivio, l.z, l.x, l.y);
  }
}

/** All'avvio: le aree salvate in passato. */
export function avviaAree() {
  inviaAree(memoria.leggi<Area[]>("aree", []));
}

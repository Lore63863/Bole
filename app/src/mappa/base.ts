/**
 * Mappa base: quattro file PMTiles (OpenStreetMap via Protomaps) visti come uno solo.
 *
 * GitHub Pages accetta file fino a 100 MB, quindi la mappa base è divisa così:
 *   base_z0-12.pmtiles      zoom 0-12, tutta l'area
 *   base_z13.pmtiles        zoom 13, tutta l'area
 *   base_z14_ovest.pmtiles  zoom 14, a ovest di 8,1° E
 *   base_z14_est.pmtiles    zoom 14, a est di 8,1° E
 *
 * Il protocollo "bolebase://z/x/y" sceglie il file giusto per ogni tessera.
 * Oltre lo zoom 14 la mappa ingrandisce le tessere dello zoom 14 (sono vettoriali).
 */
import { PMTiles } from "pmtiles";
import type { AddProtocolAction } from "maplibre-gl";
import { tesseraSalvata } from "../dati/fuorilinea";

export const ZOOM_MASSIMO_BASE = 14;
const CONFINE_EST_OVEST = 8.1; // gradi di longitudine

const cartella = `${import.meta.env.BASE_URL}dati/mappa/`;
const archivi = {
  basso: new PMTiles(`${cartella}base_z0-12.pmtiles`),
  z13: new PMTiles(`${cartella}base_z13.pmtiles`),
  ovest: new PMTiles(`${cartella}base_z14_ovest.pmtiles`),
  est: new PMTiles(`${cartella}base_z14_est.pmtiles`),
};

/** Longitudine del centro della tessera z/x/y. */
function longitudineCentro(z: number, x: number): number {
  return ((x + 0.5) / 2 ** z) * 360 - 180;
}

/** Gli archivi da provare, nell'ordine, per una tessera. */
function archiviPer(z: number, x: number): PMTiles[] {
  if (z <= 12) return [archivi.basso];
  if (z === 13) return [archivi.z13];
  // Le tessere sul confine stanno in tutti e due i file: si prova prima quello del centro.
  return longitudineCentro(z, x) < CONFINE_EST_OVEST
    ? [archivi.ovest, archivi.est]
    : [archivi.est, archivi.ovest];
}

/** Legge una tessera vettoriale (già decompressa) oppure undefined se non c'è: prima dal telefono
 *  (aree scaricate), poi dalla rete. */
export async function tesseraBase(z: number, x: number, y: number, segnale?: AbortSignal) {
  const salvata = await tesseraSalvata("base", z, x, y);
  if (salvata !== undefined) return salvata.byteLength ? salvata : undefined;
  return tesseraBaseDallaRete(z, x, y, segnale);
}

/** Solo dalla rete (per scaricare un'area). */
export async function tesseraBaseDallaRete(z: number, x: number, y: number, segnale?: AbortSignal) {
  for (const archivio of archiviPer(z, x)) {
    const r = await archivio.getZxy(z, x, y, segnale);
    if (r?.data) return r.data;
  }
  return undefined;
}

/** Protocollo per MapLibre: "bolebase://{z}/{x}/{y}". */
export const protocolloBase: AddProtocolAction = async (parametri, controllo) => {
  const [z, x, y] = parametri.url.replace("bolebase://", "").split("/").map(Number);
  const dati = await tesseraBase(z, x, y, controllo.signal);
  // Una tessera vuota (fuori area) va bene: la mappa resta del colore di sfondo.
  return { data: dati ?? new ArrayBuffer(0) };
};

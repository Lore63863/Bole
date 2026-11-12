/**
 * Aree scaricate per usare Bolé senza rete ("fuori linea").
 *
 * Le tessere di un'area scaricata stanno nella Cache Storage del telefono, con indirizzi finti
 *     <origine>/__bole/tessere/<archivio>/<z>/<x>/<y>
 * Il service worker non le tocca: le leggono direttamente la mappa (thread principale) e il
 * lavoratore dei calcoli, prima di chiedere la stessa tessera alla rete.
 * Una tessera che non esiste (mare, fuori regione) si salva vuota: così senza rete non si prova a cercarla.
 * Questo file funziona sia nel thread principale sia nel lavoratore (niente DOM).
 */

export const NOME_CACHE = "bole-aree-v1";

export interface Area {
  id: string;
  nome: string;
  limiti: [number, number, number, number]; // ovest, sud, est, nord (gradi)
  byte: number;
  tessere: number;
  data: string; // giorno dello scaricamento (AAAA-MM-GG)
}

let aree: Area[] = [];
export function impostaAree(a: Area[]) { aree = a; }
export function areeScaricate() { return aree; }

const PREFISSO = "/__bole/tessere/";
function chiave(origine: string, archivio: string, z: number, x: number, y: number) {
  return `${origine}${PREFISSO}${archivio}/${z}/${x}/${y}`;
}
let origine = "";
export function impostaOrigine(o: string) { origine = o; }

/** Limiti della tessera z/x/y in gradi. */
export function limitiTessera(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z;
  const lat = (t: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n))) * 180) / Math.PI;
  return [(x / n) * 360 - 180, lat(y + 1), ((x + 1) / n) * 360 - 180, lat(y)];
}

/** La tessera tocca una delle aree? */
export function coperta(z: number, x: number, y: number, elenco: Area[] = aree) {
  const [o, s, e, n] = limitiTessera(z, x, y);
  return elenco.some((a) => o < a.limiti[2] && e > a.limiti[0] && s < a.limiti[3] && n > a.limiti[1]);
}
const dentroUnArea = (z: number, x: number, y: number) => coperta(z, x, y);

let cache: Promise<Cache> | null = null;
function apri() {
  cache ??= caches.open(NOME_CACHE);
  return cache;
}

/** La tessera salvata (anche vuota), o undefined se non è in un'area scaricata. */
export async function tesseraSalvata(archivio: string, z: number, x: number, y: number): Promise<ArrayBuffer | undefined> {
  if (!aree.length || !origine || typeof caches === "undefined" || !dentroUnArea(z, x, y)) return undefined;
  try {
    const r = await (await apri()).match(chiave(origine, archivio, z, x, y));
    return r ? await r.arrayBuffer() : undefined;
  } catch {
    return undefined;
  }
}

export async function togliTessera(archivio: string, z: number, x: number, y: number) {
  await (await apri()).delete(chiave(origine, archivio, z, x, y));
}

export async function salvaTessera(archivio: string, z: number, x: number, y: number, dati: ArrayBuffer | undefined) {
  await (await apri()).put(chiave(origine, archivio, z, x, y), new Response(dati ?? new ArrayBuffer(0)));
}

// --- quali tessere servono per un'area ------------------------------------------------------------
export function tessereDi(limiti: [number, number, number, number], z: number): [number, number][] {
  const n = 2 ** z;
  const tx = (lon: number) => Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
  const ty = (lat: number) => Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n)));
  const out: [number, number][] = [];
  for (let x = tx(limiti[0]); x <= tx(limiti[2]); x++) for (let y = ty(limiti[3]); y <= ty(limiti[1]); y++) out.push([x, y]);
  return out;
}

/** Tabella prodotta da pipeline/app_dimensioni.py: per archivio e zoom, [tessere, byte] per "x,y" della tessera madre allo zoom 8. */
export type Dimensioni = Record<string, { zoom: [number, number]; madri: Record<string, Record<string, [number, number]>> }>;

/** Stima di quante tessere e quanti byte servono per un'area (archivi: base e strati). */
export function stimaArea(limiti: [number, number, number, number], dim: Dimensioni) {
  let byte = 0, tessere = 0;
  for (const d of Object.values(dim)) {
    for (let z = Math.max(6, d.zoom[0]); z <= d.zoom[1]; z++) {
      const perZoom = d.madri[String(z)];
      if (!perZoom) continue;
      const conta = new Map<string, number>();
      for (const [x, y] of tessereDi(limiti, z)) {
        const k = z >= 8 ? `${x >> (z - 8)},${y >> (z - 8)}` : `${x},${y}`;
        conta.set(k, (conta.get(k) ?? 0) + 1);
        tessere++;
      }
      for (const [k, n] of conta) {
        const m = perZoom[k];
        if (m) byte += (m[1] / m[0]) * Math.min(n, m[0]);
      }
    }
  }
  return { byte, tessere };
}

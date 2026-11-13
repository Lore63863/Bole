/**
 * Luoghi: nomi (OpenStreetMap), regioni e aree protette. Si caricano solo quando servono.
 */
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

const url = (nome: string) => new URL(`dati/${nome}`, document.baseURI).href;

type Nome = [string, string, number, number]; // nome, tipo, lon, lat
let nomi: Promise<Nome[]> | null = null;
let aree: Promise<FeatureCollection> | null = null;
let categorie: Promise<Record<string, { regione: string; codice: string; categoria: string }>> | null = null;

/** Distanza in km fra due punti (formula dell'emisenoverso). */
export function distanzaKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Direzione da un punto all'altro, in gradi da nord (0-360). */
export function direzioneGradi(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

export function puntoCardinale(gradi: number): string {
  return ["nord", "nord-est", "est", "sud-est", "sud", "sud-ovest", "ovest", "nord-ovest"][Math.round(gradi / 45) % 8];
}

/** Il luogo con nome più vicino; preferisce paesi e frazioni se sono quasi alla stessa distanza. */
export async function nomeVicino(lon: number, lat: number): Promise<{ nome: string; tipo: string; km: number; lon: number; lat: number } | null> {
  nomi ??= fetch(url("luoghi/nomi.json")).then((r) => r.json());
  const elenco = await nomi;
  let migliore: { nome: string; tipo: string; km: number; lon: number; lat: number } | null = null;
  let punteggio = Infinity;
  for (const [nome, tipo, lo, la] of elenco) {
    if (Math.abs(la - lat) > 0.1 || Math.abs(lo - lon) > 0.14) continue;
    const km = distanzaKm(lon, lat, lo, la);
    const peso = tipo === "paese" || tipo === "città" ? 0.6 : tipo === "frazione" ? 0.8 : 1; // un paese a 1 km batte una cascina a 700 m
    if (km * peso < punteggio) {
      punteggio = km * peso;
      migliore = { nome, tipo, km, lon: lo, lat: la };
    }
  }
  return migliore;
}

function dentroAnello(lon: number, lat: number, anello: Position[]): boolean {
  let dentro = false;
  for (let i = 0, j = anello.length - 1; i < anello.length; j = i++) {
    const [xi, yi] = anello[i], [xj, yj] = anello[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function dentro(lon: number, lat: number, g: Polygon | MultiPolygon): boolean {
  const poligoni = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return poligoni.some((p) => dentroAnello(lon, lat, p[0]) && !p.slice(1).some((buco) => dentroAnello(lon, lat, buco)));
}

/** Aree protette e siti Natura 2000 che contengono il punto. */
export async function areeProtette(lon: number, lat: number): Promise<Record<string, string>[]> {
  aree ??= fetch(url("luoghi/aree_protette.geojson")).then((r) => r.json());
  const fc = await aree;
  const visti = new Set<string>();
  return fc.features
    .filter((f: Feature) => f.geometry && dentro(lon, lat, f.geometry as Polygon | MultiPolygon))
    .map((f) => f.properties as Record<string, string>)
    .filter((p) => { const k = `${p.nome}|${p.tipo}`; if (visti.has(k)) return false; visti.add(k); return true; });
}

export function regioneDi(lon: number, lat: number, regioni: FeatureCollection): "Piemonte" | "Liguria" | null {
  for (const f of regioni.features) if (dentro(lon, lat, f.geometry as Polygon | MultiPolygon)) return f.properties?.regione;
  return null;
}

export async function nomeBosco(codice: number): Promise<string | null> {
  if (!codice) return null;
  categorie ??= fetch(url("categorie.json")).then((r) => r.json());
  return (await categorie)[String(codice)]?.categoria ?? null;
}

// --- ricerca per nome (tutto sul telefono: niente esce) ------------------------------------------
export interface Trovato { nome: string; tipo: string; lon: number; lat: number; vicinoA: string | null; km: number }

const ORDINE_TIPI: Record<string, number> = { "città": 0, paese: 1, quartiere: 2, frazione: 3, case: 4, "località": 5 };
let indice: Promise<{ n: string; parole: string[]; v: Nome }[]> | null = null;

/** Testo senza accenti, apostrofi e maiuscole: "Sant'Anna" e "santanna" e "sant anna" si trovano a vicenda. */
export function normalizza(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function caricaIndice() {
  nomi ??= fetch(url("luoghi/nomi.json")).then((r) => r.json());
  indice ??= nomi.then((elenco) => elenco.map((v) => { const n = normalizza(v[0]); return { n, parole: n.split(" "), v }; }));
  return indice;
}

/** Paese o città più vicino (entro 12 km), per distinguere località con lo stesso nome. */
async function paeseVicino(lon: number, lat: number, escluso: string): Promise<string | null> {
  const elenco = await nomi!;
  let migliore: string | null = null, d = 12;
  for (const [nome, tipo, lo, la] of elenco) {
    if ((tipo !== "paese" && tipo !== "città") || nome === escluso) continue;
    if (Math.abs(la - lat) > 0.12 || Math.abs(lo - lon) > 0.16) continue;
    const km = distanzaKm(lon, lat, lo, la);
    if (km < d) { d = km; migliore = nome; }
  }
  return migliore;
}

/** I nomi che corrispondono al testo: prima i nomi uguali, poi quelli che iniziano così; a parità i paesi, poi i più vicini. */
export async function cercaLuoghi(testo: string, lon: number, lat: number, quanti = 20): Promise<Trovato[]> {
  const q = normalizza(testo);
  if (q.length < 2) return [];
  const voci = await caricaIndice();
  const trovati: { p: number; v: Nome; km: number }[] = [];
  for (const { n, parole, v } of voci) {
    let p: number;
    if (n === q) p = 0;
    else if (n.startsWith(q)) p = 1;
    else if (parole.some((w) => w.startsWith(q))) p = 2;
    else if (q.length >= 3 && n.includes(q)) p = 3;
    else continue;
    trovati.push({ p: p * 10 + (ORDINE_TIPI[v[1]] ?? 6), v, km: distanzaKm(lon, lat, v[2], v[3]) });
  }
  trovati.sort((a, b) => a.p - b.p || a.km - b.km);
  const scelti: typeof trovati = [];
  for (const t of trovati) {
    // stesso nome e tipo a meno di 1 km: è lo stesso posto scritto due volte
    if (scelti.some((s) => s.v[0] === t.v[0] && s.v[1] === t.v[1] && distanzaKm(s.v[2], s.v[3], t.v[2], t.v[3]) < 1)) continue;
    scelti.push(t);
    if (scelti.length >= quanti) break;
  }
  return Promise.all(scelti.map(async ({ v, km }) => ({
    nome: v[0], tipo: v[1], lon: v[2], lat: v[3], km,
    vicinoA: v[1] === "paese" || v[1] === "città" ? null : await paeseVicino(v[2], v[3], v[0]),
  })));
}

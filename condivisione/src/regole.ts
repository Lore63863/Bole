/**
 * Regole del server della condivisione: specie, codici di gruppo, date, quadrati, limiti.
 * Stanno qui (e non in index.ts) perché un Worker può esportare solo il gestore delle richieste.
 */

/** Le 14 specie dell'app (stessi codici di app/src/dati/catalogo.ts). */
export const SPECIE = [
  "porcino", "porcino_nero", "porcino_estivo", "porcino_rosso", "gallinaccio", "ovolo", "mazza_di_tamburo",
  "chiodino", "trombetta", "steccherino", "sanguinello", "spugnole", "prugnolo", "dormiente",
] as const;
export const QUANTITA = ["pochi", "abbastanza", "tanti"];

/** Alfabeto dei codici di gruppo: niente 0/O, 1/I/L, per non sbagliare a leggerli. */
export const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Quadrati ammessi: Piemonte e Liguria con un po' di margine (km della griglia EPSG:3035). */
const AREA = { e0: 4030, e1: 4340, n0: 2280, n1: 2620 };

export const LIMITI = {
  /** ritrovamenti nuovi al giorno per gruppo */
  perGruppo: 200,
  /** ritrovamenti nuovi al giorno in tutto (resta molto sotto i limiti gratuiti di D1) */
  totale: 5000,
  /** quanto indietro si può datare un ritrovamento (giorni) */
  passato: 400,
  /** dopo quanto un ritrovamento si cancella da solo (giorni, circa 3 anni) */
  conserva: 1100,
  /** dimensione massima di una richiesta (byte) */
  corpo: 2048,
};

// --- piccoli aiuti ------------------------------------------------------------------------------

/** Controlla formato e carattere di controllo di un codice "XXXX-XXXX-XXXX". */
export function codiceValido(codice: string | null): codice is string {
  if (!codice || !/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(codice)) return false;
  const v = codice.replace(/-/g, "").split("").map((c) => ALFABETO.indexOf(c));
  if (v.some((x) => x < 0)) return false;
  let somma = 0;
  for (let i = 0; i < 11; i++) somma += (i + 1) * v[i];
  return v[11] === somma % ALFABETO.length;
}

/** Oggi in Italia, "AAAA-MM-GG". */
export function oggiInItalia(adesso = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(adesso);
}

export function spostaGiorni(data: string, giorni: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

export function dataValida(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function cellaValida(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = /^1kmE(\d{4})N(\d{4})$/.exec(s);
  if (!m) return false;
  const e = Number(m[1]), n = Number(m[2]);
  return e >= AREA.e0 && e <= AREA.e1 && n >= AREA.n0 && n <= AREA.n1;
}

export const esadecimale = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function impronta(testo: string): Promise<string> {
  return esadecimale(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo)));
}

export async function improntaGruppo(pepe: string, codice: string): Promise<string> {
  const chiave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepe), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return esadecimale(await crypto.subtle.sign("HMAC", chiave, new TextEncoder().encode(codice))).slice(0, 32);
}


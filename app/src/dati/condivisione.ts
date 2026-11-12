/**
 * Condivisione dei ritrovamenti con un gruppo di amici (aggiunta il 12 novembre 2026).
 *
 * Regole, uguali a quelle del server (condivisione/src/index.ts):
 *   - chi vede: solo chi ha il codice del gruppo (12 caratteri, l'ultimo di controllo);
 *   - che cosa esce dal telefono, e solo per i ritrovamenti che scegli: specie, quantità, giorno
 *     e il quadrato di 1 km della griglia europea. Mai: posizione dal vivo, punto preciso, ora,
 *     foto, note, uscite a vuoto;
 *   - quando: gli altri lo vedono dal giorno dopo (nessuno può sapere dove sei adesso);
 *   - senza rete: il ritrovamento resta in coda e parte appena c'è campo.
 * L'unica funzione che prepara quello che esce è pacchetto(): se si cambia, va cambiato anche il server.
 */
import { SERVER_CONDIVISIONE } from "../config";
import { memoria } from "../ui/dom";
import { avvisaPunti, diario, type Voce } from "./archivio";
import { cella1km } from "./griglia";

export const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Una segnalazione del gruppo, come arriva dal server. */
export interface Segnalazione {
  id: string;
  cella: string;
  specie: string;
  quantita: "pochi" | "abbastanza" | "tanti" | null;
  data: string;
}

interface Copia { gruppo: string; aggiornato: string; oggi: string; ritrovamenti: Segnalazione[] }
interface DaTogliere { id: string; token: string }

// --- codici di gruppo ---------------------------------------------------------------------------

function controllo(v: number[]) {
  let s = 0;
  for (let i = 0; i < 11; i++) s += (i + 1) * v[i];
  return s % ALFABETO.length;
}

/** Codice nuovo, casuale: 11 caratteri + 1 di controllo, "XXXX-XXXX-XXXX". */
export function nuovoCodice(): string {
  const casuali = crypto.getRandomValues(new Uint8Array(11));
  const v = [...casuali].map((b) => b % ALFABETO.length);
  v.push(controllo(v));
  const t = v.map((x) => ALFABETO[x]).join("");
  return `${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}`;
}

/** Codice scritto da una persona (spazi, minuscole, trattini a caso) → forma giusta, o null se sbagliato. */
export function leggiCodice(testo: string): string | null {
  const t = testo.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (t.length !== 12) return null;
  const v = t.split("").map((c) => ALFABETO.indexOf(c));
  if (v.some((x) => x < 0) || v[11] !== controllo(v)) return null;
  return `${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}`;
}

// --- impostazioni -------------------------------------------------------------------------------

export const condivisione = {
  /** il server c'è (l'app è stata costruita con il suo indirizzo) */
  disponibile: () => SERVER_CONDIVISIONE !== "",
  gruppo: () => memoria.leggi<string | null>("gruppo.codice", null),
  entra(codice: string) {
    memoria.scrivi("gruppo.codice", codice);
    memoria.scrivi("gruppo.copia", null);
    avvisaGruppo();
  },
  esci() {
    memoria.scrivi("gruppo.codice", null);
    memoria.scrivi("gruppo.copia", null);
    avvisaGruppo();
  },
};

const ascoltatori: (() => void)[] = [];
export function ascoltaGruppo(f: () => void) { ascoltatori.push(f); }
function avvisaGruppo() { for (const f of ascoltatori) f(); avvisaPunti(); }

// --- che cosa esce dal telefono -------------------------------------------------------------------

/**
 * Il solo contenuto che parte verso il server per un ritrovamento: cinque campi e basta.
 * Il punto preciso diventa il quadrato di 1 km che lo contiene.
 */
export function pacchetto(v: Pick<Voce, "lon" | "lat" | "specie" | "quantita" | "data">, token: string) {
  return { cella: cella1km(v.lon, v.lat), specie: v.specie ?? "", quantita: v.quantita ?? null, data: v.data, token };
}

/** Si può condividere? Solo ritrovamenti con la specie, dentro Piemonte e Liguria. */
export function condivisibile(v: Pick<Voce, "tipo" | "specie">) {
  return v.tipo === "ritrovamento" && !!v.specie;
}

function nuovoToken() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Segna la voce da condividere col gruppo attuale e prova a inviarla subito. */
export async function condividi(v: Voce): Promise<Voce> {
  const gruppo = condivisione.gruppo();
  if (!gruppo || !condivisibile(v)) return v;
  v.condivisione = { stato: "in coda", cella: cella1km(v.lon, v.lat), token: nuovoToken(), gruppo };
  await diario.salva(v);
  void inviaInCoda();
  return v;
}

/** Toglie la voce dal gruppo (sul server la si cancella appena c'è rete). */
export async function smettiDiCondividere(v: Voce): Promise<Voce> {
  const c = v.condivisione;
  if (c?.id) aggiungiDaTogliere({ id: c.id, token: c.token });
  delete v.condivisione;
  await diario.salva(v);
  void inviaInCoda();
  return v;
}

/** Se una voce condivisa si cancella dal diario, resta da togliere anche dal server. */
export function ricordaDaTogliere(v: Voce) {
  if (v.condivisione?.id) aggiungiDaTogliere({ id: v.condivisione.id, token: v.condivisione.token });
  void inviaInCoda();
}

function aggiungiDaTogliere(d: DaTogliere) {
  memoria.scrivi("gruppo.datogliere", [...memoria.leggi<DaTogliere[]>("gruppo.datogliere", []), d]);
}

// --- dialogo col server ---------------------------------------------------------------------------

async function chiama(metodo: string, percorso: string, intestazioni: Record<string, string>, corpo?: unknown) {
  const r = await fetch(`${SERVER_CONDIVISIONE}${percorso}`, {
    method: metodo,
    headers: { ...intestazioni, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const testo = await r.text();
  let json: Record<string, unknown> | null = null;
  try { json = testo ? JSON.parse(testo) : null; } catch { /* risposta non JSON */ }
  return { stato: r.status, json };
}

type Esito = { inviati: number; inCoda: number; errori: number };
let corsa: Promise<Esito> | null = null, ancora = false;

/**
 * Invia le voci in coda e toglie quelle da togliere. Senza rete non fa niente: si riprova dopo.
 * Se viene chiamata mentre lavora già, fa un altro giro alla fine e chi aspetta aspetta anche quello
 * (così nessuna voce resta indietro).
 */
export function inviaInCoda(): Promise<Esito> {
  if (corsa) { ancora = true; return corsa; }
  corsa = (async () => {
    let esito: Esito;
    do { ancora = false; esito = await giroDiInvio(); } while (ancora);
    return esito;
  })().finally(() => { corsa = null; });
  return corsa;
}

async function giroDiInvio() {
  let inviati = 0, errori = 0, inCoda = 0;
  if (!condivisione.disponibile()) return { inviati, inCoda, errori };
  // 1. da togliere
  const restano: DaTogliere[] = [];
  for (const d of memoria.leggi<DaTogliere[]>("gruppo.datogliere", [])) {
    try {
      const r = await chiama("DELETE", `/v1/ritrovamenti/${d.id}`, { "X-Bole-Token": d.token });
      if (r.stato >= 500 || r.stato === 429) restano.push(d); // 404 = già tolto: va bene così
    } catch { restano.push(d); }
  }
  memoria.scrivi("gruppo.datogliere", restano);
  // 2. da inviare
  for (const v of await diario.tutte()) {
    const c = v.condivisione;
    if (!c || c.stato !== "in coda") continue;
    try {
      const r = await chiama("POST", "/v1/ritrovamenti", { "X-Bole-Gruppo": c.gruppo }, pacchetto(v, c.token));
      if (r.stato === 201 && r.json) {
        v.condivisione = { ...c, stato: "inviato", id: String(r.json.id), visibileDal: String(r.json.visibile_dal) };
        inviati++;
      } else if (r.stato === 429 || r.stato >= 500) {
        inCoda++; // server pieno o occupato: si riprova dopo
        continue;
      } else {
        v.condivisione = { ...c, stato: "errore", errore: String(r.json?.errore ?? `errore ${r.stato}`) };
        errori++;
      }
      await diario.salva(v);
    } catch {
      inCoda++; // niente rete
    }
  }
  return { inviati, inCoda, errori };
}

/** Scarica le segnalazioni visibili del gruppo e le tiene sul telefono (servono anche senza rete). */
export async function scaricaGruppo(): Promise<"ok" | "senza rete" | "errore" | "nessun gruppo"> {
  const gruppo = condivisione.gruppo();
  if (!gruppo || !condivisione.disponibile()) return "nessun gruppo";
  const dal = new Date(Date.now() - 400 * 86_400_000).toLocaleDateString("sv-SE");
  try {
    const r = await chiama("GET", `/v1/ritrovamenti?dal=${dal}`, { "X-Bole-Gruppo": gruppo });
    if (r.stato !== 200 || !r.json || !Array.isArray(r.json.ritrovamenti)) return "errore";
    if (condivisione.gruppo() !== gruppo) return "nessun gruppo"; // nel frattempo è cambiato
    const copia: Copia = { gruppo, aggiornato: new Date().toISOString(), oggi: String(r.json.oggi), ritrovamenti: r.json.ritrovamenti as Segnalazione[] };
    memoria.scrivi("gruppo.copia", copia);
    avvisaGruppo();
    return "ok";
  } catch {
    return "senza rete";
  }
}

/** Quando è stata scaricata l'ultima volta la copia del gruppo (o null). */
export function aggiornatoIl(): Date | null {
  const c = memoria.leggi<Copia | null>("gruppo.copia", null);
  return c && c.gruppo === condivisione.gruppo() ? new Date(c.aggiornato) : null;
}

/** Segnalazioni degli altri (le tue sono già sulla mappa come punti precisi). */
export async function segnalazioniAltrui(): Promise<Segnalazione[]> {
  const c = memoria.leggi<Copia | null>("gruppo.copia", null);
  if (!c || c.gruppo !== condivisione.gruppo()) return [];
  const mie = new Set((await diario.tutte()).map((v) => v.condivisione?.id).filter(Boolean));
  return c.ritrovamenti.filter((s) => !mie.has(s.id));
}

/** All'avvio e quando torna la rete: invia la coda e aggiorna il gruppo; poi ogni 15 minuti, se l'app è aperta. */
export function avviaCondivisione() {
  if (!condivisione.disponibile()) return;
  const giro = () => { if (condivisione.gruppo()) { void inviaInCoda(); void scaricaGruppo(); } };
  giro();
  window.addEventListener("online", giro);
  window.setInterval(() => { if (!document.hidden) giro(); }, 15 * 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void inviaInCoda(); });
}

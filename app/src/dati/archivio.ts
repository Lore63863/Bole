/**
 * Archivio sul telefono (IndexedDB): il diario dei ritrovamenti, foto comprese.
 * Niente va su server, tranne i ritrovamenti che scegli di condividere col gruppo,
 * e di quelli esce solo un riassunto (vedi dati/condivisione.ts).
 */

/** Com'era la mappa nel punto e nel giorno della voce (si calcola al salvataggio, se c'è il meteo di quel giorno). */
export interface Istantanea {
  /** specie (o "porcini") per cui si è calcolato */
  specie: string;
  indice: number;
  /** 0 = nessun habitat, 1-5 = da molto bassa a molto alta */
  classe: number;
  affidabilita: string;
  /** habitat della specie nel punto, 0-100 */
  habitat: number;
  /** versione del modello e corsa del meteo usate: servono alla prossima taratura */
  modello: string;
  meteo: string;
}

/** Condivisione col gruppo: c'è solo se è stata scelta per questa voce. */
export interface Condivisione {
  stato: "in coda" | "inviato" | "errore";
  /** quadrato di 1 km (l'unica posizione che esce dal telefono) */
  cella: string;
  /** codice casuale per toglierla dal server (resta qui) */
  token: string;
  /** codice del gruppo a cui va */
  gruppo: string;
  id?: string;
  visibileDal?: string;
  errore?: string;
}

export interface Voce {
  id: string;
  /** "ritrovamento" oppure "a vuoto" (uscita senza funghi: è un dato prezioso anche quella) */
  tipo: "ritrovamento" | "a vuoto";
  data: string; // AAAA-MM-GG
  ora?: string; // HH:MM
  lat: number;
  lon: number;
  /** precisione del GPS in metri, quando la posizione viene dal GPS */
  precisione?: number;
  /** da dove viene la posizione: GPS del telefono o punto scelto a mano sulla mappa */
  origine?: "gps" | "mappa";
  specie?: string; // id della specie (catalogo) o testo libero
  quantita?: "pochi" | "abbastanza" | "tanti";
  note?: string;
  foto?: Blob;
  istantanea?: Istantanea;
  condivisione?: Condivisione;
}

const NOME = "bole";
const VERSIONE = 1;

function apri(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(NOME, VERSIONE);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("diario")) db.createObjectStore("diario", { keyPath: "id" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

async function conMagazzino<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await apri();
  return new Promise((ok, ko) => {
    const t = db.transaction("diario", modo);
    const r = fn(t.objectStore("diario"));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

/** Avvisa chi disegna i punti sulla mappa (e chi conta le statistiche) che il diario è cambiato. */
export function avvisaPunti() {
  window.dispatchEvent(new Event("bole:punti"));
}

export const diario = {
  tutte: () => conMagazzino<Voce[]>("readonly", (s) => s.getAll() as IDBRequest<Voce[]>)
    .then((v) => v.sort((a, b) => (b.data + (b.ora ?? "")).localeCompare(a.data + (a.ora ?? "")))),
  una: (id: string) => conMagazzino<Voce | undefined>("readonly", (s) => s.get(id) as IDBRequest<Voce | undefined>),
  salva: async (v: Voce) => { await conMagazzino("readwrite", (s) => s.put(v)); avvisaPunti(); },
  togli: async (id: string) => { await conMagazzino("readwrite", (s) => s.delete(id)); avvisaPunti(); },
};

export function nuovoId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Chiede al browser di non cancellare i dati quando lo spazio scarseggia (iOS: utile se l'app è sulla Home). */
export async function chiediPersistenza() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* non disponibile: pazienza */
  }
}

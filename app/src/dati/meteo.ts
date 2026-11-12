/**
 * Dati meteo del giorno (scritti ogni mattina da pipeline/previsione.py):
 *   dati/meteo/oggi.json     descrizione: giorni, affidabilità, gradiente, tabelle
 *   dati/meteo/punti.bin.gz  i numeri, per i 1.137 punti del modello IFS
 *
 * Da qui si ricavano:
 *   - i "campi" di un giorno su una griglia regolare (circa 2 km), che il lavoratore
 *     interpola pixel per pixel e riporta alla quota della cella;
 *   - i valori in un punto (pannello "Perché qui?").
 * Il passaggio punti -> griglia usa gli stessi 4 punti più vicini e gli stessi pesi
 * (1/distanza²) di vicini() in pipeline/modello.py.
 */

export interface Campo {
  nome: string;
  tipo: "f4" | "u1" | "u2" | "i2";
  scala: number;
  forma: number[];
  inizio: number;
  mancante: number | null;
}

export interface Oggi {
  versione: number;
  creato: string;
  corsa_del_modello: string;
  dati_vecchi: boolean;
  oggi: string;
  giorni: string[];
  affidabilita: ("alta" | "media" | "bassa")[];
  gradiente_per_metro: number[];
  serie_da: string | null;
  giorni_serie: number;
  punti: number;
  campi: Campo[];
  file: Record<string, { byte: number }>;
  fonte: string;
}

export interface Meteo {
  oggi: Oggi;
  lat: Float32Array;
  lon: Float32Array;
  quota: Float32Array;
  /** tabelle [giorno][punto], valori veri (NaN se mancano) */
  tab: Record<string, Float32Array>;
  nPunti: number;
}

/** Griglia regolare in gradi su cui si stende il meteo. */
export const GRIGLIA = { lon0: 6.56, lat0: 43.73, dlon: 0.028, dlat: 0.02, nLon: 129, nLat: 140 } as const;

/** Come MARGINE_NEVE_M e QUOTA_SENZA_NEVE in pipeline/modello.py. */
export const MARGINE_NEVE_M = 200;
export const QUOTA_SENZA_NEVE = 9999;

export interface CampiGiorno {
  giorno: number;
  /** pioggia 26 gg (mm), temperature 20 gg / massima 7 gg / minima 3 gg riportate a quota 0 m, suolo secco (0-1), neve (cm) */
  P: Float32Array;
  T0: Float32Array;
  TX0: Float32Array;
  TN0: Float32Array;
  secco: Float32Array;
  neve: Float32Array;
  /** quota (m) sopra cui vale la neve: punti innevati vicini meno 200 m; 9999 = nessuna neve */
  quotaNeve: Float32Array;
  /** gradiente medio di 20 giorni, °C per metro */
  G: number;
}

async function scompatta(r: Response): Promise<ArrayBuffer> {
  // Il file è compresso da noi (gzip). Alcuni server lo dichiarano "Content-Encoding: gzip" e il
  // browser lo apre da solo: si guarda la firma gzip (1f 8b) e si decomprime solo se serve.
  const buf = await r.arrayBuffer();
  const b = new Uint8Array(buf, 0, 2);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  const flusso = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(flusso).arrayBuffer();
}

function leggiTabella(buf: ArrayBuffer, c: Campo): Float32Array {
  const n = c.forma.reduce((a, b) => a * b, 1);
  const out = new Float32Array(n);
  const vista =
    c.tipo === "f4" ? new Float32Array(buf, c.inizio, n)
    : c.tipo === "u1" ? new Uint8Array(buf, c.inizio, n)
    : c.tipo === "u2" ? new Uint16Array(buf, c.inizio, n)
    : new Int16Array(buf, c.inizio, n);
  for (let i = 0; i < n; i++) {
    const v = vista[i];
    out[i] = c.mancante !== null && v === c.mancante ? NaN : v / c.scala;
  }
  return out;
}

export async function caricaMeteo(base = new URL("dati/meteo/", document.baseURI).href): Promise<Meteo> {
  const oggi = (await (await fetch(`${base}oggi.json`, { cache: "no-cache" })).json()) as Oggi;
  const r = await fetch(`${base}punti.bin.gz`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`meteo non disponibile (${r.status})`);
  const buf = await scompatta(r);
  const tab: Record<string, Float32Array> = {};
  for (const c of oggi.campi) tab[c.nome] = leggiTabella(buf, c);
  return { oggi, lat: tab.lat, lon: tab.lon, quota: tab.quota, tab, nPunti: oggi.punti };
}

/** I 4 punti più vicini e i pesi 1/d² (come vicini() in modello.py). */
export function vicini(lat: number, lon: number, m: Meteo, k = 4): { idx: number[]; w: number[] } {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const migliori: { d2: number; i: number }[] = [];
  for (let i = 0; i < m.nPunti; i++) {
    const dy = (lat - m.lat[i]) * 111.2;
    const dx = (lon - m.lon[i]) * 111.2 * cosLat;
    const d2 = dx * dx + dy * dy;
    if (migliori.length < k) {
      migliori.push({ d2, i });
      migliori.sort((a, b) => a.d2 - b.d2);
    } else if (d2 < migliori[k - 1].d2) {
      migliori[k - 1] = { d2, i };
      migliori.sort((a, b) => a.d2 - b.d2);
    }
  }
  const w = migliori.map((v) => 1 / Math.max(v.d2, 0.01));
  const s = w.reduce((a, b) => a + b, 0);
  return { idx: migliori.map((v) => v.i), w: w.map((v) => v / s) };
}

let pesiGriglia: { idx: Int32Array; w: Float32Array } | null = null;

/** Pesi di ogni nodo della griglia (calcolati una volta: circa 18.000 nodi × 1.137 punti). */
function pesi(m: Meteo) {
  if (pesiGriglia) return pesiGriglia;
  const n = GRIGLIA.nLon * GRIGLIA.nLat;
  const idx = new Int32Array(n * 4);
  const w = new Float32Array(n * 4);
  for (let r = 0; r < GRIGLIA.nLat; r++) {
    const lat = GRIGLIA.lat0 + r * GRIGLIA.dlat;
    for (let c = 0; c < GRIGLIA.nLon; c++) {
      const v = vicini(lat, GRIGLIA.lon0 + c * GRIGLIA.dlon, m);
      const k = (r * GRIGLIA.nLon + c) * 4;
      for (let j = 0; j < 4; j++) {
        idx[k + j] = v.idx[j];
        w[k + j] = v.w[j];
      }
    }
  }
  pesiGriglia = { idx, w };
  return pesiGriglia;
}

/** I campi di un giorno (0 = oggi) sulla griglia regolare. */
export function campiDelGiorno(m: Meteo, giorno: number): CampiGiorno {
  const { idx, w } = pesi(m);
  const n = GRIGLIA.nLon * GRIGLIA.nLat;
  const np = m.nPunti;
  const G = m.oggi.gradiente_per_metro[giorno];
  const riga = (nome: string) => m.tab[nome].subarray(giorno * np, (giorno + 1) * np);
  const P = riga("P26"), T = riga("T20"), TX = riga("TX7"), TN = riga("TN3");
  const S = riga("secco"), N = riga("neve_cm");
  const out: CampiGiorno = {
    giorno, G,
    P: new Float32Array(n), T0: new Float32Array(n), TX0: new Float32Array(n), TN0: new Float32Array(n),
    secco: new Float32Array(n), neve: new Float32Array(n), quotaNeve: new Float32Array(n),
  };
  for (let i = 0; i < n; i++) {
    let p = 0, t = 0, tx = 0, tn = 0, s = 0, ne = 0, pesoNeve = 0, quotaConNeve = 0;
    for (let j = 0; j < 4; j++) {
      const q = idx[i * 4 + j], ww = w[i * 4 + j];
      const zp = m.quota[q]; // punti in mare: quota 0 (già così nel file)
      p += ww * P[q];
      t += ww * (T[q] - G * zp);
      tx += ww * (TX[q] - G * zp);
      tn += ww * (TN[q] - G * zp);
      s += ww * S[q];
      ne += ww * N[q]; // come il Python: se manca un vicino resta NaN, e NaN = nessun freno
      if (N[q] > 1) { pesoNeve += ww; quotaConNeve += ww * zp; } // quota_neve() in modello.py
    }
    out.P[i] = p; out.T0[i] = t; out.TX0[i] = tx; out.TN0[i] = tn; out.secco[i] = s; out.neve[i] = ne;
    out.quotaNeve[i] = pesoNeve > 0 ? quotaConNeve / pesoNeve - MARGINE_NEVE_M : QUOTA_SENZA_NEVE;
  }
  return out;
}

/** Serie del grafico in un punto: pioggia (mm/giorno), temperatura media e del suolo, dal giorno -30 a +14. */
export function seriePunto(m: Meteo, lat: number, lon: number, quotaPunto: number) {
  const { idx, w } = vicini(lat, lon, m);
  const n = m.oggi.giorni_serie;
  const np = m.nPunti;
  const pioggia = new Float32Array(n), tMedia = new Float32Array(n), tSuolo = new Float32Array(n);
  const G = m.oggi.gradiente_per_metro[0];
  for (let d = 0; d < n; d++) {
    let p = 0, t = 0, s = 0;
    for (let j = 0; j < 4; j++) {
      const q = idx[j];
      p += w[j] * m.tab.pioggia[d * np + q];
      t += w[j] * (m.tab.t_media[d * np + q] + G * (quotaPunto - m.quota[q]));
      s += w[j] * (m.tab.suolo_t[d * np + q] + G * (quotaPunto - m.quota[q]));
    }
    pioggia[d] = p; tMedia[d] = t; tSuolo[d] = s;
  }
  return { pioggia, tMedia, tSuolo, da: m.oggi.serie_da };
}

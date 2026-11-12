/**
 * Le formule del modello, copiate da pipeline/modello.py (stessi nomi, stesso ordine).
 * Se cambia una formula là, va cambiata anche qui: i test (tests/modello.spec.ts)
 * confrontano i due calcoli su casi presi dal Python.
 *
 *   indice = H × M × S          (H habitat 0-1, M meteo 0-1, S stagione 0-1)
 */

export interface ParametriSpecie {
  t_ottimo: number;
  t_larghezza: number;
  pioggia_piena: number;
  caldo_soglia: number;
  caldo_freno: number;
  secco_freno: number;
  gelo_soglia: number;
  gelo_freno: number;
  neve_freno: number;
  /** 366 valori, indice = giorno dell'anno - 1 */
  stagione: number[];
  /** quattro soglie fra le cinque classi */
  soglie: [number, number, number, number];
  ritrovamenti: number;
  ritrovamenti_precisi: number;
  etichetta_partenza: "L" | "S";
}

export const PAVIMENTO_PIOGGIA = 0.05;
/** neve al suolo oltre cui scatta il freno (1 cm) */
export const NEVE_CM_FRENO = 1;

export function fattoreTemperatura(p: ParametriSpecie, t: number): number {
  const d = (t - p.t_ottimo) / p.t_larghezza;
  return Math.exp(-0.5 * d * d);
}

export function fattorePioggia(p: ParametriSpecie, pioggia: number): number {
  return Math.min(1, Math.max(PAVIMENTO_PIOGGIA, pioggia / p.pioggia_piena));
}

/** M fra 0 e 1. Le temperature devono essere già riportate alla quota del punto. */
export function fattoreMeteo(
  p: ParametriSpecie,
  pioggia: number,
  t: number,
  tMax: number,
  tMin: number,
  secco: boolean,
  neveCm: number,
): number {
  let m = fattoreTemperatura(p, t) * fattorePioggia(p, pioggia);
  if (tMax > p.caldo_soglia) m *= p.caldo_freno;
  if (secco) m *= p.secco_freno;
  if (tMin < p.gelo_soglia) m *= p.gelo_freno;
  if ((Number.isFinite(neveCm) ? neveCm : 0) > NEVE_CM_FRENO) m *= p.neve_freno;
  return m;
}

/** Classe da 0 (nessuna) a 5 (molto alta): come np.digitize con le quattro soglie. */
export function classe(indice: number, soglie: readonly number[]): number {
  if (!(indice > 0)) return 0; // anche NaN -> 0
  let c = 1;
  for (const s of soglie) if (indice >= s) c++;
  return c;
}

/** Giorno dell'anno, 1-366, da una data "AAAA-MM-GG". */
export function giornoDellAnno(data: string): number {
  const [a, m, g] = data.split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, g) - Date.UTC(a, 0, 1)) / 86_400_000) + 1;
}

export const NOMI_CLASSI = ["nessuna", "molto bassa", "bassa", "media", "alta", "molto alta"] as const;

/** Colori delle classi 1-5 (stessi delle anteprime e della bozza grafica). */
export const COLORI_CLASSI = ["#F6EFC2", "#F2CF73", "#EE9E3A", "#D2601F", "#8A2B0E"] as const;

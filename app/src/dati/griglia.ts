/**
 * Griglia europea di riferimento a 1 km (EEA, proiezione ETRS89-LAEA, EPSG:3035).
 *
 * Serve alla condivisione: dal telefono non esce mai il punto preciso di un ritrovamento,
 * solo il codice del quadrato di 1 km che lo contiene, per esempio "1kmE4123N2456"
 * (E e N = angolo in basso a sinistra, in km). È la stessa griglia che usano l'Agenzia
 * europea dell'ambiente e i programmi Natura 2000, quindi i quadrati sono sempre gli stessi.
 *
 * Formule: Snyder, "Map Projections — A Working Manual" (USGS 1987), pagine 187-190;
 * parametri EPSG:3035 (centro 52° N 10° E, falsa origine 4.321.000 / 3.210.000 m, ellissoide GRS80).
 */

const A = 6378137; // semiasse maggiore GRS80 (m)
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const E = Math.sqrt(E2);
const LAT0 = (52 * Math.PI) / 180;
const LON0 = (10 * Math.PI) / 180;
const FE = 4321000;
const FN = 3210000;

function q(phi: number) {
  const s = Math.sin(phi);
  return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
}
const QP = q(Math.PI / 2);
const RQ = A * Math.sqrt(QP / 2);
const BETA1 = Math.asin(q(LAT0) / QP);
const M1 = Math.cos(LAT0) / Math.sqrt(1 - E2 * Math.sin(LAT0) ** 2);
const D = (A * M1) / (RQ * Math.cos(BETA1));

/** Da gradi (lon, lat) a metri EPSG:3035 [est, nord]. */
export function versoLaea(lon: number, lat: number): [number, number] {
  const phi = (lat * Math.PI) / 180, dl = (lon * Math.PI) / 180 - LON0;
  const beta = Math.asin(q(phi) / QP);
  const B = RQ * Math.sqrt(2 / (1 + Math.sin(BETA1) * Math.sin(beta) + Math.cos(BETA1) * Math.cos(beta) * Math.cos(dl)));
  const x = B * D * Math.cos(beta) * Math.sin(dl);
  const y = (B / D) * (Math.cos(BETA1) * Math.sin(beta) - Math.sin(BETA1) * Math.cos(beta) * Math.cos(dl));
  return [FE + x, FN + y];
}

/** Da metri EPSG:3035 a gradi [lon, lat]. */
export function daLaea(est: number, nord: number): [number, number] {
  const x = est - FE, y = nord - FN;
  const rho = Math.hypot(x / D, D * y);
  if (rho < 1e-9) return [(LON0 * 180) / Math.PI, (LAT0 * 180) / Math.PI];
  const C = 2 * Math.asin(rho / (2 * RQ));
  const beta = Math.asin(Math.cos(C) * Math.sin(BETA1) + (D * y * Math.sin(C) * Math.cos(BETA1)) / rho);
  const lon = LON0 + Math.atan2(x * Math.sin(C), D * rho * Math.cos(BETA1) * Math.cos(C) - D * D * y * Math.sin(BETA1) * Math.sin(C));
  const e4 = E2 * E2, e6 = e4 * E2;
  const phi = beta
    + (E2 / 3 + (31 * e4) / 180 + (517 * e6) / 5040) * Math.sin(2 * beta)
    + ((23 * e4) / 360 + (251 * e6) / 3780) * Math.sin(4 * beta)
    + ((761 * e6) / 45360) * Math.sin(6 * beta);
  return [(lon * 180) / Math.PI, (phi * 180) / Math.PI];
}

const FORMATO = /^1kmE(\d{4})N(\d{4})$/;

/** Codice del quadrato di 1 km che contiene il punto. */
export function cella1km(lon: number, lat: number): string {
  const [e, n] = versoLaea(lon, lat);
  return `1kmE${Math.floor(e / 1000)}N${Math.floor(n / 1000)}`;
}

export function cellaValida(codice: string): boolean {
  return FORMATO.test(codice);
}

/** I quattro angoli del quadrato (più il primo ripetuto), in gradi: per disegnarlo sulla mappa. */
export function angoliCella(codice: string): [number, number][] {
  const m = FORMATO.exec(codice);
  if (!m) return [];
  const e = Number(m[1]) * 1000, n = Number(m[2]) * 1000;
  const giro: [number, number][] = [[e, n], [e + 1000, n], [e + 1000, n + 1000], [e, n + 1000], [e, n]];
  return giro.map(([x, y]) => daLaea(x, y));
}

/** Centro del quadrato, in gradi. */
export function centroCella(codice: string): [number, number] | null {
  const m = FORMATO.exec(codice);
  return m ? daLaea(Number(m[1]) * 1000 + 500, Number(m[2]) * 1000 + 500) : null;
}

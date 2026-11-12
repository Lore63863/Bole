/**
 * Alba, tramonto e fine del crepuscolo civile (algoritmo NOAA, "General Solar Position Calculations").
 * Precisione di uno o due minuti in pianura; in valle il sole sparisce prima, dietro i monti.
 */
const RAD = Math.PI / 180;

/** Minuti dalla mezzanotte UTC del giorno di "data" in cui il sole passa per lo zenit dato (null se non succede). */
function minutiUTC(lat: number, lon: number, data: Date, zenit: number, tramonto: boolean): number | null {
  // due passaggi: il secondo calcola la posizione del sole all'ora trovata dal primo
  const prima = passaggio(lat, lon, data, zenit, tramonto, 720);
  return prima === null ? null : passaggio(lat, lon, data, zenit, tramonto, prima);
}

function passaggio(lat: number, lon: number, data: Date, zenit: number, tramonto: boolean, minuti: number): number | null {
  const inizio = Date.UTC(data.getUTCFullYear(), 0, 1);
  const giorno = Math.floor((Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()) - inizio) / 864e5) + 1;
  const anno = data.getUTCFullYear();
  const giorniAnno = (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0 ? 366 : 365;
  const g = ((2 * Math.PI) / giorniAnno) * (giorno - 1 + (minuti / 60 - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const c = Math.cos(zenit * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
  if (c < -1 || c > 1) return null;
  const ha = Math.acos(c) / RAD;
  return 720 - 4 * (lon + (tramonto ? -ha : ha)) - eqtime;
}

function aOra(data: Date, minuti: number | null) {
  if (minuti === null) return null;
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()) + minuti * 60_000);
}

/** Orari del sole per il giorno (locale) di "data" nel punto dato. */
export function sole(lat: number, lon: number, data = new Date()) {
  // mezzogiorno locale del giorno scelto, in UTC: in Italia la data UTC è la stessa
  const giorno = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate(), 12));
  return {
    alba: aOra(giorno, minutiUTC(lat, lon, giorno, 90.833, false)),
    tramonto: aOra(giorno, minutiUTC(lat, lon, giorno, 90.833, true)),
    buio: aOra(giorno, minutiUTC(lat, lon, giorno, 96, true)), // fine del crepuscolo civile
  };
}

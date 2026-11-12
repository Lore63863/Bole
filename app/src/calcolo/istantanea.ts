/**
 * "Com'era la mappa": indice e classe in un punto per un giorno, come li mostra la mappa.
 * Si salva con ogni voce del diario (se il meteo di quel giorno c'è ancora sul telefono):
 * così le statistiche dicono in che classe erano i tuoi ritrovamenti e le uscite a vuoto,
 * e la prossima taratura del modello sa che cosa diceva la mappa in quel momento.
 */
import type { Istantanea } from "../dati/archivio";
import { SPECIE } from "../dati/catalogo";
import { contesto } from "../dati/contesto";
import { regioneDi } from "../dati/luoghi";
import { giorniNelPunto, punto } from "./client";

const ORDINE_AFF = ["bassa", "media", "alta"];

/** Affidabilità nel punto: un gradino in meno per specie con pochi dati e uno per la Liguria. */
export function affidabilitaNelPunto(base: string, poche: boolean, liguria: boolean) {
  return ORDINE_AFF[Math.max(0, ORDINE_AFF.indexOf(base) - (poche ? 1 : 0) - (liguria ? 1 : 0))];
}

/** Istantanea per la specie (o "porcini") nel giorno "data"; undefined se quel giorno non è nel meteo del telefono. */
export async function istantanea(lon: number, lat: number, specie: string, data: string): Promise<Istantanea | undefined> {
  const m = contesto.meteo;
  if (!m) return undefined;
  const d = m.oggi.giorni.indexOf(data);
  if (d < 0) return undefined;
  const p = await punto(lon, lat);
  if (!p || p.quota === null) return undefined;
  const habitat: Record<string, number> = {};
  for (const s of SPECIE) habitat[s.id] = p.valori[s.insieme][s.canale];
  const g = giorniNelPunto(lon, lat, p.quota, habitat, specie)[d];
  const liguria = contesto.regioni ? regioneDi(lon, lat, contesto.regioni) === "Liguria" : false;
  return {
    specie,
    indice: +g.indice.toFixed(5),
    classe: g.cl,
    affidabilita: affidabilitaNelPunto(g.affidabilita, g.poche, liguria),
    habitat: g.specie ? habitat[g.specie] : Math.max(0, ...SPECIE.filter((s) => s.id === specie).map((s) => habitat[s.id])),
    modello: contesto.versioneModello,
    meteo: m.oggi.corsa_del_modello,
  };
}

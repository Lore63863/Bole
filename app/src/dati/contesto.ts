/**
 * Dati caricati all'avvio che servono a più parti dell'app (diario, condivisione, statistiche).
 * Li riempie main.ts; finché l'app non è partita restano vuoti.
 */
import type { FeatureCollection } from "geojson";
import type { Map as Mappa } from "maplibre-gl";
import type { Meteo } from "./meteo";

export const contesto: { meteo: Meteo | null; versioneModello: string; regioni: FeatureCollection | null; mappa: Mappa | null } = {
  mappa: null,
  meteo: null,
  versioneModello: "",
  regioni: null,
};

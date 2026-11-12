/**
 * Bolé — punto di partenza dell'app.
 *
 *   1. carica parametri del modello, confini delle regioni e meteo del giorno
 *   2. costruisce la schermata (come la bozza grafica)
 *   3. accende la mappa: base OpenStreetMap + rilievo + indice + curve di livello
 */
import { GeolocateControl, Map as Mappa, addProtocol, setWorkerUrl } from "maplibre-gl";
import urlLavoratoreMappa from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./stile.css";
import { protocolloBase } from "./mappa/base";
import { stileMappa, LIMITI } from "./mappa/stile";
import { caricaMeteo } from "./dati/meteo";
import { classiTessera, impostaMeteo, inizia, punto, registraProtocolli } from "./calcolo/client";
import { collegaMappa, costruisciSchermo } from "./ui/schermo";
import { apriPercheQui } from "./ui/perchequi";
import { collegaSchede, ripristinaLivelli } from "./ui/schede";
import { stato } from "./ui/stato";
import { contesto } from "./dati/contesto";
import { avviaCondivisione } from "./dati/condivisione";
import { aggiungiLivelliPunti, appenaPremuto, collegaPressioneLunga, sceltaInCorso, toccato } from "./mappa/punti";
import { apriVoce, nuovoRitrovamento } from "./ui/diario";
import { apriCellaGruppo } from "./ui/gruppo";
import { apriPreferite } from "./ui/preferite";
import { apriInBosco } from "./ui/inbosco";

// MapLibre 6 tiene il suo lavoratore (worker) in un file a parte: va detto dove sta.
setWorkerUrl(urlLavoratoreMappa);
addProtocol("bolebase", protocolloBase);
registraProtocolli();

const dati = (nome: string) => new URL(`dati/${nome}`, document.baseURI).href;

async function avvia() {
  const q = new URLSearchParams(location.search);
  const [lon, lat] = (q.get("centro") ?? "7.55,44.39").split(",").map(Number);
  const zoom = Number(q.get("zoom") ?? 10);
  if (q.get("specie")) stato.scegli(q.get("specie")!);
  if (q.get("giorno")) stato.vaiAlGiorno(Number(q.get("giorno")));

  const [modello, regioni, meteo] = await Promise.all([
    fetch(dati("modello.json")).then((r) => r.json()),
    fetch(dati("luoghi/regioni.geojson")).then((r) => r.json()),
    caricaMeteo(),
  ]);
  inizia(modello, regioni);
  impostaMeteo(meteo);
  contesto.meteo = meteo;
  contesto.regioni = regioni;
  contesto.versioneModello = String(modello.versione ?? "");
  const schermo = costruisciSchermo(meteo);

  const mappa = new Mappa({
    container: schermo.contenitoreMappa,
    style: stileMappa(stato.scelta, stato.giorno),
    center: [lon, lat],
    zoom,
    minZoom: 6,
    maxZoom: 17,
    maxBounds: [[LIMITI[0] - 0.6, LIMITI[1] - 0.4], [LIMITI[2] + 0.6, LIMITI[3] + 0.4]],
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
  });
  mappa.touchZoomRotate.disableRotation();
  contesto.mappa = mappa;

  // posizione: il controllo di MapLibre (pallino blu), comandato dal nostro tasto
  const gps = new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true });
  mappa.addControl(gps, "top-left");
  (mappa.getContainer().querySelector(".maplibregl-ctrl-top-left") as HTMLElement | null)?.classList.add("nascosto");
  schermo.tastoPosizione.addEventListener("click", () => gps.trigger());

  collegaMappa(mappa, meteo);
  collegaSchede(schermo, mappa, meteo, regioni);
  // tocco: un tuo punto apre la sua scheda, il numero di un quadrato del gruppo il suo elenco,
  // altrove "Perché qui?". Pressione lunga (o tasto destro): nuova voce del diario in quel punto.
  mappa.on("click", (e) => {
    if (sceltaInCorso() || appenaPremuto()) return;
    document.getElementById("suggerimento")?.remove();
    const t = toccato(mappa, e.point);
    if (t?.tipo === "voce") return apriVoce(t.id);
    if (t?.tipo === "stella") return apriPreferite(mappa);
    if (t?.tipo === "auto") return apriInBosco(mappa);
    if (t?.tipo === "gruppo") return apriCellaGruppo(mappa, t.cella);
    apriPercheQui(mappa, meteo, e.lngLat.lng, e.lngLat.lat);
  });
  collegaPressioneLunga(mappa, (lon, lat) => {
    document.getElementById("suggerimento")?.remove();
    nuovoRitrovamento(lon, lat, "mappa");
  });

  mappa.on("idle", () => document.body.setAttribute("data-mappa-pronta", "1"));
  // ?nascondi=isoipse,rilievo serve solo alle prove
  mappa.on("load", () => {
    aggiungiLivelliPunti(mappa);
    ripristinaLivelli(mappa);
    avviaCondivisione();
    // le fonti della mappa restano dietro la (i): aperte coprirebbero la legenda
    mappa.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    for (const id of (q.get("nascondi") ?? "").split(",").filter(Boolean)) mappa.setLayoutProperty(id, "visibility", "none");
  });
  (globalThis as unknown as { bole: unknown; mappa: Mappa }).bole = { classiTessera, punto, meteo, mappa };
}

avvia().catch((e) => {
  document.body.textContent = `Bolé non è riuscita a partire: ${e}. Controlla la connessione e riapri l'app.`;
});

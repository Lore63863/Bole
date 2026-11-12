/**
 * I tuoi punti sulla mappa e i ritrovamenti del gruppo.
 *
 *   miei-punti        ritrovamenti (cerchio verde col fungo), uscite a vuoto (cerchio bianco),
 *                     auto dell'uscita di oggi, zone preferite (stella): posizioni precise, solo qui
 *   gruppo-celle      quadrati di 1 km dove qualcuno del gruppo ha trovato qualcosa
 *   gruppo-numeri     quante segnalazioni in ogni quadrato (tocca il numero per l'elenco)
 *
 * Qui stanno anche la pressione lunga sulla mappa ("segna qui") e il mirino per spostare un punto.
 * I colori non cambiano l'indice: sono cose diverse e restano separate.
 */
import type { GeoJSONSource, Map as Mappa, MapMouseEvent, PointLike } from "maplibre-gl";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { diario, type Voce } from "../dati/archivio";
import { SPECIE } from "../dati/catalogo";
import { segnalazioniAltrui } from "../dati/condivisione";
import { angoliCella, centroCella } from "../dati/griglia";
import { distanzaKm } from "../dati/luoghi";
import { el, icona, ICONE, memoria } from "../ui/dom";
import { mostraFoglio } from "../ui/foglio";

export const LIVELLI_PUNTI = ["miei-punti"];
export const LIVELLI_GRUPPO = ["gruppo-celle", "gruppo-bordi", "gruppo-numeri-fondo", "gruppo-numeri"];
const VERDE = "#1E5B3F", INCHIOSTRO = "#14211b", GRUPPO = "#4338CA";
const GIORNI_RECENTI = 7;

// --- icone (disegnate qui: niente immagini da scaricare) -------------------------------------------
function tela(lato: number) {
  const c = document.createElement("canvas");
  c.width = c.height = lato;
  return c;
}

function iconaFungo(colore: string) {
  const c = tela(60), g = c.getContext("2d")!;
  g.beginPath(); g.arc(30, 30, 25, 0, Math.PI * 2); g.fillStyle = colore; g.fill();
  g.lineWidth = 5; g.strokeStyle = "#fff"; g.stroke();
  g.fillStyle = "#fff";
  g.beginPath(); g.moveTo(14, 30); g.quadraticCurveTo(30, 6, 46, 30); g.closePath(); g.fill(); // cappello
  g.beginPath(); g.roundRect(25, 29, 10, 15, 4); g.fill(); // gambo
  return g.getImageData(0, 0, 60, 60);
}

function iconaVuoto() {
  const c = tela(52), g = c.getContext("2d")!;
  g.beginPath(); g.arc(26, 26, 21, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
  g.lineWidth = 5; g.strokeStyle = "#4a5750"; g.stroke();
  g.lineWidth = 4; g.lineCap = "round"; g.beginPath(); g.moveTo(17, 26); g.lineTo(35, 26); g.stroke(); // "niente"
  return g.getImageData(0, 0, 52, 52);
}

function iconaAuto() {
  const c = tela(60), g = c.getContext("2d")!;
  g.beginPath(); g.roundRect(4, 4, 52, 52, 12); g.fillStyle = INCHIOSTRO; g.fill();
  g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke();
  g.fillStyle = "#fff";
  g.beginPath(); g.moveTo(17, 31); g.lineTo(21, 20); g.lineTo(39, 20); g.lineTo(43, 31); g.closePath(); g.fill();
  g.beginPath(); g.roundRect(13, 30, 34, 10, 3); g.fill();
  g.fillStyle = INCHIOSTRO; g.beginPath(); g.arc(21, 40, 4, 0, Math.PI * 2); g.arc(39, 40, 4, 0, Math.PI * 2); g.fill();
  return g.getImageData(0, 0, 60, 60);
}

function iconaStella() {
  const c = tela(60), g = c.getContext("2d")!;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 11 : 26, a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(30 + r * Math.cos(a), 32 + r * Math.sin(a));
  }
  g.closePath(); g.fillStyle = VERDE; g.fill(); g.lineWidth = 4; g.lineJoin = "round"; g.strokeStyle = "#fff"; g.stroke();
  return g.getImageData(0, 0, 60, 60);
}

// --- dati per i livelli ---------------------------------------------------------------------------
const nomeCorto = (id?: string) => SPECIE.find((s) => s.id === id)?.nome ?? "";
const giornoMese = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

interface Uscita { auto?: { lon: number; lat: number }; giorno: string }

async function mieiPunti(): Promise<FeatureCollection<Point>> {
  const f: Feature<Point>[] = [];
  for (const v of await diario.tutte()) {
    f.push({ type: "Feature", geometry: { type: "Point", coordinates: [v.lon, v.lat] },
      properties: { tipo: "voce", id: v.id, icona: v.tipo === "a vuoto" ? "bole-vuoto" : "bole-fungo",
        etichetta: v.tipo === "a vuoto" ? `a vuoto ${giornoMese(v.data)}` : `${nomeCorto(v.specie) || "fungo"} ${giornoMese(v.data)}`,
        ordine: v.tipo === "a vuoto" ? 0 : 1 } });
  }
  memoria.leggi<{ nome: string; lon: number; lat: number }[]>("preferite", []).forEach((z, i) =>
    f.push({ type: "Feature", geometry: { type: "Point", coordinates: [z.lon, z.lat] },
      properties: { tipo: "stella", id: String(i), icona: "bole-stella", etichetta: z.nome, ordine: 2 } }));
  const u = memoria.leggi<Uscita | null>("uscita", null);
  if (u?.auto && u.giorno === new Date().toLocaleDateString("sv-SE")) {
    f.push({ type: "Feature", geometry: { type: "Point", coordinates: [u.auto.lon, u.auto.lat] },
      properties: { tipo: "auto", id: "auto", icona: "bole-auto", etichetta: "auto", ordine: 3 } });
  }
  return { type: "FeatureCollection", features: f };
}

/** Segnalazioni del gruppo raggruppate per quadrato. */
export async function quadratiDelGruppo() {
  const oggi = Date.now();
  const perCella = new Map<string, { n: number; recenti: number; ultima: string; specie: Set<string> }>();
  for (const s of await segnalazioniAltrui()) {
    const q = perCella.get(s.cella) ?? { n: 0, recenti: 0, ultima: "", specie: new Set<string>() };
    q.n++;
    if (oggi - Date.parse(`${s.data}T12:00:00`) <= GIORNI_RECENTI * 86_400_000) q.recenti++;
    if (s.data > q.ultima) q.ultima = s.data;
    q.specie.add(s.specie);
    perCella.set(s.cella, q);
  }
  return perCella;
}

async function datiGruppo() {
  const quadrati: Feature<Polygon>[] = [], centri: Feature<Point>[] = [];
  for (const [cella, q] of await quadratiDelGruppo()) {
    const angoli = angoliCella(cella), c = centroCella(cella);
    if (!angoli.length || !c) continue;
    const p = { cella, n: q.n, recenti: q.recenti, ultima: q.ultima };
    quadrati.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [angoli] }, properties: p });
    centri.push({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: p });
  }
  return { quadrati: { type: "FeatureCollection", features: quadrati } as FeatureCollection, centri: { type: "FeatureCollection", features: centri } as FeatureCollection };
}

// --- livelli ---------------------------------------------------------------------------------------
const vuoto = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });

export function aggiungiLivelliPunti(mappa: Mappa) {
  mappa.addImage("bole-fungo", iconaFungo(VERDE), { pixelRatio: 2 });
  mappa.addImage("bole-vuoto", iconaVuoto(), { pixelRatio: 2 });
  mappa.addImage("bole-auto", iconaAuto(), { pixelRatio: 2 });
  mappa.addImage("bole-stella", iconaStella(), { pixelRatio: 2 });
  mappa.addSource("gruppo-quadrati", { type: "geojson", data: vuoto() });
  mappa.addSource("gruppo-centri", { type: "geojson", data: vuoto() });
  mappa.addSource("miei", { type: "geojson", data: vuoto() });
  const recente: unknown = [">", ["get", "recenti"], 0];
  mappa.addLayer({ id: "gruppo-celle", type: "fill", source: "gruppo-quadrati", minzoom: 10,
    paint: { "fill-color": GRUPPO, "fill-opacity": ["case", recente, 0.14, 0.05] as never } });
  mappa.addLayer({ id: "gruppo-bordi", type: "line", source: "gruppo-quadrati", minzoom: 10,
    paint: { "line-color": GRUPPO, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 15, 2], "line-dasharray": [3, 2] } });
  mappa.addLayer({ id: "gruppo-numeri-fondo", type: "circle", source: "gruppo-centri", minzoom: 7,
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 6, 11, 11, 15, 13], "circle-color": ["case", recente, GRUPPO, "#8b86c9"] as never,
      "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  mappa.addLayer({ id: "gruppo-numeri", type: "symbol", source: "gruppo-centri", minzoom: 9,
    layout: { "text-field": ["to-string", ["get", "n"]], "text-font": ["Noto Sans Medium"], "text-size": 12, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#fff" } });
  mappa.addLayer({ id: "miei-punti", type: "symbol", source: "miei",
    layout: {
      "icon-image": ["get", "icona"], "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["get", "ordine"],
      "text-field": ["step", ["zoom"], "", 13, ["get", "etichetta"]], "text-font": ["Noto Sans Medium"], "text-size": 12,
      "text-offset": [0, 1.5], "text-anchor": "top", "text-optional": true, "text-max-width": 9,
    },
    paint: { "text-color": INCHIOSTRO, "text-halo-color": "#fff", "text-halo-width": 2 } });

  let turno = 0;
  const aggiorna = async () => {
    const mio = ++turno;
    const [miei, gruppo] = await Promise.all([mieiPunti(), datiGruppo()]);
    if (mio !== turno) return;
    (mappa.getSource("miei") as GeoJSONSource | undefined)?.setData(miei);
    (mappa.getSource("gruppo-quadrati") as GeoJSONSource | undefined)?.setData(gruppo.quadrati);
    (mappa.getSource("gruppo-centri") as GeoJSONSource | undefined)?.setData(gruppo.centri);
    document.body.dataset.puntiPronti = String(miei.features.length); // per le prove automatiche
  };
  window.addEventListener("bole:punti", () => void aggiorna());
  void aggiorna();
}

/** Che cosa c'è sotto il dito: un tuo punto, il numero di un quadrato del gruppo, o niente. */
export function toccato(mappa: Mappa, punto: { x: number; y: number }):
  { tipo: "voce" | "stella" | "auto"; id: string } | { tipo: "gruppo"; cella: string } | null {
  const r = 16;
  const area: [PointLike, PointLike] = [[punto.x - r, punto.y - r], [punto.x + r, punto.y + r]];
  const livelli = ["miei-punti", "gruppo-numeri-fondo"].filter((l) => mappa.getLayer(l) && mappa.getLayoutProperty(l, "visibility") !== "none");
  if (!livelli.length) return null;
  const f = mappa.queryRenderedFeatures(area, { layers: livelli });
  const mio = f.find((x) => x.layer.id === "miei-punti");
  if (mio) return { tipo: mio.properties.tipo as "voce" | "stella" | "auto", id: String(mio.properties.id) };
  const g = f.find((x) => x.layer.id === "gruppo-numeri-fondo");
  return g ? { tipo: "gruppo", cella: String(g.properties.cella) } : null;
}

// --- pressione lunga: "segna qui" -------------------------------------------------------------------
let bloccaClicFino = 0;
/** true durante e subito dopo una pressione lunga: il "clic" che la segue va ignorato. */
export const appenaPremuto = () => Date.now() < bloccaClicFino;

/**
 * Pressione lunga = nuova voce in quel punto. Il riconoscimento lo fa già MapLibre: un dito fermo
 * per mezzo secondo diventa un evento "contextmenu", uguale su iPhone e su Android (al computer
 * è il tasto destro). Qui si evita solo che il "clic" che arriva quando si alza il dito apra
 * anche «Perché qui?».
 */
export function collegaPressioneLunga(mappa: Mappa, quandoPremi: (lon: number, lat: number) => void) {
  const zona = mappa.getCanvasContainer();
  let dito = false;
  zona.addEventListener("touchstart", (e) => { dito = e.touches.length > 0; }, { passive: true });
  const fine = () => {
    if (dito && bloccaClicFino === Infinity) bloccaClicFino = Date.now() + 600;
    dito = false;
  };
  zona.addEventListener("touchend", fine);
  zona.addEventListener("touchcancel", fine);
  mappa.on("contextmenu", (e: MapMouseEvent) => {
    if (inScelta) return;
    bloccaClicFino = dito ? Infinity : Date.now() + 600; // col dito giù: finché non si alza
    if (navigator.vibrate) navigator.vibrate(15); // Android: piccola vibrazione (iPhone non la permette)
    quandoPremi(e.lngLat.lng, e.lngLat.lat);
  });
}

// --- mirino: spostare un punto a mano ------------------------------------------------------------------
let inScelta = false;
export const sceltaInCorso = () => inScelta;

/**
 * Nasconde il foglio aperto e mostra un mirino al centro della mappa: si sposta la mappa finché
 * il mirino è sul punto giusto, poi "Usa questo punto". Restituisce il punto, o null se si annulla.
 */
export function scegliPunto(mappa: Mappa, partenza: { lon: number; lat: number }, gps?: { lon: number; lat: number } | null):
  Promise<{ lon: number; lat: number } | null> {
  return new Promise((fine) => {
    inScelta = true;
    mostraFoglio(false);
    const schede = document.querySelector("nav.schede");
    schede?.setAttribute("inert", ""); // mentre si sceglie il punto non si cambia sezione
    document.body.classList.add("scelta-punto"); // via legenda e tasti tondi: la mappa resta libera
    const area = mappa.getContainer().parentElement!;
    const mirino = el("div", { class: "mirino", "aria-hidden": "true" });
    mirino.innerHTML = '<svg viewBox="0 0 60 60" width="60" height="60"><circle cx="30" cy="30" r="13" fill="none" stroke="#fff" stroke-width="5"/>' +
      '<circle cx="30" cy="30" r="13" fill="none" stroke="#14211b" stroke-width="2.5"/><path d="M30 2v18M30 40v18M2 30h18M40 30h18" stroke="#fff" stroke-width="5"/>' +
      '<path d="M30 2v18M30 40v18M2 30h18M40 30h18" stroke="#14211b" stroke-width="2.5"/><circle cx="30" cy="30" r="2.5" fill="#9b1c1c"/></svg>';
    const testo = el("div", { class: "testo", "aria-live": "polite" });
    const chiudi = (r: { lon: number; lat: number } | null) => {
      mappa.off("move", scrivi);
      mirino.remove(); barra.remove();
      schede?.removeAttribute("inert");
      document.body.classList.remove("scelta-punto");
      inScelta = false;
      mostraFoglio(true);
      fine(r);
    };
    const barra = el("div", { class: "barra-punto", role: "dialog", "aria-label": "Sposta il punto" },
      el("b", {}, "Sposta la mappa: il punto è al centro del mirino"),
      testo,
      el("div", { class: "fila-tasti" },
        el("button", { class: "tasto", type: "button", onclick: () => { const c = mappa.getCenter(); chiudi({ lon: +c.lng.toFixed(6), lat: +c.lat.toFixed(6) }); } },
          icona(ICONE.vicino, 18), "Usa questo punto"),
        el("button", { class: "tasto secondario", type: "button", onclick: () => chiudi(null) }, "Annulla")));
    const scrivi = () => {
      const c = mappa.getCenter();
      const da = gps ? ` · ${Math.round(distanzaKm(gps.lon, gps.lat, c.lng, c.lat) * 1000)} m dalla posizione GPS` : "";
      testo.textContent = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}${da}`;
    };
    area.append(mirino, barra);
    mappa.on("move", scrivi);
    mappa.jumpTo({ center: [partenza.lon, partenza.lat], zoom: Math.max(mappa.getZoom(), 16) });
    scrivi();
  });
}

/** Voci del diario vicine a un punto (km), dalla più vicina. */
export async function vociVicine(lon: number, lat: number, km: number): Promise<(Voce & { km: number })[]> {
  return (await diario.tutte())
    .map((v) => ({ ...v, km: distanzaKm(lon, lat, v.lon, v.lat) }))
    .filter((v) => v.km <= km)
    .sort((a, b) => a.km - b.km);
}

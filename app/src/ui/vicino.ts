/**
 * Vicino a me: le zone migliori entro la distanza scelta, per la specie e il giorno della mappa.
 * La posizione si usa solo sul telefono; "Naviga" passa a Mappe soltanto il punto della zona.
 */
import type { Map as Mappa } from "maplibre-gl";
import { zone, type Zona } from "../calcolo/client";
import { COLORI_CLASSI, NOMI_CLASSI } from "../calcolo/formule";
import { nomeScelta } from "../dati/catalogo";
import { direzioneGradi, distanzaKm, nomeVicino, puntoCardinale } from "../dati/luoghi";
import type { Meteo } from "../dati/meteo";
import { dataBreve, el, icona, ICONE, memoria, quandoInParole } from "./dom";
import { apriFoglio, chiudiFoglio } from "./foglio";
import { apriPercheQui, affidabilitaNelPunto } from "./perchequi";
import { apriPreferite } from "./preferite";
import { apriInBosco } from "./inbosco";
import { stato } from "./stato";
import { linkNaviga } from "./naviga";
import { diario, type Voce } from "../dati/archivio";
import { condivisione, segnalazioniAltrui, type Segnalazione } from "../dati/condivisione";
import { centroCella } from "../dati/griglia";

const DISTANZE: [number, string][] = [[15, "15 km"], [30, "30 km"], [60, "60 km"], [120, "120 km"], [400, "Tutta l'area"]];

export { linkNaviga };

function chip(cl: number) {
  return el("span", {
    class: "chip-classe",
    style: `background:${COLORI_CLASSI[cl - 1]};color:${cl >= 4 ? "#fff" : "#14211b"}`,
  }, NOMI_CLASSI[cl]);
}

/** La posizione del telefono (resta qui), oppure null. */
export function posizioneGPS(timeout = 12000): Promise<GeolocationPosition | null> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(ok, () => ok(null), { enableHighAccuracy: false, timeout, maximumAge: 120000 });
  });
}

export async function apriVicino(mappa: Mappa, meteo: Meteo) {
  const corpo = apriFoglio("Vicino a me", "Le zone migliori entro la distanza scelta", undefined, "vicino");
  let raggio = memoria.leggi<number>("raggio", 60);
  let origine: { lon: number; lat: number; da: string } | null = null;

  const scelte = el("div", { class: "riga-scelte", role: "group", "aria-label": "Distanza massima" });
  const giorno = el("select", { "aria-label": "Giorno" },
    ...meteo.oggi.giorni.map((d, i) => el("option", { value: i, selected: i === stato.giorno }, `${quandoInParole(i)} · ${dataBreve(d)}`)));
  const dove = el("p", { class: "fonte", "aria-live": "polite" });
  const risultati = el("div", { "aria-live": "polite" });
  const disegnaScelte = () => scelte.replaceChildren(...DISTANZE.map(([km, nome]) =>
    el("button", { class: "pillola piccola", type: "button", "aria-pressed": String(km === raggio), onclick: () => {
      raggio = km; memoria.scrivi("raggio", km); disegnaScelte(); calcola();
    } }, nome)));
  disegnaScelte();
  giorno.addEventListener("change", () => { stato.vaiAlGiorno(Number(giorno.value)); calcola(); });

  corpo.append(
    el("div", { class: "scheda" },
      el("p", { style: "margin-top:0" }, el("b", {}, nomeScelta(stato.scelta)), " (cambi la specie dalla riga in alto sulla mappa)"),
      el("label", { class: "campo" }, "Giorno", giorno),
      el("div", { class: "etichetta" }, "Distanza in linea d'aria"),
      scelte, dove),
    risultati,
    el("div", { class: "fila-tasti" },
      el("button", { class: "tasto secondario", type: "button", onclick: () => apriPreferite(mappa) }, icona(ICONE.stella, 18), "Zone preferite"),
      el("button", { class: "tasto secondario", type: "button", onclick: () => apriInBosco(mappa) }, icona(ICONE.bussola, 18), "In bosco")),
    el("p", { class: "fonte" },
      "Zone = quadrati di qualche km; per ognuna conta la classe che copre almeno un decimo del bosco adatto. ",
      "Il punto da raggiungere è indicativo, dentro il bosco: l'app di mappe ti porta alla strada più vicina. ",
      "La tua posizione non esce dal telefono."));

  let turno = 0;
  async function calcola() {
    const mio = ++turno;
    if (!origine) {
      dove.textContent = "Cerco la tua posizione…";
      const p = await posizioneGPS();
      if (p) origine = { lon: p.coords.longitude, lat: p.coords.latitude, da: "dalla tua posizione" };
      else {
        const c = mappa.getCenter();
        origine = { lon: c.lng, lat: c.lat, da: "dal centro della mappa (posizione non disponibile)" };
      }
    }
    if (mio !== turno || !corpo.isConnected) return;
    const o = origine;
    dove.textContent = raggio >= 400 ? "Tutto Piemonte e Liguria." : `Entro ${raggio} km ${o.da}.`;
    risultati.replaceChildren(el("div", { class: "scheda" }, el("p", {}, "Calcolo le zone… (la prima volta scarica i dati dell'area)")));
    const elenco = await zone(o.lon, o.lat, raggio, stato.scelta, stato.giorno);
    if (mio !== turno || !corpo.isConnected) return;
    if (!elenco || !elenco.length) {
      risultati.replaceChildren(el("div", { class: "scheda" },
        el("p", {}, `Nessuna zona con habitat e stagione favorevoli per ${nomeScelta(stato.scelta).toLowerCase()} entro questa distanza. Prova una distanza maggiore o un altro giorno.`)));
      return;
    }
    const [nomi, voci, gruppo] = await Promise.all([Promise.all(elenco.map((z) => nomeVicino(z.lon, z.lat))), diario.tutte(), segnalazioniAltrui()]);
    if (mio !== turno || !corpo.isConnected) return;
    const lista = el("ol", { class: "elenco classifica" });
    elenco.forEach((z, i) => lista.append(voce(z, nomi[i], o, mappa, meteo, voci, gruppo)));
    risultati.replaceChildren(el("div", { class: "scheda" },
      el("h3", {}, `${quandoInParole(stato.giorno)} (${dataBreve(meteo.oggi.giorni[stato.giorno])})`), lista));
  }
  calcola();
}

/** Quante voci del tuo diario e quante segnalazioni recenti del gruppo cadono nella zona. */
function storicoZona(z: Zona, voci: Voce[], gruppo: Segnalazione[]) {
  const r = z.cellaKm * 0.75;
  const mie = voci.filter((v) => distanzaKm(z.lon, z.lat, v.lon, v.lat) <= r);
  const trovati = mie.filter((v) => v.tipo === "ritrovamento").length, vuote = mie.length - trovati;
  const settimana = new Date(Date.now() - 7 * 86_400_000).toLocaleDateString("sv-SE");
  const recenti = gruppo.filter((x) => { const c = centroCella(x.cella); return x.data >= settimana && !!c && distanzaKm(z.lon, z.lat, c[0], c[1]) <= r; }).length;
  const parti: string[] = [];
  if (mie.length) parti.push(`nel tuo diario: ${trovati} ${trovati === 1 ? "ritrovamento" : "ritrovamenti"}${vuote ? `, ${vuote} a vuoto` : ""}`);
  if (condivisione.gruppo() && recenti) parti.push(`gruppo: ${recenti} ${recenti === 1 ? "segnalazione" : "segnalazioni"} negli ultimi 7 giorni`);
  return parti.length ? el("div", { style: "font-size:13px;color:#1e5b3f;font-weight:600;margin-top:2px" }, parti.join(" · ")) : null;
}

function voce(z: Zona, luogo: Awaited<ReturnType<typeof nomeVicino>>, o: { lon: number; lat: number }, mappa: Mappa, meteo: Meteo, voci: Voce[], gruppo: Segnalazione[]) {
  const km = distanzaKm(o.lon, o.lat, z.lon, z.lat);
  const verso = puntoCardinale(direzioneGradi(o.lon, o.lat, z.lon, z.lat));
  const aff = affidabilitaNelPunto(meteo.oggi.affidabilita[stato.giorno], z.poche, z.liguria);
  const nome = luogo ? (luogo.km < 1 ? luogo.nome : `Vicino a ${luogo.nome}`) : "Zona senza nome";
  const dist = `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km verso ${verso}`;
  // una riga per zona; un tocco la apre con i dettagli e i tasti (come gli elenchi delle app di mappe)
  return el("li", {},
    el("details", { class: "zona" },
      el("summary", {},
        el("span", { class: "testo" }, el("b", {}, nome), el("small", {}, dist)),
        chip(z.classe)),
      el("div", { class: "dettagli-zona" },
        el("div", { style: "font-size:13px;color:#4a5750" }, `${Math.round(z.buone * 100)}% del bosco adatto in «media» o più · affidabilità ${aff}`),
        storicoZona(z, voci, gruppo),
        el("div", { class: "fila-tasti compatta" },
          el("button", { class: "tasto secondario piccolo", type: "button", onclick: () => {
            chiudiFoglio();
            mappa.flyTo({ center: [z.lon, z.lat], zoom: Math.max(mappa.getZoom(), 12.5) });
          } }, "Mappa"),
          el("button", { class: "tasto secondario piccolo", type: "button", onclick: () => apriPercheQui(mappa, meteo, z.lon, z.lat) }, "Perché?"),
          ...linkNaviga(z.lat, z.lon)))));
}

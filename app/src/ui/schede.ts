/**
 * Collega la barra delle schede (Mappa, Vicino, Diario, Regole, Guida) e il tasto "Strumenti"
 * sulla mappa (preferite, mappe senza rete, in bosco, stato dei dati, livelli).
 */
import type { FeatureCollection } from "geojson";
import type { Map as Mappa } from "maplibre-gl";
import type { Meteo } from "../dati/meteo";
import { avviaAree } from "../dati/scaricamento";
import { el, icona, ICONE, memoria } from "./dom";
import { apriDiario } from "./diario";
import { apriFoglio, ascoltaScheda, chiudiFoglio } from "./foglio";
import { apriGuida } from "./guida";
import { apriInBosco, avviaAvvisoTramonto } from "./inbosco";
import { apriOffline } from "./offline";
import { impostaRegioni } from "./perchequi";
import { apriPreferite } from "./preferite";
import { apriRegole } from "./regole";
import { apriStatoDati, type Schermo } from "./schermo";
import { apriVicino } from "./vicino";
import { apriGruppo } from "./gruppo";
import { LIVELLI_GRUPPO, LIVELLI_PUNTI } from "../mappa/punti";
import { condivisione } from "../dati/condivisione";
import { ANDROID } from "./naviga";

export function collegaSchede(schermo: Schermo, mappa: Mappa, meteo: Meteo, regioni: FeatureCollection) {
  impostaRegioni(regioni);
  avviaAree();

  const apri: Record<string, () => void> = {
    mappa: () => chiudiFoglio(),
    vicino: () => apriVicino(mappa, meteo),
    diario: () => apriDiario(),
    regole: () => apriRegole(mappa, regioni),
    guida: () => apriGuida(mappa, meteo),
  };
  for (const [id, tasto] of Object.entries(schermo.schede)) tasto.addEventListener("click", () => apri[id]?.());
  ascoltaScheda((attiva) => {
    for (const [id, tasto] of Object.entries(schermo.schede)) {
      if (id === attiva) tasto.setAttribute("aria-current", "page");
      else tasto.removeAttribute("aria-current");
    }
  });

  // tasto "Strumenti" sopra quello della posizione
  const strumenti = el("button", { class: "tasto-tondo", type: "button", style: "bottom: 96px", "aria-label": "Strumenti e livelli della mappa" }, icona(ICONE.strati));
  strumenti.addEventListener("click", () => apriStrumenti(mappa, meteo));
  schermo.areaMappa.append(strumenti);

  avviaAvvisoTramonto(() => apriInBosco(mappa));
  consiglioHome(schermo);
}

/** Interruttori dei livelli: nome salvato, testo, livelli della mappa che accende o spegne. */
const LIVELLI: [string, string, string[]][] = [
  ["indice", "Colori dell'indice", ["indice"]],
  ["rilievo", "Rilievo ombreggiato", ["rilievo"]],
  ["isoipse", "Curve di livello", ["isoipse"]],
  ["punti", "I miei punti (diario, preferite, auto)", LIVELLI_PUNTI],
  ["gruppo", "Ritrovamenti del gruppo", LIVELLI_GRUPPO],
];

function apriStrumenti(mappa: Mappa, meteo: Meteo) {
  const corpo = apriFoglio("Strumenti");
  const riga = (ic: string, titolo: string, sotto: string, f: () => void) =>
    el("li", {}, el("button", { class: "voce-menu", type: "button", onclick: f },
      icona(ic, 22), el("span", {}, el("b", {}, titolo), el("small", {}, sotto)), icona(ICONE.freccia, 18)));
  const livelli = el("div", { class: "scheda" }, el("h3", {}, "Livelli della mappa"));
  for (const [id, nome, ids] of LIVELLI) {
    if (!mappa.getLayer(ids[0])) continue;
    if (id === "gruppo" && !condivisione.gruppo()) continue;
    const acceso = mappa.getLayoutProperty(ids[0], "visibility") !== "none";
    const casella = el("input", { type: "checkbox", checked: acceso });
    casella.addEventListener("change", () => {
      for (const l of ids) mappa.setLayoutProperty(l, "visibility", casella.checked ? "visible" : "none");
      memoria.scrivi(`livello.${id}`, casella.checked);
    });
    livelli.append(el("label", { class: "interruttore" }, el("span", {}, nome), casella));
  }
  corpo.append(
    el("div", { class: "scheda" }, el("ul", { class: "elenco" },
      riga(ICONE.stella, "Zone preferite", "Le tue zone, con l'andamento dei prossimi giorni", () => apriPreferite(mappa)),
      riga(ICONE.gruppo, "Ritrovamenti con il gruppo", condivisione.gruppo() ? "Il tuo gruppo e le sue segnalazioni" : "Condividi con gli amici, solo se vuoi", () => apriGruppo(mappa)),
      riga(ICONE.scarica, "Mappe senza rete", "Scarica l'area che vedi, per i boschi senza campo", () => apriOffline(mappa)),
      riga(ICONE.bussola, "In bosco", "Bussola, torna all'auto, tramonto", () => apriInBosco(mappa)),
      riga(ICONE.info, "Stato dei dati", "Ultimo aggiornamento, modelli e fonti", () => apriStatoDati(meteo)))),
    livelli);
}

/** Livelli spenti l'ultima volta: restano spenti. */
export function ripristinaLivelli(mappa: Mappa) {
  for (const [id, , ids] of LIVELLI) {
    if (memoria.leggi<boolean>(`livello.${id}`, true) !== false) continue;
    for (const l of ids) if (mappa.getLayer(l)) mappa.setLayoutProperty(l, "visibility", "none");
  }
}

/** Chrome (Android) avvisa quando l'app si può installare: si tiene l'avviso per il nostro tasto «Installa». */
type RichiestaInstallazione = Event & { prompt(): Promise<void> };
let richiesta: RichiestaInstallazione | null = null;
let quandoInstallabile: (() => void) | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  richiesta = e as RichiestaInstallazione;
  quandoInstallabile?.();
});

/** Fuori dalla Home (nel browser) un consiglio, una volta sola: come installarla su iPhone o su Android. */
function consiglioHome(schermo: Schermo) {
  const daHome = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (daHome || memoria.leggi("consiglio-home", false)) return;
  const chiudi = () => { memoria.scrivi("consiglio-home", true); avviso.remove(); };
  const testo = el("span", {});
  const tastoInstalla = el("button", { type: "button", class: "installa nascosto", onclick: async () => {
    if (!richiesta) return;
    await richiesta.prompt();
    richiesta = null;
    chiudi();
  } }, "Installa");
  const scrivi = () => {
    testo.replaceChildren();
    if (ANDROID) {
      testo.append("Per usarla senza rete: ", richiesta ? el("b", {}, "installala") : el("span", {}, "menu ⋮ → ", el("b", {}, "Installa app")), ", poi aprila sempre dall'icona.");
    } else {
      testo.append("Per usarla senza rete: Condividi → ", el("b", {}, "Aggiungi alla schermata Home"), ", poi aprila sempre da lì.");
    }
    tastoInstalla.classList.toggle("nascosto", !richiesta);
  };
  quandoInstallabile = scrivi;
  const avviso = el("div", { class: "consiglio-home", role: "note" }, testo, tastoInstalla,
    el("button", { type: "button", "aria-label": "Chiudi il consiglio", onclick: chiudi }, icona(ICONE.chiudi, 18)));
  scrivi();
  schermo.areaMappa.append(avviso);
}

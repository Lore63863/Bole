/** Zone preferite: salvate sul telefono, con l'andamento dell'indice da oggi a +14 giorni. */
import type { Map as Mappa } from "maplibre-gl";
import { giorniNelPunto, punto } from "../calcolo/client";
import { COLORI_CLASSI, NOMI_CLASSI } from "../calcolo/formule";
import { SPECIE, nomeScelta } from "../dati/catalogo";
import { avvisaPunti } from "../dati/archivio";
import { dataBreve, el, icona, ICONE, memoria } from "./dom";
import { apriFoglio, chiudiFoglio } from "./foglio";
import { stato } from "./stato";

export interface Preferita { nome: string; lon: number; lat: number }

export function preferite(): Preferita[] {
  return memoria.leggi<Preferita[]>("preferite", []);
}

export function aggiungiPreferita(lon: number, lat: number, nomeProposto: string) {
  const corpo = apriFoglio("Nuova zona preferita", `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  const campo = el("input", { type: "text", value: nomeProposto, maxlength: 60, "aria-label": "Nome della zona" });
  const esito = el("p", { "aria-live": "polite" });
  corpo.append(el("div", { class: "scheda" },
    el("label", { class: "campo" }, "Nome della zona", campo),
    el("div", { class: "fila-tasti" },
      el("button", { class: "tasto", type: "button", onclick: () => {
        const nome = campo.value.trim() || nomeProposto;
        memoria.scrivi("preferite", [...preferite(), { nome, lon, lat }]);
        avvisaPunti();
        esito.textContent = `«${nome}» salvata tra le preferite. Resta solo su questo telefono.`;
      } }, icona(ICONE.stella, 18), "Salva")),
    esito));
}

export async function apriPreferite(mappa: Mappa) {
  const corpo = apriFoglio("Zone preferite", `Indice per ${nomeScelta(stato.scelta).toLowerCase()}, da oggi in avanti`);
  const elenco = preferite();
  if (!elenco.length) {
    corpo.append(el("div", { class: "scheda" }, el("p", {}, "Nessuna zona salvata. Tocca un punto sulla mappa, poi «Salva tra le preferite».")));
    return;
  }
  const lista = el("ul", { class: "elenco" });
  corpo.append(el("div", { class: "scheda" }, lista));
  for (const [i, z] of elenco.entries()) {
    const riga = el("li", {}, el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:8px" },
      el("button", { type: "button", style: "border:0;background:none;padding:0;text-align:left;font-weight:700;font-size:16px",
        onclick: () => { chiudiFoglio(); mappa.flyTo({ center: [z.lon, z.lat], zoom: 13 }); } }, z.nome),
      el("button", { type: "button", class: "tasto-chiudi", "aria-label": `Togli ${z.nome}`, onclick: () => {
        memoria.scrivi("preferite", preferite().filter((_, k) => k !== i));
        avvisaPunti();
        riga.remove();
      } }, icona(ICONE.chiudi, 18))));
    lista.append(riga);
    const p = await punto(z.lon, z.lat);
    if (!p || p.quota === null) { riga.append(el("p", {}, "Fuori dall'area di Bolé.")); continue; }
    const habitat: Record<string, number> = {};
    for (const s of SPECIE) habitat[s.id] = p.valori[s.insieme][s.canale];
    const giorni = giorniNelPunto(z.lon, z.lat, p.quota, habitat, stato.scelta);
    const migliore = giorni.reduce((m, d, k) => (d.cl > giorni[m].cl ? k : m), 0);
    riga.append(
      el("div", { class: "classi-giorni", style: `grid-template-columns:repeat(${giorni.length},1fr)` },
        ...giorni.map((d) => el("div", { title: `${dataBreve(d.data)}: ${NOMI_CLASSI[d.cl]}`, style: `background:${d.cl ? COLORI_CLASSI[d.cl - 1] : "#eef0ec"}` }))),
      el("div", { style: "font-size:13px;margin-top:4px" }, giorni[migliore].cl
        ? `Meglio ${migliore === 0 ? "oggi" : `il ${dataBreve(giorni[migliore].data)}`}: «${NOMI_CLASSI[giorni[migliore].cl]}»`
        : "Nessun habitat per questa specie qui."));
  }
}

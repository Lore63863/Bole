/**
 * Cerca: un paese, una frazione o una località per nome, e la mappa ci va.
 * Usa i 45.000 nomi già sul telefono (OpenStreetMap): funziona senza rete e quello che scrivi non esce.
 */
import { Marker, type Map as Mappa } from "maplibre-gl";
import { cercaLuoghi, type Trovato } from "../dati/luoghi";
import { el, icona, ICONE, memoria } from "./dom";
import { apriFoglio, chiudiFoglio } from "./foglio";

const ZOOM: Record<string, number> = { "città": 12, paese: 13, quartiere: 14, frazione: 14, case: 15, "località": 14.5 };
let segno: Marker | null = null;

/** La barra «Cerca» in cima alla mappa. */
export function barraCerca(mappa: () => Mappa | null) {
  return el("button", { class: "barra-cerca", type: "button", "aria-label": "Cerca un paese o un posto", onclick: () => { const m = mappa(); if (m) apriCerca(m); } },
    icona(ICONE.cerca, 20), el("span", {}, "Cerca un paese o un posto"));
}

function riga(t: Trovato, scegli: (t: Trovato) => void) {
  const dove = [t.tipo, t.vicinoA ? `vicino a ${t.vicinoA}` : null, t.km < 1 ? "qui" : `${Math.round(t.km)} km`].filter(Boolean).join(" · ");
  return el("li", {},
    el("button", { type: "button", class: "riga-cerca", onclick: () => scegli(t) },
      el("span", { class: "nome" }, t.nome), el("span", { class: "dove" }, dove)));
}

export function apriCerca(mappa: Mappa) {
  const corpo = apriFoglio("Cerca", "Paesi, frazioni e località di Piemonte e Liguria · funziona anche senza rete");
  const campo = el("input", { type: "search", class: "campo-cerca", placeholder: "Scrivi un nome, per esempio Entracque",
    "aria-label": "Nome da cercare", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search" });
  const lista = el("ul", { class: "elenco elenco-cerca" });
  const nota = el("p", { class: "nota-cerca" });
  corpo.append(el("div", { class: "scheda" }, campo, nota, lista));

  const scegli = (t: Trovato) => {
    const recenti = memoria.leggi<Trovato[]>("cerca.recenti", []).filter((r) => !(r.nome === t.nome && r.lon === t.lon && r.lat === t.lat));
    memoria.scrivi("cerca.recenti", [t, ...recenti].slice(0, 5));
    chiudiFoglio();
    segno?.remove();
    const punta = el("div", { class: "segno-cerca", "aria-label": t.nome }, el("div", {}));
    segno = new Marker({ element: punta, anchor: "bottom" }).setLngLat([t.lon, t.lat]).addTo(mappa);
    mappa.flyTo({ center: [t.lon, t.lat], zoom: Math.max(mappa.getZoom() > 15 ? mappa.getZoom() : 0, ZOOM[t.tipo] ?? 14), duration: 1200 });
    // il segno resta finché non tocchi la mappa o cerchi altro
    mappa.once("click", () => { segno?.remove(); segno = null; });
  };

  const mostraRecenti = () => {
    const recenti = memoria.leggi<Trovato[]>("cerca.recenti", []);
    nota.textContent = recenti.length ? "Cercati di recente (solo su questo telefono)" : "";
    lista.replaceChildren(...recenti.map((t) => riga(t, scegli)));
  };
  let giro = 0;
  const aggiorna = async () => {
    const testo = campo.value;
    if (testo.trim().length < 2) return mostraRecenti();
    const mio = ++giro;
    const c = mappa.getCenter();
    const trovati = await cercaLuoghi(testo, c.lng, c.lat);
    if (mio !== giro) return; // è arrivato un testo più nuovo
    nota.textContent = trovati.length ? "" : "Nessun nome trovato. Prova con meno lettere o senza «San», «Santa».";
    lista.replaceChildren(...trovati.map((t) => riga(t, scegli)));
  };
  campo.addEventListener("input", () => void aggiorna());
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { (lista.querySelector("button") as HTMLButtonElement | null)?.click(); }
  });
  mostraRecenti();
  campo.focus(); // nello stesso tocco che apre il foglio: così su iPhone si apre anche la tastiera
}

/**
 * Schermata principale (come la bozza grafica): testata, specie, mappa, pannello del giorno, schede.
 */
import type { Map as Mappa } from "maplibre-gl";
import { andamento, parametriDi } from "../calcolo/client";
import { COLORI_CLASSI, NOMI_CLASSI, giornoDellAnno } from "../calcolo/formule";
import { GRUPPO_PORCINI, MINIMO_RITROVAMENTI_PRECISI, SPECIE, nomeScelta, specieDi } from "../dati/catalogo";
import type { Meteo } from "../dati/meteo";
import { LIMITI, LIVELLO_INDICE, urlIndice } from "../mappa/stile";
import { dataBreve, el, icona, ICONE, memoria, quandoInParole } from "./dom";
import { barraCerca } from "./cerca";
import { apriFoglio, chiudiFoglio } from "./foglio";
import { contesto } from "../dati/contesto";
import { stato } from "./stato";

export interface Schermo {
  app: HTMLElement;
  contenitoreMappa: HTMLElement;
  areaMappa: HTMLElement;
  tastoPosizione: HTMLButtonElement;
  /** colonna dei tasti tondi a destra, sopra il cassetto */
  colonna: HTMLElement;
  schede: Record<string, HTMLButtonElement>;
  /** cassetto in basso: "medio" (giorno e schede) o "basso" (solo una riga: mappa quasi a schermo intero) */
  cassetto: (stato?: "medio" | "basso") => "medio" | "basso";
}

const GIUDIZIO = [
  "niente habitat in vista, o specie fuori stagione",
  "giornata sfavorevole",
  "giornata poco favorevole",
  "giornata nella media della stagione",
  "giornata buona",
  "giornata fra le migliori della stagione",
];

/**
 * Impaginazione come le app di mappe più diffuse (Google Maps, Apple Mappe): la mappa occupa tutto lo
 * schermo; sopra galleggiano la ricerca e le specie; in basso un cassetto con il giorno e le schede,
 * che si trascina giù fino a una sola riga (mappa quasi a schermo intero) e su per riaprirlo.
 */
export function costruisciSchermo(meteo: Meteo): Schermo {
  const vecchi = meteo.oggi.dati_vecchi || oreDa(meteo.oggi.creato) > 36;
  const statoDati = el("button", { class: `stato-dati${vecchi ? " vecchi" : ""}`, type: "button", "aria-label": "Stato dei dati" },
    vecchi ? icona(ICONE.avviso, 16) : null, vecchi ? "Dati vecchi" : `Meteo ${dataBreve(meteo.oggi.oggi).replace(/^\S+ /, "")}`);
  const contenitoreMappa = el("div", { id: "mappa", role: "application", "aria-label": "Mappa: tocca un punto per sapere perché" });
  const tastoPosizione = el("button", { class: "tasto-tondo", type: "button", "aria-label": "Vai alla mia posizione" }, icona(ICONE.posizione));
  const colonna = el("div", { class: "colonna-tasti" }, tastoPosizione);
  const areaMappa = el("main", { class: "area-mappa" }, contenitoreMappa, legenda(), colonna,
    el("div", { class: "suggerimento", id: "suggerimento" }, "Tocca: «perché qui?» · Tieni premuto: segna"));
  const schede: Record<string, HTMLButtonElement> = {};
  const nav = el("nav", { class: "schede", "aria-label": "Sezioni dell'app" });
  for (const [id, nome, ic] of [["mappa", "Mappa", ICONE.mappa], ["vicino", "Vicino", ICONE.vicino], ["diario", "Diario", ICONE.diario],
    ["regole", "Regole", ICONE.regole], ["guida", "Guida", ICONE.guida]] as const) {
    schede[id] = el("button", { type: "button", "aria-current": id === "mappa" ? "page" : undefined }, icona(ic), nome);
    nav.append(schede[id]);
  }
  const maniglia = el("button", { class: "maniglia", type: "button", "aria-label": "Apri o chiudi il pannello del giorno" }, el("span", {}));
  const cassetto = el("section", { class: "cassetto medio", "aria-label": "Giorno e sezioni" }, maniglia, pannelloGiorno(meteo), nav);
  const app = el("div", { id: "app" },
    areaMappa,
    el("div", { class: "sopra" },
      el("div", { class: "riga-alto" }, barraCerca(() => contesto.mappa), statoDati),
      rigaSpecie(meteo)),
    cassetto);
  document.body.prepend(app);
  statoDati.addEventListener("click", () => apriStatoDati(meteo));

  // quanto è alto il cassetto: lo usano legenda, tasti e scritte della mappa per stargli sopra
  new ResizeObserver(() => app.style.setProperty("--sotto", `${cassetto.offsetHeight}px`)).observe(cassetto);
  const imposta = (s?: "medio" | "basso") => {
    if (s) {
      cassetto.classList.toggle("basso", s === "basso");
      cassetto.classList.toggle("medio", s === "medio");
      document.body.dataset.cassetto = s;
    }
    return cassetto.classList.contains("basso") ? "basso" : "medio";
  };
  imposta(memoria.leggi<"medio" | "basso">("cassetto", "medio"));
  const cambia = (s: "medio" | "basso") => { imposta(s); memoria.scrivi("cassetto", s); };
  // trascina giù = chiudi, su = apri; un tocco sulla maniglia = cambia
  const riepilogo = cassetto.querySelector(".riepilogo") as HTMLElement;
  for (const presa of [maniglia, riepilogo]) {
    let y0: number | null = null;
    presa.addEventListener("pointerdown", (e) => { y0 = e.clientY; });
    presa.addEventListener("pointerup", (e) => {
      if (y0 === null) return;
      const dy = e.clientY - y0; y0 = null;
      if (dy > 24) cambia("basso");
      else if (dy < -24) cambia("medio");
      else if (presa === maniglia || imposta() === "basso") cambia(imposta() === "basso" ? "medio" : "basso");
    });
    presa.addEventListener("pointercancel", () => { y0 = null; });
  }
  return { app, contenitoreMappa, areaMappa, tastoPosizione, colonna, schede, cassetto: imposta };
}

function oreDa(iso: string) {
  return (Date.now() - Date.parse(iso.replace("Z", ":00Z"))) / 3_600_000;
}

// --- specie ------------------------------------------------------------------------------------
function stagioneOggi(id: string, meteo: Meteo) {
  const p = parametriDi(id);
  return p ? p.stagione[giornoDellAnno(meteo.oggi.oggi) - 1] : 0;
}

function rigaSpecie(meteo: Meteo) {
  const riga = el("nav", { class: "riga-specie", "aria-label": "Specie" });
  const disegna = () => {
    riga.replaceChildren();
    // Porcini sempre; poi le due specie più "di stagione" oggi; poi la scelta, se è un'altra
    const altre = SPECIE.filter((s) => !s.porcino).sort((a, b) => stagioneOggi(b.id, meteo) - stagioneOggi(a.id, meteo));
    const mostrate = [GRUPPO_PORCINI, altre[0].id, altre[1].id];
    if (!mostrate.includes(stato.scelta)) mostrate.push(stato.scelta);
    for (const id of mostrate) {
      riga.append(el("button", { class: "pillola", type: "button", "aria-pressed": String(stato.scelta === id), onclick: () => stato.scegli(id) }, nomeScelta(id)));
    }
    riga.append(el("button", { class: "pillola", type: "button", "aria-haspopup": "dialog", onclick: () => sceltaSpecie(meteo) },
      `Tutte (${SPECIE.length})`, icona(ICONE.giu, 16)));
  };
  disegna();
  stato.ascolta(disegna);
  return riga;
}

function sceltaSpecie(meteo: Meteo) {
  const corpo = apriFoglio("Specie", "Accanto: quanto oggi è «di stagione» (dai ritrovamenti pubblici)");
  const voce = (id: string, nome: string, sotto: string, s: number) =>
    el("li", {},
      el("button", { type: "button", class: "pillola", style: "width:100%;justify-content:space-between;height:auto;min-height:52px;padding:8px 14px",
        "aria-pressed": String(stato.scelta === id), onclick: () => { stato.scegli(id); chiudiFoglio(); } },
        el("span", { style: "display:flex;flex-direction:column;align-items:flex-start;gap:2px" },
          el("span", {}, nome), el("span", { style: "font-size:12px;font-weight:400;opacity:.8;font-style:italic" }, sotto)),
        el("span", { style: "font-size:12px;font-weight:600" }, s >= 0.25 ? `di stagione ${Math.round(s * 100)}%` : "fuori stagione")));
  const lista = el("ul", { class: "elenco" });
  const sPorcini = Math.max(...specieDi(GRUPPO_PORCINI).map((s) => stagioneOggi(s.id, meteo)));
  lista.append(voce(GRUPPO_PORCINI, "Porcini (i quattro insieme)", "Boletus edulis, aereus, reticulatus, pinophilus", sPorcini));
  for (const s of SPECIE) lista.append(voce(s.id, s.nome, s.scientifico, stagioneOggi(s.id, meteo)));
  corpo.append(el("div", { class: "scheda" }, lista));
}

// --- legenda ------------------------------------------------------------------------------------
function legenda() {
  const titolo = el("div", { class: "titolo" });
  const aggiorna = () => { titolo.textContent = nomeScelta(stato.scelta); };
  aggiorna();
  stato.ascolta(aggiorna);
  const l = el("button", { class: "legenda", type: "button", "aria-label": "Legenda: tocca per i dettagli", "aria-expanded": "false" },
    titolo,
    el("div", { class: "scala" }, ...COLORI_CLASSI.map((c) => el("div", { style: `background:${c}` }))),
    el("div", { class: "estremi" }, el("span", {}, "bassa"), el("span", {}, "alta")),
    el("div", { class: "dettagli" },
      el("div", { class: "riga" }, "Classi: molto bassa, bassa, media, alta, molto alta (rispetto alla stagione della specie)"),
      el("div", { class: "riga" },
        el("span", { style: "display:inline-block;flex-shrink:0;width:22px;height:12px;border-radius:2px;background:repeating-linear-gradient(135deg,#F2CF73 0 4px,#14211B 4px 5px)" }),
        "Righe: affidabilità bassa")));
  l.addEventListener("click", () => l.setAttribute("aria-expanded", String(l.getAttribute("aria-expanded") !== "true")));
  return l;
}

// --- pannello del giorno ------------------------------------------------------------------------
let disegnaAndamento: ((q: number[], m: number[]) => void) | null = null;

function pannelloGiorno(meteo: Meteo) {
  const n = meteo.oggi.giorni.length;
  const quando = el("div", { class: "quando" });
  const aff = el("div", { class: "aff" });
  const picco = el("span", { class: "chip-picco nascosto" });
  const barre = el("div", { class: "barre", style: `grid-template-columns:repeat(${n},1fr)`, role: "group", "aria-label": "Giorno mostrato sulla mappa: tocca o scorri sulle barre" });
  const frase = el("div", { class: "frase", "aria-live": "polite" });
  let quote: number[] = meteo.oggi.giorni.map(() => 0), massimi: number[] = [];

  const aggiorna = () => {
    const g = stato.giorno;
    quando.replaceChildren(quandoInParole(g), el("small", {}, dataBreve(meteo.oggi.giorni[g])));
    const base = meteo.oggi.affidabilita[g];
    const poche = specieDi(stato.scelta).some((s) => (parametriDi(s.id)?.ritrovamenti_precisi ?? 0) < MINIMO_RITROVAMENTI_PRECISI);
    aff.replaceChildren("Affidabilità ", el("b", {}, base), poche ? " · più bassa dove decide una specie con pochi dati e in Liguria" : " · più bassa in Liguria");
    [...barre.children].forEach((b, i) => b.classList.toggle("scelto", i === g));
    if (massimi.length) {
      const pct = Math.round(quote[g] * 100);
      const m = massimi[g];
      frase.textContent = m === 0
        ? "Nell'area vista: niente habitat o specie fuori stagione."
        : `Nell'area vista: al massimo «${NOMI_CLASSI[m]}», ${GIUDIZIO[m]}` + (pct > 0 ? ` · ${pct}% dell'habitat in «media» o più.` : ".");
    }
  };

  const disegnaBarre = () => {
    const max = Math.max(...quote, 0.0001);
    barre.replaceChildren(...quote.map((v, i) => {
      const [, , gg] = meteo.oggi.giorni[i].split("-");
      return el("button", {
        type: "button", class: meteo.oggi.affidabilita[i] === "bassa" ? "vuota" : "",
        "aria-label": `${quandoInParole(i)}, ${dataBreve(meteo.oggi.giorni[i])}: ${Math.round(v * 100)}% in classe media o più`,
        onclick: () => stato.vaiAlGiorno(i),
      }, el("span", { class: "colonna-barra" }, el("span", { style: `height:${Math.max(8, (v / max) * 100)}%` })),
      el("small", {}, i === 0 ? "oggi" : String(Number(gg))));
    }));
  };
  disegnaAndamento = (q, m) => {
    quote = q; massimi = m;
    disegnaBarre();
    // picco: il giorno migliore e i giorni vicini almeno all'80%
    const top = q.indexOf(Math.max(...q));
    if (Math.max(...q) <= 0) {
      picco.classList.add("nascosto");
    } else {
      let a = top, b = top;
      while (a > 0 && q[a - 1] >= 0.8 * q[top]) a--;
      while (b < q.length - 1 && q[b + 1] >= 0.8 * q[top]) b++;
      picco.textContent = a === b
        ? (a === 0 ? "Picco oggi" : a === 1 ? "Picco domani" : `Picco tra ${a} giorni`)
        : (a === 0 ? `Picco da oggi a +${b}` : `Picco tra ${a}–${b} giorni`);
      picco.classList.remove("nascosto");
    }
    aggiorna();
  };
  // scorrere col dito sulle barre cambia il giorno, come un cursore
  barre.addEventListener("pointermove", (e) => {
    if (!(e.buttons || e.pointerType === "touch")) return;
    const r = barre.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)));
    if (i !== stato.giorno) stato.vaiAlGiorno(i);
  });

  disegnaBarre();
  stato.ascolta(aggiorna);
  aggiorna();
  return el("section", { class: "pannello", "aria-label": "Giorno della previsione" },
    el("div", { class: "riepilogo" }, quando, picco),
    el("div", { class: "dettagli-giorno" }, aff, barre, frase));
}

// --- collegamento con la mappa -------------------------------------------------------------------
export function collegaMappa(mappa: Mappa, meteo: Meteo) {
  const aggiornaIndice = () => {
    const src = mappa.getSource(LIVELLO_INDICE) as unknown as { setTiles(t: string[]): void } | undefined;
    src?.setTiles([urlIndice(stato.scelta, stato.giorno)]);
  };
  let ultimaScelta = stato.scelta;
  stato.ascolta(() => {
    aggiornaIndice();
    if (stato.scelta !== ultimaScelta) { ultimaScelta = stato.scelta; calcolaAndamento(); }
  });

  let attesa: number | undefined;
  const calcolaAndamento = () => {
    clearTimeout(attesa);
    attesa = window.setTimeout(async () => {
      const b = mappa.getBounds();
      const lim = [Math.max(b.getWest(), LIMITI[0]), Math.max(b.getSouth(), LIMITI[1]), Math.min(b.getEast(), LIMITI[2]), Math.min(b.getNorth(), LIMITI[3])];
      if (lim[0] >= lim[2] || lim[1] >= lim[3]) { disegnaAndamento?.(meteo.oggi.giorni.map(() => 0), meteo.oggi.giorni.map(() => 0)); return; }
      const tessere = tessereDiArea(lim, Math.round(mappa.getZoom()) - 1);
      const r = await andamento(tessere, stato.scelta, meteo.oggi.giorni.map((_, i) => i), lim);
      if (r) disegnaAndamento?.(r.quote, r.massimi);
      document.body.dataset.andamentoPronto = "1"; // per le prove automatiche
    }, 350);
  };
  mappa.on("moveend", calcolaAndamento);
  mappa.once("load", calcolaAndamento);
}

/** Tessere (al massimo 12) che coprono un'area, allo zoom più alto possibile fra 6 e 10. */
function tessereDiArea(lim: number[], zoomVoluto: number): [number, number, number][] {
  for (let z = Math.min(10, Math.max(6, zoomVoluto)); z >= 6; z--) {
    const n = 2 ** z;
    const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
    const ty = (lat: number) => Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
    const x0 = tx(lim[0]), x1 = tx(lim[2]), y0 = ty(lim[3]), y1 = ty(lim[1]);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 12 || z === 6) {
      const out: [number, number, number][] = [];
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
      return out;
    }
  }
  return [];
}

// --- stato dei dati ------------------------------------------------------------------------------
export function apriStatoDati(meteo: Meteo) {
  const o = meteo.oggi;
  const corpo = apriFoglio("Stato dei dati", "Da dove vengono i numeri della mappa");
  const ore = Math.round(oreDa(o.creato));
  corpo.append(
    el("div", { class: "scheda" },
      el("h3", {}, "Meteo"),
      el("dl", { class: "valori" },
        el("dt", {}, "Aggiornato"), el("dd", {}, `${new Date(o.creato.replace("Z", ":00Z")).toLocaleString("it-IT")} (${ore} ore fa)`),
        el("dt", {}, "Corsa del modello"), el("dd", {}, new Date(o.corsa_del_modello.replace("Z", ":00Z")).toLocaleString("it-IT")),
        el("dt", {}, "Giorni previsti"), el("dd", {}, `${dataBreve(o.giorni[0])} – ${dataBreve(o.giorni[o.giorni.length - 1])}`)),
      ore > 36 ? el("div", { class: "avviso" }, icona(ICONE.avviso, 18), "I dati hanno più di 36 ore: l'aggiornamento automatico non è arrivato. La mappa usa l'ultima previsione disponibile.") : null,
      el("p", { class: "fonte" }, el("a", { href: "https://open-meteo.com/", target: "_blank", rel: "noopener" }, "Weather data by Open-Meteo.com"),
        " — modello IFS dell'ECMWF, archivio aperto (CC BY 4.0)")),
    el("div", { class: "scheda" },
      el("h3", {}, "Modello"),
      el("p", {}, "Indice = habitat × meteo × stagione, tarato sui ritrovamenti pubblici 2017–2026 (GBIF e iNaturalist). Le classi sono relative alla stagione di ogni specie: «alta» vuol dire una giornata fra le migliori 1 su 10 della sua stagione, non «qui ci sono funghi»."),
      el("p", { class: "fonte" }, "Dettagli: docs/MODEL.md e docs/VALIDATION.md nel progetto.")),
    attribuzioni());
}

export function attribuzioni() {
  return el("div", { class: "scheda" },
    el("h3", {}, "Fonti e licenze"),
    el("ul", { style: "margin:0;padding-left:18px;font-size:13px;line-height:19px" },
      el("li", {}, "Mappa: © OpenStreetMap contributors (ODbL), tessere Protomaps; caratteri Noto Sans (OFL), simboli da Mapzen (MIT)"),
      el("li", {}, "Boschi, terreno e aree protette: Regione Piemonte e Regione Liguria (CC BY 4.0); Rete Natura 2000, MASE (CC BY 4.0)"),
      el("li", {}, "Uso del suolo: © ESA WorldCover project / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium (CC BY 4.0)"),
      el("li", {}, "Suolo: ISRIC SoilGrids (CC BY 4.0)"),
      el("li", {}, el("a", { href: "https://open-meteo.com/", target: "_blank", rel: "noopener" }, "Weather data by Open-Meteo.com"), ", modello IFS dell'ECMWF (CC BY 4.0)"),
      el("li", {}, "Ritrovamenti per la taratura: GBIF.org e iNaturalist (licenze CC indicate per ogni osservazione)")));
}

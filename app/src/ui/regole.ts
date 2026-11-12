/**
 * Regole del posto: dalla posizione (o dal centro della mappa) la regione, le regole di raccolta,
 * le aree protette nel punto e la caccia. Il testo sta in public/dati/regole.json, con le fonti
 * ufficiali: se una legge cambia si aggiorna quel file, non il codice.
 */
import type { FeatureCollection } from "geojson";
import type { Map as Mappa } from "maplibre-gl";
import { areeProtette, regioneDi } from "../dati/luoghi";
import { el, icona, ICONE } from "./dom";
import { apriFoglio } from "./foglio";
import { posizioneGPS } from "./vicino";

interface Fonte { nome: string; url: string }
interface Sezione { titolo: string; voci: string[] }
interface Regole {
  aggiornato: string;
  avvertenza: string;
  regioni: Record<string, { titolo: string; sezioni: Sezione[]; fonti: Fonte[] }>;
  comuni: Sezione[];
  fonti_comuni: Fonte[];
}

let regole: Promise<Regole> | null = null;
export function caricaRegole() {
  regole ??= fetch(new URL("dati/regole.json", document.baseURI).href).then((r) => r.json());
  return regole;
}

function sezione(s: Sezione) {
  return el("div", {}, el("h4", {}, s.titolo), el("ul", { class: "punti" }, ...s.voci.map((v) => el("li", {}, v))));
}
function fonti(f: Fonte[]) {
  return el("p", { class: "fonte" }, "Fonti: ", ...f.flatMap((x, i) => [i ? " · " : "", el("a", { href: x.url, target: "_blank", rel: "noopener" }, x.nome)]));
}

export async function apriRegole(mappa: Mappa, regioni: FeatureCollection) {
  const corpo = apriFoglio("Regole del posto", "Raccolta, aree protette e caccia", undefined, "regole");
  corpo.append(el("p", {}, "Cerco dove sei…"));
  const [r, p] = await Promise.all([caricaRegole(), posizioneGPS(8000)]);
  if (!corpo.isConnected) return;
  const c = mappa.getCenter();
  const punto = p ? { lon: p.coords.longitude, lat: p.coords.latitude, da: "dove sei ora" } : { lon: c.lng, lat: c.lat, da: "il centro della mappa (posizione non disponibile)" };
  const regione = regioneDi(punto.lon, punto.lat, regioni);
  const aree = await areeProtette(punto.lon, punto.lat);
  if (!corpo.isConnected) return;

  const scelte = Object.keys(r.regioni);
  const mostra = (nome: string) => {
    const g = r.regioni[nome];
    blocco.replaceChildren(el("h3", {}, g.titolo), ...g.sezioni.map(sezione), fonti(g.fonti));
    [...selettore.children].forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === nome)));
  };
  const selettore = el("div", { class: "riga-scelte", role: "group", "aria-label": "Regione" },
    ...scelte.map((n) => el("button", { class: "pillola piccola", type: "button", onclick: () => mostra(n) }, n)));
  const blocco = el("div", { class: "scheda" });

  corpo.replaceChildren(
    el("div", { class: "scheda" },
      el("p", { style: "margin-top:0" }, `Punto usato: ${punto.da}. `, regione ? el("b", {}, `Sei in ${regione}.`) : "Il punto è fuori da Piemonte e Liguria."),
      aree.length
        ? el("div", {}, ...aree.map((a) => el("div", { class: "avviso" }, icona(ICONE.avviso, 18),
          el("span", {}, el("b", {}, a.nome), ` (${a.tipo}): area protetta. Qui valgono anche le regole dell'ente gestore, spesso più severe (zone dove la raccolta è vietata, giorni o quantità diverse). Controlla il suo regolamento prima di raccogliere.`))))
        : el("p", {}, "Nessuna area protetta o sito Natura 2000 in questo punto (secondo le carte regionali e del Ministero)."),
      el("div", { class: "etichetta", style: "margin-top:8px" }, "Regole della regione"),
      selettore),
    blocco,
    el("div", { class: "scheda" }, el("h3", {}, "Ovunque"), ...r.comuni.map(sezione), fonti(r.fonti_comuni)),
    el("p", { class: "fonte" }, `${r.avvertenza} Testo controllato il ${r.aggiornato}.`));
  mostra(regione && r.regioni[regione] ? regione : scelte[0]);
}

/**
 * Guida: sicurezza alimentare, Centri di controllo micologico delle ASL, le 14 specie (habitat,
 * mesi, sosia pericolosi, avvisi per il consumo), come leggere la mappa, privacy e fonti.
 * Il testo sta in public/dati/guida.json (con le fonti); i mesi vengono dal modello.
 */
import type { Map as Mappa } from "maplibre-gl";
import { parametriDi } from "../calcolo/client";
import { SPECIE } from "../dati/catalogo";
import { distanzaKm } from "../dati/luoghi";
import type { Meteo } from "../dati/meteo";
import { el, icona, ICONE } from "./dom";
import { apriFoglio } from "./foglio";
import { attribuzioni } from "./schermo";
import { posizioneGPS } from "./vicino";

interface Fonte { nome: string; url: string }
interface Sosia { nome: string; scientifico: string; pericolo: "mortale" | "velenoso" | "da evitare"; differenze: string }
interface SchedaSpecie { habitat: string; sosia: Sosia[]; consumo: string[]; fonti: Fonte[] }
interface Centro { nome: string; ente: string; indirizzo: string; comune: string; lon: number; lat: number; telefono?: string; email?: string; orari?: string; url: string }
interface Guida {
  aggiornato: string;
  sicurezza: string[];
  specie: Record<string, SchedaSpecie>;
  centri: Centro[];
  centri_nota: string;
  fonti: Fonte[];
}

let guida: Promise<Guida> | null = null;
function caricaGuida() {
  guida ??= fetch(new URL("dati/guida.json", document.baseURI).href).then((r) => r.json());
  return guida;
}

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const INIZIO_MESE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

/** Mesi di stagione dalla curva del modello (media mensile ≥ 0,2; picco ≥ 60% del mese migliore). */
export function mesiDi(id: string) {
  const p = parametriDi(id);
  if (!p) return null;
  const medie = MESI.map((_, m) => {
    let s = 0;
    for (let d = INIZIO_MESE[m]; d < INIZIO_MESE[m + 1]; d++) s += p.stagione[d] ?? 0;
    return s / (INIZIO_MESE[m + 1] - INIZIO_MESE[m]);
  });
  const max = Math.max(...medie);
  return {
    stagione: MESI.filter((_, m) => medie[m] >= 0.2),
    picco: MESI.filter((_, m) => medie[m] >= 0.6 * max && medie[m] >= 0.2),
  };
}

const ETICHETTA: Record<Sosia["pericolo"], string> = { mortale: "MORTALE", velenoso: "velenoso", "da evitare": "da evitare" };

function fonti(f: Fonte[]) {
  return el("p", { class: "fonte" }, "Fonti: ", ...f.flatMap((x, i) => [i ? " · " : "", el("a", { href: x.url, target: "_blank", rel: "noopener" }, x.nome)]));
}

export async function apriGuida(mappa: Mappa, _meteo: Meteo, specieAperta?: string) {
  const corpo = apriFoglio("Guida", "Sicurezza, specie e come leggere la mappa", undefined, "guida");
  corpo.append(el("p", {}, "Carico…"));
  const g = await caricaGuida();
  if (!corpo.isConnected) return;

  const centri = el("div", { class: "scheda" }, el("h3", {}, "Centri di controllo micologico vicini"), el("p", {}, "Cerco i più vicini…"));
  const listaSpecie = el("div", {});
  for (const s of SPECIE) {
    const d = g.specie[s.id];
    if (!d) continue;
    const m = mesiDi(s.id);
    const dettagli = el("details", { class: "scheda specie", id: `guida-${s.id}`, open: s.id === specieAperta },
      el("summary", {}, el("span", { class: "nome" }, s.nome), el("span", { class: "scientifico" }, s.scientifico)),
      m ? el("p", {}, el("b", {}, "Stagione: "), m.stagione.join(", ") || "—", m.picco.length ? ` (più ritrovamenti: ${m.picco.join(", ")})` : "",
        el("span", { class: "fonte" }, " — dai ritrovamenti pubblici 2017–2026")) : null,
      el("p", {}, el("b", {}, "Dove: "), d.habitat),
      el("h4", {}, "Sosia pericolosi"),
      d.sosia.length
        ? el("ul", { class: "punti" }, ...d.sosia.map((x) => el("li", {},
          el("span", { class: `pericolo ${x.pericolo.replace(" ", "-")}` }, ETICHETTA[x.pericolo]), " ",
          el("b", {}, x.nome), el("i", {}, ` (${x.scientifico})`), `: ${x.differenze}`)))
        : el("p", {}, "Nessun sosia mortale tipico: va comunque fatto controllare."),
      d.consumo.length ? [el("h4", {}, "Prima di mangiarlo"), el("ul", { class: "punti" }, ...d.consumo.map((v) => el("li", {}, v)))] : null,
      fonti(d.fonti));
    listaSpecie.append(dettagli);
  }

  corpo.replaceChildren(
    el("div", { class: "avviso-fisso" }, icona(ICONE.avviso, 20),
      el("span", {}, el("b", {}, "Non mangiare mai un fungo riconosciuto con un'app: "), "fallo controllare al Centro di controllo micologico dell'ASL.")),
    el("div", { class: "scheda" }, el("h3", {}, "Sicurezza"), el("ul", { class: "punti" }, ...g.sicurezza.map((v) => el("li", {}, v)))),
    centri,
    el("h3", { style: "margin:16px 2px 8px" }, "Le 14 specie"),
    el("p", { class: "fonte", style: "margin:0 2px 8px" }, "Le schede dicono dove e quando cercare e quali sosia sono pericolosi: non servono a riconoscere un fungo da mangiare."),
    listaSpecie,
    el("div", { class: "scheda" },
      el("h3", {}, "Come leggere la mappa"),
      el("ul", { class: "punti" },
        el("li", {}, "I colori dicono quanto la giornata è favorevole rispetto alla stagione della specie, in quel bosco: probabilità relative, mai «qui ci sono funghi»."),
        el("li", {}, "«Alta» = fra le giornate migliori, circa 1 su 10 della stagione. «Molto bassa» = habitat adatto ma giornata sfavorevole."),
        el("li", {}, "Le righe sopra i colori indicano affidabilità bassa: previsione lontana (oltre 6 giorni), specie con pochi ritrovamenti per tararla, o Liguria (carta dei boschi più vecchia)."),
        el("li", {}, "Tocca un punto per sapere il perché: bosco, quota, pioggia, temperature e i freni attivi (caldo, secco, gelo, neve)."),
        el("li", {}, "Tieni premuto il dito su un punto per segnarlo nel diario. I tuoi punti: cerchio verde col fungo = ritrovamento, cerchio bianco = uscita a vuoto, stella = zona preferita, quadrato scuro = auto di oggi."),
        el("li", {}, "Quadrati viola a tratteggio con un numero: segnalazioni del gruppo (non verificate), posizione approssimata a 1 km."),
        el("li", {}, "I tuoi ritrovamenti e quelli del gruppo non cambiano i colori: l'indice resta il modello tarato sui dati pubblici. Con ogni voce il diario salva che cosa diceva la mappa quel giorno: è il dato che servirà a ritarare il modello con le tue uscite."),
        el("li", {}, "Il meteo si aggiorna una volta al giorno; la data è in alto a destra."))),
    el("div", { class: "scheda" },
      el("h3", {}, "Privacy"),
      el("ul", { class: "punti" },
        el("li", {}, "Niente account, niente pubblicità, niente statistiche di uso."),
        el("li", {}, "La posizione e il diario restano su questo telefono. Il diario lo esporti tu, se vuoi."),
        el("li", {}, "Gruppo (solo se ci entri): di un ritrovamento che scegli di condividere escono solo specie, quantità, giorno e il quadrato di 1 km. Mai la posizione dal vivo, il punto preciso, l'ora, le foto, le note o le uscite a vuoto. Gli altri lo vedono dal giorno dopo."),
        el("li", {}, "«Naviga» apre Mappe o Google Maps passando solo il punto di arrivo."))),
    el("div", { class: "scheda" },
      el("h3", {}, "Usarla come un'app"),
      el("p", {}, el("b", {}, "iPhone: "), "in Safari tocca Condividi, poi «Aggiungi alla schermata Home»."),
      el("p", {}, el("b", {}, "Android: "), "in Chrome tocca il menu ⋮, poi «Installa app» (o «Aggiungi a schermata Home»)."),
      el("p", {}, "Poi apri Bolé sempre da quell'icona: funziona senza rete nelle aree scaricate e il telefono conserva i dati.")),
    attribuzioni(),
    fonti(g.fonti),
    el("p", { class: "fonte" }, `Testi controllati il ${g.aggiornato}.`));

  if (specieAperta) document.getElementById(`guida-${specieAperta}`)?.scrollIntoView();

  // centri più vicini (alla posizione, o al centro della mappa)
  const p = await posizioneGPS(8000);
  if (!corpo.isConnected) return;
  const c = mappa.getCenter();
  const o = p ? { lon: p.coords.longitude, lat: p.coords.latitude } : { lon: c.lng, lat: c.lat };
  const vicini = [...g.centri].map((x) => ({ ...x, km: distanzaKm(o.lon, o.lat, x.lon, x.lat) })).sort((a, b) => a.km - b.km).slice(0, 3);
  centri.replaceChildren(
    el("h3", {}, "Centri di controllo micologico vicini"),
    el("p", { class: "fonte", style: "margin-top:-4px" }, p ? "Dalla tua posizione" : "Dal centro della mappa"),
    el("ul", { class: "elenco" }, ...vicini.map((x) => el("li", {},
      el("div", { style: "font-weight:700" }, x.nome),
      el("div", { style: "font-size:13px;color:#4a5750" }, `${x.ente} · ${x.indirizzo}, ${x.comune} · ${Math.round(x.km)} km`),
      x.orari ? el("div", { style: "font-size:13px" }, x.orari) : null,
      el("div", { class: "fila-tasti" },
        x.telefono ? el("a", { class: "tasto secondario piccolo", href: `tel:${x.telefono.replace(/[^\d+]/g, "")}` }, "Chiama") : null,
        el("a", { class: "tasto secondario piccolo", href: x.url, target: "_blank", rel: "noopener" }, "Pagina dell'ASL"))))),
    el("p", { class: "fonte" }, g.centri_nota));
}

/**
 * "Perché qui?": tocchi un punto e vedi da dove viene il colore della mappa.
 */
import type { FeatureCollection } from "geojson";
import type { Map as Mappa } from "maplibre-gl";
import { giorniNelPunto, parametriDi, punto } from "../calcolo/client";
import { COLORI_CLASSI, NOMI_CLASSI } from "../calcolo/formule";
import { SPECIE, nomeScelta, specieDi } from "../dati/catalogo";
import { areeProtette, distanzaKm, nomeBosco, nomeVicino, puntoCardinale, regioneDi } from "../dati/luoghi";
import { condivisione, segnalazioniAltrui } from "../dati/condivisione";
import { cella1km, centroCella } from "../dati/griglia";
import { vociVicine } from "../mappa/punti";
import { seriePunto, type Meteo } from "../dati/meteo";
import { aggiungi, dataBreve, el, icona, ICONE, quandoInParole } from "./dom";
import { apriFoglio } from "./foglio";
import { aggiungiPreferita } from "./preferite";
import { apriVoce, chipClasse as chipVoce, nuovoRitrovamento } from "./diario";
import { elencoSegnalazioni } from "./gruppo";
import { NOME_MAPPE, urlNaviga } from "./naviga";
import { stato } from "./stato";

import { affidabilitaNelPunto } from "../calcolo/istantanea";
export { affidabilitaNelPunto };

let regioniGeo: FeatureCollection | null = null;
export function impostaRegioni(r: FeatureCollection) { regioniGeo = r; }

function chipClasse(cl: number) {
  return el("span", {
    style: `display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;font-weight:700;font-size:14px;` +
      `background:${cl ? COLORI_CLASSI[cl - 1] : "#eef0ec"};color:${cl >= 4 ? "#fff" : "#14211b"};box-shadow:inset 0 0 0 1px rgba(20,33,27,.3)`,
  }, cl ? NOMI_CLASSI[cl] : "nessun habitat");
}

export async function apriPercheQui(mappa: Mappa, meteo: Meteo, lon: number, lat: number) {
  const corpo = apriFoglio("Perché qui?", `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  corpo.append(el("p", {}, "Calcolo…"));
  const [p, luogo, aree, vicine, gruppo] = await Promise.all([
    punto(lon, lat), nomeVicino(lon, lat), areeProtette(lon, lat), vociVicine(lon, lat, 1), segnalazioniAltrui(),
  ]);
  if (!p || p.quota === null) {
    corpo.replaceChildren(el("div", { class: "scheda" }, el("p", {}, "Qui Bolé non ha dati: il punto è fuori da Piemonte e Liguria o in mare.")));
    return;
  }
  const quota = p.quota;
  // habitat delle specie scelte, letto dalle tessere
  const habitat: Record<string, number> = {};
  for (const s of SPECIE) habitat[s.id] = p.valori[s.insieme][s.canale];
  const giorni = giorniNelPunto(lon, lat, quota, habitat, stato.scelta);
  const regione = regioniGeo ? regioneDi(lon, lat, regioniGeo) : null;
  const liguria = regione === "Liguria";
  const g = stato.giorno;
  const oggi = giorni[g];
  const nome = nomeScelta(stato.scelta).toLowerCase();
  const bosco = await nomeBosco(p.categoria);

  // --- intestazione: dove sono ---
  const titolo = luogo ? `${luogo.km < 0.3 ? "A" : "Vicino a"} ${luogo.nome}` : "Punto sulla mappa";
  const dove = luogo && luogo.km >= 0.3 ? `${luogo.km.toFixed(1).replace(".", ",")} km da ${luogo.nome} (${luogo.tipo})` : regione ?? "";

  // --- la classe del giorno e l'andamento ---
  const aff = affidabilitaNelPunto(oggi.affidabilita, oggi.poche, liguria);
  const strisce = el("div", { class: "classi-giorni", style: `grid-template-columns:repeat(${giorni.length},1fr)` },
    ...giorni.map((d, i) => {
      const a = affidabilitaNelPunto(d.affidabilita, d.poche, liguria);
      const bg = d.cl ? COLORI_CLASSI[d.cl - 1] : "#eef0ec";
      return el("div", {
        title: `${dataBreve(d.data)}: ${NOMI_CLASSI[d.cl]}`,
        style: `background:${a === "bassa" && d.cl ? `repeating-linear-gradient(135deg, ${bg} 0 4px, rgba(20,33,27,.45) 4px 5px)` : bg};` +
          (i === g ? "outline:2px solid #14211b;outline-offset:1px;" : ""),
      });
    }));
  const migliore = giorni.reduce((m, d, i) => (d.cl > giorni[m].cl ? i : m), 0);

  // --- habitat delle specie scelte ---
  const righeHabitat = specieDi(stato.scelta).map((s) =>
    [el("dt", {}, `Habitat ${s.nome.toLowerCase()}`), el("dd", {}, habitat[s.id] ? `${habitat[s.id]}/100` : "nessuno")]).flat();

  // --- freni attivi oggi ---
  const par = parametriDi(oggi.specie || specieDi(stato.scelta)[0].id);
  const freni: string[] = [];
  if (par) {
    if (oggi.tx > par.caldo_soglia) freni.push(`caldo: massima ${oggi.tx.toFixed(0)} °C negli ultimi 7 giorni`);
    if (oggi.secco) freni.push("suolo secco per la stagione");
    if (oggi.tn < par.gelo_soglia) freni.push(`gelo: minima ${oggi.tn.toFixed(0)} °C negli ultimi 3 giorni`);
    if (oggi.neve > 1) freni.push(`neve al suolo (circa ${Math.round(oggi.neve)} cm)`);
  }

  // --- serie per il grafico ---
  const serie = seriePunto(meteo, lat, lon, quota);
  const suoloOggi = serie.tSuolo[30 + g];

  // --- avvisi ---
  const avvisi: HTMLElement[] = [];
  for (const a of aree) {
    avvisi.push(el("div", { class: "avviso" }, icona(ICONE.avviso, 18),
      el("span", {}, el("b", {}, a.nome), ` (${a.tipo}). Nelle aree protette e nei siti Natura 2000 la raccolta può essere vietata o limitata: controlla il regolamento dell'ente gestore.`,
        a.caccia ? ` Caccia: ${a.caccia === "sì" ? "ammessa" : "non ammessa"} nell'area.` : "")));
  }
  if (p.castagneto) {
    avvisi.push(el("div", { class: "avviso" }, icona(ICONE.avviso, 18),
      "Castagneto da frutto: in Piemonte è vietato raccogliere nei castagneti da frutto coltivati (pascolati, falciati o tenuti puliti), anche senza cartelli. Rispetta sempre le proprietà."));
  }
  const mese = Number(meteo.oggi.giorni[g].slice(5, 7)), giornoSett = new Date(meteo.oggi.giorni[g] + "T12:00:00Z").getUTCDay();
  if (mese >= 6 || mese === 1) {
    const silenzio = giornoSett === 2 || giornoSett === 5;
    avvisi.push(el("div", { class: "avviso" }, icona(ICONE.avviso, 18),
      (mese >= 9 || mese === 1
        ? "Mesi di caccia: in genere dalla terza domenica di settembre al 31 gennaio (calendari regionali 2026/2027). "
        : "Caccia di selezione agli ungulati possibile anche in estate (in Piemonte al capriolo da giugno). ") +
      (silenzio ? "Martedì e venerdì non si caccia (silenzio venatorio)." : "Si caccia da un'ora prima dell'alba al tramonto: vesti colori vivaci.")));
  }

  // --- storico: il tuo diario e il gruppo, qui intorno ---
  const nomeVoce = (v: (typeof vicine)[number]) => (v.tipo === "a vuoto" ? "A vuoto" : SPECIE.find((x) => x.id === v.specie)?.nome ?? "Ritrovamento");
  const storicoMio = vicine.length ? el("div", { class: "scheda" },
    el("h3", {}, "Il tuo diario qui vicino"),
    el("p", { class: "fonte", style: "margin-top:-4px" }, `Entro 1 km: ${vicine.length} ${vicine.length === 1 ? "voce" : "voci"}`),
    el("ul", { class: "elenco" }, ...vicine.slice(0, 5).map((v) => el("li", {}, el("button", { class: "riga-voce", type: "button", onclick: () => apriVoce(v.id) },
      el("span", { class: "testo" }, el("b", {}, nomeVoce(v)),
        el("small", {}, `${dataBreve(v.data)}${v.quantita ? ` · ${v.quantita}` : ""} · ${v.km < 0.05 ? "qui" : `a ${Math.round(v.km * 1000)} m`}`)),
      v.istantanea ? chipVoce(v.istantanea.classe, true) : null)))),
    el("p", { class: "fonte" }, "A destra: la classe della mappa nel giorno della voce.")) : null;
  const quadrato = cella1km(lon, lat);
  const unMeseFa = new Date(Date.now() - 30 * 86_400_000).toLocaleDateString("sv-SE");
  const gruppoVicino = gruppo.filter((x) => { const c = centroCella(x.cella); return !!c && distanzaKm(lon, lat, c[0], c[1]) <= 2.2; })
    .sort((a, b) => b.data.localeCompare(a.data));
  const nelQuadrato = gruppoVicino.filter((x) => x.cella === quadrato);
  const storicoGruppo = condivisione.gruppo() && gruppoVicino.length ? el("div", { class: "scheda" },
    el("h3", {}, "Segnalazioni del gruppo"),
    el("p", {}, `In questo quadrato di 1 km: ${nelQuadrato.length || "nessuna"}. Entro 2 km: ${gruppoVicino.length}, ` +
      `${gruppoVicino.filter((x) => x.data >= unMeseFa).length} negli ultimi 30 giorni.`),
    elencoSegnalazioni((nelQuadrato.length ? nelQuadrato : gruppoVicino).slice(0, 5)),
    el("p", { class: "fonte" }, "Non verificate; posizione approssimata al quadrato di 1 km. Non cambiano i colori della mappa.")) : null;

  corpo.replaceChildren();
  aggiungi(corpo, [
    el("div", { class: "avviso-fisso" }, icona(ICONE.avviso, 20),
      el("span", {}, el("b", {}, "Non mangiare mai un fungo riconosciuto con un'app: "), "fallo controllare al Centro di controllo micologico dell'ASL (gratuito).")),
    el("div", { class: "scheda" },
      el("h3", {}, titolo),
      dove ? el("p", { style: "margin-top:-4px;color:#4a5750" }, dove) : null,
      el("p", {}, `${quandoInParole(g)} (${dataBreve(oggi.data)}), ${nome}: `, chipClasse(oggi.cl)),
      el("p", { style: "font-size:13px;color:#4a5750" }, `Affidabilità: ${aff}` +
        (oggi.poche ? " — specie con pochi ritrovamenti per tararla" : "") + (liguria ? " — in Liguria la carta dei boschi è del 2010" : "")),
      el("div", { style: "font-size:12px;color:#4a5750;margin-top:8px" }, `Da oggi a +${giorni.length - 1} giorni (righe: affidabilità bassa)`),
      strisce,
      giorni[migliore].cl > 0 ? el("p", { style: "font-size:13px" }, `Giorno migliore qui: ${quandoInParole(migliore).toLowerCase()} (${dataBreve(giorni[migliore].data)}), «${NOMI_CLASSI[giorni[migliore].cl]}».`) : null,
      el("p", { class: "fonte" }, "Le classi sono relative alla stagione della specie: «alta» = fra le giornate migliori 1 su 10. Probabilità relative, mai certezze.")),
    avvisi.length ? el("div", { class: "scheda" }, el("h3", {}, "Avvisi"), ...avvisi) : null,
    storicoMio,
    storicoGruppo,
    el("div", { class: "scheda" },
      el("h3", {}, "Il posto"),
      el("dl", { class: "valori" },
        el("dt", {}, "Bosco"), el("dd", {}, bosco ?? "non in carta (prato, coltivo o altro)"),
        el("dt", {}, "Quota"), el("dd", {}, `${Math.round(quota)} m`),
        p.pendenza !== null ? [el("dt", {}, "Pendenza"), el("dd", {}, `${Math.round(p.pendenza)}°`)] : null,
        p.esposizione !== null && (p.pendenza ?? 0) > 3 ? [el("dt", {}, "Esposizione"), el("dd", {}, `verso ${puntoCardinale(p.esposizione)}`)] : null,
        ...righeHabitat),
      el("p", { class: "fonte" }, "Carte forestali di Regione Piemonte (2025) e Regione Liguria (2010), DTM regionali, ESA WorldCover (CC BY 4.0).")),
    el("div", { class: "scheda" },
      el("h3", {}, `Il meteo di ${quandoInParole(g).toLowerCase()}`),
      el("dl", { class: "valori" },
        el("dt", {}, "Pioggia degli ultimi 26 giorni"), el("dd", {}, `${Math.round(oggi.P)} mm`),
        el("dt", {}, "Temperatura media degli ultimi 20 giorni"), el("dd", {}, `${oggi.t.toFixed(1).replace(".", ",")} °C`),
        el("dt", {}, "Temperatura del suolo (0–7 cm)"), el("dd", {}, Number.isFinite(suoloOggi) ? `${suoloOggi.toFixed(1).replace(".", ",")} °C` : "—"),
        el("dt", {}, "Freni attivi"), el("dd", {}, freni.length ? freni.join("; ") : "nessuno")),
      grafico(serie.pioggia, serie.tMedia, 30, g),
      el("p", { class: "fonte" }, "Temperature riportate alla quota del punto. ",
        el("a", { href: "https://open-meteo.com/", target: "_blank", rel: "noopener" }, "Weather data by Open-Meteo.com"), " (ECMWF IFS, CC BY 4.0).")),
    el("div", { class: "fila-tasti" },
      el("button", { class: "tasto", type: "button", onclick: () => aggiungiPreferita(lon, lat, luogo?.nome ?? titolo) }, icona(ICONE.stella, 18), "Salva tra le preferite"),
      el("button", { class: "tasto secondario", type: "button", onclick: () => nuovoRitrovamento(lon, lat, "mappa") }, icona(ICONE.diario, 18), "Segna nel diario"),
      el("a", { class: "tasto secondario", href: urlNaviga(lat, lon), target: "_blank", rel: "noopener", "aria-label": `Naviga con ${NOME_MAPPE}` }, icona(ICONE.naviga, 18), "Naviga")),
  ]);
  mappa.flyTo({ center: [lon, lat], duration: 300, offset: [0, 0] });
}

/** Grafico: pioggia (barre) e temperatura media (linea), dai 30 giorni passati ai prossimi. */
function grafico(pioggia: Float32Array, temp: Float32Array, oggi: number, scelto: number) {
  const W = 340, H = 150, sx = 30, dx = 30, sy = 10, dy = 24;
  const n = pioggia.length, bw = (W - sx - dx) / n;
  const pMax = Math.max(10, ...Array.from(pioggia).filter(Number.isFinite));
  const tv = Array.from(temp).filter(Number.isFinite);
  const tMin = Math.floor(Math.min(...tv, 0) / 5) * 5, tMax = Math.ceil(Math.max(...tv, 10) / 5) * 5;
  const ys = (v: number) => sy + (H - sy - dy) * (1 - v / pMax);
  const yt = (v: number) => sy + (H - sy - dy) * (1 - (v - tMin) / (tMax - tMin));
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "grafico");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Pioggia giornaliera (barre) e temperatura media (linea), dai 30 giorni passati ai prossimi giorni");
  let s = "";
  for (let i = 0; i < n; i++) {
    const v = pioggia[i];
    if (!Number.isFinite(v) || v < 0.1) continue;
    const futuro = i > oggi;
    s += `<rect x="${(sx + i * bw + 0.5).toFixed(1)}" y="${ys(v).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${(H - dy - ys(v)).toFixed(1)}" rx="1" fill="${futuro ? "#9cc3e4" : "#2f6fa8"}"/>`;
  }
  const pts = Array.from(temp).map((v, i) => Number.isFinite(v) ? `${(sx + (i + 0.5) * bw).toFixed(1)},${yt(v).toFixed(1)}` : "").filter(Boolean);
  s += `<polyline points="${pts.join(" ")}" fill="none" stroke="#c2410c" stroke-width="2" stroke-linejoin="round"/>`;
  const xo = sx + (oggi + 0.5) * bw, xs = sx + (oggi + scelto + 0.5) * bw;
  s += `<line x1="${xo}" x2="${xo}" y1="${sy}" y2="${H - dy}" stroke="#14211b" stroke-dasharray="3 3"/>`;
  if (scelto) s += `<line x1="${xs}" x2="${xs}" y1="${sy}" y2="${H - dy}" stroke="#14211b" stroke-width="1.5"/>`;
  s += `<text x="${xo}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#14211b">oggi</text>`;
  s += `<text x="${sx}" y="${H - 8}" font-size="10" fill="#4a5750">-30 g</text><text x="${W - dx}" y="${H - 8}" font-size="10" text-anchor="end" fill="#4a5750">+${n - oggi - 1} g</text>`;
  s += `<text x="${sx - 4}" y="${sy + 8}" font-size="10" text-anchor="end" fill="#2f6fa8">${Math.round(pMax)}</text><text x="${sx - 4}" y="${H - dy}" font-size="10" text-anchor="end" fill="#2f6fa8">0 mm</text>`;
  s += `<text x="${W - dx + 4}" y="${yt(tMax) + 4}" font-size="10" fill="#c2410c">${tMax}°</text><text x="${W - dx + 4}" y="${yt(tMin)}" font-size="10" fill="#c2410c">${tMin}°</text>`;
  svg.innerHTML = s;
  return el("div", { style: "margin-top:10px" }, svg,
    el("div", { style: "display:flex;gap:14px;font-size:11px;color:#4a5750;margin-top:2px" },
      el("span", {}, el("span", { style: "display:inline-block;width:10px;height:10px;background:#2f6fa8;margin-right:4px" }), "pioggia (mm/giorno)"),
      el("span", {}, el("span", { style: "display:inline-block;width:14px;height:2px;background:#c2410c;margin-right:4px;vertical-align:middle" }), "temperatura media")));
}

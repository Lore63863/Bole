/**
 * Mappe senza rete: scarica l'area che vedi (mappa base, boschi, quota; il meteo lo tiene il
 * service worker), con la dimensione mostrata prima. Le aree restano finché non le togli.
 */
import type { Map as Mappa } from "maplibre-gl";
import { areeScaricate, type Area } from "../dati/fuorilinea";
import { nomeVicino } from "../dati/luoghi";
import { MASSIMO_BYTE, scarica, stima, togli } from "../dati/scaricamento";
import { chiediPersistenza } from "../dati/archivio";
import { LIMITI } from "../mappa/stile";
import { dataBreve, el, icona, ICONE } from "./dom";
import { apriFoglio, chiudiFoglio } from "./foglio";

const mb = (b: number) => (b < 1e6 ? `${Math.max(0.1, b / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.round(b / 1e6)} MB`);

export async function apriOffline(mappa: Mappa) {
  const corpo = apriFoglio("Mappe senza rete", "Per i boschi dove non c'è campo");
  const b = mappa.getBounds();
  const limiti: [number, number, number, number] = [
    Math.max(b.getWest(), LIMITI[0]), Math.max(b.getSouth(), LIMITI[1]), Math.min(b.getEast(), LIMITI[2]), Math.min(b.getNorth(), LIMITI[3]),
  ];
  const vuota = limiti[0] >= limiti[2] || limiti[1] >= limiti[3];
  const nuova = el("div", { class: "scheda" }, el("h3", {}, "Scarica l'area che vedi sulla mappa"), el("p", {}, "Calcolo la dimensione…"));
  const elenco = el("div", { class: "scheda" });
  const spazio = el("p", { class: "fonte" });
  corpo.append(nuova, elenco,
    el("div", { class: "scheda" },
      el("h3", {}, "Come funziona"),
      el("p", {}, "Nell'area scaricata mappa, sentieri, curve di livello e indice funzionano anche in modalità aereo. ",
        "Il meteo resta quello dell'ultima volta che Bolé ha avuto rete: guarda la data in alto («Meteo di …»)."),
      el("p", {}, "Apri Bolé sempre dall'icona sulla schermata Home: così il telefono tiene i file scaricati."),
      spazio));
  disegnaElenco(elenco, mappa);
  aggiornaSpazio(spazio);
  if (vuota) { nuova.replaceChildren(el("h3", {}, "Scarica l'area che vedi"), el("p", {}, "La mappa è fuori da Piemonte e Liguria.")); return; }

  const [{ byte, tessere }, luogo] = await Promise.all([stima(limiti), nomeVicino((limiti[0] + limiti[2]) / 2, (limiti[1] + limiti[3]) / 2)]);
  if (!corpo.isConnected) return;
  const larghezza = (limiti[2] - limiti[0]) * 111.32 * Math.cos((((limiti[1] + limiti[3]) / 2) * Math.PI) / 180);
  const altezza = (limiti[3] - limiti[1]) * 110.57;
  const misure = `${Math.round(larghezza)} × ${Math.round(altezza)} km`;
  if (byte > MASSIMO_BYTE) {
    nuova.replaceChildren(el("h3", {}, "Scarica l'area che vedi"),
      el("p", {}, `L'area vista (${misure}) peserebbe circa ${mb(byte)}: troppo. Avvicina la mappa sulla zona che ti interessa e riprova (al massimo 150 MB per area).`),
      el("button", { class: "tasto secondario", type: "button", onclick: () => chiudiFoglio() }, "Torna alla mappa"));
    return;
  }
  const nome = el("input", { type: "text", value: luogo ? `Zona di ${luogo.nome}` : "Area senza nome", maxlength: 50, "aria-label": "Nome dell'area" });
  const barra = el("progress", { max: 1, value: 0, class: "nascosto", style: "width:100%" });
  const stato = el("p", { "aria-live": "polite" });
  const annulla = new AbortController();
  const tasto = el("button", { class: "tasto", type: "button" }, icona(ICONE.scarica, 18), `Scarica (circa ${mb(byte)})`);
  const ferma = el("button", { class: "tasto secondario nascosto", type: "button", onclick: () => annulla.abort() }, "Annulla");
  tasto.addEventListener("click", async () => {
    tasto.disabled = true; tasto.classList.add("nascosto"); ferma.classList.remove("nascosto"); barra.classList.remove("nascosto");
    await chiediPersistenza();
    try {
      const area = await scarica(limiti, nome.value.trim() || "Area", (fatte, totale, b) => {
        barra.value = fatte / totale;
        stato.textContent = `${fatte} di ${totale} pezzi · ${mb(b)}`;
      }, annulla.signal);
      stato.textContent = `Fatto: «${area.nome}», ${mb(area.byte)}. Ora funziona anche senza rete.`;
      ferma.classList.add("nascosto");
      disegnaElenco(elenco, mappa);
      aggiornaSpazio(spazio);
    } catch (e) {
      stato.textContent = (e as Error).name === "AbortError"
        ? "Scaricamento annullato: i pezzi già scaricati restano finché non togli l'area."
        : `Scaricamento interrotto (${(e as Error).message}). Controlla la rete e riprova.`;
      ferma.classList.add("nascosto");
    }
  });
  nuova.replaceChildren(
    el("h3", {}, "Scarica l'area che vedi sulla mappa"),
    el("p", {}, `${misure}, circa ${mb(byte)} (${tessere} pezzi). Meglio con il Wi-Fi.`),
    el("label", { class: "campo" }, "Nome", nome),
    el("div", { class: "fila-tasti" }, tasto, ferma), barra, stato);
}

function disegnaElenco(dove: HTMLElement, mappa: Mappa) {
  const aree = areeScaricate();
  dove.replaceChildren(el("h3", {}, "Aree scaricate"));
  if (!aree.length) { dove.append(el("p", {}, "Nessuna, per ora.")); return; }
  const lista = el("ul", { class: "elenco" });
  for (const a of aree) lista.append(voce(a, mappa, () => disegnaElenco(dove, mappa)));
  dove.append(lista);
}

function voce(a: Area, mappa: Mappa, ridisegna: () => void) {
  return el("li", {},
    el("div", { style: "font-weight:700" }, a.nome),
    el("div", { style: "font-size:13px;color:#4a5750" }, `${mb(a.byte)} · scaricata ${dataBreve(a.data)}`),
    el("div", { class: "fila-tasti" },
      el("button", { class: "tasto secondario piccolo", type: "button", onclick: () => {
        chiudiFoglio();
        mappa.fitBounds([[a.limiti[0], a.limiti[1]], [a.limiti[2], a.limiti[3]]], { padding: 20 });
      } }, icona(ICONE.mappa, 16), "Mostra"),
      el("button", { class: "tasto secondario piccolo", type: "button", onclick: async (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (!b.dataset.conferma) { b.dataset.conferma = "1"; b.textContent = "Tocca ancora per togliere"; return; }
        b.disabled = true; b.textContent = "Tolgo…";
        await togli(a);
        ridisegna();
      } }, icona(ICONE.chiudi, 16), "Togli")));
}

async function aggiornaSpazio(p: HTMLElement) {
  try {
    const [st, fisso] = await Promise.all([navigator.storage?.estimate(), navigator.storage?.persisted?.()]);
    if (st?.usage !== undefined) {
      p.textContent = `Spazio usato da Bolé su questo telefono: ${mb(st.usage)}.` +
        (fisso ? " Il telefono lo conserva." : " Se lo spazio scarseggia il telefono potrebbe cancellarlo: apri Bolé dall'icona per evitarlo.");
    }
  } catch { /* non disponibile */ }
}

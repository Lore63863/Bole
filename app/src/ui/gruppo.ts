/**
 * "Ritrovamenti con il gruppo": crea un gruppo o entra con un codice, e guarda che cosa c'è.
 * Le regole su che cosa esce dal telefono sono in dati/condivisione.ts (e sul server).
 */
import type { Map as Mappa } from "maplibre-gl";
import { diario } from "../dati/archivio";
import { SPECIE } from "../dati/catalogo";
import {
  aggiornatoIl, condivisione, inviaInCoda, leggiCodice, nuovoCodice, scaricaGruppo, segnalazioniAltrui, smettiDiCondividere, type Segnalazione,
} from "../dati/condivisione";
import { centroCella } from "../dati/griglia";
import { dataBreve, el, icona, ICONE } from "./dom";
import { apriFoglio, chiudiFoglio } from "./foglio";

const nomeSpecie = (id: string) => SPECIE.find((s) => s.id === id)?.nome ?? id;
const plurale = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`;

function regole() {
  return el("div", { class: "scheda" },
    el("h3", {}, "Come funziona"),
    el("ul", { class: "punti" },
      el("li", {}, "Vede e aggiunge ritrovamenti solo chi ha il codice del gruppo: dallo solo a chi vuoi."),
      el("li", {}, "Condividi un ritrovamento solo quando lo scegli tu (interruttore nel diario)."),
      el("li", {}, el("b", {}, "Escono solo: "), "specie, quantità, giorno e il quadrato di 1 km che contiene il punto."),
      el("li", {}, el("b", {}, "Non escono mai: "), "la tua posizione dal vivo, il punto preciso, l'ora, le foto, le note, le uscite a vuoto."),
      el("li", {}, "Gli altri lo vedono dal giorno dopo: nessuno può sapere dove sei adesso."),
      el("li", {}, "In un gruppo piccolo gli altri possono intuire che sei stato tu: condividi solo quello che ti va."),
      el("li", {}, "Le segnalazioni degli altri non sono verificate e non cambiano i colori della mappa."),
      el("li", {}, "Puoi togliere i tuoi in qualsiasi momento; dopo 3 anni si cancellano da sole.")),
    el("p", { class: "fonte" }, "Server: Cloudflare (piano gratuito), dati salvati nell'Unione europea. L'indirizzo IP passa da Cloudflare per far arrivare i dati, ma Bolé non lo salva. Niente account, niente nomi."));
}

async function condividiCodice(codice: string) {
  const testo = `Codice del gruppo Bolé: ${codice}\nIn Bolé: Strumenti → Ritrovamenti con il gruppo → Ho un codice.`;
  try {
    if (navigator.share) { await navigator.share({ text: testo }); return "Condiviso."; }
    await navigator.clipboard.writeText(codice);
    return "Codice copiato: incollalo in un messaggio.";
  } catch {
    return "";
  }
}

export async function apriGruppo(mappa: Mappa) {
  const corpo = apriFoglio("Ritrovamenti con il gruppo", "Condivisi con chi ha il codice", undefined, "mappa");
  const disegna = async () => {
    corpo.replaceChildren();
    if (!condivisione.disponibile()) {
      corpo.append(el("div", { class: "scheda" },
        el("p", {}, "La condivisione si accende quando l'app viene pubblicata e il suo piccolo server è attivo (Fase 5)."),
        el("p", { class: "fonte" }, "Fino ad allora tutto resta sul telefono.")), regole());
      return;
    }
    const codice = condivisione.gruppo();
    if (!codice) return disegnaSenzaGruppo();

    // --- dentro un gruppo ---
    const mostra = el("span", { class: "codice" }, `${codice.slice(0, 4)}-••••-••••`);
    const esitoCodice = el("p", { class: "fonte", "aria-live": "polite" });
    const voci = await diario.tutte();
    const mie = voci.filter((v) => v.condivisione && v.condivisione.gruppo === codice);
    const inCoda = mie.filter((v) => v.condivisione!.stato === "in coda").length;
    const errori = mie.filter((v) => v.condivisione!.stato === "errore");
    const altrui = await segnalazioniAltrui();
    const quando = aggiornatoIl();
    const settimana = new Date(Date.now() - 7 * 86_400_000).toLocaleDateString("sv-SE");
    const recenti = altrui.filter((s) => s.data >= settimana);
    const perSpecie = new Map<string, number>();
    for (const s of recenti) perSpecie.set(s.specie, (perSpecie.get(s.specie) ?? 0) + 1);
    const esito = el("p", { "aria-live": "polite", style: "font-size:13px" });
    const esci = el("button", { class: "tasto secondario piccolo", type: "button" }, "Esci dal gruppo");
    esci.addEventListener("click", async () => {
      if (!esci.dataset.conferma) {
        esci.dataset.conferma = "1";
        esci.textContent = "Tocca di nuovo per uscire";
        esci.after(togliTutti);
        return;
      }
      condivisione.esci();
      disegna();
    });
    const togliTutti = el("button", { class: "tasto secondario piccolo", type: "button" }, "Esci e togli i miei ritrovamenti");
    togliTutti.addEventListener("click", async () => {
      for (const v of mie) await smettiDiCondividere(v);
      await inviaInCoda();
      condivisione.esci();
      disegna();
    });
    corpo.append(
      el("div", { class: "scheda" },
        el("h3", {}, "Il tuo gruppo"),
        el("p", {}, "Codice: ", mostra, " ",
          el("button", { class: "tasto secondario piccolo", type: "button", onclick: () => { mostra.textContent = codice; } }, "Mostra")),
        el("div", { class: "fila-tasti compatta" },
          el("button", { class: "tasto piccolo", type: "button", onclick: async () => { esitoCodice.textContent = await condividiCodice(codice); } },
            icona(ICONE.naviga, 14), "Invia il codice agli amici"),
          esci),
        esitoCodice),
      el("div", { class: "scheda" },
        el("h3", {}, "Nel gruppo"),
        el("p", {}, altrui.length
          ? `${plurale(altrui.length, "segnalazione degli altri", "segnalazioni degli altri")}, ${recenti.length} negli ultimi 7 giorni.`
          : "Ancora nessuna segnalazione degli altri. Se il gruppo è nuovo è normale."),
        perSpecie.size ? el("ul", { class: "punti" }, ...[...perSpecie].sort((a, b) => b[1] - a[1]).map(([s, n]) => el("li", {}, `${nomeSpecie(s)}: ${n}`))) : null,
        el("p", { class: "fonte" }, quando ? `Aggiornato ${quando.toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : "Non ancora scaricato."),
        el("div", { class: "fila-tasti compatta" },
          el("button", { class: "tasto secondario piccolo", type: "button", onclick: async () => {
            esito.textContent = "Aggiorno…";
            const r = await scaricaGruppo();
            esito.textContent = r === "ok" ? "Aggiornato." : r === "senza rete" ? "Niente rete: resta l'ultima copia." : "Il server non risponde: riprova più tardi.";
            if (r === "ok") disegna();
          } }, "Aggiorna"),
          altrui.length ? el("button", { class: "tasto secondario piccolo", type: "button", onclick: () => vediSullaMappa(mappa, recenti.length ? recenti : altrui) },
            icona(ICONE.mappa, 14), "Vedi sulla mappa") : null),
        esito),
      el("div", { class: "scheda" },
        el("h3", {}, "I tuoi ritrovamenti condivisi"),
        el("p", {}, mie.length ? `${plurale(mie.length - inCoda - errori.length, "inviato", "inviati")}${inCoda ? `, ${inCoda} in coda (partono appena c'è rete)` : ""}.` : "Nessuno, per ora. Si sceglie voce per voce, nel diario."),
        errori.length ? el("div", { class: "avviso" }, icona(ICONE.avviso, 16), `${plurale(errori.length, "voce non inviata", "voci non inviate")}: ${errori[0].condivisione!.errore}.`) : null,
        inCoda ? el("button", { class: "tasto secondario piccolo", type: "button", onclick: async () => {
          const r = await inviaInCoda();
          esito.textContent = r.inCoda ? "Ancora niente rete: riprovo da solo più tardi." : "Inviati.";
          disegna();
        } }, "Invia ora") : null),
      regole());
  };

  const disegnaSenzaGruppo = () => {
    const campo = el("input", { type: "text", inputmode: "text", autocapitalize: "characters", autocomplete: "off", spellcheck: "false",
      placeholder: "XXXX-XXXX-XXXX", maxlength: 16, "aria-label": "Codice del gruppo" });
    const esito = el("p", { "aria-live": "polite" });
    const nuovo = el("div");
    corpo.append(
      el("div", { class: "scheda" },
        el("h3", {}, "Ho un codice"),
        el("label", { class: "campo" }, "Codice del gruppo (12 caratteri)", campo),
        el("div", { class: "fila-tasti" }, el("button", { class: "tasto", type: "button", onclick: async () => {
          const c = leggiCodice(campo.value);
          if (!c) { esito.textContent = "Codice sbagliato: controlla le lettere (non ci sono 0, 1, I, L, O)."; return; }
          condivisione.entra(c);
          await scaricaGruppo();
          disegna();
        } }, "Entra nel gruppo")),
        esito),
      el("div", { class: "scheda" },
        el("h3", {}, "Nuovo gruppo"),
        el("p", {}, "Crea un codice e mandalo agli amici con cui vuoi condividere."),
        nuovo,
        el("div", { class: "fila-tasti" }, el("button", { class: "tasto secondario", type: "button", onclick: () => {
          const c = nuovoCodice();
          const esitoCodice = el("p", { class: "fonte", "aria-live": "polite" });
          nuovo.replaceChildren(
            el("p", {}, "Codice: ", el("span", { class: "codice" }, c)),
            el("div", { class: "fila-tasti compatta" },
              el("button", { class: "tasto piccolo", type: "button", onclick: () => { condivisione.entra(c); disegna(); } }, "Usa questo gruppo"),
              el("button", { class: "tasto secondario piccolo", type: "button", onclick: async () => { esitoCodice.textContent = await condividiCodice(c); } }, "Invia agli amici")),
            esitoCodice);
        } }, "Crea un gruppo"))),
      regole());
  };

  await disegna();
}

/** Inquadra sulla mappa i quadrati delle segnalazioni. */
function vediSullaMappa(mappa: Mappa, s: Segnalazione[]) {
  const c = s.map((x) => centroCella(x.cella)).filter((x): x is [number, number] => !!x);
  chiudiFoglio();
  if (!c.length) return;
  const o = Math.min(...c.map((x) => x[0])), e = Math.max(...c.map((x) => x[0]));
  const su = Math.min(...c.map((x) => x[1])), n = Math.max(...c.map((x) => x[1]));
  mappa.fitBounds([[o - 0.02, su - 0.015], [e + 0.02, n + 0.015]], { padding: 40, maxZoom: 13.5, duration: 400 });
}

/** Elenco delle segnalazioni del gruppo in un quadrato di 1 km. */
export async function apriCellaGruppo(mappa: Mappa, cella: string) {
  const tutte = (await segnalazioniAltrui()).filter((s) => s.cella === cella).sort((a, b) => b.data.localeCompare(a.data));
  const corpo = apriFoglio("Segnalazioni del gruppo", "In questo quadrato di 1 km", undefined, "mappa");
  corpo.append(el("div", { class: "scheda" },
    elencoSegnalazioni(tutte),
    el("p", { class: "fonte" }, "Non verificate. Il punto vero può essere ovunque nel quadrato: non è un consiglio su dove cercare.")),
  el("div", { class: "fila-tasti" }, el("button", { class: "tasto secondario", type: "button", onclick: () => {
    const c = centroCella(cella);
    chiudiFoglio();
    if (c) mappa.flyTo({ center: c, zoom: Math.max(mappa.getZoom(), 13.5) });
  } }, icona(ICONE.mappa, 18), "Sulla mappa")));
}

export function elencoSegnalazioni(s: Segnalazione[]) {
  return el("ul", { class: "elenco" }, ...s.map((x) => el("li", {},
    el("b", {}, nomeSpecie(x.specie)), el("span", { style: "font-size:13px;color:#4a5750" }, ` · ${dataBreve(x.data)}${x.quantita ? ` · ${x.quantita}` : ""}`))));
}

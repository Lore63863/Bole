/**
 * Diario privato: ritrovamenti e uscite a vuoto, con foto facoltativa.
 * Tutto resta sul telefono; se sei in un gruppo puoi condividere un ritrovamento (solo specie,
 * quantità, giorno e quadrato di 1 km: vedi dati/condivisione.ts).
 * Con ogni voce si salva anche che cosa diceva la mappa quel giorno in quel punto (istantanea):
 * da qui le statistiche e, più avanti, la taratura del modello con i tuoi dati.
 * Esportazione in GPX, CSV, GeoJSON e copia di sicurezza su file.
 */
import { istantanea } from "../calcolo/istantanea";
import { COLORI_CLASSI, NOMI_CLASSI } from "../calcolo/formule";
import { SPECIE, nomeScelta } from "../dati/catalogo";
import { diario, nuovoId, chiediPersistenza, type Voce } from "../dati/archivio";
import { condivisibile, condividi, condivisione, inviaInCoda, ricordaDaTogliere, smettiDiCondividere } from "../dati/condivisione";
import { contesto } from "../dati/contesto";
import { scegliPunto } from "../mappa/punti";
import { aggiungi, dataBreve, el, icona, ICONE } from "./dom";
import { apriFoglio, chiudiFoglio } from "./foglio";
import { linkNaviga } from "./naviga";
import { apriPercheQui } from "./perchequi";
import { stato } from "./stato";

const nomeSpecie = (id?: string) => SPECIE.find((s) => s.id === id)?.nome ?? id ?? "";
const QUANTITA: Record<string, string> = { pochi: "pochi", abbastanza: "abbastanza", tanti: "tanti" };
const attesa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

function oggiLocale() {
  const d = new Date();
  return { data: d.toLocaleDateString("sv-SE"), ora: d.toTimeString().slice(0, 5) };
}

export function chipClasse(cl: number, piccolo = false) {
  return el("span", {
    class: "chip-classe",
    style: `background:${cl ? COLORI_CLASSI[cl - 1] : "#eef0ec"};color:${cl >= 4 ? "#fff" : "#14211b"}${piccolo ? ";font-size:12px;padding:1px 8px" : ""}`,
  }, cl ? NOMI_CLASSI[cl] : "nessun habitat");
}

/** "Quel giorno la mappa diceva…" in parole. */
function fraseIstantanea(v: Voce) {
  const i = v.istantanea;
  if (!i) {
    return el("p", { class: "fonte" }, "Classe della mappa non salvata: il meteo di quel giorno non c'era più sul telefono. Si ricalcola nella prossima taratura.");
  }
  return el("p", {}, `Quel giorno, qui, la mappa diceva per ${nomeScelta(i.specie).toLowerCase()}: `, chipClasse(i.classe),
    el("span", { class: "fonte" }, ` affidabilità ${i.affidabilita}`));
}

function statoCondivisione(v: Voce) {
  const c = v.condivisione;
  if (!c) return "Non condiviso: resta solo sul telefono.";
  if (c.stato === "inviato") return `Condiviso col gruppo: gli altri lo vedono dal ${dataBreve(c.visibileDal ?? v.data)}, come quadrato di 1 km.`;
  if (c.stato === "errore") return `Non inviato: ${c.errore ?? "errore"}.`;
  return "In coda per il gruppo: parte appena c'è rete; gli altri lo vedranno dal giorno dopo.";
}

// --- nuova voce ---------------------------------------------------------------------------------
interface Posizione { lon: number; lat: number; precisione?: number; origine: "gps" | "mappa" }

/**
 * Modulo per una nuova voce. La posizione è il punto dato (pressione lunga o "Segna nel diario")
 * oppure, se manca, il GPS: si tiene la lettura più precisa dei primi 25 secondi.
 * "Sposta il punto" apre il mirino sulla mappa.
 */
export async function nuovoRitrovamento(lon?: number, lat?: number, origine: "gps" | "mappa" = "mappa") {
  let sorveglia: number | null = null, scadenza: number | undefined;
  const fermaGPS = () => {
    if (sorveglia !== null) navigator.geolocation.clearWatch(sorveglia);
    sorveglia = null;
    clearTimeout(scadenza);
  };
  const corpo = apriFoglio("Nuova voce del diario", "Resta su questo telefono", fermaGPS, "diario");
  const { data, ora } = oggiLocale();
  const tipo = el("select", {}, el("option", { value: "ritrovamento" }, "Ritrovamento"), el("option", { value: "a vuoto" }, "Uscita a vuoto"));
  const specie = el("select", {}, el("option", { value: "" }, "—"), ...SPECIE.map((s) => el("option", { value: s.id }, s.nome)));
  const quantita = el("select", {}, el("option", { value: "" }, "—"), el("option", { value: "pochi" }, "Pochi"),
    el("option", { value: "abbastanza" }, "Abbastanza"), el("option", { value: "tanti" }, "Tanti"));
  const giorno = el("input", { type: "date", value: data, max: data });
  const orario = el("input", { type: "time", value: ora });
  const note = el("textarea", { rows: 3, maxlength: 1000 });
  const foto = el("input", { type: "file", accept: "image/*", class: "nascosto" });
  const nomeFoto = el("span", { class: "fonte" }, "nessuna");
  foto.addEventListener("change", () => { nomeFoto.textContent = foto.files?.[0] ? "foto scelta ✓" : "nessuna"; });

  // --- posizione ---
  let pos: Posizione | null = lon !== undefined && lat !== undefined ? { lon, lat, origine } : null;
  let gps: Posizione | null = null;
  let migliora = false;
  const testoPos = el("p", { style: "font-size:13px;margin:4px 0", "aria-live": "polite" });
  const avvisoPos = el("div");
  const tastoGPS = el("button", { class: "tasto secondario piccolo", type: "button" }, icona(ICONE.posizione, 16), "Usa il GPS");
  const tastoSposta = el("button", { class: "tasto secondario piccolo", type: "button" }, icona(ICONE.vicino, 16), "Sposta il punto");
  const scriviPos = () => {
    avvisoPos.replaceChildren();
    if (!pos) {
      testoPos.textContent = sorveglia !== null ? "Posizione: aspetto il GPS…" : "Posizione non disponibile: tocca «Sposta il punto» e scegli il punto sulla mappa.";
    } else if (pos.origine === "gps") {
      testoPos.textContent = `Posizione GPS: ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)} · ± ${Math.round(pos.precisione ?? 0)} m${migliora ? " (sto migliorando la precisione…)" : ""}`;
      if ((pos.precisione ?? 0) > 50) avvisoPos.append(el("div", { class: "avviso" }, icona(ICONE.avviso, 16), "Precisione scarsa: aspetta qualche secondo all'aperto, o sposta il punto a mano."));
    } else {
      testoPos.textContent = `Punto scelto sulla mappa: ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}`;
    }
    tastoGPS.classList.toggle("nascosto", pos?.origine !== "mappa" || !navigator.geolocation);
    aggiornaAnteprima();
  };
  const avviaGPS = () => {
    if (!navigator.geolocation) { scriviPos(); return; }
    fermaGPS();
    migliora = true;
    sorveglia = navigator.geolocation.watchPosition((p) => {
      const nuova: Posizione = { lon: +p.coords.longitude.toFixed(6), lat: +p.coords.latitude.toFixed(6), precisione: p.coords.accuracy, origine: "gps" };
      if (!gps || (nuova.precisione ?? 999) <= (gps.precisione ?? 999)) gps = nuova;
      if (!pos || pos.origine === "gps") pos = gps;
      if ((gps.precisione ?? 999) <= 8) { migliora = false; fermaGPS(); }
      scriviPos();
    }, () => { migliora = false; fermaGPS(); scriviPos(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    scadenza = window.setTimeout(() => { migliora = false; fermaGPS(); scriviPos(); }, 25000);
    scriviPos();
  };
  tastoGPS.addEventListener("click", () => { pos = gps; avviaGPS(); });
  tastoSposta.addEventListener("click", async () => {
    const mappa = contesto.mappa;
    if (!mappa) return;
    const c = mappa.getCenter();
    const scelto = await scegliPunto(mappa, pos ?? { lon: c.lng, lat: c.lat }, gps);
    if (scelto) { fermaGPS(); migliora = false; pos = { ...scelto, origine: "mappa" }; }
    scriviPos();
  });

  // --- condivisione ---
  const condividiSi = el("input", { type: "checkbox" });
  const anteprima = el("p", { class: "fonte" });
  function aggiornaAnteprima() {
    const v = { tipo: tipo.value as Voce["tipo"], specie: specie.value || undefined };
    condividiSi.disabled = !condivisibile(v);
    if (condividiSi.disabled) condividiSi.checked = false;
    anteprima.textContent = !condivisibile(v)
      ? "Si possono condividere solo i ritrovamenti con la specie. Le uscite a vuoto restano tue."
      : `Gli altri vedranno: ${nomeSpecie(specie.value)}${quantita.value ? ` · ${quantita.value}` : ""} · ${dataBreve(giorno.value || data)} · un quadrato di 1 km, non il punto. Dal giorno dopo. Foto e note restano qui.`;
  }
  const bloccoGruppo = !condivisione.disponibile() ? null
    : condivisione.gruppo()
      ? el("div", { class: "scheda", style: "margin:8px 0 0" },
        el("label", { class: "interruttore" }, el("span", {}, el("b", {}, "Condividi con il gruppo")), condividiSi), anteprima)
      : el("p", { class: "fonte" }, "Per condividere con gli amici: Strumenti → Ritrovamenti con il gruppo.");

  const aggiornaCampi = () => { quantita.disabled = tipo.value === "a vuoto"; aggiornaAnteprima(); };
  for (const c of [tipo, specie, quantita, giorno]) c.addEventListener("change", aggiornaCampi);

  const esito = el("p", { "aria-live": "polite" });
  const salva = el("button", { class: "tasto", type: "button" }, "Salva");
  salva.addEventListener("click", async () => {
    if (!pos) { esito.textContent = "Manca la posizione: aspetta il GPS o tocca «Sposta il punto»."; return; }
    salva.disabled = true;
    fermaGPS();
    let v: Voce = {
      id: nuovoId(), tipo: tipo.value as Voce["tipo"], data: giorno.value || data, ora: orario.value || undefined,
      lat: +pos.lat.toFixed(6), lon: +pos.lon.toFixed(6),
      precisione: pos.origine === "gps" && pos.precisione !== undefined ? Math.round(pos.precisione) : undefined, origine: pos.origine,
      specie: specie.value || undefined,
      quantita: tipo.value === "a vuoto" ? undefined : (quantita.value || undefined) as Voce["quantita"],
      note: note.value.trim() || undefined, foto: foto.files?.[0],
    };
    v.istantanea = await istantanea(v.lon, v.lat, v.specie || stato.scelta, v.data).catch(() => undefined);
    await diario.salva(v);
    if (condividiSi.checked) {
      v = await condividi(v);
      await Promise.race([inviaInCoda(), attesa(6000)]);
      v = (await diario.una(v.id)) ?? v;
    }
    await chiediPersistenza();
    risultato(corpo, v);
  });

  aggiungiCampi();
  function aggiungiCampi() {
    corpo.append(el("div", { class: "scheda" },
      el("label", { class: "campo" }, "Che cosa", tipo),
      el("label", { class: "campo" }, "Specie (cercata o trovata)", specie),
      el("label", { class: "campo" }, "Quantità indicativa", quantita),
      el("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px" },
        el("label", { class: "campo" }, "Giorno", giorno), el("label", { class: "campo" }, "Ora", orario)),
      testoPos, avvisoPos,
      el("div", { class: "fila-tasti compatta" }, tastoSposta, tastoGPS),
      el("div", { class: "campo" }, "Foto (facoltativa)",
        el("div", { style: "display:flex;align-items:center;gap:10px" },
          el("label", { class: "tasto secondario piccolo" }, "Scatta o scegli", foto), nomeFoto)),
      el("label", { class: "campo" }, "Note", note),
      bloccoGruppo,
      el("div", { class: "fila-tasti" }, salva),
      esito));
  }
  if (!pos) avviaGPS(); else scriviPos();
}

/** Dopo il salvataggio: che cosa diceva la mappa e dove è finita la voce. */
function risultato(corpo: HTMLElement, v: Voce) {
  corpo.replaceChildren(el("div", { class: "scheda" },
    el("h3", {}, "Salvato nel diario."),
    el("p", {}, `${v.tipo === "a vuoto" ? "Uscita a vuoto" : nomeSpecie(v.specie) || "Ritrovamento"} · ${dataBreve(v.data)}` +
      (v.precisione !== undefined ? ` · posizione GPS ± ${v.precisione} m` : v.origine === "mappa" ? " · punto scelto sulla mappa" : "")),
    fraseIstantanea(v),
    condivisione.disponibile() && condivisione.gruppo() ? seguiCondivisione(v) : null,
    el("div", { class: "fila-tasti" },
      el("button", { class: "tasto", type: "button", onclick: () => { chiudiFoglio(); contesto.mappa?.flyTo({ center: [v.lon, v.lat], zoom: Math.max(contesto.mappa.getZoom(), 14) }); } },
        icona(ICONE.mappa, 18), "Vedi sulla mappa"),
      el("button", { class: "tasto secondario", type: "button", onclick: () => nuovoRitrovamento() }, icona(ICONE.diario, 18), "Nuova voce"))));
}

/** Riga con lo stato della condivisione che si aggiorna da sola (in coda → inviato). */
function seguiCondivisione(v: Voce) {
  const riga = el("p", { style: "font-size:13px", "aria-live": "polite" }, statoCondivisione(v));
  const aggiorna = async () => {
    if (!riga.isConnected) { window.removeEventListener("bole:punti", aggiorna); return; }
    const nuova = await diario.una(v.id);
    if (nuova) riga.textContent = statoCondivisione(nuova);
  };
  window.addEventListener("bole:punti", aggiorna);
  return riga;
}

// --- una voce -------------------------------------------------------------------------------------
export async function apriVoce(id: string) {
  const v = await diario.una(id);
  if (!v) return;
  const titolo = v.tipo === "a vuoto" ? `A vuoto${v.specie ? ` (${nomeSpecie(v.specie)})` : ""}` : nomeSpecie(v.specie) || "Ritrovamento";
  const corpo = apriFoglio(titolo, `${dataBreve(v.data)}${v.ora ? ` alle ${v.ora}` : ""}`, undefined, "diario");
  const disegna = (v: Voce) => {
    const tastoCondividi = !condivisione.disponibile() ? null
      : v.condivisione
        ? el("button", { class: "tasto secondario piccolo", type: "button", onclick: async () => disegna(await smettiDiCondividere(v)) }, "Togli dal gruppo")
        : condivisione.gruppo() && condivisibile(v)
          ? el("button", { class: "tasto secondario piccolo", type: "button", onclick: async () => {
            await condividi(v);
            await Promise.race([inviaInCoda(), attesa(6000)]);
            disegna((await diario.una(v.id)) ?? v);
          } }, "Condividi col gruppo")
          : null;
    const cancella = el("button", { class: "tasto secondario piccolo", type: "button", style: "color:#9b1c1c;border-color:#e0a3a3" }, "Cancella la voce");
    cancella.addEventListener("click", async () => {
      if (!cancella.dataset.conferma) { cancella.dataset.conferma = "1"; cancella.textContent = "Tocca di nuovo per cancellare"; return; }
      ricordaDaTogliere(v);
      await diario.togli(v.id);
      apriDiario();
    });
    corpo.replaceChildren();
    aggiungi(corpo, [
      el("div", { class: "scheda" },
        el("dl", { class: "valori" },
          v.quantita ? [el("dt", {}, "Quantità"), el("dd", {}, QUANTITA[v.quantita] ?? v.quantita)] : null,
          el("dt", {}, "Punto"), el("dd", {}, `${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}`),
          el("dt", {}, "Da dove"), el("dd", {}, v.precisione !== undefined ? `GPS, ± ${v.precisione} m` : v.origine === "mappa" ? "scelto sulla mappa" : "—"),
          v.istantanea ? [el("dt", {}, "Habitat quel giorno"), el("dd", {}, `${v.istantanea.habitat}/100`)] : null),
        fraseIstantanea(v),
        v.note ? el("p", {}, v.note) : null,
        v.foto ? el("img", { src: URL.createObjectURL(v.foto), alt: "Foto", style: "width:100%;max-height:260px;object-fit:cover;border-radius:10px;margin-top:6px" }) : null),
      condivisione.disponibile() ? el("div", { class: "scheda" }, el("h3", {}, "Gruppo"), seguiCondivisione(v),
        el("div", { class: "fila-tasti compatta" }, tastoCondividi)) : null,
      el("div", { class: "fila-tasti compatta" },
        el("button", { class: "tasto secondario piccolo", type: "button", onclick: () => { chiudiFoglio(); contesto.mappa?.flyTo({ center: [v.lon, v.lat], zoom: Math.max(contesto.mappa.getZoom(), 15) }); } }, "Mappa"),
        contesto.mappa && contesto.meteo ? el("button", { class: "tasto secondario piccolo", type: "button", onclick: () => apriPercheQui(contesto.mappa!, contesto.meteo!, v.lon, v.lat) }, "Perché qui?") : null,
        ...linkNaviga(v.lat, v.lon)),
      el("div", { class: "fila-tasti" }, cancella)]);
  };
  disegna(v);
}

// --- elenco e statistiche ---------------------------------------------------------------------------
export async function apriDiario() {
  const corpo = apriFoglio("Diario", "Privato: resta su questo telefono", undefined, "diario");
  const voci = await diario.tutte();
  corpo.append(
    el("div", { class: "fila-tasti", style: "margin:0 0 12px" },
      el("button", { class: "tasto", type: "button", onclick: () => nuovoRitrovamento() }, icona(ICONE.diario, 18), "Nuova voce"),
      el("button", { class: "tasto secondario", type: "button", onclick: () => apriEsporta(voci) }, icona(ICONE.scarica, 18), "Esporta o salva")),
  );
  if (!voci.length) {
    corpo.append(el("div", { class: "scheda" },
      el("p", {}, "Ancora niente. Segna anche le uscite a vuoto: col tempo aiutano a capire le tue zone."),
      el("p", { class: "fonte" }, "Puoi segnare un punto anche tenendo premuto il dito sulla mappa.")));
    return;
  }
  const lista = el("ul", { class: "elenco" });
  for (const v of voci) {
    lista.append(el("li", {}, el("button", { class: "riga-voce", type: "button", onclick: () => apriVoce(v.id) },
      el("span", { class: "testo" },
        el("b", {}, v.tipo === "a vuoto" ? `A vuoto${v.specie ? ` (${nomeSpecie(v.specie)})` : ""}` : nomeSpecie(v.specie) || "Ritrovamento"),
        el("small", {}, `${dataBreve(v.data)}${v.ora ? ` ${v.ora}` : ""}${v.quantita ? ` · ${v.quantita}` : ""}${v.condivisione ? " · nel gruppo" : ""}`)),
      v.istantanea ? chipClasse(v.istantanea.classe, true) : null,
      icona(ICONE.freccia, 16))));
  }
  corpo.append(el("div", { class: "scheda" }, el("h3", {}, "Le tue voci"), lista,
    el("p", { class: "fonte" }, "Tocca una voce per vederla sulla mappa, condividerla o cancellarla. A destra: la classe della mappa quel giorno.")),
    statistiche(voci));
}

const MESI = ["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"];
const NOMI_MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Riquadro delle statistiche: specie, mesi e classe della mappa al momento di ritrovamenti e uscite a vuoto. */
export function statistiche(voci: Voce[]) {
  const trovati = voci.filter((v) => v.tipo === "ritrovamento");
  const vuote = voci.filter((v) => v.tipo === "a vuoto");
  // chiuse di partenza: un tocco le apre (le voci, che servono di più, stanno sopra)
  const scheda = el("details", { class: "scheda sezione statistiche" },
    el("summary", {}, el("span", {}, el("h3", {}, "Le tue statistiche"),
      el("small", { class: "piccolo" }, `${trovati.length} ${trovati.length === 1 ? "ritrovamento" : "ritrovamenti"} · ${vuote.length} ${vuote.length === 1 ? "uscita a vuoto" : "uscite a vuoto"}`))));
  if (!trovati.length && !vuote.length) return scheda;

  // per specie
  const perSpecie = new Map<string, number>();
  for (const v of trovati) perSpecie.set(nomeSpecie(v.specie) || "senza specie", (perSpecie.get(nomeSpecie(v.specie) || "senza specie") ?? 0) + 1);
  const specie = [...perSpecie].sort((a, b) => b[1] - a[1]);
  if (specie.length) {
    const max = specie[0][1];
    scheda.append(el("h4", {}, "Per specie"), el("div", { class: "barre-orizzontali" }, ...specie.slice(0, 8).flatMap(([nome, n]) => [
      el("span", {}, nome), el("span", { class: "barra" }, el("span", { style: `width:${Math.max(4, (n / max) * 100)}%` })), el("b", {}, String(n))])));
  }

  // per mese
  if (trovati.length) {
    const perMese = MESI.map(() => 0);
    for (const v of trovati) perMese[Number(v.data.slice(5, 7)) - 1]++;
    const max = Math.max(...perMese);
    scheda.append(el("h4", {}, "Per mese (tutti gli anni)"),
      el("div", { class: "mesi", role: "img", "aria-label": perMese.map((n, i) => `${NOMI_MESI[i]} ${n}`).join(", ") },
        ...perMese.map((n, i) => el("div", {},
          el("small", {}, n ? String(n) : ""),
          el("span", { class: "colonna" }, el("span", { style: `height:${n ? Math.max(8, (n / max) * 100) : 0}%` })),
          el("small", {}, MESI[i])))));
  }

  // classe della mappa nel giorno della voce
  const riga = (nome: string, gruppo: Voce[]) => {
    const conta = [0, 0, 0, 0, 0, 0];
    const con = gruppo.filter((v) => v.istantanea);
    for (const v of con) conta[v.istantanea!.classe]++;
    if (!con.length) return null;
    return el("div", { class: "riga-classi" },
      el("span", { class: "nome" }, `${nome} (${con.length})`),
      el("div", { class: "celle" }, ...conta.map((n, cl) => el("span", {
        title: `${cl ? NOMI_CLASSI[cl] : "nessun habitat"}: ${n}`,
        style: `background:${cl ? COLORI_CLASSI[cl - 1] : "#eef0ec"};color:${cl >= 4 ? "#fff" : "#14211b"};opacity:${n ? 1 : 0.35}`,
      }, String(n)))));
  };
  const rTrov = riga("Ritrovamenti", trovati), rVuote = riga("A vuoto", vuote);
  if (rTrov || rVuote) {
    const con = trovati.filter((v) => v.istantanea);
    const buoni = con.filter((v) => v.istantanea!.classe >= 3).length;
    aggiungi(scheda, [el("h4", {}, "Che cosa diceva la mappa quel giorno"),
      el("div", { class: "legenda-classi" }, el("span", {}, "nessuno"), ...NOMI_CLASSI.slice(1).map((n) => el("span", {}, n))),
      rTrov, rVuote,
      con.length ? el("p", { style: "font-size:13px" }, `${buoni} ritrovamenti su ${con.length} erano in classe «media» o più.`) : null,
      el("p", { class: "fonte" }, "Il confronto con le uscite a vuoto dice se la mappa ti aiuta: segna anche quelle. Con pochi dati i numeri ballano.")]);
  }
  return scheda;
}

// --- esportazione e importazione ------------------------------------------------------------------
function scaricaFile(nome: string, contenuto: Blob) {
  const a = el("a", { href: URL.createObjectURL(contenuto), download: nome });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const classeInParole = (v: Voce) => (v.istantanea ? `mappa: ${v.istantanea.classe ? NOMI_CLASSI[v.istantanea.classe] : "nessun habitat"}` : "");

export function versoGPX(voci: Voce[]): string {
  const punti = voci.map((v) =>
    `  <wpt lat="${v.lat}" lon="${v.lon}"><time>${v.data}T${v.ora ?? "12:00"}:00</time><name>${xml(v.tipo === "a vuoto" ? "A vuoto" : nomeSpecie(v.specie) || "Ritrovamento")}</name>` +
    `<desc>${xml([v.tipo, nomeSpecie(v.specie), v.quantita, classeInParole(v), v.note].filter(Boolean).join(" - "))}</desc></wpt>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Bolé" xmlns="http://www.topografix.com/GPX/1/1">\n${punti}\n</gpx>\n`;
}

export function versoCSV(voci: Voce[]): string {
  const c = (s?: string | number) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  return ["tipo,data,ora,lat,lon,specie,quantita,note,precisione_m,origine,classe_mappa,indice_mappa", ...voci.map((v) =>
    [v.tipo, v.data, v.ora, v.lat, v.lon, nomeSpecie(v.specie), v.quantita, v.note, v.precisione, v.origine,
      v.istantanea?.classe, v.istantanea?.indice].map(c).join(","))].join("\n") + "\n";
}

export function versoGeoJSON(voci: Voce[]): string {
  return JSON.stringify({ type: "FeatureCollection", features: voci.map((v) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [v.lon, v.lat] },
    properties: { tipo: v.tipo, data: v.data, ora: v.ora ?? null, specie: v.specie ?? null, quantita: v.quantita ?? null, note: v.note ?? null,
      precisione_m: v.precisione ?? null, origine: v.origine ?? null, istantanea: v.istantanea ?? null },
  })) }, null, 1);
}

async function fotoInTesto(b?: Blob) {
  if (!b) return undefined;
  return await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); });
}

function apriEsporta(voci: Voce[]) {
  const corpo = apriFoglio("Esporta o salva il diario", "", undefined, "diario");
  const stamp = new Date().toLocaleDateString("sv-SE");
  const importa = el("input", { type: "file", accept: ".json,.geojson,.gpx,.csv,application/json" });
  const esito = el("p", { "aria-live": "polite" });
  importa.addEventListener("change", async () => {
    const f = importa.files?.[0];
    if (!f) return;
    const n = await importaFile(await f.text(), f.name);
    esito.textContent = `${n} voci importate.`;
  });
  corpo.append(
    el("div", { class: "scheda" },
      el("h3", {}, "Esporta"),
      el("p", {}, "Per altre app di mappe o per un foglio di calcolo. Le foto non sono incluse."),
      el("div", { class: "avviso" }, icona(ICONE.avviso, 16), "Questi file hanno i punti precisi dei tuoi ritrovamenti: mandali solo a chi vuoi che li conosca."),
      el("div", { class: "fila-tasti" },
        el("button", { class: "tasto secondario", type: "button", onclick: () => scaricaFile(`bole-diario-${stamp}.gpx`, new Blob([versoGPX(voci)], { type: "application/gpx+xml" })) }, "GPX"),
        el("button", { class: "tasto secondario", type: "button", onclick: () => scaricaFile(`bole-diario-${stamp}.csv`, new Blob([versoCSV(voci)], { type: "text/csv" })) }, "CSV"),
        el("button", { class: "tasto secondario", type: "button", onclick: () => scaricaFile(`bole-diario-${stamp}.geojson`, new Blob([versoGeoJSON(voci)], { type: "application/geo+json" })) }, "GeoJSON"))),
    el("div", { class: "scheda" },
      el("h3", {}, "Copia di sicurezza"),
      el("p", {}, "Un file con tutto il diario, foto comprese. Salvalo in File → iCloud Drive: se cambi telefono o cancelli l'app, lo reimporti da qui."),
      el("button", { class: "tasto", type: "button", onclick: async () => {
        const tutto = await Promise.all(voci.map(async (v) => ({ ...v, foto: await fotoInTesto(v.foto) })));
        scaricaFile(`bole-copia-${stamp}.json`, new Blob([JSON.stringify({ bole: 1, voci: tutto })], { type: "application/json" }));
      } }, icona(ICONE.scarica, 18), "Salva la copia")),
    el("div", { class: "scheda" },
      el("h3", {}, "Importa"),
      el("p", {}, "Da una copia di sicurezza di Bolé, o da un file GPX, CSV o GeoJSON."),
      importa, esito));
}

async function importaFile(testo: string, nome: string): Promise<number> {
  const voci: Voce[] = [];
  const conId = (v: Omit<Voce, "id">): Voce => ({ ...v, id: nuovoId() });
  const numero = (s: unknown) => (s === null || s === undefined || s === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));
  if (nome.endsWith(".gpx")) {
    const doc = new DOMParser().parseFromString(testo, "application/xml");
    doc.querySelectorAll("wpt").forEach((w) => {
      const t = w.querySelector("time")?.textContent ?? "";
      voci.push(conId({ tipo: "ritrovamento", lat: +w.getAttribute("lat")!, lon: +w.getAttribute("lon")!, data: t.slice(0, 10) || new Date().toLocaleDateString("sv-SE"),
        ora: t.slice(11, 16) || undefined, note: w.querySelector("name")?.textContent ?? undefined }));
    });
  } else if (nome.endsWith(".csv")) {
    const righe = testo.trim().split(/\r?\n/).slice(1);
    for (const r of righe) {
      const c = [...r.matchAll(/"((?:[^"]|"")*)"|([^,]+)|(?<=,)(?=,|$)/g)].map((m) => (m[1] ?? m[2] ?? "").replace(/""/g, '"'));
      const sp = SPECIE.find((s) => s.nome === c[5])?.id ?? (c[5] || undefined);
      if (c.length >= 5) voci.push(conId({ tipo: c[0] === "a vuoto" ? "a vuoto" : "ritrovamento", data: c[1], ora: c[2] || undefined, lat: +c[3], lon: +c[4],
        specie: sp, quantita: (c[6] || undefined) as Voce["quantita"], note: c[7] || undefined, precisione: numero(c[8]),
        origine: c[9] === "gps" || c[9] === "mappa" ? c[9] : undefined }));
    }
  } else {
    const j = JSON.parse(testo);
    if (j.bole && Array.isArray(j.voci)) {
      for (const v of j.voci) {
        // la foto si legge solo se è dentro al file (data:image/…): mai un indirizzo esterno da scaricare
        const foto = typeof v.foto === "string" && /^data:image\/(jpeg|png|webp|heic);base64,/.test(v.foto)
          ? await (await fetch(v.foto)).blob() : undefined;
        voci.push({ ...v, foto });
      }
    } else if (j.type === "FeatureCollection") {
      for (const f of j.features) voci.push(conId({ tipo: f.properties?.tipo === "a vuoto" ? "a vuoto" : "ritrovamento",
        lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], data: f.properties?.data ?? new Date().toLocaleDateString("sv-SE"),
        ora: f.properties?.ora ?? undefined, specie: f.properties?.specie ?? undefined, quantita: f.properties?.quantita ?? undefined, note: f.properties?.note ?? undefined,
        precisione: numero(f.properties?.precisione_m), origine: f.properties?.origine ?? undefined, istantanea: f.properties?.istantanea ?? undefined }));
    }
  }
  let n = 0;
  for (const v of voci) {
    const voce = pulisci(v);
    if (!voce) continue;
    // stesso id = stessa voce (un backup rimesso non la raddoppia); id strani: nuovo id
    if (typeof v.id === "string" && /^[a-z0-9-]{3,40}$/.test(v.id)) voce.id = v.id;
    if (v.foto instanceof Blob) voce.foto = v.foto;
    await diario.salva(voce);
    n++;
  }
  return n;
}

/**
 * Da un file importato si tengono solo i campi del diario, con il tipo giusto e una lunghezza ragionevole.
 * La condivisione col gruppo non si importa mai: va scelta di nuovo, voce per voce.
 */
function pulisci(v: Record<string, unknown> | Voce): Voce | null {
  const x = v as Record<string, unknown>;
  const lat = Number(x.lat), lon = Number(x.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const testo = (t: unknown, max: number) => (typeof t === "string" && t.trim() ? t.slice(0, max) : undefined);
  const data = typeof x.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.data) ? x.data : new Date().toLocaleDateString("sv-SE");
  const ist = x.istantanea as Record<string, unknown> | undefined;
  const numero = (n: unknown) => (n === null || n === undefined || n === "" || !Number.isFinite(Number(n)) ? undefined : Number(n));
  return {
    id: nuovoId(),
    tipo: x.tipo === "a vuoto" ? "a vuoto" : "ritrovamento",
    data, lat, lon,
    ora: typeof x.ora === "string" && /^\d{2}:\d{2}$/.test(x.ora) ? x.ora : undefined,
    precisione: numero(x.precisione),
    origine: x.origine === "gps" || x.origine === "mappa" ? x.origine : undefined,
    specie: testo(x.specie, 60),
    quantita: x.quantita === "pochi" || x.quantita === "abbastanza" || x.quantita === "tanti" ? x.quantita : undefined,
    note: testo(x.note, 2000),
    istantanea: ist && typeof ist === "object" && Number.isInteger(ist.classe) ? (ist as unknown as Voce["istantanea"]) : undefined,
  };
}

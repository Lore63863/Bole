/**
 * In bosco: posizione, bussola, "torna all'auto" e tramonto con avviso 60 minuti prima.
 * Funziona anche senza rete (il GPS non ha bisogno di internet). Niente esce dal telefono.
 */
import type { Map as Mappa } from "maplibre-gl";
import { punto } from "../calcolo/client";
import { sole } from "../calcolo/sole";
import { direzioneGradi, distanzaKm, puntoCardinale } from "../dati/luoghi";
import { aggiungi, el, icona, ICONE, memoria } from "./dom";
import { apriFoglio } from "./foglio";
import { avvisaPunti } from "../dati/archivio";
import { NOME_MAPPE, urlNaviga } from "./naviga";

interface Uscita { auto?: { lon: number; lat: number; ora: string }; giorno: string; avvisato?: boolean }
const MINUTI_AVVISO = 60;

const ora = (d: Date | null) => (d ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—");
const oggi = () => new Date().toLocaleDateString("sv-SE");

function uscita(): Uscita | null {
  const u = memoria.leggi<Uscita | null>("uscita", null);
  return u && u.giorno === oggi() ? u : null; // un'uscita vale per il giorno in cui è iniziata
}

function durata(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

// --- bussola -------------------------------------------------------------------------------------
let rotta: number | null = null; // gradi da nord, dove punta la parte alta del telefono
const ascoltaBussola: ((r: number | null) => void)[] = [];
function suOrientamento(e: DeviceOrientationEvent) {
  const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof ios === "number") rotta = ios;
  else if (e.absolute && e.alpha !== null) rotta = (360 - e.alpha) % 360;
  else return;
  for (const f of ascoltaBussola) f(rotta);
}
async function accendiBussola(): Promise<string | null> {
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  try {
    if (typeof D.requestPermission === "function") {
      const r = await D.requestPermission(); // iPhone: lo chiede la prima volta
      if (r !== "granted") return "Permesso per la bussola negato: chiudi e riapri Bolé e tocca di nuovo «Accendi la bussola».";
    }
  } catch {
    return "La bussola non è disponibile su questo dispositivo.";
  }
  window.addEventListener("deviceorientation", suOrientamento, true);
  window.addEventListener("deviceorientationabsolute" as "deviceorientation", suOrientamento, true);
  return null;
}

function quadrante() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "-60 -60 120 120");
  svg.setAttribute("class", "bussola");
  svg.setAttribute("role", "img");
  svg.innerHTML = `<g class="rosa"><circle r="56" fill="#fff" stroke="#7f8c83" stroke-width="2"/>` +
    `<path d="M0-50 6-36H-6z" fill="#9b1c1c"/><text y="-24" text-anchor="middle" font-size="13" font-weight="700" fill="#9b1c1c">N</text>` +
    `<text x="40" y="5" text-anchor="middle" font-size="11" fill="#4a5750">E</text><text y="45" text-anchor="middle" font-size="11" fill="#4a5750">S</text>` +
    `<text x="-40" y="5" text-anchor="middle" font-size="11" fill="#4a5750">O</text></g>` +
    `<g class="freccia-auto"><path d="M0-40 12-8H4V30H-4V-8H-12z" fill="#1e5b3f"/></g>`;
  return svg;
}

export async function apriInBosco(mappa: Mappa) {
  let sorveglia: number | null = null;
  let timer: number | undefined;
  const corpo = apriFoglio("In bosco", "Funziona anche senza rete", () => {
    if (sorveglia !== null) navigator.geolocation.clearWatch(sorveglia);
    clearInterval(timer);
    ascoltaBussola.length = 0;
  }, "vicino");

  const posizione = el("dl", { class: "valori" });
  const tramonto = el("div");
  const auto = el("div");
  const svg = quadrante();
  const notaBussola = el("p", { class: "fonte" }, "Tieni il telefono in piano, lontano da oggetti di metallo. La freccia verde punta all'auto.");
  const tastoBussola = el("button", { class: "tasto secondario", type: "button" }, icona(ICONE.bussola, 18), "Accendi la bussola");
  let qui: GeolocationPosition | null = null;

  const disegnaBussola = () => {
    const rosa = svg.querySelector(".rosa") as SVGGElement, freccia = svg.querySelector(".freccia-auto") as SVGGElement;
    const u = uscita();
    rosa.setAttribute("transform", `rotate(${-(rotta ?? 0)})`);
    if (u?.auto && qui) {
      const d = direzioneGradi(qui.coords.longitude, qui.coords.latitude, u.auto.lon, u.auto.lat);
      freccia.setAttribute("transform", `rotate(${d - (rotta ?? 0)})`);
      freccia.style.display = "";
    } else freccia.style.display = "none";
  };
  ascoltaBussola.push(disegnaBussola);
  tastoBussola.addEventListener("click", async () => {
    const errore = await accendiBussola();
    if (errore) notaBussola.textContent = errore;
    else { tastoBussola.remove(); notaBussola.textContent = "Bussola accesa. Tieni il telefono in piano, lontano da metalli: errore di qualche grado."; }
  });

  const disegnaAuto = () => {
    const u = uscita();
    if (!u?.auto) {
      auto.replaceChildren(
        el("p", {}, "Prima di entrare nel bosco segna dove hai lasciato l'auto: poi la freccia ti riporta lì."),
        el("button", { class: "tasto", type: "button", onclick: () => {
          if (!qui) { auto.append(el("p", {}, "Aspetto il GPS…")); return; }
          memoria.scrivi("uscita", { giorno: oggi(), auto: { lon: qui.coords.longitude, lat: qui.coords.latitude, ora: new Date().toISOString() } });
          avvisaPunti();
          disegnaAuto(); disegnaBussola();
        } }, icona(ICONE.auto, 18), "L'auto è qui"));
      return;
    }
    const a = u.auto;
    const righe: (HTMLElement | string)[] = [];
    if (qui) {
      const km = distanzaKm(qui.coords.longitude, qui.coords.latitude, a.lon, a.lat);
      const verso = puntoCardinale(direzioneGradi(qui.coords.longitude, qui.coords.latitude, a.lon, a.lat));
      righe.push(el("p", { style: "font-size:20px;font-weight:800;margin:4px 0" },
        km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`, el("span", { style: "font-size:15px;font-weight:500" }, ` verso ${verso}, in linea d'aria`)));
    }
    auto.replaceChildren(...righe,
      el("p", { class: "fonte" }, `Auto segnata alle ${ora(new Date(a.ora))}.`),
      el("div", { class: "fila-tasti" },
        el("a", { class: "tasto secondario", href: urlNaviga(a.lat, a.lon, "piedi"), target: "_blank", rel: "noopener" }, icona(ICONE.naviga, 18), `A piedi con ${NOME_MAPPE}`),
        el("button", { class: "tasto secondario", type: "button", onclick: () => { mappa.flyTo({ center: [a.lon, a.lat], zoom: 15 }); } }, icona(ICONE.mappa, 18), "Sulla mappa"),
        el("button", { class: "tasto secondario", type: "button", onclick: () => { memoria.scrivi("uscita", null); avvisaPunti(); disegnaAuto(); disegnaBussola(); } }, "Fine uscita")));
  };

  const disegnaTramonto = () => {
    const c = qui ? { lat: qui.coords.latitude, lon: qui.coords.longitude } : { lat: mappa.getCenter().lat, lon: mappa.getCenter().lng };
    const s = sole(c.lat, c.lon);
    const mancano = s.tramonto ? (s.tramonto.getTime() - Date.now()) / 60000 : NaN;
    tramonto.replaceChildren(
      el("dl", { class: "valori" },
        el("dt", {}, "Tramonto"), el("dd", {}, ora(s.tramonto)),
        el("dt", {}, "Buio (fine del crepuscolo)"), el("dd", {}, ora(s.buio))),
      Number.isFinite(mancano) && mancano > 0 && mancano <= MINUTI_AVVISO
        ? el("div", { class: "avviso-fisso" }, icona(ICONE.avviso, 20), `Mancano ${durata(mancano)} al tramonto: è ora di rientrare.`)
        : Number.isFinite(mancano) && mancano > 0 ? el("p", {}, `Mancano ${durata(mancano)} al tramonto.`) : el("p", {}, "Il sole è già tramontato."),
      el("p", { class: "fonte" }, "Calcolo astronomico (NOAA) per la tua posizione: in valle il sole sparisce prima, dietro i monti. ",
        "L'avviso compare 60 minuti prima, se Bolé è aperta: per sicurezza imposta anche una sveglia."));
  };

  const disegnaPosizione = async () => {
    if (!qui) { posizione.replaceChildren(el("dt", {}, "Posizione"), el("dd", {}, "in attesa del GPS…")); return; }
    const c = qui.coords;
    const p = await punto(c.longitude, c.latitude).catch(() => null);
    posizione.replaceChildren();
    aggiungi(posizione, [
      el("dt", {}, "Coordinate"), el("dd", {}, `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`),
      el("dt", {}, "Precisione"), el("dd", {}, `± ${Math.round(c.accuracy)} m`),
      el("dt", {}, "Quota (carta)"), el("dd", {}, p?.quota != null ? `${Math.round(p.quota)} m` : "—"),
      c.altitude != null ? [el("dt", {}, "Quota (GPS)"), el("dd", {}, `${Math.round(c.altitude)} m`)] : null]);
  };

  corpo.append(
    el("div", { class: "scheda" }, el("h3", {}, "Torna all'auto"), el("div", { class: "centro" }, svg), tastoBussola, notaBussola, auto),
    el("div", { class: "scheda" }, el("h3", {}, "Sole"), tramonto),
    el("div", { class: "scheda" }, el("h3", {}, "Dove sei"), posizione,
      el("p", { class: "fonte" }, "La posizione resta sul telefono. In caso di emergenza chiama il 112 e leggi le coordinate qui sopra.")));

  if (navigator.geolocation) {
    sorveglia = navigator.geolocation.watchPosition((p) => {
      qui = p;
      disegnaPosizione(); disegnaAuto(); disegnaBussola();
    }, () => {
      posizione.replaceChildren(el("dt", {}, "Posizione"), el("dd", {}, "GPS non disponibile: controlla i permessi di posizione."));
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
  }
  disegnaPosizione(); disegnaAuto(); disegnaTramonto(); disegnaBussola();
  timer = window.setInterval(disegnaTramonto, 30000);
}

/** Avviso globale: durante un'uscita (auto segnata oggi), 60 minuti prima del tramonto. */
export function avviaAvvisoTramonto(apri: () => void) {
  const controlla = () => {
    const u = uscita();
    document.getElementById("avviso-tramonto")?.remove();
    if (!u?.auto || u.avvisato) return;
    const s = sole(u.auto.lat, u.auto.lon);
    if (!s.tramonto) return;
    const mancano = (s.tramonto.getTime() - Date.now()) / 60000;
    if (mancano > MINUTI_AVVISO || mancano < -30) return;
    const banner = el("div", { id: "avviso-tramonto", class: "avviso-tramonto", role: "alert" },
      icona(ICONE.avviso, 20),
      el("span", {}, mancano > 0 ? `Tramonto alle ${ora(s.tramonto)}: mancano ${durata(mancano)}. Rientra con calma.` : "Il sole è tramontato: rientra."),
      el("button", { type: "button", onclick: () => apri() }, "All'auto"),
      el("button", { type: "button", "aria-label": "Ho capito", onclick: () => { memoria.scrivi("uscita", { ...u, avvisato: true }); banner.remove(); } }, icona(ICONE.chiudi, 18)));
    document.body.append(banner);
  };
  controlla();
  window.setInterval(controlla, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) controlla(); });
}

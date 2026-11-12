/**
 * Fogli sopra la mappa (Perché qui?, Vicino, Diario, Regole, Guida...).
 * Un foglio alla volta; la barra delle schede in basso resta visibile e dice in quale sezione sei.
 */
import { el, icona, ICONE } from "./dom";

let aperto: HTMLElement | null = null;
let alChiudere: (() => void) | null = null;
const ascoltatori: ((scheda: string) => void)[] = [];

/** Chi vuole sapere quale scheda è attiva ("mappa" quando non c'è nessun foglio). */
export function ascoltaScheda(f: (scheda: string) => void) {
  ascoltatori.push(f);
}
function avvisa(scheda: string) {
  for (const f of ascoltatori) f(scheda);
}

function chiudi(sostituito: boolean) {
  if (!aperto) return;
  aperto.remove();
  aperto = null;
  const f = alChiudere;
  alChiudere = null;
  f?.();
  if (!sostituito) avvisa("mappa");
}

export function chiudiFoglio() {
  chiudi(false);
}

/**
 * Apre un foglio: titolo, sottotitolo facoltativo e contenuto (da riempire con il corpo restituito).
 * "scheda" = la sezione a cui appartiene (si accende nella barra in basso).
 */
export function apriFoglio(titolo: string, sottotitolo = "", quandoChiude?: () => void, scheda = "mappa"): HTMLElement {
  chiudi(true);
  const corpo = el("div", { class: "corpo" });
  const foglio = el(
    "section",
    { class: "foglio", role: "dialog", "aria-modal": "true", "aria-label": titolo },
    el("div", { class: "testa" },
      el("div", {}, el("h2", {}, titolo), sottotitolo ? el("div", { class: "sotto" }, sottotitolo) : null),
      el("button", { class: "tasto-chiudi", type: "button", "aria-label": "Chiudi", onclick: () => chiudiFoglio() }, icona(ICONE.chiudi)),
    ),
    corpo,
  );
  document.body.append(foglio);
  aperto = foglio;
  alChiudere = quandoChiude ?? null;
  avvisa(scheda);
  return corpo;
}

/** Nasconde o rimostra il foglio aperto senza chiuderlo (serve al mirino per spostare un punto). */
export function mostraFoglio(visibile: boolean) {
  aperto?.classList.toggle("nascosto", !visibile);
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Escape") chiudiFoglio();
});

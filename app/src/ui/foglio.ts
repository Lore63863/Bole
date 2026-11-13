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
export function apriFoglio(titolo: string, sottotitolo = "", quandoChiude?: () => void, scheda = "mappa", altezza: "pieno" | "mezzo" = "pieno"): HTMLElement {
  chiudi(true);
  const corpo = el("div", { class: "corpo" });
  const foglio = el(
    "section",
    { class: `foglio ${altezza}`, role: "dialog", "aria-modal": "true", "aria-label": titolo },
    el("div", { class: "presa", "aria-hidden": "true" }, el("span", {})),
    el("div", { class: "testa" },
      el("div", {}, el("h2", {}, titolo), sottotitolo ? el("div", { class: "sotto" }, sottotitolo) : null),
      el("button", { class: "tasto-chiudi", type: "button", "aria-label": "Chiudi", onclick: () => chiudiFoglio() }, icona(ICONE.chiudi)),
    ),
    corpo,
  );
  document.body.append(foglio);
  aperto = foglio;
  // come nelle app di mappe: trascina su la testa per aprirlo tutto, giù per chiuderlo (o abbassarlo)
  const testa = foglio.querySelector(".testa") as HTMLElement, presa = foglio.querySelector(".presa") as HTMLElement;
  for (const zona of [presa, testa]) {
    let y0: number | null = null;
    zona.addEventListener("pointerdown", (e) => { if (!(e.target as Element).closest("button")) y0 = e.clientY; });
    zona.addEventListener("pointerup", (e) => {
      if (y0 === null) return;
      const dy = e.clientY - y0; y0 = null;
      if (dy < -24) foglio.classList.replace("mezzo", "pieno");
      else if (dy > 40) { if (foglio.classList.contains("pieno") && altezza === "mezzo") foglio.classList.replace("pieno", "mezzo"); else chiudiFoglio(); }
    });
  }
  // nel foglio a metà, scorrere il contenuto verso l'alto lo apre tutto
  corpo.addEventListener("scroll", () => { if (corpo.scrollTop > 30) foglio.classList.replace("mezzo", "pieno"); });
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

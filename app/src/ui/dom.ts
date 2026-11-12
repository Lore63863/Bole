/** Piccolo aiuto per costruire l'interfaccia senza librerie (meno peso, niente codice di terzi). */

type Figlio = Node | string | number | null | undefined | false | Figlio[];
type Attributi = Record<string, string | number | boolean | EventListener | undefined | null>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attr: Attributi = {}, ...figli: Figlio[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attr)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") e.className = String(v);
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, String(v));
  }
  aggiungi(e, figli);
  return e;
}

export function aggiungi(e: Element, figli: Figlio[]) {
  for (const f of figli) {
    if (f === null || f === undefined || f === false) continue;
    if (Array.isArray(f)) { aggiungi(e, f); continue; }
    e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

/** Icona SVG a tratto (stesse della bozza grafica). */
export function icona(percorsi: string, dimensione = 24): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(dimensione));
  s.setAttribute("height", String(dimensione));
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "icona");
  s.innerHTML = percorsi;
  return s;
}

export const ICONE = {
  fungo: '<path d="M4 11a8 8 0 0 1 16 0H4z"/><path d="M10 11v6.5a2 2 0 0 0 4 0V11"/>',
  mappa: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  vicino: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  diario: '<path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z"/><path d="M6 3v18M10 8h5M10 12h5"/>',
  regole: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  guida: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8"/><path d="M12 17h.01"/>',
  posizione: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  strati: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 17l9 5 9-5"/>',
  chiudi: '<path d="M6 6l12 12M18 6 6 18"/>',
  freccia: '<path d="M9 6l6 6-6 6"/>',
  giu: '<path d="M6 9l6 6 6-6"/>',
  stella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  auto: '<path d="M5 16l1.5-5h11L19 16"/><path d="M4 16h16v3H4z"/><circle cx="7.5" cy="17.5" r="1"/><circle cx="16.5" cy="17.5" r="1"/>',
  bussola: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11z"/>',
  scarica: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  avviso: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  naviga: '<path d="M3 11 21 3l-8 18-2-8-8-2z"/>',
  gruppo: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5"/><path d="M15 14.2c2.6-.4 5 1.3 5.6 4.8"/>',
};

/** Data breve in italiano: "gio 12 nov". */
export function dataBreve(iso: string): string {
  const [a, m, g] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, g)).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function quandoInParole(giorno: number): string {
  return giorno === 0 ? "Oggi" : giorno === 1 ? "Domani" : `Tra ${giorno} giorni`;
}

/** localStorage può mancare o dare errore (navigazione privata): si prova e basta. */
export const memoria = {
  leggi<T>(chiave: string, predefinito: T): T {
    try {
      const v = localStorage.getItem(`bole.${chiave}`);
      return v === null ? predefinito : (JSON.parse(v) as T);
    } catch {
      return predefinito;
    }
  },
  scrivi(chiave: string, valore: unknown) {
    try {
      localStorage.setItem(`bole.${chiave}`, JSON.stringify(valore));
    } catch {
      /* niente: la preferenza vale solo per questa visita */
    }
  },
};

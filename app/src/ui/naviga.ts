/**
 * Collegamenti "Naviga": passano solo il punto di arrivo, mai la tua posizione.
 * Su iPhone: Mappe di Apple e Google Maps. Su Android (e al computer): Google Maps.
 */
import { el, icona, ICONE } from "./dom";

export const ANDROID = /Android/i.test(navigator.userAgent);
export const IPHONE = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const google = (p: string, modo: "auto" | "piedi") =>
  `https://www.google.com/maps/dir/?api=1&destination=${p}&travelmode=${modo === "piedi" ? "walking" : "driving"}`;
const apple = (p: string, modo: "auto" | "piedi") => `https://maps.apple.com/?daddr=${p}&dirflg=${modo === "piedi" ? "w" : "d"}`;

/** Un solo indirizzo, quello giusto per il telefono: Mappe su iPhone, Google Maps altrove. */
export function urlNaviga(lat: number, lon: number, modo: "auto" | "piedi" = "auto") {
  const p = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  return IPHONE ? apple(p, modo) : google(p, modo);
}

/** Nome dell'app di mappe che si apre con urlNaviga. */
export const NOME_MAPPE = IPHONE ? "Mappe" : "Google Maps";

/** Tasti piccoli per l'elenco delle zone: su iPhone "Mappe" e "Google", altrove solo "Google Maps". */
export function linkNaviga(lat: number, lon: number) {
  const p = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const tastoGoogle = el("a", { class: "tasto secondario piccolo", href: google(p, "auto"), target: "_blank", rel: "noopener", "aria-label": "Naviga con Google Maps" },
    IPHONE ? "Google" : [icona(ICONE.naviga, 14), "Google Maps"]);
  if (!IPHONE) return [tastoGoogle];
  return [
    el("a", { class: "tasto secondario piccolo", href: apple(p, "auto"), target: "_blank", rel: "noopener", "aria-label": "Naviga con Mappe" }, icona(ICONE.naviga, 14), "Mappe"),
    tastoGoogle,
  ];
}

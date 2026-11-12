/**
 * Apertura dei file .pmtiles (mappa di base e strati), letti a pezzi con richieste parziali.
 *
 * Chrome (anche su Android) a volte restituisce dalla sua cache un pezzo sbagliato quando più
 * richieste parziali dello stesso file si sovrappongono (la pagina e il lavoratore leggono gli
 * stessi file): si vedeva come «The source image could not be decoded» su una tessera del rilievo,
 * solo sul sito pubblicato e solo con Chrome. La libreria PMTiles evita già la cache del browser
 * su Chrome per Windows; qui lo stesso vale per ogni browser basato su Chromium.
 * Safari (iPhone, anche Chrome su iPhone che usa WebKit) tiene la cache normale.
 * Le aree scaricate per l'uso senza rete non c'entrano: stanno nella Cache Storage dell'app.
 */
import { FetchSource, PMTiles } from "pmtiles";

export const CHROMIUM = /Chrome\/|Chromium|Edg\/|OPR\/|Brave/.test(navigator.userAgent);

export function apriArchivio(url: string): PMTiles {
  const fonte = new FetchSource(url);
  if (CHROMIUM) fonte.chromeWindowsNoCache = true; // = richieste con cache: "no-store"
  return new PMTiles(fonte);
}

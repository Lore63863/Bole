/** Stato condiviso dell'app: specie scelta e giorno. Chi è interessato si iscrive. */
import { memoria } from "./dom";

type Ascoltatore = () => void;

class Stato {
  scelta = memoria.leggi<string>("scelta", "porcini");
  giorno = 0;
  private ascoltatori: Ascoltatore[] = [];

  ascolta(f: Ascoltatore) {
    this.ascoltatori.push(f);
  }
  private avvisa() {
    for (const f of this.ascoltatori) f();
  }
  scegli(scelta: string) {
    if (scelta === this.scelta) return;
    this.scelta = scelta;
    memoria.scrivi("scelta", scelta);
    this.avvisa();
  }
  vaiAlGiorno(g: number) {
    if (g === this.giorno) return;
    this.giorno = g;
    this.avvisa();
  }
}

export const stato = new Stato();

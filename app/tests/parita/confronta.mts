// Prova di parità, parte 2: le formule dell'app (src/calcolo/formule.ts) sui casi del modello Python.
// Uso: node --experimental-strip-types tests/parita/confronta.mts <casi.json> <modello.json>
import { readFileSync } from "node:fs";
import { classe, fattoreMeteo, type ParametriSpecie } from "../../src/calcolo/formule.ts";

const [fileCasi, fileModello] = process.argv.slice(2);
const casi = JSON.parse(readFileSync(fileCasi, "utf8"));
const specie: Record<string, ParametriSpecie> = JSON.parse(readFileSync(fileModello, "utf8")).specie;
let maxM = 0, maxI = 0, diverse = 0;
for (const c of casi) {
  const p = specie[c.specie];
  const m = fattoreMeteo(p, c.pioggia, c.t, c.tmax, c.tmin, c.secco > 0.5, c.neve_cm);
  const indice = c.habitat * m * p.stagione[c.giorno - 1];
  maxM = Math.max(maxM, Math.abs(m - c.meteo));
  maxI = Math.max(maxI, Math.abs(indice - c.indice));
  if (classe(indice, p.soglie) !== c.classe) diverse++;
}
console.log(`${casi.length} casi · differenza massima meteo ${maxM.toExponential(1)} · indice ${maxI.toExponential(1)} · classi diverse ${diverse}`);
process.exit(maxM < 1e-9 && maxI < 1e-9 && diverse === 0 ? 0 : 1);

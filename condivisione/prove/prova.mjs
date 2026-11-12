// Prove del server della condivisione, tutto in locale (nessun account Cloudflare serve).
// Avvia il server con "wrangler dev --local", fa le richieste che farebbe l'app e controlla le risposte
// e il contenuto del database. Uso: npm run prova
import { spawn, execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { randomBytes } from "node:crypto";

const PORTA = 8788;
const BASE = `http://127.0.0.1:${PORTA}`;
const ORIGINE = "http://127.0.0.1:4173";
const STATO = ".stato-prove";
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };

let ok = 0, ko = 0;
const verifica = (cosa, condizione, dettaglio = "") => {
  if (condizione) { ok++; console.log("  ✓", cosa); } else { ko++; console.log("  ✗", cosa, dettaglio); }
};

function nuovoCodice() {
  const v = [...randomBytes(11)].map((b) => b % ALFABETO.length);
  let s = 0;
  v.forEach((x, i) => { s += (i + 1) * x; });
  v.push(s % ALFABETO.length);
  const t = v.map((x) => ALFABETO[x]).join("");
  return `${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}`;
}
const oggi = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
const giorni = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const sql = (comando) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "bole-condivisione", "--local", "--persist-to", STATO, "--json", "--command", comando], { env, encoding: "utf8" }))[0].results;

async function chiama(metodo, percorso, { gruppo, token, corpo, origine = ORIGINE } = {}) {
  const h = { Origin: origine };
  if (gruppo) h["X-Bole-Gruppo"] = gruppo;
  if (token) h["X-Bole-Token"] = token;
  if (corpo !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(BASE + percorso, { method: metodo, headers: h, body: corpo === undefined ? undefined : (typeof corpo === "string" ? corpo : JSON.stringify(corpo)) });
  const testo = await r.text();
  return { stato: r.status, h: r.headers, json: testo ? JSON.parse(testo) : null };
}

// --- avvio ----------------------------------------------------------------------------------------
rmSync(STATO, { recursive: true, force: true });
execFileSync("npx", ["wrangler", "d1", "execute", "bole-condivisione", "--local", "--persist-to", STATO, "--file", "schema.sql"], { env, stdio: "ignore" });
const server = spawn("npx", ["wrangler", "dev", "--local", "--port", String(PORTA), "--ip", "127.0.0.1", "--persist-to", STATO], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
let registro = "";
server.stdout.on("data", (d) => { registro += d; });
server.stderr.on("data", (d) => { registro += d; });
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`${BASE}/v1/stato`)).ok) break; } catch { /* non ancora */ }
  await new Promise((r) => setTimeout(r, 500));
}

try {
  console.log("Server e CORS");
  const s = await chiama("GET", "/v1/stato");
  verifica("risponde", s.stato === 200 && s.json.ok === true, JSON.stringify(s.json));
  verifica("CORS per l'app", s.h.get("access-control-allow-origin") === ORIGINE);
  const altra = await chiama("GET", "/v1/stato", { origine: "https://sito-qualunque.example" });
  verifica("niente CORS per altri siti", altra.h.get("access-control-allow-origin") === null);
  const pre = await fetch(`${BASE}/v1/ritrovamenti`, { method: "OPTIONS", headers: { Origin: ORIGINE, "Access-Control-Request-Method": "POST" } });
  verifica("permesso preventivo per l'app (204)", pre.status === 204);
  const pre2 = await fetch(`${BASE}/v1/ritrovamenti`, { method: "OPTIONS", headers: { Origin: "https://sito-qualunque.example" } });
  verifica("permesso preventivo negato ad altri (403)", pre2.status === 403);
  verifica("risposte non salvate in cache", s.h.get("cache-control") === "no-store");

  console.log("Codici di gruppo");
  const A = nuovoCodice(), B = nuovoCodice();
  verifica("senza codice: rifiutato", (await chiama("GET", "/v1/ritrovamenti")).stato === 400);
  const sbagliato = A.slice(0, 13) + (A[13] === "2" ? "3" : "2"); // ultimo carattere cambiato
  verifica("codice con controllo sbagliato: rifiutato", (await chiama("GET", "/v1/ritrovamenti", { gruppo: sbagliato })).stato === 400);
  verifica("gruppo nuovo: vuoto", (await chiama("GET", "/v1/ritrovamenti", { gruppo: A })).json.ritrovamenti.length === 0);

  console.log("Invio");
  const tokenA = randomBytes(16).toString("hex");
  const buono = { cella: "1kmE4113N2358", specie: "porcino", quantita: "abbastanza", data: oggi(), token: tokenA };
  const inv = await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: buono });
  verifica("ritrovamento accettato (201)", inv.stato === 201, JSON.stringify(inv.json));
  verifica("visibile da domani", inv.json?.visibile_dal === giorni(oggi(), 1), inv.json?.visibile_dal);
  const conPunto = await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: { ...buono, lat: 44.3075, lon: 7.4006 } });
  verifica("con coordinate precise: rifiutato", conPunto.stato === 400 && conPunto.json.errore === "campi non ammessi");
  const conOra = await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: { ...buono, ora: "10:15" } });
  verifica("con l'ora: rifiutato", conOra.stato === 400);
  verifica("quadrato fuori area: rifiutato", (await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: { ...buono, cella: "1kmE3500N2400" } })).stato === 400);
  verifica("quadrato scritto male: rifiutato", (await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: { ...buono, cella: "44.30,7.40" } })).stato === 400);
  verifica("specie sconosciuta: rifiutata", (await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: { ...buono, specie: "amanita_phalloides" } })).stato === 400);
  verifica("data fra 2 giorni: rifiutata", (await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: { ...buono, data: giorni(oggi(), 2) } })).stato === 400);
  verifica("data di 401 giorni fa: rifiutata", (await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: { ...buono, data: giorni(oggi(), -401) } })).stato === 400);
  verifica("codice per toglierlo sbagliato: rifiutato", (await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: { ...buono, token: "abc" } })).stato === 400);
  verifica("richiesta troppo grande: rifiutata (413)", (await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: JSON.stringify({ ...buono, x: "a".repeat(3000) }) })).stato === 413);
  const ieriB = await chiama("POST", "/v1/ritrovamenti", { gruppo: B, corpo: { ...buono, specie: "gallinaccio", quantita: null, data: giorni(oggi(), -1), token: randomBytes(16).toString("hex") } });
  verifica("ritrovamento di ieri inviato oggi: visibile da domani", ieriB.json?.visibile_dal === giorni(oggi(), 1));

  console.log("Chi vede che cosa");
  verifica("oggi non lo vede nessuno, neanche il gruppo", (await chiama("GET", "/v1/ritrovamenti", { gruppo: A })).json.ritrovamenti.length === 0);
  verifica("ieri inviato oggi: non ancora visibile", (await chiama("GET", "/v1/ritrovamenti", { gruppo: B })).json.ritrovamenti.length === 0);
  sql("UPDATE ritrovamenti SET data = date(data, '-1 day'), creato_giorno = date(creato_giorno, '-1 day')"); // passa un giorno
  const visti = (await chiama("GET", "/v1/ritrovamenti", { gruppo: A })).json.ritrovamenti;
  verifica("il giorno dopo il gruppo A lo vede", visti.length === 1, JSON.stringify(visti));
  verifica("solo quadrato, specie, quantità, giorno e id", visti.length === 1 && Object.keys(visti[0]).sort().join(",") === "cella,data,id,quantita,specie", JSON.stringify(visti[0]));
  verifica("il gruppo B vede solo il suo", (await chiama("GET", "/v1/ritrovamenti", { gruppo: B })).json.ritrovamenti.every((r) => r.specie === "gallinaccio"));

  console.log("Che cosa c'è nel database");
  const righe = sql("SELECT * FROM ritrovamenti");
  const colonne = Object.keys(righe[0]).sort().join(",");
  verifica("colonne previste e nient'altro", colonne === "cella,creato_giorno,data,gruppo,id,quantita,specie,token", colonne);
  verifica("il codice del gruppo non è salvato", righe.every((r) => !JSON.stringify(r).includes(A.replace(/-/g, "")) && !JSON.stringify(r).includes(A) && /^[0-9a-f]{32}$/.test(r.gruppo)));
  verifica("il codice per toglierlo non è salvato (solo l'impronta)", righe.every((r) => r.token !== tokenA && /^[0-9a-f]{64}$/.test(r.token)));
  verifica("nessun indirizzo IP salvato", !JSON.stringify(righe).includes("127.0.0.1"));

  console.log("Togliere");
  const id = visti[0].id;
  verifica("con il codice sbagliato: no", (await chiama("DELETE", `/v1/ritrovamenti/${id}`, { token: randomBytes(16).toString("hex") })).stato === 404);
  verifica("con il suo codice: tolto (204)", (await chiama("DELETE", `/v1/ritrovamenti/${id}`, { token: tokenA })).stato === 204);
  verifica("non si vede più", (await chiama("GET", "/v1/ritrovamenti", { gruppo: A })).json.ritrovamenti.length === 0);

  console.log("Limiti");
  sql(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 200)
       INSERT INTO ritrovamenti SELECT 'riempi-' || i, (SELECT gruppo FROM ritrovamenti WHERE specie = 'gallinaccio' LIMIT 1), '1kmE4113N2358', 'porcino', NULL, '${oggi()}', '${oggi()}', 'x' FROM n`);
  const pieno = await chiama("POST", "/v1/ritrovamenti", { gruppo: B, corpo: { ...buono, token: randomBytes(16).toString("hex") } });
  verifica("oltre 200 al giorno per gruppo: fermato (429)", pieno.stato === 429, JSON.stringify(pieno.json));
  verifica("gli altri gruppi continuano", (await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: { ...buono, token: randomBytes(16).toString("hex") } })).stato === 201);
  sql("DELETE FROM ritrovamenti WHERE id LIKE 'riempi-%'");
  sql(`INSERT INTO ritrovamenti VALUES ('vecchio', 'g', '1kmE4113N2358', 'porcino', NULL, '${giorni(oggi(), -1200)}', '${giorni(oggi(), -1200)}', 'x')`);
  await chiama("POST", "/v1/ritrovamenti", { gruppo: A, corpo: { ...buono, token: randomBytes(16).toString("hex") } });
  verifica("i ritrovamenti di oltre 3 anni si cancellano da soli", sql("SELECT COUNT(*) AS n FROM ritrovamenti WHERE id = 'vecchio'")[0].n === 0);
  let fermate = 0;
  for (let i = 0; i < 70; i++) if ((await chiama("GET", "/v1/stato")).stato === 429) fermate++;
  console.log(`  · limite anti-abusi in locale: ${fermate ? `${fermate} richieste su 70 fermate` : "non simulato in locale (attivo solo su Cloudflare)"}`);
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); } // anche workerd, figlio di wrangler
}
console.log(`\n${ok} controlli passati, ${ko} falliti`);
if (ko) { console.log(registro.slice(-3000)); process.exit(1); }

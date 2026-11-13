// Prova di sicurezza: regole della pagina (CSP) attive e mai violate; un file di diario malevolo
// non fa uscire richieste, non esegue codice e non riattiva la condivisione col gruppo.
// Uso: CHROMIUM=<percorso> node tests/sicurezza.mjs <url-app>   (TELEFONO=android per Android)
import { chromium, devices, webkit } from "playwright";
const [base] = process.argv.slice(2);
const android = process.env.TELEFONO === "android";
let ok = 0, ko = 0;
const verifica = (cosa, c, d = "") => { if (c) { ok++; console.log("  ✓", cosa); } else { ko++; console.log("  ✗", cosa, d); } };
const b = android ? await chromium.launch({ executablePath: process.env.CHROMIUM || undefined }) : await webkit.launch();
const ctx = await b.newContext({ ...(android ? devices["Pixel 7"] : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }), locale: "it-IT" });
const p = await ctx.newPage();
const esterni = [], errori = [];
p.on("request", (r) => { if (r.url().startsWith("http") && new URL(r.url()).host !== new URL(base).host) esterni.push(r.url()); });
p.on("pageerror", (e) => errori.push(String(e)));
p.on("console", (m) => { if (/Content.Security.Policy|Refused to/i.test(m.text())) errori.push(m.text()); });
await p.addInitScript(() => { globalThis.violazioni = []; document.addEventListener("securitypolicyviolation", (e) => globalThis.violazioni.push(`${e.violatedDirective} ${e.blockedURI}`)); });
await p.goto(`${base}?centro=7.42,44.31&zoom=11`);
await p.waitForSelector("body[data-mappa-pronta='1']", { timeout: 120000 });
await p.waitForTimeout(3000);
verifica("la pagina ha le regole di sicurezza (CSP)", await p.locator('meta[http-equiv="Content-Security-Policy"]').count() === 1);
verifica("mappa, colori e lavoratori funzionano con le regole: nessuna violazione", (await p.evaluate(() => globalThis.violazioni)).length === 0, (await p.evaluate(() => globalThis.violazioni)).join("\n"));
verifica("uno script esterno viene bloccato", await p.evaluate(() => new Promise((ok) => { const s = document.createElement("script"); s.src = "https://esempio.invalid/x.js"; s.onerror = () => ok(true); s.onload = () => ok(false); document.head.append(s); setTimeout(() => ok(true), 3000); })));
// la prova dello script esterno lascia di proposito una violazione: si azzera prima di andare avanti
errori.length = 0; esterni.length = 0;
await p.evaluate(() => { globalThis.violazioni = []; });
// file di diario malevolo
const cattivo = { bole: 1, voci: [{
  id: "x1-prova", tipo: "ritrovamento", data: "2026-11-01", lat: 44.31, lon: 7.42, specie: "porcino",
  note: '<img src=x onerror="globalThis.bucato=1">', foto: "https://esempio.invalid/spia.png",
  condivisione: { stato: "in coda", gruppo: "ABCDEFGHJKM2", token: "0".repeat(32) }, extra: "campo estraneo",
}] };
await p.locator("nav.schede button", { hasText: "Diario" }).click();
await p.locator("button", { hasText: "Esporta o salva" }).click();
const prima = esterni.length;
await p.locator('input[type="file"]').setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(cattivo)) });
await p.waitForFunction(() => document.body.innerText.includes("voci importate"), null, { timeout: 15000 });
await p.waitForTimeout(1500);
const salvata = await p.evaluate(() => new Promise((ok) => { const r = indexedDB.open("bole", 1); r.onsuccess = () => { const g = r.result.transaction("diario").objectStore("diario").get("x1-prova"); g.onsuccess = () => ok(g.result); }; }));
verifica("la voce è importata", !!salvata);
verifica("la foto da un indirizzo esterno non viene scaricata", esterni.length === prima && !salvata?.foto, esterni.slice(prima).join(", "));
verifica("la condivisione col gruppo non si importa", salvata && !("condivisione" in salvata));
verifica("i campi estranei si scartano", salvata && !("extra" in salvata));
await p.locator(".foglio button[aria-label='Chiudi']").first().click().catch(() => {});
await p.locator("nav.schede button", { hasText: "Diario" }).click();
await p.locator(".riga-voce").first().click();
await p.waitForTimeout(1000);
verifica("le note si mostrano come testo, senza eseguire codice", !(await p.evaluate(() => globalThis.bucato)));
verifica("nessuna richiesta fuori dal sito", esterni.filter((u) => !u.includes("bole-condivisione")).length === 0, esterni.join(", "));
verifica("nessuna violazione delle regole né errore", errori.length === 0 && (await p.evaluate(() => globalThis.violazioni)).length === 0, errori.join("\n"));
await b.close();
console.log(`\n${ok} controlli passati, ${ko} falliti`);
if (ko) process.exit(1);

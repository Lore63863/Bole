// Prova "modalità aereo": scarica un'area piccola, stacca la rete, riapre l'app e controlla
// che mappa, indice e "Perché qui?" funzionino ancora in quell'area.
// Uso: node tests/senza_rete.mjs <url-base> <cartella-uscita>
// TELEFONO=android: stessa prova su Chrome (Chromium) a misura di un Pixel 7.
import { chromium, devices, webkit } from "playwright";
const [base, uscita] = process.argv.slice(2);
const android = process.env.TELEFONO === "android";
const browser = android ? await chromium.launch({ executablePath: process.env.CHROMIUM || undefined }) : await webkit.launch();
const ctx = await browser.newContext({ ...(android ? devices["Pixel 7"] : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }),
  locale: "it-IT", timezoneId: "Europe/Rome", serviceWorkers: "allow" });
const page = await ctx.newPage();
const errori = [];
page.on("pageerror", (e) => errori.push(String(e)));
const url = `${base}?centro=7.42,44.31&zoom=13`;
await page.goto(url);
await page.waitForSelector("body[data-mappa-pronta='1']", { timeout: 90000 });
// il service worker deve prendere il controllo della pagina (alla prima visita serve un nuovo caricamento)
await page.evaluate(() => navigator.serviceWorker.ready);
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
  await page.reload();
  await page.waitForSelector("body[data-mappa-pronta='1']", { timeout: 90000 });
}
console.log("service worker attivo:", await page.evaluate(() => !!navigator.serviceWorker.controller));
await page.locator("button[aria-label='Strumenti e livelli della mappa']").click();
await page.locator(".voce-menu", { hasText: "Mappe senza rete" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Scarica (circa"), null, { timeout: 30000 });
const stima = await page.locator("button", { hasText: "Scarica (circa" }).innerText();
await page.locator("button", { hasText: "Scarica (circa" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Ora funziona anche senza rete"), null, { timeout: 300000 });
const fatto = await page.locator("p", { hasText: "Fatto:" }).innerText();
console.log("stima:", stima.replace(/\s+/g, " "), "· risultato:", fatto);

const messaggi = [];
page.on("console", (m) => messaggi.push(`[${m.type()}] ${m.text()}`));
page.on("requestfailed", (r) => messaggi.push(`[rete] ${r.url().slice(-70)} ${r.failure()?.errorText}`));
await ctx.setOffline(true);
await page.reload();
try {
  await page.waitForSelector("body[data-mappa-pronta='1']", { timeout: 60000 });
} catch (e) {
  await page.screenshot({ path: `${uscita}/30_senza_rete_errore.png` });
  console.log("TESTO:", (await page.evaluate(() => document.body.innerText)).slice(0, 400));
  console.log(messaggi.slice(0, 40).join("\n"));
  throw e;
}
await page.waitForTimeout(2500);
await page.screenshot({ path: `${uscita}/30_senza_rete_mappa.png` });
const p = await page.evaluate(async () => {
  const b = globalThis.bole;
  const r = await b.punto(7.42, 44.31);
  return { quota: r?.quota, categoria: r?.categoria, meteo: b.meteo?.oggi?.oggi };
});
console.log("senza rete, punto 7.42/44.31:", JSON.stringify(p));
await page.locator("#mappa canvas").click({ position: { x: 195, y: 330 } });
await page.waitForFunction(() => document.body.innerText.includes("Il posto"), null, { timeout: 30000 });
await page.evaluate(() => document.querySelectorAll(".foglio details").forEach((d) => d.open = true));
await page.waitForTimeout(800);
await page.screenshot({ path: `${uscita}/31_senza_rete_perche.png` });
console.log(errori.length ? "ERRORI:\n" + errori.join("\n") : "nessun errore");
await browser.close();

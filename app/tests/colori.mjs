// Prova dei colori dell'indice: i pixel colorati sulla mappa devono essere toni caldi (dal giallo al
// rosso scuro, come la legenda), mai viola, lilla o verde. Confronta la mappa con e senza indice.
// Uso: CHROMIUM=<percorso> node tests/colori.mjs <url-app> <cartella-uscita>, poi python3 tests/colori_conta.py <cartella-uscita>
import { webkit, chromium, devices } from "playwright";
const [base, uscita] = process.argv.slice(2);
const viste = [["cuneese_z11", "7.45,44.35", 11], ["liguria_z10", "8.45,44.38", 10], ["ceva_z12", "8.1,44.33", 12], ["valle_z14", "7.40,44.30", 14]];
for (const [tel, br, opt] of [["iphone", webkit, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ["android", chromium, devices["Pixel 7"]]]) {
  const b = await br.launch(tel === "android" ? { executablePath: process.env.CHROMIUM || undefined } : {});
  const p = await (await b.newContext({ ...opt, locale: "it-IT" })).newPage();
  for (const [nome, c, z] of viste) {
    await p.goto(`${base}?centro=${c}&zoom=${z}`);
    await p.waitForSelector("body[data-mappa-pronta='1']", { timeout: 120000 });
    await p.locator("button[aria-label='Chiudi il consiglio']").click({ timeout: 3000 }).catch(() => {});
    await p.evaluate(() => new Promise((ok) => { const m = globalThis.bole.mappa; m.once("idle", ok); m.triggerRepaint(); }));
    await p.waitForTimeout(1500);
    const area = await p.locator("#mappa").boundingBox();
    await p.screenshot({ path: `${uscita}/${tel}_${nome}.png`, clip: area });
    await p.evaluate(() => globalThis.bole.mappa.setLayoutProperty("indice", "visibility", "none"));
    await p.evaluate(() => new Promise((ok) => { const m = globalThis.bole.mappa; m.once("idle", ok); m.triggerRepaint(); }));
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${uscita}/${tel}_${nome}_senza.png`, clip: area });
    console.log("schermate", tel, nome);
  }
  await b.close();
}

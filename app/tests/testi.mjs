// Schermate di Regole e Guida (testi lunghi): in alto, scorse, e una scheda specie aperta.
import { webkit } from "playwright";
const [base, uscita] = process.argv.slice(2);
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  locale: "it-IT", timezoneId: "Europe/Rome", geolocation: { latitude: 44.3075, longitude: 7.4006 }, permissions: ["geolocation"] });
const page = await ctx.newPage();
const errori = [];
page.on("pageerror", (e) => errori.push(String(e)));
const foto = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${uscita}/${n}.png` }); console.log("schermata", n); };
const scorri = (y) => page.locator(".foglio .corpo").evaluate((e, y) => e.scrollTo(0, y), y);
await page.goto(`${base}?centro=7.42,44.31&zoom=11.5`);
await page.waitForSelector("body[data-mappa-pronta='1']", { timeout: 90000 });
await page.locator("nav.schede button", { hasText: "Regole" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Serve il titolo"), null, { timeout: 30000 });
await foto("20_regole_alto");
await scorri(650); await foto("21_regole_mezzo");
await scorri(99999); await foto("22_regole_fondo");
await page.locator("nav.schede button", { hasText: "Guida" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Centro micologico di"), null, { timeout: 30000 });
await foto("23_guida_alto");
await page.locator("#guida-ovolo summary").click();
await page.locator("#guida-ovolo").evaluate((e) => e.scrollIntoView());
await foto("24_guida_ovolo");
await page.locator("#guida-chiodino summary").click();
await page.locator("#guida-chiodino").evaluate((e) => e.scrollIntoView());
await foto("25_guida_chiodino");
console.log(errori.length ? errori.join("\n") : "nessun errore");
await browser.close();

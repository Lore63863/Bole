// Prova delle funzioni dell'MVP su WebKit a misura di iPhone 13 Pro (390×844, densità 3).
// Apre l'app, tocca le schede e i tasti come farebbe una persona e salva una schermata per passo.
// Uso: node tests/funzioni.mjs <url-base> <cartella-uscita>
// TELEFONO=android: stesso giro su Chrome (motore Chromium) a misura di un Pixel 7 (412×839).
// CHROMIUM=<percorso> se il Chromium installato non è quello che Playwright si aspetta.
import { chromium, devices, webkit } from "playwright";

const [base, uscita] = process.argv.slice(2);
const android = process.env.TELEFONO === "android";
const browser = android ? await chromium.launch({ executablePath: process.env.CHROMIUM || undefined }) : await webkit.launch();
const ctx = await browser.newContext({
  ...(android ? devices["Pixel 7"] : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }),
  locale: "it-IT", timezoneId: "Europe/Rome",
  geolocation: { latitude: 44.3075, longitude: 7.4006, accuracy: 15 }, // bosco sopra Valdieri (CN), punto di prova
  permissions: ["geolocation"],
});
const page = await ctx.newPage();
const errori = [];
page.on("pageerror", (e) => errori.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errori.push(`[${m.type()}] ${m.text()}`); });

const foto = async (nome) => { await page.waitForTimeout(400); await page.screenshot({ path: `${uscita}/${nome}.png` }); console.log("schermata", nome); };
const aspettaTesto = (t, timeout = 60000) => page.waitForFunction((t) => document.body.innerText.includes(t), t, { timeout });
const scheda = (nome) => page.locator("nav.schede button", { hasText: nome }).click();

await page.goto(`${base}?centro=7.42,44.31&zoom=11.5`, { waitUntil: "load" });
await page.waitForSelector("body[data-mappa-pronta='1']", { timeout: 90000 });
await page.waitForSelector("body[data-andamento-pronto='1']", { timeout: 60000 });
await foto("01_mappa");

// Perché qui?
await page.locator("#mappa canvas").click({ position: { x: 195, y: 300 } });
await aspettaTesto("Il posto");
await page.evaluate(() => document.querySelectorAll(".foglio details").forEach((d) => d.open = true));
await foto("02_perche_qui");
await page.locator(".foglio .corpo").evaluate((e) => e.scrollTo(0, 700));
await foto("03_perche_qui_meteo");

// Vicino a me
await scheda("Vicino");
await page.waitForFunction(() => document.querySelector(".classifica") || document.body.innerText.includes("Nessuna zona"), null, { timeout: 120000 });
await foto("04_vicino");

// Diario: nuova voce
await scheda("Diario");
await aspettaTesto("Nuova voce");
await foto("05_diario_vuoto");
await page.locator("button", { hasText: "Nuova voce" }).click();
await page.locator(".foglio select").nth(1).selectOption("porcino");
await page.locator(".foglio select").nth(2).selectOption("pochi");
await page.locator(".foglio textarea").fill("Prova: bordo del faggeto, versante nord.");
await page.waitForFunction(() => document.body.innerText.includes("Posizione GPS: 44.3"), null, { timeout: 20000 });
await page.locator(".foglio button", { hasText: "Salva" }).click();
await aspettaTesto("Salvato nel diario");
await foto("06_diario_voce");
await scheda("Diario");
await aspettaTesto("Porcino");
await foto("07_diario_elenco");

// Regole e Guida
await scheda("Regole");
await page.waitForFunction(() => document.body.innerText.includes("Regole della regione"), null, { timeout: 30000 });
await foto("08_regole");
await scheda("Guida");
await aspettaTesto("Le 14 specie");
await foto("09_guida");

// Strumenti: In bosco, Mappe senza rete, Preferite
await scheda("Mappa");
await page.locator("button[aria-label='Strumenti e livelli della mappa']").click();
await aspettaTesto("Livelli della mappa");
await foto("10_strumenti");
await page.locator(".voce-menu", { hasText: "In bosco" }).click();
await aspettaTesto("Torna all'auto");
await page.waitForTimeout(1500);
await page.locator("button", { hasText: "L'auto è qui" }).click();
await foto("11_in_bosco");
await scheda("Mappa");
await page.locator("button[aria-label='Strumenti e livelli della mappa']").click();
await page.locator(".voce-menu", { hasText: "Mappe senza rete" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Scarica (circa") || document.body.innerText.includes("troppo"), null, { timeout: 30000 });
await foto("12_offline");

console.log(errori.length ? "MESSAGGI:\n" + errori.join("\n") : "nessun errore");
await browser.close();

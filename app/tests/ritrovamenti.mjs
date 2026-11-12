// Prova dei punti sulla mappa, del diario e della condivisione col gruppo, su WebKit a misura di iPhone 13 Pro.
// Due telefoni (il tuo e quello di un amico), il server della condivisione acceso in locale con "wrangler dev".
// Controlla anche che dal telefono escano solo i 5 campi previsti e mai il punto preciso.
// Uso: node tests/ritrovamenti.mjs <url-app costruita con VITE_CONDIVISIONE=http://127.0.0.1:8788> <cartella-uscita> <cartella-server>
import { chromium, devices, webkit } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const [base, uscita, cartellaServer] = process.argv.slice(2);
const SERVER = "http://127.0.0.1:8788";
const STATO = ".stato-e2e";
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
const sql = (c) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "bole-condivisione", "--local", "--persist-to", STATO, "--json", "--command", c],
  { cwd: cartellaServer, env, encoding: "utf8" }))[0].results;

// --- server locale ----------------------------------------------------------------------------------
rmSync(`${cartellaServer}/${STATO}`, { recursive: true, force: true });
execFileSync("npx", ["wrangler", "d1", "execute", "bole-condivisione", "--local", "--persist-to", STATO, "--file", "schema.sql"], { cwd: cartellaServer, env, stdio: "ignore" });
const server = spawn("npx", ["wrangler", "dev", "--local", "--port", "8788", "--ip", "127.0.0.1", "--persist-to", STATO],
  { cwd: cartellaServer, env, stdio: "ignore", detached: true });
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`${SERVER}/v1/stato`)).ok) break; } catch { /* non ancora */ }
  await new Promise((r) => setTimeout(r, 500));
}

let ok = 0, ko = 0;
const verifica = (cosa, condizione, dettaglio = "") => {
  if (condizione) { ok++; console.log("  ✓", cosa); } else { ko++; console.log("  ✗", cosa, dettaglio); }
};

// AMICO=android: il telefono dell'amico è un Android (Chrome, misura Pixel 7); CHROMIUM=<percorso> se serve.
const browser = await webkit.launch();
const browserAndroid = process.env.AMICO === "android" ? await chromium.launch({ executablePath: process.env.CHROMIUM || undefined }) : null;
const telefono = async (lat, lon, android = false) => {
  const ctx = await (android ? browserAndroid : browser).newContext({
    ...(android ? devices["Pixel 7"] : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }),
    locale: "it-IT", timezoneId: "Europe/Rome", geolocation: { latitude: lat, longitude: lon, accuracy: 6 }, permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  const t = { ctx, page, errori: [], richieste: [], fase: "normale", senzaRete: [] };
  page.on("pageerror", (e) => t.errori.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error" || m.text().includes("GL Driver Message")) return; // avvisi della scheda grafica di prova
    // senza rete WebKit scrive "Failed to load resource" per ogni richiesta fallita: è atteso
    if (t.fase === "senza rete" && m.text().startsWith("Failed to load resource")) t.senzaRete.push(m.text());
    else t.errori.push(`[console, ${t.fase}] ${m.text()}`);
  });
  // le tessere annullate dalla mappa quando si sposta ("cancelled") sono normali
  page.on("requestfailed", (r) => { if (t.fase !== "senza rete" && !/cancel/i.test(r.failure()?.errorText ?? "")) t.errori.push(`[rete, ${t.fase}] ${r.url()} ${r.failure()?.errorText}`); });
  page.on("request", (r) => t.richieste.push({ url: r.url(), metodo: r.method(), corpo: r.postData() }));
  return t;
};
const A = await telefono(44.3075, 7.4006); // il tuo, nel bosco sopra Valdieri
const B = await telefono(44.39, 7.55, !!browserAndroid); // l'amico, a Cuneo

const foto = async (p, nome) => { await p.waitForTimeout(500); await p.screenshot({ path: `${uscita}/${nome}.png` }); console.log("schermata", nome); };
const testo = (p, t, timeout = 60000) => p.waitForFunction((t) => document.body.innerText.includes(t), t, { timeout });
const scheda = (p, nome) => p.locator("nav.schede button", { hasText: nome }).click();
const strumenti = async (p, voce) => {
  await scheda(p, "Mappa");
  await p.locator("button[aria-label='Strumenti e livelli della mappa']").click();
  await p.locator(".voce-menu", { hasText: voce }).click();
};
const apri = async (p, url) => {
  await p.goto(url, { waitUntil: "load" });
  await p.waitForSelector("body[data-mappa-pronta='1']", { timeout: 90000 });
  await p.waitForSelector("body[data-punti-pronti]", { timeout: 30000 });
  await p.locator("button[aria-label='Chiudi il consiglio']").click().catch(() => {}); // come dopo averla messa sulla Home
};

try {
  await apri(A.page, `${base}?centro=7.4006,44.3075&zoom=14`);
  await apri(B.page, `${base}?centro=7.55,44.39&zoom=11`);

  console.log("Gruppo");
  await strumenti(A.page, "Ritrovamenti con il gruppo");
  await testo(A.page, "Ho un codice");
  await foto(A.page, "20_gruppo_senza");
  await A.page.locator("button", { hasText: "Crea un gruppo" }).click();
  const codice = (await A.page.locator(".codice").innerText()).trim();
  verifica("codice creato", /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(codice), codice);
  await A.page.locator("button", { hasText: "Usa questo gruppo" }).click();
  await testo(A.page, "Il tuo gruppo");
  await foto(A.page, "21_gruppo");
  await strumenti(B.page, "Ritrovamenti con il gruppo");
  await B.page.locator("input[aria-label='Codice del gruppo']").fill(codice.toLowerCase().replace(/-/g, " "));
  await B.page.locator("button", { hasText: "Entra nel gruppo" }).click();
  await testo(B.page, "Il tuo gruppo");
  verifica("l'amico entra con il codice scritto a mano", true);
  await B.page.locator("input").count(); // niente

  console.log("Pressione lunga e condivisione");
  await scheda(A.page, "Mappa");
  const cont = A.page.locator("#mappa .maplibregl-canvas-container");
  const box = await cont.boundingBox();
  const px = box.x + 150, py = box.y + 170;
  // pressione lunga col dito (eventi touch veri), come su iPhone
  await A.page.evaluate(([x, y]) => {
    const z = document.querySelector("#mappa .maplibregl-canvas-container");
    const l = document.createTouchList(document.createTouch(window, z, 1, x, y, x, y));
    z.dispatchEvent(new TouchEvent("touchstart", { touches: l, targetTouches: l, changedTouches: l, bubbles: true }));
  }, [px, py]);
  await A.page.waitForTimeout(800);
  await A.page.evaluate(([x, y]) => {
    const z = document.querySelector("#mappa .maplibregl-canvas-container");
    const l = document.createTouchList(document.createTouch(window, z, 1, x, y, x, y)), vuota = document.createTouchList();
    z.dispatchEvent(new TouchEvent("touchend", { touches: vuota, targetTouches: vuota, changedTouches: l, bubbles: true }));
  }, [px, py]);
  await testo(A.page, "Punto scelto sulla mappa", 10000);
  verifica("la pressione lunga apre la nuova voce sul punto", true);
  await A.page.locator(".foglio select").nth(1).selectOption("porcino");
  await A.page.locator(".foglio select").nth(2).selectOption("abbastanza");
  await A.page.locator(".foglio textarea").fill("Sotto i faggi, vicino al sentiero.");
  await A.page.locator(".interruttore", { hasText: "Condividi con il gruppo" }).locator("input").check();
  await testo(A.page, "Gli altri vedranno: Porcino");
  await A.page.locator(".foglio .corpo").evaluate((e) => e.scrollTo(0, 400));
  await foto(A.page, "22_nuova_voce_condivisa");
  await A.page.locator(".foglio button", { hasText: "Salva" }).click();
  await testo(A.page, "Salvato nel diario");
  await testo(A.page, "Condiviso col gruppo", 15000);
  await foto(A.page, "23_salvata_condivisa");

  console.log("Che cosa è uscito dal telefono");
  const posts = A.richieste.filter((r) => r.metodo === "POST" && r.url.startsWith(SERVER));
  verifica("un solo invio al server", posts.length === 1, String(posts.length));
  const corpo = JSON.parse(posts[0]?.corpo ?? "{}");
  verifica("solo cella, specie, quantità, giorno e codice per toglierlo", Object.keys(corpo).sort().join(",") === "cella,data,quantita,specie,token", JSON.stringify(corpo));
  const voci = await A.page.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open("bole", 1);
    r.onsuccess = () => { const g = r.result.transaction("diario").objectStore("diario").getAll(); g.onsuccess = () => ok(g.result.map((v) => ({ lat: v.lat, lon: v.lon, ora: v.ora, note: v.note }))); };
  }));
  const v0 = voci[0];
  const tutto = A.richieste.filter((r) => r.url.startsWith(SERVER)).map((r) => `${r.url} ${r.corpo ?? ""}`).join("\n");
  verifica("il punto preciso non esce", !tutto.includes(String(v0.lat)) && !tutto.includes(String(v0.lon)) && !tutto.includes(v0.lat.toFixed(4)), tutto);
  verifica("l'ora e le note non escono", !tutto.includes(v0.ora) && !tutto.includes("faggi"));
  const host = new Set([...A.richieste, ...B.richieste].map((r) => r.url).filter((u) => u.startsWith("http")).map((u) => new URL(u).host));
  verifica("si parla solo con l'app e col suo server", [...host].every((h) => h === "127.0.0.1:4173" || h === "127.0.0.1:8788"), [...host].join(", "));

  console.log("Sposta il punto, uscita a vuoto, auto e preferita");
  await scheda(A.page, "Diario");
  await A.page.locator("button", { hasText: "Nuova voce" }).click();
  await testo(A.page, "Posizione GPS: 44.3");
  await A.page.locator("button", { hasText: "Sposta il punto" }).click();
  await A.page.waitForSelector(".barra-punto");
  await A.page.waitForTimeout(800);
  await foto(A.page, "24_sposta_punto");
  await A.page.mouse.move(195, 360); await A.page.mouse.down(); await A.page.mouse.move(120, 300, { steps: 8 }); await A.page.mouse.up();
  await A.page.locator("button", { hasText: "Usa questo punto" }).click();
  await testo(A.page, "Punto scelto sulla mappa");
  verifica("il mirino rimette il punto nel modulo", true);
  await A.page.locator(".foglio select").nth(0).selectOption("a vuoto");
  await A.page.locator(".foglio select").nth(1).selectOption("porcino");
  await A.page.locator(".foglio button", { hasText: "Salva" }).click();
  await testo(A.page, "Salvato nel diario");
  await strumenti(A.page, "In bosco");
  await testo(A.page, "Torna all'auto");
  await A.page.waitForTimeout(1500);
  await A.page.locator("button", { hasText: "L'auto è qui" }).click();
  await scheda(A.page, "Mappa");
  await A.page.evaluate(() => globalThis.bole.mappa.jumpTo({ center: [7.3985, 44.3095], zoom: 15 }));
  await A.page.waitForTimeout(800);
  await A.page.locator("#mappa canvas").click({ position: { x: 250, y: 190 } });
  await testo(A.page, "Il posto");
  await A.page.locator("button", { hasText: "Salva tra le preferite" }).click();
  await A.page.locator(".foglio button", { hasText: "Salva" }).click();
  await testo(A.page, "salvata tra le preferite");
  await scheda(A.page, "Mappa");
  await A.page.waitForFunction(() => Number(document.body.dataset.puntiPronti) >= 4, null, { timeout: 15000 });
  await A.page.evaluate(async () => {
    const m = globalThis.bole.mappa;
    const c = (await m.getSource("miei").getData()).features.map((f) => f.geometry.coordinates);
    const lon = c.map((x) => x[0]), lat = c.map((x) => x[1]);
    m.fitBounds([[Math.min(...lon), Math.min(...lat)], [Math.max(...lon), Math.max(...lat)]], { padding: { top: 60, bottom: 110, left: 70, right: 90 }, duration: 0, maxZoom: 16 });
  });
  await A.page.waitForTimeout(1200);
  await foto(A.page, "25_mappa_miei_punti");
  const sulPunto = await A.page.evaluate(() => {
    const m = globalThis.bole.mappa;
    const f = m.queryRenderedFeatures({ layers: ["miei-punti"] }).find((x) => x.properties.icona === "bole-fungo");
    return f ? m.project(f.geometry.coordinates) : null;
  });
  verifica("i quattro tipi di punto sono sulla mappa", await A.page.evaluate(() =>
    new Set(globalThis.bole.mappa.queryRenderedFeatures({ layers: ["miei-punti"] }).map((f) => f.properties.icona)).size === 4));
  await A.page.locator("#mappa canvas").click({ position: { x: sulPunto.x, y: sulPunto.y } });
  await testo(A.page, "Quel giorno, qui, la mappa diceva");
  await foto(A.page, "26_voce");
  verifica("toccare il punto apre la sua scheda", true);
  await A.page.locator("button", { hasText: "Perché qui?" }).click();
  await testo(A.page, "Il tuo diario qui vicino");
  await A.page.locator(".foglio .corpo").evaluate((e) => {
    const h = [...e.querySelectorAll("h3")].find((x) => x.textContent.includes("Il tuo diario"));
    e.scrollTo(0, h.closest(".scheda").offsetTop - 60);
  });
  await foto(A.page, "27_perche_qui_storico");
  await scheda(A.page, "Diario");
  await testo(A.page, "Le tue statistiche");
  await foto(A.page, "28_diario_statistiche");
  await scheda(A.page, "Vicino");
  await A.page.waitForFunction(() => document.querySelector(".classifica") || document.body.innerText.includes("Nessuna zona"), null, { timeout: 120000 });
  await foto(A.page, "29_vicino");

  console.log("Il giorno dopo, sul telefono dell'amico");
  const prima = await B.page.evaluate(() => fetch("http://127.0.0.1:8788/v1/ritrovamenti", { headers: { "X-Bole-Gruppo": JSON.parse(localStorage.getItem("bole.gruppo.codice")) } }).then((r) => r.json()));
  verifica("oggi l'amico non vede ancora niente", prima.ritrovamenti.length === 0);
  sql("UPDATE ritrovamenti SET data = date(data, '-1 day'), creato_giorno = date(creato_giorno, '-1 day')");
  await strumenti(B.page, "Ritrovamenti con il gruppo");
  await B.page.locator("button", { hasText: "Aggiorna" }).click();
  await testo(B.page, "1 segnalazione degli altri");
  await foto(B.page, "30_gruppo_amico");
  await B.page.locator("button", { hasText: "Vedi sulla mappa" }).click();
  await B.page.waitForTimeout(1500);
  await B.page.waitForSelector("body[data-mappa-pronta='1']");
  await foto(B.page, "31_mappa_gruppo");
  const badge = await B.page.evaluate(() => {
    const m = globalThis.bole.mappa;
    const f = m.queryRenderedFeatures({ layers: ["gruppo-numeri-fondo"] })[0];
    return f ? m.project(f.geometry.coordinates) : null;
  });
  verifica("il quadrato del gruppo è sulla mappa dell'amico", !!badge);
  await B.page.locator("#mappa canvas").click({ position: { x: badge.x, y: badge.y } });
  await testo(B.page, "In questo quadrato di 1 km");
  await foto(B.page, "32_cella_gruppo");
  await scheda(B.page, "Mappa");
  await B.page.locator("#mappa canvas").click({ position: { x: badge.x + 40, y: badge.y + 30 } });
  await testo(B.page, "Segnalazioni del gruppo");
  await B.page.locator(".foglio .corpo").evaluate((e) => {
    const h = [...e.querySelectorAll("h3")].find((x) => x.textContent.includes("Segnalazioni del gruppo"));
    e.scrollTo(0, h.closest(".scheda").offsetTop - 60);
  });
  await foto(B.page, "33_perche_qui_gruppo");
  verifica("l'amico non vede il punto preciso né le note", !(await B.page.evaluate(() => document.body.innerText)).includes("faggi"));

  console.log("Senza rete: resta in coda e parte dopo");
  A.fase = "senza rete";
  await A.ctx.setOffline(true);
  await scheda(A.page, "Diario");
  await A.page.locator("button", { hasText: "Nuova voce" }).click();
  await testo(A.page, "Posizione GPS: 44.3");
  await A.page.locator(".foglio select").nth(1).selectOption("gallinaccio");
  await A.page.locator(".interruttore", { hasText: "Condividi con il gruppo" }).locator("input").check();
  await A.page.locator(".foglio button", { hasText: "Salva" }).click();
  await testo(A.page, "In coda per il gruppo", 20000);
  verifica("senza rete la voce resta in coda", true);
  const inviatiPrima = sql("SELECT COUNT(*) AS n FROM ritrovamenti")[0].n;
  await A.ctx.setOffline(false);
  await A.page.evaluate(() => window.dispatchEvent(new Event("online")));
  for (let i = 0; i < 30 && sql("SELECT COUNT(*) AS n FROM ritrovamenti")[0].n === inviatiPrima; i++) await A.page.waitForTimeout(500);
  verifica("tornata la rete, parte da sola", sql("SELECT COUNT(*) AS n FROM ritrovamenti")[0].n === inviatiPrima + 1);
  await A.page.waitForTimeout(1000);
  A.fase = "normale";
  console.log(`  · richieste fallite mentre era senza rete (attese): ${A.senzaRete.length}`);

  console.log("Togliere");
  await scheda(A.page, "Diario");
  await A.page.locator(".riga-voce", { hasText: "Porcino" }).first().click();
  await A.page.locator("button", { hasText: "Togli dal gruppo" }).click();
  await testo(A.page, "Non condiviso");
  for (let i = 0; i < 20 && sql("SELECT COUNT(*) AS n FROM ritrovamenti WHERE specie = 'porcino'")[0].n > 0; i++) await A.page.waitForTimeout(500);
  verifica("«Togli dal gruppo» lo cancella dal server", sql("SELECT COUNT(*) AS n FROM ritrovamenti WHERE specie = 'porcino'")[0].n === 0);

  verifica("nessun errore sul tuo telefono", A.errori.length === 0, A.errori.join("\n"));
  verifica("nessun errore sul telefono dell'amico", B.errori.length === 0, B.errori.join("\n"));
} finally {
  await browser.close();
  await browserAndroid?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
}
console.log(`\n${ok} controlli passati, ${ko} falliti`);
if (ko) process.exit(1);

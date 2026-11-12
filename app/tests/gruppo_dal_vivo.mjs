// Prova dal vivo del gruppo: sito pubblicato + server su Cloudflare. Il tuo telefono è un iPhone (WebKit,
// misura iPhone 13 Pro), quello dell'amico un Android (Chromium, misura Pixel 7).
// Crea un gruppo nuovo, manda un ritrovamento di prova, controlla che cosa esce dal telefono e lo toglie
// subito dal server: non lascia dati. La visibilità «dal giorno dopo» qui non si può provare (oggi l'amico
// deve vedere zero): è provata in locale da tests/ritrovamenti.mjs.
// Uso: CHROMIUM=<percorso> node tests/gruppo_dal_vivo.mjs <url-sito> <url-server> <cartella-uscita>
import { chromium, devices, webkit } from "playwright";

const [base, SERVER, uscita] = process.argv.slice(2);
const SITO = new URL(base).host, HOST_SERVER = new URL(SERVER).host;

let ok = 0, ko = 0;
const verifica = (cosa, condizione, dettaglio = "") => {
  if (condizione) { ok++; console.log("  ✓", cosa); } else { ko++; console.log("  ✗", cosa, dettaglio); }
};

const wk = await webkit.launch();
const cr = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const telefono = async (lat, lon, android) => {
  const ctx = await (android ? cr : wk).newContext({
    ...(android ? devices["Pixel 7"] : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }),
    locale: "it-IT", timezoneId: "Europe/Rome", geolocation: { latitude: lat, longitude: lon, accuracy: 6 }, permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  const t = { ctx, page, errori: [], richieste: [], risposte: [] };
  page.on("pageerror", (e) => t.errori.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("GL Driver Message")) t.errori.push(`[console] ${m.text()}`); });
  // le tessere annullate dalla mappa quando si sposta sono normali
  page.on("requestfailed", (r) => { if (!/cancel|abort/i.test(r.failure()?.errorText ?? "")) t.errori.push(`[rete] ${r.url()} ${r.failure()?.errorText}`); });
  page.on("request", (r) => t.richieste.push({ url: r.url(), metodo: r.method(), corpo: r.postData() }));
  page.on("response", (r) => { if (r.url().startsWith(SERVER)) t.risposte.push({ url: r.url(), metodo: r.request().method(), stato: r.status() }); });
  return t;
};
const A = await telefono(44.3075, 7.4006, false); // il tuo (iPhone)
const B = await telefono(44.39, 7.55, true);      // l'amico (Android)

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
  await p.waitForSelector("body[data-mappa-pronta='1']", { timeout: 120000 });
  await p.waitForSelector("body[data-punti-pronti]", { timeout: 60000 });
  await p.locator("button[aria-label='Chiudi il consiglio']").click({ timeout: 5000 }).catch(() => {});
};


try {
  await apri(A.page, `${base}?centro=7.4006,44.3075&zoom=14`);
  await apri(B.page, `${base}?centro=7.55,44.39&zoom=11`);

  console.log("Gruppo");
  await strumenti(A.page, "Ritrovamenti con il gruppo");
  await testo(A.page, "Ho un codice");
  await A.page.locator("button", { hasText: "Crea un gruppo" }).click();
  const codice = (await A.page.locator(".codice").innerText()).trim();
  verifica("codice creato", /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(codice), codice);
  await A.page.locator("button", { hasText: "Usa questo gruppo" }).click();
  await testo(A.page, "Il tuo gruppo");
  await foto(A.page, "40_vivo_gruppo_iphone");
  await strumenti(B.page, "Ritrovamenti con il gruppo");
  await B.page.locator("input[aria-label='Codice del gruppo']").fill(codice);
  await B.page.locator("button", { hasText: "Entra nel gruppo" }).click();
  await testo(B.page, "Il tuo gruppo");
  verifica("l'amico (Android) entra con il codice", true);

  console.log("Ritrovamento condiviso");
  await scheda(A.page, "Diario");
  await A.page.locator("button", { hasText: "Nuova voce" }).click();
  await testo(A.page, "Posizione GPS: 44.3");
  await A.page.locator(".foglio select").nth(1).selectOption("porcino");
  await A.page.locator(".foglio textarea").fill("Prova dal vivo, note private.");
  await A.page.locator(".interruttore", { hasText: "Condividi con il gruppo" }).locator("input").check();
  await A.page.locator(".foglio button", { hasText: "Salva" }).click();
  await testo(A.page, "Salvato nel diario");
  await testo(A.page, "Condiviso col gruppo", 30000);

  await foto(A.page, "41_vivo_condiviso");
  const post = A.risposte.filter((r) => r.metodo === "POST");
  verifica("il server accetta il ritrovamento (201)", post.length === 1 && post[0].stato === 201, JSON.stringify(post));

  console.log("Che cosa è uscito dal telefono");
  const posts = A.richieste.filter((r) => r.metodo === "POST" && r.url.startsWith(SERVER));
  const corpo = JSON.parse(posts[0]?.corpo ?? "{}");
  verifica("solo cella, specie, quantità, giorno e codice per toglierlo", Object.keys(corpo).sort().join(",") === "cella,data,quantita,specie,token", JSON.stringify(corpo));
  verifica("la cella è il quadrato di 1 km", /^1kmE\d{4}N\d{4}$/.test(corpo.cella ?? ""), corpo.cella);
  const tutto = A.richieste.filter((r) => r.url.startsWith(SERVER)).map((r) => `${r.url} ${r.corpo ?? ""}`).join("\n");
  verifica("il punto preciso non esce", !/44\.307|7\.400/.test(tutto), tutto);
  verifica("le note non escono", !tutto.includes("note private"));
  const host = new Set([...A.richieste, ...B.richieste].map((r) => r.url).filter((u) => u.startsWith("http")).map((u) => new URL(u).host));
  verifica("si parla solo con il sito e col suo server", [...host].every((h) => h === SITO || h === HOST_SERVER), [...host].join(", "));

  console.log("Sul telefono dell'amico, oggi");
  const oggi = await B.page.evaluate(([s, c]) => fetch(`${s}/v1/ritrovamenti`, { headers: { "X-Bole-Gruppo": c } }).then((r) => r.json()), [SERVER, codice]);
  verifica("oggi l'amico non vede ancora niente (si vede dal giorno dopo)", Array.isArray(oggi.ritrovamenti) && oggi.ritrovamenti.length === 0, JSON.stringify(oggi));
  await strumenti(B.page, "Ritrovamenti con il gruppo");
  await B.page.locator("button", { hasText: "Aggiorna" }).click();
  await B.page.waitForTimeout(2500);
  await foto(B.page, "42_vivo_gruppo_android");
  verifica("«Aggiorna» sull'Android parla col server", B.risposte.some((r) => r.metodo === "GET" && r.stato === 200), JSON.stringify(B.risposte));

  console.log("Togliere");
  await scheda(A.page, "Diario");
  await A.page.locator(".riga-voce", { hasText: "Porcino" }).first().click();
  await A.page.locator("button", { hasText: "Togli dal gruppo" }).click();
  await testo(A.page, "Non condiviso");
  for (let i = 0; i < 30 && !A.risposte.some((r) => r.metodo === "DELETE"); i++) await A.page.waitForTimeout(500);
  const del = A.risposte.filter((r) => r.metodo === "DELETE");
  verifica("«Togli dal gruppo» lo cancella dal server (204)", del.length === 1 && del[0].stato === 204, JSON.stringify(del));


  verifica("nessun errore sull'iPhone", A.errori.length === 0, A.errori.join("\n"));
  verifica("nessun errore sull'Android", B.errori.length === 0, B.errori.join("\n"));
} finally {
  // se la prova si è fermata a metà, il ritrovamento di prova si toglie comunque dal server
  const rimasti = await A.page.evaluate((s) => new Promise((fine) => {
    const r = indexedDB.open("bole", 1);
    r.onerror = () => fine(["diario non leggibile"]);
    r.onsuccess = () => {
      const g = r.result.transaction("diario").objectStore("diario").getAll();
      g.onsuccess = async () => {
        const esiti = [];
        for (const v of g.result) {
          const c = v.condivisione;
          if (!c?.id || !c?.token) continue;
          const x = await fetch(`${s}/v1/ritrovamenti/${c.id}`, { method: "DELETE", headers: { "X-Bole-Token": c.token } }).then((y) => y.status).catch(() => 0);
          if (x !== 204 && x !== 404) esiti.push(`${c.id}: ${x}`);
        }
        fine(esiti);
      };
    };
  }), SERVER).catch((e) => [String(e)]);
  if (rimasti.length) { ko++; console.log("  ✗ ATTENZIONE: ritrovamento di prova forse rimasto sul server", rimasti.join(", ")); }
  else console.log("  · server pulito: nessun ritrovamento di prova rimasto");
  await wk.close();
  await cr.close();
}
console.log(`\n${ok} controlli passati, ${ko} falliti`);
if (ko) process.exit(1);

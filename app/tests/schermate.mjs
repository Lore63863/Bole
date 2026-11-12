// Schermate di prova a misura di iPhone 13 Pro (390×844, densità 3) con WebKit.
// Uso: node tests/schermate.mjs <url-base> <cartella-uscita> nome=query [nome=query ...]
import { webkit } from "playwright";

const [base, uscita, ...viste] = process.argv.slice(2);
const browser = await webkit.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  locale: "it-IT", timezoneId: "Europe/Rome",
});
const page = await ctx.newPage();
const errori = [];
page.on("pageerror", (e) => errori.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errori.push(m.text()); });
for (const v of viste) {
  const [nome, query] = v.split("=", 2).length === 2 ? [v.slice(0, v.indexOf("=")), v.slice(v.indexOf("=") + 1)] : [v, ""];
  await page.goto(`${base}?${query}`, { waitUntil: "load" });
  try {
    await page.waitForSelector("body[data-mappa-pronta='1']", { timeout: 60000 });
  } catch { errori.push(`${nome}: la mappa non ha finito di disegnare in 60 s`); }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${uscita}/${nome}.png` });
  console.log("schermata", nome);
}
const webgl = await page.evaluate(() => {
  const c = document.createElement("canvas"); const g = c.getContext("webgl2");
  return g ? g.getParameter(g.VERSION) + " | " + (g.getExtension("WEBGL_debug_renderer_info") ? g.getParameter(g.getExtension("WEBGL_debug_renderer_info").UNMASKED_RENDERER_WEBGL) : "") : "niente WebGL2";
});
console.log("WebGL:", webgl);
if (errori.length) console.log("ERRORI:\n" + errori.join("\n"));
await browser.close();

import { webkit } from "playwright";
const b = await webkit.launch(); const p = await b.newPage();
await p.goto("http://127.0.0.1:4173/prova/atteso.json");
const ris = await p.evaluate(async () => {
  const atteso = await (await fetch("/prova/atteso.json")).json();
  const out = {};
  for (const nome of ["quota", "habitat_c"]) {
    const blob = await (await fetch(`/prova/${nome}.png`)).blob();
    for (const opz of [{ colorSpaceConversion: "none", premultiplyAlpha: "none" }, {}]) {
      const img = await createImageBitmap(blob, opz);
      const c = new OffscreenCanvas(256, 256); const ctx = c.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
      ctx.drawImage(img, 0, 0); const d = ctx.getImageData(0, 0, 256, 256).data;
      let k = 0, diff = 0, max = 0;
      for (let r = 0; r < 256; r += 37) for (let cc = 0; cc < 256; cc += 37) {
        const i = (r * 256 + cc) * 4; const e = atteso[nome][k++];
        for (let j = 0; j < 3; j++) { const dd = Math.abs(d[i + j] - e[j]); if (dd) diff++; max = Math.max(max, dd); }
      }
      out[nome + (opz.colorSpaceConversion ? " (senza conversione)" : " (predefinito)")] = { diversi: diff, max };
    }
  }
  return out;
});
console.log(JSON.stringify(ris, null, 1)); await b.close();

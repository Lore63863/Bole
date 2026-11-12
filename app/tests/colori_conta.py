"""Conta i toni dei pixel colorati dall'indice (schermate con e senza indice di tests/colori.mjs).
Devono essere caldi come la legenda (dal giallo al rosso scuro): mai viola, blu, lilla o verde."""
import sys, glob
from PIL import Image
ko = 0
for f in sorted(glob.glob(sys.argv[1] + "/*_z[0-9]*.png")):
    if f.endswith("_senza.png"):
        continue
    a = Image.open(f).convert("RGB"); b = Image.open(f[:-4] + "_senza.png").convert("RGB")
    pa, pb = a.load(), b.load()
    cambiati = freddi = 0
    for y in range(0, a.size[1], 2):
        for x in range(0, a.size[0], 2):
            r, g, bb = pa[x, y]; r2, g2, b2 = pb[x, y]
            if abs(r - r2) + abs(g - g2) + abs(bb - b2) < 30 or r + g + bb < 200:
                continue
            cambiati += 1
            if bb > r + 30 or (g > r + 30 and g > bb + 30):  # viola, blu, verde netti (sul telefono di Lorenzo: B-R circa 100)
                freddi += 1
    q = freddi / cambiati if cambiati else 0
    ok = cambiati > 500 and q < 0.01
    ko += not ok
    print(("✓" if ok else "✗"), f.split("/")[-1][:-4], cambiati, "pixel colorati,", f"{q*100:.2f}% toni viola, blu o verdi")
sys.exit(1 if ko else 0)

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 2 (Habitat): che cosa dice la griglia in un punto (prova del "Perché qui?").

Come si usa
    python3 pipeline/habitat_punto.py <latitudine> <longitudine> [nome]
    python3 pipeline/habitat_punto.py prova       alcuni luoghi noti, per controllo

Non scrive file: stampa bosco, quota, pendenza, esposizione, suolo e idoneità per specie.
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402
import habitat_calcola as C  # noqa: E402
import rasterio  # noqa: E402
from rasterio.warp import transform as trasforma  # noqa: E402
from rasterio.windows import Window  # noqa: E402

# Luoghi con quota nota, per controllare che la griglia sia al posto giusto
PROVA = [
    (44.3893, 7.5478, "Cuneo, piazza Galimberti (circa 534 m)"),
    (44.6675, 7.0906, "Monviso, vetta (3.841 m)"),
    (45.0703, 7.6869, "Torino, piazza Castello (circa 239 m)"),
    (44.4333, 8.5667, "Monte Beigua, zona di vetta (circa 1.287 m)"),
    (44.2960, 7.6640, "Chiusa di Pesio, versante sopra il paese"),
    (44.1500, 7.9100, "Ormea, versante sopra il paese"),
]
VENTI = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]


def leggi(percorso, rig, col):
    with rasterio.open(percorso) as d:
        return d.read(1, window=Window(col, rig, 1, 1))[0, 0]


def punto(lat, lon, nome=""):
    x, y = trasforma("EPSG:4326", G.CRS, [lon], [lat])
    col, rig = int((x[0] - G.X0) // G.PASSO), int((G.YTOP - y[0]) // G.PASSO)
    print(f"\n{nome or 'Punto'}  ({lat:.4f} N, {lon:.4f} E)")
    if not (0 <= col < G.NCOL and 0 <= rig < G.NRIG) or leggi(G.ELAB / "regione.tif", rig, col) == 0:
        print("  fuori da Piemonte e Liguria")
        return
    v = {n: leggi(G.ELAB / f"{n}.tif", rig, col) for n in
         ("regione", "quota", "pendenza", "esposizione", "carico_termico", "twi", "ph", "categoria", "avvisi", "margine",
          "uso_suolo")}
    uso = {10: "alberi", 20: "arbusti", 30: "prato", 40: "coltivi", 50: "costruito", 60: "terreno nudo", 70: "neve e ghiaccio",
           80: "acqua", 90: "zona umida", 100: "muschi e licheni"}.get(int(v["uso_suolo"]), "senza dato")
    cat = json.loads((G.RADICE / "data" / "categorie.json").read_text(encoding="utf-8")).get(str(v["categoria"]))
    esp = "in piano" if v["esposizione"] == 254 else VENTI[int((v["esposizione"] * 2 + 22.5) // 45) % 8]
    print(f"  regione: {'Piemonte' if v['regione'] == 1 else 'Liguria'}   quota: {v['quota']:.0f} m   "
          f"pendenza: {v['pendenza']}°   esposizione: {esp}")
    print(f"  bosco: {cat['categoria'] + ' (' + cat['codice'] + ')' if cat else 'nessun bosco in carta'}"
          f"{'   AVVISO: castagneto da frutto' if v['avvisi'] & 1 else ''}   margine: codice {v['margine']}"
          f"   uso del suolo: {uso}")
    ph = f"{v['ph'] / 10:.1f}" if v["ph"] else "senza dato"
    print(f"  carico termico: {v['carico_termico'] / 200:.2f}   umidità topografica (TWI): {v['twi'] / 10:.1f}   "
          f"pH del suolo: {ph}")
    h = {s["nome"]: int(leggi(C.HAB / f"H_{s['specie']}.tif", rig, col)) for s in C.leggi_specie()}
    buone = [f"{n} {x}" for n, x in h.items() if x > 0]
    print("  idoneità dell'habitat (0-100): " + (", ".join(buone) if buone else "nessuna"))


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "prova":
        for lat, lon, nome in PROVA:
            punto(lat, lon, nome)
    elif len(sys.argv) >= 3:
        punto(float(sys.argv[1]), float(sys.argv[2]), " ".join(sys.argv[3:]))
    else:
        print(__doc__)

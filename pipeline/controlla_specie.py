#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé — confronto fra la tabella specie e i ritrovamenti pubblici (GBIF).

Per ogni specie conta i record che cadono in Piemonte o in Liguria (cioè su una cella valida
dei nostri modelli del terreno), ne legge la quota e riassume quote e mesi.
Il risultato alimenta la sezione 2 di docs/SPECIE.md.

    python3 pipeline/controlla_specie.py

Serve: numpy, rasterio; i dati scaricati da pipeline/scarica_dati.py.
Il DTM 25 m del Piemonte viene estratto dallo zip in una cartella temporanea (circa 350 MB).
"""
import collections
import glob
import json
import os
import tempfile
import zipfile

import numpy as np
import rasterio
from rasterio.warp import transform

RADICE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dati-grezzi"))
MESI = "gen feb mar apr mag giu lug ago set ott nov dic".split()
# griglia delle mattonelle del DTM Liguria (vedi scarica_dati.py)
X0, YMAX, LATO = 1379054.19189, 4947084.40548, 10000.0


def dtm_piemonte():
    z = os.path.join(RADICE, "piemonte", "dtm25", "DTM25_2009-2011_PIEMONTE_ICE.zip")
    dest = os.path.join(tempfile.gettempdir(), "bole_dtm25")
    tif = os.path.join(dest, "dtm25.tif")
    if not os.path.exists(tif):
        with zipfile.ZipFile(z) as f:
            f.extract("dtm25.tif", dest)
    return rasterio.open(tif)


def quota_liguria(x, y, cache):
    i, j = int((x - X0) // LATO), int((YMAX - y) // LATO)
    nome = os.path.join(RADICE, "liguria", "dtm5", "dtm5_liguria_r%02d_c%02d.tif" % (j, i))
    if i < 0 or j < 0 or not os.path.exists(nome):
        return None
    if nome not in cache:
        cache[nome] = rasterio.open(nome)
    d = cache[nome]
    v = next(d.sample([(x, y)]))[0]
    return None if v == d.nodata else float(v)


def main():
    pie = dtm_piemonte()
    cache = {}
    righe = []
    for f in sorted(glob.glob(os.path.join(RADICE, "ritrovamenti_gbif", "gbif_*.json"))):
        if f.endswith("riepilogo.json"):
            continue
        rec = json.load(open(f))["record"]
        lon = [r["decimalLongitude"] for r in rec]
        lat = [r["decimalLatitude"] for r in rec]
        xp, yp = transform("EPSG:4326", pie.crs, lon, lat)
        xl, yl = transform("EPSG:4326", "EPSG:3003", lon, lat)
        quote, mesi, regione = [], collections.Counter(), collections.Counter()
        for k, r in enumerate(rec):
            q = None
            if pie.bounds.left < xp[k] < pie.bounds.right and pie.bounds.bottom < yp[k] < pie.bounds.top:
                v = next(pie.sample([(xp[k], yp[k])]))[0]
                if v != pie.nodata and v > -100:
                    q = float(v)
                    regione["Piemonte"] += 1
            if q is None:
                q = quota_liguria(xl[k], yl[k], cache)
                if q is not None:
                    regione["Liguria"] += 1
            if q is None:
                continue
            quote.append(q)
            if r.get("month"):
                mesi[r["month"]] += 1
        n = len(quote)
        nm = sum(mesi.values())
        riga = {"specie": os.path.basename(f)[5:-5], "record": len(rec), "in_regione": n, "piemonte": regione["Piemonte"], "liguria": regione["Liguria"]}
        if n >= 8:
            riga["quota_5_95"] = [int(round(np.percentile(quote, 5), -1)), int(round(np.percentile(quote, 95), -1))]
            riga["quota_min_max"] = [int(min(quote)), int(max(quote))]
        if nm >= 8:
            riga["mesi"] = [MESI[m - 1] for m in range(1, 13) if mesi.get(m, 0) / nm >= 0.05]
            riga["picco"] = MESI[mesi.most_common(1)[0][0] - 1]
        righe.append(riga)
        print("%-38s %4d record, %3d in regione (P %d, L %d) | quota %s (min-max %s) | mesi %s | picco %s" % (
            riga["specie"][:38], len(rec), n, regione["Piemonte"], regione["Liguria"], riga.get("quota_5_95", "pochi"),
            riga.get("quota_min_max", "-"), " ".join(riga.get("mesi", ["pochi"])), riga.get("picco", "-")))
    json.dump({"criterio": "record su celle valide dei DTM di Piemonte e Liguria; quota = 5°–95° percentile; mesi con almeno il 5% dei record",
               "specie": righe}, open(os.path.join(RADICE, "ritrovamenti_gbif", "confronto_tabella.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()

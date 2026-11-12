#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 3 (Calibrazione), parte 1: tabella dei ritrovamenti pubblici.

Che cosa fa
    Mette in un'unica tabella i ritrovamenti pubblici (GBIF) delle 14 specie che cadono in
    Piemonte o in Liguria e hanno la data completa, e accanto a ognuno scrive che cosa dice
    la griglia in quel punto: quota, pendenza, esposizione, bosco, uso del suolo, idoneità
    dell'habitat. È la base per calibrare il modello (pipeline/calibra.py).

    Aggiunge le osservazioni verificate di iNaturalist che GBIF non ha ancora
    (dati-elaborati/calibrazione/inat_nuovi.json, da pipeline/inat_controllo.py), saltando
    quelle che GBIF nel frattempo ha già: così una stessa osservazione non conta mai due volte.

    I nomi di chi ha osservato non ci sono: non vengono mai salvati.

Come si usa
    python3 pipeline/calibra_tabella.py

Dove scrive
    dati-elaborati/calibrazione/ritrovamenti.csv
"""
import csv
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402
import habitat_calcola as C  # noqa: E402
import habitat_verifica as V  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from rasterio.warp import transform as trasforma  # noqa: E402

USCITA = G.RADICE / "dati-elaborati" / "calibrazione"
STRATI = ("regione", "quota", "pendenza", "esposizione", "carico_termico", "twi", "ph", "categoria", "uso_suolo", "margine")


INAT_NUOVI = USCITA / "inat_nuovi.json"


def riga(strati, h, s, taxon, data, lat, lon, u, licenza, gbif="", inaturalist=""):
    """Una riga della tabella, oppure None se il punto cade fuori dalle due regioni."""
    x, y = trasforma("EPSG:4326", G.CRS, [lon], [lat])
    col, rig = int((x[0] - G.X0) // G.PASSO), int((G.YTOP - y[0]) // G.PASSO)
    if not (2 <= col < G.NCOL - 2 and 2 <= rig < G.NRIG - 2) or strati["regione"][rig, col] == 0:
        return None
    vicino = h[rig - 2:rig + 3, col - 2:col + 3]
    esp = int(strati["esposizione"][rig, col])
    return {
        "specie": s, "taxon": taxon, "data": data,
        "lat": round(lat, 5), "lon": round(lon, 5),
        "incertezza_m": "" if u is None else int(round(u)),
        "regione": int(strati["regione"][rig, col]), "quota": int(round(float(strati["quota"][rig, col]))),
        "pendenza": int(strati["pendenza"][rig, col]),
        "esposizione": "" if esp >= 254 else esp * 2,
        "carico_termico": round(int(strati["carico_termico"][rig, col]) / 200, 3),
        "twi": round(int(strati["twi"][rig, col]) / 10, 1), "ph": round(int(strati["ph"][rig, col]) / 10, 1),
        "categoria": int(strati["categoria"][rig, col]), "uso_suolo": int(strati["uso_suolo"][rig, col]),
        "margine": int(strati["margine"][rig, col]),
        "habitat": int(h[rig, col]) if h[rig, col] != 255 else 0,
        "habitat_50m": int(np.where(vicino == 255, 0, vicino).max()),
        "licenza": licenza, "gbif": gbif, "inaturalist": inaturalist,
    }


def main():
    strati = {n: G.apri(f"{n}.tif") for n in STRATI}
    righe = []
    inat = json.loads(INAT_NUOVI.read_text(encoding="utf-8"))["specie"] if INAT_NUOVI.exists() else {}
    aggiunti_inat = 0
    for sp in C.leggi_specie():
        s = sp["specie"]
        with rasterio.open(C.HAB / f"H_{s}.tif") as d:
            h = d.read(1)
        visti, inat_in_gbif = set(), set()
        for nome in V.ARCHIVI[s]:
            for r in json.loads((V.GBIF / nome).read_text(encoding="utf-8"))["record"]:
                rif = str(r.get("references") or "")
                if "inaturalist.org/observations/" in rif:
                    inat_in_gbif.add(rif.rstrip("/").rsplit("/", 1)[-1])
                if r.get("key") in visti or None in (r.get("year"), r.get("month"), r.get("day"),
                                                     r.get("decimalLatitude"), r.get("decimalLongitude")):
                    continue
                visti.add(r.get("key"))
                nuova = riga(
                    strati, h, s, r.get("species") or r.get("scientificName") or "",
                    f"{r['year']:04d}-{r['month']:02d}-{r['day']:02d}",
                    r["decimalLatitude"], r["decimalLongitude"], r.get("coordinateUncertaintyInMeters"),
                    (r.get("license") or "").replace("http://creativecommons.org/", "").replace("/legalcode", ""),
                    gbif=r.get("key"),
                    inaturalist=rif.rstrip("/").rsplit("/", 1)[-1] if "inaturalist.org/observations/" in rif else "",
                )
                if nuova:
                    righe.append(nuova)
        # Osservazioni verificate di iNaturalist non ancora arrivate in GBIF.
        for o in inat.get(s, {}).get("record", []):
            if str(o["id"]) in inat_in_gbif or not o.get("data") or o.get("lat") is None:
                continue
            nuova = riga(strati, h, s, o["taxon"], o["data"], o["lat"], o["lon"], o.get("precisione_m"),
                         f"inaturalist:{o['licenza']}", inaturalist=str(o["id"]))
            if nuova:
                righe.append(nuova)
                aggiunti_inat += 1
    righe.sort(key=lambda r: (r["specie"], r["data"], str(r["gbif"]), r["inaturalist"]))
    USCITA.mkdir(parents=True, exist_ok=True)
    with open(USCITA / "ritrovamenti.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(righe[0]))
        w.writeheader()
        w.writerows(righe)
    print(f"scritto ritrovamenti.csv: {len(righe)} ritrovamenti con data, dentro le due regioni "
          f"(di cui {aggiunti_inat} da iNaturalist non ancora in GBIF)")
    print(f"{'specie':20s} {'tutti':>5s} {'2015+':>5s} {'<=250m':>6s} {'<=1km':>5s} {'<=5km':>5s}  anni")
    for sp in C.leggi_specie():
        rr = [r for r in righe if r["specie"] == sp["specie"]]
        inc = lambda lim: sum(1 for r in rr if r["incertezza_m"] != "" and r["incertezza_m"] <= lim)   # noqa: E731
        anni = sorted(int(r["data"][:4]) for r in rr)
        print(f"{sp['nome']:20s} {len(rr):5d} {sum(a >= 2015 for a in anni):5d} {inc(250):6d} {inc(1000):5d} {inc(5000):5d}  "
              f"{anni[0] if anni else '-'}-{anni[-1] if anni else '-'}")


if __name__ == "__main__":
    main()

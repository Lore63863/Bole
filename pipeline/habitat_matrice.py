#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 2 (Habitat): disegna la tabella «specie x tipo di bosco» (data/ospiti.csv).

Come si usa
    python3 pipeline/habitat_matrice.py [file.png]
    (senza nome scrive dati-elaborati/anteprime/matrice_ospiti.png)
"""
import csv
import os
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

RADICE = Path(os.environ.get("BOLE_RADICE", str(Path(__file__).resolve().parents[1])))
COLORE = {0.3: "#F6EFC2", 0.6: "#EE9E3A", 1.0: "#8A2B0E"}
TESTO = {0.3: "#4A5750", 0.6: "#14211B", 1.0: "#FFFFFF"}
INCHIOSTRO, TENUE, RIGA = "#14211B", "#4A5750", "#D9DED9"
CORTI = {"porcino": "Porcino", "porcino_nero": "Porcino nero", "porcino_estivo": "Porcino estivo",
         "porcino_rosso": "Porcino rosso", "gallinaccio": "Gallinaccio", "ovolo": "Ovolo buono",
         "mazza_di_tamburo": "Mazza di tamburo", "chiodino": "Chiodino", "trombetta": "Trombetta dei morti",
         "steccherino": "Steccherino", "sanguinello": "Sanguinello", "spugnole": "Spugnole",
         "prugnolo": "Prugnolo", "dormiente": "Dormiente"}


def main(uscita):
    with open(RADICE / "data" / "ospiti.csv", newline="", encoding="utf-8") as f:
        righe = list(csv.DictReader(f))
    specie = [k for k in righe[0] if k not in ("regione", "codice", "categoria")]
    lato, alt, sinistra, testa = 0.50, 0.215, 3.55, 1.55        # pollici
    n_gruppi = len({r["regione"] for r in righe})
    larg = sinistra + len(specie) * lato + 0.25
    altezza = 0.95 + testa + len(righe) * alt + n_gruppi * 0.30 + 0.75
    fig = plt.figure(figsize=(larg, altezza), dpi=150, facecolor="white")
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, larg)
    ax.set_ylim(0, altezza)
    ax.set_axis_off()
    ax.text(0.2, altezza - 0.32, "Bolé · tabella «specie × tipo di bosco»", fontsize=13, fontweight="bold", color=INCHIOSTRO, va="center")
    ax.text(0.2, altezza - 0.62, "Quanto ogni tipo di bosco è adatto a ogni specie. È la base della mappa dell'habitat: da approvare.",
            fontsize=8.5, color=TENUE, va="center")
    y = altezza - 0.95 - testa
    for j, s in enumerate(specie):
        ax.text(sinistra + (j + 0.5) * lato, y + 0.08, CORTI.get(s, s), rotation=90, ha="center", va="bottom", fontsize=8,
                color=INCHIOSTRO)
    regione = None
    for r in righe:
        if r["regione"] != regione:
            regione = r["regione"]
            y -= 0.30
            ax.text(0.2, y + 0.07, regione.upper(), fontsize=8.5, fontweight="bold", color=INCHIOSTRO, va="center")
        y -= alt
        ax.plot([0.2, larg - 0.25], [y, y], color=RIGA, lw=0.5)
        ax.text(0.2, y + alt / 2, r["codice"], fontsize=7.5, color=TENUE, va="center", family="monospace")
        ax.text(0.58, y + alt / 2, r["categoria"], fontsize=7.8, color=INCHIOSTRO, va="center")
        for j, s in enumerate(specie):
            v = float(r[s])
            if v > 0:
                ax.add_patch(Rectangle((sinistra + j * lato + 0.02, y + 0.015), lato - 0.04, alt - 0.03, facecolor=COLORE[v], edgecolor="none"))
                ax.text(sinistra + (j + 0.5) * lato, y + alt / 2, f"{v:g}".replace(".", ","), ha="center", va="center", fontsize=7.5,
                        color=TESTO[v])
    y -= 0.42
    x = 0.2
    for v, t in ((1.0, "ambiente tipico, scritto nella guida regionale o in uno studio locale"), (0.6, "ambiente secondario"),
                 (0.3, "ambiente possibile (stima)")):
        ax.add_patch(Rectangle((x, y), 0.30, 0.17, facecolor=COLORE[v], edgecolor="none"))
        ax.text(x + 0.15, y + 0.085, f"{v:g}".replace(".", ","), ha="center", va="center", fontsize=7.5, color=TESTO[v])
        ax.text(x + 0.38, y + 0.085, t, fontsize=7.8, color=INCHIOSTRO, va="center")
        x += 0.38 + 0.062 * len(t) + 0.35
    ax.text(0.2, y - 0.24, "Vuoto = ambiente non adatto. Per mazza di tamburo, chiodino, spugnole e prugnolo non c'è una scheda nella guida: "
            "il massimo è 0,6 e vale come stima.", fontsize=7.5, color=TENUE, va="center")
    uscita.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(uscita, dpi=150)
    print("scritto", uscita, f"({int(larg * 150)} x {int(altezza * 150)} px)")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else RADICE / "dati-elaborati" / "anteprime" / "matrice_ospiti.png")

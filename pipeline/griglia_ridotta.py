#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - griglia ridotta a 100 m: una copia leggera dei dati fissi, per mappe d'insieme.

Che cosa fa
    Ogni cella da 100 m riassume 16 celle da 25 m con la loro media: quota, carico termico
    e idoneità dell'habitat di ogni specie. Serve alle mappe dell'indice a tutta regione
    (pipeline/indice_mappa.py) e al calcolo di prova, senza portarsi dietro la griglia fine.

Come si usa
    python3 pipeline/griglia_ridotta.py

Dove scrive
    dati-elaborati/griglia100/griglia100.npz
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402
import habitat_calcola as C  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402

F = 4                                        # 4 x 4 celle da 25 m = 100 m
USCITA = G.RADICE / "dati-elaborati" / "griglia100"


def riduci(a, valido):
    """Media a blocchi F x F sulle sole celle valide; NaN dove non ce ne sono."""
    n, m = a.shape[0] // F * F, a.shape[1] // F * F
    v = valido[:n, :m]
    s = np.where(v, a[:n, :m], 0).astype(np.float32).reshape(n // F, F, m // F, F).sum(axis=(1, 3))
    c = v.reshape(n // F, F, m // F, F).sum(axis=(1, 3))
    return np.where(c > 0, s / np.maximum(c, 1), np.nan).astype(np.float32)


def main():
    reg = G.apri("regione.tif")
    dentro = reg > 0
    quota = G.apri_quota()
    carico = G.apri("carico_termico.tif")
    out = {
        "quota": riduci(quota, dentro & np.isfinite(quota)),
        "carico_termico": riduci(carico.astype(np.float32) / 200.0, dentro & (carico != 255)),
        "regione": np.nan_to_num(np.rint(riduci(reg.astype(np.float32), dentro))).astype(np.uint8),
    }
    del quota, carico
    for s in [sp["specie"] for sp in C.leggi_specie()] + ["porcini"]:
        with rasterio.open(C.HAB / f"H_{s}.tif") as d:
            h = d.read(1)
        m = riduci(h.astype(np.float32), h != 255)
        out[f"H_{s}"] = np.where(np.isfinite(m), np.rint(m), 255).astype(np.uint8)
    USCITA.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(USCITA / "griglia100.npz", x0=G.X0, y_alto=G.YTOP, passo=G.PASSO * F, **out)
    n, m = out["regione"].shape
    print(f"scritto griglia100.npz: {m} x {n} celle da {G.PASSO * F:.0f} m, "
          f"{(USCITA / 'griglia100.npz').stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()

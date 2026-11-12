#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 2: vale la pena usare il DTM a 5 m al posto di quello a 25 m?

Che cosa fa
    Su alcuni fogli del Cuneese calcola la pendenza dal DTM a 5 m, ne fa la media sulle
    celle da 25 m della griglia e la confronta con la pendenza che la griglia ricava dal
    DTM a 25 m. Serve a decidere se scaricare il DTM a 5 m anche per il resto del
    Piemonte (2-3 GB).

Come si usa
    python3 pipeline/prova_dtm5.py [numero di foglio ...]      (senza numeri: 190 209 226)

Non scrive file: stampa il confronto.
"""
import glob
import sys
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from rasterio.windows import Window  # noqa: E402


def confronta(foglio):
    z = glob.glob(str(G.GREZZI / "piemonte" / "dtm5" / f"*FOGLI50-{foglio}-*.zip"))[0]
    tif = [n for n in zipfile.ZipFile(z).namelist() if n.lower().endswith(".tif")][0]
    with rasterio.open(f"/vsizip/{z}/{tif}") as d:
        assert d.crs.to_epsg() == 32632 and abs(d.res[0] - 5) < 1e-6
        a = d.read(1).astype(np.float32)
        if d.nodata is not None:
            a[a == d.nodata] = np.nan
        a[a <= 0] = np.nan
        x0, ytop = d.bounds.left, d.bounds.top
    # pendenza a 5 m (stesso metodo della griglia)
    zp = np.pad(a, 1, mode="edge")
    with np.errstate(invalid="ignore"):
        p5, _, _ = G.terreno_blocco(zp, np.zeros(a.shape[0], np.float32), passo=5.0)
    p5[~np.isfinite(a)] = np.nan
    # allineo alle celle da 25 m della griglia e faccio la media 5 x 5
    dc = int(round(((-(x0 - G.X0)) % 25) / 5))
    dr = int(round(((-(G.YTOP - ytop)) % 25) / 5))
    p5 = p5[dr:, dc:]
    n, m = p5.shape[0] // 5, p5.shape[1] // 5
    blocchi = p5[:n * 5, :m * 5].reshape(n, 5, m, 5)
    pieni = np.isfinite(blocchi).all(axis=(1, 3))
    media5 = np.where(pieni, np.nan_to_num(blocchi).mean(axis=(1, 3)), np.nan)
    col = int(round((x0 + dc * 5 - G.X0) / 25))
    rig = int(round((G.YTOP - (ytop - dr * 5)) / 25))
    with rasterio.open(G.ELAB / "pendenza.tif") as d:
        p25 = d.read(1, window=Window(col, rig, m, n)).astype(np.float32)
    ok = np.isfinite(media5) & (p25 != 255)
    d = media5[ok] - p25[ok]
    print(f"foglio {foglio}: {int(ok.sum())} celle  pendenza media a 5 m {media5[ok].mean():.1f}°, a 25 m {p25[ok].mean():.1f}°  "
          f"differenza media {d.mean():+.1f}°  metà delle celle entro ±{np.median(np.abs(d)):.1f}°  "
          f"oltre 35°: {100 * (media5[ok] > 35).mean():.1f}% contro {100 * (p25[ok] > 35).mean():.1f}%")
    return media5[ok], p25[ok]


if __name__ == "__main__":
    fogli = [int(a) for a in sys.argv[1:]] or [190, 209, 226]
    tutti5, tutti25 = [], []
    for f in fogli:
        a, b = confronta(f)
        tutti5.append(a)
        tutti25.append(b)
    a, b = np.concatenate(tutti5), np.concatenate(tutti25)
    cambia = ((a > 30) != (b > 30)).mean()
    print(f"In tutto: il fattore 'pendenza' del modello cambierebbe (soglia 30°) nel {100 * cambia:.1f}% delle celle; "
          f"correlazione fra le due pendenze {np.corrcoef(a, b)[0, 1]:.3f}")

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 2 (Habitat): anteprime in PNG delle mappe dell'habitat.

Come si usa
    python3 pipeline/habitat_anteprima.py <specie|porcini> <cuneese|tutto> [--punti]
        una mappa grande
    python3 pipeline/habitat_anteprima.py pannello <cuneese|tutto> <nome> <specie> <specie> ...
        più mappe piccole affiancate, salvate come habitat_pannello_<nome>_<zona>.png

    --punti   aggiunge i ritrovamenti pubblici (GBIF) con posizione precisa: serve solo
              a controllare la mappa a occhio

Dove scrive
    dati-elaborati/anteprime/

Nell'anteprima ogni punto dell'immagine riassume più celle da 25 m con la loro media
(16 celle nel Cuneese, 100 nella mappa intera; 4 volte tante nei pannelli):
è una vista d'insieme, non la mappa dell'app.
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402
import habitat_calcola as C  # noqa: E402
import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.patheffects as pe  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from matplotlib.colors import to_rgb  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402
from rasterio.warp import transform as trasforma  # noqa: E402
from rasterio.windows import Window  # noqa: E402

USCITA = G.RADICE / "dati-elaborati" / "anteprime"
# Stessi cinque colori della bozza dell'app, da "molto bassa" a "molto alta"
COLORI = ["#F6EFC2", "#F2CF73", "#EE9E3A", "#D2601F", "#8A2B0E"]
NOMI = ["molto bassa", "bassa", "media", "alta", "molto alta"]
SENZA = "#E3E7E4"          # terreno senza habitat in carta
INCHIOSTRO, TENUE = "#14211B", "#4A5750"
ALONE = [pe.withStroke(linewidth=2.2, foreground="white")]
SOTTOTITOLO = "Versione 0, non calibrata. Dice dove la specie può vivere (bosco, quota, suolo, uso del suolo), non quando nasce."
FONTI = ("Dati: Carta forestale Regione Piemonte 2025 · Tipi forestali Regione Liguria 2010 · DTM Regione Piemonte e "
         "Regione Liguria · SoilGrids (ISRIC) · © ESA WorldCover project 2021")
DPI = 150
ZONE = {
    "cuneese": {"nome": "Cuneese", "riduci": 4, "scala_km": 10, "rilievo": 1.0, "legenda": "lower left", "luoghi": [
        ("Cuneo", 7.547, 44.389), ("Mondovì", 7.818, 44.389), ("Alba", 8.035, 44.700), ("Saluzzo", 7.492, 44.645),
        ("Fossano", 7.722, 44.550), ("Bra", 7.853, 44.698), ("Borgo S. Dalmazzo", 7.488, 44.331),
        ("Limone", 7.577, 44.202), ("Ceva", 8.034, 44.386), ("Demonte", 7.295, 44.315), ("Dronero", 7.363, 44.466),
        ("Garessio", 8.016, 44.204), ("Ormea", 7.909, 44.149), ("Sampeyre", 7.189, 44.578),
        ("Chiusa di Pesio", 7.676, 44.325), ("Barge", 7.325, 44.725), ("Cortemilia", 8.192, 44.580),
        ("Pinerolo", 7.330, 44.885), ("Carmagnola", 7.717, 44.847)]},
    "tutto": {"nome": "Piemonte e Liguria", "riduci": 10, "scala_km": 50, "rilievo": 1.5, "legenda": "upper left", "luoghi": [
        ("Torino", 7.686, 45.070), ("Cuneo", 7.547, 44.389), ("Asti", 8.207, 44.900), ("Alessandria", 8.615, 44.913),
        ("Novara", 8.622, 45.447), ("Vercelli", 8.424, 45.325), ("Biella", 8.053, 45.566), ("Verbania", 8.552, 45.921),
        ("Domodossola", 8.292, 46.116), ("Genova", 8.934, 44.407), ("Savona", 8.481, 44.308),
        ("Imperia", 8.027, 43.889), ("La Spezia", 9.824, 44.103)]},
}
POCHI_LUOGHI = {"Cuneo", "Mondovì", "Alba", "Saluzzo", "Limone", "Ceva", "Torino", "Genova", "Novara", "Savona"}


def riduci(a, f, valido):
    """Media a blocchi f x f sulle sole celle valide (NaN dove non ce ne sono)."""
    n, m = a.shape[0] // f * f, a.shape[1] // f * f
    v = valido[:n, :m]
    s = np.where(v, a[:n, :m], 0).astype(np.float32).reshape(n // f, f, m // f, f).sum(axis=(1, 3))
    c = v.reshape(n // f, f, m // f, f).sum(axis=(1, 3))
    return np.where(c > 0, s / np.maximum(c, 1), np.nan)


def ombra(z, passo, esagera):
    """Rilievo ombreggiato leggero, con la luce da nord-ovest: 1 = in piena luce."""
    zz = np.where(np.isfinite(z), z, 0.0) * esagera
    giu, est = np.gradient(zz, passo)            # salita verso sud e verso est
    lx, ly, lz = -0.5, 0.5, 0.7071               # direzione del sole (ovest, nord, alto)
    hs = (-est * lx + giu * ly + lz) / np.sqrt(est ** 2 + giu ** 2 + 1)
    return np.clip(0.62 + 0.55 * hs, 0, 1)


def finestra(zona):
    return C.riquadro_cuneese() if zona == "cuneese" else (0, G.NRIG, 0, G.NCOL)


def prepara(specie, zona, f):
    """Immagine a colori della mappa, contorno delle regioni e coordinate dei bordi."""
    r1, r2, c1, c2 = finestra(zona)
    fin = Window(c1, r1, c2 - c1, r2 - r1)
    with rasterio.open(C.HAB / f"H_{specie}.tif") as d:
        h = d.read(1, window=fin)
    with rasterio.open(G.ELAB / "quota.tif") as d:
        q = d.read(1, window=fin)
    with rasterio.open(G.ELAB / "regione.tif") as d:
        reg = d.read(1, window=fin)
    hm = riduci(h, f, h != 255)
    qm = riduci(q, f, q != -9999)
    rm = np.nan_to_num(riduci(reg, f, reg > 0))  # 0 fuori, 1 Piemonte, 2 Liguria
    terra = np.isfinite(hm)
    classe = np.where(terra, np.digitize(np.nan_to_num(hm), [0.5, 20.5, 40.5, 60.5, 80.5]), 0)
    rgb = np.ones(classe.shape + (3,), np.float32)
    rgb[terra] = to_rgb(SENZA)
    for k, col in enumerate(COLORI, 1):
        rgb[classe == k] = to_rgb(col)
    rgb = np.where(terra[..., None], rgb * ombra(qm, f * G.PASSO, ZONE[zona]["rilievo"])[..., None], 1.0)
    n, m = classe.shape
    x1, y2 = G.X0 + c1 * G.PASSO, G.YTOP - r1 * G.PASSO
    return rgb, rm, (x1, x1 + m * f * G.PASSO, y2 - n * f * G.PASSO, y2)


def disegna(ax, rgb, rm, bordi, zona, pochi=False, carattere=7.5):
    """Mappa, contorno delle regioni, nomi dei luoghi e scala."""
    x1, x2, y1, y2 = bordi
    z = ZONE[zona]
    ax.imshow(rgb, extent=(x1, x2, y1, y2), interpolation="nearest")
    ax.contour(rm, levels=[0.5, 1.5], colors=TENUE, linewidths=0.5, extent=(x1, x2, y2, y1))
    ax.set_xlim(x1, x2)
    ax.set_ylim(y1, y2)
    ax.set_axis_off()
    luoghi = [p for p in z["luoghi"] if not pochi or p[0] in POCHI_LUOGHI]
    lx, ly = trasforma("EPSG:4326", G.CRS, [p[1] for p in luoghi], [p[2] for p in luoghi])
    for (nome, _, _), x, y in zip(luoghi, lx, ly):
        if x1 < x < x2 and y1 < y < y2:
            a_destra = x < x2 - (x2 - x1) * 0.12          # vicino al bordo destro il nome va a sinistra
            ax.plot(x, y, "o", ms=2.6, mfc="white", mec=INCHIOSTRO, mew=0.7)
            ax.text(x + (x2 - x1) * (0.006 if a_destra else -0.006), y, nome, fontsize=carattere, color=INCHIOSTRO,
                    va="center", ha="left" if a_destra else "right", path_effects=ALONE)
    lung = z["scala_km"] * 1000
    sx, sy = x2 - lung - (x2 - x1) * 0.03, y1 + (y2 - y1) * 0.035
    ax.plot([sx, sx + lung], [sy, sy], color=INCHIOSTRO, lw=2, solid_capstyle="butt", path_effects=ALONE)
    ax.text(sx + lung / 2, sy + (y2 - y1) * 0.008, f"{z['scala_km']} km", ha="center", va="bottom", fontsize=carattere,
            color=INCHIOSTRO, path_effects=ALONE)


def voci_legenda():
    voci = [Patch(facecolor=c, edgecolor=TENUE, linewidth=0.4, label=t) for c, t in zip(COLORI, NOMI)]
    return voci + [Patch(facecolor=SENZA, edgecolor=TENUE, linewidth=0.4, label="nessun habitat in carta")]


def nome_specie(specie):
    if specie == "porcini":
        return "Porcini (i quattro insieme)"
    return next(s["nome"] for s in C.leggi_specie() if s["specie"] == specie)


def salva(fig, nome):
    USCITA.mkdir(parents=True, exist_ok=True)
    dove = USCITA / nome
    fig.savefig(dove, dpi=DPI)
    print("scritto", dove, f"({dove.stat().st_size / 1e6:.2f} MB, {int(fig.get_figwidth() * DPI)} x {int(fig.get_figheight() * DPI)} px)")


def mappa(specie, zona, con_punti):
    z = ZONE[zona]
    rgb, rm, bordi = prepara(specie, zona, z["riduci"])
    x1, x2, y1, y2 = bordi
    n, m = rgb.shape[:2]
    alto, basso = 0.95, 0.60 if con_punti else 0.42      # margini in pollici per titolo e fonti
    fig = plt.figure(figsize=(m / DPI + 0.2, n / DPI + alto + basso), dpi=DPI, facecolor="white")
    lf, af = fig.get_figwidth(), fig.get_figheight()
    ax = fig.add_axes([0.1 / lf, basso / af, (m / DPI) / lf, (n / DPI) / af])
    disegna(ax, rgb, rm, bordi, zona)
    if con_punti:
        import habitat_verifica as V
        gruppo = [s["specie"] for s in C.leggi_specie() if s["porcini"]] if specie == "porcini" else [specie]
        tot = 0
        for s in gruppo:
            rig, col = V.punti_precisi(s)
            px, py = G.X0 + (col + 0.5) * G.PASSO, G.YTOP - (rig + 0.5) * G.PASSO
            ok = (px > x1) & (px < x2) & (py > y1) & (py < y2)
            ax.plot(px[ok], py[ok], "o", ms=3.8, mfc="#1D6FD8", mec="white", mew=0.7, ls="none")
            tot += int(ok.sum())
        fig.text(0.1 / lf, 0.18 / af, f"Pallini blu: {tot} ritrovamenti pubblici con posizione precisa (GBIF, incertezza "
                 f"fino a 250 m). Sono pochi e servono solo come controllo.", fontsize=6.5, color=TENUE, va="center")
    leg = ax.legend(handles=voci_legenda(), loc=z["legenda"], title="Idoneità dell'habitat", fontsize=7.5,
                    title_fontsize=8, framealpha=0.95, edgecolor=TENUE, borderpad=0.7)
    leg.get_frame().set_linewidth(0.5)
    fig.text(0.1 / lf, 1 - 0.30 / af, f"Bolé · habitat · {nome_specie(specie)} · {z['nome']}", fontsize=13,
             fontweight="bold", color=INCHIOSTRO, va="center")
    fig.text(0.1 / lf, 1 - 0.60 / af, SOTTOTITOLO, fontsize=8.5, color=TENUE, va="center")
    fig.text(0.1 / lf, (basso - 0.20) / af, FONTI, fontsize=6.5, color=TENUE, va="center")
    salva(fig, f"habitat_{specie}_{zona}{'_punti' if con_punti else ''}.png")


def pannello(zona, nome, elenco):
    """Più specie affiancate, a metà dettaglio."""
    z = ZONE[zona]
    f = z["riduci"] * 2
    pezzi = [prepara(s, zona, f) for s in elenco]
    n, m = pezzi[0][0].shape[:2]
    col = 2 if len(elenco) <= 4 else 3
    rig = -(-len(elenco) // col)
    spazio, alto, basso, testa = 0.12, 0.95, 0.75, 0.26   # pollici
    lf = col * m / DPI + (col + 1) * spazio
    af = rig * (n / DPI + testa) + alto + basso
    fig = plt.figure(figsize=(lf, af), dpi=DPI, facecolor="white")
    for i, (s, (rgb, rm, bordi)) in enumerate(zip(elenco, pezzi)):
        r, c = divmod(i, col)
        x = spazio + c * (m / DPI + spazio)
        y = af - alto - (r + 1) * (n / DPI + testa)
        ax = fig.add_axes([x / lf, y / af, (m / DPI) / lf, (n / DPI) / af])
        disegna(ax, rgb, rm, bordi, zona, pochi=True, carattere=6.5)
        fig.text(x / lf, (y + n / DPI + 0.11) / af, nome_specie(s), fontsize=10, fontweight="bold", color=INCHIOSTRO, va="center")
    leg = fig.legend(handles=voci_legenda(), loc="lower left", bbox_to_anchor=(spazio / lf, 0.30 / af), ncol=6,
                     title="Idoneità dell'habitat", fontsize=7.5, title_fontsize=8, frameon=False, alignment="left",
                     handlelength=1.6, columnspacing=1.4)
    leg.get_title().set_color(INCHIOSTRO)
    fig.text(spazio / lf, 1 - 0.30 / af, f"Bolé · habitat a confronto · {z['nome']}", fontsize=13, fontweight="bold",
             color=INCHIOSTRO, va="center")
    fig.text(spazio / lf, 1 - 0.60 / af, SOTTOTITOLO, fontsize=8.5, color=TENUE, va="center")
    fig.text(spazio / lf, 0.16 / af, FONTI, fontsize=6.5, color=TENUE, va="center")
    salva(fig, f"habitat_pannello_{nome}_{zona}.png")


if __name__ == "__main__":
    arg = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(arg) >= 4 and arg[0] == "pannello" and arg[1] in ZONE:
        pannello(arg[1], arg[2], arg[3:])
    elif len(arg) == 2 and arg[1] in ZONE:
        mappa(arg[0], arg[1], "--punti" in sys.argv)
    else:
        print(__doc__)
        sys.exit(1)

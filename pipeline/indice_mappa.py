#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 3: mappa dell'indice di nascita in uno o più giorni (prova del modello intero).

    indice = habitat x meteo x stagione

Come si usa
    python3 pipeline/indice_mappa.py <specie|porcini> <cuneese|tutto> <AAAA-MM-GG> [altre date] [--punti]

    Con più date fa un pannello di mappe affiancate (per confrontare giorni o annate).
    --punti  aggiunge i ritrovamenti pubblici della stessa specie nei 7 giorni prima e dopo

Che cosa usa
    dati-elaborati/griglia100/griglia100.npz    griglia ridotta a 100 m (griglia_ridotta.py)
    dati-elaborati/meteo_storico/ifs.npz        meteo giornaliero, storico e previsto
    data/modello.json, data/suolo_secco.npz     parametri tarati (calibra.py)

Dove scrive
    dati-elaborati/anteprime/indice_<specie>_<zona>_<data>.png
"""
import csv
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402
import habitat_calcola as C  # noqa: E402
import habitat_anteprima as A  # noqa: E402
import modello as M  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.colors import to_rgb  # noqa: E402
from rasterio.warp import transform as trasforma  # noqa: E402

PASSO_METEO = 2000.0        # metri: passo della griglia rada su cui si stende il meteo
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre",
        "novembre", "dicembre"]
FONTI = (A.FONTI + "\nMeteo: modello IFS dell'ECMWF, dall'archivio aperto di Open-Meteo (CC BY 4.0)")


def data_in_parole(g):
    a, m, d = str(g).split("-")
    return f"{int(d)} {MESI[int(m) - 1]} {a}"


def ingrandisci(campo, n_righe, n_col):
    """Da una griglia rada a una fitta, con interpolazione lineare."""
    r, c = np.linspace(0, campo.shape[0] - 1, n_righe), np.linspace(0, campo.shape[1] - 1, n_col)
    r0 = np.clip(np.floor(r).astype(int), 0, campo.shape[0] - 2)
    c0 = np.clip(np.floor(c).astype(int), 0, campo.shape[1] - 2)
    fr, fc = (r - r0)[:, None].astype(np.float32), (c - c0)[None, :].astype(np.float32)
    alto, basso = campo[r0], campo[r0 + 1]
    return (alto[:, c0] * (1 - fr) * (1 - fc) + alto[:, c0 + 1] * (1 - fr) * fc
            + basso[:, c0] * fr * (1 - fc) + basso[:, c0 + 1] * fr * fc).astype(np.float32)


class Scena:
    """Griglia ridotta, meteo e parametri caricati una volta sola."""

    def __init__(self, zona):
        g = np.load(G.RADICE / "dati-elaborati" / "griglia100" / "griglia100.npz")
        self.passo = float(g["passo"])
        f = int(round(self.passo / G.PASSO))
        if zona == "cuneese":
            r1, r2, c1, c2 = (v // f for v in C.riquadro_cuneese())
        else:
            r1, r2, c1, c2 = 0, g["regione"].shape[0], 0, g["regione"].shape[1]
        self.zona, self.fin = zona, (slice(r1, r2), slice(c1, c2))
        self.quota, self.regione = g["quota"][self.fin], g["regione"][self.fin]
        self.h = {k[2:]: g[k][self.fin] for k in g.files if k.startswith("H_")}
        x1, y2 = float(g["x0"]) + c1 * self.passo, float(g["y_alto"]) - r1 * self.passo
        n, m = self.quota.shape
        self.bordi = (x1, x1 + m * self.passo, y2 - n * self.passo, y2)
        z = np.load(G.RADICE / "dati-elaborati" / "meteo_storico" / "ifs.npz")
        self.meteo = {k: z[k] for k in z.files}
        soglia = np.load(G.RADICE / "data" / "suolo_secco.npz")["soglia"]
        self.gr = M.grandezze(self.meteo, soglia)
        self.par = M.carica_parametri()["specie"]
        # griglia rada del meteo sopra la finestra, e punti del modello meteo vicini a ogni nodo
        nr, nc = max(int(n * self.passo / PASSO_METEO) + 1, 2), max(int(m * self.passo / PASSO_METEO) + 1, 2)
        xs, ys = np.linspace(self.bordi[0], self.bordi[1], nc), np.linspace(self.bordi[3], self.bordi[2], nr)
        lon, lat = trasforma(G.CRS, "EPSG:4326", np.tile(xs, nr).tolist(), np.repeat(ys, nc).tolist())
        self.idx, self.w = M.vicini(lat, lon, self.meteo["lat"], self.meteo["lon"])
        self.rada = (nr, nc)

    def campo(self, valori):
        """Stende sulla finestra un valore noto nei punti del modello meteo."""
        rado = (valori[self.idx] * self.w).sum(axis=1).reshape(self.rada)
        return ingrandisci(rado.astype(np.float32), *self.quota.shape)

    def indice(self, specie, giorno):
        """Indice 0-1 e classe 0-5 per una specie (o per i quattro porcini insieme) in un giorno."""
        d = int(np.searchsorted(self.meteo["giorni"], np.datetime64(giorno)))
        assert self.meteo["giorni"][d] == np.datetime64(giorno), f"giorno fuori dallo storico: {giorno}"
        gr, zp = self.gr, np.nan_to_num(self.meteo["quota"])      # i punti in mare stanno a quota zero
        g = float(gr["G"][d])
        z = np.nan_to_num(self.quota)
        t = self.campo(gr["T"][d] - g * zp) + g * z                 # temperature riportate alla quota della cella
        tx = self.campo(gr["TX"][d] - g * zp) + g * z
        tn = self.campo(gr["TN"][d] - g * zp) + g * z
        p, neve = self.campo(gr["P"][d]), self.campo(gr["neve"][d])
        qn = M.quota_neve(gr["neve"][d][self.idx], zp[self.idx], self.w).reshape(self.rada)
        neve = np.where(z >= ingrandisci(qn, *self.quota.shape), neve, 0.0)    # neve solo sopra la sua quota
        secco = self.campo(gr["secco"][d].astype(np.float32)) > 0.5
        doy = int(M.giorno_dell_anno([np.datetime64(giorno)])[0])
        elenco = [s["specie"] for s in C.leggi_specie() if s["porcini"]] if specie == "porcini" else [specie]
        ind = np.zeros(self.quota.shape, np.float32)
        cl = np.zeros(self.quota.shape, np.uint8)
        for s in elenco:
            par = self.par[s]
            h = np.where(self.h[s] == 255, 0, self.h[s]).astype(np.float32) / 100.0
            i = h * M.fattore_meteo(par, p, t, tx, tn, secco, neve) * par["stagione"][doy - 1]
            ind = np.maximum(ind, i)
            cl = np.maximum(cl, M.classe(i, par["soglie"]))
        fuori = ~np.isfinite(self.quota)
        ind[fuori], cl[fuori] = np.nan, 0
        return ind, cl

    def immagine(self, cl, f=1):
        """Colori delle classi sopra il rilievo; f > 1 riduce l'immagine (classe più alta del blocco)."""
        terra = np.isfinite(self.quota)
        q = np.where(terra, self.quota, 0)
        rm = self.regione.astype(np.float32)
        if f > 1:
            n, m = cl.shape[0] // f * f, cl.shape[1] // f * f
            blocchi = lambda a: a[:n, :m].reshape(n // f, f, m // f, f)     # noqa: E731
            cl = np.rint(blocchi(cl.astype(np.float32)).mean(axis=(1, 3))).astype(np.uint8)
            terra = blocchi(terra).any(axis=(1, 3))
            q, rm = blocchi(q).mean(axis=(1, 3)), blocchi(rm).max(axis=(1, 3))
        rgb = np.ones(cl.shape + (3,), np.float32)
        rgb[terra] = to_rgb(A.SENZA)
        for k, col in enumerate(A.COLORI, 1):
            rgb[cl == k] = to_rgb(col)
        luce = A.ombra(np.where(terra, q, np.nan), self.passo * f, A.ZONE[self.zona]["rilievo"])
        return np.where(terra[..., None], rgb * luce[..., None], 1.0), rm


def ritrovamenti_vicini(specie, giorno, bordi, giorni=7):
    """Coordinate (in metri) dei ritrovamenti pubblici della specie entro pochi giorni dalla data."""
    elenco = [s["specie"] for s in C.leggi_specie() if s["porcini"]] if specie == "porcini" else [specie]
    lon, lat = [], []
    with open(G.RADICE / "dati-elaborati" / "calibrazione" / "ritrovamenti.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["specie"] in elenco and abs((np.datetime64(r["data"]) - np.datetime64(giorno)).astype(int)) <= giorni \
                    and r["incertezza_m"] != "" and int(r["incertezza_m"]) <= 1000:
                lon.append(float(r["lon"]))
                lat.append(float(r["lat"]))
    if not lon:
        return np.empty(0), np.empty(0)
    x, y = (np.array(v) for v in trasforma("EPSG:4326", G.CRS, lon, lat))
    ok = (x > bordi[0]) & (x < bordi[1]) & (y > bordi[2]) & (y < bordi[3])
    return x[ok], y[ok]


def main(specie, zona, date, con_punti):
    sc = Scena(zona)
    z = A.ZONE[zona]
    f = 1 if zona == "cuneese" else 2
    if len(date) > 1:
        f *= 2
    quadri = []
    for g in date:
        ind, cl = sc.indice(specie, g)
        rgb, rm = sc.immagine(cl, f)
        bosco = (sc.h[specie] != 255) & (sc.h[specie] > 0)
        quote = [100 * float(((cl >= k) & bosco).sum()) / max(int(bosco.sum()), 1) for k in (4, 5)]
        print(f"{g}: habitat in classe alta o molto alta {quote[0]:.1f}%, molto alta {quote[1]:.1f}%")
        quadri.append((g, rgb, rm, quote))
    n, m = quadri[0][1].shape[:2]
    col = 1 if len(date) == 1 else 2 if len(date) <= 4 else 3
    rig = -(-len(date) // col)
    dpi, spazio, alto, basso, testa = A.DPI, 0.12, 0.95, 0.95 if len(date) > 1 else 0.60, 0.26 if len(date) > 1 else 0.0
    lf = col * m / dpi + (col + 1) * spazio
    af = rig * (n / dpi + testa) + alto + basso
    fig = plt.figure(figsize=(lf, af), dpi=dpi, facecolor="white")
    for i, (g, rgb, rm, quote) in enumerate(quadri):
        r, c = divmod(i, col)
        x, y = spazio + c * (m / dpi + spazio), af - alto - (r + 1) * (n / dpi + testa)
        ax = fig.add_axes([x / lf, y / af, (m / dpi) / lf, (n / dpi) / af])
        A.disegna(ax, rgb, rm, sc.bordi, zona, pochi=len(date) > 1, carattere=6.5 if len(date) > 1 else 7.5)
        if con_punti:
            px, py = ritrovamenti_vicini(specie, g, sc.bordi)
            ax.plot(px, py, "o", ms=4.2, mfc="#1D6FD8", mec="white", mew=0.8, ls="none")
        if len(date) > 1:
            fig.text(x / lf, (y + n / dpi + 0.11) / af, f"{data_in_parole(g)}  ·  alta o molto alta: {quote[0]:.0f}% dell'habitat",
                     fontsize=9.5, fontweight="bold", color=A.INCHIOSTRO, va="center")
        else:
            leg = ax.legend(handles=A.voci_legenda(), loc=z["legenda"], title="Indice di nascita", fontsize=7.5,
                            title_fontsize=8, framealpha=0.95, edgecolor=A.TENUE, borderpad=0.7)
            leg.get_frame().set_linewidth(0.5)
    if len(date) > 1:
        leg = fig.legend(handles=A.voci_legenda(), loc="lower left", bbox_to_anchor=(spazio / lf, 0.46 / af), ncol=6,
                         title="Indice di nascita", fontsize=7.5, title_fontsize=8, frameon=False, alignment="left",
                         handlelength=1.6, columnspacing=1.4)
        leg.get_title().set_color(A.INCHIOSTRO)
    quando = data_in_parole(date[0]) if len(date) == 1 else "giorni a confronto"
    fig.text(spazio / lf, 1 - 0.30 / af, f"Bolé · indice di nascita · {A.nome_specie(specie)} · {quando} · {z['nome']}",
             fontsize=13, fontweight="bold", color=A.INCHIOSTRO, va="center")
    nota = "Prova del modello: habitat × meteo × stagione. Probabilità relative, non certezze."
    if con_punti:
        nota += " Pallini blu: ritrovamenti pubblici nei 7 giorni prima e dopo."
    fig.text(spazio / lf, 1 - 0.60 / af, nota, fontsize=8.5, color=A.TENUE, va="center")
    fig.text(spazio / lf, 0.22 / af, FONTI, fontsize=6.5, color=A.TENUE, va="center", linespacing=1.5)
    A.salva(fig, f"indice_{specie}_{zona}_{'_'.join(date) if len(date) <= 2 else date[0] + '_e_altre'}.png")


if __name__ == "__main__":
    arg = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(arg) < 3 or arg[1] not in A.ZONE:
        print(__doc__)
        sys.exit(1)
    main(arg[0], arg[1], arg[2:], "--punti" in sys.argv)

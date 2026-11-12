"""Indice di Boyce per classi: la mappa dell'habitat ordina bene i posti?

Per ogni classe di habitat (nessuna, molto bassa ... molto alta) confronta
la quota di ritrovamenti che ci cade con la quota di territorio che occupa:

    rapporto = quota di ritrovamenti / quota di territorio

Se la mappa funziona, il rapporto sale con la classe: sotto 1 dove l'habitat
manca, sopra 1 (anche 3-4 volte) nelle classi alte. L'indice di Boyce e la
correlazione di Spearman fra rapporto e numero della classe: da -1 a +1,
sopra 0,5 la mappa ordina bene.

Metodo: Boyce, Vernier, Nielsen e Schmiegelow (2002), Ecological Modelling
157: 281-300.

Dati usati:
  - dati-elaborati/calibrazione/ritrovamenti.csv  (da calibra_tabella.py)
  - dati-elaborati/habitat/riepilogo.json          (da habitat_calcola.py)
Ritrovamenti GBIF con incertezza fino a 250 m, valore della cella esatta
(gli stessi del confronto in docs/MODEL.md, punto 1.8).

Uso:  python3 pipeline/habitat_boyce.py
Scrive dati-elaborati/calibrazione/boyce_habitat.json
"""

import csv
import json
import pathlib

import numpy as np

RADICE = pathlib.Path(__file__).resolve().parent.parent
RITROVAMENTI = RADICE / "dati-elaborati" / "calibrazione" / "ritrovamenti.csv"
RIEPILOGO = RADICE / "dati-elaborati" / "habitat" / "riepilogo.json"
USCITA = RADICE / "dati-elaborati" / "calibrazione" / "boyce_habitat.json"

CLASSI = ["nessuna", "molto bassa", "bassa", "media", "alta", "molto alta"]
SPECIE = [
    "porcino", "porcino_nero", "porcino_estivo", "porcino_rosso",
    "gallinaccio", "ovolo", "mazza_di_tamburo", "chiodino", "trombetta",
    "steccherino", "sanguinello", "spugnole", "prugnolo", "dormiente",
]
PORCINI = SPECIE[:4]
INCERTEZZA_MAX = 250  # metri


def classe(h):
    """Habitat 0-100 -> classe 0 (nessuna) ... 5 (molto alta)."""
    h = float(h)
    return 0 if h <= 0 else min(5, int(np.ceil(h / 20.0)))


def ranghi(x):
    """Ranghi con i pari merito messi alla media (come Spearman)."""
    x = np.asarray(x, float)
    ordine = np.argsort(x, kind="mergesort")
    r = np.empty(len(x))
    r[ordine] = np.arange(1, len(x) + 1)
    for v in np.unique(x):
        uguali = x == v
        r[uguali] = r[uguali].mean()
    return r


def spearman(a, b):
    ra, rb = ranghi(a), ranghi(b)
    if ra.std() == 0 or rb.std() == 0:
        return float("nan")
    return float(np.corrcoef(ra, rb)[0, 1])


def main():
    righe = list(csv.DictReader(open(RITROVAMENTI, encoding="utf-8")))
    riep = json.loads(RIEPILOGO.read_text(encoding="utf-8"))

    def quota_territorio(sp):
        a = np.array([riep[sp]["piemonte"][c] + riep[sp]["liguria"][c] for c in CLASSI])
        return a / a.sum()

    def conta(sp):
        p = np.zeros(len(CLASSI))
        for r in righe:
            if (r["specie"] == sp and r["incertezza_m"]
                    and float(r["incertezza_m"]) <= INCERTEZZA_MAX):
                p[classe(r["habitat"])] += 1
        return p

    def boyce(lista):
        presenti = np.zeros(len(CLASSI))
        attesi = np.zeros(len(CLASSI))
        for sp in lista:
            p = conta(sp)
            presenti += p
            # l'attesa del gruppo pesa ogni specie per i suoi ritrovamenti
            attesi += p.sum() * quota_territorio(sp)
        n = presenti.sum()
        if n == 0:
            return 0, [None] * len(CLASSI), None
        ok = attesi > 0
        rapporto = np.full(len(CLASSI), np.nan)
        rapporto[ok] = presenti[ok] / attesi[ok]
        indice = spearman(np.arange(len(CLASSI))[ok], rapporto[ok])
        return (int(n),
                [None if np.isnan(v) else round(float(v), 2) for v in rapporto],
                None if np.isnan(indice) else round(indice, 2))

    uscita = {
        "_metodo": (
            "indice di Boyce per classi (Boyce et al. 2002): rapporto fra quota "
            "di ritrovamenti e quota di territorio per classe di habitat, poi "
            "correlazione di Spearman con il numero della classe. Ritrovamenti "
            f"GBIF con incertezza fino a {INCERTEZZA_MAX} m, cella esatta."
        ),
        "_classi": CLASSI,
    }
    gruppi = [("porcini", PORCINI), ("tutte", SPECIE)] + [(s, [s]) for s in SPECIE]
    print(f"{'':20s} {'n':>4s}  {'Boyce':>6s}   rapporto per classe (nessuna ... molto alta)")
    for nome, lista in gruppi:
        n, rapporto, indice = boyce(lista)
        uscita[nome] = {"n": n, "boyce": indice, "rapporto": rapporto}
        testo = "  ".join("  -  " if v is None else f"{v:5.2f}" for v in rapporto)
        print(f"{nome:20s} {n:4d}  {'' if indice is None else indice:>6}   {testo}")

    USCITA.write_text(json.dumps(uscita, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"scritto {USCITA}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Prova di parità, parte 1: casi di prova calcolati con il modello Python (pipeline/modello.py).

Per ogni specie: 300 combinazioni casuali di meteo (pioggia 26 gg, T media 20 gg, T max 7 gg,
T min 3 gg, suolo secco sì/no, neve) e di habitat e stagione; il risultato atteso è
indice = habitat × meteo × stagione e la sua classe. L'app deve dare gli stessi numeri
(tests/parita/confronta.mts).

Uso: python3 tests/parita/genera.py <cartella pipeline> <modello.json> <uscita.json>
"""
import json, sys
import numpy as np

sys.path.insert(0, sys.argv[1])
import modello as M  # noqa: E402

par = json.load(open(sys.argv[2]))
rng = np.random.default_rng(20261112)
casi = []
for sid, p in par["specie"].items():
    n = 300
    pioggia = rng.choice([0, 2, 10, 30, 60, 90, 150, 250], n) * rng.uniform(0.5, 1.5, n)
    t = rng.uniform(-4, 26, n)
    tmax = t + rng.uniform(0, 12, n)
    tmin = t - rng.uniform(0, 10, n)
    secco = rng.integers(0, 2, n).astype(float)
    neve = rng.choice([0, 0, 0, 0.005, 0.02, 0.10], n)   # metri, come nel Python (l'app usa i cm)
    habitat = rng.choice([0, 0.3, 0.6, 1], n) * rng.uniform(0.5, 1, n)
    giorno = rng.integers(1, 366, n)
    pp = {k: (np.array(v) if isinstance(v, list) else v) for k, v in p.items()}
    m = M.fattore_meteo(pp, pioggia, t, tmax, tmin, secco, neve)
    s = np.array(p["stagione"])[giorno - 1]
    indice = habitat * m * s
    cl = M.classe(indice, np.array(p["soglie"]))
    for i in range(n):
        casi.append({"specie": sid, "pioggia": pioggia[i], "t": t[i], "tmax": tmax[i], "tmin": tmin[i],
                     "secco": secco[i], "neve_cm": neve[i] * 100, "habitat": habitat[i], "giorno": int(giorno[i]),
                     "meteo": float(m[i]), "indice": float(indice[i]), "classe": int(cl[i])})
json.dump(casi, open(sys.argv[3], "w"))
print(len(casi), "casi scritti in", sys.argv[3])

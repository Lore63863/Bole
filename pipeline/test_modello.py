#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - controlli automatici delle formule del modello (Fase 3).

Non servono i dati veri: ogni controllo usa piccoli esempi di cui si conosce il risultato.

Come si usa
    python3 pipeline/test_modello.py        scrive "ok" per ogni controllo superato
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
import modello as M  # noqa: E402

P = {"t_ottimo": 13.5, "t_larghezza": 3.0, "pioggia_piena": 80.0, "caldo_soglia": 30.0, "caldo_freno": 0.5,
     "secco_freno": 0.5, "gelo_soglia": -2.0, "gelo_freno": 0.2, "neve_freno": 0.0}


def test_finestre():
    x = np.arange(10, dtype=np.float32)[:, None] * np.ones((1, 2), np.float32)
    s = M.somma_mobile(x, 3)
    assert np.isnan(s[:2]).all() and np.allclose(s[2:, 0], [3, 6, 9, 12, 15, 18, 21, 24])
    assert np.allclose(M.media_mobile(x, 3)[2:, 1], [1, 2, 3, 4, 5, 6, 7, 8])
    assert np.allclose(M.max_mobile(x, 3)[2:, 0], np.arange(2, 10)) and np.allclose(M.min_mobile(x, 3)[2:, 0], np.arange(0, 8))
    x[4, 0] = np.nan                                   # un buco: le finestre che lo toccano non valgono
    s = M.somma_mobile(x, 3)
    assert np.isnan(s[4:7, 0]).all() and np.isfinite(s[7:, 0]).all() and np.isfinite(s[2:, 1]).all()


def test_gradiente():
    quota = np.array([200, 600, 1000, 1500, 2200], np.float32)
    t = np.stack([20 - 0.0065 * quota, 10 - 0.004 * quota, 5 + 0.002 * quota])     # il terzo giorno: inversione
    g = M.gradiente_del_giorno(t, quota)
    assert abs(g[0] + 0.0065) < 1e-5 and abs(g[1] + 0.004) < 1e-5
    assert g[2] == np.float32(M.GRADIENTE_MAX)          # tenuto dentro i limiti


def test_fattori():
    assert abs(M.fattore_temperatura(P, 13.5) - 1) < 1e-9
    assert abs(M.fattore_temperatura(P, 16.5) - np.exp(-0.5)) < 1e-9          # a una tolleranza dall'ottimo
    assert np.allclose(M.fattore_pioggia(P, np.array([0, 40, 80, 200])), [M.PAVIMENTO_PIOGGIA, 0.5, 1, 1])
    base = dict(pioggia=80.0, t=13.5, t_max=20.0, t_min=8.0, secco=False, neve=0.0)
    assert abs(M.fattore_meteo(P, **base) - 1) < 1e-9
    assert abs(M.fattore_meteo(P, **{**base, "t_max": 31.0}) - 0.5) < 1e-9     # freno del caldo
    assert abs(M.fattore_meteo(P, **{**base, "secco": True}) - 0.5) < 1e-9     # freno del suolo secco
    assert abs(M.fattore_meteo(P, **{**base, "t_min": -3.0}) - 0.2) < 1e-9     # freno del gelo
    assert M.fattore_meteo(P, **{**base, "neve": 0.10}) == 0                   # neve al suolo
    assert abs(M.fattore_meteo(P, **{**base, "pioggia": 40.0, "t": 16.5}) - 0.5 * np.exp(-0.5)) < 1e-9


def test_stagione():
    s = M.curva_stagione([270, 275, 280])               # tre ritrovamenti a inizio ottobre
    assert len(s) == 367 and abs(np.nanmax(s) - 1) < 1e-6 and int(np.nanargmax(s)) == 275
    assert s[100] < 0.05 and s[275] > s[240] > s[200]
    fine_anno = M.curva_stagione([364])                 # la curva gira intorno a capodanno
    assert abs(fine_anno[2] - fine_anno[360]) < 1e-6


def test_giorni_e_classi():
    g = np.array(["2024-01-01", "2024-02-29", "2024-12-31", "2025-12-31"], "datetime64[D]")
    assert M.giorno_dell_anno(g).tolist() == [1, 60, 366, 365]
    c = M.classe(np.array([0, 0.01, 0.1, 0.2, 0.4, 0.9]), [0.05, 0.15, 0.3, 0.5])
    assert c.tolist() == [0, 1, 2, 3, 4, 5]


def test_vicini():
    lat_p, lon_p = np.array([44.0, 44.0, 44.1, 44.1]), np.array([7.0, 7.1, 7.0, 7.1])
    idx, w = M.vicini([44.0], [7.0], lat_p, lon_p, k=3)
    assert abs(w.sum() - 1) < 1e-6 and idx[0][np.argmax(w[0])] == 0          # il più vicino pesa di più
    idx, w = M.vicini([44.05], [7.05], lat_p, lon_p, k=4)
    assert np.allclose(w, 0.25, atol=0.03)                                   # al centro: pesi quasi uguali


def test_secco():
    giorni = np.arange(np.datetime64("2020-01-01"), np.datetime64("2023-01-01"))
    rng = np.random.default_rng(0)
    u7 = rng.uniform(0.2, 0.4, (len(giorni), 2)).astype(np.float32)
    soglia = M.soglia_suolo_secco(u7, giorni)
    assert soglia.shape == (367, 2) and 0.22 < np.nanmean(soglia) < 0.26     # circa il 20° percentile


def test_neve():
    # due vicini con neve (1.800 m peso 0,4; 2.000 m peso 0,1), due senza: quota della neve 1.640 m
    qn = M.quota_neve(np.array([0.15, 0.0, 0.05, 0.0]), np.array([1800.0, 900.0, 2000.0, 700.0]),
                      np.array([0.4, 0.3, 0.1, 0.2]))
    assert abs(float(qn) - 1640.0) < 1e-3
    assert float(M.quota_neve(np.zeros(4), np.full(4, 1000.0), np.full(4, 0.25))) == M.QUOTA_SENZA_NEVE
    # funziona anche per più giorni insieme (ultimo asse = i vicini)
    assert M.quota_neve(np.zeros((5, 4)), np.full((1, 4), 500.0), np.full((1, 4), 0.25)).shape == (5,)


if __name__ == "__main__":
    for nome, prova in sorted(globals().items()):
        if nome.startswith("test_"):
            prova()
            print("ok ", nome)
    print("Tutti i controlli superati.")

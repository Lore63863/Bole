#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - controlli automatici dei calcoli dell'habitat (Fase 2).

Non servono i dati veri: ogni controllo usa piccoli esempi di cui si conosce
già il risultato giusto.

Come si usa
    python3 pipeline/test_habitat.py        scrive "ok" per ogni controllo superato
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
import habitat_griglia as G  # noqa: E402
import habitat_calcola as C  # noqa: E402


def piano(dz_riga, dz_col, n=7):
    r, c = np.mgrid[0:n, 0:n].astype(np.float32)
    return (1000 + dz_riga * r + dz_col * c).astype(np.float32)


def test_terreno():
    """Piani inclinati: pendenza ed esposizione note; carico termico come negli esempi
    pubblicati per l'equazione 1 di McCune e Keon (40° N, pendenza 30°)."""
    t30, t20 = np.tan(np.radians(30)) * G.PASSO, np.tan(np.radians(20)) * G.PASSO
    lat = np.radians(np.full(5, 40, np.float32))
    casi = [(piano(-t30, 0), 30, 180, 1.0553), (piano(t30, 0), 30, 0, 0.5337),
            (piano(0, -t20), 20, 90, None), (piano(0, t20), 20, 270, None)]
    for z, pend, esp, carico in casi:
        p, e, c = G.terreno_blocco(z, lat)
        assert abs(p[2, 2] - pend) < 0.01 and abs(e[2, 2] - esp) < 0.01
        assert carico is None or abs(c[2, 2] - carico) < 0.0005
    p, _, c = G.terreno_blocco(piano(0, 0), lat)
    assert p[2, 2] == 0 and abs(c[2, 2] - 0.7748) < 0.0005


def test_margine():
    bosco = np.zeros((9, 9), bool)
    bosco[3:6, 3:6] = True
    m = G.margine(bosco, ~bosco)
    assert m[4, 4] == 12 and m[3, 3] == 11 and m[2, 2] == 1 and m[1, 1] == 2 and m[0, 0] == 3
    grande = np.ones((15, 15), bool)
    assert G.margine(grande, ~grande)[7, 7] == 20        # bosco senza margini vicini: interno


def test_twi():
    """Su un piano inclinato il TWI si calcola a mano: ln(area a monte / pendenza)."""
    import habitat_twi as T
    n = 61
    r, _ = np.mgrid[0:n, 0:n]
    twi = T.twi_mattonella((500 - 2.5 * r).astype(np.float32))          # pendenza 10% verso sud
    for riga in (0, 9, 30):
        atteso = np.log((riga + 1) * G.PASSO / 0.1 / 1.0006)
        assert abs(twi[riga, 30] - atteso) < 0.01, (riga, twi[riga, 30], atteso)
    conca = (500 - 2.5 * r).astype(np.float32)
    conca[20:25, 20:25] -= 30                                           # una buca chiusa
    conca[40, 40] = np.nan
    t2 = T.twi_mattonella(conca)
    assert np.isfinite(t2).sum() == n * n - 1 and np.isnan(t2[40, 40])
    assert t2[22, 22] > twi[22, 22]                                     # nella buca è più umido


def test_trapezio():
    z = np.array([100, 200, 300, 400, 1000, 1900, 2000, 2100, 2500], np.float32)
    f = C.trapezio(z, 200, 400, 1900, 2100)
    assert np.allclose(f, [0, 0, 0.5, 1, 1, 1, 0.5, 0, 0])
    assert np.allclose(C.trapezio(z, 0, 0, 1000, 1200), [1, 1, 1, 1, 1, 0, 0, 0, 0])


def test_fattori():
    ph = np.array([0, 50, 60, 65, 70, 80], np.uint8)
    assert np.allclose(C.fattore_suolo(ph, "acido"), [1, 1, 1, 0.9, 0.8, 0.8])
    assert C.fattore_suolo(ph, "indifferente") == 1
    assert np.allclose(C.fattore_pendenza(np.array([0, 30, 35, 40, 60], np.uint8)), [1, 1, 0.75, 0.5, 0.5])


def test_tabelle():
    """ospiti.csv e specie.csv: stesse 14 specie, valori fra 0 e 1, quote in ordine."""
    specie, ospiti = C.leggi_specie(), C.leggi_ospiti()
    assert len(specie) == 14 and {s["specie"] for s in specie} == set(ospiti)
    piem, lig, nomi = G.codici_categorie()
    assert len(piem) == 21 and len(lig) == 19 and max(piem.values()) < 100 < min(lig.values())
    assert all(o[0] == 0 for o in ospiti.values())                      # codice 0 = nessun bosco


def test_habitat():
    """Un castagneto piemontese a 800 m, suolo acido, poco ripido: porcino al massimo."""
    specie = {s["specie"]: s for s in C.leggi_specie()}
    ospiti = C.leggi_ospiti()
    piem, lig, _ = G.codici_categorie()
    #                0 bosco      1 alto       2 ripido     3 robinie    4 prato    5 prato   6 lecceta  7 fuori      8 case       9 campo  10 filare
    #                                                                 vicino     lontano                        nel bosco    vicino   di alberi
    cat = np.array([[piem["CA"], piem["CA"], piem["CA"], piem["RB"], 0, 0, lig["LE"], piem["CA"], piem["CA"], 0, 0]], np.uint8)
    quota = np.array([[800, 2000, 800, 800, 800, 800, 300, np.nan, 800, 800, 300]], np.float32)
    ph = np.array([[55, 55, 70, 55, 55, 55, 55, 55, 55, 55, 55]], np.uint8)
    pend = np.array([[10, 10, 40, 10, 10, 10, 10, 10, 10, 10, 5]], np.uint8)
    marg = np.array([[20, 20, 20, 20, 1, 0, 20, 20, 20, 1, 0]], np.uint8)
    reg = np.array([[1, 1, 1, 1, 1, 1, 2, 0, 1, 1, 1]], np.uint8)
    uso = np.array([[10, 10, 10, 10, 30, 30, 10, 10, 50, 40, 10]], np.uint8)
    aperto = cat == 0

    def h(nome):
        return C.habitat(specie[nome], ospiti[nome], cat, quota, ph, pend, marg, reg, uso, aperto)[0].tolist()

    assert h("porcino") == [100, 50, 40, 0, 0, 0, 0, 255, 0, 0, 0], h("porcino")
    mazza = h("mazza_di_tamburo")
    assert mazza[4] == 60 and mazza[5] == 30 and mazza[8] == 0 and mazza[9] == 0   # prato sì, case e campi no
    assert h("prugnolo")[5] == 30 and h("spugnole")[10] == 30 and h("spugnole")[5] == 0
    ovolo = h("ovolo")
    assert ovolo[6] == 100 and ovolo[1] == 0                            # lecceta ligure sì, 2000 m no


if __name__ == "__main__":
    for nome, prova in sorted(globals().items()):
        if nome.startswith("test_"):
            prova()
            print("ok ", nome)
    print("Tutti i controlli superati.")

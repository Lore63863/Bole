#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 2 (Habitat), parte 3: idoneità dell'habitat per specie (H, da 0 a 1).

Dice DOVE una specie può vivere, non QUANDO nasce (quello lo dirà il meteo, in Fase 3).

    H = ospite x quota x suolo x pendenza            (spiegazione in docs/MODEL.md)

    ospite    affinità fra specie e categoria forestale (data/ospiti.csv); per le specie
              di prato e radura contano anche il margine del bosco e l'uso del suolo
              (prati, arbusti, alberi fuori dal bosco); coltivi, costruito e acqua valgono 0
    quota     trapezio: 0 sotto q0, 1 fra q1 e q2, 0 sopra q3 (data/specie.csv)
    suolo     solo per le specie che vogliono suolo acido: 1 fino a pH 6,0, poi scende
              fino a 0,8 a pH 7,0 (peso leggero: il dato del suolo è grossolano)
    pendenza  1 fino a 30 gradi, poi scende fino a 0,5 a 40 gradi (versante poco praticabile)

Tutti i pesi sono "stime da calibrare": si correggono in Fase 3 con i ritrovamenti.

Come si usa
    python3 pipeline/habitat_calcola.py                    tutte le specie
    python3 pipeline/habitat_calcola.py porcino ovolo      solo quelle indicate
Se scrive "RILANCIA con: ..." ha finito il tempo: rilanciare con le specie che elenca.

Dove scrive (dati-elaborati/habitat/, file grandi: restano sul computer)
    H_<specie>.tif   idoneità 0-100; 255 = fuori da Piemonte e Liguria
    H_porcini.tif    il valore più alto fra i quattro porcini
    riepilogo.json   superfici per classe, per regione e per il riquadro del Cuneese
"""
import csv
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402
import numpy as np  # noqa: E402

HAB = G.RADICE / "dati-elaborati" / "habitat"

# Pesi dei fattori leggeri (stime da calibrare)
PH_PIENO, PH_MINIMO, PESO_SUOLO = 6.0, 7.0, 0.2        # specie di suolo acido
PEND_PIENA, PEND_MINIMA, PESO_PEND = 30.0, 40.0, 0.5   # gradi
CLASSI = (0, 20, 40, 60, 80, 100)                      # confini delle 5 classi, in centesimi
NOMI_CLASSI = ("nessuna", "molto bassa", "bassa", "media", "alta", "molto alta")
# Riquadro di prova attorno alla provincia di Cuneo (longitudine e latitudine)
CUNEESE = (6.73, 44.04, 8.34, 45.02)


def trapezio(z, q0, q1, q2, q3):
    """Idoneità per quota: 0 sotto q0, sale fino a 1 in q1, resta 1 fino a q2, scende a 0 in q3."""
    f = np.ones(z.shape, np.float32)
    if q1 > q0:
        f = np.minimum(f, np.clip((z - q0) / (q1 - q0), 0, 1))
    elif q0 > 0:
        f[z < q0] = 0
    if q3 > q2:
        f = np.minimum(f, np.clip((q3 - z) / (q3 - q2), 0, 1))
    else:
        f[z > q3] = 0
    return f.astype(np.float32)


def fattore_suolo(ph10, tipo):
    """Peso leggero del pH (ph10 = pH x 10; 0 = senza dato, cioè nessun effetto)."""
    if tipo != "acido":
        return np.float32(1.0)
    ph = ph10.astype(np.float32) / 10.0
    f = 1.0 - PESO_SUOLO * np.clip((ph - PH_PIENO) / (PH_MINIMO - PH_PIENO), 0, 1)
    f[ph10 == 0] = 1.0
    return f.astype(np.float32)


def fattore_pendenza(gradi):
    """Versanti ripidi: 1 fino a 30 gradi, 0,5 da 40 gradi in su."""
    p = gradi.astype(np.float32)
    return (1.0 - PESO_PEND * np.clip((p - PEND_PIENA) / (PEND_MINIMA - PEND_PIENA), 0, 1)).astype(np.float32)


def leggi_specie():
    """Parametri per specie da data/specie.csv."""
    out = []
    with open(G.RADICE / "data" / "specie.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            q = tuple(float(r[k]) for k in ("q0", "q1", "q2", "q3"))
            ql = tuple(float(r[k]) for k in ("lig_q0", "lig_q1", "lig_q2", "lig_q3")) if r["lig_q0"] != "" else q
            assert q[0] <= q[1] <= q[2] <= q[3] and ql[0] <= ql[1] <= ql[2] <= ql[3], r["specie"]
            fuori = {k: float(r[k]) for k in ("margine_fuori", "margine_dentro", "prato", "arbusti", "alberi_fuori")}
            assert all(0.0 <= v <= 1.0 for v in fuori.values()), r["specie"]
            out.append({"specie": r["specie"], "nome": r["nome"], "porcini": r["porcini"] == "1", "quota": q,
                        "quota_liguria": ql, "suolo": r["suolo"], **fuori})
    return out


def leggi_ospiti():
    """Per ogni specie, una tabella di 256 valori: affinità per codice di categoria."""
    piem, lig, _ = G.codici_categorie()
    tab = {}
    with open(G.RADICE / "data" / "ospiti.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            cod = (piem if r["regione"] == "Piemonte" else lig)[r["codice"]]
            for k, v in r.items():
                if k in ("regione", "codice", "categoria"):
                    continue
                assert 0.0 <= float(v) <= 1.0, (r["codice"], k)
                tab.setdefault(k, np.zeros(256, np.float32))[cod] = float(v)
    return tab


ALBERI, ARBUSTI, PRATO, COLTIVI, COSTRUITO, ACQUA = 10, 20, 30, 40, 50, 80   # classi di ESA WorldCover


def habitat(sp, ospite, cat, quota, ph, pend, marg, reg, uso, aperto):
    """H in centesimi (0-100) per un blocco di celle; 255 fuori dalle due regioni.

    uso     classe di uso del suolo (ESA WorldCover; 0 = senza dato)
    aperto  celle fuori dalla carta forestale (nessun bosco in carta)
    """
    base = ospite[cat]
    if any(sp[k] > 0 for k in ("margine_fuori", "margine_dentro", "prato", "arbusti", "alberi_fuori")):
        dentro = (marg == 11) | (marg == 12)      # nel bosco, entro 50 m dal margine
        vicino = (marg == 1) | (marg == 2)        # fuori dal bosco, entro 50 m
        base = np.where(dentro, np.maximum(base, sp["margine_dentro"]), base)
        per_classe = np.zeros(256, np.float32)    # valore fuori dal bosco, per classe di uso del suolo
        per_classe[PRATO], per_classe[ARBUSTI], per_classe[ALBERI] = sp["prato"], sp["arbusti"], sp["alberi_fuori"]
        fuori = per_classe[uso]
        naturale = (uso == PRATO) | (uso == ARBUSTI) | (uso == ALBERI) | (uso == 0)
        fuori = np.where(vicino & naturale, np.maximum(fuori, sp["margine_fuori"]), fuori)
        base = np.where(aperto, fuori, base)
    # esclusioni valide per tutte le specie, anche dentro i poligoni di bosco
    base = np.where((uso == COLTIVI) | (uso == COSTRUITO) | (uso == ACQUA), 0, base)
    z = np.nan_to_num(quota, nan=-1000.0)
    fq = trapezio(z, *sp["quota"])
    if sp["quota_liguria"] != sp["quota"]:
        fq = np.where(reg == 2, trapezio(z, *sp["quota_liguria"]), fq)
    h = base * fq * fattore_suolo(ph, sp["suolo"]) * fattore_pendenza(pend)
    return np.where(reg > 0, np.rint(h * 100), 255).astype(np.uint8)


def riquadro_cuneese():
    """Righe e colonne della griglia che coprono il riquadro del Cuneese."""
    from rasterio.warp import transform_bounds
    x1, y1, x2, y2 = transform_bounds("EPSG:4326", G.CRS, *CUNEESE, densify_pts=21)
    c1, c2 = int((x1 - G.X0) // G.PASSO), int((x2 - G.X0) // G.PASSO) + 1
    r1, r2 = int((G.YTOP - y2) // G.PASSO), int((G.YTOP - y1) // G.PASSO) + 1
    return max(r1, 0), min(r2, G.NRIG), max(c1, 0), min(c2, G.NCOL)


def superfici(h, reg, finestra):
    """km² per classe: Piemonte, Liguria e riquadro del Cuneese."""
    r1, r2, c1, c2 = finestra
    zone = {"piemonte": h[reg == 1], "liguria": h[reg == 2], "cuneese": h[r1:r2, c1:c2][reg[r1:r2, c1:c2] > 0]}
    out = {}
    for nome, v in zone.items():
        conta = np.bincount(v, minlength=256)[:101]
        somme = [int(conta[0])] + [int(conta[a + 1:b + 1].sum()) for a, b in zip(CLASSI[:-1], CLASSI[1:])]
        out[nome] = {n: round(s * G.PASSO ** 2 / 1e6, 1) for n, s in zip(NOMI_CLASSI, somme)}
    return out


def main(richieste):
    specie = leggi_specie()
    ospiti = leggi_ospiti()
    nomi = [s["specie"] for s in specie]
    assert set(nomi) == set(ospiti), "specie.csv e ospiti.csv non hanno le stesse specie"
    for r in richieste:
        assert r in nomi, f"specie sconosciuta: {r}"
    da_fare = [s for s in specie if not richieste or s["specie"] in richieste]

    cat, ph, pend = G.apri("categoria.tif"), G.apri("ph.tif"), G.apri("pendenza.tif")
    marg, reg, quota = G.apri("margine.tif"), G.apri("regione.tif"), G.apri_quota()
    uso = G.apri("uso_suolo.tif")
    aperto = (cat == 0) | (cat == G.codici_categorie()[1]["NA"])    # fuori dalla carta forestale
    finestra = riquadro_cuneese()
    HAB.mkdir(parents=True, exist_ok=True)
    f_riep = HAB / "riepilogo.json"
    riep = json.loads(f_riep.read_text()) if f_riep.exists() else {}
    riep["_classi"] = dict(zip(NOMI_CLASSI[1:], [f"{a + 1}-{b}" for a, b in zip(CLASSI[:-1], CLASSI[1:])]))
    riep["_riquadro_cuneese"] = {"lonlat": CUNEESE, "righe_colonne": finestra}

    B = 1024
    for i, sp in enumerate(da_fare):
        if G.resta() < 30:
            f_riep.write_text(json.dumps(riep, ensure_ascii=False, indent=1))
            print("RILANCIA con:", " ".join(s["specie"] for s in da_fare[i:]))
            return
        t = time.time()
        out = np.empty((G.NRIG, G.NCOL), np.uint8)
        for r1 in range(0, G.NRIG, B):
            b = slice(r1, min(r1 + B, G.NRIG))
            out[b] = habitat(sp, ospiti[sp["specie"]], cat[b], quota[b], ph[b], pend[b], marg[b], reg[b], uso[b], aperto[b])
        riep[sp["specie"]] = superfici(out, reg, finestra)
        s = riep[sp["specie"]]
        buona = lambda z: s[z]["alta"] + s[z]["molto alta"]   # noqa: E731
        print(f"{sp['nome']:20s} idoneità alta o molto alta: Piemonte {buona('piemonte'):7.0f} km², "
              f"Liguria {buona('liguria'):6.0f} km², Cuneese {buona('cuneese'):6.0f} km²  ({time.time() - t:.0f} s)")
        G.scrivi(f"H_{sp['specie']}.tif", out, 255, f"idoneita dell'habitat x100: {sp['nome']} (versione 0, non calibrata)", HAB)
        del out

    # Gruppo "porcini": il valore più alto fra i quattro, se ci sono tutti
    porcini = [s["specie"] for s in specie if s["porcini"]]
    if all((HAB / f"H_{p}.tif").exists() for p in porcini) and (not richieste or set(richieste) & set(porcini)):
        import rasterio
        m = None
        for p in porcini:
            with rasterio.open(HAB / f"H_{p}.tif") as d:
                a = d.read(1)
            m = a if m is None else np.where((a != 255) & (a > m), a, m)
        riep["porcini"] = superfici(m, reg, finestra)
        G.scrivi("H_porcini.tif", m, 255, "idoneita dell'habitat x100: massimo dei quattro porcini (versione 0)", HAB)
    f_riep.write_text(json.dumps(riep, ensure_ascii=False, indent=1))
    print("finito")


if __name__ == "__main__":
    main(sys.argv[1:])
    print(f"({time.time() - G.T0:.0f} s)")

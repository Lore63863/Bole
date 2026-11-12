#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 2 (Habitat), parte 2: umidità topografica (TWI).

Che cosa fa
    Per ogni cella da 25 m stima quanta acqua le arriva dal versante sopra e quanto
    facilmente scola via: TWI = ln(a / tan b), dove "a" è l'area a monte per metro di
    curva di livello e "b" la pendenza (Beven e Kirkby 1979). Valori alti = impluvi e
    fondovalle, dove l'acqua si raccoglie; valori bassi = dossi e creste.

Come lo fa
    1. chiude le piccole conche del modello del terreno, lasciando una pendenza minima
       verso valle (metodo "priority-flood" di Barnes e altri 2014);
    2. distribuisce l'acqua di ogni cella fra tutte le celle vicine più basse, in
       proporzione alla pendenza (Quinn e altri 1991);
    3. lavora a mattonelle di 50 km con un bordo di 6 km: per i versanti basta; nei
       fondovalle dei grandi fiumi il valore è sottostimato ma resta altissimo.

Come si usa
    python3 pipeline/habitat_twi.py          (rilanciare finché scrive "finito")

Dove scrive
    dati-elaborati/griglia25/twi.tif   (TWI x10; 0 = senza dato)
"""
import heapq
import json
import math
import os
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402

# La memoria del codice compilato va nella cartella di lavoro, non nel progetto
os.environ.setdefault("NUMBA_CACHE_DIR", str(G.LAVORO / "numba"))
import numpy as np  # noqa: E402
from numba import njit  # noqa: E402

DR = (-1, -1, -1, 0, 0, 1, 1, 1)
DC = (-1, 0, 1, -1, 1, -1, 0, 1)
NUCLEO, BORDO = 2000, 240      # celle: 50 km e 6 km
EPS = 1e-4                     # pendenza minima imposta nelle conche riempite (metri per cella)
TWI_MAX = 25.0


@njit(cache=True)
def riempi(z, valido, eps):
    """Chiude le conche. Rende la quota corretta e l'ordine di visita (dal basso all'alto)."""
    nr, nc = z.shape
    f = z.copy()
    visto = np.zeros((nr, nc), np.uint8)
    ordine = np.empty(nr * nc, np.int64)
    n = 0
    coda = [(0.0, 0)]
    coda.pop()
    # Punti di partenza: le celle valide sul bordo o accanto a celle senza dato
    for r in range(nr):
        for c in range(nc):
            if not valido[r, c]:
                visto[r, c] = 1
                continue
            sbocco = r == 0 or c == 0 or r == nr - 1 or c == nc - 1
            if not sbocco:
                for k in range(8):
                    if not valido[r + DR[k], c + DC[k]]:
                        sbocco = True
                        break
            if sbocco:
                heapq.heappush(coda, (f[r, c], r * nc + c))
                visto[r, c] = 1
    while len(coda) > 0:
        zc, i = heapq.heappop(coda)
        ordine[n] = i
        n += 1
        r = i // nc
        c = i % nc
        for k in range(8):
            rr = r + DR[k]
            cc = c + DC[k]
            if rr < 0 or cc < 0 or rr >= nr or cc >= nc or visto[rr, cc] == 1:
                continue
            visto[rr, cc] = 1
            if f[rr, cc] <= zc:
                f[rr, cc] = zc + eps
            heapq.heappush(coda, (f[rr, cc], rr * nc + cc))
    return f, ordine[:n]


@njit(cache=True)
def umidita(f, valido, ordine, cella):
    """TWI con deflusso ripartito fra le celle più basse (Quinn e altri 1991)."""
    nr, nc = f.shape
    area = np.zeros((nr, nc), np.float64)
    twi = np.full((nr, nc), np.nan, np.float32)
    dist = np.empty(8, np.float64)
    lung = np.empty(8, np.float64)
    for k in range(8):
        diagonale = DR[k] != 0 and DC[k] != 0
        dist[k] = cella * math.sqrt(2.0) if diagonale else cella
        lung[k] = 0.354 * cella if diagonale else 0.5 * cella      # tratto di curva di livello
    w = np.zeros(8, np.float64)
    for j in range(ordine.shape[0] - 1, -1, -1):                   # dalla cella più alta alla più bassa
        i = ordine[j]
        r = i // nc
        c = i % nc
        a = area[r, c] + cella * cella
        s = 0.0
        for k in range(8):
            w[k] = 0.0
            rr = r + DR[k]
            cc = c + DC[k]
            if rr < 0 or cc < 0 or rr >= nr or cc >= nc or not valido[rr, cc]:
                continue
            dz = f[r, c] - f[rr, cc]
            if dz > 0.0:
                w[k] = dz / dist[k] * lung[k]
                s += w[k]
        if s > 0.0:
            for k in range(8):
                if w[k] > 0.0:
                    area[r + DR[k], c + DC[k]] += a * w[k] / s
            twi[r, c] = math.log(a / s)
        else:                                                       # sbocco: nessuna cella più bassa
            twi[r, c] = math.log(a / (cella * 1e-3))
    return twi


def twi_mattonella(z):
    """TWI di un riquadro di quota (NaN = senza dato). Rende NaN dove non c'è dato."""
    valido = np.isfinite(z)
    z64 = np.where(valido, z, 0.0).astype(np.float64)
    f, ordine = riempi(z64, valido, EPS)
    return np.minimum(umidita(f, valido, ordine, G.PASSO), TWI_MAX)


def main():
    G.LAVORO.mkdir(parents=True, exist_ok=True)
    f_out, f_st = G.LAVORO / "twi_parziale.npy", G.LAVORO / "twi_stato.json"
    if f_out.exists() and f_st.exists():
        out, fatti = np.load(f_out), json.loads(f_st.read_text())
    else:
        out, fatti = np.zeros((G.NRIG, G.NCOL), np.uint8), []
    q = G.apri_quota()
    tutte = [(r, c) for r in range(0, G.NRIG, NUCLEO) for c in range(0, G.NCOL, NUCLEO)]
    for r1, c1 in tutte:
        chiave = f"{r1}_{c1}"
        if chiave in fatti:
            continue
        if G.resta() < 40:
            np.save(f_out, out)
            f_st.write_text(json.dumps(fatti))
            print(f"RILANCIA: fatte {len(fatti)} mattonelle su {len(tutte)}")
            return
        r2, c2 = min(r1 + NUCLEO, G.NRIG), min(c1 + NUCLEO, G.NCOL)
        R1, R2 = max(r1 - BORDO, 0), min(r2 + BORDO, G.NRIG)
        C1, C2 = max(c1 - BORDO, 0), min(c2 + BORDO, G.NCOL)
        if np.isfinite(q[r1:r2, c1:c2]).any():
            t = time.time()
            twi = twi_mattonella(q[R1:R2, C1:C2])[r1 - R1:r2 - R1, c1 - C1:c2 - C1]
            out[r1:r2, c1:c2] = np.where(np.isfinite(twi), np.clip(np.rint(np.nan_to_num(twi) * 10), 1, 250), 0)
            print(f"  mattonella {chiave}: {time.time() - t:.0f} s")
        fatti.append(chiave)
    np.save(f_out, out)
    f_st.write_text(json.dumps(fatti))
    if G.resta() < 40:
        print("RILANCIA: resta da scrivere il file")
        return
    v = out[out > 0]
    print(f"TWI: mediana {np.median(v) / 10:.1f}; il 10% più asciutto sotto {np.percentile(v, 10) / 10:.1f}, "
          f"il 10% più umido sopra {np.percentile(v, 90) / 10:.1f}")
    G.scrivi("twi.tif", out, 0, "umidita topografica TWI x10 (Quinn e altri 1991); 0 = senza dato")
    f_out.unlink(missing_ok=True)       # lavoro finito: un nuovo lancio riparte da capo
    f_st.unlink(missing_ok=True)
    print("finito")


if __name__ == "__main__":
    main()
    print(f"({time.time() - G.T0:.0f} s)")

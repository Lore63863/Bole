#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 3 (Meteo), parte 3: il lavoro di ogni mattina.

Che cosa fa
    1. Legge dall'archivio aperto di Open-Meteo gli ultimi 45 giorni e i prossimi 15 del
       modello IFS dell'ECMWF (pioggia, temperatura, suolo, neve), per Piemonte e Liguria.
    2. Per ogni punto del modello meteo e per ogni giorno, da oggi a +14, calcola gli
       ingredienti del fattore meteo: pioggia su 26 giorni, temperatura media su 20 giorni,
       massima degli ultimi 7, minima degli ultimi 3, suolo secco, neve.
    3. Scrive file leggeri: l'app (o pipeline/indice_mappa.py) li combina con habitat e
       stagione per avere l'indice di ogni specie in ogni cella.

    Non usa l'API di Open-Meteo: legge i file aperti, quindi non ha limiti di chiamate.

Come si usa
    python3 pipeline/previsione.py

Dove scrive
    dati-elaborati/previsione/previsione.json    ingredienti per punto e per giorno, da oggi a +14
    dati-elaborati/previsione/meteo_recente.npz  tabelle giornaliere: ultimi 45 giorni e prossimi 15
    dati-elaborati/app/meteo/oggi.json           per l'app: descrizione dei dati di oggi
    dati-elaborati/app/meteo/punti.bin.gz        per l'app: i numeri, compressi (circa 200-300 kB)
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import meteo_storico as S  # noqa: E402
import modello as M  # noqa: E402
import numpy as np  # noqa: E402

USCITA = S.RADICE / "dati-elaborati" / "previsione"
GIORNI_PRIMA, GIORNI_DOPO = 45, 16
ORIZZONTE = 14                                   # si pubblica da oggi a +14


USCITA_APP = S.RADICE / "dati-elaborati" / "app" / "meteo"
GIORNI_SERIE_PRIMA = 30                          # il grafico di "Perché qui?": 30 giorni passati + 14 futuri


def scrivi_per_app(meteo, gr, a, b, uscita):
    """File compatti per il telefono: oggi.json (descrizione) e punti.bin.gz (numeri).

    punti.bin.gz contiene, una dopo l'altra, tabelle di interi (piccolo-endiano). Per ogni
    tabella oggi.json dice nome, tipo, scala, forma e posizione: l'app divide per la scala
    per avere il valore vero. Il valore "mancante" è il più basso del tipo (es. -32768).
    Per punto e per giorno (da oggi a +14) ci sono gli ingredienti del fattore meteo; per
    punto e per giorno (da -30 a +14) le serie del grafico: pioggia, temperatura, suolo.
    """
    import gzip

    n = len(meteo["lat"])
    giorni_app = b - a
    s0, s1 = a - GIORNI_SERIE_PRIMA, a + ORIZZONTE + 1
    def serie(nome):
        v = np.full((s1 - s0, n), np.nan, np.float32)
        da, a_ = max(s0, 0), min(s1, len(meteo["giorni"]))
        v[da - s0:a_ - s0] = meteo[nome][da:a_]
        return v
    tabelle = [
        # nome, valori, tipo, scala
        ("lat", meteo["lat"], "f4", 1), ("lon", meteo["lon"], "f4", 1),
        ("quota", np.nan_to_num(meteo["quota"]), "f4", 1),
        ("P26", gr["P"][a:b], "u2", 10), ("T20", gr["T"][a:b], "i2", 100),
        ("TX7", gr["TX"][a:b], "i2", 100), ("TN3", gr["TN"][a:b], "i2", 100),
        ("secco", gr["secco"][a:b].astype(np.float32), "u1", 1),
        ("neve_cm", np.nan_to_num(gr["neve"][a:b]) * 100, "u2", 10),
        ("pioggia", serie("pioggia"), "u2", 10), ("t_media", serie("t_media"), "i2", 100),
        ("suolo_t", serie("suolo_t"), "i2", 100),
    ]
    mancante = {"u1": 255, "u2": 65535, "i2": -32768}
    campi, pezzi, posto = [], [], 0
    for nome, v, tipo, scala in tabelle:
        v = np.asarray(v, np.float64)
        if tipo == "f4":
            arr = v.astype("<f4")
        else:
            info = np.iinfo(np.dtype(tipo))
            q = np.round(v * scala)
            q = np.where(np.isfinite(q), np.clip(q, info.min + (1 if tipo == "i2" else 0),
                                                 info.max - (1 if tipo != "i2" else 0)), mancante[tipo])
            arr = q.astype("<" + tipo)
        dati = arr.tobytes()
        campi.append({"nome": nome, "tipo": tipo, "scala": scala, "forma": list(arr.shape), "inizio": posto,
                      "mancante": None if tipo == "f4" else mancante[tipo]})
        pezzi.append(dati)
        posto += len(dati)
        resto = (-posto) % 4                                   # allinea a 4 byte (viste tipizzate)
        pezzi.append(b"\0" * resto)
        posto += resto
    USCITA_APP.mkdir(parents=True, exist_ok=True)
    corpo = gzip.compress(b"".join(pezzi), compresslevel=9, mtime=0)
    (USCITA_APP / "punti.bin.gz").write_bytes(corpo)
    oggi = {
        "versione": 1, "creato": uscita["creato"], "corsa_del_modello": uscita["corsa_del_modello"],
        "dati_vecchi": uscita["dati_vecchi"], "oggi": uscita["oggi"], "giorni": uscita["giorni"],
        "affidabilita": uscita["affidabilita"],
        "gradiente_per_metro": [round(float(g), 6) for g in gr["G"][a:b]],
        "serie_da": str(meteo["giorni"][0] + np.timedelta64(s0, "D")) if s0 >= 0 else None,
        "giorni_serie": int(s1 - s0), "punti": n, "campi": campi,
        "file": {"punti.bin.gz": {"byte": len(corpo)}},
        "fonte": "Weather data by Open-Meteo.com - modello IFS dell'ECMWF, archivio aperto (CC BY 4.0)",
    }
    (USCITA_APP / "oggi.json").write_text(json.dumps(oggi, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Per l'app: oggi.json + punti.bin.gz ({len(corpo) / 1e3:.0f} kB compresso, {posto / 1e3:.0f} kB pieno), "
          f"{giorni_app} giorni")


def affidabilita(giorni_di_anticipo):
    """Per ora dipende solo dall'anticipo (stima): entro 2 giorni alta, entro 6 media, poi bassa."""
    return "alta" if giorni_di_anticipo <= 2 else "media" if giorni_di_anticipo <= 6 else "bassa"


def main():
    t0 = time.time()
    ins = S.INSIEMI["ifs"]
    dep = S.Deposito()
    meta = json.loads(dep.cat_file(f"data/{ins['modello']}/static/meta.json"))
    strisce, lat, lon = S.punti_gaussiani(dep, ins["modello"])
    oggi = np.datetime64(datetime.now(timezone.utc).date())
    primo = oggi - np.timedelta64(GIORNI_PRIMA, "D")
    giorni = np.arange(primo, oggi + np.timedelta64(GIORNI_DOPO + 1, "D"))
    inizio = int((primo - np.datetime64("1970-01-01")).astype(int)) * 24
    tabelle = {}
    for variabile, riassunti in ins["variabili"].items():
        presenti = dep.elenco(f"data/{ins['modello']}/{variabile}/")
        ore = S.ore_periodo(dep, ins["modello"], variabile, inizio, len(giorni) * 24, strisce, presenti)
        for k, tipo in riassunti.items():
            tabelle[k] = S.giornaliero(ore, tipo)
    with S.OmFileReader.from_fsspec(dep, f"data/{ins['modello']}/static/HSURF.om") as rd:
        quota = np.concatenate([rd[y:y + 1, x1:x2][0] for y, x1, x2 in strisce]).astype(np.float32)
    pieno = np.isfinite(tabelle["pioggia"]).all(axis=1) & np.isfinite(tabelle["t_media"]).all(axis=1)
    ultimo = int(np.flatnonzero(pieno)[-1])
    meteo = {"giorni": giorni[:ultimo + 1], "lat": lat.astype(np.float32), "lon": lon.astype(np.float32), "quota": quota,
             **{k: v[:ultimo + 1] for k, v in tabelle.items()}}
    USCITA.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(USCITA / "meteo_recente.npz", **meteo)

    soglia = np.load(S.RADICE / "data" / "suolo_secco.npz")["soglia"]
    gr = M.grandezze(meteo, soglia)
    a = int(np.searchsorted(meteo["giorni"], oggi))
    b = min(a + ORIZZONTE, ultimo) + 1
    corsa = datetime.fromtimestamp(meta["last_run_initialisation_time"], timezone.utc)
    ore_fa = (datetime.now(timezone.utc) - datetime.fromtimestamp(meta["last_run_modification_time"], timezone.utc)).total_seconds() / 3600
    def lista(x, cifre):
        v = np.round(np.asarray(x, np.float64), cifre)
        return (v.astype(int) if cifre == 0 else v).tolist()

    uscita = {
        "creato": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "modello": "ECMWF IFS 9 km, dall'archivio aperto di Open-Meteo (CC BY 4.0)",
        "corsa_del_modello": corsa.strftime("%Y-%m-%dT%H:%MZ"), "dati_vecchi": bool(ore_fa > 36),
        "oggi": str(oggi), "giorni": [str(g) for g in meteo["giorni"][a:b]],
        "affidabilita": [affidabilita(i) for i in range(b - a)],
        "punti": {"lat": lista(meteo["lat"], 4), "lon": lista(meteo["lon"], 4), "quota": lista(meteo["quota"], 0)},
        "gradiente_gradi_per_km": lista(gr["G"][a:b] * 1000, 2),
        "pioggia_26_giorni_mm": lista(gr["P"][a:b], 0), "temperatura_20_giorni": lista(gr["T"][a:b], 1),
        "massima_7_giorni": lista(gr["TX"][a:b], 1), "minima_3_giorni": lista(gr["TN"][a:b], 1),
        "suolo_secco": gr["secco"][a:b].astype(int).tolist(), "neve_cm": lista(gr["neve"][a:b] * 100, 0),
    }
    (USCITA / "previsione.json").write_text(json.dumps(uscita, separators=(",", ":")), encoding="utf-8")
    scrivi_per_app(meteo, gr, a, b, uscita)
    print(f"Corsa del modello: {uscita['corsa_del_modello']} (pubblicata {ore_fa:.0f} ore fa)"
          f"{'  ATTENZIONE: dati vecchi' if uscita['dati_vecchi'] else ''}")
    print(f"Giorni pubblicati: dal {uscita['giorni'][0]} al {uscita['giorni'][-1]} ({b - a}), {len(lat)} punti")
    print(f"Letti {dep.byte / 1e6:.0f} MB in {dep.richieste} richieste, {time.time() - t0:.0f} s; "
          f"previsione.json {(USCITA / 'previsione.json').stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()

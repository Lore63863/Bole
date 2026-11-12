#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 3 (Meteo), parte 1: storico meteo giornaliero dal 2015 a oggi.

Che cosa fa
    Per il riquadro di Piemonte e Liguria legge i dati orari dei modelli storici e li
    riassume giorno per giorno (giorni UTC): temperatura dell'aria, pioggia, temperatura
    e umidità del suolo, neve al suolo. Serve a calibrare il modello sui ritrovamenti.

Da dove
    Archivio aperto di Open-Meteo su AWS (licenza CC BY 4.0), che ridistribuisce:
      era5land  ERA5-Land (Copernicus/ECMWF), celle di circa 9 km: temperatura, suolo, neve
      era5      ERA5 (Copernicus/ECMWF), celle di circa 25 km: pioggia
      ifs       modello IFS (ECMWF), celle di circa 9 km, dal 2017: pioggia, temperatura, suolo,
                neve. Arriva fino a 15 giorni nel futuro: è lo stesso modello delle previsioni.
    Legge i file direttamente, a piccoli pezzi: non usa l'API di Open-Meteo e non consuma
    chiamate del suo limite gratuito.

Come si usa
    python3 pipeline/meteo_storico.py era5land        (oppure: era5, ifs)
    Se scrive "RILANCIA" va rilanciato uguale: riprende da dove era arrivato.

Dove scrive
    dati-elaborati/meteo_storico/<insieme>.npz
        giorni      date (un valore per giorno)
        lat, lon    coordinate dei punti della griglia del modello
        quota       quota della cella del modello, in metri
        una tabella "giorni x punti" per ogni grandezza (vedi GRANDEZZE qui sotto)

Servono: numpy, requests, omfiles (e pyproj per l'insieme ifs).
"""
import json
import os
import sys
import threading
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np
import requests
from omfiles import OmFileReader

RADICE = Path(os.environ.get("BOLE_RADICE", str(Path(__file__).resolve().parents[1])))
USCITA = RADICE / "dati-elaborati" / "meteo_storico"
LAVORO = Path(os.environ.get("BOLE_LAVORO", str(Path.home() / "bole-lavoro"))) / "meteo_storico"
DEPOSITO = "https://openmeteo.s3.amazonaws.com/"
RIQUADRO = (6.5, 43.6, 10.2, 46.6)          # longitudine ovest, latitudine sud, est, nord
ORE_PEZZO = 504                              # i file recenti ("chunk") coprono 21 giorni l'uno
T0 = time.time()
TEMPO_MAX = float(os.environ.get("BOLE_SECONDI", "500"))

# Per ogni insieme: cartella nel deposito, passo della griglia in gradi (None = griglia
# gaussiana ridotta dell'ECMWF), primo anno, e per ogni variabile i riassunti giornalieri.
INSIEMI = {
    "era5land": {"modello": "copernicus_era5_land", "passo": 0.1, "da": 2015, "variabili": {
        "temperature_2m": {"t_media": "media", "t_max": "max", "t_min": "min"},
        "soil_temperature_0_to_7cm": {"suolo_t": "media"},
        "soil_moisture_0_to_7cm": {"suolo_u": "media"},
        "soil_moisture_7_to_28cm": {"suolo_u2": "media"},
        "snow_depth": {"neve": "media"}}},
    "era5": {"modello": "copernicus_era5", "passo": 0.25, "da": 2015, "variabili": {
        "precipitation": {"pioggia": "somma"}}},
    "ifs": {"modello": "ecmwf_ifs", "passo": None, "da": 2017, "variabili": {
        "precipitation": {"pioggia": "somma"},
        "temperature_2m": {"t_media": "media", "t_max": "max", "t_min": "min"},
        "soil_temperature_0_to_7cm": {"suolo_t": "media"},
        "soil_moisture_0_to_7cm": {"suolo_u": "media"},
        "soil_moisture_7_to_28cm": {"suolo_u2": "media"},
        "snow_depth": {"neve": "media"}}},
}
GRANDEZZE = {
    "t_media": "temperatura media dell'aria a 2 m (°C)", "t_max": "massima (°C)", "t_min": "minima (°C)",
    "suolo_t": "temperatura del suolo fra 0 e 7 cm, media (°C)",
    "suolo_u": "umidità del suolo fra 0 e 7 cm, media (m³ d'acqua per m³)",
    "suolo_u2": "umidità del suolo fra 7 e 28 cm, media (m³ d'acqua per m³)",
    "neve": "neve al suolo, altezza media (m)", "pioggia": "precipitazione del giorno (mm)",
}


def resta():
    return TEMPO_MAX - (time.time() - T0)


class Deposito:
    """Il poco che serve a omfiles per leggere un file lontano: `size` e `cat_file`.

    Ogni lettura chiede al server un pezzo un po' più lungo del necessario e lo tiene in
    memoria: così le migliaia di piccole letture vicine diventano poche richieste.
    """

    def __init__(self, avanti=256 * 1024):
        self.avanti = avanti
        self.locale = threading.local()
        self.blocco = threading.Lock()
        self.pezzi, self.dimensioni = {}, {}
        self.richieste = self.byte = 0

    def _sessione(self):
        if not hasattr(self.locale, "s"):
            self.locale.s = requests.Session()
        return self.locale.s

    def _chiedi(self, metodo, percorso, intestazioni=None):
        for tentativo in range(4):
            try:
                r = self._sessione().request(metodo, DEPOSITO + percorso, headers=intestazioni or {}, timeout=120)
                if r.status_code == 404:
                    raise FileNotFoundError(percorso)
                r.raise_for_status()
                return r
            except requests.RequestException:          # rete caduta a metà: si riprova
                if tentativo == 3:
                    raise
                time.sleep(3 * (tentativo + 1))

    def size(self, path):
        percorso = path                 # omfiles chiama questi due metodi con i nomi inglesi
        if percorso not in self.dimensioni:
            self.dimensioni[percorso] = int(self._chiedi("HEAD", percorso).headers["Content-Length"])
        return self.dimensioni[percorso]

    def cat_file(self, path, start=None, end=None, **_):
        percorso = path
        fine_file = self.size(percorso)
        start = 0 if start is None else start
        end = fine_file if end is None else end
        with self.blocco:
            for a, b, dati in self.pezzi.get(percorso, ()):
                if a <= start and end <= b:
                    return dati[start - a:end - a]
        fino = min(max(end, start + self.avanti), fine_file)
        dati = self._chiedi("GET", percorso, {"Range": f"bytes={start}-{fino - 1}"}).content
        with self.blocco:
            self.pezzi.setdefault(percorso, []).append((start, start + len(dati), dati))
            self.richieste += 1
            self.byte += len(dati)
        return dati[:end - start]

    def dimentica(self, percorso):
        with self.blocco:
            self.pezzi.pop(percorso, None)

    def elenco(self, cartella):
        """Nomi dei file di una cartella del deposito."""
        nomi, gettone = set(), None
        while True:
            q = {"list-type": "2", "prefix": cartella, "delimiter": "/", "max-keys": "1000"}
            if gettone:
                q["continuation-token"] = gettone
            r = self._sessione().get(DEPOSITO, params=q, timeout=60)
            r.raise_for_status()
            radice = ET.fromstring(r.content)
            ns = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
            nomi |= {c.find("s:Key", ns).text.rsplit("/", 1)[1] for c in radice.findall("s:Contents", ns)}
            prossimo = radice.find("s:NextContinuationToken", ns)
            if prossimo is None:
                return nomi
            gettone = prossimo.text


def leggi(dep, percorso, strisce, fili=int(os.environ.get("BOLE_FILI", "8"))):
    """Legge da un file le strisce di punti richieste. Rende una tabella punti x ore."""
    def una(s):
        y, x1, x2 = s
        for tentativo in range(3):
            try:
                with OmFileReader.from_fsspec(dep, percorso) as rd:
                    return rd[y:y + 1, x1:x2, :][0]
            except (RuntimeError, OSError):            # lettura interrotta: si riprova
                if tentativo == 2:
                    raise
                time.sleep(5)

    # I file "chunk" sono corti: basta leggere poco oltre il necessario
    dep.avanti = 64 * 1024 if "/chunk_" in percorso else 256 * 1024
    prima = una(strisce[0])            # la prima da sola: scalda l'indice del file
    with ThreadPoolExecutor(fili) as gruppo:
        resto = list(gruppo.map(una, strisce[1:]))
    dep.dimentica(percorso)
    return np.concatenate([prima] + resto, axis=0)


def punti_regolari(passo):
    """Strisce (riga, colonna iniziale, colonna finale) e coordinate per una griglia regolare."""
    o, s, e, n = RIQUADRO
    r1, r2 = int(round((s + 90) / passo)), int(round((n + 90) / passo))
    c1, c2 = int(round((o + 180) / passo)), int(round((e + 180) / passo))
    strisce = [(r, c1, c2 + 1) for r in range(r1, r2 + 1)]
    lat = np.repeat(-90 + passo * np.arange(r1, r2 + 1), c2 - c1 + 1)
    lon = np.tile(-180 + passo * np.arange(c1, c2 + 1), r2 - r1 + 1)
    return strisce, lat, lon


def punti_gaussiani(dep, modello):
    """Come sopra per la griglia gaussiana ridotta dell'ECMWF (un'unica fila di punti)."""
    from omfiles.grids import OmGrid
    meta = json.loads(dep.cat_file(f"data/{modello}/static/meta.json"))
    with OmFileReader.from_fsspec(dep, f"data/{modello}/static/HSURF.om") as rd:
        forma = tuple(int(v) for v in rd.shape)
    griglia = OmGrid(meta["crs_wkt"], forma)
    lat, lon = np.asarray(griglia.latitude).ravel(), np.asarray(griglia.longitude).ravel()
    lon = np.where(lon > 180, lon - 360, lon)
    o, s, e, n = RIQUADRO
    dentro = np.flatnonzero((lat >= s) & (lat <= n) & (lon >= o) & (lon <= e))
    tagli = np.flatnonzero(np.diff(dentro) > 1) + 1
    strisce = [(0, int(g[0]), int(g[-1]) + 1) for g in np.split(dentro, tagli)]
    return strisce, lat[dentro], lon[dentro]


def ore_periodo(dep, modello, variabile, inizio, n_ore, strisce, presenti):
    """Tabella punti x ore per un periodo qualsiasi, letta dai file a pezzi di 21 giorni.

    inizio: ore passate dal 1° gennaio 1970 (UTC) alla prima ora del periodo.
    """
    n_punti = sum(x2 - x1 for _, x1, x2 in strisce)
    out = np.full((n_punti, n_ore), np.nan, np.float32)
    cartella = f"data/{modello}/{variabile}/"
    for n in range(inizio // ORE_PEZZO, (inizio + n_ore - 1) // ORE_PEZZO + 1):
        if f"chunk_{n}.om" not in presenti:
            continue
        a = leggi(dep, cartella + f"chunk_{n}.om", strisce)
        da = n * ORE_PEZZO - inizio                      # posizione del pezzo dentro il periodo
        i1, i2 = max(da, 0), min(da + a.shape[1], n_ore)
        if i2 > i1:
            out[:, i1:i2] = a[:, i1 - da:i2 - da]
    return out


def ore_anno(dep, modello, variabile, anno, strisce, presenti):
    """Tabella punti x ore di un anno intero (NaN dove il dato non c'è ancora)."""
    inizio = int((np.datetime64(f"{anno}-01-01T00") - np.datetime64("1970-01-01T00")) / np.timedelta64(1, "h"))
    n_ore = int((np.datetime64(f"{anno + 1}-01-01T00") - np.datetime64(f"{anno}-01-01T00")) / np.timedelta64(1, "h"))
    if f"year_{anno}.om" in presenti:                    # gli anni chiusi stanno in un file solo
        a = leggi(dep, f"data/{modello}/{variabile}/year_{anno}.om", strisce)
        out = np.full((a.shape[0], n_ore), np.nan, np.float32)
        out[:, :min(a.shape[1], n_ore)] = a[:, :n_ore]
        return out
    return ore_periodo(dep, modello, variabile, inizio, n_ore, strisce, presenti)


def giornaliero(ore, tipo):
    """Riassunto per giorno (UTC) di una tabella punti x ore; NaN se al giorno manca qualche ora."""
    x = ore.reshape(ore.shape[0], -1, 24)
    completo = np.isfinite(x).all(axis=2)
    with np.errstate(invalid="ignore"):
        g = {"media": x.mean, "max": x.max, "min": x.min, "somma": x.sum}[tipo](axis=2)
    g[~completo] = np.nan
    return g.T.astype(np.float32)                        # giorni x punti


def main(nome):
    ins = INSIEMI[nome]
    LAVORO.mkdir(parents=True, exist_ok=True)
    dep = Deposito()
    if ins["passo"] is None:
        strisce, lat, lon = punti_gaussiani(dep, ins["modello"])
    else:
        strisce, lat, lon = punti_regolari(ins["passo"])
    print(f"{nome}: {len(lat)} punti in {len(strisce)} strisce")
    ultimo = date.today().year
    for variabile, riassunti in ins["variabili"].items():
        presenti = dep.elenco(f"data/{ins['modello']}/{variabile}/")
        for anno in range(ins["da"], ultimo + 1):
            f = LAVORO / f"{nome}_{variabile}_{anno}.npz"
            if f.exists() and anno < ultimo:
                continue
            if resta() < 90:
                print(f"RILANCIA: fermo a {variabile} {anno}")
                return
            t = time.time()
            ore = ore_anno(dep, ins["modello"], variabile, anno, strisce, presenti)
            np.savez_compressed(f, **{k: giornaliero(ore, tipo) for k, tipo in riassunti.items()})
            print(f"  {variabile} {anno}: {100 * np.isfinite(ore).mean():.0f}% delle ore presenti, "
                  f"{time.time() - t:.0f} s, {dep.richieste} richieste e {dep.byte / 1e6:.0f} MB finora")
    # Unione di tutti gli anni in un file solo
    giorni = np.arange(np.datetime64(f"{ins['da']}-01-01"), np.datetime64(f"{ultimo + 1}-01-01"))
    tabelle = {}
    for variabile, riassunti in ins["variabili"].items():
        anni = [np.load(LAVORO / f"{nome}_{variabile}_{a}.npz") for a in range(ins["da"], ultimo + 1)]
        for k in riassunti:
            tabelle[k] = np.concatenate([a[k] for a in anni], axis=0)
            assert tabelle[k].shape == (len(giorni), len(lat)), (k, tabelle[k].shape)
    pieno = np.isfinite(next(iter(tabelle.values()))).any(axis=1)
    fine = int(np.flatnonzero(pieno)[-1]) + 1            # si taglia dopo l'ultimo giorno con dati
    with OmFileReader.from_fsspec(dep, f"data/{ins['modello']}/static/HSURF.om") as rd:
        quota = np.concatenate([rd[y:y + 1, x1:x2][0] for y, x1, x2 in strisce]).astype(np.float32)
    quota[quota < -500] = np.nan                         # nei file -999 vuol dire mare
    USCITA.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(USCITA / f"{nome}.npz", giorni=giorni[:fine], lat=lat.astype(np.float32),
                        lon=lon.astype(np.float32), quota=quota, **{k: v[:fine] for k, v in tabelle.items()})
    (USCITA / f"{nome}.json").write_text(json.dumps({
        "fonte": "Open-Meteo, archivio aperto su AWS (s3://openmeteo), licenza CC BY 4.0",
        "modello": ins["modello"], "riquadro_lon_lat": RIQUADRO, "punti": int(len(lat)),
        "primo_giorno": str(giorni[0]), "ultimo_giorno": str(giorni[fine - 1]), "giorni": "UTC",
        "grandezze": {k: GRANDEZZE[k] for k in tabelle}, "letto_il": str(date.today())},
        ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"scritto {nome}.npz: {(USCITA / (nome + '.npz')).stat().st_size / 1e6:.1f} MB, "
          f"dal {giorni[0]} al {giorni[fine - 1]}; {dep.richieste} richieste, {dep.byte / 1e6:.0f} MB letti")
    print("finito")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in INSIEMI:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
    print(f"({time.time() - T0:.0f} s)")

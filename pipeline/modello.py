#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - il modello: dal meteo all'indice di nascita. Serve solo numpy.

    indice = H x M x S          (spiegazione completa in docs/MODEL.md)

    H  habitat: dove la specie può vivere (fisso, da pipeline/habitat_calcola.py)
    M  meteo: pioggia degli ultimi 26 giorni, temperatura media degli ultimi 20 giorni
       riportata alla quota del punto, più quattro freni (caldo, suolo secco, gelo, neve)
    S  stagione: quanto quel giorno dell'anno è "di stagione" per la specie

Qui stanno solo le formule, usate allo stesso modo da calibrazione, previsione giornaliera
e controlli automatici. I numeri (parametri per specie) stanno in data/modello.json.
"""
import json
from pathlib import Path

import numpy as np

GIORNI_PIOGGIA, GIORNI_TEMPERATURA = 26, 20     # finestre mobili (letteratura: vedi docs/MODEL.md)
GIORNI_CALDO, GIORNI_GELO, GIORNI_SUOLO = 7, 3, 7
PAVIMENTO_PIOGGIA = 0.05                        # con pioggia zero il fattore non scende sotto questo valore
GRADIENTE_NORMALE = -0.0065                     # °C per metro di quota (valore standard)
GRADIENTE_MIN, GRADIENTE_MAX = -0.0085, -0.0030
MARGINE_NEVE_M = 200.0                          # la neve del modello vale da (quota dei punti innevati - 200 m) in su
QUOTA_SENZA_NEVE = 9999.0                       # "nessuna quota con neve"


def carica_parametri(percorso=None):
    """Parametri del modello per specie (data/modello.json)."""
    percorso = percorso or Path(__file__).resolve().parents[1] / "data" / "modello.json"
    return json.loads(Path(percorso).read_text(encoding="utf-8"))


# --- Finestre mobili lungo i giorni (asse 0). I primi n-1 giorni restano NaN. -------------
def _finestre(x, n):
    return np.lib.stride_tricks.sliding_window_view(x, n, axis=0)


def _riempi(v, n, forma):
    out = np.full(forma, np.nan, np.float32)
    out[n - 1:] = v
    return out


def somma_mobile(x, n):
    c = np.cumsum(np.nan_to_num(np.asarray(x, np.float64)), axis=0)
    c = np.concatenate([np.zeros((1,) + c.shape[1:]), c], axis=0)
    buchi = np.cumsum(~np.isfinite(x), axis=0)
    buchi = np.concatenate([np.zeros((1,) + buchi.shape[1:], buchi.dtype), buchi], axis=0)
    s = (c[n:] - c[:-n]).astype(np.float32)
    s[(buchi[n:] - buchi[:-n]) > 0] = np.nan
    return _riempi(s, n, x.shape)


def media_mobile(x, n):
    return somma_mobile(x, n) / n


def max_mobile(x, n):
    return _riempi(_finestre(x, n).max(axis=-1), n, x.shape)


def min_mobile(x, n):
    return _riempi(_finestre(x, n).min(axis=-1), n, x.shape)


def gradiente_del_giorno(t_media, quota):
    """Quanto cambia la temperatura con la quota, giorno per giorno (°C per metro).

    Retta ai minimi quadrati fra temperatura e quota dei punti del modello meteo, poi
    tenuta fra limiti ragionevoli. È una stima regionale: le inversioni termiche nelle
    singole valli non le vede.
    """
    ok = np.isfinite(quota)
    z = quota[ok] - quota[ok].mean()
    t = t_media[:, ok]
    g = ((t - t.mean(axis=1, keepdims=True)) * z).sum(axis=1) / (z ** 2).sum()
    g = np.where(np.isfinite(g), g, GRADIENTE_NORMALE)
    return np.clip(g, GRADIENTE_MIN, GRADIENTE_MAX).astype(np.float32)


def giorno_dell_anno(giorni):
    """Numero del giorno nell'anno (1-366) per un elenco di date numpy."""
    g = np.asarray(giorni, "datetime64[D]")
    return ((g - g.astype("datetime64[Y]")).astype(int) + 1).astype(np.int16)


def soglia_suolo_secco(suolo_u7, giorni, quantile=0.20, mezza_finestra=30):
    """Per ogni giorno dell'anno e ogni punto: umidità del suolo sotto cui "è secco".

    È il 20° percentile dell'umidità (media di 7 giorni) osservata in quel punto, in tutti
    gli anni dello storico, nei 30 giorni prima e dopo quella data.
    """
    doy = giorno_dell_anno(giorni)
    soglia = np.full((367, suolo_u7.shape[1]), np.nan, np.float32)
    for d in range(1, 367):
        dist = np.abs(doy - d)
        vicini = np.minimum(dist, 366 - dist) <= mezza_finestra
        soglia[d] = np.nanquantile(suolo_u7[vicini], quantile, axis=0)
    return soglia


def grandezze(meteo, soglia_secco=None, giorni_pioggia=GIORNI_PIOGGIA, ritardo_pioggia=0,
              giorni_temperatura=GIORNI_TEMPERATURA):
    """Dalle tabelle giornaliere "giorni x punti" alle grandezze che usa il modello.

    meteo: giorni, quota e le tabelle pioggia, t_media, t_max, t_min, suolo_u, neve.
    Rende: P (pioggia su 26 giorni), T (media su 20 giorni, alla quota del punto del modello
    meteo), TX (massima degli ultimi 7 giorni), TN (minima degli ultimi 3), G (gradiente
    medio su 20 giorni), U7 (umidità del suolo, media di 7 giorni), secco (vero o falso),
    neve (metri). Le finestre si possono cambiare solo per fare prove (pipeline/calibra.py):
    ritardo_pioggia = giorni più recenti da non contare nella pioggia.
    """
    g = gradiente_del_giorno(meteo["t_media"], meteo["quota"])
    u7 = media_mobile(meteo["suolo_u"], GIORNI_SUOLO)
    if soglia_secco is None:
        soglia_secco = soglia_suolo_secco(u7, meteo["giorni"])
    doy = giorno_dell_anno(meteo["giorni"])
    pioggia = somma_mobile(meteo["pioggia"], giorni_pioggia)
    if ritardo_pioggia:
        pioggia = np.concatenate([np.full((ritardo_pioggia,) + pioggia.shape[1:], np.nan, np.float32),
                                  pioggia[:-ritardo_pioggia]], axis=0)
    return {
        "P": pioggia,
        "T": media_mobile(meteo["t_media"], giorni_temperatura),
        "TX": max_mobile(meteo["t_max"], GIORNI_CALDO),
        "TN": min_mobile(meteo["t_min"], GIORNI_GELO),
        "G": media_mobile(g[:, None], giorni_temperatura)[:, 0],
        "U7": u7,
        "secco": u7 < soglia_secco[doy],
        "neve": meteo["neve"],
        "soglia_secco": soglia_secco,
    }


def vicini(lat, lon, lat_punti, lon_punti, k=4):
    """Per ogni posizione: i k punti del modello meteo più vicini e i loro pesi (somma 1).

    Peso = inverso del quadrato della distanza: il campo meteo risulta liscio, senza gradini.
    """
    lat, lon = np.atleast_1d(lat).astype(np.float64), np.atleast_1d(lon).astype(np.float64)
    dy = (lat[:, None] - lat_punti[None, :]) * 111.2
    dx = (lon[:, None] - lon_punti[None, :]) * 111.2 * np.cos(np.radians(lat))[:, None]
    d2 = dx ** 2 + dy ** 2
    k = min(k, d2.shape[1])
    idx = np.argpartition(d2, k - 1, axis=1)[:, :k]
    w = 1.0 / np.maximum(np.take_along_axis(d2, idx, axis=1), 0.01)
    return idx, (w / w.sum(axis=1, keepdims=True)).astype(np.float32)


def quota_neve(neve_vicini, quota_vicini, pesi):
    """Quota sopra cui vale la neve del modello meteo, per una posizione (ultimo asse = i 4 vicini).

    Il modello a 9 km dà la neve alla quota media della sua cella: con 15 cm a 1.800 m non è
    detto che ci sia neve in un fondovalle a 900 m. Si prende la quota media (pesata) dei punti
    vicini che hanno più di 1 cm di neve, meno 200 m (stima): sotto quella quota il freno della
    neve non scatta. Se nessun vicino ha neve: QUOTA_SENZA_NEVE.
    """
    con = np.nan_to_num(neve_vicini) > 0.01
    ww = pesi * con
    s = ww.sum(axis=-1)
    z = (ww * quota_vicini).sum(axis=-1) / np.where(s > 0, s, 1.0)
    return np.where(s > 0, z - MARGINE_NEVE_M, QUOTA_SENZA_NEVE).astype(np.float32)


def fattore_temperatura(p, t):
    return np.exp(-0.5 * ((t - p["t_ottimo"]) / p["t_larghezza"]) ** 2)


def fattore_pioggia(p, pioggia):
    return np.clip(pioggia / p["pioggia_piena"], PAVIMENTO_PIOGGIA, 1.0)


def fattore_meteo(p, pioggia, t, t_max, t_min, secco, neve):
    """M fra 0 e 1. Tutte le temperature devono essere già riportate alla quota del punto."""
    m = fattore_temperatura(p, t) * fattore_pioggia(p, pioggia)
    m = np.where(t_max > p["caldo_soglia"], m * p["caldo_freno"], m)
    m = np.where(secco, m * p["secco_freno"], m)
    m = np.where(t_min < p["gelo_soglia"], m * p["gelo_freno"], m)
    m = np.where(np.nan_to_num(neve) > 0.01, m * p["neve_freno"], m)        # neve senza dato: nessun freno
    return m


def curva_stagione(giorni_dei_ritrovamenti, larghezza=18.0, pavimento=0.03):
    """Curva di stagione (indice 1-366, massimo 1) dai giorni dell'anno dei ritrovamenti.

    Ogni ritrovamento "spalma" il suo peso sui giorni vicini (campana larga 18 giorni).
    Un piccolo pavimento evita che la stagione valga zero dove mancano dati.
    """
    d = np.arange(1, 367)[:, None]
    dist = np.abs(d - np.asarray(giorni_dei_ritrovamenti, float)[None, :])
    dist = np.minimum(dist, 366 - dist)
    s = np.exp(-0.5 * (dist / larghezza) ** 2).sum(axis=1)
    s = s / s.max() if s.max() > 0 else np.ones(366)
    s = pavimento + (1 - pavimento) * s
    return np.concatenate([[np.nan], s]).astype(np.float32)        # posizione 0 non usata


def classe(indice, soglie):
    """Classe da 0 (nessuna) a 5 (molto alta) dato l'indice 0-1 e le quattro soglie fra le classi."""
    return np.where(indice <= 0, 0, 1 + np.digitize(indice, soglie)).astype(np.uint8)

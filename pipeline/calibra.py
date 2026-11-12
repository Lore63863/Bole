#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 3 (Calibrazione), parte 2: taratura del modello sui ritrovamenti pubblici.

Che cosa fa
    1. Per ogni ritrovamento ricostruisce il meteo di tutto il suo anno in quel punto
       (pioggia su 26 giorni, temperatura su 20 giorni alla quota del punto, freni).
    2. Cerca i valori di temperatura ottimale, tolleranza e pioggia "piena" con cui il
       giorno del ritrovamento risulta fra i più favorevoli dell'anno. Parte dai valori di
       letteratura e se ne allontana solo quanto i dati giustificano.
    3. Controlla lasciando fuori un anno alla volta: il modello viene tarato sugli altri
       anni e giudicato sull'anno che non ha visto.
    4. Confronta con due riferimenti semplici: "solo calendario" e "solo pioggia".

Misura principale
    Quota dei ritrovamenti che cade nel 20% dei giorni dell'anno con indice più alto.
    Tirando a caso sarebbe il 20%.

Come si usa
    python3 pipeline/calibra.py                 taratura e controllo; scrive i parametri
    python3 pipeline/calibra.py --esperimenti   prova alcune varianti del modello (non cambia i parametri)

Dove scrive
    data/modello.json                               parametri per specie, curve di stagione, soglie delle classi
    data/suolo_secco.npz                            soglia di "suolo secco" per punto e giorno dell'anno
    dati-elaborati/calibrazione/risultati.json      tutte le misure
    dati-elaborati/calibrazione/esperimenti.json    confronto fra le varianti
"""
import csv
import json
import sys
from datetime import date
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import modello as M  # noqa: E402
import numpy as np  # noqa: E402
from scipy.optimize import minimize  # noqa: E402

RADICE = Path(__file__).resolve().parents[1]
CAL = RADICE / "dati-elaborati" / "calibrazione"
PRIMO_ANNO = 2017                 # da qui c'è il modello meteo IFS a 9 km
INCERTEZZA_MAX = 1000             # metri: oltre, la quota del punto non è affidabile
PICCOLO = 1e-3                    # evita lo zero assoluto nei conti
UN_GIORNO = np.timedelta64(1, "D")
CARICO_IN_PIANO = 0.71            # carico termico di un terreno in piano a 45° nord

# Valori di partenza. Etichette: L = letteratura, S = stima da calibrare.
# t_ottimo e t_larghezza: temperatura media su 20 giorni (°C); pioggia_piena: mm in 26 giorni.
FRENI = {"caldo_soglia": 30.0, "caldo_freno": 0.5, "secco_freno": 0.5, "gelo_soglia": -2.0, "gelo_freno": 0.2,
         "neve_freno": 0.0}
PARTENZA = {
    "porcino":          {"t_ottimo": 13.5, "t_larghezza": 3.0, "pioggia_piena": 80, "etichetta": "L"},
    "porcino_nero":     {"t_ottimo": 18.0, "t_larghezza": 3.0, "pioggia_piena": 80, "etichetta": "S"},
    "porcino_estivo":   {"t_ottimo": 17.0, "t_larghezza": 3.5, "pioggia_piena": 80, "etichetta": "S"},
    "porcino_rosso":    {"t_ottimo": 12.0, "t_larghezza": 3.5, "pioggia_piena": 80, "etichetta": "S"},
    "gallinaccio":      {"t_ottimo": 15.0, "t_larghezza": 4.0, "pioggia_piena": 60, "etichetta": "S"},
    "ovolo":            {"t_ottimo": 19.0, "t_larghezza": 3.0, "pioggia_piena": 60, "etichetta": "S",
                         "caldo_soglia": 33.0},
    "mazza_di_tamburo": {"t_ottimo": 15.0, "t_larghezza": 4.0, "pioggia_piena": 60, "etichetta": "S"},
    "chiodino":         {"t_ottimo": 11.0, "t_larghezza": 3.0, "pioggia_piena": 60, "etichetta": "S"},
    "trombetta":        {"t_ottimo": 11.0, "t_larghezza": 3.0, "pioggia_piena": 100, "etichetta": "S"},
    "steccherino":      {"t_ottimo": 9.0, "t_larghezza": 4.0, "pioggia_piena": 80, "etichetta": "S",
                         "gelo_freno": 0.5},
    "sanguinello":      {"t_ottimo": 11.0, "t_larghezza": 3.0, "pioggia_piena": 70, "etichetta": "S"},
    "spugnole":         {"t_ottimo": 10.5, "t_larghezza": 3.0, "pioggia_piena": 40, "etichetta": "L"},
    "prugnolo":         {"t_ottimo": 11.0, "t_larghezza": 3.0, "pioggia_piena": 50, "etichetta": "S"},
    "dormiente":        {"t_ottimo": 4.0, "t_larghezza": 3.0, "pioggia_piena": 30, "etichetta": "S",
                         "neve_freno": 1.0, "gelo_freno": 0.6},
}
# Quanto ci si fida dei valori di partenza (scarto tipo): più è piccolo, più dati servono per spostarli
FIDUCIA = {"t_ottimo": 2.5, "log_t_larghezza": 0.35, "log_pioggia_piena": 0.5}
PORCINI = ("porcino", "porcino_nero", "porcino_estivo", "porcino_rosso")
GRUPPI = {"porcini": PORCINI, "tutte": tuple(PARTENZA)}
MODELLI = ("calendario", "pioggia", "meteo", "completo")
QUANTILI_CLASSI = (0.60, 0.80, 0.90, 0.97)      # confini fra le 5 classi, sui giorni di stagione
BASE = {"freni": True, "giorni_pioggia": M.GIORNI_PIOGGIA, "ritardo_pioggia": 0,
        "giorni_temperatura": M.GIORNI_TEMPERATURA, "k_esposizione": 0.0, "temperatura": "aria", "calo_peso": 0.0,
        "fasce": None}
MIN_FASCIA = 8      # sotto questo numero di ritrovamenti una fascia di quota usa la curva della specie
VARIANTI = {
    "modello base": {},
    "senza freni (caldo, secco, gelo)": {"freni": False},
    "pioggia su 14 giorni": {"giorni_pioggia": 14},
    "pioggia su 40 giorni": {"giorni_pioggia": 40},
    "pioggia fra 5 e 30 giorni prima": {"giorni_pioggia": 26, "ritardo_pioggia": 4},
    "temperatura su 10 giorni": {"giorni_temperatura": 10},
    "temperatura su 30 giorni": {"giorni_temperatura": 30},
    "esposizione: +3 °C per unità di carico termico": {"k_esposizione": 3.0},
    "solo freno del caldo": {"freni": ("caldo",)},
    "solo freno del suolo secco": {"freni": ("secco",)},
    "solo freno del gelo": {"freni": ("gelo",)},
    "temperatura del suolo al posto dell'aria": {"temperatura": "suolo"},
    "premio al calo di temperatura del suolo": {"calo_peso": 1.0},
    "stagione per fascia di quota (sotto e sopra 1000 m)": {"fasce": (1000,)},
    "stagione per fascia di quota (sotto 700, 700-1300, sopra 1300 m)": {"fasce": (700, 1300)},
}


def leggi_ritrovamenti(ultimo_giorno):
    """Ritrovamenti dal 2017, un solo record per specie, giorno e chilometro quadrato circa."""
    righe, visti = [], set()
    with open(CAL / "ritrovamenti.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            giorno = np.datetime64(r["data"])
            chiave = (r["specie"], r["data"], round(float(r["lat"]), 2), round(float(r["lon"]), 2))
            if int(r["data"][:4]) < PRIMO_ANNO or giorno > ultimo_giorno or chiave in visti:
                continue
            visti.add(chiave)
            righe.append({"specie": r["specie"], "giorno": giorno, "anno": int(r["data"][:4]),
                          "lat": float(r["lat"]), "lon": float(r["lon"]), "quota": float(r["quota"]),
                          "carico": float(r["carico_termico"]),
                          "preciso": r["incertezza_m"] != "" and int(r["incertezza_m"]) <= INCERTEZZA_MAX})
    return righe


def meteo_dei_ritrovamenti(righe, meteo, gr, ultimo_giorno, k_esposizione=0.0):
    """Per ogni ritrovamento: le grandezze del modello in tutti i giorni del suo anno.

    Rende tabelle "ritrovamenti x 366" (NaN nei giorni senza dato) e la posizione del giorno
    del ritrovamento dentro l'anno.
    """
    giorni = meteo["giorni"]
    quota_punti = np.nan_to_num(meteo["quota"])            # i punti del modello in mare stanno a quota zero
    n = len(righe)
    idx, w = M.vicini([r["lat"] for r in righe], [r["lon"] for r in righe], meteo["lat"], meteo["lon"])
    out = {k: np.full((n, 366), np.nan, np.float32) for k in ("P", "T", "TX", "TN", "neve", "calo")}
    out["secco"] = np.zeros((n, 366), bool)
    out["doy"] = np.zeros((n, 366), np.int16)
    out["quando"] = np.zeros(n, int)
    for i, r in enumerate(righe):
        a = int(np.searchsorted(giorni, np.datetime64(f"{r['anno']}-01-01")))
        b = int(np.searchsorted(giorni, min(np.datetime64(f"{r['anno'] + 1}-01-01"), ultimo_giorno + UN_GIORNO)))
        m = b - a
        k, p = idx[i], w[i][None, :]
        dz = (r["quota"] - quota_punti[k])[None, :]                    # metri fra il punto e i punti del modello
        g = gr["G"][a:b, None]
        sole = k_esposizione * (r["carico"] - CARICO_IN_PIANO)         # versante più o meno scaldato dal sole
        out["P"][i, :m] = (gr["P"][a:b][:, k] * p).sum(axis=1)
        out["T"][i, :m] = ((gr["T"][a:b][:, k] + g * dz) * p).sum(axis=1) + sole
        out["TX"][i, :m] = ((gr["TX"][a:b][:, k] + g * dz) * p).sum(axis=1) + sole
        out["TN"][i, :m] = ((gr["TN"][a:b][:, k] + g * dz) * p).sum(axis=1) + sole
        neve_v = gr["neve"][a:b][:, k]
        qn = M.quota_neve(neve_v, quota_punti[k][None, :], p)            # neve solo sopra questa quota
        out["neve"][i, :m] = np.where(r["quota"] >= qn, (neve_v * p).sum(axis=1), 0.0)
        out["calo"][i, :m] = (gr["CALO"][a:b][:, k] * p).sum(axis=1)
        out["secco"][i, :m] = gr["secco"][a:b][:, k[np.argmax(w[i])]]
        out["doy"][i, :m] = M.giorno_dell_anno(giorni[a:b])
        out["quando"][i] = int((r["giorno"] - giorni[a]).astype(int))
    return out


def parametri(specie, theta=None, freni=True, calo_peso=0.0):
    """Parametri di una specie. freni: True (tutti), False (nessuno) o l'elenco di quelli accesi."""
    p = {**FRENI, **{k: v for k, v in PARTENZA[specie].items() if k != "etichetta"}}
    accesi = ("caldo", "secco", "gelo", "neve") if freni is True else () if freni is False else tuple(freni)
    for nome in ("caldo", "secco", "gelo", "neve"):
        if nome not in accesi:
            p[nome + "_freno"] = 1.0
    p["calo_peso"] = calo_peso
    if theta is not None:
        p["t_ottimo"] = float(theta[0])
        p["t_larghezza"] = float(np.clip(np.exp(theta[1]), 1.5, 7.0))
        p["pioggia_piena"] = float(np.clip(np.exp(theta[2]), 15.0, 200.0))
    return p


def valori_stagione(stagione, doy):
    """S nei giorni dati: la curva e una sola (1 dimensione) o una per ritrovamento (2 dimensioni)."""
    return stagione[doy] if stagione.ndim == 1 else np.take_along_axis(stagione, doy.astype(np.intp), axis=1)


def intensita(p, F, sel, stagione=None, solo=None):
    """Indice (senza habitat) per i ritrovamenti scelti, in ogni giorno del loro anno."""
    if solo == "calendario":
        lam = valori_stagione(stagione, F["doy"][sel])
    elif solo == "pioggia":
        lam = M.fattore_pioggia(p, F["P"][sel])
    else:
        lam = M.fattore_meteo(p, F["P"][sel], F["T"][sel], F["TX"][sel], F["TN"][sel], F["secco"][sel], F["neve"][sel])
        if p.get("calo_peso", 0) > 0:                  # prova: premio se il suolo si è raffreddato da poco
            lam = lam * (1 + p["calo_peso"] * np.clip(np.nan_to_num(F["calo"][sel]) / 3.0, 0, 1))
        if stagione is not None:
            lam = lam * valori_stagione(stagione, F["doy"][sel])
    lam = lam + PICCOLO
    lam[~np.isfinite(F["P"][sel]) | ~np.isfinite(F["T"][sel])] = np.nan     # giorni senza dato
    return lam


def punteggi(lam, quando):
    """Per ogni ritrovamento: posto in classifica del suo giorno (0 = il migliore) e verosimiglianza."""
    n = np.arange(len(quando))
    mio = lam[n, quando]
    validi = np.isfinite(lam)
    davanti = ((lam > mio[:, None]) & validi).sum(axis=1) + 0.5 * ((lam == mio[:, None]) & validi).sum(axis=1)
    posto = davanti / validi.sum(axis=1)
    logv = np.log(mio / np.nansum(lam, axis=1)) - np.log(1.0 / validi.sum(axis=1))
    return posto, logv


def tara(specie, F, sel, stagione, freni=True, calo_peso=0.0):
    """Cerca temperatura ottimale, tolleranza e pioggia piena partendo dai valori di letteratura."""
    p0 = PARTENZA[specie]
    t0 = np.array([p0["t_ottimo"], np.log(p0["t_larghezza"]), np.log(p0["pioggia_piena"])])
    scarti = np.array([FIDUCIA["t_ottimo"], FIDUCIA["log_t_larghezza"], FIDUCIA["log_pioggia_piena"]])
    if sel.sum() < 5:
        return t0

    def costo(theta):
        lam = intensita(parametri(specie, theta, freni, calo_peso), F, sel, stagione)
        mio = lam[np.arange(lam.shape[0]), F["quando"][sel]]
        return -np.log(mio / np.nansum(lam, axis=1)).sum() + 0.5 * (((theta - t0) / scarti) ** 2).sum()

    return minimize(costo, t0, method="Nelder-Mead", options={"xatol": 0.01, "fatol": 0.01, "maxiter": 600}).x


def riassunto(posti, logv):
    posti, logv = np.asarray(posti), np.asarray(logv)
    n = len(posti)
    if n == 0:
        return {"n": 0}
    q = float((posti <= 0.20).mean())
    return {"n": n, "nel_20": round(q, 3), "nel_20_errore": round(float(np.sqrt(q * (1 - q) / n)), 3),
            "nel_10": round(float((posti <= 0.10).mean()), 3), "nel_5": round(float((posti <= 0.05).mean()), 3),
            "posto_mediano": round(float(np.median(posti)), 3), "guadagno_log": round(float(logv.mean()), 3)}


def prepara():
    """Carica meteo e ritrovamenti una volta sola."""
    z = np.load(RADICE / "dati-elaborati" / "meteo_storico" / "ifs.npz")
    meteo = {k: z[k] for k in z.files}
    ultimo_giorno = np.datetime64(date.today()) - UN_GIORNO        # dopo c'è solo previsione
    soglia = M.soglia_suolo_secco(M.media_mobile(meteo["suolo_u"], M.GIORNI_SUOLO), meteo["giorni"])
    righe = leggi_ritrovamenti(ultimo_giorno)
    return {"meteo": meteo, "ultimo_giorno": ultimo_giorno, "soglia": soglia, "righe": righe,
            "specie": np.array([r["specie"] for r in righe]), "anni": np.array([r["anno"] for r in righe]),
            "precisi": np.array([r["preciso"] for r in righe]),
            "quote": np.array([r["quota"] for r in righe]),
            "doy": M.giorno_dell_anno(np.array([r["giorno"] for r in righe]))}


def valuta(c, opzioni=None, solo_controllo=False):
    """Controllo "un anno fuori alla volta" e taratura finale, con le opzioni date."""
    o = {**BASE, **(opzioni or {})}
    gr = M.grandezze(c["meteo"], c["soglia"], o["giorni_pioggia"], o["ritardo_pioggia"], o["giorni_temperatura"])
    if o["temperatura"] == "suolo":
        gr["T"] = M.media_mobile(c["meteo"]["suolo_t"], o["giorni_temperatura"])
    # calo del suolo: media dei giorni da 14 a 8 prima, meno media degli ultimi 4 (positivo = si è raffreddato)
    ts = c["meteo"]["suolo_t"]
    prima = np.concatenate([np.full((7,) + ts.shape[1:], np.nan, np.float32), M.media_mobile(ts, 7)[:-7]], axis=0)
    gr["CALO"] = prima - M.media_mobile(ts, 4)
    F = meteo_dei_ritrovamenti(c["righe"], c["meteo"], gr, c["ultimo_giorno"], o["k_esposizione"])
    fr, cp = o["freni"], o["calo_peso"]
    specie, anni, precisi, doy = c["specie"], c["anni"], c["precisi"], c["doy"]
    fascia = np.digitize(c["quote"], o["fasce"]) if o["fasce"] else None

    def stagione_di(sel, dentro):
        """Curva di stagione per i ritrovamenti in `sel`, costruita solo da quelli in `dentro`.

        Senza fasce: una curva per la specie. Con le fasce: una curva per fascia di quota, se nella
        fascia ci sono almeno MIN_FASCIA ritrovamenti; altrimenti quella della specie."""
        della_specie = M.curva_stagione(doy[dentro])
        if fascia is None:
            return della_specie
        curve = {}
        for b in np.unique(fascia[sel]):
            m = dentro & (fascia == b)
            curve[b] = M.curva_stagione(doy[m]) if m.sum() >= MIN_FASCIA else della_specie
        return np.stack([curve[b] for b in fascia[sel]])

    prove = {s: {m: {"posti": [], "logv": [], "valori": []} for m in MODELLI} for s in PARTENZA}
    finale, risultati = {}, {"opzioni": o, "per_specie": {}, "gruppi": {}}
    for s in PARTENZA:
        buoni = (specie == s) & precisi
        for anno in sorted(set(anni[buoni])):                     # un anno fuori alla volta
            fuori, dentro = buoni & (anni == anno), buoni & (anni != anno)
            if dentro.sum() < 3:
                continue
            stag_fuori, stag_dentro = stagione_di(fuori, dentro), stagione_di(dentro, dentro)
            casi = {"calendario": intensita(parametri(s), F, fuori, stag_fuori, "calendario"),
                    "pioggia": intensita(parametri(s), F, fuori, None, "pioggia"),
                    "meteo": intensita(parametri(s, tara(s, F, dentro, None, fr, cp), fr, cp), F, fuori, None),
                    "completo": intensita(parametri(s, tara(s, F, dentro, stag_dentro, fr, cp), fr, cp),
                                          F, fuori, stag_fuori)}
            for m, lam in casi.items():
                posto, logv = punteggi(lam, F["quando"][fuori])
                prove[s][m]["posti"] += posto.tolist()
                prove[s][m]["logv"] += logv.tolist()
                prove[s][m]["valori"] += (lam[np.arange(lam.shape[0]), F["quando"][fuori]] - PICCOLO).tolist()
        risultati["per_specie"][s] = {m: riassunto(prove[s][m]["posti"], prove[s][m]["logv"]) for m in MODELLI}
        meglio = np.array(prove[s]["completo"]["posti"]) < np.array(prove[s]["calendario"]["posti"])
        peggio = np.array(prove[s]["completo"]["posti"]) > np.array(prove[s]["calendario"]["posti"])
        risultati["per_specie"][s]["confronto"] = {"meglio_del_calendario": int(meglio.sum()), "peggio": int(peggio.sum())}
        if solo_controllo:
            continue
        # Taratura finale su tutti i ritrovamenti precisi; stagione da tutti quelli della specie
        tutti = specie == s
        stag = M.curva_stagione(doy[tutti]) if tutti.sum() else np.ones(367, np.float32)
        finale[s] = {**parametri(s, tara(s, F, buoni, stag, fr, cp), fr, cp),
                     "partenza": {k: PARTENZA[s][k] for k in ("t_ottimo", "t_larghezza", "pioggia_piena")},
                     "etichetta_partenza": PARTENZA[s]["etichetta"], "ritrovamenti": int(tutti.sum()),
                     "ritrovamenti_precisi": int(buoni.sum()), "stagione": [round(float(v), 3) for v in stag[1:]]}
        # Classi "relative alla stagione": soglie prese dai giorni di stagione (S almeno 0,25) nei luoghi di
        # tutti i ritrovamenti precisi. Per costruzione stanno sotto la 1a soglia il 60% di quei giorni,
        # poi il 20%, il 10%, il 7% e, sopra l'ultima, il 3%.
        lam = intensita(finale[s], F, precisi, stag) - PICCOLO
        di_stagione = np.isfinite(lam) & (stag[F["doy"][precisi]] >= 0.25)
        soglie = np.maximum.accumulate(np.quantile(lam[di_stagione], QUANTILI_CLASSI) + np.arange(4) * 1e-6)
        finale[s]["soglie"] = [round(float(v), 4) for v in soglie]
        valori = np.array(prove[s]["completo"]["valori"])
        if len(valori):
            cl = np.digitize(valori, soglie)
            risultati["per_specie"][s]["classi"] = [round(float((cl == k).mean()), 3) for k in range(5)]
    for g, membri in GRUPPI.items():
        risultati["gruppi"][g] = {m: riassunto(sum((prove[s][m]["posti"] for s in membri), []),
                                               sum((prove[s][m]["logv"] for s in membri), [])) for m in MODELLI}
        risultati["gruppi"][g]["confronto"] = {
            k: sum(risultati["per_specie"][s]["confronto"][k] for s in membri) for k in ("meglio_del_calendario", "peggio")}
        if not solo_controllo:
            conta = np.zeros(5)
            for s in membri:
                v = np.array(prove[s]["completo"]["valori"])
                if len(v):
                    conta += np.bincount(np.digitize(v, finale[s]["soglie"]), minlength=5)
            risultati["gruppi"][g]["classi"] = [round(float(x / max(conta.sum(), 1)), 3) for x in conta]
    risultati["classi_attese"] = [0.60, 0.20, 0.10, 0.07, 0.03]
    return finale, risultati, gr


def main():
    c = prepara()
    print(f"{len(c['righe'])} ritrovamenti dal {PRIMO_ANNO}, {int(c['precisi'].sum())} con posizione entro "
          f"{INCERTEZZA_MAX} m; meteo fino al {c['ultimo_giorno']}")
    finale, risultati, gr = valuta(c)
    print(f"\n{'':20s}   n  calendario   pioggia     meteo  completo   (quota nel 20% dei giorni migliori; a caso 20%)")
    for nome, r in list(risultati["gruppi"].items()) + list(risultati["per_specie"].items()):
        if r["completo"]["n"]:
            print(f"{nome:20s} {r['completo']['n']:3d}  " + "  ".join(f"{100 * r[m]['nel_20']:7.0f}%" for m in MODELLI)
                  + f"   meglio del calendario in {r['confronto']['meglio_del_calendario']}, peggio in {r['confronto']['peggio']}")
    print(f"\n{'':20s}  nel 10% dei giorni: calendario / completo    guadagno di verosimiglianza: calendario / completo")
    for nome, r in risultati["gruppi"].items():
        print(f"{nome:20s}  {100 * r['calendario']['nel_10']:.0f}% / {100 * r['completo']['nel_10']:.0f}%"
              f"{'':24s}{r['calendario']['guadagno_log']:.2f} / {r['completo']['guadagno_log']:.2f}")
    print("\nRitrovamenti (dell'anno lasciato fuori) per classe, da molto bassa a molto alta; attesi a caso 60 20 10 7 3:")
    for nome, r in list(risultati["gruppi"].items()) + list(risultati["per_specie"].items()):
        if "classi" in r:
            print(f"{nome:20s} " + " ".join(f"{100 * x:4.0f}%" for x in r["classi"]))
    print(f"\n{'specie':20s} {'T ottima':>11s} {'tolleranza':>10s} {'pioggia piena':>13s}   (fra parentesi il valore di partenza)")
    for s, p in finale.items():
        a = p["partenza"]
        print(f"{s:20s} {p['t_ottimo']:5.1f} ({a['t_ottimo']:4.1f}) {p['t_larghezza']:5.1f} ({a['t_larghezza']:3.1f}) "
              f"{p['pioggia_piena']:6.0f} ({a['pioggia_piena']:3.0f})   precisi {p['ritrovamenti_precisi']}")
        for k in ("t_ottimo", "t_larghezza", "pioggia_piena"):
            p[k] = round(p[k], 2)
    (RADICE / "data" / "modello.json").write_text(json.dumps({
        "versione": "0.3", "tarato_il": str(date.today()), "meteo": "ECMWF IFS 9 km (archivio aperto Open-Meteo)",
        "finestre_giorni": {"pioggia": M.GIORNI_PIOGGIA, "temperatura": M.GIORNI_TEMPERATURA, "caldo": M.GIORNI_CALDO,
                            "gelo": M.GIORNI_GELO, "suolo": M.GIORNI_SUOLO},
        "classi": {"nomi": ["molto bassa", "bassa", "media", "alta", "molto alta"], "quantili": QUANTILI_CLASSI},
        "specie": finale}, ensure_ascii=False, indent=1), encoding="utf-8")
    np.savez_compressed(RADICE / "data" / "suolo_secco.npz", soglia=c["soglia"].astype(np.float32),
                        lat=c["meteo"]["lat"], lon=c["meteo"]["lon"], quota=c["meteo"]["quota"])
    CAL.mkdir(parents=True, exist_ok=True)
    (CAL / "risultati.json").write_text(json.dumps(risultati, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\nscritti data/modello.json, data/suolo_secco.npz e dati-elaborati/calibrazione/risultati.json")


def esperimenti(filtro=None):
    """Prova le varianti; con un filtro (una parola) solo il modello base e le varianti che la contengono."""
    c = prepara()
    tabella = {}
    print(f"{'variante':48s} {'porcini: 20%':>12s} {'10%':>5s} {'guad.':>6s}   {'tutte: 20%':>10s} {'10%':>5s} {'guad.':>6s}")
    for nome, opzioni in VARIANTI.items():
        if filtro and nome != "modello base" and filtro not in nome:
            continue
        _, r, _ = valuta(c, opzioni, solo_controllo=True)
        tabella[nome] = {g: r["gruppi"][g]["completo"] for g in GRUPPI}
        p, t = tabella[nome]["porcini"], tabella[nome]["tutte"]
        print(f"{nome:48s} {100 * p['nel_20']:11.0f}% {100 * p['nel_10']:4.0f}% {p['guadagno_log']:6.2f}   "
              f"{100 * t['nel_20']:9.0f}% {100 * t['nel_10']:4.0f}% {t['guadagno_log']:6.2f}", flush=True)
    nome_file = "esperimenti.json" if not filtro else f"esperimenti_{filtro}.json"
    (CAL / nome_file).write_text(json.dumps(tabella, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore", category=RuntimeWarning)
    if "--esperimenti" in sys.argv:
        i = sys.argv.index("--esperimenti")
        esperimenti(sys.argv[i + 1] if len(sys.argv) > i + 1 else None)
    else:
        main()

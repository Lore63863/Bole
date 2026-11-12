#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 2 (Habitat): primo confronto fra mappa dell'habitat e ritrovamenti pubblici.

Che cosa fa
    Prende i ritrovamenti pubblici di GBIF con posizione precisa (incertezza dichiarata
    fino a 250 m) che cadono in Piemonte o in Liguria e guarda che idoneità dà la mappa
    in quel punto, tollerando 50 m di errore. Poi confronta con quanta parte del
    territorio ha la stessa idoneità: se la mappa vale qualcosa, i ritrovamenti devono
    concentrarsi nelle zone buone molto più del caso.

Limiti (importanti)
    Pochi record, fatti dove passa più gente e quasi tutti nei boschi: è un controllo di
    buon senso, non una calibrazione. Quella vera è in Fase 3 (docs/VALIDATION.md).

Come si usa
    python3 pipeline/habitat_verifica.py

Dove scrive
    dati-elaborati/habitat/verifica_gbif.json
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402
import habitat_calcola as C  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from rasterio.warp import transform as trasforma  # noqa: E402

GBIF = G.GREZZI / "ritrovamenti_gbif"
ARCHIVI = {
    "porcino": ["gbif_porcino_boletus_edulis.json"],
    "porcino_nero": ["gbif_porcino_nero_boletus_aereus.json"],
    "porcino_estivo": ["gbif_porcino_estivo_boletus_reticulatus.json"],
    "porcino_rosso": ["gbif_porcino_rosso_boletus_pinophilus.json"],
    "gallinaccio": ["gbif_gallinaccio_cantharellus_cibarius.json"],
    "ovolo": ["gbif_ovolo_amanita_caesarea.json"],
    "mazza_di_tamburo": ["gbif_mazza_di_tamburo_macrolepiota_procera.json"],
    "chiodino": ["gbif_chiodino_armillaria_genere.json"],
    "trombetta": ["gbif_trombetta_craterellus_cornucopioides.json"],
    "steccherino": ["gbif_steccherino_hydnum_repandum.json"],
    "sanguinello": ["gbif_sanguinello_lactarius_deliciosus.json", "gbif_sanguinello_lactarius_deterrimus.json",
                    "gbif_sanguinello_lactarius_salmonicolor.json"],
    "spugnole": ["gbif_spugnole_morchella_genere.json"],
    "prugnolo": ["gbif_prugnolo_calocybe_gambosa.json"],
    "dormiente": ["gbif_dormiente_hygrophorus_marzuolus.json"],
}
INCERTEZZA_MAX = 250.0     # metri: oltre, la posizione non dice in che bosco siamo
TOLLERANZA = 2             # celle (50 m) attorno al punto


def punti_precisi(specie):
    """Righe e colonne di griglia dei ritrovamenti con posizione precisa."""
    lon, lat = [], []
    for nome in ARCHIVI[specie]:
        for r in json.loads((GBIF / nome).read_text(encoding="utf-8"))["record"]:
            u = r.get("coordinateUncertaintyInMeters")
            if u is not None and u <= INCERTEZZA_MAX and r.get("decimalLatitude") is not None:
                lon.append(r["decimalLongitude"])
                lat.append(r["decimalLatitude"])
    if not lon:
        return np.empty(0, int), np.empty(0, int)
    x, y = trasforma("EPSG:4326", G.CRS, lon, lat)
    col = np.floor((np.array(x) - G.X0) / G.PASSO).astype(int)
    rig = np.floor((G.YTOP - np.array(y)) / G.PASSO).astype(int)
    ok = (col >= TOLLERANZA) & (col < G.NCOL - TOLLERANZA) & (rig >= TOLLERANZA) & (rig < G.NRIG - TOLLERANZA)
    return rig[ok], col[ok]


def main():
    reg = G.apri("regione.tif")
    terra = reg > 0
    n_terra = int(terra.sum())
    out = {"_criterio": f"record GBIF con incertezza fino a {INCERTEZZA_MAX:.0f} m, dentro le due regioni; "
                        f"valore più alto entro {TOLLERANZA * G.PASSO:.0f} m dal punto"}
    print(f"{'specie':20s} {'punti':>5s}  {'in zona alta*':>13s} {'territorio alta*':>16s}  {'in zona >0':>10s} {'territorio >0':>13s}")
    for sp in C.leggi_specie():
        s = sp["specie"]
        with rasterio.open(C.HAB / f"H_{s}.tif") as d:
            h = d.read(1)
        rig, col = punti_precisi(s)
        dentro = reg[rig, col] > 0
        rig, col = rig[dentro], col[dentro]
        vicino = np.array([h[r - TOLLERANZA:r + TOLLERANZA + 1, c - TOLLERANZA:c + TOLLERANZA + 1] for r, c in zip(rig, col)])
        if len(rig):
            vicino = np.where(vicino == 255, 0, vicino).reshape(len(rig), -1).max(axis=1)
            esatto = np.where(h[rig, col] == 255, 0, h[rig, col])
        else:
            vicino = esatto = np.empty(0, np.uint8)
        conta = np.bincount(h[terra], minlength=256)[:101]
        t_alta, t_pos = conta[61:101].sum() / n_terra, conta[1:101].sum() / n_terra
        # Separazione (AUC): probabilità che un ritrovamento abbia un valore più alto di una cella
        # presa a caso nel territorio (i pari valgono mezzo). 0,5 = come tirare a caso; 1 = perfetta.
        # Qui si usa la cella esatta del punto, senza tolleranza, per non favorire i ritrovamenti.
        sotto = np.concatenate([[0], np.cumsum(conta)[:-1]]) / n_terra
        pari = conta / n_terra
        auc = float((sotto[esatto] + 0.5 * pari[esatto]).mean()) if len(rig) else None
        out[s] = {"punti": int(len(rig)),
                  "punti_in_alta_o_molto_alta": int((vicino > 60).sum()), "punti_con_habitat": int((vicino > 0).sum()),
                  "punti_in_alta_o_molto_alta_cella_esatta": int((esatto > 60).sum()),
                  "punti_con_habitat_cella_esatta": int((esatto > 0).sum()),
                  "territorio_alta_o_molto_alta": round(float(t_alta), 4), "territorio_con_habitat": round(float(t_pos), 4),
                  "separazione_auc": None if auc is None else round(auc, 3)}
        if len(rig):
            print(f"{sp['nome']:20s} {len(rig):5d}  {100 * (vicino > 60).mean():12.0f}% {100 * t_alta:15.1f}%  "
                  f"{100 * (vicino > 0).mean():9.0f}% {100 * t_pos:12.1f}%  {auc:6.2f}")
        else:
            print(f"{sp['nome']:20s}     0  (nessun record preciso)")
    print("* idoneità alta o molto alta (oltre 60 su 100). Ultima colonna: separazione (0,5 = a caso, 1 = perfetta)")
    (C.HAB / "verifica_gbif.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()

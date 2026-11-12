#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 4: quanto pesano le tessere, per stimare in app un'area da scaricare.

Che cosa fa
    Legge gli indici (directory) dei file PMTiles della mappa base e degli strati dell'app e,
    per ogni zoom, somma numero e peso delle tessere raggruppandole per "tessera madre" allo
    zoom 8 (circa 110 × 155 km). Le tessere della mappa base sono compresse (gzip) nel file ma
    l'app le salva decompresse: per loro conta il peso decompresso.
    L'app usa questa tabella per dire "circa N MB" prima di scaricare un'area.

Come si usa
    python3 pipeline/app_dimensioni.py <cartella mappa base> <cartella strati>

Dove scrive
    dati-elaborati/app/dimensioni.json
"""
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path

from pmtiles.tile import Compression, deserialize_directory, deserialize_header, tileid_to_zxy

RADICE = Path(__file__).resolve().parents[1]
USCITA = RADICE / "dati-elaborati" / "app" / "dimensioni.json"
ZOOM_MINIMO = 6        # sotto lo zoom 6 l'app non va
ZOOM_MADRE = 8
BASE = ["base_z0-12.pmtiles", "base_z13.pmtiles", "base_z14_ovest.pmtiles", "base_z14_est.pmtiles"]
STRATI = ["habitat_a", "habitat_b", "habitat_c", "habitat_d", "habitat_e", "quota"]


def voci(f, h, inizio, lunghezza):
    """Tutte le voci (tessera, posizione, lunghezza, ripetizioni) di un file, foglie comprese."""
    f.seek(inizio)
    # deserialize_directory decomprime da sé (gli indici dei PMTiles sono sempre gzip, qui)
    for e in deserialize_directory(f.read(lunghezza)):
        if e.run_length == 0:
            yield from voci(f, h, h["leaf_directory_offset"] + e.offset, e.length)
        else:
            yield e


def pesi(percorso):
    """{(z, x, y): byte} per un file PMTiles (peso decompresso se le tessere sono gzip)."""
    out = {}
    with open(percorso, "rb") as f:
        h = deserialize_header(f.read(127))
        gz = h["tile_compression"] == Compression.GZIP
        visti = {}
        for e in voci(f, h, h["root_offset"], h["root_length"]):
            if e.offset not in visti:
                if gz:
                    f.seek(h["tile_data_offset"] + e.offset)
                    visti[e.offset] = len(gzip.decompress(f.read(e.length)))
                else:
                    visti[e.offset] = e.length
            for t in range(e.tile_id, e.tile_id + e.run_length):
                z, x, y = tileid_to_zxy(t)
                if z >= ZOOM_MINIMO:
                    out[(z, x, y)] = visti[e.offset]
    return out


def riassumi(tessere):
    madri = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for (z, x, y), b in tessere.items():
        k = f"{x >> (z - ZOOM_MADRE)},{y >> (z - ZOOM_MADRE)}" if z >= ZOOM_MADRE else f"{x},{y}"
        madri[str(z)][k][0] += 1
        madri[str(z)][k][1] += b
    zoom = sorted(int(z) for z in madri)
    return {"zoom": [zoom[0], zoom[-1]], "madri": {z: dict(v) for z, v in madri.items()}}


def main(cartella_base, cartella_strati):
    risultato = {}
    base = {}
    for nome in BASE:
        base.update(pesi(Path(cartella_base) / nome))   # le tessere sul confine est/ovest contano una volta
    risultato["base"] = riassumi(base)
    for nome in STRATI:
        risultato[nome] = riassumi(pesi(Path(cartella_strati) / f"{nome}.pmtiles"))
    USCITA.parent.mkdir(parents=True, exist_ok=True)
    USCITA.write_text(json.dumps(risultato, separators=(",", ":")))
    for nome, r in risultato.items():
        n = sum(v[0] for z in r["madri"].values() for v in z.values())
        b = sum(v[1] for z in r["madri"].values() for v in z.values())
        print(f"{nome:10s} zoom {r['zoom'][0]}-{r['zoom'][1]}  {n:6d} tessere  {b / 1e6:7.1f} MB")
    print(f"scritto {USCITA} ({USCITA.stat().st_size / 1000:.1f} kB)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 4: nomi dei luoghi per l'app (paesi, frazioni, borgate, località).

Che cosa fa
    Legge i nomi dei luoghi dalla mappa base (OpenStreetMap via Protomaps, strato "places",
    zoom 12 e 13) e scrive un elenco compatto con nome, tipo e posizione. L'app lo usa per
    dare un nome alle zone ("Vicino a me") e al punto toccato ("Perché qui?").
    Dati © OpenStreetMap contributors, licenza ODbL: l'attribuzione è nell'app.

Come si usa
    python3 pipeline/app_nomi.py <cartella con base_z0-12.pmtiles e base_z13.pmtiles>

Dove scrive
    dati-elaborati/app/luoghi/nomi.json   [[nome, tipo, lon, lat], ...]
"""
import gzip
import json
import math
import sys
from pathlib import Path

import mapbox_vector_tile as mvt
from pmtiles.reader import MmapSource, Reader, all_tiles

RADICE = Path(__file__).resolve().parents[1]
USCITA = RADICE / "dati-elaborati" / "app" / "luoghi" / "nomi.json"
TIPI = {"city": "città", "town": "paese", "village": "paese", "suburb": "quartiere", "quarter": "quartiere",
        "neighbourhood": "quartiere", "hamlet": "frazione", "isolated_dwelling": "case", "farm": "case",
        "locality": "località", "allotments": "località"}


def lonlat(z, x, y, px, py, estensione=4096):
    n = 2 ** z
    lon = (x + px / estensione) / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1 - py / estensione) / n))))
    return lon, lat


def main(cartella):
    nomi = {}
    for file, zoom in (("base_z0-12.pmtiles", 12), ("base_z13.pmtiles", 13)):
        with open(Path(cartella) / file, "rb") as f:
            r = Reader(MmapSource(f))
            for (z, x, y), dati in all_tiles(r.get_bytes):
                if z != zoom:
                    continue
                if dati[:2] == b"\x1f\x8b":
                    dati = gzip.decompress(dati)
                t = mvt.decode(dati, default_options={"y_coord_down": False})
                for ft in t.get("places", {}).get("features", []):
                    p = ft["properties"]
                    nome = p.get("name:it") or p.get("name")
                    tipo = TIPI.get(p.get("kind_detail") or p.get("kind"))
                    if not nome or not tipo or ft["geometry"]["type"] != "Point":
                        continue
                    px, py = ft["geometry"]["coordinates"]
                    lon, lat = lonlat(z, x, y, px, py)
                    chiave = (nome, round(lon, 3), round(lat, 3))
                    nomi[chiave] = [nome, tipo, round(lon, 5), round(lat, 5)]
    elenco = sorted(nomi.values(), key=lambda v: (v[3], v[2]))
    USCITA.parent.mkdir(parents=True, exist_ok=True)
    USCITA.write_text(json.dumps(elenco, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    from collections import Counter
    print(f"{len(elenco)} nomi, {USCITA.stat().st_size / 1e3:.0f} kB:", dict(Counter(v[1] for v in elenco)))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(RADICE / "dati-elaborati" / "app" / "mappa"))

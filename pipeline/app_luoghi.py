#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 4: confini delle regioni e aree protette per l'app (GeoJSON leggeri).

Che cosa fa
    1. regioni.geojson: Piemonte e Liguria, dal raster delle regioni della griglia a 25 m
       (contorno a 100 m, semplificato). Serve a "Regole del posto" e all'affidabilità.
       Non è il confine ufficiale ISTAT: sul confine fra le regioni può sbagliare di 100-200 m.
    2. aree_protette.geojson: parchi, riserve, aree contigue e siti Natura 2000, con nome e tipo.
         Piemonte: dati regionali (aree protette, aree contigue, ZSC/SIC, ZPS)
         Liguria:  aree protette regionali 2023 + siti Natura 2000 del Ministero (MASE)
       Semplificate a 20 m; coordinate a 5 decimali (circa 1 m).

    Licenze: CC BY 4.0 (Regione Piemonte, Regione Liguria, MASE). Attribuzioni in docs/SOURCES.md.

Come si usa (sul computer)
    python3 pipeline/app_luoghi.py

Dove scrive
    dati-elaborati/app/luoghi/regioni.geojson
    dati-elaborati/app/luoghi/aree_protette.geojson
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402
import numpy as np  # noqa: E402
import pyogrio.raw  # noqa: E402
import rasterio  # noqa: E402
import shapely  # noqa: E402
from rasterio.features import shapes  # noqa: E402
from shapely.geometry import mapping, shape  # noqa: E402
from shapely.ops import transform as sh_trasforma, unary_union  # noqa: E402

AP = G.GREZZI / "aree_protette"
USCITA = G.RADICE / "dati-elaborati" / "app" / "luoghi"
SEMPLIFICA_M = 20.0


def in_gradi(geom, crs):
    """Geometria da crs a EPSG:4326, con le coordinate arrotondate a 5 decimali."""
    from rasterio.warp import transform as trasforma

    def f(x, y, z=None):
        lon, lat = trasforma(crs, "EPSG:4326", list(np.atleast_1d(x)), list(np.atleast_1d(y)))
        return np.round(lon, 5), np.round(lat, 5)
    return sh_trasforma(f, geom)


def leggi(percorso, layer=None):
    """(geometrie shapely, dizionario dei campi, crs) senza geopandas."""
    meta, _, geom, campi = pyogrio.raw.read(percorso, layer=layer)
    g = shapely.from_wkb(geom)
    return g, {n: v for n, v in zip(meta["fields"], campi)}, meta["crs"]


def regioni():
    with rasterio.open(G.ELAB / "regione.tif") as d:
        a, t0, crs = d.read(1), d.transform, d.crs
    f = 4                                                    # 25 m -> 100 m
    h, w = a.shape[0] // f, a.shape[1] // f
    b = a[:h * f, :w * f].reshape(h, f, w, f)
    out = []
    for codice, nome in ((1, "Piemonte"), (2, "Liguria")):
        m = (b == codice).sum(axis=(1, 3)) >= 8               # metà del blocco
        t = t0 * t0.scale(f, f)
        poligoni = [shape(g) for g, v in shapes(m.astype(np.uint8), mask=m, transform=t) if v == 1]
        u = unary_union(poligoni).simplify(100)
        u = shapely.make_valid(u)
        out.append({"type": "Feature", "properties": {"regione": nome},
                    "geometry": mapping(in_gradi(u, crs))})
    return out


def testo(v):
    return "" if v is None else str(v).strip()


def aree_protette():
    out = []

    def aggiungi(geoms, nomi, tipi, regione, fonte, crs, extra=None):
        extra = extra if extra is not None else [{}] * len(geoms)
        for g, n, t, e in zip(geoms, nomi, tipi, extra):
            if g is None or g.is_empty:
                continue
            g = shapely.make_valid(g).simplify(SEMPLIFICA_M if "3003" in str(crs) or "32632" in str(crs) else 0.0002)
            if g.is_empty:
                continue
            out.append({"type": "Feature",
                        "properties": {"nome": testo(n).title() if testo(n).isupper() else testo(n),
                                       "tipo": testo(t), "regione": regione, "fonte": fonte, **e},
                        "geometry": mapping(in_gradi(g, crs))})

    # Piemonte
    pz = AP / "piemonte"
    for zipf, nome_f, tipo_f, etichetta in (
            ("Aree_protette_Piemonte.zip", "nome_area_protetta", "descr_tipo_area_protetta", None),
            ("Aree_contigue_Piemonte.zip", "nome_area_protetta", None, "Area contigua"),
            ("sic_wgs84.zip", "nome", "tipo", None),
            ("zps_wgs84.zip", "nome", "tipo", None)):
        g, c, crs = leggi(f"/vsizip/{pz / zipf}")
        tipi = c[tipo_f] if tipo_f else [etichetta] * len(g)
        aggiungi(g, c[nome_f], tipi, "Piemonte", "Regione Piemonte (CC BY 4.0)", crs)
    # Liguria: aree protette regionali (solo quelle a terra); "caccia" = se vi è ammessa la caccia
    g, c, crs = leggi(f"/vsizip/{AP / 'liguria' / 'aree_protette_2023.zip'}")
    terra = np.array([testo(t) != "Marina" for t in c["desc_terra"]])
    tipi = [testo(a) or testo(b) for a, b in zip(c["desc_tipol"], c["desc_class"])]
    extra = [{"caccia": "sì" if testo(v).upper() == "SI" else "no"} for v in c["caccia"]]
    aggiungi(g[terra], np.asarray(c["denominazi"])[terra], np.asarray(tipi)[terra], "Liguria",
             "Regione Liguria (CC BY 4.0)", crs, [e for e, t in zip(extra, terra) if t])
    # Liguria: Natura 2000 dal Ministero
    g, c, crs = leggi(str(AP / "natura2000_sic_zsc_zps.gml"))
    lig = np.array(["LIGURIA" in testo(r).upper() for r in c["regione"]])
    tipi = [("ZSC/SIC" if testo(a) else "") + (" e ZPS" if testo(b) and testo(a) else "ZPS" if testo(b) else "")
            or testo(t) for a, b, t in zip(c["sic_zsc"], c["zps"], c["tipo_sito"])]
    aggiungi(g[lig], np.asarray(c["denominazi"])[lig], np.asarray(tipi)[lig], "Liguria", "MASE, Rete Natura 2000 (CC BY 4.0)", crs)
    return out


def main():
    USCITA.mkdir(parents=True, exist_ok=True)
    r = regioni()
    (USCITA / "regioni.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": r},
                                                       separators=(",", ":")), encoding="utf-8")
    a = aree_protette()
    (USCITA / "aree_protette.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": a},
                                                             separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    from collections import Counter
    print("regioni.geojson:", len(r), "regioni,", round((USCITA / "regioni.geojson").stat().st_size / 1e3), "kB")
    print("aree_protette.geojson:", len(a), "aree,", round((USCITA / "aree_protette.geojson").stat().st_size / 1e6, 2), "MB")
    for (reg, tipo), n in sorted(Counter((f["properties"]["regione"], f["properties"]["tipo"]) for f in a).items()):
        print(f"   {reg:9s} {n:4d}  {tipo}")


if __name__ == "__main__":
    main()

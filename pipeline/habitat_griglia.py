#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 2 (Habitat), parte 1: la griglia di lavoro a 25 m.

Che cosa fa
    Porta i dati fissi (terreno, bosco, suolo) su un'unica griglia di celle da 25 m
    (EPSG:32632) che copre Piemonte e Liguria. Si lancia una volta sola, sul computer.

Come si usa
    python3 pipeline/habitat_griglia.py <passo>

Passi, in quest'ordine
    quota      quota in metri: DTM 25 m del Piemonte, DTM 5 m della Liguria mediato su 25 m
    terreno    pendenza, esposizione e carico termico, calcolati dalla quota
    bosco      categoria forestale di ogni cella e avviso "castagneto da frutto"
    suolo      pH del suolo (SoilGrids, 0-30 cm)
    margine    distanza dal margine del bosco (serve alle specie di prato e radura)
    uso        uso del suolo (ESA WorldCover): prati, coltivi, paesi, acqua
    controlla  riepilogo dei file prodotti
    (l'umidità topografica si calcola a parte, con pipeline/habitat_twi.py)

Se un passo scrive "RILANCIA" non è un errore: ha finito il tempo a disposizione
e al prossimo lancio riprende da dove era arrivato.

Dove scrive
    dati-elaborati/griglia25/   file grandi: restano sul computer, fuori dal repo
    data/categorie.json         piccolo: l'elenco dei codici delle categorie forestali

Fonti dei dati: vedi docs/SOURCES.md. Formule e scelte: vedi docs/MODEL.md.
"""
import csv
import glob
import json
import os
import shutil
import sys
import time
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import Affine, from_origin

RADICE = Path(os.environ.get("BOLE_RADICE", str(Path(__file__).resolve().parents[1])))
GREZZI = RADICE / "dati-grezzi"
ELAB = RADICE / "dati-elaborati" / "griglia25"
# Cartella di lavoro per i file provvisori (fuori dalla cartella del progetto)
LAVORO = Path(os.environ.get("BOLE_LAVORO", str(Path.home() / "bole-lavoro")))

# --- La griglia -------------------------------------------------------------------------
# Stesso sistema di coordinate e stesso angolo in alto a sinistra del DTM 25 m del
# Piemonte: così le sue celle si usano così come sono, senza ricampionarle.
CRS = "EPSG:32632"
PASSO = 25.0
X0, YTOP = 313260.0, 5145790.0
NCOL, NRIG = 10904, 11920          # 272,6 km x 298,0 km
TRASF = from_origin(X0, YTOP, PASSO, PASSO)
LIG_C0, LIG_R0 = 2624, 7936        # da qui in poi (colonna, riga) può esserci Liguria

T0 = time.time()
TEMPO_MAX = float(os.environ.get("BOLE_SECONDI", "150"))


def resta():
    """Secondi che restano prima di doversi fermare."""
    return TEMPO_MAX - (time.time() - T0)


# --- Lettura e scrittura ------------------------------------------------------------------
def apri(nome):
    """Legge per intero un raster della griglia."""
    with rasterio.open(ELAB / nome) as d:
        return d.read(1)


def apri_quota():
    """Quota in metri, con NaN dove non c'è dato."""
    q = apri("quota.tif")
    q[q == -9999] = np.nan
    return q


def scrivi(nome, dati, nodata, descrizione, cartella=None):
    """Scrive un raster della griglia: prima nella cartella di lavoro, poi lo copia.

    La copia sovrascrive il file sul posto, perché nella cartella del progetto
    i programmi non possono cancellare file.
    """
    cartella = cartella or ELAB
    cartella.mkdir(parents=True, exist_ok=True)
    LAVORO.mkdir(parents=True, exist_ok=True)
    tmp = LAVORO / ("_scrivo_" + nome)
    with rasterio.open(
        tmp, "w", driver="GTiff", width=dati.shape[1], height=dati.shape[0], count=1,
        dtype=dati.dtype.name, crs=CRS, transform=TRASF, nodata=nodata,
        compress="deflate", zlevel=5, predictor=3 if dati.dtype.kind == "f" else 2,
        tiled=True, blockxsize=512, blockysize=512, num_threads="ALL_CPUS",
    ) as d:
        d.write(dati, 1)
        d.set_band_description(1, descrizione)
    shutil.copyfile(tmp, cartella / nome)
    os.remove(tmp)
    print(f"  scritto {nome}: {(cartella / nome).stat().st_size / 1e6:.1f} MB")


def codici_categorie():
    """Numero usato nel raster per ogni categoria forestale, letto da data/ospiti.csv.

    Piemonte: da 1 in su. Liguria: da 101 in su. 0 = nessun bosco in carta.
    """
    piem, lig, nomi = {}, {}, {}
    with open(RADICE / "data" / "ospiti.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            d = piem if r["regione"] == "Piemonte" else lig
            v = (1 if r["regione"] == "Piemonte" else 101) + len(d)
            d[r["codice"]] = v
            nomi[v] = {"regione": r["regione"], "codice": r["codice"], "categoria": r["categoria"]}
    return piem, lig, nomi


# --- Passo: quota -------------------------------------------------------------------------
def crea_vrt_liguria():
    """Mosaico virtuale (file .vrt) delle mattonelle del DTM 5 m della Liguria."""
    tess = sorted(glob.glob(str(GREZZI / "liguria" / "dtm5" / "dtm5_liguria_r*_c*.tif")))
    assert tess, "mattonelle del DTM Liguria non trovate"
    info = []
    for t in tess:
        with rasterio.open(t) as d:
            assert d.crs.to_epsg() == 3003 and abs(d.res[0] - 5) < 1e-6, t
            info.append((t, d.bounds, d.width, d.height))
    x0 = min(b.left for _, b, _, _ in info)
    ymax = max(b.top for _, b, _, _ in info)
    nx = round((max(b.right for _, b, _, _ in info) - x0) / 5)
    ny = round((ymax - min(b.bottom for _, b, _, _ in info)) / 5)
    righe = [
        f'<VRTDataset rasterXSize="{nx}" rasterYSize="{ny}">',
        "<SRS>EPSG:3003</SRS>",
        f"<GeoTransform>{x0!r}, 5.0, 0.0, {ymax!r}, 0.0, -5.0</GeoTransform>",
        '<VRTRasterBand dataType="Int16" band="1">',
        "<NoDataValue>-32767</NoDataValue>",
    ]
    for t, b, w, h in info:
        xo, yo = round((b.left - x0) / 5), round((ymax - b.top) / 5)
        righe.append(
            f'<ComplexSource><SourceFilename relativeToVRT="0">{t}</SourceFilename>'
            f"<SourceBand>1</SourceBand>"
            f'<SrcRect xOff="0" yOff="0" xSize="{w}" ySize="{h}"/>'
            f'<DstRect xOff="{xo}" yOff="{yo}" xSize="{w}" ySize="{h}"/>'
            f"<NODATA>-32767</NODATA></ComplexSource>"
        )
    righe += ["</VRTRasterBand>", "</VRTDataset>"]
    LAVORO.mkdir(parents=True, exist_ok=True)
    p = LAVORO / "liguria_dtm5.vrt"
    p.write_text("\n".join(righe))
    return p, len(tess)


def passo_quota():
    from rasterio.warp import Resampling, reproject

    # 1) Liguria: dal DTM a 5 m (EPSG:3003) alla griglia, facendo la media delle celle
    #    da 5 m che cadono in ogni cella da 25 m. A pezzi, per poter riprendere.
    vrt, n = crea_vrt_liguria()
    print(f"Liguria: {n} mattonelle a 5 m")
    larghezza = 1040
    pezzi = [(c, min(c + larghezza, NCOL)) for c in range(LIG_C0, NCOL, larghezza)]
    for c1, c2 in pezzi:
        f = LAVORO / f"lig_quota_{c1}.npy"
        if f.exists():
            continue
        if resta() < 50:
            print("RILANCIA: quota della Liguria non ancora finita")
            return
        t = time.time()
        dst = np.full((NRIG - LIG_R0, c2 - c1), np.nan, np.float32)
        with rasterio.open(vrt) as s:
            reproject(
                source=rasterio.band(s, 1), destination=dst, src_nodata=-32767, dst_nodata=np.nan,
                dst_transform=TRASF * Affine.translation(c1, LIG_R0), dst_crs=CRS,
                resampling=Resampling.average, num_threads=4, warp_mem_limit=512,
            )
        np.save(f, dst)
        print(f"  colonne {c1}-{c2}: {int(np.isfinite(dst).sum())} celle valide ({time.time() - t:.0f} s)")
    if resta() < 60:
        print("RILANCIA: resta da unire Piemonte e Liguria")
        return

    # 2) Unione: Liguria, poi sopra il Piemonte (dato già a 25 m sulla stessa griglia)
    q = np.full((NRIG, NCOL), np.nan, np.float32)
    q[LIG_R0:, LIG_C0:] = np.concatenate([np.load(LAVORO / f"lig_quota_{c1}.npy") for c1, _ in pezzi], axis=1)
    reg = np.zeros((NRIG, NCOL), np.uint8)
    reg[np.isfinite(q)] = 2
    p = LAVORO / "dtm25.tif"
    if not p.exists():
        with zipfile.ZipFile(GREZZI / "piemonte" / "dtm25" / "DTM25_2009-2011_PIEMONTE_ICE.zip") as z:
            z.extract("dtm25.tif", LAVORO)
    with rasterio.open(p) as d:
        assert d.crs.to_epsg() == 32632 and d.res == (25.0, 25.0)
        c0 = round((d.bounds.left - X0) / PASSO)
        r0 = round((YTOP - d.bounds.top) / PASSO)
        assert abs(d.bounds.left - (X0 + c0 * PASSO)) < 0.01 and abs(d.bounds.top - (YTOP - r0 * PASSO)) < 0.01
        a = d.read(1)
    val = a != 0          # nel file del Piemonte 0 vuol dire "nessun dato"
    sub_q = q[r0:r0 + a.shape[0], c0:c0 + a.shape[1]]
    sub_r = reg[r0:r0 + a.shape[0], c0:c0 + a.shape[1]]
    entrambi = val & np.isfinite(sub_q)
    if entrambi.any():
        dif = sub_q[entrambi] - a[entrambi]
        print(f"Controllo sul confine: {int(entrambi.sum())} celle coperte da tutti e due i modelli; "
              f"differenza mediana {np.median(dif):+.1f} m, metà delle celle entro ±{np.median(np.abs(dif)):.1f} m")
    sub_q[val] = a[val]
    sub_r[val] = 1
    del a, val, entrambi
    n1, n2 = int((reg == 1).sum()), int((reg == 2).sum())
    print(f"Piemonte: {n1 * 625 / 1e6:.0f} km²  Liguria: {n2 * 625 / 1e6:.0f} km²  "
          f"quota da {np.nanmin(q):.0f} a {np.nanmax(q):.0f} m")
    q[~np.isfinite(q)] = -9999
    scrivi("quota.tif", q, -9999, "quota in metri (DTM 25 m Piemonte; DTM 5 m Liguria mediato su 25 m)")
    scrivi("regione.tif", reg, 0, "1 = Piemonte, 2 = Liguria (dove c'è il modello del terreno)")
    (ELAB / "griglia.json").write_text(json.dumps({
        "crs": CRS, "passo_m": PASSO, "x0": X0, "y_alto": YTOP, "colonne": NCOL, "righe": NRIG,
        "celle_piemonte": n1, "celle_liguria": n2}, indent=1))
    for c1, _ in pezzi:                 # lavoro finito: un nuovo lancio riparte da capo
        (LAVORO / f"lig_quota_{c1}.npy").unlink(missing_ok=True)


# --- Passo: terreno -----------------------------------------------------------------------
def terreno_blocco(zp, lat_rad, passo=PASSO):
    """Pendenza, esposizione e carico termico per un blocco di celle.

    zp       quota con una cella di bordo in più su ogni lato (NaN = nessun dato)
    lat_rad  latitudine in radianti, una per riga del blocco (senza bordo)
    passo    lato della cella in metri (25 nella griglia di lavoro)
    Rende: pendenza in gradi, esposizione in gradi da nord in senso orario,
    carico termico (indice di McCune e Keon 2002, equazione 1; senza unità).
    Pendenza ed esposizione: metodo di Horn (1981) sulle 8 celle vicine.
    """
    n, m = zp.shape[0] - 2, zp.shape[1] - 2
    c = zp[1:-1, 1:-1]

    def v(dr, dc):
        x = zp[1 + dr:1 + dr + n, 1 + dc:1 + dc + m]
        return np.where(np.isnan(x), c, x)   # vicino senza dato: uso la cella stessa

    nw, nn, ne = v(-1, -1), v(-1, 0), v(-1, 1)
    ww, ee = v(0, -1), v(0, 1)
    sw, ss, se = v(1, -1), v(1, 0), v(1, 1)
    est = ((ne + 2 * ee + se) - (nw + 2 * ww + sw)) / (8 * passo)     # salita verso est
    nord = ((nw + 2 * nn + ne) - (sw + 2 * ss + se)) / (8 * passo)    # salita verso nord
    pend = np.degrees(np.arctan(np.hypot(est, nord)))
    esp = np.degrees(np.arctan2(-est, -nord)) % 360.0                 # verso cui scende il versante
    s = np.radians(pend)
    a = np.radians(np.abs(180.0 - np.abs(esp - 225.0)))               # esposizione "piegata": SO = 180
    lat = lat_rad[:, None]
    carico = np.exp(-1.467 + 1.582 * np.cos(lat) * np.cos(s) - 1.5 * np.cos(a) * np.sin(s) * np.sin(lat)
                    - 0.262 * np.sin(lat) * np.sin(s) + 0.607 * np.sin(a) * np.sin(s))
    return pend.astype(np.float32), esp.astype(np.float32), carico.astype(np.float32)


def passo_terreno():
    from rasterio.warp import transform as trasforma

    q = apri_quota()
    ys = YTOP - (np.arange(NRIG) + 0.5) * PASSO
    _, lat = trasforma(CRS, "EPSG:4326", [X0 + NCOL * PASSO / 2] * NRIG, ys.tolist())
    lat = np.radians(np.array(lat, np.float32))
    pend = np.full((NRIG, NCOL), 255, np.uint8)
    esp = np.full((NRIG, NCOL), 255, np.uint8)
    car = np.full((NRIG, NCOL), 255, np.uint8)
    B = 1024
    with np.errstate(invalid="ignore"):
        for r1 in range(0, NRIG, B):
            r2 = min(r1 + B, NRIG)
            a1, a2 = max(r1 - 1, 0), min(r2 + 1, NRIG)
            zp = np.pad(q[a1:a2], ((int(a1 == r1), int(a2 == r2)), (1, 1)), mode="edge")
            p, e, c = terreno_blocco(zp, lat[r1:r2])
            ok = np.isfinite(q[r1:r2])
            pend[r1:r2] = np.where(ok, np.clip(np.rint(np.nan_to_num(p)), 0, 90), 255)
            # esposizione in passi di 2 gradi (0-179); 254 = in piano (pendenza sotto 1 grado)
            e2 = np.where(np.nan_to_num(p) >= 1.0, np.rint(np.nan_to_num(e) / 2.0) % 180, 254)
            esp[r1:r2] = np.where(ok, e2, 255)
            car[r1:r2] = np.where(ok, np.clip(np.rint(np.nan_to_num(c) * 200), 0, 250), 255)
    del q
    v = pend[pend != 255]
    print(f"Pendenza: media {v.mean():.1f}°, oltre 35° il {100 * (v > 35).mean():.1f}% delle celle")
    scrivi("pendenza.tif", pend, 255, "pendenza in gradi (Horn 1981)")
    scrivi("esposizione.tif", esp, 255, "esposizione: gradi da nord diviso 2; 254 = in piano")
    scrivi("carico_termico.tif", car, 255, "carico termico x200 (McCune e Keon 2002, eq. 1)")


# --- Passo: bosco -------------------------------------------------------------------------
def passo_bosco():
    import pyogrio
    import shapely
    from rasterio import features
    from rasterio.warp import transform as trasforma

    piem, lig, nomi = codici_categorie()
    f_cat, f_avv, f_st = LAVORO / "cat_parziale.npy", LAVORO / "avv_parziale.npy", LAVORO / "bosco_stato.json"
    LAVORO.mkdir(parents=True, exist_ok=True)
    if f_st.exists() and f_cat.exists():
        fatti = json.loads(f_st.read_text())
        cat, avv = np.load(f_cat), np.load(f_avv)
    else:
        fatti = []
        cat, avv = np.zeros((NRIG, NCOL), np.uint8), np.zeros((NRIG, NCOL), np.uint8)

    def salva():
        np.save(f_cat, cat)
        np.save(f_avv, avv)
        f_st.write_text(json.dumps(fatti))

    def brucia(geometrie, valori, tipi):
        forme = [(g, int(v)) for g, v in zip(geometrie, valori) if g is not None and not g.is_empty]
        if forme:
            features.rasterize(forme, out=cat, transform=TRASF)
        frutto = [(g, 1) for g, t in zip(geometrie, tipi) if g is not None and not g.is_empty and t == "CA10X"]
        if frutto:
            features.rasterize(frutto, out=avv, transform=TRASF)
        return len(forme), len(frutto)

    def a_griglia(xy):   # da EPSG:3003 (Liguria) al sistema della griglia
        x, y = trasforma("EPSG:3003", CRS, xy[:, 0].tolist(), xy[:, 1].tolist())
        return np.column_stack([x, y])

    # Liguria: tipi forestali 2010, cinque archivi
    for z in sorted(glob.glob(str(GREZZI / "liguria" / "tipi_forestali" / "tipi_forestali_p*.zip"))):
        chiave = "liguria:" + Path(z).name
        if chiave in fatti:
            continue
        if resta() < 45:
            salva()
            print("RILANCIA: bosco non ancora finito")
            return
        shp = [n for n in zipfile.ZipFile(z).namelist() if n.lower().endswith(".shp")][0]
        meta, _, geo, campi = pyogrio.raw.read(f"/vsizip/{z}/{shp}", columns=["cod_cat", "cod_tipo"])
        campi = dict(zip(meta["fields"], campi))
        g = shapely.transform(shapely.from_wkb(geo), a_griglia)
        ignoti = sorted({str(c) for c in campi["cod_cat"] if c not in lig})
        ok = np.array([c in lig for c in campi["cod_cat"]])
        n, nf = brucia(g[ok], [lig[c] for c in campi["cod_cat"][ok]], campi["cod_tipo"][ok])
        fatti.append(chiave)
        print(f"  {Path(z).name}: {n} poligoni, {nf} di castagneto da frutto" + (f"  CODICI IGNOTI: {ignoti}" if ignoti else ""))

    # Piemonte: carta forestale 2025, una categoria alla volta
    gpkg = GREZZI / "piemonte" / "carta_forestale_2025" / "CF_2025.gpkg"
    if "piemonte:controllo" not in fatti:
        _, _, _, campi = pyogrio.raw.read(gpkg, read_geometry=False, columns=["ca_1"])
        ignoti = sorted({str(c) for c in campi[0] if c not in piem})
        if ignoti:
            print("  CODICI IGNOTI in Piemonte:", ignoti)
        fatti.append("piemonte:controllo")
    for cod, val in piem.items():
        chiave = "piemonte:" + cod
        if chiave in fatti:
            continue
        if resta() < 45:
            salva()
            print("RILANCIA: bosco non ancora finito")
            return
        _, _, geo, campi = pyogrio.raw.read(gpkg, columns=["tf_1"], where=f"ca_1 = '{cod}'")
        g = shapely.from_wkb(geo)
        n, nf = brucia(g, [val] * len(g), campi[0])
        fatti.append(chiave)
        print(f"  Piemonte {cod}: {n} poligoni" + (f", {nf} di castagneto da frutto" if nf else ""))
    salva()
    if resta() < 40:
        print("RILANCIA: resta da scrivere i file")
        return
    reg = apri("regione.tif")
    print(f"Bosco in carta: Piemonte {int(((cat > 0) & (cat < 100)).sum()) * 625 / 1e6:.0f} km², "
          f"Liguria {int(((cat > 100) & (cat != lig['NA'])).sum()) * 625 / 1e6:.0f} km²; "
          f"celle di bosco senza quota: {int(((cat > 0) & (reg == 0)).sum())}")
    scrivi("categoria.tif", cat, None, "categoria forestale: codici in data/categorie.json; 0 = nessun bosco in carta")
    scrivi("avvisi.tif", avv, None, "1 = castagneto da frutto (tipo CA10X)")
    (RADICE / "data" / "categorie.json").write_text(
        json.dumps({str(k): v for k, v in sorted(nomi.items())}, ensure_ascii=False, indent=1), encoding="utf-8")
    # La regione: il modello del terreno del Piemonte sborda un po' oltre il confine.
    # Dove c'è una carta forestale, è lei a dire in che regione siamo.
    nuova = reg.copy()
    nuova[(reg > 0) & (cat > 100)] = 2
    nuova[(reg > 0) & (cat > 0) & (cat < 100)] = 1
    cambiate = int((nuova != reg).sum())
    if cambiate:
        print(f"Regione corretta con le carte forestali in {cambiate} celle ({cambiate * 625 / 1e6:.0f} km²)")
        scrivi("regione.tif", nuova, 0, "1 = Piemonte, 2 = Liguria (modello del terreno, corretto con le carte forestali)")
    for f in (f_cat, f_avv, f_st):      # lavoro finito: un nuovo lancio riparte da capo
        f.unlink(missing_ok=True)


# --- Passo: suolo -------------------------------------------------------------------------
def passo_suolo():
    from rasterio.warp import Resampling, reproject

    somma = peso = None
    for strato, spessore in (("0-5cm", 5), ("5-15cm", 10), ("15-30cm", 15)):
        with rasterio.open(GREZZI / "suolo_soilgrids" / f"phh2o_{strato}_mean.tif") as s:
            a = s.read(1).astype(np.float32)
            tr, crs = s.transform, s.crs
        if somma is None:
            somma, peso = np.zeros_like(a), np.zeros_like(a)
        ok = a > 0
        somma[ok] += a[ok] * spessore
        peso[ok] += spessore
    ph = np.where(peso > 0, somma / np.maximum(peso, 1), np.nan).astype(np.float32)   # pH x 10
    dst = np.full((NRIG, NCOL), np.nan, np.float32)
    reproject(ph, dst, src_transform=tr, src_crs=crs, src_nodata=np.nan, dst_transform=TRASF, dst_crs=CRS,
              dst_nodata=np.nan, resampling=Resampling.bilinear, num_threads=4)
    out = np.where(np.isfinite(dst), np.clip(np.rint(np.nan_to_num(dst)), 1, 254), 0).astype(np.uint8)
    del dst
    reg = apri("regione.tif")
    out[reg == 0] = 0
    v = out[out > 0]
    print(f"pH: da {v.min() / 10:.1f} a {v.max() / 10:.1f}, mediana {np.median(v) / 10:.1f}; "
          f"senza dato il {100 * ((out == 0) & (reg > 0)).sum() / (reg > 0).sum():.1f}% del territorio")
    scrivi("ph.tif", out, 0, "pH del suolo in acqua x10, media 0-30 cm (SoilGrids 250 m); 0 = senza dato")


# --- Passo: uso del suolo -------------------------------------------------------------------
def passo_uso():
    """Uso del suolo (ESA WorldCover 2021, celle da 10 m) sulla griglia.

    Ogni cella da 25 m prende la classe più frequente fra quelle da 10 m che contiene.
    Classi: 10 alberi, 20 arbusti, 30 prato, 40 coltivi, 50 costruito, 60 terreno nudo,
    70 neve e ghiaccio, 80 acqua, 90 zona umida, 100 muschi e licheni; 0 = senza dato.
    """
    from rasterio.warp import Resampling, reproject, transform_bounds

    tess = sorted(glob.glob(str(GREZZI / "uso_suolo_worldcover" / "*_Map.tif")))
    assert tess, "mattonelle di ESA WorldCover non trovate: python3 pipeline/scarica_dati.py uso-suolo"
    LAVORO.mkdir(parents=True, exist_ok=True)
    out = np.zeros((NRIG, NCOL), np.uint8)
    for t in tess:
        f = LAVORO / ("uso_" + Path(t).stem + ".npz")
        if not f.exists():
            if resta() < 70:
                print("RILANCIA: uso del suolo non ancora finito")
                return
            t0 = time.time()
            with rasterio.open(t) as s:
                x1, y1, x2, y2 = transform_bounds(s.crs, CRS, *s.bounds, densify_pts=21)
                c1, c2 = max(int((x1 - X0) // PASSO), 0), min(int((x2 - X0) // PASSO) + 1, NCOL)
                r1, r2 = max(int((YTOP - y2) // PASSO), 0), min(int((YTOP - y1) // PASSO) + 1, NRIG)
                if c2 <= c1 or r2 <= r1:
                    np.savez_compressed(f, a=np.zeros((0, 0), np.uint8), w=np.array([0, 0, 0, 0]))
                    continue
                dst = np.zeros((r2 - r1, c2 - c1), np.uint8)
                reproject(source=rasterio.band(s, 1), destination=dst, src_nodata=0, dst_nodata=0,
                          dst_transform=TRASF * Affine.translation(c1, r1), dst_crs=CRS,
                          resampling=Resampling.mode, num_threads=4, warp_mem_limit=512)
            np.savez_compressed(f, a=dst, w=np.array([r1, r2, c1, c2]))
            print(f"  {Path(t).name}: {time.time() - t0:.0f} s")
        z = np.load(f)
        if z["a"].size:
            r1, r2, c1, c2 = (int(v) for v in z["w"])
            sub = out[r1:r2, c1:c2]
            sub[z["a"] > 0] = z["a"][z["a"] > 0]
    if resta() < 30:
        print("RILANCIA: resta da scrivere il file")
        return
    reg = apri("regione.tif")
    out[reg == 0] = 0
    nomi = {10: "alberi", 20: "arbusti", 30: "prato", 40: "coltivi", 50: "costruito", 60: "terreno nudo",
            70: "neve e ghiaccio", 80: "acqua", 90: "zona umida", 100: "muschi e licheni", 0: "senza dato"}
    conta = np.bincount(out[reg > 0], minlength=256)
    print("Uso del suolo nelle due regioni: " + ", ".join(
        f"{nomi.get(k, k)} {100 * conta[k] / conta.sum():.1f}%" for k in np.argsort(-conta) if conta[k] > 0))
    scrivi("uso_suolo.tif", out, 0, "uso del suolo ESA WorldCover 2021 (classe prevalente): 10 alberi, 20 arbusti, 30 prato, "
           "40 coltivi, 50 costruito, 60 nudo, 70 neve, 80 acqua, 90 zona umida, 100 muschi; 0 = senza dato")
    for t in tess:                       # lavoro finito: un nuovo lancio riparte da capo
        (LAVORO / ("uso_" + Path(t).stem + ".npz")).unlink(missing_ok=True)


# --- Passo: margine -----------------------------------------------------------------------
def dilata(m):
    """Allarga di una cella (anche in diagonale) le zone vere di una maschera."""
    o = m.copy()
    o[1:, :] |= m[:-1, :]
    o[:-1, :] |= m[1:, :]
    o[:, 1:] |= m[:, :-1]
    o[:, :-1] |= m[:, 1:]
    o[1:, 1:] |= m[:-1, :-1]
    o[1:, :-1] |= m[:-1, 1:]
    o[:-1, 1:] |= m[1:, :-1]
    o[:-1, :-1] |= m[1:, 1:]
    return o


def margine(bosco, aperto):
    """Codice di margine per ogni cella.

    bosco   celle di bosco;  aperto  celle non di bosco dentro le due regioni
    0 = lontano dal bosco; 1, 2, 3 = fuori dal bosco, a 1, 2, 3 celle (25, 50, 75 m);
    11, 12, 13 = dentro il bosco, a 1, 2, 3 celle dal margine; 20 = interno del bosco.
    """
    m = np.zeros(bosco.shape, np.uint8)
    m[bosco] = 20
    cur = bosco
    for k in (1, 2, 3):
        nxt = dilata(cur)
        m[nxt & ~cur & aperto] = k
        cur = nxt
    cur = aperto
    for k in (1, 2, 3):
        nxt = dilata(cur)
        m[nxt & ~cur & bosco] = 10 + k
        cur = nxt
    return m


def passo_margine():
    cat, reg = apri("categoria.tif"), apri("regione.tif")
    _, lig, _ = codici_categorie()
    bosco = (cat > 0) & (cat != lig["NA"])
    aperto = (reg > 0) & ~bosco
    del cat, reg
    m = margine(bosco, aperto)
    print(f"Fascia fuori dal bosco entro 50 m: {int(((m == 1) | (m == 2)).sum()) * 625 / 1e6:.0f} km²; "
          f"fascia dentro entro 50 m: {int(((m == 11) | (m == 12)).sum()) * 625 / 1e6:.0f} km²")
    scrivi("margine.tif", m, None, "0 lontano; 1-3 fuori dal bosco a 25-75 m; 11-13 dentro a 25-75 m dal margine; 20 interno")


# --- Passo: controlla ---------------------------------------------------------------------
def passo_controlla():
    attesi = ["quota.tif", "regione.tif", "pendenza.tif", "esposizione.tif", "carico_termico.tif",
              "categoria.tif", "avvisi.tif", "ph.tif", "margine.tif", "uso_suolo.tif", "twi.tif"]
    for n in attesi:
        p = ELAB / n
        if not p.exists():
            print(f"MANCA {n}")
            continue
        with rasterio.open(p) as d:
            giusto = (d.width, d.height) == (NCOL, NRIG) and d.transform == TRASF and d.crs.to_epsg() == 32632
            print(f"{'ok  ' if giusto else 'ERR '}{n:22s} {d.dtypes[0]:8s} {p.stat().st_size / 1e6:7.1f} MB  {d.descriptions[0]}")


PASSI = {"quota": passo_quota, "terreno": passo_terreno, "bosco": passo_bosco, "suolo": passo_suolo,
         "margine": passo_margine, "uso": passo_uso, "controlla": passo_controlla}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in PASSI:
        print(__doc__)
        sys.exit(1)
    PASSI[sys.argv[1]]()
    print(f"({time.time() - T0:.0f} s)")

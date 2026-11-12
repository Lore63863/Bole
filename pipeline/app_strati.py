#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé - Fase 4: strati fissi per l'app (tessere 256 px, Web Mercator, zoom 6-12).

Che cosa fa
    Dalla griglia a 25 m (dati-elaborati/griglia25 e dati-elaborati/habitat) prepara le
    tessere che l'app legge sul telefono per calcolare l'indice. Allo zoom 12 un pixel è
    circa 27 m: quasi la cella della griglia. Gli zoom più bassi si ottengono riducendo 2x2.

    Sei file PMTiles, tessere PNG a colori (RGB, senza trasparenza: i valori restano esatti):

      habitat_a   R porcino            G porcino nero        B porcino estivo
      habitat_b   R porcino rosso      G gallinaccio         B ovolo buono
      habitat_c   R mazza di tamburo   G chiodino            B trombetta dei morti
      habitat_d   R steccherino        G sanguinello         B spugnole
      habitat_e   R prugnolo           G dormiente           B tipo di bosco (+128 se castagneto da frutto)
      quota       quota in metri, codifica "Terrarium": (R*256 + G + B/256) - 32768
                  (precisione 10 cm: nel lavoro intermedio la quota sta in decimetri)

    Habitat: 0-100 (100 = idoneità piena), 0 anche fuori dalle due regioni.
    Riduzione 2x2 per gli zoom bassi: habitat = massimo (mostra dove c'è almeno un posto
    buono), quota = media, tipo di bosco = cella in alto a sinistra, castagneto = "o".
    La quota in codifica Terrarium serve due volte: per il calcolo dell'indice (correzione
    della temperatura) e per il rilievo ombreggiato della mappa.

Come si usa (sul computer, un passo alla volta: ognuno sta sotto i 3 minuti e si può rilanciare)
    python3 pipeline/app_strati.py mosaico     # zoom 12, a strisce (scrive "RILANCIA" se non ha finito)
    python3 pipeline/app_strati.py piramide    # zoom 11-6
    python3 pipeline/app_strati.py tessere     # file PMTiles (scrive "RILANCIA" se non ha finito)
    python3 pipeline/app_strati.py controlla   # confronta tessere e griglia in punti a caso

Dove scrive
    dati-elaborati/app/strati/*.pmtiles      (i file per l'app; nessuno sopra i 100 MB)
    ~/bole-lavoro/app_strati/                (lavoro intermedio, si può cancellare alla fine)
"""
import io
import json
import math
import os
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import habitat_griglia as G  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from rasterio.warp import transform as trasforma  # noqa: E402
from rasterio.windows import Window  # noqa: E402

TESSERA = 256
ZOOM_MIN, ZOOM_MAX = 6, 12
# Piemonte e Liguria con 5 km di margine (gradi). BOLE_BBOX serve solo per le prove.
BBOX = tuple(float(v) for v in os.environ.get("BOLE_BBOX", "6.56,43.73,10.14,46.51").split(","))
SENZA_QUOTA = 65535                         # quota mancante (mare, fuori griglia) nel lavoro intermedio
TEMPO_MAX = 150                             # secondi per chiamata, poi "RILANCIA"
INSIEMI = {
    "habitat_a": ["porcino", "porcino_nero", "porcino_estivo"],
    "habitat_b": ["porcino_rosso", "gallinaccio", "ovolo"],
    "habitat_c": ["mazza_di_tamburo", "chiodino", "trombetta"],
    "habitat_d": ["steccherino", "sanguinello", "spugnole"],
    "habitat_e": ["prugnolo", "dormiente", "@bosco"],
}
LAVORO = G.LAVORO / "app_strati"
USCITA = G.RADICE / "dati-elaborati" / "app" / "strati"
HAB = G.RADICE / "dati-elaborati" / "habitat"
ATTRIBUZIONE = ("Bolé, da carte forestali e DTM di Regione Piemonte e Regione Liguria, SoilGrids (ISRIC), "
                "ESA WorldCover 2021 (CC BY 4.0)")


# --- Web Mercator ---------------------------------------------------------------------------
def tessera_di(lon, lat, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return int(math.floor(x)), int(math.floor(y))


def lonlat_pixel(px, py, z):
    """Centro dei pixel (coordinate globali in pixel allo zoom z) -> gradi."""
    n = TESSERA * 2 ** z
    lon = (px + 0.5) / n * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * (py + 0.5) / n))))
    return lon, lat


def riquadro_tessere(z):
    x0, y0 = tessera_di(BBOX[0], BBOX[3], z)
    x1, y1 = tessera_di(BBOX[2], BBOX[1], z)
    return x0, y0, x1, y1


def forma_mosaico(z):
    x0, y0, x1, y1 = riquadro_tessere(z)
    return (y1 - y0 + 1) * TESSERA, (x1 - x0 + 1) * TESSERA


def mappa_disco(nome, z, forma, dtype, modo="r+"):
    percorso = LAVORO / f"{nome}_z{z}.npy"
    if modo == "w+" or not percorso.exists():
        return np.lib.format.open_memmap(percorso, mode="w+", dtype=dtype, shape=forma)
    return np.load(percorso, mmap_mode=modo)


def stato():
    f = LAVORO / "stato.json"
    return json.loads(f.read_text()) if f.exists() else {"strisce": []}


def salva_stato(s):
    (LAVORO / "stato.json").write_text(json.dumps(s))


# --- 1. mosaico allo zoom 12 ------------------------------------------------------------------
def strati_sorgente():
    """Nome -> percorso dei raster sulla griglia a 25 m."""
    s = {sp: HAB / f"H_{sp}.tif" for nomi in INSIEMI.values() for sp in nomi if not sp.startswith("@")}
    s.update({n: G.ELAB / f"{n}.tif" for n in ("quota", "categoria", "avvisi")})
    return s


def passo_mosaico():
    LAVORO.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    z = ZOOM_MAX
    x0, y0, x1, y1 = riquadro_tessere(z)
    alto, largo = forma_mosaico(z)
    st = stato()
    nuovo = not st["strisce"]
    mos = {k: mappa_disco(k, z, (alto, largo, 3), np.uint8, "w+" if nuovo else "r+") for k in INSIEMI}
    mos["quota"] = mappa_disco("quota", z, (alto, largo), np.uint16, "w+" if nuovo else "r+")
    sorg = {n: rasterio.open(p) for n, p in strati_sorgente().items()}
    rif = sorg["quota"]
    fatte = set(st["strisce"])
    n_strisce = alto // TESSERA
    for i in range(n_strisce):
        if i in fatte:
            continue
        if time.time() - t0 > TEMPO_MAX:
            print(f"fatte {len(fatte)} strisce su {n_strisce}: RILANCIA")
            break
        py = np.arange(i * TESSERA, (i + 1) * TESSERA) + y0 * TESSERA
        px = np.arange(largo) + x0 * TESSERA
        lon, _ = lonlat_pixel(px, 0, z)
        _, lat = lonlat_pixel(0, py, z)
        LON, LAT = np.meshgrid(lon, lat)
        xs, ys = trasforma("EPSG:4326", G.CRS, LON.ravel().tolist(), LAT.ravel().tolist())
        col = np.floor((np.asarray(xs) - G.X0) / G.PASSO).astype(np.int64)
        rig = np.floor((G.YTOP - np.asarray(ys)) / G.PASSO).astype(np.int64)
        dentro = (col >= 0) & (col < rif.width) & (rig >= 0) & (rig < rif.height)
        if not dentro.any():
            fatte.add(i)
            continue
        r1, r2 = int(rig[dentro].min()), int(rig[dentro].max()) + 1
        c1, c2 = int(col[dentro].min()), int(col[dentro].max()) + 1
        fin = Window(c1, r1, c2 - c1, r2 - r1)
        rr, cc = (rig - r1)[dentro], (col - c1)[dentro]

        def leggi(nome, vuoto):
            a = sorg[nome].read(1, window=fin)
            v = np.full(LON.size, vuoto, a.dtype)
            v[dentro] = a[rr, cc]
            return v.reshape(LON.shape)

        righe = slice(i * TESSERA, (i + 1) * TESSERA)
        for k, nomi in INSIEMI.items():
            blocco = np.zeros((TESSERA, largo, 3), np.uint8)
            for c, nome in enumerate(nomi):
                if nome == "@bosco":
                    cat = leggi("categoria", 0).astype(np.uint8)
                    cat = np.where(cat >= 128, 0, cat).astype(np.uint8)          # codici validi: 1-21, 101-119
                    cast = (leggi("avvisi", 0).astype(np.uint8) & 1) * 128
                    blocco[..., c] = cat | cast
                else:
                    h = leggi(nome, 255)
                    blocco[..., c] = np.where(h == 255, 0, np.minimum(h, 100)).astype(np.uint8)
            mos[k][righe] = blocco
        q = leggi("quota", np.nan).astype(np.float32)
        nd = sorg["quota"].nodata
        if nd is not None and np.isfinite(nd):
            q[q == nd] = np.nan
        mos["quota"][righe] = np.where(np.isfinite(q), np.clip(np.round(q * 10), 0, SENZA_QUOTA - 1),
                                       SENZA_QUOTA).astype(np.uint16)
        fatte.add(i)
        st["strisce"] = sorted(fatte)
        salva_stato(st)
    for m in mos.values():
        m.flush()
    if len(fatte) == n_strisce:
        print(f"mosaico zoom {z} finito: {alto} x {largo} pixel, {n_strisce} strisce, {time.time() - t0:.0f} s")


# --- 2. zoom più bassi ----------------------------------------------------------------------
def riduci(a, z_figlio, tipo):
    """Da zoom z a z-1: 2x2 -> 1. Il mosaico del padre ha la sua forma (riquadro di tessere)."""
    xf0, yf0, _, _ = riquadro_tessere(z_figlio)
    xp0, yp0, _, _ = riquadro_tessere(z_figlio - 1)
    alto, largo = forma_mosaico(z_figlio - 1)
    # il figlio comincia all'interno del padre: posizione in pixel del padre
    dx, dy = (xf0 * TESSERA) // 2 - xp0 * TESSERA, (yf0 * TESSERA) // 2 - yp0 * TESSERA
    h2, w2 = a.shape[0] // 2, a.shape[1] // 2
    if tipo == "quota":
        out = np.full((alto, largo), SENZA_QUOTA, np.uint16)
        b = a[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).astype(np.float32)
        b[b == SENZA_QUOTA] = np.nan
        with np.errstate(all="ignore"):
            m = np.nanmean(b, axis=(1, 3))
        r = np.where(np.isfinite(m), np.round(m), SENZA_QUOTA).astype(np.uint16)
    else:
        out = np.zeros((alto, largo, 3), np.uint8)
        b = a[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, 3)
        r = b.max(axis=(1, 3))
        if tipo == "habitat_e":                               # tipo di bosco: cella in alto a sinistra;
            sx = b[:, 0, :, 0, 2] & 127                        # castagneto: "o" dei quattro
            r[..., 2] = sx | (b[..., 2] & 128).max(axis=(1, 3))
    hh, ww = min(alto - dy, r.shape[0]), min(largo - dx, r.shape[1])
    out[dy:dy + hh, dx:dx + ww] = r[:hh, :ww]
    return out


def passo_piramide():
    t0 = time.time()
    for k in list(INSIEMI) + ["quota"]:
        a = np.load(LAVORO / f"{k}_z{ZOOM_MAX}.npy", mmap_mode="r")
        for z in range(ZOOM_MAX, ZOOM_MIN, -1):
            r = riduci(np.asarray(a), z, k)
            np.save(LAVORO / f"{k}_z{z - 1}.npy", r)
            a = r
        print(f"{k}: zoom {ZOOM_MIN}-{ZOOM_MAX - 1} pronti ({time.time() - t0:.0f} s)")


# --- 3. tessere e PMTiles -------------------------------------------------------------------
def terrarium(dm):
    """Quota in decimetri (SENZA_QUOTA = mare/fuori) -> RGB Terrarium (mare = 0 m)."""
    v = np.where(dm == SENZA_QUOTA, 0.0, dm / 10.0).astype(np.float64) + 32768.0
    r = np.floor(v / 256.0)
    g = np.floor(v - r * 256.0)
    b = np.floor((v - np.floor(v)) * 256.0)
    return np.stack([r, g, b], axis=-1).astype(np.uint8)


def passo_tessere():
    from PIL import Image
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import Writer
    t0 = time.time()
    USCITA.mkdir(parents=True, exist_ok=True)
    st = stato()
    fatti = set(st.get("archivi", []))
    for k in list(INSIEMI) + ["quota"]:
        if k in fatti:
            continue
        if time.time() - t0 > TEMPO_MAX:
            print(f"archivi fatti: {sorted(fatti)}: RILANCIA")
            return
        tessere, vuote = [], 0
        for z in range(ZOOM_MIN, ZOOM_MAX + 1):
            a = np.load(LAVORO / f"{k}_z{z}.npy", mmap_mode="r")
            x0, y0, x1, y1 = riquadro_tessere(z)
            for ty in range(y0, y1 + 1):
                for tx in range(x0, x1 + 1):
                    blocco = np.asarray(a[(ty - y0) * TESSERA:(ty - y0 + 1) * TESSERA,
                                          (tx - x0) * TESSERA:(tx - x0 + 1) * TESSERA])
                    if k == "quota":
                        if not (blocco != SENZA_QUOTA).any():
                            vuote += 1
                            continue
                        rgb = terrarium(blocco)
                    else:
                        if not blocco.any():
                            vuote += 1
                            continue
                        rgb = blocco
                    buf = io.BytesIO()
                    Image.fromarray(np.ascontiguousarray(rgb), "RGB").save(buf, "PNG", compress_level=9)
                    tessere.append((zxy_to_tileid(z, tx, ty), buf.getvalue()))
        tessere.sort()
        percorso = USCITA / f"{k}.pmtiles"
        with open(percorso, "wb") as f:
            w = Writer(f)
            for tid, dati in tessere:
                w.write_tile(tid, dati)
            w.finalize(
                {"tile_type": TileType.PNG, "tile_compression": Compression.NONE,
                 "min_zoom": ZOOM_MIN, "max_zoom": ZOOM_MAX,
                 "min_lon_e7": int(BBOX[0] * 1e7), "min_lat_e7": int(BBOX[1] * 1e7),
                 "max_lon_e7": int(BBOX[2] * 1e7), "max_lat_e7": int(BBOX[3] * 1e7),
                 "center_zoom": 9, "center_lon_e7": int(7.55e7), "center_lat_e7": int(44.39e7)},
                {"name": f"Bolé - {k}", "attribution": ATTRIBUZIONE,
                 "canali": INSIEMI.get(k, ["quota Terrarium"]),
                 "codifica": "habitat 0-100" if k != "quota" else "Terrarium: (R*256+G+B/256)-32768 m"})
        mb = percorso.stat().st_size / 1e6
        print(f"{k}: {len(tessere)} tessere ({vuote} vuote saltate), {mb:.1f} MB")
        if mb >= 95:
            print(f"ATTENZIONE: {k} supera i 95 MB, va diviso prima di pubblicarlo")
        fatti.add(k)
        st["archivi"] = sorted(fatti)
        salva_stato(st)
    print(f"tutti gli archivi pronti in {USCITA}")


# --- 4. controllo --------------------------------------------------------------------------
def passo_controlla(n=400, seme=1):
    """Punti a caso: il valore nella tessera dello zoom 12 deve essere quello della cella a 25 m."""
    from PIL import Image
    from pmtiles.reader import MmapSource, Reader
    rng = np.random.default_rng(seme)
    sorg = {n_: rasterio.open(p) for n_, p in strati_sorgente().items()}
    errori, provati = 0, 0
    lettori = {k: Reader(MmapSource(open(USCITA / f"{k}.pmtiles", "rb"))) for k in list(INSIEMI) + ["quota"]}
    while provati < n:
        lon, lat = rng.uniform(BBOX[0], BBOX[2]), rng.uniform(BBOX[1], BBOX[3])
        (x,), (y,) = trasforma("EPSG:4326", G.CRS, [lon], [lat])
        col, rig = int((x - G.X0) // G.PASSO), int((G.YTOP - y) // G.PASSO)
        if not (0 <= col < sorg["quota"].width and 0 <= rig < sorg["quota"].height):
            continue
        n_ = TESSERA * 2 ** ZOOM_MAX
        gx = (lon + 180) / 360 * n_
        gy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n_
        tx, ty, ix, iy = int(gx // TESSERA), int(gy // TESSERA), int(gx % TESSERA), int(gy % TESSERA)
        # il pixel campiona la cella che contiene il suo centro: ricalcola quella cella
        clon, clat = lonlat_pixel(tx * TESSERA + ix, ty * TESSERA + iy, ZOOM_MAX)
        (cx,), (cy,) = trasforma("EPSG:4326", G.CRS, [float(clon)], [float(clat)])
        col, rig = int((cx - G.X0) // G.PASSO), int((G.YTOP - cy) // G.PASSO)
        provati += 1
        for k, nomi in INSIEMI.items():
            dati = lettori[k].get(ZOOM_MAX, tx, ty)
            px = (0, 0, 0) if dati is None else Image.open(io.BytesIO(dati)).convert("RGB").getpixel((ix, iy))
            for c, nome in enumerate(nomi):
                if nome == "@bosco":
                    atteso = int(sorg["categoria"].read(1, window=Window(col, rig, 1, 1))[0, 0]) & 127
                    atteso |= (int(sorg["avvisi"].read(1, window=Window(col, rig, 1, 1))[0, 0]) & 1) * 128
                else:
                    h = int(sorg[nome].read(1, window=Window(col, rig, 1, 1))[0, 0])
                    atteso = 0 if h == 255 else min(h, 100)
                if px[c] != atteso:
                    errori += 1
        dati = lettori["quota"].get(ZOOM_MAX, tx, ty)
        q = float(sorg["quota"].read(1, window=Window(col, rig, 1, 1))[0, 0])
        if sorg["quota"].nodata is not None and q == sorg["quota"].nodata:
            q = float("nan")                                   # mare o fuori: nelle tessere è quota 0
        if dati is not None and np.isfinite(q):
            r, g, b = Image.open(io.BytesIO(dati)).convert("RGB").getpixel((ix, iy))
            if abs((r * 256 + g + b / 256) - 32768 - q) > 0.06:      # decimetri + 1/256 m
                errori += 1
    print(f"controllati {provati} punti a caso: {errori} valori diversi dalla griglia")
    return errori


if __name__ == "__main__":
    passi = {"mosaico": passo_mosaico, "piramide": passo_piramide, "tessere": passo_tessere,
             "controlla": passo_controlla}
    if len(sys.argv) < 2 or sys.argv[1] not in passi:
        print(__doc__)
        sys.exit(1)
    passi[sys.argv[1]]()

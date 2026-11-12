#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bolé — scarico e controllo dei dati grezzi (Fase 1).

Si può lanciare più volte: salta ciò che è già completo e riprende i file a metà.
I dati finiscono in ../dati-grezzi/ (fuori dal repo pubblico: sono grandi).

    python3 pipeline/scarica_dati.py tutto      # scarica tutto ciò che manca
    python3 pipeline/scarica_dati.py verifica   # controlla i file e scrive dati-grezzi/_registro.json
    python3 pipeline/scarica_dati.py <voce>     # una sola voce (elenco in fondo al file)

Opzione: --secondi N   si ferma dopo N secondi (utile dove i comandi hanno un tempo massimo).

Serve: curl, Python 3.10 o più recente e, per i controlli, pip install numpy rasterio pyogrio.
Non scarica la mappa base Protomaps: va tagliata su misura in Fase 4.
Fonti, licenze e attribuzioni: docs/SOURCES.md
"""
import argparse
import collections
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import zipfile

RADICE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dati-grezzi"))
TMP = tempfile.mkdtemp(prefix="bole_")
T0 = time.time()
LIMITE = 0  # secondi; 0 = senza limite


def resta():
    return 1e9 if not LIMITE else LIMITE - (time.time() - T0)


def percorso(rel):
    p = os.path.join(RADICE, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def curl(url, dest, secondi=120, riprendi=False):
    cmd = ["curl", "-sS", "-L", "--max-time", str(int(max(5, min(secondi, resta() - 5)))), "-o", dest, "-w", "%{http_code}"]
    cmd += ["-C", "-"] if riprendi else ["--fail"]
    r = subprocess.run(cmd + [url], capture_output=True, text=True)
    return r.returncode == 0 and r.stdout.strip() in ("200", "206")


def atteso(url):
    out = subprocess.run(["curl", "-sIL", "--max-time", "30", url], capture_output=True, text=True).stdout
    m = re.findall(r"(?im)^content-length:\s*(\d+)", out)
    return int(m[-1]) if m else None


def diretto(url, rel):
    """File statico: riprende da dove era arrivato e confronta la dimensione con quella dichiarata dal server."""
    dest = percorso(rel)
    n = atteso(url)
    ho = os.path.getsize(dest) if os.path.exists(dest) else 0
    if n is None:
        print("  il server non risponde per:", rel)
        return False
    if ho == n:
        print("  già completo:", rel)
        return True
    if resta() < 20:
        return False
    curl(url, dest, 86400, riprendi=True)
    ho = os.path.getsize(dest) if os.path.exists(dest) else 0
    print("  %s: %s (%d di %d B)" % (rel, "completo" if ho == n else "a metà, rilancia", ho, n))
    return ho == n


def via_tmp(url, rel, controllo, secondi=60):
    """Risposta generata al momento (WFS, WCS, API): scarica in una cartella temporanea, controlla, poi sposta."""
    dest = percorso(rel)
    if os.path.exists(dest):
        return True
    if resta() < 25:
        return False
    tmp = os.path.join(TMP, os.path.basename(rel))
    if not curl(url, tmp, secondi):
        print("  errore di rete:", rel)
        return False
    try:
        nota = controllo(tmp)
    except Exception as e:  # il file non supera il controllo: non viene salvato
        print("  NON valido: %s (%s)" % (rel, str(e)[:80]))
        return False
    shutil.move(tmp, dest)
    print("  %s: %s" % (rel, nota))
    return True


def n_shp(path):
    """Numero di elementi di uno shapefile dentro uno zip (dalla dimensione del file .shx)."""
    with zipfile.ZipFile(path) as z:
        if z.testzip() is not None:
            raise ValueError("zip rotto")
        shx = [i.file_size for i in z.infolist() if i.filename.lower().endswith(".shx")]
    return (shx[0] - 100) // 8 if shx else 0


def n_pos(path):
    n = n_shp(path)
    if n <= 0:
        raise ValueError("nessun elemento")
    return n


# ---------------------------------------------------------------- Piemonte

PIE = "https://www.datigeo-piem-download.it/"
# Fogli 1:50.000 che coprono il riquadro della provincia di Cuneo, letti dallo strato «scDTM5ICE»
# del servizio di scarico del Geoportale (campo url_dtm5), 10 novembre 2026.
FOGLI_CUNEO = [171, 172, 173, 174, 175, 189, 190, 191, 192, 193, 207, 208, 209, 210, 211,
               224, 225, 226, 227, 228, 242, 243, 244, 245]


def piemonte_foresta():
    return diretto(PIE + "direct/Geoportale/RegionePiemonte/SIFOR/CF_2025.gpkg", "piemonte/carta_forestale_2025/CF_2025.gpkg")


def piemonte_dtm25():
    f = "DTM25_2009-2011_PIEMONTE_ICE"
    return diretto(PIE + "direct/Geoportale/RegionePiemonte/DTM25/%s/%s.zip" % (f, f), "piemonte/dtm25/%s.zip" % f)


def piemonte_dtm5_cuneo():
    ok = True
    for foglio in FOGLI_CUNEO:
        nome = "RIPRESA_AEREA_ICE_2009_2011_DTM-SDO_CTR_FOGLI50-%d-EPSG32632-TIF.zip" % foglio
        ok &= diretto(PIE + "static/regp01/DTM5_ICE/" + nome, "piemonte/dtm5/" + nome)
        if resta() < 20:
            return False
    return ok


def piemonte_aree_protette():
    ok = True
    for f in ("Aree_protette_Piemonte.zip", "Aree_contigue_Piemonte.zip", "sic_wgs84.zip", "zps_wgs84.zip"):
        ok &= diretto(PIE + "direct/Geoportale/RegionePiemonte/Aree_protette/" + f, "aree_protette/piemonte/" + f)
    return ok


# ----------------------------------------------------------------- Liguria

LIG = "https://geoservizi.regione.liguria.it/geoserver/"


def wfs_lig(mappa, strato, extra=""):
    return LIG + "%s/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=%s:%s&count=5000&outputFormat=SHAPE-ZIP%s" % (
        mappa, mappa, strato, extra)


def liguria_foresta():
    """Tipi forestali 1:25.000 (ed. 2010): il servizio dà 5000 poligoni per richiesta, quindi a pagine."""
    for p in range(100):
        rel = "liguria/tipi_forestali/tipi_forestali_p%02d.zip" % p
        if not via_tmp(wfs_lig("M1363", "L3522", "&sortBy=ogr_fid&startIndex=%d" % (p * 5000)), rel,
                       lambda t: "%d poligoni" % n_pos(t), 150):
            return False
        if n_shp(percorso(rel)) < 5000:
            break
    return via_tmp(wfs_lig("M1363", "L3598", "&sortBy=ogr_fid"), "liguria/tipi_forestali/punti_controllo_a_terra.zip",
                   lambda t: "%d punti" % n_pos(t))


def liguria_dtm5():
    """DTM 5 m (ed. 2023) dal WCS, a mattonelle di 10 km.

    Attenzione: con geotiff:compression=DEFLATE il server restituisce file incompleti (provato il
    10 novembre 2026); con LZW il contenuto è identico a quello non compresso.
    """
    import rasterio
    base = LIG + "M2056/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=M2056__L6952&format=image/tiff&geotiff:compression=LZW"
    x0, ymax, xmax, ymin, lato = 1379054.19189, 4947084.40548, 1585804.19189, 4847829.40548, 10000.0
    reg = percorso("liguria/dtm5/mattonelle_vuote.json")
    vuote = json.load(open(reg)) if os.path.exists(reg) else []
    for j in range(10):
        for i in range(21):
            nome = "dtm5_liguria_r%02d_c%02d.tif" % (j, i)
            dest = percorso("liguria/dtm5/" + nome)
            if os.path.exists(dest) or nome in vuote:
                continue
            if resta() < 50:
                return False
            xa = x0 + i * lato
            xb = min(xa + lato, xmax)
            yb = ymax - j * lato
            ya = max(yb - lato, ymin)
            tmp = os.path.join(TMP, nome)
            if not curl(base + "&subset=X(%.5f,%.5f)&subset=Y(%.5f,%.5f)" % (xa, xb, ya, yb), tmp, 60):
                print("  errore di rete:", nome)
                return False
            with rasterio.open(tmp) as d:
                a = d.read(1)
                if (d.width, d.height) != (round((xb - xa) / 5), round((yb - ya) / 5)):
                    print("  dimensioni inattese:", nome)
                    return False
                piena = bool((a != d.nodata).any())
            if piena:
                shutil.move(tmp, dest)
            else:  # solo mare o fuori regione: non si salva, si annota
                os.remove(tmp)
                vuote.append(nome)
                json.dump(sorted(vuote), open(reg, "w"))
            time.sleep(0.2)
    piene = [f for f in os.listdir(os.path.dirname(reg)) if f.endswith(".tif")]
    print("  DTM Liguria: %d mattonelle con dati, %d vuote" % (len(piene), len(vuote)))
    return len(piene) + len(vuote) == 210


def liguria_aree_protette():
    a = via_tmp(wfs_lig("M2475", "L9705"), "aree_protette/liguria/aree_protette_2023.zip", lambda t: "%d elementi" % n_pos(t))
    b = via_tmp(wfs_lig("M2475", "L9430"), "aree_protette/liguria/zonizzazione_aree_protette_terrestri_2023.zip",
                lambda t: "%d elementi" % n_pos(t))
    return a and b


# ------------------------------------------------- suolo, aree protette, GBIF

def suolo():
    """SoilGrids 250 m (ISRIC): pH e tessitura fra 0 e 30 cm, riquadro di Piemonte e Liguria."""
    import rasterio

    def tif(t):
        with rasterio.open(t) as d:
            a = d.read(1)
            if d.width < 1000 or (a > 0).mean() < 0.3:
                raise ValueError("raster vuoto")
            return "%d x %d celle" % (d.width, d.height)

    ok = True
    for prop in ("phh2o", "clay", "sand", "silt"):
        for prof in ("0-5cm", "5-15cm", "15-30cm"):
            url = ("https://maps.isric.org/mapserv?map=/map/%s.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage"
                   "&COVERAGEID=%s_%s_mean&FORMAT=image/tiff&SUBSET=long(6.5,10.2)&SUBSET=lat(43.6,46.7)"
                   "&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
                   "&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326") % (prop, prop, prof)
            ok &= via_tmp(url, "suolo_soilgrids/%s_%s_mean.tif" % (prop, prof), tif, 90)
    return ok


def natura2000_euap():
    """Rete Natura 2000 ed elenco EUAP dal WFS del Ministero dell'Ambiente (MASE), nel riquadro dell'area."""
    import pyogrio

    def gml(t):
        n = pyogrio.read_info(t)["features"]
        if n <= 0:
            raise ValueError("nessun elemento")
        return "%d elementi" % n

    ok = True
    for mappa, strato, nome in (("SIC_ZSC_ZPS", "SP.SITIPROTETTI.SIC_ZSC_ZPS", "natura2000_sic_zsc_zps.gml"),
                                ("EUAP", "SP.SITIPROTETTI.EUAP", "euap_aree_protette.gml")):
        url = ("http://wms.pcn.minambiente.it/ogc?map=/ms_ogc/wfs/%s.map&service=WFS&version=1.0.0"
               "&request=GetFeature&typeName=%s&bbox=6.5,43.7,10.2,46.6") % (mappa, strato)
        ok &= via_tmp(url, "aree_protette/" + nome, gml, 90)
    return ok


GBIF_TENGO = ["key", "datasetKey", "publishingOrgKey", "basisOfRecord", "occurrenceStatus", "taxonKey", "speciesKey",
              "scientificName", "species", "decimalLatitude", "decimalLongitude", "coordinateUncertaintyInMeters",
              "elevation", "eventDate", "year", "month", "day", "stateProvince", "county", "municipality", "license",
              "issues", "references", "datasetName", "identificationVerificationStatus"]
GBIF_RIQUADRO = "POLYGON((6.6 43.75,10.1 43.75,10.1 46.5,6.6 46.5,6.6 43.75))"


def gbif():
    """Ritrovamenti pubblici (solo per la validazione). Non si salvano i nomi di chi ha osservato."""
    def api(url):
        out = subprocess.run(["curl", "-s", "--fail", "--max-time", "30", url], capture_output=True, text=True).stdout
        return json.loads(out) if out else None

    armillaria = (api("https://api.gbif.org/v1/species/match?name=Armillaria&rank=GENUS&kingdom=Fungi") or {}).get("usageKey")
    if not armillaria:
        return False
    taxa = [("porcino_boletus_edulis", 5954958), ("porcino_nero_boletus_aereus", 8733688),
            ("porcino_rosso_boletus_pinophilus", 5954949), ("porcino_estivo_boletus_reticulatus", 5954691),
            ("gallinaccio_cantharellus_cibarius", 5249504), ("ovolo_amanita_caesarea", 5240269),
            ("mazza_di_tamburo_macrolepiota_procera", 8914748), ("chiodino_armillaria_genere", armillaria),
            ("trombetta_craterellus_cornucopioides", 2554662), ("steccherino_hydnum_repandum", 2554716),
            ("sanguinello_lactarius_deliciosus", 5248629), ("sanguinello_lactarius_deterrimus", 7925734),
            ("sanguinello_lactarius_salmonicolor", 5248788), ("spugnole_morchella_genere", 2594601),
            ("prugnolo_calocybe_gambosa", 8936224), ("dormiente_hygrophorus_marzuolus", 7244099)]
    base = ("https://api.gbif.org/v1/occurrence/search?country=IT&hasCoordinate=true&hasGeospatialIssue=false"
            "&occurrenceStatus=PRESENT&geometry=" + urllib.parse.quote(GBIF_RIQUADRO) + "&limit=300")
    for nome, chiave in taxa:
        dest = percorso("ritrovamenti_gbif/gbif_%s.json" % nome)
        if os.path.exists(dest):
            continue
        if resta() < 30:
            return False
        record, salto, totale = [], 0, None
        while True:
            j = api(base + "&taxonKey=%d&offset=%d" % (chiave, salto))
            if j is None:
                return False
            totale = j.get("count")
            record += [{k: r[k] for k in GBIF_TENGO if k in r} for r in j.get("results", [])]
            if j.get("endOfRecords") or not j.get("results"):
                break
            salto += 300
            time.sleep(0.15)
        if totale != len(record):
            print("  incompleto:", nome)
            return False
        tmp = os.path.join(TMP, "gbif.json")
        json.dump({"taxonKey": chiave, "interrogazione": base + "&taxonKey=%d" % chiave,
                   "scaricato": datetime.date.today().isoformat(), "numero": len(record), "record": record},
                  open(tmp, "w"), ensure_ascii=False)
        shutil.move(tmp, dest)
        print("  %s: %d record" % (nome, len(record)))
    riepilogo = percorso("ritrovamenti_gbif/gbif_riepilogo.json")
    if not os.path.exists(riepilogo):
        righe, dataset, licenze = [], collections.Counter(), collections.Counter()
        for nome, chiave in taxa:
            rr = json.load(open(percorso("ritrovamenti_gbif/gbif_%s.json" % nome)))["record"]
            anni = [r["year"] for r in rr if r.get("year")]
            for r in rr:
                dataset[r.get("datasetKey")] += 1
                licenze[(r.get("license") or "").split("/licenses/")[-1].split("/publicdomain/")[-1]] += 1
            righe.append({"specie": nome, "taxonKey": chiave, "numero": len(rr), "anni": [min(anni), max(anni)] if anni else None,
                          "tipi": dict(collections.Counter(r.get("basisOfRecord") for r in rr))})
        info = []
        for k, n in dataset.most_common(12):
            d = api("https://api.gbif.org/v1/dataset/%s" % k) or {}
            info.append({"datasetKey": k, "record": n, "titolo": d.get("title"), "licenza": d.get("license"), "doi": d.get("doi")})
        json.dump({"data": datetime.date.today().isoformat(), "riquadro": GBIF_RIQUADRO, "specie": righe, "licenze": dict(licenze),
                   "dataset_principali": info, "altri_dataset": len(dataset) - len(info)}, open(riepilogo, "w"), ensure_ascii=False, indent=1)
    return True


def osm():
    """OpenStreetMap, estratto Nord-Ovest di Geofabrik (ODbL).

    Geofabrik ammette gli script purché non riscarichino lo stesso file più volte: qui si scarica
    una volta sola, si riprende se la linea cade e si confronta l'impronta md5 pubblicata dal sito.
    Se nella cartella c'è già un estratto, si completa o si controlla quello: non se ne scarica un altro.
    """
    sito = "https://download.geofabrik.de/europe/italy/"
    cart = os.path.dirname(percorso("osm/x"))
    presenti = sorted(f for f in os.listdir(cart) if f.endswith(".osm.pbf"))
    if presenti:
        url = sito + presenti[-1]
    else:
        out = subprocess.run(["curl", "-sI", "--max-time", "30", sito + "nord-ovest-latest.osm.pbf"], capture_output=True, text=True).stdout
        m = re.findall(r"(?im)^location:\s*(\S+)", out)
        if not m:
            print("  il server non indica il file del giorno")
            return False
        url = urllib.parse.urljoin(sito, m[-1])
    if not diretto(url, "osm/" + os.path.basename(url)):
        return False
    pubblicata = subprocess.run(["curl", "-sL", "--max-time", "30", url + ".md5"], capture_output=True, text=True).stdout.split()
    h = hashlib.md5()
    with open(percorso("osm/" + os.path.basename(url)), "rb") as fh:
        for blocco in iter(lambda: fh.read(1 << 22), b""):
            h.update(blocco)
    uguale = bool(pubblicata) and pubblicata[0] == h.hexdigest()
    print("  impronta md5:", "uguale a quella pubblicata" if uguale else "DIVERSA da quella pubblicata")
    return uguale


def uso_suolo():
    """ESA WorldCover 2021 v200: uso del suolo a 10 m (CC BY 4.0), aggiunto in Fase 2 con l'ok dell'11 novembre 2026.

    Le 4 mattonelle di 3 x 3 gradi che coprono Piemonte e Liguria, dal deposito pubblico su AWS (senza account).
    Serve a distinguere prati, coltivi, paesi e acqua, che la carta forestale non distingue.
    """
    base = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_%s_Map.tif"
    ok = True
    for m in ("N42E006", "N45E006", "N42E009", "N45E009"):
        ok &= diretto(base % m, "uso_suolo_worldcover/ESA_WorldCover_10m_2021_v200_%s_Map.tif" % m)
    return ok


# ---------------------------------------------------------------- verifica

def descrivi(p):
    e = p.lower()
    if e.endswith(".osm.pbf"):
        with open(p, "rb") as fh:
            if b"OSMHeader" not in fh.read(64):
                raise ValueError("intestazione OSM mancante")
        return "file OSM PBF, intestazione valida"
    if e.endswith(".json"):
        j = json.load(open(p))
        return "json valido" + (", %d record" % j["numero"] if isinstance(j, dict) and "numero" in j else "")
    if e.endswith(".zip"):
        with zipfile.ZipFile(p) as z:
            if z.testzip() is not None:
                raise ValueError("zip rotto")
            nomi = z.namelist()
        tif = [n for n in nomi if n.lower().endswith(".tif")]
        if tif:
            import rasterio
            with rasterio.open("/vsizip/%s/%s" % (p, tif[0])) as d:
                return "zip integro; raster %d x %d, %s, celle %g m" % (d.width, d.height, d.crs.to_string() if d.crs else "senza CRS", d.res[0])
        if any(n.lower().endswith(".shx") for n in nomi):
            return "zip integro; %d elementi" % n_shp(p)
        return "zip integro; %d file" % len(nomi)
    if e.endswith(".tif"):
        import rasterio
        with rasterio.open(p) as d:
            return "raster %d x %d, %s, celle %g" % (d.width, d.height, d.crs.to_string() if d.crs else "senza CRS", d.res[0])
    if e.endswith(".gpkg") or e.endswith(".gml"):
        import pyogrio
        out = []
        for nome, tipo in pyogrio.list_layers(p):
            if tipo:
                out.append("%s: %d elementi" % (nome, pyogrio.read_info(p, layer=nome)["features"]))
        return "; ".join(out[:6]) or "nessuno strato geografico"
    return "non controllato"


def verifica():
    """Impronta sha256 e controllo di apertura per ogni file; il risultato va in dati-grezzi/_registro.json."""
    reg = os.path.join(RADICE, "_registro.json")
    vecchio = {}
    if os.path.exists(reg):
        vecchio = {r["file"]: r for r in json.load(open(reg)).get("file", [])}
    righe, completo = [], True
    for cart, sotto, files in os.walk(RADICE):
        sotto[:] = sorted(s for s in sotto if not s.startswith("_"))
        for f in sorted(files):
            if f.startswith(("_", ".")) or f.endswith(".gfs"):  # .gfs: appunti che GDAL crea leggendo i GML
                continue
            p = os.path.join(cart, f)
            rel = os.path.relpath(p, RADICE).replace(os.sep, "/")
            st = os.stat(p)
            v = vecchio.get(rel)
            if v and v["bytes"] == st.st_size and v.get("mtime") == int(st.st_mtime) and "ERRORE" not in v.get("controllo", ""):
                righe.append(v)
                continue
            if resta() < 30:
                completo = False
                continue
            h = hashlib.sha256()
            with open(p, "rb") as fh:
                for blocco in iter(lambda: fh.read(1 << 22), b""):
                    h.update(blocco)
            try:
                nota = descrivi(p)
            except Exception as e:
                nota = "ERRORE: " + str(e)[:100]
            righe.append({"file": rel, "bytes": st.st_size, "mtime": int(st.st_mtime), "sha256": h.hexdigest(), "controllo": nota})
    json.dump({"aggiornato": datetime.datetime.now().isoformat(timespec="seconds"), "completo": completo, "file": righe},
              open(reg, "w"), ensure_ascii=False, indent=1)
    gruppi = collections.OrderedDict()
    for r in righe:
        parti = r["file"].split("/")
        g = gruppi.setdefault("/".join(parti[:2]) if len(parti) > 2 else parti[0], [0, 0, 0])
        g[0] += 1
        g[1] += r["bytes"]
        g[2] += "ERRORE" in r["controllo"]
    for nome, (n, b, err) in gruppi.items():
        print("  %-34s %4d file %8.1f MB %s" % (nome, n, b / 1e6, "ERRORI: %d" % err if err else "ok"))
    print("  totale: %d file, %.2f GB%s" % (len(righe), sum(r["bytes"] for r in righe) / 1e9, "" if completo else " — NON finito: rilancia"))
    return completo and not any("ERRORE" in r["controllo"] for r in righe)


VOCI = collections.OrderedDict([
    ("piemonte-foresta", piemonte_foresta), ("piemonte-dtm25", piemonte_dtm25), ("piemonte-dtm5-cuneo", piemonte_dtm5_cuneo),
    ("piemonte-aree-protette", piemonte_aree_protette), ("liguria-foresta", liguria_foresta), ("liguria-dtm5", liguria_dtm5),
    ("liguria-aree-protette", liguria_aree_protette), ("suolo", suolo), ("natura2000-euap", natura2000_euap), ("gbif", gbif),
    ("osm", osm), ("uso-suolo", uso_suolo),
])


def main():
    global LIMITE
    ap = argparse.ArgumentParser(description="Bolé: scarico e controllo dei dati grezzi")
    ap.add_argument("cosa", choices=list(VOCI) + ["tutto", "verifica"])
    ap.add_argument("--secondi", type=int, default=0, help="si ferma dopo N secondi (0 = senza limite)")
    a = ap.parse_args()
    LIMITE = a.secondi
    os.makedirs(RADICE, exist_ok=True)
    try:
        if a.cosa == "verifica":
            ok = verifica()
        else:
            ok = True
            for nome in (list(VOCI) if a.cosa == "tutto" else [a.cosa]):
                if resta() < 20:
                    ok = False
                    break
                print(nome + ":")
                fatto = bool(VOCI[nome]())
                print("  →", "fatto" if fatto else "DA RILANCIARE")
                ok &= fatto
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    sys.exit(0 if ok else 2)


if __name__ == "__main__":
    main()

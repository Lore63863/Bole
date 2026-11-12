"""Controllo iNaturalist: ci sono ritrovamenti verificati non ancora in GBIF?

Chiede a iNaturalist (API pubblica, gratuita) le osservazioni delle stesse
specie usate da GBIF, in Piemonte e Liguria, con queste condizioni:

  - identificazione verificata dalla comunita ("research grade");
  - licenza CC0, CC BY o CC BY-NC (le stesse che accetta GBIF);
  - posizione non oscurata.

Poi le confronta, per numero di osservazione, con quelle che GBIF ci aveva
gia dato (dati-elaborati/calibrazione/inat_in_gbif.json, preso dai link
"references" dei file in dati-grezzi/ritrovamenti_gbif/).

Non salva nomi utente: per ogni osservazione nuova tiene solo numero,
specie, data, coordinate, precisione e licenza.

Regole dell'API rispettate: una richiesta ogni 1,1 secondi e un User-Agent
che dice chi siamo (https://www.inaturalist.org/pages/api+recommended+practices).

Uso:  python3 pipeline/inat_controllo.py
Scrive dati-elaborati/calibrazione/inat_nuovi.json
"""

import json
import pathlib
import time

import requests

RADICE = pathlib.Path(__file__).resolve().parent.parent
GIA_IN_GBIF = RADICE / "dati-elaborati" / "calibrazione" / "inat_in_gbif.json"
USCITA = RADICE / "dati-elaborati" / "calibrazione" / "inat_nuovi.json"

API = "https://api.inaturalist.org/v1"
LUOGHI = "10872,96906"            # Piemonte, Liguria (luoghi di iNaturalist)
LICENZE = "cc0,cc-by,cc-by-nc"
PAUSA = 1.1                       # secondi fra una richiesta e l'altra
INTESTAZIONE = {"User-Agent": "Bole-app-funghi/0.1 (uso personale, non commerciale)"}

# Gli stessi gruppi usati per GBIF (vedi i nomi dei file in dati-grezzi/ritrovamenti_gbif/).
TAXA = {
    "porcino": ["Boletus edulis"],
    "porcino_nero": ["Boletus aereus"],
    "porcino_estivo": ["Boletus reticulatus"],
    "porcino_rosso": ["Boletus pinophilus"],
    "gallinaccio": ["Cantharellus cibarius"],
    "ovolo": ["Amanita caesarea"],
    "mazza_di_tamburo": ["Macrolepiota procera"],
    "chiodino": ["Armillaria"],                 # genere intero, come GBIF
    "trombetta": ["Craterellus cornucopioides"],
    "steccherino": ["Hydnum repandum"],
    "sanguinello": ["Lactarius deliciosus", "Lactarius deterrimus", "Lactarius salmonicolor"],
    "spugnole": ["Morchella"],                  # genere intero, come GBIF
    "prugnolo": ["Calocybe gambosa"],
    "dormiente": ["Hygrophorus marzuolus"],
}

sessione = requests.Session()
sessione.headers.update(INTESTAZIONE)


def chiedi(percorso, **parametri):
    time.sleep(PAUSA)
    r = sessione.get(f"{API}/{percorso}", params=parametri, timeout=60)
    r.raise_for_status()
    return r.json()


def numero_taxon(nome):
    """Trova il numero di iNaturalist per un nome scientifico (corrispondenza esatta)."""
    for t in chiedi("taxa", q=nome, per_page=10)["results"]:
        if t["name"].lower() == nome.lower() and t.get("is_active", True):
            return t["id"], t["rank"]
    raise SystemExit(f"taxon non trovato su iNaturalist: {nome}")


def osservazioni(taxon_id):
    """Tutte le osservazioni che rispettano le condizioni, a pagine da 200."""
    tutte, ultimo = [], 0
    while True:
        d = chiedi(
            "observations", taxon_id=taxon_id, place_id=LUOGHI,
            quality_grade="research", license=LICENZE, geoprivacy="open",
            taxon_geoprivacy="open", per_page=200, order_by="id", order="asc",
            id_above=ultimo,
        )
        pagina = d["results"]
        if not pagina:
            return tutte
        tutte += pagina
        ultimo = pagina[-1]["id"]


def main():
    gia = set(json.loads(GIA_IN_GBIF.read_text(encoding="utf-8")))
    uscita = {"_condizioni": {"luoghi": "Piemonte e Liguria", "qualita": "research grade",
                              "licenze": LICENZE, "posizione": "non oscurata",
                              "controllato_il": time.strftime("%Y-%m-%d")},
              "specie": {}}
    totale_nuove = 0
    for specie, nomi in TAXA.items():
        trovate, nuove = 0, []
        for nome in nomi:
            tid, rango = numero_taxon(nome)
            for o in osservazioni(tid):
                trovate += 1
                if str(o["id"]) in gia:
                    continue
                lat, lon = (float(v) for v in o["location"].split(",")) if o.get("location") else (None, None)
                nuove.append({
                    "id": o["id"], "taxon": o["taxon"]["name"], "data": o.get("observed_on"),
                    "lat": lat, "lon": lon, "precisione_m": o.get("positional_accuracy"),
                    "licenza": o.get("license_code"),
                })
        totale_nuove += len(nuove)
        uscita["specie"][specie] = {"trovate": trovate, "nuove": len(nuove), "record": nuove}
        print(f"{specie:18s} trovate {trovate:4d}   non ancora in GBIF {len(nuove):3d}")
    uscita["nuove_in_tutto"] = totale_nuove
    USCITA.write_text(json.dumps(uscita, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"nuove in tutto: {totale_nuove}  -> {USCITA}")


if __name__ == "__main__":
    main()

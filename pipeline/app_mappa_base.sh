#!/bin/sh
# Bolé - Fase 4: mappa base per Piemonte e Liguria (strade, sentieri, paesi, boschi, acque).
#
# Che cosa fa
#   Ritaglia dal build giornaliero di Protomaps (dati OpenStreetMap, licenza ODbL) solo la zona
#   di Piemonte e Liguria più 5 km, in 4 pezzi sotto i 100 MB (limite di GitHub per file):
#     base_z0-12.pmtiles      zoom 0-12, tutta la zona
#     base_z13.pmtiles        zoom 13, tutta la zona (qui compaiono sentieri e piste)
#     base_z14_ovest.pmtiles  zoom 14, a ovest di 8,1° E
#     base_z14_est.pmtiles    zoom 14, a est di 8,1° E
#   Non scarica il file mondiale (139 GB): go-pmtiles legge solo i pezzi che servono.
#   Non usa i server di tile di openstreetmap.org.
#
# Serve
#   go-pmtiles: https://github.com/protomaps/go-pmtiles (un solo programma, gratuito)
#
# Uso
#   sh pipeline/app_mappa_base.sh [AAAAMMGG]     (predefinito: il build usato in Fase 4)
#
# Dove scrive
#   dati-elaborati/app/mappa/*.pmtiles
#
# Caratteri e simboli della mappa (già nell'app, in app/public/mappa/):
#   caratteri Noto Sans Regular, Medium, Italic (licenza OFL) e simboli "light" (licenza nel file
#   LICENSE.md), da https://github.com/protomaps/basemaps-assets
set -e
DATA=${1:-20261111}          # build del 11/11/2026 (dati OSM aggiornati a quel giorno)
SORGENTE="https://build.protomaps.com/${DATA}.pmtiles"
CARTELLA="$(cd "$(dirname "$0")/.." && pwd)/dati-elaborati/app/mappa"
cd "$CARTELLA"
go-pmtiles extract "$SORGENTE" base_z0-12.pmtiles     --region=regioni_5km.geojson  --maxzoom=12
go-pmtiles extract "$SORGENTE" base_z13.pmtiles       --region=regioni_5km.geojson  --minzoom=13 --maxzoom=13
go-pmtiles extract "$SORGENTE" base_z14_ovest.pmtiles --region=regione_ovest.geojson --minzoom=14 --maxzoom=14
go-pmtiles extract "$SORGENTE" base_z14_est.pmtiles   --region=regione_est.geojson   --minzoom=14 --maxzoom=14
ls -l *.pmtiles
echo "Se un file supera i 100 MB, sposta il confine est/ovest (anche in app/src/mappa/base.ts, CONFINE_EST_OVEST)."

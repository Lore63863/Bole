# Bolé — mappe e strati dell'app (ramo «dati»)

File grandi che l'app legge a pezzi (formato PMTiles). Non stanno nel ramo principale per non
appesantire il codice: il lavoro «Pubblica il sito» li prende da qui e li mette sul sito.

| File | Che cosa c'è | Da dove viene | Licenza |
| --- | --- | --- | --- |
| `mappa/base_z0-12.pmtiles`, `base_z13`, `base_z14_ovest`, `base_z14_est` | strade, sentieri, paesi, boschi, acque, zoom 0–14 (Piemonte e Liguria) | estratto della mappa Protomaps (build 20261111) con `pipeline/app_mappa_base.sh` | © OpenStreetMap contributors, ODbL |
| `strati/habitat_a…e.pmtiles` | habitat 0–100 di 3 specie per file, zoom 6–12 | `pipeline/app_strati.py` da carte forestali, DTM, ESA WorldCover, SoilGrids | dati derivati da fonti CC BY 4.0 (vedi `docs/SOURCES.md`) |
| `strati/quota.pmtiles` | quota (Terrarium), categoria forestale, castagneto da frutto | `pipeline/app_strati.py` da DTM e carte forestali regionali | CC BY 4.0 (Regione Piemonte, Regione Liguria) |

## Come si aggiornano (una o due volte l'anno)

1. Sul computer: `pipeline/app_mappa_base.sh` (mappa) e/o `pipeline/app_strati.py` (strati), poi `pipeline/app_dimensioni.py`.
2. Si sostituiscono i file qui con un solo salvataggio che rimpiazza il precedente (il ramo tiene una sola versione).
3. Scheda Actions → «Pubblica il sito» → Run workflow.

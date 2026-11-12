# SOURCES — dati usati da Bolé

- **Aggiornato:** 12 novembre 2026 (aggiunte 24 osservazioni verificate di iNaturalist; meteo in §3)
- **Dove sono i file:** cartella `dati-grezzi/` sul computer locale (2,80 GB, 171 file). Non va nel repo pubblico.
- **Come rifarli:** `python3 pipeline/scarica_dati.py tutto`, poi `python3 pipeline/scarica_dati.py verifica`.
- **Controllo:** `dati-grezzi/_registro.json` elenca ogni file con dimensione, impronta sha256 ed esito dell'apertura. L'11 novembre 2026 tutti i 171 file risultano integri.
- Le licenze segnate «scheda» sono state lette sulla scheda ufficiale del dato il 10 novembre 2026.

## 1. Dati scaricati (10 e 11 novembre 2026)

| Dato | Ente | Licenza | Da dove | File in `dati-grezzi/` | Peso | Controllo |
| --- | --- | --- | --- | --- | --- | --- |
| Carta forestale regionale, ed. 2025, scala 1:10.000 | Regione Piemonte, Settore Foreste | CC BY 4.0 (scheda r_piemon:130b499f-3e2d-4388-8cf0-66892cd7ee25) | https://www.datigeo-piem-download.it/direct/Geoportale/RegionePiemonte/SIFOR/CF_2025.gpkg | `piemonte/carta_forestale_2025/CF_2025.gpkg` | 194 MB | 74.021 poligoni |
| DTM 25 m (ripresa aerea ICE 2009–2011) | Regione Piemonte | CC BY 4.0 (scheda r_piemon:f4b00ea3-6e98-4a04-a2ae-bc5d4f285aed) | https://www.datigeo-piem-download.it/direct/Geoportale/RegionePiemonte/DTM25/DTM25_2009-2011_PIEMONTE_ICE/DTM25_2009-2011_PIEMONTE_ICE.zip | `piemonte/dtm25/` | 128 MB | raster 8150 × 10663, EPSG:32632 |
| DTM 5 m (ICE 2009–2011), 24 fogli 1:50.000 attorno alla provincia di Cuneo: 171–175, 189–193, 207–211, 224–228, 242–245 | Regione Piemonte | CC BY 4.0 (scheda r_piemon:224de2ac-023e-441c-9ae0-ea493b217a8e) | https://www.datigeo-piem-download.it/static/regp01/DTM5_ICE/RIPRESA_AEREA_ICE_2009_2011_DTM-SDO_CTR_FOGLI50-NNN-EPSG32632-TIF.zip (elenco fogli dallo strato `scDTM5ICE` del servizio di scarico del Geoportale) | `piemonte/dtm5/` | 1,24 GB | 24 zip integri; EPSG:32632, celle 5 m |
| Aree protette, aree contigue, ZSC/SIC, ZPS | Regione Piemonte | CC BY 4.0 (schede r_piemon:4368c018-6b58-4834-b233-c45360cb1206, b5cd9a2d-68a1-41a1-a1bc-ad6243308bc2, 16c0124d-3b84-4a91-ab97-4ee1ef1aa940) | https://www.datigeo-piem-download.it/direct/Geoportale/RegionePiemonte/Aree_protette/ (4 zip) | `aree_protette/piemonte/` | 2,8 MB | 135 ZSC/SIC, 51 ZPS |
| Tipi forestali 1:25.000, ed. 2010, con i punti di controllo a terra | Regione Liguria | CC BY 4.0 (scheda 1363) | WFS https://geoservizi.regione.liguria.it/geoserver/M1363/wfs, strati `M1363:L3522` e `M1363:L3598` | `liguria/tipi_forestali/` (5 pagine + punti) | 46 MB | 20.589 poligoni, 1.217 punti; EPSG:3003 |
| DTM 5 m, ed. 2023 | Regione Liguria | CC BY 4.0 (scheda 2056) | WCS https://geoservizi.regione.liguria.it/geoserver/M2056/wcs, copertura `M2056__L6952`, compressione LZW | `liguria/dtm5/` (95 mattonelle da 10 km) | 231 MB | 5.420 km² di celle valide (Liguria: 5.416 km²); 3 mattonelle a campione identiche alla versione non compressa |
| Aree protette e relativi piani, ed. 2023 (aree e zonizzazione terrestre) | Regione Liguria | CC BY 4.0 (scheda 2475) | WFS https://geoservizi.regione.liguria.it/geoserver/M2475/wfs, strati `M2475:L9705` e `M2475:L9430` | `aree_protette/liguria/` | 2,1 MB | 306 aree, 1.057 zone |
| Rete Natura 2000 (SIC/ZSC, ZPS) ed Elenco ufficiale aree protette (EUAP) | Ministero dell'Ambiente (MASE), Geoportale Nazionale | CC BY 4.0 (m_amte:8HCH2C:8cb1c5c8-5a7d-4be0-df35-5f6e4f7de63f) | WFS http://wms.pcn.minambiente.it/ogc (mappe `SIC_ZSC_ZPS` ed `EUAP`), riquadro 6,5–10,2 E / 43,7–46,6 N | `aree_protette/*.gml` | 14 MB | 542 siti Natura 2000, 89 aree EUAP |
| SoilGrids 250 m 2.0: pH, argilla, sabbia, limo a 0–5, 5–15, 15–30 cm | ISRIC – World Soil Information (Poggio et al. 2021, SOIL 7: 217–240) | CC BY 4.0 | WCS https://maps.isric.org/mapserv (mappe `phh2o`, `clay`, `sand`, `silt`) | `suolo_soilgrids/` (12 raster) | 17 MB | 1637 × 1297 celle, EPSG:4326 |
| Ritrovamenti delle 14 specie (16 voci) | GBIF.org, ricerca del 10 novembre 2026. Dataset principali: iNaturalist Research-grade Observations (doi:10.15468/ab3s5x), NABU naturgucker (doi:10.15468/uc1apo), Swiss National Fungi Databank (doi:10.16904/envidat.136) | per record: CC BY-NC 4.0 (1.290), CC BY 4.0 (286), CC0 (38) | https://api.gbif.org/v1/occurrence/search, Italia, riquadro 6,6–10,1 E / 43,75–46,5 N | `ritrovamenti_gbif/` | 1,3 MB | 1.614 record; elenco dataset in `gbif_riepilogo.json` |
| OpenStreetMap, estratto Nord-Ovest (dati dell'8 novembre 2026) | Geofabrik GmbH e © OpenStreetMap contributors | ODbL 1.0 | https://download.geofabrik.de/europe/italy/nord-ovest-261108.osm.pbf | `osm/nord-ovest-261108.osm.pbf` | 595 MB | impronta md5 uguale a quella pubblicata dal sito |
| Osservazioni verificate non ancora in GBIF, 14 specie (scaricate il 12 novembre 2026) | iNaturalist (inaturalist.org) | per osservazione: CC BY-NC (tutte e 26) | API pubblica https://api.inaturalist.org/v1/observations, luoghi Piemonte (10872) e Liguria (96906), solo «research grade», licenze CC0/CC BY/CC BY-NC, posizione non oscurata; una richiesta ogni 1,1 s | `dati-elaborati/calibrazione/inat_nuovi.json` (rifatto da `pipeline/inat_controllo.py`) | 6,5 KB | 712 osservazioni trovate, 26 non ancora in GBIF (24 dentro le due regioni); senza nomi utente |
| Uso del suolo ESA WorldCover 2021 v200, celle da 10 m (scaricato l'11 novembre 2026) | ESA, consorzio WorldCover (Zanaga e altri 2022, doi:10.5281/zenodo.7254221) | CC BY 4.0 | deposito pubblico su AWS, senza account: `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_<mattonella>_Map.tif` | `uso_suolo_worldcover/` (4 mattonelle: N42E006, N45E006, N42E009, N45E009) | 337 MB | 4 raster 36.000 × 36.000, EPSG:4326; dentro i poligoni di bosco delle carte forestali il 94,2% delle celle è «alberi» |

Note:
- **GBIF e iNaturalist:** servono per tarare e provare il modello (`docs/VALIDATION.md`), non come strato della mappa. I nomi di chi ha osservato non vengono salvati: ogni osservazione iNaturalist si ritrova dal suo numero (`https://www.inaturalist.org/observations/<numero>`), che porta anche il nome dell'autore. Pochi record e concentrati vicino a strade e città: da usare con cautela.
- **SoilGrids:** il servizio ricampiona i dati in gradi (EPSG:4326); va bene per un fattore secondario come il suolo.
- **EUAP** è l'elenco nazionale del 2010: per i confini aggiornati dei parchi valgono i dati regionali.

## 2. Non scaricati, e perché

| Dato | Stato |
| --- | --- |
| Mappa base Protomaps (dati OSM, ODbL) | Misurata, non scaricata: va tagliata su misura in Fase 4. Peso dell'estratto di Piemonte e Liguria (build del 10 novembre 2026) per zoom massimo: 10 → 22 MB; 11 → 46 MB; 12 → 106 MB; 13 → 223 MB; 14 → 430 MB; 15 → 849 MB. |
| DSM 5 m Piemonte (r_piemon:12a0bdd2-166a-4825-8645-1a4605b70f48, CC BY 4.0) | La scheda non pubblica nessun link di download. Il modello per ora non usa l'altezza del bosco. |
| DTM 5 m del resto del Piemonte | Non serve per l'habitat: prova fatta sul Cuneese l'11 novembre 2026 (`docs/MODEL.md`, punto 1.9). Se ne riparla in Fase 4 per le curve di livello. |
| Copernicus HRL Tree Cover Density 10 m | Gratuito, ma il download chiede un accesso personale EU Login: saltato per ora. |
| Aree percorse dal fuoco | Entro la primavera (spugnole). Liguria: uno strato WFS per anno, per esempio `M2748:L10867` (2025), `M2685:L10534` (2024), `M2593:L10142` (2023). |
| OMIRL Liguria (pluviometri) | Accesso non documentato: si usa il radar della Protezione Civile. |
| Carta Forestale d'Italia (CREA), DTM LiDAR 1 m MASE, TINITALY 10 m | Non servono; TINITALY resta come riserva. |
| Carta geologica 1:250.000 e Carta dei suoli del Piemonte | Facoltative per il fattore suolo. |

## 3. Meteo (Fase 3: scelto e in uso)

**La scelta.** Bolé usa **un solo modello meteo per passato e futuro**: l'IFS
dell'ECMWF a circa 9 km, letto dall'**archivio aperto di Open-Meteo su AWS**
(file `.om`, non l'API a chiamate). Motivi:

- stessa regola per lo storico e per la previsione, senza salti fra due fonti;
- nessun limite di chiamate e nessun blocco per indirizzo IP, cosa che
  conta per il lavoro automatico quotidiano su GitHub (l'API, dalle macchine
  condivise, risponde «troppe richieste»);
- i valori coincidono con quelli dell'API (differenza di 1 su 1.000.000 sulla
  pioggia): controllato il 10 novembre 2026.

| Dato | Ente | Licenza | Accesso | Stato |
| --- | --- | --- | --- | --- |
| **IFS 9 km: pioggia, temperatura, suolo, neve** | ECMWF, distribuito da Open-Meteo | **CC BY 4.0** (attribuzione obbligatoria) | `https://openmeteo.s3.amazonaws.com/data/ecmwf_ifs/` | **in uso**: storico dal 2017 e previsione a +15 giorni |
| ERA5 0,25° | Copernicus, via Open-Meteo | CC BY 4.0 | stesso bucket, `copernicus_era5` | scaricato, **non usato**: la pioggia è più alta del 46% rispetto a IFS (Cuneo: 1.554 contro 1.063 mm/anno) |
| ERA5-Land 0,1° | Copernicus, via Open-Meteo | CC BY 4.0 | stesso bucket, `copernicus_era5_land` | provato e lasciato: utile solo prima del 2017, dove mancano comunque i ritrovamenti |
| API a chiamate | Open-Meteo | CC BY 4.0; gratis solo **non commerciale**, <10.000 chiamate/giorno | `*.open-meteo.com` | usata solo per i controlli di coerenza, non dall'app |
| Pioggia 24 h misurata | ARPA Piemonte | CC BY 4.0 del Geoportale | `webgis.arpa.piemonte.it/ags/rest/.../TR_pioggia_24h` | **non disponibile**: l'11 novembre 2026 il servizio risponde «Service not started». Da riprovare in Fase 5 |
| Radar + pluviometri | Dipartimento Protezione Civile | CC BY-SA | `https://radar-api.protezionecivile.it/` | **non disponibile**: risponde «Access Denied» (filtro Akamai). **Non è stato forzato**. Da riprovare in Fase 5 |
| Archivio radar 2010–2025 (IT-DPC-SRI) | FBK / DPC | CC BY-SA 4.0 | Zenodo, 49,8 GB | non scaricato: troppo grande e i derivati andrebbero rilasciati CC BY-SA |

**Attribuzione da mostrare in app:** «Meteo: modello IFS dell'ECMWF,
dall'archivio aperto di Open-Meteo (CC BY 4.0)».

**Uso non commerciale.** L'archivio aperto è CC BY 4.0 e non ha il vincolo
non commerciale dell'API. Bolé resta comunque un'app personale e gratuita.

## 4. Fonti micologiche per la tabella specie

La verifica riga per riga e l'elenco completo delle fonti sono in `docs/SPECIE.md`. Fonti ancora da leggere per intero:

- Sitta, Davoli, Floriani, Suriano (2021), *Guida ragionata alla commestibilità dei funghi*, Regione Piemonte, ISBN 979-12-200-9297-5 (PDF sul sito regionale: da scaricare a mano)
- Regione Piemonte / IPLA, *Funghi & tartufi: risorse del bosco* (schede delle specie; PDF sul sito regionale: da scaricare a mano)
- ISPRA, Manuali e linee guida 119/2014, *Abbinamento dei macromiceti italiani ai sistemi di classificazione degli habitat*
- ISPRA, Manuali e linee guida 187/2019, *La flora micologica delle principali essenze vegetali italiane*

## 4b. Fonti dei testi dell'app (Fase 4, controllate il 12 novembre 2026)

| Che cosa | Fonte | Etichetta |
| --- | --- | --- |
| Regole Piemonte (titolo, costi, 3 kg, orari, divieti, sanzioni, specie senza titolo) | Regione Piemonte, «Guida alla raccolta funghi in Piemonte: normative e procedure», agg. 17/10/2026: https://www.regione.piemonte.it/web/temi/ambiente-territorio/biodiversita-aree-naturali/conservazione-salvaguardia/guida-alla-raccolta-funghi-piemonte-normative-procedure ; domande frequenti: https://www.regione.piemonte.it/web/sites/default/files/media/documenti/2021-11/domande%20freq%20funghi.pdf ; L.R. 24/2007 testo coordinato (pubblicato da un Comune) | dato ufficiale |
| Regole Liguria (permessi, 3 kg e 1 kg di ovoli, orari, divieti, sanzioni) | ISPRA, scheda sulla L.R. 17/2014, aprile 2021: https://development.isprambiente.gov.it/files/biodiversita/raccolta-dei-funghi-epigei-regione-liguria.pdf (manca una pagina regionale aggiornata) | dato ufficiale, da ricontrollare |
| Caccia | Piemonte: DGR 9/6/2026 (calendario 2026/27), manifesto del calendario, caccia di selezione al capriolo; Liguria: DGR 125 del 16/4/2026; L. 157/1992 art. 18 (silenzio venatorio martedì e venerdì) | dato ufficiale |
| Peste suina africana | Commissario straordinario, ordinanze 4/2026 (GU 8/7/2026) e 6/2026 (piano Piemonte-Liguria); misure in provincia di Alessandria dalla pagina regionale | dato ufficiale |
| Centri di controllo micologico | Regione Piemonte, elenco dei Centri: https://www.regione.piemonte.it/web/media/310/download ; ATS Liguria (dal 1/1/2026), pagine delle Aree 1–5 (ex ASL1–ASL5). Posizioni = centro del paese da OpenStreetMap | dato ufficiale |
| Consigli di consumo (cottura, 2 giorni in frigo, chi non deve mangiarli, chiodini, spugnole) | Regione Piemonte, «Funghi spontanei: precauzioni» (2025); ASL Biella (2025); Tox Info Suisse (2026); Centro Antiveleni di Milano e Ministero della Salute; ATS Liguria Area 3 (2026) | dato ufficiale / letteratura |
| Sosia pericolosi | `docs/SPECIE.md` (guida regionale *Funghi & tartufi*, Associazione Micologica Bresadola, Scuola Sant'Anna di Pisa, Rivista Micologica Romana); in più schede sanitarie della Comunidad de Madrid (Lepiota, Entoloma), Annali ISS (*Chlorophyllum molybdites*), Lagrange e Vernoux 2020 (spugnole e giromitra) | letteratura |
| Tramonto | algoritmo NOAA «General Solar Position Calculations», confrontato con la libreria `astral` (entro 2 minuti) | letteratura |
| Mappa base | Protomaps, build del 11/11/2026 (dati OpenStreetMap, ODbL): `pipeline/app_mappa_base.sh`; caratteri Noto Sans (OFL) e simboli da https://github.com/protomaps/basemaps-assets | dato (ODbL) |

## 5. Attribuzioni da mostrare nell'app

- Regione Piemonte: Carta forestale regionale ed. 2025, DTM ICE 2009–2011, aree protette (CC BY 4.0)
- Regione Liguria: Tipi forestali ed. 2010, DTM ed. 2023, aree protette ed. 2023 (CC BY 4.0)
- Ministero dell'Ambiente (MASE): Rete Natura 2000, EUAP
- ISRIC SoilGrids (CC BY 4.0)
- © ESA WorldCover project / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium (CC BY 4.0)
- GBIF.org e i dataset citati sopra; iNaturalist (inaturalist.org), osservazioni con licenza CC BY-NC
- © OpenStreetMap contributors (ODbL), Protomaps
- «Weather data by Open-Meteo.com» (con il link a https://open-meteo.com/, come chiede il piano) — modello IFS dell'ECMWF, archivio aperto CC BY 4.0

## 6. Note tecniche

- **WCS Liguria:** con `geotiff:compression=DEFLATE` il server restituisce mattonelle incomplete (solo il 26% delle celle in una prova). Con LZW il contenuto è identico a quello non compresso: lo script usa LZW.
- **Rete:** i download partono dal computer locale; dall'area di lavoro cloud non rispondono Regione Piemonte, ARPA Piemonte e Geofabrik.
- **Geofabrik:** il suo robots.txt esclude i file `*.osm.pbf`, ma riguarda i motori di ricerca. Il gestore ammette gli script che scaricano con criterio (blog Geofabrik, «Download responsibly!», 10 settembre 2025: niente pianeta intero a pezzi, niente download ripetuti dello stesso file). Lo script scarica una volta sola, riprende se la linea cade e controlla l'md5. In futuro si riscarica solo quando serve davvero.
- **Altri robots.txt letti:** GBIF vieta solo `/v1/image/unsafe`; ISRIC nessun divieto; geomap.reteunitaria vieta solo «spatineo»; datigeo-piem-download, geoportale.piemonte.it e ARPA non ne hanno; geoservizi.regione.liguria.it non lo pubblica, e WFS e WCS rispondono senza vincoli dichiarati.
- **Da cancellare a mano:** `dati-grezzi/_to_delete/portofino_area_protetta_2023.zip` (scaricato per errore: riguarda solo il Parco di Portofino).

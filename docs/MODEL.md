# MODEL — come Bolé calcola l'idoneità

- **Aggiornato:** 11 novembre 2026
- **Stato:** habitat in versione 0 (non calibrata) per tutto il Piemonte e tutta la Liguria; meteo, stagione e classi in versione 0.3 (12 novembre 2026), tarate sui ritrovamenti pubblici 2017–2026 (`docs/VALIDATION.md`, approvato il 12 novembre 2026).
- **Schema:** idoneità = Habitat × Meteo × Stagione, con l'affidabilità calcolata a parte. Sono probabilità relative, mai certezze.
- **Etichette:** *dato ufficiale*, *letteratura*, *stima da calibrare*. Ogni numero qui sotto ne ha una.

## 1. Habitat (H): dove una specie può vivere

L'habitat è la parte fissa del modello: dice **dove** una specie può vivere, non **quando** nasce.

**H = ospite × quota × suolo × pendenza** (da 0 a 1, per ogni cella di 25 m)

| Fattore | Che cosa guarda | Regola | Etichetta |
| --- | --- | --- | --- |
| Ospite | tipo di bosco | tabella «specie × tipo di bosco» (1.2) | letteratura o stima, valore per valore |
| Quota | metri sul mare | trapezio per specie (1.3) | limiti: letteratura e ritrovamenti; rampe: stima da calibrare |
| Suolo | pH | solo per le specie di suolo acido: 1 fino a pH 6,0, poi scende fino a 0,8 a pH 7,0; dove il dato manca vale 1 | stima da calibrare |
| Pendenza | gradi | 1 fino a 30°, poi scende fino a 0,5 da 40° in su (versante poco praticabile) | stima da calibrare |
| Fuori dal bosco | margine del bosco e uso del suolo | solo mazza di tamburo, prugnolo e spugnole (1.4) | stima da calibrare |
| Esclusioni | uso del suolo | coltivi, costruito e acqua valgono 0 per tutte le specie, anche dentro i poligoni di bosco | dato ufficiale (carta) + regola del modello |

Il suolo pesa poco apposta: il dato disponibile è un modello mondiale a 250 m.

### 1.1 La griglia di lavoro

- **Celle:** 25 m, sistema EPSG:32632, 10.904 colonne × 11.920 righe. Le celle coincidono con quelle del DTM a 25 m del Piemonte.
- **Dove sta:** `dati-elaborati/griglia25/` (circa 270 MB, solo sul computer: non va nel repo).

| File | Contenuto | Da dove viene | Etichetta |
| --- | --- | --- | --- |
| `quota.tif` | quota in metri | DTM 25 m del Piemonte; DTM 5 m della Liguria, media sulle celle da 25 m | dato ufficiale |
| `regione.tif` | 1 Piemonte, 2 Liguria | copertura dei due DTM, corretta con le carte forestali | calcolo (il confine ufficiale si aggiunge in Fase 4) |
| `pendenza.tif` | pendenza in gradi | dalla quota, metodo di Horn (1981) | calcolo |
| `esposizione.tif` | verso cui guarda il versante | come sopra | calcolo |
| `carico_termico.tif` | quanto scalda il versante | formula di McCune e Keon (2002), equazione 1 | letteratura |
| `twi.tif` | umidità topografica | formula di Quinn e altri (1991), dopo aver chiuso le conche (Barnes e altri 2014) | letteratura |
| `categoria.tif` | categoria forestale | Carta forestale del Piemonte 2025; Tipi forestali della Liguria 2010 | dato ufficiale |
| `avvisi.tif` | castagneto da frutto | tipo `CA10X` delle due carte | dato ufficiale |
| `ph.tif` | pH del suolo, 0–30 cm | SoilGrids 250 m | letteratura (modello mondiale, grossolano) |
| `margine.tif` | distanza dal margine del bosco, fino a 75 m | dalla categoria forestale | calcolo |
| `uso_suolo.tif` | uso del suolo: alberi, arbusti, prato, coltivi, costruito, terreno nudo, neve, acqua, zona umida, muschi | ESA WorldCover 2021 (celle da 10 m): ogni cella da 25 m prende la classe più frequente | dato ufficiale (carta mondiale da satellite) |

**Controlli fatti**

- **Incastro dei due DTM:** nella fascia di confine coperta da tutti e due (129.868 celle) la differenza mediana è −0,3 m e metà delle celle sta entro ±2,7 m.
- **Quote note:** Cuneo, piazza Galimberti 539 m (circa 534); Torino, piazza Castello 238 m (circa 239); Monte Beigua 1.274 m vicino alla vetta (1.287).
- **Superfici:** Liguria 5.424 km² (ufficiali 5.416). Piemonte 25.643 km² (ufficiali 25.387): il DTM sborda di circa 250 km² oltre il confine, dove però non c'è carta forestale e l'habitat resta zero.
- **Bosco in carta:** Piemonte 9.871 km², Liguria 3.954 km², arbusteti e boscaglie compresi. Nessun codice di categoria sconosciuto.
- **Bosco e satellite d'accordo:** dentro i poligoni di bosco delle due carte forestali, il 94,2% delle celle è «alberi» anche per ESA WorldCover. Sono due fonti indipendenti: se le carte fossero fuori posto non combacerebbero.
- **Uso del suolo:** Piemonte alberi 45,4%, prato 23,3%, coltivi 21,3%, costruito 4,6%; Liguria alberi 85,2%, prato 6,2%, costruito 4,5%, arbusti 3,3%.
- **Controlli automatici:** `python3 pipeline/test_habitat.py` (7 controlli su esempi con risultato noto).

### 1.2 Ospite: la tabella «specie × tipo di bosco»

**File:** `data/ospiti.csv` (40 righe, 14 colonne di specie). Disegno: `dati-elaborati/anteprime/matrice_ospiti.png`.

**Righe**
- Piemonte: le 21 categorie della Carta forestale 2025 (campo `ca_1`).
- Liguria: le 19 categorie dei Tipi forestali 2010 (campo `cod_cat`).
- Attenzione: lo stesso codice può voler dire cose diverse nelle due regioni. `PM` è «pinete di pino marittimo» in Piemonte e «pinete montane» in Liguria. La tabella si legge sempre con regione e codice insieme. Nei file i codici diventano numeri: elenco in `data/categorie.json`.

**Valori**

| Valore | Significato | Etichetta |
| --- | --- | --- |
| 1 | ambiente elencato nella scheda della guida regionale *Funghi & tartufi*, o documentato in uno studio locale | letteratura |
| 0,6 | ambiente citato come secondario nella guida o in un'altra fonte; per le 4 specie senza scheda (mazza di tamburo, chiodino, spugnole, prugnolo) è l'ambiente più probabile | letteratura, oppure stima per le 4 specie senza scheda |
| 0,3 | ambiente possibile | stima da calibrare |
| 0 | ambiente non adatto | stima da calibrare |

**Come leggerla**
- I valori si confrontano dentro la stessa specie, non fra specie diverse.
- Un 1 non vuol dire «qui ci sono funghi»: vuol dire che quel tipo di bosco è fra quelli giusti. Quota, suolo e meteo decidono il resto.
- Fonti e ragionamento, specie per specie: `docs/SPECIE.md`.

### 1.3 Quota: un trapezio per specie

**File:** `data/specie.csv`. Sotto `q0` vale 0, sale fino a 1 in `q1`, resta 1 fino a `q2`, scende a 0 in `q3`.

**Regola usata per passare dalla tabella specie ai quattro numeri** (*stima da calibrare*): ai limiti scritti nella tabella l'idoneità vale 0,5; si azzera 100 m oltre. Dove la guida dà un limite «eccezionale» (per esempio «fino a 1.400 m in faggeta»), la discesa va dal limite normale a quello eccezionale.

| Specie | Sale da (m) | Piena da | Piena fino a | Zero da | In Liguria | Etichetta dei limiti |
| --- | --- | --- | --- | --- | --- | --- |
| Porcino | 200 | 400 | 1.900 | 2.100 | uguale | letteratura e ritrovamenti |
| Porcino nero | 100 | 300 | 1.000 | 1.400 | uguale | letteratura e ritrovamenti |
| Porcino estivo | 100 | 300 | 1.000 | 1.600 | uguale | letteratura e ritrovamenti |
| Porcino rosso | 300 | 500 | 1.400 | 1.800 | uguale | letteratura e ritrovamenti |
| Gallinaccio | 0 | 500 | 1.900 | 2.100 | uguale | letteratura e ritrovamenti («raro alle basse quote») |
| Ovolo buono | – | 0 | 1.000 | 1.200 | zero da 1.300 | letteratura e ritrovamenti |
| Mazza di tamburo | – | 0 | 1.700 | 1.900 | uguale | ritrovamenti |
| Chiodino | – | 0 | 1.400 | 1.600 | uguale | ritrovamenti |
| Trombetta dei morti | 100 | 300 | 1.400 | 1.600 | uguale | ritrovamenti |
| Steccherino dorato | 0 | 200 | 1.800 | 2.000 | uguale | letteratura e ritrovamenti |
| Sanguinello | – | 0 | 1.600 | 1.800 | uguale | letteratura e ritrovamenti |
| Spugnole | – | 0 | 1.700 | 1.900 | uguale | ritrovamenti |
| Prugnolo | 100 | 300 | 1.600 | 1.800 | uguale | ritrovamenti (pochi) |
| Dormiente | 350 | 550 | 1.500 | 1.700 | sale da 500, piena da 700 | letteratura e ritrovamenti |

Il trapezio è largo apposta: lo spostamento della stagione con la quota (estate in alto, autunno in basso) lo deve dare la temperatura, in Fase 3, non una regola fissa.

**Suolo acido** (fattore suolo attivo): porcino, porcino rosso, gallinaccio, ovolo buono (*letteratura*: guida regionale). Per le altre specie il suolo non entra (*stima*).

### 1.4 Fuori dal bosco: mazza di tamburo, prugnolo e spugnole

Crescono in prati, radure, margini, siepi e filari, cioè in gran parte fuori dalla carta forestale. Lì il valore viene dall'uso del suolo (ESA WorldCover) e dalla distanza dal bosco. Tutti i numeri sono *stime da calibrare* e stanno in `data/specie.csv`.

| Specie | Prato | Arbusti | Alberi fuori dalla carta forestale | Entro 50 m dal bosco, su terreno naturale | Dentro il bosco, entro 50 m dal margine |
| --- | --- | --- | --- | --- | --- |
| Mazza di tamburo | 0,3 | 0,3 | 0,3 | almeno 0,6 | almeno 0,6 |
| Prugnolo | 0,3 | 0,6 | 0,3 | almeno 0,6 | almeno 0,3 |
| Spugnole | 0 | 0 | 0,3 | – | – |

- **Terreno naturale:** prato, arbusti, alberi, oppure cella senza dato di uso del suolo.
- **Alberi fuori dalla carta forestale** (3.236 km²): filari, rive, frutteti, parchi, noccioleti. Per le spugnole è il modo, grossolano, di vedere frutteti e rive.
- **Coltivi, costruito e acqua** valgono sempre 0, per tutte le specie.
- **Limite:** la carta da satellite a 10 m non distingue un prato da sfalcio da un pascolo o da un campo sportivo, né un frutteto da un filare.

### 1.5 Calcolati ma non ancora dentro H

Esposizione, carico termico e umidità topografica sono pronti nella griglia, ma **non** entrano nel punteggio dell'habitat. Motivi:

- **Esposizione e carico termico:** l'effetto cambia con la stagione (versanti freschi d'estate, versanti al sole in autunno). Entrano in Fase 3 nella correzione della temperatura locale, non come regola fissa.
- **Umidità topografica (TWI):** conta insieme alla pioggia (impluvi nelle annate asciutte, dossi in quelle piovose). In Fase 3 si prova come correttore del fattore pioggia.
- In Fase 3 si controlla anche se, da soli, migliorano la mappa dell'habitat rispetto ai ritrovamenti; se sì, entrano in H.

### 1.6 Avvisi (non abbassano il punteggio)

- **Castagneto da frutto:** tipo `CA10X`; 748 poligoni in Piemonte (113 km²) e 58 in Liguria (4 km²). In app diventa un avviso: in Piemonte la raccolta è vietata nei castagneti da frutto coltivati; per la Liguria la regola va verificata in Fase 4.
- **Aree protette e Natura 2000:** i confini sono già scaricati; diventano avvisi in Fase 4.

### 1.7 Risultati della versione 0

Superfici in km². «Habitat in carta» = idoneità maggiore di zero. «Alta o molto alta» = oltre 60 su 100. «Cuneese» = riquadro di prova fra 6,73° e 8,34° est, 44,04° e 45,02° nord.

| Specie | Habitat: Piemonte | Liguria | Cuneese | Alta o molto alta: Piemonte | Liguria | Cuneese |
| --- | --- | --- | --- | --- | --- | --- |
| Porcino | 7.594 | 2.369 | 3.560 | 4.398 | 1.729 | 2.310 |
| Porcino nero | 4.741 | 3.041 | 2.558 | 2.727 | 1.455 | 1.452 |
| Porcino estivo | 6.583 | 3.334 | 3.258 | 2.748 | 1.778 | 1.592 |
| Porcino rosso | 5.329 | 1.767 | 2.657 | 2.868 | 1.268 | 1.785 |
| Gallinaccio | 7.205 | 2.758 | 3.376 | 3.528 | 1.330 | 2.030 |
| Ovolo buono | 4.278 | 3.084 | 2.346 | 3.076 | 1.671 | 1.549 |
| Mazza di tamburo | 14.886 | 4.958 | 7.239 | 0 | 0 | 0 |
| Chiodino | 8.479 | 3.542 | 3.967 | 0 | 0 | 0 |
| Trombetta dei morti | 5.183 | 2.614 | 2.698 | 3.397 | 1.432 | 1.947 |
| Steccherino dorato | 7.252 | 3.436 | 3.560 | 4.958 | 2.584 | 2.676 |
| Sanguinello | 610 | 473 | 252 | 127 | 380 | 100 |
| Spugnole | 6.500 | 1.736 | 2.887 | 0 | 0 | 0 |
| Prugnolo | 9.788 | 2.386 | 4.632 | 0 | 0 | 0 |
| Dormiente | 4.098 | 1.366 | 2.245 | 76 | 6 | 26 |
| Porcini (i quattro insieme) | 7.838 | 3.477 | 3.859 | 4.671 | 2.067 | 2.417 |

- **Zeri nella colonna «alta»:** mazza di tamburo, chiodino, spugnole e prugnolo non hanno una scheda nella guida, quindi il loro massimo è 0,6 e in mappa non superano la classe «media». Non vuol dire che siano rari.
- **File:** `dati-elaborati/habitat/H_<specie>.tif` (da 2 a 10 MB l'uno, circa 110 MB in tutto) e `riepilogo.json`.
- **Anteprime:** `dati-elaborati/anteprime/`.

### 1.8 Primo confronto con i ritrovamenti pubblici

Fatto da `pipeline/habitat_verifica.py`. Usa i record GBIF con posizione precisa (incertezza dichiarata fino a 250 m) dentro le due regioni: 463 su 1.614. Per ogni punto prende il valore più alto entro 50 m.

| Specie | Punti | In zone alte o molto alte | Quelle zone sono il … del territorio | Dove c'è habitat | L'habitat è il … del territorio | Separazione |
| --- | --- | --- | --- | --- | --- | --- |
| Porcino | 32 | 69% | 19,7% | 78% | 32,1% | 0,70 |
| Porcino nero | 8 | 38% | 13,5% | 88% | 25,0% | 0,79 |
| Porcino estivo | 23 | 57% | 14,6% | 96% | 31,9% | 0,75 |
| Porcino rosso | 5 | 60% | 13,3% | 100% | 22,8% | 0,89 |
| Gallinaccio | 28 | 61% | 15,6% | 75% | 32,1% | 0,74 |
| Ovolo buono | 23 | 74% | 15,3% | 96% | 23,7% | 0,72 |
| Mazza di tamburo | 191 | 0% | 0,0% | 98% | 63,9% | 0,73 |
| Chiodino | 59 | 0% | 0,0% | 86% | 38,7% | 0,67 |
| Trombetta dei morti | 33 | 48% | 15,5% | 91% | 25,1% | 0,76 |
| Steccherino dorato | 12 | 92% | 24,3% | 92% | 34,4% | 0,81 |
| Sanguinello | 12 | 17% | 1,6% | 42% | 3,5% | 0,69 |
| Spugnole | 29 | 0% | 0,0% | 72% | 26,5% | 0,63 |
| Prugnolo | 3 | 0% | 0,0% | 100% | 39,2% | 0,84 |
| Dormiente | 5 | 0% | 0,3% | 60% | 17,6% | 0,72 |

**Separazione** (in gergo AUC): probabilità che un ritrovamento stia in una cella con valore più alto di una cella presa a caso nelle due regioni. 0,5 = come tirare a caso; 1 = perfetta. Qui si usa la cella esatta del punto, senza i 50 m di tolleranza.

**Come leggerlo**
- Per porcini, gallinaccio, ovolo, trombetta e steccherino i ritrovamenti si concentrano nelle zone buone da 3 a 5 volte più del caso, e la separazione sta fra 0,70 e 0,89. È il segno che la mappa va nel verso giusto.
- **Deboli:** sanguinello (più di metà dei punti fuori dall'habitat: i pini sparsi in altri boschi, parchi e giardini non sono in carta) e spugnole (con l'uso del suolo i punti dentro l'habitat sono saliti dal 52% al 72%, ma la separazione resta bassa, 0,63).
- **Limiti:** pochi punti, fatti dove passa più gente e quasi tutti nei boschi. È un controllo di buon senso, non una calibrazione.
- **Indice di Boyce (Fase 3):** con gli stessi punti, la mappa ordina bene per tutte le specie insieme (1,00) e per i porcini (0,83); sbaglia l'ordine per la trombetta (−0,14). Dettagli e proposta in `docs/VALIDATION.md`, 3.4 e 7.

### 1.9 Limiti e punti aperti

1. **Poca differenza dentro il bosco giusto:** con la sola tabella, quasi tutto il castagneto e la faggeta risultano «molto alta». A distinguere i versanti penseranno meteo, esposizione e umidità (Fase 3) e i 431 tipi forestali del Piemonte (campo `tf_1`), più fini delle categorie.
2. **Prati, coltivi, paesi, acqua:** distinti dall'11 novembre 2026 con ESA WorldCover (vedi 1.4). Resta grossolana la distinzione fra tipi di prato e fra frutteti, filari e parchi.
3. **Altezza e densità del bosco:** non disponibili (il DSM del Piemonte non ha un link pubblico; Copernicus chiede un account). Il modello per ora non distingue bosco giovane e bosco maturo.
4. **Carta della Liguria del 2010:** incendi e tagli successivi non ci sono. Le aree percorse dal fuoco si aggiungono con i dati regionali già individuati (`docs/SOURCES.md`).
5. **Nomi delle categorie del Piemonte:** vengono dal manuale *Tipi forestali del Piemonte* (IPLA 2008). Per `AS` e `OV` (i due gruppi di arbusteti) il nome va confermato sul manuale; pesa poco, perché valgono zero quasi ovunque.
6. **Le 4 specie senza scheda** non superano la classe «media» (vedi 1.7). Le classi definitive, relative alla stagione, si fissano in Fase 3.
7. **DTM a 5 m del Piemonte:** provato su tre fogli del Cuneese (`pipeline/prova_dtm5.py`). Rispetto al DTM a 25 m la pendenza media cresce di 0,6–1,2°, la correlazione è 0,986 e il fattore pendenza cambierebbe nel 5,3% delle celle. Per l'habitat non vale i 2–3 GB di download; se ne riparla in Fase 4 per le curve di livello della mappa base.
8. **Tutti i pesi segnati «stima»** (0,3 e 0,6 della tabella, rampe di quota, suolo, pendenza, margine) si tarano in Fase 3.

### 1.10 Come rifare i calcoli

Dalla cartella del progetto, in quest'ordine. Su un computer recente bastano un paio di minuti in tutto.

```
python3 pipeline/habitat_griglia.py quota
python3 pipeline/habitat_griglia.py terreno
python3 pipeline/habitat_griglia.py bosco
python3 pipeline/habitat_griglia.py suolo
python3 pipeline/habitat_griglia.py margine
python3 pipeline/habitat_griglia.py uso
python3 pipeline/habitat_twi.py
python3 pipeline/habitat_calcola.py
python3 pipeline/habitat_verifica.py
python3 pipeline/habitat_anteprima.py porcini cuneese --punti
```

- Se un comando scrive «RILANCIA», va rilanciato uguale: riprende da dove era.
- Servono Python 3.10 o più recente con `numpy`, `rasterio`, `pyogrio`, `shapely`, `numba`, `matplotlib`.
- Per guardare un punto: `python3 pipeline/habitat_punto.py 44.296 7.664`.
- Se si cambia `data/ospiti.csv` o `data/specie.csv` basta rilanciare da `habitat_calcola.py` in giù.

## 2. Meteo (M) e stagione (S): quando nasce

L'habitat dice **dove**. Meteo e stagione dicono **quando**.

**Indice di nascita = H × M × S**, da 0 a 1, per ogni cella e per ogni giorno
da oggi a +14. È una probabilità **relativa**: dice quali giorni e quali zone
promettono più di altri, non che lì ci sono funghi.

### 2.1 Da dove viene il meteo

| | |
| --- | --- |
| Modello | **IFS dell'ECMWF**, risoluzione circa 9 km |
| Da dove | archivio aperto di Open-Meteo su AWS (CC BY 4.0), letto direttamente dai file `.om` |
| Storico | dal 1° gennaio 2017 a oggi |
| Previsione | fino a +15 giorni, aggiornata 4 volte al giorno |
| Punti usati | 1.137, su Piemonte, Liguria e un bordo attorno |
| Etichetta | *dato ufficiale* (è una rianalisi/previsione ufficiale ECMWF) |

Lo stesso modello fornisce passato e futuro: così l'indice di oggi e quello di
fra dieci giorni si calcolano con la stessa regola, senza salti fra due fonti
diverse. Non si usa l'API a chiamate: niente limiti di traffico e niente
dipendenza da un indirizzo IP, cosa che conta per il lavoro automatico
quotidiano (vedi `docs/SOURCES.md`, §3).

### 2.2 Le due grandezze che contano

| Grandezza | Come si calcola | Etichetta |
| --- | --- | --- |
| **P26** — pioggia | somma della pioggia dei 26 giorni precedenti, in mm | finestra da *letteratura*, confermata dal backtest (2.8) |
| **T20** — temperatura | media delle temperature giornaliere dei 20 giorni precedenti, in °C, **corretta per la quota della cella** | finestra da *letteratura*, confermata dal backtest |

**Correzione per la quota.** I punti del modello meteo stanno a 9 km l'uno
dall'altro e hanno una loro quota, spesso diversa da quella della cella di
25 m. La temperatura viene riportata alla quota della cella con il gradiente
**calcolato giorno per giorno** dai 1.137 punti (temperatura contro quota,
retta ai minimi quadrati), limitato fra −8,5 e −3,0 °C/km; se il calcolo non
riesce si usa −6,5 °C/km. Un giorno di inversione termica e un giorno di
föhn hanno gradienti molto diversi, e il valore fisso li sbaglierebbe
entrambi. Il piano prevedeva di stimarlo dalle stazioni ARPA: il servizio non
risponde (`docs/SOURCES.md`, §3), quindi si usano i punti del modello. Le
inversioni di una singola valle stretta restano fuori portata (VALIDATION,
6.5). *Etichetta: metodo standard, gradiente dal dato.*

**Esposizione: provata e non adottata.** Correggere la temperatura anche con
il carico termico del versante (sud più caldo, nord più fresco) **non
migliora** il risultato nel backtest (2.8). Il coefficiente resta a zero. La
mappa dell'esposizione è calcolata e pronta in `griglia25/` se in futuro
servisse.

### 2.3 Come P26 e T20 diventano un numero

```
M = fattore_temperatura × fattore_pioggia × freni
```

- **fattore_temperatura** — campana (gaussiana) centrata sulla temperatura
  preferita della specie, con la sua larghezza: vale 1 all'ottimo e scende
  allontanandosene. *Etichetta: forma da letteratura, due numeri per specie
  tarati sui ritrovamenti.*
- **fattore_pioggia** — sale da un minimo di 0,05 fino a 1 quando P26
  raggiunge la «pioggia piena» della specie; oltre non cresce più. *Etichetta:
  stima tarata sui ritrovamenti.*

### 2.4 I quattro freni

Riducono M quando succede qualcosa che blocca la nascita. Sono tutti
**stime**: il backtest non li conferma né li smentisce (2.8), e li teniamo
perché sono prudenti — tolgono, non aggiungono.

| Freno | Quando scatta | Quanto resta |
| --- | --- | --- |
| Caldo | massima sopra 30 °C negli ultimi 7 giorni | 50% |
| Suolo secco | umidità del suolo (0–7 cm) sotto il 20° percentile del punto in quel periodo dell'anno | 50% |
| Gelo | minima sotto −2 °C negli ultimi 3 giorni | 20% |
| Neve | neve al suolo sopra 1 cm, solo sopra la quota media dei punti innevati del modello meno 200 m (dalla versione 0.3) | 0% |

La soglia del suolo secco è calcolata punto per punto e giorno per giorno su
tutto lo storico (`data/suolo_secco.npz`): «secco» significa secco **per quel
posto in quel periodo**, non secco in assoluto.

### 2.5 Stagione (S)

Curva a campana costruita **dai ritrovamenti pubblici della specie**
(GBIF, 2017 in poi): dove i ritrovamenti si addensano nell'anno, S sale.
Larghezza 18 giorni, con un fondo di 0,03 che non si azzera mai del tutto —
un fungo fuori stagione è raro, non impossibile. *Etichetta: stima dai dati.*

È la parte che pesa di più: da sola indovina già molto (2.8).

**Una curva per specie, non per fascia di quota.** Il piano chiedeva una curva
anche per fascia di quota. Provata con 2 e con 3 fasce: non migliora, e nel
10% di giorni migliori peggiora (`docs/VALIDATION.md`, punto 4.5). L'effetto
della quota sui tempi lo porta già T20, corretta per la quota della cella.

### 2.6 Le cinque classi

Le soglie sono **relative alla stagione della specie**, come chiesto: si
prendono tutti i giorni in stagione nei posti dei ritrovamenti e si guardano i
quantili di M × S.

| Classe | Dove cade |
| --- | --- |
| molto bassa | sotto il 60° percentile |
| bassa | 60°–80° |
| media | 80°–90° |
| alta | 90°–97° |
| molto alta | sopra il 97° |

Quindi «alta» vuol dire **giornata fra le migliori 1 su 10 della stagione per
quella specie**, non «ci sono funghi». Di conseguenza, in una settimana
normale la mappa è quasi tutta nelle due classi basse: è voluto.

### 2.7 Affidabilità

Tre gradini: alta, media, bassa. Si parte dai giorni di anticipo:

| Giorni avanti | Affidabilità di partenza |
| --- | --- |
| da oggi a +2 | alta |
| da +3 a +6 | media |
| da +7 a +14 | bassa |

Poi si scende **di un gradino** (mai sotto «bassa») per ciascuna di queste:

- la specie ha **meno di 20 ritrovamenti precisi** per tararla (oggi: porcino
  nero, porcino rosso, steccherino, sanguinello, prugnolo, dormiente);
- il punto è in **Liguria**, dove la carta dei boschi è del 2010 (in Piemonte
  è del 2025).

Il piano elencava anche la dispersione dell'ensemble meteo, la distanza dai
pluviometri e la qualità del radar: non si usano perché i dati non ci sono
(`docs/SOURCES.md`, §3). Si aggiungono se arrivano.

`pipeline/previsione.py` scrive il primo gradino (giorni di anticipo); l'app
applica gli altri due. *Etichetta: stima.* Va mostrata in app accanto a ogni
giorno.

### 2.8 Come è stato tarato e provato

In breve: i parametri per specie (temperatura preferita, larghezza, pioggia
piena) sono stati cercati sui ritrovamenti pubblici, partendo dai valori di
letteratura e restando vicini a quelli; la prova è stata fatta **lasciando
fuori un anno alla volta**, così il modello non ha mai visto l'anno del
ritrovamento che sta giudicando.

Risultato: l'indice completo batte sia il «solo calendario» sia il «solo
pioggia», che era la condizione da superare (versione 0.2: 81% contro 76% e 9%
su tutte le specie; 74% contro 65% e 8% sui porcini).

**Il racconto completo, con numeri, grafici e limiti, sta in
`docs/VALIDATION.md`.**

### 2.9 Parametri per specie (versione 0.3, 12 novembre 2026)

«Etichetta» dice da dove partiva la ricerca: **L** = valore di letteratura,
**S** = stima. Il valore finale è sempre *tarato sui ritrovamenti*, tenuto
vicino al punto di partenza.

| Specie | T preferita °C | Larghezza °C | Pioggia piena mm | Part. | Ritrov. | di cui precisi |
| --- | --- | --- | --- | --- | --- | --- |
| Porcino | 14,0 | 4,1 | 30 | L | 73 | 37 |
| Porcino nero | 15,8 | 2,2 | 77 | S | 13 | 8 |
| Porcino estivo | 17,0 | 2,9 | 94 | S | 54 | 26 |
| Porcino rosso | 11,1 | 4,0 | 117 | S | 12 | 7 |
| Gallinaccio | 15,5 | 3,4 | 77 | S | 36 | 24 |
| Ovolo buono | 18,3 | 3,7 | 77 | S | 41 | 25 |
| Mazza di tamburo | 13,8 | 4,1 | 76 | S | 338 | 216 |
| Chiodino | 11,8 | 3,1 | 32 | S | 98 | 62 |
| Trombetta dei morti | 15,3 | 2,3 | 78 | S | 41 | 31 |
| Steccherino dorato | 12,2 | 2,9 | 64 | S | 18 | 12 |
| Sanguinello | 11,4 | 3,1 | 68 | S | 11 | 8 |
| Spugnole | 9,4 | 2,5 | 44 | L | 50 | 25 |
| Prugnolo | 11,0 | 3,0 | 50 | S | 5 | 3 |
| Dormiente | 6,9 | 3,5 | 25 | S | 10 | 5 |

Il **prugnolo** ha 3 ritrovamenti precisi: i suoi numeri sono rimasti quelli
di partenza, non sono tarati. Va detto in app. «Ritrov.» conta i ritrovamenti
dal 2017 senza doppioni; «precisi» quelli entro 1 km, usati per tarare.

I freni e le soglie delle classi stanno in `data/modello.json`, che è il file
che l'app legge.

### 2.10 Come rifare i calcoli

```
python3 pipeline/meteo_storico.py ifs          # storico (lungo, si rilancia)
python3 pipeline/calibra_tabella.py            # ritrovamenti + habitat
python3 pipeline/calibra.py                    # taratura + prova
python3 pipeline/calibra.py --esperimenti      # le 13 varianti provate
python3 pipeline/validazione_grafici.py        # i due grafici
python3 pipeline/previsione.py                 # previsione di oggi
python3 pipeline/indice_mappa.py porcini cuneese 2021-10-11 --punti
python3 pipeline/habitat_boyce.py              # controllo dell'habitat
python3 pipeline/test_modello.py               # controlli automatici
```

- `meteo_storico.py` e `previsione.py` leggono i file `.om` e hanno bisogno anche di `omfiles` e `requests` (`pyproj` per lo storico). Sul computer locale non servono: girano su GitHub (lavoro automatico) o in un ambiente con quei pacchetti. Tutti gli altri comandi girano sul computer con i pacchetti del punto 1.10.

- `meteo_storico.py` scrive «RILANCIA» se è stato interrotto: va rilanciato uguale.
- `indice_mappa.py` accetta più date insieme e fa un pannello a confronto.

## 3. Fonti dei metodi

- Horn (1981), *Hill shading and the reflectance map*, Proceedings of the IEEE 69: 14–47. Pendenza ed esposizione.
- McCune e Keon (2002), *Equations for potential annual direct incident radiation and heat load*, Journal of Vegetation Science 13: 603–606, con la correzione pubblicata dall'autore: https://sites.science.oregonstate.edu/~mccuneb/radiation.htm. Carico termico.
- Beven e Kirkby (1979), Hydrological Sciences Bulletin 24: 43–69. Indice di umidità topografica.
- Quinn, Beven, Chevallier e Planchon (1991), Hydrological Processes 5: 59–79. Deflusso ripartito fra più celle.
- Barnes, Lehman e Mulla (2014), Computers & Geosciences 62: 117–127. Riempimento delle conche.
- Zanaga e altri (2022), *ESA WorldCover 10 m 2021 v200*, doi:10.5281/zenodo.7254221. Uso del suolo.
- ECMWF, *IFS Documentation CY48R1* (2023), https://www.ecmwf.int/en/publications/ifs-documentation. Modello meteo usato per storico e previsione.
- Open-Meteo, archivio aperto su AWS (CC BY 4.0), https://open-meteo.com/en/license e https://github.com/open-meteo/open-data. Distribuzione dei dati IFS in formato `.om`.
- Nelder e Mead (1965), *A simplex method for function minimization*, The Computer Journal 7: 308–313. Ricerca dei parametri per specie.
- Boyce, Vernier, Nielsen e Schmiegelow (2002), *Evaluating resource selection functions*, Ecological Modelling 157: 281–300. Indice di Boyce per il controllo dell'habitat.
- Dati e licenze: `docs/SOURCES.md`. Specie: `docs/SPECIE.md`. Prova del modello: `docs/VALIDATION.md`.

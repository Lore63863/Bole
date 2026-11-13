# APP — com'è fatta Bolé (Fase 4)

- **Stato:** MVP completo in anteprima (12 novembre 2026), con punti sulla mappa, statistiche del diario e condivisione col gruppo; non ancora pubblicato (Fase 5).
- **Dove:** codice in `app/`; istruzioni d'uso in `app/README.md`.
- **In una riga:** pagina web installabile (PWA) che scarica pochi file statici e calcola l'indice sul telefono, con le stesse formule del modello Python.

## 1. Come gira

```
pipeline (Python, sul computer o su GitHub Actions)    app (iPhone, Safari / Home)
─────────────────────────────────────────────          ─────────────────────────────────────────────
previsione.py  → meteo/oggi.json + punti.bin.gz  ──►   lavoratore (Web Worker): per ogni pixel
app_strati.py  → strati/habitat_a…e, quota       ──►     indice = habitat × meteo × stagione → classe
calibra.py     → modello.json (parametri v0.3)   ──►   MapLibre: mappa base + rilievo + indice + curve
app_mappa_base.sh → mappa/base_*.pmtiles         ──►   fogli: Perché qui?, Vicino, Diario, Regole, Guida…
app_luoghi.py, app_nomi.py → luoghi/*             ──►   service worker: app e testi sul telefono
```

- Solo file statici (in Fase 5 su GitHub Pages). Nessun account, nessuna statistica, nessuno script di terzi.
- Un solo server, facoltativo: quello della condivisione col gruppo (sezione 7). Se l'app è costruita senza il suo indirizzo (`VITE_CONDIVISIONE` vuoto) non parla con nessun altro.
- Funziona su iPhone (Safari, «Aggiungi alla schermata Home») e su Android (Chrome, «Installa app»). Differenze: «Naviga» apre Mappe di Apple su iPhone e Google Maps su Android; il consiglio per installarla cambia testo, e su Android ha il tasto «Installa» quando Chrome lo permette; la vibrazione alla pressione lunga c'è solo su Android.
- Il meteo dei 1.137 punti del modello IFS diventa una griglia regolare (0,028° × 0,02°) con la media pesata dei 4 punti più vicini (1/d²); dentro la griglia si interpola linearmente. Le temperature si riportano alla quota di ogni pixel con il gradiente del giorno; la neve vale solo sopra la quota dei punti innevati meno 200 m (regola v0.3, *stima da calibrare*).
- Affidabilità: alta (giorni 0–2), media (3–6), bassa (7–14); un gradino in meno per le specie con meno di 20 ritrovamenti precisi e in Liguria. Bassa = righe sulla mappa.

## 2. File che l'app scarica

| File | Contenuto | Peso | Etichetta / licenza |
| --- | --- | --- | --- |
| `dati/mappa/base_*.pmtiles` (4) | strade, sentieri, paesi, boschi, acque, zoom 0–14 | 202 MB | OpenStreetMap (ODbL) via Protomaps |
| `dati/strati/habitat_a…e.pmtiles` | habitat 0–100 di 3 specie per file, zoom 6–12 | 190 MB con `quota` | calcolo Bolé (Fase 2) da carte forestali regionali |
| `dati/strati/quota.pmtiles` | quota (Terrarium, 0,1 m), categoria forestale, castagneto da frutto | (sopra) | DTM regionali, carte forestali (dato ufficiale) |
| `dati/meteo/oggi.json`, `punti.bin.gz` | meteo dei punti, da −30 a +14 giorni | 0,3 MB al giorno | ECMWF IFS (CC BY 4.0) via Open-Meteo (uso non commerciale) |
| `dati/modello.json` | parametri per specie, versione 0.3 | 62 kB | taratura Fase 3 |
| `dati/luoghi/regioni.geojson`, `aree_protette.geojson`, `nomi.json` | confini, aree protette e Natura 2000, 45.504 nomi di luoghi | 3,6 MB | Regioni, MASE, OpenStreetMap |
| `dati/regole.json`, `dati/guida.json` | testi di Regole e Guida, con fonti | 37 kB | fonti ufficiali e letteratura (vedi SOURCES) |
| `dati/dimensioni.json` | peso delle tessere per zoom, per stimare un'area | 10 kB | calcolo |
| `mappa/fonts`, `mappa/sprites` | caratteri Noto Sans e simboli | 1,8 MB | OFL; licenza nel file |

Totale circa 400 MB, tutti sotto i 100 MB per file (limite GitHub). L'app non scarica tutto: solo le tessere della zona guardata.

## 3. Senza rete

- **Sempre sul telefono** (service worker, 47 file, 7,3 MB): app, caratteri, confini, nomi, testi, modello.
- **Meteo:** prima la rete, se manca l'ultima copia salvata (la data è in alto: «Meteo di …»; oltre 36 ore «Dati vecchi»).
- **Aree scaricate** (Strumenti → Mappe senza rete): mappa base zoom 6–14 e strati zoom 6–12 dell'area vista, nella Cache Storage. La dimensione si mostra prima; massimo 150 MB per area. Le tessere di un'area tolta si cancellano, tranne quelle che servono a un'altra area.
- **Prova fatta** (WebKit, 390×844): area di circa 8 × 8 km stimata 3 MB, scaricata 4 MB; poi rete staccata e app riaperta: mappa, curve, indice, nomi e «Perché qui?» funzionano.

## 4. Prove

| Prova | Comando | Esito (12/11/2026) |
| --- | --- | --- |
| Formule app = modello Python | `npm test` (casi da `tests/parita/genera.py`) | 4.200 casi, 14 specie: differenza massima 1·10⁻¹⁶, 0 classi diverse |
| Funzioni su iPhone 13 Pro | `npm run prova:iphone` (WebKit 390×844, densità 3) | 18 schermate, nessun errore nella console |
| Funzioni su Android | `TELEFONO=android node tests/funzioni.mjs …` (Chrome/Chromium 153, misura Pixel 7 412×839) | 12 schermate, nessun errore (solo avvisi di prestazione della scheda grafica di prova); pressione lunga: la voce si apre una volta sola |
| Modalità aereo su Android | `TELEFONO=android node tests/senza_rete.mjs …` | area scaricata (stima 3 MB, reale 4 MB), poi senza rete: mappa, indice e «Perché qui?» funzionano |
| Gruppo fra iPhone e Android | `AMICO=android node tests/ritrovamenti.mjs …` | 19 controlli passati: un telefono iPhone e uno Android |
| Modalità aereo | `npm run prova:senza-rete` | vedi sezione 3 |
| Punti, diario e gruppo (due telefoni + server locale) | `npm run prova:gruppo` | 19 controlli passati, 14 schermate: pressione lunga, mirino, 4 tipi di punto, invio di 5 soli campi, punto/ora/note mai fuori dal telefono, solo 2 indirizzi contattati, visibile solo dal giorno dopo, coda senza rete, «Togli dal gruppo» |
| Gruppo dal vivo (sito pubblicato + server su Cloudflare) | `node tests/gruppo_dal_vivo.mjs https://lore63863.github.io/Bole/ https://bole-condivisione.bole-funghi.workers.dev <cartella>` | 13 controlli passati: l'iPhone crea il gruppo, l'Android entra con il codice, un ritrovamento esce con i soli 5 campi (risposta 201) e si toglie (204); oggi l'altro telefono vede zero, come previsto. La visibilità dal giorno dopo si prova solo in locale (`npm run prova:gruppo`). La prova non lascia dati sul server |
| Colori dell'indice uguali alla legenda | `node tests/colori.mjs <url> <cartella>` poi `python3 tests/colori_conta.py <cartella>` | 8 viste (4 zone, zoom 10–14, iPhone e Android): meno dello 0,1% di pixel viola, blu o verdi; sulle schermate dell'iPhone vero prima della correzione erano il 49–73% |
| Cerca | `node tests/cerca.mjs <url> <cartella>` (anche `TELEFONO=android`) | 10 controlli: nomi trovati sul telefono anche senza rete, omonimi distinti dal paese vicino, nessuna richiesta fuori dal sito |
| Sicurezza | `node tests/sicurezza.mjs <url>` (anche `TELEFONO=android`) | 10 controlli: regole di sicurezza della pagina (CSP) attive e mai violate, script esterni bloccati, file di diario malevolo innocuo (niente foto da indirizzi esterni, niente condivisione importata, note solo testo) |
| Server della condivisione | `condivisione/`: `npm run prova` | 36 controlli passati: CORS, codici, campi ammessi, visibilità, database senza codici né IP, limiti, pulizia dopo 3 anni |
| Griglia di 1 km (EPSG:3035) | confronto con `pyproj` su 2.000 punti a caso | differenza 0,0 m; esempio EPSG 50° N 5° E identico |
| Lettura delle tessere PNG in WebKit | `tests/decodifica.mjs` | 0 differenze su habitat e quota |
| Tramonto | confronto con la libreria `astral` | entro 2 minuti (Valdieri, Torino, Genova) |
| Lighthouse PWA | — | non eseguito: la categoria PWA non esiste più in Lighthouse 12; controllati a mano manifest, icone, service worker e avvio senza rete |

## 5. Prestazioni

| Obiettivo (Fase 0) | Misura | Esito |
| --- | --- | --- |
| JavaScript < 300 KB compressi | 342 KB (gzip) all'avvio, di cui MapLibre 288 KB; codice di Bolé circa 54 KB (era 35 prima di punti, statistiche e gruppo); più il worker della mappa (147 KB), caricato in parallelo | **non raggiunto**: il limite lo fa MapLibre, che serve |
| Pacchetto offline per area < 150 MB | limite imposto in app; stime: 8 × 8 km 4–7 MB, 30 × 30 km 18–23 MB, 50 × 50 km 40–46 MB | raggiunto |
| Apertura < 3 s in 4G | da misurare su iPhone vero in Fase 5 | da verificare |

## 6. Limiti noti

1. Sulla mappa l'app interpola il meteo con una griglia sua: le classi possono differire di poco dalle mappe fatte in Python (le formule sono identiche, vedi prova).
2. Bordo esterno dei dati (Francia, mare): il rilievo ombreggiato fa un piccolo «gradino»; le curve di livello lì sono tolte.
3. «Vicino a me»: zone = quadrati di 1,5–8 km; distanze in linea d'aria (il tempo di viaggio lo dà Mappe); agli zoom bassi l'habitat è il massimo dei pixel (zone un po' generose).
4. Avviso del tramonto: compare solo se Bolé è aperta (una pagina web non può suonare a schermo spento).
5. Regole della Liguria: riassunto dalla scheda ISPRA del 2021 (non c'è una pagina regionale aggiornata); i Centri micologici liguri sono passati ad ATS Liguria dal 1° gennaio 2026.
6. Bussola: precisione di qualche grado; non corregge la declinazione magnetica (circa 3° in Piemonte).
7. Classe della mappa salvata con una voce: solo se il giorno della voce è ancora nel meteo del telefono (di solito oggi; i giorni passati no). Per quelle voci la classe si ricalcolerà nella taratura con lo storico.
8. Precisione GPS: si tiene la lettura migliore dei primi 25 secondi; sotto gli alberi e in valle può restare oltre 20-50 m (l'app lo dice e propone il mirino).
9. Gruppo: le segnalazioni non sono verificate; in un gruppo piccolo si può intuire chi ha condiviso; Cloudflare vede gli indirizzi IP mentre le richieste passano (Bolé non li salva).
10. Chrome e Android: i file delle mappe (`.pmtiles`) si leggono senza la cache del browser (`dati/archivi.ts`). Con molte richieste a pezzi in parallelo la cache di Chrome a volte restituiva byte rovinati e una tessera del rilievo non si leggeva («The source image could not be decoded»). Costo: qualche richiesta in più alla rete; su iPhone (Safari) la cache resta.
11. Le tessere disegnate dall'app (indice e curve di livello) vanno alla mappa come file PNG e non come ImageBitmap: su un iPhone 13 Pro vero l'ImageBitmap arrivava con i colori sbagliati (viola, lilla, verde), mentre nei telefoni simulati era giusto. Costo: una codifica PNG per tessera (pochi millisecondi).

## 7. Punti, statistiche e gruppo (aggiunti il 12 novembre 2026)

- **I tuoi punti** (`mappa/punti.ts`): ritrovamenti, uscite a vuoto, zone preferite e auto dell'uscita di oggi, con posizione precisa, solo sul telefono. Icone disegnate dall'app (nessuna immagine scaricata). Tocco su un punto = sua scheda; pressione lunga sulla mappa (o tasto destro al computer) = nuova voce lì; «Sposta il punto» apre un mirino al centro della mappa.
- **Istantanea** (`calcolo/istantanea.ts`): al salvataggio di una voce si calcolano indice, classe, affidabilità e habitat nel punto per quel giorno, con la versione del modello e la corsa del meteo. Servono alle statistiche (classe della mappa per ritrovamenti e per uscite a vuoto) e alla prossima taratura. *I colori della mappa non cambiano con i ritrovamenti* (scelta: l'indice resta il modello tarato sui dati pubblici).
- **Gruppo** (`dati/condivisione.ts` + server in `condivisione/`): scelto il 12 novembre 2026 (Cloudflare gratuito, codice di gruppo, quadrato di 1 km visibile dal giorno dopo, interruttore voce per voce). Dal telefono escono 5 campi (`cella`, `specie`, `quantita`, `data`, `token`), costruiti solo dalla funzione `pacchetto()`; il server rifiuta ogni campo in più. Il quadrato è la cella della griglia di riferimento europea di 1 km (ETRS89-LAEA, EPSG:3035), calcolata sul telefono. Senza rete le voci restano in coda e partono quando torna il campo. Le segnalazioni degli altri si salvano sul telefono (si vedono anche senza rete) e si mostrano come quadrati viola tratteggiati con il numero; in «Perché qui?» e in «Vicino» si contano a parte.
- **Server acceso** il 12 novembre 2026: `https://bole-condivisione.bole-funghi.workers.dev` (database D1 in UE). L'indirizzo sta in `app/.env.production`, scritto dal lavoro «Server del gruppo», che accetta solo un sottodominio `workers.dev` che inizi con `bole-`.

## 8. Fase 6 (13 novembre 2026)

- **Impaginazione come le app di mappe** (Google Maps, Apple Mappe): mappa a tutto schermo; in alto ricerca, data del meteo e specie; in basso un cassetto con il giorno e le schede che si trascina giù fino a una riga (schermo quasi intero). Le barre dei giorni fanno anche da cursore. Tasti in colonna a destra: livelli, **In bosco** (bussola, auto, tramonto), posizione. «Perché qui?» si apre a metà schermo; Vicino una riga per zona; dettagli lunghi chiusi a tocco. Le avvertenze di sicurezza restano sempre visibili.
- **Cerca** (`ui/cerca.ts`, `dati/luoghi.ts`): i 45.500 nomi di OpenStreetMap già sul telefono; niente esce.
- **Sicurezza**: regole della pagina (CSP) messe dal build in un `<meta>` (GitHub Pages non permette intestazioni); importazione del diario ripulita; il server scarta subito le richieste troppo grandi.


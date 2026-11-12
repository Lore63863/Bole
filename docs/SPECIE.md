# Tabella specie — verifica di fine Fase 1

- **Data:** 10 novembre 2026 (aggiornata dopo la lettura della guida regionale)
- **Che cosa è stato controllato:** la tabella delle 14 specie del prompt, riga per riga.
- **Con che cosa:** (1) le fonti scientifiche citate nel prompt; (2) fonti ufficiali italiane (Ministero della Salute, legge 352/1993, schede ISPRA, ASL); (3) due studi fatti in Italia, uno proprio in Liguria; (4) i 1.614 ritrovamenti pubblici scaricati da GBIF, con la quota letta sui nostri modelli del terreno; (5) la guida della Regione Piemonte *Funghi & tartufi: risorse del bosco*, letta per intero nelle 11 schede che ci riguardano (PDF in `docs/fonti/`), e la guida della Scuola Sant'Anna sui funghi dell'Alta Val di Vara; (6) riviste di associazioni micologiche.
- **Esito:** la tabella regge. I ritocchi sono 15 (sezione 3). Per mazza di tamburo, chiodino, spugnole e prugnolo molte voci restano *stima da calibrare* (sezione 6).
- **Sicurezza:** questa tabella serve al modello, non a riconoscere i funghi. Ogni raccolto va fatto controllare al Centro micologico dell'ASL.

Etichette: **U** = dato ufficiale · **L** = letteratura scientifica o tecnica (qui soprattutto la guida regionale) · **O** = osservato nei ritrovamenti pubblici (pochi record, concentrati dove passa più gente) · **M** = manuali e notiziari di micologia · **S** = stima da calibrare.

## 1. Porcino: valori di partenza del modello

| Voce del prompt | Verifica | Etichetta |
| --- | --- | --- |
| Temperatura media sugli ultimi 20 giorni, ottimo 13–13,7 °C | Confermato: circa 13 °C nel testo, 13,7 °C in figura | L (preprint, non revisionato) |
| Quasi nessun fungo con medie di 5–10 °C | Confermato | L |
| Pioggia cumulata su 26 giorni, senza tetto | Confermato: la produzione cresce in modo lineare con la pioggia, nessun limite superiore trovato | L |
| Nascite con 2–4 mm al giorno | Confermato | L |
| Stagione dal 5 agosto al 21 novembre | Confermato | L |
| Nessun fungo nell'85,8% dei giorni | Confermato | L |
| Un solo sito, nord Europa | Confermato: faggeta vicino a Bielefeld (Germania), 2015–2024, da 15 a 29 punti; da 4 funghi (2016) a 354 (2020) in un anno | L |

Tre fonti italiane aggiungono:

- **Piemonte** (Regione Piemonte e IPLA, *Funghi & tartufi*): i porcini nascono quando la pioggia bagna il suolo in profondità e la temperatura del suolo cala di colpo dopo un periodo caldo; può bastare una grandinata estiva. Servono almeno 30 mm, meglio 50–60 nei boschi chiusi, dopo un periodo asciutto. Piogge troppo lunghe, con suolo fradicio per settimane, frenano la nascita. Nello stesso punto i porcini tornano dopo circa un mese. Per i porcini estivi conta anche il freddo dell'inverno precedente e l'andamento dell'anno prima. Da provare in Fase 3: un predittore «calo termico del suolo», una soglia di pioggia più bassa di 80 mm e un «freno da troppa pioggia». **L**
- **Toscana, Monte Amiata** (Salerni, Paoli, Perini 2023): in abetine di abete bianco, i picchi improvvisi di temperatura massima frenano la produzione di *B. edulis* nei 21 giorni seguenti, dove il bosco non è diradato. Conferma l'idea di un «freno da caldo». **L**
- **Liguria, Sassello (SV)** (Ambrosio, Pietras, Feest 2024): *B. edulis* in castagneto (420–450 m) e faggeta (circa 1.000 m); *B. aereus* in cerreta (340–380 m); *B. reticulatus* in cerreta e faggeta. A grande scala il fattore che pesa di più è la pioggia del mese più secco (50,8%). Suggerisce di provare un predittore «siccità estiva» in Fase 3. **L**

## 2. Quota e mesi: prompt a confronto con i ritrovamenti pubblici

Calcolato da `pipeline/controlla_specie.py` sui record che cadono in Piemonte o in Liguria (risultato in `dati-grezzi/ritrovamenti_gbif/confronto_tabella.json`). Quota: intervallo fra il 5° e il 95° percentile. Mesi: quelli con almeno il 5% dei record.

| Specie | Record (in regione) | Quota nel prompt | Quota osservata | Mesi nel prompt | Mesi osservati (picco) |
| --- | --- | --- | --- | --- | --- |
| Porcino (*B. edulis*) | 178 (84) | 400–2.000 m | 320–1.760 m | giu–nov | ago–ott (set) |
| Porcino nero (*B. aereus*) | 26 (16) | 0–1.000 m | 150–760 m | lug–ott | ago–ott (ott) |
| Porcino estivo (*B. reticulatus*) | 87 (57) | 0–1.300 m | 310–1.220 m | mag–set | mag–ott, agosto scarso (set) |
| Porcino rosso (*B. pinophilus*) | 20 (12) | 500–2.000 m | 680–1.630 m | giu–ott | giu–nov (set) |
| Gallinaccio | 106 (42) | 0–1.800 m | 120–1.330 m | giu–ott | lug–nov (ott) |
| Ovolo buono | 63 (44) | 0–1.000 m | 110–870 m | lug–ott | ago–nov (set) |
| Mazza di tamburo | 591 (353) | 0–1.800 m | 160–1.780 m | lug–ott | ago–nov (ott) |
| Chiodino (genere *Armillaria*) | 212 (113) | 0–1.500 m | 100–890 m | set–nov | ott–nov (ott) |
| Trombetta dei morti | 67 (48) | 200–1.500 m | 150–1.490 m | ago–nov | ago–nov (ott) |
| Steccherino dorato | 69 (22) | 0–1.800 m | 40–1.060 m | ago–dic | ott–nov (ott) |
| Sanguinello: *L. deliciosus* | 17 (11) | 0–1.800 m | 220–1.340 m | set–nov | ott–nov, e gennaio (ott) |
| Sanguinello: *L. salmonicolor* | 21 (15) | 0–1.800 m | 1.530–1.640 m | set–nov | sparsi fra maggio e ottobre |
| Sanguinello: *L. deterrimus* | 6 (3) | 0–1.800 m | troppo pochi | set–nov | troppo pochi |
| Spugnole (genere *Morchella*) | 118 (72) | 0–1.500 m | 140–1.770 m | mar–mag | mar–giu (apr) |
| Prugnolo | 13 (9) | 200–1.500 m | 290–1.700 m | apr–giu | apr–giu (apr) |
| Dormiente | 20 (13) | 600–1.600 m | 430–1.620 m | feb–mag | gen–apr (mar) |

## 3. Ritocchi rispetto al prompt

1. **Porcino (*B. edulis*):** quota minima da 400 a **300 m**. In Piemonte cresce da 300 m al limite del bosco (**L**); i ritrovamenti partono da circa 320 m (**O**).
2. **Porcino nero:** quota da 0–1.000 a **200–1.000 m, fino a 1.400 m in faggeta**; mesi da lug–ott ad **ago–ott**, di rado novembre; tra gli ambienti entra la **faggeta**. **L**, **O**
3. **Porcino estivo:** quota da 0–1.300 a **200–1.000 m, fino a 1.600 m nelle estati calde**; mesi da mag–set a **mag–ott**: in collina da maggio, nelle valli alpine da giugno, ottimo luglio–settembre; tra gli ambienti entrano betuleti, corileti, peccete e pinete. **L**, **O**
4. **Porcino rosso:** quota da 500–2.000 a **400–1.400 m, fino a 1.800 m in pineta**; mesi da giu–ott a **mag–nov**: tarda primavera se fresca e umida, ottimo settembre–ottobre; tra gli alberi entrano abete bianco, castagno, faggio e betulla. **L**, **O**
5. **Gallinaccio:** quota fino a **2.000 m**, ma raro in collina e alle basse quote; mesi **mag–nov** in basso, **lug–set** nelle valli alpine. **L**, **O**
6. **Ovolo:** in Piemonte fino a 1.000 m, di rado 1.200 m; in **Liguria fino a 1.300 m** sui versanti a sud; mesi **lug–nov**, ottimo da fine settembre a fine ottobre, ma in Piemonte la stagione finisce a inizio ottobre; tra gli ambienti entrano leccete, macchia, ostrieti e faggete. **L**, **O**
7. **Mazza di tamburo:** mesi da lug–ott a **lug–nov**. **O**
8. **Trombetta dei morti:** tra gli ambienti entrano **castagneti e querceti di rovere**; vuole terreni argillosi, clima fresco e umido prolungato; annate molto irregolari. **L**
9. **Steccherino:** quota **100–1.800 m e oltre**; mesi da ago–dic a **giu–dic**, anche gennaio dove non gela; cresce in quasi tutti i boschi. **L**
10. **Sanguinello:** il gruppo comprende anche ***Lactarius sanguifluus***, che nella guida ha una scheda propria, e ***L. semisanguifluus***; quote: in Liguria dal litorale a oltre 1.000 m, in Piemonte fino a 1.600–1.700 m; la condizione chiave non è più «da definire»: serve un **calo netto di temperatura**. **L**, **M**, **O**
11. **Spugnole, quota e mesi:** da 0–1.500 m a **0–1.800 m**; da mar–mag a **mar–giu**. **O**
12. **Spugnole, condizioni:** nel prompt c'è «suolo oltre ~10 °C (oltre 14 °C a 10 cm); piogge >10 mm nei 30 giorni prima». Le fonti dicono:
    - le spore germinano solo quando il suolo supera circa 10 °C, e sopra i 15 °C la germinazione si blocca (Schmidt 1983); **L**
    - l'abbondanza cresce con gli *episodi* di pioggia oltre 10 mm nei 30 giorni prima, non con 10 mm in totale (Mihail e altri 2007); **L**
    - l'inizio arriva prima nelle primavere più calde (Mihail e altri 2007) e si prevede bene con il riscaldamento del suolo accumulato su 20 giorni (Mihail 2014). **L**
    - Il valore «14 °C a 10 cm» il prompt lo attribuisce alla tesi greca, che non sono riuscito a leggere: resta una nota non verificata, fuori dalla regola del modello. Nuova voce: **suolo fra circa 10 e 15 °C; episodi di pioggia oltre 10 mm nei 30 giorni prima**. Sono studi americani: da ricalibrare.
13. **Dormiente:** tra gli alberi entrano **castagno, pino silvestre e rovere**; quota minima da 600 a **450 m** (**O**, pochi record; in Liguria da 600 m, **L**); sopra i 1.500 m si trova anche a maggio. **L**, **O**
14. **Prugnolo:** quota massima da 1.500 a **1.700 m** (**O**, pochi record).
15. **Chiodino e spugnole:** precisate le regole di cottura (sezione 5), da riportare nella Guida dell'app.

## 4. Tabella aggiornata

| Specie | Alberi e ambiente | Quota | Mesi | Condizioni chiave | Sosia pericolosi e avvertenze |
| --- | --- | --- | --- | --- | --- |
| Porcino (*Boletus edulis*) | peccete, abetine, pinete di pino silvestre, faggete, castagneti, querceti di rovere e di roverella, boscaglie d'invasione (betuleto, corileto) (**L**); ambienti freschi senza ristagni, suolo acido (**L**) | 300–2.000 m (**L**, **O**) | giu–nov; ottimo da fine estate all'autunno (**L**, **O**) | T media 20 giorni circa 13 °C e pioggia su 26 giorni (**L**, Germania); pioggia che bagna in profondità, almeno 30 mm, dopo un periodo caldo e asciutto, con calo brusco della temperatura del suolo; freno con piogge troppo lunghe (**L**, Piemonte); freno dopo picchi di caldo (**L**, Toscana) | *Tylopilus felleus*, amarissimo (**M**); *Rubroboletus satanas*, tossico (**U**) |
| Porcino nero (*B. aereus*) | castagneti, querceti di rovere e di roverella, faggete (**L**); cerrete in Liguria (**L**); luoghi caldi, soleggiati, ben drenati (**L**) | 200–1.000 m, fino a 1.400 m in faggeta (**L**, **O**) | ago–ott, ottimo set–ott, di rado nov (**L**, **O**) | termofilo; stesse esigenze di pioggia e di calo termico del porcino; annate buone dopo un anno precedente caldo e con suolo umido (**L**) | come sopra |
| Porcino estivo (*B. reticulatus* = *B. aestivalis*) | castagneti, querceti di rovere e di roverella, faggete, betuleti e corileti d'invasione, peccete, pinete (**L**); versanti caldi e soleggiati (**L**) | 200–1.000 m, fino a 1.600 m nelle estati calde (**L**, **O**) | mag–ott: in collina da maggio, nelle valli alpine da giugno; ottimo lug–set (**L**, **O**) | il primo porcino della stagione; conta il freddo dell'inverno precedente (**L**) | come sopra |
| Porcino rosso (*B. pinophilus*) | peccete, pinete di pino silvestre, castagneti, faggete, betuleti misti; anche abete bianco (**L**); in Liguria soprattutto castagno e faggio (**L**) | 400–1.400 m, fino a 1.800 m in pineta (**L**, **O**) | mag–nov: tarda primavera se fresca e umida, ottimo set–ott (**L**, **O**) | vuole umidità e temperature non alte: versanti al sole a inizio e fine stagione, versanti umidi a fine agosto; suoli acidi (**L**) | come sopra |
| Gallinaccio (*Cantharellus cibarius*) | peccete, abetine, pinete di pino silvestre, faggete, castagneti, querceti di rovere (**L**); suoli acidi con lettiera e humus (**L**) | fino a 2.000 m; raro in collina e alle basse quote (**L**, **O**) | mag–nov in basso, lug–set nelle valli alpine (**L**, **O**) | temperature abbastanza alte e piogge intense; teme siccità e vento; crescita lenta, dura oltre 15 giorni (**L**) | *Omphalotus olearius*, tossico, su legno e con lamelle vere (**L**); *Hygrophoropsis aurantiaca* (**M**) |
| Ovolo buono (*Amanita caesarea*) | castagneti, querceti di farnia, rovere e roverella, ostrieti, faggete; leccete e macchia mediterranea in Liguria (**L**); versanti caldi e asciutti, suoli per lo più acidi (**L**) | Piemonte fino a 1.000 m, di rado 1.200 m; Liguria dal mare a 1.300 m sui versanti a sud (**L**, **O**) | lug–nov, ottimo da fine settembre a fine ottobre; in Piemonte finisce a inizio ottobre (**L**, **O**) | termofilo (**L**); dopo temporali estivi (**S**) | raccolta vietata a ovolo chiuso (**U**); a ovolo chiuso si confonde con *A. phalloides*, mortale (**U**); *A. muscaria*, tossica (**M**) |
| Mazza di tamburo (*Macrolepiota procera*) | radure, margini, prati (**S**) | 0–1.800 m (**O**) | lug–nov (**O**) | caldo-umido (**S**) | piccole *Lepiota*, mortali (**U**); *Chlorophyllum*, tossici: *C. molybdites* (**U**) e *Macrolepiota venenata* (**L**) |
| Chiodino (*Armillaria mellea* s.l.) | ceppaie e radici di latifoglie e conifere (**S**) | 0–1.500 m (**O**) | set–nov, picco ott (**O**) | dopo le piogge d'autunno e i primi freddi (**S**) | tossico se poco cotto: sbollentare 5 minuti, buttare l'acqua, poi cuocere almeno 15–20 minuti; solo esemplari giovani, mai dopo le gelate (**U**); *Galerina marginata*, mortale; *Hypholoma fasciculare*, tossico (**M**) |
| Trombetta dei morti (*Craterellus cornucopioides*) | faggete, castagneti, querceti di rovere (**L**); terreni argillosi e umidi (**L**) | 200–1.500 m (**O**) | ago–nov: dalla tarda estate a tutto l'autunno (**L**, **O**) | piogge regolari e temperature basse e altalenanti; clima fresco e umido prolungato; annate molto irregolari (**L**) | pochi: verifica comunque |
| Steccherino dorato (*Hydnum repandum*) | leccete, ostrieti, castagneti, querceti di rovere e di roverella, faggete, betuleti e corileti d'invasione, abetine, peccete, pinete di pino silvestre (**L**) | 100–1.800 m e oltre (**L**, **O**) | giu–dic, anche gennaio dove non gela (**L**; **O**: ott–nov) | regge il freddo e la poca umidità; crescita lenta (**L**) | pochi: verifica comunque |
| Sanguinello (*Lactarius deliciosus* e affini) | pinete di pino silvestre, marittimo e d'Aleppo, rimboschimenti di pino nero e strobo: *L. deliciosus* e *L. sanguifluus* (**L**); *L. semisanguifluus* sotto pini (**M**); abete rosso: *L. deterrimus*; abete bianco: *L. salmonicolor* (**L**, **M**) | Liguria dal litorale a oltre 1.000 m; Piemonte fino a 1.600–1.700 m (**L**, **O**) | dalla primavera all'inizio dell'inverno, tipico del tardo autunno; in Liguria anche negli inverni miti (**L**, **O**) | serve un calo netto di temperatura; in montagna può bastare un'ondata fresca estiva (**L**) | lattari a latice bianco, tossici o non commestibili: *L. torminosus* sotto betulla, *L. zonarius* sotto latifoglie (**L**, **M**) |
| Spugnole (*Morchella* spp.) | lungo i fiumi con pioppi, salici e olmi; frassino in collina e montagna; frutteti e giardini; terreni sciolti e umidi (**M**); aree bruciate (**S**) | 0–1.800 m (**O**) | mar–giu (**O**): aprile in basso, maggio in quota (**M**) | suolo fra circa 10 e 15 °C; episodi di pioggia oltre 10 mm nei 30 giorni prima (**L**, studi non italiani) | crude o poco cotte sono tossiche: cuocere almeno 20 minuti (**L**); *Gyromitra esculenta*, può essere mortale (**M**) |
| Prugnolo (*Calocybe gambosa*) | prati e margini presso rosacee spinose, soprattutto prugnolo (**L**, Liguria) | 200–1.700 m (**O**, pochi) | apr–giu (**O**) | piogge primaverili, clima mite (**S**) | *Inocybe erubescens*, molto tossica, stessi ambienti e stessa stagione; *Entoloma sinuatum*, tossico (**M**) |
| Dormiente (*Hygrophorus marzuolus*) | abetine, faggete miste, castagneti misti; anche abete rosso, pino silvestre e rovere (**L**); ama l'umidità: fossi, avvallamenti, vicino ai torrenti (**L**) | 450–1.600 m; in Liguria da 600 m (**L**, **O**) | feb–mag; sopra i 1.500 m anche a maggio (**L**, **O**) | allo scioglimento della neve; semi-interrato sotto foglie e aghi (**L**, **M**) | *H. camarophyllus*, che però è autunnale (**L**) |

## 5. Sicurezza e regole: cosa è confermato da fonti ufficiali

- **Controllo:** i funghi raccolti vanno fatti controllare dal micologo dell'ASL; il servizio è gratuito per i privati (opuscolo «I funghi: guida alla prevenzione delle intossicazioni», Centro Antiveleni di Milano con il Ministero della Salute). **U**
- **Bambini e donne in gravidanza:** l'opuscolo dice di non dare loro funghi. **U**
- **Chiodino:** va sbollentato e l'acqua buttata, poi cotto almeno 15–20 minuti; non va raccolto dopo le gelate (ASL Biella; opuscolo del Ministero). **U**
- **Spugnole:** vanno sempre cotte almeno 20 minuti; crude o poco cotte possono dare disturbi neurologici e intestinali (Tox Info Suisse 2026). **L**
- **Ovolo chiuso:** la legge 352/1993, art. 4 comma 2, impone alle regioni di vietarne la raccolta; il Piemonte lo vieta nella sua legge regionale. **U**
- **Liguria, quantità:** al massimo 1 kg di ovoli per persona; per le altre specie 3 kg, chiodini esclusi (scheda ISPRA sulla legge regionale 17/2014). Da riprendere nella sezione Regole dell'app. **U**
- **Piccole lepiote:** possono dare la sindrome falloidea, cioè quella mortale. **U**

## 6. Cosa resta da fare

- **Specie fuori dalla guida regionale:** mazza di tamburo, chiodino, spugnole e prugnolo non hanno una scheda. I loro ambienti restano in parte *stima*; mazza di tamburo e prugnolo crescono in prati e margini, quindi fuori dalla carta forestale: in Fase 2 serve un fattore «margine del bosco e prato».
- **Sosia segnati M:** vanno confrontati con la *Guida ragionata alla commestibilità dei funghi* della Regione Piemonte: https://www.regione.piemonte.it/web/sites/default/files/media/documenti/2021-09/guida_commestibilita_funghi_isbn_979-12-200-9297-5.pdf (copia di consultazione, non pubblicata). Serve prima della Fase 4, non adesso.
- **Condizioni chiave:** quelle della guida sono descrizioni, non numeri. Diventano numeri in Fase 3, con il meteo. Solo i porcini hanno già una base numerica.
- **Ritrovamenti pubblici:** sono pochi (da 6 a 591 per specie). Il diario dell'app, quando ci sarà, varrà più di questi.

## 7. Fonti usate nella verifica

- Regione Piemonte e IPLA, *Funghi & tartufi: risorse del bosco* (progetto Amycoforest), pagine 38–90: schede di *Boletus edulis*, *B. aestivalis*, *B. aereus*, *B. pinophilus*, *Amanita caesarea*, *Cantharellus cibarius*, *Craterellus cornucopioides*, *Hydnum repandum*, *Hygrophorus marzuolus*, *Lactarius deliciosus*, *L. sanguifluus*. PDF di consultazione (non pubblicati), da https://www.regione.piemonte.it/web/media/14353/download, https://www.regione.piemonte.it/web/media/14354/download e https://www.regione.piemonte.it/web/media/14355/download
- Brejon Lamartiniere, Hoffman (2026), *Predicting porcini*, preprint bioRxiv: https://www.biorxiv.org/content/10.64898/2025.12.12.693895.full.pdf
- Scuola Superiore Sant'Anna di Pisa, *La risorsa FUNGO in Alta Valle del Vara* (schede con nomi liguri, periodo e habitat): https://iris.santannapisa.it
- Salerni, Paoli, Perini (2023), Italian Journal of Mycology 52: 76–88: https://italianmycology.unibo.it/article/view/16464
- Ambrosio, Pietras, Feest (2024), Dendrobiology 91: 16–31: https://www.idpan.poznan.pl/images/stories/dendrobiology/vol91/denbio091002.pdf
- Mihail, Bruhn, Bonello (2007), Mycological Research 111: 339–346: https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_proquest_miscellaneous_20300882
- Mihail (2014), *Is it time for morels yet?*, McIlvainea 23: https://namyco.org/?p=1856
- Schmidt (1983), Mycologia: https://informahealthcare.com/doi/abs/10.1080/00275514.1983.12023762
- Assisi (a cura di), *I funghi: guida alla prevenzione delle intossicazioni*, Centro Antiveleni di Milano e Ministero della Salute: https://legacy.ats-brescia.it/documents/3432658/8053835/Opuscolo+FunghiLow.pdf/49303c7b-70f2-9dfa-f4b0-c8df1012bce7
- ASL Biella (2025), avviso «Non consumare i chiodini crudi»: https://aslbi.piemonte.it/wp-content/uploads/2025/08/Poster-NON-CONSUMARE-I-CHIODINI-CRUDI.pdf
- Tox Info Suisse (2026), scheda «Spugnole: una delizia non priva di rischi»: https://www.toxinfo.ch/spugnole_una_delizia_non_priva_di_rischi
- Rivista di Agraria (2020), «Sentinelle primaverili: le morchelle»: https://www.rivistadiagraria.org/articoli/anno-2020/sentinelle-primaverili-le-morchelle/
- Associazione Micologica ed Ecologica Romana, *Rivista Micologica Romana*, articoli sui lattari a latice colorato e sugli igrofori: https://www.ameronlus.it
- Gruppo micologico di Bologna, notiziario *Occhio al Fungo* (luglio 2006, luglio 2008, gennaio 2011)
- Legge 23 agosto 1993, n. 352, art. 4: https://faolex.fao.org/docs/pdf/ita22525.pdf
- ISPRA, scheda sulla raccolta dei funghi in Liguria: https://development.isprambiente.gov.it/files/biodiversita/raccolta-dei-funghi-epigei-regione-liguria.pdf
- Ritrovamenti GBIF: vedi `docs/SOURCES.md`

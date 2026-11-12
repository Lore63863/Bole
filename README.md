# Bolé

Dove e quando, in Piemonte e Liguria, è più probabile che nascano i funghi, e perché.
È un'app per telefono (iPhone e Android) che si apre dal browser e si installa sulla schermata
Home. Niente account, niente pubblicità, niente statistiche d'uso. Uso personale, non commerciale.

> **Sicurezza.** Bolé dà probabilità relative, non certezze. Non mangiare mai un fungo
> riconosciuto con un'app: fallo controllare al Centro di controllo micologico dell'ASL (gratuito).

- **App:** https://lore63863.github.io/Bole/ (link non in elenco: i motori di ricerca non lo indicizzano)
- **Come installarla, usarla e ripararla:** [`app/README.md`](app/README.md)

## Come funziona

- **Habitat** (fisso): carte forestali, quota, esposizione, suolo, a 25 m, per 14 specie → [`docs/MODEL.md`](docs/MODEL.md)
- **Meteo** (ogni giorno): modello IFS dell'ECMWF, da 30 giorni fa a +14 → pioggia, temperature, freni (caldo, secco, gelo, neve)
- **Stagione**: curva per specie dai ritrovamenti pubblici 2017–2026
- **Indice** = habitat × meteo × stagione, in 5 classi relative alla stagione della specie, con l'affidabilità del giorno.
  Prova del modello: [`docs/VALIDATION.md`](docs/VALIDATION.md); specie e sosia: [`docs/SPECIE.md`](docs/SPECIE.md)

Il telefono scarica pochi file e fa i conti da sé, con le stesse formule del modello in Python
(architettura e prove: [`docs/APP.md`](docs/APP.md)).

## Che cosa si aggiorna da solo

| Lavoro (scheda **Actions**) | Quando | Che cosa fa |
| --- | --- | --- |
| **Pubblica il sito** | alle 7:43 e alle 19:43 (ora italiana d'inverno), quando cambia l'app, o a mano | scarica il meteo, prova le formule, costruisce l'app, aggiunge mappe e strati, pubblica |
| **Server del gruppo** | a mano la prima volta, poi quando cambia il server | pubblica il piccolo server per condividere i ritrovamenti (Cloudflare, gratuito) |

Per lanciarne uno a mano: scheda **Actions** → nome del lavoro → **Run workflow** → **Run workflow**.

## Cosa fare se si rompe

| Che cosa vedi | Che cosa fare |
| --- | --- |
| Nell'app «Dati vecchi» | scheda **Actions** → «Pubblica il sito»: se l'ultima riga ha la ✗ rossa, aprila e guarda il passo rosso; poi **Re-run jobs**. Se il meteo non arriva, il sito si ripubblica col meteo precedente |
| Una ✗ rossa nel passo «Meteo di oggi» | l'archivio del meteo non rispondeva: di solito si risolve da solo al giro dopo |
| Una ✗ rossa in «Prova delle formule e costruzione» | qualcosa nel codice dell'app non va: non si pubblica niente finché non si corregge (il sito resta com'era) |
| Una ✗ rossa in «Server del gruppo» | quasi sempre la chiave di Cloudflare scaduta o sbagliata: vedi [`condivisione/README.md`](condivisione/README.md) |
| GitHub manda un'email «Scheduled workflows disabled» | dopo 60 giorni senza modifiche al repository GitHub ferma i lavori a orario: scheda **Actions** → «Pubblica il sito» → **Enable workflow** |

## Cartelle

| Cartella | Che cosa c'è |
| --- | --- |
| `app/` | l'app (TypeScript, Vite, MapLibre) |
| `pipeline/` | gli script Python: habitat, meteo, taratura, file per l'app |
| `data/` | parametri tarati del modello e tabelle delle specie |
| `condivisione/` | il server del gruppo (Cloudflare Worker + database D1 in UE) |
| `docs/` | come è fatto il modello, la prova, le fonti dei dati, l'app |
| ramo `dati` | mappa di base e strati dell'app (circa 400 MB, file `.pmtiles`) |

## Dati e licenze

- Mappa: © OpenStreetMap contributors (ODbL), tessere Protomaps; caratteri Noto Sans (OFL)
- Boschi, quota e aree protette: Regione Piemonte e Regione Liguria (CC BY 4.0); Rete Natura 2000, MASE (CC BY 4.0)
- Uso del suolo: ESA WorldCover 2021 (CC BY 4.0); suolo: ISRIC SoilGrids (CC BY 4.0)
- Meteo: [Weather data by Open-Meteo.com](https://open-meteo.com/), modello IFS dell'ECMWF (CC BY 4.0)
- Ritrovamenti per la taratura: GBIF.org e iNaturalist (licenze CC indicate per ogni osservazione)

Elenco completo, con link e controlli: [`docs/SOURCES.md`](docs/SOURCES.md). Il codice di Bolé è
pubblico per poter avere il sito gratis su GitHub Pages; non è concesso con una licenza aperta.

## Privacy

Posizione, diario, preferite e mappe scaricate restano sul telefono. Solo se entri in un gruppo
e scegli di condividere un ritrovamento, ne escono specie, quantità, giorno e il quadrato di 1 km
che lo contiene, visibili agli altri dal giorno dopo. Dettagli: [`condivisione/README.md`](condivisione/README.md).

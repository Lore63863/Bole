# Bolé — l'app

Bolé dice dove e quando, in Piemonte e Liguria, è più probabile che nascano i funghi, e perché.
È una pagina web che si installa sull'iPhone come un'app (PWA): niente App Store, niente account,
niente pubblicità o statistiche. Posizione e diario restano sul telefono; se entri in un gruppo di
amici puoi condividere i ritrovamenti che scegli tu, solo come quadrato di 1 km e dal giorno dopo.

> **Sicurezza.** Bolé dà probabilità relative, non certezze. Non mangiare mai un fungo
> riconosciuto con un'app: fallo controllare al Centro di controllo micologico dell'ASL (gratuito).

## Installarla

Funziona su iPhone (Safari) e su Android (Chrome). Link: **https://lore63863.github.io/Bole/**

**iPhone**
1. Apri il link in **Safari**.
2. Tocca **Condividi** (il quadrato con la freccia), poi **Aggiungi alla schermata Home**.

**Android**
1. Apri il link in **Chrome**.
2. Tocca **Installa** nel riquadro in alto, oppure il menu **⋮** → **Installa app**
   (su alcuni telefoni: **Aggiungi a schermata Home**).

Da quel momento aprila **sempre dall'icona**: così funziona senza rete nelle aree scaricate
e il telefono non cancella i file salvati.

## Le funzioni

| Dove | Che cosa fa |
| --- | --- |
| Mappa | Indice per specie o per i 4 porcini insieme, da oggi a +13 giorni; legenda a 5 classi; righe = affidabilità bassa |
| Tocca la mappa | «Perché qui?»: bosco, quota, esposizione, pioggia, temperature, freni, grafico di 30 giorni passati e 14 futuri, avvisi, il tuo diario entro 1 km e le segnalazioni del gruppo |
| Tieni premuto sulla mappa | Nuova voce del diario in quel punto |
| I tuoi punti | Sulla mappa: ritrovamenti (cerchio verde col fungo), uscite a vuoto (cerchio bianco), zone preferite (stella), auto di oggi; toccali per la loro scheda |
| Vicino | Le 10 zone migliori entro 15, 30, 60, 120 km o in tutta l'area, con «Naviga» verso Mappe o Google Maps |
| Diario | Ritrovamenti e uscite a vuoto, con foto facoltativa; posizione GPS con la sua precisione (± m) o punto scelto col mirino («Sposta il punto»); con ogni voce si salva la classe della mappa di quel giorno; statistiche per specie, mese e classe; esporta in GPX, CSV, GeoJSON; copia di sicurezza su file |
| Regole | Regole di raccolta della regione in cui sei, aree protette nel punto, caccia, peste suina |
| Guida | Sicurezza, Centri micologici ASL più vicini, le 14 specie con sosia pericolosi |
| Strumenti (tasto a strati) | Zone preferite, ritrovamenti con il gruppo, mappe senza rete, «In bosco» (bussola, torna all'auto, tramonto), stato dei dati, livelli |
| Ritrovamenti con il gruppo | Crea un gruppo o entra con un codice di 12 caratteri; condividi i ritrovamenti voce per voce; vedi quelli degli altri come quadrati viola di 1 km. Si accende in Fase 5 col server (cartella `condivisione/`) |

## Come si aggiorna

| Che cosa | Come | Quanto spesso |
| --- | --- | --- |
| Meteo e previsioni | `pipeline/previsione.py` scrive `public/dati/meteo/` (in Fase 5 lo fa GitHub Actions ogni mattina) | ogni giorno |
| Regole e Guida | modifica `public/dati/regole.json` e `public/dati/guida.json` (testo semplice; ogni voce ha le sue fonti) e cambia la data «aggiornato» | a inizio stagione o quando cambia una legge |
| Modello (soglie, stagioni) | `pipeline/calibra.py` → `data/modello.json`, poi copialo in `public/dati/modello.json` e rifai `tests/parita/casi.json` | quando aggiungi ritrovamenti |
| Boschi e quota | `pipeline/app_strati.py` | quando escono carte forestali nuove |
| Mappa base | `pipeline/app_mappa_base.sh` | una o due volte l'anno |
| Stima dei MB per le mappe senza rete | `pipeline/app_dimensioni.py` | dopo aver rifatto mappa base o strati |

## Cosa fare se si rompe

| Che cosa vedi | Perché succede | Che cosa fare |
| --- | --- | --- |
| In alto «Dati vecchi» | il meteo non si è aggiornato da più di 36 ore | apri l'app con la rete; se resta, controlla in GitHub la scheda Actions (Fase 5) |
| Mappa grigia senza colori | specie fuori stagione o giorno sfavorevole, oppure niente rete fuori da un'area scaricata | cambia giorno o specie; scarica l'area prima di partire |
| «Bolé non è riuscita a partire» | manca un file di dati o la rete è caduta al primo avvio | riapri con la rete; se resta, rifai `npm run build` e ripubblica |
| La posizione non arriva | permesso negato o Localizzazione spenta | Impostazioni → Privacy e sicurezza → Localizzazione accesa; poi Impostazioni → Safari → Posizione: «Chiedi» |
| La posizione non arriva (Android) | permesso negato o posizione spenta | Impostazioni → Posizione accesa; in Chrome tocca il lucchetto accanto all'indirizzo → Autorizzazioni → Posizione: consenti |
| La bussola non si accende | permesso negato | chiudi e riapri Bolé e tocca di nuovo «Accendi la bussola»; se iOS non lo chiede più, cancella i dati del sito (vedi «Disinstallarla», dopo aver salvato il diario) |
| Le aree scaricate sono sparite | il telefono ha liberato spazio | aprila sempre dall'icona e riscarica l'area |
| Dopo un aggiornamento qualcosa è strano | è rimasta in memoria la versione vecchia | chiudi l'app (scorri via) e riaprila |
| Una voce resta «In coda per il gruppo» | niente rete, o il server della condivisione è giù | parte da sola quando torna la rete; Strumenti → Ritrovamenti con il gruppo → «Invia ora» |
| «Non inviato: …» su una voce | il server l'ha rifiutata (per esempio data oltre 400 giorni fa, o fuori da Piemonte e Liguria) | leggi il motivo; la voce resta nel diario |
| «Codice sbagliato» entrando in un gruppo | una lettera scritta male (non ci sono 0, 1, I, L, O) | ricopia il codice dal messaggio |
| Il gruppo non si aggiorna | il server della condivisione non risponde | vedi `condivisione/README.md`, «Cosa fare se si rompe» |

## Disinstallarla

**Prima salva il diario** (Diario → Esporta o salva): togliendo l'app si cancellano anche diario, preferite e mappe scaricate.

- iPhone: tieni premuta l'icona → **Rimuovi app** → **Elimina dalla schermata Home**; poi Impostazioni → Safari →
  Avanzate → Dati dei siti web → cerca il sito dell'app → Elimina.
- Android: tieni premuta l'icona → **Disinstalla** (o trascinala su «Disinstalla»).

## Privacy

- Nessun account, nessuna statistica, nessuno script di terzi: anche i caratteri sono nell'app.
- Posizione, diario, preferite e aree scaricate restano sul telefono.
- Gruppo, solo se ci entri: di un ritrovamento che **scegli** di condividere escono specie, quantità,
  giorno e il quadrato di 1 km che lo contiene (griglia europea EEA). Mai la posizione dal vivo, il punto
  preciso, l'ora, le foto, le note o le uscite a vuoto. Gli altri lo vedono dal giorno dopo. Il server
  (Cloudflare, dati in UE) non salva il codice del gruppo né gli indirizzi IP; dettagli in `condivisione/README.md`.
- I file esportati dal diario (GPX, CSV, GeoJSON, copia) hanno i punti precisi: mandali solo a chi vuoi.
- «Naviga» apre Mappe o Google Maps passando solo il punto di arrivo.
- Il sito non si fa indicizzare dai motori di ricerca (`robots: noindex`).

## Per chi sviluppa

Serve Node 22. Nella cartella `app/`:

```
npm install
npm run build          # controllo dei tipi e pacchetto in dist/
npm test               # formule dell'app = modello Python (4.200 casi)
npm run preview        # app su http://127.0.0.1:4173
npm run prova:iphone   # schermate WebKit 390×844 (servono: npx playwright install webkit)
TELEFONO=android node tests/funzioni.mjs http://127.0.0.1:4173/ schermate-android   # lo stesso giro su Chrome, misura Pixel 7
npm run prova:senza-rete
npm run prova:gruppo   # due telefoni + server della condivisione in locale (vedi sotto)
```

`prova:gruppo` costruisce l'app con `VITE_CONDIVISIONE=http://127.0.0.1:8788` in `dist-prova/`, la serve
sulla porta 4173 e accende il server di `../condivisione` con `wrangler dev` (serve `npm install` anche là).
Controlla pressione lunga, mirino, condivisione, che cosa esce dal telefono, il giorno dopo, senza rete.

I file pesanti (`public/dati/mappa/*.pmtiles`, `public/dati/strati/*.pmtiles`) non stanno nel
codice: si producono con la pipeline (`dati-elaborati/app/`) e si copiano o collegano qui.

Struttura del codice (`src/`):

- `main.ts` avvio; `mappa/` mappa base e stile; `calcolo/` formule, lavoratore (Web Worker) e sole;
- `dati/` meteo del giorno, catalogo specie, luoghi, diario (IndexedDB), aree senza rete,
  condivisione col gruppo (`condivisione.ts`) e griglia europea di 1 km (`griglia.ts`);
- `mappa/punti.ts` i tuoi punti, i quadrati del gruppo, pressione lunga e mirino;
- `calcolo/istantanea.ts` la classe della mappa in un punto e in un giorno (salvata con ogni voce);
- `ui/` schermata, fogli (Perché qui?, Vicino, Diario, Regole, Guida, In bosco, Mappe senza rete, Gruppo).
- `config.ts` l'indirizzo del server della condivisione, scelto quando si costruisce l'app (vuoto = spenta).

Architettura, dati e limiti: `docs/APP.md`.

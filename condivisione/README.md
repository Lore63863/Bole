# Bolé — server della condivisione

Un piccolo server gratuito che fa vedere ai membri di un gruppo di amici i ritrovamenti che
ciascuno **sceglie** di condividere. Gira su Cloudflare Workers (piano gratuito, senza carta di
credito) con un database Cloudflare D1 salvato nell'Unione europea. Si accende nella Fase 5.

## Che cosa riceve e che cosa no

| Esce dal telefono (solo per i ritrovamenti che scegli) | Non esce mai |
| --- | --- |
| specie, quantità indicativa, giorno | posizione dal vivo, punto preciso, ora |
| il quadrato di 1 km della griglia europea (EEA, EPSG:3035) che contiene il punto | foto, note, uscite a vuoto |
| un codice casuale per toglierlo (qui se ne salva solo l'impronta) | nomi, account, identificativi del telefono |

- Vede i ritrovamenti solo chi ha il **codice del gruppo** (12 caratteri, l'ultimo di controllo).
  Nel database non c'è il codice ma un'impronta HMAC fatta con un segreto del server (`PEPE`).
- Un ritrovamento diventa visibile **dal giorno dopo** l'invio e dopo il giorno del ritrovamento
  (ora italiana): nessuno può sapere dove sei adesso.
- L'indirizzo IP passa da Cloudflare (serve a far arrivare la richiesta e al limite anti-abusi),
  ma questo codice non lo salva e il registro delle richieste è spento (`observability`).
- Dopo circa 3 anni (1.100 giorni) un ritrovamento si cancella da solo.
- In un gruppo piccolo gli altri possono intuire chi ha condiviso che cosa: è scritto anche nell'app.

## File

| File | Che cosa fa |
| --- | --- |
| `src/index.ts` | il server: 4 indirizzi (`/v1/stato`, `GET`/`POST /v1/ritrovamenti`, `DELETE /v1/ritrovamenti/<id>`) |
| `src/regole.ts` | specie ammesse, codici di gruppo, date, quadrati di Piemonte e Liguria, limiti |
| `schema.sql` | la tabella del database (una riga per ritrovamento condiviso) |
| `wrangler.toml` | impostazioni per Cloudflare (nome, database, limite di 60 richieste al minuto per indirizzo) |
| `prove/prova.mjs` | 36 controlli in locale: chi vede che cosa, che cosa si salva, limiti |

Limiti scelti: al massimo 200 ritrovamenti nuovi al giorno per gruppo e 5.000 in tutto; data fino a
400 giorni fa; richiesta di al massimo 2 kB; solo i 5 campi previsti (un campo in più, per esempio
`lat`, fa rifiutare la richiesta).

## Prove in locale (nessun account serve)

```
cd condivisione
npm install
npm run controlla     # controllo dei tipi
npm run prova         # accende il server in locale e fa i 36 controlli
```

Per la prova con l'app e due telefoni: in `app/`, `npm run prova:gruppo`.

## Come si accende

Costo: zero. Sul piano gratuito, se un limite giornaliero si superasse, le richieste in più
falliscono fino al giorno dopo: non arrivano addebiti.

**Una volta sola, su Cloudflare (circa 10 minuti):**

1. Crea un account gratuito su dash.cloudflare.com (email e password, niente carta) e attiva la
   verifica in due passaggi (profilo → *Authentication*). Meglio un account nuovo, usato solo per Bolé.
2. Profilo → **API Tokens** → **Create Token** → modello **Edit Cloudflare Workers** → *Use template*.
   In *Permissions* aggiungi una riga: **Account · D1 · Edit**. *Account Resources*: il tuo account.
   Poi *Continue to summary* → **Create Token** e copia la chiave (si vede una volta sola).
3. Copia anche l'**Account ID** (pagina *Workers & Pages*, a destra; oppure nell'indirizzo della dashboard).

**Su GitHub:**

4. Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   `CLOUDFLARE_API_TOKEN` con la chiave, poi `CLOUDFLARE_ACCOUNT_ID` con l'Account ID.
5. Scheda **Actions** → **Server del gruppo** → **Run workflow**.

Il lavoro fa da solo il resto: sottodominio neutro `bole-funghi` su `workers.dev` (se Cloudflare ne ha
già creato uno da solo, spesso con il nome dell'account, lo sostituisce; un indirizzo che non inizi con
`bole-` non viene mai scritto nell'app), database D1 **in UE**
(`--jurisdiction eu`, non si può cambiare dopo), tabella, segreto `PEPE` casuale (non lo vede nessuno:
se si cambiasse, i gruppi esistenti non ritroverebbero più i loro ritrovamenti), `ORIGINI` = solo
l'indirizzo dell'app, pubblicazione del server. Alla fine scrive l'indirizzo del server in
`app/.env.production` e fa ripartire «Pubblica il sito»: da lì il gruppo è acceso nell'app.

A mano, dal computer, gli stessi passi sono: `npx wrangler d1 create bole-condivisione --jurisdiction eu`,
`npx wrangler d1 execute bole-condivisione --remote --file schema.sql`, `npx wrangler deploy`,
`npx wrangler secret put PEPE`.

## Come si aggiorna

- Codice del server: si modifica `src/`, si rifà `npm run prova`, poi si salva su GitHub: «Server del gruppo» riparte da solo.
- Se cambiano le specie dell'app, va aggiornato anche `SPECIE` in `src/regole.ts`.
- Se cambia quello che l'app manda (funzione `pacchetto()` in `app/src/dati/condivisione.ts`),
  va cambiato anche il controllo dei campi in `src/index.ts`.

## Cosa fare se si rompe

| Che cosa vedi | Perché succede | Che cosa fare |
| --- | --- | --- |
| Nell'app le voci restano «In coda» | niente rete, o server spento | prova `https://<indirizzo>/v1/stato` in Safari: deve dire `"ok":true` |
| `/v1/stato` dice «server non configurato» | manca il segreto `PEPE` | `npx wrangler secret put PEPE` |
| Errore 429 «troppe richieste» | più di 60 richieste al minuto dallo stesso indirizzo, o oltre 200 ritrovamenti in un giorno per un gruppo | aspettare; se serve, alzare i limiti in `wrangler.toml` o `src/regole.ts` |
| Errore 503 «server pieno per oggi» | oltre 5.000 ritrovamenti nuovi in un giorno in tutto | aspettare domani |
| «Server del gruppo» si ferma con «altri Worker» | l'account Cloudflare ha altri Worker e il sottodominio `workers.dev` non è neutro | Cloudflare → *Workers & Pages* → a destra *Subdomain* → *Change*: un nome che inizi con `bole-`, poi rilancia «Server del gruppo» |
| Errori del database | limiti gratuiti di D1 superati (5 milioni di righe lette o 100.000 scritte al giorno) | aspettare la mezzanotte UTC |
| Un gruppo riceve dati falsi | qualcuno ha il codice | create un gruppo nuovo e date il codice solo a chi volete |

Per cancellare a mano un ritrovamento o un gruppo intero: dashboard di Cloudflare → Storage &
databases → D1 → `bole-condivisione` → Console, per esempio
`DELETE FROM ritrovamenti WHERE id = '...'`.

## Licenza e termini

Codice di Bolé, uso personale e non commerciale. Cloudflare Workers e D1 alle condizioni del piano
gratuito di Cloudflare.

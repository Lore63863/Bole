/**
 * Bolé — condivisione dei ritrovamenti fra amici.
 * Un piccolo server gratuito (Cloudflare Worker) con un database (Cloudflare D1, salvato in UE).
 *
 * Che cosa riceve, per ogni ritrovamento che una persona sceglie di condividere:
 *   - il quadrato di 1 km della griglia europea (mai il punto preciso: lo calcola il telefono);
 *   - la specie, la quantità indicativa e il giorno (mai l'ora);
 *   - un codice segreto casuale che serve solo a toglierlo (qui se ne salva l'impronta SHA-256).
 * Che cosa NON riceve e non salva: posizione dal vivo, punto preciso, ora, foto, note, uscite
 * a vuoto, nomi, account, identificativi del telefono. L'indirizzo IP passa per Cloudflare
 * (serve a far arrivare la richiesta e al limite anti-abusi) ma questo codice non lo salva.
 *
 * Chi vede che cosa: solo chi conosce il codice del gruppo (12 caratteri, l'ultimo di controllo).
 * Il database non contiene il codice ma un'impronta HMAC con un segreto del server (PEPE):
 * anche chi leggesse il database non potrebbe ricavare i codici né usarli.
 * Un ritrovamento diventa visibile agli altri solo dal giorno dopo l'invio e dopo il giorno del
 * ritrovamento (ora italiana): nessuno può sapere dove sei adesso.
 *
 * Indirizzi:
 *   GET    /v1/stato                    controllo che il server risponda
 *   GET    /v1/ritrovamenti?dal=AAAA-MM-GG   i ritrovamenti visibili del gruppo (intestazione X-Bole-Gruppo)
 *   POST   /v1/ritrovamenti             nuovo ritrovamento (intestazione X-Bole-Gruppo, corpo JSON)
 *   DELETE /v1/ritrovamenti/<id>        toglie un ritrovamento (intestazione X-Bole-Token)
 */

import { LIMITI, QUANTITA, SPECIE, cellaValida, codiceValido, dataValida, impronta, improntaGruppo, oggiInItalia, spostaGiorni } from "./regole";

export interface Env {
  DB: D1Database;
  /** segreto del server per le impronte dei codici di gruppo (wrangler secret put PEPE) */
  PEPE?: string;
  /** indirizzi dell'app ammessi, separati da virgole (es. https://nome.github.io) */
  ORIGINI?: string;
  /** limite di richieste per minuto (facoltativo: se manca il controllo si salta) */
  LIMITE?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

// --- risposte -----------------------------------------------------------------------------------

function intestazioniCors(richiesta: Request, env: Env): Record<string, string> {
  const origine = richiesta.headers.get("Origin") ?? "";
  const ammesse = (env.ORIGINI ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origine || !ammesse.includes(origine)) return {};
  return {
    "Access-Control-Allow-Origin": origine,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Bole-Gruppo, X-Bole-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function risposta(corpo: unknown, stato: number, cors: Record<string, string>): Response {
  return new Response(corpo === null ? null : JSON.stringify(corpo), {
    status: stato,
    headers: {
      ...(corpo === null ? {} : { "Content-Type": "application/json; charset=utf-8" }),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...cors,
    },
  });
}

const errore = (testo: string, stato: number, cors: Record<string, string>) => risposta({ errore: testo }, stato, cors);

// --- il server ----------------------------------------------------------------------------------

export default {
  async fetch(richiesta: Request, env: Env): Promise<Response> {
    const cors = intestazioniCors(richiesta, env);
    const url = new URL(richiesta.url);

    if (richiesta.method === "OPTIONS") return new Response(null, { status: Object.keys(cors).length ? 204 : 403, headers: cors });
    if (!env.PEPE) return errore("server non configurato", 500, cors); // meglio fermarsi che salvare male

    // limite anti-abusi per indirizzo: il conteggio lo tiene Cloudflare in memoria, qui non si salva nulla
    if (env.LIMITE) {
      const { success } = await env.LIMITE.limit({ key: richiesta.headers.get("CF-Connecting-IP") ?? "sconosciuto" });
      if (!success) return errore("troppe richieste, riprova fra un minuto", 429, cors);
    }

    const oggi = oggiInItalia();

    if (url.pathname === "/v1/stato" && richiesta.method === "GET") return risposta({ ok: true, versione: 1, oggi }, 200, cors);

    if (url.pathname === "/v1/ritrovamenti" && (richiesta.method === "GET" || richiesta.method === "POST")) {
      const codice = richiesta.headers.get("X-Bole-Gruppo");
      if (!codiceValido(codice)) return errore("codice di gruppo non valido", 400, cors);
      const gruppo = await improntaGruppo(env.PEPE, codice);

      if (richiesta.method === "GET") {
        const minimo = spostaGiorni(oggi, -LIMITI.conserva);
        const chiesto = url.searchParams.get("dal");
        const dal = dataValida(chiesto) && chiesto > minimo ? chiesto : spostaGiorni(oggi, -LIMITI.passato);
        // visibili solo dal giorno dopo il ritrovamento e dal giorno dopo l'invio
        const { results } = await env.DB.prepare(
          "SELECT id, cella, specie, quantita, data FROM ritrovamenti WHERE gruppo = ?1 AND data >= ?2 AND data < ?3 AND creato_giorno < ?3 ORDER BY data DESC LIMIT 5000",
        ).bind(gruppo, dal, oggi).all();
        return risposta({ oggi, ritrovamenti: results }, 200, cors);
      }

      // POST: un ritrovamento nuovo
      const testo = await richiesta.text();
      if (testo.length > LIMITI.corpo) return errore("richiesta troppo grande", 413, cors);
      let r: Record<string, unknown>;
      try {
        r = JSON.parse(testo);
      } catch {
        return errore("richiesta non leggibile", 400, cors);
      }
      const chiavi = Object.keys(r ?? {}).sort().join(",");
      if (chiavi !== "cella,data,quantita,specie,token") return errore("campi non ammessi", 400, cors); // niente altro, per scelta
      if (!cellaValida(r.cella)) return errore("quadrato non valido o fuori da Piemonte e Liguria", 400, cors);
      if (typeof r.specie !== "string" || !(SPECIE as readonly string[]).includes(r.specie)) return errore("specie non valida", 400, cors);
      if (r.quantita !== null && !(typeof r.quantita === "string" && QUANTITA.includes(r.quantita))) return errore("quantità non valida", 400, cors);
      if (!dataValida(r.data) || r.data > spostaGiorni(oggi, 1) || r.data < spostaGiorni(oggi, -LIMITI.passato)) return errore("data non valida", 400, cors);
      if (typeof r.token !== "string" || !/^[0-9a-f]{32}$/.test(r.token)) return errore("codice per toglierlo non valido", 400, cors);

      const [perGruppo, totale] = await env.DB.batch([
        env.DB.prepare("SELECT COUNT(*) AS n FROM ritrovamenti WHERE gruppo = ?1 AND creato_giorno = ?2").bind(gruppo, oggi),
        env.DB.prepare("SELECT COUNT(*) AS n FROM ritrovamenti WHERE creato_giorno = ?1").bind(oggi),
      ]);
      if (Number((perGruppo.results[0] as { n: number }).n) >= LIMITI.perGruppo) return errore("troppi ritrovamenti oggi per questo gruppo", 429, cors);
      if (Number((totale.results[0] as { n: number }).n) >= LIMITI.totale) return errore("server pieno per oggi, riprova domani", 503, cors);

      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("DELETE FROM ritrovamenti WHERE data < ?1").bind(spostaGiorni(oggi, -LIMITI.conserva)), // pulizia dei vecchi
        env.DB.prepare("INSERT INTO ritrovamenti (id, gruppo, cella, specie, quantita, data, creato_giorno, token) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
          .bind(id, gruppo, r.cella, r.specie, r.quantita, r.data, oggi, await impronta(r.token)),
      ]);
      const visibileDal = spostaGiorni(r.data > oggi ? r.data : oggi, 1);
      return risposta({ id, visibile_dal: visibileDal }, 201, cors);
    }

    const togli = /^\/v1\/ritrovamenti\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (togli && richiesta.method === "DELETE") {
      const token = richiesta.headers.get("X-Bole-Token") ?? "";
      if (!/^[0-9a-f]{32}$/.test(token)) return errore("codice per toglierlo non valido", 400, cors);
      const esito = await env.DB.prepare("DELETE FROM ritrovamenti WHERE id = ?1 AND token = ?2").bind(togli[1], await impronta(token)).run();
      return esito.meta.changes ? risposta(null, 204, cors) : errore("non trovato (forse già tolto)", 404, cors);
    }

    return errore("indirizzo sconosciuto", 404, cors);
  },
} satisfies ExportedHandler<Env>;

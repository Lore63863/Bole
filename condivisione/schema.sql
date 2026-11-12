-- Bolé — database della condivisione (Cloudflare D1, giurisdizione UE).
-- Una riga per ritrovamento condiviso. Niente nomi, niente indirizzi, niente ore, niente punti precisi.
CREATE TABLE IF NOT EXISTS ritrovamenti (
  id TEXT PRIMARY KEY,           -- casuale (UUID)
  gruppo TEXT NOT NULL,          -- impronta HMAC del codice del gruppo (il codice non si salva)
  cella TEXT NOT NULL,           -- quadrato di 1 km della griglia europea EPSG:3035, es. 1kmE4113N2358
  specie TEXT NOT NULL,          -- codice della specie (le 14 dell'app)
  quantita TEXT,                 -- pochi | abbastanza | tanti | NULL
  data TEXT NOT NULL,            -- giorno del ritrovamento, AAAA-MM-GG
  creato_giorno TEXT NOT NULL,   -- giorno dell'invio (ora italiana), AAAA-MM-GG: serve a mostrarlo solo dal giorno dopo
  token TEXT NOT NULL            -- impronta SHA-256 del codice per toglierlo (il codice resta sul telefono di chi l'ha inviato)
);
CREATE INDEX IF NOT EXISTS per_gruppo ON ritrovamenti (gruppo, data);
CREATE INDEX IF NOT EXISTS per_giorno ON ritrovamenti (creato_giorno);

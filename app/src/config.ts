/**
 * Impostazioni scelte quando si costruisce l'app (npm run build).
 *
 * VITE_CONDIVISIONE = indirizzo del server della condivisione (Cloudflare Worker), per esempio
 * https://bole-condivisione.nome.workers.dev. Si scrive nella Fase 5, quando il server è acceso.
 * Se è vuoto la condivisione è spenta: l'app non parla con nessun server oltre al suo.
 */
export const SERVER_CONDIVISIONE: string = (import.meta.env.VITE_CONDIVISIONE ?? "").replace(/\/+$/, "");

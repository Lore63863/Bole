import { defineConfig, loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Regole di sicurezza della pagina (Content-Security-Policy): la pagina può caricare solo i propri file
 * e parlare solo con sé stessa e col server del gruppo. Se un giorno entrasse un testo malevolo
 * (per esempio da un file importato), il browser non eseguirebbe script esterni né manderebbe dati altrove.
 * GitHub Pages non permette intestazioni proprie: per questo sta in un <meta>.
 */
function regoleSicurezza(mode: string): Plugin {
  const server = (loadEnv(mode, process.cwd()).VITE_CONDIVISIONE ?? "").replace(/\/+$/, "");
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // stili scritti dal codice (colori, altezze delle barre)
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${server ? ` ${new URL(server).origin}` : ""}`,
    "worker-src 'self' blob:", // la mappa usa lavoratori creati al volo
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
  return {
    name: "regole-sicurezza",
    transformIndexHtml: (html) => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
  };
}

// base: "./" perché su GitHub Pages l'app sta in una sottocartella (/nome-repo/).
export default defineConfig(({ mode }) => ({
  base: "./",
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
  build: { target: "es2022", sourcemap: false },
  plugins: [
    regoleSicurezza(mode),
    VitePWA({
      registerType: "autoUpdate", // una versione nuova si installa da sola alla prossima apertura
      injectRegister: "script-defer",
      manifest: {
        name: "Bolé – funghi in Piemonte e Liguria",
        short_name: "Bolé",
        description: "Dove e quando è più probabile che nascano i funghi, e perché. Uso personale, non commerciale.",
        lang: "it",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f3f5f1",
        theme_color: "#f3f5f1",
        icons: [
          { src: "icone/icona-192.png", sizes: "192x192", type: "image/png" },
          { src: "icone/icona-512.png", sizes: "512x512", type: "image/png" },
          { src: "icone/icona-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Si salvano sul telefono l'app, i caratteri della mappa, i confini, i nomi e i testi.
        // NON le tessere (.pmtiles, centinaia di MB): quelle si scaricano per aree (Strumenti → Mappe senza rete).
        globPatterns: ["**/*.{js,mjs,css,html,png,json,geojson,pbf,txt,md}"],
        globIgnores: ["**/*.pmtiles", "dati/meteo/**", "prova/**"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // il meteo del giorno: prima la rete, se manca l'ultima copia salvata
            urlPattern: ({ url }) => url.pathname.includes("/dati/meteo/"),
            handler: "NetworkFirst",
            options: { cacheName: "bole-meteo", networkTimeoutSeconds: 8, expiration: { maxEntries: 6 } },
          },
        ],
      },
    }),
  ],
}));

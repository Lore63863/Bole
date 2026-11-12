/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** indirizzo del server della condivisione (vuoto = condivisione spenta) */
  readonly VITE_CONDIVISIONE?: string;
}

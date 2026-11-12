/**
 * Le 14 specie: nome, nome scientifico, gruppo "porcini" e dove sta il loro habitat
 * nelle tessere (file habitat_a ... habitat_e, canale 0 = rosso, 1 = verde, 2 = blu).
 * L'ordine e i canali devono restare uguali a pipeline/app_strati.py (INSIEMI).
 */

export type InsiemeHabitat = "habitat_a" | "habitat_b" | "habitat_c" | "habitat_d" | "habitat_e";

export interface Specie {
  id: string;
  nome: string;
  scientifico: string;
  porcino: boolean;
  insieme: InsiemeHabitat;
  canale: 0 | 1 | 2;
}

export const SPECIE: readonly Specie[] = [
  { id: "porcino", nome: "Porcino", scientifico: "Boletus edulis", porcino: true, insieme: "habitat_a", canale: 0 },
  { id: "porcino_nero", nome: "Porcino nero", scientifico: "Boletus aereus", porcino: true, insieme: "habitat_a", canale: 1 },
  { id: "porcino_estivo", nome: "Porcino estivo", scientifico: "Boletus reticulatus", porcino: true, insieme: "habitat_a", canale: 2 },
  { id: "porcino_rosso", nome: "Porcino rosso", scientifico: "Boletus pinophilus", porcino: true, insieme: "habitat_b", canale: 0 },
  { id: "gallinaccio", nome: "Gallinaccio", scientifico: "Cantharellus cibarius", porcino: false, insieme: "habitat_b", canale: 1 },
  { id: "ovolo", nome: "Ovolo buono", scientifico: "Amanita caesarea", porcino: false, insieme: "habitat_b", canale: 2 },
  { id: "mazza_di_tamburo", nome: "Mazza di tamburo", scientifico: "Macrolepiota procera", porcino: false, insieme: "habitat_c", canale: 0 },
  { id: "chiodino", nome: "Chiodino", scientifico: "Armillaria mellea s.l.", porcino: false, insieme: "habitat_c", canale: 1 },
  { id: "trombetta", nome: "Trombetta dei morti", scientifico: "Craterellus cornucopioides", porcino: false, insieme: "habitat_c", canale: 2 },
  { id: "steccherino", nome: "Steccherino dorato", scientifico: "Hydnum repandum", porcino: false, insieme: "habitat_d", canale: 0 },
  { id: "sanguinello", nome: "Sanguinello", scientifico: "Lactarius deliciosus e affini", porcino: false, insieme: "habitat_d", canale: 1 },
  { id: "spugnole", nome: "Spugnole", scientifico: "Morchella spp.", porcino: false, insieme: "habitat_d", canale: 2 },
  { id: "prugnolo", nome: "Prugnolo", scientifico: "Calocybe gambosa", porcino: false, insieme: "habitat_e", canale: 0 },
  { id: "dormiente", nome: "Dormiente", scientifico: "Hygrophorus marzuolus", porcino: false, insieme: "habitat_e", canale: 1 },
];

/** "porcini" = i quattro porcini insieme (classe = la più alta delle quattro). */
export const GRUPPO_PORCINI = "porcini";

export function specieDi(scelta: string): Specie[] {
  return scelta === GRUPPO_PORCINI ? SPECIE.filter((s) => s.porcino) : SPECIE.filter((s) => s.id === scelta);
}

export function nomeScelta(scelta: string): string {
  return scelta === GRUPPO_PORCINI ? "Porcini" : (SPECIE.find((s) => s.id === scelta)?.nome ?? scelta);
}

/** Specie con meno di 20 ritrovamenti precisi: affidabilità un gradino più bassa (docs/MODEL.md, 2.7). */
export const MINIMO_RITROVAMENTI_PRECISI = 20;

/**
 * Коллекция животных, спарсенная с https://animal-park.by/galereya/
 * Обновить: node scripts/parse-animals.js > src/data/animalsFromSite.json
 */

import data from './animalsFromSite.json';

export interface SiteAnimal {
  id: string;
  name: string;
  url: string;
  slug: string;
}

export const animalsFromSite: SiteAnimal[] = data as SiteAnimal[];

/**
 * Коллекция животных, спарсенная с https://animal-park.by/galereya/
 * Та же проверенная подборка, которую использует мобильный путеводитель.
 */

import data from '../../public/demo/catalogue.json';

export interface SiteAnimal {
  id: string;
  name: string;
  url: string;
  slug: string;
}

export const animalsFromSite: SiteAnimal[] = data as SiteAnimal[];

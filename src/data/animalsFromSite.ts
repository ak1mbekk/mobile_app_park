/**
 * Коллекция животных, спарсенная с https://animal-park.by/galereya/
 * Та же проверенная подборка, которую использует мобильный путеводитель.
 */

export interface SiteAnimal {
  id: string;
  name: string;
  url: string;
  slug: string;
}

export async function loadAnimalsFromSite(signal: AbortSignal): Promise<SiteAnimal[]> {
  const response = await fetch(import.meta.env.BASE_URL + 'demo/catalogue.json', { signal });
  if (!response.ok) throw new Error('Не удалось загрузить каталог животных');
  return response.json();
}

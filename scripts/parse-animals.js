/**
 * Парсит коллекцию животных с https://animal-park.by/galereya/
 * Запуск: node scripts/parse-animals.js
 * Выводит JSON в stdout.
 */

const url = 'https://animal-park.by/galereya/';

async function main() {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AnimalParkParser/1.0)' },
  });
  const html = await res.text();

  const re = /<a[^>]+href="(galereya\/[^"]+\.html)"[^>]*>([^<]+)<\/a>/gi;
  const seen = new Set();
  const animals = [];
  const baseUrl = 'https://animal-park.by/galereya/';

  let m;
  while ((m = re.exec(html)) !== null) {
    const [, href, text] = m;
    let name = text.replace(/\s+Подробнее\s*$/i, '').trim();
    if (/^(Парнокопытн|Млекопитающ|Приматы|Хищные птицы|Экзотические птицы|Другие птицы|Рыбы|Пресмыкающиеся)/i.test(name)) {
      name = name.replace(/^(Парнокопытн(?:ые?|ое)|Млекопитающ(?:ие|ее)|Приматы|Хищные птицы|Экзотические птицы|Другие птицы|Рыбы|Пресмыкающиеся)\s*/i, '');
    }
    if (!name || name.length < 2) continue;
    const slug = href.replace(/^.*\/([^/]+)\.html$/, '$1');
    if (seen.has(slug)) continue;
    seen.add(slug);
    animals.push({
      id: `site-${slug}`,
      name,
      url: href.startsWith('http') ? href : baseUrl + href,
      slug,
    });
  }

  console.log(JSON.stringify(animals, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

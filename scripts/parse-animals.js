/** Read the published gallery. Use --html PATH to process an archived response. */
import { readFile } from 'node:fs/promises';

const site = 'https://animal-park.by/';
const gallery = new URL('galereya/', site);
const decode = text => text.replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const archival = process.argv[2] === '--html';
const html = archival ? await readFile(process.argv[3], 'utf8') : await fetch(gallery).then(response => {
  if (!response.ok) throw Error('Gallery responded ' + response.status);
  return response.text();
});

const entries = new Map();
for (const card of html.split(/class=["']category_[^"']*gallery-masonry__item["']/i).slice(1)) {
  const href = card.match(/href="(galereya\/[^"]+\.html)"/i)?.[1];
  const photo = card.match(/<img[^>]+src="([^"]+)"/i)?.[1];
  const spans = [...card.matchAll(/<span\b[^>]*>([^<>]+)<\/span>/gi)].map(m => decode(m[1]));
  if (!href || !photo || !spans[0] || !spans[1]) throw Error('Incomplete published card');
  const url = new URL(href, site);
  const image = new URL(photo, site);
  if (url.origin !== gallery.origin || image.origin !== gallery.origin) throw Error('Unexpected asset host');
  const slug = url.pathname.split('/').pop().replace(/\.html$/, '');
  entries.set(slug, {id:'site-'+slug, name:spans[1], category:spans[0], url:url.href, slug, photo:image.href});
}
if (!entries.size) throw Error('No animal cards found');
console.log(JSON.stringify([...entries.values()], null, 2));

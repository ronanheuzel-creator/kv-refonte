#!/usr/bin/env node
// Liste les pages WordPress du site (read-only).
//
// Usage:
//   node scripts/list-pages.js                # toutes les pages (langue par défaut)
//   node scripts/list-pages.js --lang=en      # uniquement EN (via WPML)
//   node scripts/list-pages.js --lang=all     # toutes langues confondues
//   node scripts/list-pages.js --status=any

import { wp } from '../lib/wp.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const status = args.status || 'publish,draft,private';
const lang = args.lang;

const query = { per_page: 100, status, _fields: 'id,slug,title,status,link' };
if (lang) query.lang = lang;

const pages = await wp('/wp/v2/pages', { query });

console.log(`\n${pages.length} page(s) ${lang ? `(lang=${lang})` : ''} :\n`);

for (const p of pages) {
  const title = (p.title?.rendered || '(sans titre)').slice(0, 50);
  console.log(
    `  #${String(p.id).padEnd(6)} [${(p.status || '-').padEnd(8)}] ${title.padEnd(52)} ${p.link}`
  );
}
console.log('');

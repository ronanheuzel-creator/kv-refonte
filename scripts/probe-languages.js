#!/usr/bin/env node
// Probe — détecte si WPML/Polylang est installé et liste les pages en anglais.
// Usage: node scripts/probe-languages.js

import { wp } from '../lib/wp.js';

console.log('=== Routes API — détection WPML/Polylang ===');
const root = await wp('/');
const langRoutes = (root.namespaces || []).filter((n) => /wpml|polylang|pll/i.test(n));
console.log('Namespaces langue:', langRoutes.length ? langRoutes.join(', ') : 'aucun détecté');

console.log('\n=== Test ?lang=en (WPML/Polylang standard) ===');
try {
  const enPages = await wp('/wp/v2/pages', {
    query: { per_page: 50, lang: 'en', _fields: 'id,slug,title,link' },
  });
  console.log(`${enPages.length} page(s) avec lang=en`);
  for (const p of enPages.slice(0, 10)) {
    console.log(`  #${p.id} ${p.slug} → ${p.link}`);
  }
} catch (e) {
  console.log('Erreur:', e.message.slice(0, 200));
}

console.log('\n=== Pages tous statuts ===');
const all = await wp('/wp/v2/pages', {
  query: { per_page: 100, status: 'any', _fields: 'id,slug,status,link,title' },
});
console.log(`Total: ${all.length} pages`);

const candidatesEN = all.filter((p) => {
  const l = (p.link || '').toLowerCase();
  const s = (p.slug || '').toLowerCase();
  const t = (p.title?.rendered || '').toLowerCase();
  return /\/en\//.test(l) || /^en-|-en$|english/.test(s) || /english/.test(t);
});
console.log(`Candidats anglophones (heuristique): ${candidatesEN.length}`);
for (const p of candidatesEN) {
  console.log(`  #${p.id} [${p.status}] ${p.slug} → ${p.link}`);
}

console.log('\n=== Custom Post Types disponibles ===');
const types = await wp('/wp/v2/types');
for (const [key, t] of Object.entries(types)) {
  if (t.rest_base) console.log(`  ${key.padEnd(25)} → ${t.rest_base}`);
}

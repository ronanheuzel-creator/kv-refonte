#!/usr/bin/env node
// Pour chaque page EN, récupère le HTML et extrait le hreflang FR.
// Sortie : data/mapping-en-fr.json
//
// Usage: node scripts/build-en-fr-mapping.js

import { wp } from '../lib/wp.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// 1. Liste toutes les pages EN
const enPages = await wp('/wp/v2/pages', {
  query: { per_page: 100, status: 'publish', lang: 'en', _fields: 'id,slug,title,link' },
});

console.log(`📑 ${enPages.length} page(s) EN à mapper\n`);

const mapping = [];
for (const enPage of enPages) {
  const res = await fetch(enPage.link);
  const html = await res.text();
  const match = html.match(
    /<link[^>]*rel=["']alternate["'][^>]*hreflang=["']fr["'][^>]*href=["']([^"']+)["']/
  );
  const frUrl = match ? match[1] : null;
  let frSlug = null;
  let frId = null;
  if (frUrl) {
    // extract slug from URL
    const slugMatch = frUrl.match(/\/([^/]+)\/?$/);
    if (slugMatch) frSlug = slugMatch[1];
    else if (frUrl.endsWith('://stagging.kotonavision.com/')) frSlug = 'accueil'; // root
    if (frSlug === 'stagging.kotonavision.com') frSlug = 'accueil';

    // Resolve FR id via /wp/v2/pages?slug=
    if (frSlug) {
      try {
        const frP = await wp('/wp/v2/pages', {
          query: { slug: frSlug, _fields: 'id,slug,title,link' },
        });
        if (frP.length) frId = frP[0].id;
      } catch {}
    }
  }
  mapping.push({
    en: { id: enPage.id, slug: enPage.slug, title: enPage.title?.rendered, link: enPage.link },
    fr: frSlug ? { id: frId, slug: frSlug, url: frUrl } : null,
  });
  console.log(
    `  #${String(enPage.id).padEnd(5)} ${enPage.slug.padEnd(36).slice(0, 36)} → ${frSlug || '(?)'}` +
      (frId ? ` (#${frId})` : '')
  );
}

const DATA_DIR = join(process.cwd(), 'data');
await mkdir(DATA_DIR, { recursive: true });
const outPath = join(DATA_DIR, 'mapping-en-fr.json');
await writeFile(outPath, JSON.stringify(mapping, null, 2));
console.log(`\n💾 ${outPath.replace(process.env.HOME, '~')}`);

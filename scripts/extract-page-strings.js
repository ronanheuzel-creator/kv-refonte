#!/usr/bin/env node
// Extrait toutes les strings traduisibles d'une page (FR le plus souvent)
// dans un JSON à compléter avec les traductions EN.
//
// Usage:
//   node scripts/extract-page-strings.js --slug=manufacturier --lang=fr

import { wp } from '../lib/wp.js';
import { parseElementorData, walk } from '../lib/elementor.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
if (!args.slug) { console.error('Usage: --slug=<slug> [--lang=fr]'); process.exit(1); }

const pages = await wp('/wp/v2/pages', {
  query: { slug: args.slug, lang: args.lang || 'fr', context: 'edit' },
});
if (!pages.length) { console.error(`Page slug=${args.slug} introuvable`); process.exit(1); }
const page = pages[0];
const tree = parseElementorData(page.meta?._elementor_data);

const strings = [];
walk(tree, (n) => {
  if (n.elType !== 'widget') return;
  const s = n.settings || {};
  const wt = n.widgetType;
  // Champs avec texte selon le type de widget
  const fields = {
    heading: ['title'],
    'text-editor': ['editor'],
    button: ['text'],
    counter: ['title', 'starting_number', 'ending_number'],
    'icon-box': ['title_text', 'description_text', 'button_text'],
    'icon-list': ['icon_list'], // array spécial
    accordion: ['tabs'], // array spécial
    'nested-accordion': ['items'], // array spécial
    html: ['html'],
    shortcode: ['shortcode'],
  };
  const f = fields[wt] || [];
  for (const field of f) {
    if (s[field] === undefined || s[field] === null) continue;
    // Cas spéciaux : arrays d'items
    if (field === 'icon_list' && Array.isArray(s[field])) {
      s[field].forEach((item, i) => {
        if (item.text) strings.push({ widget_id: n.id, type: wt, field: `${field}[${i}].text`, fr: item.text, en: '' });
      });
    } else if ((field === 'tabs' || field === 'items') && Array.isArray(s[field])) {
      s[field].forEach((item, i) => {
        if (item.tab_title) strings.push({ widget_id: n.id, type: wt, field: `${field}[${i}].tab_title`, fr: item.tab_title, en: '' });
        if (item.tab_content) strings.push({ widget_id: n.id, type: wt, field: `${field}[${i}].tab_content`, fr: item.tab_content, en: '' });
        if (item.item_title) strings.push({ widget_id: n.id, type: wt, field: `${field}[${i}].item_title`, fr: item.item_title, en: '' });
        if (item.item_content) strings.push({ widget_id: n.id, type: wt, field: `${field}[${i}].item_content`, fr: item.item_content, en: '' });
      });
    } else if (field === 'starting_number' || field === 'ending_number') {
      // Pas traduire les nombres, juste référencer
      strings.push({ widget_id: n.id, type: wt, field, fr: String(s[field]), en: String(s[field]), _no_translate: true });
    } else {
      strings.push({ widget_id: n.id, type: wt, field, fr: s[field], en: '' });
    }
  }
});

const out = {
  fr_slug: args.slug,
  fr_page_id: page.id,
  fr_title: page.title?.rendered,
  fr_link: page.link,
  extracted_at: new Date().toISOString(),
  strings,
};

const DATA_DIR = join(process.cwd(), 'data', 'translations');
await mkdir(DATA_DIR, { recursive: true });
const outPath = join(DATA_DIR, `${args.slug}.json`);
await writeFile(outPath, JSON.stringify(out, null, 2));

console.log(`✅ ${strings.length} string(s) extraite(s) → ${outPath.replace(process.env.HOME, '~')}`);
console.log(`   Page FR : #${page.id} ${args.slug} (${page.title?.rendered})`);
const byType = {};
for (const s of strings) byType[s.type] = (byType[s.type] || 0) + 1;
console.log(`   Par type :`, byType);

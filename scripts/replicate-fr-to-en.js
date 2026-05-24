#!/usr/bin/env node
// Réplique exactement la structure d'une page FR vers son équivalent EN,
// en remplaçant chaque texte par sa traduction depuis un JSON de translations.
//
// ⚠️ Remplacement TOTAL du contenu de la page EN. Backup automatique.
//
// Usage:
//   node scripts/replicate-fr-to-en.js \
//     --translations=data/translations/manufacturier.json \
//     --en-slug=manufacturing   [--write]

import { wp } from '../lib/wp.js';
import { backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData, walk, regenIds } from '../lib/elementor.js';
import { readFile } from 'node:fs/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
if (!args.translations || !args['en-slug']) {
  console.error('Usage: --translations=<path.json> --en-slug=<slug> [--write]');
  process.exit(1);
}

const dryRun = !args.write;
const trans = JSON.parse(await readFile(args.translations, 'utf8'));

console.log(dryRun ? '🟦 DRY-RUN\n' : '🟧 WRITE MODE\n');
console.log(`FR: ${trans.fr_slug} (#${trans.fr_page_id})`);
console.log(`EN: ${args['en-slug']} (à remplacer)`);
console.log(`Translations: ${trans.strings.length} string(s)\n`);

// 1. Build translation lookup map: "widget_id:field" → en_text
// Pour les arrays (icon_list[N].text, tabs[N].tab_title), on garde la clé telle quelle
const lookup = new Map();
let translatedCount = 0;
let untranslatedCount = 0;
for (const s of trans.strings) {
  const key = `${s.widget_id}:${s.field}`;
  if (s.en && s.en.trim()) {
    lookup.set(key, s.en);
    translatedCount++;
  } else if (s.fr && s.fr.trim()) {
    untranslatedCount++;
  }
}
console.log(`📝 ${translatedCount} traduites · ${untranslatedCount} sans traduction (texte FR conservé)\n`);

// 2. Load FR page (source of truth)
const frPages = await wp('/wp/v2/pages', {
  query: { slug: trans.fr_slug, lang: 'fr', context: 'edit' },
});
if (!frPages.length) { console.error(`FR slug=${trans.fr_slug} introuvable`); process.exit(1); }
const frTree = parseElementorData(frPages[0].meta?._elementor_data);

// 3. Load EN page (target)
const enPages = await wp('/wp/v2/pages', {
  query: { slug: args['en-slug'], lang: 'en', context: 'edit' },
});
if (!enPages.length) { console.error(`EN slug=${args['en-slug']} introuvable`); process.exit(1); }
const enPage = enPages[0];

// 4. Substitution : walk FR tree (deep clone d'abord), substituer chaque champ texte
const newTree = JSON.parse(JSON.stringify(frTree));

let subsCount = 0;
walk(newTree, (n) => {
  if (n.elType !== 'widget') return;
  const s = n.settings || {};
  const widgetId = n.id;
  const wt = n.widgetType;

  // Champs simples
  for (const field of ['title', 'editor', 'text', 'html', 'shortcode']) {
    if (s[field] !== undefined) {
      const key = `${widgetId}:${field}`;
      if (lookup.has(key)) {
        s[field] = lookup.get(key);
        subsCount++;
      }
    }
  }
  // counter title (déjà couvert par 'title')

  // icon-list items
  if (wt === 'icon-list' && Array.isArray(s.icon_list)) {
    s.icon_list.forEach((item, i) => {
      const key = `${widgetId}:icon_list[${i}].text`;
      if (lookup.has(key)) { item.text = lookup.get(key); subsCount++; }
    });
  }
  // accordion tabs
  if ((wt === 'accordion' || wt === 'toggle') && Array.isArray(s.tabs)) {
    s.tabs.forEach((item, i) => {
      for (const f of ['tab_title', 'tab_content']) {
        const key = `${widgetId}:tabs[${i}].${f}`;
        if (lookup.has(key)) { item[f] = lookup.get(key); subsCount++; }
      }
    });
  }
  // nested-accordion items
  if (wt === 'nested-accordion' && Array.isArray(s.items)) {
    s.items.forEach((item, i) => {
      for (const f of ['item_title', 'item_content']) {
        const key = `${widgetId}:items[${i}].${f}`;
        if (lookup.has(key)) { item[f] = lookup.get(key); subsCount++; }
      }
    });
  }
});

console.log(`✏️  ${subsCount} substitution(s) appliquée(s) dans le tree\n`);

// 5. Régen des IDs Elementor
const newTreeWithFreshIds = regenIds(newTree);

// 6. Aperçu : afficher les premiers headings + buttons
console.log('📐 Aperçu de la nouvelle page EN :');
let preview = 0;
walk(newTreeWithFreshIds, (n) => {
  if (preview >= 10) return;
  if (n.widgetType === 'heading' || n.widgetType === 'button') {
    const s = n.settings || {};
    const t = s.title || s.text || '';
    if (t.trim()) {
      const tag = n.widgetType === 'heading' ? (s.header_size || 'h2') : 'btn';
      console.log(`  [${tag}] ${t.replace(/<[^>]+>/g, ' ').slice(0, 80)}`);
      preview++;
    }
  }
});

if (dryRun) {
  console.log(`\n[DRY-RUN] Pas de POST. Pour appliquer : --write`);
  process.exit(0);
}

// 7. Backup EN avant écrasement
await backupPage(enPage);
console.log(`\n💾 Backup EN /${enPage.slug}/ effectué`);

// 8. POST
const newData = JSON.stringify(newTreeWithFreshIds);
console.log(`📤 POST → /wp/v2/pages/${enPage.id} (replace _elementor_data)…`);
const result = await updatePage(enPage.id, { meta: { _elementor_data: newData } });
console.log(`✅ POST OK — modified ${result.modified}`);

// 9. Purge cache Elementor (langue EN)
console.log(`\n🧹 Purge cache Elementor (wpml_language=en)…`);
try {
  await wp('/elementor/v1/cache?wpml_language=en', { method: 'DELETE' });
  console.log(`✅ Cache purgé`);
} catch (e) {
  console.log(`⚠️  Échec purge cache: ${e.message.slice(0, 200)}`);
}

console.log(`\n🔗 URL : ${enPage.link}`);
console.log(`   Vide cache navigateur (Cmd+Shift+R) pour voir le résultat.`);

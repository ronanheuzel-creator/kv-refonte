#!/usr/bin/env node
// Réplique le Footer FR #23 → EN #1376, option A (structure FR pure).
// Traduit les libellés + adapte les URLs via une spec JSON.
//
// Usage:
//   node scripts/replicate-footer.js              # dry-run
//   node scripts/replicate-footer.js --write

import { wp } from '../lib/wp.js';
import { parseElementorData, walk, regenIds } from '../lib/elementor.js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FR_FOOTER_ID = 23;
const EN_FOOTER_ID = 1376;
const SPEC_PATH = join(process.cwd(), 'data', 'footer-en-spec.json');

const dryRun = !process.argv.includes('--write');
console.log(dryRun ? '🟦 DRY-RUN\n' : '🟧 WRITE MODE\n');

const spec = JSON.parse(await readFile(SPEC_PATH, 'utf8'));

// 1. Backup EN footer
const enExisting = await wp(`/wp/v2/elementor_library/${EN_FOOTER_ID}`, { query: { context: 'edit' } });
const BACKUPS_DIR = join(process.cwd(), 'backups');
await mkdir(BACKUPS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = join(BACKUPS_DIR, `template-${EN_FOOTER_ID}-en-footer-${ts}.json`);
await writeFile(backupPath, JSON.stringify(enExisting, null, 2));
console.log(`💾 Backup EN footer #${EN_FOOTER_ID} → ${backupPath.replace(process.env.HOME, '~')}`);

// 2. Load FR footer
const frTemplate = await wp(`/wp/v2/elementor_library/${FR_FOOTER_ID}`, { query: { context: 'edit' } });
console.log(`📥 FR footer #${FR_FOOTER_ID} chargé (${frTemplate.title?.rendered})`);

// 3. Deep clone + appliquer traductions + URL swap
const frTree = parseElementorData(frTemplate.meta?._elementor_data);
const newTree = JSON.parse(JSON.stringify(frTree));

let textSubs = 0;
let urlSubs = 0;
let htmlSubs = 0;

function translateText(text) {
  if (!text) return text;
  // 1. Direct text map
  if (spec.text_map[text] !== undefined) return spec.text_map[text];
  // 2. HTML replacements (chunks dans les headings)
  for (const r of spec.html_replacements) {
    if (text.includes(r.fr)) return text.replace(r.fr, r.en);
  }
  return text; // unchanged
}

function swapUrl(url) {
  if (!url) return url;
  return spec.url_map[url] || url;
}

walk(newTree, (n) => {
  if (n.elType !== 'widget') return;
  const s = n.settings || {};

  // headings : translate title + swap link
  if (n.widgetType === 'heading') {
    if (s.title !== undefined) {
      const newT = translateText(s.title);
      if (newT !== s.title) { s.title = newT; textSubs++; }
    }
    if (s.link?.url) {
      const newU = swapUrl(s.link.url);
      if (newU !== s.link.url) { s.link.url = newU; urlSubs++; }
    }
  }

  // icon-list : for each item, translate text + swap link
  if (n.widgetType === 'icon-list' && Array.isArray(s.icon_list)) {
    s.icon_list.forEach((item) => {
      if (item.text) {
        const newT = translateText(item.text);
        if (newT !== item.text) { item.text = newT; textSubs++; }
      }
      if (item.link?.url) {
        const newU = swapUrl(item.link.url);
        if (newU !== item.link.url) { item.link.url = newU; urlSubs++; }
      }
    });
  }

  // button : translate text + swap link
  if (n.widgetType === 'button') {
    if (s.text) {
      const newT = translateText(s.text);
      if (newT !== s.text) { s.text = newT; textSubs++; }
    }
    if (s.link?.url) {
      const newU = swapUrl(s.link.url);
      if (newU !== s.link.url) { s.link.url = newU; urlSubs++; }
    }
  }
});

console.log(`\n📊 ${textSubs} texte(s) traduit(s) · ${urlSubs} URL(s) adaptée(s)`);

// 4. Régen IDs
const newTreeWithIds = regenIds(newTree);

// 5. Aperçu structure finale
console.log('\n📐 Aperçu structure finale :');
walk(newTreeWithIds, (n) => {
  if (n.elType !== 'widget') return;
  const s = n.settings || {};
  if (n.widgetType === 'heading' && s.title !== undefined) {
    let extra = '';
    if (s.link?.url) extra = ' link=' + s.link.url;
    console.log('  [heading] ' + (s.title || '(vide)').replace(/<[^>]+>/g, '').slice(0, 60) + extra);
  } else if (n.widgetType === 'icon-list' && Array.isArray(s.icon_list)) {
    console.log('  [icon-list]');
    s.icon_list.forEach((item, i) => {
      console.log('    [' + i + '] ' + item.text + '  → ' + (item.link?.url || ''));
    });
  } else if (n.widgetType === 'html') {
    console.log('  [html] (script FAQ inchangé)');
  } else {
    console.log('  [' + n.widgetType + ']');
  }
});

if (dryRun) {
  console.log(`\n[DRY-RUN] Pas de POST.`);
  process.exit(0);
}

// 6. POST
const newData = JSON.stringify(newTreeWithIds);
console.log(`\n📤 POST → /wp/v2/elementor_library/${EN_FOOTER_ID}…`);
const result = await wp(`/wp/v2/elementor_library/${EN_FOOTER_ID}`, {
  method: 'POST',
  body: { meta: { _elementor_data: newData } },
});
console.log(`✅ POST OK — modified ${result.modified}`);

// 7. Purge cache
console.log(`\n🧹 Purge cache Elementor…`);
for (const lang of ['fr', 'en']) {
  try {
    await wp(`/elementor/v1/cache?wpml_language=${lang}`, { method: 'DELETE' });
    console.log(`   ✅ ${lang}`);
  } catch (e) { console.log(`   ⚠️  ${lang} : ${e.message.slice(0, 100)}`); }
}

console.log(`\n🔗 Tester sur n'importe quelle page /en/, ex: https://stagging.kotonavision.com/en/manufacturing/`);

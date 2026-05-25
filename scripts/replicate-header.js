#!/usr/bin/env node
// Réplique le Header FR #19 vers le Header EN #1373 avec:
// - structure FR exacte (logo, nav, switcher langue, CTA)
// - traduction du texte du e-button + URL adaptée
// - bascule de la référence menu vers le menu EN (menu-en)
//
// Usage:
//   node scripts/replicate-header.js              # dry-run
//   node scripts/replicate-header.js --write

import { wp } from '../lib/wp.js';
import { parseElementorData, walk, regenIds } from '../lib/elementor.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FR_HEADER_ID = 19;
const EN_HEADER_ID = 1373;
const FR_MENU = 'menu-principal';
const EN_MENU = 'menu-en';

// Traductions
const TRANSLATIONS = {
  // FR e-button text (html-v3) → EN
  button_text: { fr: 'Nous contacter →', en: 'Contact us →' },
  // FR link URL → EN link URL
  button_link: { fr: '/nous-contacter/', en: '/en/contact-us/' },
};

const dryRun = !process.argv.includes('--write');
console.log(dryRun ? '🟦 DRY-RUN\n' : '🟧 WRITE MODE\n');

// 1. Backup EN existing template
const enExisting = await wp(`/wp/v2/elementor_library/${EN_HEADER_ID}`, { query: { context: 'edit' } });
const BACKUPS_DIR = join(process.cwd(), 'backups');
await mkdir(BACKUPS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = join(BACKUPS_DIR, `template-${EN_HEADER_ID}-en-header-${ts}.json`);
await writeFile(backupPath, JSON.stringify(enExisting, null, 2));
console.log(`💾 Backup EN header #${EN_HEADER_ID} → ${backupPath.replace(process.env.HOME, '~')}`);

// 2. Load FR header (source of truth)
const frTemplate = await wp(`/wp/v2/elementor_library/${FR_HEADER_ID}`, { query: { context: 'edit' } });
console.log(`📥 FR header #${FR_HEADER_ID} chargé (${frTemplate.title?.rendered})`);

// 3. Deep clone + apply adjustments
const frTree = parseElementorData(frTemplate.meta?._elementor_data);
const newTree = JSON.parse(JSON.stringify(frTree));

let nbAdjustments = 0;
walk(newTree, (n) => {
  if (n.elType !== 'widget') return;
  const s = n.settings || {};

  // nav-menu : swap menu reference
  if (n.widgetType === 'nav-menu' && s.menu === FR_MENU) {
    s.menu = EN_MENU;
    nbAdjustments++;
    console.log(`  🔄 nav-menu : menu="${FR_MENU}" → "${EN_MENU}"`);
  }

  // e-button : traduire texte (html-v3) + adapter URL
  if (n.widgetType === 'e-button') {
    // text field is html-v3 object
    if (s.text?.$$type === 'html-v3' && s.text?.value?.content?.value === TRANSLATIONS.button_text.fr) {
      s.text.value.content.value = TRANSLATIONS.button_text.en;
      nbAdjustments++;
      console.log(`  🔄 e-button text : "${TRANSLATIONS.button_text.fr}" → "${TRANSLATIONS.button_text.en}"`);
    }
    // link field
    if (s.link?.$$type === 'link' && s.link?.value?.destination?.value === TRANSLATIONS.button_link.fr) {
      s.link.value.destination.value = TRANSLATIONS.button_link.en;
      nbAdjustments++;
      console.log(`  🔄 e-button link : "${TRANSLATIONS.button_link.fr}" → "${TRANSLATIONS.button_link.en}"`);
    }
  }
});

console.log(`\n📊 ${nbAdjustments} ajustement(s) appliqué(s)`);

// 4. Régen IDs
const newTreeWithIds = regenIds(newTree);

if (dryRun) {
  console.log(`\n[DRY-RUN] Pas de POST.`);
  console.log(`\n📐 Aperçu structure finale (widgets) :`);
  walk(newTreeWithIds, (n) => {
    if (n.elType === 'widget') {
      const s = n.settings || {};
      let extra = '';
      if (n.widgetType === 'nav-menu') extra = ` menu=${s.menu}`;
      if (n.widgetType === 'e-button') {
        const t = s.text?.value?.content?.value || s.text || '?';
        const l = s.link?.value?.destination?.value || '?';
        extra = ` text="${t}" link="${l}"`;
      }
      console.log(`  [${n.widgetType}]${extra}`);
    }
  });
  process.exit(0);
}

// 5. POST sur EN header
const newData = JSON.stringify(newTreeWithIds);
console.log(`\n📤 POST → /wp/v2/elementor_library/${EN_HEADER_ID}…`);
const result = await wp(`/wp/v2/elementor_library/${EN_HEADER_ID}`, {
  method: 'POST',
  body: { meta: { _elementor_data: newData } },
});
console.log(`✅ POST OK — modified ${result.modified}`);

// 6. Purge cache
console.log(`\n🧹 Purge cache Elementor (toutes langues)…`);
try {
  for (const lang of ['fr', 'en']) {
    await wp(`/elementor/v1/cache?wpml_language=${lang}`, { method: 'DELETE' });
    console.log(`   ✅ ${lang}`);
  }
} catch (e) {
  console.log(`⚠️  Échec purge: ${e.message.slice(0, 200)}`);
}

console.log(`\n🔗 Tester sur n'importe quelle page /en/, ex: https://stagging.kotonavision.com/en/manufacturing/`);

#!/usr/bin/env node
// Restaure une section d'une page WP depuis un backup JSON.
//
// Usage:
//   node scripts/rollback-section.js --backup=<backup.json> --section-index=<N>           # dry-run
//   node scripts/rollback-section.js --backup=<backup.json> --section-index=<N> --write

import { wp } from '../lib/wp.js';
import { backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData } from '../lib/elementor.js';
import { readFile } from 'node:fs/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const dryRun = !args.write;
const idx = parseInt(args['section-index'], 10);

if (isNaN(idx) || !args.backup) {
  console.error('Usage: node scripts/rollback-section.js --backup=<path> --section-index=<N> [--write]');
  process.exit(1);
}

// 1. Load backup → get the source-of-truth section
const backupRaw = JSON.parse(await readFile(args.backup, 'utf8'));
const backupTree = parseElementorData(backupRaw.meta?._elementor_data);
const sectionToRestore = backupTree[idx];

if (!sectionToRestore) {
  console.error(`Backup n'a pas de section #${idx + 1} (backup a ${backupTree.length} sections)`);
  process.exit(1);
}

const pageId = backupRaw.id;
console.log(`📂 Restore section #${idx + 1} depuis backup pour page #${pageId} (${backupRaw.slug})`);

// 2. Fetch current page
const current = await wp(`/wp/v2/pages/${pageId}`, { query: { context: 'edit' } });
await backupPage(current);
const currentTree = parseElementorData(current.meta?._elementor_data);

if (idx >= currentTree.length) {
  console.error(`Page courante n'a pas de section #${idx + 1}`);
  process.exit(1);
}

console.log(`   Current section #${idx + 1} ID: ${currentTree[idx].id}`);
console.log(`   Backup  section #${idx + 1} ID: ${sectionToRestore.id}`);

// 3. Replace
currentTree[idx] = sectionToRestore;

if (dryRun) {
  console.log(`\n[DRY-RUN] Pas de POST. Pour appliquer : --write`);
  process.exit(0);
}

const newData = JSON.stringify(currentTree);
console.log(`\n📤 POST en cours…`);
const result = await updatePage(pageId, { meta: { _elementor_data: newData } });
console.log(`✅ POST OK — modified ${result.modified}`);

// 4. Purge Elementor cache pour cette langue (homepage EN = en)
const lang = backupRaw.link?.includes('/en/') ? 'en' : 'fr';
console.log(`\n🧹 Purge cache Elementor (wpml_language=${lang})…`);
try {
  await wp(`/elementor/v1/cache?wpml_language=${lang}`, { method: 'DELETE' });
  console.log(`✅ Cache purgé`);
} catch (e) {
  console.log(`⚠️  Échec purge cache: ${e.message.slice(0, 200)}`);
}

console.log(`\n🔗 ${current.link}`);

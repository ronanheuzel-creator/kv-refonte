#!/usr/bin/env node
// Rebuild complet du menu EN (menu-en, ID=10) aligné sur la structure FR (menu-principal, ID=5).
// Backup auto avant delete + recréation.
//
// Structure cible : 15 items en 3 sous-menus + 1 top-level (Blog)
//
// Usage:
//   node scripts/rebuild-menu-en.js              # dry-run (affiche structure)
//   node scripts/rebuild-menu-en.js --write      # backup + delete + recreate

import { wp } from '../lib/wp.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MENU_EN_ID = 10;
const dryRun = !process.argv.includes('--write');
console.log(dryRun ? '🟦 DRY-RUN\n' : '🟧 WRITE MODE\n');

// Structure cible (parent_index: 0-based ref to a previous custom item in this array)
// Each item: { title, type: 'custom'|'page', page_id?, url?, parent_index?: number }
const STRUCTURE = [
  { title: 'SOLIDWORKS',              type: 'custom', url: '#' },                                // [0] parent
  { title: 'Design',                  type: 'page', page_id: 1307, parent_index: 0 },           // /en/solidworks-price-canada/
  { title: 'Simulation',              type: 'page', page_id: 1237, parent_index: 0 },           // /en/simulation/
  { title: '3DEXPERIENCE',            type: 'page', page_id: 1283, parent_index: 0 },           // /en/3dexperience-pdm-plm/
  { title: 'Upgrade your license',    type: 'page', page_id: 1291, parent_index: 0 },           // /en/solidworks-upgrade-3dex-offer/
  { title: 'Startup program',         type: 'page', page_id: 1334, parent_index: 0 },           // /en/free-solidworks-startups-canada/
  { title: 'Support & Training',      type: 'custom', url: '#' },                                // [6] parent
  { title: 'Full support',            type: 'page', page_id: 1227, parent_index: 6 },           // /en/3dexperience-support/
  { title: 'SOLIDWORKS Training',     type: 'page', page_id: 1319, parent_index: 6 },           // /en/solidworks-training/
  { title: 'Custom service',          type: 'page', page_id: 1299, parent_index: 6 },           // /en/custom-service-solidworks/
  { title: 'For whom?',               type: 'custom', url: '#' },                                // [10] parent
  { title: 'Startup program',         type: 'page', page_id: 1334, parent_index: 10 },          // /en/free-solidworks-startups-canada/
  { title: 'Industrial companies',    type: 'page', page_id: 1295, parent_index: 10 },          // /en/manufacturing/
  { title: 'Freelancers',             type: 'page', page_id: 1175, parent_index: 10 },          // /en/professional-services/
  { title: 'Blog',                    type: 'page', page_id: 1654 },                            // /en/blog/ (top-level)
];

// 1. Backup current items
const current = await wp('/wp/v2/menu-items', { query: { menus: MENU_EN_ID, per_page: 100, context: 'edit' } });
console.log(`📋 Menu EN actuel : ${current.length} item(s)\n`);

if (!dryRun) {
  const BACKUPS = join(process.cwd(), 'backups');
  await mkdir(BACKUPS, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await writeFile(join(BACKUPS, `menu-en-backup-${ts}.json`), JSON.stringify(current, null, 2));
  console.log(`💾 Backup → backups/menu-en-backup-${ts}.json`);
}

// Print target structure
console.log('\n📐 Structure cible :');
for (let i = 0; i < STRUCTURE.length; i++) {
  const s = STRUCTURE[i];
  const indent = s.parent_index !== undefined ? '  ' : '';
  const url = s.type === 'custom' ? '#' : `page #${s.page_id}`;
  console.log(`  ${indent}[${i}] ${s.title}  → ${url}`);
}

if (dryRun) { console.log('\n[DRY-RUN] --write pour appliquer'); process.exit(0); }

// 2. Delete current items
console.log(`\n🗑️ Suppression des ${current.length} items existants…`);
for (const it of current) {
  try {
    await wp(`/wp/v2/menu-items/${it.id}?force=true`, { method: 'DELETE' });
    process.stdout.write('.');
  } catch (e) { console.log(`\n  ❌ Delete #${it.id} : ${e.message.slice(0, 100)}`); }
}
console.log(' ✅');

// 3. Create new items, tracking IDs by index
const createdIds = new Array(STRUCTURE.length);
console.log(`\n📤 Création des ${STRUCTURE.length} nouveaux items…`);
for (let i = 0; i < STRUCTURE.length; i++) {
  const s = STRUCTURE[i];
  const body = {
    title: s.title,
    menus: MENU_EN_ID,
    menu_order: i + 1,
    status: 'publish',
    parent: s.parent_index !== undefined ? createdIds[s.parent_index] : 0,
  };
  if (s.type === 'custom') {
    body.type = 'custom';
    body.object = 'custom';
    body.url = s.url;
  } else {
    body.type = 'post_type';
    body.object = 'page';
    body.object_id = s.page_id;
  }
  try {
    const result = await wp('/wp/v2/menu-items', { method: 'POST', body });
    createdIds[i] = result.id;
    console.log(`  ✅ [${i}] #${result.id} "${s.title}" parent=${body.parent || 0}`);
  } catch (e) {
    console.log(`  ❌ [${i}] "${s.title}" : ${e.message.slice(0, 200)}`);
    createdIds[i] = 0;
  }
}

// 4. Purge cache
await wp('/elementor/v1/cache?wpml_language=en', { method: 'DELETE' });
console.log('\n🧹 Cache EN purgé');

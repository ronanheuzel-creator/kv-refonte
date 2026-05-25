#!/usr/bin/env node
// Supprime la pilier "Microsoft 365" (3e pilier) des pages services FR + EN.
// Détecte le container qui contient "Microsoft 365" MAIS PAS "SolidWorks Design"
// ni "3DEXPERIENCE PDM" (= le pilier MS isolé, pas les containers parents).
//
// Cibles : manufacturier (776), services-professionnels (774),
//          manufacturing (1295 EN), professional-services (1175 EN)
//
// Usage:
//   node scripts/remove-microsoft-365.js              # dry-run
//   node scripts/remove-microsoft-365.js --write

import { wp } from '../lib/wp.js';
import { backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData, walk } from '../lib/elementor.js';

const TARGETS = [
  { id: 776, slug: 'manufacturier', lang: 'fr' },
  { id: 774, slug: 'services-professionnels', lang: 'fr' },
  { id: 1295, slug: 'manufacturing', lang: 'en' },
  { id: 1175, slug: 'professional-services', lang: 'en' },
];

const dryRun = !process.argv.includes('--write');
console.log(dryRun ? '🟦 DRY-RUN\n' : '🟧 WRITE MODE\n');

function isMSOnlyPilier(container) {
  let hasMS = false, hasOtherPilier = false;
  walk([container], (n) => {
    if (n.widgetType === 'heading' && n.settings?.title) {
      const t = n.settings.title;
      if (/Microsoft 365/i.test(t)) hasMS = true;
      if (/SolidWorks Design|3DEXPERIENCE PDM/i.test(t)) hasOtherPilier = true;
    }
  });
  return hasMS && !hasOtherPilier;
}

function removeMSPilier(parentArr) {
  let removed = 0;
  if (!Array.isArray(parentArr)) return 0;
  // Itère en arrière pour pouvoir splice safely
  for (let i = parentArr.length - 1; i >= 0; i--) {
    const child = parentArr[i];
    if (child.elType === 'container' && isMSOnlyPilier(child)) {
      console.log(`  ❌ Removed Microsoft pilier container [${child.id}]`);
      parentArr.splice(i, 1);
      removed++;
    } else if (Array.isArray(child.elements)) {
      removed += removeMSPilier(child.elements);
    }
  }
  return removed;
}

const langPurges = new Set();

for (const t of TARGETS) {
  console.log(`\n══════ ${t.slug} (#${t.id}, lang=${t.lang}) ══════`);
  const page = await wp(`/wp/v2/pages/${t.id}`, { query: { context: 'edit' } });
  if (!dryRun) await backupPage(page);
  const tree = parseElementorData(page.meta?._elementor_data);
  const removed = removeMSPilier(tree);
  console.log(`  ${removed} pilier(s) Microsoft retiré(s)`);
  if (removed === 0) continue;

  if (dryRun) continue;

  const newData = JSON.stringify(tree);
  const result = await updatePage(t.id, { meta: { _elementor_data: newData } });
  console.log(`  ✅ POST OK — modified ${result.modified}`);
  langPurges.add(t.lang);
}

if (!dryRun && langPurges.size) {
  console.log(`\n🧹 Purge cache Elementor (${[...langPurges].join(', ')})…`);
  for (const lang of langPurges) {
    try {
      await wp(`/elementor/v1/cache?wpml_language=${lang}`, { method: 'DELETE' });
      console.log(`   ✅ ${lang}`);
    } catch (e) { console.log(`   ⚠️  ${lang} : ${e.message.slice(0, 100)}`); }
  }
}

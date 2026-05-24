#!/usr/bin/env node
// POC-1 — Clone une section de la page FR vers la page EN avec substitution
// de contenu textuel widget par widget (par position dans la section).
//
// Usage:
//   node scripts/poc-clone-section.js --fr-slug=accueil --en-slug=kotona-vision --section-index=1   # dry-run
//   node scripts/poc-clone-section.js --fr-slug=accueil --en-slug=kotona-vision --section-index=1 --write
//
// --section-index : index 0-based de la section à remplacer (1 = 2e section)

import { wp } from '../lib/wp.js';
import { backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData, walk, regenIds } from '../lib/elementor.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const dryRun = !args.write;
const idx = parseInt(args['section-index'], 10);
if (isNaN(idx) || !args['fr-slug'] || !args['en-slug']) {
  console.error('Usage: node scripts/poc-clone-section.js --fr-slug=<fr> --en-slug=<en> --section-index=<N> [--write]');
  process.exit(1);
}

function decodeEntities(s) {
  return String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

// Récupère tous les widgets contenant du TEXTE en profondeur, dans l'ordre.
function getTextWidgets(section) {
  const out = [];
  walk([section], (n) => {
    if (n.elType !== 'widget') return;
    const s = n.settings || {};
    const fields = [];
    if (s.title !== undefined && (n.widgetType === 'heading' || n.widgetType === 'counter')) fields.push('title');
    if (s.editor !== undefined && n.widgetType === 'text-editor') fields.push('editor');
    if (s.text !== undefined && n.widgetType === 'button') fields.push('text');
    if (fields.length === 0) return;
    out.push({ node: n, widgetType: n.widgetType, fields, values: Object.fromEntries(fields.map(f => [f, s[f]])) });
  });
  return out;
}

async function loadPage(slug, lang) {
  const pages = await wp('/wp/v2/pages', { query: { slug, lang, context: 'edit' } });
  if (!pages.length) throw new Error(`Page slug=${slug} lang=${lang} introuvable`);
  return pages[0];
}

// 1. Load FR + EN pages
const frPage = await loadPage(args['fr-slug'], 'fr');
const enPage = await loadPage(args['en-slug'], 'en');
await backupPage(enPage);
console.log(`💾 Backup EN /${enPage.slug}/ effectué`);

const frTree = parseElementorData(frPage.meta?._elementor_data);
const enTree = parseElementorData(enPage.meta?._elementor_data);

if (idx >= frTree.length) { console.error(`FR section #${idx + 1} n'existe pas (FR n'a que ${frTree.length} sections)`); process.exit(1); }
if (idx >= enTree.length) { console.error(`EN section #${idx + 1} n'existe pas (EN n'a que ${enTree.length} sections)`); process.exit(1); }

console.log(`\n📐 FR section ${idx + 1}  /  EN section ${idx + 1}\n`);

// 2. Deep clone FR section
const newSection = JSON.parse(JSON.stringify(frTree[idx]));

// 3. Extract widgets in parallel (par position)
const frWidgets = getTextWidgets(newSection);
const enWidgets = getTextWidgets(enTree[idx]);

console.log(`  FR widgets texte: ${frWidgets.length}`);
console.log(`  EN widgets texte: ${enWidgets.length}\n`);

console.log('  # | type        | AVANT (FR)               | APRÈS (EN content)');
console.log('  ' + '-'.repeat(120));

// 4. Substitution position-based
for (let i = 0; i < frWidgets.length; i++) {
  const fr = frWidgets[i];
  const en = enWidgets[i];
  for (const field of fr.fields) {
    const frVal = (fr.values[field] || '').toString();
    if (!en) {
      console.log(`  ${String(i).padStart(2)} | ${fr.widgetType.padEnd(11)} | "${decodeEntities(frVal).slice(0, 24)}" → (pas d'EN, garde FR)`);
      continue;
    }
    const enVal = en.values[field] !== undefined ? en.values[field] : Object.values(en.values)[0];
    if (enVal !== undefined && enVal !== null) {
      console.log(`  ${String(i).padStart(2)} | ${fr.widgetType.padEnd(11)} | "${decodeEntities(frVal).slice(0, 24).padEnd(24)}" → "${decodeEntities(String(enVal)).slice(0, 30)}"`);
      fr.node.settings[field] = enVal;
    } else {
      console.log(`  ${String(i).padStart(2)} | ${fr.widgetType.padEnd(11)} | "${decodeEntities(frVal).slice(0, 24)}" → (EN vide, garde FR)`);
    }
  }
}

// 5. Régénère les IDs Elementor pour éviter les collisions
const newSectionWithFreshIds = regenIds(newSection);

// 6. Remplace dans EN tree
enTree[idx] = newSectionWithFreshIds;

if (dryRun) {
  console.log(`\n[DRY-RUN] Pas de POST. Pour appliquer : --write`);
  process.exit(0);
}

// 7. POST
const newData = JSON.stringify(enTree);
console.log(`\n📤 POST en cours…`);
const result = await updatePage(enPage.id, { meta: { _elementor_data: newData } });
console.log(`✅ POST OK — modified ${result.modified}`);
console.log(`   URL: ${enPage.link}`);

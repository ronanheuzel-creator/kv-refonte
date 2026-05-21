#!/usr/bin/env node
// Inspecte une page WordPress (read-only) :
//   - Récupère la page via l'API
//   - Sauvegarde un snapshot JSON dans backups/
//   - Parse _elementor_data et affiche la structure
//
// Usage:
//   node scripts/inspect-page.js --slug=professional-services --lang=en
//   node scripts/inspect-page.js --id=1175

import { wp } from '../lib/wp.js';
import { backupPage } from '../lib/pages.js';
import { parseElementorData, walk } from '../lib/elementor.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

if (!args.slug && !args.id) {
  console.error('Usage: node scripts/inspect-page.js --slug=<slug> [--lang=en]');
  console.error('   ou: node scripts/inspect-page.js --id=<id>');
  process.exit(1);
}

// 1. Fetch page (avec context=edit pour avoir les meta Elementor)
let page;
if (args.id) {
  page = await wp(`/wp/v2/pages/${args.id}`, { query: { context: 'edit' } });
} else {
  const query = { slug: args.slug, context: 'edit' };
  if (args.lang) query.lang = args.lang;
  const pages = await wp('/wp/v2/pages', { query });
  if (!pages.length) {
    console.error(`Aucune page avec slug="${args.slug}"${args.lang ? ` lang=${args.lang}` : ''}`);
    process.exit(1);
  }
  page = pages[0];
}

// 2. Métadonnées
console.log('\n📄 Page');
console.log(`   ID:     ${page.id}`);
console.log(`   Slug:   ${page.slug}`);
console.log(`   Titre:  ${page.title?.rendered || page.title?.raw}`);
console.log(`   Statut: ${page.status}`);
console.log(`   URL:    ${page.link}`);
console.log(`   Lang:   ${page.lang || page.meta?.lang || '(non exposé)'}`);
console.log(`   Modèle: ${page.template || '(défaut)'}`);

// 3. Backup AVANT toute analyse (snapshot complet)
const backupPath = await backupPage(page);
console.log(`\n💾 Backup créé : ${backupPath}`);

// 4. Parse _elementor_data
const rawData = page.meta?._elementor_data ?? page._elementor_data;
if (!rawData) {
  console.log('\n⚠️  Pas de _elementor_data — cette page n\'utilise pas Elementor.');
  console.log('   Champs meta disponibles:', Object.keys(page.meta || {}).join(', ') || '(aucun)');
  process.exit(0);
}

const tree = parseElementorData(rawData);
console.log(`\n🌳 Structure Elementor : ${tree.length} section(s) racine`);

// 5. Stats globales
const counts = { section: 0, container: 0, column: 0, widget: 0, other: 0 };
const widgetTypes = {};
walk(tree, (node) => {
  const type = node.elType;
  if (type in counts) counts[type]++;
  else counts.other++;
  if (type === 'widget' && node.widgetType) {
    widgetTypes[node.widgetType] = (widgetTypes[node.widgetType] || 0) + 1;
  }
});

console.log('\n📊 Décompte :');
for (const [k, v] of Object.entries(counts)) {
  if (v) console.log(`   ${k.padEnd(12)} ${v}`);
}

console.log('\n🧩 Widgets utilisés :');
const sortedWidgets = Object.entries(widgetTypes).sort(([, a], [, b]) => b - a);
for (const [type, n] of sortedWidgets) {
  console.log(`   ${String(n).padStart(3)} × ${type}`);
}

// 6. Arborescence haut niveau (1 ligne par section racine)
//    On va chercher le 1er heading ou un texte parlant à l'intérieur.
console.log('\n📐 Sections racines (1er heading trouvé en interne) :');

function firstHint(node) {
  // Settings directs
  const s = node.settings || {};
  const direct = s._title || s.title || s.heading_title;
  if (direct) return String(direct);
  if (node.widgetType === 'heading' && s.title) return String(s.title);
  if (node.widgetType === 'text-editor' && s.editor) {
    return String(s.editor).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (node.widgetType === 'button' && s.text) return `[btn] ${s.text}`;
  // Descente récursive
  for (const child of node.elements || []) {
    const found = firstHint(child);
    if (found) return found;
  }
  return null;
}

function countWidgets(node) {
  let n = node.elType === 'widget' ? 1 : 0;
  for (const child of node.elements || []) n += countWidgets(child);
  return n;
}

tree.forEach((node, i) => {
  const hint = firstHint(node) || '(sans heading interne)';
  const nW = countWidgets(node);
  console.log(
    `   ${String(i + 1).padStart(2)}. (${String(nW).padStart(2)}w) ${hint.slice(0, 90)}`
  );
});

console.log('');

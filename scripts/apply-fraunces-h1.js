#!/usr/bin/env node
// Ajoute le style Fraunces italic doré au <em> du H1 d'une page.
// Petit script ciblé pour valider le pipeline POST sur une modification minimale.
//
// Usage:
//   node scripts/apply-fraunces-h1.js --slug=support-3dexperience           # dry-run
//   node scripts/apply-fraunces-h1.js --slug=support-3dexperience --write   # applique

import { wp } from '../lib/wp.js';
import { getPageBySlug, backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData, walk } from '../lib/elementor.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

if (!args.slug && !args.id) {
  console.error('Usage: node scripts/apply-fraunces-h1.js --slug=<slug> [--write] [--lang=fr]');
  process.exit(1);
}

const FRAUNCES_STYLE = 'font-family:Fraunces,serif;font-style:italic;color:#C9A35C;font-weight:600';

// 1. Fetch + backup
let page;
if (args.id) {
  page = await wp(`/wp/v2/pages/${args.id}`, { query: { context: 'edit' } });
} else {
  const query = { slug: args.slug, context: 'edit' };
  if (args.lang) query.lang = args.lang;
  const pages = await wp('/wp/v2/pages', { query });
  if (!pages.length) {
    console.error(`Aucune page slug="${args.slug}"`);
    process.exit(1);
  }
  page = pages[0];
}

const backupPath = await backupPage(page);
console.log(`💾 Backup : ${backupPath}`);

// 2. Parse + find H1
const tree = parseElementorData(page.meta?._elementor_data);
let h1Node = null;
walk(tree, (node) => {
  if (node.widgetType === 'heading' && (node.settings?.header_size === 'h1')) {
    if (!h1Node) h1Node = node; // premier H1 trouvé
  }
});

if (!h1Node) {
  console.error('❌ Aucun H1 trouvé sur la page');
  process.exit(1);
}

const oldTitle = h1Node.settings.title;
console.log(`\n🔍 H1 trouvé (id widget Elementor: ${h1Node.id})`);
console.log(`   AVANT : ${oldTitle}`);

// 3. Compute new title
// Pattern : remplace tout <em>...</em> sans style (ou avec style) par <em style="...">...</em>
// On vise SEULEMENT le 1er <em> du H1 (le mot-clé doré).
let newTitle = oldTitle;
const emRegex = /<em(?:\s+[^>]*)?>(.*?)<\/em>/;
const match = oldTitle.match(emRegex);
if (!match) {
  console.error(`\n❌ Pas de <em>...</em> dans le H1.`);
  console.error('   Ajoute manuellement <em>mot</em> autour d\'un mot-clé, puis relance.');
  process.exit(1);
}
const word = match[1];
newTitle = oldTitle.replace(emRegex, `<em style="${FRAUNCES_STYLE}">${word}</em>`);

if (oldTitle === newTitle) {
  console.log(`\n✅ Le H1 a déjà le style Fraunces. Rien à faire.`);
  process.exit(0);
}

console.log(`   APRÈS : ${newTitle}`);
console.log(`   (Fraunces appliqué sur le mot-clé : "${word}")`);

// 4. Dry-run ?
if (!args.write) {
  console.log(`\n[DRY-RUN] Aucun POST envoyé.`);
  console.log(`   Pour appliquer : ajouter --write`);
  process.exit(0);
}

// 5. Apply mutation + POST
h1Node.settings.title = newTitle;
const newData = JSON.stringify(tree);

console.log(`\n📤 POST en cours…`);
const result = await updatePage(page.id, {
  meta: { _elementor_data: newData },
});

console.log(`✅ POST OK`);
console.log(`   ID page  : ${result.id}`);
console.log(`   Modified : ${result.modified}`);

// 6. Vérification : re-fetch + check
console.log(`\n🔎 Vérification…`);
const reCheck = await wp(`/wp/v2/pages/${page.id}`, { query: { context: 'edit' } });
const reTree = parseElementorData(reCheck.meta?._elementor_data);
let reH1 = null;
walk(reTree, (n) => {
  if (n.widgetType === 'heading' && n.settings?.header_size === 'h1' && !reH1) reH1 = n;
});

if (reH1 && reH1.settings.title === newTitle) {
  console.log(`✅ La modification est bien persistée côté WP.`);
  console.log(`   URL frontend : ${page.link}`);
} else {
  console.log(`⚠️  Le re-fetch ne retrouve pas la modification attendue.`);
  console.log(`   Title actuel : ${reH1?.settings.title || '(H1 introuvable)'}`);
}

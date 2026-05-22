#!/usr/bin/env node
// Pour chaque heading H1/H2 sans <em>, ajoute <em style="Fraunces">mot-clé</em>
// autour du mot-clé spécifié dans le spec.
//
// Spec format (JSON file ou stdin) :
// {
//   "slug": "accueil",
//   "fixes": [
//     { "match": "Nos offres", "keyword": "offres" },
//     { "match": "Une offre qui s'adapte à vous.", "keyword": "adapte" }
//   ]
// }
//
// "match" = sous-chaîne unique à chercher dans le title du heading.
// "keyword" = mot/expression à entourer de <em style="Fraunces">…</em>.
//
// Usage:
//   node scripts/wrap-headings-fraunces.js --spec=path/to/spec.json           # dry-run
//   node scripts/wrap-headings-fraunces.js --spec=path/to/spec.json --write

import { wp } from '../lib/wp.js';
import { backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData, walk } from '../lib/elementor.js';
import { readFile } from 'node:fs/promises';

const FRAUNCES_STYLE = 'font-family:Fraunces,serif;font-style:italic;color:#C9A35C;font-weight:600';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

if (!args.spec) {
  console.error('Usage: node scripts/wrap-headings-fraunces.js --spec=<spec.json> [--write]');
  process.exit(1);
}

const dryRun = !args.write;
const spec = JSON.parse(await readFile(args.spec, 'utf8'));
console.log(dryRun ? '🟦 DRY-RUN\n' : '🟧 WRITE MODE\n');
console.log(`Page : ${spec.slug}  ·  ${spec.fixes.length} fix(es) à appliquer\n`);

// 1. Fetch page
const pages = await wp('/wp/v2/pages', { query: { slug: spec.slug, context: 'edit' } });
if (!pages.length) { console.error(`Page "${spec.slug}" introuvable`); process.exit(1); }
const page = pages[0];

const backupPath = await backupPage(page);
console.log(`💾 Backup : ${backupPath.replace(process.env.HOME, '~')}\n`);

const tree = parseElementorData(page.meta?._elementor_data);

// 2. Pour chaque fix, trouver le heading et muter
let applied = 0;
let skipped = 0;
let pageChanged = false;

for (const fix of spec.fixes) {
  // Trouve un heading H1/H2 dont le title contient fix.match
  let target = null;
  walk(tree, (node) => {
    if (node.widgetType !== 'heading') return;
    const tag = (node.settings?.header_size || 'h2').toLowerCase();
    if (tag !== 'h1' && tag !== 'h2') return;
    const title = node.settings?.title || '';
    if (title.includes(fix.match) && !target) target = node;
  });

  if (!target) {
    console.log(`  ⚠️  Pas de heading H1/H2 contenant "${fix.match}" — skip`);
    skipped++;
    continue;
  }

  const oldTitle = target.settings.title;

  // Si déjà un <em> avec Fraunces dans le title → skip (déjà fait)
  if (/font-family:\s*Fraunces/i.test(oldTitle)) {
    console.log(`  ⏭️  "${fix.match}" — déjà Fraunces, skip`);
    skipped++;
    continue;
  }

  // Vérifier que keyword est bien dans oldTitle
  if (!oldTitle.includes(fix.keyword)) {
    console.log(`  ❌ "${fix.match}" : mot-clé "${fix.keyword}" non trouvé dans le title`);
    skipped++;
    continue;
  }

  // Remplacer la 1ère occurrence du keyword par <em style="Fraunces">keyword</em>
  const newTitle = oldTitle.replace(fix.keyword, `<em style="${FRAUNCES_STYLE}">${fix.keyword}</em>`);

  console.log(`  [${(target.settings?.header_size || 'h2')}] keyword=\"${fix.keyword}\"`);
  console.log(`     AVANT : ${oldTitle}`);
  console.log(`     APRÈS : ${newTitle}\n`);

  if (!dryRun) {
    target.settings.title = newTitle;
    pageChanged = true;
  }
  applied++;
}

console.log(`\n📊 ${applied} fix(es) ${dryRun ? 'à appliquer' : 'appliqué(s)'} · ${skipped} skip`);

if (dryRun) {
  console.log(`   Pour appliquer : --write`);
  process.exit(0);
}

if (!pageChanged) {
  console.log(`Aucune modif à POST`);
  process.exit(0);
}

// 3. POST
const newData = JSON.stringify(tree);
console.log(`\n📤 POST en cours…`);
const result = await updatePage(page.id, { meta: { _elementor_data: newData } });
console.log(`✅ POST OK — modified ${result.modified}`);

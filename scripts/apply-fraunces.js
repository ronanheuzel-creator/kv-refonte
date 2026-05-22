#!/usr/bin/env node
// Ajoute le style Fraunces italic doré aux <em>...</em> des H1 et H2 d'une page
// (ou d'un batch de pages) qui n'ont pas encore le style.
//
// N'agit QUE sur les <em> déjà présents (zéro décision sémantique).
// Pour les headings sans <em>, ne touche pas — il faudra une étape manuelle.
//
// Usage:
//   node scripts/apply-fraunces.js --slug=formation-solidworks           # dry-run 1 page
//   node scripts/apply-fraunces.js --slug=formation-solidworks --write   # applique 1 page
//   node scripts/apply-fraunces.js --slugs=foo,bar,baz --write           # batch

import { wp } from '../lib/wp.js';
import { backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData, walk } from '../lib/elementor.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const FRAUNCES_STYLE = 'font-family:Fraunces,serif;font-style:italic;color:#C9A35C;font-weight:600';
const FRAUNCES_RE = /font-family:\s*Fraunces/i;

let slugs;
if (args.slugs) slugs = args.slugs.split(',').map((s) => s.trim());
else if (args.slug) slugs = [args.slug];
else {
  console.error('Usage:');
  console.error('  node scripts/apply-fraunces.js --slug=<slug> [--write]');
  console.error('  node scripts/apply-fraunces.js --slugs=<slug1>,<slug2>,... [--write]');
  process.exit(1);
}

const dryRun = !args.write;
console.log(dryRun ? '🟦 DRY-RUN — aucun POST envoyé\n' : '🟧 WRITE MODE — modifications appliquées\n');

let totalChanged = 0;
let totalSkipped = 0;

for (const slug of slugs) {
  console.log(`\n══════ ${slug} ══════`);

  const pages = await wp('/wp/v2/pages', { query: { slug, context: 'edit' } });
  if (!pages.length) {
    console.log(`  ⚠️  Page introuvable, skip`);
    continue;
  }
  const page = pages[0];

  const backupPath = await backupPage(page);
  console.log(`  💾 Backup : ${backupPath.replace(process.env.HOME, '~')}`);

  const tree = parseElementorData(page.meta?._elementor_data);

  const candidates = [];
  walk(tree, (node) => {
    if (node.widgetType !== 'heading') return;
    // Elementor stocke header_size, mais le default (h2) peut être omis.
    // On considère h1, h2, OU un heading sans header_size explicite (= h2 par défaut).
    const tag = (node.settings?.header_size || 'h2').toLowerCase();
    if (tag !== 'h1' && tag !== 'h2') return;
    const title = node.settings?.title || '';
    const hasEm = /<em(?:\s|>)/i.test(title);
    const hasFraunces = FRAUNCES_RE.test(title);
    if (!hasEm) return; // pas de <em> → on ne touche pas (décision manuelle)
    if (hasFraunces) return; // déjà fait
    candidates.push({ tag, title, node });
  });

  if (!candidates.length) {
    console.log(`  ✅ Rien à faire (tous les <em> ont déjà Fraunces, ou aucun <em>)`);
    continue;
  }

  console.log(`  🎯 ${candidates.length} heading(s) à fixer :\n`);

  let pageChanged = false;
  for (const c of candidates) {
    // Remplace UNIQUEMENT le premier <em> sans style spécifique (sans font-family)
    const emRegex = /<em((?:\s+[^>]*)?)>(.*?)<\/em>/;
    const newTitle = c.title.replace(emRegex, (full, attrs, word) => {
      // Si <em> a déjà un style, on le remplace par Fraunces (override propre)
      return `<em style="${FRAUNCES_STYLE}">${word}</em>`;
    });
    if (newTitle === c.title) {
      console.log(`    [${c.tag}] (rien à remplacer ?) "${c.title.slice(0, 80)}"`);
      continue;
    }
    console.log(`    [${c.tag}] AVANT : ${c.title}`);
    console.log(`    [${c.tag}] APRÈS : ${newTitle}\n`);
    if (!dryRun) {
      c.node.settings.title = newTitle;
      pageChanged = true;
    }
    totalChanged++;
  }

  if (dryRun) continue;
  if (!pageChanged) continue;

  // POST
  const newData = JSON.stringify(tree);
  console.log(`  📤 POST en cours…`);
  try {
    const result = await updatePage(page.id, {
      meta: { _elementor_data: newData },
    });
    console.log(`  ✅ POST OK — modified ${result.modified}`);
  } catch (e) {
    console.log(`  ❌ ERREUR POST : ${e.message.slice(0, 200)}`);
    totalChanged -= candidates.length;
    totalSkipped += candidates.length;
  }
}

console.log(`\n📊 Total : ${totalChanged} heading(s) ${dryRun ? '(à modifier)' : 'modifié(s)'} · ${totalSkipped} skip`);
if (dryRun) console.log(`   Pour appliquer : --write`);

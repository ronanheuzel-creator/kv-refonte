#!/usr/bin/env node
// Fingerprinting structurel — pour chaque section d'une page, trouve le
// template KV qui ressemble le plus (similarité Jaccard sur widget counts).
//
// Usage:
//   node scripts/match-templates.js --id=2
//   node scripts/match-templates.js --slug=accueil
//   node scripts/match-templates.js --slug=manufacturing --lang=en

import { wp } from '../lib/wp.js';
import { listElementorLibrary, getTemplate } from '../lib/templates.js';
import { parseElementorData, walk } from '../lib/elementor.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

if (!args.id && !args.slug && !args.lang) {
  console.error('Usage:');
  console.error('  node scripts/match-templates.js --id=<id>');
  console.error('  node scripts/match-templates.js --slug=<slug> [--lang=en]');
  console.error('  node scripts/match-templates.js --lang=fr   # batch toutes les pages');
  process.exit(1);
}
const batchMode = args.lang && !args.slug && !args.id;

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, '');
}

function widgetSignature(tree) {
  const sig = {};
  walk(tree, (node) => {
    if (node.elType === 'widget' && node.widgetType) {
      sig[node.widgetType] = (sig[node.widgetType] || 0) + 1;
    }
  });
  return sig;
}

function totalWidgets(sig) {
  return Object.values(sig).reduce((a, b) => a + b, 0);
}

// Jaccard pondéré : intersection (sum of mins) / union (sum of maxes)
function similarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let inter = 0;
  let uni = 0;
  for (const k of keys) {
    const ca = a[k] || 0;
    const cb = b[k] || 0;
    inter += Math.min(ca, cb);
    uni += Math.max(ca, cb);
  }
  return uni === 0 ? 0 : inter / uni;
}

function sigToString(sig) {
  return Object.entries(sig)
    .sort(([, a], [, b]) => b - a)
    .map(([t, n]) => `${n}×${t}`)
    .join(', ');
}

// 1. Charger templates KV avec leur contenu
console.log('📚 Chargement des templates KV…');
const allTemplates = await listElementorLibrary();
const kvList = allTemplates.filter((t) =>
  /^KV\s/i.test(decodeEntities(t.title?.rendered || ''))
);

const kvSigs = [];
for (const t of kvList) {
  const full = await getTemplate(t.id);
  const tree = parseElementorData(full.meta?._elementor_data ?? full._elementor_data);
  const sig = widgetSignature(tree);
  kvSigs.push({
    id: t.id,
    name: decodeEntities(t.title.rendered).replace(/^KV\s*[^A-Za-z0-9]+\s*/i, '').trim(),
    sig,
    nWidgets: totalWidgets(sig),
  });
}

console.log(`   ${kvSigs.length} templates chargés :\n`);
for (const k of kvSigs) {
  console.log(`   #${k.id}  ${k.name.padEnd(28)} (${k.nWidgets}w) — ${sigToString(k.sig)}`);
}

// 2. Charger la ou les pages cibles
const MATCH_STRONG = 0.7;
const MATCH_MAYBE = 0.4;

async function analyzePage(page) {
  const tree = parseElementorData(page.meta?._elementor_data ?? page._elementor_data);
  return tree.map((section, i) => {
    const sig = widgetSignature([section]);
    const total = totalWidgets(sig);
    const matches = kvSigs
      .map((k) => ({ ...k, similarity: similarity(sig, k.sig) }))
      .sort((a, b) => b.similarity - a.similarity);
    return { index: i + 1, total, sig, best: matches[0] };
  });
}

function printSinglePage(page, sectionResults) {
  console.log(
    `\n📄 ${decodeEntities(page.title.rendered)}  (#${page.id} · ${page.slug}) — ${sectionResults.length} sections racines\n`
  );

  console.log('  # | Sec widgets | Best KV match                                  | Sim   | Verdict');
  console.log('  --|-------------|------------------------------------------------|-------|--------');
  for (const r of sectionResults) {
    const verdict =
      r.best.similarity >= MATCH_STRONG ? '🎯 fort'
      : r.best.similarity >= MATCH_MAYBE ? '~ possible'
      : '? custom';
    const pct = (r.best.similarity * 100).toFixed(0).padStart(3);
    console.log(
      `  ${String(r.index).padStart(2)}| ${String(r.total).padStart(11)} | ${(`#${r.best.id} ${r.best.name}`).padEnd(46)} | ${pct}%  | ${verdict}`
    );
  }

  console.log('\n📊 Signature détaillée :\n');
  for (const r of sectionResults) {
    if (r.best.similarity < MATCH_MAYBE) continue;
    console.log(`Section ${r.index} (${r.total}w) — #${r.best.id} ${r.best.name} (${(r.best.similarity * 100).toFixed(0)}%)`);
    console.log(`  Page    : ${sigToString(r.sig)}`);
    console.log(`  Template: ${sigToString(r.best.sig)}\n`);
  }

  const strong = sectionResults.filter((r) => r.best.similarity >= MATCH_STRONG).length;
  const maybe = sectionResults.filter((r) => r.best.similarity >= MATCH_MAYBE && r.best.similarity < MATCH_STRONG).length;
  const custom = sectionResults.length - strong - maybe;
  console.log(`📈 Bilan : ${strong} fort · ${maybe} possible · ${custom} custom\n`);
}

if (batchMode) {
  // BATCH : toutes les pages de la langue
  const pages = await wp('/wp/v2/pages', {
    query: { per_page: 100, status: 'publish', lang: args.lang, _fields: 'id,slug,title' },
  });
  console.log(`\n🔍 Batch matching sur ${pages.length} page(s) lang=${args.lang}\n`);
  console.log('  ID    | Slug                                | Sections (best KV match @ similarity)');
  console.log('  ' + '-'.repeat(130));

  const allResults = [];
  for (const p of pages) {
    const full = await wp(`/wp/v2/pages/${p.id}`, { query: { context: 'edit' } });
    const sections = await analyzePage(full);
    allResults.push({ page: p, sections });

    const blocks = sections.map((r) => {
      const v =
        r.best.similarity >= MATCH_STRONG ? '🎯' :
        r.best.similarity >= MATCH_MAYBE ? '~' : '·';
      return `${v}${r.best.name.split(/\s/)[0]}${(r.best.similarity * 100).toFixed(0)}`;
    }).join(' › ');

    console.log(`  #${String(p.id).padEnd(5)} | ${p.slug.padEnd(36).slice(0, 36)} | ${blocks}`);
  }

  // Bilan global
  console.log('\n📈 Bilan refonte par page :\n');
  console.log('  Slug                                | Sections | 🎯 fort | ~ possible | ? custom | Verdict');
  console.log('  ' + '-'.repeat(105));
  for (const { page, sections } of allResults) {
    const strong = sections.filter((r) => r.best.similarity >= MATCH_STRONG).length;
    const maybe = sections.filter((r) => r.best.similarity >= MATCH_MAYBE && r.best.similarity < MATCH_STRONG).length;
    const custom = sections.length - strong - maybe;
    const ratio = sections.length ? strong / sections.length : 0;
    const verdict =
      ratio >= 0.7 ? '✅ refondue' :
      ratio >= 0.3 ? '🔶 partielle' :
      '❌ non refondue';
    console.log(
      `  ${page.slug.padEnd(36).slice(0, 36)} | ${String(sections.length).padStart(8)} | ${String(strong).padStart(7)} | ${String(maybe).padStart(10)} | ${String(custom).padStart(8)} | ${verdict}`
    );
  }
} else {
  // SINGLE PAGE
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
  const sections = await analyzePage(page);
  printSinglePage(page, sections);
}

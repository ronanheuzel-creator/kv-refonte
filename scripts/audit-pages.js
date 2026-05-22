#!/usr/bin/env node
// Audit en masse — inspecte toutes les pages d'une langue, génère un rapport.
//
// Usage:
//   node scripts/audit-pages.js                # toutes les langues (langue par défaut)
//   node scripts/audit-pages.js --lang=en
//   node scripts/audit-pages.js --slugs=manufacturing,microsoft-365 --lang=en
//
// Sortie:
//   - Console: une ligne par page (slug, sections, widgets, KV refs)
//   - Fichier: backups/audit-<lang|all>-<date>.md (rapport détaillé)

import { wp } from '../lib/wp.js';
import { listElementorLibrary } from '../lib/templates.js';
import { parseElementorData, walk } from '../lib/elementor.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const lang = args.lang;
const slugs = args.slugs ? args.slugs.split(',').map((s) => s.trim()) : null;

// 0. Récupère la bibliothèque KV pour détecter les références
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, '');
}

const allTemplates = await listElementorLibrary();
const kvTemplates = allTemplates.filter((t) => {
  const title = decodeEntities(t.title?.rendered || '');
  return /^KV\s/i.test(title);
});
const KV_IDS = new Map(
  kvTemplates.map((t) => [
    t.id,
    decodeEntities(t.title?.rendered || '').replace(/^KV\s*[^A-Za-z0-9]+\s*/i, '').trim(),
  ])
);
console.log(`📚 ${KV_IDS.size} template(s) KV connu(s) dans la bibliothèque:`);
for (const [id, name] of KV_IDS) console.log(`   #${id}  ${name}`);
console.log('');

// 1. Liste des pages cibles
const query = { per_page: 100, status: 'publish', _fields: 'id,slug,title,link' };
if (lang) query.lang = lang;
let pages = await wp('/wp/v2/pages', { query });
if (slugs) pages = pages.filter((p) => slugs.includes(p.slug));

console.log(`🔍 Audit de ${pages.length} page(s)${lang ? ` (lang=${lang})` : ''} :\n`);
console.log('  ID    | Slug                                | Sec | Cont | Wid | KV refs    | Top widgets');
console.log('  ' + '-'.repeat(125));

// Détection des références KV dans une page.
function findKVRefsInTree(tree) {
  const refs = []; // [{id, name, sectionIndex, widgetType, settingKey?}]
  function walkRec(node, sectionIndex) {
    if (!node) return;
    const s = node.settings || {};
    // Top-level / settings : templateID, template_id, template
    for (const key of ['templateID', 'template_id', 'template']) {
      const v = node[key] ?? s[key];
      const num = Number(v);
      if (!Number.isNaN(num) && KV_IDS.has(num)) {
        refs.push({ id: num, name: KV_IDS.get(num), sectionIndex, widgetType: node.widgetType, settingKey: key });
      }
    }
    // Scan settings for any numeric value matching a KV ID
    for (const [k, v] of Object.entries(s)) {
      if (['templateID', 'template_id', 'template'].includes(k)) continue;
      const num = Number(v);
      if (!Number.isNaN(num) && KV_IDS.has(num)) {
        refs.push({ id: num, name: KV_IDS.get(num), sectionIndex, widgetType: node.widgetType, settingKey: k });
      }
    }
    for (const child of node.elements || []) walkRec(child, sectionIndex);
  }
  tree.forEach((sec, i) => walkRec(sec, i));
  return refs;
}

const reports = [];

function firstHint(node) {
  const s = node.settings || {};
  const direct = s._title || s.title || s.heading_title;
  if (direct) return decodeEntities(String(direct).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  if (node.widgetType === 'heading' && s.title) {
    return decodeEntities(String(s.title).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
  if (node.widgetType === 'text-editor' && s.editor) {
    return decodeEntities(String(s.editor).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80));
  }
  if (node.widgetType === 'button' && s.text) return `[btn] ${decodeEntities(s.text)}`;
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

// 2. Pour chaque page : fetch + parse + summary
for (const p of pages) {
  process.stdout.write(`  #${String(p.id).padEnd(5)} | ${p.slug.padEnd(36).slice(0, 36)} | `);
  try {
    const full = await wp(`/wp/v2/pages/${p.id}`, { query: { context: 'edit' } });
    const tree = parseElementorData(full.meta?._elementor_data ?? full._elementor_data);
    const counts = { container: 0, section: 0, widget: 0 };
    const widgetTypes = {};
    walk(tree, (node) => {
      const t = node.elType;
      if (t in counts) counts[t]++;
      if (t === 'widget' && node.widgetType) {
        widgetTypes[node.widgetType] = (widgetTypes[node.widgetType] || 0) + 1;
      }
    });

    const top3 = Object.entries(widgetTypes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([t, n]) => `${n}×${t}`)
      .join(', ');

    const kvRefs = findKVRefsInTree(tree);
    const kvSummary = kvRefs.length ? `${kvRefs.length}×KV` : '          ';

    console.log(
      `${String(tree.length).padStart(3)} | ${String(counts.container).padStart(4)} | ${String(counts.widget).padStart(3)} | ${kvSummary.padEnd(10)} | ${top3}`
    );

    reports.push({
      id: p.id,
      slug: p.slug,
      title: decodeEntities(p.title?.rendered || ''),
      link: p.link,
      sections: tree.length,
      containers: counts.container,
      widgets: counts.widget,
      widgetTypes,
      kvRefs,
      sectionHints: tree.map((s, i) => ({
        widgets: countWidgets(s),
        hint: firstHint(s) || '(vide)',
        kvRefs: kvRefs.filter((r) => r.sectionIndex === i),
      })),
    });
  } catch (e) {
    console.log(`  ❌ ${e.message.slice(0, 60)}`);
    reports.push({ id: p.id, slug: p.slug, error: e.message });
  }
}

// 3. Markdown report
const BACKUPS_DIR = join(process.cwd(), 'backups');
await mkdir(BACKUPS_DIR, { recursive: true });
const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const reportPath = join(BACKUPS_DIR, `audit-${lang || 'all'}-${date}.md`);

let md = `# Audit pages — ${lang || 'toutes langues'} — ${new Date().toISOString().slice(0, 10)}\n\n`;
md += `**Source :** \`${process.env.WP_BASE_URL}\`\n`;
md += `**Pages auditées :** ${reports.length}\n`;
md += `**Templates KV connus :** ${KV_IDS.size} (${[...KV_IDS.values()].join(', ')})\n\n`;

md += `## Vue d'ensemble\n\n`;
md += `| ID | Slug | Sections | Containers | Widgets | KV refs | Top widgets |\n`;
md += `|---:|------|---------:|-----------:|--------:|--------:|-------------|\n`;
for (const r of reports) {
  if (r.error) {
    md += `| ${r.id} | ${r.slug} | — | — | — | — | ❌ ${r.error.slice(0, 50)} |\n`;
    continue;
  }
  const top3 = Object.entries(r.widgetTypes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([t, n]) => `${n}×\`${t}\``)
    .join(', ');
  const kvN = (r.kvRefs || []).length;
  md += `| ${r.id} | \`${r.slug}\` | ${r.sections} | ${r.containers} | ${r.widgets} | ${kvN || '—'} | ${top3} |\n`;
}

md += `\n## Détail par page\n\n`;
for (const r of reports) {
  if (r.error) continue;
  md += `### ${r.title} (\`/${r.slug}/\`)\n\n`;
  md += `- **ID :** ${r.id}\n`;
  md += `- **URL :** ${r.link}\n`;
  md += `- **Stats :** ${r.sections} sections racines · ${r.containers} containers · ${r.widgets} widgets\n`;
  if (r.kvRefs && r.kvRefs.length) {
    md += `- **🎯 Templates KV référencés (${r.kvRefs.length}) :**\n`;
    for (const ref of r.kvRefs) {
      md += `  - Section ${ref.sectionIndex + 1} → **${ref.name}** (#${ref.id})${ref.settingKey ? ` via setting \`${ref.settingKey}\`` : ''}${ref.widgetType ? ` [${ref.widgetType}]` : ''}\n`;
    }
  } else {
    md += `- **Templates KV :** aucun (page non refondue par référence)\n`;
  }
  md += `\n**Sections racines :**\n\n`;
  r.sectionHints.forEach((s, i) => {
    const kvNote = s.kvRefs?.length ? ` 🎯 ${s.kvRefs.map((k) => k.name).join(' + ')}` : '';
    md += `${i + 1}. \`(${s.widgets}w)\` ${s.hint}${kvNote}\n`;
  });
  md += `\n**Widgets utilisés :**\n\n`;
  const sorted = Object.entries(r.widgetTypes).sort(([, a], [, b]) => b - a);
  for (const [t, n] of sorted) {
    md += `- \`${t}\` × ${n}\n`;
  }
  md += `\n---\n\n`;
}

await writeFile(reportPath, md, 'utf8');
console.log(`\n📄 Rapport détaillé : ${reportPath}\n`);

// 4. Synthèse widgets globaux
const allWidgets = {};
for (const r of reports) {
  if (!r.widgetTypes) continue;
  for (const [t, n] of Object.entries(r.widgetTypes)) {
    allWidgets[t] = (allWidgets[t] || 0) + n;
  }
}
console.log('🧩 Widgets utilisés sur l\'ensemble du périmètre :');
const sortedAll = Object.entries(allWidgets).sort(([, a], [, b]) => b - a);
for (const [t, n] of sortedAll) {
  console.log(`   ${String(n).padStart(4)} × ${t}`);
}
console.log('');

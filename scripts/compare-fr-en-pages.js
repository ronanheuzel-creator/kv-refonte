#!/usr/bin/env node
// Affiche côte à côte la structure FR et EN d'une paire de pages,
// avec match KV par section. Sortie : un tableau JSON dans backups/
// pour servir de base au mapping de refonte.
//
// Usage:
//   node scripts/compare-fr-en-pages.js --fr-slug=accueil --en-slug=kotona-vision

import { wp } from '../lib/wp.js';
import { listElementorLibrary, getTemplate } from '../lib/templates.js';
import { parseElementorData, walk } from '../lib/elementor.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

if (!args['fr-slug'] || !args['en-slug']) {
  console.error('Usage: node scripts/compare-fr-en-pages.js --fr-slug=<fr> --en-slug=<en>');
  process.exit(1);
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#?\w+;/g, '');
}

function widgetSignature(tree) {
  const sig = {};
  walk(tree, (n) => {
    if (n.elType === 'widget' && n.widgetType) sig[n.widgetType] = (sig[n.widgetType] || 0) + 1;
  });
  return sig;
}

function similarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let inter = 0, uni = 0;
  for (const k of keys) {
    const ca = a[k] || 0, cb = b[k] || 0;
    inter += Math.min(ca, cb); uni += Math.max(ca, cb);
  }
  return uni === 0 ? 0 : inter / uni;
}

// Bibliothèque KV
const allTpl = await listElementorLibrary();
const kvList = allTpl.filter(t => /^KV\s/i.test(decodeEntities(t.title?.rendered || '')));
const kvSigs = [];
for (const t of kvList) {
  const full = await getTemplate(t.id);
  const tree = parseElementorData(full.meta?._elementor_data ?? full._elementor_data);
  kvSigs.push({
    id: t.id,
    name: decodeEntities(t.title.rendered).replace(/^KV\s*[^A-Za-z0-9]+\s*/i, '').trim(),
    sig: widgetSignature(tree),
  });
}

function firstHeading(node) {
  if (node.widgetType === 'heading' && node.settings?.title) {
    return decodeEntities(node.settings.title.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
  for (const c of (node.elements || [])) {
    const h = firstHeading(c);
    if (h) return h;
  }
  return null;
}

function sectionContents(section) {
  // Extract structured text content
  const out = [];
  walk([section], (n) => {
    const s = n.settings || {};
    if (n.widgetType === 'heading' && s.title) {
      out.push({ type: 'heading', tag: s.header_size || 'h2', text: decodeEntities(s.title) });
    } else if (n.widgetType === 'text-editor' && s.editor) {
      out.push({ type: 'text', text: decodeEntities(s.editor.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 120) });
    } else if (n.widgetType === 'button' && s.text) {
      out.push({ type: 'button', text: decodeEntities(s.text) });
    }
  });
  return out;
}

function bestKVMatch(section) {
  const sig = widgetSignature([section]);
  const matches = kvSigs.map(k => ({ ...k, sim: similarity(sig, k.sig) })).sort((a, b) => b.sim - a.sim);
  return matches[0];
}

async function loadPage(slug, lang) {
  const pages = await wp('/wp/v2/pages', { query: { slug, lang, context: 'edit' } });
  if (!pages.length) throw new Error(`Page slug=${slug} lang=${lang} introuvable`);
  return pages[0];
}

const frPage = await loadPage(args['fr-slug'], 'fr');
const enPage = await loadPage(args['en-slug'], 'en');
const frTree = parseElementorData(frPage.meta?._elementor_data);
const enTree = parseElementorData(enPage.meta?._elementor_data);

const frSections = frTree.map((sec, i) => ({
  index: i + 1,
  hint: firstHeading(sec) || '(sans heading)',
  kv: bestKVMatch(sec),
  contents: sectionContents(sec),
}));
const enSections = enTree.map((sec, i) => ({
  index: i + 1,
  hint: firstHeading(sec) || '(sans heading)',
  kv: bestKVMatch(sec),
  contents: sectionContents(sec),
}));

const max = Math.max(frSections.length, enSections.length);
console.log(`\n📄 FR: ${decodeEntities(frPage.title.rendered)} (#${frPage.id} · ${frPage.slug}) — ${frTree.length} sections`);
console.log(`📄 EN: ${decodeEntities(enPage.title.rendered)} (#${enPage.id} · ${enPage.slug}) — ${enTree.length} sections\n`);

console.log('  #  | FR section                                              | EN section');
console.log('  ' + '-'.repeat(135));
for (let i = 0; i < max; i++) {
  const fr = frSections[i];
  const en = enSections[i];
  const frStr = fr
    ? `${fr.kv.sim >= 0.7 ? '🎯' : fr.kv.sim >= 0.4 ? '~' : '·'} ${fr.kv.name.slice(0, 18).padEnd(18)} | ${(fr.hint || '').slice(0, 32)}`
    : '— (aucune)';
  const enStr = en
    ? `${en.kv.sim >= 0.7 ? '🎯' : en.kv.sim >= 0.4 ? '~' : '·'} ${en.kv.name.slice(0, 18).padEnd(18)} | ${(en.hint || '').slice(0, 32)}`
    : '— (aucune)';
  console.log(`  ${String(i + 1).padStart(2)} | ${frStr.padEnd(56)} | ${enStr}`);
}

// Sauve un brouillon de spec pour le mapping
const BACKUPS_DIR = join(process.cwd(), 'backups');
await mkdir(BACKUPS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = join(BACKUPS_DIR, `compare-${args['en-slug']}-${ts}.json`);
await writeFile(outPath, JSON.stringify({ fr: { id: frPage.id, slug: frPage.slug, sections: frSections }, en: { id: enPage.id, slug: enPage.slug, sections: enSections } }, null, 2));
console.log(`\n💾 Détail : ${outPath.replace(process.env.HOME, '~')}`);

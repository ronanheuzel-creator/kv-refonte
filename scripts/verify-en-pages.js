#!/usr/bin/env node
// Vérification globale des pages EN :
// 1. Audit structurel KV (re-run match-templates pour fraîcheur)
// 2. Scan FR résiduel : cherche des mots français typiques restants dans le HTML rendu
// 3. Vérification liens : crawl les liens internes, détecte 404
// 4. Responsive : viewport meta + media queries dans CSS

import { wp } from '../lib/wp.js';
import { parseElementorData, walk } from '../lib/elementor.js';

const EN_PAGES = [
  { slug: 'kotona-vision',                      label: 'Home /en/' },
  { slug: 'solidworks-reseller',                label: 'SOLIDWORKS Reseller' },
  { slug: 'manufacturing',                      label: 'Manufacturing' },
  { slug: 'professional-services',              label: 'Professional Services' },
  { slug: '3dexperience-support',               label: '3DEX Support' },
  { slug: 'solidworks-training',                label: 'Training' },
  { slug: 'simulation',                         label: 'Simulation' },
  { slug: '3dexperience-pdm-plm',               label: '3DEX PDM/PLM' },
];

const BASE = 'https://stagging.kotonavision.com';

// Mots français typiques qui ne devraient PAS apparaître dans une page EN refondue
// (on évite les noms propres comme Dassault Systèmes, Kotona Vision, etc.)
const FR_MARKERS = [
  /\bvous\b(?!s')/i, /\bvotre\b/i, /\bnous\b/i, /\bnotre\b/i, /\bpour\b/i,
  /\bavec\b/i, /\bsans\b/i, /\bpas\b/i, /\bplus\b(?!\s)/i, /\bmais\b/i,
  /\bdans\b/i, /\bsur\b/i, /\baussi\b/i, /\btous\b/i,
  /\bquelques?\b/i, /\bbeaucoup\b/i, /\bune?\b/i, /\bdes\b/i,
  /\bdu\b/i, /\bde la\b/i, /\bles\b/i,
];

async function checkResponsive(html) {
  const hasViewport = /<meta\s+name="viewport"/i.test(html);
  const hasMediaQuery = /@media\s*\(/.test(html);
  const hasResponsiveCss = /max-width:\s*(?:767|768|1024|1080)px/.test(html);
  return { hasViewport, hasMediaQuery, hasResponsiveCss };
}

function findFrResidual(html) {
  // On extrait le body uniquement (pas les scripts/styles/comments)
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                   .replace(/<style[\s\S]*?<\/style>/gi, '')
                   .replace(/<!--[\s\S]*?-->/g, '');
  // Texte uniquement
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const hits = [];
  for (const re of FR_MARKERS) {
    const m = text.match(re);
    if (m) {
      // Cherche le contexte autour
      const idx = text.search(re);
      const ctx = text.slice(Math.max(0, idx - 30), Math.min(text.length, idx + 50));
      hits.push({ word: m[0], context: ctx.trim() });
    }
  }
  return hits;
}

function extractInternalLinks(html) {
  // Tous les hrefs commençant par / ou par le BASE
  const re = /href="([^"]+)"/g;
  const links = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    let url = m[1];
    if (url.startsWith('http')) {
      if (!url.startsWith(BASE)) continue;
      url = url.replace(BASE, '');
    } else if (!url.startsWith('/')) continue;
    if (url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) continue;
    // Strip query/hash
    url = url.split('#')[0].split('?')[0];
    if (!url) continue;
    links.add(url);
  }
  return [...links];
}

const allLinkChecks = new Map(); // url → status (cache)
async function checkLink(url) {
  if (allLinkChecks.has(url)) return allLinkChecks.get(url);
  try {
    const res = await fetch(BASE + url, { method: 'HEAD', redirect: 'follow' });
    allLinkChecks.set(url, res.status);
    return res.status;
  } catch (e) {
    allLinkChecks.set(url, 0);
    return 0;
  }
}

// Main
console.log('🔍 Vérification globale des pages EN refondues\n');

const summary = [];

for (const p of EN_PAGES) {
  console.log(`\n══════ ${p.label} ══════`);
  const res = await fetch(`${BASE}/en/${p.slug === 'kotona-vision' ? '' : p.slug + '/'}?_=${Date.now()}`, { cache: 'no-cache' });
  const html = await res.text();
  console.log(`  HTTP ${res.status} · ${html.length} bytes`);

  // 1. Responsive
  const resp = await checkResponsive(html);
  console.log(`  Responsive : viewport=${resp.hasViewport ? '✅' : '❌'} · @media=${resp.hasMediaQuery ? '✅' : '❌'} · breakpoints CSS=${resp.hasResponsiveCss ? '✅' : '❌'}`);

  // 2. FR résiduel
  const frHits = findFrResidual(html);
  const uniqueFr = [...new Map(frHits.map(h => [h.word.toLowerCase(), h])).values()];
  console.log(`  Mots FR résiduels : ${uniqueFr.length === 0 ? '✅ aucun' : '⚠️ ' + uniqueFr.length + ' (' + uniqueFr.slice(0, 5).map(h => h.word).join(', ') + ')'}`);
  if (uniqueFr.length > 0) {
    console.log(`     Exemple contexte: "${uniqueFr[0].context}"`);
  }

  // 3. Liens internes
  const links = extractInternalLinks(html);
  const linkChecks = [];
  for (const link of links) {
    const status = await checkLink(link);
    linkChecks.push({ link, status });
  }
  const broken = linkChecks.filter(l => l.status === 404 || l.status === 0);
  console.log(`  Liens internes : ${links.length} testés · ${broken.length === 0 ? '✅ 0 cassé' : '❌ ' + broken.length + ' cassé(s)'}`);
  if (broken.length) {
    for (const b of broken) console.log(`     ❌ ${b.status} ${b.link}`);
  }

  // 4. Vérif Microsoft 365 absence (pour manufacturing/pro-services)
  if (p.slug === 'manufacturing' || p.slug === 'professional-services') {
    const hasMs = html.includes('Microsoft 365') || html.includes('OFFICE');
    console.log(`  Microsoft 365 : ${!hasMs ? '✅ supprimé' : '⚠️ encore présent'}`);
  }

  summary.push({
    page: p.label,
    responsive: resp.hasViewport && resp.hasMediaQuery,
    frResidual: uniqueFr.length,
    brokenLinks: broken.length,
  });
}

console.log('\n\n📊 BILAN GLOBAL :');
console.log('  Page                        | Resp | FR résid | 404');
console.log('  ' + '-'.repeat(70));
for (const s of summary) {
  console.log(`  ${s.page.padEnd(28)} | ${s.responsive ? '✅' : '❌'}    | ${String(s.frResidual).padStart(3)}      | ${String(s.brokenLinks).padStart(2)}`);
}
console.log('');

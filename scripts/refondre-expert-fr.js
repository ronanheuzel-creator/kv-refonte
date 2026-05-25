#!/usr/bin/env node
// Refonte profonde de /expert-solidworks-canada/ FR (#695) :
// - Section 1 Hero : cloné de manufacturier (style service-page) + contenu About
// - Sections 2+3 mergées en KV 3 piliers offres (clone du KV #2474) avec contenu Option A
// - Section 4 garde + Fraunces sur "Kotona Vision"
// - Section 5 garde (déjà KV Pourquoi, 100%) + vérifier Fraunces
// - Section 6 nettoyée : couleurs teal/orange → gold, Fraunces sur "expertise" et "mandats"
// - Section 7 garde (KV CTA, 100%)
//
// Microsoft est complètement retiré.
//
// Usage:
//   node scripts/refondre-expert-fr.js              # dry-run
//   node scripts/refondre-expert-fr.js --write

import { wp } from '../lib/wp.js';
import { backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData, walk, regenIds } from '../lib/elementor.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const EXPERT_ID = 695;
const MANUFACTURIER_ID = 776;
const KV_3PILIERS_ID = 2474;
const FRAUNCES = 'font-family:Fraunces,serif;font-style:italic;color:#C9A35C;font-weight:600';
const dryRun = !process.argv.includes('--write');
console.log(dryRun ? '🟦 DRY-RUN\n' : '🟧 WRITE MODE\n');

// 1. Fetch source templates
const expert = await wp(`/wp/v2/pages/${EXPERT_ID}`, { query: { context: 'edit' } });
const manuf = await wp(`/wp/v2/pages/${MANUFACTURIER_ID}`, { query: { context: 'edit' } });
const kvPiliers = await wp(`/wp/v2/elementor_library/${KV_3PILIERS_ID}`, { query: { context: 'edit' } });

if (!dryRun) {
  await backupPage(expert);
  console.log(`💾 Backup expert FR #${EXPERT_ID}`);
}

const expertTree = parseElementorData(expert.meta?._elementor_data);
const manufTree = parseElementorData(manuf.meta?._elementor_data);
const kvPiliersTree = parseElementorData(kvPiliers.meta?._elementor_data);

console.log(`Expert FR : ${expertTree.length} sections actuelles`);

// ════════════════════════════════════════════════════════════════
// 2. Nouveau Hero (section 1) — clone de manufacturier section 1 + custom content
// ════════════════════════════════════════════════════════════════
const newHero = JSON.parse(JSON.stringify(manufTree[0]));

// Walk + substitution des textes
walk(newHero, (n) => {
  if (n.elType !== 'widget') return;
  const s = n.settings || {};
  // Eyebrow HTML (premier html)
  if (n.widgetType === 'html' && s.html?.includes('kv-eyebrow') && !s.html?.includes('kv-badge')) {
    s.html = '<div class="kv-eyebrow"><span class="kv-eyebrow-bar"></span>À PROPOS · KOTONA VISION</div>';
  }
  // Badge HTML
  if (n.widgetType === 'html' && s.html?.includes('kv-badge')) {
    s.html = '<span class="kv-badge">◆ Expert SOLIDWORKS · Québec, Canada</span>';
  }
  // H1
  if (n.widgetType === 'heading' && s.header_size === 'h1') {
    s.title = `Découvrir <em style="${FRAUNCES}">Kotona Vision</em>.`;
  }
  // Intro
  if (n.widgetType === 'text-editor') {
    s.editor = `<p>Une vision différente du conseil SOLIDWORKS pour les PME industrielles canadiennes. Une équipe d'experts, basée au Québec, qui maîtrise à la fois la CAO industrielle et les enjeux opérationnels du terrain.</p>`;
  }
  // Buttons (manufacturier a 2 buttons : "Voir nos solutions" + "Nous contacter")
  if (n.widgetType === 'button') {
    if (s.text === 'Voir nos solutions') {
      s.text = 'Discuter avec un expert';
      if (s.link) s.link.url = '/nous-contacter/';
    } else if (s.text === 'Nous contacter') {
      s.text = 'Voir nos solutions';
      if (s.link) s.link.url = '/revendeur-solidworks-canada/';
    }
  }
});

console.log('✏️  Section 1 Hero reconstruit (style service-page)');

// ════════════════════════════════════════════════════════════════
// 3. Nouvelle section "3 piliers" — clone KV #2474 + populer 3 piliers
// ════════════════════════════════════════════════════════════════
const new3Piliers = JSON.parse(JSON.stringify(kvPiliersTree[0]));

// On a besoin de POPULER les 3 piliers avec notre contenu Option A.
// La structure KV 3 piliers offres a : 10×heading, 3×text-editor, 3×icon-list, 3×button
// → typiquement : 1 H2 titre section + 3 piliers de (1 eyebrow/code + 1 number + 1 H3 titre + 1 text + 1 icon-list + 1 button)
// On va remplacer le contenu de chaque pilier sans toucher la structure.

const PILIER_CONTENT = [
  {
    eyebrow: 'EXPERTISE',
    number: '01',
    title: 'Du déploiement à l\'usage quotidien',
    text: '<p>Nos conseillers maîtrisent SOLIDWORKS et les processus industriels qui l\'entourent. De l\'audit initial à la formation continue, nous structurons votre adoption pour des gains de productivité durables.</p>',
    bullets: ['Audit & cadrage', 'Déploiement & migration', 'Formation continue'],
    button: { text: 'En savoir plus', url: '/revendeur-solidworks-canada/' },
  },
  {
    eyebrow: 'TRANSVERSALITÉ',
    number: '02',
    title: 'CAO industrielle + productivité cloud',
    text: '<p>Une double expertise rare au Canada : de SOLIDWORKS Design au PDM cloud 3DEXPERIENCE, en passant par les workflows collaboratifs. Fini les silos entre bureau d\'études et le reste de l\'entreprise.</p>',
    bullets: ['PDM Cloud 3DEXPERIENCE', 'Workflows collaboratifs', 'Intégrations métier'],
    button: { text: 'Voir nos solutions', url: '/3dexperience-pdm-cloud/' },
  },
  {
    eyebrow: 'POSITIONNEMENT',
    number: '03',
    title: 'Pensée pour les PME industrielles',
    text: '<p>L\'expertise d\'un grand groupe avec la flexibilité d\'une équipe à taille humaine. Pas de jargon, pas d\'usine à gaz : des solutions concrètes adaptées à vos contraintes opérationnelles.</p>',
    bullets: ['Sans jargon technique', 'Sans usine à gaz', 'Solutions concrètes'],
    button: { text: 'Demander un devis', url: '/nous-contacter/' },
  },
];

// Identifier les piliers : ce sont les enfants directs du container "piliers row".
// Heuristique: trouver le 1er container qui contient 3 enfants containers (=3 piliers).
function findPiliersRow(node) {
  if (node?.elements?.length === 3 && node.elements.every(c => c.elType === 'container')) {
    return node;
  }
  for (const c of node?.elements || []) {
    const found = findPiliersRow(c);
    if (found) return found;
  }
  return null;
}

const row = findPiliersRow(new3Piliers);
if (!row) { console.error('❌ Pas trouvé la row des 3 piliers dans KV template'); process.exit(1); }
console.log(`✏️  Row 3 piliers trouvée : ${row.elements.length} enfants`);

// Pour chaque pilier (container), trouver les widgets dans l'ordre et substituer
row.elements.forEach((pilier, i) => {
  const content = PILIER_CONTENT[i];
  if (!content) return;

  let headingIdx = 0; // 0 = eyebrow, 1 = number, 2 = title
  walk([pilier], (n) => {
    if (n.elType !== 'widget') return;
    const s = n.settings || {};

    if (n.widgetType === 'heading') {
      if (headingIdx === 0) { s.title = content.eyebrow; headingIdx++; }
      else if (headingIdx === 1) { s.title = content.number; headingIdx++; }
      else if (headingIdx === 2) { s.title = content.title; headingIdx++; }
    } else if (n.widgetType === 'text-editor') {
      s.editor = content.text;
    } else if (n.widgetType === 'icon-list' && Array.isArray(s.icon_list)) {
      s.icon_list.forEach((item, j) => {
        if (content.bullets[j]) item.text = content.bullets[j];
      });
    } else if (n.widgetType === 'button') {
      s.text = content.button.text;
      if (s.link) s.link.url = content.button.url; else s.link = { url: content.button.url };
    }
  });
});

// Update le H2 de la section "3 piliers"
walk(new3Piliers, (n) => {
  if (n.elType === 'widget' && n.widgetType === 'heading' && n.settings?.header_size === 'h2') {
    // Le 1er H2 du tree doit être le titre de section
    if (!n.settings.title.includes('Fraunces')) {
      n.settings.title = `Pourquoi <em style="${FRAUNCES}">Kotona Vision</em> ?`;
    }
  }
});

console.log('✏️  Section 3 piliers customisée (Option A — contenu Claude)');

// ════════════════════════════════════════════════════════════════
// 4. Cleanup sections 4-7
// ════════════════════════════════════════════════════════════════

// Section 4 (index 3): "Que veut dire « Kotona Vision » ?" — add Fraunces sur "Kotona Vision"
const sec4 = expertTree[3];
walk(sec4, (n) => {
  if (n.elType === 'widget' && n.widgetType === 'heading') {
    const s = n.settings || {};
    if (s.title?.includes('Kotona Vision') && !s.title.includes('Fraunces')) {
      s.title = s.title.replace(/Kotona Vision/, `<em style="${FRAUNCES}">Kotona Vision</em>`);
      console.log('✏️  Section 4 : Fraunces sur "Kotona Vision"');
    }
  }
});

// Section 5 (index 4): Pourquoi — vérifier que les Fraunces sont là
const sec5 = expertTree[4];
walk(sec5, (n) => {
  if (n.elType === 'widget' && n.widgetType === 'heading') {
    const s = n.settings || {};
    if (s.title && /\bdifférente\b/i.test(s.title) && !s.title.includes('Fraunces')) {
      s.title = s.title.replace(/différente/i, `<em style="${FRAUNCES}">différente</em>`);
      console.log('✏️  Section 5 : Fraunces sur "différente"');
    }
  }
});

// Section 6 (index 5): Stats expertise — couleurs teal/orange → gold + Fraunces
const sec6 = expertTree[5];
let sec6Fixes = 0;
walk(sec6, (n) => {
  if (n.elType === 'widget' && n.widgetType === 'heading') {
    const s = n.settings || {};
    if (s.title) {
      const before = s.title;
      // Replace teal (#5BAFA4) span avec Fraunces
      s.title = s.title.replace(/<span style="color:#5BAFA4[^"]*">([^<]+)<\/span>/, `<em style="${FRAUNCES}">$1</em>`);
      // Replace orange (#E8B86E) span avec Fraunces
      s.title = s.title.replace(/<span style="color:#E8B86E[^"]*">([^<]+)<\/span>/, `<em style="${FRAUNCES}">$1</em>`);
      if (before !== s.title) sec6Fixes++;
    }
  }
});
if (sec6Fixes) console.log(`✏️  Section 6 : ${sec6Fixes} couleur(s) custom → Fraunces gold`);

// ════════════════════════════════════════════════════════════════
// 5. Compose nouvel arbre : Hero + 3 piliers + sections 4, 5, 6, 7
// (on drop les sections 2 et 3 anciennes, on ajoute le nouveau bloc piliers à la place)
// ════════════════════════════════════════════════════════════════
const newTree = [
  newHero,           // nouveau Hero
  new3Piliers,       // nouveau 3 piliers (remplace 2+3)
  expertTree[3],     // section 4 garde (Que veut dire Kotona Vision)
  expertTree[4],     // section 5 garde (Pourquoi - déjà KV)
  expertTree[5],     // section 6 cleanée (Stats expertise/mandats)
  expertTree[6],     // section 7 garde (CTA contact final)
];

const newTreeWithIds = regenIds(newTree);
console.log(`\n📐 Nouvelle structure : ${newTreeWithIds.length} sections (vs ${expertTree.length} avant)`);

if (dryRun) {
  console.log(`\n[DRY-RUN] Aucun POST. --write pour appliquer.`);
  process.exit(0);
}

const newData = JSON.stringify(newTreeWithIds);
console.log(`\n📤 POST → /wp/v2/pages/${EXPERT_ID}…`);
const result = await updatePage(EXPERT_ID, { meta: { _elementor_data: newData } });
console.log(`✅ POST OK — modified ${result.modified}`);

await wp('/elementor/v1/cache?wpml_language=fr', { method: 'DELETE' });
console.log(`🧹 Cache FR purgé`);

console.log(`\n🔗 ${expert.link}`);

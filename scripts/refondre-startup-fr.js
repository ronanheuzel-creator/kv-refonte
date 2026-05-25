#!/usr/bin/env node
// Refonte profonde startup FR :
// 1. Merge sections 2 + 3 (plates, sans images) → 1 nouvelle section KV Pourquoi Kotona vision (#2565)
//    avec 3 piliers numérotés (Démarrage maîtrisé / Référence CAO 3D / Communauté & accompagnement)
// 2. Fix ALL buttons : hover_background_color manquant + button_text_color #FFF → #F4EFE6
//
// Usage:
//   node scripts/refondre-startup-fr.js              # dry-run
//   node scripts/refondre-startup-fr.js --write

import { wp } from '../lib/wp.js';
import { backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData, walk, regenIds } from '../lib/elementor.js';

const PAGE_ID = 772;
const KV_POURQUOI_ID = 2565;
const FRAUNCES = 'font-family:Fraunces,serif;font-style:italic;color:#C9A35C;font-weight:600';

const dryRun = !process.argv.includes('--write');
console.log(dryRun ? '🟦 DRY-RUN\n' : '🟧 WRITE MODE\n');

// 1. Fetch page + KV template
const page = await wp(`/wp/v2/pages/${PAGE_ID}`, { query: { context: 'edit' } });
const kvPourquoi = await wp(`/wp/v2/elementor_library/${KV_POURQUOI_ID}`, { query: { context: 'edit' } });

if (!dryRun) await backupPage(page);
const tree = parseElementorData(page.meta?._elementor_data);
const kvTree = parseElementorData(kvPourquoi.meta?._elementor_data);

console.log(`Startup FR : ${tree.length} sections`);

// 2. Build new merged section (clone KV Pourquoi + populate)
const newSection = JSON.parse(JSON.stringify(kvTree[0]));

const NEW_CONTENT = {
  eyebrow: 'POURQUOI LE PROGRAMME STARTUP',
  h2_title: `Une <em style="${FRAUNCES}">solution</em> pensée pour les startups industrielles`,
  intro: `<p>Dans une startup technologique, les premiers investissements définissent souvent la trajectoire entière. Choisir les bons outils dès le départ, c'est gagner en structure, en agilité et en sérénité — sans brûler votre budget.</p>`,
  piliers: [
    {
      number: '01',
      title: 'Démarrage maîtrisé',
      text: `<p>Mal choisir ses outils, c'est risquer des pertes de temps, des surcoûts ou devoir tout reconstruire. Chez Kotona Vision, on vous aide à faire les bons choix dès le départ — avec des solutions taillées pour grandir avec vous.</p>`,
    },
    {
      number: '02',
      title: 'La référence CAO 3D',
      text: `<p>SolidWorks ou CATIA à des conditions avantageuses spécialement conçues pour les jeunes entreprises canadiennes : accès gratuit la première année, puis tarifs préférentiels les années suivantes.</p>`,
    },
    {
      number: '03',
      title: 'Communauté & accompagnement',
      text: `<p>Un accompagnement repensé pour maximiser l'impact de vos solutions, tous les outils essentiels à votre croissance au même endroit, et une communauté engagée de startups qui partagent vos enjeux.</p>`,
    },
  ],
};

let headingIdx = 0; // 0=eyebrow, 1=h2 title, 2=01, 3=h3 titre p1, 4=02, 5=h3 p2, 6=03, 7=h3 p3
let textEditorIdx = 0; // 0=intro, 1=p1 text, 2=p2 text, 3=p3 text
walk([newSection], (n) => {
  if (n.elType !== 'widget') return;
  const s = n.settings || {};
  if (n.widgetType === 'heading') {
    if (headingIdx === 0) { s.title = NEW_CONTENT.eyebrow; headingIdx++; }
    else if (headingIdx === 1) { s.title = NEW_CONTENT.h2_title; headingIdx++; }
    else if (headingIdx === 2) { s.title = NEW_CONTENT.piliers[0].number; headingIdx++; }
    else if (headingIdx === 3) { s.title = NEW_CONTENT.piliers[0].title; headingIdx++; }
    else if (headingIdx === 4) { s.title = NEW_CONTENT.piliers[1].number; headingIdx++; }
    else if (headingIdx === 5) { s.title = NEW_CONTENT.piliers[1].title; headingIdx++; }
    else if (headingIdx === 6) { s.title = NEW_CONTENT.piliers[2].number; headingIdx++; }
    else if (headingIdx === 7) { s.title = NEW_CONTENT.piliers[2].title; headingIdx++; }
  } else if (n.widgetType === 'text-editor') {
    if (textEditorIdx === 0) { s.editor = NEW_CONTENT.intro; textEditorIdx++; }
    else if (textEditorIdx === 1) { s.editor = NEW_CONTENT.piliers[0].text; textEditorIdx++; }
    else if (textEditorIdx === 2) { s.editor = NEW_CONTENT.piliers[1].text; textEditorIdx++; }
    else if (textEditorIdx === 3) { s.editor = NEW_CONTENT.piliers[2].text; textEditorIdx++; }
  }
});

console.log(`✏️  Nouvelle section "Pourquoi le programme startup" composée (3 piliers numérotés)`);

// 3. Reconstruct tree : [section 1 Hero, NEW section, section 4 (3 ans), section 5 (Étapes), section 6 (KV Accompagnement), section 7 (KV CTA)]
const newTree = [
  tree[0],     // Hero (garde)
  newSection,  // NEW merge sections 2+3
  tree[3],     // 4 (3 ans) garde
  tree[4],     // 5 (Étapes) garde
  tree[5],     // 6 (KV Accompagnement) garde
  tree[6],     // 7 (KV CTA) garde
];

// 4. Fix ALL buttons : add hover_background_color + button_text_color
let buttonFixes = 0;
walk(newTree, (n) => {
  if (n.widgetType !== 'button') return;
  const s = n.settings || {};
  if (!s.hover_background_color) {
    s.hover_background_color = '#3A3B3E';
    buttonFixes++;
  }
  if (s.button_text_color === '#FFFFFF') {
    s.button_text_color = '#F4EFE6';
    buttonFixes++;
  }
  // hover_color (text color on hover)
  if (!s.hover_color) {
    s.hover_color = '#F4EFE6';
    buttonFixes++;
  }
});

console.log(`✏️  ${buttonFixes} fix(es) buttons (hover_bg + text color)`);

// 5. Regen IDs
const finalTree = regenIds(newTree);
console.log(`📐 Nouvelle structure : ${finalTree.length} sections (vs ${tree.length} avant)`);

if (dryRun) { console.log('\n[DRY-RUN] --write pour appliquer'); process.exit(0); }

const newData = JSON.stringify(finalTree);
const result = await updatePage(PAGE_ID, { meta: { _elementor_data: newData } });
console.log(`✅ POST OK — modified ${result.modified}`);
await wp('/elementor/v1/cache?wpml_language=fr', { method: 'DELETE' });
console.log('Cache FR purgé');

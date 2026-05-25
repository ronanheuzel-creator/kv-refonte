#!/usr/bin/env node
// Cleanup ciblé de /solidworks-gratuit-startup-canada/ FR :
// 1. URLs CTAs cassées → /nous-contacter/
// 2. Labels button avec typo
// 3. <span class="color-primary|secondary"> → <em Fraunces>
// 4. <em> sans style dans HTML/headings → <em Fraunces>
//
// Usage:
//   node scripts/cleanup-startup-fr.js              # dry-run
//   node scripts/cleanup-startup-fr.js --write

import { wp } from '../lib/wp.js';
import { backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData, walk } from '../lib/elementor.js';

const PAGE_ID = 772;
const FRAUNCES = 'font-family:Fraunces,serif;font-style:italic;color:#C9A35C;font-weight:600';
const dryRun = !process.argv.includes('--write');
console.log(dryRun ? '🟦 DRY-RUN\n' : '🟧 WRITE MODE\n');

// URL fixes : map des URLs cassées → bonne URL
const URL_FIXES = {
  '#contact': '/nous-contacter/',
  '/contact/': '/nous-contacter/',
  '/support-3dexperience/': '/nous-contacter/', // pour "Je veux en savoir plus" → contact
};

// Label fixes : map des labels cassés → bon label
const LABEL_FIXES = {
  'JE SOUHAITE AVOIR ACCÈS À sOLIDwORKS GRATUITEMENT': 'Vérifier mon éligibilité',
};

// Replace spans color-primary/secondary in text → <em Fraunces>
function frauncifyText(text) {
  if (!text) return text;
  let newText = text;
  // <span class="color-primary"> X </span> → <em Fraunces>X</em> (trim whitespace inside)
  newText = newText.replace(/<span class="color-primary">\s*([^<]+?)\s*<\/span>/gi, `<em style="${FRAUNCES}">$1</em>`);
  newText = newText.replace(/<span class="color-secondary">\s*([^<]+?)\s*<\/span>/gi, `<em style="${FRAUNCES}">$1</em>`);
  // <em> sans style (juste <em>X</em>) → <em Fraunces>X</em>
  newText = newText.replace(/<em>\s*([^<]+?)\s*<\/em>/gi, `<em style="${FRAUNCES}">$1</em>`);
  return newText;
}

const page = await wp(`/wp/v2/pages/${PAGE_ID}`, { query: { context: 'edit' } });
if (!dryRun) await backupPage(page);

const tree = parseElementorData(page.meta?._elementor_data);

let urlFixes = 0;
let labelFixes = 0;
let frauncesFixes = 0;

walk(tree, (n) => {
  if (n.elType !== 'widget') return;
  const s = n.settings || {};

  // Button URL fixes
  if (n.widgetType === 'button' && s.link?.url) {
    const u = s.link.url;
    for (const [from, to] of Object.entries(URL_FIXES)) {
      if (u === from || u === `https://stagging.kotonavision.com${from}`) {
        console.log(`  🔗 Button URL : "${u}" → "${to}"`);
        s.link.url = to;
        urlFixes++;
      }
    }
  }

  // Button label fixes
  if (n.widgetType === 'button' && s.text && LABEL_FIXES[s.text]) {
    console.log(`  ✏️ Button label : "${s.text}" → "${LABEL_FIXES[s.text]}"`);
    s.text = LABEL_FIXES[s.text];
    labelFixes++;
  }

  // Heading title : frauncify
  if (n.widgetType === 'heading' && s.title) {
    const before = s.title;
    s.title = frauncifyText(s.title);
    if (before !== s.title) {
      console.log(`  ✨ Heading frauncified : "${before.slice(0,60)}..." → "${s.title.slice(0,60)}..."`);
      frauncesFixes++;
    }
  }

  // HTML widget : frauncify les spans inside
  if (n.widgetType === 'html' && s.html) {
    const before = s.html;
    s.html = frauncifyText(s.html);
    if (before !== s.html) {
      console.log(`  ✨ HTML widget frauncified (${n.id})`);
      frauncesFixes++;
    }
  }
});

console.log(`\n📊 ${urlFixes} URL fix · ${labelFixes} label fix · ${frauncesFixes} Fraunces fix`);

if (dryRun) { console.log('\n[DRY-RUN] --write pour appliquer'); process.exit(0); }

const newData = JSON.stringify(tree);
const result = await updatePage(PAGE_ID, { meta: { _elementor_data: newData } });
console.log(`✅ POST OK — modified ${result.modified}`);
await wp('/elementor/v1/cache?wpml_language=fr', { method: 'DELETE' });
console.log('Cache FR purgé');

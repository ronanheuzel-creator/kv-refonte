#!/usr/bin/env node
// Traduit les labels + options du form widget sur /en/contact-us/.
// Garde la même config technique (email_to, validation, IDs internes).
// Retire aussi les options "Microsoft" du select (droppé du périmètre).

import { wp } from '../lib/wp.js';
import { backupPage, updatePage } from '../lib/pages.js';
import { parseElementorData, walk } from '../lib/elementor.js';

const LABEL_MAP = {
  'Nom': 'Last name',
  'Prénom': 'First name',
  'Société': 'Company',
  'Téléphone': 'Phone',
  'Courriel': 'Email',
  'Pour quel raison souhaitez vous échanger ?': 'What would you like to discuss?',
  'Message': 'Message',
};

const FR_OPTIONS = `Sélectionner
Logiciels SolidWorks
Logiciels Microsoft
Service SolidWorks
Service Microsoft
Autre`;

const EN_OPTIONS = `Select
SolidWorks Software
SolidWorks Service
Other`;

const BUTTON_FR = 'Envoyer la demande';
const BUTTON_EN = 'Send request';

const dryRun = !process.argv.includes('--write');
console.log(dryRun ? '🟦 DRY-RUN\n' : '🟧 WRITE MODE\n');

// EN contact (#1195)
const page = await wp(`/wp/v2/pages/1195`, { query: { context: 'edit' } });
if (!dryRun) await backupPage(page);
const tree = parseElementorData(page.meta?._elementor_data);

let updated = 0;
walk(tree, (n) => {
  if (n.widgetType !== 'form') return;
  const s = n.settings || {};
  // button_text
  if (s.button_text === BUTTON_FR) { s.button_text = BUTTON_EN; updated++; console.log('  ✏️ button_text → ' + BUTTON_EN); }
  // fields
  if (Array.isArray(s.form_fields)) {
    for (const f of s.form_fields) {
      if (f.field_label && LABEL_MAP[f.field_label]) {
        console.log('  ✏️ label "' + f.field_label + '" → "' + LABEL_MAP[f.field_label] + '"');
        f.field_label = LABEL_MAP[f.field_label];
        updated++;
      }
      // Select options
      if (f.field_type === 'select' && f.field_options === FR_OPTIONS) {
        f.field_options = EN_OPTIONS;
        console.log('  ✏️ select options FR → EN (4 options, Microsoft droppé)');
        updated++;
      }
    }
  }
});

console.log(`\n${updated} update(s) appliqué(s)`);

if (dryRun) { console.log('[DRY-RUN] --write pour appliquer'); process.exit(0); }

const newData = JSON.stringify(tree);
const result = await updatePage(1195, { meta: { _elementor_data: newData } });
console.log('✅ POST OK — modified ' + result.modified);
await wp('/elementor/v1/cache?wpml_language=en', { method: 'DELETE' });
console.log('Cache EN purgé');

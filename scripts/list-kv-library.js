#!/usr/bin/env node
// Script de validation de l'auth WordPress.
// Liste les templates de la bibliothèque Elementor.
//
// Usage: node scripts/list-kv-library.js

import { listElementorLibrary } from '../lib/templates.js';

const templates = await listElementorLibrary();

if (!templates.length) {
  console.log('Aucun template trouvé dans elementor_library.');
  process.exit(0);
}

console.log(`\n✅ Auth OK — ${templates.length} template(s) trouvé(s) :\n`);

for (const t of templates) {
  const title = t.title?.rendered || '(sans titre)';
  const type = t.template_type || t.type || '-';
  const status = t.status || '-';
  console.log(`  #${String(t.id).padEnd(6)} [${status.padEnd(8)}] ${type.padEnd(12)} ${title}`);
}

console.log('');

#!/usr/bin/env node
// Corrige le typo "subscribtion" → "subscription" sur le post EN #1657.
// Met à jour le title + slug. WordPress crée auto un 301 via _wp_old_slug.
//
// Usage:
//   node scripts/fix-subscribtion-typo.js           # dry-run
//   node scripts/fix-subscribtion-typo.js --write   # applique

import { wp } from '../lib/wp.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const dryRun = !args.write;

const POST_ID = 1657;

// 1. Fetch + backup
const post = await wp(`/wp/v2/posts/${POST_ID}`, { query: { context: 'edit' } });
const BACKUPS_DIR = join(process.cwd(), 'backups');
await mkdir(BACKUPS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(BACKUPS_DIR, `post-${POST_ID}-subscribtion-${ts}.json`);
await writeFile(backupPath, JSON.stringify(post, null, 2));
console.log(`💾 Backup : ${backupPath.replace(process.env.HOME, '~')}`);

// 2. Compute new title + slug
const oldTitle = post.title?.raw || post.title?.rendered;
const oldSlug = post.slug;

if (!oldTitle.includes('subscribtion') && !oldSlug.includes('subscribtion')) {
  console.log(`✅ Pas de typo trouvé. Rien à faire.`);
  process.exit(0);
}

const newTitle = oldTitle.replace(/subscribtion/g, 'subscription');
const newSlug = oldSlug.replace(/subscribtion/g, 'subscription');

console.log(`\n📝 Modifications :`);
console.log(`   Title  AVANT : ${oldTitle}`);
console.log(`   Title  APRÈS : ${newTitle}`);
console.log(`   Slug   AVANT : ${oldSlug}`);
console.log(`   Slug   APRÈS : ${newSlug}`);
console.log(`   URL avant    : ${post.link}`);
const newLink = post.link.replace(oldSlug, newSlug);
console.log(`   URL après    : ${newLink}`);

if (dryRun) {
  console.log(`\n[DRY-RUN] Pas de POST. Pour appliquer : --write`);
  process.exit(0);
}

// 3. POST update
console.log(`\n📤 POST en cours…`);
const result = await wp(`/wp/v2/posts/${POST_ID}`, {
  method: 'POST',
  body: { title: newTitle, slug: newSlug },
});
console.log(`✅ POST OK — modified ${result.modified}`);
console.log(`   Nouveau slug : ${result.slug}`);
console.log(`   Nouveau link : ${result.link}`);

// 4. Vérifier le 301 de l'ancien URL
console.log(`\n🔎 Test du 301 sur l'ancien URL…`);
const res = await fetch(`https://stagging.kotonavision.com/en/${oldSlug}/`, { redirect: 'manual' });
console.log(`   Status   : ${res.status} ${res.statusText}`);
console.log(`   Location : ${res.headers.get('location') || '(pas de redirect — souci)'}`);

if (res.status === 301 || res.status === 302) {
  console.log(`✅ 301 OK — Google va récupérer la nouvelle URL sans perdre le ranking`);
} else {
  console.log(`⚠️  Pas de 301 immédiat — vérifier dans 1-2 min (parfois cache LiteSpeed)`);
}

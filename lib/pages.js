// Lecture / écriture / backup des pages WordPress.

import { wp } from './wp.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BACKUPS_DIR = join(process.cwd(), 'backups');

/**
 * Récupère une page WordPress par son slug (avec contenu Elementor en meta).
 */
export async function getPageBySlug(slug) {
  const pages = await wp('/wp/v2/pages', {
    query: { slug, context: 'edit' },
  });
  if (!pages || !pages.length) {
    throw new Error(`Aucune page trouvée avec le slug "${slug}"`);
  }
  return pages[0];
}

/**
 * Récupère une page par son ID.
 */
export async function getPageById(id) {
  return wp(`/wp/v2/pages/${id}`, { query: { context: 'edit' } });
}

/**
 * Backup local d'une page (snapshot JSON complet) — toujours faire ça AVANT modif.
 * Retourne le chemin du fichier de backup.
 */
export async function backupPage(page) {
  await mkdir(BACKUPS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(BACKUPS_DIR, `page-${page.id}-${page.slug}-${ts}.json`);
  await writeFile(file, JSON.stringify(page, null, 2), 'utf8');
  return file;
}

/**
 * Met à jour une page WordPress (POST sur /wp/v2/pages/:id).
 * @param {number} id
 * @param {object} data - champs à mettre à jour (ex: { meta: { _elementor_data: '...' } })
 */
export async function updatePage(id, data) {
  return wp(`/wp/v2/pages/${id}`, { method: 'POST', body: data });
}

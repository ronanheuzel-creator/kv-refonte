// Récupération des templates Elementor (bibliothèque KV).
//
// La "bibliothèque KV" correspond aux items du CPT `elementor_library`
// (templates Elementor stockés en WP). Selon le tuto, IDs ~2471 à ~2690.

import { wp } from './wp.js';

/**
 * Liste tous les templates de la bibliothèque Elementor.
 * @param {object} [opts]
 * @param {number} [opts.perPage=100]
 * @returns {Promise<Array>} liste de templates (id, title, type, ...)
 */
export async function listElementorLibrary({ perPage = 100 } = {}) {
  return wp('/wp/v2/elementor_library', {
    query: { per_page: perPage, status: 'publish,draft,private' },
  });
}

/**
 * Récupère un template par son ID, avec son contenu Elementor.
 * @param {number|string} id
 */
export async function getTemplate(id) {
  return wp(`/wp/v2/elementor_library/${id}`, {
    query: { context: 'edit' },
  });
}
